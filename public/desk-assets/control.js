
/* CYBER LIVE DESK — private controller. Served at /control.
   Strict iOS Broadcast Doctrine: haptic feedback, spring physics, glass compositing, zero-precision touch targets.
   Operate it from a second device. Every request carries the operator token
   (stored in this browser only); the public overlay never sees notes or the token.
   Loaded as a module so the poll validator and command help are the tested shared copy. */
import { BOT_REACTS, COMMAND_HELP, commandText, parseAllowIds, parseDeskCommand, validatePollDraft } from "./desk-commands.js";
import { deskHotkeyAction } from "./desk-hotkeys.js";
import { requestXFeed } from "./x-feed-client.js";
import { youtubePlaylistEmbedUrl } from "./youtube-playlist.mjs";
import { createCridVoice } from "./crid-voice.js";

(() => {
  "use strict";

  const TOKEN_KEY = "desk.token";
  const TYPES = ["news-drop", "trend-topic", "slang", "street-question", "viewer-question"];
  const CONF = ["confirmed", "reported", "disputed", "unverified", "test"];
  const APPROVAL = ["pending", "approved", "rejected"];
  const BRIEF_VERBS = new Set(["research", "deeper", "refresh", "read", "quiet"]);

  let token = "";
  try { token = localStorage.getItem(TOKEN_KEY) || ""; } catch { /* private mode */ }
  let cards = [];
  let state = null;
  let offset = 0; // server clock minus this device's clock
  let busy = false;
  let keyboardEnabled = false;
  let expanded = null;
  let editing = null;
  let desks = [];
  let feeds = [];
  let research = { approvalMode: "manual", trustedFeedIds: [], maxPending: 60, held: 0, heldItems: [] };
  let counts = { pending: 0, approved: 0, held: 0, onAir: 0, unreadResearch: 0, researchCapacity: 60 };
  let brief = null;
  let briefBusy = false;
  let briefLastError = "";
  let briefUtterance = null;
  let twitch = { configured: false, enabled: false, verified: false, tested: false, ready: false, missing: [], allowedUserIds: [] };
  let approvalDirty = false;
  let twitchDirty = false;
  const drafts = {}; // unsaved presenter notes, by card id
  const selected = new Set(); // cards ticked for a bulk action
  const filter = { text: "", cat: "", status: "approved", desk: "", source: "" };

  // --- UI Routing State ---
  let currentTab = "live"; // live, topics, crid, community, studio, settings

  // ---------- Engine & Helpers ----------
  const haptic = (type = 'light') => {
    try {
      if (!navigator.vibrate) return;
      if (type === 'light') navigator.vibrate(15);
      if (type === 'heavy') navigator.vibrate([30, 50, 30]);
      if (type === 'success') navigator.vibrate([15, 60, 20]);
      if (type === 'error') navigator.vibrate([50, 50, 50]);
    } catch { /* ignore */ }
  };

  const voice = createCridVoice({
    onHeard: (text) => toast("Heard: " + text),
    onError: (err) => toast("Voice: " + err, true),
  });

  const startVoice = () => {
    if (!token) return toast("Log in first", true);
    voice.start();
    toast("CRID is listening");
  };
  const stopVoice = () => {
    voice.stop();
    toast("CRID stopped listening");
  };


  const h = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    if (typeof props === "string") e.className = props;
    else for (const [k, v] of Object.entries(props || {})) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on") || k in e) e[k] = v;
      else e.setAttribute(k, v);
    }
    for (const k of kids.flat()) {
      if (k == null || k === false) continue;
      e.append(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return e;
  };

  const btn = (label, onclick, cls = "", hapType = 'light') => {
    const fn = (e) => { haptic(hapType); if (onclick) onclick(e); };
    const c = ("btn " + (cls || "")).split(/\s+/).filter((v, i, a) => v && a.indexOf(v) === i).join(" ");
    return h("button", { type: "button", class: c, onclick: fn }, label);
  };

  const sel = (list, val) => { const s = h("select", {}, list.map((o) => h("option", { value: o }, o))); s.value = val; return s; };
  const serverNow = () => Date.now() + offset;
  const fmt = (iso) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "not given";
  };
  const toLocalInput = (iso) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  };

  const toastEl = h("div", "toast-island");
  let toastTimer;
  const toast = (msg, bad = false) => {
    toastEl.textContent = msg;
    toastEl.className = "toast-island show" + (bad ? " bad" : "");
    haptic(bad ? 'error' : 'success');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.className = "toast-island"), bad ? 6000 : 2200);
  };

  // ---------- X feed health ----------
  // The overlay is the only thing that renders the feed, but it runs inside OBS or Swae, so its
  // console is nowhere near the operator. The controller therefore asks the same endpoint the
  // overlay asks and shows the answer here: the desk function's status plus whatever X replied,
  // instead of a corner of the stream that is silently empty.
  const xFeedStatus = h("div", "sub x-feed-status", "");
  let xFeedCheckedAt = 0;
  let xFeedBusy = false;
  let xFeedLastError = "";
  const checkXFeed = async ({ force = false } = {}) => {
    if (xFeedBusy) return null;
    if (!force && Date.now() - xFeedCheckedAt < 60000) return null;
    xFeedBusy = true;
    xFeedCheckedAt = Date.now();
    try {
      const result = await requestXFeed(globalThis.fetch, { mode: "trends" });
      const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (result.ok) {
        xFeedStatus.dataset.state = "ok";
        xFeedStatus.textContent = `X feed reachable · trends checked ${at}`;
        xFeedLastError = "";
      } else {
        xFeedStatus.dataset.state = "bad";
        xFeedStatus.textContent = `${result.error} · checked ${at}`;
        // One toast per distinct failure, not one every minute.
        if (result.error !== xFeedLastError) toast(result.error, true);
        xFeedLastError = result.error;
      }
      return result;
    } catch (err) {
      xFeedStatus.dataset.state = "bad";
      xFeedStatus.textContent = "X feed check failed: " + (err?.message || err);
      return null;
    } finally {
      xFeedBusy = false;
    }
  };

  const api = async (path, body) => {
    const r = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { token = ""; showLogin("That token was not accepted."); throw new Error("Operator token required."); }
    if (!r.ok) throw new Error(j.error || "Request failed (" + r.status + ")");
    return j;
  };

  const act = async (action, extra = {}) => {
    if (busy) return;
    busy = true;
    document.body.classList.add("busy");
    try {
      const j = await api("/api/desk/action", { action, ...extra });
      state = j.state;
      offset = j.serverNow - Date.now();
      renderLive();
      renderApp();
      return j;
    } catch (e) { toast(e.message, true); return null; }
    finally { busy = false; document.body.classList.remove("busy"); }
  };

  // Deliberate, modifier-based shortcuts avoid firing while typing or navigating the page.
  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const action = deskHotkeyAction(event, {
      enabled: keyboardEnabled,
      visible: !document.hidden,
      editable: target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']")),
      sheetOpen: Boolean(document.querySelector(".sheet-overlay.open")),
    });
    if (!action) return;
    event.preventDefault();
    void act(action);
  });

  const saveCard = async (payload) => {
    try {
      const { card } = await api("/api/desk/cards", payload);
      const i = cards.findIndex((c) => c.id === card.id);
      if (i >= 0) cards[i] = card; else cards.push(card);
      renderLive();
      renderApp();
      await load(); // refresh counts and server-derived desk ids
      toast("Card saved.");
      return card;
    } catch (e) { toast(e.message, true); return null; }
  };

  const load = async () => {
    try {
      const j = await api("/api/desk/cards");
      cards = j.cards; state = j.state; offset = j.serverNow - Date.now();
      if (Array.isArray(j.desks)) desks = j.desks;
      if (Array.isArray(j.feeds)) feeds = j.feeds;
      if (j.research) research = j.research;
      if (j.counts) counts = j.counts;
      if (j.twitch) twitch = j.twitch;
      if ("brief" in j) brief = j.brief;
      drawBrief();
      renderLive();
      drawTwitchServer();
      drawClip();
      renderApp();
    } catch (e) { if (token) toast(e.message, true); }
  };

  // ---------- iOS Broadcast CSS Engine & Existing Components ----------
  const CSS = `
    :root {
      --bg-root: #000000;
      --bg-glass: rgba(30, 30, 30, 0.65);
      --bg-glass-deep: rgba(15, 15, 15, 0.85);
      --glass-filter: blur(50px) saturate(200%);
      --accent: #FF453A;
      --accent-glow: rgba(255, 69, 58, 0.35);
      --tint-blue: #0A84FF;
      --tint-green: #32D74B;
      --tint-orange: #FF9F0A;
      --text-1: #FFFFFF;
      --text-2: rgba(255, 255, 255, 0.6);
      --text-3: rgba(255, 255, 255, 0.3);
      --border-soft: rgba(255, 255, 255, 0.1);
      --brand: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
      --spring: cubic-bezier(0.25, 0.1, 0.25, 1);
    }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    [hidden] { display: none !important; }
    html, body {
      margin: 0; padding: 0; background: var(--bg-root); color: var(--text-1);
      font-family: var(--brand); font-synthesis: none;
      -webkit-font-smoothing: antialiased; overscroll-behavior-y: none;
      user-select: none; min-height: 100dvh;
    }
    input, textarea, select { user-select: auto; font-family: inherit; }

    #app-root {
      display: flex; flex-direction: column; height: 100dvh; width: 100vw;
      overflow: hidden;
    }
    .view-container {
      flex: 1; overflow-y: auto; padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px 120px;
      overscroll-behavior-y: auto; scroll-behavior: smooth;
      max-width: 860px; margin: 0 auto; width: 100%;
    }

    /* Typography */
    h1, h2, h3 { margin: 0; font-weight: 700; letter-spacing: -0.4px; }
    h2 { font-size: 1.15rem; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; }
    .t-title { font-size: 28px; font-weight: 800; margin-bottom: 16px; }
    .t-sub { font-size: 15px; color: var(--text-2); line-height: 1.4; letter-spacing: -0.1px; }
    .t-micro { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-3); }
    .now { font-size: 1.25rem; font-weight: 800; margin: .3em 0; }
    .sub { color: var(--text-2); font-size: .9rem; line-height: 1.4; }
    a { color: var(--tint-blue); }

    /* Layout & Panels */
    .stack { display: flex; flex-direction: column; gap: 16px; }
    .row { display: flex; gap: 12px; align-items: center; }
    .row > * { flex: 1; }
    .row-between { display: flex; justify-content: space-between; align-items: center; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }

    .panel {
      background: var(--bg-glass); backdrop-filter: var(--glass-filter);
      -webkit-backdrop-filter: var(--glass-filter);
      border: 1px solid var(--border-soft); border-radius: 24px; padding: 18px;
      margin-bottom: 16px; overscroll-behavior: contain;
    }
    .panel-live, .panel.status.live {
      border-color: var(--accent); box-shadow: 0 0 24px var(--accent-glow);
    }
    .panel.status {
      position: relative; border: 1px solid var(--border-soft);
    }
    .pill {
      display: inline-block; padding: .2em .8em; border-radius: 99px;
      font-weight: 800; font-size: 13px; background: rgba(255, 255, 255, 0.1); color: var(--text-2);
    }
    .status.live .pill, .live .pill {
      background: var(--accent); color: #fff;
    }

    /* Buttons */
    .btn, .b {
      appearance: none; border: none; background: rgba(255, 255, 255, 0.1);
      color: var(--text-1); font-family: inherit; font-size: 16px; font-weight: 600;
      border-radius: 16px; padding: 14px 16px; min-height: 52px;
      cursor: pointer; transition: transform 0.1s, opacity 0.1s, background 0.2s, box-shadow 0.2s;
      display: inline-flex; align-items: center; justify-content: center; text-align: center;
      user-select: none;
    }
    .btn:active, .b:active { transform: scale(0.96); opacity: 0.8; }
    .btn:disabled, .b:disabled { opacity: 0.4; pointer-events: none; cursor: not-allowed; }
    .busy .btn, .busy .b { opacity: 0.6; pointer-events: none; }

    .btn.primary, .btn.go, .b.go { background: var(--text-1); color: var(--bg-root); font-weight: 700; }
    .btn.danger, .b.danger { background: var(--accent); color: var(--text-1); }
    .btn.blue { background: var(--tint-blue); color: var(--text-1); }
    .btn.green { background: var(--tint-green); color: var(--bg-root); }
    .btn.giant, .btn.big, .b.big { min-height: 68px; font-size: 19px; font-weight: 800; width: 100%; border-radius: 20px; }
    .btn.small, .b.small { min-height: 38px; padding: 8px 12px; font-size: 14px; border-radius: 12px; }
    .btn.active-toggle, .btn.on, .b.on { outline: 2px solid var(--text-1); background: rgba(255, 255, 255, 0.25); }
    .btn.approve, .b.approve { background: var(--tint-green); color: #062017; font-weight: 700; }
    .btn.reject, .b.reject { background: var(--accent); color: #fff; font-weight: 700; }

    /* Inputs */
    input, textarea, select {
      width: 100%; background: rgba(0, 0, 0, 0.45); border: 1px solid var(--border-soft);
      color: var(--text-1); border-radius: 12px; padding: 12px 14px; font-size: 16px;
      transition: border-color 0.2s;
    }
    input:focus, textarea:focus, select:focus { outline: none; border-color: var(--tint-blue); }
    textarea { resize: vertical; }
    .f { display: grid; gap: 6px; margin-bottom: 12px; }
    .f span { font-size: 13px; font-weight: 600; color: var(--text-2); }
    .input-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }

    /* Chips */
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
    .chip {
      padding: 4px 10px; border-radius: 99px; font-size: 12px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.5px;
      background: rgba(255, 255, 255, 0.1); color: var(--text-2); border: 1px solid transparent;
    }
    .chip.live { background: var(--accent); color: #fff; border-color: var(--accent); animation: pulse-chip 2s infinite; }
    .chip.ok { color: var(--tint-green); border-color: var(--tint-green); background: rgba(50, 215, 75, 0.15); }
    .chip.warn { color: var(--tint-orange); border-color: var(--tint-orange); background: rgba(255, 159, 10, 0.15); }
    .chip.hold { background: rgba(255, 209, 92, 0.15); color: #FFD15C; border-color: rgba(255, 209, 92, 0.3); }
    .brief-body { display: grid; gap: 10px; margin-top: 12px; }
    .brief-card { background: rgba(0, 0, 0, 0.28); border: 1px solid var(--border-soft); border-radius: 16px; padding: 12px 14px; }
    .brief-card p { line-height: 1.5; margin: 8px 0 0; overflow-wrap: anywhere; }
    .brief-card ul, .brief-card ol { margin: 8px 0 0; padding-left: 24px; }
    .brief-card li + li { margin-top: 8px; }
    .brief-card summary { cursor: pointer; font-weight: 700; }
    .brief-warning { color: var(--tint-orange); background: rgba(255, 159, 10, 0.12); border-radius: 12px; padding: 10px 12px; line-height: 1.45; }
    .brief-search-entry { width: 100%; min-height: 150px; border: 0; border-radius: 10px; background: #fff; margin-top: 10px; }

    @keyframes pulse-chip { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,69,58,0.4); } 50% { box-shadow: 0 0 10px 2px rgba(255,69,58,0.6); } }

    /* Tab Bar */
    .tab-bar {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;
      background: var(--bg-glass-deep); backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter);
      border-top: 1px solid var(--border-soft);
      padding: 10px 16px calc(env(safe-area-inset-bottom, 0px) + 10px);
      display: flex; justify-content: space-around;
    }
    .tab-item {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      color: var(--text-2); cursor: pointer; flex: 1; padding: 6px; transition: color 0.2s;
    }
    .tab-item.active { color: var(--accent); font-weight: 700; }
    .tab-icon { font-size: 20px; }
    .tab-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }

    /* Bottom Sheet Modal */
    .sheet-overlay {
      position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.6);
      opacity: 0; pointer-events: none; transition: opacity 0.3s var(--spring);
    }
    .sheet-overlay.open { opacity: 1; pointer-events: auto; }
    .sheet-modal {
      position: absolute; bottom: 0; left: 0; right: 0;
      background: #1C1C1E; border-top-left-radius: 32px; border-top-right-radius: 32px;
      padding: 24px 20px calc(env(safe-area-inset-bottom, 0px) + 24px);
      transform: translateY(100%); transition: transform 0.4s var(--spring);
      max-height: 90dvh; display: flex; flex-direction: column; gap: 16px; overflow-y: auto;
    }
    .sheet-overlay.open .sheet-modal { transform: translateY(0); }
    .sheet-handle { width: 40px; height: 5px; background: rgba(255,255,255,0.2); border-radius: 3px; margin: 0 auto 12px; }

    /* Toast Island */
    .toast-island, .toast {
      position: fixed; top: calc(env(safe-area-inset-top, 0px) + 16px); left: 50%; transform: translate(-50%, -20px) scale(0.9);
      background: var(--bg-glass-deep); backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter);
      color: var(--text-1); font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 99px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid var(--border-soft);
      z-index: 999; opacity: 0; pointer-events: none; transition: all 0.3s var(--spring);
    }
    .toast-island.show, .toast.show { opacity: 1; transform: translate(-50%, 0) scale(1); }
    .toast-island.bad, .toast.bad { border-color: var(--accent); color: var(--accent); }
    .x-feed-status { margin-top: 2px; }
    .x-feed-status[data-state="ok"] { color: var(--tint-green); }
    .x-feed-status[data-state="bad"] { color: var(--accent); font-weight: 600; }

    /* Counts */
    .counts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
    .count { background: rgba(0, 0, 0, 0.4); border: 1px solid var(--border-soft); border-radius: 12px; padding: 8px; text-align: center; }
    .count strong { display: block; font-size: 1.25rem; font-weight: 800; }
    .count span { font-size: .75rem; color: var(--text-2); text-transform: uppercase; }
    .count.live { border-color: var(--accent); }
    .count.warn { border-color: var(--tint-orange); }

    /* Desk Chips */
    .desk-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
    .desk-btn {
      min-height: 40px; padding: 8px 16px; border-radius: 99px;
      background: rgba(255, 255, 255, 0.1); border: 1px solid var(--border-soft);
      color: var(--text-2); font-family: inherit; font-size: 14px; font-weight: 700;
      cursor: pointer; transition: all 0.2s;
    }
    .desk-btn:active { transform: scale(0.96); }
    .desk-btn.active { background: var(--text-1); color: var(--bg-root); border-color: var(--text-1); font-weight: 800; }

    /* Preview Monitor */
    .preview-wrap {
      position: relative; background: rgba(0, 0, 0, 0.6); border-radius: 16px; overflow: hidden;
      border: 1px solid var(--border-soft); margin: 12px 0; display: flex; justify-content: center; align-items: center;
      padding: 16px; min-height: 220px; overscroll-behavior: contain;
    }
    .preview-frame { border: 0; background: rgba(255, 255, 255, 0.02); border-radius: 12px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.8); }
    .preview-9-16 { width: 220px; height: 391px; aspect-ratio: 9/16; }
    .preview-16-9 { width: 380px; height: 214px; aspect-ratio: 16/9; }

    /* Items & Queue */
    .item, .queue-item {
      background: rgba(255, 255, 255, 0.05); border-radius: 16px; padding: 14px; margin-bottom: 12px;
      border: 1px solid var(--border-soft); border-left: 6px solid var(--border-soft);
    }
    .item.onair, .queue-item.onair { border-left-color: var(--accent); border-color: var(--accent); background: rgba(255, 69, 58, 0.08); }
    .item h3 { margin: 0 0 6px; font-size: 1.05rem; }
    .item-head { display: flex; align-items: flex-start; gap: 8px; }
    .item-head h3 { flex: 1; }

    /* Detail Preview & Notes */
    .pv {
      background: rgba(0, 0, 0, 0.45); border-radius: 12px; padding: 12px; margin: 10px 0;
      border-left: 6px solid var(--tint-orange); max-height: 42dvh; overflow-y: auto; overscroll-behavior: contain;
    }
    .pv .q { margin: 10px -12px -12px; padding: 10px 12px; background: var(--tint-orange); color: #1A1204; font-weight: 800; border-radius: 0 0 10px 0; }

    /* CRID */
    .crid-card {
      background: rgba(0, 0, 0, 0.45); border: 2px solid var(--tint-orange); border-radius: 16px;
      padding: 14px; margin: 12px 0; box-shadow: 0 0 20px rgba(255, 159, 10, 0.2);
    }
    .verdict-box { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0; }
    .v-badge { padding: .4em .8em; border-radius: 8px; font-weight: 800; font-size: .88rem; text-transform: uppercase; display: inline-block; }
    .v-1 { background: rgba(50, 215, 75, 0.15); color: var(--tint-green); border: 1.5px solid var(--tint-green); box-shadow: 0 0 10px rgba(50, 215, 75, 0.3); }
    .v-0 { background: rgba(255, 69, 58, 0.15); color: var(--accent); border: 1.5px solid var(--accent); box-shadow: 0 0 10px rgba(255, 69, 58, 0.3); }

    /* Poll */
    .opt { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .opt .name { flex: 1; font-weight: 700; }
    .opt .btn, .opt .b { min-width: 64px; }
    .poll-error { display: none; color: #FF9A8D; background: rgba(138, 47, 37, 0.4); border: 1px solid var(--accent); border-radius: 12px; padding: 10px 14px; font-size: .9rem; margin: 6px 0 10px; }
    .poll-error.show { display: block; }

    /* Bulk actions */
    .bulk { display: grid; gap: 10px; background: rgba(0, 0, 0, 0.4); border: 1px solid var(--border-soft); border-radius: 16px; padding: 14px; margin: 12px 0; }
    .bulk .row { flex-wrap: wrap; }
    .bulk .row > * { flex: 1 1 130px; }
    .bulk-note { font-size: .85rem; color: var(--text-2); margin: 0; line-height: 1.4; }
    .bulk-note strong { color: var(--tint-orange); }
    .selectbox { width: auto !important; flex: 0 0 auto !important; accent-color: var(--accent); transform: scale(1.3); margin-right: 6px; }

    /* Feeds & Twitch boxes */
    .feed-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 10px; margin: 8px 0; }
    .feed-check { display: flex; align-items: center; gap: 8px; font-size: .85rem; color: var(--text-2); }
    .feed-check input { width: auto; flex: 0 0 auto; accent-color: var(--tint-blue); }
    .twitch-box { background: rgba(0, 0, 0, 0.4); border: 1px solid var(--border-soft); border-radius: 16px; padding: 14px; margin: 10px 0; font-size: .9rem; }
    .twitch-box p { margin: 6px 0; }
    .setup { font-size: .85rem; color: var(--text-2); margin: 8px 0 0; padding-left: 1.2em; }
    .setup li { margin: 4px 0; }
    .statusline { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .statusline .sub { flex: 1 1 180px; }
    .twitch-state { font-weight: 800; }
    .twitch-state.ok { color: var(--tint-green); }
    .twitch-state.bad { color: var(--accent); }
    .twitch-state.wait { color: var(--tint-orange); }
    .warnbox { background: rgba(255, 159, 10, 0.15); border: 1px solid var(--tint-orange); color: #FFD15C; border-radius: 12px; padding: 10px 14px; font-size: .88rem; }

    /* Metrics */
    .metrics-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .metric-box { background: rgba(255, 255, 255, 0.05); padding: 12px; border-radius: 16px; text-align: center; }
    .metric-val { font-size: 24px; font-weight: 800; margin-bottom: 4px; }
  `;
  const style = h("style"); style.textContent = CSS; document.head.append(style);
  document.title = "Cyber Live Desk";

  // ---------- Sheet Modal Component ----------
  const sheetWrap = h("div", "sheet-overlay");
  const sheetContent = h("div", "sheet-modal");
  sheetWrap.append(sheetContent);
  sheetWrap.onclick = (e) => { if (e.target === sheetWrap) closeSheet(); };

  const closeSheet = () => {
    sheetWrap.classList.remove("open");
    setTimeout(() => { if (!sheetWrap.classList.contains("open")) sheetContent.innerHTML = ""; }, 400);
  };

  const openSheet = (contentNodes) => {
    haptic('light');
    sheetContent.replaceChildren(h("div", "sheet-handle"), ...contentNodes);
    sheetWrap.classList.add("open");
  };

  // Replaces <select> with a massive touch-target bottom sheet
  const SelectSheet = (title, options, onSelect) => {
    const list = h("div", "stack", 
      ...options.map(o => btn(o.label, () => {
        closeSheet();
        if (onSelect) onSelect(o.value);
      }, "giant " + (o.active ? "primary" : "")))
    );
    openSheet([
      h("h2", { style: "text-align:center; margin-bottom: 16px;" }, title),
      list,
      btn("Cancel", closeSheet, "giant danger", 'light')
    ]);
  };

  // ---------- Tab Bar Router ----------
  const TABS = [
    { id: "live", icon: "🔴", label: "Live" },
    { id: "topics", icon: "📋", label: "Topics" },
    { id: "crid", icon: "🏛", label: "CRID" },
    { id: "community", icon: "👥", label: "Community" },
    { id: "studio", icon: "🎛", label: "Studio" },
    { id: "settings", icon: "⚙️", label: "Settings" }
  ];

  const renderTabBar = () => {
    return h("div", "tab-bar", 
      ...TABS.map(t => {
        const isActive = currentTab === t.id;
        const fn = () => {
          if (currentTab !== t.id) {
            currentTab = t.id;
            haptic('light');
            renderApp();
            if (currentTab === "studio" && (!audiomackTracks.children.length || audiomackStatus.textContent.includes("loading"))) {
              loadAudiomack();
            }
          }
        };
        // FIX: merge class and onclick into one props object so h() never
        // treats { onclick } as a child and serialises it as "[object Object]"
        return h("div", { class: "tab-item" + (isActive ? " active" : ""), onclick: fn },
          h("span", "tab-icon", t.icon),
          h("span", "tab-label", t.label)
        );
      })
    );
  };

  const statusEl = h("section", "panel status");
  const holdBtn = btn("Hold card", () => act("hold"));
  const srcBtn = btn("Show source", () => act("source"));
  const modeBtn = btn("X feed", async () => {
    await act("mode", { mode: state?.mode === "x-following" ? "cards" : "x-following" });
    if (state?.mode === "x-following") void checkXFeed({ force: true });
  });

  // Shortcuts are opt-in per tab. These two elements are referenced by the voice
  // panel below; their definitions were dropped in 71bfd88 while the usages
  // stayed, which threw a ReferenceError on first render and left the page blank.
  const keyboardStatus = h("p", "sub", "Keyboard shortcuts are off.");
  const keyboardButton = btn("Enable shortcuts", () => {
    keyboardEnabled = !keyboardEnabled;
    keyboardButton.textContent = keyboardEnabled ? "Disable shortcuts" : "Enable shortcuts";
    keyboardButton.classList.toggle("primary", keyboardEnabled);
    keyboardStatus.textContent = keyboardEnabled ? "Shortcuts are enabled for this tab only." : "Keyboard shortcuts are off.";
  }, "small");

  const voicePanel = h("section", "panel voice-panel",
    h("h2", {}, "Voice & keyboard controls"),
    h("p", "sub", "CRID voice control. Press “CRID Listen” to capture a command; press “Stop Listen” to cancel."),
    h("div", "row",
      btn("CRID Listen", startVoice, "primary"),
      btn("Stop Listen", stopVoice),
    ),
    h("p", "sub", "Voice is opt-in and one-shot. It listens only to the controller device after you press the button; it does not listen to Swae’s broadcast audio. Use a separate device while streaming, or type the topic. Browser speech recognition may process audio using its own provider; only recognized text is sent to the authenticated controller API."),
    h("p", "sub", "For private research, say “crid research” plus a topic, then “crid deeper” and an optional angle, “crid refresh”, “crid read”, or “crid quiet”. These are not public Swae chat commands and never publish to the viewer overlay."),
    h("p", "sub", "Music voice commands: “crid music play” starts the first queued track, or YE — MAMA'S FAVORITE if the queue is empty. “crid music play” plus a song or artist uses one unique queue match first, then searches YouTube automatically on a miss when the server-only YOUTUBE_API_KEY is configured. “crid music pause”, “crid music next”, and “crid music stop” control playback."),
    h("p", "sub", "Other actions still use the server’s voice safety list."),
    h("div", "twitch-box",
      h("strong", {}, "Keyboard shortcuts (Ctrl + Shift)"),
      h("p", "sub", "Shortcuts start off. Enable them for this tab; they are ignored while typing, composing text, or when a sheet is open."),
      keyboardStatus,
      h("div", "row", keyboardButton),
      h("p", "sub", "→ Next card · ← Previous card · Space Toggle hold.")));

  const briefTopicInput = h("input", { type: "text", maxLength: 120, autocomplete: "off", placeholder: "e.g. Lagos TikTok trends around a current story" });
  const briefFocusInput = h("input", { type: "text", maxLength: 120, autocomplete: "off", placeholder: "Optional angle: local impact, who benefits, what is disputed…" });
  const briefIncludeX = h("input", { type: "checkbox", checked: false });
  const briefIncludeXLabel = h("label", { class: "row", style: "align-items:center;gap:8px" }, briefIncludeX, h("span", {}, "Include live X trends for this request only (optional; may be pay-per-use)"));
  const briefStatusEl = h("p", "sub", "No private brief yet.");
  const briefBody = h("div", "brief-body");
  const briefResearchBtn = btn("Research topic", () => runBriefCommand({ verb: "research", topic: briefTopicInput.value.trim(), focus: briefFocusInput.value.trim() }), "small primary");
  const briefDeeperBtn = btn("Go deeper", () => runBriefCommand({ verb: "deeper", focus: briefFocusInput.value.trim() }), "small");
  const briefRefreshBtn = btn("Refresh", () => runBriefCommand({ verb: "refresh", focus: briefFocusInput.value.trim() }), "small");
  const briefReadBtn = btn("Read aloud", () => runBriefCommand({ verb: "read" }), "small");
  const briefStopBtn = btn("Stop speaking", () => runBriefCommand({ verb: "quiet" }), "small");
  const briefClearBtn = btn("Clear", () => runBriefAction("clear"), "small danger");
  briefTopicInput.addEventListener("input", () => drawBrief());
  briefTopicInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void runBriefCommand({ verb: "research", topic: briefTopicInput.value.trim() });
    }
  });

  const stopBriefSpeech = () => {
    try { window.speechSynthesis?.cancel(); } catch { /* browser speech is optional */ }
    briefUtterance = null;
  };
  const speakBrief = () => {
    const stale = brief && serverNow() - brief.generatedAt > brief.windowHours * 3_600_000;
    if (!brief || brief.status === "thin" || stale || !brief.readAloud) {
      toast("There is no current, source-linked brief to read. Research or refresh first.", true);
      return false;
    }
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") {
      toast("This browser does not support local read-aloud.", true);
      return false;
    }
    stopBriefSpeech();
    const utterance = new SpeechSynthesisUtterance(brief.readAloud.replace(/\[(?:R|X)\d+\]/g, "").trim());
    utterance.lang = "en-NG";
    utterance.rate = 1;
    briefUtterance = utterance;
    window.speechSynthesis.speak(utterance);
    toast("Reading the private brief in this browser.");
    return true;
  };

  const runBriefAction = async (action, extra = {}) => {
    if (briefBusy) return false;
    briefBusy = true;
    briefLastError = "";
    const request = { action, ...extra };
    if (["open", "deeper", "refresh"].includes(action)) {
      request.includeX = briefIncludeX.checked;
      briefIncludeX.checked = false;
    }
    drawBrief();
    try {
      const result = await api("/api/desk/brief", request);
      brief = result.brief;
      if (action === "clear") {
        stopBriefSpeech();
        briefTopicInput.value = "";
        briefFocusInput.value = "";
        briefIncludeX.checked = false;
        toast("Private brief cleared.");
      } else if (brief) {
        briefTopicInput.value = brief.topic || briefTopicInput.value;
        briefFocusInput.value = brief.focus || briefFocusInput.value;
        toast(brief.status === "thin" ? "Fresh evidence is limited; review sources before using." : "Brief updated. Check the evidence and counterpoint.", brief.status === "thin");
      }
      drawBrief();
      return Boolean(brief) || action === "clear";
    } catch (error) {
      briefLastError = error.message || "Brief request failed.";
      toast(briefLastError, true);
      drawBrief();
      return false;
    } finally {
      briefBusy = false;
      drawBrief();
    }
  };

  const runBriefCommand = async (command) => {
    if (command.verb === "research") {
      const topic = String(command.topic || briefTopicInput.value || "").trim();
      if (!topic) {
        toast("Say “crid research” followed by a topic, or type one above.", true);
        return false;
      }
      briefTopicInput.value = topic.slice(0, 120);
      if (command.focus != null) briefFocusInput.value = String(command.focus).slice(0, 120);
      return runBriefAction("open", { topic: briefTopicInput.value, focus: briefFocusInput.value.trim() });
    }
    if (command.verb === "deeper") {
      if (command.focus != null) briefFocusInput.value = String(command.focus).slice(0, 120);
      return runBriefAction("deeper", { focus: briefFocusInput.value.trim() });
    }
    if (command.verb === "refresh") return runBriefAction("refresh", { focus: briefFocusInput.value.trim() });
    if (command.verb === "read") return speakBrief();
    if (command.verb === "quiet") {
      stopBriefSpeech();
      toast("Private read-aloud stopped.");
      return true;
    }
    return false;
  };

  const briefText = (value) => {
    const parts = String(value ?? "").split(/(\[(?:R|X)\d+\])/g);
    return parts.map((part) => {
      const match = part.match(/^\[(R|X)(\d+)\]$/);
      if (!match || !brief) return part;
      const source = match[1] === "R"
        ? brief.sources?.find((item) => item.ref === part)
        : brief.xTrends?.[Number(match[2]) - 1];
      const href = source?.url;
      if (!href || !/^https:\/\//i.test(href)) return part;
      return h("a", { href, target: "_blank", rel: "noopener noreferrer", title: source.title || source.name || "Open evidence source" }, part);
    });
  };

  const drawBrief = () => {
    const stale = brief && serverNow() - brief.generatedAt > brief.windowHours * 3_600_000;
    briefResearchBtn.disabled = briefBusy || !briefTopicInput.value.trim();
    briefDeeperBtn.disabled = briefBusy || !brief || stale || brief.status === "thin" || brief.depth >= (brief.maxDepth || 3);
    briefRefreshBtn.disabled = briefBusy || !brief;
    briefReadBtn.disabled = briefBusy || !brief || brief.status === "thin" || stale;
    briefStopBtn.disabled = !window.speechSynthesis?.speaking;
    briefClearBtn.disabled = briefBusy || !brief;
    briefStatusEl.textContent = briefBusy
      ? "Searching fresh sources… this is a one-shot request."
      : briefLastError
        ? `Request failed: ${briefLastError}`
        : !brief
          ? "No private brief yet. Choose a topic and research when you want; nothing runs automatically."
          : stale
            ? `STALE — generated ${fmt(new Date(brief.generatedAt).toISOString())}. Refresh before reading or using it on air.`
            : brief.status === "thin"
              ? `THIN — ${brief.freshCount || 0} dated headlines · ${brief.searches || 0} Google Search queries · ${brief.groundedCount || 0} grounded links · ${brief.xTrendCount || 0} X terms. Do not treat this as verified.`
              : `${brief.status === "platform-only" ? "PLATFORM SIGNAL ONLY" : "FRESH WINDOW"} · ${brief.freshCount || 0} dated headlines · ${brief.searches || 0} Google Search queries · ${brief.groundedCount || 0} grounded links · ${brief.xTrendCount || 0} X trends · ${brief.evidenceCoverage || "limited"} coverage · depth ${brief.depth}/${brief.maxDepth || 3}`;

    const content = [];
    if (brief) {
      content.push(h("div", "brief-card",
        h("h3", {}, brief.headline || "Fresh evidence is limited"),
        h("p", "sub", `Topic: ${brief.topic}${brief.focus ? ` · angle: ${brief.focus}` : ""} · generated ${fmt(new Date(brief.generatedAt).toISOString())} · last ${brief.windowHours} hours`)));
      if (brief.note) content.push(h("p", "brief-warning", brief.note));
      if (brief.xNote) content.push(h("p", "brief-warning", brief.xNote));
      if (brief.summary) content.push(h("div", "brief-card", h("strong", {}, "What is reported"), h("p", {}, briefText(brief.summary))));
      if (brief.why) content.push(h("div", "brief-card", h("strong", {}, "Why it may matter (analysis, not fact)"), h("p", {}, briefText(brief.why))));
      if (brief.counterpoint) content.push(h("div", "brief-card", h("strong", {}, "Counterpoint / what this does not prove"), h("p", {}, briefText(brief.counterpoint))));
      if (brief.verify) content.push(h("div", "brief-card", h("strong", {}, "What would change the assessment"), h("p", {}, briefText(brief.verify))));
      if (brief.points?.length) content.push(h("div", "brief-card", h("strong", {}, "Evidence-linked angles"), h("ul", {}, brief.points.map((point) => h("li", {}, briefText(point.text))))));
      if (brief.chatQuestion) content.push(h("div", "brief-card", h("strong", {}, "Chat prompt"), h("p", {}, brief.chatQuestion)));
      if (brief.xTrends?.length) {
        content.push(h("div", "brief-card",
          h("strong", {}, `Live X snapshot — ${brief.xRegion || "configured location"}`),
          h("p", "sub", `Observed ${fmt(brief.xObservedAt)}. This is a live conversation signal, not proof of a trend’s cause or a TikTok ranking.`),
          h("ol", {}, brief.xTrends.map((trend, index) => h("li", {},
            briefText(`[X${index + 1}]`), " ", trend.name,
            trend.tweetCount == null ? "" : ` · ${Number(trend.tweetCount).toLocaleString()} posts`)))));
      }
      if (brief.sources?.length) {
        content.push(h("div", "brief-card",
          h("strong", {}, "Sources (private controller only)"),
          h("ol", "brief-sources", brief.sources.map((source) => h("li", {},
            h("a", { href: source.url, target: "_blank", rel: "noopener noreferrer" }, `[${source.ref}] ${source.title}`),
            h("span", "sub", source.publishedAt ? ` · published ${fmt(source.publishedAt)}` : " · publication time not verified"))))));
      }
      if (brief.supportSegments?.length) {
        content.push(h("details", "brief-card",
          h("summary", {}, "Grounded web claim-to-source matches"),
          h("ol", {}, brief.supportSegments.map((segment) => h("li", {},
            segment.text, " — ", segment.sources.map((index) => {
              const source = brief.sources?.[index];
              return source ? h("a", { href: source.url, target: "_blank", rel: "noopener noreferrer" }, `[${source.ref}]`) : "";
            }))))));
      }
      if (brief.searchEntryPoint) {
        const frame = h("iframe", { class: "brief-search-entry", title: "Google Search grounding suggestions", referrerPolicy: "no-referrer" });
        frame.setAttribute("sandbox", "allow-popups");
        frame.srcdoc = brief.searchEntryPoint;
        content.push(h("details", "brief-card", h("summary", {}, "Search suggestions"), frame));
      }
      if (brief.manualSources?.length) {
        content.push(h("div", "brief-card",
          h("strong", {}, "Manual platform checks"),
          h("p", "sub", "TikTok is not scraped or represented as a complete feed. Open its official trend surface and verify region/period yourself."),
          h("div", "row", brief.manualSources.map((source) => h("a", { class: "btn small", href: source.url, target: "_blank", rel: "noopener noreferrer" }, source.title)))));
      }
    }
    briefBody.replaceChildren(...content);
  };

  window.addEventListener("pagehide", stopBriefSpeech, { once: true });
  const briefPanel = h("section", "panel brief-panel",
    h("h2", {}, "Private research brief"),
    h("p", "sub", "Swae-first and private: this brief is visible only in the authenticated controller. Nothing is posted to Swae chat or the public /desk overlay."),
    h("label", { class: "f" }, h("span", {}, "Topic to research"), briefTopicInput),
    h("label", { class: "f" }, h("span", {}, "Angle to prioritize (optional)"), briefFocusInput),
    briefIncludeXLabel,
    briefStatusEl,
    h("div", "row", briefResearchBtn, briefDeeperBtn, briefRefreshBtn),
    h("div", "row", briefReadBtn, briefStopBtn, briefClearBtn),
    h("p", "sub", "Each request runs once: dated Google News RSS plus Gemini Google Search grounding. Search grounding requires a paid-tier project; included monthly quota may apply, and additional queries can be billed. X is off unless you opt in for that single request. Nothing polls or listens in the background. TikTok Creative Center remains a manual check."),
    briefBody);
  drawBrief();

  // ---------- Swae / Twitch Landscape Overlay Preview ----------
  let previewRatio = "16-9"; // Default to the user's landscape Twitch scene
  const previewFrame = h("iframe", { class: "preview-frame preview-16-9", src: "/desk?debug=0", title: "Swae landscape Twitch overlay preview" });
  const btnRatio916 = btn("Vertical (9:16)", () => setPreviewRatio("9-16"), "small");
  const btnRatio169 = btn("Landscape (16:9)", () => setPreviewRatio("16-9"), "small primary");
  const setPreviewRatio = (r) => {
    previewRatio = r;
    previewFrame.className = `preview-frame preview-${r}`;
    btnRatio916.classList.toggle("primary", r === "9-16");
    btnRatio916.classList.toggle("go", r === "9-16");
    btnRatio169.classList.toggle("primary", r === "16-9");
    btnRatio169.classList.toggle("go", r === "16-9");
  };
  const copySwaeUrl = () => {
    // The overlay forces its own placement and detects Swae on its own, so the plain URL
    // is the correct thing to paste into a Swae Browser Widget.
    const url = `${location.origin}/desk`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => toast("Copied Swae URL to clipboard!")).catch(() => prompt("Swae Overlay URL:", url));
    } else {
      prompt("Swae Overlay URL:", url);
    }
  };
  const copySwaePipUrl = () => {
    const url = `${location.origin}/desk?scene=pip`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => toast("Copied dual-camera PiP URL!")).catch(() => prompt("Swae PiP Overlay URL:", url));
    } else {
      prompt("Swae PiP Overlay URL:", url);
    }
  };
  const reloadPreview = () => {
    try { previewFrame.src = "/desk?debug=0&r=" + Date.now(); } catch { /* ignore */ }
    toast("Preview refreshed");
  };
  const previewPanel = h("section", "panel preview-panel",
    h("div", { class: "row", style: "justify-content:space-between;margin-bottom:8px" },
      h("h2", { style: "margin:0" }, "Swae Live Preview"),
      h("div", { class: "row", style: "flex:0 0 auto;gap:4px" },
        btnRatio916, btnRatio169,
        btn("↻", reloadPreview, "small"),
        btn("Copy Swae URL", copySwaeUrl, "small"),
        btn("Copy PiP URL", copySwaePipUrl, "small"))),
    h("div", "preview-wrap", previewFrame),
    h("p", "sub", "Landscape 16:9 preview of the /desk overlay. Add the copied URL as a Swae Browser Widget or Web Page layer. Swae redraws the page as snapshots — about 5 per second by default — so it is never as smooth as this preview, and its stream audio is microphone-only: anything playing in the overlay is heard on the phone, not on the broadcast. Use the larger widget size or a lower frame rate if the device struggles. Private research stays in /control."),
    h("p", "sub", "The PiP URL only reserves the bottom-right area; add or position the second-camera layer separately in Swae or OBS."));

  // ---------- CRID (Cyber's Rent Is Due) Segment ----------
  const cridPanel = h("section", "panel crid-panel");
  const cridKindSel = h("select", {},
    h("option", { value: "music" }, "Music"),
    h("option", { value: "topic" }, "Topic"),
    h("option", { value: "news" }, "News"),
    h("option", { value: "debate" }, "Debate"),
    h("option", { value: "question" }, "Question"));
  const cridTitleIn = h("input", { placeholder: "Subject / Album / Debate (e.g. Does this album survive the Jumbotron?)", maxlength: 120 });
  const cridCreditIn = h("input", { placeholder: "Stranger credit / community handle (optional)", maxlength: 30 });
  const cridAudioIn = h("input", { placeholder: "Audio URL (MP3/AAC/WebM) — heard on the overlay device only", maxlength: 2000 });

  const renderCridDeck = () => {
    cridPanel.replaceChildren();
    const crid = state?.crid;
    if (crid) {
      const vBadge = crid.verdict === 1
        ? h("span", "v-badge v-1", "✔ RENT PAID (1)")
        : crid.verdict === 0
        ? h("span", "v-badge v-0", "✖ STILL OWING (0)")
        : h("span", "sub", "Awaiting Operator Verdict");

      const pollInfo = crid.result
        ? h("p", "sub", crid.result.tie ? "Strangers' Poll: TIE (50/50)" : `Strangers' Poll: ${crid.result.winner} (${crid.result.percent}%) · ${crid.result.total} votes`)
        : state?.poll?.active
        ? h("p", "sub", `Live Poll in progress: ${state.poll.question}`)
        : null;

      cridPanel.append(
        h("div", { class: "row", style: "justify-content:space-between;margin-bottom:6px" },
          h("h2", { style: "margin:0" }, `CRID #${crid.entry} — Jumbotron Active`),
          h("span", "chip ok", crid.kind.toUpperCase())),
        h("div", "crid-card",
          h("h3", { style: "margin:0 0 6px;font-size:1.15rem;color:#FFF" }, crid.title),
          crid.credit ? h("p", "sub", "Suggested by Stranger: ", h("strong", { style: "color:#FFB224" }, crid.credit)) : null,
          h("div", { style: "margin:8px 0" }, vBadge),
          pollInfo),
        h("div", "verdict-box",
          btn("✔ STAMP: RENT PAID (1)", () => act("crid-verdict", { value: 1 }), "giant " + (crid.verdict === 1 ? "primary active-toggle" : "primary"), "heavy"),
          btn("✖ STAMP: STILL OWING (0)", () => act("crid-verdict", { value: 0 }), "giant " + (crid.verdict === 0 ? "danger active-toggle" : "danger"), "heavy")),
        crid.audioUrl ? h("div", "row",
          btn(crid.audioPlaying ? "⏸ Pause Audio" : "▶ Play Audio", () => act("crid-audio", { playing: !crid.audioPlaying }), "small " + (crid.audioPlaying ? "active-toggle" : "primary")),
          btn(crid.audioMuted ? "🔊 Unmute" : "🔇 Mute", () => act("crid-audio", { muted: !crid.audioMuted }), "small " + (crid.audioMuted ? "active-toggle" : ""))) : null,
        h("div", "row",
          !state?.poll?.active && !crid.result ? btn("Start Rent Poll", () => act("start-poll", { question: crid.title, options: ["Rent Paid", "Still Owing"] }), "small primary") : null,
          btn("Close CRID Segment", () => act("crid-close"), "small danger", "heavy")));
    } else {
      cridPanel.append(
        h("h2", {}, "CRID — Cyber's Rent Is Due", h("span", { class: "chip" }, "Jumbotron")),
        h("p", "sub", "Broadcast a live topic or debate to the viewer jumbotron. Credit a Stranger and stamp rent verdicts."),
        h("label", "f", h("span", {}, "Segment Kind"), cridKindSel),
        h("label", "f", h("span", {}, "Segment Title / Subject (max 120 chars)"), cridTitleIn),
        h("label", "f", h("span", {}, "Stranger Credit (community member, max 30 chars)"), cridCreditIn),
        h("label", "f", h("span", {}, "Audio URL (MP3 / AAC / WebM)"), cridAudioIn),
        h("p", "sub", "Plays on whatever device renders the overlay. Swae broadcasts microphone audio only, so this is not heard on the stream there; a desktop browser source that routes its audio is the way to get it on air."),
        btn("Open Jumbotron Segment", async () => {
          const title = cridTitleIn.value.trim();
          if (!title) return toast("Enter a segment title", true);
          await act("crid-open", { kind: cridKindSel.value, title, credit: cridCreditIn.value.trim() || undefined, audioUrl: cridAudioIn.value.trim() || undefined });
          cridTitleIn.value = "";
          cridCreditIn.value = "";
          cridAudioIn.value = "";
        }, "primary giant", "heavy"));
    }
  };

  // ---------- CRID, the mascot ----------
  // The bot is drawn inside the overlay by the viewer page and reacts to the desk on his own.
  // This panel controls visibility, the live subscription baseline and one-off gestures. The
  // gesture list comes from the command parser, so a button cannot ask for a rejected reaction.
  const botPanel = h("section", "panel crid-bot-panel");
  const renderBotPanel = () => {
    const on = state?.bot?.on !== false;
    const last = state?.bot?.react;
    const subs = Number.isSafeInteger(state?.bot?.subs) ? state.bot.subs : 0;
    const subsInput = h("input", { type: "number", min: "0", max: "10000000", step: "1", value: String(subs), inputMode: "numeric", "aria-label": "Current stream subscriber total" });
    botPanel.replaceChildren(
      h("h2", {}, "CRID — the mascot", h("span", { class: on ? "chip ok" : "chip" }, on ? "ON AIR" : "OFF AIR")),
      h("p", "sub", "CRID lives in the overlay: he grooms, dozes and reacts to the desk on his own. The switch is the one the overlay reads. A reaction is a single gesture, and asking for the same one twice is two gestures, not one ignored."),
      h("div", "row",
        btn(on ? "Take CRID off the air" : "Put CRID back on the air", () => act("bot"), (on ? "danger " : "primary ") + "giant", "heavy"),
        last ? h("span", "sub", `Last sent: ${last.kind}`) : null),
      h("p", "sub", "Set the current stream total (for example, 42). Each verified sub or gifted-sub event adds to it; Bits trigger the reaction without changing the sub count."),
      h("div", "row",
        h("label", "f", h("span", {}, "Current stream sub total"), subsInput),
        btn("Save total", () => {
          const count = subsInput.valueAsNumber;
          if (!Number.isSafeInteger(count) || count < 0 || count > 10_000_000) return toast("Enter a whole-number total from 0 to 10,000,000.", true);
          void act("bot-subs", { count });
        }, "small")),
      h("div", "grid", ...BOT_REACTS.map((kind) =>
        btn(kind.toUpperCase(), () => act("bot-react", { kind }), "small"))));
  };

  // ---------- desks ----------
  // The manual side of what chat can say. The server owns the list and sends it with the cards,
  // so this selector and a "desk <name>" command can never drift apart.
  const deskSel = h("select", { onchange: () => act("desk", { desk: deskSel.value }) });
  const deskChipsEl = h("div", "desk-chips");
  const drawDesks = () => {
    const want = state?.desk ?? "all";
    deskSel.replaceChildren(
      h("option", { value: "all" }, "All desks"),
      ...desks.map((d) => h("option", { value: d.id }, `${d.label} desk (${d.count} approved)`)));
    deskSel.value = want === "all" || desks.some((d) => d.id === want) ? want : "all";

    deskChipsEl.replaceChildren(
      h("button", { type: "button", class: `desk-btn ${want === "all" ? "active" : ""}`, onclick: () => act("desk", { desk: "all" }) }, "All Desks"),
      ...desks.map((d) => h("button", {
        type: "button",
        class: `desk-btn ${want === d.id ? "active" : ""}`,
        onclick: () => act("desk", { desk: d.id })
      }, `${d.label} (${d.count})`)));
  };

  const controlsEl = h("section", "panel",
    h("h2", {}, "Fast Controls", h("span", { class: "sub", style: "font-weight:normal" }, "Touch targets for live stream")),
    h("label", "f", h("span", {}, "Topic Desks (click to filter on air queue)"), deskChipsEl),
    h("div", { class: "grid", style: "margin-bottom:8px" },
      btn("Next card ▶", () => act("next"), "primary giant", "heavy"),
      btn("◀ Previous", () => act("previous"), "giant", "light")),
    h("div", "grid",
      holdBtn, srcBtn, modeBtn,
      btn("Street question", () => streetQuestion()),
      btn("Hide overlay", () => act("hide"), "danger", "heavy")));

  // ---------- automation and research approval ----------
  // Auto-play and auto research only move or file what the operator has approved (or what the
  // persisted research mode explicitly auto-approves). Hold, Hide, Next and Show still win.
  const autoPlayBtn = btn("Auto-play: off", () => act("auto-play"));
  const autoResearchBtn = btn("Scheduled card intake: off", () => act("auto-research"));
  const autoNote = h("p", "sub");
  const autoWarn = h("div", "warnbox");
  autoWarn.hidden = true;

  // The approval mode is persisted, not a request parameter, so the scheduled function reads
  // exactly the same rule the manual fetch does. The browser can only change the setting.
  const approvalModeSel = h("select", {
    onchange: () => { approvalDirty = true; drawApprovalMode(); },
  },
    h("option", { value: "manual" }, "Manual — every incoming card waits for me"),
    h("option", { value: "trusted" }, "Trusted feeds — auto-approve the feeds I tick"),
    h("option", { value: "all" }, "All incoming — auto-approve every research card"));
  const trustedWrap = h("div", "feed-grid");
  const approvalNote = h("p", "sub");
  const heldNote = h("p", "sub");
  const heldList = h("div");

  const approvalSaveBtn = btn("Save approval mode", () => saveApproval(), "primary small");
  const approvalWords = () => ({ manual: "Manual", trusted: "Trusted feeds", all: "All incoming" }[approvalModeSel.value] || "Manual");
  const updateApprovalNote = () => {
    const mode = approvalModeSel.value;
    const checked = trustedWrap.querySelectorAll("input[data-feed]:checked").length;
    approvalNote.textContent =
      mode === "all" ? "Manual and any configured scheduled card imports approve every new card automatically. They can enter on-air rotation when auto-play is on; approval does not change the card on screen now. The public RSS ticker is separate."
        : mode === "trusted" ? (checked ? `${checked} feed${checked === 1 ? "" : "s"} auto-approve their cards. Everything else stays pending. This rule applies to manual and any configured scheduled imports; the RSS ticker is separate.` : "Tick at least one trusted feed. Until then every imported card stays pending.")
          : "Imported research cards are not approved automatically. The public RSS ticker is separate from card approval.";
    approvalSaveBtn.textContent = approvalDirty ? "Save approval mode •" : "Save approval mode";
  };

  const drawApprovalMode = () => {
    if (!approvalDirty) approvalModeSel.value = state?.researchApprovalMode ?? research.approvalMode ?? "manual";
    const mode = approvalModeSel.value;
    trustedWrap.hidden = mode !== "trusted";
    if (!approvalDirty) {
      if (trustedWrap.children.length !== feeds.length) {
        trustedWrap.replaceChildren(...feeds.map((f) => h("label", "feed-check",
          h("input", {
            type: "checkbox", "data-feed": f.id,
            onchange: () => { approvalDirty = true; updateApprovalNote(); },
          }),
          `${f.label} (${f.category})`)));
      }
      const chosen = new Set(research.trustedFeedIds ?? []);
      for (const input of trustedWrap.querySelectorAll("input[data-feed]")) input.checked = chosen.has(input.dataset.feed);
    }
    updateApprovalNote();
  };

  const saveApproval = async () => {
    const trustedFeedIds = [...trustedWrap.querySelectorAll("input[data-feed]:checked")].map((i) => i.dataset.feed);
    const j = await act("research-approval", { mode: approvalModeSel.value, trustedFeedIds });
    if (!j) return;
    approvalDirty = false;
    await load();
    toast(`Research approval: ${approvalWords()}.`);
  };

  const drawAutomation = () => {
    autoPlayBtn.textContent = state?.autoPlay ? "Auto-play: on" : "Auto-play: off";
    autoPlayBtn.classList.toggle("on", !!state?.autoPlay);
    autoResearchBtn.textContent = state?.autoResearch ? "Scheduled card intake: on" : "Scheduled card intake: off";
    autoResearchBtn.classList.toggle("on", !!state?.autoResearch);
    autoWarn.hidden = !state?.autoPlay;
    autoWarn.textContent = "Auto-play is on. Approved cards can enter on-air rotation when the current card expires. Approving a card never changes the card that is on screen now.";
    const approved = cards.filter((c) => c.approval === "approved").length;
    autoNote.textContent =
      (state?.autoPlay
        ? `On air: cards move on by themselves when their seconds run out (${approved} approved). Hold or Hide stops it.`
        : "On air: nothing moves unless you tap it.") +
      " " +
      (state?.autoResearch
        ? "Scheduled card intake is enabled in settings, but no recurring production trigger is configured, so it will not fetch on a timer."
        : "Scheduled card intake is off; manual card research still works.") +
      " Public headlines are separate: free date-stamped Google News RSS, filtered to the last 12 hours, refreshed every 5 minutes while /desk is open, and rotated every 12 seconds. RSS headlines are not Gemini-verified.";
    drawApprovalMode();
    const held = Number(research.held) || 0;
    const max = Number(research.maxPending) || 60;
    heldNote.textContent = held
      ? `${held} researched item${held === 1 ? " is" : "s are"} held because the unread queue is full (${max} cards). They are retried before new headlines on the next research run; nothing was discarded.`
      : `No research is waiting in the held bucket. The unread research queue holds ${max} cards at most.`;
    heldBtn.textContent = held ? `Retry held now (${held})` : "Retry held now";
    heldBtn.disabled = !held;
    const heldItems = (research.heldItems ?? []).slice(0, 8);
    heldList.replaceChildren(...heldItems.map((x) =>
      h("p", "sub", `${x.headline} — ${x.feedLabel || x.feedId || "feed"}, held ${fmt(new Date(x.heldAt).toISOString())}`)));
  };

  const heldBtn = btn("Retry held now", () => runResearchNow({ heldOnly: true }), "small");
  const autoEl = h("section", "panel", h("h2", {}, "Automation & approvals"),
    h("div", "grid", autoPlayBtn, autoResearchBtn), autoNote, autoWarn,
    h("h3", { style: "margin:12px 0 6px;font-size:.95rem" }, "Research approval mode"),
    h("label", "f", h("span", {}, "What happens to incoming research"), approvalModeSel),
    trustedWrap, approvalNote,
    h("div", { style: "height:8px" }), approvalSaveBtn,
    h("div", { class: "twitch-box" }, heldNote, heldBtn, heldList));

  // ---------- live poll ----------
  // Separate answer boxes make the 2-or-3 rule visible before sending. A poll validation error
  // is shown here, never through the card editor or a card-creation message.
  const pq = h("input", { placeholder: "Leave blank to use the card's question", maxlength: 140 });
  const p1 = h("input", { placeholder: "Option 1", maxlength: 40 });
  const p2 = h("input", { placeholder: "Option 2", maxlength: 40 });
  const p3 = h("input", { placeholder: "Option 3 (optional)", maxlength: 40 });
  const pollError = h("div", "poll-error");
  const clearPollError = () => { pollError.classList.remove("show"); pollError.textContent = ""; };
  const showPollError = (msg) => { pollError.textContent = msg; pollError.classList.add("show"); };
  for (const el of [pq, p1, p2, p3]) el.addEventListener("input", clearPollError);
  const startPoll = async () => {
    const draft = validatePollDraft(pq.value, [p1.value, p2.value, p3.value]);
    if (draft.error) { showPollError(draft.error); return; }
    if (busy) return;
    clearPollError();
    busy = true; document.body.classList.add("busy");
    try {
      // Poll errors stay in the poll panel. They are never routed through the card editor or a
      // card-creation toast, even when the server refuses a blank question.
      const j = await api("/api/desk/action", { action: "start-poll", question: draft.question, options: draft.options });
      state = j.state; offset = j.serverNow - Date.now(); renderLive();
      pq.value = ""; p1.value = ""; p2.value = ""; p3.value = "";
      toast("Poll started.");
    } catch (e) { showPollError(e.message); }
    finally { busy = false; document.body.classList.remove("busy"); }
  };
  const pollLive = h("div");
  const pollEl = h("section", "panel", h("h2", {}, "Live poll"),
    h("label", "f", h("span", {}, "Question"), pq),
    h("label", "f", h("span", {}, "Option 1"), p1),
    h("label", "f", h("span", {}, "Option 2"), p2),
    h("label", "f", h("span", {}, "Option 3 (optional)"), p3),
    pollError,
    btn("Start poll", startPoll, "primary"),
    pollLive);

  // ---------- queue filters and bulk approval ----------
  const fText = h("input", { placeholder: "Search headlines", oninput: () => { filter.text = fText.value.toLowerCase(); clearSelection(); renderQueue(); } });
  const fCat = h("select", { onchange: () => { filter.cat = fCat.value; clearSelection(); renderQueue(); } });
  const fDesk = h("select", { onchange: () => { filter.desk = fDesk.value; clearSelection(); renderQueue(); } });
  const fSource = h("select", { onchange: () => { filter.source = fSource.value; clearSelection(); renderQueue(); } });
  const fStatus = sel(["approved", "pending", "rejected", "all"], "approved");
  fStatus.onchange = () => { filter.status = fStatus.value; clearSelection(); renderQueue(); };
  const queueEl = h("div");
  const editorEl = h("section", "panel");
  editorEl.hidden = true;
  const researchEl = h("div");
  const bulkNote = h("p", "bulk-note");
  const approveSelectedBtn = btn("Approve selected", () => bulkAction("approved", false), "approve small");
  const rejectSelectedBtn = btn("Reject selected", () => bulkAction("rejected", false), "reject small");
  const approveAllBtn = btn("Approve all pending", () => bulkAction("approved", true), "approve small");
  const rejectFilteredBtn = btn("Reject all filtered", () => bulkAction("rejected", true), "reject small");
  const selectAllBtn = btn("Select all shown", () => toggleSelectAll(), "small");
  const clearSelBtn = btn("Clear selection", () => { clearSelection(); renderQueue(); }, "small");
  const bulkEl = h("div", "bulk",
    h("div", "row", selectAllBtn, clearSelBtn),
    h("div", "row", approveSelectedBtn, rejectSelectedBtn),
    h("div", "row", approveAllBtn, rejectFilteredBtn),
    bulkNote,
    h("p", "bulk-note", "Approving adds cards to the on-air queue; with auto-play on they can enter rotation, but approval never changes the card on screen now. On-air cards are protected from bulk rejection."));

  const runResearchNow = async ({ heldOnly = false } = {}) => {
    if (busy) return;
    busy = true; document.body.classList.add("busy");
    researchBtn.disabled = true; heldBtn.disabled = true;
    const oldText = researchBtn.textContent;
    researchBtn.textContent = heldOnly ? "Retrying held…" : "Fetching…";
    try {
      const j = await api("/api/desk/research", heldOnly ? { heldOnly: true } : {});
      if (!heldOnly) {
        filter.status = j.approvalMode === "manual" ? "pending" : "all";
        fStatus.value = filter.status;
        clearSelection();
      }
      await load();
      const mode = j.approvalMode === "all" ? "all incoming" : j.approvalMode === "trusted" ? "trusted feeds" : "manual";
      researchEl.replaceChildren(h("div", {},
        h("p", "sub", heldOnly
          ? `${j.added} held item${j.added === 1 ? "" : "s"} filed. ${j.heldTotal} still held.`
          : `${j.added} card${j.added === 1 ? "" : "s"} filed under ${mode} approval (${j.autoApproved} auto-approved). You can review pending cards, write your own summary and question, then approve.`),
        j.dropped ? h("p", "sub", `${j.dropped} auto cards you never wrote on were older than a day and have been dropped.`) : null,
        j.held ? h("p", "sub", `${j.held} more were ready but were not filed: the unread queue is full. They are held for the next run, not discarded.`) : null,
        j.heldOverflow ? h("p", "sub", `${j.heldOverflow} items could not even fit in the held bucket and will be offered again by the feed next run.`) : null,
        h("p", "sub", `Held bucket: ${j.heldTotal}. Unread research: ${j.pending}/${j.capacity} slots used${j.pendingApproval != null ? `; ${j.pendingApproval} cards still need approval` : ""}.`),
        j.feeds.map((f) => h("p", "sub", f.ok ? `${f.label}: ${f.found} found, ${f.added} filed${f.held ? `, ${f.held} held` : ""}${f.via && f.via !== "direct" ? ` (via ${f.via})` : ""}` : `${f.label}: failed (${f.error})`))));
      toast(heldOnly ? `${j.added} held items filed.` : `${j.added} research cards filed.`);
    } catch (e) { toast(e.message, true); }
    finally {
      busy = false; document.body.classList.remove("busy");
      researchBtn.disabled = false; researchBtn.textContent = oldText;
      drawAutomation();
    }
  };
  const researchBtn = btn("Fetch headlines now (Nigeria + US)", () => runResearchNow(), "primary small");
  researchBtn.style.width = "100%";
  const queuePanel = h("section", "panel", h("h2", {}, "Card queue"),
    researchBtn, researchEl, h("div", { style: "height:8px" }),
    h("div", "row", fText, fStatus),
    h("div", "row", fDesk, fCat),
    h("div", "row", fSource),
    bulkEl, h("div", { style: "height:8px" }), queueEl,
    btn("New card", () => openEditor(null), "small"));

  // ---------- Naija to US slang ----------
  // Edit this list freely. Check every meaning: you know these words better than any dictionary.
  const SLANG = [
    { ng: "wahala", us: "trouble or drama" },
    { ng: "no wahala", us: "no problem" },
    { ng: "abeg", us: "please, or come on" },
    { ng: "oya", us: "come on, let's go" },
    { ng: "how far", us: "what's up" },
    { ng: "gist", us: "gossip, a good story, or to chat" },
    { ng: "japa", us: "to leave the country for good" },
    { ng: "sapa", us: "being broke" },
    { ng: "omo", us: "dude, or wow" },
    { ng: "oga", us: "boss" },
    { ng: "idan", us: "a GOAT, someone amazing at something" },
    { ng: "owambe", us: "a big, lavish party" },
    { ng: "wetin", us: "what" },
    { ng: "chop", us: "eat" },
    { ng: "sabi", us: "to know, or be skilled at" },
  ];
  const slangSel = h("select", {}, SLANG.map((w) => h("option", { value: w.ng }, `${w.ng}  →  ${w.us}`)));
  const useSlang = async (now) => {
    const w = SLANG.find((x) => x.ng === slangSel.value);
    if (!w) return;
    let card = cards.find((c) => c.type === "slang" && c.headline === w.ng);
    if (card && card.approval === "approved") {
      if (!now) return toast("That one is already in the queue.");
    } else {
      card = await saveCard({ id: card?.id, type: "slang", category: "Naija to US", headline: w.ng,
        summary: `Closest US English: ${w.us}.`, question: "Do you use this one? Give me your best example.", approval: "approved" });
    }
    if (card && now) act("show", { cardId: card.id });
  };
  const slangPanel = h("section", "panel", h("h2", {}, "Naija to US slang"),
    h("label", "f", h("span", {}, "Pick a word"), slangSel),
    h("div", "row", btn("Show now", () => useSlang(true), "primary small"), btn("Add to queue", () => useSlang(false), "small")));


  // ---------- Twitch: server-side control + read-only chat reader ----------
  // Desk commands are handled by the EventSub webhook, so the dashboard does not need to be
  // open and the browser never decides who may move the desk. The socket below is only for
  // reading chat and tallying poll votes; it cannot execute a desk command.
  const CHAT_KEY = "desk.channel";
  const chat = { ws: null, name: "", want: false, retry: 0, count: true, msgs: [], seen: 0, hidden: 0, voters: new Map(), votePollId: null, syncTimer: null, drawTimer: null };
  let savedChannel = "";
  try { savedChannel = localStorage.getItem(CHAT_KEY) || ""; } catch { /* ignore */ }
  const chInput = h("input", { value: savedChannel || "otolorin_cyber", placeholder: "Twitch channel name" });
  const chStatus = h("p", "sub", "Not connected.");
  const chCount = h("input", { type: "checkbox", checked: true, style: "width:auto;flex:0 0 auto", onchange: () => { chat.count = chCount.checked; } });
  const chInbox = h("div");
  const chBtn = btn("Connect to chat", () => (chat.want ? chatStop() : chatStart()), "primary");
  const chatPanel = h("section", "panel", h("h2", {}, "Twitch chat reader"),
    h("div", "row", chInput, chBtn), chStatus,
    h("label", { class: "row", style: "margin:8px 0" }, chCount, h("span", {}, "Count 1, 2, 3 or !vote a as poll votes")),
    h("p", "sub", "Read-only convenience: this tab reads chat and poll votes. Desk commands are handled by the server webhook below, so they keep working when this tab is closed."),
    chInbox);

  const twitchStateEl = h("div");
  const twitchIds = h("textarea", {
    rows: 2, placeholder: "Twitch user ids allowed to command, separated by commas or lines",
    oninput: () => { twitchDirty = true; },
  });
  const twitchToggleBtn = btn("Enable server control", async () => {
    const j = await act("twitch-chat", { value: !twitch.enabled });
    if (!j) return;
    await load();
    toast(j.state.twitchChatEnabled ? "Server chat control enabled." : "Server chat control disabled.");
  }, "small");
  const twitchSaveIds = async () => {
    const j = await act("twitch-allow", { ids: parseAllowIds(twitchIds.value) });
    if (!j) return;
    twitchDirty = false;
    await load();
    toast("Twitch allowlist saved.");
  };
  const copyCallback = () => {
    const url = twitch.callbackUrl || `${location.origin}/api/twitch/eventsub`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => toast("Callback URL copied.")).catch(() => prompt("EventSub callback URL:", url));
    else prompt("EventSub callback URL:", url);
  };
  const twitchPanel = h("section", "panel", h("h2", {}, "Twitch server control"),
    twitchStateEl,
    h("div", "twitch-box",
      h("p", "sub", "Commands: " + COMMAND_HELP),
      h("label", "f", h("span", {}, "Stable user ids allowed to command (broadcaster is always allowed)"), twitchIds),
      h("div", "row", btn("Save allowed ids", twitchSaveIds, "small"),
        btn("Copy callback URL", copyCallback, "small"), twitchToggleBtn)),
    h("div", "twitch-box",
      h("p", "sub", "Dashboard controls remain the manual fallback. Twitch can only move cards that are already approved."),
      h("ol", "setup",
        h("li", {}, "Create a Twitch app in the Twitch developer console and set its OAuth redirect URL to this site."),
        h("li", {}, "Create a user token with user:read:chat, user:bot and channel:bot for the broadcaster (or a bot account in the channel)."),
        h("li", {}, "In Vercel, set TWITCH_WEBHOOK_SECRET and TWITCH_BROADCASTER_USER_ID. Optional: TWITCH_ALLOWED_USER_IDS, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_EVENTSUB_CALLBACK."),
        h("li", {}, "Create a channel.chat.message EventSub webhook subscription with the callback URL above and the same secret."),
        h("li", {}, "Enable server control here. The panel says Ready only after Twitch has completed the webhook challenge and a signed test command from the broadcaster has run."))));

  const drawTwitchServer = () => {
    const missing = twitch.missing ?? [];
    const stateClass = twitch.ready ? "ok" : twitch.configured ? "wait" : "bad";
    const stateText = twitch.ready ? "READY — verified webhook and successful test command"
      : twitch.verified && twitch.enabled ? "Webhook verified — send crid next from the broadcaster to test"
      : twitch.verified ? "Webhook verified — server control is off"
      : twitch.configured && twitch.enabled ? "Configured — waiting for Twitch to verify the callback"
      : twitch.configured ? "Configured — server control is off"
      : "Not configured — no command can arrive from Twitch yet";
    twitchStateEl.replaceChildren(
      h("p", { class: "statusline" },
        h("span", { class: "twitch-state " + stateClass }, stateText),
        h("span", "sub", twitch.verifiedAt ? `Verified ${fmt(twitch.verifiedAt)}` : "No verified webhook yet")),
      missing.length ? h("p", "sub", "Missing Vercel env: " + missing.join(", ")) : null,
      h("p", "sub", `Callback: ${twitch.callbackUrl || `${location.origin}/api/twitch/eventsub`}`),
      h("p", "sub", `Enabled: ${twitch.enabled ? "yes" : "no"} · Allowed ids: ${(twitch.allowedUserIds ?? []).join(", ") || "broadcaster only"}`),
      twitch.lastEventAt ? h("p", "sub", `Last event: ${fmt(twitch.lastEventAt)}${twitch.lastCommand ? ` · ${twitch.lastCommand}` : ""}`) : null,
      twitch.lastError ? h("p", { style: "color:#FF9A8D" }, `Last error: ${twitch.lastError}`) : null);
    twitchToggleBtn.textContent = twitch.enabled ? "Disable server control" : "Enable server control";
    twitchToggleBtn.classList.toggle("on", Boolean(twitch.enabled));
    if (!twitchDirty && document.activeElement !== twitchIds) {
      twitchIds.value = (twitch.allowedUserIds ?? []).join(", ");
    }
  };

  const OPTION = /^(?:!vote\s+)?([1-3a-c])$/i;
  const optionFor = (text) => {
    const m = text.trim().match(OPTION);
    if (!m) return null;
    const id = /\d/.test(m[1]) ? "abc"[Number(m[1]) - 1] : m[1].toLowerCase();
    return state?.poll?.options.some((o) => o.id === id) ? id : null;
  };

  const syncVotes = () => {
    if (chat.syncTimer) return;
    chat.syncTimer = setTimeout(async () => {
      chat.syncTimer = null;
      const counts = {};
      for (const v of chat.voters.values()) counts[v] = (counts[v] || 0) + 1;
      try {
        const j = await api("/api/desk/action", { action: "set-votes", counts });
        state = j.state; offset = j.serverNow - Date.now(); renderLive();
      } catch { /* poll may have just ended; the next vote or poll resets it */ }
    }, 1500);
  };

  const setCridFromChat = (m) => {
    cridTitleIn.value = m.text.slice(0, 120);
    cridCreditIn.value = m.name.slice(0, 30);
    currentTab = "crid";
    renderApp();
    cridPanel.scrollIntoView({ behavior: "smooth" });
    toast(`Loaded into CRID from Stranger @${m.name}`);
  };

  const drawInbox = () => {
    chat.drawTimer = null;
    if (chat.want && chat.name) chStatus.textContent = `Connected to #${chat.name}. ${chat.seen} messages seen, ${chat.hidden} hidden (links or long numbers).`;
    chInbox.replaceChildren(...(chat.msgs.length
      ? chat.msgs.slice(-10).reverse().map((m) => h("div", "item", h("div", "sub", `Stranger @${m.name}`), h("div", {}, m.text),
          h("div", "row",
            btn("Show now", () => useMessage(m, true), "primary small"),
            btn("Add to queue", () => useMessage(m, false), "small"),
            btn("Credit in CRID", () => setCridFromChat(m), "small"))))
      : [h("p", "sub", "Chat messages appear here. Nothing reaches the stream until you tap one.")]));
  };
  const drawSoon = () => { if (!chat.drawTimer) chat.drawTimer = setTimeout(drawInbox, 400); };

  const onChat = (name, id, text) => {
    chat.seen++;
    // This reader never runs desk commands. They arrive by the signed EventSub webhook, so a
    // closed tab cannot disable them and an open tab cannot widen who is allowed to send them.
    const opt = chat.count && state?.poll?.active ? optionFor(text) : null;
    if (opt) {
      if (chat.votePollId !== state.poll.id) { chat.voters.clear(); chat.votePollId = state.poll.id; }
      if (chat.voters.get(id) !== opt) { chat.voters.set(id, opt); syncVotes(); }
      return drawSoon();
    }
    if (/https?:\/\/|www\.|\.[a-z]{2,}\/|\d{7,}/i.test(text)) { chat.hidden++; return drawSoon(); }
    chat.msgs.push({ name, text: text.slice(0, 300) });
    if (chat.msgs.length > 30) chat.msgs.shift();
    drawSoon();
  };

  // Tapping a message is the manual approval: the card is created approved, never auto-shown.
  const useMessage = async (m, now) => {
    const headline = m.text.length > 120 ? m.text.slice(0, 117) + "…" : m.text;
    const card = await saveCard({ type: "viewer-question", category: "Viewer question", headline, summary: "Asked by " + m.name, approval: "approved" });
    if (card && now) act("show", { cardId: card.id });
  };

  const parseLine = (line) => {
    const m = line.match(/^(?:@(\S+) )?:([^!\s]+)![^ ]+ PRIVMSG #\S+ :(.*)$/);
    if (!m) return null;
    const tags = {};
    for (const kv of (m[1] || "").split(";")) { const i = kv.indexOf("="); if (i > 0) tags[kv.slice(0, i)] = kv.slice(i + 1); }
    const name = (tags["display-name"] || m[2]).replace(/\\s/g, " ");
    return { name, id: tags["user-id"] || m[2], text: m[3].replace(/^\u0001ACTION |\u0001$/g, ""), tags };
  };

  const chatOpen = (name) => {
    chStatus.textContent = "Connecting…";
    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    chat.ws = ws;
    ws.onopen = () => {
      ws.send("CAP REQ :twitch.tv/tags");
      ws.send("PASS SCHMOOPIIE");
      ws.send("NICK justinfan" + Math.floor(10000 + Math.random() * 80000));
      ws.send("JOIN #" + name);
    };
    ws.onmessage = (e) => {
      for (const line of String(e.data).split("\r\n")) {
        if (!line) continue;
        if (line.startsWith("PING")) ws.send("PONG :tmi.twitch.tv");
        else if (line.includes(" JOIN #")) { chat.retry = 0; drawInbox(); }
        else { const p = parseLine(line); if (p) onChat(p.name, p.id, p.text, p.tags); }
      }
    };
    ws.onclose = () => {
      if (chat.ws !== ws || !chat.want) return;
      chat.retry++;
      const wait = Math.min(30, 2 ** chat.retry);
      chStatus.textContent = `Chat disconnected. Reconnecting in ${wait}s…`;
      setTimeout(() => { if (chat.want && chat.ws === ws) chatOpen(name); }, wait * 1000);
    };
    ws.onerror = () => {};
  };

  const keepAwake = () => { try { navigator.wakeLock?.request("screen").catch(() => {}); } catch { /* unsupported */ } };

  const chatStart = () => {
    const name = chInput.value.trim().replace(/^#/, "").toLowerCase();
    if (!/^[a-z0-9_]{3,25}$/.test(name)) return toast("Enter a Twitch channel name: letters, numbers and underscores only.", true);
    try { localStorage.setItem(CHAT_KEY, name); } catch { /* ignore */ }
    Object.assign(chat, { want: true, retry: 0, name, seen: 0, hidden: 0 });
    chBtn.textContent = "Disconnect"; chBtn.classList.remove("go"); chBtn.classList.remove("primary");
    keepAwake();
    chatOpen(name);
  };
  const chatStop = () => {
    chat.want = false;
    const ws = chat.ws; chat.ws = null; ws?.close();
    chBtn.textContent = "Connect to chat"; chBtn.classList.add("go"); chBtn.classList.add("primary");
    chStatus.textContent = "Not connected.";
  };
  document.addEventListener("visibilitychange", () => { if (chat.want && document.visibilityState === "visible") keepAwake(); });
  drawInbox();

  // ---------- Twitch clipping ----------
  const clipStatus = h("p", "sub", "Clip status: not configured.");
  const clipCreateBtn = btn("Clip That", async () => {
    const j = await act("clip-create");
    if (!j) return;
    await load();
    toast(j.clip ? `Clip created${j.clip.status === "available" ? " and verified." : " (pending verification)."}` : "Clip request sent.");
    drawClip();
  }, "small primary");
  const clipEditLink = h("a", { target: "_blank", rel: "noopener noreferrer", style: "color:#7CC4FF;text-decoration:underline" }, "Open clip edit link");
  const clipPanel = h("section", "panel", h("h2", {}, "Twitch Clip"),
    h("div", "twitch-box",
      h("p", "sub", "Create a clip of the current live moment. Requires TWITCH_CLIENT_ID, TWITCH_CLIP_ACCESS_TOKEN (clips:edit scope) and TWITCH_BROADCASTER_USER_ID in Vercel env."),
      clipStatus,
      h("div", "row", clipCreateBtn)),
    h("div", "twitch-box",
      h("p", "sub", "Last clip"), clipEditLink));

  const drawClip = () => {
    const clip = state?.lastClip ?? null;
    const cfg = twitch ?? {};
    const configured = Boolean(cfg.clipConfigured);
    clipStatus.textContent = configured
      ? "Clip status: configured."
      : "Clip status: not configured (set TWITCH_CLIENT_ID, TWITCH_CLIP_ACCESS_TOKEN, TWITCH_BROADCASTER_USER_ID).";
    clipCreateBtn.disabled = !configured;
    if (clip) {
      clipEditLink.textContent = clip.status === "available" ? "Open clip edit link" : "Clip pending verification";
      clipEditLink.href = clip.editUrl || "";
      clipEditLink.hidden = !clip.editUrl;
    } else {
      clipEditLink.textContent = "No clip yet.";
      clipEditLink.hidden = true;
    }
  };

  // ---------- Audiomack Music Station (Naija & Afrobeats Broadcast Stream) ----------
  const audiomackStatus = h("p", "sub", "Audiomack: loading...");
  const audiomackQueryIn = h("input", { placeholder: "Search Audiomack song or artist...", maxlength: 80 });
  const audiomackSearchBtn = btn("Search", () => searchAudiomack(), "small");
  const audiomackTrendingBtn = btn("Trending Afrobeats", () => loadAudiomack(), "small primary");
  const audiomackTracks = h("div", { class: "stack", style: "gap:8px;margin-top:8px;" });

  const loadAudiomack = async () => {
    try {
      audiomackStatus.textContent = "Fetching trending Audiomack tracks...";
      const r = await fetch("/api/audiomack?mode=trending", { cache: "no-store" });
      const j = await r.json();
      renderAudiomackList(j.tracks || [], j.note || (j.configured ? "Live Audiomack stream connected." : "Curated station active."));
    } catch (e) {
      audiomackStatus.textContent = "Audiomack: request failed.";
    }
  };

  const searchAudiomack = async () => {
    const q = audiomackQueryIn.value.trim();
    if (!q) return loadAudiomack();
    try {
      audiomackStatus.textContent = `Searching for "${q}"...`;
      const r = await fetch(`/api/audiomack?mode=search&q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const j = await r.json();
      renderAudiomackList(j.tracks || [], `Results for "${q}"`);
    } catch (e) {
      audiomackStatus.textContent = "Audiomack: search failed.";
    }
  };

  audiomackQueryIn.onkeydown = (e) => { if (e.key === "Enter") searchAudiomack(); };

  const renderAudiomackList = (tracks, statusMsg) => {
    audiomackStatus.textContent = statusMsg || `Found ${tracks.length} tracks.`;
    if (!tracks.length) {
      audiomackTracks.replaceChildren(h("p", "sub", "No tracks found."));
      return;
    }
    audiomackTracks.replaceChildren(...tracks.map((t) => {
      const img = t.image ? h("img", { src: t.image, alt: "", style: "width:48px;height:48px;border-radius:8px;object-fit:cover;" }) : null;
      const head = h("div", { style: "display:flex;align-items:center;gap:10px;" },
        img,
        h("div", { style: "flex:1;min-width:0;" },
          h("div", { style: "font-weight:700;font-size:0.95em;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" }, t.title),
          h("div", { style: "font-size:0.8em;color:#c7c7cc;" }, `${t.artist} ${t.genre ? `· ${t.genre}` : ""}`)
        )
      );

      const actions = h("div", { class: "row", style: "gap:6px;margin-top:8px;" },
        btn("▶ Play Now", async () => {
          await act("music-add", { title: t.title, artist: t.artist, audioUrl: t.audioUrl || undefined });
          await act("music-play");
          toast(`Playing: ${t.title}`);
        }, "small primary"),
        btn("+ Queue", async () => {
          await act("music-add", { title: t.title, artist: t.artist, audioUrl: t.audioUrl || undefined });
          toast(`Added to Music Queue: ${t.title}`);
        }, "small"),
        btn("🏛 Send to CRID", () => {
          cridTitleIn.value = `${t.title} - ${t.artist}`.slice(0, 120);
          cridAudioIn.value = t.audioUrl || "";
          currentTab = "crid";
          renderApp();
          toast("Loaded into CRID Jumbotron!");
        }, "small")
      );

      return h("div", { class: "queue-item", style: "padding:10px 12px;margin-bottom:8px;" }, head, actions);
    }));
  };

  const audiomackPanel = h("section", "panel stack",
    h("h2", {}, "Audiomack Music Station"),
    h("p", "sub", "Stream Afrobeats & Naija tracks directly through the Broadcast Music Desk and CRID Jumbotron."),
    h("div", "row", audiomackQueryIn, audiomackSearchBtn),
    h("div", "row", audiomackTrendingBtn),
    audiomackStatus,
    audiomackTracks
  );

  // ---------- CRID Court ----------
  const courtQuestion = h("input", { placeholder: "Debate question", maxlength: 140 });
  const courtVA = h("input", { placeholder: "Viewpoint A", maxlength: 120 });
  const courtVB = h("input", { placeholder: "Viewpoint B", maxlength: 120 });
  const courtStatus = h("p", "sub", "Court: not in session.");
  const courtPanel = h("section", "panel", h("h2", {}, "CRID Court"),
    h("div", "twitch-box",
      h("label", "f", h("span", {}, "Question"), courtQuestion),
      h("div", "row", courtVA, courtVB),
      h("div", "row",
        btn("Open Court", async () => {
          const j = await act("court-open", { question: courtQuestion.value.trim(), viewpointA: courtVA.value.trim(), viewpointB: courtVB.value.trim() });
          if (j) { courtQuestion.value = ""; courtVA.value = ""; courtVB.value = ""; await load(); toast("Court opened."); }
        }, "primary small"),
        btn("Vote A", () => act("court-vote", { side: "a" }), "small"),
        btn("Vote B", () => act("court-vote", { side: "b" }), "small"),
        btn("Verdict W (1)", () => act("court-verdict", { value: 1 }), "small primary"),
        btn("Verdict L (0)", () => act("court-verdict", { value: 0 }), "small danger")),
      courtStatus,
      btn("Close Court", () => act("court-close"), "danger small")));

  // ---------- Music Desk ----------
  const musicTitle = h("input", { placeholder: "Track title", maxlength: 120 });
  const musicArtist = h("input", { placeholder: "Artist", maxlength: 120 });
  const musicUrl = h("input", { placeholder: "Audio URL (MP3/AAC/WebM)", maxlength: 2000 });
  const musicStatus = h("p", "sub", "Music: idle.");
  const youtubePlaylistInput = h("input", { type: "url", maxLength: 2000, autocomplete: "off", placeholder: "https://music.youtube.com/playlist?list=…" });
  const youtubeEmbedOutput = h("input", { type: "url", readOnly: true, placeholder: "Official YouTube playlist-player URL appears here" });
  const youtubeStatus = h("p", "sub", "Paste a public YouTube or YouTube Music playlist link.");
  const updateYoutubeWidgetUrl = () => {
    youtubeEmbedOutput.value = youtubePlaylistEmbedUrl(youtubePlaylistInput.value) || "";
    youtubeStatus.textContent = youtubeEmbedOutput.value
      ? "Validated. Use this visible, interactive YouTube player URL as a Swae Browser Widget/Web Page layer."
      : "Paste a valid public YouTube or YouTube Music playlist link.";
  };
  youtubePlaylistInput.addEventListener("input", updateYoutubeWidgetUrl);
  const copyYoutubeWidgetUrl = async () => {
    const value = youtubeEmbedOutput.value;
    if (!value) return toast("Paste a valid playlist URL first.", true);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard is unavailable");
      await navigator.clipboard.writeText(value);
      toast("Copied. Add the visible player URL as a Swae web-page layer.");
    } catch {
      window.prompt("Copy this official YouTube player URL into a Swae web-page layer:", value);
    }
  };
  const openYoutubeWidget = () => {
    if (!youtubeEmbedOutput.value) return toast("Paste a valid playlist URL first.", true);
    window.open(youtubeEmbedOutput.value, "_blank", "noopener,noreferrer");
  };
  const musicSearchInput = h("input", { placeholder: "Song, artist, cover or DJ mix", maxlength: 120 });
  const musicSearchResults = h("div");
  const queueSearchResult = async (result) => {
    if (!(await act("music-add", { title: result.title, artist: result.artist, videoId: result.videoId }))) return;
    await act("music-play", { query: result.title });
    musicSearchResults.replaceChildren();
    toast("Queued. Add the player URL above as a Swae web-page layer to put it on air.");
  };
  const runMusicSearch = async () => {
    const q = musicSearchInput.value.trim();
    if (!q) return toast("Type a song or artist first.", true);
    musicSearchResults.replaceChildren(h("p", "sub", "Searching YouTube…"));
    try {
      const { results } = await api("/api/desk/music/search?q=" + encodeURIComponent(q));
      if (!results.length) {
        musicSearchResults.replaceChildren(h("p", "sub", "No YouTube results. Try a different title."));
        return;
      }
      musicSearchResults.replaceChildren(...results.map((r) =>
        h("div", "row",
          h("span", "sub", r.title + (r.artist ? " — " + r.artist : "")),
          btn("Queue", () => queueSearchResult(r), "small primary"))));
    } catch (e) {
      musicSearchResults.replaceChildren(h("p", "sub", e.message));
    }
  };
  const musicPanel = h("section", "panel", h("h2", {}, "Music Desk"),
    h("div", "twitch-box",
      h("label", "f", h("span", {}, "Title"), musicTitle),
      h("label", "f", h("span", {}, "Artist"), musicArtist),
      h("label", "f", h("span", {}, "Audio URL"), musicUrl),
      h("div", "row",
        btn("Add to Queue", async () => {
          const j = await act("music-add", { title: musicTitle.value.trim(), artist: musicArtist.value.trim(), audioUrl: musicUrl.value.trim() || undefined });
          if (j) { musicTitle.value = ""; musicArtist.value = ""; musicUrl.value = ""; await load(); toast("Added to music queue."); }
        }, "primary small"),
        btn("Play", () => act("music-play"), "small primary"),
        btn("Pause", () => act("music-pause"), "small"),
        btn("Next", () => act("music-next"), "small"),
        btn("Stop", () => act("music-stop"), "small danger"),
        btn("Clear", () => act("music-clear"), "small danger")),
      h("label", "f", h("span", {}, "Find on YouTube"), musicSearchInput),
      h("div", "row", btn("Search YouTube", runMusicSearch, "small")),
      musicSearchResults,
      musicStatus),
    h("div", "twitch-box",
      h("strong", {}, "YouTube Music playlist — official player"),
      h("p", "sub", "This makes a standard visible YouTube playlist player URL; it does not extract or rebroadcast audio by itself."),
      h("label", "f", h("span", {}, "Public playlist URL"), youtubePlaylistInput),
      h("label", "f", h("span", {}, "Swae web-page player URL"), youtubeEmbedOutput),
      youtubeStatus,
      h("div", "row", btn("Copy Swae page URL", copyYoutubeWidgetUrl, "small primary"), btn("Preview player", openYoutubeWidget, "small")),
      h("p", "sub", "Add it as a Swae Browser Widget/Web Page layer and keep YouTube’s player visible (minimum player size applies). Note that a Swae widget cannot be tapped or scrolled and is redrawn as snapshots, so start playback from the phone itself, not through the overlay. Do not use it as an audio extractor — Swae streams microphone audio only; test privately, and only stream music you have rights to broadcast.")));

  // ---------- X Space Radar ----------
  const spaceTitle = h("input", { placeholder: "Space title", maxlength: 120 });
  const spaceHost = h("input", { placeholder: "Host", maxlength: 120 });
  const spaceTopic = h("input", { placeholder: "Topic", maxlength: 120 });
  const spaceUrl = h("input", { placeholder: "Space URL (https://...)", maxlength: 2000 });
  const spacePanel = h("section", "panel", h("h2", {}, "X Space Radar"),
    h("div", "twitch-box",
      h("p", "sub", "Info card + external link only. Does not embed or rebroadcast X Spaces."),
      h("label", "f", h("span", {}, "Title"), spaceTitle),
      h("label", "f", h("span", {}, "Host"), spaceHost),
      h("label", "f", h("span", {}, "Topic"), spaceTopic),
      h("label", "f", h("span", {}, "URL"), spaceUrl),
      h("div", "row",
        btn("Add Space", async () => {
          const j = await act("space-add", { title: spaceTitle.value.trim(), host: spaceHost.value.trim(), topic: spaceTopic.value.trim(), url: spaceUrl.value.trim() || undefined });
          if (j) { spaceTitle.value = ""; spaceHost.value = ""; spaceTopic.value = ""; spaceUrl.value = ""; await load(); toast("Space added."); }
        }, "primary small"))));

  // ---------- STRANGERS Ledger ----------
  const ledgerType = h("input", { placeholder: "Type (e.g. poll-win, topic-submit, challenge)", maxlength: 32 });
  const ledgerTitle = h("input", { placeholder: "Entry title", maxlength: 120 });
  const ledgerDesc = h("input", { placeholder: "Description", maxlength: 280 });
  const ledgerPanel = h("section", "panel", h("h2", {}, "STRANGERS Ledger"),
    h("div", "twitch-box",
      h("p", "sub", "Records community interactions and decisions. Only retain what is necessary and appropriate."),
      h("label", "f", h("span", {}, "Type"), ledgerType),
      h("label", "f", h("span", {}, "Title"), ledgerTitle),
      h("label", "f", h("span", {}, "Description"), ledgerDesc),
      h("div", "row",
        btn("Add Entry", async () => {
          const j = await act("ledger-add", { type: ledgerType.value.trim(), title: ledgerTitle.value.trim(), description: ledgerDesc.value.trim() || undefined });
          if (j) { ledgerType.value = ""; ledgerTitle.value = ""; ledgerDesc.value = ""; await load(); toast("Ledger entry added."); }
        }, "primary small"))));

  // ---------- RIAD ----------
  const riadChannel = h("input", { placeholder: "Raid channel (optional)", maxlength: 32 });
  const riadPanel = h("section", "panel", h("h2", {}, "RIAD — Rent Is Always Due"),
    h("div", "twitch-box",
      h("p", "sub", "Raid identity and ritual. Triggers the RIAD graphic; actual Twitch raid action stays separate and requires explicit authorization."),
      h("label", "f", h("span", {}, "Channel"), riadChannel),
      h("div", "row",
        btn("Trigger RIAD", async () => {
          const j = await act("riad-trigger", { channel: riadChannel.value.trim() || undefined });
          if (j) { riadChannel.value = ""; await load(); toast("RIAD triggered."); }
        }, "primary small"),
        btn("Clear RIAD", () => act("riad-clear"), "small danger"))));

  // ---------- Settings Extras (Swae Overlay & Session) ----------
  const settingsExtrasEl = h("section", "panel stack",
    h("h2", {}, "Overlay & Session"),
    h("div", "twitch-box",
      h("p", "sub", "Public Swae viewer overlay: add this /desk URL as a Browser Widget or Web Page layer in your scene."),
      btn("Copy Swae URL", copySwaeUrl, "primary")),
    h("div", "twitch-box",
      h("p", "sub", "Disconnect operator session on this device:"),
      btn("Logout / Change Token", () => {
        try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
        location.reload();
      }, "danger")));

  // ---------- App Root & Layout ----------
  const appRoot = h("div", { id: "app-root" });
  document.body.append(appRoot, toastEl, sheetWrap);

  // ---------- Tab Router & View Assembly ----------
  const renderApp = () => {
    const root = document.getElementById("app-root");
    if (!root) return;
    // Build a scroll container with the current tab's panels
    let panels;
    switch(currentTab) {
      case "live": panels = [statusEl, controlsEl, voicePanel, briefPanel, previewPanel]; break;
      case "topics": panels = [queuePanel, editorEl]; break;
      case "crid": panels = [cridPanel, botPanel]; break;
      case "community": panels = [riadPanel, ledgerPanel, spacePanel, chatPanel, slangPanel]; break;
      case "studio": panels = [clipPanel, musicPanel, courtPanel, audiomackPanel]; break;
      case "settings": panels = [autoEl, pollEl, twitchPanel, settingsExtrasEl]; break;
      default: panels = [statusEl, controlsEl, voicePanel, briefPanel, previewPanel];
    }
    // Show/hide panels based on active tab
    const allPanels = [statusEl, controlsEl, voicePanel, briefPanel, previewPanel, queuePanel, editorEl, cridPanel, botPanel,
      riadPanel, ledgerPanel, spacePanel, chatPanel, slangPanel,
      clipPanel, musicPanel, courtPanel, audiomackPanel, autoEl, pollEl, twitchPanel, settingsExtrasEl];
    for (const p of allPanels) {
      if (p === editorEl) {
        p.hidden = !panels.includes(p) || !editing;
      } else {
        p.hidden = !panels.includes(p);
      }
    }

    const container = root.querySelector(".view-container") || (() => {
      root.innerHTML = "";
      const vc = h("div", "view-container");
      root.append(vc, renderTabBar());
      return vc;
    })();
    // Re-render tab bar
    const oldTabBar = root.querySelector(".tab-bar");
    if (oldTabBar) oldTabBar.replaceWith(renderTabBar());
    
    container.replaceChildren(...panels);
  };

  // ---------- login ----------
  const showLogin = (msg = "") => {
    const root = document.getElementById("app-root");
    if (root) root.hidden = true;
    let box = document.getElementById("login");
    if (box) box.remove();
    const t = h("input", { type: "password", placeholder: "Operator token", autocomplete: "current-password" });
    const go = () => {
      token = t.value.trim();
      if (!token) return;
      try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
      box.remove();
      if (root) root.hidden = false;
      load();
    };
    t.onkeydown = (e) => { if (e.key === "Enter") go(); };
    box = h("section", { id: "login", class: "panel stack", style: "max-width:420px;margin:12vh auto;" },
      h("h2", { class: "t-title", style: "margin-bottom:8px" }, "Cyber Live Desk"),
      msg && h("p", "sub", msg),
      h("label", "f", h("span", {}, "Operator token"), t),
      btn("Connect", go, "primary giant", 'heavy'));
    document.body.append(box);
  };

  // ---------- rendering ----------
  const activeCard = () => cards.find((c) => c.id === state?.activeCardId) || null;

  const cdEl = h("span", "sub");
  const countsEl = h("div", "counts");
  const drawCounts = () => {
    const n = (v) => Number(v) || 0;
    countsEl.replaceChildren(
      h("div", "count", h("strong", {}, n(counts.pending)), h("span", {}, "pending approval")),
      h("div", "count", h("strong", {}, n(counts.approved)), h("span", {}, "approved in queue")),
      h("div", "count warn", h("strong", {}, n(counts.held)), h("span", {}, "held · queue full")),
      h("div", "count live", h("strong", {}, n(counts.onAir)), h("span", {}, "on air now")));
  };
  const renderCountdown = () => {
    if (!state?.visible) return (cdEl.textContent = "");
    if (state.hold) return (cdEl.textContent = "Holding: it will stay until you hide it.");
    const secs = Math.max(0, Math.round((state.expiresAt - serverNow()) / 1000));
    cdEl.textContent = state.expiresAt
      ? state.autoPlay ? `Auto-play moves to the next card in ${secs}s` : `Leaves in ${secs}s`
      : "";
  };

  const renderLive = () => {
    statusEl.replaceChildren();
    statusEl.classList.toggle("live", !!state?.visible);
    if (!state) { statusEl.append(h("p", "sub", "Connecting")); return; }
    drawDesks();
    renderCridDeck();
    renderBotPanel();
    const c = activeCard();
    const desk = desks.find((d) => d.id === state.desk) || null;
    const what = !state.visible ? "Nothing on stream"
      : state.mode === "x-following" ? "X Following timeline"
      : c ? c.headline : state.poll ? "Poll: " + state.poll.question : "Overlay is on but empty";

    const cridPill = state.crid
      ? h("span", "chip ok", `CRID #${state.crid.entry} ${state.crid.verdict === 1 ? 'PAID' : state.crid.verdict === 0 ? 'OWING' : 'ON JUMBOTRON'}`)
      : h("span", "chip", "JUMBOTRON IDLE");

    statusEl.append(
      h("div", { class: "row", style: "justify-content:space-between;margin-bottom:4px" },
        h("span", "pill", state.visible ? "🔴 ON AIR" : "⚪ STANDBY"),
        cridPill),
      h("div", "now", what),
      h("div", "sub", `Mode: ${state.mode === "x-following" ? "X feed" : "Cards"}` +
        `${state.showSource ? ", source shown" : ""}${desk ? `, ${desk.label} desk` : ""}`),
      xFeedStatus,
      cdEl, countsEl);
    renderCountdown();
    drawCounts();
    holdBtn.textContent = state.hold ? "Release hold" : "Hold card"; holdBtn.classList.toggle("on", state.hold);
    srcBtn.textContent = state.showSource ? "Hide source" : "Show source"; srcBtn.classList.toggle("on", state.showSource);
    modeBtn.textContent = state.mode === "x-following" ? "Back to cards" : "X feed"; modeBtn.classList.toggle("on", state.mode === "x-following");

    drawAutomation();
    renderQueue(); // refreshes the on-stream highlight
    pollLive.replaceChildren();
    const p = state.poll;
    if (!p) return;
    const total = p.options.reduce((n, o) => n + o.count, 0);
    pollLive.append(h("div", {}, h("p", "sub", `${p.active ? "Voting open" : "Voting closed"}: ${p.question}`),
      p.options.map((o) => h("div", "opt",
        h("span", "name", `${o.label}: ${o.count}${total ? " (" + Math.round((o.count / total) * 100) + "%)" : ""}`),
        voteBtn(o, 1, "+1"),
        voteBtn(o, -1, "−1"))),
      h("div", "row",
        p.active ? btn("End poll", () => act("end-poll"), "danger") : null,
        btn("Clear poll results", () => act("clear-poll")))));
  };
  const voteBtn = (o, delta, label) => {
    const b = btn(label, () => act("vote", { option: o.id, delta }), delta > 0 ? "primary" : "");
    b.disabled = !state?.poll?.active;
    return b;
  };

  const streetQuestion = () => {
    const list = cards.filter((c) => c.type === "street-question" && c.approval === "approved");
    if (!list.length) return toast("No approved street questions yet. Add one with New card.", true);
    const i = list.findIndex((c) => c.id === state?.activeCardId);
    act("show", { cardId: list[(i + 1) % list.length].id });
  };

  function clearSelection() { selected.clear(); }

  // Mirrors the server's matchesQueueFilter. deskIds are derived by the server from the same
  // matchesDesk rule that bulk-approval uses, so the preview and the action cannot disagree.
  const matchesBulkFilter = (c, status = filter.status) => {
    if (status !== "all" && c.approval !== status) return false;
    if (filter.desk && !(c.deskIds ?? []).includes(filter.desk)) return false;
    if (filter.cat && c.category !== filter.cat) return false;
    if (filter.source && (c.source?.publisher ?? "") !== filter.source) return false;
    if (filter.text && !`${c.headline ?? ""} ${c.summary ?? ""} ${c.category ?? ""} ${c.source?.publisher ?? ""}`.toLowerCase().includes(filter.text)) return false;
    return true;
  };

  const queueList = () => {
    const list = cards.filter((c) => matchesBulkFilter(c, filter.status));
    // Approved cards are shown in the order the server plays them, so what auto-play will
    // do next is readable off the queue. Anything else is newest-first.
    if (filter.status === "approved") list.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
    else list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  };

  const serverFilter = (status = filter.status) => ({
    status,
    desk: filter.desk || undefined,
    category: filter.cat || undefined,
    source: filter.source || undefined,
    query: filter.text || undefined,
  });

  const updateBulkBar = (visible = queueList()) => {
    for (const id of [...selected]) if (!cards.some((c) => c.id === id)) selected.delete(id);
    const picked = cards.filter((c) => selected.has(c.id)).length;
    const pending = cards.filter((c) => matchesBulkFilter(c, "pending")).length;
    approveSelectedBtn.textContent = `Approve selected (${picked})`;
    rejectSelectedBtn.textContent = `Reject selected (${picked})`;
    approveAllBtn.textContent = `Approve all pending (${pending})`;
    approveAllBtn.disabled = pending === 0;
    rejectFilteredBtn.textContent = `Reject all filtered (${visible.length})`;
    selectAllBtn.textContent = visible.length && visible.every((c) => selected.has(c.id)) ? "Unselect all shown" : "Select all shown";
    bulkNote.textContent = `${picked} selected of ${visible.length} shown. ${pending} pending match the desk, category and source filters.`;
  };

  const toggleSelectAll = () => {
    const visible = queueList();
    if (!visible.length) return toast("Nothing is shown to select.", true);
    const all = visible.every((c) => selected.has(c.id));
    for (const c of visible) { if (all) selected.delete(c.id); else selected.add(c.id); }
    renderQueue();
  };

  const bulkAction = async (approval, all) => {
    if (!all && !selected.size) return toast("Select at least one card first.", true);
    if (all && approval === "rejected" && !confirm("Reject every card matching the current filters? Cards on air are skipped. This cannot be undone in one step.")) return;
    const body = { action: "bulk-approval", approval };
    if (all) { body.all = true; body.filter = serverFilter(approval === "approved" ? "pending" : filter.status); }
    else body.ids = [...selected];
    const j = await act("bulk-approval", body);
    if (!j) return;
    const b = j.bulk ?? {};
    const skipped = b.skipped ?? [];
    const verb = approval === "approved" ? "approved" : "rejected";
    toast(`${b.updated ?? 0} card${b.updated === 1 ? "" : "s"} ${verb}.` +
      (skipped.length ? ` ${skipped.length} skipped: ${skipped[0].reason}.` : ""));
    selected.clear();
    await load();
  };

  const renderQueue = () => {
    const cats = [...new Set(cards.map((c) => c.category).filter(Boolean))].sort();
    const keepCat = filter.cat;
    fCat.replaceChildren(h("option", { value: "" }, "All categories"), ...cats.map((c) => h("option", { value: c }, c)));
    fCat.value = cats.includes(keepCat) ? keepCat : "";
    filter.cat = fCat.value;

    const keepDesk = filter.desk;
    fDesk.replaceChildren(h("option", { value: "" }, "All topic desks"),
      ...desks.map((d) => h("option", { value: d.id }, `${d.label} (${d.count})`)));
    fDesk.value = desks.some((d) => d.id === keepDesk) ? keepDesk : "";
    filter.desk = fDesk.value;

    const sources = [...new Set(cards.map((c) => c.source?.publisher).filter(Boolean))].sort();
    const keepSource = filter.source;
    fSource.replaceChildren(h("option", { value: "" }, "All sources"), ...sources.map((s) => h("option", { value: s }, s)));
    fSource.value = sources.includes(keepSource) ? keepSource : "";
    filter.source = fSource.value;

    const list = queueList();
    const nextId = filter.status === "approved" ? autoNextId(list) : null;
    updateBulkBar(list);
    queueEl.replaceChildren(...(list.length ? list.map((c) => renderItem(c, c.id === nextId)) : [h("p", "sub", "No cards match. Change the filters or add a card.")]));
  };

  // Mirrors the server's nextAfter(): wraps around, and starts at the top if nothing is on.
  const autoNextId = (list) => {
    if (!state?.autoPlay || !state.visible || state.mode !== "cards" || !list.length) return null;
    const i = list.findIndex((c) => c.id === state.activeCardId);
    return i < 0 ? list[0].id : list[(i + 1) % list.length].id;
  };

  const renderItem = (c, isNext) => {
    const onAir = state?.visible && state.mode === "cards" && state.activeCardId === c.id;
    const open = expanded === c.id;
    const show = btn("Show on stream", () => act("show", { cardId: c.id }), "primary small");
    show.disabled = c.approval !== "approved";
    const tick = h("input", {
      type: "checkbox", class: "selectbox", checked: selected.has(c.id),
      "aria-label": "Select " + c.headline,
      onchange: () => {
        if (tick.checked) selected.add(c.id); else selected.delete(c.id);
        updateBulkBar();
      },
    });
    const el = h("div", "item" + (onAir ? " onair" : ""),
      h("div", "item-head", tick, h("h3", {}, c.headline)),
      h("div", "chips",
        h("span", "chip", c.type), c.category && h("span", "chip", c.category),
        c.type === "news-drop" && h("span", "chip " + (c.confidence === "confirmed" ? "ok" : c.confidence === "disputed" || c.confidence === "unverified" ? "warn" : ""), c.confidence),
        h("span", "chip " + (c.approval === "approved" ? "ok" : c.approval === "rejected" ? "warn" : "hold"), c.approval),
        onAir && h("span", "chip warn", "on stream"),
        isNext && !onAir && h("span", "chip hold", "next up")),
      h("div", "row", show,
        btn(open ? "Close" : "Preview", () => { expanded = open ? null : c.id; renderQueue(); }, "small"),
        btn("Edit", () => openEditor(c), "small")));
    if (open) el.append(renderDetail(c));
    return el;
  };

  const renderDetail = (c) => {
    const s = c.source || {};
    const link = s.url && /^https?:\/\//i.test(s.url) ? h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, "Open source") : "no link";
    const notes = h("textarea", { rows: 3, maxlength: 2000, placeholder: "Private notes, never shown on stream",
      value: drafts[c.id] ?? c.presenterNotes ?? "", oninput: () => { drafts[c.id] = notes.value; } });
    return h("div", {},
      h("div", "pv", h("strong", {}, c.headline), c.summary && h("p", {}, c.summary), c.question && h("div", "q", c.question)),
      h("p", "sub", `Source: ${s.publisher || "none"}, ${link}`),
      h("p", "sub", `Published: ${fmt(s.publishedAt)}. Retrieved: ${fmt(s.retrievedAt)}. Event date: ${c.eventDate ? fmt(c.eventDate) : "not given"}.`),
      h("label", "f", h("span", {}, "Presenter notes"), notes),
      h("div", "row",
        btn("Save notes", async () => { if (await saveCard({ id: c.id, presenterNotes: notes.value })) delete drafts[c.id]; }, "small"),
        c.approval === "approved"
          ? btn("Move to pending", () => saveCard({ id: c.id, approval: "pending" }), "small")
          : btn("Approve", () => saveCard({ id: c.id, approval: "approved" }), "primary small"),
        c.approval !== "rejected" ? btn("Reject", () => saveCard({ id: c.id, approval: "rejected" }), "small") : null));
  };

  // ---------- card editor ----------
  const openEditor = (c) => { editing = c || {}; currentTab = "topics"; renderEditor(); renderApp(); editorEl.scrollIntoView({ behavior: "smooth" }); };

  const renderEditor = () => {
    editorEl.replaceChildren();
    editorEl.hidden = !editing;
    if (!editing) return;
    const c = editing, s = c.source || {};
    const f = {
      type: sel(TYPES, c.type || "news-drop"),
      category: h("input", { value: c.category || "", maxlength: 24 }),
      headline: h("input", { value: c.headline || "", maxlength: 120 }),
      summary: h("textarea", { rows: 3, maxlength: 280, value: c.summary || "" }),
      question: h("input", { value: c.question || "", maxlength: 140 }),
      confidence: sel(CONF, c.confidence || "unverified"),
      approval: sel(APPROVAL, c.approval || "pending"),
      publisher: h("input", { value: s.publisher || "", maxlength: 80 }),
      url: h("input", { type: "url", value: s.url || "", placeholder: "https://" }),
      publishedAt: h("input", { type: "datetime-local", value: toLocalInput(s.publishedAt) }),
      eventDate: h("input", { type: "date", value: (c.eventDate || "").slice(0, 10) }),
      ttlSec: h("input", { type: "number", min: 5, max: 300, value: c.ttlSec ?? "", placeholder: "45" }),
      witty: h("input", { type: "checkbox", style: "width:auto;flex:0 0 auto", checked: c.witty === true }),
    };
    const L = (label, el) => h("label", "f", h("span", {}, label), el);
    editorEl.append(h("h2", {}, c.id ? "Edit card" : "New card"),
      L("Type", f.type), L("Category", f.category), L("Headline", f.headline), L("Short summary", f.summary),
      L("Question for the audience", f.question), L("Confidence (news cards)", f.confidence), L("Approval", f.approval),
      L("Publisher", f.publisher), L("Source URL", f.url), L("Published (local time)", f.publishedAt),
      L("Event date", f.eventDate), L("Seconds on screen (5 to 300)", f.ttlSec),
      L("Witty on-air rewrite", f.witty),
      h("div", "row",
        btn("Save card", async () => {
          const ok = await saveCard({
            id: c.id, type: f.type.value, category: f.category.value, headline: f.headline.value,
            summary: f.summary.value, question: f.question.value, confidence: f.confidence.value, approval: f.approval.value,
            source: { publisher: f.publisher.value, url: f.url.value.trim() || null, publishedAt: f.publishedAt.value ? new Date(f.publishedAt.value).toISOString() : "" },
            eventDate: f.eventDate.value, ttlSec: f.ttlSec.value ? Number(f.ttlSec.value) : null,
            witty: f.witty.checked === true,
          });
          if (ok) { editing = null; renderEditor(); renderApp(); }
        }, "primary"),
        btn("Cancel", () => { editing = null; renderEditor(); renderApp(); })));
  };

  // ---------- boot ----------
  setInterval(renderCountdown, 1000);
  setInterval(() => {
    if (!token || document.visibilityState !== "visible" || busy) return;
    load();
    // Throttled to once a minute inside checkXFeed; only while the desk is in X mode.
    if (state?.mode === "x-following") void checkXFeed();
  }, 10000);
  document.addEventListener("visibilitychange", () => { if (token && document.visibilityState === "visible") load(); });
  if (token) load(); else showLogin();
})();
