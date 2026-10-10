import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const panel=fs.readFileSync(new URL('./panel.html',import.meta.url),'utf8');
const renderer=panel.match(/async function renderList\(\)\{[\s\S]*?(?=\nfunction listSignature)/)[0];
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(keys=['cli:codex','cli:claude'],reduced=false){
  let wanted=[...keys],blocks=keys.map((key,i)=>({key,inert:false,isConnected:true,opacity:1,rect:{top:i*80,bottom:i*80+80},getBoundingClientRect(){return {...this.rect}}}));
  const animations=[],patches=[],attributes=new Map(),rowAnimations=new Set();
  const list={hasChildNodes:()=>blocks.length>0,setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k)};
  const context=vm.createContext({listRevision:0,scale:1,motion:{matches:reduced},rowAnimations,
    $:()=>list,listHTML:()=>JSON.stringify(wanted),nodeKey:el=>el.key,listBlocks:root=>root.blocks,
    document:{createElement:()=>({content:{},set innerHTML(html){this.content.blocks=JSON.parse(html).map(key=>({key}))}})},
    visibleBlock:()=>true,numberSnapshot:()=>new Map(),getComputedStyle:el=>({opacity:String(el.opacity)}),
    blockSnapshot:()=>new Map(blocks.map(el=>[el.key,{el,rect:{...el.rect},opacity:el.opacity,parentKey:null}])),
    cancelRowMotion:keep=>{[...rowAnimations].forEach(a=>{if(!keep||!keep.has(a.effect.target)||a.retiring){a.cancel();rowAnimations.delete(a)}})},
    trackRowAnimation:(el,frames,options,hold=false)=>{
      let resolve,reject,pending=true;
      const a={el,effect:{target:el},retiring:hold,frames,options,cancelled:false,finished:new Promise((yes,no)=>{resolve=yes;reject=no}),
        finish(){if(pending){pending=false;el.opacity=0;resolve()}},
        cancel(){this.cancelled=true;el.opacity=1;if(pending){pending=false;const error=new Error('cancelled');error.name='AbortError';reject(error)}}};
      a.finished.catch(()=>{});animations.push(a);rowAnimations.add(a);return a;
    },
    viewEase:'cubic-bezier(.4,0,.6,1)',
    patchList:(html,animate,before)=>{const next=JSON.parse(html);patches.push({keys:next,animate,before});blocks.forEach(el=>{el.isConnected=next.includes(el.key)});blocks=next.map(key=>blocks.find(el=>el.key===key)||{key,isConnected:true,inert:false})}
  });
  vm.runInContext(renderer,context);
  return {context,animations,patches,attributes,render:context.renderList,setKeys:keys=>{wanted=keys},blocks:()=>blocks};
}
test('full panel script parses; range changes keep expansion and do not scroll the viewport',()=>{
  new vm.Script(panel.match(/<script>([\s\S]*?)<\/script>/)[1]);
  const range=panel.match(/initTabs\('rangeTabs',[\s\S]*?(?=initTabs\('dimensionTabs')/)[0];
  assert.ok(!range.includes('expanded=null'));
  assert.ok(!renderer.includes('list.animate(')&&!renderer.includes('cloneNode'));
  assert.match(panel,/delay:Math\.min\(entering\+\+\*45,160\)/);
  assert.match(panel,/duration:320/);assert.match(panel,/duration:220/);
  assert.match(panel,/viewEase='cubic-bezier\(\.4,0,\.6,1\)'/);
});
test('retained identities go directly to keyed update, never sink out on range or refresh',async()=>{
  const f=fixture(),codex=f.blocks()[0];await f.render();
  assert.equal(f.animations.length,0);assert.equal(f.patches.length,1);assert.equal(f.blocks()[0],codex);
  await f.render();assert.equal(f.animations.length,0);
});
test('only missing blocks retire; retained block waits for removal then updates',async()=>{
  const f=fixture(),codex=f.blocks()[0];f.setKeys(['cli:codex','cli:opencode']);const done=f.render();
  assert.equal(f.animations.length,1);assert.equal(f.animations[0].el.key,'cli:claude');assert.equal(f.patches.length,0);
  assert.equal(f.animations[0].frames[1].transform,'translateY(18px)');
  f.animations[0].finish();await done;
  assert.equal(f.blocks()[0],codex);assert.deepEqual(f.patches[0].keys,['cli:codex','cli:opencode']);assert.equal(f.attributes.has('aria-busy'),false);
});
test('Agent and model are separate identities; each outgoing block has its own stagger',async()=>{
  const f=fixture();f.setKeys(['model:gpt','model:claude']);const done=f.render();
  assert.equal(f.animations.length,2);assert.equal(f.animations[0].options.delay,0);assert.equal(f.animations[1].options.delay,30);
  f.animations[0].finish();await settle();assert.equal(f.patches.length,0);
  f.animations[1].finish();await done;assert.ok(f.blocks().every(el=>el.key.startsWith('model:')));
});
test('reorder keeps identities and hands previous positions to layout animation',async()=>{
  const f=fixture(),codex=f.blocks()[0],claude=f.blocks()[1];f.setKeys(['cli:claude','cli:codex']);await f.render();
  assert.equal(f.animations.length,0);assert.equal(f.blocks()[0],claude);assert.equal(f.blocks()[1],codex);
  assert.equal(f.patches[0].before.get('cli:codex').rect.top,0);
});
test('rapid reversal cancels obsolete retirement and preserves the still-visible objects',async()=>{
  const f=fixture(),codex=f.blocks()[0];f.setKeys(['model:gpt']);const first=f.render();
  f.setKeys(['cli:codex','cli:claude']);await f.render();await first;
  assert.equal(f.animations[0].cancelled,true);assert.equal(f.blocks()[0],codex);assert.equal(f.attributes.has('aria-busy'),false);
});

test('a retained block keeps moving while its neighbour exits, then rebases from its current position',async()=>{
  const f=fixture(),codex=f.blocks()[0];
  const moving=f.context.trackRowAnimation(codex,[],{duration:360});
  f.setKeys(['cli:codex']);const done=f.render();
  assert.equal(moving.cancelled,false);
  codex.rect.top=23;codex.rect.bottom=103;
  f.animations[1].finish();await done;
  assert.equal(moving.cancelled,true);
  assert.equal(f.patches[0].before.get('cli:codex').rect.top,23);
});
test('reduced motion bypasses retirement and immediately reconciles',async()=>{
  const f=fixture(undefined,true);f.setKeys(['model:gpt']);await f.render();
  assert.equal(f.animations.length,0);assert.equal(f.patches[0].animate,false);
});
test('interrupted summary counter continues from its displayed value, not previous target',()=>{
  const frames=new Map(),elements={total:{},cost:{}};let now=0,id=0;
  const context=vm.createContext({numberFrame:0,motion:{matches:false},performance:{now:()=>now},$ : key=>elements[key],fmt:value=>String(value),cancelAnimationFrame:key=>frames.delete(key),requestAnimationFrame:callback=>{frames.set(++id,callback);return id}});
  vm.runInContext(panel.match(/let displayedSummary=null,displayedChart=\[\];[\s\S]*?(?=\nconst canvas=)/)[0],context);
  function frame(time){now=time;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(time))}
  context.animateNumbers(null,{tokens:100,cost:1});frame(0);assert.equal(elements.total.textContent,'100');
  context.animateNumbers({tokens:100,cost:1},{tokens:200,cost:2});frame(180);assert.equal(elements.total.textContent,'150');
  context.animateNumbers({tokens:200,cost:2},{tokens:300,cost:3});frame(180);assert.equal(elements.total.textContent,'150');frame(540);assert.equal(elements.total.textContent,'300');
});
