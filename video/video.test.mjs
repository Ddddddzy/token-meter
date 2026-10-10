import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {demo, sum} from './src/film-data.ts';
import {panelCSS, panelHTML, panelSourceHash} from './src/panel-reference.ts';
import {desktop, panelBounds} from './src/desktop-layout.ts';
import {panelDurationMs, panelMotion, smoothstep} from './src/product-motion.ts';
import {backdropPresence, desktopBackdropSVG} from './src/desktop-backdrop.ts';
test('panel uses native 240ms smoothstep without moving or scaling its content', () => {
  assert.equal(panelDurationMs,240);
  assert.equal(panelMotion(desktop.openStart,desktop.openStart),0);
  assert.ok(Math.abs(panelMotion(desktop.openStart+3.6,desktop.openStart)-.5)<1e-12);
  assert.equal(panelMotion(desktop.openEnd,desktop.openStart),1);
  for(let i=0;i<=100;i++) assert.ok(Math.abs(smoothstep(i/100)-(i/100)**2*(3-2*i/100))<1e-12);
  const source = fs.readFileSync(new URL('./src/Pilot.tsx',import.meta.url),'utf8');
  assert.ok(!/merge=|target=/.test(source),'Concept cards must not morph into product rows');
});
test('glass and visible desktop share one synthetic fixture', () => {
  assert.equal(backdropPresence(1100),0); assert.equal(backdropPresence(1312),1); assert.equal(backdropPresence(1600),0);
  assert.ok(desktopBackdropSVG.includes('viewBox="0 0 1920 1004"'));
  assert.ok(!/<script|https?:\/\//.test(desktopBackdropSVG.replace('http://www.w3.org/2000/svg','')));
});
test('panel stays anchored above the Windows taskbar across all zooms', () => {
  for(const scale of [1.31,1.35,1.44]) {
    const b = panelBounds(scale);
    assert.equal(b.bottom,desktop.taskbarTop-12);
    assert.equal(b.right,desktop.width-12);
    assert.ok(b.top>0); assert.ok(b.left>1000);
    assert.ok(desktop.trayX>b.left&&desktop.trayX<b.right);
  }
  assert.ok(desktop.trayY>desktop.taskbarTop&&desktop.trayY<desktop.height);
  assert.ok(desktop.openClick<desktop.openStart&&desktop.closeClick<desktop.closeStart);
  assert.ok(Math.abs(desktop.openEnd-desktop.openStart-7.2)<1e-9);
  assert.ok(Math.abs(desktop.closeEnd-desktop.closeStart-7.2)<1e-9);
});
test('panel snapshot keeps actual static structure without application scripts', () => {
  assert.match(panelSourceHash, /^[a-f0-9]{64}$/);
  for (const id of ['panel','scroll','rangeTabs','dimensionTabs','list','settings','scale','glass','blur','status']) {
    assert.ok(panelHTML.includes(`id="${id}"`), `missing real panel element ${id}`);
  }
  assert.ok(panelHTML.includes('按设备 · 待开发'));
  assert.ok(panelHTML.includes('disabled'));
  assert.ok(panelCSS.includes('.panel::before'));
  assert.ok(panelCSS.includes('overflow-y:auto'));
  assert.ok(!/<script|fetch\(|setInterval\(/i.test(panelHTML));
});
test('demo totals and subsets do not double count', () => {
  assert.equal(sum(demo.daily), 240600);
  assert.equal(sum(demo.weekly), 1157020);
  assert.equal(sum(demo.weekBins), sum(demo.weekly));
  assert.equal(demo.codex.input + demo.codex.output, demo.daily[0]);
  assert.ok(demo.codex.cached <= demo.codex.input);
  assert.ok(demo.codex.reasoning <= demo.codex.output);
  assert.equal(demo.hourlyWeights.length, 24);
  assert.equal(demo.weekBins.length, 7);
});
test('interpolated totals remain consistent across day/week switch', () => {
  for(let i = 0; i <= 100; i++) {
    const p = i / 100;
    const rows = demo.daily.map((v, j) => v + (demo.weekly[j] - v) * p);
    assert.ok(Math.abs(sum(rows) - (240600 + (1157020 - 240600) * p)) < 1e-6);
  }
});
test('original PCM audio is stereo 48kHz and exactly sixty seconds', () => {
  const audio = fs.readFileSync(new URL('./public/audio/token-meter-original.wav', import.meta.url));
  assert.equal(audio.toString('ascii',0,4), 'RIFF');
  assert.equal(audio.readUInt16LE(22), 2);
  assert.equal(audio.readUInt32LE(24), 48000);
  assert.equal(audio.readUInt32LE(40), 60 * 48000 * 4);
  let maximum = 0, power = 0;
  for(let i = 44; i < audio.length; i += 2) {const v = audio.readInt16LE(i) / 32768; maximum = Math.max(maximum, Math.abs(v)); power += v * v;}
  assert.ok(maximum < .95, 'audio must not clip');
  assert.ok(Math.sqrt(power / ((audio.length - 44) / 2)) > .02, 'audio must not be silent');
});
