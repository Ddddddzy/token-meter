// token-meter — 本地 agent token 用量汇总
// 零依赖: Node >=22.5 (node:sqlite), 浏览器 UI 内嵌
import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const H = os.homedir();
const MACHINE = os.hostname();
const PORT = 3080;
const UI_FILE = path.join(path.dirname(process.argv[1]), 'ui-settings.json');
function readUi() {
  const ui = { scale: 1, glass: 0.8 };
  try { Object.assign(ui, JSON.parse(fs.readFileSync(UI_FILE, 'utf8'))); } catch {}
  ui.scale = Math.min(1.4, Math.max(0.8, Number(ui.scale) || 1));
  ui.glass = Math.min(0.9, Math.max(0.15, Number(ui.glass) || 0.8));
  return ui;
}
function sourcePaths() {
  const app = process.env.APPDATA || '';
  return [
    { name: 'Command Code', models: 'deepseek-v4-flash、v4.1-flash', path: path.join(H, '.commandcode', 'projects') },
    { name: 'Codex', models: 'gpt-5.5、gpt-5.4', path: path.join(H, '.codex', 'sessions') },
    { name: 'Devin', models: 'swe-2-high', path: path.join(app, 'devin', 'cli', 'sessions.db') },
    { name: 'opencode', models: 'deepseek-v4-pro、step-5、mimo', path: path.join(H, '.local', 'share', 'opencode', 'opencode.db') },
    { name: 'Cursor', models: 'grok、composer、gpt、kimi', path: path.join(app, 'Cursor', 'User', 'globalStorage', 'state.vscdb') },
    { name: 'Claude Code', models: 'claude-sonnet-5', path: path.join(H, '.claude', 'projects') },
  ];
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
  try { return JSON.parse(fs.readFileSync(path.join(path.dirname(process.argv[1]), 'model_prices.json'), 'utf8')); } catch { return {}; }
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
  return (r.in * rate[0] + r.cr * rate[1] + (r.cw || 0) * (rate[3] ?? rate[0]) + r.out * rate[2]) / 1e6;
}

// ---------- 扫描器 ----------
function* jsonlFiles(dir) {
  if (!fs.existsSync(dir)) return;
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
  const tmp = path.join(os.tmpdir(), `tm-${path.basename(p)}-${process.pid}-${Date.now()}`);
  for (const s of ['', '-wal', '-shm']) {
    try { fs.copyFileSync(p + s, tmp + s); } catch {}
  }
  const db = new DatabaseSync(tmp, { readOnly: true });
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
  return scanClaudeLike(`${H}/.commandcode/projects`, 'cmdc', { inputIncludesCache: true, billing: 'plan' });
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
             o: u.output_tokens || 0, r: u.reasoning_output_tokens || 0 };
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
  for (const [idx, root] of [`${H}/.codex/sessions`, `${H}/.codex/archived_sessions`].entries()) {
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
function scanCodex() {
  const out = [];
  const sessionFinal = new Map(); // sessionId -> 该会话历史最大累计，fork 用它做基线
  for (const f of codexRolloutFiles()) {
    const meta = codexProbeMeta(f);
    const st = {
      model: '', sawMeta: false, sessionId: '', isSubagent: false,
      peak: { ...vZero }, peakTotal: 0, prevTotal: null, maxTotal: { ...vZero },
    };
    // fork 从父会话历史最大水位起步：重放段全在水线下，不计费；
    // 子代理线程有自己的独立计数，不能用父水位（否则整个文件被清零）
    const parentFinal = meta && !meta.isSubagent && meta.forkedFromId && sessionFinal.get(meta.forkedFromId);
    if (parentFinal && vTotal(parentFinal) > 0) {
      st.peak = parentFinal; st.peakTotal = vTotal(parentFinal); st.maxTotal = parentFinal;
    }
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line.includes('token_count') && !line.includes('turn_context') && !line.includes('session_meta')) continue;
      try {
        const j = JSON.parse(line);
        const p = j.payload || {};
        if (j.type === 'session_meta') {
          if (st.sawMeta) continue; // fork 会把祖先的 meta 抄在后面，只认第一个
          st.sawMeta = true;
          const m = codexSessionMeta(p); st.sessionId = m.ownId; st.isSubagent = m.isSubagent;
          continue;
        }
        if (j.type === 'turn_context') { if (p.model) st.model = p.model; continue; }
        if (p.type !== 'token_count' || !p.info) continue;
        let t = usageVec(p.info.total_token_usage);
        const l = usageVec(p.info.last_token_usage);
        if (!t && l && vTotal(l) > 0) {
          // 没有累计行的旧写：用当前峰值+last 合成
          const pk = st.peak; t = { i: pk.i + l.i, ca: pk.ca + l.ca, o: pk.o + l.o, r: pk.r + l.r };
        }
        if (!t) continue;
        const d = codexAdvance(st, t, l);
        if (!d) continue;
        const model = p.model || p.info.model || p.info.model_name || st.model || 'unknown';
        out.push(rec({ cli: 'codex', model, t: Date.parse(j.timestamp || 0),
          in: Math.max(0, d.i - d.ca), out: d.o, cr: d.ca, billing: 'plan' }));
      } catch {}
    }
    if (st.sessionId) {
      const cur = sessionFinal.get(st.sessionId);
      sessionFinal.set(st.sessionId, cur ? vMax(cur, st.maxTotal) : st.maxTotal);
    }
  }
  return out;
}

function scanClaude() {
  return scanClaudeLike(`${H}/.claude/projects`, 'claude', { inputIncludesCache: false, billing: 'list' });
}

function scanOpencode() {
  // 用 message 表而不是 session 表：session 的 token 是累计值，
  // 长期会话会把历史用量都算到创建日；message.data 里有逐条 tokens/cost/modelID
  const out = [];
  const db = openDbCopy(`${H}/.local/share/opencode/opencode.db`);
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
  const db = openDbCopy(`${process.env.APPDATA}/devin/cli/sessions.db`);
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
const p = process.env.APPDATA + '/Cursor/User/globalStorage/state.vscdb';
const out = [];
if (fs.existsSync(p)) {
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
  cursorWorker = new Worker(CURSOR_WORKER, { eval: true, workerData: { machine: MACHINE } });
  const kill = setTimeout(() => { try { cursorWorker?.terminate(); } catch {} }, 300000);
  cursorWorker.on('message', (recs) => {
    cache.records = cache.records.filter(r => r.cli !== 'cursor').concat(recs);
    cache.sources.cursor = { ...cache.sources.cursor, estRecords: recs.length };
    cursorWorker = null; clearTimeout(kill);
  });
  cursorWorker.on('error', (e) => {
    cache.errs.push('cursor: ' + e.message);
    cursorWorker = null; clearTimeout(kill);
  });
}

function scanCursor() {
  const meta = { requests: 0, models: [], note: 'token 按会话重放估算（汉字 1、其余 /4，上下文封顶 256K）' };
  const p = `${H}/.cursor/ai-tracking/ai-code-tracking.db`;
  if (fs.existsSync(p)) {
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
  } else if (rangeMs != null) from = now - rangeMs;
  const recs = records.filter(r => r.t && (from == null || r.t >= from) && r.t <= now);
  const by = { cli: {}, model: {}, machine: {} };
  let tokens = 0, cashAll = 0, listAll = 0, estAll = 0, unpriced = new Set();
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
      const label = `${cur.getMonth() + 1}月`;
      cur.setMonth(cur.getMonth() + 1);
      days.push({ d: label, t: tk(s, cur.getTime()) });
    }
  }
  const chartLabel = rangeMs === 864e5 ? '今日 · 按小时' : rangeMs === 7 * 864e5 ? '近 7 天' : rangeMs === 30 * 864e5 ? '近 30 天' : '全部 · 按月';
  const cash = Math.round(cashAll * 100) / 100;
  const list = Math.round(listAll * 100) / 100;
  const est = Math.round(estAll * 100) / 100;
  const worth = Math.round((cash + list + est) * 100) / 100;
  return {
    tokens, cost: worth, costLabel: '$' + worth.toFixed(2),
    list, cash, est,
    moneyNote: `标价 $${list.toFixed(2)} · 估算 $${est.toFixed(2)} · 网关 $${cash.toFixed(2)}`,
    pricedPct: 0, estPct: tokens ? Math.round((estAll > 0 ? 1 : 0) * 100) : 0,
    byCli: ser(by.cli), byModel: ser(by.model), byMachine: ser(by.machine),
    days, chartLabel, unpriced: [...unpriced],
  };
}

// ---------- HTTP ----------
let cache = { at: 0, records: [], errs: [], sources: {}, ms: 0 };
function refresh() {
  const s = scanAll();
  cache = { at: Date.now(), ...s, records: cache.records.filter(r => r.cli === 'cursor').concat(s.records) };
  startCursorScan();
  return cache;
}
if (process.argv.includes('--audit')) {
  const s = scanAll();
  const cursorRecs = await new Promise((resolve, reject) => {
    const w = new Worker(CURSOR_WORKER, { eval: true, workerData: { machine: MACHINE } });
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
refresh();

let backdropJpeg = null;
const RANGE = { day: 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5, all: null };
const RANGE_LABEL = { day: '今日', '7d': '7 天', '30d': '30 天', all: '全部' };

http.createServer((req, res) => {
  const u = new URL(req.url, 'x://x');
  if (u.pathname === '/api') {
    if (u.searchParams.get('refresh')) refresh();
    const range = u.searchParams.get('range') || 'day';
    const a = aggregate(cache.records, RANGE[range]);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ...a, range, rangeLabel: RANGE_LABEL[range], scanMs: cache.ms, at: cache.at, errs: cache.errs, machine: MACHINE, sources: cache.sources }));
  } else if (u.pathname === '/api/ui' && req.method === 'GET') {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ...readUi(), paths: sourcePaths() }));
  } else if (u.pathname === '/api/ui' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const cur = readUi();
      try {
        const j = JSON.parse(body || '{}');
        if (j.scale != null) cur.scale = j.scale;
        if (j.glass != null) cur.glass = j.glass;
      } catch {}
      const saved = { scale: Math.min(1.4, Math.max(0.8, Number(cur.scale) || 1)), glass: Math.min(0.9, Math.max(0.15, Number(cur.glass) || 0.8)) };
      fs.writeFileSync(UI_FILE, JSON.stringify(saved));
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ...saved, paths: sourcePaths() }));
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
  } else if (u.pathname === '/backdrop.png') {
    const file = path.join(path.dirname(process.argv[1]), 'backdrop.png');
    if (!fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
    res.setHeader('content-type', 'image/png');
    res.setHeader('cache-control', 'no-store');
    res.end(fs.readFileSync(file));
  } else if (u.pathname === '/') {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(HTML);
  } else { res.statusCode = 404; res.end(); }
}).listen(PORT, () => console.log(`token-meter: http://127.0.0.1:${PORT}`));

const HTML = `<!doctype html><html lang=zh><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>token-meter</title>
<style>
:root{--fg:rgba(255,255,255,.94);--mut:rgba(255,255,255,.62);--acc:#6aa2ff;--amber:#f0c27a;--green:#7dffa8;--line:rgba(255,255,255,.16)}
*{box-sizing:border-box;margin:0;font:13px/1.45 ui-sans-serif,system-ui,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
html,body{min-height:100%}
body{
  color:var(--fg);
  padding:28px 16px 40px;
  background:
    radial-gradient(900px 520px at 12% -10%, rgba(255,214,170,.85), transparent 55%),
    radial-gradient(700px 480px at 110% 8%, rgba(186,198,214,.7), transparent 50%),
    radial-gradient(800px 600px at 80% 120%, rgba(96,140,220,.45), transparent 55%),
    linear-gradient(165deg, #efe6d8 0%, #d5dbe3 42%, #b7c3d4 100%);
}
html.embed,body.embed{height:100%;padding:0;margin:0;overflow:hidden;background:transparent}
body.embed .backdrop{display:none}
body.embed .sheet{
  width:100%;height:100%;max-height:100%;margin:0;border-radius:0;
  background:rgba(12,16,24,.2);
  -webkit-backdrop-filter:blur(12px) saturate(1.35);
  backdrop-filter:blur(12px) saturate(1.35);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.28);
}
.backdrop{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.wash{position:absolute;inset:-8%;background:
  radial-gradient(460px 300px at 28% 18%, rgba(255,176,96,.95), transparent 68%),
  radial-gradient(420px 340px at 78% 72%, rgba(70,120,220,.72), transparent 70%),
  repeating-linear-gradient(90deg, transparent 0 46px, rgba(255,255,255,.28) 46px 47px)}
.sheet{
  position:relative;z-index:1;
  width:min(560px,100%);
  margin:0 auto;
  display:flex;flex-direction:column;
  max-height:calc(100vh - 48px);
  overflow:hidden;
  padding:16px 16px 12px;
  border-radius:28px;
  background:rgba(62,66,76,.34);
  -webkit-backdrop-filter:blur(28px) saturate(1.6);
  backdrop-filter:blur(28px) saturate(1.6);
  border:1px solid rgba(255,255,255,.38);
  box-shadow:0 30px 70px rgba(40,44,58,.28), inset 0 1px 0 rgba(255,255,255,.45), inset 0 0 0 1px rgba(255,255,255,.06);
}
.card{
  background:rgba(255,255,255,.10);
  border:1px solid rgba(255,255,255,.22);
  border-radius:18px;
  padding:14px 16px 12px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.28);
}
.top{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
.lb{color:var(--mut);font-size:12px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.lb>span{white-space:nowrap}
@media (max-width:520px){#upd{display:none}.big{font-size:28px}.cst{min-width:72px}}
.big{font-size:34px;font-weight:600;letter-spacing:-.04em;margin:4px 0 2px;font-variant-numeric:tabular-nums;color:#fff}
.big small{font-size:13px;font-weight:500;color:var(--mut);margin-left:6px;letter-spacing:0}
.sub{color:var(--mut);font-size:11.5px}
.sub b{color:#fff;font-weight:600}
.block{padding:8px 6px 2px}
.grow{flex:1;min-height:0;display:flex;flex-direction:column}
#list{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding-right:4px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.45) transparent}
#list::-webkit-scrollbar{width:8px}
#list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.42);border-radius:99px}
#list::-webkit-scrollbar-track{background:transparent}
.chart{display:flex;gap:4px;align-items:flex-end;height:108px;margin:12px 2px 18px}
.bar{flex:1;background:linear-gradient(180deg,rgba(255,255,255,.55),#5b8cff 28%,#3a6fe0);border-radius:5px 5px 2px 2px;min-height:2px;position:relative}
.bar.today{background:linear-gradient(180deg,#fff,#8eb4ff 30%,#5b8cff)}
.bar i{position:absolute;top:100%;left:-10px;right:-10px;text-align:center;font-size:10px;color:var(--mut);font-style:normal;margin-top:4px;white-space:nowrap}
.seg{display:inline-flex;gap:2px;padding:3px;border-radius:14px;background:rgba(0,0,0,.16);border:1px solid rgba(255,255,255,.14);margin:4px 0 8px}
.tab{padding:5px 12px;border-radius:11px;cursor:pointer;color:var(--mut);font-size:12px;border:0;background:transparent}
.tab:hover{color:#fff}
.tab.on{background:rgba(255,255,255,.22);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}
.li{display:grid;grid-template-columns:minmax(0,1fr) auto auto;column-gap:12px;row-gap:2px;padding:11px 4px 9px;border-top:1px solid rgba(255,255,255,.1)}
.li:first-child{border-top:0}
.nm{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.src{grid-column:1;color:var(--mut);font-size:11px}
.barc{grid-column:1;height:3px;margin-top:5px;background:rgba(255,255,255,.12);border-radius:99px;overflow:hidden}
.fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#9ec0ff,#5b8cff)}
.fill.est{background:linear-gradient(90deg,#ffe1a8,#e8b45a)}
.fill.np{background:rgba(255,255,255,.28)}
.tk{grid-row:1;grid-column:2;text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
.cst{grid-row:1;grid-column:3;min-width:92px;text-align:right;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.88)}
.cst.est{color:var(--amber)}
.warn{color:var(--amber);font-size:11.5px;margin:8px 4px 4px}
.bottom{display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0 4px}
.ft{display:flex;gap:14px;align-items:center;width:100%;color:var(--mut);font-size:12px;padding:0 4px}
.ft #scan{margin-left:auto}
.ft button{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:15px}
.ft button:hover{background:rgba(255,255,255,.22)}
.cfg{position:absolute;left:12px;right:12px;bottom:58px;z-index:6;max-height:calc(100% - 86px);overflow:auto;padding:14px 14px 12px;border-radius:18px;background:rgba(20,24,32,.72);border:1px solid rgba(255,255,255,.28);box-shadow:0 16px 40px rgba(0,0,0,.28);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
.cfg h3{font-size:14px;font-weight:600;margin-bottom:10px}
.cfg .row{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:8px 0 4px;font-size:12px;color:var(--mut)}
.cfg .row b{color:#fff;font-variant-numeric:tabular-nums}
.cfg input[type=range]{width:100%;accent-color:#8eb4ff}
.cfg .srcpath{margin-top:12px;padding-top:8px;border-top:1px solid rgba(255,255,255,.12)}
.cfg .srcpath .nm{font-size:12px}
.cfg .srcpath .sub{word-break:break-all;user-select:text}
.dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--green);margin-right:6px}
</style>
<script>if(location.search.indexOf('embed')>=0){var qs=new URLSearchParams(location.search);var zs=parseFloat(qs.get('scale'));if(zs)document.documentElement.style.zoom=zs;document.documentElement.classList.add('embed');}</script>
<div class=backdrop><div class=wash></div></div>
<div class=sheet>
<div class=top>
 <div class=card>
  <div class=lb><span id=lbTk>今日用量</span><span id=host></span></div>
  <div class=big id=tk>—</div>
  <div class=sub id=tkSub></div>
 </div>
 <div class=card>
  <div class=lb><span>用量估价</span><span id=upd></span></div>
  <div class=big id=cost>—</div>
  <div class=sub id=pct></div>
 </div>
</div>
<div class=block>
 <div class=lb><span id=chartTitle>今日 · 按小时</span><span id=scanIn></span></div>
 <div class=chart id=chart></div>
</div>
<div class="block grow">
 <div class=seg>
  <span class="tab on" data-d=model>按模型</span><span class=tab data-d=cli>按 CLI</span><span class=tab data-d=machine>按机器</span>
 </div>
 <div id=list></div>
 <div class=warn id=warn></div>
</div>
<div class=bottom>
 <div class=seg>
  <span class="tab rng on" data-r=day>今日</span><span class="tab rng" data-r=7d>7 天</span><span class="tab rng" data-r=30d>30 天</span><span class="tab rng" data-r=all>全部</span>
 </div>
 <div class=ft>
  <button onclick="load(1)" title="刷新">⟳</button>
  <span><span class=dot></span><span id=sync></span></span>
  <span id=scan></span>
  <button id=gear type=button title="设置">⚙</button>
 </div>
</div>
<div id=cfg class=cfg hidden>
 <h3>设置</h3>
 <div class=row><span>窗口大小</span><b id=scaleLab>100%</b></div>
 <input id=scaleRange type=range min=0.8 max=1.4 step=0.05 value=1>
 <div class=row><span>磨砂透光度</span><b id=glassLab>80%</b></div>
 <input id=glassRange type=range min=0.15 max=0.9 step=0.05 value=0.8>
 <div id=paths></div>
</div>
</div>
<script>
let dim='model', range='day', lastJ=null;
const fmt=n=>n>=1e9?(n/1e9).toFixed(2)+'B':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':''+n;
const esc=s=>(''+s).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
async function load(rf){
 const j=await(await fetch('/api?range='+range+(rf?'&refresh=1':''))).json(); lastJ=j;
 lbTk.textContent=j.rangeLabel+'用量';
 tk.innerHTML=fmt(j.tokens)+'<small>tokens</small>';
 cost.innerHTML=j.costLabel||('≈$'+j.cost.toFixed(2));
 tkSub.innerHTML=j.tokens.toLocaleString('en-US')+'<br>共 <b>'+j.byCli.length+'</b> 个 CLI · <b>'+j.byModel.length+'</b> 个模型';
 pct.innerHTML=j.moneyNote||'';
 upd.textContent='更新于 '+new Date(j.at).toTimeString().slice(0,8);
 host.textContent=j.machine;
 scan.textContent='扫描 '+j.scanMs+'ms';
 scanIn.textContent='扫描 '+j.scanMs+'ms';
 sync.textContent=j.machine+' · '+new Date(j.at).toLocaleTimeString();
 chartTitle.textContent=j.chartLabel||'近 14 天';
 const mx=Math.max(...j.days.map(d=>d.t),1);
 const step=Math.ceil(j.days.length/9);
 const cur=range==='day'?new Date().getHours():j.days.length-1;
 chart.innerHTML=j.days.map((d,i)=>'<div class="bar'+(i==cur?' today':'')+'" style="height:'+Math.max(2,d.t/mx*92)+'px" title="'+d.d+': '+fmt(d.t)+'"><i>'+(i%step==0?d.d:'')+'</i></div>').join('');
 const key={model:'byModel',cli:'byCli',machine:'byMachine'}[dim];
 const rows=j[key]||[];
 const m2=Math.max(...rows.map(r=>r.tokens),1);
 list.innerHTML=rows.map(r=>'<div class=li><span class=nm>'+esc(r.name)+'</span><span class=tk>'+fmt(r.tokens)+'</span><span class="cst'+(r.est?' est':'')+'">'+(r.bill?esc(r.bill):(r.noprice?'无公开价':'$'+r.cost.toFixed(2)))+'</span><span class=src>'+esc(r.cli)+'</span><div class=barc><div class="fill'+(r.noprice?' np':r.est?' est':'')+'" style="width:'+Math.max(4,r.tokens/m2*100)+'%"></div></div></div>').join('')||'<div class=sub style="padding:24px;text-align:center">该范围无数据</div>';
 warn.textContent=j.unpriced.length?j.unpriced.length+' 个模型无公开价未计入费用':'';
 const notes=[];
 for(const [k,s]of Object.entries(j.sources||{}))
  if(s.error)notes.push(k+': '+s.error);
  else if(s.note)notes.push(k+': '+s.note+'（'+s.requests+' 次请求）');
  else if(!s.records)notes.push(k+': 无数据');
 if(notes.length)warn.textContent=(warn.textContent?warn.textContent+'　':'')+notes.join(' · ');
}
document.querySelectorAll('.tab[data-d]').forEach(t=>t.onclick=()=>{dim=t.dataset.d;document.querySelectorAll('.tab[data-d]').forEach(x=>x.classList.toggle('on',x==t));load()});
document.querySelectorAll('.rng').forEach(t=>t.onclick=()=>{range=t.dataset.r;document.querySelectorAll('.rng').forEach(x=>x.classList.toggle('on',x==t));load()});
const q = new URLSearchParams(location.search);
let uiScale = Math.min(1.4, Math.max(0.8, parseFloat(q.get('scale')) || 1));
let uiGlass = Math.min(0.9, Math.max(0.15, parseFloat(q.get('glass')) || 0.8));
function applyGlass(g){
  uiGlass = g;
  const tint = Math.max(0.04, 1 - g).toFixed(3);
  document.querySelector('.sheet').style.background = 'rgba(12,16,24,' + tint + ')';
  glassLab.textContent = Math.round(g * 100) + '%';
  glassRange.value = g;
}
function applyScale(s){
  uiScale = s;
  scaleLab.textContent = Math.round(s * 100) + '%';
  scaleRange.value = s;
  if (document.body.classList.contains('embed')) document.documentElement.style.zoom = String(s);
}
let saveT;
function saveUi(){
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    fetch('/api/ui', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ scale: uiScale, glass: uiGlass }) });
    if (window.chrome && chrome.webview) chrome.webview.postMessage({ scale: uiScale, glass: uiGlass });
  }, 180);
}
scaleRange.oninput = () => { uiScale = Number(scaleRange.value); scaleLab.textContent = Math.round(uiScale * 100) + '%'; saveUi(); };
glassRange.oninput = () => { applyGlass(Number(glassRange.value)); saveUi(); };
gear.onclick = () => {
  const open = cfg.hasAttribute('hidden');
  if (open) cfg.removeAttribute('hidden'); else cfg.setAttribute('hidden','');
  if (open && !paths.dataset.loaded) {
    fetch('/api/ui').then(r => r.json()).then(j => {
      paths.dataset.loaded = '1';
      paths.innerHTML = (j.paths || []).map(p => '<div class=srcpath><div class=nm>' + esc(p.name) + '</div><div class=sub>' + esc(p.models) + '</div><div class=sub>' + esc(p.path) + '</div></div>').join('');
    });
  }
};
if (location.search.indexOf('embed')>=0) {
  document.documentElement.classList.add('embed');
  document.body.classList.add('embed');
  applyScale(uiScale);
  applyGlass(uiGlass);
  const paintBg = (u) => { document.documentElement.style.background = 'url("' + u + '") 0 0 / 100% 100% no-repeat'; };
  window.__paintBg = paintBg;
  const pull = () => fetch('/backdrop.jpg?t=' + Date.now()).then(r => { if (!r.ok) throw 0; return r.blob(); }).then(b => {
    paintBg(URL.createObjectURL(b));
  }).catch(() => setTimeout(pull, 400));
  pull();
} else { applyGlass(uiGlass); }
load();
</script>`;
