// Run with: node --test
// The desk lockup: the choreography that keeps the layers from all landing at once, the colour
// contract that keeps red out of it, and the server state that lets the operator drive it on air.
//
// The system this replaces was a 1920x1080 After Effects lower third played inside a 5.06:1 strip
// with preserveAspectRatio="none". Its layers all spanned the whole timeline, its fills were
// #ff0000 / #606060 / #000000 in the animation data itself, and its wordmark was a Lottie text
// layer pointing at a font the browser could not load — so the attempt before this one stacked a
// DOM wordmark on top of a broken one and left a miniature red bar in every theme.
import { test} from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_STATE,
  LOGO_LAYERS,
  LOGO_POSITIONS,
  LOGO_WIDTH,
  commitState,
  publicProjection,
  publicState,
  readState,
  runAction,
} from "../api/_desk-core.mjs";

import {
  COMMAND_HELP,
  LOGO_POSITION_WORDS,
  commandBody,
  commandText,
  parseDeskCommand,
} from "../api/_commands.mjs";

import {
  LOGO_LAYER_IDS,
  LOGO_POSITIONS as PUBLIC_LOGO_POSITIONS,
  logoFrameAt,
  logoIntroMs,
  logoRestLayers,
  selectLayers,
} from "../public/desk-assets/logo.js";

import {
  COMMAND_HELP as publicCommandHelp,
  LOGO_POSITION_WORDS as publicLogoPositionWords,
  commandBody as publicCommandBody,
  commandText as publicCommandText,
  parseDeskCommand as parsePublicDeskCommand,
} from "../public/desk-assets/_commands.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const source = (rel) => readFileSync(here + "../" + rel, "utf8");

const makeStore = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return {
    async get(key, opts) {
      const v = m.get(key);
      if (v == null) return null;
      return opts?.type === "json" ? JSON.parse(v) : v;
    },
    async setJSON(key, value) {
      m.set(key, JSON.stringify(value));
    },
  };
};

// ---------- the choreography ----------

test("no moment of the intro puts every layer on screen", () => {
  // This is the complaint, written down as an invariant. The old composition had six layers and
  // all six spanned frames 0..146, so "all at once" was the only state it had.
  const total = LOGO_LAYER_IDS.length;
  const end = logoIntroMs();
  let worst = 0;
  let worstAt = -1;
  for (let t = 0; t <= end + 200; t += 5) {
    const frame = logoFrameAt(t);
    const on = Object.values(frame).filter((L) => L.on).length;
    if (on > worst) { worst = on; worstAt = t; }
  }
  assert.ok(worst < total, `all ${total} layers were visible together at t=${worstAt}ms`);
});

test("the gesture has left before the rule arrives", () => {
  // Walk forward until the sweep is gone, then check the rule has not started yet.
  let goneAt = 0;
  for (let t = 0; t <= logoIntroMs(); t += 1) {
    if (!logoFrameAt(t).sweep.on) { goneAt = t; break; }
  }
  let ruleAt = logoIntroMs();
  for (let t = 0; t <= logoIntroMs(); t += 1) {
    if (logoFrameAt(t).rule.on) { ruleAt = t; break; }
  }
  assert.ok(goneAt > 0, "the sweep never appeared, so there is no gesture to time against");
  assert.ok(goneAt <= ruleAt, `the sweep was still leaving at ${goneAt}ms when the rule arrived at ${ruleAt}ms`);
});

test("the rest state is mark, word and rule — never the gesture", () => {
  // A permanent background plate is what made the old logo read as scenery. Whatever is left
  // standing after the intro has to be the lockup itself.
  assert.deepEqual(logoRestLayers(), ["mark", "word", "rule"]);
  assert.equal(logoFrameAt(logoIntroMs() + 500).sweep.on, false);
});

test("each layer arrives in its own window rather than all on frame zero", () => {
  const starts = LOGO_LAYER_IDS.map((id) => {
    for (let t = 0; t <= logoIntroMs(); t += 1) if (logoFrameAt(t)[id].on) return t;
    return -1;
  });
  assert.deepEqual(starts, [...starts].sort((a, z) => a - z), `layers did not stagger: ${starts.join(", ")}`);
  assert.ok(new Set(starts).size === starts.length, `two layers started on the same frame: ${starts.join(", ")}`);
});

test("a layer the operator switched off stays off", () => {
  const only = selectLayers(["mark", "word"]);
  assert.deepEqual(only.map((L) => L.id), ["mark", "word"], "layers must come back in timeline order");
  assert.deepEqual(selectLayers(["rule", "mark", "rule"]).map((L) => L.id), ["mark", "rule"]);
  assert.deepEqual(selectLayers(["nope"]).map((L) => L.id), [], "an unknown layer names nothing, not everything");
  assert.deepEqual(selectLayers(null).map((L) => L.id), LOGO_LAYER_IDS);
});

// ---------- the colour contract ----------

test("nothing in the lockup is red, and no colour is a bare literal", () => {
  const src = source("public/desk-assets/logo.js");
  const css = src.slice(src.indexOf("const CSS = `") + 12, src.indexOf("`;", src.indexOf("const CSS")));
  assert.ok(css.length > 400, "could not find the stylesheet to check");

  const hexes = [...css.matchAll(/#[0-9a-fA-F]{3,8}/g)].map((m) => m[0]);
  assert.ok(hexes.length > 0, "the fallback chain should still be there");
  // Every literal must sit in a var() fallback, never as a value of its own.
  for (const line of css.split("\n")) {
    for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}/g)) {
      const before = line.slice(0, m.index);
      assert.ok(/var\(/.test(before), `bare colour literal on: ${line.trim()}`);
    }
  }

  const RED = { r: 0, g: 0, b: 0 };
  for (const h of hexes) {
    const v = h.length === 4
      ? [1, 2, 3].map((i) => parseInt(h[i] + h[i], 16))
      : [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    RED.r = v[0]; RED.g = v[1]; RED.b = v[2];
    const redness = RED.r - Math.max(RED.g, RED.b);
    assert.ok(redness < 90, `${h} is a red (${redness} ahead of its strongest other channel}); cyber-theme.js reserves red for meaning`);
  }
  assert.ok(!/rgba?\(/.test(css), "no rgb()/rgba() either");
  // The desk is a sticker drawing: flat fills, one hard offset shadow, and nothing that Swae has
  // to blur or blend to snapshot.
  assert.ok(!/gradient\(/.test(css), "no gradients in the lockup — cyber-theme.js rules them out");
  assert.ok(!/filter:|box-shadow:/.test(css), "no blur and no glow in the lockup");
});

test("the cyber theme names its own logo colours", () => {
  const theme = source("public/desk-assets/cyber-theme.js");
  for (const token of ["--t-logo-shell", "--t-logo-eye", "--t-logo-rule", "--t-logo-gesture", "--t-logo-1", "--t-logo-2"]) {
    assert.ok(theme.includes(token), `cyber-theme.js never declares ${token}, so the lockup would fall through to a literal`);
  }
  // The theme's own rule, restated as a test so nobody re-adds the gradient that used to be here.
  assert.ok(!/crid-logo[^}]*radial-gradient/i.test(theme), "the CRID badge must not go back to a red radial gradient");
  const overlay = source("public/desk-assets/overlay.js");
  assert.ok(!/class: "crid-logo", style: "background:radial/.test(overlay),
    "the CRID badge fallback was a hardcoded dark-red gradient on every theme; it must stay tokenised");
});

// ---------- the two copies agree ----------

test("the server and the browser hold the same layer and position names", () => {
  assert.deepEqual(LOGO_LAYER_IDS, LOGO_LAYERS, "the browser's layer list drifted from the server's");
  assert.deepEqual(PUBLIC_LOGO_POSITIONS, LOGO_POSITIONS);
  for (const [word, pos] of Object.entries(LOGO_POSITION_WORDS)) {
    assert.ok(LOGO_POSITIONS.includes(pos), `"crid logo ${word}" would store ${pos}, which the server refuses`);
  }
  assert.deepEqual(publicLogoPositionWords, LOGO_POSITION_WORDS);
});

test("the two command parsers agree about the lockup", () => {
  for (const line of ["crid logo", "crid logo on", "crid logo off", "crid logo big", "crid logo small",
    "crid logo top", "crid logo bottom left", "crid logo replay", "crid logo tc"]) {
    assert.deepEqual(parsePublicDeskCommand(line), parseDeskCommand(line), line);
    assert.deepEqual(publicCommandBody(parseDeskCommand(line)), commandBody(parseDeskCommand(line)), line);
    assert.equal(publicCommandText(parseDeskCommand(line)), commandText(parseDeskCommand(line)), line);
  }
  assert.equal(publicCommandHelp, COMMAND_HELP);
});

// ---------- chat and voice ----------

test("crid logo says what it means", () => {
  assert.deepEqual(parseDeskCommand("crid logo"), { verb: "logo" });
  assert.deepEqual(commandBody(parseDeskCommand("crid logo")), { action: "logo" });
  assert.deepEqual(parseDeskCommand("crid logo off"), { verb: "logo", value: "off" });
  assert.deepEqual(commandBody(parseDeskCommand("crid logo off")), { action: "logo", value: false });
  assert.deepEqual(commandBody(parseDeskCommand("crid logo on")), { action: "logo", value: true });
  assert.deepEqual(commandBody(parseDeskCommand("crid logo big")), { action: "logo", size: "big" });
  assert.deepEqual(commandBody(parseDeskCommand("crid logo again")), { action: "logo", replay: true });
  assert.deepEqual(commandBody(parseDeskCommand("crid logo top")), { action: "logo", pos: "tc" });
  assert.deepEqual(commandBody(parseDeskCommand("crid logo bottom-right")), { action: "logo", pos: "br" });
});

test("a logo command nobody meant is refused, not guessed", () => {
  // On air, a command that fires when nobody meant it is worse than one that is ignored.
  for (const line of ["crid logo middle", "crid logo huge", "crid logo word", "crid logo off now", "crid logo 50"]) {
    assert.equal(parseDeskCommand(line), null, `${line} parsed as a command`);
  }
  // The prefix is a word, not a substring: crid_logo_TR is somebody's filename.
  assert.equal(parseDeskCommand("crid_logo_TR"), null);
});

test("the lockup is speakable and the help lists it", () => {
  assert.match(COMMAND_HELP, /crid logo on\|off/);
  assert.match(COMMAND_HELP, /crid logo big\|small/);
  assert.equal(commandText(parseDeskCommand("crid logo top")), "crid logo tc");
  assert.equal(commandText(parseDeskCommand("crid logo big")), "crid logo big");
  assert.equal(commandText(parseDeskCommand("crid logo")), "crid logo");
});

// ---------- the server state ----------

test("a desk that has never been told otherwise has no logo state at all", async () => {
  assert.equal(DEFAULT_STATE.logo, null);
  const state = await readState(makeStore());
  assert.equal(state.logo, null, "the lockup reads as unset until someone places it");
  assert.deepEqual(publicProjection({ ...state, logo: null }).logo, null);
});

test("the lockup keeps what it already knew when only one field is sent", async () => {
  const store = makeStore();
  await runAction(store, { action: "logo", pos: "br", width: 30 });
  const after = await runAction(store, { action: "logo", value: false });
  assert.equal(after.state.logo.pos, "br", "a later command reset the position");
  assert.equal(after.state.logo.width, 30, "a later command reset the width");
  assert.equal(after.state.logo.on, false);
});

test("a bare crid logo flips the lockup", async () => {
  const store = makeStore();
  assert.equal((await runAction(store, { action: "logo" })).state.logo.on, false,
    "with nothing stored yet, a bare flip takes it off air");
  assert.equal((await runAction(store, { action: "logo" })).state.logo.on, true);
});

test("replay counts up so the same intro can be asked for twice", async () => {
  const store = makeStore();
  const first = await runAction(store, { action: "logo", replay: true });
  const second = await runAction(store, { action: "logo", replay: true });
  assert.equal(first.state.logo.replay, 1);
  assert.equal(second.state.logo.replay, 2, "a boolean would make the second request a no-op");
});

test("big and small step from where the lockup is and converge", async () => {
  const store = makeStore();
  let width = (await runAction(store, { action: "logo", size: "big" })).state.logo.width;
  assert.equal(width, LOGO_WIDTH.default + LOGO_WIDTH.step);
  for (let i = 0; i < 30; i += 1) width = (await runAction(store, { action: "logo", size: "big" })).state.logo.width;
  assert.equal(width, LOGO_WIDTH.max, "repeating big must stop at the ceiling, not run off the frame");
  for (let i = 0; i < 60; i += 1) width = (await runAction(store, { action: "logo", size: "small" })).state.logo.width;
  assert.equal(width, LOGO_WIDTH.min);
});

test("the server refuses a layer, a position or a size that does not exist", async () => {
  const store = makeStore();
  const bad = [
    { action: "logo", pos: "middle" },
    { action: "logo", layers: ["sweep", "confetti"] },
    { action: "logo", layers: [] },
    { action: "logo", width: "enormous" },
    { action: "logo", size: "gigantic" },
    { action: "logo", value: "yes" },
    { action: "logo", x: 150, y: 10 },
  ];
  for (const body of bad) {
    await assert.rejects(() => runAction(store, body), (e) => e.status === 422, JSON.stringify(body));
  }
  // A refused command must not have written anything.
  assert.equal((await readState(store)).logo, null);
});

test("layers are stored in timeline order and only ever as known names", async () => {
  const store = makeStore();
  const out = await runAction(store, { action: "logo", layers: ["word", "sweep", "word"] });
  assert.deepEqual(out.state.logo.layers, ["sweep", "word"]);
  const cleared = await runAction(store, { action: "logo", layers: null });
  assert.equal(cleared.state.logo.layers, null, "null means every layer, which is not the same as []");
});

test("the overlay is told about the lockup and nothing else private", async () => {
  const store = makeStore();
  await commitState(store, await readState(store), {
    logo: { on: true, pos: "tc", width: 30, layers: ["mark", "word"], replay: 4 },
    twitchAllowedUserIds: ["12345"],
    researchApprovalMode: "all",
  });
  const served = await publicState(store, -1, Date.now());
  const json = JSON.stringify(served.body);
  assert.deepEqual(served.body.logo, { on: true, pos: "tc", width: 30, layers: ["mark", "word"], replay: 4 });
  assert.ok(!json.includes("12345"), "the Twitch allowlist leaked to the public overlay");
  assert.ok(!json.includes("twitchAllowedUserIds"));
});

test("a stored logo survives being read back", async () => {
  const store = makeStore();
  const placed = await runAction(store, { action: "logo", pos: "custom", x: 12.5, y: 8 });
  assert.equal(placed.state.logo.pos, "custom");
  assert.equal(placed.state.logo.x, 12.5);
  assert.equal(placed.state.logo.y, 8);
  const again = await readState(store);
  assert.deepEqual(again.logo, placed.state.logo);
});
