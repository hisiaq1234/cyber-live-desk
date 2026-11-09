/* Crid brain overlay — a STATELESS renderer.
 *
 * OBS reloads browser sources on several triggers, so this page holds no durable state:
 * it connects to the brain's WebSocket, takes a snapshot, and applies commands. All
 * memory, decisions and timing of *what* happens live in the brain (brain/engine.mjs).
 * Timing curves for the body itself stay here — crid-bot.js owns those (tech-notes §4).
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
  wave: "wave",
  think: "think",
};

const LOOK = {
  chat: "read",
  streamer: "glanceL",
  game: "lookUp",
  "viewer-cam": "glanceR",
  offscreen: "glanceR",
};

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
      bot.setMood(e.mood);
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
      playEffect(p.type, p.intensity);
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
  cardEl.querySelector(".card-title").textContent = title || "";
  cardEl.querySelector(".card-sub").textContent = subtitle || "";
  cardEl.classList.add("on");
  // Crid pulls the card in with his own hands when the body is awake.
  if (bot.mode === "on") bot.summon(cardEl);
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => {
    if (bot.mode === "on") bot.dismiss(cardEl, () => cardEl.classList.remove("on"));
    else cardEl.classList.remove("on");
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
  recapTimer = setTimeout(() => recapEl.classList.remove("on"), ttl);
}

const FX = { flash: "flash", shake: "shake", "vignette-pulse": "vignette", vignette: "vignette", "zoom-punch": "zoom", zoom: "zoom", particles: "flash" };

function playEffect(type, intensity = 0.6) {
  const cls = FX[type];
  if (!cls) return;
  fxEl.style.opacity = String(Math.min(1, Math.max(0.2, intensity)));
  fxEl.classList.remove("flash", "shake", "vignette", "zoom");
  void fxEl.offsetWidth; // restart the animation
  fxEl.classList.add(cls);
  setTimeout(() => fxEl.classList.remove(cls), 1000);
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

window.cridOverlay = { bot, applyCommand, onCommand };
