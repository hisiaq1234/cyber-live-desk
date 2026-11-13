// The staging machine ported off crid3d.html: walk to a panel, climb it, stand on it, get off.
// See public/desk-assets/stage.mjs and docs/specs/physics.md §2 / behaviour-drives.md §9.
import test from "node:test";
import assert from "node:assert/strict";

import { createStage, stageChannels, TRANSIENT } from "../public/desk-assets/stage.mjs";

// A desk in world units: one climbable panel on the right, one leanable on the left.
const BOXES = {
  "panel-r": { left: 2, right: 3, top: 0.8, w: 1, h: 0.8, z: 0 },
  "panel-l": { left: -3, right: -2, top: 0.7, w: 1, h: 0.7, z: 0 },
};
const TARGETS = { lean: ["panel-r", "panel-l"], sit: ["panel-r", "panel-l"], climb: ["panel-r"] };

function makeStage(over = {}) {
  const interrupts = [];
  const stage = createStage({
    targets: () => TARGETS,
    boxes: BOXES,
    unit: () => 100,
    worldX: (px) => px / 100,
    screenWidth: 1920,
    rand: () => 0.99,
    mass: 1,
    bagOn: () => false,
    onInterrupt: (r) => interrupts.push(r),
    canCompleteClimb: s => s.grounded && s.supportId === s.layer,
    canCompleteHop: s => s.grounded && s.supportId === s.layer,
    canCompleteDrop: s => s.grounded && s.supportId === "floor",
    ...over,
  });
  return { stage, interrupts };
}

// Deterministic test motor: only it moves the root and reports contacts.
function motorStep(stage, dt) {
  if (stage.walking && ["approach", "floor", "top"].includes(stage.state)) {
    const d = stage.targetX - stage.walkX;
    stage.walkX += Math.sign(d) * Math.min(Math.abs(d), 0.42 * dt);
  }
  if (stage.state === "pull") {
    if (stage.t + dt >= 0.75) {
      stage.walkX = stage.lipX; stage.groundY = stage.topY;
      stage.grounded = true; stage.supportId = stage.layer;
    } else { stage.grounded = false; stage.supportId = null; }
  }
  if (stage.state === "hop") {
    if (stage.t + dt >= 0.55) {
      stage.walkX = stage.lipX; stage.groundY = stage.topY;
      stage.grounded = true; stage.supportId = stage.layer;
    } else { stage.grounded = false; stage.supportId = null; }
  }
  if (["slip", "drop", "hop-down"].includes(stage.state)) {
    const contactAt = stage.state === "slip" ? 0.8 : stage.state === "drop" ? 0.4 : 0.5;
    if (stage.t + dt >= contactAt) {
      stage.walkX = stage.fromX; stage.groundY = 0;
      stage.grounded = true; stage.supportId = "floor";
    } else { stage.grounded = false; stage.supportId = null; }
  }
}

function drive(stage, intent, seconds, dt = 0.05) {
  const seen = [];
  let now = 0;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    now += dt * 1000;
    motorStep(stage, dt);
    stage.step(now, intent, dt);
    seen.push(stage.state);
  }
  return seen;
}

function driveUntil(stage, intent, predicate, seconds, dt = 0.05) {
  let now = 0;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    now += dt * 1000;
    motorStep(stage, dt);
    stage.step(now, intent, dt);
    if (predicate(stage)) return;
  }
  throw new Error("stage did not reach expected state before timeout");
}

const climbIntent = { key: "climb", phase: "start", layer: "panel-r", x: 0.5 };

test("a climb walks approach → reach → pull → top → crouch → drop → settle → floor", () => {
  const { stage, interrupts } = makeStage();
  const a = drive(stage, climbIntent, 8);                          // up and on top
  const b = drive(stage, { key: "climb", phase: "end", layer: "panel-r", x: 0.5 }, 8);
  const seen = [...a, ...b];
  const order = ["approach", "reach", "pull", "top", "crouch", "drop", "settle", "floor"];
  let at = -1;
  for (const s of order) {
    const i = seen.indexOf(s, at + 1);
    assert.ok(i > at, `never saw ${s} after ${seen.slice(at + 1, at + 6).join(",")}`);
    at = i;
  }
  assert.equal(stage.state, "floor");
  assert.equal(stage.groundY, 0);
  assert.equal(stage.walkX, stage.fromX);                        // the drop lands at the stand point
  assert.deepEqual(interrupts, [], "a clean climb interrupts nothing");
});

test("he stands on the panel during 'top' and the trace says done", () => {
  const { stage } = makeStage();
  // walk up to the top, then let the hold run out with the same intent still going
  drive(stage, climbIntent, 8);
  assert.equal(stage.state, "top");
  assert.equal(stage.groundY, 0.8);
  assert.ok(stage.surface && stage.surface.name === "panel-r");
  drive(stage, { key: "climb", phase: "end", layer: "panel-r", x: 0.5 }, 4);
  assert.equal(stage.state, "floor");
  assert.equal(stage.trace, "climb · done");
});


test("a climb waits for the physics motor to confirm platform support",()=>{
  let supported=false;
  const {stage}=makeStage({canCompleteClimb:()=>supported,canCompleteDrop:()=>false});
  driveUntil(stage,climbIntent,s=>s.state==="pull"&&s.t>=0.5,12);
  assert.equal(stage.state,"pull");
  supported=true;
  drive(stage,climbIntent,1);
  assert.equal(stage.state,"top");
});

test("a drop waits for the physics motor to confirm floor landing",()=>{
  let onFloor=false;
  const {stage}=makeStage({canCompleteDrop:()=>onFloor});
  drive(stage,climbIntent,12);
  drive(stage,{key:"climb",phase:"end",layer:"panel-r",x:.5},8);
  assert.equal(stage.state,"drop");
  onFloor=true;
  drive(stage,{key:"climb",phase:"end",layer:"panel-r",x:.5},1);
  assert.equal(stage.state,"floor");
});

test("a physical slip stays in the slip state until the floor contact is real",()=>{
  let forceSlip=false,onFloor=false,now=0;
  const {stage}=makeStage({slip:()=>forceSlip,canCompleteDrop:()=>onFloor});
  for(let i=0;i<320&&stage.state!=="pull";i++){
    motorStep(stage,.05);now+=50;stage.step(now,climbIntent,.05);
  }
  assert.equal(stage.state,"pull");
  forceSlip=true;
  for(let i=0;i<20&&stage.state!=="slip";i++){
    motorStep(stage,.05);now+=50;stage.step(now,{...climbIntent,phase:"middle"},.05);
  }
  assert.equal(stage.state,"slip");
  for(let i=0;i<50;i++){
    motorStep(stage,.05);now+=50;stage.step(now,{...climbIntent,phase:"middle"},.05);
  }
  assert.equal(stage.state,"slip");
  onFloor=true;
  motorStep(stage,.05);now+=50;stage.step(now,{...climbIntent,phase:"middle"},.05);
  assert.equal(stage.state,"recover");
});

test("a slip slides him back down and interrupts once, with reason 'slip'", () => {
  const { stage, interrupts } = makeStage({ slip: () => true });
  // begin on the start beat, then keep the same activity in its middle so floor doesn't restart it
  stage.step(50, climbIntent, 0.05);
  const seen = drive(stage, { ...climbIntent, phase: "middle" }, 8);
  assert.ok(seen.includes("slip"), `no slip in ${[...new Set(seen)].join(",")}`);
  assert.ok(seen.includes("recover"), "a slip owes him the recover beat");
  assert.equal(stage.state, "floor");
  assert.deepEqual(interrupts, ["slip"]);
  assert.equal(stage.trace, "climb · abandoned (slip)");
});

test("lean-watch reaches 'lean' with a real roll, then pushes off when the intent ends", () => {
  const { stage } = makeStage();
  const lean = { key: "lean-watch", phase: "start", layer: "panel-l", x: 0.5 };
  drive(stage, lean, 8);                        // walk over, lean-in
  assert.equal(stage.state, "lean");
  assert.ok(Math.abs(stage.roll) > 0.15, `roll was ${stage.roll}`);
  assert.ok(stage.surface && stage.surface.name === "panel-l");
  // he stands on the panel's right edge, so the lean rolls him toward it: positive
  assert.ok(stage.roll > 0);
  drive(stage, { key: null, phase: null, x: 0.5, layer: null }, 5);
  assert.equal(stage.state, "floor");
  assert.equal(stage.roll, 0);
});

test("wander sets walking and a target inside the floor range", () => {
  const { stage } = makeStage({ boxes: {} });
  stage.step(0, { key: "wander", phase: "middle", x: 0.5, layer: null }, 0.05);
  assert.equal(stage.state, "floor");
  assert.equal(stage.walking, true);
  assert.equal(stage.trace, "wander");
  assert.ok(stage.targetX > 0, `targetX ${stage.targetX}`);
});

test("the intent moving on mid-activity finishes the sequence, not a cut", () => {
  const { stage } = makeStage();
  drive(stage, climbIntent, 8);
  assert.equal(stage.state, "top");
  const seen = drive(stage, { key: "rest", phase: "middle", x: 0.5, layer: null }, 8);
  // he still pays the off-it sequence: crouch → drop → settle before floor
  for (const s of ["crouch", "drop", "settle", "floor"]) {
    assert.ok(seen.includes(s), `missing ${s} in ${seen.join(",")}`);
  }
  assert.equal(stage.state, "floor");
  assert.equal(stage.trace, "climb · done");
});

test("a panel that vanishes under him abandons the stage and interrupts", () => {
  const boxes = { ...BOXES };
  const interrupts = [];
  const stage = createStage({
    targets: () => TARGETS,
    boxes,
    unit: () => 100,
    worldX: (px) => px / 100,
    screenWidth: 1920,
    rand: () => 0.99,
    mass: 1,
    bagOn: () => false,
    onInterrupt: (r) => interrupts.push(r),
  });
  drive(stage, climbIntent, 8);
  assert.equal(stage.state, "top");
  assert.ok(stage.surface);
  delete boxes["panel-r"];                     // the panel is gone
  // checkSurface is throttled to one read a second — step past it
  stage.step(9000, { key: "climb", phase: "middle", layer: "panel-r", x: 0.5 }, 0.05);
  stage.step(9100, { key: "climb", phase: "middle", layer: "panel-r", x: 0.5 }, 0.05);
  stage.step(10_000, { key: "climb", phase: "middle", layer: "panel-r", x: 0.5 }, 0.05);
  assert.deepEqual(interrupts, ["layer-gone"]);
  drive(stage, { key: "climb", phase: "middle", layer: "panel-r", x: 0.5 }, 4);
  assert.equal(stage.state, "floor");
  assert.equal(stage.groundY, 0);
  assert.equal(stage.trace, "climb · abandoned (layer-gone)");
});

test("TRANSIENT is the rig page's list", () => {
  assert.deepEqual(TRANSIENT, ["approach","reach","pull","crouch","drop","settle","lean-in","push-off","hop","hop-down","slip","recover"]);
});

test("stageChannels gives the reach its arms and the recover its crouch", () => {
  const { stage } = makeStage();
  // reach pose: arms up and forward
  const reach = { ...stage, state: "reach", t: 0.5 };
  const c1 = stageChannels(reach, 1);
  assert.ok(c1.armLiftL > 1 && c1.armFwdL > 0.2 && c1.kneeL > 0.2, JSON.stringify(c1));
  // slip pose: scrabbling legs and thrown-up arms
  const slip = { ...stage, state: "slip", t: 0.8, stumble: 0 };
  const c2 = stageChannels(slip, 1);
  assert.ok(c2.headPitch > 0 && c2.armLiftL > 1 && Math.abs(c2.legFwdL) > 0, JSON.stringify(c2));
  // recover pose: a crouch
  const rec = { ...stage, state: "recover", t: 1.0, stumble: 0 };
  const c3 = stageChannels(rec, 1);
  assert.ok(c3.kneeL > 0.2 && c3.leanFwd > 0.1, JSON.stringify(c3));
  // seat pose: folded legs
  const seat = { ...stage, state: "seat", t: 0.2, stumble: 0 };
  const c4 = stageChannels(seat, 1);
  assert.ok(c4.legFwdL > 1 && c4.kneeL > 1, JSON.stringify(c4));
  // a plain floor frame is all zeros
  const c0 = stageChannels({ ...stage, state: "floor", t: 0, stumble: 0 }, 1);
  for (const v of Object.values(c0)) assert.equal(v, 0);
});


test("a stalled climb times out to slip and waits for real floor contact",()=>{
  let onFloor=false;
  const {stage}=makeStage({canCompleteClimb:()=>false,canCompleteDrop:()=>onFloor});
  drive(stage,climbIntent,12);
  assert.equal(stage.state,"slip");
  onFloor=true;
  drive(stage,climbIntent,1.1);
  assert.equal(stage.state,"floor");
});

test("the stage planner never writes motor-owned root coordinates",()=>{
  const {stage}=makeStage();
  const x=stage.walkX,y=stage.groundY;
  stage.step(50,climbIntent,.05);
  assert.equal(stage.walkX,x);
  assert.equal(stage.groundY,y);
});
