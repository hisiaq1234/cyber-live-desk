import { test } from "node:test";
import assert from "node:assert/strict";

import { fetchXTrends } from "../api/x-feed.mjs";

test("X trends uses the official v2 host, bounded parameters, bearer header, and current fields", async () => {
  let requestedUrl;
  let requestedInit;
  const result = await fetchXTrends({
    env: { X_BEARER_TOKEN: "server-only-token" },
    woeid: "1398823",
    max: 2,
    now: 1234,
    fetchFn: async (url, init) => {
      requestedUrl = url;
      requestedInit = init;
      return new Response(JSON.stringify({ data: [
        { trend_name: "#Lagos", tweet_count: 12 },
        { trend_name: "Music", tweet_count: 4 },
        { trend_name: "ignored", tweet_count: 3 },
      ] }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  const url = new URL(requestedUrl);
  assert.equal(url.origin, "https://api.x.com");
  assert.equal(url.pathname, "/2/trends/by/woeid/1398823");
  assert.equal(url.searchParams.get("max_trends"), "2");
  assert.equal(url.searchParams.get("trend.fields"), "trend_name,tweet_count");
  assert.equal(requestedInit.headers.Authorization, "Bearer server-only-token");
  assert.deepEqual(result, {
    mode: "trends",
    woeid: "1398823",
    updatedAt: 1234,
    trends: [{ name: "#Lagos", tweetCount: 12 }, { name: "Music", tweetCount: 4 }],
  });
});

test("X trends max is capped at the documented upper bound", async () => {
  let requestedUrl;
  await fetchXTrends({
    env: { X_ACCESS_TOKEN: "legacy-token" },
    max: 1000,
    fetchFn: async (url) => {
      requestedUrl = url;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });
  assert.equal(new URL(requestedUrl).searchParams.get("max_trends"), "50");
});

test("missing token and invalid WOEID fail before a network request", async () => {
  let calls = 0;
  const fetchFn = async () => { calls += 1; throw new Error("must not run"); };
  await assert.rejects(fetchXTrends({ env: {}, fetchFn }), /X_BEARER_TOKEN/);
  await assert.rejects(fetchXTrends({ env: { X_BEARER_TOKEN: "x" }, woeid: "1/../2", fetchFn }), /WOEID/);
  assert.equal(calls, 0);
});
