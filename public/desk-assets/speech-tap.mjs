/* SPEECH TAP — a real audio envelope for CRID's mouth, ported from LivLiv's
 * approach (src/runtime/speech.ts + voice.ts, Apache-2.0): band-limit to the
 * speech range, keep a smoothed envelope that opens fast and closes slow, and
 * read it ~30 ms in the past so the mouth leads the sound.
 *
 * Design constraint that shaped this: the desk's real audio element
 * (cridAudio in overlay.js) must NEVER be routed through WebAudio — a
 * cross-origin file without CORS headers would be silenced, and his voice is
 * on-air content. So this module analyses a *separate* hidden element playing
 * the same URL. If the CDN refuses CORS the analyser reads zeros and the face
 * falls back to its procedural rhythm — degradation, never breakage.
 *
 * Everything injectable: tests pass fake elements/contexts and a fake clock.
 */

const BAND = [140, 1600];       // speech presence band, Hz (LivLiv: ~150–1500)
const LEAD_S = .03;             // mouth leads audio ~30 ms (LivLiv speech.ts)
const CURVE = .8;               // pow(x,.8)*1.1 — opens easier than it closes

export function createSpeechTap({
  createAudioEl = null,         // () => HTMLAudioElement; default document
  createContext = null,         // () => AudioContext-like; default window
  now = () => (typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000),
  band = BAND,
  leadS = LEAD_S,
} = {}) {
  let el = null, ctx = null, analyser = null, bins = null, src = null, filters = [];
  let wantUrl = "", wantPlay = false, graphTried = false;
  let env = 0, speechSeen = -9, buf = [];

  const mkEl = () => {
    if (createAudioEl) return createAudioEl();
    const a = document.createElement("audio");
    a.preload = "auto"; a.hidden = true; a.setAttribute("aria-hidden", "true");
    return a;
  };
  const mkCtx = () => {
    if (createContext) return createContext();
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    return AC ? new AC() : null;
  };

  function ensureGraph() {
    if (graphTried) return !!analyser;
    graphTried = true;
    try {
      if (!el) { el = mkEl(); el.crossOrigin = "anonymous"; }
      ctx = mkCtx();
      if (!ctx || !ctx.createMediaElementSource) return false;
      src = ctx.createMediaElementSource(el);
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = band[0];
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = band[1];
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;   // we smooth ourselves, per frame
      src.connect(hp); hp.connect(lp); lp.connect(analyser);
      // Deliberately NOT connected to ctx.destination: this tap is analysis-only.
      bins = new Uint8Array(analyser.frequencyBinCount);
      return true;
    } catch { return false; }
  }

  /** Mirror the desk's audio state onto the tap element. Cheap to call every poll. */
  function sync(state) {
    const url = typeof state?.audioUrl === "string" ? state.audioUrl.trim() : "";
    const playing = Boolean(url && state?.audioPlaying);
    try {
      if (!el) { if (!url && !playing) return; el = mkEl(); el.crossOrigin = "anonymous"; }
      if (url !== wantUrl) { wantUrl = url; if (url) el.src = url; else el.removeAttribute("src"); el.load?.(); }
      if (playing !== wantPlay) {
        wantPlay = playing;
        if (playing) { ensureGraph(); const p = el.play?.(); p?.catch?.(() => {}); ctx?.resume?.().catch?.(() => {}); }
        else el.pause?.();
      }
    } catch { /* tap failure is silent by design */ }
  }

  /** 0..1 speech level, ~leadS in the past. 0 whenever there is nothing to hear. */
  function level() {
    const t = now();
    let raw = 0;
    try {
      if (analyser && wantPlay && ctx && ctx.state !== "closed") {
        analyser.getByteFrequencyData(bins);
        const sr = ctx.sampleRate || 48000, hz = sr / (analyser.fftSize || 2048);
        const i0 = Math.max(1, Math.floor(band[0] / hz)), i1 = Math.min(bins.length - 1, Math.ceil(band[1] / hz));
        let sum = 0;
        for (let i = i0; i <= i1; i++) sum += bins[i];
        raw = i1 > i0 ? sum / (i1 - i0) / 255 : 0;
      }
    } catch { raw = 0; }
    // LivLiv voice.ts curve: fast attack, slower release.
    const k = raw > env ? .5 : .12;
    env += (Math.min(1, Math.pow(raw, CURVE) * 1.1) - env) * Math.min(1, k * 8);
    if (env > .03) speechSeen = t;
    buf.push({ t, v: env });
    if (buf.length > 64) buf.shift();
    // Mouth leads: return the envelope from ~leadS ago.
    let pick = buf[buf.length - 1];
    for (const s of buf) { if (s.t <= t - leadS) pick = s; else break; }
    return pick ? pick.v : 0;
  }

  function dispose() {
    try { el?.pause?.(); } catch {}
    try { ctx?.close?.(); } catch {}
    el = ctx = analyser = src = null; bins = null; filters = [];
    wantUrl = ""; wantPlay = false; graphTried = false; env = 0; buf = [];
  }

  return { sync, level, dispose, get active() { return wantPlay; } };
}
