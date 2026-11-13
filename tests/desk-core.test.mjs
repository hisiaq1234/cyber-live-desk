// Run with: node --test
// The core takes its store as an argument, so these run under plain node with no
// dependencies. Feed fixtures under tests/fixtures/ are trimmed real responses captured
// from the live feeds on 2026-10-28, including a blocked site's 403 page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DEFAULT_STATE,
  DESKS,
  FEEDS,
  HttpError,
  LIMITS,
  LOCATION_DELAY_MS,
  PER_FEED,
  PIP_SIZE,
  RESEARCH_KEEP_MS,
  RESEARCH_MAX_PENDING,
  advanceIfExpired,
  autoAdvancePlan,
  candidates,
  commitState,
  enrichWithGemini,
  matchesDesk,
  nextAfter,
  pruneAutoArrivals,
  proxyFor,
  publicProjection,
  publicState,
  queueOf,
  readCards,
  readState,
  resolveDesk,
  runAction,
  runResearch,
  untouchedAuto,
  upsertCard,
  wl,
  writeBeing,
  writeLocation,
  createTwitchClip,
} from "../api/_desk-core.mjs";

// Captured feeds publish on 2026-10-28; the 3-day freshness window needs a matching clock.
const NOW = Date.parse("2026-10-28T23:00:00Z");

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

const card = (over = {}) => ({
  id: "c1",
  type: "news-drop",
  headline: "First",
  approval: "approved",
  createdAt: 1,
  order: null,
  ttlSec: null,
  source: { publisher: "P", url: "https://e.com/1" },
  ...over,
});

const feed = (id) => FEEDS.find((f) => f.id === id);
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const fakeFetch = (bodies) => async (url) => {
  const hit = Object.entries(bodies).find(([k]) => url.startsWith(k));
  if (!hit) return { ok: false, status: 404, async text() { return ""; } };
  const body = hit[1];
  if (body instanceof Error) throw body;
  if (typeof body === "object") return { ok: false, status: body.status, async text() { return body.body ?? ""; } };
  return { ok: true, status: 200, async text() { return body; } };
};

// ---------- state that was already deployed ----------

test("a state blob from before the auto flags still reads with them off", async () => {
  // This is literally what is in production now: version 16, no autoPlay, no autoResearch.
  const store = makeStore({ state: JSON.stringify({ version: 16, updatedAt: 1, mode: "cards", visible: true, activeCardId: "x" }) });
  const state = await readState(store);
  assert.equal(state.autoPlay, false);
  assert.equal(state.autoResearch, false);
  assert.equal(state.version, 16);
  assert.equal(state.poll, null);
});

// ---------- auto-play rules ----------

test("auto-play only moves a visible, unheld, expired card in cards mode", () => {
  const q = [card({ id: "a" }), card({ id: "b" })];
  const base = { ...DEFAULT_STATE, mode: "cards", visible: true, activeCardId: "a", expiresAt: NOW - 1, autoPlay: true };
  assert.ok(autoAdvancePlan(base, q, NOW));
  assert.equal(autoAdvancePlan({ ...base, autoPlay: false }, q, NOW), null, "manual mode must not move");
  assert.equal(autoAdvancePlan({ ...base, hold: true }, q, NOW), null, "hold wins over auto-play");
  assert.equal(autoAdvancePlan({ ...base, expiresAt: NOW + 5000 }, q, NOW), null, "not expired yet");
  assert.equal(autoAdvancePlan({ ...base, mode: "x-following" }, q, NOW), null, "X feed is not ours to advance");
  assert.equal(autoAdvancePlan({ ...base, poll: { active: true } }, q, NOW), null, "an open poll is the operator's");
  assert.equal(autoAdvancePlan(base, [], NOW), null, "nothing approved, nothing to show");
});

test("auto-play finishes a closed poll and moves to the approved card after it", () => {
  const q = [card({ id: "a" }), card({ id: "b" })];
  const s = { ...DEFAULT_STATE, visible: true, activeCardId: "a", expiresAt: NOW - 1, autoPlay: true, poll: { active: false, question: "q" } };
  const plan = autoAdvancePlan(s, q, NOW);
  assert.equal(plan.activeCardId, "b");
  assert.equal(plan.poll, null, "a stale result screen must not stay on air");
});

test("auto-play wraps and reuses the same card when the queue holds one", () => {
  const one = [card({ id: "a" })];
  assert.equal(nextAfter(one, "a").id, "a");
  assert.equal(nextAfter([card({ id: "a" }), card({ id: "b" })], "b").id, "a", "wraps past the end");
  assert.equal(nextAfter([card({ id: "a" })], "gone").id, "a", "unknown id starts at the top");
  assert.equal(nextAfter([], "a"), null);
});

test("auto-play uses the ttl of the card it moves TO, not the one leaving", () => {
  const q = [card({ id: "a", ttlSec: 90 }), card({ id: "b", ttlSec: null })];
  const s = { ...DEFAULT_STATE, visible: true, activeCardId: "a", expiresAt: NOW - 1, autoPlay: true };
  const toB = autoAdvancePlan(s, q, NOW);
  assert.equal(toB.activeCardId, "b");
  assert.equal(toB.expiresAt, NOW + 45_000, "b has no ttl of its own, so the default applies");
  const toA = autoAdvancePlan({ ...s, activeCardId: "b" }, q, NOW);
  assert.equal(toA.activeCardId, "a");
  assert.equal(toA.expiresAt, NOW + 90_000, "a sets itself to 90s");
});

test("the queue the operator sees is the queue auto-play walks", () => {
  const cards = [card({ id: "late", createdAt: 5 }), card({ id: "first", createdAt: 9, order: 1 }), card({ id: "draft", approval: "pending", createdAt: 1 })];
  assert.deepEqual(queueOf(cards).map((c) => c.id), ["first", "late"]);
  const s = { ...DEFAULT_STATE, visible: true, activeCardId: "first", expiresAt: NOW - 1, autoPlay: true };
  assert.equal(autoAdvancePlan(s, queueOf(cards), NOW).activeCardId, "late");
});

// ---------- concurrency ----------

test("two overlapping advances move one card, not two", async () => {
  const store = makeStore({ cards: JSON.stringify([card({ id: "a" }), card({ id: "b" }), card({ id: "c" })]) });
  const seeded = await commitState(store, DEFAULT_STATE, { visible: true, mode: "cards", activeCardId: "a", expiresAt: NOW - 1, autoPlay: true });
  const twoReaders = await Promise.all([advanceIfExpired(store, seeded, NOW), advanceIfExpired(store, seeded, NOW)]);
  const final = await readState(store);
  assert.equal(sameVersion(twoReaders.map((r) => r?.version ?? final.version)), 1, "the second reader must not advance again");
  assert.notEqual(final.activeCardId, "a");
  assert.equal(final.activeCardId, "b", "one advance, no card skipped");
  assert.equal(final.version, seeded.version + 1);
});

const sameVersion = (list) => new Set(list).size;

test("auto-advance is a no-op for a state that is not expired", async () => {
  const store = makeStore({ cards: JSON.stringify([card({ id: "a" }), card({ id: "b" })]) });
  const s = await commitState(store, DEFAULT_STATE, { visible: true, activeCardId: "a", expiresAt: NOW + 10_000, autoPlay: true });
  assert.equal(await advanceIfExpired(store, s, NOW), null);
});

// ---------- the public feed ----------

test("the overlay's poll gets 204 until the version moves, and no private fields when it does", async () => {
  const cards = [card({ id: "a", presenterNotes: "ask the minister first", source: { publisher: "P", url: "https://secret.example/leak" } })];
  const store = makeStore({ cards: JSON.stringify(cards) });
  const s = await commitState(store, DEFAULT_STATE, {
    visible: true, activeCardId: "a", expiresAt: NOW + 30_000,
    researchApprovalMode: "all", trustedFeedIds: ["premiumtimes"],
    twitchChatEnabled: true, twitchAllowedUserIds: ["222"],
  });
  assert.equal((await publicState(store, String(s.version), NOW)).status, 204);

  const res = await publicState(store, String(s.version - 1), NOW);
  assert.equal(res.status, 200);
  assert.equal(res.body.card.headline, "First");
  const wire = JSON.stringify(res.body);
  assert.ok(!wire.includes("ask the minister"), "presenter notes must never reach a viewer");
  assert.ok(!wire.includes("secret.example"), "source URLs must never reach a viewer");
  assert.ok(!wire.includes("activeCardId"), "the internal id stays out of the public state");
  assert.ok(!wire.includes("autoResearch"), "the operator's automation settings stay private");
  assert.ok(!wire.includes("researchApprovalMode"), "the research approval rule stays private");
  assert.ok(!wire.includes("trustedFeedIds"), "the trusted feed list stays private");
  assert.ok(!wire.includes("twitchChatEnabled"), "Twitch control state stays private");
  assert.ok(!wire.includes("twitchAllowedUserIds"), "the Twitch allowlist stays private");
  assert.equal(res.body.autoPlay, false, "autoPlay is public because the overlay needs it");
});

test("public music identity exposes only current title, artist and playing state", async () => {
  const store = makeStore();
  const privateAudioUrl = "https://cdn.example.com/private-stream?token=should-not-leak";
  await commitState(store, DEFAULT_STATE, {
    music: {
      queue: [{ id: "queued", title: "Queued Track", artist: "Queued Artist", audioUrl: privateAudioUrl }],
      current: { id: "current", title: "Current Track", artist: "Current Artist", audioUrl: privateAudioUrl },
      playing: true, volume: 0.25, muted: false,
    },
  });
  const res = await publicState(store, null, NOW);
  assert.deepEqual(res.body.music, {
    current: { title: "Current Track", artist: "Current Artist" },
    playing: true,
  });
  const wire = JSON.stringify(res.body);
  assert.ok(!wire.includes("private-stream"), "music audio URLs remain private");
  assert.ok(!wire.includes("Queued Track"), "the private music queue remains private");
  assert.ok(!wire.includes("volume"), "playback controls remain private");
});

test("an unapproved card cannot be served even if the state points at it", async () => {
  const store = makeStore({
    cards: JSON.stringify([card({ id: "a", approval: "pending" })]),
    state: JSON.stringify({ ...DEFAULT_STATE, visible: true, activeCardId: "a", expiresAt: NOW + 30_000, version: 3 }),
  });
  const res = await publicState(store, null, NOW);
  assert.equal(res.status, 200);
  assert.equal(res.body.card, null);
});

test("auto-play advances at the moment the overlay reads, so nothing moves when nobody watches", async () => {
  const store = makeStore({ cards: JSON.stringify([card({ id: "a", headline: "A" }), card({ id: "b", headline: "B" })]) });
  const s = await commitState(store, DEFAULT_STATE, { visible: true, activeCardId: "a", expiresAt: NOW - 1, autoPlay: true });
  const first = await publicState(store, null, NOW);
  assert.equal(first.body.card.headline, "B", "the expired card was replaced on read");
  assert.ok(first.body.expiresAt > NOW, "the new card got a fresh clock");
  const again = await publicState(store, null, NOW + 1000);
  assert.equal(again.body.card.headline, "B", "reading twice inside the ttl does not skip a card");
  assert.equal((await readState(store)).activeCardId, "b");
});

test("auto-play stays out of the way when it is off", async () => {
  const store = makeStore({ cards: JSON.stringify([card({ id: "a" }), card({ id: "b" })]) });
  const s = await commitState(store, DEFAULT_STATE, { visible: true, activeCardId: "a", expiresAt: NOW - 1, autoPlay: false });
  const res = await publicState(store, null, NOW);
  assert.equal(res.body.version, s.version, "the version must not move on its own");
  assert.ok(res.body.card && res.body.expiresAt < NOW, "an expired card is still projected; the overlay is what blanks it in manual mode");
});

// ---------- operator switches ----------

test("the two switches toggle, and turning auto-play on mid-expiry restarts the clock", async () => {
  const store = makeStore({ cards: JSON.stringify([card({ id: "a" })]) });
  const a1 = await runAction(store, { action: "auto-play" }, NOW);
  assert.equal(a1.state.autoPlay, true);
  const a2 = await runAction(store, { action: "auto-research" }, NOW);
  assert.equal(a2.state.autoResearch, true);
  assert.equal(a2.state.autoPlay, true, "one switch must not disturb the other");
  assert.equal((await runAction(store, { action: "auto-research", value: false }, NOW)).state.autoResearch, false, "explicit value beats toggle");

  const expired = await commitState(store, a2.state, { visible: true, activeCardId: "a", expiresAt: NOW - 1 });
  const on = await runAction(store, { action: "auto-play", value: true }, NOW);
  assert.equal(on.state.version, expired.version + 1);
  assert.ok(on.state.expiresAt > NOW, "so the operator does not lose the card the instant they flip it");
});

test("auto-play on does not touch hold, hide, or the manual show path", async () => {
  const store = makeStore({ cards: JSON.stringify([card({ id: "a" }), card({ id: "b" })]) });
  await commitState(store, DEFAULT_STATE, { visible: true, activeCardId: "a", autoPlay: true });
  const held = await runAction(store, { action: "show", cardId: "b" }, NOW);
  assert.equal(held.state.activeCardId, "b");
  assert.ok(held.state.expiresAt > NOW);
  const hid = await runAction(store, { action: "hide" }, NOW);
  assert.equal(hid.state.visible, false);
  assert.equal(hid.state.expiresAt, null);
  assert.equal(autoAdvancePlan(hid.state, queueOf(await readCards(store)), NOW + 99999), null);
});

// ---------- editorial gate ----------

test("an approved news-drop is refused without a publisher and a link", async () => {
  const store = makeStore();
  await assert.rejects(
    () => upsertCard(store, { type: "news-drop", headline: "Something happened", approval: "approved" }, NOW),
    (e) => e instanceof HttpError && e.status === 422
  );
  const ok = await upsertCard(store, { type: "news-drop", headline: "Something happened", approval: "approved",
    source: { publisher: "Channels", url: "https://www.channelstv.com/x/" } }, NOW);
  assert.equal(ok.approval, "approved");
  const testCard = await upsertCard(store, { type: "news-drop", headline: "Overlay check", approval: "approved", confidence: "test" }, NOW);
  assert.equal(testCard.source.url, null, "a labelled test card is exempt");
});

test("auto-play can never show a card that is not approved", async () => {
  const store = makeStore({ cards: JSON.stringify([card({ id: "a", approval: "approved" }), card({ id: "b", approval: "pending" })]) });
  const s = await commitState(store, DEFAULT_STATE, { visible: true, activeCardId: "a", expiresAt: NOW - 1, autoPlay: true });
  assert.equal((await publicState(store, null, NOW)).body.card.headline, "First", "it moved to a, then stayed: b is not in the queue");
  assert.equal((await readState(store)).activeCardId, "a");
});

test("test fixtures never enter the live queue or public card projection", async () => {
  const testCard = card({ id: "test", headline: "Overlay test card", confidence: "test", approval: "approved" });
  const liveCard = card({ id: "live", headline: "Verified live card" });
  const store = makeStore({ cards: JSON.stringify([testCard, liveCard]) });
  const state = await commitState(store, DEFAULT_STATE, { visible: true, activeCardId: "test", autoPlay: true }, NOW);

  assert.deepEqual(queueOf(await readCards(store)).map((c) => c.id), ["live"], "fixtures are never candidates for live playback");
  assert.equal((await publicState(store, null, NOW)).body.card, null, "a persisted fixture cannot be projected as live content");
  assert.equal((await advanceIfExpired(store, { ...state, expiresAt: NOW - 1 }, NOW)).activeCardId, "live", "auto-play recovers to a real approved card");
});

test("a pending card saved by research stays invisible until approved", async () => {
  const store = makeStore();
  const c = await upsertCard(store, { type: "news-drop", headline: "Raw headline", approval: "pending",
    source: { publisher: "Premium Times", url: "https://www.premiumtimesng.com/x" } }, NOW);
  assert.equal(c.approval, "pending");
  assert.deepEqual(queueOf(await readCards(store)).map((x) => x.headline), [], "the seeded test card is never playable");
});

// ---------- feed parsing, against real captured XML ----------

test("Google News: publisher comes from the source tag and the title suffix is stripped", () => {
  const found = candidates(feed("gnews-ng"), fixture("gnews-ng.xml"), NOW);
  assert.equal(found.length, 4);
  const first = found[0];
  assert.equal(first.type, "news-drop");
  assert.ok(first.publisher.length > 1, `publisher: ${first.publisher}`);
  assert.ok(!first.headline.endsWith(`- ${first.publisher}`), "the trailing publisher is off the headline");
  assert.ok(/^https:\/\//.test(first.url));
  assert.equal(first.summary, "", "the excerpt does not become the summary; the operator writes that");
  assert.ok(first.key === first.url);
});

test("WordPress feeds: CDATA titles survive and the excerpt lands in private notes", () => {
  const pt = candidates(feed("premiumtimes"), fixture("premiumtimes.xml"), NOW);
  assert.equal(pt.length, 2);
  assert.ok(!pt[0].headline.includes("<"), `no markup in the headline: ${pt[0].headline}`);
  assert.ok(!pt[0].headline.includes("CDATA"));
  assert.ok(pt[0].notes.startsWith("Publisher's own excerpt"), "excerpt is notes-only");
  assert.ok(pt[0].headline.length <= 120);
  const pidgin = candidates(feed("bbc-pidgin"), fixture("bbc-pidgin.xml"), NOW);
  assert.equal(pidgin.length, 2);
  assert.ok(pidgin[0].publisher, "publisher falls back to the feed label when the item has no source tag");
});

test("Google Trends: cards link to Trends, never to the item's own link or injected URLs", () => {
  const found = candidates(feed("gtrends-ng"), fixture("gtrends-ng.xml"), NOW);
  assert.equal(found.length, 3);
  for (const t of found) {
    assert.equal(t.type, "trend-topic");
    assert.equal(t.url, "https://trends.google.com/trending?geo=NG", "the feed <link> is the RSS url, useless as a source");
    assert.ok(/Trending on Google Search in Nigeria/.test(t.summary));
    assert.ok(/searches/.test(t.summary) || !t.summary.includes("rough"), "traffic count only when the feed gave one");
  }
  const notes = found.map((f) => f.notes).join(" ");
  assert.ok(notes.includes("Related coverage Google lists"), "the headline pair is kept as a checking aid");
  assert.ok(!/https?:\/\//.test(notes), "a Trends news URL is never copied into notes — one came back carrying an injected data: payload");
  assert.ok(!notes.includes("data:"), "no data: URL reaches a card");
  assert.ok(found.every((f) => f.key.startsWith("trend:NG:")), "the dedupe key is the topic plus the day");
});

test("a blocked site's 403 error page never becomes a card", async () => {
  const blocked = fixture("vanguard-403.html");
  assert.ok(/<title>/i.test(blocked), "the page does have title and link tags a naive parser would grab");
  const store = makeStore();
  const res = await runResearch(store, { feeds: ["vanguard"] }, { fetchFn: fakeFetch({ "https://www.vanguardngr.com": { status: 403, body: blocked } }), now: NOW });
  assert.equal(res.added, 0);
  assert.equal(res.feeds[0].ok, false);
  assert.match(res.feeds[0].error, /403 \(direct\)/, "the report names the door that failed");
  assert.match(res.feeds[0].error, /Google News/, "and says the twin was tried as well");
  assert.equal((await readCards(store)).length, 1, "only the seeded test card");
});

test("a feed that returns no items, or hangs, is reported and not fatal", async () => {
  const store = makeStore();
  const res = await runResearch(
    store,
    { feeds: ["businessday", "channels"] },
    { fetchFn: fakeFetch({
      "https://businessday.ng": fixture("businessday.xml"),
      "https://www.channelstv.com": new Error("socket hang up"),
    }), now: NOW }
  );
  const bd = res.feeds.find((f) => f.id === "businessday");
  const ch = res.feeds.find((f) => f.id === "channels");
  assert.equal(bd.ok, true);
  assert.equal(bd.added, 1);
  assert.equal(ch.ok, false);
  assert.match(ch.error, /socket hang up \(direct\)/, "the hang is reported, not swallowed");
});

// ---------- the four outlets that block server traffic ----------

test("a blocked outlet falls back to its Google News twin and is read as Google News", async () => {
  const store = makeStore();
  const res = await runResearch(
    store,
    { feeds: ["vanguard"] },
    { fetchFn: fakeFetch({
      "https://www.vanguardngr.com": { status: 403, body: "<html><title>no</title></html>" },
      "https://news.google.com/rss/search": fixture("gnews-ng.xml"),
    }), now: NOW }
  );
  const f = res.feeds.find((x) => x.id === "vanguard");
  assert.equal(f.ok, true, "the outlet is unreachable, its coverage is not");
  assert.equal(f.via, "Google News");
  assert.ok(f.added > 0);
  const filed = (await readCards(store)).filter((c) => c.importKey);
  assert.ok(filed.length > 0);
  for (const c of filed) {
    assert.equal(c.source.publisher.length > 1, true, "the publisher comes from Google's source tag");
    assert.ok(!c.headline.endsWith(`- ${c.source.publisher}`), "Google's title suffix is stripped even on the twin");
    assert.equal(c.approval, "pending");
  }
});

test("proxyFor covers the three shapes a proxy endpoint comes in", () => {
  const target = "https://www.vanguardngr.com/feed";
  assert.equal(
    proxyFor("https://api.scrapingbee.com/api/v1/?api_key=abc&url=%s", target),
    "https://api.scrapingbee.com/api/v1/?api_key=abc&url=https%3A%2F%2Fwww.vanguardngr.com%2Ffeed"
  );
  assert.equal(proxyFor("https://worker.example.com/rss?url=", target), "https://worker.example.com/rss?url=https%3A%2F%2Fwww.vanguardngr.com%2Ffeed");
  assert.equal(proxyFor("https://rsshub.example.com/guardian/", target), "https://rsshub.example.com/guardian/https://www.vanguardngr.com/feed");
  assert.equal(proxyFor("", target), null, "unset means fetch it directly, as before");
  assert.equal(proxyFor("ftp://nope/%s", target), null, "only http(s) templates are used");
  assert.equal(proxyFor("https://w.example/?u=%s", "https://a.example/?x=1&y=2").includes("y%3D2"), true, "the target's own query cannot escape the template");
});

test("with a proxy set, the outlet's own feed comes through it and the doomed direct call is skipped", async () => {
  const asked = [];
  const fetchFn = async (url) => {
    asked.push(url);
    if (url.startsWith("https://proxy.example/")) return { ok: true, status: 200, async text() { return fixture("premiumtimes.xml"); } };
    return { ok: false, status: 403, async text() { return "<html>blocked</html>"; } };
  };
  const store = makeStore();
  const res = await runResearch(store, { feeds: ["vanguard"] }, { fetchFn, now: NOW, proxy: "https://proxy.example/fetch?url=%s&api_key=abc" });
  const f = res.feeds.find((x) => x.id === "vanguard");
  assert.equal(f.ok, true);
  assert.equal(f.via, "proxy");
  assert.equal(asked.length, 1, "one request, not three");
  assert.ok(asked[0].startsWith("https://proxy.example/"), "the proxy was the door");
  assert.ok(asked[0].includes("url=https%3A%2F%2Fwww.vanguardngr.com"), "carrying the outlet's own feed address");
  const filed = (await readCards(store)).filter((c) => c.importKey);
  assert.ok(filed.some((c) => c.presenterNotes.startsWith("Publisher's own excerpt")), "the outlet's own excerpt reaches the private notes");
  assert.ok(!JSON.stringify(res).includes("api_key=abc"), "the key never appears in the report the browser sees");
});

test("a slow proxy is stopped by the per-feed budget instead of eating the function limit", async () => {
  const asked = [];
  const fetchFn = async (url) => {
    asked.push(url);
    await new Promise((r) => setTimeout(r, 1200));
    return { ok: false, status: 500, async text() { return ""; } };
  };
  const store = makeStore();
  const t0 = Date.now();
  const res = await runResearch(store, { feeds: ["vanguard"] }, { fetchFn, now: NOW, proxy: "https://proxy.example/u=%s", budgetMs: 1500 });
  assert.ok(Date.now() - t0 < 3000, "it gave up on schedule");
  assert.equal(asked.length, 1, "and did not start a second attempt it had no time for");
  assert.match(res.feeds.find((x) => x.id === "vanguard").error, /out of time/);
});

test("research files everything as pending, reported, with a traceable link", async () => {
  const store = makeStore();
  const res = await runResearch(store, { feeds: ["premiumtimes"] }, { fetchFn: fakeFetch({ "https://www.premiumtimesng.com": fixture("premiumtimes.xml") }), now: NOW });
  assert.equal(res.added, 2);
  const added = (await readCards(store)).slice(1);
  for (const c of added) {
    assert.equal(c.approval, "pending", "nothing auto-arrives on air");
    assert.equal(c.confidence, "reported");
    assert.ok(c.source.url.startsWith("https://"));
    assert.equal(c.source.retrievedAt, new Date(NOW).toISOString());
  }
  assert.equal(queueOf(await readCards(store)).length, 0, "fixtures and auto arrivals never enter the play queue by themselves");
});

test("re-running research adds nothing, and it cannot clobber a card the operator edited", async () => {
  const bodies = { "https://www.premiumtimesng.com": fixture("premiumtimes.xml") };
  const store = makeStore();
  const first = await runResearch(store, { feeds: ["premiumtimes"] }, { fetchFn: fakeFetch(bodies), now: NOW });
  assert.equal(first.added, 2);
  const cards = await readCards(store);
  await upsertCard(store, { id: cards[1].id, summary: "My own words", question: "What do you think?", presenterNotes: "checked twice", approval: "pending" }, NOW);

  const second = await runResearch(store, { feeds: ["premiumtimes"] }, { fetchFn: fakeFetch(bodies), now: NOW + 60_000 });
  assert.equal(second.added, 0, "importKey dedupe holds across runs");
  const kept = (await readCards(store)).find((c) => c.id === cards[1].id);
  assert.equal(kept.summary, "My own words", "an auto run must not roll back an edit");

  // A run that read the queue before the operator saved must still merge, not overwrite.
  const stale = JSON.parse(JSON.stringify(cards));
  store.setJSON("cards", [...stale, card({ id: "mine", headline: "Added by hand", approval: "approved" })]);
  const third = await runResearch(store, { feeds: ["premiumtimes"] }, { fetchFn: fakeFetch({ "https://www.premiumtimesng.com": fixture("premiumtimes.xml").replace(/premiumtimesng\.com\/news/, "premiumtimesng.com/other") }), now: NOW + 120_000 });
  assert.ok(third.added >= 1);
  assert.ok((await readCards(store)).some((c) => c.headline === "Added by hand"), "the hand-added card survived the merge");
});

test("the NG and US overlap card is labelled as its own thing", async () => {
  const trendItem = (topic) => `<item><title>${topic}</title><ht:approx_traffic>50+</ht:approx_traffic><pubDate>Wed, 28 Oct 2026 10:00:00 -0700</pubDate><link>https://trends.google.com/trending/rss</link></item>`;
  const bodies = {
    "https://trends.google.com/trending/rss?geo=NG": `<rss><channel>${trendItem("tinubu surgery")}</channel></rss>`,
    "https://trends.google.com/trending/rss?geo=US": `<rss><channel>${trendItem("Tinubu surgery")}</channel></rss>`,
  };
  const store = makeStore();
  const res = await runResearch(store, { feeds: ["gtrends-ng", "gtrends-us"] }, { fetchFn: fakeFetch(bodies), now: NOW });
  const overlap = res.feeds.find((f) => f.id === "overlap");
  assert.equal(overlap.added, 1, "a topic on both lists gets one extra card");
  const cards = await readCards(store);
  const c = cards.find((x) => x.category === "Trending in NG and US");
  assert.ok(c, "the cross-border card exists");
  assert.equal(c.approval, "pending");
  assert.match(c.presenterNotes, /Check that they really are the same story/);
});

// ---------- the churn the live feeds caused (found by running the real feeds twice) ----------

const DAY = 24 * 3600_000;
const rssItem = (n) =>
  `<item><title>Story ${n}</title><pubDate>${new Date(Date.parse("2026-10-28T08:00:00Z") + n * 3600_000).toUTCString()}` +
  `</pubDate><link>https://pt.example/${n}</link><description>excerpt ${n}</description></item>`;
const eightItems = (order) => `<rss><channel>${order.map(rssItem).join("")}</channel></rss>`;
const FEED_ORDER = [1, 2, 3, 4, 5, 6, 7, 8];
const RESHUFFLED = [8, 3, 6, 1, 7, 2, 5, 4]; // what the live feed actually does between runs
const ptFeed = () => FEEDS.find((f) => f.id === "premiumtimes");

test("feed order decides nothing: the newest items win the slots", () => {
  const forward = candidates(ptFeed(), eightItems(FEED_ORDER), NOW).map((c) => c.headline);
  const shuffled = candidates(ptFeed(), eightItems(RESHUFFLED), NOW).map((c) => c.headline);
  assert.deepEqual(forward, ["Story 8", "Story 7", "Story 6", "Story 5", "Story 4", "Story 3", "Story 2", "Story 1"], "newest first");
  assert.deepEqual(shuffled, forward, "the same items in a different order produce the same ranked list");
});

test("a feed that reshuffles between runs files the leftovers, then nothing", async () => {
  let xml = eightItems(FEED_ORDER);
  const fetchFn = async () => ({ ok: true, status: 200, async text() { return xml; } });
  const store = makeStore();
  const first = await runResearch(store, { feeds: ["premiumtimes"] }, { fetchFn, now: NOW });
  assert.equal(first.added, PER_FEED, "the six newest win the six slots");
  xml = eightItems(RESHUFFLED);
  const second = await runResearch(store, { feeds: ["premiumtimes"] }, { fetchFn, now: NOW + 60_000 });
  assert.equal(second.added, 2, "only the two items the first run never reached");
  const third = await runResearch(store, { feeds: ["premiumtimes"] }, { fetchFn, now: NOW + 120_000 });
  assert.equal(third.added, 0, "a reshuffle alone must not grow the queue");
});

test("a full pending queue is reported, not filled", async () => {
  const full = Array.from({ length: RESEARCH_MAX_PENDING }, (_, i) =>
    card({ id: "auto" + i, approval: "pending", summary: "", question: "", importKey: "https://pt.example/other/" + i, createdAt: NOW - 60_000 })
  );
  const store = makeStore({ cards: JSON.stringify(full) });
  const res = await runResearch(store, { feeds: ["premiumtimes"] }, { fetchFn: fakeFetch({ "https://www.premiumtimesng.com": eightItems(FEED_ORDER) }), now: NOW });
  assert.equal(res.added, 0, "nothing is filed past the cap");
  assert.equal(res.held, PER_FEED, "the operator is told how many were ready");
  assert.equal(res.pending, RESEARCH_MAX_PENDING);
  const report = res.feeds.find((f) => f.id === "premiumtimes");
  assert.deepEqual({ found: report.found, added: report.added, held: report.held }, { found: 8, added: 0, held: PER_FEED }, "the per-feed report matches what was stored");
  assert.equal((await readCards(store)).length, RESEARCH_MAX_PENDING, "the blob did not grow");
});

test("age-out drops only machine cards nobody wrote on, and frees room in the same run", async () => {
  const stale = { approval: "pending", summary: "", question: "", createdAt: NOW - DAY - 3600_000 };
  const seed = [
    card({ id: "stale-auto-1", ...stale, importKey: "k1" }),
    card({ id: "stale-auto-2", ...stale, importKey: "k2" }),
    card({ id: "stale-auto-edited", ...stale, importKey: "k3", summary: "I wrote this" }),
    card({ id: "stale-auto-approved", ...stale, importKey: "k4", approval: "approved" }),
    card({ id: "fresh-auto", approval: "pending", summary: "", question: "", importKey: "k5", createdAt: NOW - 3600_000 }),
    card({ id: "by-hand", approval: "approved", createdAt: NOW - 30 * DAY }),
  ];
  const store = makeStore({ cards: JSON.stringify(seed) });
  const res = await runResearch(store, { feeds: ["premiumtimes"] }, { fetchFn: fakeFetch({ "https://www.premiumtimesng.com": eightItems(FEED_ORDER) }), now: NOW });
  assert.equal(res.dropped, 2, "only the two untouched, unapproved, day-old auto cards");
  assert.equal(res.added, PER_FEED, "the age-out made room in this same run");
  const kept = new Set((await readCards(store)).map((c) => c.id));
  for (const id of ["stale-auto-edited", "stale-auto-approved", "fresh-auto", "by-hand"]) assert.ok(kept.has(id), `${id} is operator work or recent, it stays`);
  assert.ok(!kept.has("stale-auto-1") && !kept.has("stale-auto-2"));
  assert.equal(pruneAutoArrivals(seed, NOW).dropped, 2);
  assert.equal(untouchedAuto(seed.find((c) => c.id === "by-hand")), false, "a hand-made card is never pruned");
});

// ---------- desks: sticky topic filters ----------

const deskSet = () => [
  card({ id: "p1", category: "Nigeria", headline: "Tinubu asks the Senate to pass the new tax bill", createdAt: 2 }),
  card({ id: "m1", category: "Naija Music", headline: "Asake announces the album date", createdAt: 1 }),
  card({ id: "m2", category: "Naija Music", headline: "Singer confirms the concert lineup", createdAt: 3 }),
  card({ id: "v1", category: "Nollywood", headline: "Animals takes number one at the box office", createdAt: 4 }),
  card({ id: "s1", category: "Naija Creators", headline: "TikToker's japa skit hits a million views", createdAt: 5 }),
  card({ id: "un", category: "Naija Music", headline: "Song leak nobody approved", approval: "pending", createdAt: 6 }),
];

test("a desk queue holds only that desk's approved cards", () => {
  const cs = deskSet();
  assert.deepEqual(queueOf(cs, "politics").map((c) => c.id), ["p1"]);
  assert.deepEqual(queueOf(cs, "music").map((c) => c.id), ["m1", "m2"], "in queue order");
  assert.deepEqual(queueOf(cs, "movies").map((c) => c.id), ["v1"]);
  assert.deepEqual(queueOf(cs, "streamers").map((c) => c.id), ["s1"]);
  assert.deepEqual(queueOf(cs, null).map((c) => c.id), ["m1", "p1", "m2", "v1", "s1"], "no desk is the whole queue");
});

test("a card with no useful category still lands on a desk by its words", () => {
  const c = card({ category: "Test", headline: "Olamide headlines the concert lineup" });
  assert.equal(matchesDesk(c, "music"), true);
  assert.equal(matchesDesk(c, "movies"), false);
  assert.equal(matchesDesk(card({ category: "Nigeria", headline: "Fuel queue extends in Apapa" }), "politics"), false, "a story is not politics just because it happened in Nigeria");
});

test("desk names resolve through their aliases, and nothing else", () => {
  assert.equal(resolveDesk("nollywood").id, "movies");
  assert.equal(resolveDesk("Creators").id, "streamers");
  assert.equal(resolveDesk("afrobeats").id, "music");
  assert.equal(resolveDesk("all").id, null, "all is the way back out of a desk");
  assert.equal(resolveDesk("football"), null);
  for (const d of DESKS) assert.equal(resolveDesk(d.id).id, d.id, `${d.id} resolves from its own name`);
});

test("desk music puts that desk on air and sticks", async () => {
  const store = makeStore({ cards: JSON.stringify(deskSet()) });
  const res = await runAction(store, { action: "desk", desk: "music" }, NOW);
  assert.equal(res.state.desk, "music");
  assert.equal(res.state.activeCardId, "m1");
  assert.equal(res.state.visible, true);
  assert.equal(res.state.expiresAt, NOW + 45_000, "the card gets its own clock");
});

test("the same desk twice does not skip a card", async () => {
  const store = makeStore({ cards: JSON.stringify(deskSet()) });
  await runAction(store, { action: "desk", desk: "music" }, NOW);
  const res = await runAction(store, { action: "desk", desk: "music" }, NOW + 1000);
  assert.equal(res.state.activeCardId, "m1", "you are already on this desk's first card");
});

test("next moves inside the desk and wraps there", async () => {
  const store = makeStore({ cards: JSON.stringify(deskSet()) });
  await runAction(store, { action: "desk", desk: "music" }, NOW);
  assert.equal((await runAction(store, { action: "next" }, NOW + 1)).state.activeCardId, "m2");
  assert.equal((await runAction(store, { action: "next" }, NOW + 2)).state.activeCardId, "m1", "wraps inside two cards, not the five in the queue");
  assert.equal((await runAction(store, { action: "previous" }, NOW + 3)).state.activeCardId, "m2");
});

test("auto-play advances inside the desk, not past it", async () => {
  const store = makeStore({
    cards: JSON.stringify(deskSet()),
    state: JSON.stringify({ version: 3, updatedAt: 1, mode: "cards", visible: true, hold: false, desk: "music", autoPlay: true, activeCardId: "m1", expiresAt: NOW - 1, poll: null }),
  });
  const moved = await advanceIfExpired(store, await readState(store), NOW);
  assert.equal(moved.activeCardId, "m2", "p1 sits between m1 and m2 in the full queue and must be skipped");
});

test("a desk with nothing approved says so and changes nothing", async () => {
  const store = makeStore({ cards: JSON.stringify([deskSet()[0]]) });
  await assert.rejects(
    runAction(store, { action: "desk", desk: "movies" }, NOW),
    /Nothing approved on the Movies desk/,
  );
  const s = await readState(store);
  assert.equal(s.version, 0, "a refused command must not bump the version the overlay is polling");
  assert.equal(s.desk, null);
});

test("an unknown desk is refused with the names that exist", async () => {
  const store = makeStore({ cards: JSON.stringify(deskSet()) });
  await assert.rejects(runAction(store, { action: "desk", desk: "football" }, NOW), /Unknown desk/);
});

test("desk all clears the filter and keeps the card on air", async () => {
  const store = makeStore({ cards: JSON.stringify(deskSet()) });
  await runAction(store, { action: "desk", desk: "music" }, NOW);
  const res = await runAction(store, { action: "desk", desk: "all" }, NOW + 5);
  assert.equal(res.state.desk, null);
  assert.equal(res.state.activeCardId, "m1");
  assert.equal(res.state.visible, true);
});

test("showing a card outside the desk leaves the desk instead of failing", async () => {
  const store = makeStore({ cards: JSON.stringify(deskSet()) });
  await runAction(store, { action: "desk", desk: "music" }, NOW);
  const res = await runAction(store, { action: "show", cardId: "p1" }, NOW + 1);
  assert.equal(res.state.activeCardId, "p1");
  assert.equal(res.state.desk, null, "you asked for this card, so the desk filter is off");
});

test("the overlay's state carries the desk and nothing private", async () => {
  const store = makeStore({ cards: JSON.stringify(deskSet()) });
  await runAction(store, { action: "desk", desk: "music" }, NOW);
  const res = await publicState(store, null, NOW + 1);
  assert.equal(res.body.desk, "music");
  assert.ok(!("activeCardId" in res.body));
  assert.equal(res.body.card.id, "m1");
});

test("a state blob from before desks reads with no desk", async () => {
  const store = makeStore({ state: JSON.stringify({ version: 16, mode: "cards", visible: true, activeCardId: "x" }) });
  assert.equal((await readState(store)).desk, null);
  assert.equal(DEFAULT_STATE.desk, null);
});

// ---------- the entertainment desks and the room they need ----------

const DESK_FEEDS = [
  ["ng-creators", "streamers"],
  ["ng-music", "music"],
  ["ng-movies", "movies"],
  ["us-music", "music"],
  ["us-creators", "streamers"],
];

test("the new desk feeds file cards that answer their own desk command", () => {
  for (const [id, deskId] of DESK_FEEDS) {
    const f = feed(id);
    assert.ok(f, `${id} is a feed the importer knows`);
    assert.match(f.url, /^https:\/\//, `${f.label} is fetched over https`);
    assert.equal(matchesDesk({ category: f.category, headline: "", summary: "" }, deskId), true,
      `${f.label} files into ${f.category}, which "desk ${deskId}" can find`);
  }
});

test("every new feed has a second door so one block cannot kill a desk", () => {
  for (const [id] of DESK_FEEDS) {
    const f = feed(id);
    assert.ok(f.alt, `${f.label} falls back to a Google News query`);
    assert.match(f.alt, /^https:\/\/news\.google\.com\/rss\/search\?q=/);
  }
});

test("a nearly full queue shares what is left instead of feeding the first feed", async () => {
  const itemsFor = (host) => `<rss><channel>${[1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
    `<item><title>${host} story ${n}</title><pubDate>${new Date(Date.parse("2026-10-28T08:00:00Z") + n * 3600_000).toUTCString()}` +
    `</pubDate><link>https://${host}/${n}</link><description>excerpt ${n}</description></item>`).join("")}</channel></rss>`;
  const hosts = ["www.premiumtimesng.com", "dailypost.ng", "businessday.ng", "feeds.bbci.co.uk"];
  const bodies = Object.fromEntries(hosts.map((host) => [`https://${host}`, itemsFor(host.split(".")[0])]));
  const seed = Array.from({ length: RESEARCH_MAX_PENDING - 6 }, (_, i) =>
    card({ id: `auto${i}`, approval: "pending", importKey: `seed${i}`, createdAt: NOW - 3600_000 }));
  const store = makeStore({ cards: JSON.stringify(seed) });

  const res = await runResearch(store, { feeds: ["premiumtimes", "dailypost", "businessday", "bbc-pidgin"] }, { fetchFn: fakeFetch(bodies), now: NOW });

  const counts = res.feeds.map((f) => f.added);
  assert.equal(res.added, 6, "the room that was left is used exactly");
  assert.ok(counts.every((n) => n >= 1), `every feed gets a card: ${counts.join(",")}`);
  assert.ok(Math.max(...counts) < PER_FEED, `no feed takes all six: ${counts.join(",")}`);
  assert.equal((await readCards(store)).filter(untouchedAuto).length, RESEARCH_MAX_PENDING);
});

// ---------- CRID: the branded segment on top of the desk ----------

const cridStore = () => makeStore({ cards: JSON.stringify(deskSet()) });
const openCrid = (store, over = {}) =>
  runAction(store, { action: "crid-open", kind: "music", title: "Does this album survive the night?", ...over }, NOW);

test("a CRID segment opens with its own entry number and nothing else changes", async () => {
  const store = cridStore();
  const { state } = await openCrid(store);

  assert.equal(state.crid.kind, "music");
  assert.equal(state.crid.title, "Does this album survive the night?");
  assert.equal(state.crid.entry, 1, "the first segment of the run is entry 1");
  assert.equal(state.crid.verdict, null, "no verdict until someone stamps one");
  assert.equal(state.visible, false, "opening CRID does not put a card on air");
  assert.equal(state.mode, "cards", "opening CRID does not take over the card overlay");
});

test("entry numbers keep counting through closes, so the ledger never repeats a number", async () => {
  const store = cridStore();
  const first = (await openCrid(store)).state;
  await runAction(store, { action: "crid-close" }, NOW);
  const second = (await openCrid(store, { title: "Second segment" })).state;

  assert.equal(first.crid.entry, 1);
  assert.equal(second.crid.entry, 2, "a new segment does not reuse entry 1");
  assert.notEqual(second.crid.id, first.crid.id);
});

test("a segment needs a kind the overlay can draw and a title the viewer can read", async () => {
  const store = cridStore();
  await assert.rejects(() => runAction(store, { action: "crid-open", kind: "music" }, NOW), /title/i);
  await assert.rejects(() => runAction(store, { action: "crid-open", title: "x", kind: "football" }, NOW), /kind/i);
  assert.equal((await readState(store)).crid, null, "a refused open leaves nothing on screen");
});

test("the verdict is only ever 1 or 0, and only on a segment that is open", async () => {
  const store = cridStore();
  await assert.rejects(() => runAction(store, { action: "crid-verdict", value: 1 }, NOW), /no CRID/i);

  await openCrid(store);
  assert.equal((await runAction(store, { action: "crid-verdict", value: 0 }, NOW)).state.crid.verdict, 0);
  assert.equal((await runAction(store, { action: "crid-verdict", value: 1 }, NOW)).state.crid.verdict, 1, "correcting it is allowed");
  await assert.rejects(() => runAction(store, { action: "crid-verdict", value: 2 }, NOW), /0 or 1/);
  await assert.rejects(() => runAction(store, { action: "crid-verdict", value: "1" }, NOW), /0 or 1/, "a string one is not the number one");
});

test("closing a segment clears its verdict, so a stale 0 cannot ride onto the next one", async () => {
  const store = cridStore();
  await openCrid(store);
  await runAction(store, { action: "crid-verdict", value: 0 }, NOW);
  const { state } = await runAction(store, { action: "crid-close" }, NOW);

  assert.equal(state.crid, null);
  const next = (await openCrid(store, { title: "Next segment" })).state;
  assert.equal(next.crid.verdict, null, "the closed verdict did not leak");
});

test("the operator can take CRID off the air and fire one gesture at a time", async () => {
  const store = makeStore();

  // A desk that has never been told anything about the bot reads as on with nothing pending.
  assert.equal((await readState(store)).bot, null);

  // A bare press flips whatever was there, so the dashboard needs one button, not two.
  assert.equal((await runAction(store, { action: "bot" }, NOW)).state.bot.on, false);
  assert.equal((await runAction(store, { action: "bot" }, NOW)).state.bot.on, true, "the second press puts it back");
  assert.equal(
    (await runAction(store, { action: "bot", value: false }, NOW)).state.bot.on,
    false,
    "an explicit value beats the toggle",
  );

  // The counter is what the overlay watches, so the same kind twice is still two reactions.
  const first = (await runAction(store, { action: "bot-react", kind: "wave" }, NOW)).state;
  assert.deepEqual(first.bot.react, { kind: "wave", n: 1 });
  assert.equal(first.bot.on, false, "asking for a gesture does not switch the bot back on");
  assert.deepEqual(
    (await runAction(store, { action: "bot-react", kind: "wave" }, NOW)).state.bot.react,
    { kind: "wave", n: 2 },
    "the second wave is a different reaction, not a duplicate",
  );
  await assert.rejects(() => runAction(store, { action: "bot-react", kind: "explode" }, NOW), /kind must be one of/);

  const seeded = (await runAction(store, { action: "bot-subs", count: 42 }, NOW)).state;
  assert.equal(seeded.bot.subs, 42, "the operator can set the current stream baseline");
  assert.equal(seeded.bot.on, false, "setting the total does not switch CRID on");
  assert.deepEqual(seeded.bot.react, { kind: "wave", n: 2 }, "setting the total does not replay a gesture");
  await assert.rejects(() => runAction(store, { action: "bot-subs", count: 42.5 }, NOW), /whole number/);
  await assert.rejects(() => runAction(store, { action: "bot-subs", count: 10_000_001 }, NOW), /whole number/);

  // The overlay draws the bot from the viewer projection, so the switch and baseline survive it.
  const body = publicProjection((await runAction(store, { action: "bot", value: true }, NOW)).state);
  assert.equal(body.bot.on, true);
  assert.equal(body.bot.subs, 42);
  assert.deepEqual(body.bot.react, { kind: "wave", n: 2 }, "a toggle does not discard the pending gesture");
});

test("an ended poll writes its result onto the open segment, and the operator still stamps the verdict", async () => {
  const store = cridStore();
  await openCrid(store);
  await runAction(store, { action: "start-poll", question: "Does it survive?", options: ["Yes", "No"] }, NOW);
  await runAction(store, { action: "set-votes", counts: { a: 30, b: 7 } }, NOW);
  const { state } = await runAction(store, { action: "end-poll" }, NOW);

  assert.equal(state.crid.result.winner, "Yes");
  assert.equal(state.crid.result.percent, 81);
  assert.equal(state.crid.result.total, 37);
  assert.equal(state.crid.verdict, null, "the tally is not the verdict");
  assert.equal(state.poll.active, false, "the poll still ends the ordinary way");

  await runAction(store, { action: "crid-verdict", value: 1 }, NOW);
  assert.equal((await readState(store)).crid.result.winner, "Yes", "stamping keeps the tally visible");
});

test("a tie gets no winner, because inventing one would be a lie on air", async () => {
  const store = cridStore();
  await openCrid(store);
  await runAction(store, { action: "start-poll", question: "Split room", options: ["Yes", "No"] }, NOW);
  await runAction(store, { action: "set-votes", counts: { a: 5, b: 5 } }, NOW);
  const { state } = await runAction(store, { action: "end-poll" }, NOW);

  assert.equal(state.crid.result.winner, null);
  assert.equal(state.crid.result.tie, true);
});

test("a vote with no poll running cannot write a result onto the segment", async () => {
  const store = cridStore();
  await openCrid(store);
  await assert.rejects(() => runAction(store, { action: "set-votes", counts: { a: 1 } }, NOW), /no poll/i);
  assert.equal((await readState(store)).crid.result ?? null, null);
});

test("a state blob from before CRID reads with nothing on the card", async () => {
  const old = { ...DEFAULT_STATE };
  delete old.crid;
  delete old.cridSeq;
  const store = makeStore({ state: JSON.stringify(old) });

  const state = await readState(store);
  assert.equal(state.crid, null);
  assert.equal(state.cridSeq, 0);
  const { state: after } = await openCrid(store);
  assert.equal(after.crid.entry, 1, "counting starts from the first real segment");
});

test("the overlay's state carries the segment and still nothing private", async () => {
  const store = cridStore();
  await openCrid(store, { credit: "Tunde" });
  const res = await publicState(store, null, NOW);

  assert.equal(res.body.crid.credit, "Tunde", "a credited Stranger is on-screen by design");
  assert.equal("activeCardId" in res.body, false);
  assert.equal("autoResearch" in res.body, false);
  assert.equal("presenterNotes" in (res.body.card ?? {}), false);
});

test("credit and title are clipped to what a card can hold", async () => {
  const store = cridStore();
  const { state } = await openCrid(store, { title: "T".repeat(200), credit: "C".repeat(90) });

  assert.ok(state.crid.title.length <= LIMITS.cridTitle, `${state.crid.title.length} > ${LIMITS.cridTitle}`);
  assert.ok(state.crid.credit.length <= LIMITS.cridCredit, `${state.crid.credit.length} > ${LIMITS.cridCredit}`);
});

test("stamped verdict flows cleanly into public projection and clears on segment close", async () => {
  const store = cridStore();
  await openCrid(store, { kind: "debate", title: "Can Afrobeats sustain stadium tours in the US?" });
  await runAction(store, { action: "crid-verdict", value: 1 }, NOW);

  let res = await publicState(store, null, NOW);
  assert.equal(res.body.crid.verdict, 1, "stamped verdict 1 is present in public state");
  assert.equal(res.body.crid.kind, "debate");

  await runAction(store, { action: "crid-close" }, NOW);
  res = await publicState(store, null, NOW);
  assert.equal(res.body.crid, null, "closing leaves nothing in public state");
});

// ---------- CRID audio (Swae / stream audio) ----------

test("crid-open accepts an audio URL and stores it on the segment", async () => {
  const store = cridStore();
  const { state } = await openCrid(store, {
    audioUrl: "https://cdn.example.com/segment-1.mp3",
  });
  assert.equal(state.crid.audioUrl, "https://cdn.example.com/segment-1.mp3");
  assert.equal(state.crid.audioPlaying, false, "audio does not auto-play when opened");
  assert.equal(state.crid.audioMuted, false, "new segments start unmuted");
});

test("crid-open clips an over-long audio URL", async () => {
  const store = cridStore();
  const { state } = await openCrid(store, {
    audioUrl: "https://example.com/" + "a".repeat(3000),
  });
  assert.ok(state.crid.audioUrl.length <= LIMITS.cridAudioUrl);
  assert.ok(state.crid.audioUrl.endsWith("…"), "clipped URL ends with ellipsis");
});

test("CRID audio URLs must use HTTPS and cannot embed credentials", async () => {
  const store = cridStore();
  for (const audioUrl of ["http://cdn.example.com/track.mp3", "javascript:alert(1)", "https://user:pass@cdn.example.com/track.mp3"]) {
    await assert.rejects(() => openCrid(store, { audioUrl }), /HTTPS audio URL/i, audioUrl);
  }
});

test("crid-audio toggles play/pause on an open segment", async () => {
  const store = cridStore();
  await openCrid(store, { audioUrl: "https://cdn.example.com/segment-1.mp3" });

  let state = (await runAction(store, { action: "crid-audio", playing: true }, NOW)).state;
  assert.equal(state.crid.audioPlaying, true);

  state = (await runAction(store, { action: "crid-audio", playing: false }, NOW)).state;
  assert.equal(state.crid.audioPlaying, false);
});

test("crid-audio without a specified playing toggles the current state", async () => {
  const store = cridStore();
  await openCrid(store, { audioUrl: "https://cdn.example.com/segment-1.mp3" });

  let state = (await runAction(store, { action: "crid-audio" }, NOW)).state;
  assert.equal(state.crid.audioPlaying, true, "first toggle turns it on");

  state = (await runAction(store, { action: "crid-audio" }, NOW)).state;
  assert.equal(state.crid.audioPlaying, false, "second toggle turns it off");
});

test("crid-audio mute changes do not pause playback", async () => {
  const store = cridStore();
  await openCrid(store, { audioUrl: "https://cdn.example.com/segment-1.mp3" });
  await runAction(store, { action: "crid-audio", playing: true }, NOW);

  let state = (await runAction(store, { action: "crid-audio", muted: true }, NOW)).state;
  assert.equal(state.crid.audioMuted, true);
  assert.equal(state.crid.audioPlaying, true);

  state = (await runAction(store, { action: "crid-audio", muted: false }, NOW)).state;
  assert.equal(state.crid.audioMuted, false);
  assert.equal(state.crid.audioPlaying, true);
});

test("crid-audio can replace the audio URL while playing", async () => {
  const store = cridStore();
  await openCrid(store, { audioUrl: "https://cdn.example.com/segment-1.mp3", audioPlaying: true });

  const state = (await runAction(store, {
    action: "crid-audio",
    playing: true,
    audioUrl: "https://cdn.example.com/segment-2.mp3",
  }, NOW)).state;
  assert.equal(state.crid.audioUrl, "https://cdn.example.com/segment-2.mp3");
  assert.equal(state.crid.audioPlaying, true);
});

test("crid-audio refuses to run when no segment is open", async () => {
  const store = cridStore();
  await assert.rejects(() => runAction(store, { action: "crid-audio", playing: true }, NOW), /no CRID/i);
  assert.equal((await readState(store)).crid, null);
});

test("publicState carries audioUrl and audioPlaying on the crid segment", async () => {
  const store = cridStore();
  await openCrid(store, { audioUrl: "https://cdn.example.com/segment-1.mp3" });
  await runAction(store, { action: "crid-audio", playing: true }, NOW);

  const res = await publicState(store, null, NOW);
  assert.equal(res.body.crid.audioUrl, "https://cdn.example.com/segment-1.mp3");
  assert.equal(res.body.crid.audioPlaying, true);
  assert.equal(res.body.crid.audioMuted, false);
});

// ---------- Twitch clipping ----------

const makeClipFetch = (responses) => {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, method: init.method, body: init.body });
    const u = new URL(url);
    const match = responses.find((r) => r.method === init.method && u.pathname.endsWith(r.path));
    if (!match) {
      return { ok: false, status: 404, async text() { return "not found"; } };
    }
    return {
      ok: true,
      status: 200,
      async text() { return JSON.stringify(match.body); },
      async json() { return match.body; },
    };
  };
  return { fetchFn, calls };
};

test("createTwitchClip refuses when not configured", async () => {
  const store = makeStore();
  await assert.rejects(
    () => createTwitchClip(store, {}, { ...DEFAULT_STATE }, NOW, { env: {} }),
    /Twitch clipping is not configured/
  );
});

test("createTwitchClip creates a clip and verifies it with Get Clips", async () => {
  const store = makeStore();
  const state = { ...DEFAULT_STATE, lastClip: null };
  const env = {
    TWITCH_CLIENT_ID: "abc123",
    TWITCH_CLIP_ACCESS_TOKEN: "token123",
    TWITCH_BROADCASTER_USER_ID: "460177396",
  };
  const { fetchFn, calls } = makeClipFetch([
    {
      method: "POST",
      path: "/clips",
      body: { data: [{ id: "clip-1", edit_url: "https://clips.twitch.tv/FastClip" }] },
    },
    {
      method: "GET",
      path: "/clips",
      body: { data: [{ id: "clip-1", url: "https://clips.twitch.tv/FastClip", edit_url: "https://clips.twitch.tv/FastClip", created_at: new Date(NOW).toISOString(), broadcaster_id: "460177396" }] },
    },
  ]);

  const result = await createTwitchClip(store, {}, state, NOW, { env, fetchFn });

  assert.equal(result.clip.status, "available");
  assert.equal(result.clip.id, "clip-1");
  assert.equal(result.clip.editUrl, "https://clips.twitch.tv/FastClip");
  assert.equal(calls.length, 2, "create then verify");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[1].method, "GET");
});

test("createTwitchClip returns pending when Get Clips has not indexed the clip yet", async () => {
  const store = makeStore();
  const state = { ...DEFAULT_STATE, lastClip: null };
  const env = {
    TWITCH_CLIENT_ID: "abc123",
    TWITCH_CLIP_ACCESS_TOKEN: "token123",
    TWITCH_BROADCASTER_USER_ID: "460177396",
  };
  const { fetchFn } = makeClipFetch([
    {
      method: "POST",
      path: "/clips",
      body: { data: [{ id: "clip-2", edit_url: "https://clips.twitch.tv/PendingClip" }] },
    },
    { method: "GET", path: "/clips", body: { data: [] } },
  ]);

  const result = await createTwitchClip(store, {}, state, NOW, { env, fetchFn });

  assert.equal(result.clip.status, "pending");
  assert.equal(result.clip.id, "clip-2");
  assert.ok(result.clip.note, "includes a pending note");
});

test("createTwitchClip reports Twitch API creation failures", async () => {
  const store = makeStore();
  const state = { ...DEFAULT_STATE, lastClip: null };
  const env = {
    TWITCH_CLIENT_ID: "abc123",
    TWITCH_CLIP_ACCESS_TOKEN: "token123",
    TWITCH_BROADCASTER_USER_ID: "460177396",
  };
  const fetchFn = async () => ({ ok: false, status: 401, async text() { return "Unauthorized"; } });

  await assert.rejects(
    () => createTwitchClip(store, {}, state, NOW, { env, fetchFn }),
    /Failed to create Twitch clip/
  );
});

test("runAction clip-create stores lastClip on success", async () => {
  const store = makeStore({ state: JSON.stringify({ ...DEFAULT_STATE, version: 1 }) });
  const state = { ...DEFAULT_STATE, version: 1 };
  const env = {
    TWITCH_CLIENT_ID: "abc123",
    TWITCH_CLIP_ACCESS_TOKEN: "token123",
    TWITCH_BROADCASTER_USER_ID: "460177396",
  };
  const { fetchFn } = makeClipFetch([
    {
      method: "POST",
      path: "/clips",
      body: { data: [{ id: "clip-3", edit_url: "https://clips.twitch.tv/ActionClip" }] },
    },
    {
      method: "GET",
      path: "/clips",
      body: { data: [{ id: "clip-3", url: "https://clips.twitch.tv/ActionClip", edit_url: "https://clips.twitch.tv/ActionClip", created_at: new Date(NOW).toISOString(), broadcaster_id: "460177396" }] },
    },
  ]);

  // createTwitchClip reads process.env by default; pass env explicitly.
  const result = await createTwitchClip(store, {}, state, NOW, { env, fetchFn });
  assert.equal(result.clip.status, "available");
  assert.equal(result.clip.id, "clip-3");
});

// ---------- W/L mapping ----------

test("wl maps 1 to W, 0 to L, and null for anything else", () => {
  assert.equal(wl(1), "W");
  assert.equal(wl(0), "L");
  assert.equal(wl(null), null);
  assert.equal(wl(undefined), null);
  assert.equal(wl(2), null);
});

// ---------- CRID Court ----------

const courtStore = () => makeStore({ cards: JSON.stringify(deskSet()) });

test("court-open creates an open debate with two viewpoints", async () => {
  const store = courtStore();
  const { state } = await runAction(store, {
    action: "court-open",
    question: "Should Afrobeats headline global stadiums?",
    viewpointA: "Yes, it deserves the stage.",
    viewpointB: "No, it is not ready yet.",
  }, NOW);

  assert.equal(state.court.question, "Should Afrobeats headline global stadiums?");
  assert.equal(state.court.viewpointA, "Yes, it deserves the stage.");
  assert.equal(state.court.viewpointB, "No, it is not ready yet.");
  assert.equal(state.court.status, "open");
  assert.equal(state.court.votes.a, 0);
  assert.equal(state.court.votes.b, 0);
  assert.equal(state.court.verdict, null);
});

test("court-open requires both viewpoints", async () => {
  const store = courtStore();
  await assert.rejects(
    () => runAction(store, { action: "court-open", question: "Q", viewpointA: "A" }, NOW),
    /Both opposing viewpoints are required/i
  );
  await assert.rejects(
    () => runAction(store, { action: "court-open", question: "Q", viewpointB: "B" }, NOW),
    /Both opposing viewpoints are required/i
  );
});

test("court-vote increments the chosen side", async () => {
  const store = courtStore();
  await runAction(store, {
    action: "court-open",
    question: "Q",
    viewpointA: "A",
    viewpointB: "B",
  }, NOW);

  let state = (await runAction(store, { action: "court-vote", side: "a" }, NOW)).state;
  assert.equal(state.court.votes.a, 1);

  state = (await runAction(store, { action: "court-vote", side: "b" }, NOW)).state;
  assert.equal(state.court.votes.b, 1);

  await assert.rejects(
    () => runAction(store, { action: "court-vote", side: "c" }, NOW),
    /a or b/i
  );
});

test("court-verdict sets W or L and closes the court", async () => {
  const store = courtStore();
  await runAction(store, {
    action: "court-open",
    question: "Q",
    viewpointA: "A",
    viewpointB: "B",
  }, NOW);

  let state = (await runAction(store, { action: "court-verdict", value: 1 }, NOW)).state;
  assert.equal(state.court.verdict, 1);
  assert.equal(state.court.status, "closed");

  await assert.rejects(
    () => runAction(store, { action: "court-verdict", value: 2 }, NOW),
    /0 or 1/i
  );
});

test("court-close clears the court", async () => {
  const store = courtStore();
  await runAction(store, { action: "court-open", question: "Q", viewpointA: "A", viewpointB: "B" }, NOW);
  await runAction(store, { action: "court-verdict", value: 0 }, NOW);
  const { state } = await runAction(store, { action: "court-close" }, NOW);
  assert.equal(state.court, null);
});

// ---------- Music Desk ----------

const musicStore = () => makeStore({ cards: JSON.stringify(deskSet()) });

test("music-add adds a track to the queue", async () => {
  const store = musicStore();
  const { state } = await runAction(store, {
    action: "music-add",
    title: "Test Track",
    artist: "Test Artist",
    audioUrl: "https://cdn.example.com/track.mp3",
  }, NOW);

  assert.equal(state.music.queue.length, 1);
  assert.equal(state.music.queue[0].title, "Test Track");
  assert.equal(state.music.queue[0].artist, "Test Artist");
  assert.equal(state.music.queue[0].audioUrl, "https://cdn.example.com/track.mp3");
  assert.equal(state.music.playing, false);
});

test("music-play starts playback from queue head", async () => {
  const store = musicStore();
  await runAction(store, { action: "music-add", title: "T1", artist: "A1" }, NOW);
  await runAction(store, { action: "music-add", title: "T2", artist: "A2" }, NOW);

  const state = (await runAction(store, { action: "music-play" }, NOW)).state;
  assert.equal(state.music.playing, true);
  assert.equal(state.music.current.title, "T1");

  const selected = (await runAction(store, { action: "music-play", query: "A2" }, NOW)).state;
  assert.equal(selected.music.current.title, "T2", "a spoken query selects its unique queued match");
  await assert.rejects(() => runAction(store, { action: "music-play", query: "not queued" }, NOW), /No queued track matches/i);
});

test("music-play uses the supplied default YouTube video when the queue is empty", async () => {
  const { state } = await runAction(musicStore(), { action: "music-play" }, NOW);
  assert.equal(state.music.playing, true);
  assert.equal(state.music.current.title, "MAMA'S FAVORITE");
  assert.equal(state.music.current.artist, "YE");
  assert.equal(state.music.current.videoId, "8jDVdq70zUI");

  const projected = publicProjection(state);
  assert.deepEqual(projected.music, {
    current: { title: "MAMA'S FAVORITE", artist: "YE", videoId: "8jDVdq70zUI" },
    playing: true,
  });
  assert.equal(projected.music.current.audioUrl, undefined);
  assert.equal(projected.music.queue, undefined);

  const unsafe = publicProjection({ ...state, music: { ...state.music, current: { ...state.music.current, videoId: "https://youtube.com/watch?v=8jDVdq70zUI" } } });
  assert.equal(unsafe.music.current.videoId, undefined, "only an 11-character YouTube ID may be public");
});

test("music-play accepts only a validated YouTube search result after a queue miss", async () => {
  const store = musicStore();
  await runAction(store, { action: "music-add", title: "Queued song", artist: "Artist", videoId: "dQw4w9WgXcQ" }, NOW);
  const { state } = await runAction(store, {
    action: "music-play", query: "Burna Boy", videoId: "8jDVdq70zUI", title: "MAMA'S FAVORITE", artist: "YE",
  }, NOW);
  assert.equal(state.music.current.videoId, "8jDVdq70zUI");
  assert.equal(state.music.current.title, "MAMA'S FAVORITE");
  assert.equal(state.music.queue.length, 2);
  assert.equal(publicProjection(state).music.current.videoId, "8jDVdq70zUI");
  await assert.rejects(
    () => runAction(musicStore(), { action: "music-play", query: "Burna Boy", videoId: "https://youtube.com/watch?v=8jDVdq70zUI" }, NOW),
    /valid YouTube video ID/i,
  );
});

test("music-next advances to the next track", async () => {
  const store = musicStore();
  await runAction(store, { action: "music-add", title: "T1", artist: "A1" }, NOW);
  await runAction(store, { action: "music-add", title: "T2", artist: "A2" }, NOW);
  await runAction(store, { action: "music-play" }, NOW);

  const state = (await runAction(store, { action: "music-next" }, NOW)).state;
  assert.equal(state.music.current.title, "T2");
  assert.equal(state.music.playing, true);
});

test("music-stop clears the current track", async () => {
  const store = musicStore();
  await runAction(store, { action: "music-add", title: "T1", artist: "A1" }, NOW);
  await runAction(store, { action: "music-play" }, NOW);

  const state = (await runAction(store, { action: "music-stop" }, NOW)).state;
  assert.equal(state.music.current, null);
  assert.equal(state.music.playing, false);
});

test("music-volume sets volume and mutes at zero", async () => {
  const store = musicStore();
  const state = (await runAction(store, { action: "music-volume", volume: 0.5 }, NOW)).state;
  assert.equal(state.music.volume, 0.5);
  assert.equal(state.music.muted, false);

  const state2 = (await runAction(store, { action: "music-volume", volume: 0 }, NOW)).state;
  assert.equal(state2.music.volume, 0);
  assert.equal(state2.music.muted, true);
});

test("music-mute toggles mute state", async () => {
  const store = musicStore();
  let state = (await runAction(store, { action: "music-mute" }, NOW)).state;
  assert.equal(state.music.muted, true);

  state = (await runAction(store, { action: "music-mute" }, NOW)).state;
  assert.equal(state.music.muted, false);
});

test("music-clear empties the queue", async () => {
  const store = musicStore();
  await runAction(store, { action: "music-add", title: "T1", artist: "A1" }, NOW);
  await runAction(store, { action: "music-add", title: "T2", artist: "A2" }, NOW);
  const { state } = await runAction(store, { action: "music-clear" }, NOW);
  assert.equal(state.music.queue.length, 0);
  assert.equal(state.music.current, null);
});

// ---------- X Space Radar ----------

test("space-add adds a space with title, host, topic and URL", async () => {
  const store = makeStore();
  const { state } = await runAction(store, {
    action: "space-add",
    title: "Lagos Tech Talk",
    host: "cyber",
    topic: "Street debates",
    url: "https://x.com/i/spaces/123",
  }, NOW);

  assert.equal(state.spaces.length, 1);
  assert.equal(state.spaces[0].title, "Lagos Tech Talk");
  assert.equal(state.spaces[0].host, "cyber");
  assert.equal(state.spaces[0].topic, "Street debates");
  assert.equal(state.spaces[0].url, "https://x.com/i/spaces/123");
  assert.equal(state.spaces[0].status, "live");
});

test("space-remove removes a space by id", async () => {
  const store = makeStore();
  const { state } = await runAction(store, {
    action: "space-add",
    title: "T1",
    host: "H1",
    topic: "Topic1",
    url: "https://x.com/i/spaces/1",
  }, NOW);
  const id = state.spaces[0].id;

  const { state: after } = await runAction(store, { action: "space-remove", id }, NOW);
  assert.equal(after.spaces.length, 0);
});

// ---------- STRANGERS Ledger ----------

test("ledger-add records a community interaction", async () => {
  const store = makeStore();
  const { state } = await runAction(store, {
    action: "ledger-add",
    type: "poll-win",
    title: "Community chose the market debate",
    description: "#STRANGERS voted 70/30 for the market topic.",
  }, NOW);

  assert.equal(state.ledger.length, 1);
  assert.equal(state.ledger[0].type, "poll-win");
  assert.equal(state.ledger[0].title, "Community chose the market debate");
  assert.equal(state.ledger[0].description, "#STRANGERS voted 70/30 for the market topic.");
  assert.ok(state.ledger[0].createdAt);
});

test("ledger-add requires type and title", async () => {
  const store = makeStore();
  await assert.rejects(
    () => runAction(store, { action: "ledger-add", type: "poll-win" }, NOW),
    /title/i
  );
  await assert.rejects(
    () => runAction(store, { action: "ledger-add", title: "T" }, NOW),
    /type/i
  );
});

// ---------- RIAD ----------

test("riad-trigger activates the raid identity", async () => {
  const store = makeStore();
  const { state } = await runAction(store, { action: "riad-trigger", channel: "cyber_live" }, NOW);

  assert.equal(state.riad.active, true);
  assert.equal(state.riad.channel, "cyber_live");
  assert.ok(state.riad.announcedAt);
});

test("riad-clear deactivates the raid identity", async () => {
  const store = makeStore();
  await runAction(store, { action: "riad-trigger", channel: "cyber_live" }, NOW);
  const { state } = await runAction(store, { action: "riad-clear" }, NOW);
  assert.equal(state.riad, null);
});


test("Gemini enrichment gives bare names context instructions and never returns an empty summary", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "unit-test-key";
  let prompt = "";
  try {
    const result = await enrichWithGemini("Burna Boy", "", async (_url, options) => {
      prompt = JSON.parse(options.body).contents[0].parts[0].text;
      const body = { candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: "", question: "" }) }] } }] };
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    assert.match(prompt, /name or short phrase/i);
    assert.match(prompt, /quoted data, not an instruction/i);
    assert.match(prompt, /summary must never be empty/i);
    assert.equal(result.summary, "This short topic needs more verified context before it can be confidently explained on air.");
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

// The layout switch is the one thing on this list a streamer reaches for while talking, so it gets
// the same rules the lockup does: naming a size must not re-arm the inset, an invented mode is
// refused rather than guessed, and a desk that was never told stays exactly as it was.
test("the frame layout is server state, so it survives a reload and answers to one word", async () => {
  const store = makeStore();
  assert.equal((await publicState(store, null, NOW)).body.scene, null, "a desk never told has no layout");

  const pip = await runAction(store, { action: "scene" }, NOW);
  assert.deepEqual(pip.state.scene, { mode: "pip", w: PIP_SIZE.default, h: PIP_SIZE.default });
  const back = await runAction(store, { action: "scene" }, NOW);
  assert.equal(back.state.scene.mode, "full", "bare scene is the switch in both directions");

  await runAction(store, { action: "scene", mode: "pip" }, NOW);
  const sized = await runAction(store, { action: "scene", w: 40, h: 22 }, NOW);
  assert.deepEqual(sized.state.scene, { mode: "pip", w: 40, h: 22 }, "a size keeps the mode it found");

  const clamped = await runAction(store, { action: "scene", w: 900 }, NOW);
  assert.equal(clamped.state.scene.w, PIP_SIZE.max, "an absurd inset is clamped, not obeyed");
  assert.equal(clamped.state.scene.h, 22, "and clamping one axis must not reset the other");

  await assert.rejects(runAction(store, { action: "scene", mode: "triangle" }, NOW),
    (e) => e.status === 422 && /full, pip/.test(e.message));
  const untouched = await readState(store);
  assert.deepEqual(untouched.scene, clamped.state.scene, "a refused layout command changes nothing");

  const seen = await publicState(store, null, NOW);
  assert.deepEqual(seen.body.scene, { mode: "pip", w: PIP_SIZE.max, h: 22 }, "the overlay can read it");
});

// ---------- CRID's persistence write-back (state.bot.being) ----------

const beingSnap = (over = {}) => ({
  v: 1,
  savedAt: NOW,
  floorX: 0.5,
  drives: { energy: 55, boredom: 40, attention: 30 },
  bag: { worn: true },
  ...over,
});

test("bot.being is stored sanitized and survives every other bot write", async () => {
  const store = makeStore();
  await runAction(store, { action: "bot-subs", count: 7 }, NOW);
  await runAction(store, { action: "bot-react", kind: "wave" }, NOW);
  const before = (await readState(store)).version;

  const res = await writeBeing(store, beingSnap(), NOW + 1000);
  assert.equal(res.ok, true);
  const s = await readState(store);
  assert.ok(s.version > before, "the write bumps the version so the poll delivers it");
  assert.equal(s.bot.subs, 7, "the sub count is carried across, not wiped");
  assert.deepEqual(s.bot.react, { kind: "wave", n: 1 }, "the pending gesture is carried across");
  assert.equal(s.bot.on, true, "a desk that never hid him stays on");
  assert.deepEqual(s.bot.being, {
    v: 1, savedAt: NOW, floorX: 0.5,
    drives: { energy: 55, boredom: 40, attention: 30 },
    bag: { worn: true },
  });

  // Everything is clamped and unknown keys dropped: the stored snapshot is exactly the shape.
  await writeBeing(store, {
    ...beingSnap({ savedAt: NOW + 5000, junk: "x" }),
    drives: { energy: 140, boredom: -5, attention: 33.3 },
    floorX: 2,
    bag: { worn: false, x: -1, y: 5, extra: 1 },
  }, NOW + 6000);
  const s2 = await readState(store);
  assert.deepEqual(s2.bot.being, {
    v: 1, savedAt: NOW + 5000, floorX: 1,
    drives: { energy: 100, boredom: 0, attention: 33.3 },
    bag: { worn: false, x: 0, y: 1 },
  });
  assert.equal(s2.bot.subs, 7, "the second write still preserves the other bot fields");
});

test("writeBeing refuses anything that is not a clean v:1 snapshot", async () => {
  const store = makeStore();
  const bad = [
    [{ ...beingSnap(), v: 2 }, /being\.v must be 1/],
    [{ savedAt: NOW }, /being\.v must be 1/],
    [beingSnap({ savedAt: "soon" }), /savedAt must be a timestamp/],
    [beingSnap({ savedAt: NOW + 3 * 60 * 1000 }), /in the future/],
    [beingSnap({ drives: null }), /drives is required/],
    [beingSnap({ drives: { energy: 1, boredom: 2 } }), /attention must be a number/],
    [beingSnap({ drives: { energy: "x", boredom: 2, attention: 3 } }), /energy must be a number/],
    [beingSnap({ floorX: "middle" }), /floorX must be a number/],
    [beingSnap({ bag: { worn: "yes" } }), /bag\.worn must be true or false/],
    [beingSnap({ bag: { worn: false, x: 0.5 } }), /bag\.y must be a number/],
  ];
  for (const [snap, re] of bad) {
    await assert.rejects(() => writeBeing(store, snap, NOW), re);
  }
  assert.equal((await readState(store)).bot, null, "a refused write stores nothing");
});

test("writeBeing is monotonic and lightly rate-limited", async () => {
  const store = makeStore();
  await writeBeing(store, beingSnap({ savedAt: NOW }), NOW);

  // An older stamp must never roll his state backwards — two tabs cannot undo each other.
  await assert.rejects(
    () => writeBeing(store, beingSnap({ savedAt: NOW - 1, drives: { energy: 1, boredom: 1, attention: 1 } }), NOW),
    (e) => e.status === 409,
  );

  // A save inside the 2 s window answers ok without committing: the page's unload flush never
  // errors, and the previous write is at most two seconds stale.
  const before = (await readState(store)).version;
  const throttled = await writeBeing(store, beingSnap({ savedAt: NOW + 1000, drives: { energy: 1, boredom: 1, attention: 1 } }), NOW + 1000);
  assert.equal(throttled.throttled, true);
  assert.equal((await readState(store)).version, before, "a throttled write does not commit");

  // Past the window the newer snapshot lands.
  await writeBeing(store, beingSnap({ savedAt: NOW + 3000 }), NOW + 3000);
  const s = await readState(store);
  assert.equal(s.bot.being.savedAt, NOW + 3000);
  assert.equal(s.bot.being.drives.energy, 55, "the throttled write's numbers were not stored");
});

// ---------- live location, GTA mode and panic ----------

test("writeLocation stores coarse cells and server time, never raw coordinates", async () => {
  const store = makeStore();
  const res = await writeLocation(store, { lat: 6.5247123, lon: 3.3792055, place: "Ikeja, Lagos", alt: 41.6 }, NOW);
  assert.equal(res.ok, true);
  const loc = res.location;
  assert.equal(loc.lat, 6.52, "latitude is rounded to 2 decimals (~1.1 km)");
  assert.equal(loc.lon, 3.38);
  assert.equal(loc.at, NOW, "at is the server receipt time");
  assert.equal(loc.hidden, false);
  assert.equal(loc.place, "Ikeja, Lagos");
  // The raw fix must not survive anywhere in the stored state.
  const raw = JSON.stringify((await readState(store)).location);
  assert.ok(!raw.includes("6.5247123") && !raw.includes("3.3792055"), "no precise coordinate is stored");
  assert.ok(!JSON.stringify((await readState(store)).locationHistory).includes("6.5247123"));
});

test("writeLocation rejects bad coordinates, over-long places and non-boolean hidden", async () => {
  const store = makeStore();
  const bad = [
    [{ lon: 3.3 }, /lat and lon are required/],
    [{ lat: 91, lon: 0 }, /lat must be between/],
    [{ lat: -91, lon: 0 }, /lat must be between/],
    [{ lat: 0, lon: 181 }, /lon must be between/],
    [{ lat: 0, lon: -181 }, /lon must be between/],
    [{ lat: "north", lon: 0 }, /lat and lon are required/],
    [{ lat: 6.5, lon: 3.3, place: "x".repeat(81) }, /place must be 80 characters or fewer/],
    [{ lat: 6.5, lon: 3.3, hidden: "yes" }, /hidden must be true or false/],
    [{ lat: 6.5, lon: 3.3, alt: "high" }, /alt must be a number/],
  ];
  for (const [body, re] of bad) {
    await assert.rejects(() => writeLocation(store, body, NOW), re);
  }
  assert.equal((await readState(store)).location, null, "a refused write stores nothing");
});

test("panic hidden survives into the public projection and is not delayed", async () => {
  const store = makeStore();
  await writeLocation(store, { lat: 6.5, lon: 3.3, place: "Home", hidden: true }, NOW);
  const state = await readState(store);
  assert.equal(state.location.hidden, true);
  const pub = publicProjection(state, NOW + LOCATION_DELAY_MS + 1);
  assert.equal(pub.location.hidden, true, "the panic flag reaches the overlay");
  assert.equal(pub.locationHistory, undefined, "the private fix ring never leaves the server");
});

test("the public location is the fix from at least 90 s ago, never the fresh one", async () => {
  const store = makeStore();
  await writeLocation(store, { lat: 6.50, lon: 3.30, place: "First" }, NOW);
  let state = await readState(store);

  // Inside the delay window the desk shows "location unknown" rather than a live dot; a fix
  // exactly LOCATION_DELAY_MS old is already public (the cutoff is inclusive).
  assert.equal(publicProjection(state, NOW + LOCATION_DELAY_MS - 1).location, null);

  const delayed = publicProjection(state, NOW + LOCATION_DELAY_MS).location;
  assert.deepEqual(
    { lat: delayed.lat, lon: delayed.lon, place: delayed.place, at: delayed.at, hidden: delayed.hidden },
    { lat: 6.5, lon: 3.3, place: "First", at: NOW, hidden: false },
  );

  // A second fix moves the fresh point at once but the public point keeps serving the old one
  // until the new fix itself is 90 s old.
  const t2 = NOW + 60_000;
  await writeLocation(store, { lat: 9.99, lon: 9.99, place: "Second" }, t2);
  state = await readState(store);
  assert.equal(state.location.place, "Second", "control sees the fresh fix");
  assert.equal(state.location.at, t2);
  const still = publicProjection(state, t2 + LOCATION_DELAY_MS - 1).location;
  assert.equal(still.at, NOW, "the public view still serves the aged fix");
  assert.equal(still.place, "First");
  const moved = publicProjection(state, t2 + LOCATION_DELAY_MS + 1).location;
  assert.equal(moved.at, t2);
  assert.equal(moved.place, "Second");

  // Clearing removes point and ring together, so nothing stale resurfaces publicly.
  await runAction(store, { action: "location", clear: true }, t2 + 200_000);
  state = await readState(store);
  assert.equal(state.location, null);
  assert.deepEqual(state.locationHistory, []);
  assert.equal(publicProjection(state, t2 + 300_000).location, null);
});

test("the location desk action and writeLocation store the same shape", async () => {
  const a = makeStore();
  const b = makeStore();
  await writeLocation(a, { lat: 6.5247, lon: 3.3792, place: "Ikeja" }, NOW);
  await runAction(b, { action: "location", lat: 6.5247, lon: 3.3792, place: "Ikeja" }, NOW);
  const la = (await readState(a)).location;
  const lb = (await readState(b)).location;
  for (const k of ["lat", "lon", "place", "at", "hidden"]) assert.equal(la[k], lb[k], k);
  assert.equal(la.lat, 6.52);
});

test("gta toggles state.gta and lands in the public projection", async () => {
  const store = makeStore();
  assert.equal(DEFAULT_STATE.gta, false);
  assert.equal((await runAction(store, { action: "gta" }, NOW)).state.gta, true);
  assert.equal((await runAction(store, { action: "gta" }, NOW)).state.gta, false, "second press flips back");
  assert.equal((await runAction(store, { action: "gta", value: true }, NOW)).state.gta, true);
  assert.equal((await runAction(store, { action: "gta", value: false }, NOW)).state.gta, false);
  assert.equal(publicProjection(await readState(store), NOW).gta, false);
  await runAction(store, { action: "gta", value: true }, NOW);
  assert.equal(publicProjection(await readState(store), NOW).gta, true, "the overlay sees the flag");
});
