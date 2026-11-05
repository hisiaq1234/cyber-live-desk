/* CYBER LIVE DESK — the desk lockup: the CRID robot, the wordmark, and the rule.

   Why this file exists instead of a Lottie player:

   The supplied animation (logo.json / otolorin_cyber*.json) is a 1920x1080 broadcast lower
   third. Its only colours are #ff0000, #606060 and #000000 — pure red, which cyber-theme.js
   reserves for meaning ("disputed, still owing, offline") and caps at ~2% of a frame. Red
   baked into the animation data cannot be themed, so every theme showed the same red bar.
   Its wordmark is a Lottie text layer pointing at Montserrat-Arabic-Bold, a font lottie-web
   cannot load from a page, so the text never drew — which is why the last attempt stacked a
   DOM wordmark on top of the broken one and squashed the scene into a 5.06:1 strip with
   preserveAspectRatio="none". That is the miniature: a 16:9 comp, forced flat, under a
   second copy of itself.

   So the layers here are first-class and choreographed instead:

     - The mark is the mascot, drawn as vectors from the same geometry as crid-bot.js. It is
       the largest element and it scales with everything else, so there is no miniature.
     - The timeline (LOGO_LAYERS) gives each layer its own window. The gesture layer leaves
       before the rule arrives, so all four are never on screen together.
     - Colour only ever comes from --t-logo-* custom properties. Nothing in this file has a
       hex in it. A theme that sets those five tokens recolours the whole lockup, red included.
     - One font-size on the container is the only scale knob. Nothing is stretched: the SVG
       keeps its own aspect ratio and the text is real text.
     - prefers-reduced-motion, ?swae and ?power=low skip the intro and paint the rest state,
       because Swae snapshots the page at 1/fps and animation there costs frames, not beauty.

   The server drives it through state.logo (see api/_desk-core.mjs), which the overlay hands to
   update(); the keys are on, pos, x, y, width, layers and replay. */

const NS = "http://www.w3.org/2000/svg";

// Where the lockup sits. "custom" takes x/y as percentages of the viewport.
export const LOGO_POSITIONS = ["tl", "tc", "tr", "bl", "bc", "br", "custom"];

// The choreography. `at` is when a layer starts arriving, `inMs` how long the arrival takes,
// `holdMs` how long it sits fully formed (null = forever), `outMs` how long it takes to leave.
// A layer with no hold and no out is a rest layer: once it has arrived it stays.
//
// The shape of this array is the whole answer to "not all at once": `sweep` is the only layer
// that leaves, and it has finished leaving (0 + 260 + 220 + 520 = 1000ms) before `rule` starts
// arriving (1160ms). The most that can ever be visible together is three of the four.
export const LOGO_LAYERS = [
  { id: "sweep", role: "gesture", at: 0, inMs: 260, holdMs: 220, outMs: 520 },
  { id: "mark", role: "rest", at: 240, inMs: 520 },
  { id: "word", role: "rest", at: 620, inMs: 420 },
  { id: "rule", role: "rest", at: 1160, inMs: 340 },
];

// How long the intro takes, so nothing else has to guess it.
export const logoIntroMs = (layers = LOGO_LAYERS) =>
  layers.reduce((end, L) => Math.max(end, L.at + (L.inMs || 0) + (L.holdMs || 0) + (L.outMs || 0)), 0);

// Pure: what every layer is doing at time `t` in the intro. "gone" before it arrives and after
// it has left; "in"/"hold"/"leave" with a 0..1 progress while it is on screen. Testable without
// a browser, which is the point — the timeline is the design.
export function logoFrameAt(t, layers = LOGO_LAYERS) {
  const frame = {};
  for (const L of layers) {
    const arrived = L.at + (L.inMs || 0);
    const held = L.holdMs == null ? Infinity : arrived + L.holdMs;
    const left = L.outMs ? held + L.outMs : Infinity;
    if (t < L.at || t >= left) frame[L.id] = { on: false, phase: "gone", p: 0 };
    else if (t < arrived) frame[L.id] = { on: true, phase: "in", p: (t - L.at) / (L.inMs || 1) };
    else if (t < held) frame[L.id] = { on: true, phase: "hold", p: 1 };
    else frame[L.id] = { on: true, phase: "leave", p: 1 - (t - held) / L.outMs };
  }
  return frame;
}

// The layers that are still on screen once the intro has finished.
export const logoRestLayers = (layers = LOGO_LAYERS) =>
  layers.filter((L) => logoFrameAt(logoIntroMs(layers) + 1, layers)[L.id].on).map((L) => L.id);

// Which layers a caller asked for, in timeline order. Unknown names are dropped rather than
// throwing: the server may learn new layers before a given page build does.
export const selectLayers = (wanted, layers = LOGO_LAYERS) =>
  !wanted ? layers : layers.filter((L) => wanted.includes(L.id));

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  for (const kid of kids) if (kid) node.append(kid);
  return node;
};

// A rounded rect centred on 0,0 — the same construction the mascot uses for its eyes, so the
// logo's eyes are the bot's eyes rather than a drawing of them.
const rr = (w, h, r) => {
  const rad = Math.min(r, h / 2);
  return `M${-w / 2} ${-h / 2 + rad}a${rad} ${rad} 0 0 1 ${rad} ${-rad}h${w - 2 * rad}` +
    `a${rad} ${rad} 0 0 1 ${rad} ${rad}v${h - 2 * rad}a${rad} ${rad} 0 0 1 ${-rad} ${rad}` +
    `h${-(w - 2 * rad)}a${rad} ${rad} 0 0 1 ${-rad} ${-rad}Z`;
};

// Head, ears, screen, antenna and LED are the mascot's own path data and coordinates (see draw()
// in crid-bot.js), cropped to a bust. The bust is cropped to them; the viewBox is what lets the
// mark grow without ever going fuzzy. Everything, including the plate's stroke, fits inside it.
const HEAD_D = "M34 34H104C112 34 116 40 116 48V97C116 104 110 108 102 108H39C29 108 24 103 24 93V50C24 41 28 34 34 34Z";
const BUST = "2 -12 140 140";
const PLATE = { x: 6, y: -8, width: 128, height: 128, rx: 26 };

function drawMark() {
  const eye = (cx) => {
    const path = el("path", { class: "lg-eye", d: rr(11, 17, 4), transform: `translate(${cx} 66)` });
    return path;
  };
  const svg = el("svg", {
    class: "lg-mark-svg", viewBox: BUST, "aria-hidden": "true", focusable: "false",
  });
  // Back to front. The plate and its offset shadow are the first two children because SVG paints
  // in document order: appended last, the plate covered the robot and the mark read as an empty
  // box. The ears come after the head so they sit on it, the way the mascot draws them.
  svg.append(
    el("rect", { class: "lg-plate-shadow", x: PLATE.x + 5, y: PLATE.y + 6, width: PLATE.width, height: PLATE.height, rx: PLATE.rx }),
    el("rect", { class: "lg-plate", ...PLATE }),
    el("g", { class: "lg-antenna" },
      el("path", { class: "lg-stem", d: "M97 38L104 14" }),
      el("circle", { class: "lg-led", cx: 104, cy: 9, r: 6 })),
    el("path", { class: "lg-head", d: HEAD_D }),
    el("circle", { class: "lg-ear", cx: 24, cy: 71, r: 6 }),
    el("circle", { class: "lg-ear", cx: 116, cy: 71, r: 6 }),
    el("rect", { class: "lg-screen", x: 34, y: 47, width: 72, height: 46, rx: 11 }),
    el("g", { class: "lg-eyes" }, eye(57), eye(89)),
    el("path", { class: "lg-mouth", d: "M63 84Q73 92 83 84" }),
  );
  return { svg, eyes: svg.querySelectorAll(".lg-eye"), led: svg.querySelector(".lg-led") };
}

const CSS = `
/* Colours are tokens all the way down, and the chains are resolved on the lockup itself, so each
   one reads the palette the current theme put on #desk. A theme that wants a logo colour of its
   own out-specifies this with html[data-theme=…] #desk-logo — which is exactly what cyber-theme.js
   does below. Nothing here carries a literal red: the export this replaced had pure red inside its
   own layer data, where no CSS could reach it, and that is why every theme showed the same bar. */
#desk-logo{
  --t-logo-shell:var(--indigo-500,#6531F8);
  --t-logo-plate:var(--onyx-900,#161025);
  --t-logo-screen:var(--onyx-950,#0F0B17);
  --t-logo-eye:var(--mint,#86F6BC);
  --t-logo-1:var(--ink-1,#F4F0FF);
  --t-logo-2:var(--mint,#86F6BC);
  --t-logo-rule:var(--indigo-500,#6531F8);
  --t-logo-gesture:var(--indigo-300,#A98BFF);
  --t-logo-edge:var(--indigo-700,#3A1D9E);
  /* The mascot's own sticker outline colour. Every line on the robot is bone, not off-white, so
     the mark reads as the same drawing as the bot in the corner rather than a relative of it. */
  --t-logo-bone:var(--indigo-300,#A98BFF);
  --logo-w:clamp(9rem,22vw,26rem);
  position:fixed;z-index:26;pointer-events:none;user-select:none;
  /* One font-size scales the whole lockup: the mark is sized in em, the text is text. */
  font-size:calc(var(--logo-w)/12);
  display:flex;align-items:center;gap:.5em;line-height:1;
  left:var(--m,16px);top:calc(var(--m,16px) + env(safe-area-inset-top,0px));
  opacity:1;transition:opacity .35s ease}
#desk-logo[hidden]{opacity:0}
#desk-logo.pos-tc{left:50%;top:calc(var(--m,16px) + env(safe-area-inset-top,0px));transform:translateX(-50%)}
#desk-logo.pos-tr{left:auto;right:calc(var(--m,16px) + env(safe-area-inset-right,0px))}
#desk-logo.pos-bl{top:auto;bottom:calc(var(--m,16px) + env(safe-area-inset-bottom,0px))}
#desk-logo.pos-bc{top:auto;bottom:calc(var(--m,16px) + env(safe-area-inset-bottom,0px));left:50%;transform:translateX(-50%)}
#desk-logo.pos-br{top:auto;left:auto;right:calc(var(--m,16px) + env(safe-area-inset-right,0px));bottom:calc(var(--m,16px) + env(safe-area-inset-bottom,0px))}
#desk-logo.pos-custom{left:var(--lx);top:var(--ly);transform:none}

#desk-logo .lg-body{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;
  column-gap:.55em;row-gap:.18em;align-items:center}
#desk-logo .lg-mark{grid-column:1;grid-row:1/3;width:4.6em;height:4.6em}
#desk-logo .lg-word{grid-column:2;grid-row:1;display:flex;align-items:baseline}
#desk-logo .lg-rule{grid-column:2;grid-row:2;height:.16em;width:100%}

/* ---- the mark ---- */
#desk-logo .lg-mark-svg{width:100%;height:100%;display:block;overflow:visible}
#desk-logo .lg-plate{fill:var(--t-logo-plate);stroke:var(--t-logo-shell);stroke-width:3}
#desk-logo .lg-plate-shadow{fill:var(--t-logo-edge)}
#desk-logo .lg-head{fill:var(--t-logo-shell);stroke:var(--t-logo-bone);stroke-width:4;stroke-linejoin:round}
#desk-logo .lg-ear{fill:var(--t-logo-edge);stroke:var(--t-logo-bone);stroke-width:2}
#desk-logo .lg-screen{fill:var(--t-logo-screen);stroke:var(--t-logo-edge);stroke-width:2}
#desk-logo .lg-eye{fill:var(--t-logo-eye);stroke:var(--t-logo-eye);stroke-width:2;
  stroke-linecap:round;stroke-linejoin:round}
#desk-logo .lg-mouth{fill:none;stroke:var(--t-logo-eye);stroke-width:4;
  stroke-linecap:round;stroke-linejoin:round}
#desk-logo .lg-eyes{transition:none}
#desk-logo .lg-antenna{transform-origin:97px 38px}
#desk-logo .lg-stem{stroke:var(--t-logo-bone);stroke-width:5;fill:none;stroke-linecap:round}
#desk-logo .lg-led{fill:var(--t-logo-eye);stroke:var(--t-logo-bone);stroke-width:2}

/* ---- the wordmark ---- */
#desk-logo .lg-word{font-family:var(--display,Anton,"Arial Narrow",Impact,sans-serif);
  font-weight:400;font-size:2.5em;letter-spacing:.02em;text-transform:uppercase;
  white-space:nowrap;color:var(--t-logo-1);
  /* This overlay is transparent, so the wordmark has to survive a bright camera plate as well as
     onyx, and the desk rules out the blur a text-shadow would need. A hard sticker rim in the
     theme's structure colour is the mascot's own language: the off-white fill carries it on dark,
     the rim carries it on light. */
  -webkit-text-stroke:.035em var(--t-logo-edge);paint-order:stroke fill}
#desk-logo .lg-word .lg-letter{display:inline-block;will-change:transform,opacity}
#desk-logo .lg-tail{color:var(--t-logo-2)}
#desk-logo .lg-rule{background:var(--t-logo-rule);border-radius:99px;transform-origin:left center}

/* ---- the gesture: the only layer that leaves ---- */
/* A hard-edged slab, not a soft one: cyber-theme.js rules out blur and gradients because the desk
   is a sticker drawing and Swae has to snapshot it cheaply. It sits behind the body in document
   order, so it reads as the lockup's own material sliding out from underneath it. */
#desk-logo .lg-sweep{position:absolute;inset:-.35em -.6em;overflow:hidden;pointer-events:none;
  border-radius:.5em}
#desk-logo .lg-sweep i{position:absolute;top:0;bottom:0;width:30%;
  background:var(--t-logo-gesture);
  transform:skewX(-18deg) translateX(-140%);opacity:0}

/* Static rest state: no intro, no idle. Swae snapshots this page at 1/fps and low power asks
   for the cheapest drawing, so animation here is switched off rather than slowed down. */
html.swae #desk-logo .lg-sweep,html.low-power #desk-logo .lg-sweep{display:none}
html.swae #desk-logo .lg-word .lg-letter,html.low-power #desk-logo .lg-word .lg-letter{opacity:1!important;transform:none!important}
@media (prefers-reduced-motion:reduce){#desk-logo .lg-sweep{display:none}}
`;

export function createLogo({
  root = document.body,
  position = "tl",
  width = 22, // vw, the unit the control panel already moves a slider in
  reduced = false,
  on = true,
  layers = null,
  x = null,
  y = null,
  word = "OTOLORIN",
  tail = "_CYBER",
  idle = true,
} = {}) {
  if (!document.getElementById("desk-logo-css")) {
    const style = document.createElement("style");
    style.id = "desk-logo-css";
    style.textContent = CSS;
    document.head.append(style);
  }

  const host = document.createElement("div");
  host.id = "desk-logo";
  host.setAttribute("aria-label", "Channel logo");
  host.dataset.pos = LOGO_POSITIONS.includes(position) ? position : "tl";

  const body = document.createElement("div");
  body.className = "lg-body";
  const sweep = document.createElement("div");
  sweep.className = "lg-sweep";
  const sweepBar = document.createElement("i");
  sweep.append(sweepBar);
  const markWrap = document.createElement("div");
  markWrap.className = "lg-layer lg-mark";
  markWrap.dataset.layer = "mark";
  const { svg, eyes, led } = drawMark();
  markWrap.append(svg);

  const wordEl = document.createElement("div");
  wordEl.className = "lg-layer lg-word";
  wordEl.dataset.layer = "word";
  for (const ch of String(word)) {
    const s = document.createElement("span");
    s.className = "lg-letter";
    s.textContent = ch;
    wordEl.append(s);
  }
  const tailEl = document.createElement("span");
  tailEl.className = "lg-letter lg-tail";
  tailEl.textContent = String(tail);
  wordEl.append(tailEl);

  const rule = document.createElement("div");
  rule.className = "lg-layer lg-rule";
  rule.dataset.layer = "rule";

  body.append(markWrap, wordEl, rule);
  host.append(sweep, body);
  root.append(host);

  const animate = typeof host.animate === "function";
  const still = reduced || !animate ||
    document.documentElement.classList.contains("swae") ||
    document.documentElement.classList.contains("low-power") ||
    (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);

  let timeline = [];
  let playing = [];
  let blinkTimer = null;
  let visible = !!on;

  const stopAll = () => {
    for (const a of playing) { try { a.cancel(); } catch { /* already finished */ } }
    playing = [];
  };

  // The keyframes below read their delay and duration out of LOGO_LAYERS. The timeline is the
  // design and the tests assert against it, so the browser must not keep a second copy that can
  // drift. Nothing here stretches anything: the mark scales uniformly, the letters translate, and
  // the rule grows along the one axis it was built to grow along.
  const nodeFor = { mark: markWrap, word: wordEl, rule, sweep };

  const runLayer = (L) => {
    const total = (L.inMs || 0) + (L.holdMs || 0) + (L.outMs || 0);
    if (L.id === "sweep") {
      const rise = (L.inMs || 0) / total;
      const fall = 1 - (L.outMs || 0) / total;
      return [sweepBar.animate(
        [{ transform: "skewX(-18deg) translateX(-140%)", opacity: 0 },
          { transform: "skewX(-18deg) translateX(0)", opacity: 1, offset: rise },
          { transform: "skewX(-18deg) translateX(0)", opacity: 1, offset: fall },
          { transform: "skewX(-18deg) translateX(140%)", opacity: 0 }],
        { duration: total, delay: L.at, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" })];
    }
    if (L.id === "word") {
      // Letters stagger across the layer's own window: the wordmark arrives, it does not appear.
      const step = Math.min(46, (L.inMs || 1) / Math.max(1, wordEl.children.length));
      return [...wordEl.children].map((s, i) => s.animate(
        [{ transform: "translateY(.5em) scale(.86)", opacity: 0 },
          { transform: "translateY(0) scale(1)", opacity: 1 }],
        { duration: step * 6, delay: L.at + i * step, easing: "cubic-bezier(.22,1,.36,1)", fill: "both" }));
    }
    const pop = L.id === "mark";
    return [nodeFor[L.id].animate(
      pop
        ? [{ transform: "scale(.2) rotate(-14deg)", opacity: 0 },
            { transform: "scale(1.14) rotate(4deg)", opacity: 1, offset: 0.62 },
            { transform: "scale(1) rotate(0deg)", opacity: 1 }]
        : [{ transform: "scaleX(0)", opacity: 0 }, { transform: "scaleX(1)", opacity: 1 }],
      { duration: L.inMs, delay: L.at, easing: pop ? "cubic-bezier(.34,1.56,.64,1)" : "cubic-bezier(.22,1,.36,1)", fill: "both" })];
  };

  // Show the end of the timeline and stop. The rest state is part of the design, so a snapshot
  // renderer or a reduced-motion viewer gets the same lockup, only without the arrival.
  const paintRest = (wanted) => {
    sweep.style.display = "none"; // a gesture that never leaves is scenery, and scenery is the complaint
    for (const [id, node] of Object.entries(nodeFor)) {
      if (id === "sweep") continue;
      node.style.opacity = wanted.has(id) ? "" : "0";
      node.style.transform = "none";
    }
    for (const s of wordEl.children) { s.style.opacity = "1"; s.style.transform = "none"; }
  };

  const play = (defs) => {
    stopAll();
    const chosen = defs || timeline;
    const wanted = new Set(chosen.map((L) => L.id));
    host.hidden = false;
    if (still) {
      paintRest(wanted);
      return;
    }
    sweep.style.display = wanted.has("sweep") ? "" : "none";
    for (const [id, node] of Object.entries(nodeFor)) { node.style.opacity = ""; node.style.transform = ""; }
    for (const s of wordEl.children) { s.style.opacity = ""; s.style.transform = ""; }
    for (const L of chosen) playing.push(...runLayer(L));
    // A layer the operator switched off stays off instead of being left half-drawn by fill:"both".
    for (const [id, node] of Object.entries(nodeFor)) if (!wanted.has(id) && id !== "sweep") node.style.opacity = "0";
  };

  // The robot is alive: it blinks, and the LED carries the same mint the desk uses for "look here".
  // Only when the page is being animated for a human, never for a snapshot.
  const startIdle = () => {
    if (still || !idle || blinkTimer) return;
    blinkTimer = setInterval(() => {
      if (document.hidden) return;
      for (const e of eyes) e.setAttribute("d", rr(11, 4, 2));
      led.setAttribute("r", "4.5");
      setTimeout(() => {
        for (const e of eyes) e.setAttribute("d", rr(11, 17, 4));
        led.setAttribute("r", "6");
      }, 130);
    }, 5200);
  };

  const setWidth = (vw) => {
    // The slider speaks vw, the lockup speaks one font-size; this is the only translation.
    host.style.setProperty("--logo-w", `clamp(6rem,${clamp(Number(vw) || 22, 6, 46)}vw,34rem)`);
  };

  const setPos = (next) => {
    const pos = LOGO_POSITIONS.includes(next) ? next : "tl";
    host.dataset.pos = pos;
    host.className = `pos-${pos}`;
    if (pos === "custom" && x != null && y != null) {
      host.style.setProperty("--lx", `${clamp(x, 0, 100)}%`);
      host.style.setProperty("--ly", `${clamp(y, 0, 100)}%`);
    }
  };

  setPos(position);
  setWidth(width);
  if (x != null && y != null && position === "custom") setPos("custom");

  timeline = selectLayers(layers, LOGO_LAYERS);
  visible = !!on;
  host.hidden = !visible;
  play(timeline);
  startIdle();

  let lastReplay = 0;

  return {
    el: host,
    // The contract the overlay hands state.logo to. Unknown keys are ignored, not fatal.
    update(next = {}) {
      if (!next) return;
      if (next.pos != null || next.x != null || next.y != null) {
        if (next.x != null) x = next.x;
        if (next.y != null) y = next.y;
        setPos(next.pos != null ? next.pos : (next.x != null && next.y != null ? "custom" : host.dataset.pos));
      }
      if (next.width != null) setWidth(next.width);
      if (next.layers !== undefined) {
        const defs = selectLayers(next.layers && next.layers.length ? next.layers : null, LOGO_LAYERS);
        // render() hands us the whole state.logo on every poll, so only a real change replays the
        // intro. Without this the lockup re-arrives three times a second.
        const same = defs.length === timeline.length && defs.every((L, i) => L.id === timeline[i].id);
        if (!same) {
          timeline = defs;
          play(timeline);
        }
      }
      if (next.on != null && !!next.on !== visible) {
        visible = !!next.on;
        host.hidden = !visible;
        if (visible) play(timeline);
      }
      // A counter, not a boolean: the same replay can be asked for twice in a row.
      if (next.replay != null && next.replay !== lastReplay) {
        lastReplay = next.replay;
        if (visible) play(timeline);
      }
    },
    replay: () => play(timeline),
    get layers() { return timeline.map((L) => L.id); },
    get still() { return still; },
    destroy() {
      clearInterval(blinkTimer);
      blinkTimer = null;
      stopAll();
      host.remove();
    },
  };
}

export const LOGO_LAYER_IDS = LOGO_LAYERS.map((L) => L.id);
