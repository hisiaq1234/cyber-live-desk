/* Micro-emotions — the quiet layer, deterministically tested.
 *
 * Four things have to be true or the layer is a lie:
 *   1. It has a real vocabulary of small, brief, named feelings, and every one of them
 *      has something for the renderer to draw (a pose and a shape) — no orphan names.
 *   2. It fires from signals the engine already receives, and from nothing else.
 *   3. It is rate-limited hard, and near-silent when the stream is idle.
 *   4. It never takes the floor from the loud layer: a big reaction always wins, and a
 *      micro-emotion never spends the action budget or writes to the moment record.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { InitiativeEngine } from "../engine.mjs";
import { SessionMemory } from "../memory.mjs";
import { CommandBus, isValidCommand, PRIORITY, micro } from "../commands.mjs";
import { loadPersonality, Personality } from "../personality.mjs";
import { MICRO_NAMES, DEFAULT_MICRO_EMOTIONS, MicroEmotionDriver, normaliseMicroEmotions } from "../micro-emotions.mjs";

const shipped = loadPersonality();

const personalityWith = (patch) => {
  const raw = JSON.parse(JSON.stringify(shipped.data));
  raw.microEmotions = { ...raw.microEmotions, ...patch };
  if (patch.emotions) raw.microEmotions.emotions = patch.emotions;
  return new Personality(raw);
};

function driverHarness({ personality = shipped, random = () => 0 } = {}) {
  let t = 1_000_000;
  const memory = new SessionMemory({ now: () => t });
  const driver = new MicroEmotionDriver({ personality: () => personality, now: () => t, random });
  return {
    memory,
    driver,
    now: () => t,
    advance: (ms) => (t += ms),
    say(user, text) {
      memory.recordChat({ ts: t, user, text });
    },
    step: () => driver.step({ memory }),
  };
}

function harness({ timings = {}, personality = shipped, start = 1_000_000 } = {}) {
  let t = start;
  const logs = [];
  const memory = new SessionMemory({ now: () => t });
  const bus = new CommandBus({ now: () => t });
  const engine = new InitiativeEngine({
    memory,
    personality,
    bus,
    now: () => t,
    log: (line) => logs.push(line),
    timings: { minActionGapMs: 0, maxActionsPerMinute: 60, ...timings },
    random: () => 0,
  });
  const emitted = [];
  bus.onCommand((c) => emitted.push(c));
  return {
    engine,
    memory,
    bus,
    emitted,
    logs,
    now: () => t,
    advance: (ms) => (t += ms),
    chat(user, text) {
      engine.handleEvent({ id: `c${t}${user}`, type: "chat", ts: t, user, text, amount: 0 });
    },
    event(type, extra = {}) {
      engine.handleEvent({ id: `e${t}`, type, ts: t, user: "someone", text: "", amount: 0, ...extra });
    },
    micros: () => emitted.filter((c) => c.type === "micro"),
  };
}

/* ---------- 1. the vocabulary ---------- */

test("the vocabulary is eight named miniature feelings", () => {
  assert.equal(MICRO_NAMES.length, 8);
  assert.deepEqual(MICRO_NAMES, ["curious", "delighted", "smug", "flustered", "sleepy", "startled", "proud", "sulky"]);
  for (const name of MICRO_NAMES) {
    const cfg = shipped.microEmotion(name);
    assert.equal(cfg.enabled, true, `${name} ships enabled`);
    assert.ok(cfg.weight > 0, `${name} has a weight`);
    assert.ok(cfg.cooldownMs > 0, `${name} has its own cooldown`);
    assert.ok(cfg.lines.length > 0, `${name} has lines in the personality file`);
    assert.ok(cfg.duration <= 2000, `${name} is brief (${cfg.duration}ms)`);
  }
});

test("every emotion the vocabulary can name has something for the renderer to draw", async () => {
  const js = await readFile(new URL("../overlay.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../overlay.css", import.meta.url), "utf8");
  const start = js.indexOf("const MICRO = {");
  assert.ok(start > 0, "the renderer has a MICRO map");
  const block = js.slice(start, js.indexOf("\n};", start));
  const shapes = new Set();
  for (const name of MICRO_NAMES) {
    const entry = block.match(new RegExp(`\\b${name}:\\s*\\{([^}]*)\\}`));
    assert.ok(entry, `${name} is in the renderer's MICRO map`);
    assert.match(entry[1], /pose:\s*"/, `${name} has a body pose`);
    const shape = entry[1].match(/shape:\s*"(\w+)"/);
    assert.ok(shape, `${name} has a shape`);
    shapes.add(shape[1]);
  }
  for (const shape of shapes) {
    assert.ok(css.includes(`data-shape="${shape}"`), `overlay.css draws the "${shape}" shape`);
  }
});

test("a duration is clamped to the two-second contract, whatever the config says", () => {
  const cfg = normaliseMicroEmotions({ emotions: { curious: { duration: 30_000 }, sleepy: { duration: 10 } } });
  assert.equal(cfg.emotions.curious.duration, 2000);
  assert.equal(cfg.emotions.sleepy.duration, 400);
});

test("the owner can retune pacing, weights, cooldowns and lines without touching the engine", () => {
  const cfg = normaliseMicroEmotions({
    minGapMs: 9000,
    maxGapMs: 3000, // nonsense: the floor wins
    idleGapMs: 90_000,
    maxPerMinute: 2,
    caption: false,
    emotions: { smug: { weight: 0, cooldownMs: 500, lines: ["told you."] }, sulky: { enabled: false } },
  });
  assert.equal(cfg.minGapMs, 9000);
  assert.equal(cfg.maxGapMs, 9000, "maxGapMs can never be below minGapMs");
  assert.equal(cfg.idleGapMs, 90_000);
  assert.equal(cfg.maxPerMinute, 2);
  assert.equal(cfg.caption, false);
  assert.equal(cfg.emotions.smug.weight, 0);
  assert.equal(cfg.emotions.smug.cooldownMs, 500);
  assert.deepEqual(cfg.emotions.smug.lines, ["told you."]);
  assert.equal(cfg.emotions.sulky.enabled, false);
  // everything the owner did not mention keeps its default
  assert.deepEqual(cfg.emotions.curious, DEFAULT_MICRO_EMOTIONS.emotions.curious);
});

test("an emotion name outside the vocabulary is ignored, never invented", () => {
  const cfg = normaliseMicroEmotions({ emotions: { furious: { weight: 9, lines: ["no"] } } });
  assert.equal("furious" in cfg.emotions, false);
  assert.equal(Object.keys(cfg.emotions).length, MICRO_NAMES.length);
});

test("micro lines go through the same never guard as every other line", () => {
  const p = personalityWith({ emotions: { curious: { lines: ["hurry up, chat"] } } });
  assert.equal(p.microLine("curious"), "", "a banned line degrades to silence");
});

/* ---------- 2. the signals ---------- */

test("a question mark in chat gets a curious", () => {
  const h = driverHarness();
  h.say("mira", "is that the boss phase two?");
  const cand = h.step();
  assert.equal(cand.emotion, "curious");
  assert.match(cand.why, /question mark/);
  assert.ok(cand.line.length > 0, "the caption comes from the personality file");
});

test("a configured keyword fires the feeling its mood names", () => {
  const h = driverHarness();
  h.say("kay", "gg");
  const cand = h.step();
  assert.equal(cand.emotion, "proud");
  assert.match(cand.why, /keyword "gg"/);
});

test("a falling message rate makes him smug", () => {
  const h = driverHarness();
  for (let i = 0; i < 4; i++) {
    h.say(`u${i}`, "the boss phase two");
    h.advance(1000);
  }
  h.step(); // the burst itself is flustered
  h.advance(8000);
  const cand = h.step();
  assert.equal(cand.emotion, "smug");
  assert.match(cand.why, /settled/);
});

test("a busy room going quiet makes him sulky", () => {
  const h = driverHarness({ personality: personalityWith({ emotions: { smug: { enabled: false } } }) });
  for (let i = 0; i < 4; i++) {
    h.say(`u${i}`, "the boss phase two");
    h.advance(1000);
  }
  h.step();
  h.advance(8000);
  const cand = h.step();
  assert.equal(cand.emotion, "sulky");
});

test("deep silence makes him sleepy, and the idle gap takes over", () => {
  const h = driverHarness();
  h.say("dave", "hi");
  assert.equal(h.step(), null, "nothing to feel yet");
  h.advance(30_000);
  const cand = h.step();
  assert.equal(cand.emotion, "sleepy");
  assert.match(cand.why, /no chat for 30s/);
  assert.equal(h.driver.nextAt - h.now(), shipped.microEmotions.idleGapMs, "near-silence when the stream is idle");
});

test("a moment's quiet after-beat comes from the moment itself", () => {
  const h = driverHarness();
  h.memory.recordNotable({ ts: h.now(), type: "sub", user: "dave", detail: "new sub" });
  h.step(); // too early: the loud reaction has the floor
  assert.equal(h.driver.last, null, "the lead-in keeps the loud reaction's moment");
  h.advance(2500);
  const cand = h.step();
  assert.equal(cand.emotion, "proud");
  assert.match(cand.why, /after the big one/);
});

/* ---------- 3. pacing ---------- */

test("the minimum gap holds a second feeling back", () => {
  const h = driverHarness();
  h.say("mira", "what?");
  assert.equal(h.step().emotion, "curious");
  h.advance(1000);
  h.say("kay", "gg");
  assert.equal(h.step(), null, "one every 4-12s, not one per message");
  h.advance(4000);
  h.say("reg", "gg");
  assert.equal(h.step().emotion, "proud");
});

test("the same feeling never plays twice in a row", () => {
  const h = driverHarness({ personality: personalityWith({ emotions: { curious: { cooldownMs: 0 } } }) });
  h.say("mira", "what?");
  assert.equal(h.step().emotion, "curious");
  h.advance(5000); // past the gap and past its cooldown, but inside the startle window
  h.say("nova", "and now?");
  assert.equal(h.step(), null, "the same feeling is not repeated back to back");
  h.advance(5000);
  h.say("kay", "gg");
  assert.equal(h.step().emotion, "proud", "a different signal still gets through");
});

test("the per-minute ceiling caps a hyperactive chat", () => {
  const zeroCooldowns = Object.fromEntries(MICRO_NAMES.map((n) => [n, { ...shipped.microEmotion(n), cooldownMs: 0 }]));
  const h = driverHarness({ personality: personalityWith({ maxPerMinute: 3, minGapMs: 1000, maxGapMs: 1000, emotions: zeroCooldowns }) });
  let fired = 0;
  for (const text of ["what?", "gg", "lag", "clutch", "bug", "died"]) {
    h.say(`u${fired}`, text);
    h.advance(1000);
    if (h.step()) fired += 1;
  }
  assert.equal(fired, 3, "three a minute, not six");
});

test("weight 0 switches a feeling off without touching the engine", () => {
  const h = driverHarness({ personality: personalityWith({ emotions: { curious: { weight: 0 } } }) });
  h.say("mira", "what?");
  assert.equal(h.step(), null, "curious is disabled by its weight");
});

test("weights bias which feeling wins when several are eligible", () => {
  // "gg?" is both a question (curious) and a configured keyword (proud).
  const low = driverHarness({ random: () => 0 });
  low.say("kay", "gg?");
  assert.equal(low.step().emotion, "curious");

  const high = driverHarness({ random: () => 0.9 });
  high.say("kay", "gg?");
  assert.equal(high.step().emotion, "proud", "a heavier/lighter weight changes the pick");
});

test("a disabled layer does nothing at all", () => {
  const h = driverHarness({ personality: personalityWith({ enabled: false }) });
  h.say("mira", "what?");
  assert.equal(h.step(), null);
});

/* ---------- 4. the engine wiring ---------- */

test("a micro-emotion is a real command on the existing envelope", () => {
  const h = harness();
  h.chat("mira", "is that the boss phase two?");
  h.engine.tick();
  const [cmd] = h.micros();
  assert.ok(cmd, "a micro command was sent");
  assert.equal(cmd.payload.emotion, "curious");
  assert.ok(cmd.payload.line.length > 0);
  assert.equal(cmd.priority, PRIORITY.micro);
  assert.equal(cmd.interrupt, "none", "a small feeling never cuts anything");
  assert.equal(cmd.ttl, shipped.microEmotion("curious").duration);
  assert.ok(isValidCommand(cmd));
  assert.match(h.logs.join("\n"), /▲ micro-emotion:curious · p20 · quiet — why: /);
});

test("the quiet layer never takes the floor from the loud one", () => {
  const h = harness({ timings: { musingMs: 10_000, longSilenceMs: 10 ** 9, callbackAgeMs: 10 ** 9, recapLullMs: 10 ** 9 } });
  h.chat("a", "hi");
  h.chat("b", "hi");
  h.advance(30_000); // deep enough for both a musing AND a sleepy
  const winner = h.engine.tick();
  assert.equal(winner.rule, "musing", "the loud loop had something to say");
  assert.equal(h.micros().length, 0, "so the quiet layer stayed silent");

  h.advance(5_000);
  assert.equal(h.engine.tick(), null, "the loud loop has nothing now");
  assert.equal(h.micros()[0].payload.emotion, "sleepy", "and the quiet layer takes over");
});

test("a micro-emotion is not an action: no budget, no moment, no memory", () => {
  const h = harness();
  h.chat("mira", "what?");
  const before = { actions: h.memory.counters.actions, lastActionTs: h.memory.lastActionTs, moments: h.memory.moments.length };
  h.engine.tick();
  assert.equal(h.micros().length, 1);
  assert.equal(h.memory.counters.actions, before.actions);
  assert.equal(h.memory.lastActionTs, before.lastActionTs);
  assert.equal(h.memory.moments.length, before.moments);
  assert.equal(h.engine.actionTimes.length, 0, "it does not spend the per-minute ceiling");
  assert.equal(h.engine.lastActionAt, 0, "it does not move the global gap");

  // …which is exactly why a big reaction can still fire the moment after it.
  h.event("sub", { user: "dave", months: 1 });
  assert.equal(h.memory.lastAction().rule, "sub");
});

test("the micro envelope carries its caption and its duration", () => {
  const cmd = micro("sleepy", { line: "five more.", duration: 1800 });
  assert.equal(cmd.type, "micro");
  assert.equal(cmd.interrupt, "none");
  const bus = new CommandBus({ now: () => 1 });
  const [env] = bus.emit(cmd);
  assert.equal(env.priority, PRIORITY.micro);
  assert.equal(env.ttl, 1800);
  assert.ok(isValidCommand(env));
});
