import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {scanCodex,aggregate,listUsd,rateFor,codexAdvance} from './server.mjs';

const vec=(i,c,o,r=0,w=0)=>({input_tokens:i,cached_input_tokens:c,output_tokens:o,reasoning_output_tokens:r,cache_write_input_tokens:w,total_tokens:i+o});
const at='2026-10-06T02:00:00Z';
const event=(type,payload,ordinal=1,timestamp=at)=>({type,payload,ordinal,timestamp});
const meta=(id,parent,ordinal)=>event('session_meta',{id,forked_from_id:parent,forked_from_ordinal_exclusive:ordinal});
const context=model=>event('turn_context',{model});
const usage=(id,thread,v,total,n=3)=>event('token_usage_record',{response_id:id,thread_id:thread,usage:v,thread_token_usage:total},n);
const count=(total,last,n=4)=>event('event_msg',{type:'token_count',info:{total_token_usage:total,last_token_usage:last}},n);
function fixture(t,files){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'token-meter-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return files.map((events,i)=>{const f=path.join(dir,'rollout-'+i+'.jsonl');fs.writeFileSync(f,events.map(e=>JSON.stringify(e)).join('\n')+'\n');return f})}
const total=r=>r.reduce((n,x)=>n+x.in+x.cr+x.cw+x.out,0);

test('Desktop 精确记录与重复 token_count 只计一次，缓存/推理是子集',t=>{
 const v=vec(100,60,20,5,10),files=fixture(t,[[meta('a'),context('gpt-6.1-sol'),usage('r1','a',v,v),count(v,v),count(v,v,5)]]);
 const r=scanCodex(files);assert.equal(r.length,1);assert.equal(total(r),120);assert.equal(r[0].in,30);assert.equal(r[0].cr,60);assert.equal(r[0].cw,10);assert.equal(r[0].out,20);assert.equal(r[0].reasoning,5);
});
test('跨文件 response_id 去重，模型切换逐次归属',t=>{
 const a=vec(100,50,10),b=vec(200,120,20),sum=vec(300,170,30);
 const r=scanCodex(fixture(t,[[meta('a'),context('gpt-5.6-terra'),usage('r1','a',a,a),context('gpt-6.1-sol'),usage('r2','a',b,sum,6)], [meta('b'),context('gpt-5.6-terra'),usage('r1','a',a,a)]]));
 assert.equal(total(r),330);assert.deepEqual(r.map(x=>x.model),['gpt-5.6-terra','gpt-6.1-sol']);
});
test('fork 基线取 fork 点而不是父会话后来终值；不重复继承历史',t=>{
 const a=vec(100,50,10),later=vec(300,200,30),child=vec(160,80,20),delta=vec(60,30,10);
 const files=fixture(t,[[meta('parent'),context('gpt-5.5'),count(a,a,3),count(later,vec(200,150,20),10)], [meta('child','parent',5),context('gpt-6.1-sol'),count(a,vec(0,0,0),3),count(child,delta,7)]]);
 const r=scanCodex(files);assert.equal(total(r),400);assert.equal(r.filter(x=>x.sessionId==='child').length,1);assert.equal(total(r.filter(x=>x.sessionId==='child')),70);
});
test('子代理独立计数，累计重播/乱序/重启不重复',t=>{
 const a=vec(100,50,10),b=vec(150,70,20),reset=vec(20,10,5);
 const files=fixture(t,[[meta('a'),context('gpt-5.5'),count(a,a),count(a,a),count(b,vec(50,20,10)),count(a,vec(40,20,5)),count(reset,reset)], [event('session_meta',{id:'sub',source:{subagent:{thread_spawn:{parent_thread_id:'a'}}}}),context('gpt-6.1-sol'),count(vec(10,5,5),vec(10,5,5))]]);
 assert.equal(total(scanCodex(files)),210);
});
test('旧日志增量虚报时回退累计差',t=>{
 const r=scanCodex(fixture(t,[[meta('a'),context('gpt-5.5'),count(vec(100,60,20),vec(200,120,40)),count(vec(160,100,30),vec(120,80,20))]]));
 assert.equal(total(r),190);
});
test('文件追加新记录后刷新，不缓存漏记，损坏末行可恢复',t=>{
 const files=fixture(t,[[meta('a'),context('gpt-6.1-sol'),usage('r1','a',vec(10,5,3),vec(10,5,3))]]);
 assert.equal(total(scanCodex(files)),13);
 fs.appendFileSync(files[0],JSON.stringify(usage('r2','a',vec(20,10,5),vec(30,15,8),6))+'\n{"type":');
 assert.equal(total(scanCodex(files)),38);assert.equal(total(scanCodex(files)),38);
});
test('新旧日志混合兼容：精确记录覆盖后续轮次，保留此前旧记录',t=>{
 const a=vec(100,50,10),b=vec(200,100,20),sum=vec(300,150,30);
 const r=scanCodex(fixture(t,[[meta('a'),context('gpt-5.5'),count(a,a),count(sum,b,6),usage('r2','a',b,sum,7)]]));
 assert.equal(total(r),330);
});
test('所有范围聚合/图表/分组相等，自然日边界准确',()=>{
 const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
 const recs=[{t:today,in:10,out:2,cr:8,cw:0,reasoning:1,cli:'codex',model:'gpt-6.1-sol',machine:'L'}, {t:today-6*864e5,in:10,out:3,cr:0,cw:0,cli:'codex',model:'gpt-5.5',machine:'L'}, {t:today-7*864e5,in:100,out:3,cr:0,cw:0,cli:'codex',model:'gpt-5.5',machine:'L'}];
 for(const range of [864e5,7*864e5,30*864e5,null]){const a=aggregate(recs,range);assert.equal(a.days.reduce((n,d)=>n+d.t,0),a.tokens);assert.equal(a.stacks.reduce((n,d)=>n+Object.values(d.parts).reduce((a,b)=>a+b,0),0),a.tokens);assert.equal(a.byModel.reduce((n,r)=>n+r.tokens,0),a.tokens);assert.equal(a.codex.input+a.codex.output,a.codex.tokens)}
 assert.equal(aggregate(recs,7*864e5).tokens,33);assert.equal(aggregate(recs,864e5).tokens,20);
});
test('GPT-6.1 Sol 定价、长上下文、Fast 计价，未知模型不误匹配',()=>{
 const rate=rateFor('gpt-6.1-sol').rate;assert.deepEqual(rate,[2,.1,10,2.5]);
 assert.equal(rateFor('gpt-6.2-sol'),null);
 const r={model:'gpt-6.1-sol',in:100000,cr:100000,cw:0,out:1000};
 assert.equal(listUsd(r,rate),.22);
 assert.equal(listUsd({...r,serviceTier:'priority'},rate),.44);
 assert.equal(listUsd({...r,cr:200000},rate),.455);
});
