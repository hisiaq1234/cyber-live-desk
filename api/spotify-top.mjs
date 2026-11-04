// CYBER LIVE DESK — Spotify top tracks proxy.
// Private, server-only integration. Fetches the authenticated user's top tracks from
// Spotify Web API and returns them to the controller. Never exposes credentials to the
// browser. Keeps Spotify data isolated from the broadcast system.
//
// Routes:
//   GET /api/spotify/top?time_range=long_term|medium_term|short_term&limit=5
//
// Env (Vercel site environment variables, never in this file):
//   SPOTIFY_CLIENT_ID       Spotify app client id
//   SPOTIFY_CLIENT_SECRET   Spotify app client secret
//   SPOTIFY_REFRESH_TOKEN   long-lived refresh token (6-month lifetime, reauth on invalid_grant)
//   SPOTIFY_ACCESS_TOKEN    optional cached access token (function will refresh if needed)

import { requestUrl } from "./_http.mjs";

export const config = { path: "/api/spotify/top" };

const SPOTIFY_API = "https://api.spotify.com/v1";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const env = () => process.env;

let accessTokenCache = { token: null, expiresAt: 0 };

async function getAccessToken(fetchFn = globalThis.fetch) {
  const e = env();
  const clientId = String(e.SPOTIFY_CLIENT_ID ?? "").trim();
  const clientSecret = String(e.SPOTIFY_CLIENT_SECRET ?? "").trim();
  const refreshToken = String(e.SPOTIFY_REFRESH_TOKEN ?? "").trim();
  const cached = String(e.SPOTIFY_ACCESS_TOKEN ?? "").trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Spotify is not configured: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET and SPOTIFY_REFRESH_TOKEN are required.");
  }

  // Use cached access token if still valid (60s safety margin).
  const now = Date.now();
  if (cached && accessTokenCache.token === cached && now < accessTokenCache.expiresAt - 60000) {
    return cached;
  }

  // Refresh the access token using the refresh token.
  const r = await fetchFn("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(refreshToken),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    if (r.status === 400 && /invalid_grant/.test(text)) {
      throw new Error("Spotify refresh token expired (invalid_grant). Re-authorize the user; refresh tokens have a 6-month lifetime.");
    }
    throw new Error(`Spotify token refresh failed: HTTP ${r.status}`);
  }

  const data = await r.json();
  if (!data.access_token) throw new Error("Spotify token refresh returned no access token.");
  accessTokenCache.token = data.access_token;
  accessTokenCache.expiresAt = now + (Number(data.expires_in) ?? 3600) * 1000;
  return data.access_token;
}

export default async (req) => {
  const url = requestUrl(req);
  const timeRange = url.searchParams.get("time_range") || "long_term";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 5, 1), 50);

  if (!["short_term", "medium_term", "long_term"].includes(timeRange)) {
    return json({ error: "time_range must be short_term, medium_term or long_term." }, 422);
  }

  try {
    const token = await getAccessToken();
    const r = await fetch(`${SPOTIFY_API}/me/top/tracks?time_range=${encodeURIComponent(timeRange)}&limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (r.status === 401) {
      // Access token may be stale; clear cache and refresh once.
      accessTokenCache = { token: null, expiresAt: 0 };
      const retried = await getAccessToken();
      const r2 = await fetch(`${SPOTIFY_API}/me/top/tracks?time_range=${encodeURIComponent(timeRange)}&limit=${limit}`, {
        headers: { Authorization: `Bearer ${retried}` },
      });
      if (!r2.ok) {
        const text = await r2.text().catch(() => "");
        return json({ error: `Spotify API ${r2.status}: ${text.slice(0, 200)}` }, r2.status >= 500 ? 502 : 400);
      }
      const data = await r2.json();
      return json({ tracks: normalizeTracks(data), time_range: timeRange, limit });
    }

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return json({ error: `Spotify API ${r.status}: ${text.slice(0, 200)}` }, r.status >= 500 ? 502 : 400);
    }

    const data = await r.json();
    return json({ tracks: normalizeTracks(data), time_range: timeRange, limit });
  } catch (err) {
    return json({ error: err.message || "Spotify request failed." }, 502);
  }
};

function normalizeTracks(data) {
  if (!data || !Array.isArray(data.items)) return [];
  return data.items.map((t) => {
    if (!t) return null;
    const artists = Array.isArray(t.artists) ? t.artists.map((a) => a.name).filter(Boolean) : [];
    const album = t.album || {};
    return {
      id: t.id || null,
      name: t.name || null,
      artists: artists,
      artist: artists.join(", ") || null,
      album: album.name || null,
      albumArt: (Array.isArray(album.images) && album.images[0] ? album.images[0].url : null) || null,
      uri: t.uri || null,
      url: t.external_urls?.spotify || null,
      durationMs: t.duration_ms || null,
      explicit: t.explicit || false,
      popularity: t.popularity || null,
    };
  }).filter(Boolean);
}
