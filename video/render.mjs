import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {openBrowser, selectComposition, renderStill, renderMedia} from '@remotion/renderer';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'output');
fs.mkdirSync(output, {recursive: true});
const browserPath = process.env.TOKEN_METER_RENDER_BROWSER;
const film = process.argv.includes('--film');
const scale = process.argv.includes('--4k') ? 2 : 1;
const compositionId = film ? 'TokenMeterFilm' : 'TokenMeterPilot';
const revision = process.argv.includes('--revision5') ? '-revision5' : '';
const fileName = film ? `token-meter-film-60s-${scale === 2 ? '4k' : '1080p'}${revision}.mp4` : 'token-meter-pilot-10s.mp4';
let browser;
try {
  // Remotion manages an isolated rendering profile, not the user's browser.
  browser = await openBrowser('chrome', {browserExecutable: browserPath});
  console.log('Browser ready; bundling animation.');
  const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts'), outDir: path.join(root, 'build')});
  const composition = await selectComposition({serveUrl, id: compositionId, puppeteerInstance: browser, timeoutInMilliseconds: 60000});
  if (film && !process.argv.includes('--benchmark')) {
    const cover = await selectComposition({serveUrl, id: 'TokenMeterCover', puppeteerInstance: browser, timeoutInMilliseconds: 60000});
    await renderStill({serveUrl, composition: cover, frame: 0, output: path.join(output, 'token-meter-cover.png'), imageFormat: 'png', puppeteerInstance: browser});
  }
  const frames = process.argv.includes('--check-glass') ? [342,354,360,366,382,400,405,410,420,432,1200,1260,1312,1360,1382,1404,1456,1462,1466,1494] : process.argv.includes('--check-taskbar') ? [398,400,405,410,438,600,1030,1305,1456,1462,1466,1490] : process.argv.includes('--check-ui') ? [600, 1030, 1230, 1305, 1405, 1755] : film ? [0, 36, 84, 100, 290,342,354,360,366,382,398,400,405,410,420,432,438,465,600,710,785,883,950,1030,1130,1200,1230,1260,1312,1360,1382,1404,1405,1455,1456,1462,1464,1466,1490,1494,1530,1670,1755,1799]
    : process.argv.includes('--quick') ? [100, 290] : [0, 36, 84, 132, 159, 189, 225, 299];
  const refreshedFrames = process.argv.includes('--refresh-legacy-stills') ? [370,415,1305] : frames;
  for (const frame of process.argv.includes('--video-only') ? [] : refreshedFrames) {
    await renderStill({serveUrl, composition, frame, output: path.join(output, `${film ? 'film' : 'frame'}-${String(frame).padStart(film ? 4 : 3, '0')}.png`), imageFormat: 'png', puppeteerInstance: browser, timeoutInMilliseconds: 60000});
    console.log(`Checked frame ${frame}.`);
  }
  if (!process.argv.includes('--stills')) {
    let last = -1;
    await renderMedia({serveUrl, composition, codec: 'h264', crf: 14, imageFormat: 'png', scale, pixelFormat: 'yuv420p', colorSpace: 'bt709', concurrency: 1, audioCodec: 'aac', audioBitrate: '320k',
      frameRange: process.argv.includes('--benchmark') ? [930, 989] : undefined,
      outputLocation: path.join(output, process.argv.includes('--benchmark') ? 'benchmark-4k.mp4' : fileName), puppeteerInstance: browser, timeoutInMilliseconds: 60000,
      onProgress: ({progress}) => {const percent = Math.floor(progress * 10) * 10; if (percent !== last) {last = percent; console.log(`Render ${percent}%`);}},
    });
    console.log(`Finished: output/${fileName}`);
  }
} finally {
  if (browser) await browser.close({silent: true});
}
