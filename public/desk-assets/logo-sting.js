/* CYBER LIVE DESK — plays the operator's broadcast sting inside the lockup slot.

   Two jobs, both of which the vector machine in logo.js cannot do:

   1. It plays the supplied animation, so the desk shows the operator's design rather than a
      paraphrase of it.
   2. It crops the canvas to the lockup. The comp is 1920x1080 and the artwork inside it is
      1054x191 (see MOTION_BOX in logo-motion.js, which was measured off rendered pixels). Left
      alone, an SVG renderer letterboxes the 16:9 comp into whatever box it is given, so a 24vw
      element shows a 13vw logo floating in a transparent slab — the miniature. Rewriting the
      root viewBox to the measured box makes the element and the lockup the same rectangle, and
      the width control then means the width of the logo.

   The mark is the only thing that changes between goat and robot. In the animation data the mark
   is one image asset, clipped to the plate by an alpha track matte, so replacing that asset's
   data URL swaps the mascot and leaves the plate, the rim and the handle exactly as authored.

   The robot has to arrive as an image, not as DOM: anything drawn outside the SVG cannot be
   clipped by the matte. So it is serialised with literal colours — an <image> is its own document
   and the page's CSS, and therefore the theme's custom properties, do not reach into it. The
   colours are read from the tokens on the lockup element at the moment the sting is built, which
   keeps the robot on-palette without teaching the animation data about theming.

   If this module fails to load — offline, blocked, a browser that will not run it — the caller
   keeps the vector machine, which always draws the robot. That is a degradation, not a lie: the
   fallback is the same lockup, and the goat only exists inside the operator's own artwork. */

import { LOGO_ANIM, MOTION_BOX, MOTION_REST } from "./logo-motion.js";
import { MARK_GEOMETRY, rr } from "./logo.js";

// Antialiasing at the edge of the ink box would be clipped by a tight crop.
const PAD = 4;

// Pure: the viewBox the root SVG gets, and the ratio the element must keep so the crop is not
// stretched. Exported for the tests, which assert the crop without a browser.
export function stingBox(box = MOTION_BOX, pad = PAD) {
  const x = box.x - pad, y = box.y - pad;
  const width = box.width + pad * 2, height = box.height + pad * 2;
  return { x, y, width, height, viewBox: `${x} ${y} ${width} ${height}` };
}

export const stingAspect = (box = MOTION_BOX, pad = PAD) =>
  (box.width + pad * 2) / (box.height + pad * 2);

// The mark slot is the only image layer; the wordmark is the matted shape layer stacked above it.
// Found structurally rather than by name so a re-export from the animation tool does not silently
// unhook the switch.
export function stingLayers(anim = LOGO_ANIM) {
  const mark = anim.layers.find((l) => l.ty === 2);
  const markAt = anim.layers.indexOf(mark);
  const word = anim.layers.find((l) => l.ty === 4 && l.tt === 1 && anim.layers.indexOf(l) < markAt);
  return { mark, word };
}

// Each mascot colour is a theme token plus the same literal logo.js falls back to, so a page that
// never loaded the theme sheet — and the Node tests, which have no cascade at all — still get the
// on-brand value rather than undefined.
const MARK_COLORS = {
  plate: { token: "--t-logo-plate", fallback: "#161025" },
  shell: { token: "--t-logo-shell", fallback: "#6531F8" },
  screen: { token: "--t-logo-screen", fallback: "#0F0B17" },
  eye: { token: "--t-logo-eye", fallback: "#86F6BC" },
  edge: { token: "--t-logo-edge", fallback: "#3A1D9E" },
  bone: { token: "--t-logo-bone", fallback: "#A98BFF" },
};

export const MARK_DEFAULTS = Object.fromEntries(
  Object.entries(MARK_COLORS).map(([key, { fallback }]) => [key, fallback]));

// The mascot's own geometry, serialised as a standalone 400x400 image. Nothing here is redrawn:
// the path data, the plate, the screen, the ears, the eyes and the LED all come out of
// MARK_GEOMETRY in logo.js, which is the same source the vector machine builds its DOM from.
export function botMarkSvg(colors) {
  const c = { ...MARK_DEFAULTS, ...colors };
  const G = MARK_GEOMETRY;
  const eye = (cx) => `<path transform="translate(${cx} 66)" d="${rr(11, 17, 4)}" fill="${c.eye}" ` +
    `stroke="${c.eye}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  const [earL, earR] = G.ears;
  // The image box is the bust, so the mark lands in the plate at the same size the vector machine
  // draws it. 400 square because that is the slot the animation's own image asset is.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="${G.bust}">` +
    `<rect x="${G.plate.x + G.shadow.dx}" y="${G.plate.y + G.shadow.dy}" width="${G.plate.width}" height="${G.plate.height}" rx="${G.plate.rx}" fill="${c.edge}"/>` +
    `<rect x="${G.plate.x}" y="${G.plate.y}" width="${G.plate.width}" height="${G.plate.height}" rx="${G.plate.rx}" fill="${c.plate}" stroke="${c.shell}" stroke-width="3"/>` +
    `<path d="${G.stem}" stroke="${c.bone}" stroke-width="5" fill="none" stroke-linecap="round"/>` +
    `<circle cx="${G.led.cx}" cy="${G.led.cy}" r="${G.led.r}" fill="${c.eye}" stroke="${c.bone}" stroke-width="2"/>` +
    `<path d="${G.head}" fill="${c.shell}" stroke="${c.bone}" stroke-width="4" stroke-linejoin="round"/>` +
    `<circle cx="${earL.cx}" cy="${earL.cy}" r="${earL.r}" fill="${c.edge}" stroke="${c.bone}" stroke-width="2"/>` +
    `<circle cx="${earR.cx}" cy="${earR.cy}" r="${earR.r}" fill="${c.edge}" stroke="${c.bone}" stroke-width="2"/>` +
    `<rect x="${G.screen.x}" y="${G.screen.y}" width="${G.screen.width}" height="${G.screen.height}" rx="${G.screen.rx}" fill="${c.screen}" stroke="${c.edge}" stroke-width="2"/>` +
    G.eyes.map(eye).join("") +
    `<path d="${G.mouth}" fill="none" stroke="${c.eye}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`;
}

const asDataUrl = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

// ---- the filter that makes the sting belong to the theme ----
//
// The canonical animation paints with four colours and nothing else: pure red 34 times, a dark
// desaturated red 15 times, grey twice and black twice. That is the whole reason it looked like a
// stranger on the desk — the red is baked into layer data, so no CSS could reach it and every
// theme showed the same bar.
//
// A CSS `filter: hue-rotate()` on the rendered SVG would shift the red, but it would shift the
// goat's coat and the robot's palette with it, because the filter cannot see which pixels came
// from where. Rewriting the colour arrays in the animation data can. Same visual result on the
// parts that are meant to be themed, and the artwork stays artwork.
//
// `map` is keyed by the 8-bit triple so it can be built and asserted in Node, without a DOM.
export const MOTION_SOURCE_COLORS = ["255,0,0", "92,57,57", "96,96,96", "0,0,0"];

// Mix toward a second colour by `t`, which is how the dark red under the rim is derived rather
// than hard-coded: it stays the same distance from the accent on a mint theme as on a red one.
export function mixRgb(a, b, t) {
  return a.map((n, i) => Math.round(n + (b[i] - n) * t));
}

export function themeMotion(anim, map) {
  const keyOf = (c) => c.slice(0, 3).map((n) => Math.round(n * 255)).join(",");
  const copy = (c) => {
    const k = keyOf(c);
    if (!Object.hasOwn(map, k) || !MOTION_SOURCE_COLORS.includes(k)) return null;
    const u = map[k].map((n) => n / 255);
    return [u[0], u[1], u[2], c.length === 4 ? c[3] : 1];
  };

  function walk(node) {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if ((k === "c" || k === "sc") && Array.isArray(v?.k)) {
        out[k] = { ...v, k: walkColours(v.k) };
        continue;
      }
      out[k] = walk(v);
    }
    return out;
  }
  // A colour is either a plain [r,g,b,a] or a keyframe list whose `s`/`c`/`e` carry one. The red
  // in this composition is animated, so both forms have to be reached or the rim keeps its colour.
  function walkColours(k) {
    if (typeof k[0] === "number") return copy(k) ?? k;
    return k.map((kf) => {
      if (!kf || typeof kf !== "object") return kf;
      const out = { ...kf };
      for (const p of ["c", "s", "e"]) if (Array.isArray(out[p])) out[p] = copy(out[p]) ?? out[p];
      return out;
    });
  }

  return walk(anim);
}

// The theme's own colours, resolved through the cascade by asking the browser to paint them.
// Reading a custom property directly is not enough: --accent is itself `var(--mint)`, and an
// unregistered custom property hands back the token text rather than the colour.
const resolveColor = (host, token, fallback) => {
  const probe = document.createElement("span");
  probe.style.color = `var(${token}, ${fallback})`;
  probe.style.display = "none";
  host.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  const m = value.match(/(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

const hexTriplet = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Which token each baked colour becomes. The red is the meaning colour, so it takes --accent:
// the default theme's accent is already a red, which is why the sting looks unchanged there, and
// the cyber theme's accent is mint, which is the change the operator asked for.
export function motionPalette(host) {
  const pick = (token, fallback) => resolveColor(host, token, fallback) ?? hexTriplet(fallback);
  const ink = pick("--accent", "#ff453a");
  const plate = pick("--t-logo-plate", MARK_DEFAULTS.plate);
  const edge = pick("--t-logo-edge", MARK_DEFAULTS.edge);
  return {
    "255,0,0": ink,
    "92,57,57": mixRgb(ink, plate, 0.62),
    "96,96,96": edge,
    "0,0,0": plate,
  };
}

// Read the theme's logo colours off the element the sting is being mounted into. Called at build
// time, not at module time, so a theme switch that rebuilds the sting picks up the new palette.
function markColors(host) {
  const out = {};
  for (const [key, { token, fallback }] of Object.entries(MARK_COLORS)) {
    const rgb = resolveColor(host, token, fallback);
    if (rgb) out[key] = `rgb(${rgb.join(",")})`;
  }
  return out;
}

// A copy of the animation with the mark asset replaced. The original data is never mutated: the
// goat stays in the file, so switching back is free and the operator's artwork stays intact.
function withMark(anim, mark, colors) {
  const slot = anim.assets.find((a) => typeof a.p === "string" && a.p.startsWith("data:image"));
  if (mark !== "bot" || !slot) return anim;
  const clone = { ...anim, assets: anim.assets.map((a) => (a === slot ? { ...a, p: asDataUrl(botMarkSvg(colors)) } : a)) };
  return clone;
}

export async function createSting({ host, mark = "goat", visible = null } = {}) {
  // Only the player is fetched lazily; the composition is already a static import, because this
  // whole module is loaded dynamically and only when the sting is actually going to play.
  const { default: lottie } = await import("./lottie_svg.min.js");
  const anim = LOGO_ANIM;
  const { mark: markLayer, word: wordLayer } = stingLayers(anim);

  const stage = document.createElement("div");
  stage.className = "lg-motion";
  stage.setAttribute("aria-hidden", "true");
  host.append(stage);

  let player = null;
  let holding = false;
  const box = stingBox(MOTION_BOX);

  const build = () => {
    stage.replaceChildren();
    // Two passes over the operator's data, both on a copy: the theme filter, then the mark swap.
    // The sting is canonical in structure and themed in colour, which is what "make it fit the
    // room" asks for — the composition is untouched, only the four baked colours and the one image
    // asset are.
    player = lottie.loadAnimation({
      container: stage,
      renderer: "svg",
      loop: false,
      autoplay: false,
      animationData: withMark(themeMotion(anim, motionPalette(host)), mark, markColors(host)),
      rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
    });
    return new Promise((resolve) => {
      player.addEventListener("DOMLoaded", () => {
        // The crop. Without it the comp's 16:9 canvas is the element and the lockup is a fifth of
        // its height, which is what made the last attempt read as a miniature.
        const svg = stage.querySelector("svg");
        if (svg) svg.setAttribute("viewBox", box.viewBox);
        hideLayers();
        player.goToAndStop(MOTION_REST, true);
        resolve();
      });
    });
  };

  // The two parts an operator can switch off. Both are matte consumers, so hiding either leaves
  // the plate and the other part standing; the matte layers themselves are never touched.
  const hideLayers = () => {
    if (!visible) return;
    const ids = new Set(visible);
    if (markLayer) markLayer.hd = !ids.has("mark");
    if (wordLayer) wordLayer.hd = !ids.has("word");
  };

  await build();

  return {
    el: stage,
    get ready() { return !!player; },
    // Rebuild rather than re-point: lottie bakes the asset into an <image> element at load, and a
    // fresh load is the only way to change it that the renderer cannot undo on the next frame.
    async setMark(next) {
      if (next === mark) return;
      mark = next;
      await build();
    },
    // Play the arrival and settle on the rest frame. The sting fades itself out after MOTION_REST,
    // so looping it would blink the channel identity off the overlay every five seconds.
    replay() {
      if (!player || holding) return;
      player.goToAndStop(0, true);
      player.addEventListener("complete", () => {
        player.goToAndStop(MOTION_REST, true);
      }, { once: true });
      player.playSegments([0, MOTION_REST], true);
    },
    setVisible(ids) {
      visible = ids;
      hideLayers();
      if (player) player.destroy();
      build();
    },
    hold(on) {
      holding = !!on;
      if (player) player.goToAndStop(MOTION_REST, true);
    },
    destroy() {
      if (player) player.destroy();
      stage.remove();
    },
  };
}

export const MOTION_MARKS = ["bot", "goat"];
export { MOTION_REST };
