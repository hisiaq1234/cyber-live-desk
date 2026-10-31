// CYBER LIVE DESK — Vercel checkpoint 3 (HTTP shell).
// Routing, auth and responses only. All behaviour lives in _desk-core.mjs so the
// scheduled auto-research run shares one implementation with these routes.
// The core has to sit in this directory: Vercel resolves imports relative to the
// function file, and no filename prefix keeps it out of the function list, so it
// ships a handler that refuses to run.
//
// Routes
//   GET  /api/desk                 public   overlay page (loads /desk-assets/overlay.js)
//   GET  /api/desk/state           public   on-air state; 204 when ?since= equals the current version
//   GET  /api/desk/cards           operator full queue incl. presenter notes
//   POST /api/desk/cards           operator create or update one card
//   POST /api/desk/action          operator show | next | previous | hide | hold | source | mode |
//                                   desk | poll actions | auto-play | auto-research | bulk-approval |
//                                   research-approval | twitch-chat | twitch-allow
//   POST /api/desk/research        operator fetch headlines/trends, or held items with heldOnly
//   GET  /api/desk/twitch          operator-only Twitch EventSub configuration status
//
// Env: DESK_OPERATOR_TOKEN (required). Storage: Vercel KV (via _store.mjs adapter).
// Optional for research: DESK_FEED_PROXY (a scraping API, your own worker or an RSS-Bridge
// instance, see proxyFor in the core), DESK_FEED_TIMEOUT_MS and DESK_FEED_BUDGET_MS.
// Twitch webhook secrets live in Vercel environment variables, never in this file.
// Single operator assumed: concurrent writes are last-write-wins, except the auto-play
// advance, which re-checks the version it read so a race cannot skip a card.

import { getStore } from "./_store.mjs";
import { timingSafeEqual } from "node:crypto";
import {
  DESKS,
  FEEDS,
  HttpError,
  RESEARCH_MAX_PENDING,
  STORE_NAME,
  matchesDesk,
  publicState,
  queueCounts,
  queueOf,
  readCards,
  readHeldResearch,
  readState,
  runAction,
  runResearch,
  upsertCard,
} from "./_desk-core.mjs";
import { twitchStatus } from "./_twitch-core.mjs";
import { parseDeskCommand, commandBody, commandText } from "./_commands.mjs";

export const config = { runtime: "nodejs" };

const PAGE = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
  "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">" +
  "<title>Cyber Live Desk overlay</title>" +
  "<style>html,body{margin:0;background:transparent}</style></head>" +
  "<body><script src=\"/desk-assets/overlay.js\"></script></body></html>";

const store = () => getStore();

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export default async (req) => {
  const url = new URL(req.url.startsWith("http") ? req.url : `https://cyber-live-desk.vercel.app${req.url}`);
  const route = url.pathname.replace(/\/+$/, "") || "/";
  try {
    if (req.method === "GET" && (route === "/desk" || route === "/api/desk")) {
      return new Response(PAGE, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
      });
    }
    if (req.method === "GET" && route === "/api/desk/state") {
      const res = await publicState(store(), url.searchParams.get("since"));
      if (res.status === 204) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
      return json(res.body);
    }

    requireOperator(req);
    const s = store();
    if (req.method === "GET" && route === "/api/desk/cards") {
      const cs = await readCards(s);
      const state = await readState(s);
      const held = await readHeldResearch(s);
      return json({
        cards: cs.map((c) => ({ ...c, deskIds: DESKS.filter((d) => matchesDesk(c, d.id)).map((d) => d.id) })),
        state,
        counts: queueCounts(cs, state, held.length),
        desks: DESKS.map((d) => ({ id: d.id, label: d.label, count: queueOf(cs, d.id).length })),
        feeds: FEEDS.map((f) => ({ id: f.id, label: f.label, category: f.category })),
        research: {
          approvalMode: state.researchApprovalMode,
          trustedFeedIds: state.trustedFeedIds,
          maxPending: RESEARCH_MAX_PENDING,
          held: held.length,
          heldItems: held.slice(0, 20).map((h) => ({
            headline: h.headline, feedId: h.feedId, feedLabel: h.feedLabel, heldAt: h.heldAt,
          })),
        },
        twitch: await twitchStatus(s, state, { origin: url.origin }),
        serverNow: Date.now(),
      });
    }
    if (req.method === "GET" && route === "/api/desk/twitch") {
      return json(await twitchStatus(s, await readState(s), { origin: url.origin }));
    }
    // Public voice endpoint: maps recognized speech to a safe subset of desk actions.
    // No operator token is required; only non-destructive actions are permitted.
    if (req.method === "POST" && route === "/api/desk/voice") {
      const body = await readBody(req);
      const text = typeof body.text === "string" ? body.text : "";
      if (!text) throw new HttpError(422, "Voice text is required.");
      const cmd = parseDeskCommand(text);
      if (!cmd) throw new HttpError(422, "Not a recognized desk command.");
      let actionBody = commandBody(cmd);
      if (!actionBody) throw new HttpError(422, "Command cannot be executed by voice.");
      const safeActions = new Set(["next", "previous", "hold", "hide", "desk", "start-poll", "end-poll", "auto-play", "clip-create", "crid-open"]);
      if (!safeActions.has(actionBody.action)) throw new HttpError(403, "This command is not available by voice.");
      // Voice-opened CRID segments use a default title so the streamer can speak to open one.
      if (actionBody.action === "crid-open") {
        actionBody = { ...actionBody, kind: "topic", title: "Voice segment", credit: "Voice" };
      }
      const result = await runAction(s, actionBody);
      return json({ ok: true, ...result, command: commandText(cmd), serverNow: Date.now() });
    }
    if (req.method === "POST" && route === "/api/desk/cards") return json({ card: await upsertCard(s, await readBody(req)) });
    if (req.method === "POST" && route === "/api/desk/action") {
      const result = await runAction(s, await readBody(req));
      return json({ ok: true, ...result, serverNow: Date.now() });
    }
    if (req.method === "POST" && route === "/api/desk/research") return json(await runResearch(s, await readBody(req)));
    throw new HttpError(404, "Not found.");
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error("desk error", err);
    return json({ error: "Server error." }, 500);
  }
};

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
