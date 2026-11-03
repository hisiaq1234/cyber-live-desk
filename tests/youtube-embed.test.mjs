import { test } from "node:test";
import assert from "node:assert/strict";
import { isYouTubeVideoId, youtubeEmbedUrl } from "../public/desk-assets/youtube-embed.js";

test("the requested default video uses the official privacy-enhanced player", () => {
  const url = youtubeEmbedUrl("8jDVdq70zUI", { autoplay: true });
  assert.equal(isYouTubeVideoId("8jDVdq70zUI"), true);
  assert.equal(new URL(url).origin, "https://www.youtube-nocookie.com");
  assert.equal(new URL(url).pathname, "/embed/8jDVdq70zUI");
  assert.equal(new URL(url).searchParams.get("autoplay"), "1");
  assert.equal(new URL(url).searchParams.get("controls"), "1");
  assert.equal(new URL(url).searchParams.get("playsinline"), "1");
  assert.equal(new URL(url).searchParams.get("rel"), "0");
});

test("invalid IDs and arbitrary URLs cannot become iframe sources", () => {
  for (const value of [null, "", "https://www.youtube.com/watch?v=8jDVdq70zUI", "../../evil.test", "8jDVdq70zU!"]) {
    assert.equal(isYouTubeVideoId(value), false);
    assert.equal(youtubeEmbedUrl(value), null);
  }
});

test("the player does not autoplay unless the controller state says playing", () => {
  const url = youtubeEmbedUrl("8jDVdq70zUI");
  assert.equal(new URL(url).searchParams.get("autoplay"), "0");
});
