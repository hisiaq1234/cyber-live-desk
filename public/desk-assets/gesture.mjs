/* CRID arm gestures — the mL/mR vocabulary made flesh on the 3D rig.
 *
 * SEQ cues carry arm intent (crid-bot.js: "up", "wave", "slam", "push",
 * "down", "limp") but the GLB path never read it, so on air his arms held
 * whatever the idle drift happened to be — the frozen hand. This module is
 * the missing layer: per-side gesture programs over a gesture-local clock
 * with true outgoing/incoming crossfading (zero-snap transitions) that emit
 * the same semantic channels stage.mjs uses (armLift, armFwd, elbow, shrug,
 * headPitch, leanFwd) plus direct bone eulers for the hands, which the
 * channel map does not name.
 *
 * Canon (docs/specs/arm-gestures.md): UE/Unity layered-blend-per-bone +
 * Gears-of-War inertialization — the gesture does NOT own the arm chain; it
 * emits additive euler deltas that crid-3d.js premultiplies onto whatever
 * pose()/gait/IK wrote, each bone tracked by a pos+vel spring starting at
 * zero. Weight fades on a half-life (~55 ms), never snaps, and the gesturing
 * arm keeps its walk swing underneath — a wave over locomotion, not instead
 * of it.
 *
 * Transitions, precisely:
 *   gesture -> gesture : prev program keeps animating on its own clock while
 *                        its weight decays; the new program fades in beside
 *                        it. wave->up blends, never pops, never dips.
 *   gesture -> down    : same mechanism — the released program's clock keeps
 *                        running (the wave keeps wagging, gently, as it
 *                        fades) until its weight is gone. This is the
 *                        "lastProg" idea: a release is a tail, not a cut.
 *
 * A gesture is a program over gesture-local time u (seconds since the mL/mR
 * value changed): anticipation, action, recover — the same beat structure the
 * SEQ frames already imply, now with a clock inside the held pose. "wave" is
 * the reason this exists: it is not a pose, it is an oscillation inside one.
 *
 * `heft` is the body-ladder mass factor (crid-bot.js BODIES[].heft): heavy
 * Crid moves slower and swings wider — longer rise/settle times, slightly
 * lower wave frequency, deeper slams. Clamped 0.75–1.6.
 */

const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const easeOut = (u) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
const easeIn = (u) => Math.pow(clamp(u, 0, 1), 3);

// Frame-rate independent fade: fraction of the remaining distance covered this
// frame for a channel with the given half-life in seconds.
const dampAlpha = (dt, halfLife) => 1 - Math.exp((-Math.LN2 * Math.max(0, dt)) / halfLife);

const PROGRAMS = {
  // release: the weight fade does the work; the program itself emits nothing.
  down: () => null,

  // doze/dead flavour: arms hang lower than the relaxed baseline, elbows soft,
  // hands slack. Negative lift drops the arm below its hang.
  limp: (u, h) => {
    const e = easeOut(u / (0.25 * h));
    return { lift: -0.55 * e, elbow: 0.3 * e, curl: 0.35 * e };
  },

  // raise and hold: the settle is the bone spring's job — the program holds
  // the target and lets the limb arrive.
  up: (u, h) => {
    const e = easeOut(u / (0.14 * Math.sqrt(h)));
    return {
      lift: (1.72 / Math.pow(h, 0.22)) * e,
      fwd: 0.12 * e,
      elbow: 0.5 * e,
      curl: 0.18 * e,
    };
  },

  // the wave: forearm carried up beside the head — forward flexion does the
  // raising (armFwd), abduction only sets it off the chest — elbow held high
  // with a forearm oscillation and a wrist flick on the hand bone (no channel
  // names the wrist). Heavy Crid waves slightly more deliberately — lower
  // frequency, wider swing.
  wave: (u, h) => {
    const rise = 0.16 * Math.sqrt(h);
    const e = easeOut(u / rise);
    const freq = 3.2 / Math.pow(h, 0.28);
    const wag = Math.sin(Math.max(0, u - rise * 0.6) * TAU * freq) * e;
    return {
      lift: (0.55 / Math.pow(h, 0.18)) * e,
      fwd: 1.15 * e,
      elbow: 0.85 * e + 0.3 * wag,
      curl: 0.08 * e,
      hand: { x: 0, y: 0, z: wag * 0.7 },
      shrug: 0.18 * e,
    };
  },

  // SEQ.paid / SEQ.due already play mR:"up" on the wind-up frame, so "slam"
  // strikes downward immediately on beat impact (u = 0) with heavy
  // follow-through — heavier Crid hits deeper.
  slam: (u, h) => {
    const strike = easeOut(u / 0.08);
    const settle = u < 0.12 ? 0 : easeOut((u - 0.12) / 0.22);
    const punch = strike * (1 - settle * 0.45);
    return {
      lift: -0.38 * h * punch,
      fwd: 0.42 * punch,
      elbow: 0.65 * punch,
      curl: 0.75 * strike,
      headPitch: 0.16 * h * punch,
      leanFwd: 0.1 * h * punch,
    };
  },

  // both arms forward, elbows soft, hands to fists — the "push" of summon and
  // the chest-press of pushup's recovery. Body answers with a forward lean.
  push: (u, h) => {
    const e = easeOut(u / (0.11 * Math.sqrt(h)));
    return {
      fwd: 0.85 * e,
      lift: 0.3 * e,
      elbow: 0.9 * e,
      curl: 0.8 * e,
      leanFwd: 0.14 * h * e,
    };
  },
};

const newSide = () => ({
  val: null,    // active gesture name (null = released/down)
  t0: 0,        // gesture-local clock zero
  w: 0,         // incoming weight, 0->1 on a half-life
  prevVal: null,// outgoing gesture still finishing its tail
  prevU: 0,     // its clock, kept running so the tail animates, not freezes
  prevW: 0,     // its weight, 1->0 on the same half-life
});

// Accumulate one program's output into a side's blend object. Weight is
// applied HERE and only here — applying it again downstream squares it (the
// w^2 wrist bug this structure exists to prevent).
function addProg(acc, prog, w) {
  if (!prog || w <= 0.0001) return;
  for (const k in prog) {
    const v = prog[k];
    if (k === "hand" && v) {
      acc.hand.x += (v.x || 0) * w;
      acc.hand.y += (v.y || 0) * w;
      acc.hand.z += (v.z || 0) * w;
      acc.hasHand = true;
    } else if (typeof v === "number") {
      acc[k] = (acc[k] || 0) + v * w;
    }
  }
}

export function createGestureLayer() {
  const S = { L: newSide(), R: newSide() };
  const out = {
    L: { hand: { x: 0, y: 0, z: 0 }, hasHand: false },
    R: { hand: { x: 0, y: 0, z: 0 }, hasHand: false },
  };
  let lastIn = null;

  /* dt seconds, t seconds (drive()'s clock), mL/mR the raw pose fields, heft the
   * body-ladder mass factor. Returns {map, extra, curl, w, any}: map is the
   * semantic channel fragment merged into stageChannels' output; extra is
   * [boneName,x,y,z] euler deltas for bones the map does not name (wrists);
   * curl is the per-side finger target. */
  function update(dt, t, { L = null, R = null, heft = 1 } = {}) {
    lastIn = { L, R, heft };
    const h = clamp(Number(heft) || 1, 0.75, 1.6);
    const alpha = dampAlpha(dt, 0.055); // ~0.12 s to ~80% — quick but never a snap
    let any = false;

    for (const side of ["L", "R"]) {
      const st = S[side];
      const raw = side === "L" ? L : R;
      const next = raw && raw !== "down" && PROGRAMS[raw] ? raw : null;

      // Gesture changed (including -> null on release): archive the outgoing
      // program with its clock position and weight intact, start the new one
      // from zero. The tail keeps animating below — that is the whole point.
      if (next !== st.val) {
        if (st.val && st.w > 0.005) {
          st.prevVal = st.val;
          st.prevU = Math.max(0, t - st.t0);
          st.prevW = st.w;
        }
        st.val = next;
        st.t0 = t;
        st.w = 0;
      }

      // Incoming fades in on a half-life; outgoing fades out on the same one,
      // so at every instant prevW + w ~= 1 and the arm never sees a gap.
      const tgt = st.val ? 1 : 0;
      st.w += (tgt - st.w) * alpha;
      if (Math.abs(tgt - st.w) < 0.002) st.w = tgt;

      if (st.prevW > 0) {
        st.prevW += (0 - st.prevW) * alpha;
        st.prevU += Math.max(0, dt); // the tail animates — wave keeps wagging home
        if (st.prevW < 0.002) {
          st.prevW = 0;
          st.prevVal = null;
        }
      }

      const acc = out[side];
      for (const k in acc) if (k !== "hand" && k !== "hasHand") delete acc[k];
      acc.hand.x = acc.hand.y = acc.hand.z = 0;
      acc.hasHand = false;

      if (st.prevVal && st.prevW > 0.001) {
        any = true;
        addProg(acc, PROGRAMS[st.prevVal](st.prevU, h), st.prevW);
      }
      if (st.val && st.w > 0.001) {
        any = true;
        addProg(acc, PROGRAMS[st.val](Math.max(0, t - st.t0), h), st.w);
      }
    }

    const map = {};
    const extra = [];
    const curl = { L: 0, R: 0 };

    for (const side of ["L", "R"]) {
      const o = out[side];
      if (o.lift) map["armLift" + side] = o.lift;
      if (o.fwd) map["armFwd" + side] = o.fwd;
      if (o.elbow) map["elbow" + side] = o.elbow;
      if (o.shrug) map["shrug" + side] = o.shrug;
      // headPitch/leanFwd are body answers, not per-side — both sides sum in.
      if (o.headPitch) map.headPitch = (map.headPitch || 0) + o.headPitch;
      if (o.leanFwd) map.leanFwd = (map.leanFwd || 0) + o.leanFwd;
      curl[side] = clamp(o.curl || 0, 0, 1);

      if (o.hasHand) {
        extra.push([`${side}_hand0001_bind_JNT`, o.hand.x, o.hand.y, o.hand.z]);
      }
    }

    return {
      map,
      extra,
      curl,
      w: { L: Math.max(S.L.w, S.L.prevW), R: Math.max(S.R.w, S.R.prevW) },
      any,
    };
  }

  return {
    update,
    // Read-only QA handle, same spirit as __cridIk/__cridFace.
    debug: () => ({ L: { ...S.L }, R: { ...S.R }, in: lastIn }),
  };
}
