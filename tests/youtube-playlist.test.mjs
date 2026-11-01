import { test } from "node:test";
import assert from "node:assert/strict";

import { youtubePlaylistEmbedUrl } from "../public/desk-assets/youtube-playlist.mjs";

test("YouTube Music playlist becomes a visible official playlist player URL", () => {
  const output = youtubePlaylistEmbedUrl("https://music.youtube.com/playlist?list=RDCLAK5uy_exampleList123456");
  const url = new URL(output);
  assert.equal(url.origin, "https://www.youtube.com");
  assert.equal(url.pathname, "/embed");
  assert.equal(url.searchParams.get("listType"), "playlist");
  assert.equal(url.searchParams.get("list"), "RDCLAK5uy_exampleList123456");
  assert.equal(url.searchParams.get("playsinline"), "1");
  assert.equal(url.searchParams.has("autoplay"), false);
});

test("standard playlist links with other safe YouTube hosts are accepted", () => {
  assert.ok(youtubePlaylistEmbedUrl("https://www.youtube.com/playlist?list=PL1234567890ABCDE"));
  assert.ok(youtubePlaylistEmbedUrl("https://youtube.com/watch?v=abc123&list=PL1234567890ABCDE"));
  assert.ok(youtubePlaylistEmbedUrl("https://youtu.be/abc123?list=PL1234567890ABCDE"));
});

test("non-YouTube, insecure, credentialed, unusual-port, malformed and audio-only URLs are rejected", () => {
  for (const value of [
    "not a URL",
    "http://music.youtube.com/playlist?list=PL1234567890",
    "https://youtube.com.evil.example/playlist?list=PL1234567890",
    "https://user:pass@youtube.com/playlist?list=PL1234567890",
    "https://youtube.com:8443/playlist?list=PL1234567890",
    "https://music.youtube.com/playlist?list=bad%2Flist",
    "https://music.youtube.com/playlist",
    "https://example.com/?list=PL1234567890",
  ]) assert.equal(youtubePlaylistEmbedUrl(value), null, value);
});
