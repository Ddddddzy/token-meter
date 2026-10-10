import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const binary = (name) => path.join(root, `node_modules/@remotion/compositor-win32-x64-msvc/${name}.exe`);
const report = {date: '2026-10-10', outputs: [], audio: null};
for(const [name,width,height] of [['token-meter-film-60s-4k.mp4',3840,2160],['token-meter-film-60s-1080p.mp4',1920,1080]]) {
  const file = path.join(root,'output',name);
  const {stdout} = await run(binary('ffprobe'),['-v','error','-show_streams','-show_format','-of','json',file],{windowsHide:true});
  const data = JSON.parse(stdout), video = data.streams.find(s=>s.codec_type==='video'), audio = data.streams.find(s=>s.codec_type==='audio');
  assert.equal(video.width,width); assert.equal(video.height,height); assert.equal(video.codec_name,'h264');
  assert.equal(video.pix_fmt,'yuv420p'); assert.equal(video.color_space,'bt709'); assert.equal(video.avg_frame_rate,'30/1');
  assert.equal(Number(video.nb_frames),1800); assert.ok(Math.abs(Number(video.duration)-60)<.02);
  assert.equal(audio.codec_name,'aac'); assert.equal(Number(audio.sample_rate),48000); assert.equal(audio.channels,2);
  assert.ok(Math.abs(Number(data.format.duration)-60)<.05);
  report.outputs.push({name,width,height,fps:30,frames:1800,videoDuration:Number(video.duration),containerDuration:Number(data.format.duration),bytes:Number(data.format.size),video:'h264/yuv420p/bt709',audio:'aac/48000/stereo'});
}
const {stdout: wave} = await run(binary('ffmpeg'),['-v','error','-i',path.join(root,'output/token-meter-film-60s-1080p.mp4'),'-map','0:a:0','-t','60','-c:a','pcm_s16le','-f','wav','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:16*1024*1024});
assert.equal(wave.toString('ascii',8,12),'WAVE');
let pcm;
for(let offset=12;offset+8<wave.length;) {
  const tag=wave.toString('ascii',offset,offset+4), size=wave.readUInt32LE(offset+4);
  if(tag==='data') {pcm=wave.subarray(offset+8);break;}
  offset+=8+size+(size%2);
}
assert.ok(pcm,'decoded WAV must contain PCM data');
let peak = 0, power = 0;
for(let i=0;i+1<pcm.length;i+=2) {const v=pcm.readInt16LE(i)/32768; peak=Math.max(peak,Math.abs(v)); power+=v*v;}
assert.ok(peak<.95,'decoded audio must not clip');
const rms=Math.sqrt(power/(pcm.length/2));
assert.ok(rms>.02,'decoded soundtrack must not be silent');
report.audio={decodedSamples:pcm.length/2,peakDb:20*Math.log10(peak),rmsDb:20*Math.log10(rms),clipped:false,silent:false};
fs.writeFileSync(path.join(root,'output/validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
