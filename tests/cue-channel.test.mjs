// The cue channel, end to end and without a browser: the brain posts one word into desk state, the
// stream page picks it up off the poll it already makes, and CRID performs it once.
//
// The break these guard: CRID's whole vocabulary (18 sequences, 8 micro-emotions) rendered only on
// the brain page, because the stream page renders from /api/desk/state and nothing there could say
// "wave now". The risk of the fix is the opposite one — a cue that replays on every poll, stacks two
// gestures on top of each other, or throws on a name it does not know, on air.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { BOT_CUES, BOT_REACTS, publicState, runAction } from "../api/_desk-core.mjs";
import { createCueReader } from "../public/desk-assets/cue.mjs";
import { createCueChannel } from "../brain/cue.mjs";

const NOW = Date.parse("2026-11-11T12:00:00Z");

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
  };
};

// What one poll of /api/desk/state does on the desk page: fetch the state, hand bot to the reader.
const poll = async (store, reader) => {
  const res = await publicState(store, null, NOW);
  assert.equal(res.status, 200, "the desk must answer a poll while a cue is pending");
  return reader.read(res.body.bot);
};

const newReader = () => createCueReader({ known: (name) => BOT_CUES.includes(name) });

test("a cue posted into desk state reaches the desk overlay exactly once", async () => {
  const store = makeStore();
  const reader = newReader();
  const posted = await runAction(store, { action: "bot-cue", name: "wave" }, NOW);
  assert.equal(posted.state.bot.cue.name, "wave");
  assert.ok(Number.isFinite(posted.state.bot.cue.at), "a cue must carry a numeric stamp");

  const first = await poll(store, reader);
  assert.deepEqual([first.name, first.text], ["wave", ""], "the poll must carry the cue to the overlay");

  // The overlay polls every few seconds for as long as the stream is up, so the same state arrives
  // over and over. That must not be a second wave.
  assert.equal(await poll(store, reader), null, "re-reading the same state must not replay the cue");
  assert.equal(reader.at, posted.state.bot.cue.at, "the stamp seen must be remembered");
});

test("a repeat of the same stamp is ignored, and a new one still plays", async () => {
  const reader = newReader();
  const cue = { name: "nod", at: 7 };
  assert.equal(reader.read({ cue }).name, "nod");
  assert.equal(reader.read({ cue }), null, "the same stamp twice is one performance");
  assert.equal(reader.read({ cue: { name: "nod", at: 6 } }), null, "an older stamp must never replay");
  assert.equal(reader.read({ cue: { name: "cheer", at: 8 } }).name, "cheer", "the next stamp must still play");
});

test("an unknown cue name is ignored without throwing, and consumed", () => {
  const reader = newReader();
  assert.equal(reader.read({ cue: { name: "moonwalk", at: 3 } }), null, "an unknown name is not an error");
  assert.equal(reader.read({ cue: { name: "moonwalk", at: 3 } }), null, "and it must not fire later either");
  assert.equal(reader.read({ cue: { name: "wave", at: 4 } }).name, "wave", "the channel must keep working after it");
  // Nothing that is not a cue may throw: an old state, a state mid-write, or a bot that is off.
  for (const bad of [null, undefined, {}, { cue: null }, { cue: "wave" }, { cue: { name: "wave" } }]) {
    assert.equal(reader.read(bad), null);
  }
});

test("say carries a line, and a line with no text is refused by the server", async () => {
  const store = makeStore();
  const posted = await runAction(store, { action: "bot-cue", name: "say", text: "rent is due" }, NOW);
  assert.equal(posted.state.bot.cue.text, "rent is due");
  const reader = newReader();
  assert.equal((await poll(store, reader)).text, "rent is due");
  await assert.rejects(() => runAction(store, { action: "bot-cue", name: "say" }, NOW), /text is required/);
  await assert.rejects(() => runAction(store, { action: "bot-cue", name: "moonwalk" }, NOW), /name must be one of/);
});

test("a cue does not reset anything else about him", async () => {
  // The bot object is shared with the sub count, the visibility flag and the derived reactions; a
  // cue that replaced it would silently drop the body he has grown into.
  const store = makeStore();
  await runAction(store, { action: "bot-subs", count: 12 }, NOW);
  const after = await runAction(store, { action: "bot-cue", name: "pushup" }, NOW + 1);
  assert.equal(after.state.bot.subs, 12, "a cue must not reset the sub count");
  const reacted = await runAction(store, { action: "bot-react", kind: "wave" }, NOW + 2);
  assert.equal(reacted.state.bot.subs, 12, "a reaction must not reset the sub count either");
  assert.equal(reacted.state.bot.cue.name, "pushup", "a reaction must not wipe a cue that is still pending");
});

test("every reaction the desk advertises has something to render, and the two lists agree", async () => {
  const { CUE_NAMES } = await import("../public/desk-assets/crid-bot.js");
  assert.deepEqual([...BOT_CUES].sort(), [...CUE_NAMES].sort(),
    "the server's accepted names and the renderer's must be the same list");
  for (const kind of BOT_REACTS) {
    assert.ok(CUE_NAMES.includes(kind), `${kind} is advertised as a reaction but CRID has nothing to play`);
  }
  // The two names that were advertised with no sequence behind them, so a gifted sub played nothing.
  for (const kind of ["gift", "bits"]) assert.ok(CUE_NAMES.includes(kind), `${kind} must render`);
});

test("the overlay drains the cue into CRID on the poll it already makes", () => {
  const overlay = readFileSync(new URL("../public/desk-assets/overlay.js", import.meta.url), "utf8");
  assert.match(overlay, /import \{ createCueReader \} from "\.\/cue\.mjs";/, "the reader is the tested module");
  assert.match(overlay, /const cues = createCueReader\(\{ known: \(name\) => CUE_NAMES\.includes\(name\) \}\)/);
  assert.match(overlay, /bot\?\.observe\(s\);/, "it must ride the existing poll, not a second transport");
  assert.match(overlay, /const cue = cues\.read\(s\.bot\);/);
  assert.match(overlay, /if \(cue && bot\) bot\.cue\(cue\.name, \{ text: cue\.text \}\);/);
  assert.doesNotMatch(overlay, /new WebSocket\(/, "no second transport on the stream page");
  assert.doesNotMatch(overlay, /\/api\/desk\/command/, "and no command route: the poll is the transport");
});

// ---- what CRID does with the cue -------------------------------------------------------------
class FakeEl {
  constructor(tag) {
    this.tagName = tag;
    this.attrs = {};
    this.children = [];
    this.dataset = {};
    this.textContent = "";
    this.offsetWidth = 0;
    this.isConnected = true;
    const classes = new Set();
    this.classList = { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)), contains: (c) => classes.has(c), [Symbol.iterator]: () => classes[Symbol.iterator]() };
    this.style = { setProperty: (k, v) => { this.style[k] = v; }, removeProperty: (k) => { delete this.style[k]; } };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  setAttributeNS(ns, k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  append(...kids) { for (const k of kids) if (k) { k.parent = this; this.children.push(k); } }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  remove() { this.isConnected = false; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }; }
}

function installDom() {
  const root = new FakeEl("body");
  globalThis.document = {
    head: new FakeEl("head"),
    body: root,
    documentElement: new FakeEl("html"),
    createElement: (t) => new FakeEl(t),
    createElementNS: (ns, t) => new FakeEl(t),
    getElementById: () => null,
  };
  globalThis.Image = class { set src(v) { this._src = v; } };
  globalThis.matchMedia = (q) => ({ media: q, matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.innerWidth = 1920;
  globalThis.innerHeight = 1080;
  return root;
}

test("CRID performs a cue, ignores a name he does not have, and speaks a line", async () => {
  const { createCridBot } = await import("../public/desk-assets/crid-bot.js");
  const bot = createCridBot({ root: installDom(), step: 12, position: "bc" });
  bot.observe({ bot: { on: true } });
  assert.equal(bot.cue("wave"), true, "a sequence he has must be accepted");
  assert.equal(bot.cue("curious"), true, "a micro-emotion must be accepted");
  assert.equal(bot.cue("gift"), true, "the gifted-sub reaction must actually have a sequence");
  assert.equal(bot.cue("bits"), true, "the bits reaction must actually have a sequence");
  assert.equal(bot.cue("moonwalk"), false, "an unknown name is refused, not thrown");
  assert.equal(bot.cue(""), false);
  bot.cue("say", { text: "rent is due" });
  const bubble = bot.el.children.find((c) => c.className === "bot-bubble");
  assert.ok(bubble, "a spoken cue must reach the bubble");
  assert.equal(bubble.textContent, "rent is due");
  bot.destroy();
});

// ---- the brain's half -----------------------------------------------------------------------
test("the brain posts a cue through the operator write path and stays quiet without one", async () => {
  const seen = [];
  const cues = createCueChannel({
    deskUrl: "https://desk.example/",
    token: "tok",
    fetchFn: async (url, init) => {
      seen.push({ url, init });
      return { ok: true, json: async () => ({ state: { bot: { cue: { name: "wave", at: 42 } } } }) };
    },
  });
  assert.equal(cues.on, true);
  const minted = await cues.cue("wave");
  assert.equal(seen[0].url, "https://desk.example/api/desk/action");
  assert.equal(seen[0].init.headers.authorization, "Bearer tok");
  assert.equal(JSON.parse(seen[0].init.body).action, "bot-cue");
  assert.deepEqual(minted, { name: "wave", at: 42 }, "the helper must return the stamp it minted");

  await cues.say("rent is due");
  assert.deepEqual(JSON.parse(seen[1].init.body), { action: "bot-cue", name: "say", text: "rent is due" });

  const off = [];
  const quiet = createCueChannel({ deskUrl: "", token: "", fetchFn: async () => { throw new Error("must not call"); }, log: (l) => off.push(l) });
  assert.equal(quiet.on, false);
  assert.equal(await quiet.cue("wave"), null, "no desk configured is not an error");
  assert.equal(await quiet.cue("nod"), null);
  assert.equal(off.length, 1, "it must say it is off once, not on every thought");
});
