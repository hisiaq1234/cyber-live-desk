/* THE LAYER REGISTRY — where the desk's panels actually are.
 *
 * Every surface on this frame has been built ad hoc: #time-dock, #loc-map, #auto-headlines,
 * the card in .slot, #dock-right, #desk-logo, #swae-chat. Nothing published their positions, so
 * every "CRID interacts with an overlay" so far was a hardcoded spot that only looked right on
 * one frame size. This is the one place that answers "where is the clock, right now, in desk
 * coordinates" — for the renderer, for the brain page, and for anything else on the page.
 *
 * What it promises:
 *   - a box in desk coordinates: {x, y, w, h, edge:{left,right,top,bottom}, z};
 *   - a layer that is not on screen is ABSENT (null), never a zero box, so a caller cannot lean
 *     on a panel that was hidden, emptied or never built;
 *   - a name nobody registered is null too, and nothing throws;
 *   - measuring is not free, so it happens once and is then re-used until something that can move
 *     a panel happens: a resize, a layout-mode change, a node added/removed/shown/hidden, or a
 *     panel changing size. Never per animation frame — the dirty flag is only ever set by those.
 *
 * The measurement is a getBoundingClientRect on a live node, so a panel that has been scrolled
 * out of its own column reports where it is painted, which is what a lean has to touch.
 */

// The names the desk answers to, and the selectors that find them. A name may list more than one
// selector: the first one that is on screen wins. `ticker` and `headlines` are the same plate —
// the desk has one lower-third headline ticker — and both names are kept because both are used.
export const LAYER_NAMES = ["card", "clock", "map", "ticker", "dock", "logo", "chat", "headlines", "crid"];

const SURFACES = {
  // The card on air is the slot's child, not the slot: the slot is a scrolling column, and its
  // box reaches further than the card the eye sees.
  card: [".slot > *", ".slot"],
  clock: ["#time-dock"],
  // The map lives in the location dock and is `hidden` until a peek or the full view opens it;
  // a closed dock measures as absent, which is exactly what a lean needs to know.
  map: ["#loc-map"],
  ticker: ["#auto-headlines"],
  headlines: ["#auto-headlines"],
  dock: ["#dock-right"],
  logo: ["#desk-logo"],
  chat: ["#swae-chat"],
  crid: ["#crid-bot"],
};

// The stacking value a node paints at: its own z-index when it has one, otherwise the nearest
// ancestor that does. Approximate by design — it answers "will this paint over him", which is the
// only question anything asks it.
function stackZ(node, view) {
  const gcs = view.getComputedStyle;
  if (typeof gcs !== "function") return 0;
  for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
    const cs = gcs.call(view, n);
    if (!cs) return 0;
    const z = Number(cs.zIndex);
    if (cs.zIndex !== "" && cs.zIndex !== "auto" && Number.isFinite(z)) return z;
    if (cs.position === "fixed") return 0;
  }
  return 0;
}

export function createLayerRegistry({ doc = globalThis.document, win = globalThis } = {}) {
  const cache = new Map();   // name -> box | null, valid until invalidated
  const watched = new Set(); // nodes handed to the ResizeObserver
  let dirty = true;
  let resizes = null;        // the ResizeObserver, replaced on every refresh
  let mutations = null;      // the MutationObserver, created once and never rebuilt
  const listeners = new Set();

  const view = () => doc.defaultView || win;

  function measure(name) {
    const selectors = SURFACES[name];
    if (!selectors) return null;
    for (const selector of selectors) {
      const node = doc.querySelector(selector);
      if (!node) continue;
      const r = node.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) continue;
      const gcs = view().getComputedStyle;
      const cs = typeof gcs === "function" ? gcs.call(view(), node) : null;
      if (cs && (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0)) continue;
      return {
        name, node,
        x: r.left, y: r.top, w: r.width, h: r.height,
        edge: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
        z: stackZ(node, view()),
      };
    }
    return null;
  }

  // Re-measure everything once, then hand each live node to the ResizeObserver so a panel that
  // grows without a DOM mutation (a longer headline, a card reflowing) still invalidates.
  function refresh() {
    dirty = false;
    cache.clear();
    for (const name of LAYER_NAMES) cache.set(name, measure(name));
    if (resizes && resizes.disconnect) resizes.disconnect();
    resizes = null;
    watched.clear();
    const RO = view().ResizeObserver;
    if (typeof RO === "function") {
      const ro = new RO(() => { dirty = true; });
      resizes = ro;
      for (const box of cache.values()) if (box && box.node && !watched.has(box.node)) {
        watched.add(box.node);
        try { ro.observe(box.node); } catch { /* an unobservable node is not a reason to throw */ }
      }
    }
    for (const fn of listeners) { try { fn(); } catch { /* a listener cannot break the registry */ } }
  }

  // Anything that can move a panel sets the flag and nothing else. Several mutations in one frame
  // cost one re-measure, and a frame where nothing changed costs none.
  const invalidate = () => { dirty = true; };

  const layer = (name) => {
    if (typeof name !== "string" || !SURFACES[name]) return null;
    if (dirty) refresh();
    return cache.get(name) || null;
  };

  // A plain-JSON view of the frame, for publishing in desk state and for a console to read.
  const snapshot = () => {
    if (dirty) refresh();
    const out = {};
    for (const [name, box] of cache) {
      out[name] = box
        ? { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h),
            edge: { left: Math.round(box.edge.left), right: Math.round(box.edge.right),
                    top: Math.round(box.edge.top), bottom: Math.round(box.edge.bottom) }, z: box.z }
        : null;
    }
    return out;
  };

  const start = () => {
    if (typeof win.addEventListener === "function") {
      win.addEventListener("resize", invalidate);
      win.addEventListener("orientationchange", invalidate);
    }
    const MO = view().MutationObserver;
    if (typeof MO === "function" && doc.documentElement) {
      // childList: a card or module arriving/leaving. attributes: hidden, class, style — the three
      // ways a surface is shown, hidden, moved or re-laid-out.
      const mo = new MO(invalidate);
      mo.observe(doc.documentElement, {
        subtree: true, childList: true, attributes: true,
        attributeFilter: ["hidden", "class", "style"],
      });
      mutations = mo;
    }
    refresh();
  };

  start();

  return {
    layer,
    snapshot,
    refresh,
    invalidate,
    names: LAYER_NAMES.slice(),
    onChange(fn) { if (typeof fn === "function") { listeners.add(fn); return () => listeners.delete(fn); } return () => {}; },
    destroy() {
      if (mutations && mutations.disconnect) mutations.disconnect();
      if (resizes && resizes.disconnect) resizes.disconnect();
      mutations = null; resizes = null;
      listeners.clear();
      if (typeof win.removeEventListener === "function") {
        win.removeEventListener("resize", invalidate);
        win.removeEventListener("orientationchange", invalidate);
      }
      cache.clear();
      dirty = true;
    },
  };
}
