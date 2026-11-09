import test from "node:test";
import assert from "node:assert/strict";
import { parseIrcLine, normalise, tierLabel, createTwitchIrc } from "../twitch-irc.mjs";

test("parseIrcLine reads tags, prefix, command and trailing text", () => {
  const msg = parseIrcLine(
    "@badge-info=;bits=100;color=#1E90FF;display-name=Dave :dave!dave@dave.tmi.twitch.tv PRIVMSG #otolorin :hello there friend",
  );
  assert.equal(msg.command, "PRIVMSG");
  assert.equal(msg.tags["display-name"], "Dave");
  assert.equal(msg.tags.bits, "100");
  assert.equal(msg.prefix, "dave!dave@dave.tmi.twitch.tv");
  assert.deepEqual(msg.params, ["#otolorin", "hello there friend"]);
});

test("parseIrcLine unescapes tag values", () => {
  const msg = parseIrcLine("@display-name=Big\\sDave;x=a\\:b :u!u@u PRIVMSG #c :hi");
  assert.equal(msg.tags["display-name"], "Big Dave");
  assert.equal(msg.tags.x, "a;b", "backslash-colon is the IRC escape for a semicolon");
});

test("parseIrcLine handles PING and returns null for junk", () => {
  assert.equal(parseIrcLine("PING :tmi.twitch.tv").command, "PING");
  assert.equal(parseIrcLine(""), null);
});

test("normalise turns a PRIVMSG into a chat event", () => {
  const msg = parseIrcLine("@display-name=Dave :dave!dave@dave PRIVMSG #otolorin :yo");
  const [evt] = normalise(msg, { now: () => 1234 });
  assert.equal(evt.type, "chat");
  assert.equal(evt.user, "Dave");
  assert.equal(evt.text, "yo");
  assert.equal(evt.ts, 1234);
});

test("normalise treats a cheer as a bits event", () => {
  const msg = parseIrcLine("@display-name=Pixel;bits=500 :pixel!p@h PRIVMSG #c :cheer500 nice");
  const [evt] = normalise(msg);
  assert.equal(evt.type, "bits");
  assert.equal(evt.amount, 500);
  assert.match(evt.detail, /500 bits/);
});

test("normalise maps USERNOTICE resub to a sub event with months and streak", () => {
  const msg = parseIrcLine(
    "@msg-id=resub;msg-param-cumulative-months=12;msg-param-streak-months=4;msg-param-sub-plan=2000;display-name=Dave :tmi.twitch.tv USERNOTICE #c :still here",
  );
  const [evt] = normalise(msg);
  assert.equal(evt.type, "sub");
  assert.equal(evt.months, 12);
  assert.equal(evt.streak, 4);
  assert.equal(evt.tier, "2000");
  assert.match(evt.detail, /resub 12 months/);
});

test("normalise maps a mystery gift to a gift event with a count", () => {
  const msg = parseIrcLine("@msg-id=submysterygift;msg-param-mass-gift-count=5;display-name=Nova :tmi.twitch.tv USERNOTICE #c :gifted");
  const [evt] = normalise(msg);
  assert.equal(evt.type, "gift");
  assert.equal(evt.amount, 5);
  assert.match(evt.detail, /5 gifted subs/);
});

test("normalise maps a raid to viewers", () => {
  const msg = parseIrcLine("@msg-id=raid;msg-param-viewerCount=240;display-name=Mira :tmi.twitch.tv USERNOTICE #c :raid");
  const [evt] = normalise(msg);
  assert.equal(evt.type, "raid");
  assert.equal(evt.viewers, 240);
  assert.match(evt.detail, /240 viewers/);
});

test("normalise ignores messages it does not model", () => {
  const msg = parseIrcLine(":tmi.twitch.tv JOIN #c");
  assert.deepEqual(normalise(msg), []);
});

test("tierLabel maps plan codes", () => {
  assert.equal(tierLabel("1000"), "tier 1");
  assert.equal(tierLabel("3000"), "tier 3");
  assert.equal(tierLabel("Prime"), "tier 1");
});

/* A fake WebSocket so the client can be tested without a network. */
class FakeSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.listeners = {};
    FakeSocket.last = this;
  }
  addEventListener(name, fn) {
    (this.listeners[name] ||= []).push(fn);
  }
  emit(name, payload) {
    for (const fn of this.listeners[name] || []) fn(payload);
  }
  send(text) {
    this.sent.push(text);
  }
  close() {
    this.emit("close", { code: 1000 });
  }
}

test("the IRC client joins anonymously: NICK justinfan, no PASS", () => {
  const events = [];
  const client = createTwitchIrc({
    channel: "#Otolorin",
    onEvent: (e) => events.push(e),
    WebSocketImpl: FakeSocket,
    minBackoffMs: 10 ** 9,
    maxBackoffMs: 10 ** 9,
  });
  client.start();
  const sock = FakeSocket.last;
  assert.equal(sock.url, "wss://irc-ws.chat.twitch.tv:443");
  sock.emit("open");
  assert.ok(sock.sent.some((l) => /^NICK justinfan\d+$/.test(l)), "nick is anonymous");
  assert.ok(!sock.sent.some((l) => l.startsWith("PASS")), "no PASS is sent");
  assert.ok(sock.sent.includes("JOIN #otolorin"), "channel lowercased and joined");
  assert.ok(sock.sent.includes("CAP REQ :twitch.tv/tags twitch.tv/commands"));

  sock.emit("message", { data: "@display-name=Dave :dave!dave@dave PRIVMSG #otolorin :hello\r\n" });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "chat");
  assert.equal(events[0].user, "Dave");
  client.stop();
});

test("the IRC client answers PING and never throws on a bad line", () => {
  const client = createTwitchIrc({ channel: "c", WebSocketImpl: FakeSocket, minBackoffMs: 10 ** 9, maxBackoffMs: 10 ** 9 });
  client.start();
  const sock = FakeSocket.last;
  sock.emit("open");
  sock.emit("message", { data: "PING :tmi.twitch.tv\r\n" });
  assert.ok(sock.sent.some((l) => l.startsWith("PONG")), "PONG sent");
  assert.doesNotThrow(() => sock.emit("message", { data: "%%%%\r\n" }));
  client.stop();
});

test("a dead socket reconnects with backoff instead of crashing", () => {
  const states = [];
  let sockets = 0;
  class Counting extends FakeSocket {
    constructor(url) {
      super(url);
      sockets += 1;
    }
  }
  const client = createTwitchIrc({
    channel: "c",
    WebSocketImpl: Counting,
    onStatus: (s) => states.push(s.state),
    minBackoffMs: 5,
    maxBackoffMs: 20,
  });
  client.start();
  FakeSocket.last.emit("open");
  FakeSocket.last.emit("close", { code: 1006 });
  assert.ok(states.includes("disconnected"));
  client.stop();
  assert.ok(sockets >= 1);
});

test("a WebSocket implementation that throws on connect does not crash the process", () => {
  const states = [];
  const client = createTwitchIrc({
    channel: "c",
    WebSocketImpl: class {
      constructor() {
        throw new Error("boom");
      }
    },
    onStatus: (s) => states.push(s),
    minBackoffMs: 10 ** 9,
    maxBackoffMs: 10 ** 9,
  });
  assert.doesNotThrow(() => client.start());
  assert.equal(states.at(-1).state, "disconnected");
  assert.match(states.at(-1).detail, /boom/);
  client.stop();
});

test("no channel means a status error, not a crash", () => {
  const states = [];
  const client = createTwitchIrc({ channel: "", onStatus: (s) => states.push(s), WebSocketImpl: FakeSocket });
  client.start();
  assert.equal(states[0].state, "error");
  client.stop();
});
