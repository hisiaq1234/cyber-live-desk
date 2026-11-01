import { test } from "node:test";
import assert from "node:assert/strict";
import { HEADLINE_FEED_URL, HEADLINE_WINDOW_HOURS, fetchHeadlineFeed, parseHeadlineFeed } from "../api/_headlines.mjs";
import headlineApi from "../api/desk-headlines.mjs";
const handler = headlineApi.fetch;

const NOW = Date.parse("2026-11-01T12:00:00.000Z");
const item = (title, date, link = "https://news.google.com/rss/articles/example", publisher = "Example News") =>
  `<item><title>${title}</title><link>${link}</link><pubDate>${new Date(date).toUTCString()}</pubDate><source url="https://example.com">${publisher}</source></item>`;

test("Nigeria top-stories feed retains recent dated headlines and rejects stale, future, or unsafe entries", () => {
  const xml = `<rss><channel>${[
    item("Fresh &amp; important", NOW - 20 * 60_000),
    item("Still current", NOW - 11 * 3_600_000, "https://news.google.com/rss/articles/second", "Local Publisher"),
    item("Stale", NOW - 13 * 3_600_000),
    item("Future", NOW + 10 * 60_000),
    item("Unsafe", NOW - 5 * 60_000, "http://example.com/story"),
  ].join("")}</channel></rss>`;

  const headlines = parseHeadlineFeed(xml, { now: NOW });
  assert.equal(headlines.length, 2);
  assert.equal(headlines[0].title, "Fresh & important");
  assert.equal(headlines[0].publisher, "Example News");
  assert.equal(headlines[0].publishedAt, new Date(NOW - 20 * 60_000).toISOString());
  assert.match(headlines[0].url, /^https:\/\//);
  assert.equal(headlines[1].title, "Still current");
  assert.equal(HEADLINE_WINDOW_HOURS, 12);
});

test("automatic feed uses the public Nigeria RSS URL and returns timestamped items", async () => {
  let requestedUrl = "";
  let requestOptions;
  const result = await fetchHeadlineFeed({
    now: NOW,
    fetchFn: async (url, options) => {
      requestedUrl = url;
      requestOptions = options;
      return new Response(`<rss><channel>${item("Fresh story", NOW - 60_000)}</channel></rss>`, { status: 200 });
    },
  });
  assert.equal(requestedUrl, HEADLINE_FEED_URL);
  assert.equal(requestOptions.redirect, "follow");
  assert.equal(result.region, "Nigeria");
  assert.equal(result.fetchedAt, new Date(NOW).toISOString());
  assert.equal(result.headlines[0].title, "Fresh story");
});

test("headline API caches public GETs, reports upstream failure, and rejects other methods", async () => {
  const xml = `<rss><channel>${item("Fresh story", NOW - 60_000)}</channel></rss>`;
  const success = await handler(new Request("https://example.test/api/desk-headlines"), {
    now: NOW,
    fetchFn: async () => new Response(xml, { status: 200 }),
  });
  assert.equal(success.status, 200);
  assert.match(success.headers.get("cache-control"), /s-maxage=300/);
  assert.equal((await success.json()).headlines[0].title, "Fresh story");

  const failed = await handler(new Request("https://example.test/api/desk-headlines"), {
    now: NOW,
    fetchFn: async () => new Response("upstream unavailable", { status: 503 }),
  });
  assert.equal(failed.status, 503);
  assert.deepEqual((await failed.json()).headlines, []);

  let called = false;
  const head = await handler(new Request("https://example.test/api/desk-headlines", { method: "HEAD" }), {
    fetchFn: async () => { called = true; throw new Error("HEAD should not fetch"); },
  });
  assert.equal(head.status, 200);
  assert.equal(called, false);

  const wrongMethod = await handler(new Request("https://example.test/api/desk-headlines", { method: "POST" }));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "GET, HEAD");
});
