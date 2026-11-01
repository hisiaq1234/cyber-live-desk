import { test } from "node:test";
import assert from "node:assert/strict";

import { runBrief } from "../api/_brief.mjs";

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
const rss = (now = NOW) => `<rss><channel><item><title>New local report</title><link>https://news.example/story</link><pubDate>${new Date(now - 60_000).toUTCString()}</pubDate><source>Local Desk</source></item></channel></rss>`;
const gemini = (searchQuery = "Lagos current report") => ({
  candidates: [{
    content: { parts: [{ text: [
      "HEADLINE: A current local report",
      "SUMMARY: A dated report describes the event [R1]. It identifies a local agency [R1].",
      "WHY: Inference — it may matter to residents [R1].",
      "COUNTERPOINT: One report does not establish broad impact [R1].",
      "VERIFY: Check an official statement and independent reporting [R1].",
      "POINT: The report is dated [R1].",
      "CHAT: What would change your view?",
      "READ: A dated report describes the event [R1]. That could matter to residents, but needs corroboration.",
    ].join("\n") }] },
    groundingMetadata: {
      groundingChunks: [{ web: { uri: "https://example.org/grounded", title: "Search result" } }],
      groundingSupports: [],
      webSearchQueries: searchQuery ? [searchQuery] : [],
    },
  }],
});

function fetcher({ onX, onPrompt, searchQuery = "Lagos current report" } = {}) {
  return async (url, init = {}) => {
    if (String(url).startsWith("https://news.google.com/rss/")) return new Response(rss(NOW), { status: 200 });
    if (String(url).startsWith("https://api.x.com/")) {
      await onX?.();
      return new Response(JSON.stringify({ data: [{ trend_name: "#Lagos", tweet_count: 3 }] }), { status: 200 });
    }
    if (String(url).startsWith("https://generativelanguage.googleapis.com/")) {
      await onPrompt?.(JSON.parse(init.body).contents[0].parts[0].text);
      return new Response(JSON.stringify(gemini(searchQuery)), { status: 200 });
    }
    throw new Error(`Unexpected request ${url}`);
  };
}

test("X is not called unless explicitly opted in for this single request", async () => {
  let xCalls = 0;
  const result = await runBrief(new MemoryStore(), { action: "open", topic: "Lagos test" }, {
    env: { GEMINI_API_KEY: "test", X_BEARER_TOKEN: "configured" },
    fetchFn: fetcher({ onX: () => { xCalls++; } }),
    now: NOW,
  });
  assert.equal(xCalls, 0);
  assert.equal(result.brief.xRequested, false);
  assert.equal(result.brief.xTrendCount, 0);
  assert.match(result.brief.xNote, /not requested/i);
});

test("dated citations without an actual grounded Search query remain thin", async () => {
  const result = await runBrief(new MemoryStore(), { action: "open", topic: "Lagos test" }, {
    env: { GEMINI_API_KEY: "test" },
    fetchFn: fetcher({ searchQuery: "" }),
    now: NOW,
  });
  assert.equal(result.brief.summaryCitations.length, 1);
  assert.equal(result.brief.groundedSearchUsed, false);
  assert.equal(result.brief.status, "thin");
});

test("deeper can focus a fresh report on a spoken angle and persists that angle", async () => {
  const store = new MemoryStore();
  let prompt = "";
  const env = { GEMINI_API_KEY: "test" };
  await runBrief(store, { action: "open", topic: "Lagos event" }, {
    env,
    fetchFn: fetcher({ onPrompt: (text) => { prompt = text; } }),
    now: NOW,
  });
  const deeper = await runBrief(store, { action: "deeper", focus: "impact on local creators" }, {
    env,
    fetchFn: fetcher({ onPrompt: (text) => { prompt = text; } }),
    now: NOW + 31_000,
  });
  assert.equal(deeper.brief.depth, 2);
  assert.equal(deeper.brief.focus, "impact on local creators");
  assert.match(prompt, /impact on local creators/);
});
