/* CRID'S DRIVES — the brain half of `docs/specs/behaviour-drives.md`, sliced to what the rig page
 * can actually act on today.
 *
 * The question this answers: when nobody is touching anything, why does Crid do the thing he does
 * next? Three quantities move on their own (energy, boredom, attention), a score decides which
 * activity he starts, and a cooldown keeps him from thrashing between them.
 *
 * Pure on purpose: no DOM, no fetch, no timers, no `Date`. Time arrives as `now` (ms) and every
 * rate is per real second, so a 1 s step and a 3 s step produce the same drives a minute later.
 * The RNG is injectable, so a test can pin the jitter and get the same life twice.
 *
 * What is here (§3, §4, part of §8 of the spec): the three drives with their real rates and
 * thresholds, `energyFit` / `novelty` / `social` / `recency` / `jitter` in the spec's weights, the
 * `score > 0.30` start rule and the 20 s cooldown, and the trace ledger that stops him repeating
 * himself. What is not, and is not needed for him to choose to walk the floor: the day plan and
 * stream arc (§5), layer awareness and the registry (§9), the P0–P4 arbitration and the
 * interruption contract (§6, §7), persistence (§10). Those are later slices of the same spec.
 *
 * The activity set is the part of §8 that has a body on the rig page — wander, stretch, rest. An
 * activity that needs a panel (read-card, lean-watch, climb, show-story) is deliberately not
 * offered: scoring for something he cannot do is worse than offering less.
 */

const ENERGY_DECAY = 0.006;      // /s at load 1.0 — 100 → 0 in ~4.6 h
const BORE_QUIET = 0.55;         // /s with nothing running
const ATTENTION_QUIET = 0.12;    // /s in a quiet room
const ATTENTION_DECAY = 0.05;    // /s always
const BORE_RELIEF = 45;          // on any activity start
const COOLDOWN_MS = 20_000;      // between activities — the spec's ACTIVITY_COOLDOWN
const DECIDE_MS = 1_500;         // at most one decision per 1.5 s
const DT_CLAMP_MS = 5_000;       // a sleeping tab cannot teleport his state
const TRACE_KEEP = 3;            // recency reads the last three

/* `dur` is the planned length in seconds; `load` is §3.1's energy cost; `bore` is §3.2's rate;
 * `recover` is §3.1's rest recovery. */
const ACTIVITIES = {
  wander: { energyNeed: 0.55, novelty: 0.6, social: 0.2, load: 2.2, bore: 0.0, dur: [12, 20] },
  stretch: { energyNeed: 0.40, novelty: 0.4, social: 0.1, load: 0.9, bore: 0.2, dur: [6, 9] },
  rest: { energyNeed: 0.15, novelty: 0.2, social: 0.0, load: 0, bore: 0.2, dur: [24, 40], recover: 0.012 },
};
export const ACTIVITY_KEYS = Object.keys(ACTIVITIES);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * A seeded RNG, so a test (or a replay) gets the same life twice.
 * mulberry32 — small, fast, good enough for jitter.
 */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createBeing({ rng = Math.random, now = 0, drives: seedDrives = {}, cooldownMs = COOLDOWN_MS, settleMs = 2500 } = {}) {
  const drives = {
    energy: Number.isFinite(seedDrives.energy) ? seedDrives.energy : 62,
    boredom: Number.isFinite(seedDrives.boredom) ? seedDrives.boredom : 70,
    attention: Number.isFinite(seedDrives.attention) ? seedDrives.attention : 35,
  };
  const traces = [];                 // newest first
  let lastAt = null;
  let lastDecision = -Infinity;
  let cooldownUntil = now + settleMs;   // he settles in before the first decision
  let activity = null;               // { key, startedAt, endsAt, target }
  let lastX = 0.5;                   // the floor spot he is standing on, 0..1

  const pick = (a, b) => a + rng() * (b - a);

  function eligible(key) {
    // §3.1: spent means only rest is on the table.
    if (drives.energy < 20) return key === "rest";
    return true;
  }

  function recency(key) {
    const i = traces.findIndex((t) => t.key === key);
    if (i < 0) return 0.40;          // not in the last three
    if (i === 0) return -0.60;       // he does not repeat himself
    if (i === 1) return -0.30;
    return -0.15;
  }

  function score(key) {
    const a = ACTIVITIES[key];
    const fit = 1 - Math.abs(drives.energy / 100 - a.energyNeed);
    return (
      0.9 * fit +
      1.1 * (drives.boredom / 100) * a.novelty +
      0.8 * (drives.attention / 100) * a.social +
      0.0 /* routine: the day plan is a later slice */ +
      recency(key) -
      0.0 /* cost: no layers to reach for yet */ +
      (rng() * 2 - 1) * 0.08
    );
  }

  /* Somewhere to walk to that is far enough away to be a walk. He crosses the floor; he does not
   * shuffle on the spot, which would read as a rig with nowhere to go. */
  function pickTarget() {
    let x = pick(0.06, 0.94);
    if (Math.abs(x - lastX) < 0.25) {
      x = lastX < 0.5 ? lastX + pick(0.35, 0.6) : lastX - pick(0.35, 0.6);
    }
    return clamp(x, 0.06, 0.94);
  }

  function start(key, t) {
    const a = ACTIVITIES[key];
    const ms = pick(a.dur[0], a.dur[1]) * 1000;
    activity = {
      key,
      startedAt: t,
      endsAt: t + ms,
      target: key === "wander" ? pickTarget() : null,
    };
    drives.boredom = clamp(drives.boredom - BORE_RELIEF, 0, 100);
  }

  function close(t, outcome) {
    if (!activity) return;
    traces.unshift({
      key: activity.key,
      startedAt: activity.startedAt,
      endedAt: t,
      outcome,
    });
    traces.length = Math.min(traces.length, TRACE_KEEP);
    if (activity.key === "wander" && activity.target != null) lastX = activity.target;
    activity = null;
    cooldownUntil = t + cooldownMs;
  }

  function decay(dt) {
    const a = activity ? ACTIVITIES[activity.key] : null;
    // energy: rest recovers, everything else costs, standing still costs the idle load
    if (a && a.recover) drives.energy += a.recover * dt;
    else drives.energy -= ENERGY_DECAY * (a ? a.load : 1.0) * dt;
    // boredom: nothing running is the boring case; some activities are quiet ones
    drives.boredom += (a ? a.bore : BORE_QUIET) * dt;
    // attention: the quiet room fills it, and it always bleeds away a little
    drives.attention += (ATTENTION_QUIET - ATTENTION_DECAY) * dt;
    drives.energy = clamp(drives.energy, 0, 100);
    drives.boredom = clamp(drives.boredom, 0, 100);
    drives.attention = clamp(drives.attention, 0, 100);
  }

  function phase(t) {
    if (!activity) return null;
    const total = Math.max(1, activity.endsAt - activity.startedAt);
    const p = clamp((t - activity.startedAt) / total, 0, 1);
    if (p < 0.15) return "start";
    if (p > 0.85) return "end";
    return "middle";
  }

  function view(t) {
    const ph = phase(t);
    const target = activity ? (activity.target != null ? activity.target : lastX) : lastX;
    return {
      drives: {
        energy: Math.round(drives.energy * 10) / 10,
        boredom: Math.round(drives.boredom * 10) / 10,
        attention: Math.round(drives.attention * 10) / 10,
      },
      intent: activity
        ? { key: activity.key, phase: ph, x: target }
        : { key: null, phase: null, x: lastX },
      // §3.2: boredom is what makes him fidget faster. The body uses this as its burst interval.
      fidgetEvery: clamp(9 - 0.06 * drives.boredom, 2.5, 9),
      cooldown: activity ? 0 : Math.max(0, (cooldownUntil - t) / 1000),
      traces: traces.slice(),
    };
  }

  return {
    /** One step of his life. `now` is a monotonically increasing stamp in ms. */
    step(nowMs) {
      const t = Number.isFinite(nowMs) ? nowMs : (lastAt ?? 0);
      const dt = lastAt === null ? 0 : Math.min(DT_CLAMP_MS, Math.max(0, t - lastAt)) / 1000;
      lastAt = t;

      decay(dt);

      if (activity && t >= activity.endsAt) close(t, "done");

      // a decision at most every 1.5 s, and never while the cooldown is running
      if (!activity && t - lastDecision >= DECIDE_MS && t >= cooldownUntil) {
        lastDecision = t;
        let best = null;
        let bestScore = -Infinity;
        for (const key of ACTIVITY_KEYS) {
          if (!eligible(key)) continue;
          const s = score(key);
          if (s > bestScore) {
            bestScore = s;
            best = key;
          }
        }
        // §4: a new activity starts only if it is worth starting at all
        if (best && bestScore > 0.30) start(best, t);
      }

      return view(t);
    },
    /** Read-only snapshot, for a probe or a test that does not want to advance time. */
    peek() {
      return view(lastAt ?? 0);
    },
  };
}
