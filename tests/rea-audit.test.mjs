// REA audit — the connection & invariant checker, proven end-to-end without a browser.
//
// The healthy case builds the whole graph the live brain owns: memory with viewers and
// economic moments, a voice heartbeat, world telemetry, a fresh being snapshot, one overlay
// client, and a settled activity. Every violation case then breaks exactly one wire and
// asserts the audit names it.

import test from "node:test";
import assert from "node:assert/strict";

import { auditReaConnections } from "../brain/rea-audit.mjs";
import { SessionMemory } from "../brain/memory.mjs";
import { CommandBus } from "../brain/commands.mjs";
import { InitiativeEngine } from "../brain/engine.mjs";
import { loadPersonality } from "../brain/personality.mjs";
import { createBrainServer } from "../brain/server.mjs";

const T0 = Date.UTC(2026, 10, 11, 12, 0, 0);

function harness({ start = T0 } = {}) {
  let t = start;
  const memory = new SessionMemory({ now: () => t });
  const bus = new CommandBus({ now: () => t });
  const engine = new InitiativeEngine({
    memory,
    personality: loadPersonality(),
    bus,
    now: () => t,
    log: () => {},
    random: () => 0,
  });
  return {
    engine, memory, bus,
    now: () => t,
    advance: (ms) => (t += ms),
    fire(type, extra = {}) {
      engine.handleEvent({ id: `e${t}-${type}`, type, ts: t, user: "someone", text: "", amount: 0, viewers: 0, ...extra });
    },
  };
}

// A fully-wired world: chat + every economic kind + owner voice + telemetry + fresh being.
function healthyWorld(h) {
  h.fire("chat", { user: "dave", text: "evening chat" });
  h.fire("sub", { user: "alice", months: 2 });
  h.fire("gift", { user: "bob", amount: 5 });
  h.fire("bits", { user: "carol", amount: 500 });
  h.fire("raid", { user: "dave", viewers: 40 });
  h.fire("voice", { text: "we are live", user: "owner" });
  h.fire("environment", { weather: "clear", tempC: 31, holiday: null });
  return {
    engine: h.engine,
    wsClients: 1,
    activities: [{ stamp: h.now() - 1000, name: "wave", outcome: "done", confirmed: true, startedAt: h.now() - 1200, endedAt: h.now() - 400 }],
    botSnapshot: {
      v: 1,
      savedAt: h.now() - 1000,
      drives: { energy: 80, boredom: 10, attention: 55 },
      floorX: 0.4,
      bag: { worn: true },
    },
    status: { mode: "demo", twitch: { state: "synthetic", channel: null }, channel: null },
    now: h.now,
  };
}

const codes = (report) => report.violations.map((v) => v.code);

test("a healthy REA graph audits clean", async () => {
  const h = harness();
  const report = await auditReaConnections(healthyWorld(h));
  assert.equal(report.ok, true, `expected no violations, got ${JSON.stringify(report.violations)}`);
  assert.deepEqual(report.violations, []);
  assert.equal(report.agents.crid.status, "online");
  assert.equal(report.agents.owner.status, "connected");
  assert.equal(report.agents.audience.viewersSeen, 4);
  assert.equal(report.agents.overlays.clients, 1);
  assert.equal(report.agents.world.clock.tz ?? report.agents.world.tz, "Africa/Lagos");
  assert.equal(report.events.reciprocity.economicMoments, 4);
  assert.equal(report.events.reciprocity.violations, 0);
  assert.equal(report.resources.leaderboard.ok, true);
  assert.equal(report.resources.leaderboard.roundTrip.ok, true);
  assert.equal(report.resources.backpack.status, "conserved");
  assert.equal(report.resources.cueVocabulary.ok, true);
});

test("an overlay client with cues settling unconfirmed is a violation", async () => {
  const h = harness();
  const args = healthyWorld(h);
  args.activities = [
    { stamp: h.now() - 5000, name: "wave", outcome: "unconfirmed", confirmed: false, startedAt: h.now() - 5200, endedAt: h.now() - 1000 },
  ];
  const report = await auditReaConnections(args);
  assert.equal(report.ok, false);
  assert.ok(codes(report).includes("cue-unconfirmed"), JSON.stringify(report.violations));
});

test("the same unconfirmed cue with no overlay connected is only history", async () => {
  const h = harness();
  const args = healthyWorld(h);
  args.wsClients = 0;
  args.activities = [
    { stamp: h.now() - 5000, name: "wave", outcome: "unconfirmed", confirmed: false, startedAt: h.now() - 5200, endedAt: h.now() - 1000 },
  ];
  const report = await auditReaConnections(args);
  assert.ok(!codes(report).includes("cue-unconfirmed"), JSON.stringify(report.violations));
});

test("a dropped backpack with missing coordinates violates conservation", async () => {
  const h = harness();
  const args = healthyWorld(h);
  args.botSnapshot = { ...args.botSnapshot, bag: { worn: false } };
  const report = await auditReaConnections(args);
  assert.equal(report.ok, false);
  assert.ok(codes(report).includes("bag-unphysical"), JSON.stringify(report.violations));
});

test("a dropped backpack outside the normalized floor also violates", async () => {
  const h = harness();
  const args = healthyWorld(h);
  args.botSnapshot = { ...args.botSnapshot, bag: { worn: false, x: 1.4, y: 0.5 } };
  const report = await auditReaConnections(args);
  assert.ok(codes(report).includes("bag-unphysical"), JSON.stringify(report.violations));
});

test("a worn backpack is conserved and out-of-range drives are not", async () => {
  const h = harness();
  const args = healthyWorld(h);
  args.botSnapshot = { ...args.botSnapshot, drives: { energy: 140, boredom: -2, attention: 50 } };
  const report = await auditReaConnections(args);
  assert.ok(codes(report).includes("drive-out-of-range"), JSON.stringify(report.violations));
});

test("leaderboard score corruption is caught in seen and on the board", async () => {
  const h = harness();
  h.fire("chat", { user: "dave", text: "hi" });
  const u = h.memory.user("dave");
  u.score = -5;
  const report = await auditReaConnections({
    engine: h.engine, wsClients: 0, activities: [],
    botSnapshot: { v: 1, savedAt: h.now(), drives: { energy: 50, boredom: 50, attention: 50 }, floorX: 0.5, bag: { worn: true } },
    now: h.now,
  });
  assert.ok(codes(report).includes("seen-negative-score"), JSON.stringify(report.violations));
});

test("an economic moment whose viewer lost their score is a dropped event", async () => {
  const h = harness();
  h.fire("sub", { user: "alice", months: 1 });
  h.memory.user("alice").score = 0;
  const report = await auditReaConnections({
    engine: h.engine, wsClients: 0, activities: [],
    botSnapshot: { v: 1, savedAt: h.now(), drives: { energy: 50, boredom: 50, attention: 50 }, floorX: 0.5, bag: { worn: true } },
    now: h.now,
  });
  assert.ok(codes(report).includes("economic-event-no-score"), JSON.stringify(report.violations));
});

test("cue vocabulary drift between renderer and API is a violation", async () => {
  const h = harness();
  const report = await auditReaConnections({
    engine: h.engine, wsClients: 0, activities: [],
    botSnapshot: { v: 1, savedAt: h.now(), drives: { energy: 50, boredom: 50, attention: 50 }, floorX: 0.5, bag: { worn: true } },
    now: h.now,
    cueContract: { cueNames: ["wave", "nod"], botCues: ["wave", "nod", "say"] },
  });
  assert.ok(codes(report).includes("cue-vocabulary-drift"), JSON.stringify(report.violations));
  assert.deepEqual(report.resources.cueVocabulary.onlyInApi, ["say"]);
});

test("/health/rea serves the audit over real HTTP", async () => {
  const h = harness();
  const memory = h.memory;
  const server = createBrainServer({
    engine: h.engine,
    memory,
    bus: h.bus,
    personality: loadPersonality(),
    demo: true,
    log: () => {},
    getStatus: () => ({ mode: "demo", twitch: { state: "synthetic" } }),
    getBeing: () => ({ v: 1, savedAt: Date.now(), drives: { energy: 70, boredom: 20, attention: 60 }, floorX: 0.5, bag: { worn: true } }),
    getActivities: () => [{ stamp: Date.now() - 500, name: "nod", outcome: "done", confirmed: true, startedAt: Date.now() - 700, endedAt: Date.now() - 100 }],
  });
  await server.listen(0);
  try {
    const res = await fetch(`${server.url}/health/rea`);
    assert.equal(res.status, 200, "the audit endpoint always answers 200 — ok lives in the body");
    const report = await res.json();
    assert.equal(typeof report.ok, "boolean");
    assert.ok(Array.isArray(report.violations));
    assert.ok(report.agents && report.events && report.resources);
    assert.equal(report.resources.cueVocabulary.ok, true, "the real CUE_NAMES/BOT_CUES contract must hold");
  } finally {
    await server.close();
  }
});
