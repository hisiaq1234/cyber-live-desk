import { test } from "node:test";
import assert from "node:assert/strict";

import { createSpeechTap } from "../public/desk-assets/speech-tap.mjs";

const fakeCtx = (data) => {
  const calls = { resumed: 0 };
  return {
    calls,
    sampleRate: 48000,
    state: "running",
    destination: {},
    resume() { calls.resumed++; return Promise.resolve(); },
    close() { return Promise.resolve(); },
    createMediaElementSource() {
      return { connect(node) { node._src = true; return node; } };
    },
    createBiquadFilter() {
      return { type: "", frequency: { value: 0 }, connect(node) { node._f = true; return node; } };
    },
    createAnalyser() {
      return {
        fftSize: 2048,
        frequencyBinCount: 1024,
        smoothingTimeConstant: 0,
        getByteFrequencyData(arr) { arr.set(data); },
        connect(node) { return node; },
      };
    },
  };
};

const fakeEl = () => ({
  src: "", crossOrigin: "", preload: "",
  play() { this.playing = true; return Promise.resolve(); },
  pause() { this.playing = false; },
  load() {}, removeAttribute() { this.src = ""; },
});

const silent = new Uint8Array(1024);
const loud = new Uint8Array(1024).fill(200);

test("level is 0 with no audio state", () => {
  const tap = createSpeechTap({ createAudioEl: fakeEl, createContext: () => fakeCtx(silent), now: () => 100 });
  assert.equal(tap.level(), 0);
});

test("sync mirrors url/play state onto the tap element and builds the graph lazily", () => {
  const el = fakeEl();
  const ctx = fakeCtx(silent);
  const tap = createSpeechTap({ createAudioEl: () => el, createContext: () => ctx });
  tap.sync({ audioUrl: "https://cdn.example/voice.mp3", audioPlaying: true });
  assert.equal(el.src, "https://cdn.example/voice.mp3");
  assert.equal(el.crossOrigin, "anonymous");
  assert.equal(el.playing, true);
  assert.equal(ctx.calls.resumed, 1, "context resume attempted on play");
  tap.sync({ audioUrl: "https://cdn.example/voice.mp3", audioPlaying: false });
  assert.equal(el.playing, false, "paused when playback stops");
  tap.sync({ audioUrl: "", audioPlaying: false });
  tap.dispose();
});

test("speech band energy drives the envelope; level leads by ~30 ms", () => {
  let data = silent;
  const ctx = fakeCtx(silent);
  // Patch analyser to read the live `data` reference.
  const origCreate = ctx.createAnalyser.bind(ctx);
  ctx.createAnalyser = () => { const a = origCreate(); a.getByteFrequencyData = (arr) => arr.set(data); return a; };
  let t = 0;
  const tap = createSpeechTap({ createAudioEl: fakeEl, createContext: () => ctx, now: () => t });
  tap.sync({ audioUrl: "https://x/v.mp3", audioPlaying: true });
  // Silent for a second, then loud.
  for (let i = 0; i < 60; i++) { t += 1 / 60; tap.level(); }
  assert.ok(tap.level() < .1, "silent feed stays near zero");
  data = loud;
  for (let i = 0; i < 30; i++) { t += 1 / 60; tap.level(); }
  const nowLevel = tap.level();
  assert.ok(nowLevel > .3, `loud speech opens the mouth (${nowLevel.toFixed(2)})`);
  // The returned level lags the live envelope by ~leadS: it should still be
  // climbing, not at peak — mouth leads, it does not teleport.
  assert.ok(nowLevel < .95, "envelope ramps rather than snapping");
  data = silent;
  for (let i = 0; i < 60; i++) { t += 1 / 60; tap.level(); }
  assert.ok(tap.level() < .2, "envelope releases after silence");
  tap.dispose();
});

test("analyser failure degrades to zero, never throws", () => {
  const ctx = fakeCtx(silent);
  ctx.createAnalyser = () => { throw new Error("no analyser"); };
  const tap = createSpeechTap({ createAudioEl: fakeEl, createContext: () => ctx });
  tap.sync({ audioUrl: "https://x/v.mp3", audioPlaying: true });
  assert.equal(tap.level(), 0);
  tap.dispose();
});
