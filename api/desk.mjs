// CYBER LIVE DESK — Vercel checkpoint 3 (HTTP shell).
// Routing, auth and responses only. All behaviour lives in _desk-core.mjs so the
// scheduled auto-research run shares one implementation with these routes.
// The core has to sit in this directory: Vercel resolves imports relative to the
// function file, and no filename prefix keeps it out of the function list, so it
// ships a handler that refuses to run.
//
// Routes
//   GET/HEAD /desk                 public   overlay page and Swae availability check
//   GET  /api/desk                 public   overlay page (loads /desk-assets/overlay.js)
//   GET  /api/desk/state           public   on-air state; 204 when ?since= equals the current version
//   GET  /api/desk/cards           operator full queue incl. presenter notes
//   POST /api/desk/cards           operator create or update one card
//   POST /api/desk/action          operator show | next | previous | draw | hide | hold | source | mode |
//                                   desk | poll actions | auto-play | auto-research | bulk-approval |
//                                   research-approval | twitch-chat | twitch-allow | location | gta
//   POST /api/desk/location        operator live-location fix {lat,lon,place?,hidden?}; stored
//                                   coarse (~1.1 km) and served to the overlay delayed ~90 s
//   POST /api/desk/research        operator fetch headlines/trends, or held items with heldOnly
//   POST /api/desk/brief           operator-only, on-demand evidence brief; never public state
//   GET  /api/desk/twitch          operator-only Twitch EventSub configuration status
//   GET  /api/desk/music/search    operator-only YouTube lookup so a song name can be played
//
// Env: DESK_OPERATOR_TOKEN (required). Storage: Upstash Redis (via _store.mjs adapter).
// Optional for research: DESK_FEED_PROXY (a scraping API, your own worker or an RSS-Bridge
// instance, see proxyFor in the core), DESK_FEED_TIMEOUT_MS and DESK_FEED_BUDGET_MS.
// Optional for private briefs: GEMINI_API_KEY, BRIEF_MODEL, BRIEF_MAX_AGE_HOURS and BRIEF_X_WOEID.
// Optional for Music Desk search: YOUTUBE_API_KEY (YouTube Data API v3). Voice tries the queue
// first, then uses server-side YouTube search on a named-track miss; bare play uses its default.
// Twitch webhook secrets live in Vercel environment variables, never in this file.
// Single operator assumed: concurrent writes are last-write-wins, except the auto-play
// advance, which re-checks the version it read so a race cannot skip a card.

import { getStore } from "./_store.mjs";
import crypto from "node:crypto";
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
  reportCue,
  runAction,
  runResearch,
  upsertCard,
  writeBeing,
  writeLocation,
} from "./_desk-core.mjs";
import { twitchStatus } from "./_twitch-core.mjs";
import { parseDeskCommand, commandBody, commandText } from "../public/desk-assets/_commands.mjs";
import { readBrief, runBrief } from "./_brief.mjs";
import { searchYouTubeTracks, youtubeApiKey } from "./_youtube-search.mjs";
import { requestUrl } from "./_http.mjs";

export const config = { runtime: "nodejs" };

const PAGE = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
  "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">" +
  "<title>Cyber Live Desk overlay</title>" +
  // Every theme names real families, and this is the only page that loads overlay.js, so the
  // fonts have to be fetched here. Without this every theme silently fell back to Georgia.
  // Caveat is variable, hence the weight range; one rejected family fails the whole sheet.
  // Anton and Instrument Serif serve the cyber theme and are requested as plain families here
  // as network fallbacks; the theme's self-hosted copies are shipped at /desk-assets/fonts/.
  // IBM Plex Mono and Space Grotesk are the operator's own Black Market timestamp (index (2).html):
  // the clock plate names them by family, so the page has to carry them or the digits fall back.
  "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>" +
  "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Caveat:wght@400..700" +
  "&family=Kalam:wght@400;700&family=Fraunces:opsz,wght@9..144,400..700" +
  "&family=Inter:wght@400;700&family=JetBrains+Mono:wght@400;700" +
  "&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700" +
  "&family=Anton&family=Instrument+Serif:ital@0;1&display=swap\">" +
  "<style>html,body{margin:0;background:transparent}</style>" +
  "<link rel=\"stylesheet\" href=\"/desk-assets/desk-gta.css\">" +
  "</head>" +
  "<body><script>window.__DESK_CUE_REPORT__=__CUE_REPORT__</script>" +
  "<script type=\"module\" src=\"__OVERLAY_JS__\"></script></body></html>";

// Where the desk page says how a cue ended. One path, used by the page and by the route below, so
// the address the browser posts to and the address the server answers cannot drift apart.
export const CUE_REPORT_PATH = "/api/desk/cue-report";

const store = () => getStore();

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export async function runVoiceMusicAction(actionBody, { run = runAction, search = searchYouTubeTracks } = {}) {
  try {
    return await run(actionBody);
  } catch (error) {
    if (actionBody?.action !== "music-play" || typeof actionBody.query !== "string" || !actionBody.query.trim() ||
        !(error instanceof HttpError) || !/^No queued track matches/i.test(error.message)) throw error;
    let results;
    try {
      results = await search(actionBody.query, { max: 1 });
    } catch (searchError) {
      const message = String(searchError?.message || "");
      if (/YOUTUBE_API_KEY|not configured|not set/i.test(message)) {
        throw new HttpError(503, "YouTube voice search is not configured. Add YOUTUBE_API_KEY in Vercel.");
      }
      throw new HttpError(502, "YouTube search failed.");
    }
    const track = Array.isArray(results) ? results[0] : null;
    const videoId = typeof track?.videoId === "string" ? track.videoId.trim() : "";
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new HttpError(404, "No playable YouTube result was found.");
    return run({ ...actionBody, videoId, title: track.title || actionBody.query, artist: track.artist || "" });
  }
}

const handler = async (req) => {
  const url = requestUrl(req);
  const route = url.pathname.replace(/\/+$/, "") || "/";
  try {
    if ((req.method === "GET" || req.method === "HEAD") && (route === "/desk" || route === "/api/desk")) {
      const variant = (url.searchParams.get("overlay") || url.searchParams.get("variant") || "").toLowerCase();
      const useBrand = variant === "brand" || url.searchParams.get("brand") === "1";
      const overlaySrc = useBrand ? "/desk-assets/overlay-brand.js" : "/desk-assets/overlay.js";
      // The page is the one place that can say how a cue ended, so it carries the operator token the
      // report endpoint asks for. The owner was told plainly what a token on a public URL means and
      // chose it anyway; the token buys exactly one write from this page — a cue report — and
      // nothing else in the overlay is given it or uses it.
      const page = PAGE.replace("__OVERLAY_JS__", overlaySrc)
        .replace("__CUE_REPORT__", JSON.stringify({ url: CUE_REPORT_PATH, token: process.env.DESK_OPERATOR_TOKEN || "" }));
      return new Response(req.method === "HEAD" ? null : page, {
        // Not cached: the page now carries a secret, so a shared cache must not hand it out or
        // serve yesterday's token after it is rotated.
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    // The overlay can be loaded straight from a local file in OBS, so the public
    // read-only state has to be reachable cross-origin. Only this one route is opened
    // up: it exposes the viewer projection and nothing else. Every operator route
    // below still sits behind requireOperator and stays same-origin only.
    const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };
    if (req.method === "OPTIONS" && route === "/api/desk/state") {
      return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "600" } });
    }
    if (req.method === "GET" && route === "/api/desk/state") {
      const res = await publicState(store(), url.searchParams.get("since"));
      if (res.status === 204) {
        return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", ...CORS } });
      }
      return new Response(JSON.stringify(res.body), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS },
      });
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
        brief: await readBrief(s),
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
    // Music search is operator-only, so it may name the missing setting. The player itself is
    // never here: only which YouTube video the phrase resolves to.
    if (req.method === "GET" && route === "/api/desk/music/search") {
      const q = (url.searchParams.get("q") ?? "").trim();
      if (!q) throw new HttpError(422, "A music search phrase (q) is required.");
      if (q.length > 120) throw new HttpError(422, "A music search phrase must be 120 characters or fewer.");
      if (!youtubeApiKey()) {
        throw new HttpError(503, "YouTube search is not configured. Set YOUTUBE_API_KEY in the Vercel project environment.");
      }
      let results;
      try {
        results = await searchYouTubeTracks(q);
      } catch (err) {
        throw new HttpError(502, err.message || "YouTube search failed.");
      }
      return json({ query: q, results });
    }
    if (req.method === "POST" && route === "/api/desk/brief") {
      return json(await runBrief(s, await readBody(req)));
    }
    // Voice endpoint: operator authentication is required above, then speech is limited to
    // an explicit allowlist of supported CRID actions.
    if (req.method === "POST" && route === "/api/desk/voice") {
      const body = await readBody(req);
      const text = typeof body.text === "string" ? body.text : "";
      if (!text) throw new HttpError(422, "Voice text is required.");
      const cmd = parseDeskCommand(text);
      if (!cmd) throw new HttpError(422, "Not a recognized CRID command.");
      let actionBody = commandBody(cmd);
      if (!actionBody) throw new HttpError(422, "Command cannot be executed by voice.");
      // Everything on this list moves something the streamer can already see and undo. The layout
      // and the bot are here because an overlay that rearranges itself without answering back is a
      // menu, not a companion: a gesture and an inset cost nothing on air, touch no credential, no
      // feed and no queue, and are one word to reverse.
      const safeActions = new Set(["next", "previous", "hold", "hide", "desk", "draw", "start-poll", "end-poll", "auto-play", "clip-create", "crid-open", "music-play", "music-pause", "music-next", "music-stop", "logo", "scene", "bot-react", "bot"]);
      if (!safeActions.has(actionBody.action)) throw new HttpError(403, "This command is not available by voice.");
      // Voice-opened CRID segments use a default title so the streamer can speak to open one.
      if (actionBody.action === "crid-open") {
        actionBody = { ...actionBody, kind: "topic", title: "Voice segment", credit: "Voice" };
      }
      const result = await runVoiceMusicAction(actionBody, { run: (body) => runAction(s, body) });
      return json({ ok: true, ...result, command: commandText(cmd), serverNow: Date.now() });
    }
    if (req.method === "POST" && route === "/api/desk/cards") return json({ card: await upsertCard(s, await readBody(req)) });
    if (req.method === "POST" && route === "/api/desk/action") {
      const result = await runAction(s, await readBody(req));
      return json({ ok: true, ...result, serverNow: Date.now() });
    }
    // The desk page reports how the cue it performed ended. It writes one ledger entry and nothing
    // else: no state is handed back, no action runs, and the only thing the caller learns is whether
    // the report was accepted, ignored (a repeated stamp) or refused (a stamp never issued here).
    if (req.method === "POST" && route === CUE_REPORT_PATH) {
      return json({ ...(await reportCue(s, await readBody(req))), serverNow: Date.now() });
    }
    // The page's other write with the same embedded token: Crid's drives and where he was
    // standing, so a reload continues him instead of re-rolling his inner life. It writes one
    // sanitized field into state.bot and answers { ok } — no action runs, nothing else moves.
    if (req.method === "POST" && route === "/api/desk/being") {
      return json({ ...(await writeBeing(s, await readBody(req))), serverNow: Date.now() });
    }
    // The live-location write: coarse cells only, server receipt time, panic flag. Same
    // Bearer gate as every operator route above; the public projection serves the delayed view.
    if (req.method === "POST" && route === "/api/desk/location") {
      return json({ ...(await writeLocation(s, await readBody(req))), serverNow: Date.now() });
    }
    if (req.method === "POST" && route === "/api/desk/research") return json(await runResearch(s, await readBody(req)));
    throw new HttpError(404, "Not found.");
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error("desk error", err);
    return json({ error: "Server error." }, 500);
  }
};
export default { fetch: handler };

function requireOperator(req) {
  const want = process.env.DESK_OPERATOR_TOKEN;
  if (!want) throw new HttpError(503, "DESK_OPERATOR_TOKEN is not set on the server.");
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, "Operator token required.");
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
