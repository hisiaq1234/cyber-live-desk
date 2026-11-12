import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, GRAVITY } from "../public/desk-assets/physics.mjs";

const stepAll = (w, seconds, dt = 1 / 60) => {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) w.step(dt);
};

test("a dropped body accelerates under one gravity and lands on the floor", () => {
  const w = createWorld({ gravity: 1000 });
  const b = w.add({ x: 0, y: -500, vx: 0, vy: 0, mass: 1, floor: 0, halfH: 10 });
  stepAll(w, 2);
  assert.equal(b.y, -10);                    // bottom rests exactly on the floor
  assert.equal(b.vy, 0);                     // and it stays there — nothing floats, nothing sinks
  assert.ok(b.x === 0);
});

test("a bounce keeps only the restitution fraction of impact speed", () => {
  const w = createWorld({ gravity: 1000 });
  const b = w.add({ x: 0, y: -1000, vx: 0, vy: 0, mass: 1, restitution: .25, floor: 0, halfH: 0 });
  // Step until the floor catches him; the velocity going in is the impact, coming out the rebound.
  let impact = 0, rebound = null;
  for (let i = 0; i < 2000 && rebound === null; i++) {
    const vyIn = b.vy; w.step(1 / 120);
    if (b.y === 0 && vyIn > 0) { impact = vyIn; rebound = b.vy; }
  }
  assert.ok(impact > 0 && rebound !== null, "the body never reached the floor");
  assert.ok(Math.abs(rebound + (impact + 1000 / 120) * .25) < .5, `rebounded ${rebound} vs impact ${impact}`);
});

test("drag slows a sideways toss without touching the fall", () => {
  const w = createWorld({ gravity: 1000 });
  const b = w.add({ x: 0, y: -500, vx: 500, vy: 0, mass: 1, drag: 3, floor: 0, halfH: 10 });
  stepAll(w, 3);
  assert.ok(b.x > 0 && b.x < 500, `dragged body should travel less than 500px, got ${b.x}`);
  assert.equal(b.y, -10);
});

test("mass does not change the trajectory — only ratios matter", () => {
  const w = createWorld({ gravity: 1000 });
  const light = w.add({ x: 0, y: -300, vx: 40, vy: 0, mass: .5, floor: 0, halfH: 10 });
  const heavy = w.add({ x: 0, y: -300, vx: 40, vy: 0, mass: 8, floor: 0, halfH: 10 });
  stepAll(w, 1);
  assert.equal(light.x, heavy.x);
  assert.equal(light.y, heavy.y);
});

test("the default gravity is the spec's single value", () => {
  assert.equal(GRAVITY, 2400);
});
