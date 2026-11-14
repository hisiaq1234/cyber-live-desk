// The sound orb is decoration, not a meter: it lights when the desk's audio
// element is actually playing, and goes dark the moment it stops. No mic, no
// FFT — playback state only, so it can never claim sound that is not there.
const STOP_EVENTS = ["pause", "ended", "emptied", "abort", "waiting", "stalled"];

// Drive the decorative overlay orb from actual media playback state, not microphone input.
export function createSoundOrbSync(audio, orb) {
  let playbackStarted = false;
  const sync = () => {
    const audible = playbackStarted && !audio.paused && !audio.muted && audio.volume > 0 && !audio.ended;
    orb.classList.toggle("is-active", audible);
  };
  const onPlaying = () => { playbackStarted = true; sync(); };
  const onStopped = () => { playbackStarted = false; sync(); };
  const onVolumeChange = () => {
    playbackStarted = !audio.paused && !audio.muted && audio.volume > 0 && !audio.ended;
    sync();
  };

  audio.addEventListener("playing", onPlaying);
  STOP_EVENTS.forEach((event) => audio.addEventListener(event, onStopped));
  audio.addEventListener("volumechange", onVolumeChange);
  sync();

  return () => {
    audio.removeEventListener("playing", onPlaying);
    STOP_EVENTS.forEach((event) => audio.removeEventListener(event, onStopped));
    audio.removeEventListener("volumechange", onVolumeChange);
    playbackStarted = false;
    sync();
  };
}
