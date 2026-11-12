import { test } from "node:test";
import assert from "node:assert/strict";

import xFeed, { fetchXTrends } from "../api/x-feed.mjs";

// The four values the project actually provisions. X_ACCESS_TOKEN on its own is not a credential.
const OAUTH_ENV = {
  X_CONSUMER_KEY: "consumer-key",
  X_CONSUMER_SECRET: "consumer-secret",
  X_ACCESS_TOKEN: "access-token",
  X_ACCESS_TOKEN_SECRET: "access-token-secret",
};

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
  assert.equal(url.origin, "https://api.twitter.com");
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

test("X trends falls back to v1.1 for OAuth 1.0a, which v2 refuses", async () => {
  let requestedUrl;
  let requestedInit;
  const many = Array.from({ length: 60 }, (_, i) => ({ name: `trend-${i}`, tweet_volume: i }));
  const result = await fetchXTrends({
    env: OAUTH_ENV,
    woeid: "1398823",
    max: 1000,
    now: 1700000000 * 1000,
    nonce: "fixed-nonce",
    fetchFn: async (url, init) => {
      requestedUrl = url;
      requestedInit = init;
      return new Response(JSON.stringify([{ trends: many }]), { status: 200 });
    },
  });
  const url = new URL(requestedUrl);
  assert.equal(url.origin, "https://api.twitter.com");
  // v2 trends answers 403 "OAuth 1.0a User Context is forbidden for this endpoint"; v1.1 accepts it.
  assert.equal(url.pathname, "/1.1/trends/place.json");
  assert.equal(url.searchParams.get("id"), "1398823");
  assert.match(requestedInit.headers.Authorization, /^OAuth /);
  assert.ok(!requestedInit.headers.Authorization.includes("Bearer"));
  // The documented upper bound still applies, now by slicing what v1.1 returns.
  assert.equal(result.trends.length, 50);
  assert.deepEqual(result.trends[0], { name: "trend-0", tweetCount: 0 });
});

test("the following timeline asks for the path X actually serves", async () => {
  const names = ["X_BEARER_TOKEN", "X_CONSUMER_KEY", "X_CONSUMER_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  // The v2 user-timeline path is only reachable with a bearer token; OAuth 1.0a is refused there.
  process.env.X_BEARER_TOKEN = "app-only-token";
  const savedFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = url;
    return new Response(JSON.stringify({ data: [], includes: { users: [] } }), { status: 200 });
  };
  try {
    const res = await xFeed.fetch({
      url: "/api/x/feed?mode=following&userId=2244994945",
      method: "GET",
      headers: new Headers({ host: "cyber-live-desk.vercel.app" }),
    });
    assert.equal(res.status, 200);
    // It was spelled reverse-chronological, which X answers with a bare 404.
    assert.match(new URL(requestedUrl).pathname, /^\/2\/users\/2244994945\/timelines\/reverse_chronological$/);
  } finally {
    globalThis.fetch = savedFetch;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

test("following and for-you fall back to the v1.1 home timeline under OAuth 1.0a", async () => {
  const names = ["X_BEARER_TOKEN", "X_CONSUMER_KEY", "X_CONSUMER_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  for (const [name, value] of Object.entries(OAUTH_ENV)) process.env[name] = value;
  const savedFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify([{
      id_str: "42",
      full_text: "clutch play",
      created_at: "Mon Nov 09 13:00:00 +0000 2026",
      retweet_count: 3,
      favorite_count: 11,
      user: { name: "A Viewer", screen_name: "aviewer", profile_image_url: "http://pbs.twimg.com/a_normal.jpg" },
    }]), { status: 200 });
  };
  try {
    // No userId needed: the home timeline belongs to the account that signed the request.
    for (const mode of ["following", "for-you"]) {
      const res = await xFeed.fetch({
        url: `/api/x/feed?mode=${mode}`,
        method: "GET",
        headers: new Headers({ host: "cyber-live-desk.vercel.app" }),
      });
      assert.equal(res.status, 200, mode);
      const body = await res.json();
      assert.equal(body.mode, mode);
      assert.equal(body.tweets.length, 1);
      assert.equal(body.tweets[0].handle, "aviewer");
      assert.equal(body.tweets[0].text, "clutch play");
      assert.equal(body.tweets[0].metrics.like, 11);
      assert.equal(body.tweets[0].metrics.repost, 3);
      // v1.1 avatars come back http; the desk page is https.
      assert.equal(body.tweets[0].avatar, "https://pbs.twimg.com/a_normal.jpg");
    }
    assert.equal(seen.length, 2);
    for (const { url, init } of seen) {
      const u = new URL(url);
      assert.equal(u.pathname, "/1.1/statuses/home_timeline.json");
      assert.equal(u.searchParams.get("tweet_mode"), "extended");
      assert.match(init.headers.Authorization, /^OAuth /);
      assert.ok(!init.headers.Authorization.includes("Bearer"));
    }
  } finally {
    globalThis.fetch = savedFetch;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});
test("missing credentials and an invalid WOEID fail before a network request", async () => {
  let calls = 0;
  const fetchFn = async () => { calls += 1; throw new Error("must not run"); };
  await assert.rejects(fetchXTrends({ env: {}, fetchFn }), /X is not configured/);
  // X_ACCESS_TOKEN alone used to be accepted here and sent as a bearer token; it is not enough.
  await assert.rejects(fetchXTrends({ env: { X_ACCESS_TOKEN: "looks-like-a-token" }, fetchFn }), /X is not configured/);
  await assert.rejects(fetchXTrends({ env: OAUTH_ENV, woeid: "1/../2", fetchFn }), /WOEID/);
  assert.equal(calls, 0);
});
