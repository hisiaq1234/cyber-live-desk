/* The owner's reaction vocabulary — deterministic tests.
 *
 * Three things must be true or the whole pack is a lie:
 *   1. Crid recognises W / Ws / www / 1 / 1s and L / Ls, and NOT the words that merely
 *      contain those characters ("wow", "water", "1 kill", "lol", "www.google.com").
 *   2. Every reaction comes out as real commands on the existing envelope: a jump and a
 *      hype expression for a W, tears and a sad face for an L, a physical `move` for a
 *      layer — with the lines coming from the personality file, never hardcoded.
 *   3. It is rate-limited: one celebration per cooldown, one cry per cooldown, and a
 *      per-minute ceiling that the personality file owns.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { InitiativeEngine, describeRules } from "../engine.mjs";
import { SessionMemory } from "../memory.mjs";
import { CommandBus, isValidCommand, moveLayer, PRIORITY } from "../commands.mjs";
import { loadPersonality, Personality } from "../personality.mjs";
import { matchHype, matchRoast, tokenise, tallySignals, isAllowedLayer, normaliseReactions, DEFAULT_REACTIONS } from "../reactions.mjs";

const shipped = loadPersonality();
const HYPE = shipped.reaction("hype");
const ROAST = shipped.reaction("roast");
const LAYER = shipped.reaction("layerDrag");

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
      return emitted.length;
    },
    event(type, extra = {}) {
      engine.handleEvent({ id: `e${t}`, type, ts: t, user: "someone", text: "", amount: 0, ...extra });
      return emitted.length;
    },
    since(n) {
      return emitted.slice(n);
    },
  };
}

const personalityWith = (patch) => {
  const raw = JSON.parse(JSON.stringify(shipped.data));
  for (const [kind, values] of Object.entries(patch)) raw.reactions[kind] = { ...raw.reactions[kind], ...values };
  return new Personality(raw);
};

/* ---------- 1. recognition: canonical tokens only ---------- */

test("the shipped personality file carries the owner's vocabulary", () => {
  assert.deepEqual(HYPE.tokens, ["w", "ws", "1", "1s"]);
  assert.ok(HYPE.patterns.includes("^w{2,}$"), "repeated www… is hype");
  assert.deepEqual(ROAST.tokens, ["l", "ls"]);
  assert.equal(LAYER.lines[0], "I saw what you did there.", "the owner's exact line comes first");
  assert.ok(shipped.never.length > 0, "the never guard is still there");
});

test("W, Ws, www…, 1 and 1s are recognised as hype", () => {
  for (const text of ["W", "w", "Ws", "ws", "WS", "www", "wwww", "1", "1s", "1S", "W W W", "Ws Ws", "W!", "ws,", "1s.", "1 1"]) {
    assert.ok(matchHype(text, HYPE), `"${text}" is hype`);
  }
});

test("words and numbers that merely contain w / 1 are not hype", () => {
  for (const text of [
    "wow",
    "water",
    "was",
    "w1n",
    "ww2",
    "www.google.com",
    "twitch.tv/ws",
    "1 kill",
    "I got 1",
    "11 kills",
    "one",
    "W or L",
    "nice W play",
    "lol",
    "lmao",
    "",
    "🎉",
  ]) {
    assert.equal(matchHype(text, HYPE), null, `"${text}" is not hype`);
  }
});

test("tokenising strips edge punctuation but never splits a domain", () => {
  assert.deepEqual(tokenise("W!"), ["w"]);
  assert.deepEqual(tokenise("  Ws,  "), ["ws"]);
  assert.deepEqual(tokenise("www.google.com"), ["www.google.com"]);
  assert.deepEqual(tokenise(""), []);
});

test("L, Ls and configured roast terms are recognised; other words are not", () => {
  for (const text of ["L", "l", "Ls", "ls", "LL", "L L L", "take the L", "skill issue", "washed", "ratio"]) {
    assert.ok(matchRoast(text, ROAST), `"${text}" is a roast`);
  }
  for (const text of ["lol", "lmao", "cool", "relate", "late", "player", "clip it", ""]) {
    assert.equal(matchRoast(text, ROAST), null, `"${text}" is not a roast`);
  }
});

test("a hype tally only counts standalone signals, per person", () => {
  const window = [
    { ts: 1, user: "a", text: "W" },
    { ts: 2, user: "a", text: "wow that was clean" },
    { ts: 3, user: "b", text: "Ws" },
    { ts: 4, user: "c", text: "1s" },
  ];
  const tally = tallySignals(window, HYPE, "hype");
  assert.equal(tally.count, 3);
  assert.deepEqual(tally.users.sort(), ["a", "b", "c"]);
});

/* ---------- 2. the reactions as commands ---------- */

test("a hype burst makes Crid jump, celebrate and say a configured line", () => {
  const h = harness();
  assert.equal(h.chat("nova", "W"), 0, "one W is not a burst");
  h.advance(300);
  assert.equal(h.chat("mira", "Ws"), 0, "two Ws from two people is still short of the threshold");
  h.advance(300);
  h.chat("joss", "1s");

  assert.equal(h.memory.lastAction().rule, "chat-hype");
  const types = h.emitted.map((c) => c.type);
  assert.ok(types.includes("gesture"), "he gestures");
  assert.equal(h.emitted.find((c) => c.type === "gesture").payload.type, "jump");
  assert.equal(h.emitted.find((c) => c.type === "express").payload.emotion, "hype");
  assert.equal(h.emitted.find((c) => c.type === "presence").payload.mode, "hype");
  const said = h.emitted.find((c) => c.type === "say");
  assert.ok(HYPE.lines.includes(said.payload.text), "the line comes from the personality file");
  assert.equal(said.payload.style, "hype");
  for (const c of h.emitted) assert.ok(isValidCommand(c), `${c.type} is a valid envelope`);
  assert.ok(h.memory.moments.some((m) => m.kind === "hype"), "a real moment is recorded");
  assert.match(h.logs.join("\n"), /▲ chat-hype .*why: 3 hype messages/);
});

test("chat full of near-misses never triggers the hype reaction", () => {
  const h = harness();
  for (const [i, text] of ["wow", "water", "1 kill", "I got 1", "www.google.com", "was"].entries()) {
    h.chat(`u${i}`, text);
    h.advance(200);
  }
  // Other rules may well react to plain chat (a new viewer, a keyword) — what must never
  // happen is a hype reaction: no jump, no hype presence, none of the hype lines.
  assert.equal(h.memory.actions.filter((a) => a.rule === "chat-hype").length, 0);
  assert.ok(!h.emitted.some((c) => c.type === "gesture" && c.payload.type === "jump"), "no jump");
  assert.ok(!h.emitted.some((c) => c.type === "presence" && c.payload.mode === "hype"), "no hype presence");
  assert.ok(!h.emitted.some((c) => c.type === "say" && HYPE.lines.includes(c.payload.text)), "none of the hype lines");
});

test("an L makes Crid cry: tears effect, sad expression, wince, configured line", () => {
  const h = harness();
  h.chat("pixel", "L");
  assert.equal(h.memory.actions.length, 0, "one L is below the configured threshold");
  h.advance(400);
  h.chat("reg", "Ls");

  assert.equal(h.memory.lastAction().rule, "chat-roast");
  const effect = h.emitted.find((c) => c.type === "effect");
  assert.equal(effect.payload.type, "tears");
  assert.equal(effect.payload.duration, ROAST.effect.duration, "the tears last as long as the file says");
  assert.equal(h.emitted.find((c) => c.type === "express").payload.emotion, "sad");
  assert.equal(h.emitted.find((c) => c.type === "gesture").payload.type, "wince");
  const said = h.emitted.find((c) => c.type === "say");
  assert.ok(ROAST.lines.includes(said.payload.text));
  assert.equal(said.payload.style, "dry");
  assert.ok(!h.emitted.some((c) => c.type === "audio"), "the audience never hears Crid");
});

test("a single configured roast term is enough on its own", () => {
  const h = harness();
  h.chat("kay", "chat is washed");
  assert.equal(h.memory.lastAction().rule, "chat-roast");
  assert.equal(h.emitted.find((c) => c.type === "effect").payload.type, "tears");
});

test("reaction lines still go through the never guard", () => {
  const h = harness({ personality: personalityWith({ hype: { lines: ["hurry, chat said W"] } }) });
  h.chat("a", "W");
  h.advance(200);
  h.chat("b", "Ws");
  h.advance(200);
  h.chat("c", "1s");
  assert.equal(h.memory.lastAction().rule, "chat-hype", "the reaction still happens");
  assert.ok(h.emitted.some((c) => c.type === "gesture"), "the body still reacts");
  assert.ok(!h.emitted.some((c) => c.type === "say"), "the banned line is dropped instead of said");
});

test("a disabled reaction does nothing at all", () => {
  const h = harness({ personality: personalityWith({ hype: { enabled: false } }) });
  h.chat("a", "W");
  h.advance(200);
  h.chat("b", "Ws");
  h.advance(200);
  h.chat("c", "1s");
  assert.equal(h.emitted.length, 0);
});

/* ---------- 3. rate limiting and cooldowns ---------- */

test("a second hype burst inside the cooldown is held", () => {
  const h = harness();
  h.chat("a", "W");
  h.advance(200);
  h.chat("b", "Ws");
  h.advance(200);
  h.chat("c", "1s");
  const first = h.emitted.length;
  assert.ok(first > 0);

  h.advance(5_000);
  const mark = h.chat("d", "W");
  h.advance(200);
  h.chat("e", "Ws");
  h.advance(200);
  h.chat("f", "1s");
  assert.equal(h.emitted.length, mark, "nothing new was sent — still in cooldown");

  h.advance(HYPE.cooldownMs + 1);
  h.chat("g", "W");
  h.advance(200);
  h.chat("i", "Ws");
  h.advance(200);
  h.chat("j", "1s");
  assert.ok(h.emitted.length > mark, "once the cooldown expires he reacts again");
});

test("the per-minute ceiling from the personality file is enforced", () => {
  const h = harness({ personality: personalityWith({ hype: { cooldownMs: 0, maxPerMinute: 2 } }) });
  const burst = (n) => {
    h.chat(`a${n}`, "W");
    h.advance(100);
    h.chat(`b${n}`, "Ws");
    h.advance(100);
    h.chat(`c${n}`, "1s");
  };
  burst(1);
  h.advance(4_000);
  burst(2);
  h.advance(4_000);
  burst(3);
  assert.equal(h.memory.actions.filter((a) => a.rule === "chat-hype").length, 2, "two bursts a minute, not three");
});

test("an L cannot be milked: the roast cooldown holds it", () => {
  const h = harness();
  h.chat("a", "L");
  h.advance(200);
  h.chat("b", "L");
  const afterFirst = h.emitted.length;
  h.advance(1_000);
  h.chat("c", "L");
  h.advance(200);
  h.chat("d", "Ls");
  assert.equal(h.emitted.length, afterFirst, "no second cry inside the cooldown");
  assert.equal(h.memory.actions.filter((a) => a.rule === "chat-roast").length, 1);
});

/* ---------- 4. the obstructing layer ---------- */

test("a layer event produces the physical drag command and the exact line", () => {
  const h = harness();
  h.event("layer", { layer: "card", side: "left", source: "desk" });
  assert.equal(h.memory.lastAction().rule, "layer-obstructed");

  const move = h.emitted.find((c) => c.type === "move");
  assert.ok(move, "a move command was sent");
  assert.equal(move.payload.target, "card");
  assert.equal(move.payload.to, "left");
  assert.equal(move.payload.travelMs, LAYER.travelMs);
  assert.equal(move.payload.dragMs, LAYER.dragMs);
  assert.equal(move.interrupt, "hard");
  assert.equal(move.priority, PRIORITY.move);
  assert.ok(isValidCommand(move));

  const said = h.emitted.find((c) => c.type === "say");
  assert.equal(said.payload.text, "I saw what you did there.");
  assert.equal(h.emitted.find((c) => c.type === "presence").payload.mode, "engaged");
  for (const c of h.emitted) assert.ok(isValidCommand(c), `${c.type} is a valid envelope`);
  assert.ok(h.memory.moments.some((m) => m.kind === "layer"));
});

test("only configured layers are drag targets; the brain never guesses", () => {
  const h = harness();
  assert.equal(isAllowedLayer("poll", LAYER), false);
  h.event("layer", { layer: "poll", side: "left" });
  assert.equal(h.emitted.length, 0, "an unknown layer is refused");
  assert.ok(!h.emitted.some((c) => c.type === "move"));
});

test("an unknown drag side falls back to the configured default", () => {
  const h = harness();
  h.event("layer", { layer: "recap", side: "sideways" });
  assert.equal(h.emitted.find((c) => c.type === "move").payload.to, LAYER.defaultSide);
});

test("allowed layers and the default side are config-driven", () => {
  const h = harness({ personality: personalityWith({ layerDrag: { allowedLayers: ["poll"], defaultSide: "right" } }) });
  h.event("layer", { layer: "poll", side: "up" });
  const move = h.emitted.find((c) => c.type === "move");
  assert.equal(move.payload.target, "poll");
  assert.equal(move.payload.to, "up");
  assert.equal(h.emitted.find((c) => c.type === "say").payload.text, "I saw what you did there.");
});

test("the layer drag is rate-limited too", () => {
  const h = harness();
  h.event("layer", { layer: "card" });
  const first = h.emitted.length;
  h.advance(1_000);
  h.event("layer", { layer: "card" });
  assert.equal(h.emitted.length, first, "one drag per cooldown");
  h.advance(LAYER.cooldownMs + 1);
  h.event("layer", { layer: "card" });
  assert.ok(h.emitted.length > first, "and it works again after the cooldown");
});

test("the move envelope has a ttl that covers travel plus drag", () => {
  const cmd = moveLayer("card", "left", { travelMs: 800, dragMs: 600 });
  assert.equal(cmd.type, "move");
  assert.equal(cmd.payload.target, "card");
  const bus = new CommandBus({ now: () => 5 });
  const [env] = bus.emit(cmd);
  assert.equal(env.ttl, 800 + 600 + 1200);
  assert.ok(isValidCommand(env));
});

/* ---------- 5. the pack is wired in and stays configurable ---------- */

test("the three reaction rules are part of the engine's rule set", () => {
  const ids = describeRules().map((r) => r.id);
  for (const id of ["chat-hype", "chat-roast", "layer-obstructed"]) assert.ok(ids.includes(id), `${id} exists`);
  const hype = describeRules().find((r) => r.id === "chat-hype");
  assert.equal(hype.cooldownFrom, "personality", "pacing comes from the personality file");
});

test("a personality file without a reactions block still gets safe defaults", () => {
  const bare = new Personality({ name: "Crid", lines: {} });
  assert.equal(bare.reaction("hype").threshold, DEFAULT_REACTIONS.hype.threshold);
  assert.ok(bare.reaction("roast").lines.length > 0);
  assert.deepEqual(normaliseReactions(undefined).layerDrag.allowedLayers, DEFAULT_REACTIONS.layerDrag.allowedLayers);
});

test("thresholds and windows are read from the file, not baked into the engine", () => {
  const h = harness({ personality: personalityWith({ hype: { threshold: 1, minUsers: 1 } }) });
  h.chat("solo", "W");
  assert.equal(h.memory.lastAction().rule, "chat-hype", "one W is enough when the file says so");
});
