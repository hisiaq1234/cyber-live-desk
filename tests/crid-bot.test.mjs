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
  // Break caught: 1050x1400 PNG masters (~3.1 MB) loaded to draw him at ~104px. The frames are cut
  // from those masters now, so they ship at that size — but as webp, and each one still has to be a
  // file a browser source can load on air.
  const dir = new URL("../public/desk-assets/crid/", import.meta.url);
  const files = await readdir(dir);
  assert.deepEqual(files.filter((f) => f.endsWith(".png")), [], "the oversized png masters must not ship");
  // Three body shapes, one drawing each — the builds he grows through as subs land.
  const bodies = files.filter((f) => /^body-.*\.webp$/.test(f));
  assert.equal(bodies.length, 3, "one sprite per body shape");
  for (const f of bodies) {
    const size = (await stat(new URL(f, dir))).size;
    assert.ok(size < 160 * 1024, `${f} must stay small enough to load on air, got ${(size / 1024).toFixed(1)} KB`);
  }
});

test("the body ladder is three builds of one render, not three different drawings", async () => {
  // Break caught twice over. First: the seven frames were seven different Snap renders at rotation
  // 7, so a weight change swapped the pose, the head size and the silhouette — a different person,
  // not the same man heavier. Then: three of those seven sat within 2px of each other, so a stage
  // change was invisible. The frames are now Snap's own body=0/1/2 at rotation 0, one render in one
  // pose, framed by scripts/build-body-ladder.py, which measures each frame it writes into
  // ladder.json; the renderer's own table has to be that measurement, not a second opinion.
  const { BODY_LADDER } = await import("../public/desk-assets/crid-bot.js");
  const doc = JSON.parse(await readFile(new URL("../public/desk-assets/crid/ladder.json", import.meta.url), "utf8"));
  assert.equal(BODY_LADDER.length, 3, "one stage per body frame");
  assert.deepEqual(doc.stages.map((s) => s.key), BODY_LADDER.map((s) => s.key),
    "the ladder and the frames must be in the same lean -> heavy order");
  assert.deepEqual(doc.stages.map((s) => [s.ink.w, s.ink.h]), BODY_LADDER.map((s) => [s.w, s.h]),
    "the renderer's table must be the measured ink box of the frames that ship");
  for (let i = 1; i < BODY_LADDER.length; i++) {
    assert.ok(BODY_LADDER[i].w > BODY_LADDER[i - 1].w, `stage ${i} must be wider than stage ${i - 1}`);
  }
  // The point of the rebuild: the SAME man in the SAME pose at every weight. One render means one
  // head top and one height — only the build may change — and the heavy stage has to be a step you
  // can see (Snap gives 112px of extra ink width; its average build sits within 3px of the lean one).
  const heads = new Set(doc.stages.map((s) => s.ink.y0));
  assert.equal(heads.size, 1, "every stage must keep the same head top: one render, one pose");
  assert.equal(new Set(doc.stages.map((s) => s.ink.h)).size, 1,
    "every stage must be the same height: a weight change must not change his size");
  const heaviest = BODY_LADDER[BODY_LADDER.length - 1].w - BODY_LADDER[0].w;
  assert.ok(heaviest >= 90, `the heavy build is only ${heaviest}px wider than the lean one`);
  // The invariants a body swap must never break: feet on one ground line, body on one axis. The
  // worst measured offset is ~19px in a 1050px frame, i.e. under 4px of the 336px he is drawn at.
  for (const s of doc.stages) {
    assert.equal(s.ink.bottom, doc.ground, `stage ${s.key} must keep its feet on y=${doc.ground}`);
    // The ink box centre is a crude proxy for the axis — the heavy build's arms flare further on
    // one side than the other, which moves the box 29px without moving him: the mid-torso he stands
    // on is measured onto x=560 by the build script and stays there.
    assert.ok(Math.abs(s.ink.cx - doc.axis) <= 32, `stage ${s.key} sits ${Math.abs(s.ink.cx - doc.axis)}px off the axis`);
  }
  // And the build has to move: the heavy stage is slower and lands harder than the lanky one.
  const first = BODY_LADDER[0], last = BODY_LADDER[BODY_LADDER.length - 1];
  assert.ok(last.slow > first.slow && last.heft > first.heft, "the huge stage must move heavier than the lanky one");
});

test("sprite and rig assets are present, readable, and not placeholders", async () => {
  // Anything under 1 KB is a placeholder, and a placeholder must not ship. Inspect recursively
  // (including rig pieces) and validate the assets the engine actually loads are readable files.
  const dir = new URL("../public/desk-assets/crid/", import.meta.url);
  async function walk(u, rel = "") {
    const out = [];
    for (const f of await readdir(u)) {
      const child = new URL(f, u + (u.pathname.endsWith("/") ? "" : "/"));
      const r = rel ? `${rel}/${f}` : f;
      const s = await stat(child);
      if (s.isDirectory()) out.push(...await walk(child, r));
      else out.push({ rel: r, size: s.size, path: child });
    }
    return out;
  }
  const files = await walk(dir);
  const tiny = files.filter((f) => f.size < 1024).map((f) => `${f.rel} (${f.size} B)`);
  assert.deepEqual(tiny, [], "no sprite/rig asset under 1 KB may ship — supply real art or remove it");

  // Expected files the bot/rig load must exist and be readable (not just present in name).
  const expected = [
    "ladder.json", "rig.json", "rig.mjs", "spritesheet.webp",
    ...["0", "1", "2"].map((b) => `body-${b}-r0.webp`),
    ...["arm-fore-l.png", "arm-fore-r.png", "arm-upper-l.png", "arm-upper-r.png", "head.png", "shin-l.png", "shin-r.png", "thigh-l.png", "thigh-r.png", "torso.png"].map((f) => `rig/${f}`),
  ];
  const missing = [];
  for (const rel of expected) {
    const p = new URL(rel, dir + "/");
    try {
      const b = await readFile(p);
      if (!b || b.length === 0) missing.push(`${rel} (empty/unreadable)`);
    } catch (e) {
      missing.push(`${rel} (${e.code || "missing"})`);
    }
  }
  assert.deepEqual(missing, [], "expected CRID sprite/rig assets must exist and be readable");
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

test("he goes to find a panel on his own when the desk is quiet", async () => {
  // The desk hands him the layer registry; with nobody asking him to do anything he still walks
  // to a panel and leans — the difference between a mascot and a widget pinned to a corner.
  const root = installDom();
  const box = { x: 200, y: 50, w: 300, h: 250, edge: { left: 200, right: 500, top: 50, bottom: 300 }, z: 1 };
  const layers = { layer: () => box };
  const bot = createCridBot({ root, step: 12, position: "bc", layers, visitIn: 60 });
  bot.observe({ bot: { on: true } });
  let roamed = false;
  for (let i = 0; i < 60 && !roamed; i++) { await sleep(100); roamed = bot.el.classList.contains("roam"); }
  assert.ok(roamed, "within a few seconds of waking he should be on his way to a panel");
  bot.destroy();
});
