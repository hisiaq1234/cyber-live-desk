import { test } from "node:test";
import assert from "node:assert/strict";
import { createCridAudioSync } from "../public/desk-assets/crid-audio.js";

class FakeAudio {
  paused = true;
  muted = false;
  src = "";
  playCalls = 0;
  pauseCalls = 0;
  loadCalls = 0;
  listeners = new Map();

  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeAttribute(name) { if (name === "src") this.src = ""; }
  load() { this.loadCalls++; }
  pause() { this.pauseCalls++; this.paused = true; }
  play() {
    this.playCalls++;
    this.paused = false;
    return Promise.resolve();
  }
  end() {
    this.paused = true;
    this.listeners.get("ended")?.();
  }
}

const segment = (overrides = {}) => ({
  audioUrl: "https://cdn.example.com/segment.mp3",
  audioPlaying: true,
  audioMuted: false,
  ...overrides,
});

test("CRID audio loads and plays once, then applies mute without restarting", async () => {
  const audio = new FakeAudio();
  const sync = createCridAudioSync(audio);

  sync(segment());
  await Promise.resolve();
  sync(segment({ audioMuted: true }));

  assert.equal(audio.src, "https://cdn.example.com/segment.mp3");
  assert.equal(audio.playCalls, 1);
  assert.equal(audio.muted, true);
});

test("pause, resume, and source changes stay synchronized", async () => {
  const audio = new FakeAudio();
  const sync = createCridAudioSync(audio);

  sync(segment());
  await Promise.resolve();
  sync(segment({ audioPlaying: false }));
  assert.equal(audio.paused, true);

  sync(segment({ audioUrl: "https://cdn.example.com/next.mp3" }));
  await Promise.resolve();
  assert.equal(audio.src, "https://cdn.example.com/next.mp3");
  assert.equal(audio.playCalls, 2);
});

test("closing a segment pauses and clears its audio source", () => {
  const audio = new FakeAudio();
  const sync = createCridAudioSync(audio);

  sync(segment());
  sync(null);

  assert.equal(audio.paused, true);
  assert.equal(audio.src, "");
});

test("ended audio does not restart on unrelated state updates but can be replayed", async () => {
  const audio = new FakeAudio();
  const sync = createCridAudioSync(audio);

  sync(segment());
  await Promise.resolve();
  audio.end();
  sync(segment({ audioMuted: true }));
  assert.equal(audio.playCalls, 1);

  sync(segment({ audioPlaying: false }));
  sync(segment());
  await Promise.resolve();
  assert.equal(audio.playCalls, 2);
});

test("autoplay rejection is caught and reported", async () => {
  const audio = new FakeAudio();
  audio.play = () => Promise.reject(new Error("NotAllowedError"));
  const errors = [];
  const sync = createCridAudioSync(audio, (error) => errors.push(error));

  sync(segment());
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /NotAllowedError/);
});
