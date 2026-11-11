import test from "node:test";
import assert from "node:assert/strict";

class FakeEl {
  constructor(tag){this.tagName=tag;this.attrs={};this.children=[];this.dataset={};this.textContent="";
    this.offsetWidth=0;this.isConnected=true;const c=new Set();
    this.classList={add:(...x)=>x.forEach(v=>c.add(v)),remove:(...x)=>x.forEach(v=>c.delete(v)),
      contains:v=>c.has(v),[Symbol.iterator]:()=>c[Symbol.iterator]()};
    this.style={setProperty:(k,v)=>{this.style[k]=v},removeProperty:k=>{delete this.style[k]}};}
  setAttribute(k,v){this.attrs[k]=String(v)} setAttributeNS(n,k,v){this.attrs[k]=String(v)}
  getAttribute(k){return this.attrs[k]??null} removeAttribute(k){delete this.attrs[k]}
  append(...k){for(const x of k)if(x){x.parent=this;this.children.push(x)}}
  addEventListener(){} removeEventListener(){} querySelector(){return null}
  remove(){this.isConnected=false}
  getBoundingClientRect(){return{left:0,top:0,right:100,bottom:100,width:100,height:100}}
}
function dom(){
  const root=new FakeEl("body");
  globalThis.document={head:new FakeEl("head"),body:root,documentElement:new FakeEl("html"),
    createElement:t=>new FakeEl(t),createElementNS:(n,t)=>new FakeEl(t),getElementById:()=>null};
  globalThis.Image=class{set src(v){this._src=v}};
  globalThis.matchMedia=q=>({media:q,matches:false,addEventListener(){},removeEventListener(){}});
  globalThis.innerWidth=1920; globalThis.innerHeight=1080; return root;
}
const { createCridBot } = await import("../public/desk-assets/crid-bot.js");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// Collect every transform attribute in the tree, keyed by class, so we can see the joints move.
function joints(el){
  const out={}; const walk=n=>{ if(!n)return;
    const cls=n.attrs&&n.attrs.class; if(cls&&/^joint-/.test(cls)) out[cls]=n.attrs.transform||"";
    (n.children||[]).forEach(walk); }; walk(el); return out;
}
function rigVisible(el){
  let vis=null; const walk=n=>{ if(!n)return;
    if(n.attrs&&n.attrs.class==="rig") vis=n.attrs.display; (n.children||[]).forEach(walk); }; walk(el); return vis;
}

test("the rig is mounted and visible at rest, not only mid-stride (living idle, base body 000)", async () => {
  const bot=createCridBot({root:dom(),step:12,position:"bc"});
  bot.observe({bot:{on:true}});
  await sleep(60);
  assert.equal(rigVisible(bot.el),"", "the rig group must be displayed while he is standing still");
  assert.equal(bot.stage.key,"000", "base body stage is the only articulated rig");
  bot.destroy();
});

test("idle is a living hold (subtle weight/arm movement), not a frozen frame", async () => {
  const bot=createCridBot({root:dom(),step:12,position:"bc"});
  bot.observe({bot:{on:true}});
  await sleep(60);
  const a=joints(bot.el);
  assert.ok(Object.keys(a).length>=8, "all eight joints must exist");
  await sleep(400);
  const b=joints(bot.el);
  const moved=Object.keys(a).filter(k=>a[k]!==b[k]);
  assert.ok(moved.length>0, `at rest the joints must still move (weight shift/arms); none of ${Object.keys(a).length} changed`);
  bot.destroy();
});

test("turning Crid off plays dying transition, stops rig/idle, applies dead treatment, and returns correctly", async () => {
  const bot=createCridBot({root:dom(),step:12,position:"bc"});
  bot.observe({bot:{on:true}}); await sleep(80);
  bot.observe({bot:{on:false}}); await sleep(30);
  // Dying transition: visible immediately (not the final dead pose), rig hidden so flat drawing shows.
  assert.equal(bot.el.dataset.mode,"dying","dying transition must be visible on the rendered character");
  assert.equal(rigVisible(bot.el),"none","idle rig must stop during dying");
  // After die sequence completes he is dead, rig remains off and limbs do not animate.
  await sleep(1500);
  assert.equal(bot.mode,"dead");
  assert.equal(bot.el.dataset.mode,"dead","final dead mode visible on rendered character");
  assert.equal(rigVisible(bot.el),"none","idle rig must stay off while dead");
  const d=joints(bot.el); await sleep(300); const e=joints(bot.el);
  assert.deepEqual(Object.keys(d).filter(k=>d[k]!==e[k]), [], "limbs must not move while dead");
  // Returns correctly when turned on.
  bot.observe({bot:{on:true}}); await sleep(100);
  assert.equal(bot.mode,"on");
  assert.equal(bot.el.dataset.mode,"on");
  assert.equal(rigVisible(bot.el),"", "rig returns for base body when back on");
  bot.destroy();
});
