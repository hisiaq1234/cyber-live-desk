import test from "node:test";
import assert from "node:assert/strict";
import { createCharacterMotor } from "../public/desk-assets/character-motor.mjs";

const floor=500;
const platform={id:"ledge",left:300,right:520,top:250,bottom:floor};
const run=(motor,seconds,dt=1/60)=>{for(let t=0;t<seconds;t+=dt)motor.step(dt)};

test("the motor accelerates toward a target, brakes, and measures travelled distance",()=>{
  const m=createCharacterMotor({gravity:1000});
  m.setScene({floor,platforms:[]});
  m.reset({x:100,feetY:floor,width:40,height:100});
  m.moveTo(250,{maxSpeed:180,acceleration:600});
  run(m,2);
  const s=m.snapshot();
  assert.ok(Math.abs(s.x-250)<1,"stopped at "+s.x);
  assert.ok(s.distance>140);
  assert.equal(s.grounded,true);
});

test("a jump clears a platform wall and lands on its actual top",()=>{
  const m=createCharacterMotor({gravity:1000});
  m.setScene({floor,platforms:[platform]});
  m.reset({x:270,feetY:floor,width:40,height:100});
  assert.equal(m.jump({height:300}),true);
  m.moveTo(410,{maxSpeed:180,acceleration:900});
  run(m,2);
  const s=m.snapshot();
  assert.equal(s.supportId,"ledge");
  assert.equal(s.feetY,platform.top);
});

test("a walking body cannot pass through a solid platform wall",()=>{
  const m=createCharacterMotor({gravity:1000});
  m.setScene({floor,platforms:[platform]});
  m.reset({x:260,feetY:floor,width:40,height:100});
  m.moveTo(450,{maxSpeed:240,acceleration:1200});
  run(m,1);
  assert.ok(m.snapshot().x<=platform.left-20+.01,"crossed wall at "+m.snapshot().x);
});

test("a ledge grip drives a weighted mantle and remains world-anchored",()=>{
  const m=createCharacterMotor({gravity:1000});
  m.setScene({floor,platforms:[platform]});
  m.reset({x:270,feetY:floor,width:40,height:100,mass:.9,strength:.9});
  m.grab({id:"ledge",x:300,y:250,side:1});
  m.climbTo({x:410,feetY:250,strength:.9,load:.4});
  run(m,2);
  const s=m.snapshot();
  assert.equal(s.supportId,"ledge");
  assert.deepEqual(s.grip,{id:"ledge",x:300,y:250,side:1});
  assert.ok(s.x>platform.left+20);
});

test("releasing a grip lets gravity carry him back to the floor",()=>{
  const m=createCharacterMotor({gravity:1000});
  m.setScene({floor,platforms:[platform]});
  m.reset({x:400,feetY:platform.top,width:40,height:100});
  m.actor.vy=-100;
  m.grab({id:"ledge",x:300,y:250});
  m.releaseGrip();
  run(m,2);
  assert.equal(m.snapshot().supportId,"floor");
  assert.equal(m.snapshot().feetY,floor);
  assert.equal(m.snapshot().grip,null);
});

test("removing a platform removes support and the actor falls",()=>{
  const m=createCharacterMotor({gravity:1000});
  m.setScene({floor,platforms:[platform]});
  m.reset({x:400,feetY:platform.top,width:40,height:100});
  m.setScene({floor,platforms:[]});
  m.step(1/60);
  assert.equal(m.snapshot().grounded,false);
  run(m,1);
  assert.equal(m.snapshot().supportId,"floor");
});
