import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';

function fixture(t, settings) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'token-meter-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  if (settings !== undefined) fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify(settings));
  const home = path.join(directory, 'new-user');
  return { directory, home, env: { APPDATA: path.join(home, 'Roaming'), USERPROFILE: home } };
}
test('默认数据路径随新设备用户目录变化，不依赖作者盘符', t => {
  const options = fixture(t), config = loadConfig(options);
  assert.equal(config.port, 3080);
  assert.equal(config.paths.codex, path.join(options.home, '.codex'));
  assert.equal(config.paths.devin, path.join(options.env.APPDATA, 'devin', 'cli', 'sessions.db'));
  assert.equal(config.paths.cursor, path.join(options.env.APPDATA, 'Cursor', 'User', 'globalStorage', 'state.vscdb'));
});
test('配置支持相对路径、用户目录、环境变量和禁用数据源', t => {
  const options = fixture(t, { port: 4000, sources: { codex: './logs/codex', claude: '~/.claude/projects', cmdc: '%USERPROFILE%/.commandcode/projects', cursor: false } });
  const config = loadConfig(options);
  assert.equal(config.port, 4000);
  assert.equal(config.paths.codex, path.join(options.directory, 'logs', 'codex'));
  assert.equal(config.paths.claude, path.join(options.home, '.claude', 'projects'));
  assert.equal(config.paths.cmdc, path.join(options.home, '.commandcode', 'projects'));
  assert.equal(config.paths.cursor, null);
});
test('环境变量覆盖端口，Agent 环境变量作为默认路径', t => {
  const options = fixture(t, { port: 4000 });
  const env = { ...options.env, TOKEN_METER_PORT: '4500', CODEX_HOME: path.join(options.home, 'codex-data'), CLAUDE_CONFIG_DIR: path.join(options.home, 'claude-data'), XDG_DATA_HOME: path.join(options.home, 'xdg') };
  const config = loadConfig({ ...options, env });
  assert.equal(config.port, 4500);
  assert.equal(config.paths.codex, env.CODEX_HOME);
  assert.equal(config.paths.claude, path.join(env.CLAUDE_CONFIG_DIR, 'projects'));
  assert.equal(config.paths.opencode, path.join(env.XDG_DATA_HOME, 'opencode', 'opencode.db'));
});
test('外部配置的相对路径以配置文件目录为基准，支持 BOM', t => {
  const options = fixture(t), folder = path.join(options.directory, 'profiles');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'custom.json'), '\uFEFF'+JSON.stringify({ sources: { codex: '../data' } }));
  const config = loadConfig({ ...options, env: { ...options.env, TOKEN_METER_CONFIG: 'profiles/custom.json' } });
  assert.equal(config.paths.codex, path.join(options.directory, 'data'));
});
test('损坏配置、未知数据源和无效端口明确失败', t => {
  for (const settings of [{ port: 0 }, { port: 65536 }, { port: 3080.5 }, { sources: [] }, { sources: { typo: 'logs' } }, { sources: { codex: 123 } }, { sources: { codex: '%MISSING_ENV%/logs' } }]) {
    assert.throws(() => loadConfig(fixture(t, settings)));
  }
  const options = fixture(t);
  assert.throws(() => loadConfig({ ...options, env: { TOKEN_METER_CONFIG: 'missing.json' } }), /不存在/);
  fs.writeFileSync(path.join(options.directory, 'config.json'), '{broken');
  assert.throws(() => loadConfig(options), /无法读取/);
});

test('迁移后的实际 API 扫描配置来源，Cursor worker 也使用配置路径', { timeout: 20000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'token-meter-api-'));
  let child;
  t.after(async () => { if (child && child.exitCode == null) { child.kill(); await once(child, 'exit'); } fs.rmSync(directory, { recursive: true, force: true }); });
  const home = path.join(directory, 'different-user');
  const codexRoot = path.join(directory, 'data', 'codex');
  fs.mkdirSync(path.join(codexRoot, 'sessions'), { recursive: true });
  const now = new Date().toISOString();
  const events = [
    { type: 'session_meta', payload: { id: 'migration' } },
    { type: 'turn_context', payload: { model: 'gpt-6.1-sol' } },
    { type: 'token_usage_record', payload: { response_id: 'migration-response', thread_id: 'migration', usage: { input_tokens: 100, cached_input_tokens: 50, output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 120 }, thread_token_usage: { input_tokens: 100, cached_input_tokens: 50, output_tokens: 20, total_tokens: 120 } } },
  ];
  fs.writeFileSync(path.join(codexRoot, 'sessions', 'rollout-migration.jsonl'), events.map(e => JSON.stringify({ ...e, timestamp: now })).join('\n')+'\n');
  // A real, tiny SQLite fixture proves the worker reads the configured DB, not APPDATA.
  const { DatabaseSync } = await import('node:sqlite');
  const dbPath = path.join(directory, 'data', 'cursor.vscdb');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT)');
  const insert = db.prepare('INSERT INTO cursorDiskKV VALUES (?, ?)');
  insert.run('composerData:fixture', JSON.stringify({ modelConfig: { modelName: 'gpt-6.1-sol' } }));
  insert.run('bubbleId:fixture:u', JSON.stringify({ tokenCount: 0, text: 'hello', type: 'user', createdAt: new Date(Date.parse(now)-1000).toISOString() }));
  insert.run('bubbleId:fixture:a', JSON.stringify({ tokenCount: 0, text: 'response', type: 'assistant', createdAt: now }));
  db.close();
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const configFile = path.join(directory, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify({ port, sources: { cmdc: false, claude: false, devin: false, opencode: false, codex: './data/codex', cursor: './data/cursor.vscdb', cursorTracking: false } }));
  const serverFile = fileURLToPath(new URL('./server.mjs', import.meta.url));
  const env = { ...process.env, TOKEN_METER_CONFIG: configFile, USERPROFILE: home };
  delete env.TOKEN_METER_PORT;
  child = spawn(process.execPath, [serverFile], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server startup timed out: '+output)), 10000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); reject(new Error('server exited '+code+': '+output)); });
    child.stderr.on('data', data => { output += data; });
    child.stdout.on('data', data => { output += data; if (output.includes('local API:')) { clearTimeout(timer); resolve(); } });
  });
  const base = `http://127.0.0.1:${port}`;
  const ui = await (await fetch(base+'/api/ui')).json();
  assert.equal(ui.configFile, configFile);
  assert.equal(ui.paths.find(p => p.id === 'codex').path, codexRoot);
  assert.equal(ui.paths.find(p => p.id === 'cmdc').enabled, false);
  let stats;
  for (let i=0; i<50; i++) {
    stats = await (await fetch(base+'/api?range=all')).json();
    if (!stats.sources.cursor.pending) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(stats.codex.tokens, 120);
  assert.equal(stats.byCli.find(r => r.name === 'cursor').tokens, 4);
  assert.equal(stats.tokens, 124);
  assert.deepEqual(stats.errs, []);
  assert.equal((await fetch(base+'/')).status, 410);
  assert.equal((await fetch(base+'/backdrop.png')).status, 404);
});
