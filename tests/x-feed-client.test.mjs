// The client half of the X feed: the part that turns a failed request into words an operator
// can act on. Before this, the overlay called the endpoint inside `if (r.ok)` with an empty
// catch, so a dead feed looked exactly like an empty one and nothing was reported anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { readXFeedResponse, requestXFeed, xFeedFailureMessage, xFeedUrl } from "../public/desk-assets/x-feed-client.js";

const overlay = readFileSync(new URL("../public/desk-assets/overlay.js", import.meta.url), "utf8");
const control = readFileSync(new URL("../public/desk-assets/control.js", import.meta.url), "utf8");

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("a good response comes back as the feed", async () => {
  const result = await readXFeedResponse(jsonResponse({ mode: "trends", trends: [{ name: "#Lagos", tweetCount: 3 }] }));
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.deepEqual(result.feed.trends, [{ name: "#Lagos", tweetCount: 3 }]);
});

test("a 502 carries the desk status and what X said, not a generic failure", async () => {
  const result = await readXFeedResponse(jsonResponse({ error: "X API 401", upstreamStatus: 401, detail: "Unauthorized" }, 502));
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.equal(result.error, "X feed failed (HTTP 502): X API 401 — Unauthorized");
  // The operator needs the upstream status too, or "401" and "502" get confused with each other.
  assert.ok(result.error.includes("HTTP 502"));
  assert.ok(result.error.includes("401"));
  assert.ok(result.error.includes("Unauthorized"));
});

test("a 503 configuration error is reported with its own status", async () => {
  const result = await readXFeedResponse(
    jsonResponse({ error: "X is not configured on the server: set X_BEARER_TOKEN, or all four of X_CONSUMER_KEY, ..." }, 503)
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /^X feed failed \(HTTP 503\): X is not configured/);
});

test("a non-JSON error body still produces a readable message", async () => {
  const result = await readXFeedResponse(new Response("<html>gateway error</html>", { status: 504 }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 504);
  assert.match(result.error, /HTTP 504/);
  assert.match(result.error, /gateway error/);
});

test("a 200 that still carries an error field is a failure, not a feed", async () => {
  const result = await readXFeedResponse(jsonResponse({ error: "rate limited" }));
  assert.equal(result.ok, false);
  assert.match(result.error, /rate limited/);
});

test("an empty body on a 200 is reported rather than rendered", async () => {
  const result = await readXFeedResponse(new Response("", { status: 200 }));
  assert.equal(result.ok, false);
  assert.match(result.error, /HTTP 200/);
});

test("a network failure never throws, it reports", async () => {
  const result = await requestXFeed(async () => { throw new TypeError("Failed to fetch"); }, { mode: "trends" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 0);
  assert.match(result.error, /^X feed request failed: Failed to fetch/);
});

test("requestXFeed asks the documented path and passes mode and userId", async () => {
  let requested = "";
  const result = await requestXFeed(async (url) => {
    requested = url;
    return jsonResponse({ mode: "following", tweets: [] });
  }, { mode: "following", userId: "12345" });
  assert.equal(result.ok, true);
  assert.equal(requested, "/api/x/feed?mode=following&userId=12345");
  assert.equal(xFeedUrl({ mode: "trends" }), "/api/x/feed?mode=trends");
  assert.equal(xFeedUrl({}), "/api/x/feed?mode=trends");
});

test("xFeedFailureMessage stays honest when there is nothing to report", () => {
  assert.equal(xFeedFailureMessage({ status: 502 }), "X feed failed (HTTP 502).");
  assert.equal(xFeedFailureMessage({}), "X feed request failed.");
});

test("the overlay surfaces a failed feed and keeps polling instead of swallowing it", () => {
  assert.ok(overlay.includes('import { requestXFeed } from "./x-feed-client.js";'));
  assert.ok(overlay.includes("const result = await requestXFeed(globalThis.fetch"), "the overlay uses the shared client");
  assert.ok(overlay.includes("renderXproblem(result.error)"), "a failure is rendered on the jumbotron");
  assert.ok(overlay.includes('h("span", "x-kind", "Unavailable")'), "the panel says the feed is unavailable");
  // The old silent path: a bare `if (r.ok)` with a catch that discarded everything.
  assert.ok(!/if \(r\.ok\) renderXjumbotron/.test(overlay), "the if (r.ok) shortcut is gone");
  assert.ok(!/catch \{ \}/.test(overlay), "the empty catch is gone");
  // A failure used to leave the timer unarmed, so one bad response ended the feed for the stream.
  const failureBranch = overlay.slice(overlay.indexOf("renderXproblem(result.error)"));
  assert.match(failureBranch.slice(0, 400), /xTimer = setTimeout\(fetchXfeed, xJPollMs\)/);
});

test("the controller shows the feed status where the operator is looking", () => {
  assert.ok(control.includes('import { requestXFeed } from "./x-feed-client.js";'));
  assert.ok(control.includes("const checkXFeed = async"), "the controller can probe the feed itself");
  assert.ok(control.includes("xFeedStatus"), "the result is shown in the live panel");
  assert.ok(control.includes('toast(result.error, true)'), "a distinct failure also raises a toast");
  assert.ok(control.includes('void checkXFeed({ force: true })'), "turning X mode on checks the feed immediately");
  assert.ok(control.includes('if (state?.mode === "x-following") void checkXFeed();'), "it keeps checking while X mode is on");
});
