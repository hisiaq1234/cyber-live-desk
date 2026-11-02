import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeYouTubeResults, searchYouTubeTracks, youtubeApiKey } from "../api/_youtube-search.mjs";

const sample = {
  items: [
    {
      id: { videoId: "8jDVdq70zUI" },
      snippet: {
        title: "SISTERS AND BROTHERS",
        channelTitle: "Kanye West",
        thumbnails: { medium: { url: "https://i.ytimg.com/vi/8jDVdq70zUI/mqdefault.jpg" } },
      },
    },
    {
      id: { videoId: "dQw4w9WgXcQ" },
      snippet: {
        title: "Sisters and Brothers (DJ Edit)",
        channelTitle: "Club Mixes",
        thumbnails: { default: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg" } },
      },
    },
  ],
};

test("normalize keeps playable videos and drops anything without a real id or title", () => {
  const out = normalizeYouTubeResults({
    items: [
      ...sample.items,
      { id: { videoId: "short" }, snippet: { title: "Bad id" } },
      { id: { videoId: "PL1234567890ABCDE" }, snippet: { title: "A playlist, not a video" } },
      { id: { videoId: "abcdefghijk" }, snippet: { title: "   " } },
      { id: { channelId: "UC1234567890" }, snippet: { title: "No video id at all" } },
    ],
  });
  assert.deepEqual(out.map((r) => r.videoId), ["8jDVdq70zUI", "dQw4w9WgXcQ"]);
  assert.equal(out[0].artist, "Kanye West");
  assert.equal(out[1].thumbnail, "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg");
});

test("normalize respects max and tolerates an empty or malformed payload", () => {
  assert.equal(normalizeYouTubeResults(sample, 1).length, 1);
  assert.deepEqual(normalizeYouTubeResults(null), []);
  assert.deepEqual(normalizeYouTubeResults({ items: "nope" }), []);
});

test("search resolves a song phrase through the YouTube Data API and returns normalized tracks", async () => {
  let calledWith = "";
  const results = await searchYouTubeTracks("sisters and brothers kanye west", {
    env: { YOUTUBE_API_KEY: "test-key" },
    fetchFn: async (url, init) => {
      calledWith = String(url);
      assert.equal(init.headers.Accept, "application/json");
      return { ok: true, json: async () => sample };
    },
  });

  const url = new URL(calledWith);
  assert.equal(url.origin, "https://www.googleapis.com");
  assert.equal(url.pathname, "/youtube/v3/search");
  assert.equal(url.searchParams.get("part"), "snippet");
  assert.equal(url.searchParams.get("type"), "video");
  assert.equal(url.searchParams.get("videoEmbeddable"), "true");
  assert.equal(url.searchParams.get("q"), "sisters and brothers kanye west");
  assert.equal(url.searchParams.get("key"), "test-key");
  assert.equal(results[0].videoId, "8jDVdq70zUI");
});

test("search reports a missing key instead of returning an empty list", async () => {
  await assert.rejects(
    () => searchYouTubeTracks("anything", { env: {}, fetchFn: async () => { throw new Error("must not fetch"); } }),
    /YOUTUBE_API_KEY is not set/,
  );
});

test("search rejects empty and over-long phrases before it reaches the network", async () => {
  const fetchFn = async () => { throw new Error("must not fetch"); };
  await assert.rejects(() => searchYouTubeTracks("   ", { env: { YOUTUBE_API_KEY: "k" }, fetchFn }), /required/);
  await assert.rejects(
    () => searchYouTubeTracks("x".repeat(121), { env: { YOUTUBE_API_KEY: "k" }, fetchFn }),
    /120 characters/,
  );
});

test("search surfaces an upstream failure rather than pretending it found nothing", async () => {
  await assert.rejects(
    () => searchYouTubeTracks("anything", {
      env: { YOUTUBE_API_KEY: "k" },
      fetchFn: async () => ({ ok: false, status: 403 }),
    }),
    /HTTP 403/,
  );
});

test("youtubeApiKey trims and defaults to empty", () => {
  assert.equal(youtubeApiKey({ YOUTUBE_API_KEY: "  abc  " }), "abc");
  assert.equal(youtubeApiKey({}), "");
  assert.equal(youtubeApiKey(undefined), "");
});
