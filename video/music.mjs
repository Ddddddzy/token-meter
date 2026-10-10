// Original procedural composition. No sampled music or third-party audio.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const rate = 48000, duration = 60, count = rate * duration;
const left = new Float32Array(count), right = new Float32Array(count);
const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);
const beat = 60 / 100;
const chords = [[50,57,60,64,69], [46,53,57,60,65], [53,60,64,67,72], [48,55,60,62,67]];
let state = 20261009;
const noise = () => {state = (Math.imul(state,1664525) + 1013904223) >>> 0; return state / 2147483648 - 1;};
const clamp = (v) => Math.max(0, Math.min(1, v));
const mix = (index, value, pan = 0) => {left[index] += value * Math.sqrt((1 - pan) / 2); right[index] += value * Math.sqrt((1 + pan) / 2);};
const tone = ({time, length, midi, gain, pan = 0, kind = 'pad'}) => {
  const first = Math.max(0, Math.round(time * rate)), last = Math.min(count, Math.round((time + length) * rate));
  const f = freq(midi);
  for(let i = first; i < last; i++) {
    const t = (i - first) / rate;
    const env = kind === 'pluck' ? (1 - Math.exp(-t * 190)) * Math.exp(-t * 4.2) * clamp((length - t) * 8)
      : Math.sin(Math.PI * clamp(t / length)) ** 1.2;
    const phase = 2 * Math.PI * f * t;
    const signal = Math.sin(phase) + (kind === 'pluck' ? .17 : .08) * Math.sin(phase * 2) + .035 * Math.sin(phase * 3);
    mix(i, gain * env * signal, pan);
  }
};
// Ten four-beat bars in each harmonic phrase, with a slow, unobtrusive pad.
for(let bar = 0; bar < 25; bar++) {
  const at = bar * beat * 4, chord = chords[Math.floor(bar / 2) % chords.length];
  chord.forEach((midi, i) => tone({time: at, length: beat * 4 + .4, midi, gain: .024, pan: (i - 2) * .25}));
  tone({time: at, length: beat * 3.8, midi: chord[0] - 12, gain: .065, kind: 'pad'});
  const pattern = [0,2,4,3,1,3,4,2];
  pattern.forEach((step, j) => tone({time: at + j * beat / 2 + .12, length: 1.25, midi: chord[step] + 12,
    gain: bar < 2 ? .028 : .044, pan: j % 2 ? .28 : -.28, kind: 'pluck'}));
}
// Minimal electronic pulse: no snare and no stock loops.
for(let time = .15; time < 57.6; time += beat) {
  const first = Math.round(time * rate), last = Math.min(count, first + Math.round(.24 * rate));
  const accent = Math.round((time - .15) / beat) % 4 === 0;
  for(let i = first; i < last; i++) {
    const t = (i - first) / rate;
    const phase = 2 * Math.PI * (46 * t + 18 * .024 * (1 - Math.exp(-t / .024)));
    mix(i, (accent ? .115 : .065) * Math.sin(phase) * (1 - Math.exp(-t * 600)) * Math.exp(-t * 24));
  }
  const hatStart = first + Math.round(beat / 2 * rate);
  for(let j = 0; j < Math.round(.06 * rate) && hatStart + j < count; j++) mix(hatStart + j, .008 * noise() * Math.exp(-j / rate * 80), .22);
}
// Soft, original whooshes align with the shared-element scene changes.
for(const time of [4.6, 11.9, 21.7, 30.7, 39.7, 48.5, 54.8]) {
  let low = 0;
  for(let j = 0; j < .65 * rate; j++) {
    const i = Math.round(time * rate) + j;
    if(i >= count) break;
    low = low * .92 + noise() * .08;
    const p = j / (.65 * rate), env = Math.sin(Math.PI * p) ** 2;
    mix(i, low * .18 * env, (p - .5) * .5);
  }
}
let peak = 0, power = 0;
for(let i = 0; i < count; i++) {
  const t = i / rate, fade = clamp(t / 1.1) * clamp((duration - t) / 3.1);
  left[i] *= fade; right[i] *= fade;
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  power += left[i] ** 2 + right[i] ** 2;
}
const gain = Math.min(2.2, .58 / Math.max(peak, .0001));
const pcm = Buffer.alloc(count * 4 + 44);
pcm.write('RIFF',0); pcm.writeUInt32LE(count * 4 + 36,4); pcm.write('WAVE',8); pcm.write('fmt ',12);
pcm.writeUInt32LE(16,16); pcm.writeUInt16LE(1,20); pcm.writeUInt16LE(2,22); pcm.writeUInt32LE(rate,24);
pcm.writeUInt32LE(rate * 4,28); pcm.writeUInt16LE(4,32); pcm.writeUInt16LE(16,34); pcm.write('data',36); pcm.writeUInt32LE(count * 4,40);
for(let i = 0; i < count; i++) {pcm.writeInt16LE(Math.round(left[i] * gain * 32767),44 + i * 4); pcm.writeInt16LE(Math.round(right[i] * gain * 32767),46 + i * 4);}
fs.mkdirSync(path.join(root,'public/audio'),{recursive:true});
fs.writeFileSync(path.join(root,'public/audio/token-meter-original.wav'),pcm);
console.log(JSON.stringify({duration,rate,channels:2,peakDb:20 * Math.log10(peak * gain),rmsDb:20 * Math.log10(Math.sqrt(power / (count * 2)) * gain),seed:20261009}));
