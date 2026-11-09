// Run with: node --test
// Vercel's Node runtime calls these handlers with a RELATIVE req.url
// ("/api/x/feed?mode=trends"). Every other test in this suite builds an absolute Request,
// so `new URL(req.url)` was never exercised the way production exercises it: three
// functions answered 500 FUNCTION_INVOCATION_FAILED live while the suite stayed green.
// The parse also sits before each handler's try block, so no JSON fallback can run.
// Handlers are called through .fetch because that is the shape the runtime invokes;
// see tests/api-handler-shape.test.mjs.
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
  const res = await xFeed.fetch(vercelReq("/api/x/feed?mode=not-a-mode"));
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /Unknown mode: not-a-mode/);
});

test("x-feed reports missing credentials as 503 naming the variables, instead of crashing", async () => {
  const names = ["X_BEARER_TOKEN", "X_CONSUMER_KEY", "X_CONSUMER_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  try {
    const res = await xFeed.fetch(vercelReq("/api/x/feed?mode=trends&woeid=23424908"));
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /X_BEARER_TOKEN/);
    assert.match(body.error, /X_CONSUMER_KEY/);
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

test("spotify-top validates time_range from a relative url", async () => {
  const res = await spotifyTop.fetch(vercelReq("/api/spotify-top?time_range=nonsense"));
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /time_range/);
});

test("audiomack answers from its curated list on a relative url", async () => {
  const res = await audiomack.fetch(vercelReq("/api/audiomack?mode=search&q=qqqqzzz"));
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
  const res = await xFeed.fetch(vercelReq("https://cyber-live-desk.vercel.app/api/x/feed?mode=nope"));
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /Unknown mode: nope/);
});
