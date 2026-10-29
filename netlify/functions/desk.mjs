// CYBER LIVE DESK — checkpoint 3 (HTTP shell).
// Routing, auth and responses only. All behaviour lives in _desk-core.mjs so the
// scheduled auto-research run shares one implementation with these routes.
// The core has to sit in this directory: `netlify functions:build` fails an import from
// outside it with "Could not resolve", and no filename prefix keeps it out of the
// function list, so it ships a handler that refuses to run.
//
// Routes
//   GET  /desk                 public   overlay page (loads /desk-assets/overlay.js)
//   GET  /api/desk/state       public   on-air state; 204 when ?since= equals the current version
//   GET  /api/desk/cards       operator full queue incl. presenter notes
//   POST /api/desk/cards       operator create or update one card
//   POST /api/desk/action      operator show | next | previous | hide | hold | source | mode |
//                              desk | poll actions | auto-play | auto-research
//   POST /api/desk/research    operator fetch Nigerian + US headlines and trends into PENDING cards
//
// Env: DESK_OPERATOR_TOKEN (required). Storage: Netlify Blobs, strong consistency.
// Optional for research: DESK_FEED_PROXY (a scraping API, your own worker or an RSS-Bridge
// instance, see proxyFor in the core), DESK_FEED_TIMEOUT_MS and DESK_FEED_BUDGET_MS.
// Single operator assumed: concurrent writes are last-write-wins, except the auto-play
// advance, which re-checks the version it read so a race cannot skip a card.

import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";
import {
  DESKS,
  HttpError,
  STORE_NAME,
  publicState,
  queueOf,
  readCards,
  readState,
  runAction,
  runResearch,
  upsertCard,
} from "./_desk-core.mjs";

export const config = { path: ["/api/desk/*", "/desk", "/control"] };

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Cyber Live Desk overlay</title>
<style>html,body{margin:0;background:transparent}</style></head>
<body><script src="/desk-assets/overlay.js"></script></body></html>`;

const CONTROL_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><title>Live desk controller</title></head>
<body><script type="module" src="/desk-assets/control.js"></script></body></html>`;

const store = () => getStore({ name: STORE_NAME, consistency: "strong" });

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

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
    if (req.method === "GET" && route === "/api/desk/state") {
      const res = await publicState(store(), url.searchParams.get("since"));
      if (res.status === 204) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
      return json(res.body);
    }

    requireOperator(req);
    const s = store();
    if (req.method === "GET" && route === "/api/desk/cards") {
      const cs = await readCards(s);
      return json({
        cards: cs,
        state: await readState(s),
        // Each desk reports how many approved cards it currently holds, so the panel can show an
        // empty one instead of letting you discover it by pressing a button.
        desks: DESKS.map((d) => ({ id: d.id, label: d.label, count: queueOf(cs, d.id).length })),
        serverNow: Date.now(),
      });
    }
    if (req.method === "POST" && route === "/api/desk/cards") return json({ card: await upsertCard(s, await readBody(req)) });
    if (req.method === "POST" && route === "/api/desk/action") {
      const { state, queueLength } = await runAction(s, await readBody(req));
      return json({ ok: true, state, queueLength, serverNow: Date.now() });
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
