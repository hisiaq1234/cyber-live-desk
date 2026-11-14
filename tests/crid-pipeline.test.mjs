import test from "node:test";
import assert from "node:assert/strict";
import { createGestureLayer } from "../public/desk-assets/gesture.mjs";
import { InitiativeEngine, REACTIVE_RULES, QUIET_RULES } from "../brain/engine.mjs";
import { SessionMemory } from "../brain/memory.mjs";
import { CommandBus, isValidCommand } from "../brain/commands.mjs";
import { loadPersonality } from "../brain/personality.mjs";

/* The batch kit's contracts, tested against the real modules — not the kit's
 * snippets. gesture.mjs lives at public/desk-assets/ (served path), the brain
 * side is brain/. */

/* ---------- gesture layer ---------- */

function step(layer, t, L = null, R = null, heft = 1, dt = 1 / 60) {
  return layer.update(dt, t, { L, R, heft });
}

test("gesture: a wave produces moving semantic output and hand deltas", () => {
  const g = createGestureLayer();
  let t = 0;
  let a, b;
  for (let i = 0; i < 90; i++) { t += 1 / 60; const o = step(g, t, null, "wave"); if (i === 20) a = o; if (i === 80) b = o; }
  assert.notDeepEqual(a.map, b.map, "wave channels change over time");
  assert.ok(b.w.R > 0.9, "right arm weight fades in");
  assert.ok(b.map.armLiftR > 0 && b.map.elbowR !== undefined, "wave drives arm channels");
});

test("gesture: outgoing program keeps animating while fading out", () => {
  const g = createGestureLayer();
  let t = 0;
  // hold wave until it is fully in
  for (let i = 0; i < 240; i++) { t += 1 / 60; step(g, t, null, "wave"); }
  // release: val -> null archives wave into prevVal
  const during = step(g, t + 0.05, null, null);
  assert.ok(during.w.R > 0 || during.w.L > 0, "weight still present right after release");
  // the archived wave keeps contributing: semantic output non-zero during fade
  assert.ok(Object.keys(during.map).length > 0 || during.any, "fade-out tail still emits channels");
  // and it does decay, not freeze
  let last = during;
  for (let i = 0; i < 300; i++) { t += 1 / 60; last = step(g, t, null, null); }
  assert.ok(last.w.R < 0.01 && last.w.L < 0.01, "tail fully decays to rest");
});

test("gesture: every SEQ arm name resolves to a real program or down", () => {
  const g = createGestureLayer();
  for (const name of ["down", "limp", "up", "wave", "slam", "push"]) {
    const out = step(g, 0.1, name, name);
    assert.equal(typeof out, "object");
    assert.ok(out.w.L >= 0 && out.w.R >= 0);
  }
});

/* ---------- brain: show-and-tell ---------- */

function harness({ timings = {}, start = Date.UTC(2024, 5, 15, 13) } = {}) {
  let t = start;
  const memory = new SessionMemory({ now: () => t });
  const bus = new CommandBus({ now: () => t });
  const engine = new InitiativeEngine({
    memory,
    personality: loadPersonality(),
    bus,
    now: () => t,
    log: () => {},
    timings,
    random: () => 0,
  });
  const emitted = [];
  bus.onCommand((c) => emitted.push(c));
  return {
    engine, memory, bus, emitted,
    now: () => t,
    advance: (ms) => (t += ms),
    chat(user, text) {
      engine.handleEvent({ id: `c${t}${user}`, type: "chat", ts: t, user, text, amount: 0 });
    },
  };
}

test("show-and-tell is a registered quiet rule with the kit's contract", () => {
  const rule = QUIET_RULES.find((r) => r.id === "show-and-tell");
  assert.ok(rule, "rule exists");
  assert.equal(rule.priority, 36);
  assert.equal(rule.cooldownMs, 420_000);
});

test("show-and-tell fires on a repeated topic after the musing lull", () => {
  const h = harness();
  // Two people push the same word inside five minutes, then the room goes quiet
  // past the musing threshold — exactly the moment the rule exists for.
  h.chat("ada", "that rocket launch was insane");
  h.chat("grace", "insane launch, honestly");
  h.advance(50_000); // > musingMs (45s), < topic window (5min)
  const winner = h.engine.tick();
  assert.ok(winner, "a quiet rule fired");
  assert.equal(winner.rule, "show-and-tell");
  const types = h.emitted.map((c) => c.type);
  assert.ok(types.includes("presence"), "he leans in");
  assert.ok(types.includes("gesture"), "showoff gesture commanded");
  assert.ok(types.includes("move"), "card dragged over");
  assert.ok(types.includes("say"), "he says the showAndTell line");
  const move = h.emitted.find((c) => c.type === "move");
  assert.equal(move.payload.target, "card");
  assert.equal(move.payload.to, "left");
  const gest = h.emitted.find((c) => c.type === "gesture");
  assert.equal(gest.payload.type, "showoff");
  for (const c of h.emitted) assert.ok(isValidCommand(c), `command valid: ${c.type}`);
});

test("show-and-tell stays silent when the room is still loud", () => {
  const h = harness();
  h.chat("ada", "insane launch");
  h.chat("grace", "insane launch");
  const winner = h.engine.tick(); // quietMs ~0 — nothing may fire
  assert.ok(!winner || winner.rule !== "show-and-tell", "no show-and-tell while chat is live");
});

test("show-and-tell does not outrank recap in the same lull", () => {
  const h = harness({ timings: { recapLullMs: 1 } });
  h.chat("ada", "insane launch");
  h.chat("grace", "insane launch");
  h.advance(50_000);
  // recap needs >=2 moments inside the lull to be eligible at all
  h.memory.addMoment({ kind: "test", label: "first thing" });
  h.memory.addMoment({ kind: "test", label: "second thing" });
  const winner = h.engine.tick();
  assert.ok(winner);
  assert.equal(winner.rule, "recap", "recap (42) outranks show-and-tell (36)");
});

/* ---------- memory: export/import roundtrip ---------- */

test("memory: exportState/importState roundtrips users and moments", () => {
  const m1 = new SessionMemory({ now: () => 1_000_000 });
  m1.recordChat({ id: "x", type: "chat", ts: 1_000_000, user: "ada", text: "hello", amount: 0 });
  const snap = m1.exportState(1_000_000);
  const m2 = new SessionMemory({ now: () => 2_000_000 });
  assert.equal(m2.importState(snap), true);
  assert.ok(m2.seen.has("ada"), "prior user restored");
  assert.equal(m2.importState({ v: 2, users: [] }), false, "wrong version rejected");
});
