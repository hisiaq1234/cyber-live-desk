// Run with: node --test
// Vercel's Node runtime calls these handlers with a RELATIVE req.url
// ("/api/x/feed?mode=trends"). Every other test in this suite builds an absolute Request,
// so `new URL(req.url)` was never exercised the way production exercises it: three
// functions answered 500 FUNCTION_INVOCATION_FAILED live while the suite stayed green.
// The parse also sits before each handler's try block, so no JSON fallback can run.
import { test } from "node:test";
import assert from "node:assert/strict";

import xFeed from "../api/x-feed.mjs";
import audiomack from "../api/audiomack.mjs";
import spotifyTop from "../api/spotify-top.mjs";
import desk from "../api/desk.mjs";

// Exactly the shape Vercel hands the handler: no origin in the url, host only in headers.
const vercelReq = (url, init = {}) => ({
  url,
  method: "GET",
  headers: new Headers({ host: "cyber-live-desk.vercel.app" }),
  ...init,
});

test("x-feed reads query parameters from a relative url", async () => {
  const res = await xFeed(vercelReq("/api/x/feed?mode=not-a-mode"));
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /Unknown mode: not-a-mode/);
});

test("x-feed reports a missing token as 502 instead of crashing", async () => {
  const saved = { bearer: process.env.X_BEARER_TOKEN, access: process.env.X_ACCESS_TOKEN };
  delete process.env.X_BEARER_TOKEN;
  delete process.env.X_ACCESS_TOKEN;
  try {
    const res = await xFeed(vercelReq("/api/x/feed?mode=trends&woeid=23424908"));
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /X_BEARER_TOKEN/);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value !== undefined) process.env[key] = value;
    }
  }
});

test("spotify-top validates time_range from a relative url", async () => {
  const res = await spotifyTop(vercelReq("/api/spotify-top?time_range=nonsense"));
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /time_range/);
});

test("audiomack answers from its curated list on a relative url", async () => {
  const res = await audiomack(vercelReq("/api/audiomack?mode=search&q=qqqqzzz"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.mode, "search");
  assert.equal(Array.isArray(body.tracks), true);
});

test("the desk page is reachable on a relative url", async () => {
  const res = await desk.fetch(vercelReq("/desk"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type"), /text\/html/);
});

test("absolute urls keep working, because that is what the overlay and tests send", async () => {
  const res = await xFeed(vercelReq("https://cyber-live-desk.vercel.app/api/x/feed?mode=nope"));
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /Unknown mode: nope/);
});
