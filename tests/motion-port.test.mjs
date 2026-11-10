import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CYBER_CSS } from "../public/desk-assets/cyber-theme.js";

const overlay = readFileSync(new URL("../public/desk-assets/overlay.js", import.meta.url), "utf8");

// The bot module owns the default width; the theme is allowed to override it. Reading the default
// out of the module keeps the comparison honest if that default ever moves.
const botModule = readFileSync(new URL("../public/desk-assets/crid-bot.js", import.meta.url), "utf8");
const moduleWidth = botModule.match(/--bw:(clamp\([^)]*\))/)?.[1];

const keyframes = (css) => [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)]
  .map((m) => ({ name: m[1], body: m[2] }));

// Enough CSS arithmetic to evaluate a width ramp at a named viewport. Expected values in the
// tests below are hand-derived literals, not results of this helper.
const widthAt = (ramp, vw, vh) => {
  const m = ramp.match(/clamp\(\s*([\d.]+)px\s*,\s*([\d.]+)(vw|vmin)\s*,\s*([\d.]+)px\s*\)/);
  assert.ok(m, `not a px/vw clamp: ${ramp}`);
  const unit = m[3] === "vw" ? vw : Math.min(vw, vh);
  return Math.min(Number(m[4]), Math.max(Number(m[1]), (Number(m[2]) * unit) / 100));
};

test("the mascot's shadow scales with the mascot, not with the desk's type", () => {
  // Break caught: a fixed px offset, or an em offset, both resolve against something other than
  // the bot — an em inherits #desk's font-size, so the shadow stays put while the bot grows.
  // The size he is actually drawn at is --bot-w (the broadcast clamp times ?bot.scale=), so that
  // is what the shadow is bound to.
  const rule = CYBER_CSS.match(/#crid-bot svg\{[^}]*\}/)?.[0];
  assert.ok(rule, "the theme must own the mascot's shadow");
  const shadow = rule.match(/drop-shadow\((.*)\)/)?.[1];
  assert.ok(shadow, `no drop-shadow in ${rule}`);
  const [x, y, blur] = shadow.split(/\s+/);
  assert.equal(x, "0", "a soft cast shadow has no sideways offset");
  assert.match(y, /^calc\(var\(--bot-w\)\*[\d.]+\)$/, `the drop must be bound to --bot-w, got ${y}`);
  assert.match(blur, /^calc\(var\(--bot-w\)\*[\d.]+\)$/, `the blur must be bound to --bot-w, got ${blur}`);
  // Pure black at low opacity: a tinted shadow was the purple blob under his feet.
  assert.match(shadow, /rgba\(0,0,0,[\d.]+\)$/, `the shadow must be untinted, got ${shadow}`);
});

test("the mascot keeps a readable floor on a phone and grows on a 720p stream frame", () => {
  // Break caught: a vmin ramp or a small px clamp, which renders a miniature on a 1280x720 browser
  // source — the size the desk is actually captured at. The broadcast size lives in the bot module
  // now (one clamp, one source of truth), and the theme may not shrink it behind the module's back.
  assert.ok(moduleWidth, "the bot module must declare the broadcast --bw ramp");
  const rule = CYBER_CSS.match(/#crid-bot\{[^}]*\}/)?.[0];
  if (rule) {
    assert.ok(!/--bw:/.test(rule), "the theme must not compete with the module's one size");
  }

  assert.equal(widthAt(moduleWidth, 390, 844), 150);
  assert.equal(widthAt(moduleWidth, 1280, 720), 224);
  assert.equal(widthAt(moduleWidth, 1920, 1080), 336);
  assert.ok(widthAt(moduleWidth, 1280, 720) >= 200, "a 720p capture must not get a miniature");
  assert.ok(widthAt(moduleWidth, 1920, 1080) >= 320, "a 1080p stream must get the broadcast size");

  // His feet land on the frame, not behind the clock or the ticker, and a raised ?bot.scale= can
  // never crop him: both are module rules, measured at placement time.
  assert.match(botModule, /--bot-floor/, "the module must place his feet against the floor");
  assert.match(botModule, /--bot-max:min\(/, "the module must cap the drawn width to the frame");
});

test("the mascot answers on the classes the desk actually toggles", () => {
  // Break caught: porting the reference's [data-beat] / .bot-stage selectors. Nothing in this
  // desk sets them, so the rules would be dead and the bot would stay furniture.
  for (const hook of ["is-active", "music-playing"]) {
    const rule = CYBER_CSS.match(new RegExp(`#crid-bot\\.${hook}[^{]*\\{[^}]*\\}`)?.source)?.[0];
    assert.ok(rule, `no rule for the live .${hook} hook`);
    assert.match(rule, /animation:/, `.${hook} must move, not just recolour`);
  }
  for (const dead of ["[data-beat]", ".bot-stage", ".bot-bubble", ".bot-hand", ".bot-eye"]) {
    assert.ok(!CYBER_CSS.includes(dead), `${dead} is a reference selector with no element here`);
  }
});

test("the mascot's motion leaves the pose engine's nodes and its own anchor alone", () => {
  // Break caught: a CSS animation on .head/.body/.mittL fights the setAttribute transforms the
  // pose engine writes every tick; a translateX double-shifts the bottom-centre anchor, which
  // centres with margin-left rather than a transform.
  const botFrames = keyframes(CYBER_CSS).filter((k) => k.name.startsWith("bot-"));
  assert.ok(botFrames.length >= 2, "the mascot needs an answer and a groove");
  for (const k of botFrames) {
    assert.ok(!/translateX/.test(k.body), `${k.name} shifts the anchor sideways`);
    assert.ok(!/translate\(/.test(k.body), `${k.name} uses a two-axis translate`);
  }
  for (const node of [".eye", ".mouth", ".body", ".head", ".mittL", ".mittR", ".tag", ".ticket"]) {
    const re = new RegExp(`#crid-bot[^{]*\\${node}[^{]*\\{[^}]*animation:`);
    assert.ok(!re.test(CYBER_CSS), `${node} is driven by the pose engine, not by CSS`);
  }
});

test("a card settles without a blur pass, and keeps the overshoot that reads as settling", () => {
  // Break caught: re-adding filter:blur to the arrival. Swae re-renders the whole surface for a
  // blur on every snapshot, and the brand draws flat shapes. Flattening the mid knot to a plain
  // fade is the other half: the overshoot is the entire reason the arrival reads as weight.
  const frames = keyframes(overlay);
  const arrive = frames.find((k) => k.name === "stage-arrive")?.body;
  const leave = frames.find((k) => k.name === "stage-leave")?.body;
  assert.ok(arrive && leave);
  for (const block of [arrive, leave]) {
    assert.ok(!/blur\(/.test(block), `blur survived in ${block}`);
    assert.ok(!/brightness\(/.test(block), `brightness survived in ${block}`);
  }
  const card = overlay.match(/\.card\{[^}]*\}/)?.[0];
  assert.ok(!/filter\s+[\d.]+s/.test(card.match(/transition:[^}]*/)?.[0] ?? ""), "dead filter transition");

  const knots = [...arrive.matchAll(/(\d+)%\{([^}]*)\}/g)].map((m) => ({ at: Number(m[1]), body: m[2] }));
  const mid = knots.find((k) => k.at > 0 && k.at < 100);
  assert.ok(mid, "the arrival needs a mid knot");
  assert.equal(mid.at, 70);
  assert.match(mid.body, /translate3d\(0,-2px,0\)/);
  assert.match(mid.body, /scale\(1\.004\)/);
  const end = knots.find((k) => k.at === 100);
  assert.match(end.body, /scale\(1\)/);
  assert.match(overlay, /\.anim-slide \.card\.in\{animation:stage-arrive \.5s cubic-bezier\(\.2,\.8,\.2,1\) both\}/);
});

test("panels lean on the separate rotate property, capped so nothing looks broken", () => {
  // Break caught: folding the lean into transform, where it fights the arrival animation and the
  // bot's flight transforms; and a tilt past half a degree, which reads as a rendering fault.
  const lean = CYBER_CSS.match(/rotate:var\(--lean[^}]*\}/)?.[0];
  assert.ok(lean, "the lean must use the individual rotate property");
  assert.ok(!/transform:[^}]*rotate\(/.test(CYBER_CSS), "a lean inside transform fights the arrival");
  const tilts = [...CYBER_CSS.matchAll(/--lean:\s*(-?[\d.]+)deg/g)].map((m) => Number(m[1]));
  assert.ok(tilts.length >= 4, "each panel family draws its own lean");
  for (const t of tilts) assert.ok(Math.abs(t) <= 0.55, `${t}deg is past the half-degree budget`);
  assert.ok(tilts.some((t) => t !== 0), "a desk where nothing leans is the desk we started with");
  assert.match(CYBER_CSS, /transition:rotate \.5s cubic-bezier\(\.2,\.8,\.2,1\)/);
});

test("the identity surfaces never lean", () => {
  // Break caught: widening the lean selector to the whole panel family. The operator called the
  // lockup perfect, the clock is a bar against the frame edge, and the CRID bug is a pinned badge.
  const rule = CYBER_CSS.match(/[^{}]*\{[^}]*rotate:var\(--lean[^}]*\}/)?.[0];
  assert.ok(rule);
  const selector = rule.slice(0, rule.indexOf("{"));
  for (const pinned of ["#time-dock", "#auto-headlines", "#desk-logo", "#crid-bot", "#crid-jumbotron"]) {
    assert.ok(!selector.includes(pinned), `${pinned} must stay square`);
  }
  for (const leaning of [".card", ".court-wrap", ".music-wrap", ".ledger-wrap", "#x-jumbotron"]) {
    assert.ok(selector.includes(leaning), `${leaning} should carry the hand`);
  }
});

test("the lean keeps one hard shadow, never a blur and never a second light", () => {
  // Break caught: a depth variant that grows a blur radius or stacks a second shadow. The sticker
  // look is exactly one flat shape offset from another.
  const shadows = [...CYBER_CSS.matchAll(/--sticker:\s*([^;}]+)[;}]/g)].map((m) => m[1].trim());
  assert.ok(shadows.length >= 3, "the desk needs a shallow, a neutral and a deep cut");
  for (const s of shadows) {
    assert.ok(!s.includes(","), `more than one shadow: ${s}`);
    assert.match(s, /^[\d.]+em [\d.]+em 0 /, `not a hard zero-blur offset: ${s}`);
  }
  const depths = shadows.map((s) => Number(s.match(/^([\d.]+)em/)[1]));
  assert.ok(Math.max(...depths) - Math.min(...depths) >= 0.1, "the depths must actually differ");
  assert.ok(Math.max(...depths) <= 0.34, "past the reference's deepest cut");
});

test("the CRID bug breathes in opacity, and the theme stops killing it", () => {
  // Break caught: bug-breathe as a brightness filter (a full surface re-render per snapshot) and
  // the theme's animation:none, which together mean the badge is currently dead still on cyber.
  const breathe = keyframes(overlay).find((k) => k.name === "bug-breathe")?.body;
  assert.ok(breathe);
  assert.ok(!/filter/.test(breathe), `the breathe must not be a filter: ${breathe}`);
  assert.match(breathe, /opacity/);
  assert.match(overlay, /#crid-jumbotron\.in\s*\{[^}]*animation: bug-breathe 4s ease-in-out infinite/);

  const bug = CYBER_CSS.match(/#crid-jumbotron\{[^}]*\}/)?.[0];
  assert.ok(bug);
  assert.ok(!/animation:none/.test(bug), "the theme must let the cheap breathe run");
  const lifted = CYBER_CSS.match(/#crid-jumbotron\.in\{[^}]*\}/)?.[0];
  assert.ok(lifted, "the promoted badge needs its own depth");
  const deep = lifted.match(/box-shadow:([\d.]+)em ([\d.]+)em 0/);
  assert.ok(deep, `no hard shadow on .in: ${lifted}`);
  assert.ok(Number(deep[1]) > 0.28 && Number(deep[2]) > 0.32, "the promoted badge must sit deeper than the resting sticker");
  assert.match(overlay, /#crid-jumbotron\s*\{[^}]*transition: opacity 0\.55s cubic-bezier\(0\.2, 0\.9, 0\.25, 1\)/s);
});

test("the label pill carries a live mint tick, pulsing in opacity", () => {
  // Break caught: dropping the tick, or making it a scale/filter pulse. The pill is the category
  // label on every card; a cheap opacity pulse is what says "this desk is receiving".
  const dot = CYBER_CSS.match(/[^{}]*\.meta::after\{[^}]*\}/)?.[0];
  assert.ok(dot, "the label pill has no live mark");
  assert.match(dot, /content:""/);
  assert.match(dot, /border-radius:50%/);
  assert.match(dot, /background:var\(--mint\)/);
  assert.match(dot, /animation:chaos-tick 2\.6s ease-in-out infinite/);
  const tick = keyframes(CYBER_CSS).find((k) => k.name === "chaos-tick")?.body;
  assert.ok(tick, "no chaos-tick keyframe");
  assert.match(tick, /opacity/);
  assert.ok(!/filter|transform/.test(tick), `the tick must stay an opacity pulse: ${tick}`);
});

test("the leader's highlight travels inside its own bar and never stops", () => {
  // Break caught: putting the sweep on .opt.lead itself, where the theme's animation:none kills it,
  // or making it a one-shot / eased pass that stalls at the ends and then dies.
  const sweep = CYBER_CSS.match(/[^{}]*\.opt\.lead \.fill::after\{[^}]*\}/)?.[0];
  assert.ok(sweep, "the sweep must live on the fill, not on the option");
  assert.match(sweep, /position:absolute/);
  assert.match(sweep, /inset:0/);
  assert.match(sweep, /animation:chaos-sweep 2\.8s linear infinite/);
  const knots = keyframes(CYBER_CSS).find((k) => k.name === "chaos-sweep");
  assert.ok(knots, "no chaos-sweep keyframe");
  const from = knots.body.match(/0%\{([^}]*)\}/)?.[1];
  const to = knots.body.match(/100%\{([^}]*)\}/)?.[1];
  assert.match(from ?? "", /translateX\(-100%\)/);
  assert.match(to ?? "", /translateX\(100%\)/);
  assert.ok(CYBER_CSS.includes(".opt{"), "the option must still clip the sweep");
  const opt = CYBER_CSS.match(/[^{}]*\.opt\{[^}]*\}/)?.[0];
  assert.ok(!/animation:[^n]/.test(opt?.match(/animation:[^;}]*/)?.[0] ?? ""), "the option element stays still");
});

test("the leader's highlight is a soft mint pass, not a solid band", () => {
  // Break caught: flattening the fade into hard stops or a solid block. The operator chose the
  // reference's pass as-is; what a viewer reads is one mint highlight crossing the bar.
  const sweep = CYBER_CSS.match(/[^{}]*\.opt\.lead \.fill::after\{[^}]*\}/)?.[0];
  assert.ok(sweep);
  const bg = sweep.match(/background:(linear-gradient\([^;]*\))/)?.[1];
  assert.ok(bg, `the highlight must be a gradient pass: ${sweep}`);
  assert.match(bg, /^linear-gradient\(90deg,/);
  assert.equal(bg.split("transparent").length - 1, 2, "both ends must fade out");
  const mid = bg.match(/rgba\(134,246,188,([\d.]+)\)/);
  assert.ok(mid, `the pass must be the theme's mint: ${bg}`);
  assert.ok(Number(mid[1]) > 0 && Number(mid[1]) < 1, "a highlight, not a repaint of the bar");
});

test("the tick and the sweep are silenced for a reduced-motion viewer", () => {
  // Break caught: guarding the mascot and the panels but forgetting the two new pseudo-elements,
  // which would keep pulsing and sweeping for a viewer who asked for stillness.
  const guard = CYBER_CSS.match(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(guard);
  assert.match(guard, /\.meta::after/);
  assert.match(guard, /\.fill::after/);
  assert.match(guard, /animation:none/);
});

test("the mascot's shadow stays off on Swae and low-power, where the base removes it", () => {
  // Break caught: the theme's selector is html[data-theme] #desk #crid-bot svg = (2,1,2), which
  // out-specifies the bot module's html.swae #crid-bot svg{filter:none} = (1,1,2). Without a
  // matching guard the theme silently re-adds a drop-shadow on the two renderers that asked for
  // none. The blanket swae rule only kills transition/animation, not filter.
  const themed = CYBER_CSS.match(/#crid-bot svg\{[^}]*\}/)?.[0];
  assert.ok(themed && /drop-shadow/.test(themed), "precondition: the theme paints a shadow");
  for (const flag of ["swae", "low-power"]) {
    const re = new RegExp(`html\\.${flag}[^{}]*#crid-bot svg\\{[^}]*filter:none[^}]*\\}`);
    assert.ok(re.test(CYBER_CSS), `the theme must re-assert filter:none under html.${flag}`);
  }
});

test("every bit of ported motion is silenced for a reduced-motion viewer", () => {
  // Break caught: adding a keyframe and forgetting the guard. The base sheet already guards its
  // own; the theme's new motion needs its own, and it must cover the mascot as well as the panels.
  const guard = CYBER_CSS.match(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(guard, "the theme has no reduced-motion guard");
  assert.match(guard, /animation:none/);
  assert.match(guard, /#crid-bot/);
  assert.match(guard, /rotate/);
  assert.ok(keyframes(CYBER_CSS).length >= 3, "the port should have brought real motion with it");
});