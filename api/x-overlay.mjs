// CYBER LIVE DESK — X-overlay remote-control passthrough.
// The extracted overlay app polls /api/x-overlay/control for its phone-pairing
// state. Pairing belongs to the upstream deployment's room, so GETs are proxied
// read-only; anything that would mutate (POST pairing/commands) is refused —
// the desk does not expose that control surface.
//
//   GET  /api/x-overlay/control  -> upstream answer (usually {"error":"Room not found."})
//   other methods / paths        -> 404 / 405

import { requestUrl } from "./_http.mjs";

export const config = { runtime: "nodejs" };

const FEED_ORIGIN = "https://lighthearted-treacle-74e118.netlify.app";
const UPSTREAM_TIMEOUT_MS = 8000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const handler = async (req) => {
  const url = requestUrl(req);
  if (!url.pathname.replace(/\/+$/, "").endsWith("/control"))
    return json({ error: "unknown x-overlay route" }, 404);
  if (req.method !== "GET" && req.method !== "HEAD")
    return json({ error: "remote control is read-only through the desk" }, 405);

  try {
    const res = await globalThis.fetch(`${FEED_ORIGIN}/api/x-overlay/control${url.search}`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return json({ error: `x-overlay upstream unreachable: ${err?.message || err}` }, 502);
  }
};

export default { fetch: handler };
