/* Audio-reactive jaw + syllabic prosody driver for Crid 3D.
 * Supports live Web Audio API streams/elements AND fallback syllabic cadence
 * when speech is text-driven (bot.say). No dependencies.
 */
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

export function createVoiceJaw() {
  let ctx = null;
  let analyser = null;
  let bins = null;
  let env = 0;
  let roundEnv = 0;
  let accentEnv = 0;

  function ensureContext() {
    if (!ctx && typeof AudioContext !== "undefined") {
      ctx = new AudioContext();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.45;
      bins = new Uint8Array(analyser.frequencyBinCount);
    }
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    return analyser;
  }

  /** Attach a MediaStream (mic/OBS virtual cable) for live RMS lip-sync. */
  function attachStream(stream) {
    const an = ensureContext();
    if (!an || !stream) return false;
    const src = ctx.createMediaStreamSource(stream);
    src.connect(an);
    return true;
  }

  /** Attach an <audio> or <video> element (TTS playback) for live RMS lip-sync. */
  function attachElement(mediaEl) {
    const an = ensureContext();
    if (!an || !mediaEl) return false;
    const src = ctx.createMediaElementSource(mediaEl);
    src.connect(an);
    an.connect(ctx.destination);
    return true;
  }

  /** Sample live RMS energy in the human speech band (150Hz–3.5kHz). */
  function sampleLiveRms() {
    if (!analyser || !bins) return -1;
    analyser.getByteFrequencyData(bins);
    let sum = 0;
    const lo = 2;
    const hi = Math.min(bins.length, 38);
    for (let i = lo; i < hi; i++) {
      const v = bins[i] / 255;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / Math.max(1, hi - lo));
    return rms > 0.025 ? clamp((rms - 0.025) * 3.4, 0, 1) : 0;
  }

  /**
   * Step one frame. Returns { jaw, round, stretch, browAccent, headNod }
   * smoothed with asymmetric attack/release (fast open, natural close).
   */
  function update(dt, t, { talking = false, text = "" } = {}) {
    let targetJaw = 0;
    let targetRound = 0;

    const live = sampleLiveRms();
    if (live >= 0 && live > 0.01) {
      targetJaw = live;
      targetRound = Math.sin(t * 9.5) * 0.5 + 0.5;
    } else if (talking) {
      // Natural syllabic cadence (~4.6 syllables/sec with word-gap pauses)
      const wordPause = Math.sin(t * 2.1 + 0.7) > 0.78 ? 0.15 : 1.0;
      const syl = Math.max(0, Math.sin(t * 14.5) * 0.65 + Math.sin(t * 23.1 + 1.1) * 0.35);
      const emphasis = text && text.includes("!") ? 1.15 : 0.92;
      targetJaw = clamp(syl * wordPause * emphasis, 0, 0.95);
      targetRound = clamp(Math.cos(t * 8.3) * 0.5 + 0.5, 0, 1) * targetJaw;
    }

    // Fast attack (~35ms), softer release (~75ms) so consonants snap cleanly
    const rate = targetJaw > env ? 28 : 14;
    env += (targetJaw - env) * Math.min(1, dt * rate);
    roundEnv += (targetRound - roundEnv) * Math.min(1, dt * 16);
    accentEnv += (Math.max(0, env - 0.45) * 1.8 - accentEnv) * Math.min(1, dt * 10);

    return {
      jaw: env,
      round: roundEnv * 0.42,
      stretch: Math.max(0, env - roundEnv) * 0.35,
      browAccent: accentEnv * 0.28,
      headNod: accentEnv * 0.045,
    };
  }

  return { update, attachStream, attachElement };
}
