import test from "node:test";
import assert from "node:assert/strict";
import { CommandBus, isValidCommand, PRIORITY, presence, say, card, memory as memCmd } from "../commands.mjs";
import { acceptKey, encodeFrame, createFrameParser, WsServer } from "../ws.mjs";
import { createBrainServer } from "../server.mjs";
import { SessionMemory } from "../memory.mjs";
import { InitiativeEngine } from "../engine.mjs";
import { loadPersonality } from "../personality.mjs";

/* ---------- command bus ---------- */

test("a command carries the full envelope from the vocabulary", () => {
  const bus = new CommandBus({ now: () => 42 });
  const cmd = bus.make("say", { text: "hm.", style: "dry" });
  assert.equal(cmd.v, 1);
  assert.equal(cmd.type, "say");
  assert.equal(cmd.priority, PRIORITY.say);
  assert.equal(cmd.interrupt, "soft");
  assert.equal(cmd.ts, 42);
  assert.ok(cmd.ttl > 0);
  assert.ok(cmd.id.startsWith("say-"));
});

test("emit sequences commands and notifies listeners", () => {
  const bus = new CommandBus({ now: () => 1 });
  const seen = [];
  bus.onCommand((c) => seen.push(c));
  const sent = bus.emit([presence("watching"), say("hello")]);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].seq, 1);
  assert.equal(sent[1].seq, 2);
  assert.equal(seen.length, 2);
  assert.equal(bus.snapshot().seq, 2);
});

test("a broken listener cannot break the brain", () => {
  const bus = new CommandBus({ now: () => 1 });
  bus.onCommand(() => {
    throw new Error("boom");
  });
  assert.doesNotThrow(() => bus.emit(say("hi")));
});

test("unknown command types are rejected loudly", () => {
  const bus = new CommandBus();
  assert.throws(() => bus.make("teleport", {}), /unknown command type/);
});

test("interrupt classes follow the vocabulary", () => {
  const bus = new CommandBus();
  assert.equal(bus.make("card", { title: "x" }).interrupt, "hard");
  assert.equal(bus.make("presence", { mode: "idle" }).interrupt, "none");
  assert.equal(bus.make("express", { emotion: "pleased" }).interrupt, "soft");
});

test("memory commands can carry the recap moments", () => {
  const cmd = memCmd("since-left", "2 moments", { moments: [{ label: "dave subbed", ago: "4 min ago" }] });
  const bus = new CommandBus();
  const [sent] = bus.emit(cmd);
  assert.equal(sent.payload.moments.length, 1);
  assert.equal(sent.payload.kind, "since-left");
});

test("isValidCommand rejects malformed envelopes", () => {
  assert.equal(isValidCommand(null), false);
  assert.equal(isValidCommand({ v: 2, type: "say", payload: {}, priority: 1, interrupt: "soft" }), false);
  assert.equal(isValidCommand({ v: 1, type: "nope", payload: {}, priority: 1, interrupt: "soft" }), false);
  assert.equal(isValidCommand({ v: 1, type: "say", payload: null, priority: 1, interrupt: "soft" }), false);
  assert.equal(isValidCommand({ v: 1, type: "say", payload: {}, priority: 1, interrupt: "soft" }), true);
});

/* ---------- websocket plumbing ---------- */

test("the handshake key matches the RFC 6455 example", () => {
  assert.equal(acceptKey("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
});

test("frames encode with the right length header at every size", () => {
  const small = encodeFrame("hi");
  assert.equal(small[0], 0x81);
  assert.equal(small[1], 2);
  const medium = encodeFrame("x".repeat(300));
  assert.equal(medium[1], 126);
  assert.equal(medium.readUInt16BE(2), 300);
  const large = encodeFrame("x".repeat(70000));
  assert.equal(large[1], 127);
});

function clientFrame(text, opcode = 0x1, fin = true) {
  const data = Buffer.from(text, "utf8");
  const mask = Buffer.from([1, 2, 3, 4]);
  const header = Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | data.length]);
  const masked = Buffer.from(data);
  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}

test("the parser reads a masked text frame", () => {
  const got = [];
  const feed = createFrameParser({ onText: (t) => got.push(t) });
  feed(clientFrame('{"hello":1}'));
  assert.deepEqual(got, ['{"hello":1}']);
});

test("the parser reassembles a fragmented message and splits two in one chunk", () => {
  const got = [];
  const feed = createFrameParser({ onText: (t) => got.push(t) });
  feed(Buffer.concat([clientFrame("ab", 0x1, false), clientFrame("cd", 0x0, true)]));
  assert.deepEqual(got, ["abcd"]);
  feed(Buffer.concat([clientFrame("one"), clientFrame("two")]));
  assert.deepEqual(got, ["abcd", "one", "two"]);
});

test("the parser reports pings so the server can pong", () => {
  let pinged = false;
  const feed = createFrameParser({ onPing: () => (pinged = true) });
  feed(clientFrame("", 0x9));
  assert.ok(pinged);
});

/* ---------- server: real HTTP + real websocket ---------- */

async function withServer(fn) {
  const memory = new SessionMemory();
  const bus = new CommandBus();
  const personality = loadPersonality();
  const engine = new InitiativeEngine({ memory, personality, bus, log: () => {}, now: () => Date.now() });
  const server = createBrainServer({
    engine,
    memory,
    bus,
    personality,
    demo: true,
    log: () => {},
    getStatus: () => ({ mode: "demo", twitch: { state: "synthetic" } }),
  });
  await server.listen(0);
  try {
    return await fn({ server, engine, memory, bus });
  } finally {
    await server.close();
  }
}

test("the overlay route is served with its renderer and Crid's body", async () => {
  await withServer(async ({ server }) => {
    const overlay = await fetch(`${server.url}/overlay`);
    assert.equal(overlay.status, 200);
    const html = await overlay.text();
    assert.match(html, /overlay\.js/);

    const js = await fetch(`${server.url}/overlay.js`);
    assert.equal(js.status, 200);
    assert.match(await js.text(), /createCridBot/);

    const bot = await fetch(`${server.url}/desk-assets/crid-bot.js`);
    assert.equal(bot.status, 200, "the existing crid-bot.js is served, not rewritten");

    const sprite = await fetch(`${server.url}/desk-assets/crid/body-0-r7.png`);
    assert.equal(sprite.status, 200, "his sprites resolve from the page's relative paths");

    const css = await fetch(`${server.url}/overlay.css`);
    assert.equal(css.status, 200);
  });
});

test("health and state expose the brain's memory", async () => {
  await withServer(async ({ server, engine }) => {
    engine.handleEvent({ id: "e1", type: "chat", ts: Date.now(), user: "dave", text: "hi" });
    const health = await (await fetch(`${server.url}/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.memory.counters.messages, 1);
    const state = await (await fetch(`${server.url}/state`)).json();
    assert.equal(state.status.mode, "demo");
    assert.ok(state.personality.buckets.length > 0);
  });
});

test("the status page is served", async () => {
  await withServer(async ({ server }) => {
    const res = await fetch(`${server.url}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Crid — brain/);
  });
});

test("path traversal out of desk-assets is refused", async () => {
  await withServer(async ({ server }) => {
    const res = await fetch(`${server.url}/desk-assets/../../package.json`);
    assert.notEqual(res.status, 200);
  });
});

test("a websocket client gets a snapshot, then live commands", async () => {
  await withServer(async ({ server, engine }) => {
    const ws = new WebSocket(`${server.url.replace("http", "ws")}/ws`);
    const frames = [];
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no frames received")), 4000);
      ws.addEventListener("message", (ev) => {
        frames.push(JSON.parse(ev.data));
        if (frames.some((f) => f.frame === "command")) {
          clearTimeout(timer);
          resolve();
        }
      });
      ws.addEventListener("error", reject);
    });
    await new Promise((resolve) => ws.addEventListener("open", resolve));
    const snapshot = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no snapshot")), 4000);
      const tick = setInterval(() => {
        const s = frames.find((f) => f.frame === "snapshot");
        if (s) {
          clearInterval(tick);
          clearTimeout(timer);
          resolve(s);
        }
      }, 20);
    });
    assert.equal(snapshot.frame, "snapshot", "snapshot arrives on connect");
    assert.equal(snapshot.state.presence, "watching");
    engine.handleEvent({ id: "e", type: "sub", ts: Date.now(), user: "dave", months: 2 });
    await done;
    const commands = frames.filter((f) => f.frame === "command").map((f) => f.command);
    for (const c of commands) assert.ok(isValidCommand(c));
    assert.equal(commands[0].type, "card", "the sub card is the first thing on screen");
    ws.close();
  });
});

test("a reload mid-stream gets the current state, not an empty page", async () => {
  await withServer(async ({ server, bus }) => {
    bus.emit(presence("hype"));
    const ws = new WebSocket(`${server.url.replace("http", "ws")}/ws`);
    const frame = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no snapshot")), 4000);
      ws.addEventListener("message", (ev) => {
        clearTimeout(timer);
        resolve(JSON.parse(ev.data));
      });
    });
    assert.equal(frame.state.presence, "hype", "the brain remembers what the page forgot");
    ws.close();
  });
});
