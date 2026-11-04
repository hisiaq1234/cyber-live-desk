const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "music.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,200}$/;

/**
 * Convert a public YouTube/YouTube Music playlist URL into YouTube's visible,
 * interactive playlist player URL. This does not fetch data or extract audio.
 */
export function youtubePlaylistEmbedUrl(value) {
  let source;
  try {
    source = new URL(String(value ?? "").trim());
  } catch {
    return null;
  }
  if (source.protocol !== "https:" || source.username || source.password || source.port) return null;
  if (!YOUTUBE_HOSTS.has(source.hostname.toLowerCase())) return null;

  const playlist = source.searchParams.get("list");
  if (!playlist || !PLAYLIST_ID.test(playlist)) return null;

  const embed = new URL("https://www.youtube.com/embed");
  embed.searchParams.set("listType", "playlist");
  embed.searchParams.set("list", playlist);
  embed.searchParams.set("playsinline", "1");
  return embed.href;
}
