/* CYBER LIVE DESK — private controller, checkpoint 2. Served at /control.
   Operate it from a second device. Every request carries the operator token
   (stored in this browser only); the public overlay never sees notes or the token.
   Loaded as a module so the chat command rules can be shared with the tests. */
import { COMMAND_HELP, chatMayCommand, parseAllowIds, parseDeskCommand } from "./desk-commands.js";

(() => {
  "use strict";

  const TOKEN_KEY = "desk.token";
  const TYPES = ["news-drop", "trend-topic", "slang", "street-question", "viewer-question"];
  const CONF = ["confirmed", "reported", "disputed", "unverified", "test"];
  const APPROVAL = ["pending", "approved", "rejected"];

  let token = "";
  try { token = localStorage.getItem(TOKEN_KEY) || ""; } catch { /* private mode */ }
  let cards = [];
  let state = null;
  let offset = 0; // server clock minus this device's clock
  let busy = false;
  let expanded = null;
  let editing = null;
  const drafts = {}; // unsaved presenter notes, by card id
  const filter = { text: "", cat: "", status: "approved" };

  // ---------- helpers ----------
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
  const btn = (label, onclick, cls = "") => h("button", { type: "button", class: "b " + cls, onclick }, label);
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

  const toastEl = h("div", "toast");
  let toastTimer;
  const toast = (msg, bad = false) => {
    toastEl.textContent = msg;
    toastEl.className = "toast show" + (bad ? " bad" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.className = "toast"), bad ? 6000 : 2200);
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
    } catch (e) { toast(e.message, true); }
    finally { busy = false; document.body.classList.remove("busy"); }
  };

  const saveCard = async (payload) => {
    try {
      const { card } = await api("/api/desk/cards", payload);
      const i = cards.findIndex((c) => c.id === card.id);
      if (i >= 0) cards[i] = card; else cards.push(card);
      renderLive();
      toast("Card saved.");
      return card;
    } catch (e) { toast(e.message, true); return null; }
  };

  const load = async () => {
    try {
      const j = await api("/api/desk/cards");
      cards = j.cards; state = j.state; offset = j.serverNow - Date.now();
      if (Array.isArray(j.desks)) desks = j.desks;
      renderLive();
    } catch (e) { if (token) toast(e.message, true); }
  };

  // ---------- layout ----------
  const CSS = `
*{box-sizing:border-box}body{margin:0;background:#0B1220;color:#E8EEF7;font:16px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#app{max-width:1200px;margin:0 auto;padding:12px 12px 90px;display:grid;gap:12px}
@media (min-width: 960px){
  #app{grid-template-columns: 460px 1fr; align-items: start;}
  .col-left{display:grid;gap:12px;position:sticky;top:12px;}
  .col-right{display:grid;gap:12px;}
}
.col-left,.col-right{display:grid;gap:12px}
.panel{background:#121C2E;border-radius:14px;padding:12px}
h2{margin:0 0 8px;font-size:1rem;display:flex;align-items:center;justify-content:space-between}
.status{position:sticky;top:0;z-index:5;border:2px solid #2A3750;background:#121C2E}.status.live{border-color:#FF5A47}
.pill{display:inline-block;padding:.15em .7em;border-radius:99px;font-weight:800;background:#2A3750}.live .pill{background:#FF5A47;color:#fff}
.now{font-size:1.15rem;font-weight:800;margin:.3em 0}.sub{color:#9FB0C6;font-size:.9rem}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.b{min-height:48px;border:0;border-radius:12px;background:#24344F;color:#E8EEF7;font:inherit;font-weight:700;padding:.5em .8em;cursor:pointer}
.b.go{background:#FFB224;color:#1A1204}.b.danger{background:#FF5A47;color:#fff}.b.on{outline:3px solid #7CC4FF}
.b.big{min-height:54px;font-size:1.05rem;font-weight:900}
.b.small{min-height:38px;padding:.3em .6em;font-size:.88rem}.b:disabled{opacity:.4;cursor:not-allowed}.busy .b{opacity:.6}
input,select,textarea{width:100%;font:inherit;color:#E8EEF7;background:#0B1220;border:1px solid #2A3750;border-radius:10px;padding:.55em .7em}
textarea{resize:vertical}.f{display:grid;gap:4px;margin-bottom:8px}.f span{font-size:.85rem;color:#9FB0C6}
.row{display:flex;gap:8px;align-items:center}.row>*{flex:1}.item{background:#0F192B;border-radius:12px;padding:10px;margin-bottom:8px;border-left:6px solid #2A3750}
.item.onair{border-left-color:#FF5A47}.item h3{margin:0 0 4px;font-size:1rem}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.chip{font-size:.78rem;padding:.05em .6em;border-radius:99px;background:#24344F}
.chip.ok{background:#14594A;color:#2ED3A5}.chip.warn{background:#6B2E26;color:#FF7A66}.chip.hold{background:#5A4510;color:#FFD15C}
.pv{background:#0B1220;border-radius:10px;padding:10px;margin:8px 0;border-left:6px solid #FFB224}
.pv .q{margin:8px -10px -10px;padding:8px 10px;background:#FFB224;color:#1A1204;font-weight:800;border-radius:0 0 10px 0}
.opt{display:flex;align-items:center;gap:8px;margin-bottom:6px}.opt .name{flex:1;font-weight:700}.opt .b{min-width:64px}
.toast{position:fixed;left:12px;right:12px;bottom:14px;max-width:560px;margin:0 auto;padding:12px;border-radius:12px;background:#14594A;opacity:0;pointer-events:none;transition:opacity .2s;z-index:9}
.toast.show{opacity:1}.toast.bad{background:#8A2F25}a{color:#7CC4FF}

/* Preview monitor */
.preview-wrap{position:relative;background:#050912;border-radius:12px;overflow:hidden;border:1px solid #2A3750;margin:8px 0;display:flex;justify-content:center;align-items:center;padding:12px;min-height:220px}
.preview-frame{border:0;background:rgba(255,255,255,0.02);border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.8);transition:width 0.25s ease,height 0.25s ease}
.preview-9-16{width:210px;height:373px}
.preview-16-9{width:380px;height:214px}

/* CRID styling */
.crid-card{background:#0A1220;border:2px solid #FFB224;border-radius:12px;padding:12px;margin:8px 0;box-shadow:0 0 14px rgba(255,178,36,0.18)}
.verdict-box{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}
.v-badge{padding:.35em .7em;border-radius:6px;font-weight:800;font-size:.85rem;text-transform:uppercase;display:inline-block}
.v-1{background:#14594A;color:#2ED3A5;border:1.5px solid #2ED3A5;box-shadow:0 0 8px rgba(46,211,165,.3)}
.v-0{background:#6B2E26;color:#FF7A66;border:1.5px solid #FF7A66;box-shadow:0 0 8px rgba(255,122,102,.3)}

/* Desk chips */
.desk-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.desk-btn{min-height:36px;padding:.35em .75em;border-radius:20px;background:#1B263B;border:1px solid #2A3750;color:#B9C6D8;font-size:.85rem;font-weight:700;cursor:pointer}
.desk-btn.active{background:#FFB224;color:#1A1204;border-color:#FFB224;font-weight:900}
`;
  const style = h("style"); style.textContent = CSS; document.head.append(style);
  document.title = "Live desk controller";

  const root = h("div", { id: "app" });
  document.body.append(root, toastEl);

  const statusEl = h("section", "panel status");
  const holdBtn = btn("Hold card", () => act("hold"));
  const srcBtn = btn("Show source", () => act("source"));
  const modeBtn = btn("X feed", () => act("mode", { mode: state?.mode === "x-following" ? "cards" : "x-following" }));
  // ---------- Live Overlay Preview (Swae / OBS Monitor) ----------
  let previewRatio = "9-16"; // "9-16" | "16-9"
  const previewFrame = h("iframe", { class: "preview-frame preview-9-16", src: "/desk?debug=0", title: "Viewer Overlay Preview" });
  const btnRatio916 = btn("Swae (9:16)", () => setPreviewRatio("9-16"), "b small go");
  const btnRatio169 = btn("Landscape (16:9)", () => setPreviewRatio("16-9"), "b small");
  const setPreviewRatio = (r) => {
    previewRatio = r;
    previewFrame.className = `preview-frame preview-${r}`;
    btnRatio916.classList.toggle("go", r === "9-16");
    btnRatio169.classList.toggle("go", r === "16-9");
  };
  const copySwaeUrl = () => {
    const url = `${location.origin}/desk?pos=bottom-left`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => toast("Copied Swae URL to clipboard!")).catch(() => prompt("Swae Overlay URL:", url));
    } else {
      prompt("Swae Overlay URL:", url);
    }
  };
  const reloadPreview = () => {
    try { previewFrame.src = "/desk?debug=0&r=" + Date.now(); } catch { /* ignore */ }
    toast("Preview refreshed");
  };
  const previewPanel = h("section", "panel preview-panel",
    h("div", { class: "row", style: "justify-content:space-between;margin-bottom:8px" },
      h("h2", { style: "margin:0" }, "Live Stream Monitor"),
      h("div", { class: "row", style: "flex:0 0 auto;gap:4px" },
        btnRatio916, btnRatio169,
        btn("↻", reloadPreview, "b small"),
        btn("Copy Swae URL", copySwaeUrl, "b small"))),
    h("div", "preview-wrap", previewFrame),
    h("p", "sub", "Live viewer overlay: CRID Jumbotron (top) & Cards (bottom). Scaled for Swae iPhone stream & OBS."));

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
          btn("✔ STAMP: RENT PAID (1)", () => act("crid-verdict", { value: 1 }), "b big " + (crid.verdict === 1 ? "go on" : "go")),
          btn("✖ STAMP: STILL OWING (0)", () => act("crid-verdict", { value: 0 }), "b big " + (crid.verdict === 0 ? "danger on" : "danger"))),
        h("div", "row",
          !state?.poll?.active && !crid.result ? btn("Start Rent Poll", () => act("start-poll", { question: crid.title, options: ["Rent Paid", "Still Owing"] }), "b small go") : null,
          btn("Close CRID Segment", () => act("crid-close"), "b small danger")));
    } else {
      cridPanel.append(
        h("h2", {}, "CRID — Cyber's Rent Is Due", h("span", { class: "chip" }, "Jumbotron")),
        h("p", "sub", "Broadcast a live topic or debate to the viewer jumbotron. Credit a Stranger and stamp rent verdicts."),
        h("label", "f", h("span", {}, "Segment Kind"), cridKindSel),
        h("label", "f", h("span", {}, "Segment Title / Subject (max 120 chars)"), cridTitleIn),
        h("label", "f", h("span", {}, "Stranger Credit (community member, max 30 chars)"), cridCreditIn),
        btn("Open Jumbotron Segment", async () => {
          const title = cridTitleIn.value.trim();
          if (!title) return toast("Enter a segment title", true);
          await act("crid-open", { kind: cridKindSel.value, title, credit: cridCreditIn.value.trim() || undefined });
          cridTitleIn.value = "";
          cridCreditIn.value = "";
        }, "b go big"));
    }
  };

  // ---------- desks ----------
  // The manual side of what chat can say. The server owns the list and sends it with the cards,
  // so this selector and a "desk <name>" command can never drift apart.
  let desks = [];
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
      btn("Next card ▶", () => act("next"), "b go big"),
      btn("◀ Previous", () => act("previous"), "b big")),
    h("div", "grid",
      holdBtn, srcBtn, modeBtn,
      btn("Street question", () => streetQuestion()),
      btn("Hide overlay", () => act("hide"), "b danger")));

  // ---------- auto or manual ----------
  // Both switches start off and only ever move what you already approved. Hold, Hide, Next
  // and Show override auto-play instantly; auto research only ever files PENDING cards.
  const AUTO_MIN = 15; // must match the cron in netlify/functions/desk-auto-research.mjs
  const MAX_PENDING = 60; // must match RESEARCH_MAX_PENDING in netlify/functions/_desk-core.mjs
  const autoPlayBtn = btn("Auto-play: off", () => act("auto-play"));
  const autoResearchBtn = btn("Auto research: off", () => act("auto-research"));
  const autoNote = h("p", "sub");
  const autoEl = h("section", "panel", h("h2", {}, "Auto or manual"),
    h("div", "grid", autoPlayBtn, autoResearchBtn), autoNote);

  const pq = h("input", { placeholder: "Leave blank to use the card's question", maxlength: 140 });
  const po = h("textarea", { rows: 3, placeholder: "One answer per line (2 or 3)" });
  const pollLive = h("div");
  const pollEl = h("section", "panel", h("h2", {}, "Live poll"),
    h("label", "f", h("span", {}, "Question"), pq),
    h("label", "f", h("span", {}, "Answers"), po),
    btn("Start poll", () => act("start-poll", { question: pq.value, options: po.value.split("\n").map((s) => s.trim()).filter(Boolean) }), "go"),
    pollLive);

  const fText = h("input", { placeholder: "Search headlines", oninput: () => { filter.text = fText.value.toLowerCase(); renderQueue(); } });
  const fCat = h("select", { onchange: () => { filter.cat = fCat.value; renderQueue(); } });
  const fStatus = sel(["approved", "pending", "rejected", "all"], "approved");
  fStatus.onchange = () => { filter.status = fStatus.value; renderQueue(); };
  const queueEl = h("div");
  const editorEl = h("section", "panel");
  editorEl.hidden = true;
  const researchEl = h("div");
  const researchBtn = btn("Fetch headlines now (Nigeria + US)", async () => {
    if (busy) return;
    busy = true; researchBtn.disabled = true; researchBtn.textContent = "Fetching…";
    try {
      const j = await api("/api/desk/research", {});
      filter.status = "pending"; fStatus.value = "pending";
      await load();
      researchEl.replaceChildren(h("div", {},
        h("p", "sub", `${j.added} new cards added as pending. Open one, write your own summary and question, then approve.`),
        j.dropped ? h("p", "sub", `${j.dropped} auto cards you never wrote on were older than a day and have been dropped.`) : null,
        j.held ? h("p", "sub", `${j.held} more were ready but were not filed: ${j.pending} pending already fills the queue of ${MAX_PENDING}. Approve or reject some, or they age out after a day.`) : null,
        j.feeds.map((f) => h("p", "sub", f.ok ? `${f.label}: ${f.found} found, ${f.added} new${f.via && f.via !== "direct" ? ` (via ${f.via})` : ""}` : `${f.label}: failed (${f.error})`))));
      toast(`${j.added} new pending cards.`);
    } catch (e) { toast(e.message, true); }
    finally { busy = false; researchBtn.disabled = false; researchBtn.textContent = "Fetch headlines now (Nigeria + US)"; }
  }, "go small");
  researchBtn.style.width = "100%";
  const queuePanel = h("section", "panel", h("h2", {}, "Card queue"),
    researchBtn, researchEl, h("div", { style: "height:8px" }),
    h("div", "row", fText, fCat, fStatus), h("div", { style: "height:8px" }), queueEl,
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
    h("div", "row", btn("Show now", () => useSlang(true), "go small"), btn("Add to queue", () => useSlang(false), "small")));


  // ---------- Twitch chat (read-only) ----------
  // Runs in this tab: keep it open and the screen awake while live.
  // Uses Twitch's anonymous read-only chat login, so it can read chat but never post.
  // The same socket also reads desk commands, which is why this tab has to be open: a Netlify
  // function answers a request and dies, so nothing server-side can hold a chat connection.
  const CHAT_KEY = "desk.channel";
  const CMD_KEY = "desk.commands";
  const IDS_KEY = "desk.commandIds";
  const chat = { ws: null, name: "", want: false, retry: 0, count: true, commands: false, allowIds: [], log: [], msgs: [], seen: 0, hidden: 0, voters: new Map(), votePollId: null, syncTimer: null, drawTimer: null };
  let savedChannel = "";
  let savedIds = "";
  try {
    savedChannel = localStorage.getItem(CHAT_KEY) || "";
    savedIds = localStorage.getItem(IDS_KEY) || "";
    chat.commands = localStorage.getItem(CMD_KEY) === "1";
    chat.allowIds = parseAllowIds(savedIds);
  } catch { /* ignore */ }
  const chInput = h("input", { value: savedChannel || "otolorin_cyber", placeholder: "Twitch channel name" });
  const chStatus = h("p", "sub", "Not connected.");
  const chCount = h("input", { type: "checkbox", checked: true, style: "width:auto;flex:0 0 auto", onchange: () => { chat.count = chCount.checked; } });
  const chCmd = h("input", {
    type: "checkbox", checked: chat.commands, style: "width:auto;flex:0 0 auto",
    onchange: () => { chat.commands = chCmd.checked; try { localStorage.setItem(CMD_KEY, chCmd.checked ? "1" : "0"); } catch { /* ignore */ } },
  });
  const chIds = h("textarea", {
    rows: 2, value: savedIds, placeholder: "Twitch user ids allowed to command, separated by commas or lines",
    onchange: () => { chat.allowIds = parseAllowIds(chIds.value); try { localStorage.setItem(IDS_KEY, chIds.value); } catch { /* ignore */ } },
  });
  const chInbox = h("div");
  const chLog = h("div", "sub");
  const chBtn = btn("Connect to chat", () => (chat.want ? chatStop() : chatStart()), "go");
  const chatPanel = h("section", "panel", h("h2", {}, "Twitch chat"),
    h("div", "row", chInput, chBtn), chStatus,
    h("label", { class: "row", style: "margin:8px 0" }, chCount, h("span", {}, "Count 1, 2, 3 or !vote a as poll votes")),
    h("label", { class: "row", style: "margin:8px 0" }, chCmd, h("span", {}, "Let chat drive the desk (this tab only)")),
    chIds,
    h("p", "sub", "Your own account always counts, plus the ids above. Moderators do not. Commands: " + COMMAND_HELP),
    chLog,
    chInbox);

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
    cridPanel.scrollIntoView({ behavior: "smooth" });
    toast(`Loaded into CRID from Stranger @${m.name}`);
  };

  const drawInbox = () => {
    chat.drawTimer = null;
    if (chat.want && chat.name) chStatus.textContent = `Connected to #${chat.name}. ${chat.seen} messages seen, ${chat.hidden} hidden (links or long numbers).`;
    chInbox.replaceChildren(...(chat.msgs.length
      ? chat.msgs.slice(-10).reverse().map((m) => h("div", "item", h("div", "sub", `Stranger @${m.name}`), h("div", {}, m.text),
          h("div", "row",
            btn("Show now", () => useMessage(m, true), "go small"),
            btn("Add to queue", () => useMessage(m, false), "small"),
            btn("Credit in CRID", () => setCridFromChat(m), "small"))))
      : [h("p", "sub", "Chat messages appear here. Nothing reaches the stream until you tap one.")]));
  };
  const drawSoon = () => { if (!chat.drawTimer) chat.drawTimer = setTimeout(drawInbox, 400); };

  const logChat = (line, bad = false) => {
    chat.log.push({ t: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), line, bad });
    if (chat.log.length > 6) chat.log.shift();
    chLog.replaceChildren(...chat.log.map((l) => h("div", { style: l.bad ? "color:#FF9A8D" : "" }, `${l.t}  ${l.line}`)));
  };

  // A command can only move what is already approved. Approving, editing, deleting and fetching
  // stay behind the panel, so a leaked user id gets a remote for the cards you already picked.
  const CHAT_ACTIONS = { next: "next", prev: "previous", hold: "hold", hide: "hide", stop: "end-poll" };
  const commandBody = (cmd) =>
    cmd.verb === "poll" ? { action: "start-poll", question: cmd.question, options: cmd.options }
      : cmd.verb === "auto" ? { action: "auto-play", value: cmd.value === "on" }
      : cmd.verb === "desk" ? { action: "desk", desk: cmd.desk }
      : { action: CHAT_ACTIONS[cmd.verb] };
  const asText = (cmd) =>
    cmd.verb === "poll" ? `desk poll ${cmd.question || "(card question)"}`
      : cmd.verb === "auto" ? `desk auto ${cmd.value}`
      : cmd.verb === "desk" ? `desk ${cmd.desk}`
      : `desk ${cmd.verb}`;

  const runCommand = async (name, id, cmd, tags) => {
    const gate = chatMayCommand(tags, { enabled: true, allowIds: chat.allowIds });
    if (!gate.ok) return logChat(`${name} (${id}) tried ${asText(cmd)} — ${gate.reason}`, true);
    if (busy) return logChat(`${asText(cmd)} ignored: the panel was busy`, true);
    busy = true;
    document.body.classList.add("busy");
    try {
      const j = await api("/api/desk/action", commandBody(cmd));
      state = j.state;
      offset = j.serverNow - Date.now();
      renderLive();
      logChat(`${name} as ${gate.as}: ${asText(cmd)} → ${j.state.desk ? j.state.desk + " desk" : "all desks"}, ${j.state.visible ? "on air" : "hidden"}`);
    } catch (e) {
      logChat(`${name}: ${asText(cmd)} refused — ${e.message}`, true);
    } finally {
      busy = false;
      document.body.classList.remove("busy");
    }
  };

  const onChat = (name, id, text, tags) => {
    chat.seen++;
    // Commands are checked before the vote matcher and before the link filter, so a command is
    // never mistaken for a vote and never counted as a hidden message.
    const cmd = chat.commands ? parseDeskCommand(text) : null;
    if (cmd) { runCommand(name, id, cmd, tags); return drawSoon(); }
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
    chBtn.textContent = "Disconnect"; chBtn.classList.remove("go");
    keepAwake();
    chatOpen(name);
  };
  const chatStop = () => {
    chat.want = false;
    const ws = chat.ws; chat.ws = null; ws?.close();
    chBtn.textContent = "Connect to chat"; chBtn.classList.add("go");
    chStatus.textContent = "Not connected.";
  };
  document.addEventListener("visibilitychange", () => { if (chat.want && document.visibilityState === "visible") keepAwake(); });
  drawInbox();

  const colLeft = h("div", "col-left", statusEl, previewPanel, controlsEl, cridPanel);
  const colRight = h("div", "col-right", autoEl, pollEl, chatPanel, slangPanel, queuePanel, editorEl);
  root.append(colLeft, colRight);

  // ---------- login ----------
  const showLogin = (msg = "") => {
    root.hidden = true;
    let box = document.getElementById("login");
    if (box) box.remove();
    const t = h("input", { type: "password", placeholder: "Operator token", autocomplete: "current-password" });
    const go = () => {
      token = t.value.trim();
      if (!token) return;
      try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
      box.remove(); root.hidden = false; load();
    };
    t.onkeydown = (e) => { if (e.key === "Enter") go(); };
    box = h("section", { id: "login", class: "panel", style: "max-width:420px;margin:12vh auto;" },
      h("h2", {}, "Live desk controller"), msg && h("p", "sub", msg), h("label", "f", h("span", {}, "Operator token"), t), btn("Connect", go, "go"));
    document.body.append(box);
  };

  // ---------- rendering ----------
  const activeCard = () => cards.find((c) => c.id === state?.activeCardId) || null;

  const cdEl = h("span", "sub");
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
      cdEl);
    renderCountdown();
    holdBtn.textContent = state.hold ? "Release hold" : "Hold card"; holdBtn.classList.toggle("on", state.hold);
    srcBtn.textContent = state.showSource ? "Hide source" : "Show source"; srcBtn.classList.toggle("on", state.showSource);
    modeBtn.textContent = state.mode === "x-following" ? "Back to cards" : "X feed"; modeBtn.classList.toggle("on", state.mode === "x-following");

    autoPlayBtn.textContent = state.autoPlay ? "Auto-play: on" : "Auto-play: off";
    autoPlayBtn.classList.toggle("on", !!state.autoPlay);
    autoResearchBtn.textContent = state.autoResearch ? "Auto research: on" : "Auto research: off";
    autoResearchBtn.classList.toggle("on", !!state.autoResearch);
    const approved = desk ? desk.count : cards.filter((c) => c.approval === "approved").length;
    const inDesk = desk ? ` on the ${desk.label} desk` : " in the queue";
    autoNote.textContent =
      (state.autoPlay
        ? `On air: cards move on by themselves when their seconds run out (${approved} approved${inDesk}). Hold or Hide stops it.`
        : "On air: nothing moves unless you tap it.") +
      " " +
      (state.autoResearch
        ? `Research: new headlines and trends arrive about every ${AUTO_MIN} min as pending, never on air. Anything you have not written on is dropped after a day, and the queue holds ${MAX_PENDING} at most.`
        : `Research: manual only. The scheduled job stays idle while this is off.`);

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
    const b = btn(label, () => act("vote", { option: o.id, delta }), delta > 0 ? "go" : "");
    b.disabled = !state?.poll?.active;
    return b;
  };

  const streetQuestion = () => {
    const list = cards.filter((c) => c.type === "street-question" && c.approval === "approved");
    if (!list.length) return toast("No approved street questions yet. Add one with New card.", true);
    const i = list.findIndex((c) => c.id === state?.activeCardId);
    act("show", { cardId: list[(i + 1) % list.length].id });
  };

  const renderQueue = () => {
    const cats = [...new Set(cards.map((c) => c.category).filter(Boolean))].sort();
    const keep = filter.cat;
    fCat.replaceChildren(h("option", { value: "" }, "All categories"), ...cats.map((c) => h("option", { value: c }, c)));
    fCat.value = cats.includes(keep) ? keep : "";
    filter.cat = fCat.value;

    const list = cards.filter((c) =>
      (filter.status === "all" || c.approval === filter.status) &&
      (!filter.cat || c.category === filter.cat) &&
      (!filter.text || (c.headline + " " + c.summary + " " + c.category).toLowerCase().includes(filter.text)));
    // Approved cards are shown in the order the server plays them, so what auto-play will
    // do next is readable off the queue. Anything else is newest-first.
    let nextId = null;
    if (filter.status === "approved") {
      list.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
      nextId = autoNextId(list);
    } else list.sort((a, b) => b.createdAt - a.createdAt);
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
    const show = btn("Show on stream", () => act("show", { cardId: c.id }), "go small");
    show.disabled = c.approval !== "approved";
    const el = h("div", "item" + (onAir ? " onair" : ""),
      h("h3", {}, c.headline),
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
          : btn("Approve", () => saveCard({ id: c.id, approval: "approved" }), "go small"),
        c.approval !== "rejected" ? btn("Reject", () => saveCard({ id: c.id, approval: "rejected" }), "small") : null));
  };

  // ---------- card editor ----------
  const openEditor = (c) => { editing = c || {}; renderEditor(); editorEl.scrollIntoView({ behavior: "smooth" }); };

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
    };
    const L = (label, el) => h("label", "f", h("span", {}, label), el);
    editorEl.append(h("h2", {}, c.id ? "Edit card" : "New card"),
      L("Type", f.type), L("Category", f.category), L("Headline", f.headline), L("Short summary", f.summary),
      L("Question for the audience", f.question), L("Confidence (news cards)", f.confidence), L("Approval", f.approval),
      L("Publisher", f.publisher), L("Source URL", f.url), L("Published (local time)", f.publishedAt),
      L("Event date", f.eventDate), L("Seconds on screen (5 to 300)", f.ttlSec),
      h("div", "row",
        btn("Save card", async () => {
          const ok = await saveCard({
            id: c.id, type: f.type.value, category: f.category.value, headline: f.headline.value,
            summary: f.summary.value, question: f.question.value, confidence: f.confidence.value, approval: f.approval.value,
            source: { publisher: f.publisher.value, url: f.url.value.trim() || null, publishedAt: f.publishedAt.value ? new Date(f.publishedAt.value).toISOString() : "" },
            eventDate: f.eventDate.value, ttlSec: f.ttlSec.value ? Number(f.ttlSec.value) : null,
          });
          if (ok) { editing = null; renderEditor(); }
        }, "go"),
        btn("Cancel", () => { editing = null; renderEditor(); })));
  };

  // ---------- boot ----------
  setInterval(renderCountdown, 1000);
  setInterval(() => { if (token && document.visibilityState === "visible" && !busy) load(); }, 10000);
  document.addEventListener("visibilitychange", () => { if (token && document.visibilityState === "visible") load(); });
  if (token) load(); else showLogin();
})();
