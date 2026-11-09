/* Session memory — what lets Crid reference ten minutes ago instead of only now.
 *
 * Four kinds of thing are kept, all in RAM, per session:
 *   chat    — the recent conversation (ring, last 200)
 *   moments — notable live events, the honest FOMO record ("what happened while you were gone")
 *   actions — Crid's OWN past actions and the moment each belonged to, with timestamps
 *   topics  — token frequency, so a repeated subject is detectable rather than invisible
 *
 * Warm tier (SQLite under ~/.crid) is deliberately out of scope this pass: the overlay is
 * stateless and the brain owns state, so RAM plus a snapshot is enough to survive a reload.
 */
const STOPWORDS = new Set(
  `a an and are as at be but by can for from get got had has have he her here him his how i if in is it its just like me my no not now of on one or our out she so that the their them then there they this to too up us was we were what when where which who why will with you your yes yeah lol lmao omg haha hi hey gg ggs ok okay u ur im ive dont cant hes shes thats whats isnt didnt doesnt youre theyre weve lets gonna wanna kinda again always surely someone hold real way thing time does doing done says said said been more most some any all very still even back here there`.split(
    /\s+/,
  ),
);

export function tokenise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/'/g, ""))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

export const MIN = 60_000;

export class SessionMemory {
  constructor({ now = Date.now, maxChat = 200, maxMoments = 200, maxActions = 200 } = {}) {
    this.now = now;
    this.maxChat = maxChat;
    this.maxMoments = maxMoments;
    this.maxActions = maxActions;
    this.startedAt = now();
    this.chat = [];
    this.moments = [];
    this.actions = [];
    this.notable = [];
    this.seen = new Map();
    this.topics = new Map();
    this.counters = { messages: 0, subs: 0, gifts: 0, bits: 0, raids: 0, actions: 0 };
    this.lastChatTs = 0;
    this.lastActionTs = 0;
    this.momentSeq = 0;
  }

  /* ---------- writes ---------- */

  recordChat(evt) {
    const entry = { ts: evt.ts, user: evt.user, text: evt.text || "", bits: evt.bits || evt.amount || 0 };
    this.chat.push(entry);
    if (this.chat.length > this.maxChat) this.chat.shift();
    this.counters.messages += 1;
    this.lastChatTs = evt.ts;
    this._touchUser(evt.user, evt.ts);
    this._touchTopics(evt.text, evt.user, evt.ts);
    return entry;
  }

  /** A notable event (sub / gift / bits / raid) becomes a moment: the FOMO record. */
  recordNotable(evt) {
    this.notable.push(evt);
    if (this.notable.length > this.maxChat) this.notable.shift();
    if (evt.type === "sub") this.counters.subs += 1;
    if (evt.type === "gift") this.counters.gifts += evt.amount || 1;
    if (evt.type === "bits") this.counters.bits += evt.amount || 0;
    if (evt.type === "raid") this.counters.raids += 1;
    this._touchUser(evt.user, evt.ts);
    return this.addMoment({
      ts: evt.ts,
      kind: evt.type,
      label: labelFor(evt),
      detail: evt.detail || "",
      user: evt.user,
      amount: evt.amount || 0,
      viewers: evt.viewers || 0,
    });
  }

  addMoment({ ts = this.now(), kind, label, detail = "", user = null, amount = 0, viewers = 0 }) {
    const moment = { id: `m${++this.momentSeq}`, ts, kind, label, detail, user, amount, viewers };
    this.moments.push(moment);
    if (this.moments.length > this.maxMoments) this.moments.shift();
    return moment;
  }

  /** Crid's own action, with the moment it belongs to. This is the memory that makes callbacks possible. */
  recordAction({ ts = this.now(), rule, why = "", say = null, momentId = null, summary = "" }) {
    const action = { ts, rule, why, say, momentId, summary };
    this.actions.push(action);
    if (this.actions.length > this.maxActions) this.actions.shift();
    this.counters.actions += 1;
    this.lastActionTs = ts;
    return action;
  }

  _touchUser(user, ts) {
    if (!user) return;
    const key = String(user).toLowerCase();
    const prev = this.seen.get(key);
    if (prev) {
      prev.last = ts;
      prev.count += 1;
    } else {
      this.seen.set(key, { name: user, first: ts, last: ts, count: 1 });
    }
  }

  _touchTopics(text, user, ts) {
    const words = new Set(tokenise(text));
    for (const w of words) {
      const prev = this.topics.get(w) || { word: w, count: 0, last: 0, users: new Set() };
      prev.count += 1;
      prev.last = ts;
      prev.users.add(String(user || "").toLowerCase());
      this.topics.set(w, prev);
    }
  }

  /* ---------- reads ---------- */

  silenceMs(ts = this.now()) {
    const anchor = Math.max(this.lastChatTs, this.startedAt);
    return Math.max(0, ts - anchor);
  }

  quietMs(ts = this.now()) {
    const anchor = Math.max(this.lastChatTs, this.lastActionTs, this.startedAt);
    return Math.max(0, ts - anchor);
  }

  chatInWindow(ms, ts = this.now()) {
    const from = ts - ms;
    return this.chat.filter((c) => c.ts >= from);
  }

  distinctUsersIn(ms, ts = this.now()) {
    return new Set(this.chatInWindow(ms, ts).map((c) => c.user.toLowerCase())).size;
  }

  lastChat() {
    return this.chat[this.chat.length - 1] || null;
  }

  lastChatBy(user) {
    const key = String(user || "").toLowerCase();
    for (let i = this.chat.length - 1; i >= 0; i--) if (this.chat[i].user.toLowerCase() === key) return this.chat[i];
    return null;
  }

  /** null when this user has never been seen this session. */
  user(name) {
    return this.seen.get(String(name || "").toLowerCase()) || null;
  }

  isNewUser(name) {
    const u = this.user(name);
    return !!u && u.count === 1;
  }

  /** How long since this user last spoke, in ms (Infinity if unseen). */
  userGap(name, ts = this.now()) {
    const u = this.user(name);
    return u ? ts - u.last : Infinity;
  }

  /**
   * The most repeated recent topic: a word used by >= minUsers distinct people inside the window.
   * Returns { word, count, users, last } or null.
   */
  repeatedTopic({ windowMs = 90_000, minUsers = 3, ts = this.now() } = {}) {
    const from = ts - windowMs;
    let best = null;
    for (const t of this.topics.values()) {
      if (t.last < from) continue;
      const recentUsers = [...t.users].filter((u) => {
        const entry = this.seen.get(u);
        return entry && entry.last >= from;
      });
      if (recentUsers.length < minUsers) continue;
      if (!best || recentUsers.length > best.users.length) best = { word: t.word, count: t.count, users: recentUsers, last: t.last };
    }
    return best;
  }

  recentMoments(n = 5) {
    return this.moments.slice(-n);
  }

  momentsSince(ts, until = this.now()) {
    return this.moments.filter((m) => m.ts >= ts && m.ts <= until);
  }

  /** Moments in the last `ms` — used by the "while you were gone" recap. */
  momentsIn(ms, ts = this.now()) {
    return this.momentsSince(ts - ms, ts);
  }

  recentActions(n = 5) {
    return this.actions.slice(-n);
  }

  lastAction() {
    return this.actions[this.actions.length - 1] || null;
  }

  /** Last time Crid said something, so the line picker can avoid repeating itself. */
  recentSayings(n = 12) {
    return this.actions
      .filter((a) => a.say)
      .slice(-n)
      .map((a) => a.say);
  }

  /** The action Crid took *as* this moment happened (a sub reaction, a spike reaction). */
  actionForMoment(momentId) {
    return this.actions.find((a) => a.momentId === momentId) || null;
  }

  /**
   * Has Crid already *cited* this moment in a callback? Reacting to a moment when it
   * happens is not the same as remembering it later — only the latter blocks a callback,
   * otherwise the most interesting moments (subs, raids) could never be referenced again.
   */
  momentCited(momentId) {
    return this.actions.some((a) => a.rule === "callback" && a.momentId === momentId);
  }

  minutesSince(ts, now = this.now()) {
    return Math.max(0, Math.round((now - ts) / MIN));
  }

  /** A short human phrase for how long ago something happened: "22s ago", "4 min ago". */
  ago(ts, now = this.now()) {
    const secs = Math.max(0, Math.round((now - ts) / 1000));
    if (secs < 50) return `${secs}s ago`;
    const mins = Math.round(secs / 60);
    if (mins <= 1) return "a minute ago";
    return `${mins} min ago`;
  }

  summary(ts = this.now()) {
    return {
      uptimeMs: ts - this.startedAt,
      counters: { ...this.counters },
      chatCount: this.chat.length,
      moments: this.moments.length,
      actions: this.actions.length,
      silenceMs: this.silenceMs(ts),
      viewersSeen: this.seen.size,
    };
  }

  /** Everything the overlay needs after a reload. The page holds no state of its own. */
  snapshot(ts = this.now()) {
    return {
      startedAt: this.startedAt,
      counters: { ...this.counters },
      silenceMs: this.silenceMs(ts),
      moments: this.moments.slice(-8).map((m) => ({ id: m.id, ts: m.ts, kind: m.kind, label: m.label, ago: this.ago(m.ts, ts) })),
      lastActions: this.actions.slice(-4).map((a) => ({ ts: a.ts, rule: a.rule, say: a.say, ago: this.ago(a.ts, ts) })),
      topic: this.repeatedTopic({ ts })?.word || null,
      viewersSeen: this.seen.size,
    };
  }
}

export function labelFor(evt) {
  switch (evt.type) {
    case "sub":
      return evt.months > 1 ? `${evt.user} resubbed (${evt.months} months)` : `${evt.user} subscribed`;
    case "gift":
      return evt.amount > 1 ? `${evt.user} gifted ${evt.amount} subs` : `${evt.user} gifted a sub`;
    case "bits":
      return `${evt.user} cheered ${evt.amount} bits`;
    case "raid":
      return `${evt.user} raided with ${evt.viewers} viewers`;
    case "layer":
      return `"${evt.layer}" layer was in the way`;
    case "chat":
      return `${evt.user}: ${evt.text}`;
    default:
      return `${evt.user || "someone"} ${evt.type}`;
  }
}
