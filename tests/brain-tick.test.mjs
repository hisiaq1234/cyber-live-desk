// The deployed tick: one step of the initiative engine, on a schedule, with nobody typing.
//
// The break this guards: brain/ only ever ran as a local Node process, so on the deployed desk
// `state.bot.cue` was never written by the brain and CRID stood still until someone sent a command.
// The risk of the fix is the opposite one — a tick that starts a brand-new session every minute
// (so the silence rules measure no silence and he never speaks), or that posts a cue the overlay
// cannot perform.

import test from "node:test";
import assert from "node:assert/strict";

import { BOT_CUES } from "../api/_desk-core.mjs";
import { BRAIN_KEY, cueFor, runBrainTick } from "../api/brain-tick.mjs";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const FIVE_MIN = 300_000;

const makeStore = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return {
    async get(key, opts) {
      const v = m.get(key);
      if (v == null) return null;
      return opts?.type === "json" ? JSON.parse(v) : v;
    },
    async setJSON(key, value) {
      m.set(key, JSON.stringify(value));
    },
    read: (key) => (m.has(key) ? JSON.parse(m.get(key)) : null),
  };
};

// A session that has already been running for five minutes with an empty room: exactly the state a
// real desk is in when CRID should be the one to say something.
const quietSession = (startedAt) => ({
  v: 1,
  savedAt: startedAt,
  memory: {
    startedAt,
    chat: [],
    moments: [],
    actions: [],
    notable: [],
    seen: [],
    topics: [],
    counters: { messages: 0, subs: 0, gifts: 0, bits: 0, raids: 0, actions: 0 },
    lastChatTs: 0,
    lastActionTs: 0,
    momentSeq: 0,
  },
  engine: { lastFired: [], ruleFires: [], lastActionAt: 0, actionTimes: [] },
  micro: { nextAt: 0, fires: [], lastAt: [], lastEmotion: null, chatCount: 0, lastMomentId: null, last: null },
});

test("one tick advances the engine and posts what it emits as a cue on the live desk", async () => {
  const store = makeStore({ [BRAIN_KEY]: JSON.stringify(quietSession(NOW - FIVE_MIN)) });

  const result = await runBrainTick({ store, now: () => NOW });

  // The engine, not this file, decided: an unprompted quiet rule won the tick.
  assert.equal(result.fired, "long-silence", "five minutes of silence must produce an unprompted action");
  assert.ok(result.cue, "a fired action must reach the desk as a cue");
  assert.equal(result.cue.name, "say", "a line is what reads as performing on stream");
  assert.ok(result.cue.text.length > 0, "the cue must carry the line he actually said");
  assert.ok(BOT_CUES.includes(result.cue.name), "the cue name must be one the overlay renders");

  // It went through the desk's own bot-cue action, so the overlay picks it up on its next poll.
  const state = store.read("state");
  assert.equal(state.bot.cue.name, "say");
  assert.equal(state.bot.cue.text, result.cue.text);

  // The session is carried into the next invocation, and this tick is one action older.
  const saved = store.read(BRAIN_KEY);
  assert.equal(saved.memory.startedAt, NOW - FIVE_MIN, "the session must not restart on every tick");
  assert.equal(saved.memory.counters.actions, 1, "one tick is one step, not a loop");
  assert.ok(saved.engine.lastActionAt === NOW, "the cooldown clock must survive the invocation");
});

test("a tick that emits nothing posts no cue", async () => {
  const store = makeStore({ [BRAIN_KEY]: JSON.stringify(quietSession(NOW)) });
  const result = await runBrainTick({ store, now: () => NOW });
  assert.equal(result.fired, null);
  assert.equal(result.cue, null);
  assert.equal(store.read("state"), null, "a quiet tick must not touch the desk state");
  assert.ok(store.read(BRAIN_KEY), "even a quiet tick keeps the session");
});

test("every cue the engine can produce is a name the desk accepts", () => {
  // The three shapes the quiet and reactive rules actually emit.
  assert.deepEqual(cueFor([{ type: "say", payload: { text: " still here. " } }]), { name: "say", text: "still here." });
  assert.deepEqual(cueFor([{ type: "gesture", payload: { type: "double-take" } }]), { name: "surprise" });
  assert.deepEqual(cueFor([{ type: "micro", payload: { emotion: "sleepy" } }]), { name: "sleepy" });
  assert.deepEqual(cueFor([{ type: "gesture", payload: { type: "not-a-real-gesture" } }]), null);
  for (const envelope of [{ type: "gesture", payload: { type: "cheer" } }, { type: "express", payload: { emotion: "pleased" } }]) {
    assert.ok(BOT_CUES.includes(cueFor([envelope]).name));
  }
});
