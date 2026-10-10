import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const ffmpeg = process.env.TOKEN_METER_FFMPEG ?? path.join(root, 'node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe');
const master = path.join(root, 'output/token-meter-film-60s-4k.mp4');
const preview = path.join(root, 'output/token-meter-film-60s-1080p.mp4');
if (!fs.existsSync(master)) throw new Error('先运行 npm run film:4k 生成母版。');
const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', master, '-vf', 'zscale=w=1920:h=1080:filter=lanczos',
  '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', preview];
const code = await new Promise((resolve, reject) => {
  const child = spawn(ffmpeg, args, {stdio: 'inherit', windowsHide: true});
  child.on('error', reject); child.on('exit', resolve);
});
if (code !== 0) throw new Error(`预览转码失败：${code}`);
console.log('Finished: output/token-meter-film-60s-1080p.mp4');
