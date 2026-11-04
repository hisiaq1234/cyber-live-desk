// CYBER LIVE DESK — X feed proxy for the desk jumbotron and private briefs.
// Bearer credentials stay server-side. Trend requests are explicit and bounded.
// Routes:
//   GET /api/x/feed?mode=trends&woeid=23424908   Nigeria trends (default)
//   GET /api/x/feed?mode=following&userId=123   posts from people the user follows
//   GET /api/x/feed?mode=for-you&userId=123     closest available: home timeline
// Env: X_BEARER_TOKEN (preferred) or X_ACCESS_TOKEN (legacy fallback).

import { requestUrl } from "./_http.mjs";

export const config = { runtime: "nodejs" };
const X_API = "https://api.x.com";
const X_TIMEOUT_MS = 8000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const bearer = (env = process.env) => String(env.X_BEARER_TOKEN || env.X_ACCESS_TOKEN || "").trim();
const boundedInt = (value, fallback, min, max) => {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

async function xFetch(path, { env = process.env, fetchFn = globalThis.fetch } = {}) {
  const token = bearer(env);
  if (!token) throw new Error("X_BEARER_TOKEN is not set on the server.");
  const r = await fetchFn(`${X_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(X_TIMEOUT_MS),
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`X API ${r.status}`);
  return r.json();
}

export async function fetchXTrends({
  env = process.env,
  fetchFn = globalThis.fetch,
  woeid = "23424908",
  max = 10,
  now = Date.now(),
} = {}) {
  const id = String(woeid ?? "").trim();
  if (!/^\d{1,10}$/.test(id) || Number(id) <= 0) throw new Error("A valid positive X trends WOEID is required.");
  const count = boundedInt(max, 10, 1, 50);
  const params = new URLSearchParams({ max_trends: String(count), "trend.fields": "trend_name,tweet_count" });
  const data = await xFetch(`/2/trends/by/woeid/${id}?${params}`, { env, fetchFn });
  const trends = (Array.isArray(data?.data) ? data.data : []).slice(0, count).flatMap((item) => {
    const name = String(item?.trend_name ?? item?.name ?? "").trim().slice(0, 160);
    if (!name) return [];
    const countValue = Number(item?.tweet_count);
    return [{ name, tweetCount: Number.isFinite(countValue) && countValue >= 0 ? countValue : null }];
  });
  return { mode: "trends", woeid: id, updatedAt: now, trends };
}

const handler = async (req) => {
  const url = requestUrl(req);
  const mode = url.searchParams.get("mode") || "trends";
  const woeid = url.searchParams.get("woeid") || "23424908";
  const userId = url.searchParams.get("userId");
  const max = boundedInt(url.searchParams.get("max"), 10, 1, 100);

  try {
    if (mode === "trends") {
      return json(await fetchXTrends({ woeid, max }));
    }

    if (mode === "following" || mode === "for-you") {
      if (!userId) return json({ error: "userId is required for following / for-you" }, 422);
      const data = await xFetch(
        `/2/users/${encodeURIComponent(userId)}/timelines/reverse-chronological?max_results=${Math.min(max, 100)}&expansions=author_id&user.fields=username,name,profile_image_url&tweet.fields=created_at,public_metrics`
      );
      const users = new Map(((data.includes && data.includes.users) || []).map((u) => [u.id, u]));
      const tweets = (data.data || []).slice(0, max).map((t) => {
        const u = users.get(t.author_id);
        const m = t.public_metrics || {};
        return {
          id: t.id,
          text: t.text,
          author: u ? u.name : t.author_id,
          handle: u ? u.username : "",
          avatar: u ? u.profile_image_url : null,
          createdAt: t.created_at,
          metrics: { reply: m.reply_count, repost: m.retweet_count, like: m.like_count },
        };
      });
      return json({ mode, userId, updatedAt: Date.now(), tweets });
    }

    return json({ error: `Unknown mode: ${mode}` }, 422);
  } catch (err) {
    return json({ error: err.message || "X feed failed." }, 502);
  }
};

export default { fetch: handler };
