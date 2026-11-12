import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("the location write sits behind the operator Bearer gate like every other write", async () => {
  const old = process.env.DESK_OPERATOR_TOKEN;
  process.env.DESK_OPERATOR_TOKEN = "route-test-only-token";
  const post = (auth) => desk.fetch(new Request("https://cyber-live-desk.vercel.app/api/desk/location", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify({ lat: 6.5, lon: 3.3 }),
  }));
  try {
    assert.equal((await post(null)).status, 401, "no token is refused before storage is touched");
    assert.equal((await post("Bearer wrong-token")).status, 401, "a wrong token is refused");
  } finally {
    if (old === undefined) delete process.env.DESK_OPERATOR_TOKEN;
    else process.env.DESK_OPERATOR_TOKEN = old;
  }
});

// The voice route checks its allowlist before any storage read, so these assertions hold without a
// live Redis. The operator's ask is an overlay that answers back, so the layout and a mascot
// gesture are speakable; what stays refused is anything that reaches credentials, approval or the
// queue, and that guard is asserted against the list itself rather than one example.
test("the layout and a mascot gesture are speakable, and nothing that touches approval is", async () => {
  const saved = process.env.DESK_OPERATOR_TOKEN;
  process.env.DESK_OPERATOR_TOKEN = "route-test-only-token";
  const voice = (text) => desk.fetch(new Request("https://cyber-live-desk.vercel.app/api/desk/voice", {
    method: "POST",
    headers: { authorization: "Bearer route-test-only-token", "content-type": "application/json" },
    body: JSON.stringify({ text }),
  }));
  try {
    for (const line of ["crid thought", "crid scene", "crid scene dual", "crid bot wave", "crid logo goat"]) {
      const res = await voice(line);
      assert.notEqual(res.status, 422, `${line} is a recognised command`);
      assert.notEqual(res.status, 403, `${line} is allowed by voice`);
    }

    const safe = readFileSync(new URL("../api/desk.mjs", import.meta.url), "utf8")
      .match(/const safeActions = new Set\(\[(.*?)\]\)/s)[1];
    for (const danger of ["twitch-allow", "twitch-chat", "bulk-approval", "research-approval",
      "auto-research", "ledger-add", "space-add", "crid-close", "court-verdict", "music-volume", "vote"]) {
      assert.ok(!safe.includes(`"${danger}"`), `${danger} must never be voice-reachable`);
    }

    assert.equal((await voice("")).status, 422, "empty speech is refused");
    assert.equal((await voice("someone is raiding")).status, 422, "ordinary chat is never a voice command");
  } finally {
    if (saved === undefined) delete process.env.DESK_OPERATOR_TOKEN;
    else process.env.DESK_OPERATOR_TOKEN = saved;
  }
});
