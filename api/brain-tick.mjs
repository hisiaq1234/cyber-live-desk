// CYBER LIVE DESK — the unprompted tick, on the deployed desk.
//
// brain/ is the initiative loop, but until now it only ran as a local Node process: nothing in
// api/ imported it, so on the deployed desk no cue was ever posted and CRID never acted unless
// someone typed a command. This function is that missing wire and nothing more — one scheduled
// call, one step of the engine that already exists, one cue into the state the overlay polls.
//
//   cron → runBrainTick() → engine.tick() → runAction({ action: "bot-cue" }) → state.bot.cue
//
// The engine is stepped, not rewritten: `tick()` is a public method (brain/engine.mjs) and the
// quiet rules it runs are exactly the ones the local brain runs. Its rules, timings, cooldowns
// and personality are untouched.
//
// A serverless invocation has no memory of the last one, so the engine's session memory, its
// cooldowns and the micro-emotion pacing are snapshotted into the same store the desk already
// uses (key "brain") and restored on the next tick. Without that, every tick would start a brand
// new session with `startedAt = now`, the silence rules would measure zero silence, and CRID
// would never speak.
//
// Env: CRON_SECRET (optional; Vercel sends x-vercel-cron on its own cron calls), and the usual
// Upstash KV_REST_API_URL / KV_REST_API_TOKEN via _store.mjs.

import { getStore } from "./_store.mjs";
import { BOT_CUES, runAction } from "./_desk-core.mjs";
import { CommandBus } from "../brain/commands.mjs";
import { SessionMemory } from "../brain/memory.mjs";
import { InitiativeEngine } from "../brain/engine.mjs";
import { Personality, PERSONALITY_PATH, loadPersonality } from "../brain/personality.mjs";
import personalityData from "../brain/crid-personality.json" with { type: "json" };

export const config = { runtime: "nodejs" };

/** Where the engine's session lives between ticks. Namespaced by _store.mjs ("cld:"). */
export const BRAIN_KEY = "brain";

/* ---------- engine commands → the cues the desk overlay can perform ---------- */

// brain/commands.mjs names gestures by intent ("double-take", "lean-in"); the overlay names its
// sequences (public/desk-assets/crid-bot.js → CUE_NAMES, mirrored by BOT_CUES). Only the ones both
// sides agree on are translated — an unknown gesture is dropped rather than guessed at on air.
const GESTURE_CUES = {
  wave: "wave",
  cheer: "cheer",
  nod: "nod",
  hop: "hop",
  jump: "jump",
  shrug: "shrug",
  sit: "sit",
  stand: "stand",
  salute: "salute",
  peek: "peek",
  kick: "kick",
  crawl: "crawl",
  "double-take": "surprise",
  "lean-in": "think",
};

// Expressions are a mood, not a sequence. These are the moods with an honest one-word equivalent.
const EXPRESS_CUES = {
  excited: "cheer",
  pleased: "nod",
  delighted: "delighted",
  thinking: "think",
  deadpan: "sideeye",
  curious: "curious",
  surprised: "surprise",
  sad: "wince",
};

/**
 * The one thing CRID performs this tick, from the envelopes the engine just emitted.
 *
 * The desk state holds a single one-shot cue, so a tick posts at most one: the line if he has
 * one (that is what reads as performing on stream), otherwise a gesture, otherwise a
 * micro-emotion, otherwise an expression. Everything else the engine emits — presence, look,
 * effects, layer moves — has no cue equivalent and is simply not posted.
 */
export function cueFor(envelopes = []) {
  const list = Array.isArray(envelopes) ? envelopes.filter(Boolean) : [];
  const said = list.find((e) => e.type === "say" && String(e.payload?.text ?? "").trim());
  if (said) return { name: "say", text: String(said.payload.text).trim() };
  for (const e of list) {
    if (e.type !== "gesture") continue;
    const name = GESTURE_CUES[e.payload?.type];
    if (name) return { name };
  }
  for (const e of list) {
    if (e.type !== "micro") continue;
    const name = e.payload?.emotion;
    if (BOT_CUES.includes(name)) return { name };
  }
  for (const e of list) {
    if (e.type !== "express") continue;
    const name = EXPRESS_CUES[e.payload?.emotion];
    if (name) return { name };
  }
  return null;
}

/* ---------- session, carried between invocations ---------- */

/** Everything the engine learned, so the next tick continues this session rather than starting one. */
export function snapshotBrain(engine, now = Date.now()) {
  const m = engine.memory;
  const micro = engine.micro;
  return {
    v: 1,
    savedAt: now,
    memory: {
      startedAt: m.startedAt,
      chat: m.chat,
      moments: m.moments,
      actions: m.actions,
      notable: m.notable,
      seen: [...m.seen],
      topics: [...m.topics].map(([word, t]) => [word, { ...t, users: [...t.users] }]),
      counters: m.counters,
      lastChatTs: m.lastChatTs,
      lastActionTs: m.lastActionTs,
      momentSeq: m.momentSeq,
    },
    engine: {
      lastFired: [...engine.lastFired],
      ruleFires: [...engine.ruleFires],
      lastActionAt: engine.lastActionAt,
      actionTimes: engine.actionTimes,
    },
    micro: {
      nextAt: micro.nextAt,
      fires: micro.fires,
      lastAt: [...micro.lastAt],
      lastEmotion: micro.lastEmotion,
      chatCount: micro.chatCount,
      lastMomentId: micro.lastMomentId,
      last: micro.last,
    },
  };
}

/** Put a snapshot back on a fresh engine. Anything missing stays at its constructor value. */
export function restoreBrain(engine, saved) {
  if (!saved || typeof saved !== "object") return engine;
  const m = engine.memory;
  const s = saved.memory || {};
  if (Number.isFinite(s.startedAt)) m.startedAt = s.startedAt;
  for (const key of ["chat", "moments", "actions", "notable"]) if (Array.isArray(s[key])) m[key] = s[key];
  if (Array.isArray(s.seen)) m.seen = new Map(s.seen);
  if (Array.isArray(s.topics)) m.topics = new Map(s.topics.map(([word, t]) => [word, { ...t, users: new Set(t?.users ?? []) }]));
  if (s.counters && typeof s.counters === "object") m.counters = { ...m.counters, ...s.counters };
  if (Number.isFinite(s.lastChatTs)) m.lastChatTs = s.lastChatTs;
  if (Number.isFinite(s.lastActionTs)) m.lastActionTs = s.lastActionTs;
  if (Number.isFinite(s.momentSeq)) m.momentSeq = s.momentSeq;

  const e = saved.engine || {};
  if (Array.isArray(e.lastFired)) engine.lastFired = new Map(e.lastFired);
  if (Array.isArray(e.ruleFires)) engine.ruleFires = new Map(e.ruleFires);
  if (Number.isFinite(e.lastActionAt)) engine.lastActionAt = e.lastActionAt;
  if (Array.isArray(e.actionTimes)) engine.actionTimes = e.actionTimes;

  const micro = saved.micro || {};
  const d = engine.micro;
  if (Number.isFinite(micro.nextAt)) d.nextAt = micro.nextAt;
  if (Array.isArray(micro.fires)) d.fires = micro.fires;
  if (Array.isArray(micro.lastAt)) d.lastAt = new Map(micro.lastAt);
  if (micro.lastEmotion !== undefined) d.lastEmotion = micro.lastEmotion;
  if (Number.isFinite(micro.chatCount)) d.chatCount = micro.chatCount;
  if (micro.lastMomentId !== undefined) d.lastMomentId = micro.lastMomentId;
  if (micro.last !== undefined) d.last = micro.last;
  return engine;
}

/**
 * The personality file is read from disk by brain/personality.mjs. If the deployed bundle does not
 * carry it as a file, the same JSON is imported statically, so a tick can never fail over that.
 */
function currentPersonality() {
  try {
    return loadPersonality();
  } catch {
    return new Personality(personalityData, PERSONALITY_PATH);
  }
}

/**
 * One step. Advances the engine once, applies whatever it emitted as a cue, saves the session.
 * Returns what happened, so the cron response (and a test) can see it.
 */
export async function runBrainTick({ store = getStore(), now = Date.now, log = null } = {}) {
  const saved = await store.get(BRAIN_KEY, { type: "json" });
  const lines = [];
  const record = (line) => {
    lines.push(String(line));
    log?.(String(line));
  };

  const memory = new SessionMemory({ now });
  const bus = new CommandBus({ now });
  const engine = new InitiativeEngine({ memory, personality: currentPersonality(), bus, now, log: record });
  restoreBrain(engine, saved);

  let fired = null;
  const emitted = [];
  engine.onAction = (action, envelopes) => {
    fired = action?.rule ?? null;
    if (Array.isArray(envelopes)) emitted.push(...envelopes);
  };

  engine.tick();

  const cue = cueFor(emitted);
  let posted = null;
  if (cue) {
    const result = await runAction(store, { action: "bot-cue", ...cue }, now());
    posted = result.state?.bot?.cue ?? null;
  }

  await store.setJSON(BRAIN_KEY, snapshotBrain(engine, now()));
  return { ok: true, fired, cue: posted, commands: emitted.map((e) => e.type), log: lines };
}

const handler = async (req) => {
  // Vercel cron jobs call the function via GET with a special header; anything else has to bring
  // the secret, exactly like the auto-research cron.
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && req.headers.get("x-vercel-cron") !== "1") {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await runBrainTick({ log: (line) => console.log(`[brain-tick] ${line}`) });
    return Response.json(result);
  } catch (err) {
    console.error("[brain-tick] failed:", err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
};

export default { fetch: handler };
