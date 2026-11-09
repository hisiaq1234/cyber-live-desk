import test from "node:test";
import assert from "node:assert/strict";
import { InitiativeEngine, DEFAULT_TIMINGS, REACTIVE_RULES, QUIET_RULES, describeRules } from "../engine.mjs";
import { SessionMemory } from "../memory.mjs";
import { CommandBus, isValidCommand, PRIORITY } from "../commands.mjs";
import { loadPersonality } from "../personality.mjs";

function harness({ timings = {}, start = 1_000_000 } = {}) {
  let t = start;
  const logs = [];
  const memory = new SessionMemory({ now: () => t });
  const bus = new CommandBus({ now: () => t });
  const engine = new InitiativeEngine({
    memory,
    personality: loadPersonality(),
    bus,
    now: () => t,
    log: (line) => logs.push(line),
    timings,
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
    chat(user, text, extra = {}) {
      engine.handleEvent({ id: `c${t}`, type: "chat", ts: t, user, text, amount: 0, ...extra });
    },
    event(type, extra = {}) {
      engine.handleEvent({ id: `e${t}`, type, ts: t, user: "someone", text: "", amount: 0, viewers: 0, ...extra });
    },
  };
}

/* ---------- the shape of a decision ---------- */

test("the engine has reactive and unprompted rules", () => {
  const rules = describeRules();
  assert.ok(rules.filter((r) => r.kind === "reactive").length >= 8);
  assert.ok(rules.filter((r) => r.kind === "quiet").length >= 4, "initiative needs unprompted rules");
  for (const id of ["chat-spike", "keyword", "sub", "gift", "raid", "long-silence", "recap", "callback", "musing", "repeated-topic"]) {
    assert.ok(rules.some((r) => r.id === id), `${id} exists`);
  }
});

test("a sub produces a card, a cheer and a line, and is logged with a why", () => {
  const h = harness();
  h.event("sub", { user: "dave", months: 3, detail: "resub 3 months" });
  const types = h.emitted.map((c) => c.type);
  assert.ok(types.includes("card"), "card for the sub");
  assert.ok(types.includes("say"), "he says something");
  assert.ok(types.includes("express"));
  const card = h.emitted.find((c) => c.type === "card");
  assert.equal(card.payload.title, "dave");
  assert.match(card.payload.subtitle, /3 months/);
  assert.equal(card.priority, PRIORITY.card);
  assert.equal(card.interrupt, "hard");
  for (const c of h.emitted) assert.ok(isValidCommand(c), `${c.type} is a valid envelope`);
  const why = h.logs.join("\n");
  assert.match(why, /▲ sub/);
  assert.match(why, /why: .*dave/);
  assert.match(why, /└ .*card:/);
});

test("Crid's action is remembered against the moment it belongs to", () => {
  const h = harness();
  h.event("sub", { user: "dave", months: 2 });
  const action = h.memory.lastAction();
  assert.equal(action.rule, "sub");
  const moment = h.memory.moments[0];
  assert.equal(action.momentId, moment.id, "action is tied to its moment");
  assert.equal(h.memory.actionForMoment(moment.id).rule, "sub");
});

test("a raid hard-interrupts and jumps presence to hype", () => {
  const h = harness();
  h.event("raid", { user: "mira", viewers: 240 });
  const presence = h.emitted.find((c) => c.type === "presence");
  assert.equal(presence.payload.mode, "hype");
  assert.equal(h.emitted[0].priority, PRIORITY.presence);
  const card = h.emitted.find((c) => c.type === "card");
  assert.match(card.payload.subtitle, /240/);
});

test("bits are counted and reacted to", () => {
  const h = harness();
  h.event("bits", { user: "pixel", amount: 500 });
  assert.equal(h.memory.counters.bits, 500);
  assert.ok(h.emitted.some((c) => c.type === "say"));
});

/* ---------- triggers ---------- */

test("a chat spike fires once chat is fast enough, and records the moment", () => {
  const h = harness();
  for (let i = 0; i < 8; i++) {
    h.advance(700);
    h.chat(["a", "b", "c", "d"][i % 4], `message ${i}`);
  }
  const spike = h.memory.lastAction();
  assert.equal(spike.rule, "chat-spike");
  assert.match(h.logs.join("\n"), /messages in \d+s from \d+ people/);
  assert.ok(h.memory.moments.some((m) => m.kind === "spike"));
});

test("a keyword in chat gets a line from the personality file", () => {
  const h = harness();
  h.chat("dave", "the lag is unreal");
  assert.equal(h.memory.lastAction().rule, "keyword");
  const said = h.emitted.find((c) => c.type === "say");
  assert.ok(said.payload.text.length > 0);
  assert.equal(said.payload.style, "dry");
});

test("the first message after a silence gets noticed", () => {
  const h = harness({ timings: { firstMessageSilenceMs: 5000 } });
  h.chat("dave", "hello");
  h.advance(60_000);
  h.chat("nova", "anyone here");
  const rules = h.memory.recentActions(3).map((a) => a.rule);
  assert.ok(rules.includes("first-after-silence"), `rules fired: ${rules.join(",")}`);
});

test("a new viewer is called out, but not the first three messages of the night", () => {
  const h = harness({ timings: { minActionGapMs: 0 } });
  h.chat("a", "one");
  h.chat("b", "two");
  h.chat("c", "three");
  h.chat("fresh", "four");
  const rules = h.memory.recentActions(6).map((a) => a.rule);
  assert.ok(rules.includes("new-viewer"));
});

test("a returning viewer is greeted with how long they were gone", () => {
  const h = harness({ timings: { returningGapMs: 60_000, minActionGapMs: 0, firstMessageSilenceMs: 10 ** 9 } });
  h.chat("dave", "back");
  h.advance(120_000);
  h.chat("dave", "back again");
  const action = h.memory.recentActions(4).find((a) => a.rule === "returning-viewer");
  assert.ok(action, "returning-viewer fired");
  const chip = h.emitted.filter((c) => c.type === "memory").at(-1);
  assert.equal(chip.payload.kind, "returning");
});

/* ---------- unprompted ---------- */

test("long silence makes him speak unprompted", () => {
  const h = harness({ timings: { longSilenceMs: 20_000 } });
  h.chat("dave", "hi");
  h.advance(30_000);
  const winner = h.engine.tick();
  assert.equal(winner.rule, "long-silence");
  assert.equal(h.emitted.find((c) => c.type === "look").payload.target, "offscreen");
  assert.match(h.logs.join("\n"), /unprompted/);
  assert.match(h.logs.join("\n"), /no chat for/);
});

test("nothing fires in the first seconds — no premature monologue", () => {
  const h = harness();
  h.chat("dave", "hi");
  h.advance(3_000);
  assert.equal(h.engine.tick(), null);
});

test("a repeated topic is picked up while chat is live", () => {
  const h = harness({ timings: { minActionGapMs: 0 } });
  for (const u of ["a", "b", "c"]) {
    h.advance(1000);
    h.chat(u, "the boss phase two");
  }
  h.advance(8000);
  const winner = h.engine.tick();
  assert.equal(winner.rule, "repeated-topic");
  const chip = h.emitted.find((c) => c.type === "memory" && c.payload.kind === "topic");
  assert.match(chip.payload.text, /boss/);
});

test("he calls back to an earlier moment, and only once", () => {
  const h = harness({ timings: { callbackAgeMs: 30_000, minActionGapMs: 0 } });
  h.event("sub", { user: "dave", months: 3 });
  h.advance(60_000);
  const first = h.engine.tick();
  assert.equal(first.rule, "callback");
  const chip = h.emitted.filter((c) => c.type === "memory").at(-1);
  assert.equal(chip.payload.kind, "callback");
  assert.match(chip.payload.text, /dave/);
  h.advance(120_000);
  const second = h.engine.tick();
  assert.notEqual(second?.rule, "callback", "the same moment is not cited twice");
});

test("the recap is built only from real moments and never invents one", () => {
  const h = harness({ timings: { recapLullMs: 20_000, callbackAgeMs: 10 ** 9, minActionGapMs: 0 } });
  h.chat("dave", "hi");
  h.advance(1000);
  h.event("sub", { user: "kay", months: 1 });
  h.advance(1000);
  h.event("gift", { user: "reg", amount: 2 });
  h.advance(30_000);
  const winner = h.engine.tick();
  assert.equal(winner.rule, "recap");
  const chip = h.emitted.find((c) => c.type === "memory" && c.payload.kind === "since-left");
  assert.equal(chip.payload.moments.length, 2, "exactly the two moments that happened");
  assert.match(chip.payload.moments[0].label, /kay/);
  assert.match(chip.payload.moments[1].label, /reg/);
});

test("a recap with no real moments does not happen", () => {
  const h = harness({ timings: { recapLullMs: 20_000, callbackAgeMs: 10 ** 9 } });
  h.chat("dave", "hi");
  h.advance(60_000);
  const winner = h.engine.tick();
  assert.notEqual(winner?.rule, "recap");
});

test("he volunteers a thought from the personality file when nothing is happening", () => {
  const h = harness({ timings: { musingMs: 10_000, longSilenceMs: 10 ** 9, callbackAgeMs: 10 ** 9, recapLullMs: 10 ** 9 } });
  h.chat("a", "hi");
  h.chat("b", "hi");
  h.advance(20_000);
  const winner = h.engine.tick();
  assert.equal(winner.rule, "musing");
  assert.ok(h.emitted.some((c) => c.type === "say" && c.payload.text.length > 0));
});

/* ---------- anti-spam ---------- */

test("cooldowns stop a rule from spamming", () => {
  const h = harness();
  h.chat("dave", "lag");
  const first = h.memory.lastAction();
  assert.equal(first.rule, "keyword");
  h.advance(2_000);
  h.chat("nova", "lag again");
  assert.equal(h.memory.recentActions(1)[0].rule, "keyword", "still only the first one");
  h.advance(30_000);
  h.chat("pixel", "lag");
  assert.equal(h.memory.recentActions(1)[0].rule, "keyword", "fires again after the cooldown");
});

test("a low-priority rule cannot fire immediately after a high-priority one", () => {
  const h = harness({ timings: { minActionGapMs: 5000 } });
  h.event("sub", { user: "dave", months: 1 });
  const before = h.memory.counters.actions;
  h.advance(500);
  h.chat("nova", "the lag is unreal");
  assert.equal(h.memory.counters.actions, before, "keyword held back by the global gap");
  h.advance(10_000);
  h.chat("nova", "the lag is unreal");
  assert.ok(h.memory.counters.actions > before, "fires once the gap has passed");
});

test("the per-minute rate limit caps a hyperactive chat", () => {
  const h = harness({ timings: { minActionGapMs: 0, maxActionsPerMinute: 3 } });
  for (let i = 0; i < 12; i++) {
    h.advance(1000);
    h.event("bits", { user: `u${i}`, amount: 100 });
  }
  assert.ok(h.memory.counters.actions <= 3, `actions=${h.memory.counters.actions}`);
});

test("verbose tracing explains what was held back", () => {
  const h = harness();
  h.engine.verbose = true;
  h.event("sub", { user: "dave", months: 1 });
  h.advance(300);
  h.chat("nova", "the lag is unreal"); // keyword, p62 — under the global gap after a sub
  assert.match(h.logs.join("\n"), /held —/);
});

test("every command the engine emits is versioned and typed", () => {
  const h = harness({ timings: { minActionGapMs: 0, callbackAgeMs: 1000, recapLullMs: 10 ** 9 } });
  h.event("raid", { user: "mira", viewers: 10 });
  h.advance(5000);
  h.event("sub", { user: "dave", months: 1 });
  h.advance(5000);
  h.engine.tick();
  assert.ok(h.emitted.length > 5);
  for (const c of h.emitted) {
    assert.equal(c.v, 1);
    assert.ok(isValidCommand(c));
    assert.equal(typeof c.why, "string");
  }
});

test("evaluating a rule never writes memory — only the action that fires does", () => {
  const h = harness({ timings: { minActionGapMs: 0 } });
  for (let i = 0; i < 6; i++) {
    h.advance(300);
    h.chat(`u${i}`, "boss phase");
  }
  const before = h.memory.moments.length;
  h.engine.tick();
  h.engine.tick();
  h.engine.tick();
  assert.equal(h.memory.moments.length, before, "ticks do not invent moments");
});

test("the moment record stays exactly as large as what really happened", () => {
  const h = harness({ timings: { minActionGapMs: 0 } });
  h.event("sub", { user: "dave", months: 1 });
  h.event("gift", { user: "nova", amount: 2 });
  assert.equal(h.memory.moments.length, 2);
  assert.deepEqual(
    h.memory.moments.map((m) => m.kind),
    ["sub", "gift"],
  );
});

test("the default timings keep reactions instant and monologues rare", () => {
  assert.ok(DEFAULT_TIMINGS.longSilenceMs >= 60_000);
  assert.ok(DEFAULT_TIMINGS.musingMs >= 30_000);
  assert.ok(DEFAULT_TIMINGS.maxActionsPerMinute <= 10);
  // Reaction rules take their cooldown from the personality file, so a rule's cooldown
  // is either a number or a function of the loaded character — never negative.
  const personality = loadPersonality();
  const cooldown = (r) => (typeof r.cooldownMs === "function" ? r.cooldownMs({ personality, timings: DEFAULT_TIMINGS }) : r.cooldownMs);
  assert.ok(REACTIVE_RULES.every((r) => cooldown(r) >= 0));
  assert.ok(QUIET_RULES.every((r) => cooldown(r) > 0));
});
