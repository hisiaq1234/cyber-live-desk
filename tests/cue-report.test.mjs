// The desk reporting back: the brain mints a cue, the page performs it, and the page says how it
// ended — once, for a stamp the desk really issued, into a ledger the brain reads on its next tick.
//
// The break these guard: the brain used to close every activity on a timer, so it never knew whether
// CRID finished the gesture it asked for or the page had been reloaded underneath him. The risk of
// the fix is the opposite one — a report that turns one finished cue into two, a made-up stamp
// driving the brain's record, or an activity that can only be closed by a report and so leaves him
// stuck mid-gesture forever when the message is dropped.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CUE_OUTCOMES,
  HttpError,
  readCueLedger,
  reportCue,
  runAction,
} from "../api/_desk-core.mjs";
import { BRAIN_KEY, runBrainTick } from "../api/brain-tick.mjs";
import desk, { CUE_REPORT_PATH } from "../api/desk.mjs";
import { createCueReporter } from "../public/desk-assets/cue.mjs";
import { cueWindow, openActivity, settleActivity } from "../brain/activity.mjs";

const NOW = Date.parse("2026-11-12T12:00:00Z");
const FIVE_MIN = 300_000;

const makeStore = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return {
    async get(key, opts) {
      const v = m.get(key);
      if (v == null) return null;
      return opts?.type === "json" ? JSON.parse(v) : v;
    },
    async setJSON(key, value) {
      m.set(key, JSON.stringify(value));
    },
    read: (key) => (m.has(key) ? JSON.parse(m.get(key)) : null),
  };
};

// A session that has already been running five minutes with an empty room: the state a real desk is
// in when the brain is the one who should say something.
const quietSession = (startedAt) => ({
  v: 1,
  savedAt: startedAt,
  activity: null,
  memory: {
    startedAt,
    chat: [],
    moments: [],
    actions: [],
    notable: [],
    seen: [],
    topics: [],
    counters: { messages: 0, subs: 0, gifts: 0, bits: 0, raids: 0, actions: 0 },
    lastChatTs: 0,
    lastActionTs: 0,
    momentSeq: 0,
  },
  engine: { lastFired: [], ruleFires: [], lastActionAt: 0, actionTimes: [] },
  micro: { nextAt: 0, fires: [], lastAt: [], lastEmotion: null, chatCount: 0, lastMomentId: null, last: null },
});

test("a report for a stamp the desk issued is accepted, and only the first one counts", async () => {
  const store = makeStore();
  const posted = await runAction(store, { action: "bot-cue", name: "wave" }, NOW);
  const at = posted.state.bot.cue.at;

  const first = await reportCue(store, { at, outcome: "done" }, NOW + 500);
  assert.deepEqual([first.ok, first.ignored, first.outcome], [true, false, "done"]);

  // A second tab, a reload, or a page that re-sends: the same stamp is not a second finished cue.
  const again = await reportCue(store, { at, outcome: "aborted" }, NOW + 600);
  assert.deepEqual([again.ok, again.ignored], [true, true]);

  const ledger = await readCueLedger(store);
  assert.equal(ledger.reports.length, 1, "one stamp, one report");
  assert.equal(ledger.reports[0].outcome, "done", "the first report is the one that stands");
});

test("a stamp the desk never issued is refused, and so is anything but the three outcomes", async () => {
  const store = makeStore();
  await runAction(store, { action: "bot-cue", name: "nod" }, NOW);

  await assert.rejects(
    () => reportCue(store, { at: 999_999, outcome: "done" }, NOW),
    (err) => err instanceof HttpError && err.status === 409,
    "an invented stamp must not reach the brain",
  );
  const posted = await runAction(store, { action: "bot-cue", name: "nod" }, NOW + 1);
  for (const outcome of ["finished", "", null]) {
    await assert.rejects(
      () => reportCue(store, { at: posted.state.bot.cue.at, outcome }, NOW + 2),
      (err) => err instanceof HttpError && err.status === 422,
    );
  }
  assert.deepEqual((await readCueLedger(store)).reports, [], "a refused report writes nothing");
});

test("the endpoint cannot be used as a fast channel: reports are rate-limited", async () => {
  const store = makeStore();
  const stamps = [];
  for (let i = 0; i < 21; i++) {
    stamps.push((await runAction(store, { action: "bot-cue", name: "blink" }, NOW + i)).state.bot.cue.at);
  }
  for (const at of stamps.slice(0, 20)) {
    assert.equal((await reportCue(store, { at, outcome: "done" }, NOW + 1000)).ignored, false);
  }
  await assert.rejects(
    () => reportCue(store, { at: stamps[20], outcome: "done" }, NOW + 1000),
    (err) => err instanceof HttpError && err.status === 429,
    "the window is a ceiling, not a suggestion",
  );
});

test("the brain confirms an activity when the desk reports it, and does not reopen it later", async () => {
  const store = makeStore({ [BRAIN_KEY]: JSON.stringify(quietSession(NOW - FIVE_MIN)) });
  const first = await runBrainTick({ store, now: () => NOW });
  assert.ok(first.cue, "the tick must post a cue for there to be an activity to confirm");
  assert.equal(first.activity.stamp, first.cue.at);
  assert.equal(first.activity.confirmed, false, "a fresh activity is not confirmed by itself");
  assert.equal(first.activity.outcome, null, "and it is still open");

  const reported = await reportCue(store, { at: first.activity.stamp, outcome: "done" }, NOW + 1000);
  assert.equal(reported.ignored, false);

  const second = await runBrainTick({ store, now: () => NOW + 2000 });
  assert.equal(second.cue, null, "nothing else was due, so the tick is only settling the last activity");
  assert.equal(second.activity.stamp, first.activity.stamp);
  assert.equal(second.activity.outcome, "done");
  assert.equal(second.activity.confirmed, true, "the desk's own report is what confirms it");

  // And it is carried in the session, so a cold invocation still knows what he just finished.
  assert.equal(store.read(BRAIN_KEY).activity.confirmed, true);
});

test("with no report the timer closes the activity and says it is unconfirmed", async () => {
  const store = makeStore({ [BRAIN_KEY]: JSON.stringify(quietSession(NOW - FIVE_MIN)) });
  const first = await runBrainTick({ store, now: () => NOW });
  assert.ok(first.activity);

  // The page was reloaded mid-gesture: nothing ever arrives.
  const later = NOW + cueWindow(first.activity.name, first.cue.text) + 1;
  const second = await runBrainTick({ store, now: () => later });
  assert.equal(second.activity.stamp, first.activity.stamp);
  assert.equal(second.activity.outcome, "unconfirmed");
  assert.equal(second.activity.confirmed, false);
  assert.ok(second.activity.endedAt >= second.activity.startedAt, "a closed activity has an end");
});

test("the page reports once per stamp, never invents an outcome, and never throws on a bad post", async () => {
  const calls = [];
  const reporter = createCueReporter({
    token: "t",
    fetchFn: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  assert.equal(reporter.on, true);
  await reporter.report(7, "done");
  await reporter.report(7, "aborted");
  await reporter.report(8, "exploded");
  await reporter.report("nonsense", "done");
  assert.deepEqual(calls.map((c) => c.body), [{ at: 7, outcome: "done" }]);
  assert.equal(CUE_OUTCOMES.length, 3);

  const broken = createCueReporter({ token: "t", fetchFn: async () => { throw new Error("offline"); } });
  assert.equal(await broken.report(9, "done"), null, "a dropped report is not an error on air");

  const off = createCueReporter({ token: "" });
  assert.equal(off.on, false, "no token, no reporting — exactly like the cue channel being off");
  assert.equal(await off.report(9, "done"), null);
});

test("an activity that is replaced by a newer cue closes unconfirmed, not silently open", () => {
  const a = openActivity({ name: "wave", at: 1 }, NOW);
  assert.equal(settleActivity(a, { now: NOW + 100 }).outcome, null, "inside its window it is still open");
  const confirmed = settleActivity(a, { reports: [{ at: 1, outcome: "aborted", reportedAt: NOW + 50 }], now: NOW + 60 });
  assert.deepEqual([confirmed.outcome, confirmed.confirmed], ["aborted", true]);
  assert.equal(settleActivity(confirmed, { reports: [{ at: 1, outcome: "done", reportedAt: NOW + 90 }], now: NOW + 99 }).outcome, "aborted",
    "a closed activity is never reopened by a late report");
});

test("the desk page carries the report it may make, and the route turns a stranger away", async () => {
  const saved = process.env.DESK_OPERATOR_TOKEN;
  process.env.DESK_OPERATOR_TOKEN = "cue-report-test-token";
  try {
    const html = await (await desk.fetch(new Request("https://cyber-live-desk.vercel.app/desk"))).text();
    assert.match(html, /window\.__DESK_CUE_REPORT__=\{.*"url":"\/api\/desk\/cue-report"/, "the page must know where to report");
    assert.match(html, /"token":"cue-report-test-token"/, "and carry the token the endpoint asks for");

    // Nothing else on the page is given this token, so the only thing it buys is a cue report.
    const stranger = await desk.fetch(new Request(`https://cyber-live-desk.vercel.app${CUE_REPORT_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ at: 1, outcome: "done" }),
    }));
    assert.equal(stranger.status, 401, "a report without the operator token is refused before anything is read");
  } finally {
    if (saved === undefined) delete process.env.DESK_OPERATOR_TOKEN;
    else process.env.DESK_OPERATOR_TOKEN = saved;
  }
});
