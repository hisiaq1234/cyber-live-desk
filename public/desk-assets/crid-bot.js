/* CRID — the desk's mascot bot ("Cyber's Rent Is Due").
   Replaces the decorative sound orb. Self-contained: draws itself, injects its own CSS, no deps.

   How it animates (and why it does not look like a default web animation):
   Swae takes a snapshot of this page about 5 times a second and the overlay switches CSS
   transitions and animations off there, so anything tweened gets caught half-drawn. CRID is
   therefore animated like a limited-animation cartoon: discrete poses, each held for one
   "step" (220 ms on Swae, shorter elsewhere), driven by one JS timer. Every pose is a complete,
   deliberate drawing, so a snapshot can never catch a smeared in-between.

   API
     const bot = createCridBot({ root, swae, lowPower, position, x, y, step });
     bot.el                     the element (give it to createSoundOrbSync: "is-active" = talking,
                                "music-playing" = grooving)
     bot.summon(el)             push a module out of the bot into its place (queued, one at a time)
     bot.dismiss(el, done)      pull a module back into the bot, then call done()
     bot.cancel(el)             drop any pending or running animation for el and restore it
     bot.react(kind)            cheer | wince | think | surprise | paid | due | nod | shrug | wave
     bot.observe(state)         derive reactions, tag text and dozing from the desk state, and follow
                                the operator's state.bot (on/off, and react { kind, n })
     bot.setOnline(bool)        false = CRID dies (offline), true = CRID boots up
     bot.setMode("on"|"doze"|"dead")
     bot.freeze(pose)           draw one pose and stop the loop (for design review)
     bot.destroy()                                                                            */

const NS = "http://www.w3.org/2000/svg";
// The cyber theme's 60/30/10, so CRID reads as part of the desk rather than beside it: onyx body,
// indigo structure, mint for anything live. The sticker outline is a tint of the indigo instead of
// a fourth hue, which is what kept the old bone outline looking like a different design system.
// Red is not decoration here either. It survives only on the DUE ticket, which is the "still owing"
// meaning the theme reserves it for, and stays well under the 2% the theme allows it.
const PAL = {
  onyx: "#1F1736",     // --onyx-800, one step above the panel body so the silhouette separates
  screen: "#0F0B17",   // --onyx-950, the face is the darkest thing on the panel
  edge: "#3A1D9E",     // --indigo-700, screen bezel
  indigo: "#6531F8",   // --indigo-500
  indigoDk: "#3A1D9E", // --indigo-700
  mint: "#86F6BC",     // --mint, eyes, mouth and the live LED
  bone: "#A98BFF",     // --indigo-300, every sticker outline
  ink: "#F4F0FF",      // --ink-1, the glint on the screen
  red: "#FF5B57",      // --danger, the DUE ticket only
  dead: "#5E5873",     // off-air grey, still inside the indigo family
};
const DOZE_AFTER_MS = 120_000;

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids) if (k) e.append(k);
  return e;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// rounded rectangle centred on (0,0); dy shifts it (used for half-lidded eyes)
const rr = (w, h, r, dy = 0) => {
  r = Math.min(r, h / 2, w / 2);
  return `M${-w / 2} ${-h / 2 + dy + r}a${r} ${r} 0 0 1 ${r} ${-r}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}` +
    `v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}Z`;
};

// ---------- the drawings ----------
// Each eye pose is one finished drawing. side: -1 = left eye, +1 = right eye.
const EYES = {
  open: () => ({ d: rr(11, 17, 4), fill: 1 }),
  half: () => ({ d: rr(11, 9, 3, 3), fill: 1 }),
  closed: () => ({ d: rr(12, 3, 1.5, 5), fill: 1 }),
  wide: () => ({ d: rr(13, 21, 5), fill: 1 }),
  spark: () => ({ d: rr(4, 4, 2), fill: 1 }),
  dim: () => ({ d: rr(10, 2, 1, 4), fill: 1 }),
  happy: () => ({ d: "M-7 4Q0 -9 7 4", fill: 0, w: 4 }),
  sleep: () => ({ d: "M-7 0Q0 7 7 0", fill: 0, w: 3.5 }),
  x: () => ({ d: "M-6 -6L6 6M6 -6L-6 6", fill: 0, w: 4 }),
  mad: (s) => {
    const m = (x) => (s < 0 ? x : -x);
    return { d: `M${m(-7)} -9L${m(7)} -3L${m(7)} 8L${m(-7)} 8Z`, fill: 1 };
  },
  wince: (s) => {
    const m = (x) => (s < 0 ? x : -x);
    return { d: `M${m(-5)} -7L${m(5)} 0L${m(-5)} 7`, fill: 0, w: 4 };
  },
};
const MOUTHS = {
  flat: { d: "M-6 0H6", fill: 0, w: 3 },
  smile: { d: "M-8 -1Q0 7 8 -1", fill: 0, w: 3 },
  grin: { d: "M-9 -2H9Q9 8 0 8Q-9 8 -9 -2Z", fill: 1, w: 1.5 },
  o: { d: "M-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0Z", fill: 1, w: 1 },
  t1: { d: rr(12, 3, 1.5), fill: 1, w: 1 },
  t2: { d: rr(12, 7, 3), fill: 1, w: 1 },
  t3: { d: rr(12, 11, 4), fill: 1, w: 1 },
  wavy: { d: "M-9 0q3 -4 6 0t6 0t6 0", fill: 0, w: 3 },
  dead: { d: "M-6 0H6", fill: 0, w: 3 },
};
const TALK = ["t2", "t1", "t3", "t1", "t2", "flat"];
// mitts are hands that float beside the shoulders; side: -1 left, +1 right
const MITTS = {
  down: (s) => ({ y: 0, r: 0 }),
  up: (s) => ({ y: -26, r: -12 * s * -1 }),
  push: (s) => ({ y: -18, r: 8 * s }),
  wave: (s) => ({ y: -22, r: 26 * s }),
  slam: (s) => ({ y: -4, r: 0 }),
  limp: (s) => ({ y: 12, r: -6 * s }),
};

const REST = {
  on: { eyes: "open", gx: 0, gy: 0, mouth: "flat", hr: 0, hy: 0, by: 0, bs: 1, mL: "down", mR: "down", led: "on", tr: 0 },
  doze: { eyes: "sleep", gx: 0, gy: 0, mouth: "flat", hr: 3, hy: 3, by: 2, bs: 1, mL: "limp", mR: "limp", led: "dim", tr: 0 },
  dead: { eyes: "x", gx: 0, gy: 0, mouth: "dead", hr: -9, hy: 16, by: 26, bs: 0.94, mL: "limp", mR: "limp", led: "off", tr: 0 },
};

// ---------- sequences (arrays of frames; each frame is held for one step) ----------
const SEQ = {
  blink: [{ eyes: "half" }, { eyes: "closed" }, { eyes: "closed" }],
  doubleBlink: [{ eyes: "half" }, { eyes: "closed" }, { eyes: "open" }, { eyes: "half" }, { eyes: "closed" }],
  glanceL: [{ gx: -4 }, { gx: -4 }, { gx: -4, hr: -2 }],
  glanceR: [{ gx: 4 }, { gx: 4 }, { gx: 4, hr: 2 }],
  lookUp: [{ gy: -4, hr: 3 }, { gy: -4, hr: 3 }, { gy: -3 }],
  sway: [{ tr: 7 }, { tr: -6 }, { tr: 3 }],
  ledBlink: [{ led: "dim" }, { led: "on" }],
  shrug: [{ hy: -2, by: -2 }, { hy: -2, by: -2, mL: "wave", mR: "wave" }],
  wake: [
    { led: "on", eyes: "dim" }, { led: "off", eyes: "spark" }, { led: "on", eyes: "dim", hy: 10, by: 14, hr: -6 },
    { eyes: "half", hy: 6, by: 6, hr: -4, bs: 0.97 }, { eyes: "wide", mouth: "o", hy: -3, by: -2, hr: 4, tr: 9, bs: 1.03 },
    { eyes: "open", mouth: "smile", hy: 0, by: 0, hr: -2, tr: -6, bs: 1 }, { hr: 0, tr: 3 },
  ],
  die: [
    { eyes: "wide", mouth: "o", hy: -3, tr: 10 }, { eyes: "wince", mouth: "wavy", hy: 2, hr: -4, bs: 0.97, led: "dim" },
    { eyes: "x", mouth: "dead", hy: 10, hr: -8, by: 14, bs: 0.95, led: "off", mL: "limp", mR: "limp" },
  ],
  cheer: [
    { eyes: "happy", mouth: "grin", mL: "up", mR: "up", by: -3 }, { by: 0, hr: -4, tr: 8 },
    { by: -3, hr: 4, tr: -8, mL: "wave" }, { by: 0, hr: -4, mR: "wave", tr: 8 },
    { by: -3, hr: 0, mL: "up", mR: "up", tr: 0 }, { eyes: "happy", mouth: "smile", mL: "down", mR: "down", by: 0 },
  ],
  wince: [
    { eyes: "wince", mouth: "wavy", hr: -6, hy: -2, bs: 0.95 }, { hr: -8, tr: 12 },
    { hr: -6, tr: -6 }, { eyes: "half", mouth: "flat", hr: -3, tr: 0 },
  ],
  think: [
    { gx: 4, gy: -4, hr: 5 }, { gx: 4, gy: -4, hr: 5, tr: 10 }, { gx: -3, gy: -5, hr: 4, tr: -8 },
    { gx: 4, gy: -4, hr: 6 }, { gx: 0, gy: 0, hr: 0, tr: 0 },
  ],
  surprise: [
    { eyes: "wide", mouth: "o", hy: -4, tr: 14, by: -4 }, { eyes: "wide", mouth: "o", hy: -2, tr: -10 },
    { eyes: "open", mouth: "flat", hy: 0, tr: 0, by: 0 },
  ],
  paid: [
    { eyes: "half", hy: -6, hr: -6, mR: "up" }, { eyes: "happy", hy: 8, mR: "slam", tag: "PAID", tr: 16 },
    { hy: 6, mR: "slam" }, { hy: 0, mR: "down", mouth: "grin" }, { mouth: "smile", tr: 0 },
  ],
  due: [
    { eyes: "mad", hy: -4, mR: "up" }, { eyes: "mad", hy: 8, mR: "slam", tag: "DUE", tr: -16 },
    { hy: 6, mR: "slam" }, { hy: 0, mR: "down" }, { eyes: "open", tr: 0 },
  ],
  nod: [{ hy: 5, hr: 2 }, { hy: 0, hr: 0 }],
  // Only ever fired by the operator. It is a greeting rather than a reaction to the desk, so it
  // gets its own sequence instead of being folded into anything observe() derives.
  wave: [
    { eyes: "happy", mouth: "smile", mR: "up", hy: -2, hr: 3 },
    { mR: "wave", hr: 4 }, { mR: "up", hr: -3 }, { mR: "wave", hr: 4 }, { mR: "up", hr: -3 },
    { eyes: "happy", mouth: "grin", mR: "up", hr: 0 },
    { mR: "down", eyes: "open", mouth: "smile", hy: 0, hr: 0 },
  ],
};

// ---------- the character ----------
function draw(uid) {
  const sticker = { fill: PAL.bone, stroke: PAL.bone, "stroke-width": 9, "stroke-linejoin": "round", "stroke-linecap": "round" };
  const both = (d, fill, extra = {}) => [el("path", { d, ...sticker, ...extra }), el("path", { d, fill, ...extra })];

  const headD = "M34 34H104C112 34 116 40 116 48V97C116 104 110 108 102 108H39C29 108 24 103 24 93V50C24 41 28 34 34 34Z";
  const bodyD = "M20 160C20 128 40 112 70 112C100 112 120 128 120 160Z";
  const mittD = "M-11 2C-11 -8 -3 -11 3 -10C10 -9 12 -2 11 4C10 10 0 12 -6 10C-10 9 -11 6 -11 2Z";

  const svg = el("svg", { viewBox: "-6 -4 160 168", "aria-hidden": "true", focusable: "false" });

  // antenna + LED + paper ticket, hanging behind the head
  const tagG = el("g", { class: "tag" });
  const led = el("circle", { cx: 104, cy: 9, r: 5.5, fill: PAL.mint, stroke: PAL.bone, "stroke-width": 2.5 });
  const ledGlint = el("circle", { cx: 102, cy: 7, r: 1.4, fill: PAL.bone });
  const ticket = el("g", { class: "ticket" });
  const ticketBody = [
    el("path", { d: "M104 20H136V37H104Z", ...sticker, "stroke-width": 6 }),
    el("path", { d: "M104 20H136V37H104Z", fill: PAL.red, class: "ticket-fill" }),
    el("circle", { cx: 109.5, cy: 25, r: 1.7, fill: PAL.onyx }),
  ];
  const ticketText = el("text", { x: 122, y: 33.2, "text-anchor": "middle", "font-size": 10.5, "font-weight": 800, "letter-spacing": 0.6, fill: PAL.onyx, "font-family": "ui-monospace,'SF Mono','JetBrains Mono',Menlo,Consolas,monospace" });
  ticketText.textContent = "DUE";
  ticket.append(el("path", { d: "M104 14L108 21", stroke: PAL.bone, "stroke-width": 3, fill: "none", "stroke-linecap": "round" }), ...ticketBody, ticketText);
  tagG.append(
    el("path", { d: "M97 38L104 14", stroke: PAL.bone, "stroke-width": 9, fill: "none", "stroke-linecap": "round" }),
    el("path", { d: "M97 38L104 14", stroke: PAL.indigoDk, "stroke-width": 4, fill: "none", "stroke-linecap": "round" }),
    el("circle", { cx: 104, cy: 9, r: 9, fill: PAL.bone }), led, ledGlint, ticket,
  );

  // body, with a ledger slot on the chest
  const bodyG = el("g", { class: "body" });
  const neck = [el("rect", { x: 58, y: 100, width: 24, height: 16, rx: 3, fill: PAL.indigoDk, stroke: PAL.bone, "stroke-width": 3 })];
  const bodyShapes = both(bodyD, PAL.onyx);
  const chest = [
    el("rect", { x: 46, y: 128, width: 48, height: 22, rx: 6, fill: PAL.indigo }),
    el("rect", { x: 53, y: 135, width: 34, height: 6, rx: 3, fill: PAL.onyx }),
    el("path", { d: "M58 138H82", stroke: PAL.bone, "stroke-width": 1.6, "stroke-dasharray": "5 3", fill: "none" }),
  ];

  // head: indigo rim catches the light top-left, onyx face slides over it (hard edge, no gradient)
  const headG = el("g", { class: "head" });
  const clip = el("clipPath", { id: `hc-${uid}` }, el("path", { d: headD }));
  const headShapes = [
    el("path", { d: headD, ...sticker }),
    el("path", { d: headD, fill: PAL.indigo }),
    el("g", { "clip-path": `url(#hc-${uid})` }, el("path", { d: headD, fill: PAL.onyx, transform: "translate(4 5)" })),
    el("circle", { cx: 24, cy: 71, r: 4.5, fill: PAL.indigoDk, stroke: PAL.bone, "stroke-width": 2 }),
    el("circle", { cx: 116, cy: 71, r: 4.5, fill: PAL.indigoDk, stroke: PAL.bone, "stroke-width": 2 }),
  ];
  const screen = [
    el("rect", { x: 34, y: 47, width: 72, height: 46, rx: 11, fill: PAL.screen, stroke: PAL.edge, "stroke-width": 2 }),
    el("path", { d: "M40 51H60L51 63H40Z", fill: PAL.ink, opacity: 0.08 }),
  ];
  const eyeL = el("path", { class: "eye", "stroke-linejoin": "round", "stroke-linecap": "round" });
  const eyeR = el("path", { class: "eye", "stroke-linejoin": "round", "stroke-linecap": "round" });
  const eyesG = el("g", { class: "eyes" },
    el("g", { transform: "translate(57 66)" }, eyeL), el("g", { transform: "translate(89 66)" }, eyeR));
  const mouth = el("path", { class: "mouth", "stroke-linejoin": "round", "stroke-linecap": "round" });
  const mouthG = el("g", { transform: "translate(73 84)" }, mouth);
  const faceG = el("g", { class: "face" }, eyesG, mouthG);
  headG.append(clip, ...headShapes, ...screen, faceG);

  // mitts
  const mittL = el("g", { class: "mittL" });
  const mittR = el("g", { class: "mittR" });
  for (const m of [mittL, mittR]) {
    m.append(el("path", { d: mittD, ...sticker, "stroke-width": 7 }), el("path", { d: mittD, fill: PAL.onyx }),
      el("path", { d: "M-5 -3Q0 -7 5 -3", stroke: PAL.indigo, "stroke-width": 2.4, fill: "none", "stroke-linecap": "round" }));
  }

  bodyG.append(...bodyShapes, ...neck, ...chest, headG, mittL, mittR);
  svg.append(tagG, bodyG);
  return { svg, parts: { tagG, ticket, ticketText, ticketFill: ticketBody[1], led, bodyG, headG, eyeL, eyeR, eyesG, mouth, mouthG, mittL, mittR } };
}

const CSS = `
#crid-bot{--bw:clamp(60px,9vmin,120px);position:fixed;z-index:27;width:var(--bw);aspect-ratio:160/168;pointer-events:none;
  left:50%;margin-left:calc(var(--bw)/-2);bottom:calc(var(--m,16px) + env(safe-area-inset-bottom,0px))}
#crid-bot.pos-bl{left:calc(var(--m,16px) + 12em);margin-left:0}
#crid-bot.pos-br{left:auto;margin-left:0;right:calc(var(--m,16px) + var(--identity-w,24em) + .6em)}
#crid-bot.pos-custom{left:var(--bx);top:var(--by);bottom:auto;right:auto;margin-left:calc(var(--bw)/-2)}
#crid-bot svg{width:100%;height:100%;display:block;overflow:visible;filter:drop-shadow(3px 4px 0 ${PAL.indigoDk})}
html.low-power #crid-bot svg,html.swae #crid-bot svg{filter:none}
#crid-bot .eye,#crid-bot .mouth{transition:none}
#crid-bot[data-mode="dead"] .eye,#crid-bot[data-mode="dead"] .mouth{stroke:${PAL.dead}!important;fill:${PAL.dead}}
#crid-bot[data-mode="dead"] .ticket-fill{fill:${PAL.dead}}
`;

export function createCridBot({
  root = document.body, swae = false, lowPower = false, position = "bc", x = null, y = null, step = null,
} = {}) {
  if (!document.getElementById("crid-bot-css")) {
    const st = document.createElement("style");
    st.id = "crid-bot-css";
    st.textContent = CSS;
    document.head.append(st);
  }
  const STEP = step ?? (swae ? 220 : lowPower ? 260 : 140);
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const uid = Math.random().toString(36).slice(2, 8);
  const { svg, parts } = draw(uid);
  const host = document.createElement("div");
  host.id = "crid-bot";
  host.setAttribute("aria-hidden", "true");
  host.dataset.mode = "dead";
  if (x != null && y != null) {
    host.classList.add("pos-custom");
    host.style.setProperty("--bx", `${x}%`);
    host.style.setProperty("--by", `${y}%`);
  } else if (position === "bl" || position === "br") host.classList.add(`pos-${position}`);
  host.append(svg);
  root.append(host);

  let mode = "dead";
  let tagText = "DUE";
  let talking = false;
  let grooving = false;
  let tickN = 0;
  let wait = 6;
  let idleQ = [];
  let gestureQ = [];
  let timer = null;
  let frozen = false;
  let dying = false;
  const pendingReact = [];
  let lastActive = Date.now();
  let prev = null;
  // Two things can take CRID off the air: the operator (state.bot.on) and the network (the
  // overlay's setOnline when the API stops answering). They share one flag so neither can
  // resurrect the bot while the other still has it down.
  let online = true;
  let lastReactN = null; // null until the first state arrives, so a stored reaction is not replayed on load
  const jobs = [];      // queued summon/dismiss jobs
  let running = null;   // job currently in flight
  const flights = new WeakMap();
  let lastDrawn = "";

  // ---- drawing a pose ----
  const render = (p) => {
    const sig = JSON.stringify(p);
    if (sig === lastDrawn) return;
    lastDrawn = sig;
    const eyeFor = (pose, s) => (EYES[pose] || EYES.open)(s);
    const [le, re] = Array.isArray(p.eyes) ? p.eyes : [p.eyes, p.eyes];
    for (const [node, name, s] of [[parts.eyeL, le, -1], [parts.eyeR, re, 1]]) {
      const e = eyeFor(name, s);
      node.setAttribute("d", e.d);
      node.setAttribute("fill", e.fill ? PAL.mint : "none");
      node.setAttribute("stroke", PAL.mint);
      node.setAttribute("stroke-width", e.fill ? 1.4 : e.w);
    }
    parts.eyesG.setAttribute("transform", `translate(${p.gx} ${p.gy})`);
    const m = MOUTHS[p.mouth] || MOUTHS.flat;
    parts.mouth.setAttribute("d", m.d);
    parts.mouth.setAttribute("fill", m.fill ? PAL.mint : "none");
    parts.mouth.setAttribute("stroke", PAL.mint);
    parts.mouth.setAttribute("stroke-width", m.w);
    parts.mouthG.setAttribute("transform", `translate(${73 + p.gx * 0.35} ${84 + p.gy * 0.25})`);
    // squash/stretch is anchored at the bottom edge so the body stays planted
    parts.bodyG.setAttribute("transform",
      `translate(0 ${p.by}) translate(70 160) scale(${(1 + (1 - p.bs) * 0.6).toFixed(3)} ${p.bs}) translate(-70 -160)`);
    parts.headG.setAttribute("transform", `translate(0 ${p.hy}) rotate(${p.hr} 70 104)`);
    for (const [node, name, s, cx] of [[parts.mittL, p.mL, -1, 14], [parts.mittR, p.mR, 1, 126]]) {
      const mp = (MITTS[name] || MITTS.down)(s);
      node.setAttribute("transform", `translate(${cx} 140) translate(0 ${mp.y}) rotate(${mp.r})`);
    }
    parts.tagG.setAttribute("transform", `rotate(${p.tr * 0.5} 97 38)`);
    parts.ticket.setAttribute("transform", `rotate(${p.tr} 104 15)`);
    parts.ticketText.textContent = p.tag;
    const paid = p.tag === "PAID";
    parts.ticketFill.setAttribute("fill", paid ? PAL.mint : PAL.red);
    // the LED is the "live signal" the theme spends its mint on: on, dimmed, or out
    parts.led.setAttribute("fill", p.led === "on" ? PAL.mint : p.led === "dim" ? PAL.edge : PAL.dead);
    host.dataset.mode = mode;
  };

  const compose = (frame) => {
    const p = { ...REST[mode], tag: tagText, ...(frame || {}) };
    if (!frame || frame.mouth === undefined) {
      if (talking && mode === "on") p.mouth = TALK[tickN % TALK.length];
    }
    if (grooving && mode === "on" && !frame) {
      p.hr = tickN % 4 < 2 ? -3 : 3;
      p.hy = tickN % 2 ? 2 : 0;
      p.eyes = "happy";
    }
    if (!frame && mode === "doze") p.hr = [3, 5, 7, 5][Math.floor(tickN / 3) % 4];
    return p;
  };

  const pickIdle = () => {
    const r = Math.random();
    if (mode === "doze") return r < 0.5 ? [{ led: "on" }, { led: "dim" }] : [];
    if (r < 0.46) return SEQ.blink;
    if (r < 0.58) return SEQ.doubleBlink;
    if (r < 0.70) return rand(0, 1) < 0.5 ? SEQ.glanceL : SEQ.glanceR;
    if (r < 0.78) return SEQ.lookUp;
    if (r < 0.90) return SEQ.sway;
    if (r < 0.95) return SEQ.ledBlink;
    return SEQ.shrug;
  };

  const tick = () => {
    if (frozen) return;
    timer = setTimeout(tick, STEP);
    tickN++;
    advanceJob();
    let frame = null;
    if (gestureQ.length) frame = gestureQ.shift();
    else if (mode !== "dead") {
      if (!idleQ.length && --wait <= 0) {
        idleQ = [...pickIdle()];
        wait = Math.round(rand(3, 9) * (mode === "doze" ? 1.8 : 1) * (220 / STEP));
      }
      frame = idleQ.shift() || null;
      if (mode === "on" && Date.now() - lastActive > DOZE_AFTER_MS) setMode("doze");
    }
    render(compose(frame));
    if (dying && !gestureQ.length) { mode = "dead"; dying = false; }
    else if (!running && !jobs.length && !gestureQ.length && pendingReact.length) play(SEQ[pendingReact.shift()] || []);
  };

  // ---- modes, gestures ----
  const play = (frames, { urgent = false } = {}) => {
    if (reduced) return;
    if (urgent) gestureQ = [];
    gestureQ.push(...frames);
  };
  function setMode(next) {
    if (next === mode && !dying) return;
    const was = mode;
    idleQ = [];
    if (next === "dead") {
      if (was === "dead" || dying) return;
      cancelJobs();
      pendingReact.length = 0;
      dying = true;
      play(SEQ.die, { urgent: true });
      if (reduced) { mode = "dead"; dying = false; }
      return;
    }
    dying = false;
    mode = next;
    if (was === "dead") play(SEQ.wake, { urgent: true });
    lastActive = Date.now();
  }
  const react = (kind) => {
    if (mode === "dead" || dying || !SEQ[kind]) return;
    if (mode === "doze") { mode = "on"; lastActive = Date.now(); }
    if (running || jobs.length) { if (pendingReact.length < 3) pendingReact.push(kind); return; }
    play(SEQ[kind], { urgent: true });
  };

  // ---- summon / dismiss choreography ----
  const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const setFlight = (node, f) => {
    if (!f) {
      for (const k of ["transform", "opacity", "transition", "zIndex", "willChange", "transformOrigin", "visibility"]) node.style[k] = "";
      if (flights.has(node) && flights.get(node).madeRelative) node.style.position = "";
      flights.delete(node);
      return;
    }
    node.style.transform = `translate(${f.tx}px,${f.ty}px) scale(${f.s}) rotate(${f.r}deg)`;
    node.style.opacity = f.o;
    node.style.visibility = f.o === 0 ? "hidden" : "visible";
  };
  const prepare = (node) => {
    const info = { madeRelative: false };
    node.style.transition = "none";
    node.style.willChange = "transform";
    node.style.transformOrigin = "50% 50%";
    node.style.zIndex = "40";
    if (getComputedStyle(node).position === "static") { node.style.position = "relative"; info.madeRelative = true; }
    flights.set(node, info);
  };
  // offset of the module from its final place: out = leaving the bot (p 0 -> 1), in = returning
  const pathAt = (from, to, p, s, r, o = 1, inward = false) => {
    const arc = Math.sin(Math.PI * p) * 46;
    const k = inward ? p : 1 - p;
    return { tx: (from.x - to.x) * k, ty: (from.y - to.y) * k - arc, s, r, o };
  };

  const summon = (node, opts = {}) => {
    if (!node) return;
    const botVisible = mode === "on" || mode === "doze";
    if (reduced || !botVisible || !host.isConnected) { return; }
    prepare(node);
    setFlight(node, { tx: 0, ty: 0, s: 1, r: 0, o: 0 });
    jobs.push({ kind: "summon", node, opts });
  };
  const dismiss = (node, done) => {
    if (!node) { done?.(); return; }
    if (reduced || mode === "dead" || !host.isConnected) { done?.(); return; }
    prepare(node);
    jobs.push({ kind: "dismiss", node, done });
  };
  const cancel = (node) => {
    for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].node === node) jobs.splice(i, 1);
    if (running && running.node === node) running = null;
    if (flights.has(node)) setFlight(node, null);
  };
  function cancelJobs() {
    for (const j of jobs.splice(0)) { setFlight(j.node, null); j.done?.(); }
    if (running) { setFlight(running.node, null); running.done?.(); running = null; }
  }

  // one job step per tick; the bot's frame and the module's frame are drawn on the same tick
  function advanceJob() {
    if (!running) {
      if (gestureQ.length || dying) return;
      running = jobs.shift() || null;
      if (!running) return;
      running.i = 0;
      if (!running.node.isConnected) { setFlight(running.node, null); running.done?.(); running = null; return; }
      running.node.style.transform = "none";
      running.from = centre(host.getBoundingClientRect());
      running.to = centre(running.node.getBoundingClientRect());
      running.fast = jobs.length > 0;
    }
    const j = running;
    if (!j.node.isConnected) { setFlight(j.node, null); j.done?.(); running = null; return; }
    const look = clamp((j.to.x - j.from.x) / 60, -5, 5);
    if (j.kind === "summon") {
      const F = j.fast
        ? [
          [{ eyes: "mad", hy: 4, bs: 0.95, gx: look }, [0, 0, 0, 0, 0]],
          [{ eyes: "wide", mouth: "o", mL: "push", mR: "push", hy: -2, bs: 1.03, gx: look }, [0.4, 0.55, 8, 1, 1]],
          [{ eyes: "open", mouth: "smile", mL: "down", mR: "down", gx: 0 }, [0.85, 1.05, -2, 1, 1]],
        ]
        : [
          [{ eyes: "mad", hy: 5, bs: 0.94, hr: look < 0 ? 3 : -3, gx: look }, [0, 0, 0, 0, 0]],
          [{ eyes: "wide", mouth: "o", mL: "up", mR: "up", hy: -3, bs: 1.04, gx: look }, [0.15, 0.3, -12, 1, 1]],
          [{ mL: "push", mR: "push", hy: -1 }, [0.45, 0.62, 7, 1, 1]],
          [{ eyes: "open", mouth: "smile", mL: "down", mR: "down", hy: 0, bs: 1, hr: 0, gx: look * 0.4 }, [0.78, 1.06, -3, 1, 1]],
          [{ eyes: "happy", mouth: "smile", gx: 0 }, [1, 1.02, 0, 1, 1]],
        ];
      if (j.i < F.length) {
        const [bf, [p, s, r, , o]] = F[j.i];
        gestureQ = [bf];
        if (j.i === 0) setFlight(j.node, { tx: 0, ty: 0, s: 0.2, r: 0, o: 0 });
        else setFlight(j.node, pathAt(j.from, j.to, p, s, r, o));
        j.i++;
        return;
      }
      setFlight(j.node, null);
      gestureQ = [{ eyes: "open", mouth: "smile" }];
      running = null;
      return;
    }
    // dismiss: pulled back into the bot in three steps
    const D = [[0.35, 0.82, 5], [0.7, 0.46, -8], [0.95, 0.16, 6]];
    if (j.i < D.length) {
      const [p, s, r] = D[j.i];
      gestureQ = [{ eyes: "wide", mouth: "o", mL: "push", mR: "push", hy: -2 }];
      setFlight(j.node, pathAt(j.from, j.to, p, s, r, 1, true));
      j.i++;
      return;
    }
    gestureQ = [{ eyes: "happy", mouth: "grin", bs: 1.04 }, { eyes: "open", mouth: "smile" }];
    setFlight(j.node, null);
    j.done?.();
    running = null;
  }

  // ---- state-driven behaviour ----
  const activityOf = (s) => Boolean(
    (s.visible && s.card) || (s.poll && s.poll.active !== false) || s.crid || s.court ||
    (s.music && s.music.current) || (s.spaces && s.spaces.length) || (s.riad && s.riad.active));

  const power = () => setMode(online ? "on" : "dead");

  const observe = (s) => {
    if (!s) return;
    // Operator control is checked before anything the desk is doing: a bot the operator has just
    // switched off must not react to a poll change or a new verdict on its way out.
    const on = s.bot ? s.bot.on !== false : true;
    if (on !== online) { online = on; power(); }
    if (!online) { prev = s; return; }
    // A reaction is detected by its counter changing rather than by the kind, which is what lets
    // the same gesture be asked for twice in a row without the second one being swallowed.
    const reactN = s.bot?.react?.n ?? 0;
    if (lastReactN === null) lastReactN = reactN;
    else if (reactN !== lastReactN) { lastReactN = reactN; react(s.bot.react.kind); }
    if (activityOf(s)) {
      lastActive = Date.now();
      if (mode === "doze") { mode = "on"; play([{ eyes: "wide", mouth: "o", hy: -2 }, { eyes: "open", mouth: "flat", hy: 0 }], { urgent: true }); }
    }
    const verdict = s.crid ? s.crid.verdict : null;
    tagText = verdict === 1 ? "PAID" : "DUE";
    if (prev) {
      const pv = prev.crid ? prev.crid.verdict : null;
      if (verdict === 1 && pv !== 1) react("paid");
      else if (verdict === 0 && pv !== 0) react("due");
      const pollNow = s.poll && s.poll.active !== false;
      const pollBefore = prev.poll && prev.poll.active !== false;
      if (pollNow && !pollBefore) react("think");
      else if (!pollNow && pollBefore && s.poll && s.poll.options) react("cheer");
      const disputed = s.card && s.card.confidence === "disputed";
      if (disputed && !(prev.card && prev.card.id === s.card.id)) react("wince");
    }
    prev = s;
  };

  // class hooks from createSoundOrbSync ("is-active") and the overlay ("music-playing")
  const watch = () => {
    talking = host.classList.contains("is-active");
    grooving = host.classList.contains("music-playing");
  };
  const mo = typeof MutationObserver === "function" ? new MutationObserver(watch) : null;
  mo?.observe(host, { attributes: true, attributeFilter: ["class"] });

  // ---- lifecycle ----
  render(compose(null));
  timer = setTimeout(tick, STEP);

  return {
    el: host,
    summon, dismiss, cancel, react, observe, setMode,
    setOnline(v) { online = Boolean(v); power(); },
    get mode() { return mode; },
    freeze(pose = {}) {
      frozen = true;
      clearTimeout(timer);
      if (pose.mode) { mode = pose.mode; }
      if (pose.tag) tagText = pose.tag;
      lastDrawn = "";
      render({ ...REST[mode], tag: tagText, ...pose });
    },
    destroy() { clearTimeout(timer); mo?.disconnect(); cancelJobs(); host.remove(); },
  };
}
