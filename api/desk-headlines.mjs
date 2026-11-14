// CYBER LIVE DESK — GET /api/desk/headlines.
// Serves the parsed feed to the overlay's ticker strip. Cache headers match the
// feed's own freshness window — the desk polls this, viewers should not wait on it.
import { fetchHeadlineFeed } from "./_headlines.mjs";

export const config = { runtime: "nodejs" };

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

async function handler(req, { fetchFn = fetch, now = Date.now() } = {}) {
  if (req.method === "HEAD") return new Response(null, { headers });
  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed." }, { status: 405, headers: { ...headers, Allow: "GET, HEAD" } });
  }

  try {
    return Response.json(await fetchHeadlineFeed({ fetchFn, now }), { headers });
  } catch (error) {
    console.warn("headline feed unavailable:", error?.message || "upstream request failed");
    return Response.json(
      { error: "Fresh headlines are temporarily unavailable.", headlines: [], freshnessHours: 12 },
      { status: 503, headers: { ...headers, "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  }
}

export default { fetch: handler };
