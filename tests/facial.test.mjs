// facial.mjs is pure JS — the whole performance layer runs in node, no DOM, no GL.
// These tests pin the lifecycle contract: envelopes rise and fall, a second
// emotion cannot leave the first one's channels behind, and the scheduled
// events (blink, gaze, talking jaw) compose with emotion instead of fighting it.

import test from "node:test";
import assert from "node:assert/strict";
import { createFacial } from "../public/desk-assets/facial.mjs";

const EMOTIONS = ["curious", "delighted", "smug", "flustered", "sleepy", "startled", "proud", "sulky"];
const run = (f, from, to, dt = 1 / 60, input = {}) => {
  for (let t = from; t < to; t += dt) f.update(dt, { t, mode: "on", ...input });
};
const maxChannel = (c) => Math.max(0, ...Object.values(c));

test("every emotion rises, holds, and releases back to neutral", () => {
  for (const name of EMOTIONS) {
    const f = createFacial({ rand: (a, b) => a + (b - a) * 0.5 });   // deterministic clocks
    run(f, 0, 0.5);
    f.cue(name, 800);
    run(f, 0.5, 1.4);
    const peak = f.channels();
    assert.ok(maxChannel(peak) > 0.2, `${name} must be visibly posed mid-envelope`);
    run(f, 1.4, 5);
    const after = f.channels();
    for (const [k, v] of Object.entries(after))
      assert.ok(v < 0.08, `${name}: ${k}=${v.toFixed(3)} must decay home, not linger`);
  }
});

test("a second emotion mid-first leaves no stale channels", () => {
  const f = createFacial({ rand: (a, b) => a + (b - a) * 0.5 });
  run(f, 0, 0.5);
  f.cue("delighted", 2500);          // long hold: still hot when sulky lands
  run(f, 0.5, 1.0);
  f.cue("sulky", 600);
  run(f, 1.0, 1.2);
  const mid = f.channels();
  // delighted-only channels must already be on their way out
  assert.ok((mid.cheekSquintL || 0) < 0.5, "delighted's cheek squint must release when sulky takes over");
  run(f, 1.2, 6);
  const end = f.channels();
  for (const k of ["cheekSquintL", "cheekSquintR", "lipCornerSmileL", "eyeLoSmileL", "mouthFrownL"])
    assert.ok((end[k] || 0) < 0.08, `${k} must not survive the hand-off`);
});

test("blink, talking jaw and emotion compose on the same face", () => {
  const f = createFacial({ rand: (a, b) => a + (b - a) * 0.5 });   // first blink lands at t≈2.25
  run(f, 0, 0.5);
  f.cue("delighted", 3000);
  let sawBlinkWithSmile = false, sawTalkWithBlink = false;
  for (let t = 0.5; t < 3; t += 1 / 60) {
    f.update(1 / 60, { t, mode: "on", talking: t > 1.5 });
    const c = f.channels();
    if ((c.eyeShutL || 0) > 0.9) {
      if ((c.smileL || 0) > 0.2) sawBlinkWithSmile = true;
      if ((c.jaw || 0) > 0.15) sawTalkWithBlink = true;
    }
  }
  assert.ok(sawBlinkWithSmile, "a blink must not erase the held smile");
  assert.ok(sawTalkWithBlink, "the talking jaw must keep working while the eyes are shut");
});

test("doze suppresses emotion and holds the lids", () => {
  const f = createFacial({ rand: (a, b) => a + (b - a) * 0.5 });
  run(f, 0, 0.5);
  f.cue("startled", 2000);
  for (let t = 0.5; t < 2.5; t += 1 / 60) f.update(1 / 60, { t, mode: "doze" });
  const c = f.channels();
  assert.ok((c.eyeShutL || 0) > 0.6, "doze must hold his eyes heavy");
  assert.ok((c.eyeShutLL || 0) > 0.2, "doze must keep the lower lid down too");
  assert.ok(!(c.eyeWideUpL > 0.2), "an emotion must not play over a dozing face");
  assert.ok(!(c.jaw > 0.3), "he does not jaw while asleep");
});

test("gaze follows the pose look offset through the iris morphs", () => {
  const f = createFacial({ rand: (a, b) => a + (b - a) * 0.5 });
  for (let t = 0; t < 2; t += 1 / 60) f.update(1 / 60, { t, mode: "on", gx: 60, gy: -60 });
  const c = f.channels();
  // gx>0 is his left (viewer right): irisOut on the left eye, irisIn on the right
  assert.ok((c.irisOutL || 0) > 0.3 && (c.irisInR || 0) > 0.3, "look-left must drive L-out + R-in");
  assert.ok((c.irisUpL || 0) > 0.3 && (c.irisUpR || 0) > 0.3, "look-up must drive both irises up");
});

test("attention fixation pulls the gaze and releases cleanly", () => {
  const f = createFacial({ rand: (a, b) => a + (b - a) * 0.5 });
  // idle baseline
  run(f, 0, 1);
  const base = f.channels();
  // fixate screen-right (attend.x>0 = his left / viewer right, same sign as gx>0)
  run(f, 1, 3, 1 / 60, { attend: { x: 0.8, y: 0.1 } });
  const locked = f.channels();
  assert.ok((locked.irisOutL || 0) > (base.irisOutL || 0) + 0.2, "fixation must pull the left iris out");
  assert.ok((locked.irisInR || 0) > (base.irisInR || 0) + 0.2, "and the right iris in");
  // release: attend=null eases back toward the saccade scheduler
  run(f, 3, 6);
  const free = f.channels();
  assert.ok(Math.abs((free.irisOutL || 0) - (base.irisOutL || 0)) < 0.35, "release must not stick");
});
