import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../public/desk-assets/physics.mjs";

const make=(extra={})=>{
  const world=createWorld({gravity:1000,fixedDt:1/120});
  const body=world.add({character:true,x:0,y:-50,vx:0,vy:0,
    halfW:10,halfH:50,floor:0,mass:1,strength:1,grounded:true,supportId:"floor",...extra});
  return {world,body,run(seconds,dt=1/60){for(let i=0;i<Math.ceil(seconds/dt);i++)world.step(dt)}};
};

test("character root accelerates, brakes at its target and records real distance",()=>{
  const {world,body,run}=make();
  world.moveCharacter(body,100,{maxSpeed:180,acceleration:600});
  run(2);
  assert.ok(Math.abs(body.x-100)<1,"x="+body.x);
  assert.ok(body.distanceTravelled>=99);
  assert.equal(body.grounded,true);
});

test("gravity lands the character on a platform and tracks its support id",()=>{
  const {world,body,run}=make({x:140,y:-250,grounded:false,supportId:null});
  world.setPlatforms([{id:"ledge",left:100,right:200,top:-200,bottom:0}]);
  body.vy=400;
  run(.5);
  assert.equal(body.grounded,true);
  assert.equal(body.supportId,"ledge");
  assert.equal(body.y,-250);
});

test("jump applies a ballistic impulse and returns to floor support",()=>{
  const {world,body,run}=make({gravity:1000});
  assert.equal(world.jumpCharacter(body,{height:120,horizontal:30}),true);
  assert.equal(body.grounded,false);
  run(1.2);
  assert.equal(body.grounded,true);
  assert.equal(body.supportId,"floor");
  assert.equal(body.y,-50);
  assert.ok(body.x>0);
});

test("platform underside blocks upward movement",()=>{
  const {world,body,run}=make({x:140,y:60,floor:300,grounded:false,supportId:null,vy:-700});
  world.setPlatforms([{id:"ledge",left:100,right:200,top:-200,bottom:0}]);
  run(.5);
  assert.ok(body.y>=50,"passed through underside, centre y="+body.y);
});

test("solid platform side blocks horizontal travel",()=>{
  const {world,body,run}=make();
  world.setPlatforms([{id:"wall",left:100,right:200,top:-200,bottom:0}]);
  world.moveCharacter(body,180,{maxSpeed:180,acceleration:800});
  run(2);
  assert.ok(body.x<=90.01,"passed through wall at "+body.x);
});

test("a reachable ledge grip drives a weighted mantle onto the platform",()=>{
  const {world,body,run}=make({x:.7,y:-.2,halfW:.1,halfH:.2,mass:.8,strength:1,gravity:8});
  world.setPlatforms([{id:"ledge",left:1,right:2,top:-.8,bottom:0}]);
  assert.equal(world.grabCharacter(body,{id:"ledge",x:1,y:-.8},{side:-1,reach:1.8}),true);
  assert.equal(world.climbCharacter(body,{x:1.4,feetY:-.8},{strength:1,load:.5,maxAcceleration:24}),true);
  run(3);
  assert.equal(body.supportId,"ledge","x="+body.x+" y="+body.y+" vx="+body.vx+" vy="+body.vy+" gripFailed="+body.gripFailed);
  assert.equal(body.grip,null);
  assert.ok(body.x>1,"body never cleared the ledge edge: x="+body.x+" y="+body.y+" vx="+body.vx+" vy="+body.vy);
});

test("out-of-reach ledge anchors are rejected",()=>{
  const {world,body}=make();
  assert.equal(world.grabCharacter(body,{id:"far",x:1000,y:-1000},{reach:80}),false);
  assert.equal(body.grip,null);
});

test("releasing a grip returns the character to gravity and floor support",()=>{
  const {world,body,run}=make({x:140,y:-250,grounded:false,supportId:null});
  world.setPlatforms([]);
  world.releaseGrip(body);
  run(1);
  assert.equal(body.grounded,true);
  assert.equal(body.supportId,"floor");
  assert.equal(body.y,-50);
});

test("a grip releases after sustained load exceeds its force capacity",()=>{
  const {world,body,run}=make({gravity:8,mass:1,strength:1,halfW:.1,halfH:.2,y:-.2});
  assert.equal(world.grabCharacter(body,{id:"ledge",x:0,y:-.2},{reach:.4,strength:1,load:1}),true);
  run(.5);
  assert.equal(body.grip,null);
  assert.equal(body.gripFailed,true);
});

test("ledge grip respects the supplied world-space arm reach",()=>{
  const {world,body}=make({x:0,y:0,halfW:.1,halfH:.2});
  assert.equal(world.grabCharacter(body,{id:"far",x:5,y:-5},{reach:.4}),false);
  assert.equal(body.grip,null);
});

test("grip releases after the shoulder remains outside the world-space reach envelope",()=>{
  const {world,body,run}=make({x:0,y:-.2,halfW:.1,halfH:.2,gravity:8});
  assert.equal(world.grabCharacter(body,{id:"ledge",x:0,y:-.8},{reach:.5}),true);
  assert.equal(world.climbCharacter(body,{x:0,feetY:-.8},{strength:1,load:0,maxAcceleration:24}),true);
  body.x=2;
  run(.5);
  assert.equal(body.grip,null);
  assert.equal(body.gripFailed,true);
});

test("a character is not supported while it is still above a platform top",()=>{
  const {world,body}=make({x:150,y:-.5,halfW:10,halfH:.2,floor:0,grounded:false,supportId:null});
  world.setPlatforms([{id:"ledge",left:100,right:200,top:-1,bottom:0,solidSides:false}]);
  world.step(1/120);
  assert.equal(body.grounded,false);
  assert.equal(body.supportId,null);
});

test("carried load reduces attainable motor speed",()=>{
  const a=make(),b=make();
  a.world.moveCharacter(a.body,1000,{maxSpeed:180,acceleration:900,strength:1,load:0});
  b.world.moveCharacter(b.body,1000,{maxSpeed:180,acceleration:900,strength:1,load:1});
  a.run(.5);b.run(.5);
  assert.ok(a.body.x>b.body.x,"unloaded="+a.body.x+", loaded="+b.body.x);
});


test("grip stores a normalized world-space surface normal",()=>{
  const {world,body}=make({x:0,y:-50,halfW:10,halfH:50});
  assert.equal(world.grabCharacter(body,{id:"wall",x:10,y:-50,normal:{x:3,y:-4,z:0}},{reach:20}),true);
  assert.deepEqual(body.grip.normal,{x:0.6,y:-0.8,z:0});
});
