import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeUi, readUi, saveUi } from './ui-settings.mjs';

test('旧界面偏好补齐默认模糊度，原透明度和缩放不变', () => {
  assert.deepEqual(normalizeUi({ scale: 1.2, glass: 0.4 }), { scale: 1.2, glass: 0.4, blur: 50 });
  assert.deepEqual(normalizeUi(null), { scale: 1, glass: 0.8, blur: 50 });
});
test('模糊度允许零，限制上下界，异常数值回退默认', () => {
  assert.equal(normalizeUi({ blur: 0 }).blur, 0);
  assert.equal(normalizeUi({ blur: -20 }).blur, 0);
  assert.equal(normalizeUi({ blur: 200 }).blur, 100);
  assert.equal(normalizeUi({ blur: 62.7 }).blur, 63);
  for (const blur of [null, undefined, '', 'invalid', Infinity, NaN]) assert.equal(normalizeUi({ blur }).blur, 50);
});
test('模糊度独立保存，透明度更新不覆盖模糊度，重读保留零值', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'token-meter-ui-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'ui-settings.json');
  fs.writeFileSync(file, '\uFEFF'+JSON.stringify({ scale: 1.1, glass: 0.4 }));
  assert.deepEqual(saveUi(file, { blur: 0 }), { scale: 1.1, glass: 0.4, blur: 0 });
  assert.deepEqual(saveUi(file, { glass: 0.6 }), { scale: 1.1, glass: 0.6, blur: 0 });
  assert.deepEqual(readUi(file), { scale: 1.1, glass: 0.6, blur: 0 });
  fs.writeFileSync(file, 'broken');
  assert.deepEqual(readUi(file), normalizeUi());
});
