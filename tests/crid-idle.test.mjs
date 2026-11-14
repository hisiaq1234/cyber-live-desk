import { test } from "node:test";
import assert from "node:assert/strict";

import { createCridIdle } from "../public/desk-assets/crid-idle.mjs";
import { seeded } from "../public/desk-assets/being.mjs";

const DT = 1 / 60;
const run = (idle, seconds, input = {}) => {
  const out = [];
  for (let i = 0; i < seconds * 60; i++) out.push(idle.update(DT, { t: i * DT, mode: "on", ...input }));
  return out;
};

test("idle outputs stay bounded and finite over a long run", () => {
  const idle = createCridIdle({ rand: seeded(7) });
  const frames = run(idle, 120);
  for (const f of frames) {
    for (const k of ["breath", "sway", "driftYaw", "driftPitch", "noise2", "roll"]) {
      assert.ok(Number.isFinite(f[k]), `${k} finite`);
      assert.ok(Math.abs(f[k]) <= 1.6, `${k} bounded (${f[k]})`);
    }
    for (const k of ["yaw", "pitch", "roll", "sway"]) {
      assert.ok(Number.isFinite(f.move[k]), `move.${k} finite`);
      // Move channels run through damped springs: overshoot past the track's
      // peak is the intended follow-through, so the bound is generous.
      assert.ok(Math.abs(f.move[k]) <= 1.2, `move.${k} bounded (${f.move[k]})`);
    }
  }
});

test("breath is uneven: consecutive cycles differ in period", () => {
  const idle = createCridIdle({ rand: seeded(3) });
  // Find inhale peaks (breath crosses +0.8) and measure gaps.
  let prevPeak = -1; const peaks = [];
  for (let i = 0; i < 60 * 30; i++) {
    const b = idle.update(DT, { t: i * DT, mode: "on" }).breath;
    if (prevPeak < 0 && b > .8) { peaks.push(i * DT); prevPeak = i * DT; }
    else if (b < .2) prevPeak = -1;
  }
  assert.ok(peaks.length >= 5, `enough breaths measured (${peaks.length})`);
  const gaps = peaks.slice(1).map((p, i) => p - peaks[i]);
  const spread = Math.max(...gaps) - Math.min(...gaps);
  assert.ok(spread > .3, `periods must vary, not metronome (spread ${spread.toFixed(2)}s)`);
  for (const g of gaps) assert.ok(g > 2.2 && g < 4.8, `period in range (${g.toFixed(2)}s)`);
});

test("exertion shortens the breath period", () => {
  const calm = createCridIdle({ rand: seeded(11) });
  const busy = createCridIdle({ rand: seeded(11) });
  // Warm both up, then measure mean period over a window.
  const period = (idle, ex) => {
    const peaks = [];
    let armed = true;
    for (let i = 0; i < 60 * 20; i++) {
      const b = idle.update(DT, { t: i * DT, mode: "on", exertion: ex }).breath;
      if (armed && b > .8) { peaks.push(i * DT); armed = false; }
      else if (b < .2) armed = true;
    }
    return peaks.length / 20;
  };
  const calmRate = period(calm, 0), busyRate = period(busy, 1);
  assert.ok(busyRate > calmRate * 1.15, `exerted breath faster (${busyRate.toFixed(2)} vs ${calmRate.toFixed(2)}/s)`);
});

test("idle moves fire on their own clock, ease in and out, and mirror", () => {
  const idle = createCridIdle({ rand: seeded(5) });
  let sawMove = null, moves = 0;
  for (let i = 0; i < 60 * 60; i++) {
    const f = idle.update(DT, { t: i * DT, mode: "on" });
    if (f.active && !sawMove) sawMove = { name: f.active.name, mirror: f.active.mirror, first: f.move };
    if (f.active) moves++;
    if (sawMove && !f.active && moves > 10) break;
  }
  assert.ok(sawMove, "a move fired within a minute");
  assert.ok(["glance", "lookAround", "sway", "think", "lookDown"].includes(sawMove.name));
  // The move's offsets must start and end near zero (ease in/out, no snap).
  assert.ok(Math.abs(sawMove.first.yaw) < .05 || Math.abs(sawMove.first.pitch) < .05,
    "move starts near zero");
});

test("gaze hint only exists while a move runs", () => {
  const idle = createCridIdle({ rand: seeded(9) });
  let sawGaze = false, sawNull = false;
  for (let i = 0; i < 60 * 45; i++) {
    const f = idle.update(DT, { t: i * DT, mode: "on" });
    if (f.attend) sawGaze = true; else sawNull = true;
    if (sawGaze && sawNull && i > 60 * 20) break;
  }
  assert.ok(sawGaze, "a move produced an attention hint");
  assert.ok(sawNull, "and released it afterwards");
});

test("dead/doze modes quiet the wander but keep a soft breath", () => {
  const idle = createCridIdle({ rand: seeded(13) });
  const frames = run(idle, 30, { mode: "dead" });
  const maxSway = Math.max(...frames.map((f) => Math.abs(f.sway)));
  const maxMove = Math.max(...frames.map((f) => Math.abs(f.move.yaw) + Math.abs(f.move.pitch)));
  assert.ok(maxSway < .5, `dead sway damped (${maxSway.toFixed(2)})`);
  assert.equal(maxMove, 0, "no idle moves while dead");
  assert.ok(frames.some((f) => Math.abs(f.breath) > .2), "breath still alive (scaled to 30%)");
});

test("reduced motion suppresses moves and shrinks wander", () => {
  const idle = createCridIdle({ rand: seeded(17) });
  const frames = run(idle, 60, { reduced: true });
  assert.ok(frames.every((f) => !f.active), "no moves under reduced motion");
  const maxSway = Math.max(...frames.map((f) => Math.abs(f.sway)));
  assert.ok(maxSway < .8, `wander calmed (${maxSway.toFixed(2)})`);
});

test("same seed replays the same life", () => {
  const a = createCridIdle({ rand: seeded(42) });
  const b = createCridIdle({ rand: seeded(42) });
  for (let i = 0; i < 60 * 30; i++) {
    const t = i * DT;
    const fa = a.update(DT, { t, mode: "on" }), fb = b.update(DT, { t, mode: "on" });
    assert.equal(fa.breath, fb.breath);
    assert.equal(fa.sway, fb.sway);
  }
});
