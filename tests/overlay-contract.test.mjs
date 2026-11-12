import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overlay = readFileSync(new URL("../public/desk-assets/overlay.js", import.meta.url), "utf8");

test("the selected alive layout class is applied to the overlay root", () => {
  assert.match(overlay, /layout:\s*pick\("layout",\s*\["alive",\s*"classic"\],\s*"alive"\)/);
  assert.ok(overlay.includes("class: `layout-${CFG.layout} pos-"));
  assert.ok(overlay.includes(".layout-alive #dock-right"));
});

const brandOverlay = readFileSync(new URL("../public/desk-assets/overlay-brand.js", import.meta.url), "utf8");

test("the brand overlay adopts the main renderer's CRID instead of mounting a second one", () => {
  // crid-bot.js hardcodes host.id = "crid-bot", so a second mount put two #crid-bot hosts and a
  // second cue reader on /desk?overlay=brand. Brand mode loads overlay.js and reuses its bot.
  assert.ok(!brandOverlay.includes("createCridBot("), "brand overlay must not create its own CRID");
  assert.ok(!brandOverlay.includes("createCueReader("), "brand overlay must not read the cue channel twice");
  assert.match(brandOverlay, /window\.DeskOverlay\?\.crid/);
});

test("music playback uses the validated YouTube embed helper and refreshes on track state changes", () => {
  assert.ok(overlay.includes('import { youtubeEmbedUrl } from "./youtube-embed.js";'));
  assert.ok(overlay.includes("youtubeEmbedUrl(cur.videoId, { autoplay: music.playing === true })"));
  assert.ok(overlay.includes("videoId: s.music.current.videoId, playing: Boolean(s.music.playing)"));
});
