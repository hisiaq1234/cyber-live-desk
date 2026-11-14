import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overlay = readFileSync(new URL("../public/desk-assets/overlay.js", import.meta.url), "utf8");
const control = readFileSync(new URL("../public/desk-assets/control.js", import.meta.url), "utf8");

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

test("the location dock reads the delayed public fix defensively and keeps panic off the map", () => {
  // state.location is the delayed public view; .public is tolerated, hidden blanks the dock.
  assert.ok(overlay.includes("s.location?.public ?? s.location"));
  assert.ok(overlay.includes('locFeed.hidden === true'));
  assert.ok(overlay.includes('id: "loc-map"'));
  assert.ok(overlay.includes('id: "loc-dock"'));
  assert.ok(overlay.includes('id: "music-plate"'));
  // The old fixed plate is gone: one map instance lives in the dock, never a second load.
  assert.ok(!overlay.includes('id: "map-plate"'));
});

test("the GTA minimap is persistent, location-gated and player-centred", () => {
  assert.ok(overlay.includes('let locMode = "mini"'));
  assert.ok(overlay.includes("const miniRect = () =>"));
  assert.ok(overlay.includes("const syncMinimap = () =>"));
  assert.ok(overlay.includes("the player marker stays centred"));
  assert.ok(overlay.includes("map.easeTo({ center: [lng, lat], duration: 520 })"));
  assert.ok(!overlay.includes("LOCPEEK_MS"));
  assert.ok(!overlay.includes("peekHideTimer"));
  assert.ok(overlay.includes('P.get("locview") === "full"'));
  // SWAE kills CSS transitions: dock motion must be stepped in JS, never transitioned.
  assert.ok(overlay.includes("animateRect"));
});

test("the idle desk leaves headlines and completed game boards off screen", () => {
  assert.match(overlay, /const HEADLINES_ON = P\.get\("headlines"\) === "1"/);
  assert.match(overlay, /if \(HEADLINES_ON\) refreshHeadlines\(\);/);
  assert.match(overlay, /state\.letters\?\.status === "open"/);
  assert.match(overlay, /state\.letters\.endsAt > serverNow\(\)/);
});

test("The Ascent is an explicit live layer, not startup or fixture content", () => {
  assert.ok(overlay.includes('register("ascent"'));
  assert.match(overlay, /const ascent = state\.ascent\?\.status === "active" \|\| state\.ascent\?\.status === "complete"/);
  assert.ok(overlay.includes('showCard({ id: `ascent-${ascent.id}`, type: "ascent", category: "CRID" }, { ascent })'));
  assert.ok(overlay.includes('el.updateAscent?.(opts.ascent)'));
  assert.ok(overlay.includes('ascent.vote?.endsAt'));
});

test("GTA HUD styles the whole cyber overlay and leaves camera feeds visible by default", () => {
  const theme = readFileSync(new URL("../public/desk-assets/cyber-theme.js", import.meta.url), "utf8");
  assert.match(overlay, /const SCENE_ON = P.get\("bg"\) === "1"/);
  assert.match(theme, /GTA HUD layer: applies to the whole broadcast/);
  assert.match(theme, /#desk #desk-logo/);
  assert.match(theme, /#desk #loc-map/);
  assert.match(theme, /#desk #crid-live/);
  assert.match(theme, /#desk :is\(\.card,\.court-wrap,\.music-wrap/);
  assert.match(overlay, /html\[data-theme="cyber"\] #desk \.letters/);
  assert.match(overlay, /html\[data-theme="cyber"\] #desk \.letters-tile\.vowel/);
});


test("automatic RSS headlines are opt-in and never occupy the default startup frame", () => {
  assert.match(overlay, /const HEADLINES_ON = P\.get\("headlines"\) === "1"/);
  assert.match(overlay, /const headlineShelf = HEADLINES_ON \?/);
  assert.match(overlay, /if \(HEADLINES_ON\) refreshHeadlines\(\)/);
  assert.match(overlay, /if \(!HEADLINES_ON \|\| !headlineShelf\) return/);
  assert.match(overlay, /#music-plate\{position:fixed;right:var\(--m\);bottom:calc\(var\(--m\) \+ env\(safe-area-inset-bottom,0px\)\)/);
});


test("the default overlay uses the two-camera split HUD and keeps each half clear", () => {
  assert.match(overlay, /const scene = pick\("scene", \["split", "pip"\], "split"\)/);
  assert.match(overlay, /html\[data-scene="split"\] #desk\.layout-alive \.slot/);
  assert.match(overlay, /html\[data-scene="split"\] #desk\.layout-alive #dock-right/);
  assert.match(overlay, /html\[data-scene="split"\] #desk #music-plate/);
  assert.match(overlay, /scene === "split" \? "tl" : "tc"/);
  assert.match(overlay, /split \? 0\.44 : 0\.94/);
});


test("live GPS is explicit in the private controller and clears its public history on stop", () => {
  assert.ok(control.includes("navigator.geolocation.watchPosition"));
  assert.ok(control.includes('api("/api/desk/location", { lat: latitude, lon: longitude, alt: altitude })'));
  assert.ok(control.includes('api("/api/desk/location", { clear: true })'));
  assert.ok(control.includes("await gpsWritePending.catch(() => {})"));
  assert.ok(!overlay.includes("navigator.geolocation"));
});
