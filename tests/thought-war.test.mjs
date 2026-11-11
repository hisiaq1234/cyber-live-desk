// Run with: node --test
// The Thought War deck: ten philosophical dilemmas preloaded as approved cards, drawn at random
// by "crid thought". These tests put every card through the server's real upsertCard, so an
// oversized field or a bad type fails here instead of failing on air.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  DEFAULT_STATE,
  DESKS,
  LIMITS,
  commitState,
  drawFrom,
  matchesDesk,
  publicCard,
  publicState,
  queueOf,
  readState,
  resolveDesk,
  runAction,
  upsertCard,
} from "../api/_desk-core.mjs";

import { DECK_CATEGORY, DECK_TTL_SEC, DECK_TYPE, THOUGHT_WAR_DECK } from "../scripts/thought-war-deck.mjs";

import {
  COMMAND_HELP,
  THOUGHT_WAR_CATEGORY,
  commandBody,
  commandText,
  parseDeskCommand,
} from "../public/desk-assets/_commands.mjs";
import {
  commandBody as publicCommandBody,
  commandText as publicCommandText,
  parseDeskCommand as parsePublicDeskCommand,
} from "../public/desk-assets/_commands.mjs";

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
    dump: () => Object.fromEntries(m),
  };
};

// Seeded through the real writer, so the ids, limits and approval rules are production's.
const seedDeck = async (store, now = 1) => {
  const cards = [];
  for (const entry of THOUGHT_WAR_DECK) {
    cards.push(await upsertCard(
      store,
      { ...entry, type: DECK_TYPE, category: DECK_CATEGORY, approval: "approved", ttlSec: DECK_TTL_SEC },
      now,
    ));
  }
  return cards;
};

const newsCard = (over = {}) => ({
  type: "news-drop",
  category: "naija",
  headline: "Senate passes the new fuel bill after an all-night sitting",
  summary: "The minister said the policy will reach every state house before the next budget.",
  approval: "approved",
  confidence: "confirmed",
  source: { publisher: "Premium Times", url: "https://premianetimes.ng/1" },
  ...over,
});

// ---------- the deck itself ----------

test("all ten dilemmas load as approved cards inside the server's own limits", async () => {
  assert.equal(THOUGHT_WAR_DECK.length, 10, "the deck is ten cards");
  const cards = await seedDeck(makeStore());
  assert.equal(cards.length, 10);
  for (const c of cards) {
    assert.equal(c.type, DECK_TYPE);
    assert.equal(c.category, DECK_CATEGORY);
    assert.equal(c.approval, "approved");
    assert.equal(c.ttlSec, DECK_TTL_SEC, "a dilemma gets longer on screen than a headline");
    assert.ok(c.id, "every card keeps a real id for the show action");
    assert.ok(c.headline.length <= LIMITS.headline);
    assert.ok(c.summary.length <= LIMITS.summary);
    assert.ok(c.question.length <= LIMITS.question, "every card asks chat something");
    assert.match(c.presenterNotes, /Side A/, "both sides are carried in the private notes");
    assert.match(c.presenterNotes, /Side B/);
  }
});

test("the two sides stay off the public projection the overlay reads", async () => {
  const store = makeStore();
  const cards = await seedDeck(store);
  const pub = publicCard(cards[0]);
  assert.equal(pub.presenterNotes, undefined, "presenterNotes is never part of the viewer card");

  await commitState(store, DEFAULT_STATE, { visible: true, mode: "cards", activeCardId: cards[0].id }, 10);
  const { body } = await publicState(store, null, 11);
  assert.match(body.card.headline, /Religious Debt/, "the audience does see the card");
  const served = JSON.stringify(body);
  for (const phrase of ["Kantian", "Communal Debt", "predatory system"]) {
    assert.equal(served.includes(phrase), false, `"${phrase}" must stay in the operator's notes`);
  }
});

// ---------- desk membership ----------

test("the deck is its own desk and never leaks into the news desks", async () => {
  const cards = await seedDeck(makeStore());
  // Card 5 is worded with "corruption" and card 7 with "business", both of which other desks
  // watch for, so this is the leak the category claim exists to stop.
  const corrupt = cards.find((c) => /corruption/i.test(`${c.summary} ${c.question}`));
  assert.ok(corrupt, "the deck really does contain politics-triggering wording");
  assert.equal(matchesDesk(corrupt, "politics"), false, "a dilemma is not a politics story");
  assert.equal(matchesDesk(corrupt, "business"), false);
  assert.equal(matchesDesk(corrupt, "thought-war"), true);

  assert.equal(queueOf(cards, "thought-war").length, 10);
  for (const desk of DESKS.filter((d) => d.id !== "thought-war")) {
    assert.equal(queueOf(cards, desk.id).length, 0, `${desk.id} must not pick up the deck`);
  }
});

test("ordinary news cards keep matching desks by keyword", async () => {
  const store = makeStore();
  const news = await upsertCard(store, newsCard());
  assert.equal(matchesDesk(news, "politics"), true, "the claim rule only applies to declared decks");
  assert.equal(matchesDesk(news, "thought-war"), false);
});

test("hyphenated and spaced desk names both resolve to the deck", () => {
  for (const typed of ["thought-war", "thought war", "thoughtwar", "war", "debate", "philosophy"]) {
    assert.equal(resolveDesk(typed)?.id, "thought-war", typed);
  }
});

// ---------- the draw ----------

test("a draw never repeats the card already on air and always terminates", () => {
  const pool = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(drawFrom([], null), null, "an empty pool is not a card");
  assert.equal(drawFrom(pool, null, () => 0)?.id, "a", "index 0 when nothing is on air");
  assert.equal(drawFrom(pool, "a", () => 0)?.id, "b", "a pinned rng must still move off the active card");
  assert.equal(drawFrom(pool, "a", () => 0.99)?.id, "c");
  assert.equal(drawFrom([{ id: "solo" }], "solo")?.id, "solo", "one card deck redraws the only card");

  const seen = new Set();
  for (let i = 0; i < 300; i += 1) seen.add(drawFrom(pool, "a")?.id);
  assert.deepEqual([...seen].sort(), ["b", "c"], "a real rng keeps drawing but never the same card twice");
});

test("crid thought puts a random dilemma on air and tunes the desk to the deck", async () => {
  const store = makeStore();
  const cards = await seedDeck(store);

  const first = await runAction(store, { action: "draw", category: DECK_CATEGORY }, 10);
  assert.equal(first.state.visible, true);
  assert.equal(first.state.mode, "cards");
  assert.equal(first.state.desk, "thought-war", "next now walks the deck, not the whole queue");
  const onAir = cards.find((c) => c.id === first.state.activeCardId);
  assert.equal(onAir?.category, DECK_CATEGORY);
  assert.equal(onAir.ttlSec, DECK_TTL_SEC, "the timer comes from the card");

  const second = await runAction(store, { action: "draw", category: DECK_CATEGORY }, 11);
  assert.notEqual(second.state.activeCardId, first.state.activeCardId, "consecutive draws never repeat");
});

test("an empty deck refuses instead of going blank on air", async () => {
  const store = makeStore();
  await upsertCard(store, newsCard());
  await assert.rejects(
    () => runAction(store, { action: "draw", category: DECK_CATEGORY }, 10),
    (err) => err.status === 409 && /Nothing approved in the thought-war deck/.test(err.message),
  );
});

test("crid random stays inside the desk that is already on", async () => {
  const store = makeStore();
  await upsertCard(store, newsCard());
  const cards = await seedDeck(store);
  await runAction(store, { action: "desk", desk: "thought-war" }, 5);

  const drew = await runAction(store, { action: "draw" }, 6);
  assert.equal(drew.state.desk, "thought-war", "a bare draw does not drop the sticky desk");
  const onAir = cards.find((c) => c.id === drew.state.activeCardId);
  assert.equal(onAir?.category, DECK_CATEGORY, "and it only draws from that desk");
});

test("a running poll blocks a draw until the operator ends it", async () => {
  const store = makeStore();
  await seedDeck(store);
  await runAction(store, { action: "draw", category: DECK_CATEGORY }, 10);
  await runAction(store, {
    action: "start-poll", question: "Side A or Side B?", options: ["Side A", "Side B"],
  }, 11);

  await assert.rejects(
    () => runAction(store, { action: "draw", category: DECK_CATEGORY }, 12),
    (err) => err.status === 409 && /End the poll/.test(err.message),
  );

  const after = await runAction(store, { action: "end-poll" }, 13);
  assert.equal(after.state.poll.active, false, "the vote closes but its result stays on screen");
  await runAction(store, { action: "draw", category: DECK_CATEGORY }, 14);
});

test("an unknown draw category refuses rather than inventing a deck", async () => {
  const store = makeStore();
  await seedDeck(store);
  await assert.rejects(
    () => runAction(store, { action: "draw", category: "not-a-deck" }, 10),
    (err) => err.status === 409,
  );
});

// ---------- the words that trigger it ----------

test("crid thought and crid random reach the draw action", () => {
  for (const typed of ["crid thought", "cridthought", "!crid thought", "CRID_THOUGHT"]) {
    assert.deepEqual(parseDeskCommand(typed), { verb: "draw", category: "thought-war" }, typed);
    assert.deepEqual(commandBody(parseDeskCommand(typed)), { action: "draw", category: "thought-war" }, typed);
  }
  assert.equal(commandText(parseDeskCommand("crid thought")), "crid thought");

  assert.deepEqual(parseDeskCommand("crid random"), { verb: "draw" });
  assert.deepEqual(commandBody(parseDeskCommand("crid random")), { action: "draw" }, "no category, so the desk stays");
  assert.equal(commandText(parseDeskCommand("crid random")), "crid random");

  assert.equal(parseDeskCommand("crid thought now"), null, "a draw takes no trailing words");
  assert.equal(parseDeskCommand("crid random please"), null);

  assert.ok(COMMAND_HELP.includes("crid thought"), "the help line teaches the new word");
  assert.ok(COMMAND_HELP.includes("crid random"));
});

test("the browser copy parses the new commands identically", () => {
  for (const line of ["crid thought", "crid random", "crid thought now"]) {
    assert.deepEqual(parsePublicDeskCommand(line), parseDeskCommand(line), line);
    const cmd = parseDeskCommand(line);
    if (cmd) {
      assert.deepEqual(publicCommandBody(cmd), commandBody(cmd), line);
      assert.equal(publicCommandText(cmd), commandText(cmd), line);
    }
  }
});

test("the deck category is the same string in the deck, the command rules and the desk", () => {
  assert.equal(THOUGHT_WAR_CATEGORY, DECK_CATEGORY, "the browser copy restates it, so assert they agree");
  const desk = DESKS.find((d) => d.id === "thought-war");
  assert.equal(desk.category, DECK_CATEGORY, "the desk claims the category the deck writes");
});

test("the command rules have one implementation, and the api imports the served one", () => {
  assert.equal(existsSync(new URL("../api/_commands.mjs", import.meta.url)), false,
    "api/_commands.mjs is gone: a second copy is what drifts");
  for (const rel of ["../api/desk.mjs", "../api/_twitch-core.mjs"]) {
    assert.match(readFileSync(new URL(rel, import.meta.url), "utf8"), /from "\.\.\/public\/desk-assets\/_commands\.mjs"/,
      `${rel} parses chat with the one shared module`);
  }
});

test("the state after a draw is what the overlay controller reads", async () => {
  const store = makeStore();
  await seedDeck(store);
  const drew = await runAction(store, { action: "draw", category: DECK_CATEGORY }, 100);
  const state = await readState(store);
  assert.equal(state.activeCardId, drew.state.activeCardId, "the draw is committed, not just returned");
  assert.equal(state.desk, "thought-war");
});
