import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const source = process.argv[2];
if (!source) throw new Error('传入产品 panel.html 路径；仅提取静态结构与样式。');
const text = fs.readFileSync(source, 'utf8');
const css = text.match(/<style>([\s\S]*?)<\/style>/)?.[1];
const html = text.match(/<body>([\s\S]*?)<script>/)?.[1];
if (!css || !html) throw new Error('panel.html 的结构不符合预期。');
const output = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src/panel-reference.ts');
fs.writeFileSync(output, '// Generated from product panel.html. No app scripts or account data.\n'
  + `export const panelSourceHash = ${JSON.stringify(crypto.createHash('sha256').update(text).digest('hex'))};\n`
  + `export const panelCSS = ${JSON.stringify(css.replaceAll(':root', ':host'))};\n`
  + `export const panelHTML = ${JSON.stringify(html)};\n`);
console.log('Synchronized actual panel styles and static DOM.');
