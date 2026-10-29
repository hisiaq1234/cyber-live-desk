// Bulk approval, capacity and persisted research approval regressions.
// These use the same in-memory store shape as the core tests: no @netlify/blobs needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DEFAULT_STATE,
  FEEDS,
  RESEARCH_HELD_KEEP_MS,
  RESEARCH_MAX_PENDING,
  bulkUpdateApproval,
  commitState,
  queueCounts,
  readCards,
  readHeldResearch,
  readState,
  runAction,
  runResearch,
  untouchedAuto,
  upsertCard,
} from "../netlify/functions/_desk-core.mjs";

const NOW = Date.parse("2026-10-28T23:00:00Z");
const DAY = 24 * 3600_000;

const makeStore = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return {
    async get(key, opts) {
      const v = m.get(key);
      if (v == null) return null;
      return opts?.type === "json" ? JSON.parse(v) : v;
    },
    async setJSON(key, value, opts) {
      if (opts?.onlyIfNew && m.has(key)) return { modified: false };
      m.set(key, JSON.stringify(value));
      return { modified: true };
    },
    async delete(key) { m.delete(key); },
    dump: () => Object.fromEntries(m),
  };
};

const card = (over = {}) => ({
  id: "c1",
  type: "news-drop",
  category: "Nigeria",
  headline: "First",
  summary: "",
  question: "",
  approval: "pending",
  createdAt: 1,
  order: null,
  ttlSec: null,
  importKey: null,
  source: { publisher: "Premium Times", url: "https://www.premiumtimesng.com/1" },
  ...over,
});

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const fakeFetch = (bodies) => async (url) => {
  const hit = Object.entries(bodies).find(([k]) => url.startsWith(k));
  if (!hit) return { ok: false, status: 404, async text() { return ""; } };
  const body = hit[1];
  if (body instanceof Error) throw body;
  return { ok: true, status: 200, async text() { return body; } };
};

const seed = () => [
  card({ id: "politics", category: "Nigeria", headline: "Senate takes up the tax bill", source: { publisher: "Channels", url: "https://www.channelstv.com/p" } }),
  card({ id: "music", category: "Naija Music", headline: "Asake announces an album", source: { publisher: "Premium Times", url: "https://www.premiumtimesng.com/m" } }),
  card({ id: "music-no-source", category: "Naija Music", headline: "Unverified song rumor", source: { publisher: "", url: null } }),
  card({ id: "on-air", approval: "approved", category: "Nigeria", headline: "On air now", source: { publisher: "Channels", url: "https://www.channelstv.com/a" } }),
  card({ id: "by-hand", approval: "approved", category: "US", headline: "Hand made", source: { publisher: "BBC", url: "https://www.bbc.com/x" } }),
];

test("bulk approval updates selected cards, protects the on-air card, and enforces the editorial gate", async () => {
  const store = makeStore({ cards: JSON.stringify(seed()), state: JSON.stringify({ ...DEFAULT_STATE, visible: true, activeCardId: "on-air", version: 4 }) });
  const cards = await readCards(store);
  const state = await readState(store);

  const approved = await bulkUpdateApproval(store, { approval: "approved", ids: ["politics", "music-no-source"] }, state, cards, NOW);
  assert.equal(approved.updated, 1, "the sourced card is approved");
  assert.deepEqual(approved.ids, ["politics"]);
  assert.equal(approved.skipped.length, 1, "the unsourced news card is refused by the editorial gate");
  assert.match(approved.skipped[0].reason, /publisher and source URL/);

  const rejected = await bulkUpdateApproval(store, { approval: "rejected", ids: ["on-air", "by-hand"] }, state, await readCards(store), NOW);
  assert.equal(rejected.updated, 1, "only the off-air card changes");
  assert.deepEqual(rejected.ids, ["by-hand"]);
  assert.match(rejected.skipped[0].reason, /on air/);
  const after = await readCards(store);
  assert.equal(after.find((c) => c.id === "on-air").approval, "approved", "the on-air card is untouched");
  assert.equal(after.find((c) => c.id === "by-hand").approval, "rejected");
});

test("bulk approval can act on every filtered pending card by desk and source", async () => {
  const store = makeStore({ cards: JSON.stringify(seed()), state: JSON.stringify({ ...DEFAULT_STATE, version: 2 }) });
  const state = await readState(store);
  const result = await bulkUpdateApproval(store, {
    approval: "approved", all: true,
    filter: { status: "pending", desk: "music", source: "Premium Times" },
  }, state, await readCards(store), NOW);

  assert.equal(result.updated, 1, "only the sourced music card matches all three filters");
  assert.deepEqual(result.ids, ["music"]);
  assert.equal(result.counts.pending, 2, "the other pending cards stay pending");
  const after = await readCards(store);
  assert.equal(after.find((c) => c.id === "music").approval, "approved");
  assert.equal(after.find((c) => c.id === "politics").approval, "pending", "desk filter held");
});

test("bulk approval via runAction returns the changed cards and the new counts", async () => {
  const store = makeStore({ cards: JSON.stringify(seed()) });
  const result = await runAction(store, { action: "bulk-approval", approval: "approved", ids: ["politics"] }, NOW);
  assert.equal(result.bulk.updated, 1);
  assert.equal(result.state.version, 0, "a card-only action does not touch the live state");
  assert.equal(result.bulk.counts.approved, 3, "on-air, hand-made and the newly approved card");
});

test("queue counts keep pending, approved, held and on-air separate", async () => {
  const cards = seed();
  const counts = queueCounts(cards, { ...DEFAULT_STATE, visible: true, activeCardId: "on-air" }, 7);
  assert.deepEqual(
    { pending: counts.pending, approved: counts.approved, held: counts.held, onAir: counts.onAir },
    { pending: 3, approved: 2, held: 7, onAir: 1 },
  );
});

// ---------- research approval modes ----------

const feedFetch = () => fakeFetch({ "https://www.premiumtimesng.com": fixture("premiumtimes.xml") });

test("manual mode keeps new research pending, and the mode is read from the persisted state", async () => {
  const store = makeStore();
  const res = await runResearch(store, { feeds: ["premiumtimes"] }, { fetchFn: feedFetch(), now: NOW });
  assert.equal(res.added, 2);
  assert.equal(res.autoApproved, 0);
  assert.equal(res.approvalMode, "manual");
  assert.ok((await readCards(store)).slice(1).every((c) => c.approval === "pending"));
});

test("trusted mode auto-approves only the chosen feed, for manual and scheduled runs alike", async () => {
  const store = makeStore();
  await runAction(store, { action: "research-approval", mode: "trusted", trustedFeedIds: ["premiumtimes"] }, NOW);
  const manual = await runResearch(store, { feeds: ["premiumtimes"] }, { fetchFn: feedFetch(), now: NOW });
  assert.equal(manual.autoApproved, 2, "the trusted feed is auto-approved");
  const auto = await runResearch(store, {}, { fetchFn: feedFetch(), now: NOW + 60_000 });
  assert.equal(auto.approvalMode, "trusted", "the scheduled call sees the persisted rule");
  assert.equal(auto.autoApproved, 0, "dedupe already filed that feed's current items");
  const cards = await readCards(store);
  assert.ok(cards.filter((c) => c.importKey).every((c) => c.approval === "approved" && c.autoApproved === true));
});

test("all-incoming mode auto-approves, but the on-air card and live state never change", async () => {
  const store = makeStore({ cards: JSON.stringify([card({ id: "keeper", approval: "approved", headline: "Keeper", source: { publisher: "P", url: "https://e.com/k" } })]),
    state: JSON.stringify({ ...DEFAULT_STATE, visible: true, activeCardId: "keeper", expiresAt: NOW + 30_000, version: 9 }) });
  await runAction(store, { action: "research-approval", mode: "all" }, NOW);
  const before = await readState(store);
  const res = await runResearch(store, { feeds: ["premiumtimes"] }, { fetchFn: feedFetch(), now: NOW });
  assert.equal(res.autoApproved, 2);
  assert.equal(res.approvalMode, "all");
  const after = await readState(store);
  assert.equal(after.activeCardId, "keeper", "research never changes the card on air");
  assert.equal(after.version, before.version, "research does not bump the overlay version");
  assert.equal(after.visible, true);
});

test("a caller cannot pass a different approval mode to bypass the saved rule", async () => {
  const store = makeStore();
  await runAction(store, { action: "research-approval", mode: "manual" }, NOW);
  const res = await runResearch(store, { feeds: ["premiumtimes"], approvalMode: "all", mode: "all" }, { fetchFn: feedFetch(), now: NOW });
  assert.equal(res.approvalMode, "manual");
  assert.equal(res.autoApproved, 0, "request parameters do not override the persisted mode");
});

test("auto-approved research counts toward the unread cap until a person edits it", async () => {
  assert.equal(untouchedAuto({ importKey: "k", approval: "approved", autoApproved: true, summary: "", question: "" }), true);
  assert.equal(untouchedAuto({ importKey: "k", approval: "approved", autoApproved: true, summary: "mine", question: "" }), false);
  assert.equal(untouchedAuto({ importKey: "k", approval: "approved", autoApproved: false, summary: "", question: "" }), false, "a hand approval is operator work");
  assert.equal(untouchedAuto({ importKey: "k", type: "trend-topic", approval: "pending", summary: "Trending on Google Search in Nigeria.", question: "", presenterNotes: "Related coverage Google lists (check it before you use it):" }), true, "a legacy trend card is still machine-owned");
  assert.equal(untouchedAuto({ importKey: "k", type: "trend-topic", approval: "pending", summary: "Trending on Google Search in Nigeria.", question: "", presenterNotes: "I checked this myself" }), false, "operator notes make it theirs");
});

test("trend cards with a machine-written summary count toward capacity until edited", async () => {
  const store = makeStore();
  const res = await runResearch(store, { feeds: ["gtrends-ng"] }, {
    fetchFn: fakeFetch({ "https://trends.google.com/trending/rss": fixture("gtrends-ng.xml") }), now: NOW,
  });
  assert.equal(res.added, 3);
  const cards = await readCards(store);
  const trend = cards.find((c) => c.type === "trend-topic");
  assert.equal(untouchedAuto(trend), true, "the machine summary alone must not make it operator work");
  assert.equal(queueCounts(cards, DEFAULT_STATE).unreadResearch, 3);

  await upsertCard(store, { id: trend.id, presenterNotes: "I checked this myself" }, NOW);
  const edited = (await readCards(store)).find((c) => c.id === trend.id);
  assert.equal(untouchedAuto(edited), false, "one dashboard save makes it operator work");
  assert.equal(queueCounts(await readCards(store), DEFAULT_STATE).unreadResearch, 2);
});

test("a full queue holds overflow, then retrieves it before new headlines without duplicating", async () => {
  const full = Array.from({ length: RESEARCH_MAX_PENDING }, (_, i) =>
    card({ id: "full" + i, approval: "pending", importKey: "already-" + i, createdAt: NOW - 60_000 }));
  const store = makeStore({ cards: JSON.stringify(full) });
  const first = await runResearch(store, { feeds: ["premiumtimes"] }, { fetchFn: feedFetch(), now: NOW });
  assert.equal(first.added, 0);
  assert.equal(first.held, 2, "both feed items are held");
  assert.equal(first.heldTotal, 2);

  // Free room the way the operator would: reject two cards, then retry the held bucket only.
  const cards = await readCards(store);
  const state = await readState(store);
  await bulkUpdateApproval(store, { approval: "rejected", ids: [cards[0].id, cards[1].id] }, state, cards, NOW);
  const retried = await runResearch(store, { heldOnly: true }, { fetchFn: feedFetch(), now: NOW + 1000 });
  assert.equal(retried.added, 2, "held items are filed when room exists");
  assert.equal(retried.heldTotal, 0);
  assert.equal((await readHeldResearch(store, NOW + 1000)).length, 0, "the held bucket is emptied");

  const again = await runResearch(store, { feeds: ["premiumtimes"] }, { fetchFn: feedFetch(), now: NOW + 2000 });
  assert.equal(again.added, 0, "the retrieved stories are deduped out of the next fetch");
});

test("held items older than the held retention window are dropped, not filed silently", async () => {
  const stale = {
    ...card({ id: "held-old", importKey: "held-old-key", headline: "Old held story" }),
    feedId: "premiumtimes", feedLabel: "Premium Times", heldAt: NOW - RESEARCH_HELD_KEEP_MS - 1000,
  };
  const store = makeStore({ "research-held": JSON.stringify([stale]) });
  const held = await readHeldResearch(store, NOW);
  assert.equal(held.length, 0, "expired held items are ignored");
  const res = await runResearch(store, { heldOnly: true }, { fetchFn: feedFetch(), now: NOW });
  assert.equal(res.added, 0);
  assert.equal((await readCards(store)).some((c) => c.headline === "Old held story"), false);
});
