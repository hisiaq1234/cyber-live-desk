// Synchronize the public CRID audio element with server-owned segment state.
// Kept independent of the overlay DOM so source changes, playback, and teardown are testable.
export function createCridAudioSync(audio, onPlayError = () => {}) {
  let source = "";
  let desiredPlaying = false;
  let ended = false;
  let pending = false;
  let requestId = 0;

  audio.addEventListener("ended", () => {
    ended = true;
    pending = false;
  });

  return (crid) => {
    const url = typeof crid?.audioUrl === "string" ? crid.audioUrl.trim() : "";
    const wantsPlayback = Boolean(url && crid?.audioPlaying);

    if (url !== source) {
      requestId++;
      pending = false;
      ended = false;
      audio.pause();
      if (url) audio.src = url;
      else audio.removeAttribute("src");
      audio.load();
      source = url;
    }

    audio.muted = Boolean(crid?.audioMuted);

    if (!wantsPlayback) {
      if (desiredPlaying) ended = false;
      desiredPlaying = false;
      requestId++;
      pending = false;
      audio.pause();
      return;
    }

    if (!desiredPlaying) ended = false;
    desiredPlaying = true;
    if (ended || pending || !audio.paused) return;

    const attempt = ++requestId;
    pending = true;
    try {
      const result = audio.play();
      if (result && typeof result.then === "function") {
        result.then(() => {
          if (attempt === requestId) pending = false;
        }).catch((error) => {
          if (attempt !== requestId) return;
          pending = false;
          onPlayError(error);
        });
      } else {
        pending = false;
      }
    } catch (error) {
      if (attempt === requestId) {
        pending = false;
        onPlayError(error);
      }
    }
  };
}
