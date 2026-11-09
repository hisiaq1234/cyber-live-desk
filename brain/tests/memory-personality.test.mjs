import test from "node:test";
import assert from "node:assert/strict";
import { SessionMemory, tokenise, labelFor } from "../memory.mjs";
import { Personality, loadPersonality } from "../personality.mjs";

function fixedClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
}

/* ---------- memory ---------- */

test("chat is recorded with users and topics", () => {
  const mem = new SessionMemory({ now: () => 1 });
  mem.recordChat({ ts: 1, user: "Dave", text: "the boss is brutal" });
  assert.equal(mem.counters.messages, 1);
  assert.equal(mem.lastChat().user, "Dave");
  assert.equal(mem.user("dave").count, 1);
  assert.ok(mem.topics.has("boss"));
});

test("the chat ring is bounded", () => {
  const mem = new SessionMemory({ now: () => 1, maxChat: 3 });
  for (let i = 0; i < 10; i++) mem.recordChat({ ts: i, user: "u", text: `m${i}` });
  assert.equal(mem.chat.length, 3);
  assert.equal(mem.lastChat().text, "m9");
});

test("silence is measured from the last chat, not from the clock", () => {
  const clock = fixedClock();
  const mem = new SessionMemory({ now: clock.now });
  clock.advance(5000);
  assert.equal(mem.silenceMs(), 5000);
  mem.recordChat({ ts: clock.now(), user: "a", text: "hi" });
  clock.advance(30_000);
  assert.equal(mem.silenceMs(), 30_000);
});

test("quiet time also accounts for Crid's own last action", () => {
  const clock = fixedClock();
  const mem = new SessionMemory({ now: clock.now });
  mem.recordChat({ ts: clock.now(), user: "a", text: "hi" });
  clock.advance(10_000);
  mem.recordAction({ ts: clock.now(), rule: "x", why: "y" });
  clock.advance(5_000);
  assert.equal(mem.quietMs(), 5_000);
  assert.equal(mem.silenceMs(), 15_000);
});

test("notable events become moments with counters", () => {
  const mem = new SessionMemory({ now: () => 500 });
  const moment = mem.recordNotable({ ts: 500, type: "sub", user: "dave", months: 3, detail: "resub 3 months" });
  assert.equal(moment.kind, "sub");
  assert.match(moment.label, /dave/);
  assert.equal(mem.counters.subs, 1);
  assert.equal(mem.moments.length, 1);
  assert.equal(mem.lastAction(), null, "a moment is not an action");
});

test("moments can be queried by time window", () => {
  const mem = new SessionMemory({ now: () => 10_000 });
  mem.recordNotable({ ts: 1_000, type: "bits", user: "a", amount: 100 });
  mem.recordNotable({ ts: 9_000, type: "gift", user: "b", amount: 5 });
  assert.equal(mem.momentsIn(5_000, 10_000).length, 1);
  assert.equal(mem.momentsSince(0, 10_000).length, 2);
});

test("Crid's own actions are remembered with what he said", () => {
  const mem = new SessionMemory({ now: () => 1 });
  mem.recordAction({ ts: 1, rule: "sub", say: "dave. noted.", momentId: "m1" });
  mem.recordAction({ ts: 2, rule: "spike", say: "chat is moving." });
  assert.deepEqual(mem.recentSayings(5), ["dave. noted.", "chat is moving."]);
  assert.equal(mem.actionForMoment("m1").rule, "sub");
  assert.equal(mem.actionForMoment("m9"), null);
});

test("a repeated topic needs several distinct people", () => {
  const clock = fixedClock();
  const mem = new SessionMemory({ now: clock.now });
  mem.recordChat({ ts: clock.now(), user: "a", text: "the boss again" });
  mem.recordChat({ ts: clock.now(), user: "b", text: "boss is unfair" });
  assert.equal(mem.repeatedTopic({ minUsers: 3 }), null);
  mem.recordChat({ ts: clock.now(), user: "c", text: "boss phase two" });
  const topic = mem.repeatedTopic({ minUsers: 3 });
  assert.equal(topic.word, "boss");
  assert.equal(topic.users.length, 3);
});

test("topic detection ignores stale mentions", () => {
  const clock = fixedClock();
  const mem = new SessionMemory({ now: clock.now });
  for (const u of ["a", "b", "c"]) mem.recordChat({ ts: clock.now(), user: u, text: "boss" });
  clock.advance(200_000);
  assert.equal(mem.repeatedTopic({ windowMs: 90_000 }), null);
});

test("new vs returning viewers", () => {
  const clock = fixedClock();
  const mem = new SessionMemory({ now: clock.now });
  mem.recordChat({ ts: clock.now(), user: "dave", text: "one" });
  assert.ok(mem.isNewUser("dave"));
  clock.advance(60_000);
  mem.recordChat({ ts: clock.now(), user: "dave", text: "two" });
  assert.ok(!mem.isNewUser("dave"));
  assert.equal(mem.userGap("dave"), 0);
  assert.equal(mem.userGap("nobody"), Infinity);
});

test("ago() speaks in seconds and minutes", () => {
  const mem = new SessionMemory({ now: () => 100_000 });
  assert.equal(mem.ago(78_000), "22s ago");
  assert.equal(mem.ago(40_000), "a minute ago");
  assert.equal(mem.ago(100_000 - 300_000), "5 min ago");
});

test("the snapshot carries what the overlay needs after a reload", () => {
  const clock = fixedClock();
  const mem = new SessionMemory({ now: clock.now });
  mem.recordChat({ ts: clock.now(), user: "a", text: "hi" });
  mem.recordNotable({ ts: clock.now(), type: "sub", user: "dave", months: 2 });
  mem.recordAction({ ts: clock.now(), rule: "sub", say: "dave. noted." });
  clock.advance(10_000);
  const snap = mem.snapshot();
  assert.equal(snap.moments.length, 1);
  assert.equal(snap.moments[0].ago, "10s ago");
  assert.equal(snap.lastActions[0].rule, "sub");
  assert.equal(snap.counters.actions, 1);
});

test("tokenise drops stopwords and short words", () => {
  assert.deepEqual(tokenise("The boss is SO unfair lol"), ["boss", "unfair"]);
});

test("labelFor describes each notable event", () => {
  assert.match(labelFor({ type: "raid", user: "mira", viewers: 240 }), /mira raided with 240 viewers/);
  assert.match(labelFor({ type: "gift", user: "nova", amount: 5 }), /gifted 5 subs/);
});

/* ---------- personality ---------- */

test("the shipped personality file loads and describes itself", () => {
  const p = loadPersonality();
  const d = p.describe();
  assert.equal(d.name, "Crid");
  assert.ok(d.buckets.length >= 10, "has line buckets");
  assert.ok(d.opinions >= 3);
  assert.ok(d.catchphrases >= 3);
  assert.ok(d.keywords.length >= 5);
  assert.ok(d.never >= 3);
});

test("every line bucket the engine uses exists in the file", () => {
  const p = loadPersonality();
  for (const bucket of [
    "greet",
    "firstAfterSilence",
    "newViewer",
    "returning",
    "spike",
    "topic",
    "keyword",
    "silence",
    "musing",
    "callback",
    "recap",
    "sub",
    "gift",
    "bits",
    "raid",
  ]) {
    assert.ok(p.bucket(bucket).length > 0, `${bucket} has lines`);
  }
});

test("templates are slot-filled", () => {
  const p = loadPersonality();
  assert.equal(p.fill("{user} after {minutes}", { user: "dave", minutes: "4 min" }), "dave after 4 min");
  assert.equal(p.fill("no slots", {}), "no slots");
  assert.equal(p.fill("{missing} here", {}), " here");
});

test("the never list blocks out-of-character lines", () => {
  const p = loadPersonality();
  assert.equal(p.guard("please subscribe to my channel"), false);
  assert.equal(p.guard("as an ai, I cannot"), false);
  assert.equal(p.guard("rent is always due."), true);
  assert.equal(p.guard(""), false);
  assert.equal(p.guard("x".repeat(200)), false, "length cap");
});

test("a line is drawn from the file and avoids repeating itself", () => {
  const p = new Personality({
    name: "T",
    lines: { silence: ["a", "b", "c"] },
  });
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(p.line("silence", {}, { random: () => Math.random() }));
  assert.deepEqual([...seen].sort(), ["a", "b", "c"]);
  const avoided = p.line("silence", {}, { avoid: ["a", "b"], random: () => 0 });
  assert.equal(avoided, "c");
});

test("a bucket with no lines degrades to silence, not a crash", () => {
  const p = new Personality({ name: "T", lines: {} });
  assert.deepEqual(p.bucket("nothing"), []);
  assert.equal(p.line("nothing"), "");
});

test("keywords are matched from chat", () => {
  const p = loadPersonality();
  const hit = p.keywordFor("that lag is unreal");
  assert.ok(hit);
  assert.equal(hit.keyword, "lag");
  assert.ok(hit.lines.length > 0);
  assert.equal(p.keywordFor("what a lovely day"), null);
  assert.equal(p.keywordFor(""), null);
});

test("keyword lines respect the guard", () => {
  const p = new Personality({ keywords: [{ match: ["x"], lines: ["please subscribe"] }], never: ["please subscribe"], lines: {} });
  const hit = p.keywordFor("x");
  assert.equal(p.keywordLine(hit), "");
});

test("musing draws from opinions, jokes and catchphrases", () => {
  const p = new Personality({ opinions: ["op"], catchphrases: ["cp"], runningJokes: [{ id: "j", line: "joke" }], lines: {} });
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(p.musing({ random: () => Math.random() }));
  assert.deepEqual([...seen].sort(), ["cp", "joke", "op"]);
});
