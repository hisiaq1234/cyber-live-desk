/* CYBER LIVE DESK — private controller, checkpoint 2. Served at /control.
   Operate it from a second device. Every request carries the operator token
   (stored in this browser only); the public overlay never sees notes or the token. */
(() => {
  "use strict";

  const TOKEN_KEY = "desk.token";
  const TYPES = ["news-drop", "street-question", "viewer-question"];
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
      renderLive();
    } catch (e) { if (token) toast(e.message, true); }
  };

  // ---------- layout ----------
  const CSS = `
*{box-sizing:border-box}body{margin:0;background:#0B1220;color:#E8EEF7;font:16px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#app{max-width:760px;margin:0 auto;padding:12px 12px 90px;display:grid;gap:12px}
.panel{background:#121C2E;border-radius:14px;padding:12px}
h2{margin:0 0 8px;font-size:1rem}
.status{position:sticky;top:0;z-index:5;border:2px solid #2A3750}.status.live{border-color:#FF5A47}
.pill{display:inline-block;padding:.1em .7em;border-radius:99px;font-weight:800;background:#2A3750}.live .pill{background:#FF5A47;color:#fff}
.now{font-size:1.15rem;font-weight:800;margin:.3em 0}.sub{color:#9FB0C6;font-size:.9rem}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.b{min-height:48px;border:0;border-radius:12px;background:#24344F;color:#E8EEF7;font:inherit;font-weight:700;padding:.5em .8em}
.b.go{background:#FFB224;color:#1A1204}.b.danger{background:#FF5A47;color:#fff}.b.on{outline:3px solid #7CC4FF}
.b.small{min-height:40px}.b:disabled{opacity:.4}.busy .b{opacity:.6}
input,select,textarea{width:100%;font:inherit;color:#E8EEF7;background:#0B1220;border:1px solid #2A3750;border-radius:10px;padding:.55em .7em}
textarea{resize:vertical}.f{display:grid;gap:4px;margin-bottom:8px}.f span{font-size:.85rem;color:#9FB0C6}
.row{display:flex;gap:8px;align-items:center}.row>*{flex:1}.item{background:#0F192B;border-radius:12px;padding:10px;margin-bottom:8px;border-left:6px solid #2A3750}
.item.onair{border-left-color:#FF5A47}.item h3{margin:0 0 4px;font-size:1rem}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.chip{font-size:.78rem;padding:.05em .6em;border-radius:99px;background:#24344F}
.chip.ok{background:#14594A}.chip.warn{background:#6B2E26}.chip.hold{background:#5A4510}
.pv{background:#0B1220;border-radius:10px;padding:10px;margin:8px 0;border-left:6px solid #FFB224}
.pv .q{margin:8px -10px -10px;padding:8px 10px;background:#FFB224;color:#1A1204;font-weight:800;border-radius:0 0 10px 0}
.opt{display:flex;align-items:center;gap:8px;margin-bottom:6px}.opt .name{flex:1;font-weight:700}.opt .b{min-width:64px}
.toast{position:fixed;left:12px;right:12px;bottom:14px;max-width:560px;margin:0 auto;padding:12px;border-radius:12px;background:#14594A;opacity:0;pointer-events:none;transition:opacity .2s;z-index:9}
.toast.show{opacity:1}.toast.bad{background:#8A2F25}a{color:#7CC4FF}
`;
  const style = h("style"); style.textContent = CSS; document.head.append(style);
  document.title = "Live desk controller";

  const root = h("div", { id: "app" });
  document.body.append(root, toastEl);

  const statusEl = h("section", "panel status");
  const holdBtn = btn("Hold card", () => act("hold"));
  const srcBtn = btn("Show source", () => act("source"));
  const modeBtn = btn("X feed", () => act("mode", { mode: state?.mode === "x-following" ? "cards" : "x-following" }));
  const controlsEl = h("section", "panel",
    h("div", "grid",
      btn("Previous card", () => act("previous")),
      btn("Next card", () => act("next"), "go"),
      holdBtn, srcBtn, modeBtn,
      btn("Street question", () => streetQuestion()),
      btn("Hide overlay", () => act("hide"), "danger")));

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
  const queuePanel = h("section", "panel", h("h2", {}, "Card queue"),
    h("div", "row", fText, fCat, fStatus), h("div", { style: "height:8px" }), queueEl,
    btn("New card", () => openEditor(null), "small"));


  // ---------- Twitch chat (read-only) ----------
  // Runs in this tab: keep it open and the screen awake while live.
  // Uses Twitch's anonymous read-only chat login, so it can read chat but never post.
  const CHAT_KEY = "desk.channel";
  const chat = { ws: null, name: "", want: false, retry: 0, count: true, msgs: [], seen: 0, hidden: 0, voters: new Map(), votePollId: null, syncTimer: null, drawTimer: null };
  let savedChannel = "";
  try { savedChannel = localStorage.getItem(CHAT_KEY) || ""; } catch { /* ignore */ }
  const chInput = h("input", { value: savedChannel || "otolorin_cyber", placeholder: "Twitch channel name" });
  const chStatus = h("p", "sub", "Not connected.");
  const chCount = h("input", { type: "checkbox", checked: true, style: "width:auto;flex:0 0 auto", onchange: () => { chat.count = chCount.checked; } });
  const chInbox = h("div");
  const chBtn = btn("Connect to chat", () => (chat.want ? chatStop() : chatStart()), "go");
  const chatPanel = h("section", "panel", h("h2", {}, "Twitch chat"),
    h("div", "row", chInput, chBtn), chStatus,
    h("label", { class: "row", style: "margin:8px 0" }, chCount, h("span", {}, "Count 1, 2, 3 or !vote a as poll votes")),
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

  const drawInbox = () => {
    chat.drawTimer = null;
    if (chat.want && chat.name) chStatus.textContent = `Connected to #${chat.name}. ${chat.seen} messages seen, ${chat.hidden} hidden (links or long numbers).`;
    chInbox.replaceChildren(...(chat.msgs.length
      ? chat.msgs.slice(-10).reverse().map((m) => h("div", "item", h("div", "sub", m.name), h("div", {}, m.text),
          h("div", "row", btn("Show now", () => useMessage(m, true), "go small"), btn("Add to queue", () => useMessage(m, false), "small"))))
      : [h("p", "sub", "Chat messages appear here. Nothing reaches the stream until you tap one.")]));
  };
  const drawSoon = () => { if (!chat.drawTimer) chat.drawTimer = setTimeout(drawInbox, 400); };

  const onChat = (name, id, text) => {
    chat.seen++;
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
    return { name, id: tags["user-id"] || m[2], text: m[3].replace(/^\u0001ACTION |\u0001$/g, "") };
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
        else { const p = parseLine(line); if (p) onChat(p.name, p.id, p.text); }
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

  root.append(statusEl, controlsEl, pollEl, chatPanel, queuePanel, editorEl);

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
    cdEl.textContent = state.expiresAt ? `Leaves in ${Math.max(0, Math.round((state.expiresAt - serverNow()) / 1000))}s` : "";
  };

  const renderLive = () => {
    statusEl.replaceChildren();
    statusEl.classList.toggle("live", !!state?.visible);
    if (!state) { statusEl.append(h("p", "sub", "Connecting")); return; }
    const c = activeCard();
    const what = !state.visible ? "Nothing on stream"
      : state.mode === "x-following" ? "X Following timeline"
      : c ? c.headline : state.poll ? "Poll: " + state.poll.question : "Overlay is on but empty";
    statusEl.append(
      h("span", "pill", state.visible ? "On stream" : "Hidden"),
      h("div", "now", what),
      h("div", "sub", `Mode: ${state.mode === "x-following" ? "X feed" : "Cards"}${state.showSource ? ", source shown" : ""}`),
      cdEl);
    renderCountdown();
    holdBtn.textContent = state.hold ? "Release hold" : "Hold card"; holdBtn.classList.toggle("on", state.hold);
    srcBtn.textContent = state.showSource ? "Hide source" : "Show source"; srcBtn.classList.toggle("on", state.showSource);
    modeBtn.textContent = state.mode === "x-following" ? "Back to cards" : "X feed"; modeBtn.classList.toggle("on", state.mode === "x-following");

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
    queueEl.replaceChildren(...(list.length ? list.map(renderItem) : [h("p", "sub", "No cards match. Change the filters or add a card.")]));
  };

  const renderItem = (c) => {
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
        onAir && h("span", "chip warn", "on stream")),
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
