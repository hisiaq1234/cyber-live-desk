// CYBER LIVE DESK — checkpoint 1
// One Netlify Function (v2) that owns: card storage, on-air state, operator actions,
// the public state feed and the tiny HTML page Larix loads.
//
// Routes
//   GET  /desk                 public   overlay page (loads /desk-assets/overlay.js)
//   GET  /api/desk/state       public   on-air state; 204 when ?since= equals the current version
//   GET  /api/desk/cards       operator full queue incl. presenter notes
//   POST /api/desk/cards       operator create or update one card
//   POST /api/desk/action      operator show | next | previous | hide | hold | source | mode
//
// Env: DESK_OPERATOR_TOKEN (required). Storage: Netlify Blobs, strong consistency.
// Single operator assumed: concurrent writes are last-write-wins.

import { getStore } from "@netlify/blobs";
import { timingSafeEqual, randomUUID } from "node:crypto";

export const config = { path: ["/api/desk/*", "/desk", "/control"] };

const DEFAULT_TTL_SEC = 45;
const RESULT_SEC = 20; // how long final poll results stay up
const CONFIDENCE = ["confirmed", "reported", "disputed", "unverified", "test"];
const APPROVAL = ["pending", "approved", "rejected"];
const MODES = ["cards", "x-following"];
const LIMITS = { category: 24, headline: 120, summary: 280, question: 140, notes: 2000 };

const DEFAULT_STATE = {
  version: 0,
  updatedAt: 0,
  mode: "cards",
  visible: false,
  hold: false,
  showSource: false,
  activeCardId: null,
  expiresAt: null,
  poll: null, // { id, question, active, options: [{ id, label, count }] }
};

// Clearly labelled test content only: no invented news, sources or figures.
const TEST_CARD = {
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
};

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Cyber Live Desk overlay</title>
<style>html,body{margin:0;background:transparent}</style></head>
<body><script src="/desk-assets/overlay.js"></script></body></html>`;

const CONTROL_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><title>Live desk controller</title></head>
<body><script src="/desk-assets/control.js"></script></body></html>`;

const store = () => getStore({ name: "cyber-live-desk", consistency: "strong" });

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/\/+$/, "") || "/";
  try {
    if (req.method === "GET" && route === "/desk") {
      return new Response(PAGE, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
      });
    }
    if (req.method === "GET" && route === "/control") {
      return new Response(CONTROL_PAGE, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
      });
    }
    if (req.method === "GET" && route === "/api/desk/state") return await publicState(url);

    requireOperator(req);
    if (req.method === "GET" && route === "/api/desk/cards") return json({ cards: await readCards(), state: await readState(), serverNow: Date.now() });
    if (req.method === "POST" && route === "/api/desk/cards") return await upsertCard(await readBody(req));
    if (req.method === "POST" && route === "/api/desk/action") return await runAction(await readBody(req));
    throw new HttpError(404, "Not found.");
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error("desk error", err);
    return json({ error: "Server error." }, 500);
  }
};

// ---------- auth + input ----------

function requireOperator(req) {
  const want = process.env.DESK_OPERATOR_TOKEN;
  if (!want) throw new HttpError(503, "DESK_OPERATOR_TOKEN is not set on the server.");
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, "Operator token required.");
}

async function readBody(req) {
  try {
    const b = await req.json();
    if (b && typeof b === "object" && !Array.isArray(b)) return b;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, "Send a JSON object as the request body.");
}

// ---------- storage ----------

async function readState() {
  return (await store().get("state", { type: "json" })) ?? { ...DEFAULT_STATE };
}

async function readCards() {
  const s = store();
  let cards = await s.get("cards", { type: "json" });
  if (!cards) {
    cards = [{ ...TEST_CARD, createdAt: Date.now() }];
    await s.setJSON("cards", cards);
  }
  return cards;
}

async function commitState(prev, patch) {
  const next = { ...prev, ...patch, version: prev.version + 1, updatedAt: Date.now() };
  await store().setJSON("state", next);
  return next;
}

// ---------- public feed ----------

// Only fields safe for viewers. Presenter notes and source URLs never leave the operator routes.
const publicCard = (c) => ({
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

async function publicState(url) {
  const state = await readState();
  if (url.searchParams.get("since") === String(state.version)) {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  let card = null;
  if (state.mode === "cards" && state.visible && state.activeCardId) {
    const found = (await readCards()).find((c) => c.id === state.activeCardId);
    if (found && found.approval === "approved") card = publicCard(found);
  }
  const { activeCardId, ...rest } = state; // viewers do not need the id outside `card`
  return json({ ...rest, card, serverNow: Date.now() });
}

// ---------- cards ----------

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

async function upsertCard(b) {
  const cards = await readCards();
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
    retrievedAt: isoOrNull(src.retrievedAt, "source.retrievedAt") ?? (src.url ? new Date().toISOString() : null),
  };

  // Editorial rule: a real news card needs a traceable source before it can go live.
  if (type === "news-drop" && approval === "approved" && confidence !== "test" && (!source.url || !source.publisher)) {
    throw new HttpError(422, "An approved news-drop needs source.publisher and source.url.");
  }

  const ttl = b.ttlSec ?? old?.ttlSec ?? null;
  if (ttl !== null && !(Number.isFinite(ttl) && ttl >= 5 && ttl <= 300)) throw new HttpError(422, "ttlSec must be 5 to 300.");

  const card = {
    id: old?.id ?? randomUUID(),
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
    createdAt: old?.createdAt ?? Date.now(),
  };

  const next = old ? cards.map((c) => (c.id === card.id ? card : c)) : [...cards, card];
  await store().setJSON("cards", next);

  // An edit to the card on air must reach the overlay, so bump the version.
  const state = await readState();
  if (state.activeCardId === card.id) await commitState(state, {});
  return json({ card });
}

// ---------- operator actions ----------

async function runAction(b) {
  const state = await readState();
  const cards = await readCards();
  const now = Date.now();

  const queue = cards
    .filter((c) => c.approval === "approved")
    .sort((a, z) => (a.order ?? a.createdAt) - (z.order ?? z.createdAt));
  const active = queue.find((c) => c.id === state.activeCardId) ?? null;
  const ttlMs = (c) => (c?.ttlSec ?? DEFAULT_TTL_SEC) * 1000;
  const goLive = (c) => {
    if (state.poll?.active) throw new HttpError(409, "End the poll before changing the card.");
    return { mode: "cards", visible: true, activeCardId: c.id, expiresAt: state.hold ? null : now + ttlMs(c), poll: null };
  };

  let patch;
  switch (b.action) {
    case "show": {
      const c = queue.find((x) => x.id === b.cardId);
      if (!c) throw new HttpError(409, "That card does not exist or is not approved.");
      patch = goLive(c);
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
    case "end-poll":
      if (!state.poll?.active) throw new HttpError(409, "No poll is running.");
      patch = { poll: { ...state.poll, active: false }, expiresAt: state.hold ? null : now + RESULT_SEC * 1000 };
      break;
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
    default:
      throw new HttpError(422, "Unknown action.");
  }

  const next = await commitState(state, patch);
  return json({ ok: true, state: next, queueLength: queue.length, serverNow: Date.now() });
}
