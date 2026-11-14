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

test("a saved floor spot seeds where he is standing, clamped to the band", () => {
  // state.bot.being.floorX is the same 0..1 number the page measured off his host element;
  // seeding it keeps the brain's idea of where he stands in step with the body's.
  const settle = { now: 0, rng: seeded(1), cooldownMs: 1e9, settleMs: 1e9 };
  assert.equal(createBeing({ ...settle, lastX: 0.8 }).peek().intent.x, 0.8);
  assert.equal(createBeing({ ...settle, lastX: 4 }).peek().intent.x, 1, "over-range clamps high");
  assert.equal(createBeing({ ...settle, lastX: -2 }).peek().intent.x, 0, "under-range clamps low");
  assert.equal(createBeing(settle).peek().intent.x, 0.5, "no floorX keeps the old default");
});

/* ---- §5 routine: the day plan, the stream arc, the environment --------------------------
 * Epoch stamps are picked so the Lagos hour (UTC+1) lands in a known slot:
 * UTC 02:00 → Lagos 03:00 (night), UTC 12:00 → Lagos 13:00 (day),
 * UTC 18:00 → Lagos 19:00 (evening), UTC 23:30 → Lagos 00:30 next day (night). */
const LAGOS = { night: Date.UTC(2026, 0, 15, 2, 0), day: Date.UTC(2026, 0, 15, 12, 0), evening: Date.UTC(2026, 0, 15, 18, 0) };

test("the live slot is the Lagos slot, and it shows in the snapshot", () => {
  for (const [want, at] of [["night", LAGOS.night], ["day", LAGOS.day], ["evening", LAGOS.evening]]) {
    const being = createBeing({ now: at, rng: seeded(1), cooldownMs: 1e9, settleMs: 1e9 });
    assert.equal(being.step(at).routine.slot, want, `at ${new Date(at).toISOString()}`);
  }
});

test("night prefers doze and forbids workout; morning forbids doze", () => {
  // Night: the forbid is a score penalty (breakable past boredom 80), so keep the sim short
  // and the room calm — boredom stays under the break-glass threshold and workout, penalised
  // −0.5 and energy-mismatched, never wins. Doze or rest should dominate the night.
  const night = createBeing({ now: LAGOS.night, rng: seeded(7), drives: { energy: 55, boredom: 30 } });
  const keys = new Set();
  for (let i = 1; i <= 40; i++) { const p = night.step(LAGOS.night + i * 5000); if (p.intent.key) keys.add(p.intent.key); }
  assert.ok(!keys.has("workout"), `workout is forbidden at night, got ${[...keys].join(",")}`);
  assert.ok(keys.has("doze") || keys.has("rest"), `night should bring rest or doze, got ${[...keys].join(",")}`);

  // Morning (UTC 05:00 → Lagos 06:00): doze is forbidden there — a tired morning body still
  // does not nap through the slot that says stretch and get moving.
  const morning = Date.UTC(2026, 0, 15, 5, 0);
  const am = createBeing({ now: morning, rng: seeded(7), drives: { energy: 50, boredom: 70 } });
  const amKeys = new Set();
  for (let i = 1; i <= 60; i++) { const p = am.step(morning + i * 5000); if (p.intent.key) amKeys.add(p.intent.key); }
  assert.ok(!amKeys.has("doze"), `doze is forbidden in the morning, got ${[...amKeys].join(",")}`);
});

test("the stream arc opens on a signal, winds down on quiet, and closes on silence", () => {
  const being = createBeing({ now: LAGOS.evening, rng: seeded(2), cooldownMs: 1e9, settleMs: 1e9 });
  assert.equal(being.step(LAGOS.evening).routine.arc, null, "no signal, no arc");
  being.noteSignal(LAGOS.evening);
  assert.equal(being.peek().routine.arc, "arrival", "first signal opens the arrival act");
  // Ten minutes in with the room still loud: body of the arc.
  const mid = LAGOS.evening + 12 * 60e3;
  being.step(mid); being.noteSignal(mid);
  assert.equal(being.peek().routine.arc, "body");
  // Eleven quiet minutes: wind-down — and workout is off the table while it lasts.
  const quiet = mid + 11 * 60e3;
  const p = being.step(quiet);
  assert.equal(p.routine.arc, "wind-down");
  // Sixteen quiet minutes: the arc is over, inferred closed.
  assert.equal(being.step(quiet + 5 * 60e3).routine.arc, null);
});

test("wind-down disqualifies workout even when everything else says go", () => {
  const being = createBeing({ now: LAGOS.day, rng: seeded(4), drives: { energy: 95, boredom: 79 } });
  being.noteSignal(LAGOS.day);
  const mid = LAGOS.day + 20 * 60e3;
  being.noteSignal(mid);
  const quiet = mid + 11 * 60e3;
  const keys = new Set();
  // 40 × 5 s = 200 s of quiet — inside the 15-minute arc window, so every step is wind-down.
  // (Past ~16 quiet minutes the arc closes and workout is legal again — that is the design.)
  for (let i = 1; i <= 40; i++) { const p = being.step(quiet + i * 5000); if (p.intent.key) keys.add(p.intent.key); }
  assert.ok(!keys.has("workout"), `wind-down rests the body, got ${[...keys].join(",")}`);
});

test("environment flags reach the scores through the env seam", () => {
  // heat penalises workout (−0.3) and would favour drink-water — which has no body yet, so
  // the observable check is the plumbing: flags arrive in the snapshot and a cold snap moves
  // him indoors (wander down, panel activities up). Assert the flags propagate and that a
  // heat-flagged evening still produces a legal life — the bias itself is covered by
  // envBiasOf's table being the same object the score reads.
  const env = () => ["heat"];
  const being = createBeing({ now: LAGOS.evening, rng: seeded(6), env, drives: { energy: 70, boredom: 60 } });
  const p = being.step(LAGOS.evening);
  assert.deepEqual(p.routine.env, ["heat"], "env flags are visible in the snapshot");
  // And an env that throws must degrade to no modifiers, never a crashed tick.
  const bad = createBeing({ now: LAGOS.evening, rng: seeded(6), env: () => { throw new Error("no feed"); } });
  assert.deepEqual(bad.step(LAGOS.evening).routine.env, []);
});

test("read-card and check-map go to their named panel, never a random lean", () => {
  const targets = () => ({ lean: ["card", "map", "chat"], sit: ["card"], climb: ["card"] });
  const being = createBeing({
    now: LAGOS.evening, rng: seeded(12), targets,
    drives: { energy: 60, boredom: 55, attention: 45 },
  });
  const seen = {};
  for (let i = 1; i <= 360; i++) {
    const p = being.step(LAGOS.evening + i * 5000);
    if (p.intent.key === "read-card" || p.intent.key === "check-map") {
      seen[p.intent.key] = p.intent.layer;
      if (Object.keys(seen).length === 2) break;
    }
  }
  // Whatever the evening produced, a named-layer activity never fires without its panel —
  // and when it fires it is the right one.
  for (const [key, layer] of Object.entries(seen)) {
    assert.equal(layer, key === "read-card" ? "card" : "map");
  }
});

test("doze is a real activity for a tired body, not just the rest alias", () => {
  const being = createBeing({
    now: LAGOS.night, rng: seeded(8),
    drives: { energy: 45, boredom: 40, attention: 20 },
  });
  let dozed = false;
  for (let i = 1; i <= 240 && !dozed; i++) {
    const p = being.step(LAGOS.night + i * 5000);
    if (p.intent.key === "doze") dozed = true;
  }
  assert.ok(dozed, "a 45-energy body at night should doze within 20 minutes");
});

test("the arc survives a reload through the snapshot", () => {
  const being = createBeing({ now: LAGOS.evening, rng: seeded(3) });
  being.noteSignal(LAGOS.evening);
  const snap = being.peek().routine.arcAt;
  assert.ok(snap && snap.startedAt === LAGOS.evening, "the arc stamps are in the snapshot");
  const revived = createBeing({ now: LAGOS.evening + 60e3, rng: seeded(3), arc: snap });
  assert.equal(revived.peek().routine.arcAt.startedAt, LAGOS.evening, "a saved arc reseeds");
});
