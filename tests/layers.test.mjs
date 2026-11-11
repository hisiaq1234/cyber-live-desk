// The layer registry, and the three staging verbs built on it.
//
// Break caught: nothing on the desk ever published where a panel was, so every "CRID interacts
// with an overlay" was a hardcoded spot that only looked right on one frame size. These tests run
// the registry against a stand-in document and the real bot against a stand-in registry, which is
// the only way to check the two rules that keep a lean honest: a panel that is not on screen is
// absent (never a zero box), and a name nobody registered is ignored without throwing.

import test from "node:test";
import assert from "node:assert/strict";

const { createLayerRegistry, LAYER_NAMES } = await import("../public/desk-assets/layers.mjs");
const { createCridBot } = await import("../public/desk-assets/crid-bot.js");

const rect = (left, top, w, h) => ({ left, top, width: w, height: h, right: left + w, bottom: top + h });

function fakeDoc(selectors, { observers = false } = {}) {
  const nodes = new Map();
  for (const [sel, box] of Object.entries(selectors)) {
    nodes.set(sel, {
      nodeType: 1,
      parentElement: null,
      rect: box,
      getBoundingClientRect() { return this.rect; },
    });
  }
  const doc = {
    documentElement: {},
    defaultView: {},
    querySelector: (sel) => nodes.get(sel) || null,
    nodes,
  };
  if (observers) {
    doc.defaultView.MutationObserver = class {
      constructor(cb) { this.cb = cb; doc.mo = this; }
      observe() {}
      disconnect() { this.disconnected = true; }
    };
    doc.defaultView.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
  }
  return doc;
}

test("a named layer answers with its live box, its edges and its stacking value", () => {
  const doc = fakeDoc({ "#time-dock": rect(16, 900, 390, 130), "#dock-right": rect(1540, 16, 360, 400) });
  const layers = createLayerRegistry({ doc, win: {} });
  const clock = layers.layer("clock");
  assert.ok(clock, "the clock is on screen and must be found");
  assert.deepEqual([clock.x, clock.y, clock.w, clock.h], [16, 900, 390, 130]);
  assert.deepEqual(clock.edge, { left: 16, right: 406, top: 900, bottom: 1030 });
  assert.equal(typeof clock.z, "number");
  assert.ok(layers.layer("dock"), "every registered surface resolves by its own name");
});

test("a panel that is not on screen is absent, not a zero box", () => {
  // The card slot is registered but empty: the card itself is the slot's child, and there is none.
  const doc = fakeDoc({});
  const layers = createLayerRegistry({ doc, win: {} });
  for (const name of LAYER_NAMES) assert.equal(layers.layer(name), null, `${name} must read as absent`);
  const snap = layers.snapshot();
  assert.deepEqual(Object.keys(snap).sort(), [...LAYER_NAMES].sort());
  assert.ok(Object.values(snap).every((v) => v === null), "an absent layer is null in the published frame");
});

test("a name nobody registered is ignored, and nothing throws", () => {
  const doc = fakeDoc({ "#time-dock": rect(16, 900, 390, 130) });
  const layers = createLayerRegistry({ doc, win: {} });
  for (const name of ["nope", "", null, undefined, 42, {}, "__proto__"]) {
    assert.equal(layers.layer(name), null, `${String(name)} must be null`);
  }
  assert.equal(layers.layer("clock").w, 390, "a bad name must not damage the registry");
});

test("a panel that moves is re-measured after an invalidation, not per frame", () => {
  const doc = fakeDoc({ "#time-dock": rect(16, 900, 390, 130) });
  const layers = createLayerRegistry({ doc, win: {} });
  assert.equal(layers.layer("clock").x, 16);
  doc.nodes.get("#time-dock").rect = rect(600, 800, 390, 130);   // the panel moved, no signal yet
  assert.equal(layers.layer("clock").x, 16, "the box is cached until something invalidates it");
  layers.invalidate();
  assert.equal(layers.layer("clock").x, 600, "an invalidated registry reads the new position");
  assert.equal(JSON.parse(JSON.stringify(layers.snapshot())).clock.x, 600, "the snapshot is plain JSON");
});

test("a mutation re-measures the frame: the watchers survive a refresh", () => {
  // Break caught: refresh() rebuilt the observer list, which disconnected the MutationObserver on
  // the first re-measure — so a panel that appeared after boot was never seen and every layer read
  // as absent for the life of the page.
  const doc = fakeDoc({}, { observers: true });
  const layers = createLayerRegistry({ doc, win: {} });
  assert.equal(layers.layer("clock"), null);
  doc.nodes.set("#time-dock", { nodeType: 1, parentElement: null, getBoundingClientRect: () => rect(16, 900, 390, 130) });
  doc.mo.cb();                                     // the panel was added to the document
  assert.equal(doc.mo.disconnected, undefined, "the watcher must still be watching");
  assert.equal(layers.layer("clock").w, 390, "a panel that appears after boot must be found");
});

// ---- the verbs, against the real bot engine ------------------------------------------------
class FakeEl {
  constructor(tag) {
    this.tagName = tag; this.attrs = {}; this.children = []; this.dataset = {}; this.textContent = "";
    this.offsetWidth = 0; this.isConnected = true;
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

function installDom() {
  globalThis.document = {
    head: new FakeEl("head"),
    body: new FakeEl("body"),
    documentElement: new FakeEl("html"),
    createElement: (t) => new FakeEl(t),
    createElementNS: (ns, t) => new FakeEl(t),
    getElementById: () => null,
  };
  globalThis.Image = class { set src(v) { this._src = v; } };
  globalThis.matchMedia = (q) => ({ media: q, matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.innerWidth = 1920;
  globalThis.innerHeight = 1080;
}

// A panel that reaches his body: the stand-in figure stands with its feet on the fake rect's
// bottom edge (100), so a box from 0 to 200 is something he can actually lean on.
const PANEL = { name: "clock", x: 600, y: 0, w: 300, h: 200, edge: { left: 600, right: 900, top: 0, bottom: 200 }, z: 20 };

test("walkTo travels to a panel's edge instead of teleporting him", async () => {
  installDom();
  const bot = createCridBot({ root: document.body, step: 12, layers: (name) => (name === "clock" ? PANEL : null) });
  bot.observe({ bot: { on: true } });
  assert.equal(bot.walkTo("clock", "left"), true, "a panel that is there must be walkable");
  assert.ok(bot.el.classList.contains("roam"), "he has to leave his anchor to travel");
  assert.ok(String(bot.el.style.left || "").includes("%"), "the walk is a move across the frame");
  assert.equal(bot.walkTo("nope", "left"), false, "a panel that is not there is not walked to");
  assert.equal(bot.lean("nope", "left"), false, "and it cannot be leaned on");
  bot.destroy();
});

test("lean walks to the panel first, and ponder is a held state", async () => {
  installDom();
  const bot = createCridBot({ root: document.body, step: 12, layers: (name) => (name === "clock" ? PANEL : null) });
  bot.observe({ bot: { on: true } });
  assert.equal(bot.lean("clock", "left"), true);
  assert.equal(bot.leaning, null, "he is not leaning yet: he has to get there first");
  assert.ok(bot.el.classList.contains("roam"), "…by walking");
  assert.equal(bot.ponder(true), true);
  assert.equal(bot.pondering, true);
  bot.ponder(false);
  assert.equal(bot.pondering, false, "the pose is released on request");
  bot.destroy();
});

test("with no registry at all he still runs, and the verbs say no rather than throwing", () => {
  installDom();
  const bot = createCridBot({ root: document.body, step: 12 });
  bot.observe({ bot: { on: true } });
  assert.equal(bot.walkTo("clock", "left"), false);
  assert.equal(bot.lean("clock", "left"), false);
  assert.equal(bot.mode, "on", "an absent registry is not a reason to stop being alive");
  bot.destroy();
});
