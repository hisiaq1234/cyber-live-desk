// CYBER LIVE DESK — YouTube search resolver.
// Turns a spoken or typed "title by artist" phrase into one playable YouTube video, so the
// Music Desk and the voice/Twitch route can name a song instead of a queue slot. Covers,
// edits and DJ mixes are found the same way: they are ordinary YouTube videos.
//
// This only resolves WHICH video is on air. It never extracts or rebroadcasts audio; the
// visible YouTube player belongs in a Swae web-page layer (see youtube-playlist.mjs).
//
// Env: YOUTUBE_API_KEY — a Google Cloud key with the YouTube Data API v3 enabled.

const YOUTUBE_SEARCH_API = "https://www.googleapis.com/youtube/v3/search";
const SEARCH_TIMEOUT_MS = 8000;
const QUERY_MAX = 120;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeApiKey(env = process.env) {
  return String(env?.YOUTUBE_API_KEY ?? "").trim();
}

/** Keep only usable videos: a real 11-character id and a title. */
export function normalizeYouTubeResults(data, max = 5) {
  const items = Array.isArray(data?.items) ? data.items : [];
  return items
    .map((item) => {
      const videoId = String(item?.id?.videoId ?? "").trim();
      if (!VIDEO_ID.test(videoId)) return null;
      const snippet = item?.snippet ?? {};
      const title = String(snippet.title ?? "").trim().slice(0, QUERY_MAX);
      if (!title) return null;
      const artist = String(snippet.channelTitle ?? "").trim().slice(0, QUERY_MAX);
      const thumbnail = snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || null;
      return { videoId, title, artist, thumbnail };
    })
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Search YouTube for a music phrase. Throws when the phrase is unusable or the key is
 * missing, so callers can tell "not configured" apart from "nothing matched" (empty array).
 */
export async function searchYouTubeTracks(query, { env = process.env, fetchFn = globalThis.fetch, max = 5 } = {}) {
  const text = String(query ?? "").trim();
  if (!text) throw new Error("A music search phrase is required.");
  if (text.length > QUERY_MAX) throw new Error("A music search phrase must be 120 characters or fewer.");
  const key = youtubeApiKey(env);
  if (!key) throw new Error("YouTube search is not configured: YOUTUBE_API_KEY is not set on the server.");

  const limit = Math.min(Math.max(Number(max) || 5, 1), 10);
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: String(limit),
    q: text,
    videoEmbeddable: "true",
    key,
  });

  const res = await fetchFn(`${YOUTUBE_SEARCH_API}?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`YouTube search failed: HTTP ${res.status}`);
  return normalizeYouTubeResults(await res.json(), limit);
}
