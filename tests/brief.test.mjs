import { test } from "node:test";
import assert from "node:assert/strict";

import { BRIEF_KEY, BRIEF_LOCK_KEY, buildPrompt, freshItems, parseGemini, rssQuery, runBrief } from "../api/_brief.mjs";

class MemoryStore {
  values = new Map();
  async get(key) { return this.values.has(key) ? structuredClone(this.values.get(key)) : null; }
  async setJSON(key, value, options = {}) {
    if (options.onlyIfNew && this.values.has(key)) return { modified: false };
    this.values.set(key, structuredClone(value));
    return { modified: true };
  }
  async delete(key) { this.values.delete(key); }
}

const NOW = Date.parse("2026-11-01T04:00:00.000Z");
const item = ({ title = "New Lagos report", url = "https://news.example/story", date = new Date(NOW - 60_000).toUTCString(), publisher = "News Desk" } = {}) =>
  `<item><title><![CDATA[${title}]]></title><link>${url}</link><pubDate>${date}</pubDate><source>${publisher}</source></item>`;
const rss = (...items) => `<rss><channel>${items.join("")}</channel></rss>`;
const generated = (text, { searchUrl = "https://example.org/context" } = {}) => ({
  candidates: [{
    content: { parts: [{ text }] },
    groundingMetadata: {
      groundingChunks: [{ web: { uri: searchUrl, title: "Grounded context" } }],
      groundingSupports: [{ segment: { text: "A grounded claim", startIndex: 0, endIndex: 16 }, groundingChunkIndices: [0] }],
      searchEntryPoint: { renderedContent: "<div>Search suggestions</div>" },
      webSearchQueries: ["Lagos current topic"],
    },
  }],
});
const validText = [
  "HEADLINE: A new Lagos signal",
  "SUMMARY: A dated report describes a new event [R1]. The report names the relevant agency [R1].",
  "WHY: Inference — this may affect local discussion if independently confirmed [R1].",
  "COUNTERPOINT: One report does not establish broad public reaction [R1].",
  "VERIFY: Check for an official statement and independent reporting [R1].",
  "POINT: A live Lagos X term is visible now [X1].",
  "CHAT: What evidence would change your view?",
  "READ: A dated report describes a new event [R1]. A live Lagos X snapshot includes a related term [X1]. That is a conversation signal, not proof of its cause.",
].join("\n");

function fakeFetch({ rssXml = rss(item()), gemini = generated(validText), xData = { data: [{ trend_name: "#LagosTopic", tweet_count: 8 }] }, onGemini, onX } = {}) {
  return async (url, init = {}) => {
    if (String(url).startsWith("https://news.google.com/rss/")) return new Response(rssXml, { status: 200 });
    if (String(url).startsWith("https://api.x.com/")) {
      await onX?.(url, init);
      return new Response(JSON.stringify(xData), { status: 200 });
    }
    if (String(url).startsWith("https://generativelanguage.googleapis.com/")) {
      await onGemini?.(JSON.parse(init.body));
      return new Response(JSON.stringify(gemini), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected request ${url}`);
  };
}

test("RSS query is Nigeria-localized and only dated, HTTPS items inside the window survive", () => {
  const query = new URL(rssQuery("Lagos TikTok trends", 1, 24));
  assert.equal(query.hostname, "news.google.com");
  assert.equal(query.searchParams.get("hl"), "en-NG");
  assert.equal(query.searchParams.get("gl"), "NG");
  const xml = rss(
    item(),
    item({ title: "Old report", date: new Date(NOW - 48 * 3_600_000).toUTCString() }),
    item({ title: "Future report", date: new Date(NOW + 60 * 60_000).toUTCString() }),
    item({ title: "HTTP source", url: "http://news.example/story" }),
    "<item><title>Undated</title><link>https://news.example/no-date</link></item>",
  );
  assert.deepEqual(freshItems(xml, NOW, 24).map((entry) => entry.title), ["New Lagos report"]);
});

test("Gemini grounding parser retains safe source links, support mapping, and Search entry point", () => {
  const parsed = parseGemini(generated(validText));
  assert.equal(parsed.grounded[0].url, "https://example.org/context");
  assert.equal(parsed.supportSegments[0].sourceIndices[0], 0);
  assert.equal(parsed.searchEntryPoint, "<div>Search suggestions</div>");
  assert.equal(parsed.searches, 1);
  const unsafe = parseGemini(generated(validText, { searchUrl: "javascript:alert(1)" }));
  assert.equal(unsafe.grounded.length, 0);
});

test("one-shot brief includes live Lagos X snapshot, source links, balanced analysis, and strips spoken citations", async () => {
  const store = new MemoryStore();
  let prompt = "";
  const result = await runBrief(store, { action: "open", topic: "Lagos TikTok trends", focus: "local creator impact", includeX: true }, {
    env: { GEMINI_API_KEY: "test", X_BEARER_TOKEN: "test-x", BRIEF_X_WOEID: "1398823", BRIEF_MAX_AGE_HOURS: "24" },
    fetchFn: fakeFetch({ onGemini: (body) => { prompt = body.contents[0].parts[0].text; } }),
    now: NOW,
  });
  const brief = result.brief;
  assert.equal(brief.status, "fresh");
  assert.equal(brief.focus, "local creator impact");
  assert.equal(brief.groundedSearchUsed, true);
  assert.equal(brief.groundedCount, 1);
  assert.equal(brief.xRequested, true);
  assert.equal(brief.xRegion, "Lagos, Nigeria (WOEID 1398823)");
  assert.equal(brief.freshCount, 1);
  assert.equal(brief.xTrendCount, 1);
  assert.equal(brief.summaryCitations[0].type, "R");
  assert.match(brief.why, /^Inference/);
  assert.ok(brief.counterpoint);
  assert.ok(brief.verify);
  assert.equal(brief.sources[0].publishedAt != null, true);
  assert.equal(brief.sources[1].publishedAt, null);
  assert.equal(brief.supportSegments[0].sources[0], 1);
  assert.ok(brief.manualSources.some((source) => source.url.includes("creativeCenter/trends")));
  assert.doesNotMatch(brief.readAloud, /\[(?:R|X)\d+\]/, "citation tags must not be spoken aloud");
  assert.match(prompt, /X1/);
  assert.match(prompt, /local creator impact/);
  assert.match(prompt, /Cross-check the dated headlines/);
  assert.match(prompt, /Do not claim direct TikTok feed access/);
  assert.equal(store.values.has(BRIEF_KEY), true);
  assert.equal(store.values.has("state"), false, "brief state is stored separately from public overlay state");
});

test("without dated news or X token, the brief is thin and cannot present undated search text as fresh", async () => {
  const store = new MemoryStore();
  const noFresh = generated([
    "HEADLINE: NOTHING FRESH",
    "SUMMARY: NOTHING FRESH",
    "WHY: No evidence",
    "COUNTERPOINT: No current claim",
    "VERIFY: Wait for dated sources",
    "CHAT: What should we check?",
    "READ: Nothing current is verified.",
  ].join("\n"));
  const result = await runBrief(store, { action: "open", topic: "Local event" }, {
    env: { GEMINI_API_KEY: "test" },
    fetchFn: fakeFetch({ rssXml: "<rss><channel></channel></rss>", gemini: noFresh }),
    now: NOW,
  });
  assert.equal(result.brief.status, "thin");
  assert.equal(result.brief.xTrendCount, 0);
  assert.match(result.brief.readAloud, /No fresh, source-linked evidence/);
  assert.equal(result.brief.sources[0]?.publishedAt, null, "grounded pages remain undated rather than fresh");
});

test("platform-only brief explicitly limits an X snapshot when no dated reporting is found", async () => {
  const store = new MemoryStore();
  const text = [
    "HEADLINE: Lagos X terms are active",
    "SUMMARY: The current snapshot includes a Lagos term [X1]. No dated report explains the cause [X1].",
    "WHY: Inference — this may be worth checking as a conversation signal [X1].",
    "COUNTERPOINT: The term alone does not show broad support [X1].",
    "VERIFY: Open the term and look for dated independent reporting [X1].",
    "POINT: The snapshot was retrieved now [X1].",
    "CHAT: Have you seen this topic locally?",
    "READ: A current Lagos X snapshot includes one active term [X1]. That shows the term is present in the platform snapshot, but does not explain why it is trending or prove that it is a TikTok trend.",
  ].join("\n");
  const result = await runBrief(store, { action: "open", topic: "Lagos trend", includeX: true }, {
    env: { GEMINI_API_KEY: "test", X_BEARER_TOKEN: "test-x" },
    fetchFn: fakeFetch({ rssXml: "<rss><channel></channel></rss>", gemini: generated(text) }),
    now: NOW,
  });
  assert.equal(result.brief.status, "platform-only");
  assert.equal(result.brief.freshCount, 0);
  assert.equal(result.brief.xTrendCount, 1);
});

test("concurrent generation is locked and repeated requests are cooled down", async () => {
  const store = new MemoryStore();
  let startedResolve;
  const started = new Promise((resolve) => { startedResolve = resolve; });
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const fetchFn = fakeFetch({ onGemini: async () => { startedResolve(); await wait; } });
  const options = { env: { GEMINI_API_KEY: "test" }, fetchFn, now: NOW };
  const first = runBrief(store, { action: "open", topic: "Local topic" }, options);
  await started;
  await assert.rejects(runBrief(store, { action: "open", topic: "Another topic" }, options), /already running/i);
  release();
  await first;
  assert.equal(store.values.has(BRIEF_LOCK_KEY), false);
  await assert.rejects(runBrief(store, { action: "refresh" }, options), /30 seconds/i);
});
