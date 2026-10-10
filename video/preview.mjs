import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const routes = new Map([
  ['/', ['preview.html', 'text/html; charset=utf-8']],
  ['/token-meter-pilot-10s.mp4', ['output/token-meter-pilot-10s.mp4', 'video/mp4']],
  ['/frame-100.png', ['output/frame-100.png', 'image/png']],
  ['/token-meter-film-60s-1080p.mp4', ['output/token-meter-film-60s-1080p.mp4', 'video/mp4']],
  ['/token-meter-film-60s-4k.mp4', ['output/token-meter-film-60s-4k.mp4', 'video/mp4']],
  ['/token-meter-cover.png', ['output/token-meter-cover.png', 'image/png']],
]);
const server = http.createServer((req, res) => {
  const route = routes.get(new URL(req.url, 'http://localhost').pathname);
  if (!route || !['GET', 'HEAD'].includes(req.method)) {res.writeHead(404).end(); return;}
  const file = path.join(root, route[0]);
  if (!fs.existsSync(file)) {res.writeHead(404).end('Render the pilot first.'); return;}
  const size = fs.statSync(file).size;
  const headers = {'Content-Type': route[1], 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store'};
  let start = 0, end = size - 1, status = 200;
  if (req.headers.range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    if (!match) {res.writeHead(416, {'Content-Range': `bytes */${size}`}).end(); return;}
    start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start > end || start >= size) {res.writeHead(416, {'Content-Range': `bytes */${size}`}).end(); return;}
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') {res.end(); return;}
  fs.createReadStream(file, {start, end}).on('error', () => res.destroy()).pipe(res);
});
const port = Number(process.env.TOKEN_METER_VIDEO_PORT ?? 4518);
server.listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}`));
