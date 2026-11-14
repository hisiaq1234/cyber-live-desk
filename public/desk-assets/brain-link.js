/* The /desk page's end of the brain bus.
 *
 * The public desk already persists Crid through POST /api/desk/being (Vercel
 * state). This module is the OPTIONAL local-brain lane: when the page is opened
 * with ?brain=<url> (e.g. http://127.0.0.1:7311 on the stream machine), it also
 * mirrors his being snapshot to the brain's /being and forwards voice notes to
 * /ingest, so the local brain's copy of him is the one the stream actually ran.
 *
 * Same contract as being-sync.mjs: throttled, flushed on pagehide, best-effort —
 * a brain that is not running costs nothing and breaks nothing.
 */
export function connectDeskBrain(bot, { url = "", token = "", fetchFn = globalThis.fetch, log = null } = {}) {
  const base = String(url || "").replace(/\/+$/, "");
  const on = Boolean(base && fetchFn && bot && typeof bot.getBeing === "function");
  let lastAt = -Infinity;
  const minMs = 15000;

  const post = async (path, body, keepalive = false) => {
    try {
      const headers = { "content-type": "application/json" };
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await fetchFn(`${base}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        keepalive,
      });
      return res.ok;
    } catch (err) {
      log?.(`[brain-link] ${path} not delivered: ${err?.message || err}`);
      return false;
    }
  };

  return {
    on,
    /** Throttled being mirror — call from the state poll. */
    poll() {
      if (!on) return null;
      const now = Date.now();
      if (now - lastAt < minMs) return null;
      lastAt = now;
      return post("/being", bot.getBeing());
    },
    /** pagehide / hidden: freshest snapshot even inside the throttle window. */
    flush() {
      if (!on) return null;
      lastAt = Date.now();
      return post("/being", bot.getBeing(), true);
    },
    /** Forward one normalised event (voice note, environment report) to /ingest. */
    ingest(evt) {
      if (!on) return Promise.resolve(false);
      return post("/ingest", evt);
    },
  };
}
