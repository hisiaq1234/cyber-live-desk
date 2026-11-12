// The drive model behind "he walks the floor because his own boredom says so".
// See docs/specs/behaviour-drives.md §3 (drives), §4 (scoring), §13 slice 1.
import test from "node:test";
import assert from "node:assert/strict";

import { createBeing, seeded } from "../public/desk-assets/being.mjs";

const close = (a, b, tol = 0.01) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a));

test("drives move at the same rate whatever the tick size", () => {
  // 60 steps of 1 s and 20 steps of 3 s must agree a minute later (§2). Decisions are pushed out
  // of the window so this measures the decay alone — the 1.5 s decision gate is deliberately
  // tick-granular, and the spec's test is about the rates.
  const fine = createBeing({ now: 0, rng: seeded(3), cooldownMs: 1e9, settleMs: 1e9 });
  const coarse = createBeing({ now: 0, rng: seeded(3), cooldownMs: 1e9, settleMs: 1e9 });
  let a, b;
  for (let i = 1; i <= 60; i++) a = fine.step(i * 1000);
  for (let i = 1; i <= 20; i++) b = coarse.step(i * 3000);
  assert.ok(close(a.drives.energy, b.drives.energy), `energy ${a.drives.energy} vs ${b.drives.energy}`);
  assert.ok(close(a.drives.boredom, b.drives.boredom), `boredom ${a.drives.boredom} vs ${b.drives.boredom}`);
  assert.ok(close(a.drives.attention, b.drives.attention), `attention ${a.drives.attention} vs ${b.drives.attention}`);
});

test("a bored Crid decides to walk the floor, and walks somewhere else", () => {
  const being = createBeing({ now: 0, rng: seeded(11) });
  let walked = null;
  for (let i = 1; i <= 120 && !walked; i++) {
    const plan = being.step(i * 100);
    if (plan.intent.key === "wander") walked = plan.intent;
  }
  assert.ok(walked, "with boredom at 70 he must start a wander within 12 s");
  assert.ok(Math.abs(walked.x - 0.5) > 0.2, `a wander has to cross the floor, target was ${walked.x}`);
});

test("starting an activity takes about 45 off his boredom", () => {
  const being = createBeing({ now: 0, rng: seeded(5) });
  let before = null;
  let after = null;
  let lastKey = null;
  for (let i = 1; i <= 200 && after === null; i++) {
    const plan = being.step(i * 100);
    if (plan.intent.key && plan.intent.key !== lastKey) {
      after = plan.drives.boredom;
      lastKey = plan.intent.key;
    } else if (!plan.intent.key) {
      before = plan.drives.boredom;
      lastKey = null;
    }
  }
  assert.ok(before !== null && after !== null, "he should have started something");
  assert.ok(after - before < -40, `boredom should drop ~45 on a start, went ${before} → ${after}`);
});

test("he does not repeat himself back to back", () => {
  const being = createBeing({ now: 0, rng: seeded(21) });
  const order = [];
  let last = null;
  for (let i = 1; i <= 1800; i++) {
    const plan = being.step(i * 1000);          // half an hour of standing around
    const key = plan.intent.key;
    if (key && key !== last) order.push(key);
    last = key;
  }
  assert.ok(order.length >= 4, `expected a few activities in 30 min, got ${order.join(",")}`);
  for (let i = 1; i < order.length; i++) {
    assert.notEqual(order[i], order[i - 1], `he repeated ${order[i]} back to back (${order.join(",")})`);
  }
  assert.ok(order.includes("wander"), "he has to walk the floor at some point");
});

test("a spent body only rests", () => {
  const being = createBeing({ now: 0, rng: seeded(9), drives: { energy: 12, boredom: 90 } });
  const keys = new Set();
  let last = null;
  for (let i = 1; i <= 600; i++) {
    const plan = being.step(i * 1000);
    if (plan.intent.key && plan.intent.key !== last) keys.add(plan.intent.key);
    last = plan.intent.key;
  }
  assert.deepEqual([...keys], ["rest"], `energy 12 leaves only rest eligible, he did ${[...keys].join(",")}`);
});

test("the same seed lives the same life", () => {
  const run = (seed) => {
    const being = createBeing({ now: 0, rng: seeded(seed) });
    const out = [];
    for (let i = 1; i <= 300; i++) {
      const plan = being.step(i * 500);
      out.push(`${plan.intent.key}:${plan.intent.x}:${plan.drives.boredom}`);
    }
    return out.join("|");
  };
  assert.equal(run(4), run(4));
  assert.notEqual(run(4), run(5));
});

test("a long gap does not teleport his state", () => {
  const being = createBeing({ now: 0, rng: seeded(2) });
  being.step(1000);
  const plan = being.step(1000 + 60 * 60 * 1000);     // an hour in one step
  for (const v of Object.values(plan.drives)) {
    assert.ok(Number.isFinite(v), `drive went non-finite: ${JSON.stringify(plan.drives)}`);
    assert.ok(v >= 0 && v <= 100, `drive left its range: ${v}`);
  }
});
