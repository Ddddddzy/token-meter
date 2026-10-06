// token-meter — 本地 agent token 用量汇总
// 零运行时依赖: Node >=22.13 (node:sqlite), 仅托盘小窗与本地 API
import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { readUi as readUiSettings, saveUi } from './ui-settings.mjs';

const MACHINE = os.hostname();
const DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = loadConfig();
const PORT = CONFIG.port;
const PATHS = CONFIG.paths;
const UI_FILE = path.join(DIR, 'ui-settings.json');
function readUi() {
  return readUiSettings(UI_FILE);
}
function sourcePaths() {
  return [
    ['cmdc', 'Command Code'], ['codex', 'Codex CLI / Desktop'], ['claude', 'Claude Code'],
    ['opencode', 'opencode'], ['devin', 'Devin CLI'], ['cursor', 'Cursor'],
  ].map(([id, name]) => ({ id, name, path: PATHS[id], enabled: !!PATHS[id], exists: !!PATHS[id] && fs.existsSync(PATHS[id]) }));
}

// $/1M：[未命中输入, 缓存读取, 输出]。缓存单独计价。
// LIST 是公开牌价。PROXY 是没有单独牌价时借用的最近来源，界面标「估算」。
// 免费路由（模型名带 free）按 $0 计，不借用付费价。
const LIST = {
  'deepseek-v4.1-flash': [0.15, 0.003, 0.60],
  'deepseek-v4-flash': [0.15, 0.003, 0.60],
  'deepseek-v4-pro': [0.66, 0.022, 1.98],
  'claude-sonnet-5': [2, 0.20, 10],
  'claude-opus': [5, 0.50, 25],
  'claude-sonnet': [3, 0.30, 15],
  'claude-haiku': [1, 0.10, 5],
  'claude-fable': [10, 1, 50],
  'gpt-5.6-sol': [4, 0.40, 20],
  'gpt-5.6-terra': [2, 0.20, 12],
  'gpt-5.6-luna': [0.20, 0.02, 1.20],
  'gpt-5.5': [5, 0.50, 30],
  'gpt-5.4': [2.5, 0.25, 15],
  // OpenAI 官方模型页，2026-10-06；顺序 [输入未命中, 缓存读, 输出, 缓存写]
  'gpt-6.1-sol': [2, 0.10, 10, 2.5],
  'gpt-6-sol': [2, 0.20, 10, 2.5],
  'gpt-6-astra': [10, 1, 50, 12.5],
  'gpt-6-luna': [0.10, 0.01, 0.50, 0.125],
  'grok-4.7': [2, 0.50, 6],
  'grok-4.6': [2, 0.50, 6],
  'grok-4.5': [2, 0.50, 6],
  'composer-2.5': [0.50, 0.20, 2.50],
  'kimi-k3': [3, 0.30, 15],
  'kimi-k2.5': [0.60, 0.10, 3],
  'step-5': [1, 0.05, 2.70],
  'step-3.7': [0.20, 0.04, 1.15],
};
const PROXY = {
  // Cognition 说明 SWE-2 由 Kimi K3 后训练，没有单独 API 牌价
  'swe-2': [3, 0.30, 15],
};

const FAST = {
  'grok-4.7': [4, 1, 12],
  'grok-4.6': [4, 1, 12],
  'grok-4.5': [4, 1, 18],
  'composer-2.5': [3, 0.50, 15],
};
// LiteLLM 价目表快照（TokenBar model_prices.json，{i,o,r,w} = $/1M 输入/输出/缓存读/缓存写）。
// 只做精确匹配——子串匹配会把 gpt-5 错接到 gpt-5.6-sol 上按错代次计价（TokenBar 踩过）。
const PRICES = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, 'model_prices.json'), 'utf8')); } catch { return {}; }
})();
function litellmRate(m) {
  const bare = m.includes('/') ? m.slice(m.lastIndexOf('/') + 1) : m;
  const e = PRICES[m] || PRICES[bare];
  if (!e || e.i == null) return null;
  // r 缺失按输入价 10% 估缓存读（各家缓存读折扣集中在 10%~50%，取保守低值）；w 缺失按输入价
  return { rate: [e.i, e.r ?? e.i * 0.1, e.o, e.w ?? e.i], kind: 'list' };
}
function rateFor(model) {
  const m = (model || '').toLowerCase();
  if (!m || m.includes('free')) return null;
  const pick = (table, kind) => {
    const keys = Object.keys(table).sort((a, b) => b.length - a.length);
    for (const k of keys) if (m.includes(k)) return { rate: table[k], kind };
    return null;
  };
  const hit = pick(LIST, 'list') || litellmRate(m) || pick(PROXY, 'proxy');
  if (!hit || !m.includes('fast')) return hit;
  const fast = pick(FAST, hit.kind);
  return fast || hit;
}
function listUsd(r, rate) {
  const long = /^gpt-(6|5\.6)/.test(r.model) && r.in + r.cr + r.cw > 272000;
  const fast = r.serviceTier === 'priority' || r.serviceTier === 'fast';
  const factor = fast && /^gpt-/.test(r.model) ? 2 : 1;
  return ((r.in * rate[0] + r.cr * rate[1] + (r.cw || 0) * (rate[3] ?? rate[0])) * (long ? 2 : 1) + r.out * rate[2] * (long ? 1.5 : 1)) * factor / 1e6;
}

// ---------- 扫描器 ----------
function* jsonlFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* jsonlFiles(p);
    else if (e.name.endsWith('.jsonl')) yield p;
  }
}
const rec = (o) => ({ machine: MACHINE, in: 0, out: 0, cr: 0, cw: 0, cost: null, ...o });

// 正在运行的 app 的 SQLite 不能直接读（WAL 读锁可能让写入方 BUSY 崩溃），
// 复制 db+wal+shm 到临时目录再打开副本
function openDbCopy(p) {
  if (!p || !fs.existsSync(p)) return null;
  const tmp = path.join(os.tmpdir(), `tm-${path.basename(p)}-${process.pid}-${Date.now()}`);
  for (const s of ['', '-wal', '-shm']) {
    try { fs.copyFileSync(p + s, tmp + s); } catch {}
  }
  let db;
  try { db = new DatabaseSync(tmp, { readOnly: true }); }
  catch (e) { for (const s of ['', '-wal', '-shm']) try { fs.unlinkSync(tmp + s); } catch {} throw e; }
  db._tmp = tmp;
  return db;
}
function closeDb(db) {
  try { db.close(); } catch {}
  if (db._tmp) for (const s of ['', '-wal', '-shm']) try { fs.unlinkSync(db._tmp + s); } catch {}
}

// Claude Code 系格式（claude / cmdc）的 jsonl 扫描器。
// 记录是流式递增快照：同一条 assistant 消息会写多行 usage（output 1→1→279），
// 跨文件 resume/fork 还会把父会话记录原样抄写。按 message.id:requestId 复合键
// 全局去重、逐字段取最大值——TokenBar 实测朴素求和虚高 1.79x。
// subagents/**/journal.jsonl 是编排日志不是消息记录，排除。
function isWorkflowJournal(f) {
  if (!f.endsWith('journal.jsonl')) return false;
  return f.split(/[\\/]/).includes('subagents');
}
function scanClaudeLike(dir, cli, opt) {
  const best = new Map(); // key -> rec（值就地取字段最大）
  for (const f of jsonlFiles(dir)) {
    if (isWorkflowJournal(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line.includes('"usage"')) continue;
      try {
        const j = JSON.parse(line);
        // claude 写 type:'assistant'，cmdc 写 type:'message'，其余类型（user/summary 等）不带 usage
        if (j.type && j.type !== 'assistant' && j.type !== 'message') continue;
        const msg = j.message || j;
        const u = j.message?.usage || j.usage; if (!u) continue;
        const model = msg.model || j.model || '?'; // cmdc 的 model 在顶层
        if (model === '<synthetic>') continue; // 本地记账条目，不是真实调用
        const rawIn = u.inputTokens || u.input_tokens || 0;
        const cr = u.cacheReadTokens || u.cache_read_input_tokens || 0;
        const cw = u.cacheWriteTokens || u.cache_creation_input_tokens || 0;
        const outTk = u.outputTokens || u.output_tokens || 0;
        // cmdc 的 inputTokens 已含 cacheRead/cw，要减掉；claude 的 input_tokens 本就不含
        const inTk = opt.inputIncludesCache ? Math.max(0, rawIn - cr - cw) : rawIn;
        if (!(inTk + outTk + cr + cw)) continue;
        // 重试会复用 message.id，必须带 requestId 区分；都没有时退 uuid（副本也保留 uuid）
        // cmdc 的 id 在顶层且实测无重复行，去重对它来说是安全的空操作
        const mid = msg.id || j.id, rid = j.requestId || j.request_id;
        const key = mid ? (rid ? `${mid}:${rid}` : `message:${mid}`) : `uuid:${j.uuid || f}`;
        const t = Date.parse(j.timestamp || msg.timestamp || 0);
        const prev = best.get(key);
        if (prev) {
          prev.in = Math.max(prev.in, inTk); prev.out = Math.max(prev.out, outTk);
          prev.cr = Math.max(prev.cr, cr); prev.cw = Math.max(prev.cw, cw);
        } else {
          best.set(key, rec({ cli, model, t, in: inTk, out: outTk, cr, cw, cost: null, billing: opt.billing }));
        }
      } catch {}
    }
  }
  return [...best.values()];
}
function scanCmdc() {
  // costUsd 是 CLI 本地 estimateSessionCostUsd，不是账单，忽略
  return scanClaudeLike(PATHS.cmdc, 'cmdc', { inputIncludesCache: true, billing: 'plan' });
}

// ---- Codex 用量谱系（移植自 TokenBar 的 CodexLineage）----
// 四分量累计快照 {i,ca,o,r}：ca 是 i 的子集、r 是 o 的子集，累计标量 = i+o。
// 规则（全部有实测依据）：
// 1. 峰值闸门：累计不超过水位线的快照不计费——重发行和 fork 重放的父会话历史都拦在这
// 2. min(last, 累计增量)：last_token_usage 才是真实增量，但旧版会虚报约 2x，超了就退回分量差
// 3. 继承快照：last==0 且累计>0 是 fork/抄写写的基线行，抬水位不计费
// 4. 计数重启：累计回落时只有 last==新累计才算真重启（压缩/续跑），重置水位
// 5. 陈旧回退：其他回落是乱序/重放行，跳过不动状态
const vTotal = v => v.i + v.o;
const vMax = (a, b) => ({ i: Math.max(a.i, b.i), ca: Math.max(a.ca, b.ca), o: Math.max(a.o, b.o), r: Math.max(a.r, b.r) });
const vSub = (a, b) => ({ i: a.i - b.i, ca: a.ca - b.ca, o: a.o - b.o, r: a.r - b.r });
const vClamp = v => {
  const i = Math.max(0, v.i), o = Math.max(0, v.o);
  return { i, ca: Math.min(Math.max(0, v.ca), i), o, r: Math.min(Math.max(0, v.r), o) };
};
const vBounded = (v, cap) => {
  if (vTotal(v) <= cap) return v;
  const d = { ...v };
  let ex = vTotal(v) - cap;
  const i = Math.min(ex, d.i); d.i -= i; d.ca = Math.min(d.ca, d.i); ex -= i;
  if (ex > 0) { const o = Math.min(ex, d.o); d.o -= o; d.r = Math.min(d.r, d.o); }
  return d;
};
const vZero = { i: 0, ca: 0, o: 0, r: 0 };
function usageVec(u) {
  if (!u || typeof u !== 'object') return null;
  if (u.input_tokens != null || u.output_tokens != null) {
    return { i: u.input_tokens || 0, ca: Math.max(u.cached_input_tokens || 0, u.cache_read_input_tokens || 0),
             o: u.output_tokens || 0, r: u.reasoning_output_tokens || 0, cw:u.cache_write_input_tokens || 0 };
  }
  if (u.total_tokens != null) return { i: u.total_tokens || 0, ca: 0, o: 0, r: 0 };
  return null;
}
function codexAdvance(st, t, l) {
  if (!(vTotal(t) > 0)) return null;
  st.maxTotal = vMax(st.maxTotal, t);
  if (!l || !(vTotal(l) > 0)) { // 规则3：只抬水位
    st.peak = vMax(st.peak, t); st.peakTotal = Math.max(st.peakTotal, vTotal(t));
    st.prevTotal = vTotal(t); return null;
  }
  if (st.prevTotal != null && vTotal(t) < st.prevTotal) {
    if (vTotal(l) === vTotal(t)) { st.peak = { ...vZero }; st.peakTotal = 0; } // 规则4：真重启
    else return null; // 规则5：陈旧写
  }
  st.prevTotal = vTotal(t);
  if (vTotal(t) > st.peakTotal) {
    const adv = vTotal(t) - st.peakTotal;
    const d = vClamp(vTotal(l) <= adv ? l : vBounded(vSub(t, st.peak), adv)); // 规则2
    st.peakTotal = vTotal(t); st.peak = vMax(st.peak, t);
    return vTotal(d) > 0 ? d : null;
  }
  st.peak = vMax(st.peak, t); // 规则1
  return null;
}
function codexRolloutFiles() {
  const best = new Map();
  if (!PATHS.codex) return [];
  for (const [idx, root] of [path.join(PATHS.codex,'sessions'),path.join(PATHS.codex,'archived_sessions')].entries()) {
    for (const f of jsonlFiles(root)) {
      const name = path.basename(f);
      if (!name.startsWith('rollout-')) continue;
      const st = fs.statSync(f);
      const cur = best.get(name);
      // 同名文件 sessions↔archived 迁移后留两份，取较新/较大/活跃目录的那份
      if (!cur || st.mtimeMs > cur.mtime || (st.mtimeMs === cur.mtime && (st.size > cur.size || (st.size === cur.size && idx === 0))))
        best.set(name, { path: f, mtime: st.mtimeMs, size: st.size });
    }
  }
  return [...best.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(e => e[1].path);
}
function codexProbeMeta(f) {
  // session_meta 一定在文件头部，只读到为止，不碰文件主体
  const fd = fs.openSync(f, 'r');
  try {
    const buf = Buffer.alloc(256 << 10);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    for (const line of buf.subarray(0, n).toString('utf8').split('\n')) {
      if (!line.includes('session_meta')) continue;
      try {
        const j = JSON.parse(line);
        if (j.type === 'session_meta' && j.payload) return codexSessionMeta(j.payload);
      } catch {}
    }
  } catch {} finally { try { fs.closeSync(fd); } catch {} }
  return null;
}
function codexSessionMeta(p) {
  const src = (p.source && typeof p.source === 'object') ? p.source : null;
  const spawn = src?.subagent?.thread_spawn;
  const ts = p.thread_source;
  return {
    ownId: p.id || p.session_id || '',
    forkedFromId: p.forked_from_id || spawn?.parent_thread_id || null,
    isSubagent: !!src?.subagent || ts === 'subagent' || ts === 'guardian_review',
  };
}
// 仅缓存用量/模型/谱系事件，文件未变时不重复读取整个对话。
const codexFilesCache = new Map();
function codexEvents(f) {
  const stat = fs.statSync(f), prev = codexFilesCache.get(f);
  if (prev && prev.size === stat.size && prev.mtime === stat.mtimeMs) return prev.events;
  const events = [];
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!/token_usage_record|token_count|turn_context|session_meta|model\/rerouted/.test(line)) continue;
    try {
      const j = JSON.parse(line), p = j.payload || {};
      if (j.type === 'session_meta') {
        if (!events.some(e => e.type === 'session_meta')) events.push({type:j.type, timestamp:j.timestamp, ordinal:j.ordinal, payload:p});
      } else if (j.type === 'turn_context') {
        events.push({...j, payload:{model:p.model, service_tier:p.service_tier}});
      } else if (j.type === 'token_usage_record' || p.type === 'token_count' || p.type === 'model/rerouted') events.push(j);
    } catch {} // 正在写入的末行稍后重扫
  }
  codexFilesCache.set(f, {size:stat.size, mtime:stat.mtimeMs, events});
  return events;
}
const vecKey = v => v ? [v.i,v.ca,v.o,v.r,v.cw || 0].join(':') : '';
function scanCodex(files = codexRolloutFiles()) {
  const out = [], exact = new Map(), visited = new Set();
  const sessions = new Map();
  const items = files.map(f => {
    const events = codexEvents(f);
    const metaEvent = events.find(e => e.type === 'session_meta');
    const meta = metaEvent ? {...codexSessionMeta(metaEvent.payload),
      forkOrdinal:metaEvent.payload.forked_from_ordinal_exclusive ?? metaEvent.payload.history_base?.end_ordinal_exclusive,
      timestamp:metaEvent.timestamp} : null;
    const item = {f, events, meta};
    if (meta?.ownId) sessions.set(meta.ownId, item);
    return item;
  });
  // 父线程只取 fork 点前的累计，不能取后来继续增长的终值。
  function forkBaseline(item, seen = new Set()) {
    const m = item.meta;
    if (!m || m.isSubagent || !m.forkedFromId || seen.has(m.ownId)) return null;
    seen.add(m.ownId);
    const parent = sessions.get(m.forkedFromId);
    if (!parent) return null;
    let base = forkBaseline(parent, seen);
    for (const e of parent.events) {
      if (m.forkOrdinal != null && e.ordinal != null ? e.ordinal >= m.forkOrdinal :
          Date.parse(e.timestamp) >= Date.parse(m.timestamp)) continue;
      const total = usageVec(e.payload?.thread_token_usage || e.payload?.info?.total_token_usage);
      if (total) base = total;
    }
    return base;
  }
  function processFile(item) {
    if (visited.has(item.f)) return;
    visited.add(item.f);
    const parent = item.meta?.forkedFromId && sessions.get(item.meta.forkedFromId);
    if (parent) processFile(parent);
    const base = forkBaseline(item);
    const st = { model:'', serviceTier:null, peak:{...vZero,...base}, peakTotal:base ? vTotal(base) : 0,
      prevTotal:null, maxTotal:{...vZero} };
    const snapshots = new Set(item.events.filter(e => e.type === 'token_usage_record')
      .map(e => vecKey(usageVec(e.payload.thread_token_usage))).filter(Boolean));
    for (const j of item.events) {
      const p = j.payload || {};
      if (j.type === 'turn_context') { st.model = p.model || st.model; st.serviceTier = p.service_tier || null; continue; }
      if (p.type === 'model/rerouted') { st.model = p.to_model || p.toModel || st.model; continue; }
      const modern = j.type === 'token_usage_record';
      if (!modern && p.type !== 'token_count') continue;
      const total = usageVec(modern ? p.thread_token_usage : p.info?.total_token_usage);
      const last = usageVec(modern ? p.usage : p.info?.last_token_usage);
      const model = p.model || p.info?.model || p.info?.model_name || st.model || 'unknown';
      const t = Date.parse(j.timestamp);
      if (modern && last && vTotal(last) > 0) {
        if (total) codexAdvance(st, total, last);
        const inherited = item.meta?.ownId && p.thread_id && p.thread_id !== item.meta.ownId;
        if (inherited) continue;
        const key = p.response_id || [p.thread_id || item.meta?.ownId || item.f,p.turn_id,j.ordinal ?? j.timestamp,vecKey(last)].join(':');
        const r = rec({cli:'codex',model,t,sessionId:p.thread_id || item.meta?.ownId,
          responseId:p.response_id || null, in:Math.max(0,last.i-last.ca-(last.cw || 0)),
          cr:last.ca,cw:last.cw || 0,out:last.o,reasoning:last.r,serviceTier:p.service_tier || st.serviceTier,billing:'plan'});
        const prev = exact.get(key);
        if (!prev || prev.in+prev.cr+prev.cw+prev.out < r.in+r.cr+r.cw+r.out) exact.set(key,r);
        continue;
      }
      let cumulative = total;
      if (!cumulative && last && vTotal(last) > 0) {
        cumulative = {i:st.peak.i+last.i,ca:st.peak.ca+last.ca,o:st.peak.o+last.o,r:st.peak.r+last.r};
      }
      if (!cumulative) continue;
      const d = codexAdvance(st,cumulative,last);
      // 新/旧事件描述同一次请求，只保留 response_id 的精确记录。
      if (!d || snapshots.has(vecKey(cumulative))) continue;
      out.push(rec({cli:'codex',model,t,sessionId:item.meta?.ownId,
        in:Math.max(0,d.i-d.ca),cr:d.ca,out:d.o,reasoning:d.r,serviceTier:st.serviceTier,billing:'plan'}));
    }
  }
  for (const item of items) processFile(item);
  const active = new Set(files);
  for (const f of codexFilesCache.keys()) if (!active.has(f)) codexFilesCache.delete(f);
  return out.concat([...exact.values()]);
}

function scanClaude() {
  return scanClaudeLike(PATHS.claude, 'claude', { inputIncludesCache: false, billing: 'list' });
}

function scanOpencode() {
  // 用 message 表而不是 session 表：session 的 token 是累计值，
  // 长期会话会把历史用量都算到创建日；message.data 里有逐条 tokens/cost/modelID
  const out = [];
  const db = openDbCopy(PATHS.opencode);
  if (!db) return out;
  try {
    for (const m of db.prepare("select time_created, data from message where instr(data,'\"tokens\"')>0").all()) {
      try {
        const j = JSON.parse(m.data);
        const tk = j.tokens; if (!tk || !(tk.input || tk.output)) continue;
        const model = j.modelID || j.model?.modelID || j.model?.id || '?';
        out.push(rec({ cli: 'opencode', model, t: m.time_created,
          in: tk.input || 0, out: (tk.output || 0) + (tk.reasoning || 0),
          cr: tk.cache?.read || 0, cw: tk.cache?.write || 0,
          cost: typeof j.cost === 'number' && j.cost > 0 ? j.cost : null,
          billing: typeof j.cost === 'number' && j.cost > 0 ? 'gateway' : 'none' }));
      } catch {}
    }
  } finally { closeDb(db); }
  return out;
}

function scanDevin() {
  const out = [];
  const db = openDbCopy(PATHS.devin);
  if (!db) return out;
  try {
    const models = {};
    for (const s of db.prepare('select id, model from sessions').all()) models[s.id] = s.model;
    // message_nodes 是 DAG 不是日志：每回合把整条对话链重新物化，同一条消息存 2~7 份。
    // request_id 标识底层 API 调用，副本共用；message_id 是兜底。按 (session, id) 去重。
    // 实测本机朴素求和虚高 2.39x（600.8M → 251.7M）。
    const seen = new Set();
    for (const n of db.prepare('select session_id, chat_message, created_at from message_nodes').all()) {
      try {
        const j = JSON.parse(n.chat_message);
        if ((j.role || 'assistant') !== 'assistant') continue;
        const md = j.metadata;
        const m = md?.metrics;
        let inTk = m?.input_tokens || 0, outTk = m?.output_tokens || 0,
            crTk = m?.cache_read_tokens || 0, cwTk = m?.cache_creation_tokens || 0;
        // 无 metrics 块的行可能只有 num_tokens，算 output 而不是丢弃
        if (!(inTk + outTk + crTk + cwTk)) {
          if (md?.num_tokens > 0) outTk = md.num_tokens; else continue;
        }
        const dedupId = md?.request_id || j.message_id;
        if (dedupId) { const k = n.session_id + '' + dedupId; if (seen.has(k)) continue; seen.add(k); }
        // generation_model 是这条消息实际由谁生成；sessions.model 是会话当前设置，
        // 中途换模型会追溯改写历史（本机实测换过模型的会话全被标错），没设过的是空串。
        // swe-2-high/max 是同一模型的思考强度档，合并成 swe-2。
        const served = md?.generation_model || models[n.session_id] || 'unknown';
        const model = served === 'adaptive' ? 'unknown' : served.toLowerCase().startsWith('swe-2-') ? 'swe-2' : served;
        // 行上的 created_at 会在会话重写时被刷成同一秒，小时图会挤成一根。生成时间在 metadata 里。
        const gen = Date.parse(md?.started_generation_at || md?.created_at || '');
        const t = Number.isFinite(gen) ? gen : (typeof n.created_at === 'number' ? n.created_at * 1000 : Date.parse(n.created_at || 0));
        out.push(rec({ cli: 'devin', model, t,
          in: inTk, out: outTk, cr: crTk, cw: cwTk, billing: 'plan' }));
      } catch {}
    }
  } finally { closeDb(db); }
  return out;
}

// Cursor 的 bubble.tokenCount 全是 0。估算按两步：
// 1. 汉字按 1 token、其余按 4 字符 1 token，计入正文、思考和工具结果
// 2. 同一会话按时间重放：每轮新输入算未命中，此前上下文算缓存读，上下文封顶 256K（Grok 长上下文分界）
// state.vscdb 1GB+，放 worker，先复制再读。
const CURSOR_WORKER = `
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const CAP = 256000;
function estTok(str) {
  if (!str) return 0;
  let cjk = 0, other = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c >= 0x4E00 && c <= 0x9FFF) cjk++;
    else other++;
  }
  return cjk + Math.ceil(other / 4);
}
function blob(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return ''; }
}
const p = workerData.path;
const out = [];
if (p && fs.existsSync(p)) {
  const tmp = path.join(os.tmpdir(), 'tm-state-' + process.pid + '.vscdb');
  for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(p + s, tmp + s); } catch {} }
  const db = new DatabaseSync(tmp, { readOnly: true });
  try {
    const convModel = new Map();
    for (const r of db.prepare("select key, value from cursorDiskKV where key >= 'composerData:' and key < 'composerData;'").iterate()) {
      try {
        const v = Buffer.isBuffer(r.value) ? r.value.toString() : String(r.value);
        const j = JSON.parse(v);
        const name = j.modelConfig && j.modelConfig.modelName;
        if (name) convModel.set(String(r.key).slice('composerData:'.length), name);
      } catch {}
    }
    const groups = new Map();
    const stmt = db.prepare("select key, value from cursorDiskKV where key >= 'bubbleId:' and key < 'bubbleId;'");
    for (const r of stmt.iterate()) {
      try {
        const v = Buffer.isBuffer(r.value) ? r.value.toString() : (r.value instanceof Uint8Array ? Buffer.from(r.value).toString() : r.value);
        if (typeof v !== 'string' || !v.includes('tokenCount')) continue;
        const j = JSON.parse(v);
        const text = (j.text || '') + (j.richText || '') + (typeof j.thinking === 'string' ? j.thinking : '')
          + blob(j.allThinkingBlocks) + blob(j.toolResults) + blob(j.attachedCodeChunks);
        const tok = estTok(text);
        if (!tok) continue;
        const parts = String(r.key).split(':');
        const conv = parts.length >= 3 ? parts[1] : 'x';
        const arr = groups.get(conv) || [];
        arr.push({
          t: Date.parse(j.createdAt || 0) || 0,
          user: j.type === 'user' || j.type === 1,
          tok,
          model: (j.modelInfo && j.modelInfo.modelName) || '',
        });
        groups.set(conv, arr);
      } catch {}
    }
    for (const [conv, arr] of groups) {
      arr.sort((a, b) => a.t - b.t);
      const q = [];
      let ctx = 0, pending = 0, asst = 0, model = convModel.get(conv) || 'default', turnT = 0;
      const pushCtx = (n) => {
        if (!n) return;
        q.push(n); ctx += n;
        while (ctx > CAP && q.length > 1) ctx -= q.shift();
      };
      const flush = () => {
        if (!asst) return;
        out.push({ cli: 'cursor', model, machine: workerData.machine, t: turnT,
          in: pending, out: asst, cr: ctx, cw: 0, cost: null, billing: 'estimate' });
        pushCtx(pending + asst);
        pending = 0; asst = 0;
      };
      for (const b of arr) {
        if (b.model) model = b.model;
        if (b.user) { if (asst) flush(); pending += b.tok; }
        else { asst += b.tok; turnT = b.t || turnT; }
      }
      flush();
    }
  } finally { db.close(); for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(tmp + s); } catch {} } }
}
parentPort.postMessage(out);
`;

let cursorWorker = null;
function startCursorScan() {
  if (cursorWorker) return;
  cursorWorker = new Worker(CURSOR_WORKER, { eval: true, workerData: { machine: MACHINE, path: PATHS.cursor } });
  const worker = cursorWorker;
  cache.sources.cursor = {...cache.sources.cursor,pending:true};
  const kill = setTimeout(() => { try { cursorWorker?.terminate(); } catch {} }, 300000);
  cursorWorker.on('message', (recs) => {
    cache.records = cache.records.filter(r => r.cli !== 'cursor').concat(recs);
    cache.sources.cursor = { ...cache.sources.cursor, estRecords: recs.length,pending:false };
    cache.cursorAt = Date.now();
    cursorWorker = null; clearTimeout(kill);
  });
  cursorWorker.on('error', (e) => {
    cache.errs.push('cursor: ' + e.message);
    cache.sources.cursor.pending = false;
    cursorWorker = null; clearTimeout(kill);
  });
  worker.on('exit', code => {
    if (cursorWorker !== worker) return;
    clearTimeout(kill); cursorWorker = null; cache.sources.cursor.pending = false;
    if (code) cache.errs.push('cursor: 后台扫描未完成，请重新扫描');
  });
}

function scanCursor() {
  const meta = { requests: 0, models: [], note: 'token 按会话重放估算（汉字 1、其余 /4，上下文封顶 256K）' };
  const p = PATHS.cursor ? PATHS.cursorTracking : null;
  if (p && fs.existsSync(p)) {
    const db = openDbCopy(p);
    try {
      meta.requests = db.prepare('select count(*) c from ai_code_hashes').get().c;
      meta.models = db.prepare('select distinct model from ai_code_hashes where model is not null').all().map(r => r.model).filter(Boolean);
    } finally { closeDb(db); }
  }
  return { recs: [], meta };
}

const SOURCES = [
  ['cmdc', scanCmdc], ['codex', scanCodex], ['claude', scanClaude],
  ['opencode', scanOpencode], ['devin', scanDevin], ['cursor', scanCursor],
];

function scanAll() {
  const t0 = performance.now();
  const records = []; const errs = []; const sources = {};
  for (const [name, fn] of SOURCES) {
    try {
      const r = fn();
      const recs = Array.isArray(r) ? r : r.recs;
      records.push(...recs);
      sources[name] = { records: recs.length, ...(r.meta || {}) };
    }
    catch (e) { errs.push(`${name}: ${e.message}`); sources[name] = { records: 0, error: e.message }; }
  }
  return { records, errs, sources, ms: Math.round(performance.now() - t0) };
}

// ---------- 聚合 ----------
function aggregate(records, rangeMs) {
  const now = Date.now();
  // 「今日」按本地自然日，和下面的 0–23 时同一窗口。滚动 24 小时会把昨天夜里算进总数、却画不进任何一根柱。
  let from = null;
  if (rangeMs === 864e5) {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    from = d0.getTime();
  } else if (rangeMs != null) {
    const d0 = new Date(); d0.setHours(0,0,0,0);
    d0.setDate(d0.getDate() - Math.round(rangeMs / 864e5) + 1);
    from = d0.getTime();
  }
  const recs = records.filter(r => r.t && (from == null || r.t >= from) && r.t <= now);
  const by = { cli: {}, model: {}, machine: {}, cm: {} };
  let tokens = 0, cashAll = 0, listAll = 0, estAll = 0, unpriced = new Set();
  let noneTk = 0, estTk = 0;
  for (const r of recs) {
    const tk = r.in + r.out + r.cr + r.cw;
    const hit = rateFor(r.model);
    const priced = hit ? listUsd(r, hit.rate) : null;
    // gateway：网关写下的 cost。其余一律算出美元：公开牌价标「标价」，代理价或 token 本身是估的标「估算」。
    let bill = 'none', usd = 0;
    if (r.billing === 'gateway' && r.cost > 0) { bill = 'gateway'; usd = r.cost; }
    else if (priced != null) { bill = (r.billing === 'estimate' || hit.kind === 'proxy') ? 'estimate' : 'list'; usd = priced; }
    else if ((r.model || '').toLowerCase().includes('free')) { bill = 'free'; usd = 0; }
    else unpriced.add(r.model);
    for (const dim of ['cli', 'model', 'machine']) {
      const k = dim === 'model' ? r.model : r[dim];
      const b = by[dim][k] ||= { tokens: 0, usd: 0, bills: new Set(), clis: new Set() };
      b.tokens += tk; b.usd += usd; b.bills.add(bill); b.clis.add(r.cli);
    }
    const mb = (by.cm[r.cli] ||= {})[r.model] ||= { tokens: 0, usd: 0, bills: new Set(), clis: new Set() };
    mb.tokens += tk; mb.usd += usd; mb.bills.add(bill); mb.clis.add(r.cli);
    if (bill === 'none') noneTk += tk; else if (bill === 'estimate') estTk += tk;
    tokens += tk;
    if (bill === 'gateway') cashAll += usd;
    else if (bill === 'list') listAll += usd;
    else if (bill === 'estimate') estAll += usd;
  }
  const labelOf = (b) => {
    const n = b.usd;
    if (b.bills.has('estimate')) return { bill: '估算 $' + n.toFixed(2), est: true, noprice: false, cost: n };
    if (b.bills.has('list')) return { bill: '标价 $' + n.toFixed(2), est: true, noprice: false, cost: n };
    if (b.bills.has('gateway') && n > 0) return { bill: '$' + n.toFixed(2), est: false, noprice: false, cost: n };
    if (b.bills.has('free')) return { bill: '$0', est: false, noprice: false, cost: 0 };
    return { bill: '无公开价', est: false, noprice: true, cost: 0 };
  };
  const ser = (o) => Object.entries(o).map(([name, b]) => {
    const lab = labelOf(b);
    return {
      name, tokens: b.tokens, cost: Math.round(lab.cost * 100) / 100, bill: lab.bill,
      est: lab.est, noprice: lab.noprice, cli: [...b.clis].join('/'),
    };
  }).sort((a, b) => b.tokens - a.tokens);
  // 图表粒度跟时间范围联动：今日→按小时，7/30天→按天，全部→按月
  const days = [];
  const tk = (s, e) => recs.reduce((sum, r) => sum + (r.t >= s && r.t < e ? r.in + r.out + r.cr + r.cw : 0), 0);
  if (rangeMs === 864e5) {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    for (let h = 0; h < 24; h++) days.push({ d: `${h}时`, t: tk(d0.getTime() + h * 36e5, d0.getTime() + (h + 1) * 36e5) });
  } else if (rangeMs != null) {
    const n = Math.round(rangeMs / 864e5);
    for (let i = n - 1; i >= 0; i--) {
      const d0 = new Date(now - i * 864e5);
      const s = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime();
      days.push({ d: `${d0.getMonth() + 1}/${d0.getDate()}`, t: tk(s, s + 864e5) });
    }
  } else {
    const min = recs.length ? Math.min(...recs.map(r => r.t)) : now;
    const cur = new Date(new Date(min).getFullYear(), new Date(min).getMonth(), 1);
    while (cur.getTime() <= now) {
      const s = cur.getTime();
      const label = `${cur.getFullYear()}/${cur.getMonth() + 1}`;
      cur.setMonth(cur.getMonth() + 1);
      days.push({ d: label, t: tk(s, cur.getTime()) });
    }
  }
  const chartLabel = rangeMs === 864e5 ? '今日 · 按小时' : rangeMs === 7 * 864e5 ? '近 7 天' : rangeMs === 30 * 864e5 ? '近 30 天' : '全部 · 按月';
  const cash = Math.round(cashAll * 100) / 100;
  const list = Math.round(listAll * 100) / 100;
  const est = Math.round(estAll * 100) / 100;
  const worth = Math.round((cash + list + est) * 100) / 100;
  const byCliModel = {};
  for (const [cli, models] of Object.entries(by.cm)) byCliModel[cli] = ser(models);
  // 近 14 天按 CLI 堆叠：固定窗口，不随所选时间范围变化（/panel 的趋势图用）。
  // 小窗也使用同一范围/粒度，柱子合计必须等于上方总量。
  const stacks = days.map(d => ({label:d.d,parts:{}}));
  const firstMonth = recs.reduce((min,r) => Math.min(min,r.t),now);
  const month0 = new Date(firstMonth);
  for (const r of recs) {
    const d = new Date(r.t);
    const idx = rangeMs === 864e5 ? d.getHours() : rangeMs != null ?
      Math.round((new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime() - from)/864e5) :
      (d.getFullYear()-month0.getFullYear())*12+d.getMonth()-month0.getMonth();
    if (stacks[idx]) stacks[idx].parts[r.cli] = (stacks[idx].parts[r.cli] || 0)+r.in+r.out+r.cr+r.cw;
  }
  const codexRecs = recs.filter(r => r.cli === 'codex');
  const codex = { tokens:codexRecs.reduce((n,r)=>n+r.in+r.cr+r.cw+r.out,0),
    input:codexRecs.reduce((n,r)=>n+r.in+r.cr+r.cw,0),cached:codexRecs.reduce((n,r)=>n+r.cr,0),
    output:codexRecs.reduce((n,r)=>n+r.out,0),reasoning:codexRecs.reduce((n,r)=>n+(r.reasoning||0),0),
    requests:codexRecs.length,lastAt:codexRecs.reduce((n,r)=>Math.max(n,r.t),0) };
  return {
    tokens, cost: worth, costLabel: '$' + worth.toFixed(2),
    list, cash, est,
    moneyNote: `标价 $${list.toFixed(2)} · 估算 $${est.toFixed(2)} · 网关 $${cash.toFixed(2)}`,
    pricedPct: tokens ? Math.round((tokens - noneTk) / tokens * 100) : 0,
    estPct: tokens ? Math.round(estTk / tokens * 100) : 0,
    byCli: ser(by.cli), byModel: ser(by.model), byMachine: ser(by.machine), byCliModel,
    days, stacks, chartLabel, codex, unpriced: [...unpriced],
  };
}

// ---------- HTTP ----------
let cache = { at: 0, records: [], errs: [], sources: {}, ms: 0 };
function refresh(force = false) {
  const s = scanAll();
  const cursorAt = cache.cursorAt || 0;
  cache = { at: Date.now(), ...s,cursorAt, records: cache.records.filter(r => r.cli === 'cursor').concat(s.records) };
  if (force || Date.now()-cursorAt > 15*60000) startCursorScan();
  return cache;
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
export { scanCodex, codexAdvance, usageVec, aggregate, rateFor, listUsd, scanAll };
if (isMain && process.argv.includes('--audit')) {
  const s = scanAll();
  const cursorRecs = await new Promise((resolve, reject) => {
    const w = new Worker(CURSOR_WORKER, { eval: true, workerData: { machine: MACHINE, path: PATHS.cursor } });
    const kill = setTimeout(() => reject(new Error('cursor scan timeout')), 300000);
    w.on('message', (recs) => { clearTimeout(kill); resolve(recs); });
    w.on('error', (e) => { clearTimeout(kill); reject(e); });
  });
  const a = aggregate(s.records.concat(cursorRecs), null);
  console.log(JSON.stringify({
    tokens: a.tokens, worth: a.cost, list: a.list, est: a.est, cash: a.cash,
    cursorRecords: cursorRecs.length, byCli: a.byCli, byModel: a.byModel, errs: s.errs, unpriced: a.unpriced,
  }, null, 2));
  process.exit(0);
}
if (isMain) refresh();

let backdropJpeg = null;
const RANGE = { day: 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5, all: null };
const RANGE_LABEL = { day: '今日', '7d': '7 天', '30d': '30 天', all: '全部' };

if (isMain) http.createServer((req, res) => {
  const u = new URL(req.url, 'x://x');
  if (u.pathname === '/api') {
    if (u.searchParams.get('refresh') || Date.now()-cache.at > 60000) refresh(!!u.searchParams.get('refresh'));
    else if (Date.now()-(cache.codexAt || cache.at) > 5000) {
      try {
        const records = scanCodex();
        cache.records = cache.records.filter(r=>r.cli !== 'codex').concat(records);
        cache.sources.codex = {records:records.length};
        cache.codexAt = Date.now();
      } catch (e) { cache.errs.push('codex: '+e.message); }
    }
    const range = u.searchParams.get('range') || 'day';
    if (!(range in RANGE)) { res.writeHead(400,{'content-type':'application/json'}); res.end('{"error":"invalid range"}'); return; }
    const a = aggregate(cache.records, RANGE[range]);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control','no-store');
    res.end(JSON.stringify({ ...a, range, rangeLabel: RANGE_LABEL[range], scanMs: cache.ms, at: Math.max(cache.at,cache.codexAt||0), errs: cache.errs, machine: MACHINE, sources: cache.sources }));
  } else if (u.pathname === '/api/ui' && req.method === 'GET') {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ...readUi(), paths: sourcePaths(), configFile: CONFIG.file }));
  } else if (u.pathname === '/api/ui' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      let updates = {};
      try { updates = JSON.parse(body || '{}'); } catch {}
      const saved = saveUi(UI_FILE, updates);
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ...saved, paths: sourcePaths(), configFile: CONFIG.file }));
    });
    return;
  } else if (u.pathname === '/backdrop.jpg' && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      backdropJpeg = Buffer.concat(chunks);
      res.statusCode = 204;
      res.end();
    });
    return;
  } else if (u.pathname === '/backdrop.jpg') {
    if (!backdropJpeg) { res.statusCode = 404; res.end(); return; }
    res.setHeader('content-type', 'image/jpeg');
    res.setHeader('cache-control', 'no-store');
    res.end(backdropJpeg);
  } else if (u.pathname === '/panel') {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control','no-store');
    res.end(fs.readFileSync(path.join(DIR, 'panel.html')));
  } else if (u.pathname === '/') {
    res.writeHead(410,{'content-type':'text/plain; charset=utf-8'});
    res.end('网页版已移除。请使用 Token Meter 托盘小窗。');
  } else { res.statusCode = 404; res.end(); }
}).listen(PORT, '127.0.0.1', () => console.log(`token-meter local API: ${PORT}`));
