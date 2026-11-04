/**
 * youtube-playlist.mjs — validate a YouTube / YouTube Music playlist link and
 * return the embed URL the desk can hand to a Swae Browser Widget.
 *
 * Contract (matched to control.js):
 *   const url = youtubePlaylistEmbedUrl(input);   // "" when the link is not usable
 *   youtubeEmbedOutput.value = url || "";
 *
 * The control room shows this to the operator as "Validated. Use this visible,
 * interactive YouTube player URL as a Swae Browser Widget/Web Page layer."
 * An empty string is the only failure signal, so anything doubtful returns "".
 */

/** Playlist ids: PL…, UU…, OL…, RD…, and the Music-specific VL-prefixed form. */
const PLAYLIST_ID = /^(?:PL|UU|OL|RD|VL|FL|LL)[A-Za-z0-9_-]{10,}$/;

const EMBED_BASE = "https://www.youtube-nocookie.com/embed/videoseries";

/** Extract a playlist id from either a bare id or any of the usual link shapes. */
export function parsePlaylistId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  // A bare id pasted straight in.
  if (/^[A-Za-z0-9_-]{10,}$/.test(raw) && PLAYLIST_ID.test(raw)) return raw;

  let url;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return "";
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const isYoutube =
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtu.be";
  if (!isYoutube) return "";

  // ?list=PL… is the canonical form on every YouTube surface.
  const list = url.searchParams.get("list");
  if (list && PLAYLIST_ID.test(list)) return list;

  // Some share sheets put the id in the path (/playlist/PL…).
  const fromPath = /\/playlist\/([A-Za-z0-9_-]{10,})/.exec(url.pathname);
  if (fromPath && PLAYLIST_ID.test(fromPath[1])) return fromPath[1];

  // A bare "watch?v=…&list=" already returned above; a video id alone is not a playlist.
  return "";
}

export function youtubePlaylistEmbedUrl(input, options) {
  const id = parsePlaylistId(input);
  if (!id) return "";

  const opts = options && typeof options === "object" ? options : {};
  const params = new URLSearchParams();

  // The widget is shown to viewers: loop the list, keep the chrome tidy, and do
  // not leak YouTube branding into the overlay's own panel styling.
  params.set("list", id);
  params.set("listType", "playlist");
  params.set("rel", "0");
  params.set("modestbranding", "1");
  params.set("playsinline", "1");
  params.set("enablejsapi", "1");
  params.set("loop", opts.loop === false ? "0" : "1");

  // Loop on a playlist requires the video id to repeat; index 0 is the safest
  // anchor and is what YouTube's own share dialog emits.
  if (params.get("loop") === "1") params.set("v", opts.anchor || "");

  return `${EMBED_BASE}?${params.toString().replace(/v=&?/, "")}`;
}
