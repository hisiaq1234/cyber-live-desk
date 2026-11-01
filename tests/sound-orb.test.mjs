import test from "node:test";
import assert from "node:assert/strict";
import { createSoundOrbSync } from "../public/desk-assets/sound-orb.js";

class FakeAudio {
  constructor() { this.paused = true; this.muted = false; this.volume = 1; this.ended = false; this.listeners = new Map(); }
  addEventListener(name, fn) { const set = this.listeners.get(name) || new Set(); set.add(fn); this.listeners.set(name, set); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  emit(name) { for (const fn of this.listeners.get(name) || []) fn(); }
}
class FakeOrb {
  constructor() { this.active = false; this.classList = { toggle: (name, state) => { if (name === "is-active") this.active = Boolean(state); } }; }
}

function setup() {
  const audio = new FakeAudio();
  const orb = new FakeOrb();
  const dispose = createSoundOrbSync(audio, orb);
  return { audio, orb, dispose };
}

test("orb stays compact at rest and expands only after playback starts", () => {
  const { audio, orb } = setup();
  assert.equal(orb.active, false);
  audio.paused = false;
  audio.emit("playing");
  assert.equal(orb.active, true);
});

test("mute and zero volume return the orb to its compact state", () => {
  const { audio, orb } = setup();
  audio.paused = false;
  audio.emit("playing");
  audio.muted = true;
  audio.emit("volumechange");
  assert.equal(orb.active, false);
  audio.muted = false;
  audio.volume = 0;
  audio.emit("volumechange");
  assert.equal(orb.active, false);
});

test("waiting, pause, and ended events stop the active animation", () => {
  const { audio, orb } = setup();
  audio.paused = false;
  audio.emit("playing");
  audio.emit("waiting");
  assert.equal(orb.active, false);
  audio.emit("playing");
  audio.emit("pause");
  assert.equal(orb.active, false);
  audio.paused = false;
  audio.ended = true;
  audio.emit("playing");
  assert.equal(orb.active, false);
});

test("dispose removes listeners and resets the orb", () => {
  const { audio, orb, dispose } = setup();
  audio.paused = false;
  audio.emit("playing");
  assert.equal(orb.active, true);
  dispose();
  assert.equal(orb.active, false);
  audio.emit("playing");
  assert.equal(orb.active, false);
});
