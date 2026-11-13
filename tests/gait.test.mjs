import test from "node:test";
import assert from "node:assert/strict";
import { createDistanceGait } from "../public/desk-assets/gait.mjs";

test("gait phase advances from distance, not elapsed time",()=>{
  const a=createDistanceGait(),b=createDistanceGait();
  const one=a.update(0,1,true);
  const two=a.update(.4,1,true);
  b.update(0,1,true);
  b.update(.1,1,true);
  const three=b.update(.4,1,true);
  assert.equal(one.phase,0);
  assert.equal(two.phase,three.phase);
  assert.equal(two.phase,.4);
});

test("walking keeps a longer planted stance and alternates the feet",()=>{
  const gait=createDistanceGait({dutyFactor:.62});
  const s=gait.update(0,1,true);
  assert.equal(s.left.stance,true);
  assert.equal(s.right.stance,true);
  const mid=gait.update(.4,1,true);
  assert.equal(mid.left.stance,true);
  assert.equal(mid.right.stance,false);
  assert.ok(mid.right.swing>0);
  assert.ok(mid.left.swing===0);
});

test("liftoff and touchdown are emitted on actual phase boundaries",()=>{
  const gait=createDistanceGait({dutyFactor:.62});
  gait.update(0,1,true);
  const first=gait.update(.7,1,true);
  assert.ok(first.events.some(e=>e.side==="left"&&e.type==="liftoff"));
  assert.ok(first.events.some(e=>e.side==="right"&&e.type==="touchdown"));
  const next=gait.update(1.1,1,true);
  assert.ok(next.events.some(e=>e.side==="left"&&e.type==="touchdown"));
});

test("paused or externally animated movement does not advance physical gait",()=>{
  const gait=createDistanceGait();
  gait.update(0,1,true);
  const paused=gait.update(.4,1,false);
  const resumed=gait.update(.5,1,true);
  assert.equal(paused.phase,0);
  assert.ok(Math.abs(resumed.phase-.1)<1e-9);
  assert.deepEqual(paused.events,[]);
});

test("changing stride length does not jump the phase",()=>{
  const gait=createDistanceGait();
  gait.update(0,1,true);
  const a=gait.update(.25,1,true);
  const b=gait.update(.30,.5,true);
  assert.equal(a.phase,.25);
  assert.ok(Math.abs(b.phase-.35)<1e-9);
});
