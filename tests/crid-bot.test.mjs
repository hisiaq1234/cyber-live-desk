// The mascot's own behaviour, driven through a tiny DOM stand-in.
//
// crid-bot.js only touches the DOM through createElement(NS), setAttribute, classList, dataset,
// style and a couple of rect reads, so a 60-line stand-in runs the real engine in node — which is
// the only way to prove the two things that broke on air: that bot.on:true actually boots him and
// starts the loop, and that a reduced-motion viewer still gets a living character.

import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";

class FakeEl {
  constructor(tag) {
    this.tagName = tag;
    this.attrs = {};
    this.children = [];
    this.dataset = {};
    this.textContent = "";
    this.offsetWidth = 0;
    this.isConnected = true;
    const classes = new Set();
    this.classList = {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (c) => classes.has(c),
      [Symbol.iterator]: () => classes[Symbol.iterator](),
    };
    this.style = { setProperty: (k, v) => { this.style[k] = v; }, removeProperty: (k) => { delete this.style[k]; } };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  setAttributeNS(ns, k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  append(...kids) { for (const k of kids) if (k) { k.parent = this; this.children.push(k); } }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  remove() { this.isConnected = false; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }; }
}

function installDom({ reduce = false } = {}) {
  const root = new FakeEl("body");
  globalThis.document = {
    head: new FakeEl("head"),
    body: root,
    documentElement: new FakeEl("html"),
    createElement: (t) => new FakeEl(t),
    createElementNS: (ns, t) => new FakeEl(t),
    getElementById: () => null,
  };
  globalThis.Image = class { set src(v) { this._src = v; } };
  globalThis.matchMedia = (q) => ({ media: q, matches: reduce, addEventListener() {}, removeEventListener() {} });
  globalThis.innerWidth = 1920;
  globalThis.innerHeight = 1080;
  return root;
}

// Everything the pose engine draws, so "is the loop running" is a string comparison.
const pose = (el) => {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    out.push(n.attrs.transform || "", n.attrs.opacity || "");
    (n.children || []).forEach(walk);
  };
  walk(el);
  return out.join("|");
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { createCridBot } = await import("../public/desk-assets/crid-bot.js");

test("bot.on:true boots him and the idle loop ticks", async () => {
  // Break caught: the on-air bug. online started at true while mode started at "dead", so
  // observe({bot:{on:true}}) looked like "no change", setMode() never ran, and every gesture was
  // skipped by the loop's own `mode!=="dead"` guard. He rendered as a still frame, forever.
  const root = installDom();
  const bot = createCridBot({ root, step: 12, position: "bc" });
  bot.observe({ bot: { on: true } });
  assert.equal(bot.mode, "on", "bot.on:true must leave him on, not dead");
  assert.equal(bot.el.dataset.mode, "on", "the attribute the overlay and theme read must agree");
  const first = pose(bot.el);
  await sleep(140);
  assert.notEqual(pose(bot.el), first, "the idle loop must actually be moving him");
  bot.destroy();
});

test("an explicit bot.on:false kills him and bot.on:true brings him back", async () => {
  const root = installDom();
  const bot = createCridBot({ root, step: 12, position: "bc" });
  bot.observe({ bot: { on: true } });
  bot.observe({ bot: { on: false } });
  await sleep(120);
  assert.equal(bot.mode, "dead");
  assert.equal(bot.el.dataset.mode, "dead");
  bot.observe({ bot: { on: true } });
  assert.equal(bot.mode, "on", "he must come back up, not stay stuck in the dead pose");
  assert.equal(bot.el.dataset.mode, "on");
  bot.destroy();
});

test("a reduced-motion viewer gets a living mascot, not a frozen one", async () => {
  // Break caught: play(), say(), nudge() and startWalk() all bailed out when the preference
  // matched, which a browser source can report — so on air he went silent and still.
  const root = installDom({ reduce: true });
  const bot = createCridBot({ root, step: 12, position: "bc" });
  bot.observe({ bot: { on: true } });
  assert.equal(bot.mode, "on", "reduced motion must not mean dead");
  const first = pose(bot.el);
  await sleep(140);
  assert.notEqual(pose(bot.el), first, "reduced motion must still tick, just without the travel");
  bot.say("hm.");
  assert.ok(bot.el.children.some((c) => c.className === "bot-bubble"), "he must still be allowed to speak");
  bot.destroy();
});

test("the sprite payload ships as downscaled webp inside the budget", async () => {
  // Break caught: 1050x1400 PNG masters (~3.1 MB) loaded to draw him at ~104px.
  const dir = new URL("../public/desk-assets/crid/", import.meta.url);
  const files = await readdir(dir);
  assert.deepEqual(files.filter((f) => f.endsWith(".png")), [], "the oversized png masters must not ship");
  // Seven body shapes, one drawing each — the shapes he grows through as subs land.
  const bodies = files.filter((f) => /^body-.*\.webp$/.test(f));
  assert.equal(bodies.length, 7, "one sprite per body shape");
  for (const f of bodies) {
    const size = (await stat(new URL(f, dir))).size;
    assert.ok(size < 60 * 1024, `${f} must stay small enough to load on air, got ${(size / 1024).toFixed(1)} KB`);
  }
});

test("the body ladder is a real ladder, not seven near-identical frames", async () => {
  // Break caught: three of the seven frames sat within 2px of each other, so a stage change was
  // invisible at desk size — the whole progression read as one body. The frames are now built by
  // scripts/build-body-ladder.py, which measures each frame it writes into ladder.json; the
  // renderer's own table has to be that measurement, not a second opinion.
  const { BODY_LADDER } = await import("../public/desk-assets/crid-bot.js");
  const doc = JSON.parse(await readFile(new URL("../public/desk-assets/crid/ladder.json", import.meta.url), "utf8"));
  assert.equal(BODY_LADDER.length, 7, "one stage per body frame");
  assert.deepEqual(doc.stages.map((s) => s.key), BODY_LADDER.map((s) => s.key),
    "the ladder and the frames must be in the same lean -> fat order");
  assert.deepEqual(doc.stages.map((s) => [s.ink.w, s.ink.h]), BODY_LADDER.map((s) => [s.w, s.h]),
    "the renderer's table must be the measured ink box of the frames that ship");
  for (let i = 1; i < BODY_LADDER.length; i++) {
    assert.ok(BODY_LADDER[i].w > BODY_LADDER[i - 1].w, `stage ${i} must be wider than stage ${i - 1}`);
    assert.ok(BODY_LADDER[i].h > BODY_LADDER[i - 1].h, `stage ${i} must be taller than stage ${i - 1}`);
  }
  // The point of the ladder: a step you can see. 24px of ink width and 8px of height between
  // consecutive stages; measured minimums are 33px and 12px.
  for (let i = 1; i < BODY_LADDER.length; i++) {
    const dw = BODY_LADDER[i].w - BODY_LADDER[i - 1].w, dh = BODY_LADDER[i].h - BODY_LADDER[i - 1].h;
    assert.ok(dw >= 24, `stages ${i - 1}->${i} differ by only ${dw}px of ink width`);
    assert.ok(dh >= 8, `stages ${i - 1}->${i} differ by only ${dh}px of ink height`);
  }
  // The invariants a body swap must never break: feet on one ground line, body on one axis. The
  // worst measured offset is ~10px in a 600px frame, i.e. under 4px of the 336px he is drawn at.
  for (const s of doc.stages) {
    assert.equal(s.ink.bottom, doc.ground, `stage ${s.key} must keep its feet on y=${doc.ground}`);
    assert.ok(Math.abs(s.ink.cx - doc.axis) <= 16, `stage ${s.key} sits ${Math.abs(s.ink.cx - doc.axis)}px off the axis`);
  }
  // And the build has to move: the heavy stage is slower and lands harder than the lanky one.
  const first = BODY_LADDER[0], last = BODY_LADDER[BODY_LADDER.length - 1];
  assert.ok(last.slow > first.slow && last.heft > first.heft, "the huge stage must move heavier than the lanky one");
});

test("no state can paint an invisible sprite", async () => {
  // Break caught: eyes-sleep, eyes-dim, eyes-spark and mouth-slam shipped as 42-byte 1x1
  // placeholders while real states referenced them — so dozing or waking painted a blank over his
  // face. Anything under 1 KB is a placeholder, and a placeholder must not ship.
  const dir = new URL("../public/desk-assets/crid/", import.meta.url);
  const files = await readdir(dir);
  const tiny = [];
  for (const f of files) {
    const size = (await stat(new URL(f, dir))).size;
    if (size < 1024) tiny.push(`${f} (${size} B)`);
  }
  assert.deepEqual(tiny, [], "no sprite under 1 KB may ship — supply real art or stop the state rendering");
});

test("the mascot is drawn at broadcast size and can be scaled from the URL", async () => {
  // Break caught: the 64–104px clamp, which made every idle animation invisible on a 1080p stream,
  // and no way to resize him without editing code.
  const src = await import("node:fs/promises").then((fs) => fs.readFile(
    new URL("../public/desk-assets/crid-bot.js", import.meta.url), "utf8"));
  const clamp = src.match(/#crid-bot\{--bw:clamp\((\d+)px,([\d.]+)vw,(\d+)px\)/);
  assert.ok(clamp, "the base size must be one clamp in the bot module");
  assert.ok(Number(clamp[3]) >= 320, `the max width must read on air, got ${clamp[3]}px`);
  assert.match(src, /--bws/, "the scale multiplier must exist");
  // What is actually drawn is --bot-w: the broadcast clamp times ?bot.scale=, capped by the frame so
  // a raised scale cannot crop him. The shadow is bound to that, not to --bw, so it grows with him.
  assert.match(src, /--bot-w:min\(calc\(var\(--bw\)\*var\(--bws\)\),var\(--bot-max\)\)/,
    "the drawn width must be the scaled clamp, capped to the frame");
  assert.match(src, /--bot-max:min\(calc\(100vw - 2\*var\(--m,16px\)\),calc\(\(100dvh - 2\*var\(--m,16px\)\)\*160\/168\)\)/,
    "the cap must be the frame's width and height, in the sprite's own aspect");
  assert.match(src, /filter:drop-shadow\(0 calc\(var\(--bot-w\)\*\.028\) calc\(var\(--bot-w\)\*\.07\)/, "the shadow must be soft, not a hard offset copy");
  const overlay = await import("node:fs/promises").then((fs) => fs.readFile(
    new URL("../public/desk-assets/overlay.js", import.meta.url), "utf8"));
  assert.match(overlay, /num\("bot\.scale", 1, 0\.4, 2\.5\)/, "?bot.scale= must be wired from the overlay");
});
