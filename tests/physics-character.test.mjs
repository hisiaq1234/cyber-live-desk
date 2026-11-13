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

test("platform underside blocks upward movement",()=>{
  const {world,body,run}=make({x:140,y:60,grounded:false,supportId:null,vy:-700});
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
  const {world,body,run}=make({x:70,y:-50,gravity:8});
  world.setPlatforms([{id:"ledge",left:100,right:200,top:-200,bottom:0}]);
  assert.equal(world.grabCharacter(body,{id:"ledge",x:100,y:-200},{side:-1,reach:180}),true);
  assert.equal(world.climbCharacter(body,{x:140,feetY:-200},{strength:1,load:.5}),true);
  run(2);
  assert.equal(body.supportId,"ledge");
  assert.equal(body.grip.id,"ledge");
  assert.ok(body.x>100);
});

test("out-of-reach ledge anchors are rejected",()=>{
  const {world,body}=make();
  assert.equal(world.grabCharacter(body,{id:"far",x:1000,y:-1000},{reach:80}),false);
  assert.equal(body.grip,null);
});

test("releasing a grip returns the character to gravity and floor support",()=>{
  const {world,body,run}=make({x:140,y:-250,grounded:true,supportId:"ledge"});
  world.setPlatforms([{id:"ledge",left:100,right:200,top:-200,bottom:0}]);
  world.releaseGrip(body);
  run(1);
  assert.equal(body.grounded,true);
  assert.equal(body.supportId,"floor");
  assert.equal(body.y,-50);
});

test("carried load reduces attainable motor speed",()=>{
  const a=make(),b=make();
  a.world.moveCharacter(a.body,1000,{maxSpeed:180,acceleration:900,strength:1,load:0});
  b.world.moveCharacter(b.body,1000,{maxSpeed:180,acceleration:900,strength:1,load:1});
  a.run(.5);b.run(.5);
  assert.ok(a.body.x>b.body.x,"unloaded="+a.body.x+", loaded="+b.body.x);
});
