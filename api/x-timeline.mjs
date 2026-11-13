// CYBER LIVE DESK — X Following timeline feed proxy.
// Serves the extracted X-overlay app (public/x-overlay/): its bundle calls
// /api/x-timeline/feed, which we forward to the live feed service. The service
// holds the X credentials; this hop only shapes the request and the failure.
//
//   GET /api/x-timeline/feed?limit=5   ->  {account, posts:[...]}  (pass-through)
//
// Upstream: https://lighthearted-treacle-74e118.netlify.app — the deployment the
// owner pointed the desk at. If it moves, change FEED_ORIGIN only.

import { requestUrl } from "./_http.mjs";

export const config = { runtime: "nodejs" };

const FEED_ORIGIN = "https://lighthearted-treacle-74e118.netlify.app";
const UPSTREAM_TIMEOUT_MS = 9000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const handler = async (req) => {
  const url = requestUrl(req);
  if (!url.pathname.replace(/\/+$/, "").endsWith("/feed"))
    return json({ error: "unknown x-timeline route" }, 404);
  if (req.method !== "GET" && req.method !== "HEAD")
    return json({ error: "method not allowed" }, 405);

  try {
    const res = await globalThis.fetch(`${FEED_ORIGIN}/api/x-timeline/feed${url.search}`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const body = await res.text();
    // Pass the service's own status through — an upstream 502 is its honest
    // answer, and the overlay renders its own unavailable state for it.
    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return json({ error: `x-timeline upstream unreachable: ${err?.message || err}` }, 502);
  }
};

export default { fetch: handler };
