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
 * What is here (§3–§5, §8 in part, §9 via injected targets): the three drives with their real
 * rates and thresholds, `energyFit` / `novelty` / `social` / `routine` / `recency` / `jitter` in
 * the spec's weights, the Lagos day-plan slots and the inferred stream arc (§5 — `routine:
 * false` opts out for clock-independent tests), the `score > 0.30` start rule and the 20 s
 * cooldown, the trace ledger that stops him repeating himself, and the activities whose body
 * verbs already exist: wander, stretch, rest, doze, lean-watch, sit-on, climb, read-card,
 * check-map and workout. `env` is the §5.3 seam — inject flags and the modifiers apply.
 * What is not: the P0–P4 arbitration classes and the formal interruption contract (§6, §7 —
 * the body's cue-yield and stage interrupts cover the same ground today), persistence beyond
 * the being-sync snapshot, and the activities that need props or world objects (drink-water,
 * show-story, letters, drop-backpack, tidy — slice 7).
 *
 * The activity set is the part of §8 that has a body on the rig page — wander, stretch, rest, and,
 * when the page can say which panels are reachable, the three that use one: `lean-watch`, `sit-on`
 * and `climb`. `targets` is injected (the page reads it off the layer registry), so with no panels
 * the three are disqualified rather than scored: offering something he cannot do is worse than
 * offering less.
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
  // §8's panel activities, in the spec's weights. `place` is the kind of panel they need; without
  // one on the desk they are disqualified (§4 cost) rather than scored. `layer` names the one
  // panel the activity is about — it is disqualified unless that exact layer is reachable.
  "lean-watch": { energyNeed: 0.35, novelty: 0.4, social: 0.5, load: 0, bore: 0.0, dur: [10, 26], place: "lean" },
  "sit-on": { energyNeed: 0.30, novelty: 0.7, social: 0.4, load: 0, bore: 0.0, dur: [15, 45], place: "sit" },
  climb: { energyNeed: 0.70, novelty: 0.9, social: 0.3, load: 3.2, bore: 0.0, dur: [10, 30], place: "climb" },
  // The slice-2 additions whose body verbs already exist: doze is the mode he already has,
  // read-card/check-map are stage leans on a named panel, workout is the push-up set he already
  // plays. drink-water/show-story/letters/drop-backpack/tidy stay out — they need props and
  // world objects that do not exist yet (spec §8 notes, slice 7).
  doze: { energyNeed: 0.05, novelty: 0.1, social: 0.0, load: 0, bore: 0.2, dur: [90, 240], recover: 0.012, maxEnergy: 60 },
  "read-card": { energyNeed: 0.50, novelty: 0.5, social: 0.3, load: 0.6, bore: 0.2, dur: [20, 40], place: "lean", layer: "card" },
  "check-map": { energyNeed: 0.35, novelty: 0.6, social: 0.2, load: 0.6, bore: 0.2, dur: [8, 15], place: "lean", layer: "map" },
  workout: { energyNeed: 0.85, novelty: 0.9, social: 0.2, load: 4.5, bore: 0.0, dur: [25, 40], minEnergy: 35 },
};
export const ACTIVITY_KEYS = Object.keys(ACTIVITIES);

/* §5.1 the day plan — five Lagos slots. A slot never forces an activity; it only moves scores
 * (+0.35 preferred, −0.5 forbidden) and scales the matching drive rate (`mood`). `forbid`
 * entries stay breakable at boredom > 80 except doze (§3.2). Lagos is UTC+1 year-round, so the
 * hour and the day boundary are pure arithmetic on the epoch stamp — no Intl, no tz database. */
const SLOTS = [
  { key: "night", from: 0, to: 6, pref: ["doze", "rest"], forbid: ["workout", "show-story"], mood: { energyRecover: 1.5 } },
  { key: "morning", from: 6, to: 9, pref: ["stretch", "drink-water", "workout", "wander"], forbid: ["doze"], mood: { bore: 1.2 } },
  { key: "day", from: 9, to: 17, pref: ["work-at-dock", "read-card", "check-map", "letters"], forbid: ["doze"], mood: { attention: 0.8 } },
  { key: "evening", from: 17, to: 22, pref: ["lean-watch", "show-story", "letters", "read-card"], forbid: [], mood: { attention: 1.3, social: 0.1 } },
  { key: "late", from: 22, to: 24, pref: ["rest", "read-card", "sit-on"], forbid: ["workout"], mood: { energyDecay: 1.1 } },
];
const lagosHour = (now) => (((Math.floor(now / 3600000) + 1) % 24) + 24) % 24;
const lagosDay = (now) => Math.floor((now + 3600000) / 86400000);
const slotAt = (now) => SLOTS.find((s) => lagosHour(now) >= s.from && lagosHour(now) < s.to) || SLOTS[4];

/* §5.3 the environment reaches him. `env` is an injectable seam — the page passes whatever the
 * desk actually knows (a headline worth showing, a weather flag when a feed exists). No feed,
 * no modifier: an empty object changes nothing. */
const ENV_BIAS = {
  rain: { wander: -0.3, "check-map": -0.3, "sit-on": 0.2, "lean-watch": 0.2, "read-card": 0.2 },
  cold: { wander: -0.3, "check-map": -0.3, "sit-on": 0.2, "lean-watch": 0.2, "read-card": 0.2 },
  heat: { "drink-water": 0.5, workout: -0.3 },
  holiday: { wander: 0.2 },
};
const envBiasOf = (flags, key) => {
  let b = 0;
  for (const f of flags || []) b += (ENV_BIAS[f] || {})[key] || 0;
  return b;
};

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

export function createBeing({ rng = Math.random, now = 0, drives: seedDrives = {}, cooldownMs = COOLDOWN_MS, settleMs = 2500, targets = null, lastX: seedLastX = null, env = null, arc: seedArc = null, routine: useRoutine = true, activity: seedActivity = null } = {}) {
  const drives = {
    energy: Number.isFinite(seedDrives.energy) ? seedDrives.energy : 62,
    boredom: Number.isFinite(seedDrives.boredom) ? seedDrives.boredom : 70,
    attention: Number.isFinite(seedDrives.attention) ? seedDrives.attention : 35,
  };
  const traces = [];                 // newest first
  let lastAt = null;
  let lastDecision = -Infinity;
  let cooldownUntil = now + settleMs;   // he settles in before the first decision
  let activity = null;               // { key, startedAt, endsAt, target, layer }
  // §10: a reload mid-activity restores it, not restarts it — the snapshot carries the same
  // {key, startedAt, endsAt, layer} the live activity holds. An expired or unknown key is
  // ignored, and restoring does not re-pay the boredom relief or the cooldown (close() sets
  // those when the restored activity actually ends).
  if (seedActivity && ACTIVITIES[seedActivity.key]
    && Number.isFinite(seedActivity.startedAt) && Number.isFinite(seedActivity.endsAt)
    && seedActivity.endsAt > now) {
    activity = {
      key: seedActivity.key,
      startedAt: seedActivity.startedAt,
      endsAt: seedActivity.endsAt,
      target: null,
      layer: typeof seedActivity.layer === "string" ? seedActivity.layer : null,
    };
  }
  // The floor spot he is standing on, 0..1 across the roam band. A saved snapshot can hand it
  // back in (state.bot.being.floorX is the same number the page measured off his host element);
  // peek()/step() already expose it as intent.x, so seeding it here keeps the brain's idea of
  // where he is and the body's actual spot telling the same story.
  let lastX = Number.isFinite(seedLastX) ? clamp(seedLastX, 0, 1) : 0.5;

  /* §5.2 the stream arc, inferred: the first desk/chat signal opens it, 15 quiet minutes close
   * it. `cur` is refreshed once per step — the slot, the arc act and the env flags all move on
   * the same clock the drives do, so a decision never reads two different times. */
  let arc = seedArc && Number.isFinite(seedArc.startedAt) && Number.isFinite(seedArc.lastAt)
    ? { startedAt: seedArc.startedAt, lastAt: seedArc.lastAt } : { startedAt: null, lastAt: null };
  let cur = { slot: null, mood: {}, arc: null, env: [] };
  const computeNow = (t) => {
    const slot = useRoutine ? slotAt(t) : null;
    const quiet = arc.startedAt == null ? Infinity : t - arc.lastAt;
    const act = arc.startedAt == null || quiet > 15 * 60e3 ? null
      : t - arc.startedAt < 10 * 60e3 ? "arrival"
      : quiet > 10 * 60e3 ? "wind-down" : "body";
    let flags = [];
    try { const e = env?.(); flags = Array.isArray(e) ? e : e ? Object.keys(e).filter((k) => e[k]) : []; } catch { flags = []; }
    cur = { slot, mood: (slot && slot.mood) || {}, arc: act, env: flags, day: lagosDay(t) };
  };
  /* A desk/chat signal — called by the body when a cue or reaction actually lands. The arc is
   * the only thing it feeds; drives are untouched by it directly. */
  const noteSignal = (t) => {
    const at = Number.isFinite(t) ? t : (lastAt ?? 0);
    if (arc.startedAt == null) arc = { startedAt: at, lastAt: at };
    else arc.lastAt = at;
    computeNow(at);
  };

  const pick = (a, b) => a + rng() * (b - a);

  /* The panels he can actually reach, as the page sees them right now. Injected, so the brain stays
   * free of the DOM, and absent when the page has no desk to stand on. */
  function places(kind) {
    if (!targets) return [];            // no desk to stand on: every panel activity is disqualified
    const all = targets();
    const list = all && all[kind];
    return Array.isArray(list) ? list : [];
  }

  function eligible(key) {
    const a = ACTIVITIES[key];
    // §3.1: spent means only rest is on the table.
    if (drives.energy < 20) return key === "rest";
    // §5.2 wind-down rests the body: no workouts while the arc is closing.
    if (cur.arc === "wind-down" && key === "workout") return false;
    // Activity gates beyond the energy floor: doze is for a body with nothing
    // left to give (or the night slot's preference), workout needs a real engine.
    if (a.maxEnergy != null && drives.energy > a.maxEnergy) return false;
    if (a.minEnergy != null && drives.energy < a.minEnergy) return false;
    // §4 cost: an activity whose panel is not on the desk is disqualified, not scored.
    // `layer` narrows it to the one panel the activity is actually about.
    if (a.place) {
      const list = places(a.place);
      if (a.layer ? !list.includes(a.layer) : !list.length) return false;
    }
    return true;
  }

  function recency(key) {
    const i = traces.findIndex((t) => t.key === key);
    if (i < 0) return 0.40;          // not in the last three
    if (i === 0) return -0.60;       // he does not repeat himself
    if (i === 1) return -0.30;
    return -0.15;
  }

  /* §4 routine(A): +0.35 preferred by the live slot, −0.5 forbidden. At boredom > 80 he may
   * break a forbidden entry (§3.2) — except doze, which stays where the slot put it. */
  function routine(key) {
    const s = cur.slot;
    if (!s) return 0;
    if (s.pref.includes(key)) return 0.35;
    if (s.forbid.includes(key)) return drives.boredom > 80 && key !== "doze" ? 0 : -0.5;
    return 0;
  }

  /* §5.2 arc bias: arrival settles him into the room, wind-down puts it back. */
  function arcBias(key) {
    if (cur.arc === "arrival") return ["drink-water", "stretch", "wander", "check-map"].includes(key) ? 0.4 : 0;
    if (cur.arc === "wind-down") return ["tidy", "rest", "sit-on"].includes(key) ? 0.5 : 0;
    return 0;
  }

  function score(key) {
    const a = ACTIVITIES[key];
    const fit = 1 - Math.abs(drives.energy / 100 - a.energyNeed);
    return (
      0.9 * fit +
      1.1 * (drives.boredom / 100) * a.novelty +
      0.8 * (drives.attention / 100) * (a.social + (cur.mood.social || 0)) +
      routine(key) +
      arcBias(key) +
      envBiasOf(cur.env, key) +
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
    const list = a.place ? places(a.place) : null;
    activity = {
      key,
      startedAt: t,
      endsAt: t + ms,
      target: key === "wander" ? pickTarget() : null,
      // the panel this one is about: a named-layer activity goes to its one panel or nowhere;
      // otherwise the lowest reachable one first for a climb (a step up he can actually make),
      // anything reachable otherwise. The body chooses the side it stands on.
      layer: list && list.length
        ? (a.layer ? (list.includes(a.layer) ? a.layer : null)
          : key === "climb" ? list[0] : list[(rng() * list.length) | 0])
        : null,
    };
    drives.boredom = clamp(drives.boredom - BORE_RELIEF, 0, 100);
  }

  function close(t, outcome, reason) {
    if (!activity) return;
    traces.unshift({
      key: activity.key,
      startedAt: activity.startedAt,
      endedAt: t,
      outcome,
      ...(reason ? { reason } : {}),
    });
    traces.length = Math.min(traces.length, TRACE_KEEP);
    if (activity.key === "wander" && activity.target != null) lastX = activity.target;
    activity = null;
    cooldownUntil = t + cooldownMs;
  }

  function decay(dt) {
    const a = activity ? ACTIVITIES[activity.key] : null;
    const mood = cur.mood || {};
    // energy: rest recovers (faster on the night slot), everything else costs (slower than
    // spec when the late slot's ×1.1 is not live), standing still costs the idle load
    if (a && a.recover) drives.energy += a.recover * (mood.energyRecover || 1) * dt;
    else drives.energy -= ENERGY_DECAY * (a ? a.load : 1.0) * (mood.energyDecay || 1) * dt;
    // boredom: nothing running is the boring case; some activities are quiet ones
    drives.boredom += (a ? a.bore : BORE_QUIET) * (mood.bore || 1) * dt;
    // attention: the quiet room fills it, and it always bleeds away a little
    drives.attention += (ATTENTION_QUIET - ATTENTION_DECAY) * (mood.attention || 1) * dt;
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
        ? { key: activity.key, phase: ph, x: target, layer: activity.layer || null }
        : { key: null, phase: null, x: lastX, layer: null },
      // §3.2: boredom is what makes him fidget faster. The body uses this as its burst interval.
      fidgetEvery: clamp(9 - 0.06 * drives.boredom, 2.5, 9),
      cooldown: activity ? 0 : Math.max(0, (cooldownUntil - t) / 1000),
      // §10: the activity in flight, so the save file can hand it back on the next boot.
      activity: activity ? { key: activity.key, startedAt: activity.startedAt, endsAt: activity.endsAt, layer: activity.layer || null } : null,
      // §5 for the probe and the save file: which slot he is in, which arc act is live, and
      // the raw arc stamps so a reload can pick the same story back up.
      routine: {
        slot: cur.slot ? cur.slot.key : null,
        arc: cur.arc,
        env: cur.env.slice(),
        day: cur.day ?? null,
        arcAt: arc.startedAt == null ? null : { startedAt: arc.startedAt, lastAt: arc.lastAt },
      },
      traces: traces.slice(),
    };
  }

  return {
    /** One step of his life. `now` is a monotonically increasing stamp in ms. */
    step(nowMs) {
      const t = Number.isFinite(nowMs) ? nowMs : (lastAt ?? 0);
      const dt = lastAt === null ? 0 : Math.min(DT_CLAMP_MS, Math.max(0, t - lastAt)) / 1000;
      lastAt = t;
      computeNow(t);

      decay(dt);

      if (activity && t >= activity.endsAt) close(t, "done");

      // a decision at most every 1.5 s, and never while the cooldown is running
      if (!activity && t - lastDecision >= DECIDE_MS && t >= cooldownUntil) {
        lastDecision = t;
        let best = null;
        let bestScore = -Infinity;
        // §3.2 climbing the walls: past boredom 80 the highest-novelty eligible activity wins
        // outright, even out of its routine slot — doze stays barred by its own energy gate.
        if (drives.boredom > 80) {
          for (const key of ACTIVITY_KEYS) {
            if (!eligible(key) || ACTIVITIES[key].novelty <= 0.85) continue;
            if (!best || ACTIVITIES[key].novelty > ACTIVITIES[best].novelty) best = key;
          }
          if (best) bestScore = 1;   // outright: the score gate does not apply (§3.2)
        }
        if (!best) {
          for (const key of ACTIVITY_KEYS) {
            if (!eligible(key)) continue;
            const s = score(key);
            if (s > bestScore) {
              bestScore = s;
              best = key;
            }
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
    /** A desk/chat signal landed — opens or extends the inferred stream arc (§5.2). */
    noteSignal(t) { noteSignal(t); },
    /** The activity in flight ends here, and not by finishing: the body reports why. §7.3, §9.5. */
    interrupt(reason = "layer-gone") {
      if (!activity) return null;
      const key = activity.key;
      close(lastAt ?? 0, "abandoned", reason);
      return key;
    },
  };
}
