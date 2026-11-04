import { test } from "node:test";
import assert from "node:assert/strict";
import desk, { runVoiceMusicAction } from "../api/desk.mjs";
import { HttpError } from "../api/_desk-core.mjs";

test("public desk page accepts GET and Swae's HEAD availability probe", async () => {
  const get = await desk.fetch(new Request("https://cyber-live-desk.vercel.app/desk", { method: "GET" }));
  assert.equal(get.status, 200);
  assert.match(get.headers.get("content-type"), /text\/html/);
  assert.match(await get.text(), /Cyber Live Desk overlay/);

  const head = await desk.fetch(new Request("https://cyber-live-desk.vercel.app/desk", { method: "HEAD" }));
  assert.equal(head.status, 200);
  assert.match(head.headers.get("content-type"), /text\/html/);
  assert.equal(await head.text(), "");
});

test("public desk aliases accept HEAD without opening operator API routes", async () => {
  const alias = await desk.fetch(new Request("https://cyber-live-desk.vercel.app/api/desk", { method: "HEAD" }));
  assert.equal(alias.status, 200);

  const old = process.env.DESK_OPERATOR_TOKEN;
  process.env.DESK_OPERATOR_TOKEN = "route-test-only-token";
  try {
    const privateRoute = await desk.fetch(new Request("https://cyber-live-desk.vercel.app/api/desk/cards", { method: "GET" }));
    assert.equal(privateRoute.status, 401);
  } finally {
    if (old === undefined) delete process.env.DESK_OPERATOR_TOKEN;
    else process.env.DESK_OPERATOR_TOKEN = old;
  }
});

test("voice music uses a queued match before calling YouTube search", async () => {
  let searches = 0;
  const result = await runVoiceMusicAction({ action: "music-play", query: "Burna Boy" }, {
    run: async () => ({ source: "queue" }),
    search: async () => { searches += 1; return []; },
  });
  assert.deepEqual(result, { source: "queue" });
  assert.equal(searches, 0);
});

test("voice music searches YouTube after a queue miss and starts its validated result", async () => {
  const actions = [];
  const result = await runVoiceMusicAction({ action: "music-play", query: "Burna Boy" }, {
    run: async (action) => {
      actions.push(action);
      if (!action.videoId) throw new HttpError(409, "No queued track matches the request.");
      return { current: action };
    },
    search: async (query, options) => {
      assert.equal(query, "Burna Boy");
      assert.equal(options.max, 1);
      return [{ videoId: "8jDVdq70zUI", title: "MAMA'S FAVORITE", artist: "YE" }];
    },
  });
  assert.equal(actions.length, 2);
  assert.equal(result.current.videoId, "8jDVdq70zUI");
  assert.equal(result.current.title, "MAMA'S FAVORITE");
});

test("voice music explains the missing server-side YouTube key without revealing a value", async () => {
  await assert.rejects(
    () => runVoiceMusicAction({ action: "music-play", query: "Burna Boy" }, {
      run: async () => { throw new HttpError(409, "No queued track matches the request."); },
      search: async () => { throw new Error("YOUTUBE_API_KEY is not set on the server."); },
    }),
    (error) => error instanceof HttpError && error.status === 503 && /YOUTUBE_API_KEY/.test(error.message),
  );
});

// The voice route checks its allowlist before any storage read, so these two assertions hold
// without a live Redis: one proves a mascot gesture stays off voice, the other that "crid thought"
// is recognised AND permitted (a later storage failure is not a 403 or a 422).
test("a Thought War draw is speakable while a mascot gesture is not", async () => {
  const saved = process.env.DESK_OPERATOR_TOKEN;
  process.env.DESK_OPERATOR_TOKEN = "route-test-only-token";
  const voice = (text) => desk.fetch(new Request("https://cyber-live-desk.vercel.app/api/desk/voice", {
    method: "POST",
    headers: { authorization: "Bearer route-test-only-token", "content-type": "application/json" },
    body: JSON.stringify({ text }),
  }));
  try {
    assert.equal((await voice("crid bot wave")).status, 403, "a gesture is not a voice action");

    const drawn = await voice("crid thought");
    assert.notEqual(drawn.status, 422, "crid thought is a recognised command");
    assert.notEqual(drawn.status, 403, "and the deck draw is allowed by voice");

    // An unknown verb is a desk name by design, and the server's desk list answers it after a
    // state read, so these two stay in the route's own pre-storage checks instead.
    assert.equal((await voice("")).status, 422, "empty speech is refused");
    assert.equal((await voice("someone is raiding")).status, 422, "ordinary chat is never a voice command");
  } finally {
    if (saved === undefined) delete process.env.DESK_OPERATOR_TOKEN;
    else process.env.DESK_OPERATOR_TOKEN = saved;
  }
});
