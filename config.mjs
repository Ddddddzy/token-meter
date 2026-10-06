import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadConfig({ directory = path.dirname(fileURLToPath(import.meta.url)), home = os.homedir(), env = process.env } = {}) {
  const file = env.TOKEN_METER_CONFIG ? path.resolve(directory, env.TOKEN_METER_CONFIG) : path.join(directory, 'config.json');
  let settings = {};
  if (fs.existsSync(file)) {
    try { settings = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
    catch (error) { throw new Error(`配置文件无法读取：${file} (${error.message})`); }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('config.json 必须是 JSON 对象');
  } else if (env.TOKEN_METER_CONFIG) throw new Error(`配置文件不存在：${file}`);
  const port = Number(env.TOKEN_METER_PORT ?? settings.port ?? 3080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port 必须是 1–65535 的整数');
  if (settings.sources != null && (typeof settings.sources !== 'object' || Array.isArray(settings.sources))) throw new Error('sources 必须是 JSON 对象');
  const app = env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const defaults = {
    cmdc: path.join(home, '.commandcode', 'projects'),
    codex: env.CODEX_HOME || path.join(home, '.codex'),
    claude: path.join(env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'projects'),
    opencode: path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'opencode', 'opencode.db'),
    devin: path.join(app, 'devin', 'cli', 'sessions.db'),
    cursor: path.join(app, 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
    cursorTracking: path.join(home, '.cursor', 'ai-tracking', 'ai-code-tracking.db'),
  };
  const configured = settings.sources || {};
  for (const name of Object.keys(configured)) if (!Object.hasOwn(defaults, name)) throw new Error(`未知数据源：${name}`);
  const paths = {};
  for (const [name, fallback] of Object.entries(defaults)) {
    const value = configured[name];
    if (value === false) { paths[name] = null; continue; }
    if (value == null || value === '') { paths[name] = path.resolve(directory, fallback); continue; }
    if (typeof value !== 'string') throw new Error(`sources.${name} 必须是路径字符串、null 或 false`);
    let expanded = value.replace(/%([^%]+)%/g, (all, key) => {
      const match = Object.keys(env).find(k => k.toLowerCase() === key.toLowerCase());
      if (!match || !env[match]) throw new Error(`sources.${name} 使用了未设置的环境变量：${key}`);
      return env[match];
    });
    if (/^~([/\\]|$)/.test(expanded)) expanded = path.join(home, expanded.slice(2));
    paths[name] = path.resolve(path.dirname(file), expanded);
  }
  return { file, port, paths };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--port')) {
  console.log(loadConfig().port);
}
