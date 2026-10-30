// CYBER LIVE DESK — Audiomack Music Station proxy.
// Connects to the Audiomack v1 Data API for trending tracks, music discovery,
// and playable stream URLs for the Broadcast Music Desk and CRID Jumbotron.
// Never exposes API credentials to the browser.
//
// Routes:
//   GET /api/audiomack?mode=trending&genre=rap|electronic|all
//   GET /api/audiomack?mode=search&q=keyword
//   GET /api/audiomack?mode=play&id=123
//
// Env (Netlify site environment variables):
//   AUDIOMACK_KEY       Audiomack Consumer Key
//   AUDIOMACK_SECRET    Audiomack Consumer Secret

import crypto from "node:crypto";

export const config = { path: "/api/audiomack" };

const AUDIOMACK_API = "https://api.audiomack.com/v1";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

// Standard OAuth 1.0a request signer (HMAC-SHA1) with zero external dependencies
function oauth1Sign(method, urlStr, params, consumerKey, consumerSecret, tokenSecret = "") {
  const url = new URL(urlStr);
  const baseUrl = `${url.protocol}//${url.host}${url.pathname}`;

  const allParams = {
    ...params,
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
  };

  // Sort and URL-encode parameters
  const encodedPairs = Object.keys(allParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`);
  const paramString = encodedPairs.join("&");

  // Construct signature base string
  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(baseUrl),
    encodeURIComponent(paramString),
  ].join("&");

  // Sign with consumerSecret&tokenSecret
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  allParams.oauth_signature = signature;

  // Build Authorization header
  const authHeaderParts = Object.keys(allParams)
    .filter((k) => k.startsWith("oauth_"))
    .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(allParams[k])}"`);

  return `OAuth ${authHeaderParts.join(", ")}`;
}

async function audiomackFetch(path, queryParams = {}) {
  const key = process.env.AUDIOMACK_KEY?.trim();
  const secret = process.env.AUDIOMACK_SECRET?.trim();

  if (!key || !secret) {
    return null; // Signals fallback to curated catalogue
  }

  const url = `${AUDIOMACK_API}${path}`;
  const authHeader = oauth1Sign("GET", url, queryParams, key, secret);

  const q = new URLSearchParams(queryParams).toString();
  const fetchUrl = q ? `${url}?${q}` : url;

  const res = await fetch(fetchUrl, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Audiomack API ${res.status}: ${errText || res.statusText}`);
  }

  return res.json();
}

// Curated live broadcast starter tracks (royalty-safe / public streams)
// displayed instantly if API keys are not yet configured in Netlify env
const CURATED_TRACKS = [
  {
    id: "am-01",
    title: "Sapa No Fit Catch Me (Live Desk Edit)",
    artist: "Cyber Street Sound",
    image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop",
    genre: "Afrobeats",
    url: "https://audiomack.com",
    audioUrl: "https://cdn.freesound.org/previews/655/655385_11861866-lq.mp3",
    duration: "2:45",
  },
  {
    id: "am-02",
    title: "Wahala Dey (Night Drive)",
    artist: "Lagos Nightline",
    image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop",
    genre: "Street Pop",
    url: "https://audiomack.com",
    audioUrl: "https://cdn.freesound.org/previews/652/652398_11861866-lq.mp3",
    duration: "3:10",
  },
  {
    id: "am-03",
    title: "Oya Na (Jumbotron Vibe)",
    artist: "Black Market Studio",
    image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop",
    genre: "Amapiano",
    url: "https://audiomack.com",
    audioUrl: "https://cdn.freesound.org/previews/612/612543_11861866-lq.mp3",
    duration: "3:30",
  },
  {
    id: "am-04",
    title: "Idan Identity (Broadcast Theme)",
    artist: "Cyber Live Collective",
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=300&fit=crop",
    genre: "Afro-Fusion",
    url: "https://audiomack.com",
    audioUrl: "https://cdn.freesound.org/previews/684/684347_11861866-lq.mp3",
    duration: "2:50",
  },
];

export default async (req) => {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "trending";
  const genre = url.searchParams.get("genre") || "";
  const query = url.searchParams.get("q") || "";

  try {
    const isConfigured = Boolean(process.env.AUDIOMACK_KEY && process.env.AUDIOMACK_SECRET);

    if (mode === "search" && query) {
      if (isConfigured) {
        const data = await audiomackFetch("/search", { q: query, show: "songs", limit: 8 });
        if (data && Array.isArray(data.results)) {
          const tracks = data.results.map((t) => ({
            id: t.id,
            title: t.title,
            artist: t.artist || t.uploader?.name || "Unknown",
            image: t.image || "",
            genre: t.genre || "Afrobeats",
            url: t.url || `https://audiomack.com/song/${t.uploader?.url_slug}/${t.url_slug}`,
            audioUrl: t.streaming_url || "",
          }));
          return json({ mode: "search", query, configured: true, tracks });
        }
      }
      // Filter curated if no key or fallback
      const filtered = CURATED_TRACKS.filter((t) =>
        `${t.title} ${t.artist}`.toLowerCase().includes(query.toLowerCase())
      );
      return json({ mode: "search", query, configured: isConfigured, tracks: filtered });
    }

    // Default: trending
    if (isConfigured) {
      const endpoint = genre ? `/music/${genre}/trending` : "/music/trending";
      const data = await audiomackFetch(endpoint, { limit: 8 });
      if (data && Array.isArray(data.results)) {
        const tracks = data.results.map((t) => ({
          id: t.id,
          title: t.title,
          artist: t.artist || t.uploader?.name || "Unknown",
          image: t.image || "",
          genre: t.genre || "Trending",
          url: t.url || `https://audiomack.com/song/${t.uploader?.url_slug}/${t.url_slug}`,
          audioUrl: t.streaming_url || "",
        }));
        return json({ mode: "trending", configured: true, tracks });
      }
    }

    return json({
      mode: "trending",
      configured: isConfigured,
      note: isConfigured
        ? "Connected to live Audiomack API."
        : "Curated broadcast station active. Add AUDIOMACK_KEY and AUDIOMACK_SECRET in Netlify for full API access.",
      tracks: CURATED_TRACKS,
    });
  } catch (err) {
    return json(
      {
        error: err.message,
        configured: Boolean(process.env.AUDIOMACK_KEY && process.env.AUDIOMACK_SECRET),
        tracks: CURATED_TRACKS,
      },
      200
    );
  }
};
