// YouTube video IDs and embed URLs — the two shapes the music desk accepts.
// Anything that is not a real 11-character video id returns null, so a bad
// paste dies here instead of loading a broken player on air.
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function isYouTubeVideoId(value) {
  return typeof value === "string" && VIDEO_ID_RE.test(value);
}

export function youtubeEmbedUrl(videoId, { autoplay = false, controls = true } = {}) {
  if (!isYouTubeVideoId(videoId)) return null;
  const params = new URLSearchParams({
    autoplay: autoplay ? "1" : "0",
    controls: controls ? "1" : "0",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
}
