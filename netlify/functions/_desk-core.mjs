// CYBER LIVE DESK — shared core.
// Every function here takes a blobs store as its first argument, so the HTTP handler
// (desk.mjs) and the scheduled run (desk-auto-research.mjs) share one implementation
// and this file stays importable by tests without @netlify/blobs.

export const DEFAULT_TTL_SEC = 45;
export const RESULT_SEC = 20; // how long final poll results stay up
export const RESEARCH_INTERVAL_MIN = 15; // must match the cron in desk-auto-research.mjs
export const CONFIDENCE = ["confirmed", "reported", "disputed", "unverified", "test"];
export const APPROVAL = ["pending", "approved", "rejected"];
export const MODES = ["cards", "x-following"];
export const LIMITS = {
  category: 24,
  headline: 120,
  summary: 280,
  question: 140,
  notes: 2000,
  cridTitle: 120, // a jumbotron line a phone viewer has to read in seconds
  cridCredit: 30,
};

// CRID — Cyber's Rent Is Due. The branded segment the desk puts on the jumbotron: one subject,
// optionally a vote, and a verdict the operator stamps. It sits beside the card desk rather than
// replacing it, so news keeps flowing underneath a live segment.
export const CRID_KINDS = ["topic", "news", "debate", "music", "question"];
export const VERDICTS = [0, 1]; // 1 = paid, 0 = still owing. Never anything else.
export const STORE_NAME = "cyber-live-desk";

export const DEFAULT_STATE = {
  version: 0,
  updatedAt: 0,
  mode: "cards",
  visible: false,
  hold: false,
  showSource: false,
  activeCardId: null,
  expiresAt: null,
  poll: null, // { id, question, active, options: [{ id, label, count, manual, chat }] }
  desk: null, // sticky topic filter: null, or one of DESKS ids
  crid: null, // { id, entry, kind, title, credit, verdict, result, openedAt } — the live segment
  cridSeq: 0, // counts segments since the store existed; entry numbers never repeat
  autoPlay: false, // when on, an expired card advances to the next approved one by itself
  autoResearch: false, // when on, the scheduled run adds new pending cards by itself
};

// Clearly labelled test content only: no invented news, sources or figures.
export const TEST_CARD = {
  id: "test-card",
  type: "news-drop",
  category: "Test",
  headline: "Overlay test card",
  summary: "If you can read this on your stream, the overlay is working. This is not a news story.",
  question: "Can you read this clearly?",
  confidence: "test",
  approval: "approved",
  source: { publisher: "Local test", url: null, publishedAt: null, retrievedAt: null },
  eventDate: null,
  presenterNotes: "Delete or reject this once the real queue exists.",
  ttlSec: 30,
  order: null,
  createdAt: 0,
  importKey: null,
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- storage ----------

// The deployed blob predates the auto flags, so always merge over the defaults.
export async function readState(store) {
  return { ...DEFAULT_STATE, ...((await store.get("state", { type: "json" })) ?? {}) };
}

export async function readCards(store) {
  let cards = await store.get("cards", { type: "json" });
  if (!cards) {
    cards = [{ ...TEST_CARD, createdAt: Date.now() }];
    await store.setJSON("cards", cards);
  }
  return cards;
}

export async function commitState(store, prev, patch, now = Date.now()) {
  const next = { ...prev, ...patch, version: prev.version + 1, updatedAt: now };
  await store.setJSON("state", next);
  return next;
}

// Writes only if nobody committed since `expectedVersion` was read. Returns the current
// state untouched when it did, so auto-advance cannot silently skip a card under a race.
export async function commitStateIfCurrent(store, expectedVersion, patch, now = Date.now()) {
  const current = await readState(store);
  if (current.version !== expectedVersion) return current;
  return commitState(store, current, patch, now);
}

// ---------- queue + auto-play ----------

export function queueOf(cards, deskId = null) {
  const approved = cards.filter((c) => c.approval === "approved");
  return (deskId ? approved.filter((c) => matchesDesk(c, deskId)) : approved)
    .sort((a, z) => (a.order ?? a.createdAt) - (z.order ?? z.createdAt));
}

export function nextAfter(queue, activeId, step = 1) {
  if (!queue.length) return null;
  const i = queue.findIndex((c) => c.id === activeId);
  return i < 0 ? queue[0] : queue[(i + step + queue.length) % queue.length];
}

const ttlMs = (c) => (c?.ttlSec ?? DEFAULT_TTL_SEC) * 1000;

// Pure: decides what auto-play does when the current display runs out. Returns null when
// auto-play must keep its hands off, so the rules are testable without a store.
export function autoAdvancePlan(state, queue, now = Date.now()) {
  if (!state.autoPlay || state.mode !== "cards" || !state.visible || state.hold) return null;
  if (state.poll?.active) return null; // an open poll is the operator's, not ours
  if (!state.expiresAt || state.expiresAt > now) return null; // still on screen
  if (!queue.length) return null; // nothing approved to show
  const next = nextAfter(queue, state.activeCardId);
  if (!next) return null;
  return { activeCardId: next.id, expiresAt: now + ttlMs(next), poll: null };
}

// Runs the auto-advance for a read. Returns the state to serve, or null if nothing moved.
export async function advanceIfExpired(store, state, now = Date.now()) {
  const plan = autoAdvancePlan(state, queueOf(await readCards(store), state.desk), now);
  if (!plan) return null;
  const fresh = await commitStateIfCurrent(store, state.version, plan, now);
  return fresh === state ? null : fresh;
}

// ---------- desks ----------

// A desk is a sticky filter over the approved queue. While one is on, next, previous and
// auto-play stay inside it, so "desk music" behaves like tuning the desk to music rather
// than jumping once. You leave with "desk all".
//
// A card belongs to a desk when its category or the words in its headline and summary say
// so — no extra field, so hand-made cards, slang cards and imported stories all join the
// same desks. Matching is whole-word prefixed ("creator" catches "creators", "tiktoker"),
// and geography alone is never a topic: a story that merely happened in Nigeria is not
// politics. Add a desk by adding one entry; the commands and the controller pick it up.
export const DESKS = [
  {
    id: "politics",
    label: "Politics",
    aliases: ["politics", "political", "government", "naija news", "news"],
    words: ["politics", "political", "government", "senate", "senator", "national assembly", "assembly", "minister",
      "president", "tinubu", "governor", "vice president", "inec", "election", "vote", "court", "judgement", "law",
      "lawmaker", "corruption", "abuja", "statehouse", "state house", "apc", "pdp", "obient", "protest", "strike",
      "white house", "congress", "senator", "parliament", "policy", "bill", "sanction", "border", "security"],
  },
  {
    id: "streamers",
    label: "Streamers",
    aliases: ["streamers", "streamer", "creators", "creator", "influencers", "influencer", "twitch", "tiktok",
      "youtube", "youtuber", "content", "gaming", "esports", "gamers", "ig", "skit"],
    words: ["streamer", "streaming", "creator", "content creator", "influencer", "twitch", "tiktok", "tiktoker",
      "youtube", "youtuber", "channel owner", "subscriber", "views", "viral", "skit", "esports", "gaming", "gamer",
      "kick", "collab", "ban", "banham", "raid", "donation", "brand deal", "casepov", "casemov", "pellerin"],
  },
  {
    id: "music",
    label: "Music",
    aliases: ["music", "afrobeats", "songs", "song", "album", "albums", "artist", "artists", "singers", "beats", "ffl"],
    words: ["music", "afrobeats", "afrobeat", "album", "song", "singer", "artist", "concert", "tour", "chart",
      "spotify", "apple music", "record", "producer", "track", "remix", "single", "release date", "streaming record",
      "grammy", "headliner", "feat"],
  },
  {
    id: "movies",
    label: "Movies",
    aliases: ["movies", "movie", "nollywood", "film", "films", "cinema", "netflix", "entertainment", "actors", "hollywood"],
    words: ["nollywood", "movie", "film", "cinema", "netflix", "prime video", "disney", "hbo", "trailer", "box office",
      "actor", "actress", "oscar", "series", "premiere", "director", "cast", "streaming series"],
  },
  {
    id: "business",
    label: "Business",
    aliases: ["business", "economy", "money", "finance", "markets", "tech"],
    words: ["business", "economy", "naira", "exchange rate", "inflation", "bank", "market", "fuel", "petrol", "dangote",
      "revenue", "tax", "fintech", "oil", "stock", "trade", "profit", "investment", "budget", "ccn", "startup", "app"],
  },
  {
    id: "trends",
    label: "Trends",
    aliases: ["trends", "trending", "viral"],
    words: ["trending", "trend", "google trends", "most searched"],
  },
];

// The way back out. Not a desk you can be stuck in.
export const ALL_DESK = { id: null, label: "All desks", aliases: ["all", "any", "everything", "none"], words: [] };

const deskRx = (d) => (d.rx ??= new RegExp(`\\b(?:${d.words.map(escapeRe).join("|")})\\w*`, "i"));

export function resolveDesk(arg) {
  const a = norm(String(arg ?? ""));
  if (!a) return null;
  return DESKS.find((d) => d.id === a || d.aliases.includes(a)) ?? (ALL_DESK.aliases.includes(a) ? ALL_DESK : null);
}

export function matchesDesk(c, deskId) {
  const d = DESKS.find((x) => x.id === deskId);
  if (!d) return false;
  return deskRx(d).test(`${norm(c.category ?? "")} ${norm(c.headline ?? "")} ${norm(c.summary ?? "")}`);
}

// ---------- public feed ----------

// Only fields safe for viewers. Presenter notes, source URLs and the operator's automation
// settings never leave the operator routes.
export const publicCard = (c) => ({
  id: c.id,
  type: c.type,
  category: c.category,
  headline: c.headline,
  summary: c.summary,
  question: c.question,
  confidence: c.confidence,
  publisher: c.source?.publisher ?? null,
  publishedAt: c.source?.publishedAt ?? null,
  eventDate: c.eventDate ?? null,
});

export function publicProjection(state) {
  const { activeCardId, autoResearch, ...rest } = state;
  return rest;
}

// Answers the overlay's poll. Auto-advance is read-driven, so the card only moves when
// something is actually watching.
export async function publicState(store, since, now = Date.now()) {
  let state = await readState(store);
  if (state.autoPlay) {
    const moved = await advanceIfExpired(store, state, now);
    if (moved) state = moved;
  }
  if (since != null && since === String(state.version)) return { status: 204 };
  let card = null;
  if (state.mode === "cards" && state.visible && state.activeCardId) {
    const found = (await readCards(store)).find((c) => c.id === state.activeCardId);
    if (found && found.approval === "approved") card = publicCard(found);
  }
  return { status: 200, body: { ...publicProjection(state), card, serverNow: now } };
}

// ---------- input validation ----------

function text(value, max, field, { required = false } = {}) {
  const v = typeof value === "string" ? value.trim() : "";
  if (required && !v) throw new HttpError(422, `${field} is required.`);
  if (v.length > max) throw new HttpError(422, `${field} must be ${max} characters or fewer (now ${v.length}).`);
  return v;
}

function isoOrNull(v, field) {
  if (v == null || v === "") return null;
  if (Number.isNaN(Date.parse(v))) throw new HttpError(422, `${field} must be a valid date.`);
  return new Date(v).toISOString();
}

// ---------- cards ----------

export async function upsertCard(store, b, now = Date.now()) {
  const cards = await readCards(store);
  const old = b.id ? cards.find((c) => c.id === b.id) : null;
  if (b.id && !old) throw new HttpError(404, "No card with that id.");

  const type = String(b.type ?? old?.type ?? "");
  if (!/^[a-z0-9-]{2,32}$/.test(type)) throw new HttpError(422, "type must be lowercase letters, digits or hyphens.");

  const confidence = b.confidence ?? old?.confidence ?? "unverified";
  const approval = b.approval ?? old?.approval ?? "pending";
  if (!CONFIDENCE.includes(confidence)) throw new HttpError(422, `confidence must be one of ${CONFIDENCE.join(", ")}.`);
  if (!APPROVAL.includes(approval)) throw new HttpError(422, `approval must be one of ${APPROVAL.join(", ")}.`);

  const src = { ...(old?.source ?? {}), ...(b.source ?? {}) };
  if (src.url && !/^https?:\/\//i.test(src.url)) throw new HttpError(422, "source.url must start with http:// or https://.");
  const source = {
    publisher: text(src.publisher, 80, "source.publisher"),
    url: src.url || null,
    publishedAt: isoOrNull(src.publishedAt, "source.publishedAt"),
    retrievedAt: isoOrNull(src.retrievedAt, "source.retrievedAt") ?? (src.url ? new Date(now).toISOString() : null),
  };

  // Editorial rule: a real news card needs a traceable source before it can go live.
  if (type === "news-drop" && approval === "approved" && confidence !== "test" && (!source.url || !source.publisher)) {
    throw new HttpError(422, "An approved news-drop needs source.publisher and source.url.");
  }

  const ttl = b.ttlSec ?? old?.ttlSec ?? null;
  if (ttl !== null && !(Number.isFinite(ttl) && ttl >= 5 && ttl <= 300)) throw new HttpError(422, "ttlSec must be 5 to 300.");

  const card = {
    id: old?.id ?? cryptoRandomId(),
    type,
    category: text(b.category ?? old?.category, LIMITS.category, "category"),
    headline: text(b.headline ?? old?.headline, LIMITS.headline, "headline", { required: true }),
    summary: text(b.summary ?? old?.summary, LIMITS.summary, "summary"),
    question: text(b.question ?? old?.question, LIMITS.question, "question"),
    confidence,
    approval,
    source,
    eventDate: isoOrNull(b.eventDate ?? old?.eventDate, "eventDate"),
    presenterNotes: text(b.presenterNotes ?? old?.presenterNotes, LIMITS.notes, "presenterNotes"),
    ttlSec: ttl,
    order: b.order ?? old?.order ?? null,
    createdAt: old?.createdAt ?? now,
    importKey: old?.importKey ?? null,
  };

  const next = old ? cards.map((c) => (c.id === card.id ? card : c)) : [...cards, card];
  await store.setJSON("cards", next);

  // An edit to the card on air must reach the overlay, so bump the version.
  const state = await readState(store);
  if (state.activeCardId === card.id) await commitState(store, state, {}, now);
  return card;
}

// node:crypto is reachable in the runtime, but globalThis.crypto keeps this file
// importable by tests running under plain node.
const cryptoRandomId = () => globalThis.crypto.randomUUID();

// ---------- operator actions ----------

// What a closed poll actually said. A tie reports no winner rather than picking the first
// option, because a jumbotron that invents a winner is lying to the people who voted.
export function pollResult(poll) {
  const options = poll?.options ?? [];
  const total = options.reduce((n, o) => n + (o.count || 0), 0);
  const top = Math.max(0, ...options.map((o) => o.count || 0));
  const leaders = options.filter((o) => (o.count || 0) === top);
  const clear = top > 0 && leaders.length === 1;
  return {
    winner: clear ? leaders[0].label : null,
    percent: total ? Math.round((top / total) * 100) : 0,
    total,
    tie: leaders.length > 1 && top > 0,
    options: options.map((o) => ({ label: o.label, count: o.count || 0, percent: total ? Math.round(((o.count || 0) / total) * 100) : 0 })),
  };
}

export async function runAction(store, b, now = Date.now()) {
  const state = await readState(store);
  const cards = await readCards(store);
  const all = queueOf(cards);
  // next/previous stay inside the desk; the card on air is tracked against the whole queue,
  // so editing a headline out of a desk cannot leave hold and auto-play without an active card.
  const queue = state.desk ? all.filter((c) => matchesDesk(c, state.desk)) : all;
  const active = all.find((c) => c.id === state.activeCardId) ?? null;

  const goLive = (c) => {
    if (state.poll?.active) throw new HttpError(409, "End the poll before changing the card.");
    return { mode: "cards", visible: true, activeCardId: c.id, expiresAt: state.hold ? null : now + ttlMs(c), poll: null };
  };

  let patch;
  switch (b.action) {
    case "show": {
      const c = all.find((x) => x.id === b.cardId);
      if (!c) throw new HttpError(409, "That card does not exist or is not approved.");
      // Asking for a card that is not on the current desk means you want that card, so the
      // desk filter comes off instead of the command failing on air.
      patch = { ...goLive(c), desk: state.desk && matchesDesk(c, state.desk) ? state.desk : null };
      break;
    }
    case "desk": {
      const d = resolveDesk(b.desk);
      if (!d) throw new HttpError(422, `Unknown desk. Try ${DESKS.map((x) => x.id).join(", ")} or all.`);
      if (d.id === null) { patch = { desk: null }; break; }
      const q = queueOf(cards, d.id);
      if (!q.length) throw new HttpError(409, `Nothing approved on the ${d.label} desk yet. Approve a card there, or use desk all.`);
      // Already on that desk's card? Stay put. A repeated command must not skip a card.
      const keep = q.find((x) => x.id === state.activeCardId);
      patch = keep ? { desk: d.id } : { ...goLive(q[0]), desk: d.id };
      break;
    }
    case "next":
    case "previous": {
      if (!queue.length) throw new HttpError(409, "No approved cards in the queue.");
      const step = b.action === "next" ? 1 : -1;
      const i = active ? (queue.indexOf(active) + step + queue.length) % queue.length : 0;
      patch = goLive(queue[i]);
      break;
    }
    case "start-poll": {
      if (state.poll?.active) throw new HttpError(409, "A poll is already running.");
      const labels = Array.isArray(b.options) ? b.options.map((o) => text(o, 40, "option")).filter(Boolean) : [];
      if (labels.length < 2 || labels.length > 3) throw new HttpError(422, "A poll needs 2 or 3 options.");
      const onAir = state.visible && state.mode === "cards" ? active : null;
      const question = text(b.question, LIMITS.question, "question") || onAir?.question || "";
      if (!question) throw new HttpError(422, "Add a poll question.");
      patch = {
        mode: "cards",
        visible: true,
        hold: false,
        expiresAt: null,
        activeCardId: onAir?.id ?? null,
        poll: { id: now, question, active: true, options: labels.map((label, i) => ({ id: "abc"[i], label, count: 0, manual: 0, chat: 0 })) },
      };
      break;
    }
    case "vote": {
      const poll = state.poll;
      if (!poll?.active) throw new HttpError(409, "No poll is running.");
      const opt = poll.options.find((o) => o.id === b.option);
      if (!opt) throw new HttpError(422, "Unknown poll option.");
      const delta = b.delta === -1 ? -1 : 1;
      patch = {
        poll: {
          ...poll,
          options: poll.options.map((o) => {
            if (o !== opt) return o;
            const manual = Math.max(0, (o.manual || 0) + delta);
            return { ...o, manual, count: manual + (o.chat || 0) };
          }),
        },
      };
      break;
    }
    case "set-votes": {
      // Chat tally sent by the controller. Replaces the chat part only; manual taps stay.
      const poll = state.poll;
      if (!poll?.active) throw new HttpError(409, "No poll is running.");
      const c = b.counts && typeof b.counts === "object" ? b.counts : {};
      patch = {
        poll: {
          ...poll,
          options: poll.options.map((o) => {
            const chat = Math.min(100000, Math.max(0, Math.floor(Number(c[o.id]) || 0)));
            return { ...o, chat, count: (o.manual || 0) + chat };
          }),
        },
      };
      break;
    }
    case "end-poll": {
      if (!state.poll?.active) throw new HttpError(409, "No poll is running.");
      const poll = { ...state.poll, active: false };
      patch = { poll, expiresAt: state.hold ? null : now + RESULT_SEC * 1000 };
      // The Strangers' tally lands on the open segment as soon as voting closes. The verdict
      // stays the operator's stamp: a tally is not a decision about what we do next.
      if (state.crid) patch.crid = { ...state.crid, result: pollResult(poll) };
      break;
    }
    case "crid-open": {
      const kind = String(b.kind ?? "").trim().toLowerCase();
      if (!CRID_KINDS.includes(kind)) throw new HttpError(422, `kind must be one of ${CRID_KINDS.join(", ")}.`);
      // A jumbotron title is display text, so an over-long one is shortened rather than
      // refused: an operator typing on a phone mid-segment should never be blocked by it.
      const rawTitle = typeof b.title === "string" ? b.title.trim() : "";
      if (!rawTitle) throw new HttpError(422, "title is required.");
      const title = clip(rawTitle, LIMITS.cridTitle);
      const credit = typeof b.credit === "string" && b.credit.trim() ? clip(b.credit.trim(), LIMITS.cridCredit) : null;
      const entry = state.cridSeq + 1;
      patch = { cridSeq: entry, crid: { id: cryptoRandomId(), entry, kind, title, credit, verdict: null, result: null, openedAt: now } };
      break;
    }
    case "crid-close":
      patch = { crid: null };
      break;
    case "crid-verdict": {
      if (!state.crid) throw new HttpError(409, "There is no CRID segment open.");
      if (!VERDICTS.includes(b.value)) throw new HttpError(422, "A verdict is 0 or 1.");
      patch = { crid: { ...state.crid, verdict: b.value } };
      break;
    }
    case "clear-poll":
      patch = { poll: null };
      break;
    case "hide":
      patch = { visible: false, hold: false, expiresAt: null };
      break;
    case "hold": {
      const hold = !state.hold;
      const timed = !hold && state.visible && state.mode === "cards" && active;
      patch = { hold, expiresAt: timed ? now + ttlMs(active) : null };
      break;
    }
    case "source":
      patch = { showSource: typeof b.value === "boolean" ? b.value : !state.showSource };
      break;
    case "mode": {
      if (!MODES.includes(b.mode)) throw new HttpError(422, `mode must be one of ${MODES.join(", ")}.`);
      // Entering X shows it at once; returning to cards stays hidden until a card is shown.
      patch = { mode: b.mode, visible: b.mode === "x-following", hold: false, expiresAt: null };
      break;
    }
    // The two automation switches the operator flips live. Both default to off and both
    // only ever move what the operator already approved.
    case "auto-play": {
      const autoPlay = typeof b.value === "boolean" ? b.value : !state.autoPlay;
      // Turning it on mid-card restarts the clock, so the next move is not instant.
      const restart = autoPlay && state.visible && state.mode === "cards" && active && state.expiresAt && state.expiresAt <= now;
      patch = { autoPlay, ...(restart ? { expiresAt: now + ttlMs(active) } : {}) };
      break;
    }
    case "auto-research":
      patch = { autoResearch: typeof b.value === "boolean" ? b.value : !state.autoResearch };
      break;
    default:
      throw new HttpError(422, "Unknown action.");
  }

  return { state: await commitState(store, state, patch, now), queueLength: queue.length };
}

// ---------- research: Nigerian + US headline importer ----------
// Pulls headlines and trending searches from public feeds and files them as PENDING cards.
// Nothing here can reach the screen: you approve every card first. Only the headline, link and
// publish time go on the card. The publisher's excerpt stays in private presenter notes so you
// put the summary in your own words. Add or remove feeds by editing FEEDS.
//
// Feed status was probed from a server-like client on 2026-10-28: vanguard, guardian-ng,
// thecable and channels answer 403 with a Cloudflare HTML page, never XML. Their `alt` is a
// Google News site: query for the same outlet, which served 100 items each on 2026-10-29 with
// no key and no bypass, so their stories arrive anyway. The outlet's own URL is still tried
// first when you set DESK_FEED_PROXY, because that is the only way to get their own excerpts
// and direct article links.
export const FEEDS = [
  { id: "gtrends-ng", kind: "trends", geo: "NG", geoName: "Nigeria", label: "Google Trends", category: "Trending in NG", url: "https://trends.google.com/trending/rss?geo=NG", pageUrl: "https://trends.google.com/trending?geo=NG" },
  { id: "gtrends-us", kind: "trends", geo: "US", geoName: "the US", label: "Google Trends", category: "Trending in US", url: "https://trends.google.com/trending/rss?geo=US", pageUrl: "https://trends.google.com/trending?geo=US" },
  { id: "gnews-ng", kind: "gnews", label: "Google News Nigeria", category: "Nigeria", url: "https://news.google.com/rss?hl=en-NG&gl=NG&ceid=NG:en" },
  { id: "gnews-us", kind: "gnews", label: "Google News US", category: "US", url: "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en" },
  { id: "premiumtimes", label: "Premium Times", category: "Nigeria", url: "https://www.premiumtimesng.com/feed" },
  { id: "dailypost", label: "Daily Post", category: "Nigeria", url: "https://dailypost.ng/feed" },
  { id: "businessday", label: "BusinessDay", category: "Business", url: "https://businessday.ng/feed" },
  { id: "bbc-pidgin", label: "BBC News Pidgin", category: "Nigeria (Pidgin)", url: "https://feeds.bbci.co.uk/pidgin/rss.xml" },
  { id: "channels", label: "Channels TV", category: "Nigeria", url: "https://www.channelstv.com/feed", alt: "https://news.google.com/rss/search?q=site:channelstv.com&hl=en-NG&gl=NG&ceid=NG:en" },
  { id: "vanguard", label: "Vanguard", category: "Nigeria", url: "https://www.vanguardngr.com/feed", alt: "https://news.google.com/rss/search?q=site:vanguardngr.com&hl=en-NG&gl=NG&ceid=NG:en" },
  { id: "guardian-ng", label: "The Guardian Nigeria", category: "Nigeria", url: "https://guardian.ng/feed", alt: "https://news.google.com/rss/search?q=site:guardian.ng&hl=en-NG&gl=NG&ceid=NG:en" },
  { id: "thecable", label: "TheCable", category: "Nigeria", url: "https://www.thecable.ng/feed", alt: "https://news.google.com/rss/search?q=site:thecable.ng&hl=en-NG&gl=NG&ceid=NG:en" },
  // The entertainment desks, Nigeria-first because that is who watches. Their categories are
  // deliberately worded so `desk music`, `desk streamers` and `desk movies` find the cards they
  // file (a test holds that promise). Queried from a server-like client on 2026-10-29 and picked
  // by what actually came back: the Naija creator query returned Peller and Carter Efe's streamer
  // nominations, Paper Chaze and the BBNaija winner, while looser wordings returned "how to become
  // an influencer" explainers. Dexerto is a scoped site: query because its whole feed is Pokemon
  // merch and Costco deals. Billboard answers direct, so its own excerpts come through.
  //
  // Two rules these queries follow, both learned by counting what the importer kept rather than
  // what the feed returned: `when:3d`, because a story older than MAX_AGE_MS is dropped anyway
  // (the same wording kept 52 fresh items at when:3d against 8 at when:21d), and `-mp3
  // -"download"` on the creator desk, because mp3 blogs post release spam minutes after a song
  // drops and newest-first ranking lets them crowd out the actual creator news.
  { id: "ng-creators", kind: "gnews", label: "Naija Creators", category: "Naija Creators", url: "https://news.google.com/rss/search?q=(%22content%20creator%22%20OR%20TikToker%20OR%20YouTuber%20OR%20skit%20OR%20streamer%20OR%20influencer)%20Nigeria%20-mp3%20-%22download%22%20when:3d&hl=en-NG&gl=NG&ceid=NG:en", alt: "https://news.google.com/rss/search?q=(%22Big%20Brother%22%20OR%20%22BBNaija%22%20OR%20reality%20star%20OR%20skit%20maker%20OR%20skit)%20Nigeria%20when:3d&hl=en-NG&gl=NG&ceid=NG:en" },
  { id: "ng-music", kind: "gnews", label: "Naija Music", category: "Naija Music", url: "https://news.google.com/rss/search?q=(Afrobeats%20OR%20singer%20OR%20album%20OR%20musician)%20(Nigeria%20OR%20Naija)%20when:3d&hl=en-NG&gl=NG&ceid=NG:en", alt: "https://news.google.com/rss/search?q=(music%20OR%20Afrobeats%20OR%20album)%20site:guardian.ng%20when:3d&hl=en-NG&gl=NG&ceid=NG:en" },
  { id: "ng-movies", kind: "gnews", label: "Nollywood", category: "Nollywood", url: "https://news.google.com/rss/search?q=(Nollywood%20OR%20movie%20OR%20cinema%20OR%20film)%20(Nigeria%20OR%20Naija)%20when:3d&hl=en-NG&gl=NG&ceid=NG:en", alt: "https://news.google.com/rss/search?q=(Nollywood%20OR%20%22box%20office%22%20OR%20Netflix)%20Nigeria%20when:3d&hl=en-NG&gl=NG&ceid=NG:en" },
  { id: "us-music", label: "Billboard (US)", category: "US Music", url: "https://www.billboard.com/feed/", alt: "https://news.google.com/rss/search?q=(album%20OR%20tour%20OR%20chart%20OR%20artist)%20when:3d&hl=en-US&gl=US&ceid=US:en" },
  { id: "us-creators", kind: "gnews", label: "US Creators", category: "US Creators", url: "https://news.google.com/rss/search?q=(%22Twitch%20streamer%22%20OR%20%22Kick%20streamer%22%20OR%20YouTuber%20OR%20%22content%20creator%22)%20when:3d&hl=en-US&gl=US&ceid=US:en", alt: "https://news.google.com/rss/search?q=site%3Adexerto.com%20(streamer%20OR%20%22content%20creator%22%20OR%20Twitch%20OR%20YouTuber)%20when:3d&hl=en-US&gl=US&ceid=US:en" },
];
export const MAX_AGE_MS = 3 * 24 * 3600 * 1000; // ignore stories older than 3 days
export const PER_FEED = 6; // new cards per feed per fetch

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const decodeXml = (s = "") =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return NAMED[e.toLowerCase()] ?? m;
    })
    .trim();

export const tagText = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeXml(m[1]) : "";
};
const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const toIso = (s) => {
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Google News wraps its own links in a redirect and Trends carries junk query strings;
// only a plain http(s) URL is ever stored on a card.
const safeUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u ?? "")) ? String(u).trim() : null);

// Optional route for the outlets that block server traffic: a scraping API, your own Cloudflare
// Worker, or a self-hosted RSS-Bridge / RSSHub. One env var, no vendor code in here.
//   DESK_FEED_PROXY=https://api.scrapingbee.com/api/v1/?api_key=***&url=%s
//   DESK_FEED_PROXY=https://my-worker.example.com/rss?url=      (trailing = gets the feed appended)
//   DESK_FEED_PROXY=https://rsshub.example.com/facebook/        (no %s and no = means prefix)
// The key lives in site env, never in this file, so it stays out of the repo and out of the
// cards. Unset means every feed is fetched directly, exactly as before.
export function proxyFor(template, target) {
  const t = String(template ?? "").trim();
  if (!/^https?:\/\//i.test(t)) return null;
  if (t.includes("%s")) return t.replace(/%s/g, encodeURIComponent(target));
  if (t.endsWith("=")) return t + encodeURIComponent(target);
  return t + target;
}

// A scraping service renders the page in a real browser, which costs seconds the direct
// fetch never spent. Two knobs, both site env, because a slow proxy must not run the request
// past the function's own execution limit (10s on the free plan, 30s for a scheduled run):
//   DESK_FEED_TIMEOUT_MS  one attempt, default 6000, clamped 1000-20000
//   DESK_FEED_BUDGET_MS   one feed including its retries, default 8000, clamped 2000-25000
export const feedTimeoutMs = (env = process.env) =>
  Math.min(20000, Math.max(1000, Number(env.DESK_FEED_TIMEOUT_MS) || 6000));
export const feedBudgetMs = (env = process.env) =>
  Math.min(25000, Math.max(2000, Number(env.DESK_FEED_BUDGET_MS) || 8000));

async function getFeedXml(url, fetchFn, timeoutMs) {
  const r = await fetchFn(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; CyberLiveDesk/1.0; headline reader)",
      Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
    },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const xml = (await r.text()).slice(0, 800_000);
  // A blocked site answers with an HTML page that still has <title> and <link> tags, so
  // refusing anything without items is what keeps error pages off the queue.
  if (!/<item[\s>]/i.test(xml)) throw new Error("no items found (blocked, or not a feed)");
  return xml;
}

// Returns { xml, via } so the report can tell you which door the headlines came through.
export async function fetchFeed(feed, fetchFn = globalThis.fetch, { proxy = "", timeoutMs = feedTimeoutMs(), budgetMs = feedBudgetMs() } = {}) {
  const target = proxyFor(proxy, feed.url);
  const attempts = [];
  if (target) attempts.push({ url: target, via: "proxy" });
  if (feed.alt) {
    // An `alt` exists because this outlet blocks server traffic: knock on its own door only
    // when there is no proxy to do that job, and never twice.
    if (!target) attempts.push({ url: feed.url, via: "direct" });
    attempts.push({ url: feed.alt, via: "Google News" });
  } else {
    attempts.push({ url: feed.url, via: "direct" });
  }
  const deadline = Date.now() + budgetMs;
  const fails = [];
  for (const a of attempts) {
    const left = deadline - Date.now();
    if (left < 500) {
      fails.push("out of time (stopped early to stay inside the function limit)");
      break;
    }
    try {
      return { xml: await getFeedXml(a.url, fetchFn, Math.min(timeoutMs, left)), via: a.via };
    } catch (e) {
      // Tell the operator which doors were knocked on, so a dead proxy is not mistaken for
      // a blocked outlet.
      fails.push(`${e.name === "TimeoutError" ? "timed out" : e.message} (${a.via})`);
    }
  }
  throw new Error(fails.join(", "));
}

export function candidates(feed, xml, now = Date.now()) {
  const out = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const title = tagText(b, "title");
    if (!title) continue;
    const publishedAt = toIso(tagText(b, "pubDate") || tagText(b, "dc:date"));

    if (feed.kind === "trends") {
      const traffic = tagText(b, "ht:approx_traffic");
      // One trend item can carry several news blocks. Their URLs stay out of the notes:
      // the feed's own <link> is the RSS address again, and a captured news_item_url came
      // back carrying an injected `?&xml=data:video/mp4;base64,...` payload. Titles and
      // outlets are what you actually check, and the card links to the Trends page.
      const news = [...b.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/gi)].slice(0, 3).map(
        (n) => `${tagText(n[1], "ht:news_item_title")} (${tagText(n[1], "ht:news_item_source")})`
      );
      const day = (publishedAt || new Date(now).toISOString()).slice(0, 10);
      out.push({
        key: `trend:${feed.geo}:${title.toLowerCase()}:${day}`,
        type: "trend-topic",
        headline: clip(title, LIMITS.headline),
        summary: traffic ? `Trending on Google Search in ${feed.geoName}. Google's rough count: ${traffic} searches.` : `Trending on Google Search in ${feed.geoName}.`,
        url: feed.pageUrl,
        publishedAt,
        notes: ["Related coverage Google lists (check it before you use it):", ...news].join("\n"),
      });
      continue;
    }

    const url = safeUrl(tagText(b, "link") || tagText(b, "guid"));
    if (!url) continue;
    if (publishedAt && now - Date.parse(publishedAt) > MAX_AGE_MS) continue;

    let publisher = feed.label;
    let headline = title;
    let notes = "";
    if (feed.kind === "gnews") {
      const src = tagText(b, "source");
      if (src) {
        publisher = src;
        headline = title.replace(new RegExp(`\\s+-\\s+${escapeRe(src)}$`), "");
      }
    } else {
      const excerpt = plain(tagText(b, "description"));
      if (excerpt) notes = `Publisher's own excerpt, for you to put in your own words: ${clip(excerpt, 600)}`;
    }
    out.push({ key: url, type: "news-drop", headline: clip(headline, LIMITS.headline), summary: "", url, publishedAt, publisher, notes });
  }
  // A feed reshuffles its items between fetches, so the first PER_FEED in feed order is a
  // different handful every run and the queue grows all day. Rank here: newest first, then by
  // key, so the same items win the same slots across runs and a run files only real news.
  const when = (c) => (c.publishedAt ? Date.parse(c.publishedAt) : 0) || 0;
  return out.sort((a, z) => when(z) - when(a) || a.key.localeCompare(z.key));
}

// A run every 15 minutes can outrun an operator who is busy being on air, so the auto
// arrivals are bounded two ways: untouched machine cards older than KEEP_MS are dropped,
// and a run never files past MAX_PENDING of them. Anything you wrote on or approved is
// yours and is never touched by either rule.
export const RESEARCH_MAX_PENDING = 60;
export const RESEARCH_KEEP_MS = 24 * 3600 * 1000;

// No summary, no question, still pending, filed by the importer: nobody has read it.
export const untouchedAuto = (c) => Boolean(c.importKey) && c.approval === "pending" && !c.summary && !c.question;

export function pruneAutoArrivals(cards, now) {
  const kept = [], dropped = [];
  for (const c of cards) (untouchedAuto(c) && now - (c.createdAt ?? 0) > RESEARCH_KEEP_MS ? dropped : kept).push(c);
  return { cards: kept, dropped: dropped.length };
}

export const toCard = (feed, c, now, i) => ({
  id: cryptoRandomId(),
  type: c.type,
  category: feed.category,
  headline: c.headline,
  summary: c.summary,
  question: "",
  confidence: "reported", // one outlet's report, not verified by you yet
  approval: "pending",
  source: { publisher: c.publisher || feed.label, url: c.url, publishedAt: c.publishedAt, retrievedAt: new Date(now).toISOString() },
  eventDate: null,
  presenterNotes: clip(c.notes || "", LIMITS.notes),
  ttlSec: null,
  order: null,
  createdAt: now + i,
  importKey: c.key,
});

export const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const sameTopic = (a, b) => a === b || (Math.min(a.length, b.length) >= 5 && (a.includes(b) || b.includes(a)));

// Manual button and scheduled run both call this. Returns a plain object; the HTTP
// layer wraps it, the scheduler only logs it.
export async function runResearch(
  store,
  b = {},
  { fetchFn = globalThis.fetch, now = Date.now(), proxy = process.env.DESK_FEED_PROXY ?? "", timeoutMs = feedTimeoutMs(), budgetMs = feedBudgetMs() } = {}
) {
  const wanted = Array.isArray(b.feeds) && b.feeds.length ? FEEDS.filter((f) => b.feeds.includes(f.id)) : FEEDS;
  const cards = await readCards(store);
  const seen = new Set(cards.map((c) => c.importKey).filter(Boolean));
  // Room is counted after the age-out this same run performs, so a queue stuffed with week-old
  // unread stories still makes space for today's instead of stalling forever.
  const room = Math.max(0, RESEARCH_MAX_PENDING - pruneAutoArrivals(cards, now).cards.filter(untouchedAuto).length);

  const settled = await Promise.all(
    wanted.map(async (feed) => {
      try {
        const { xml, via } = await fetchFeed(feed, fetchFn, { proxy, timeoutMs, budgetMs });
        // Whichever door it came in through decides how it is read: Google News items carry a
        // <source> tag and a publisher suffix on the title, the outlets' own feeds do not.
        const shape = via === "Google News" && feed.kind !== "gnews" ? { ...feed, kind: "gnews" } : feed;
        return { feed, via, found: candidates(shape, xml, now) };
      } catch (e) {
        return { feed, error: e.message };
      }
    })
  );

  const added = [];
  const feeds = [];
  const trendFound = {};
  let held = 0; // new items this run could not file because the queue is full
  // Share the room instead of filling it in feed order: with two dozen feeds and a capped
  // queue, first-come would starve whichever desk you added last.
  let roomLeft = room;
  let feedsLeft = settled.filter((s) => !s.error).length;
  for (const { feed, found, via, error } of settled) {
    if (error) {
      feeds.push({ id: feed.id, label: feed.label, ok: false, error });
      continue;
    }
    const share = Math.min(PER_FEED, Math.max(1, Math.floor(roomLeft / Math.max(1, feedsLeft))));
    feedsLeft--;
    let offered = 0;
    let filed = 0;
    for (const c of found) {
      if (seen.has(c.key)) continue;
      if (offered >= PER_FEED) break;
      offered++;
      if (filed >= share || added.length >= room) continue;
      seen.add(c.key);
      added.push(toCard(feed, c, now, added.length));
      filed++;
    }
    roomLeft -= filed;
    held += offered - filed;
    feeds.push({ id: feed.id, label: feed.label, ok: true, via, found: found.length, added: filed, held: offered - filed });
    if (feed.kind === "trends") trendFound[feed.geo] = found;
  }

  // Topics on Google's trending lists for BOTH Nigeria and the US in the same fetch.
  if (trendFound.NG && trendFound.US) {
    const day = new Date(now).toISOString().slice(0, 10);
    let offered = 0;
    let filed = 0;
    for (const a of trendFound.NG) {
      const hit = trendFound.US.find((u) => sameTopic(norm(a.headline), norm(u.headline)));
      const key = `overlap:${norm(a.headline)}:${day}`;
      if (!hit || seen.has(key)) continue;
      offered++;
      seen.add(key);
      if (added.length >= room) continue;
      added.push(toCard({ category: "Trending in NG and US", label: "Google Trends" }, {
        type: "trend-topic", headline: a.headline, summary: "Trending on Google Search in both Nigeria and the US.",
        url: "https://trends.google.com/trending?geo=NG", publishedAt: a.publishedAt,
        notes: `Nigeria's term: ${a.headline}. US term: ${hit.headline}. Check that they really are the same story.`, key,
      }, now, added.length));
      filed++;
    }
    held += offered - filed;
    feeds.push({ id: "overlap", label: "Trending in both countries", ok: true, found: offered, added: filed, held: offered - filed });
  }

  // An auto run can land while the operator is saving a card, and research holds a copy of
  // the whole array, so re-read and merge by id instead of overwriting the blob.
  const current = await readCards(store);
  const { cards: survivors, dropped } = pruneAutoArrivals(current, now);
  const byKey = new Set(current.map((c) => c.importKey).filter(Boolean));
  const fits = added.filter((c) => !byKey.has(c.importKey) && !survivors.some((m) => m.id === c.id));

  const merged = [...survivors, ...fits];
  if (merged.length !== current.length) await store.setJSON("cards", merged);
  return {
    added: fits.length,
    dropped,
    held,
    pending: survivors.filter(untouchedAuto).length + fits.length,
    cards: merged.length,
    feeds,
  };
}

// Netlify makes a function out of every file in netlify/functions, this one included, so it
// answers its own /.netlify/functions/_desk-core URL with a refusal rather than half-work.
export default () =>
  new Response(JSON.stringify({ error: "Internal module. Use the /api/desk routes." }), {
    status: 501,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
