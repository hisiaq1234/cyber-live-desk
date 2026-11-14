/* CRID IDLE — the alive base layer, ported from LivLiv's idle core
 * (livliv-dev/player src/runtime/idle.ts, Apache-2.0) onto CRID's pose channels.
 *
 * What it replaces: the standing idle in crid-3d.js was five summed sines —
 * breath, weight shift, head drift — on fixed periods, so the loop was visible
 * to anyone watching long enough. This module keeps the same output contract
 * (normalized -1..1 channels the pose calls already consume) but the sources
 * are value-noise wander through damped springs, an uneven breath machine,
 * and a small library of keyframed idle moves — the same structure LivLiv
 * proves reads as "a person", not "a rig".
 *
 * Pure on purpose: no DOM, no three.js, no timers, no Date. Time arrives as
 * `t` (seconds) on update(); the RNG is injectable so a test replays the same
 * life twice. Everything is bounded — a bad input degrades to stillness,
 * never NaN.
 *
 * Output channels (all -1..1 unless noted):
 *   breath    inhale-positive breath envelope, uneven 3.2–4.6 s period,
 *             shortened by exertion (INSIDE: breathing reacts to effort)
 *   sway      weight shift, slow fbm wander (replaces sin(t*.5))
 *   driftYaw  slow head-yaw wander (replaces sin(t*.33))
 *   driftPitch slow head-pitch wander, slight downward bias (replaces sin(t*.19+1.4))
 *   noise2    fast small channel for arm/hand drift (replaces sin(t*.62))
 *   roll      small head-roll wander
 *   move      {yaw,pitch,roll,sway} additive offsets in radians/normalized
 *             from the active idle move (glance/lookAround/sway/think/lookDown)
 *   attend    {x,y}|null — gaze hint for facial.mjs while a move runs
 *   active    {name,mirror}|null — telemetry for tests and QA
 */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth01 = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

/* Seeded 1-D value noise: hashed lattice, smoothstep interpolation. Sum a few
 * octaves (fbm) and the wander never visibly repeats — the property that makes
 * sine idles read as loops and noise idles read as life. */
function makeNoise(rand) {
  const p = new Uint8Array(512);
  const base = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [base[i], base[j]] = [base[j], base[i]]; }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  const lat = (i) => p[i & 255] / 255;
  const n1 = (x) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return lat(i) * (1 - u) + lat(i + 1) * u;
  };
  return (x) => {
    const v = n1(x) + .5 * n1(x * 2.03 + 13.7) + .25 * n1(x * 4.11 + 41.3);
    return v / 1.75; // ~0..1
  };
}

/* Damped spring, substepped like crid-3d's stepSpring so a tab-sleep dt cannot
 * explode it. s = {v, vel}; returns the new v. */
function spring(s, target, k, c, dt) {
  const n = Math.max(1, Math.ceil(dt / .008)), h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = (target - s.v) * k - s.vel * c;
    s.vel += a * h; s.v += s.vel * h;
  }
  return s.v;
}
const mkSpring = () => ({ v: 0, vel: 0 });

/* The uneven breath machine. One cycle = inhale (40%) -> exhale (48%) ->
 * pause (12%). Period re-rolls every cycle in [3.2, 4.6] s, or [2.3, 3.1] s
 * under exertion — effort quickens breath and recovery is gradual because
 * `exert` itself decays slowly in the caller. Output -1..1, continuous across
 * the wrap: inhale +1, exhale -1, pause holds the exhale end. */
function createBreath(rand) {
  let phase = 0, period = 3.2 + rand() * 1.4, exertion = 0;
  const raw = () => {
    const p = phase;
    if (p < .40) return smooth01(p / .40);                    // inhale 0 -> 1
    if (p < .88) return 1 - smooth01((p - .40) / .48);         // exhale 1 -> 0
    return 0;                                                 // pause at empty
  };
  return {
    /** dt seconds; exertion 0..1. Returns -1..1 (inhale positive). */
    update(dt, ex) {
      exertion += (clamp(ex, 0, 1) - exertion) * Math.min(1, dt * .5);
      const lo = 3.2 - exertion * .9, hi = 4.6 - exertion * 1.5;
      period += (lo + rand() * (hi - lo) - period) * Math.min(1, dt * .2);
      const prev = phase;
      phase = (phase + dt / period) % 1;
      if (phase < prev) period = lo + rand() * (hi - lo); // re-roll on wrap
      return (raw() - .5) * 2;
    },
  };
}

/* Idle moves — the keyframed library. Each track is [u, yaw, pitch, roll, sway,
 * gazeX, gazeY] keys eased with smoothstep; first and last keys are zero so
 * every move eases in and out (~0.15 s effective at the ends). yaw/pitch/roll
 * are radians, sway/gaze are normalized -1..1. Mirrors flip lateral channels. */
const MOVES = {
  glance: {
    dur: [1.5, 2.1],
    keys: [[0, 0, 0, 0, 0, 0, 0], [.4, .34, 0, 0, 0, .55, 0], [1, 0, 0, 0, 0, 0, 0]],
  },
  lookAround: {
    dur: [2.6, 3.4],
    keys: [[0, 0, 0, 0, 0, 0, 0], [.28, -.30, -.02, 0, 0, -.6, -.05], [.72, .30, -.02, 0, 0, .6, -.05], [1, 0, 0, 0, 0, 0, 0]],
  },
  sway: {
    dur: [2.8, 3.8],
    keys: [[0, 0, 0, 0, 0, 0, 0], [.35, 0, 0, 0, .9, 0, 0], [.7, 0, 0, 0, .9, 0, 0], [1, 0, 0, 0, 0, 0, 0]],
  },
  think: {
    dur: [3.0, 4.0],
    keys: [[0, 0, 0, 0, 0, 0, 0], [.3, .10, .15, .04, 0, .15, .45], [.75, .10, .15, .04, 0, .15, .45], [1, 0, 0, 0, 0, 0, 0]],
  },
  lookDown: {
    dur: [1.9, 2.6],
    keys: [[0, 0, 0, 0, 0, 0, 0], [.4, 0, .24, 0, 0, 0, .6], [.8, 0, .24, 0, 0, 0, .6], [1, 0, 0, 0, 0, 0, 0]],
  },
};
const MOVE_KEYS = Object.keys(MOVES);

function trackAt(keys, u) {
  if (u <= 0) return keys[0].slice(1);
  if (u >= 1) return keys[keys.length - 1].slice(1);
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const [u0, ...a] = keys[i - 1], [u1, ...b] = keys[i];
      const e = smooth01((u - u0) / (u1 - u0 || 1));
      return a.map((v, j) => v + (b[j] - v) * e);
    }
  }
  return keys[keys.length - 1].slice(1);
}

export function createCridIdle({ rand = Math.random, now = () => 0 } = {}) {
  const noise = makeNoise(rand);
  const breath = createBreath(rand);
  // Wander channels: slow springs on noise targets, so the pose trails the
  // wander instead of snapping sample to sample — eyes lead, head follows,
  // torso trails is already the bone contract; this is the same rule one level
  // up, on the idle inputs themselves.
  const ch = {
    sway: mkSpring(), driftYaw: mkSpring(), driftPitch: mkSpring(),
    noise2: mkSpring(), roll: mkSpring(),
    mYaw: mkSpring(), mPitch: mkSpring(), mRoll: mkSpring(), mSway: mkSpring(),
  };
  const K = { sway: [9, 5.7], driftYaw: [34, 11], driftPitch: [30, 10.4], noise2: [60, 15.5], roll: [26, 9.6], mYaw: [46, 13.6], mPitch: [46, 13.6], mRoll: [50, 14], mSway: [12, 6.9] };
  let nextMoveAt = 8 + rand() * 8;
  let move = null; // {name, mirror, t0, dur}
  let lastT = null;

  const zero = { yaw: 0, pitch: 0, roll: 0, sway: 0, gx: 0, gy: 0 };

  function update(dt, input = {}) {
    const t = Number.isFinite(input.t) ? input.t : (lastT ?? 0);
    const d = Math.min(.05, Math.max(0, Number.isFinite(dt) ? dt : 0));
    lastT = t;
    const mode = input.mode || "on", dying = !!input.dying;
    const alive = mode === "on" && !dying;
    const reduced = !!input.reduced;
    const calm = reduced ? .45 : 1;

    /* ---- scheduled idle moves ----------------------------------------
     * LivLiv: a move every 10–20 s, randomly mirrored, ~0.15 s ease at the
     * ends. Ours fire on the same clock; `sway` (a held weight shift) is the
     * only move suppressed while walking, because the gait already owns the
     * weight. Reduced motion keeps breath and micro-wander but never moves. */
    if (alive && !reduced && t >= nextMoveAt) {
      const name = MOVE_KEYS[(rand() * MOVE_KEYS.length) | 0];
      const def = MOVES[name];
      const walking = !!input.walking;
      const usable = name !== "sway" || !walking;
      if (usable) {
        move = { name, mirror: rand() < .5 ? -1 : 1, t0: t, dur: def.dur[0] + rand() * (def.dur[1] - def.dur[0]) };
      }
      nextMoveAt = t + 10 + rand() * 10;
    }
    let mv = zero, gaze = null, active = null;
    if (move) {
      const u = (t - move.t0) / move.dur;
      if (u >= 1) { move = null; }
      else {
        const def = MOVES[move.name];
        const [yaw, pitch, roll, sway, gx, gy] = trackAt(def.keys, u);
        const m = move.mirror;
        mv = { yaw: yaw * m, pitch, roll: roll * m, sway: sway * m, gx: gx * m, gy };
        gaze = (gx || gy) ? { x: clamp(gx * m * 1.4, -1, 1), y: clamp(gy * 1.2, -1, 1) } : null;
        active = { name: move.name, mirror: m < 0 ? "L" : "R", u };
      }
    }

    /* ---- wander targets ------------------------------------------------
     * Noise inputs run on their own clocks; springs do the trailing. Amplitudes
     * match the sines they replace so the pose tuning downstream is unchanged. */
    const life = alive ? 1 : .25;
    const swayT = (noise(t * .045 + 11.7) * 2 - 1) * life;
    const yawT = (noise(t * .05 + 3.7) * 2 - 1) * .9 * life;
    const pitchT = ((noise(t * .065 + 9.1) * 2 - 1) * .7 - .12) * life;   // humans rest slightly head-down
    const rollT = (noise(t * .055 + 21.3) * 2 - 1) * .5 * life;
    const fastT = (noise(t * .5 + 31.9) * 2 - 1) * life;

    const ex = alive ? (input.exertion || 0) : 0;
    const out = {
      breath: breath.update(d, ex) * (alive ? 1 : .3),
      sway: spring(ch.sway, swayT, K.sway[0], K.sway[1], d) * calm,
      driftYaw: spring(ch.driftYaw, yawT, K.driftYaw[0], K.driftYaw[1], d) * calm,
      driftPitch: spring(ch.driftPitch, pitchT, K.driftPitch[0], K.driftPitch[1], d) * calm,
      noise2: spring(ch.noise2, fastT, K.noise2[0], K.noise2[1], d) * calm,
      roll: spring(ch.roll, rollT, K.roll[0], K.roll[1], d) * calm,
      move: {
        yaw: spring(ch.mYaw, mv.yaw, K.mYaw[0], K.mYaw[1], d) * calm,
        pitch: spring(ch.mPitch, mv.pitch, K.mPitch[0], K.mPitch[1], d) * calm,
        roll: spring(ch.mRoll, mv.roll, K.mRoll[0], K.mRoll[1], d) * calm,
        sway: spring(ch.mSway, mv.sway, K.mSway[0], K.mSway[1], d) * calm,
      },
      attend: alive && gaze ? gaze : null,
      active,
    };
    // NaN guard: a corrupt input must degrade to stillness, never poison the pose.
    for (const k of ["breath", "sway", "driftYaw", "driftPitch", "noise2", "roll"]) {
      if (!Number.isFinite(out[k])) out[k] = 0;
    }
    for (const k of ["yaw", "pitch", "roll", "sway"]) {
      if (!Number.isFinite(out.move[k])) out.move[k] = 0;
    }
    return out;
  }

  return { update, reset() { move = null; nextMoveAt = 8 + rand() * 8; for (const k in ch) ch[k] = mkSpring(); } };
}
