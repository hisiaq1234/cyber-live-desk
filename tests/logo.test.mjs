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
  LOGO_MARKS,
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
  LOGO_MARKS as BROWSER_LOGO_MARKS,
  LOGO_POSITIONS as PUBLIC_LOGO_POSITIONS,
  MARK_GEOMETRY,
  logoFrameAt,
  logoIntroMs,
  logoRestLayers,
  selectLayers,
} from "../public/desk-assets/logo.js";

import {
  MOTION_BOX,
  MOTION_INTRO_END,
  MOTION_REST,
  LOGO_ANIM,
} from "../public/desk-assets/logo-motion.js";

import {
  MARK_DEFAULTS,
  MOTION_RULE_LAYERS,
  MOTION_SOURCE_COLORS,
  botMarkSvg,
  mixRgb,
  stingAspect,
  stingBox,
  stingLayers,
  themeMotion,
} from "../public/desk-assets/logo-sting.js";

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
    "crid logo top", "crid logo bottom left", "crid logo replay", "crid logo tc",
    "crid logo goat", "crid logo bot", "crid logo BOT"]) {
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

// ---------- the mark switch ----------

test("the server and the browser agree about which mascots exist", () => {
  assert.deepEqual(BROWSER_LOGO_MARKS, LOGO_MARKS, "the browser's mark list drifted from the server's");
  // bot first: the vector fallback can only draw the robot, so the default is the one that never
  // leaves the operator with a goat they did not ask for when the sting fails to load.
  assert.equal(LOGO_MARKS[0], "bot");
});

test("crid logo goat and crid logo bot mean the mascot", () => {
  for (const mark of ["goat", "bot"]) {
    assert.deepEqual(parseDeskCommand(`crid logo ${mark}`), { verb: "logo", mark });
    assert.deepEqual(commandBody(parseDeskCommand(`crid logo ${mark}`)), { action: "logo", mark });
    assert.equal(commandText(parseDeskCommand(`crid logo ${mark}`)), `crid logo ${mark}`);
  }
  // "bot" must not be swallowed by the position word "bottom", and neither is a substring match.
  assert.deepEqual(parseDeskCommand("crid logo bottom"), { verb: "logo", pos: "bc" });
  assert.equal(parseDeskCommand("crid logo goat herder"), null);
  assert.match(COMMAND_HELP, /crid logo goat\|bot/);
});

test("naming a mark is a placement, not a flip", async () => {
  // The one-key body is a flip. { action, mark } is two keys, so asking for the robot must never
  // also switch the lockup off mid-show.
  const store = makeStore();
  const off = await runAction(store, { action: "logo", value: false });
  assert.equal(off.state.logo.on, false);
  const goat = await runAction(store, { action: "logo", mark: "goat" });
  assert.equal(goat.state.logo.mark, "goat");
  assert.equal(goat.state.logo.on, false, "asking for the goat switched the lockup back on");
});

test("the server refuses a mark that does not exist", async () => {
  const store = makeStore();
  await assert.rejects(() => runAction(store, { action: "logo", mark: "horse" }), (e) => {
    assert.equal(e.status, 422);
    assert.match(e.message, /bot, goat/);
    return true;
  });
  const untouched = await readState(store);
  assert.equal(untouched.logo, DEFAULT_STATE.logo, "a refused mark still wrote logo state");
});

// ---------- the sting: the operator's own animation ----------

// Every colour array the composition paints with, as 8-bit triples.
const collectColors = (node, out = new Set()) => {
  if (Array.isArray(node)) {
    for (const n of node) collectColors(n, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  for (const [k, v] of Object.entries(node)) {
    if ((k === "c" || k === "sc") && Array.isArray(v?.k)) {
      const seen = (c) => out.add(c.slice(0, 3).map((n) => Math.round(n * 255)).join(","));
      if (typeof v.k[0] === "number") seen(v.k);
      else for (const kf of v.k) for (const p of ["c", "s", "e"]) if (Array.isArray(kf?.[p])) seen(kf[p]);
      continue;
    }
    collectColors(v, out);
  }
  return out;
};

test("the shipped composition is the operator's, not a reconstruction", () => {
  // The complaint was that a previous attempt replaced their artwork. This is the guard: the file
  // that ships is a 1920x1080 comp with the goat baked in as one image asset, and the filter is
  // aimed at exactly the colours that file paints with.
  assert.equal(LOGO_ANIM.w, 1920);
  assert.equal(LOGO_ANIM.h, 1080);
  const painted = collectColors(LOGO_ANIM);
  for (const src of MOTION_SOURCE_COLORS) {
    assert.ok(painted.has(src), `the filter maps ${src} but the composition no longer paints it`);
  }
});

test("the crop is what killed the miniature", () => {
  const box = stingBox();
  assert.equal(box.viewBox, `${MOTION_BOX.x - 4} ${MOTION_BOX.y - 4} ${MOTION_BOX.width + 8} ${MOTION_BOX.height + 8}`);
  // The lockup is a wide strip: less than a fifth of the comp's height. Mounting the whole canvas
  // therefore shows the artwork at ~18% of the element, which is the size the operator rejected.
  assert.ok(MOTION_BOX.height / LOGO_ANIM.h < 0.2, "the ink box is no longer a strip; re-measure");
  assert.ok(MOTION_BOX.width <= LOGO_ANIM.w && MOTION_BOX.height <= LOGO_ANIM.h);
  assert.ok(box.width / box.height > 4, "the crop should be much wider than the comp");
  // logo.js pins the element's aspect-ratio to this number by hand; if they drift the lockup is
  // stretched, which is the other half of the bug the viewBox fix was for.
  const css = source("public/desk-assets/logo.js");
  const declared = css.match(/--lg-motion-aspect:\s*([0-9.]+)/);
  assert.ok(declared, "logo.js no longer declares the sting aspect");
  assert.ok(Math.abs(Number(declared[1]) - stingAspect()) < 0.001,
    `--lg-motion-aspect ${declared[1]} does not match stingAspect ${stingAspect()}`);
});

test("the rest frame is inside the intro and before its end", () => {
  assert.ok(MOTION_REST < MOTION_INTRO_END, "the rest frame sits in the middle of the intro");
  assert.ok(MOTION_INTRO_END < LOGO_ANIM.op, "the intro runs past the composition");
});

test("stingLayers finds the mark and the word that mattes it", () => {
  const { mark, word } = stingLayers();
  assert.equal(mark.ty, 2, "the mark is the one image layer");
  assert.equal(word?.ty, 4);
  assert.equal(word?.tt, 1, "the wordmark is an alpha matte, which is why order matters");
  assert.ok(LOGO_ANIM.layers.indexOf(word) < LOGO_ANIM.layers.indexOf(mark));
});

test("themeMotion repaints the four source colours and nothing else", () => {
  const before = collectColors(LOGO_ANIM);
  const map = { "255,0,0": [0, 255, 0], "92,57,57": [1, 2, 3], "96,96,96": [4, 5, 6], "0,0,0": [7, 8, 9] };
  const themed = themeMotion(LOGO_ANIM, map);
  const after = collectColors(themed);
  for (const src of MOTION_SOURCE_COLORS) {
    assert.ok(!after.has(src), `${src} survived the filter, so a baked colour is still off-theme`);
  }
  // Purity: the operator's data is the source of truth for the next theme switch and for the goat.
  assert.notEqual(themed, LOGO_ANIM);
  assert.deepEqual([...collectColors(LOGO_ANIM)], [...before], "themeMotion mutated the canonical data");
});

test("themeMotion refuses to invent colours the composition does not use", () => {
  const map = { "1,2,3": [255, 255, 255] };
  const themed = themeMotion(LOGO_ANIM, map);
  assert.deepEqual([...collectColors(themed)], [...collectColors(LOGO_ANIM)]);
});

// The operator's ask: "the line going around the otolorin should be another colour, blue, as
// this changes per theme". The outline and the handle are the same baked red in the source file,
// so this is only possible if the filter can address a layer, not just a colour value.
test("the outline and the handle split off one baked red, per layer", () => {
  const ink = [0, 255, 0];
  const rule = [10, 11, 12];
  const map = { "255,0,0": ink, "92,57,57": [1, 2, 3], "96,96,96": [4, 5, 6], "0,0,0": [7, 8, 9] };
  const layerMaps = Object.fromEntries(MOTION_RULE_LAYERS.map((nm) => [nm, { "255,0,0": rule }]));

  for (const nm of MOTION_RULE_LAYERS) {
    assert.ok(LOGO_ANIM.layers.some((l) => l.nm === nm), `${nm} is not a layer in the canonical file`);
  }
  const themed = themeMotion(LOGO_ANIM, map, layerMaps);
  const byLayer = (nm) => collectColors(themed.layers.find((l) => l.nm === nm));

  // Without the layer map both of these are the ink colour, which is what made them one colour.
  const flat = collectColors(themeMotion(LOGO_ANIM, map));
  assert.ok(flat.has("0,255,0"));
  assert.ok(byLayer("Text 1").has("0,255,0"), "the handle must stay on the meaning colour");
  for (const nm of MOTION_RULE_LAYERS) {
    const paints = byLayer(nm);
    assert.ok(paints.has("10,11,12"), `${nm} did not take the rule colour`);
    assert.ok(!paints.has("0,255,0"), `${nm} is still painted with the accent`);
  }
  // A theme that never restates the rule token still gets a blue line, not the old red.
  assert.match(source("public/desk-assets/logo.js"), /--t-logo-rule:var\(--indigo-500,#2868A6\)/);
  // The third argument stays optional so every other caller is unaffected.
  assert.ok(collectColors(themeMotion(LOGO_ANIM, map, null)).has("0,255,0"));
});

test("mixRgb is the distance-preserving half of the palette", () => {
  assert.deepEqual(mixRgb([255, 0, 0], [0, 0, 0], 0), [255, 0, 0]);
  assert.deepEqual(mixRgb([255, 0, 0], [0, 0, 0], 1), [0, 0, 0]);
  assert.deepEqual(mixRgb([255, 0, 0], [0, 0, 0], 0.5), [128, 0, 0]);
  // The dark red under the rim has to stay the same distance from the accent on a mint theme as on
  // a red one, which is why it is mixed rather than hard-coded.
  assert.deepEqual(mixRgb([0, 255, 188], [21, 27, 35], 0.62), [13, 114, 93]);
});

test("the robot arrives as literal colours because an image cannot see the page", () => {
  const svg = botMarkSvg();
  assert.ok(svg.startsWith("<svg"), "the mark must be a standalone document");
  assert.ok(!svg.includes("var(--"), "a token inside an <image> resolves to nothing");
  assert.ok(svg.includes(MARK_DEFAULTS.eye));
  const swapped = botMarkSvg({ eye: "#ff453a" });
  assert.ok(swapped.includes("#ff453a") && !swapped.includes(MARK_DEFAULTS.eye));
  // The geometry comes from logo.js rather than a second drawing of the mascot.
  assert.ok(svg.includes(MARK_GEOMETRY.head.slice(0, 20)));
});

// ---------- the clock ----------

const emOf = (block, prop) => {
  const m = block.match(new RegExp(`${prop}:(?:calc\\()?([\\d.]+)em`));
  return m ? Number(m[1]) : null;
};

test("the clock shares the news ticker's type rhythm instead of a solo overlay's absolute px", () => {
  const css = source("public/desk-assets/overlay.js");
  const dock = css.match(/#time-dock\{[^}]*\}/)?.[0];
  assert.ok(dock, "could not find the clock block to check");

  // The one token both plates read their ems from. index (2).html is a standalone timestamp, so
  // its 43px digits and 390px plate are sized for an empty frame; the desk's frame also carries the
  // ticker, and copying the solo numbers made the timer the loudest thing on screen.
  assert.match(css, /#desk\{[^}]*--feed-fs:calc\(var\(--scale\)\*clamp\(13px,1\.8vmin,19px\)\)/s);
  assert.match(dock, /font-size:var\(--feed-fs\)/);
  assert.match(css, /#auto-headlines\{[^}]*font-size:var\(--feed-fs\)/s);

  // No fixed pixel floor may survive on the plate: it has to be em or it stops tracking the feed.
  assert.match(dock, /min-width:min\(16em,64vw\)/);
  assert.ok(!/\b\d+px\b/.test(dock.match(/min-width:[^;]*/)[0]), "the plate still has a px floor");

  // The balance itself: digits against the headline text they sit next to. The operator's older
  // overlay measured about 1.7x; anything past ~2x is the timer shouting over the news.
  const time = css.match(/\.clock-time\{[^}]*\}/)?.[0];
  const title = css.match(/\.identity-row \.headline-feed-title\{[^}]*\}/)?.[0];
  assert.ok(time && title, "could not find the time or headline rules");
  const digits = emOf(time, "font-size");
  const ratio = digits / emOf(title, "font-size");
  assert.ok(ratio > 1.4 && ratio < 2.0, `clock-to-headline ratio is ${ratio.toFixed(2)}, outside balance`);
  assert.equal(digits, 1.5);

  // Same declaration as the ticker's own accent edge, so the two bars weigh the same at any width.
  const ticker = css.match(/#auto-headlines\{[^}]*\}/)?.[0];
  assert.equal(emOf(dock, "border-left"), emOf(ticker, "border-left"));

  // The reference anatomy, kept.
  assert.match(css, /\.clock-time\{[^}]*font-family:var\(--mono\)/s);
  assert.match(css, /\.clock-time\{[^}]*letter-spacing:-\.045em/s);
  assert.match(dock, /border-radius:0 \.75em \.75em 0/);
  assert.match(css, /#desk\{[^}]*--mono:/);
  assert.match(css, /@media\(max-width:520px\)\{#time-dock\{[^}]*bottom:calc/);
});
