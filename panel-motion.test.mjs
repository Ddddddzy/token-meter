import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const panel=fs.readFileSync(new URL('./panel.html',import.meta.url),'utf8');
const transition=panel.match(/let listRevision=0,listAnimation=null;[\s\S]*?(?=\nfunction toggleCLI)/)?.[0];
// Cross-realm Promise assimilation needs a full microtask checkpoint.
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(reduced=false){
  let next='model:gpt',html='agent:codex';
  const animations=[],attributes=new Map();
  const frame={style:{},getBoundingClientRect:()=>({height:180})};
  const list={parentElement:frame,inert:false,hasChildNodes:()=>Boolean(html),
    setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k),
    computed:{opacity:'1',transform:'none'},
    animate:(keyframes,options)=>{
      let resolve,reject,pending=true;
      const animation={keyframes,options,cancelled:false,
        finished:new Promise((yes,no)=>{resolve=yes;reject=no}),
        finish(){if(pending){pending=false;resolve()}},
        cancel(){this.cancelled=true;if(pending){pending=false;reject(new Error('cancelled'))}}
      };
      animations.push(animation);return animation;
    }
  };
  Object.defineProperty(list,'innerHTML',{get:()=>html,set:value=>{html=value}});
  const context=vm.createContext({$:()=>list,listHTML:()=>next,motion:{matches:reduced},getComputedStyle:()=>list.computed});
  assert.ok(transition,'whole-view transition must exist');
  vm.runInContext(transition,context);
  return {list,frame,animations,attributes,render:context.renderList,setNext:value=>{next=value}};
}
test('panel script parses; dimension switch does not morph rows or scroll the viewport',()=>{
  new vm.Script(panel.match(/<script>([\s\S]*?)<\/script>/)[1]);
  assert.ok(!transition.includes('cloneNode')&&!transition.includes('data-key'));
  const dimensionCallback=panel.match(/initTabs\('dimensionTabs',[\s\S]*?(?=\n)/)[0];
  assert.ok(!dimensionCallback.includes('scrollTo'));
});
test('old view sinks out before content replacement; new view floats up as one group',async()=>{
  const f=fixture(),done=f.render(true);
  assert.equal(f.list.innerHTML,'agent:codex');
  assert.equal(f.animations.length,1);
  const exit=f.animations[0];
  assert.equal(exit.keyframes[1].opacity,0);
  assert.equal(exit.keyframes[1].transform,'translateY(14px)');
  assert.equal(exit.options.duration,140);
  assert.equal(f.list.inert,true);
  exit.finish();await settle();
  assert.equal(f.list.innerHTML,'model:gpt');
  assert.equal(exit.cancelled,true);
  const enter=f.animations[1];
  assert.equal(enter.keyframes[0].opacity,0);
  assert.equal(enter.keyframes[0].transform,'translateY(14px)');
  assert.equal(enter.keyframes[1].transform,'translateY(0px)');
  assert.equal(enter.options.duration,210);
  enter.finish();await done;
  assert.equal(f.list.inert,false);assert.equal(f.frame.style.minHeight,'');
  assert.equal(f.attributes.has('aria-busy'),false);
});
test('rapid clicks cancel stale exits and keep only the newest view and cleanup',async()=>{
  const f=fixture(),first=f.render(true);
  f.setNext('agent:claude');const latest=f.render(true);
  assert.equal(f.animations[0].cancelled,true);
  f.animations[1].finish();await settle();
  assert.equal(f.list.innerHTML,'agent:claude');
  f.animations[2].finish();await Promise.all([first,latest]);
  assert.equal(f.list.inert,false);assert.equal(f.frame.style.minHeight,'');
});
test('reversing an entering view starts from its current presentation without row matching',async()=>{
  const f=fixture(),first=f.render(true);
  f.animations[0].finish();await settle();
  f.list.computed={opacity:'.4',transform:'matrix(1, 0, 0, 1, 0, 9)'};
  f.setNext('agent:codex');const latest=f.render(true);
  assert.equal(f.animations[1].cancelled,true);
  assert.equal(f.animations[2].keyframes[0].opacity,.4);
  f.animations[2].finish();await settle();
  f.animations[3].finish();await Promise.all([first,latest]);
  assert.equal(f.list.innerHTML,'agent:codex');assert.equal(f.list.inert,false);
});
test('reduced motion swaps immediately with no animation, ghost or locked height',async()=>{
  const f=fixture(true);await f.render(true);
  assert.equal(f.animations.length,0);assert.equal(f.list.innerHTML,'model:gpt');
  assert.equal(f.frame.style.minHeight,'');assert.equal(f.list.inert,false);
});
