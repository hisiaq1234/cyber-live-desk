/* CRID Bitmoji — overlay-compatible, starts awake, no purple */
const NS = "http://www.w3.org/2000/svg";
const PAL = {
  onyx: "#1a1a1a",
  indigoDk: "#2a2a2a",
  mint: "#7dcea0",
  bone: "#e8e0d0",
  red: "#c0392b",
  dead: "#555555"
};

const BODIES = [3, 0, 5, 1, 2];
const ROT = 7;
const ASSETS = "./desk-assets/crid";
const AV = b => `${ASSETS}/body-${b}-r${ROT}.png`;
const SUB_STEPS = [0, 3, 8, 15, 25];

const el = (t, a = {}, ...k) => {
  const e = document.createElementNS(NS, t);
  for (const [n, v] of Object.entries(a)) e.setAttribute(n, v);
  for (const c of k) c && e.append(c);
  return e;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

function stageFor(n) {
  n = Math.max(0, n | 0);
  let i = 0;
  for (let k = 0; k < SUB_STEPS.length; k++) if (n >= SUB_STEPS[k]) i = k;
  const last = i === SUB_STEPS.length - 1;
  const frac = last ? clamp((n - SUB_STEPS[i]) / 40, 0, 1) : (n - SUB_STEPS[i]) / (SUB_STEPS[i + 1] - SUB_STEPS[i]);
  const sx = 1 + 0.08 * frac * (last ? 1.5 : 1);
  return { i, sx, sy: 1 + (sx - 1) * 0.25, heavy: i >= 3 };
}

function draw() {
  const svg = el("svg", { viewBox: "-8 -6 170 178", "aria-hidden": "true" });
  const shadow = el("ellipse", { class: "shadow", cx: 76, cy: 166, rx: 36, ry: 6, fill: "#000", opacity: 0.35 });
  const avatar = el("image", {
    class: "avatar",
    x: 10, y: 6, width: 140, height: 154,
    preserveAspectRatio: "xMidYMax meet"
  });
  const figG = el("g", { class: "fig" }, avatar);
  const bodyG = el("g", { class: "body" }, figG);
  const ticket = el("g", { class: "ticket", opacity: 0 });
  const ticketText = el("text", {
    x: 128, y: 16, "text-anchor": "middle", "font-size": 13, "font-weight": 800,
    fill: PAL.onyx, "font-family": "ui-monospace, Consolas, monospace"
  });
  ticket.append(
    el("path", { d: "M108 2H148V20H108Z", fill: PAL.red, stroke: PAL.bone, "stroke-width": 5 }),
    ticketText
  );
  svg.append(shadow, bodyG, ticket);
  return { svg, parts: { ticket, ticketText, shadow, bodyG, figG, avatar } };
}

const CSS = `
#crid-bot {
  --bw:clamp(64px, 7.2vw, 104px);
  --bx: 50%; --by: auto;
  position: fixed; z-index: 28;
  width: var(--bw); aspect-ratio: 160/168;
  pointer-events: none;
  left: var(--bx); margin-left: calc(var(--bw) / -2);
  bottom: calc(var(--m, 16px) + env(safe-area-inset-bottom, 0px));
  top: auto; right: auto;
}
#crid-bot.pos-bl { --bx: calc(var(--m, 16px) + 12em); margin-left: 0; }
#crid-bot.pos-br { left: auto; margin-left: 0; right: calc(var(--m, 16px) + var(--identity-w, 24em) + .6em); }
#crid-bot.pos-custom {
  left: var(--bx); top: var(--by); bottom: auto; right: auto;
  margin-left: calc(var(--bw) / -2);
}
#crid-bot svg { width:100%; height:100%; overflow:visible; filter: drop-shadow(4px 6px 0 #111); }
html.low-power #crid-bot svg, html.swae #crid-bot svg { filter: none; }
#crid-bot .avatar { image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; }
#crid-bot[data-mode="dead"] .avatar { opacity: .5; }
#crid-bot[data-mode="doze"] .avatar { opacity: .82; }
`;

export function createCridBot({
  root = document.body,
  swae = false,
  lowPower = false,
  position = "br",
  x = null,
  y = null,
  step = null
} = {}) {
  if (!document.getElementById("crid-bot-css")) {
    const st = document.createElement("style");
    st.id = "crid-bot-css";
    st.textContent = CSS;
    document.head.append(st);
  }

  const STEP = step != null ? step : swae ? 220 : lowPower ? 260 : 140;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const { svg, parts } = draw();
  const host = document.createElement("div");
  host.id = "crid-bot";
  host.setAttribute("aria-hidden", "true");
  // Start ready so first observe() can wake it
  host.dataset.mode = "on";

  if (x != null && y != null) {
    host.classList.add("pos-custom");
    host.style.setProperty("--bx", `${x}%`);
    host.style.setProperty("--by", `${y}%`);
  } else if (position === "bl" || position === "br") {
    host.classList.add(`pos-${position}`);
  }

  host.append(svg);
  root.append(host);

  for (const b of BODIES) new Image().src = AV(b);
  parts.avatar.addEventListener("error", () => parts.avatar.setAttribute("opacity", "0"));

  // Start online and awake so summon works on first cards
  let mode = "on", tagText = null, online = true, subs = 0, bodyI = -1, energy = 100, baseTag = null, transientTag = null, transientTimer = null;
  let growth = { sx: 1, sy: 1, heavy: false };
  let gestureQ = [], timer = null, tickN = 0, wait = 6, frozen = false, dying = false;
  let lastActive = Date.now(), lastDrawn = "", lastSubN = null, prev = null;
  const jobs = []; let running = null;
  const flights = new WeakMap();

  const SEQ = {
    blink:    [{ by: -2 }, { by: 0 }],
    hop:      [{ by: 3, bs: 0.94 }, { by: -10, bs: 1.05 }, { by: 2, bs: 0.96 }, { by: 0, bs: 1 }],
    cheer:    [{ by: -8, bs: 1.06 }, { by: 0, hr: -5 }, { by: -5, hr: 5 }, { by: 0, bs: 1 }],
    wave:     [{ hr: 6 }, { hr: -6 }, { hr: 5 }, { hr: 0 }],
    nod:      [{ hy: 4 }, { hy: 0 }],
    think:    [{ hr: 5, hy: -2 }, { hr: 4 }, { hr: 0 }],
    surprise: [{ by: -6, bs: 1.05 }, { by: 0, bs: 1 }],
    wince:    [{ by: 2, bs: 0.95, hr: -4 }, { by: 0, bs: 1, hr: 0 }],
    shrug:    [{ hy: -3, hr: 3 }, { hy: -2, hr: -3 }, { hy: 0, hr: 0 }],
    paid:     [{ by: -10, bs: 1.07 }, { by: 0, bs: 1 }],
    due:      [{ by: 4, bs: 0.96 }, { by: 0, bs: 1 }],
    gift:     [{ by: -12, bs: 1.08 }, { by: -4, bs: 1.03 }, { by: 0, bs: 1 }],
    bits:     [{ by: -9, bs: 1.06 }, { hr: 8 }, { hr: -6 }, { by: 0, hr: 0, bs: 1 }],
    sub:      [{ by: -14, bs: 1.1 }, { by: -6, bs: 1.04 }, { by: 0, bs: 1 }],
    jump:     [{ by: 5, bs: 0.88, hy: 4 }, { by: -30, bs: 1.08, hy: -6 }, { by: -26, bs: 1.06, hy: -4 }, { by: 4, bs: 0.9, hy: 3 }, { by: 0, bs: 1, hy: 0 }],
    hang:     [{ eyes: "wide", sy: 1.18, by: -4 }, { eyes: "wide", sy: 1.15, by: -2 }, { eyes: "wide", sy: 1.12 }],
    drop:     [{ by: 18, bs: 0.9, mL: "limp", mR: "limp" }, { by: 8, bs: 0.95 }, { by: 0, bs: 1 }],
    dejected: [{ pr: 18, hy: 4, mL: "limp", mR: "limp" }, { pr: 22, hy: 6, hr: 4 }, { pr: 18, hy: 4, hr: -4 }, { pr: 20, hy: 5 }],
    climb: [
      { by: 4, bs: 0.92 },
      { by: -16, bs: 1.06, hy: -4 },
      { by: -8, bs: 1.02, hy: -2 },
      { by: 0, bs: 1, hy: 0 }
    ],
    kick: [
      { hr: -8, by: 2 },
      { hr: 14, by: -4, bs: 1.04 },
      { hr: -4, by: 0, bs: 1 }
    ],
    weighted: [
      { by: 6, bs: 0.9 },
      { by: 10, bs: 0.88 },
      { by: 4, bs: 0.94 },
      { by: 0, bs: 1 }
    ],
    peek: [{ hy: -3, hr: 4 }, { hy: -2, hr: 2 }, { hy: 0, hr: 0 }],
    sideeye: [{ hr: 6 }, { hr: -4 }, { hr: 0 }],
    salute: [{ hy: -4, mR: "up" }, { hy: -2 }, { hy: 0, mR: "down" }]
  };

  let lastReactN = null;

  const react = kind => {
    if (!SEQ[kind] || mode === "dead") return;
    play(SEQ[kind], true);
    lastActive = Date.now();
    if (mode === "doze") setMode("on");
  };

  const flashTag = (label, ms = 1800) => {
    transientTag = label;
    tagText = label;
    lastDrawn = "";
    clearTimeout(transientTimer);
    transientTimer = setTimeout(() => {
      transientTag = null;
      tagText = baseTag;
      lastDrawn = "";
    }, ms);
  };

    let affectTimer = null;
  const affectLayer = (node, type) => {
    if (!node) return;
    node.classList.remove("crid-climbed", "crid-weighted", "crid-kicked");
    node.classList.add(type);
    clearTimeout(affectTimer);
    affectTimer = setTimeout(() => node.classList.remove(type), type === "crid-kicked" ? 900 : 1600);
  };

  // --- personality layer ---
  let mood = "idle";
  let bubbleTimer = null;
  let mischiefTimer = null;

  const WHIMSY_LINES = {
    idle:     ["rent is always due", "Omooo", "hm.", "no notes", "I saw that"],
    curious:  ["what's this then?", "new card", "hold on—", "ooh."],
    delighted:["PAID.", "yes!", "get in jorr", "called it"],
    alarmed:  ["uh oh", "disputed", "hm hm", "signal's gone"],
    dozing:   ["zzz", "five more", "wake me for food"],
    proud:    ["my desk", "tidy.", "look at it"],
    cheeky:   ["wasn't me", "oops", "just a nudge", "you saw nothing"]
  };

  const setMood = (m) => {
    if (!WHIMSY_LINES[m]) return;
    mood = m;
    host.dataset.mood = m;
    const desk = document.getElementById("desk");
    if (desk) desk.dataset.botMood = m;
  };

  const say = (text, ms = 1800) => {
    if (!text || reduced) return;
    let b = host.querySelector(".bot-bubble");
    if (!b) {
      b = document.createElement("div");
      b.className = "bot-bubble";
      host.append(b);
    }
    b.textContent = text;
    b.style.opacity = "1";
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { b.style.opacity = "0"; }, ms);
  };

  const nudge = (node) => {
    if (!node || reduced || document.documentElement.classList.contains("swae")) return;
    node.classList.add("chaos-nudged");
    clearTimeout(mischiefTimer);
    mischiefTimer = setTimeout(() => node.classList.remove("chaos-nudged"), 700);
  };

  const randomLine = (m = mood) => {
    const list = WHIMSY_LINES[m] || WHIMSY_LINES.idle;
    return list[Math.floor(Math.random() * list.length)];
  };
  // --- end personality layer ---

  const setBody = i => {
    if (i === bodyI) return;
    bodyI = clamp(i, 0, BODIES.length - 1);
    parts.avatar.setAttribute("href", AV(BODIES[bodyI]));
    parts.avatar.setAttribute("opacity", "1");
  };

  const applySubs = (n, beat = false) => {
    subs = Math.max(0, n | 0);
    const st = stageFor(subs);
    setBody(st.i);
    growth = st;
    lastDrawn = "";
    if (beat && mode !== "dead") play([{ by: -6, bs: 1.04 }, { by: 0, bs: 1 }], true);
  };

  const centre = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

  const setFlight = (node, f) => {
    if (!f) {
      for (const k of ["transform", "opacity", "transition", "zIndex", "willChange", "transformOrigin", "visibility"]) {
        node.style[k] = "";
      }
      if (flights.has(node) && flights.get(node).madeRelative) node.style.position = "";
      flights.delete(node);
      return;
    }
    node.style.transform = `translate(${f.tx}px, ${f.ty}px) scale(${f.s}) rotate(${f.r}deg)`;
    node.style.opacity = f.o;
    node.style.visibility = f.o === 0 ? "hidden" : "visible";
  };

  const prepare = node => {
    const info = { madeRelative: false };
    node.style.transition = "none";
    node.style.willChange = "transform";
    node.style.transformOrigin = "50% 50%";
    node.style.zIndex = "40";
    if (getComputedStyle(node).position === "static") {
      node.style.position = "relative";
      info.madeRelative = true;
    }
    flights.set(node, info);
  };

  const pathAt = (from, to, p, s, r, o = 1, inward = false) => {
    const arc = Math.sin(Math.PI * p) * 46;
    const k = inward ? p : 1 - p;
    return { tx: (from.x - to.x) * k, ty: (from.y - to.y) * k - arc, s, r, o };
  };

  const render = p => {
    const sig = JSON.stringify(p) + bodyI;
    if (sig === lastDrawn) return;
    lastDrawn = sig;
    parts.ticketText.textContent = p.tag || "";
    parts.ticket.setAttribute("opacity", p.tag ? 1 : 0);
    const col = p.tag === "PAID" ? PAL.mint : PAL.red;
    parts.ticket.querySelector("path").setAttribute("fill", col);
    const bs = p.bs || 1, by = p.by || 0, hy = p.hy || 0, hr = p.hr || 0;
    parts.bodyG.setAttribute("transform", `translate(0 ${by}) translate(80 162) scale(${(1 + (1 - bs) * 0.55).toFixed(3)} ${bs}) translate(-80 -162)`);
    parts.figG.setAttribute("transform", `translate(0 ${hy * 0.5}) translate(80 160) rotate(${hr}) scale(${growth.sx} ${growth.sy}) translate(-80 -160)`);
    host.dataset.mode = mode;
  };

  const play = (frames, urgent = false) => {
    if (reduced) return;
    if (urgent) gestureQ = [];
    gestureQ.push(...frames);
  };

  function setMode(next) {
    if (next === mode && !dying) return;
    const was = mode;
    if (next === "dead") {
      if (was === "dead" || dying) return;
      cancelJobs();
      dying = true;
      play([{ by: 8, bs: 0.94 }], true);
      if (reduced) { mode = "dead"; dying = false; }
      return;
    }
    dying = false;
    mode = next;
    if (was === "dead") play([{ by: -4, bs: 1.03 }, { by: 0, bs: 1 }], true);
    lastActive = Date.now();
  }

  const summon = (node) => {
    if (!node || reduced || mode === "dead" || !host.isConnected) return;
    const failChance = growth.heavy ? 0.45 : energy < 40 ? 0.35 : 0.12;
    if (Math.random() < failChance) {
      energy = clamp(energy - 12, 15, 100);
      play([...SEQ.jump.slice(0, 2), ...SEQ.hang, ...SEQ.drop, ...SEQ.dejected], true);
    } else {
      energy = clamp(energy - (growth.heavy ? 8 : 4), 15, 100);
      play(growth.heavy ? SEQ.hop : SEQ.jump, true);
    }
    prepare(node);
    setFlight(node, { tx: 0, ty: 0, s: 1, r: 0, o: 0 });
      jobs.push({ kind: "summon", node });
    affectLayer(node, Math.random() < failChance ? "crid-weighted" : (Math.random() < 0.35 ? "crid-climbed" : "crid-weighted"));
    if (Math.random() < failChance) {
      setTimeout(() => {
        node.classList.remove("crid-weighted", "crid-climbed");
        node.classList.add("crid-settled");
      }, 1400);
    }
  };

  const dismiss = (node, done) => {
    if (!node) { done?.(); return; }
    if (reduced || mode === "dead" || !host.isConnected) { done?.(); return; }
    prepare(node);
    jobs.push({ kind: "dismiss", node, done });
  };

  const cancel = (node) => {
    for (let i = jobs.length - 1; i >= 0; i--) {
      if (jobs[i].node === node) jobs.splice(i, 1);
    }
    if (running && running.node === node) running = null;
    if (flights.has(node)) setFlight(node, null);
  };

  function cancelJobs() {
    for (const j of jobs.splice(0)) {
      setFlight(j.node, null);
      j.done?.();
    }
    if (running) {
      setFlight(running.node, null);
      running.done?.();
      running = null;
    }
  }

  function advanceJob() {
    if (!running) {
      if (gestureQ.length || dying) return;
      running = jobs.shift() || null;
      if (!running) return;
      running.i = 0;
      if (!running.node.isConnected) {
        setFlight(running.node, null);
        running.done?.();
        running = null;
        return;
      }
      running.node.style.transform = "none";
      running.from = centre(host.getBoundingClientRect());
      running.to = centre(running.node.getBoundingClientRect());
    }
    const j = running;
    if (!j.node.isConnected) {
      setFlight(j.node, null);
      j.done?.();
      running = null;
      return;
    }

    if (j.kind === "summon") {
      const frames = [
        [0, 0.2, 0, 0],
        [0.25, 0.55, -10, 1],
        [0.55, 0.9, 6, 1],
        [0.85, 1.04, -2, 1],
        [1, 1, 0, 1]
      ];
      if (j.i < frames.length) {
        const [p, s, r, o] = frames[j.i];
        setFlight(j.node, pathAt(j.from, j.to, p, s, r, o));
        j.i++;
        return;
      }
      setFlight(j.node, null);
      running = null;
      return;
    }

    const D = [[0.3, 0.8, 4], [0.65, 0.4, -6], [0.95, 0.15, 3]];
    if (j.i < D.length) {
      const [p, s, r] = D[j.i];
      setFlight(j.node, pathAt(j.from, j.to, p, s, r, 1, true));
      j.i++;
      return;
    }
    setFlight(j.node, null);
    j.done?.();
    running = null;
  }

  const observe = s => {
    if (!s) return;
    const on = s.bot ? s.bot.on !== false : true;
    if (on !== online) {
      online = on;
      setMode(online ? "on" : "dead");
    } else if (online && mode === "dead") {
      // First observe while already online — wake immediately
      setMode("on");
    }
    if (!online) { prev = s; return; }


    const sn = s.bot?.subs ?? s.bot?.subCount ?? null;
    if (Number.isFinite(sn)) {
      if (lastSubN === null) { lastSubN = sn; applySubs(sn, false); }
      else if (sn !== lastSubN) { const up = sn > lastSubN; lastSubN = sn; applySubs(sn, up); }
    }
    // Gesture / event reaction
    const reactN = s.bot?.react?.n ?? 0;
    if (lastReactN === null) lastReactN = reactN;
    else if (reactN !== lastReactN) {
      lastReactN = reactN;
      const reaction = s.bot?.react;
      const kind = reaction?.kind;
      react(kind);
      if (kind === "bits" || kind === "gift" || kind === "sub") {
        const fallback = kind === "bits" ? "BITS" : kind === "gift" ? "GIFT" : "+SUB";
        flashTag(reaction?.label || fallback);
      }
      if (kind === "climb") affectLayer(s.bot?.target || null, "crid-climbed");
      if (kind === "kick") affectLayer(s.bot?.target || null, "crid-kicked");
      if (kind === "weighted" || kind === "sit") affectLayer(s.bot?.target || null, "crid-weighted");
    }


    const verdict = s.crid?.verdict;
    const next = s.crid ? (verdict === 1 ? "PAID" : "DUE") : null;
    if (next !== baseTag) {
      baseTag = next;
      if (!transientTag) {
        tagText = next;
        if (next === "PAID") play(SEQ.paid, true);
        else if (next === "DUE") play(SEQ.due, true);
      }
    }
    if (transientTag) tagText = transientTag;
    if (s.card || s.poll || s.visible) lastActive = Date.now();
    prev = s;
  };

  const tick = () => {
    if (frozen) return;
    timer = setTimeout(tick, STEP);
    tickN++;
    advanceJob();
    let frame = null;
    if (gestureQ.length) frame = gestureQ.shift();
    else if (mode !== "dead" && --wait <= 0) {
      if (Math.random() < 0.4) play([{ by: -4, bs: 1.03 }, { by: 0, bs: 1 }]);
      wait = Math.round(rand(5, 11));
    }
    render({ ...(frame || {}), tag: tagText });
    if (dying && !gestureQ.length) { mode = "dead"; dying = false; }
    if (mode === "on" && Date.now() - lastActive > 120000) setMode("doze");
    energy = clamp(energy + 0.08, 15, 100);
  };

  applySubs(0, false);
  render({ tag: tagText });
  timer = setTimeout(tick, STEP);

    return {
    el: host,
    summon,
    dismiss,
    cancel,
    observe,
    setMode,
    setOnline(v) { online = !!v; setMode(online ? "on" : "dead"); },
    setSubs: n => { lastSubN = n | 0; applySubs(n, false); },
    flashTag,
    react,
    affectLayer,
    poke: () => { play(SEQ.wince, true); energy = clamp(energy - 6, 15, 100); },
    setMood,
    say,
    nudge,
    randomLine,
    get mode() { return mode; },
    destroy() {
      clearTimeout(timer);
      clearTimeout(transientTimer);
      cancelJobs();
      host.remove();
    }
  };
