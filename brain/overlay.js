/* Crid brain overlay — a STATELESS renderer.
 *
 * OBS reloads browser sources on several triggers, so this page holds no durable state:
 * it connects to the brain's WebSocket, takes a snapshot, and applies commands. All
 * memory, decisions and timing of *what* happens live in the brain (brain/engine.mjs).
 * Timing curves for the body itself stay here — crid-bot.js owns those (tech-notes §4).
 *
 * The renderer owns the *body work* for the owner's reaction vocabulary: tears on an L,
 * and the walk-grab-drag that moves a layer out of the way. The brain only names the
 * layer and the side (command `move`), never the pixel path.
 */
import { createCridBot } from "/desk-assets/crid-bot.js";

const params = new URLSearchParams(location.search);
if (params.get("preview") === "1") document.body.classList.add("preview");

const $ = (sel) => document.querySelector(sel);
const cardEl = $("#crid-card");
const recapEl = $("#crid-recap");
const chipsEl = $("#crid-chips");
const fxEl = $("#fx");
const linkEl = $("#crid-link");

const bot = createCridBot({ position: "bl" });
const host = bot.el;
host.dataset.presence = "hidden";
host.dataset.sayStyle = "quip";

let playing = { priority: 0, until: 0 };
let cardTimer = null;
let recapTimer = null;
let currentPresence = null;

/* ---------- vocabulary: emotion / gesture / look → the body's own sequences ---------- */

const EMOTION = {
  neutral: { mood: "idle", seq: null },
  pleased: { mood: "proud", seq: "nod" },
  smug: { mood: "cheeky", seq: "sideeye" },
  annoyed: { mood: "alarmed", seq: "wince" },
  surprised: { mood: "curious", seq: "surprise" },
  thinking: { mood: "curious", seq: "think" },
  excited: { mood: "delighted", seq: "cheer" },
  deadpan: { mood: "idle", seq: "shrug" },
  // the owner's vocabulary: a W is a celebration, an L is the sad face (wince eyes + wavy mouth)
  hype: { mood: "delighted", seq: "cheer" },
  sad: { mood: null, seq: "wince" },
};

const GESTURE = {
  "lean-in": "peek",
  recoil: "wince",
  point: "salute",
  shrug: "shrug",
  nod: "nod",
  "double-take": "surprise",
  "head-shake": "sideeye",
  cheer: "cheer",
  hop: "hop",
  jump: "jump",
  wave: "wave",
  think: "think",
  peek: "peek",
  wince: "wince",
  kick: "kick",
  weighted: "weighted", // the heavy-lift pose he uses to drag something
  salute: "salute",
};

const LOOK = {
  chat: "read",
  streamer: "glanceL",
  game: "lookUp",
  "viewer-cam": "glanceR",
  offscreen: "glanceR",
};

/* ---------- layers Crid may physically move ----------
 * Named targets the brain can address. Anything not in this registry is refused rather
 * than guessed at. brain/README.md documents the same contract for the desk's own panels.
 */
const LAYERS = {
  card: () => cardEl,
  recap: () => recapEl,
  chips: () => chipsEl,
  link: () => linkEl,
};

const DRAG_X = { left: "-38vw", right: "38vw", up: "0px", down: "0px" };
const DRAG_Y = { left: "0px", right: "0px", up: "-26vh", down: "26vh" };

/* ---------- apply ---------- */

function setPresence(mode) {
  if (mode === currentPresence) return;
  currentPresence = mode;
  host.dataset.presence = mode;
  if (mode === "hidden") {
    bot.setMode("dead");
    return;
  }
  if (bot.mode === "dead" || bot.mode === "doze") bot.setMode("on");
}

function applyCommand(cmd) {
  const p = cmd.payload || {};
  switch (cmd.type) {
    case "presence":
      setPresence(p.mode || "idle");
      break;
    case "look":
      if (LOOK[p.target] && host.dataset.presence !== "hidden") bot.react(LOOK[p.target]);
      break;
    case "express": {
      const e = EMOTION[p.emotion];
      if (!e) break;
      if (e.mood) bot.setMood(e.mood);
      if (e.seq) bot.react(e.seq);
      break;
    }
    case "gesture":
      if (GESTURE[p.type]) bot.react(GESTURE[p.type]);
      break;
    case "say":
      if (!p.text) break;
      host.dataset.sayStyle = p.style || "quip";
      bot.say(p.text, p.duration || cmd.ttl || 5000);
      break;
    case "card":
      showCard(p.title, p.subtitle, cmd.ttl || 8000);
      break;
    case "effect":
      playEffect(p.type, p.intensity, p.duration);
      break;
    case "move":
      moveLayer(p, cmd);
      break;
    case "memory":
      showChip(p.kind, p.text);
      if (p.kind === "since-left" && Array.isArray(p.moments)) showRecap(p.text, p.moments, cmd.ttl || 15000);
      break;
    default:
      break;
  }
}

/** Interrupt rules: a raid card cuts a quip; an expression may replace an expression. */
function admits(cmd) {
  if (!cmd) return false;
  if (cmd.interrupt === "hard") return true;
  if (cmd.interrupt === "none") return true;
  const now = Date.now();
  if (playing.until < now) return true;
  return cmd.priority >= playing.priority;
}

function onCommand(cmd) {
  if (!admits(cmd)) return;
  const now = Date.now();
  if (cmd.interrupt !== "none" && cmd.type !== "presence" && cmd.type !== "look") {
    playing = { priority: cmd.priority, until: now + Math.min(cmd.ttl || 3000, 8000) };
  }
  try {
    applyCommand(cmd);
  } catch (err) {
    console.warn("[crid] command failed", cmd.type, err);
  }
}

/* ---------- surfaces ---------- */

function showCard(title, subtitle, ttl) {
  releaseLayer(cardEl);
  cardEl.querySelector(".card-title").textContent = title || "";
  cardEl.querySelector(".card-sub").textContent = subtitle || "";
  cardEl.classList.add("on");
  // Crid pulls the card in with his own hands when the body is awake.
  if (bot.mode === "on") bot.summon(cardEl);
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => {
    if (bot.mode === "on") bot.dismiss(cardEl, () => cardEl.classList.remove("on"));
    else cardEl.classList.remove("on");
    releaseLayer(cardEl);
  }, ttl);
}

function showChip(kind, text) {
  if (!text) return;
  const chip = document.createElement("div");
  chip.className = "chip";
  const k = document.createElement("span");
  k.className = "kind";
  k.textContent = kind || "memory";
  chip.append(k, document.createTextNode(text));
  chipsEl.append(chip);
  while (chipsEl.children.length > 4) chipsEl.firstElementChild.remove();
  setTimeout(() => {
    chip.classList.add("out");
    setTimeout(() => chip.remove(), 320);
  }, 11000);
}

function showRecap(head, moments, ttl) {
  const headEl = recapEl.querySelector(".recap-head");
  const list = recapEl.querySelector(".recap-list");
  headEl.textContent = head || "while you were gone";
  list.textContent = "";
  for (const m of moments.slice(0, 6)) {
    const li = document.createElement("li");
    li.append(document.createTextNode(m.label || ""));
    if (m.ago) {
      const ago = document.createElement("span");
      ago.className = "ago";
      ago.textContent = m.ago;
      li.append(ago);
    }
    list.append(li);
  }
  recapEl.classList.add("on");
  clearTimeout(recapTimer);
  recapTimer = setTimeout(() => {
    recapEl.classList.remove("on");
    releaseLayer(recapEl);
  }, ttl);
}

/* ---------- effects (CSS only: no new images anywhere in this overlay) ---------- */

const FX = { flash: "flash", shake: "shake", "vignette-pulse": "vignette", vignette: "vignette", "zoom-punch": "zoom", zoom: "zoom", particles: "flash" };

function playEffect(type, intensity = 0.6, duration) {
  if (type === "tears") return playTears(intensity, duration);
  const cls = FX[type];
  if (!cls) return;
  fxEl.style.opacity = String(Math.min(1, Math.max(0.2, intensity)));
  fxEl.classList.remove("flash", "shake", "vignette", "zoom");
  void fxEl.offsetWidth; // restart the animation
  fxEl.classList.add(cls);
  setTimeout(() => fxEl.classList.remove(cls), 1000);
}

/* ---------- tears: animated water drops, drawn in CSS, anchored to his face ---------- */

// Eye positions as a fraction of the body box (crid-bot.js draws the avatar across
// x 18..130 of a 160×168 viewBox, so the face sits high and slightly left of centre).
const EYE_SOURCES = [
  [40, 27],
  [50, 27],
];

let tearLayer = null;
let tearTimer = null;

function playTears(intensity = 0.8, duration = 6000) {
  if (host.dataset.presence === "hidden") return;
  if (!tearLayer) {
    tearLayer = document.createElement("div");
    tearLayer.className = "crid-tears";
    tearLayer.setAttribute("aria-hidden", "true");
    host.append(tearLayer);
  }
  tearLayer.textContent = "";
  tearLayer.style.opacity = String(Math.min(1, Math.max(0.35, intensity)));
  const drops = intensity > 0.7 ? 3 : 2;
  for (const [x, y] of EYE_SOURCES) {
    for (let i = 0; i < drops; i++) {
      const drop = document.createElement("i");
      drop.className = "crid-tear";
      drop.style.left = `${x}%`;
      drop.style.top = `${y}%`;
      drop.style.animationDelay = `${(i * 0.38).toFixed(2)}s`;
      drop.style.setProperty("--fall", `${(1.1 + i * 0.18).toFixed(2)}s`);
      tearLayer.append(drop);
    }
  }
  clearTimeout(tearTimer);
  tearTimer = setTimeout(() => {
    tearLayer?.remove();
    tearLayer = null;
  }, Math.max(1200, duration));
}

/* ---------- physical layer drag: walk to it, take the weight, move it aside ---------- */

let dragTimer = null;
let dragReassert = null;
let draggedEl = null;

const clampPct = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function travelTo(xPct, yPct) {
  const apply = () => {
    // The body is position:fixed with its own 0.9s left/top transition, so writing the
    // target is the walk. Re-asserted while travelling because the body also roams on
    // its own when idle and would otherwise win the race.
    host.style.left = `${xPct}%`;
    host.style.top = `${yPct}%`;
    host.style.bottom = "auto";
    host.style.marginLeft = "calc(var(--bw) / -2)";
  };
  apply();
  clearInterval(dragReassert);
  dragReassert = setInterval(apply, 200);
}

function goHome() {
  clearInterval(dragReassert);
  dragReassert = null;
  host.style.left = "";
  host.style.top = "";
  host.style.bottom = "";
  host.style.marginLeft = "";
}

function releaseLayer(el) {
  if (!el) return;
  el.classList.remove("dragging");
  el.style.removeProperty("--drag-x");
  el.style.removeProperty("--drag-y");
  if (draggedEl === el) draggedEl = null;
}

function stopDrag() {
  clearTimeout(dragTimer);
  dragTimer = null;
  clearInterval(dragReassert);
  dragReassert = null;
  if (draggedEl) releaseLayer(draggedEl);
}

/**
 * The `move` command. The brain names a layer and a side; this function does the visible
 * work — Crid walks to the layer, strains, the layer slides aside under his hands, and he
 * walks back. The layer keeps its rendered state (visible/hidden, contents): only
 * `--drag-x/--drag-y` change, so nothing is faded, rebuilt or re-rendered.
 */
function moveLayer(p) {
  const target = String(p.target || "").toLowerCase();
  const el = LAYERS[target]?.();
  if (!el) {
    console.warn(`[crid] move: no layer named "${target}" — refusing to guess`);
    return;
  }
  const side = DRAG_X[p.to] ? p.to : "left";
  const travelMs = clampPct(Number(p.travelMs) || 900, 0, 4000);
  const dragMs = clampPct(Number(p.dragMs) || 700, 0, 4000);
  stopDrag();

  const rect = el.getBoundingClientRect();
  const tx = clampPct(((rect.left + rect.width / 2) / innerWidth) * 100, 10, 90);
  const ty = clampPct(((rect.top + rect.height * 0.55) / innerHeight) * 100, 12, 84);
  travelTo(tx, ty);
  bot.react("peek"); // he spots it

  dragTimer = setTimeout(() => {
    bot.react("weighted"); // hands on it, taking the weight
    draggedEl = el;
    el.classList.add("dragging");
    el.style.setProperty("--drag-x", DRAG_X[side]);
    el.style.setProperty("--drag-y", DRAG_Y[side]);
    dragTimer = setTimeout(() => {
      goHome(); // he walks back, leaving the layer where he put it
      el.classList.remove("dragging");
    }, dragMs + 600);
  }, travelMs);
}

/* ---------- snapshot ---------- */

function applySnapshot(snap) {
  if (!snap) return;
  setPresence(snap.state?.presence || "watching");
  if (snap.state?.expression?.emotion) applyCommand({ type: "express", payload: snap.state.expression, ttl: 4000 });
  const mem = snap.memory || {};
  // A reload mid-lull still shows what happened: the moments live in the brain.
  if (Array.isArray(mem.moments) && mem.moments.length) {
    const recent = mem.moments.slice(-4).map((m) => ({ label: m.label, ago: m.ago }));
    if (recent.length >= 2 && (mem.silenceMs || 0) > 60000) showRecap(`${recent.length} moments while you were gone`, recent, 12000);
  }
  setLink(snap.status);
}

function setLink(status) {
  if (!status) return;
  const twitch = status.twitch || {};
  const demo = status.mode === "demo";
  const state = demo ? "connected" : twitch.state || "disconnected";
  linkEl.dataset.state = state;
  linkEl.querySelector(".txt").textContent = demo ? "demo" : state === "connected" ? `#${twitch.channel || ""}` : "reconnecting";
  linkEl.classList.toggle("on", !demo && state !== "connected");
}

/* ---------- transport ---------- */

let socket = null;
let retry = null;

function connect() {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  try {
    socket = new WebSocket(url);
  } catch {
    scheduleRetry();
    return;
  }
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "hello" }));
  });
  socket.addEventListener("message", (ev) => {
    let frame;
    try {
      frame = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (frame.frame === "snapshot") applySnapshot(frame);
    else if (frame.frame === "command") onCommand(frame.command);
    else if (frame.frame === "status") setLink(frame.status);
  });
  socket.addEventListener("close", scheduleRetry);
  socket.addEventListener("error", () => socket?.close());
}

function scheduleRetry() {
  clearTimeout(retry);
  retry = setTimeout(connect, 2000);
}

// Start awake: Crid is on the desk before the first command arrives.
bot.setMode("on");
setPresence("watching");
connect();

window.cridOverlay = { bot, applyCommand, onCommand, moveLayer, playTears, goHome };
