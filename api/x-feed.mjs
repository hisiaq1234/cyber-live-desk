// CYBER LIVE DESK — X feed proxy for the desk jumbotron.
// Proxies X API v2 so the bearer token never reaches the browser.
// Routes:
//   GET /api/x/feed?mode=trends&woeid=23424908   trending topics (default WOEID = Nigeria)
//   GET /api/x/feed?mode=following&userId=123   tweets from people the user follows
//   GET /api/x/feed?mode=for-you&userId=123     closest available: home timeline
// Env: X_BEARER_TOKEN (required for app-only auth) — set in Vercel environment variables.
// Also accepts X_ACCESS_TOKEN as a fallback alias (older env var name).

export const config = { runtime: "nodejs" };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

// Accept either name — X_BEARER_TOKEN is the correct one for app-only auth
const bearer = () => process.env.X_BEARER_TOKEN || process.env.X_ACCESS_TOKEN;

const xFetch = async (path) => {
  const token = bearer();
  if (!token) throw new Error("X_BEARER_TOKEN is not set on the server.");
  const r = await fetch(`https://api.twitter.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`X API ${r.status}`);
  return r.json();
};

export default async (req) => {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "trends";
  const woeid = url.searchParams.get("woeid") || "23424908";
  const userId = url.searchParams.get("userId");
  const max = Number(url.searchParams.get("max")) || 10;

  try {
    if (mode === "trends") {
      const data = await xFetch(`/2/trends/by/woeid/${woeid}`);
      const trends = (data.data || []).slice(0, max).map((t) => ({
        name: t.name,
        tweetCount: t.tweet_count,
      }));
      return json({ mode: "trends", woeid, updatedAt: Date.now(), trends });
    }

    if (mode === "following" || mode === "for-you") {
      if (!userId) return json({ error: "userId is required for following / for-you" }, 422);
      const data = await xFetch(
        `/2/users/${userId}/timelines/reverse-chronological?max_results=${Math.min(max, 100)}&expansions=author_id&user.fields=username,name,profile_image_url&tweet.fields=created_at,public_metrics`
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
