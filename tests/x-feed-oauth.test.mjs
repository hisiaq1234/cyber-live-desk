// OAuth 1.0a signing for the X feed.
//
// The project provisions four OAuth 1.0a values and no bearer token, so this signature is the
// only thing standing between the desk and a dead feed. The first test is Twitter's own published
// worked example, which pins the signature byte for byte; the rest pin the parts a refactor could
// silently break (encoding, parameter sorting, nonce/timestamp injection, which auth path wins).
import { test } from "node:test";
import assert from "node:assert/strict";

import xFeed, {
  X_API,
  hasOAuth1,
  hasXCredentials,
  oauth1Header,
  rfc3986,
  signatureBaseString,
  xFetch,
  XApiError,
} from "../api/x-feed.mjs";

// https://developer.x.com/en/docs/authentication/oauth-1-0a/creating-a-signature
const DOC_ENV = {
  X_CONSUMER_KEY: "xvz1evFS4wEEPTGEFPHBog",
  X_CONSUMER_SECRET: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
  X_ACCESS_TOKEN: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
  X_ACCESS_TOKEN_SECRET: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
};

const DOC_CALL = {
  method: "POST",
  url: "https://api.twitter.com/1.1/statuses/update.json?include_entities=true",
  env: DOC_ENV,
  nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
  timestamp: 1318622958,
  bodyParams: { status: "Hello Ladies + Gentlemen, a signed OAuth request!" },
};

test("the signature matches X's published OAuth 1.0a worked example", () => {
  const { signature } = oauth1Header(DOC_CALL);
  assert.equal(signature, "hCtSmYh+iHYCEqBWrE7C7hYmtUk=");
});

test("the signature base string is the documented one, parameters sorted and encoded", () => {
  const { baseString } = oauth1Header(DOC_CALL);
  assert.equal(
    baseString,
    "POST&https%3A%2F%2Fapi.twitter.com%2F1.1%2Fstatuses%2Fupdate.json&" +
      "include_entities%3Dtrue%26oauth_consumer_key%3Dxvz1evFS4wEEPTGEFPHBog%26" +
      "oauth_nonce%3DkYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg%26" +
      "oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D1318622958%26" +
      "oauth_token%3D370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb%26" +
      "oauth_version%3D1.0%26status%3DHello%2520Ladies%2520%252B%2520Gentlemen%252C%2520a%2520signed%2520OAuth%2520request%2521"
  );
});

test("rfc3986 encoding escapes what encodeURIComponent leaves alone", () => {
  assert.equal(rfc3986("Ladies + Gentlemen"), "Ladies%20%2B%20Gentlemen");
  assert.equal(rfc3986("!*'()"), "%21%2A%27%28%29");
  assert.equal(rfc3986("An encoded string!"), "An%20encoded%20string%21");
  assert.equal(rfc3986("a/b?c=d&e"), "a%2Fb%3Fc%3Dd%26e");
});

test("the header carries every oauth parameter, encoded and quoted", () => {
  const { header } = oauth1Header(DOC_CALL);
  assert.match(header, /^OAuth /);
  for (const name of [
    "oauth_consumer_key",
    "oauth_nonce",
    "oauth_signature",
    "oauth_signature_method",
    "oauth_timestamp",
    "oauth_token",
    "oauth_version",
  ]) {
    assert.ok(header.includes(`${name}="`), `${name} is missing from the header`);
  }
  // The signature is base64 and must be percent-encoded inside the header.
  assert.ok(header.includes('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"'));
  assert.ok(header.includes('oauth_signature_method="HMAC-SHA1"'));
  assert.ok(!header.includes("Bearer"));
});

test("signing is pure: the same nonce and timestamp give the same header", () => {
  const url = `${X_API}/2/trends/by/woeid/23424908?max_trends=10`;
  const first = oauth1Header({ url, env: DOC_ENV, nonce: "fixed-nonce", timestamp: 1700000000 });
  const second = oauth1Header({ url, env: DOC_ENV, nonce: "fixed-nonce", timestamp: 1700000000 });
  assert.equal(first.signature, second.signature);
  assert.equal(first.header, second.header);
  // A different nonce must change the signature, or the nonce is not really in the base string.
  const other = oauth1Header({ url, env: DOC_ENV, nonce: "other-nonce", timestamp: 1700000000 });
  assert.notEqual(first.signature, other.signature);
});

test("query parameters are signed, not just the oauth ones", () => {
  const withQuery = signatureBaseString({
    method: "GET",
    url: "https://api.twitter.com/2/trends/by/woeid/1?max_trends=5",
    params: { oauth_nonce: "n" },
  });
  const withoutQuery = signatureBaseString({
    method: "GET",
    url: "https://api.twitter.com/2/trends/by/woeid/1",
    params: { oauth_nonce: "n" },
  });
  assert.notEqual(withQuery, withoutQuery);
  assert.ok(withQuery.includes("max_trends%3D5"));
});

test("the v2 host is one consistent value across the module", () => {
  assert.equal(X_API, "https://api.twitter.com");
});

test("xFetch signs with OAuth 1.0a when only the four OAuth values are configured", async () => {
  let seen = null;
  const body = await xFetch("/2/trends/by/woeid/23424908", {
    env: DOC_ENV,
    now: 1700000000 * 1000,
    nonce: "fixed-nonce",
    fetchFn: async (url, init) => {
      seen = { url, init };
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });
  assert.deepEqual(body, { data: [] });
  assert.equal(new URL(seen.url).origin, "https://api.twitter.com");
  assert.match(seen.init.headers.Authorization, /^OAuth /);
  assert.ok(!seen.init.headers.Authorization.includes("Bearer"));
  assert.ok(seen.init.headers.Authorization.includes('oauth_timestamp="1700000000"'));
  assert.ok(seen.init.headers.Authorization.includes('oauth_nonce="fixed-nonce"'));
});

test("a bearer token is preferred when the project has one", async () => {
  let seen = null;
  await xFetch("/2/trends/by/woeid/23424908", {
    env: { ...DOC_ENV, X_BEARER_TOKEN: "app-only-token" },
    fetchFn: async (url, init) => {
      seen = init;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });
  assert.equal(seen.headers.Authorization, "Bearer app-only-token");
});

test("an upstream failure keeps X's status and words instead of a bare 502", async () => {
  await assert.rejects(
    xFetch("/2/trends/by/woeid/23424908", {
      env: DOC_ENV,
      fetchFn: async () => new Response(JSON.stringify({ title: "Unauthorized", detail: "Unauthorized", status: 401 }), { status: 401 }),
    }),
    (err) => {
      assert.ok(err instanceof XApiError);
      assert.equal(err.upstreamStatus, 401);
      assert.equal(err.detail, "Unauthorized");
      assert.match(err.message, /X API 401: Unauthorized/);
      return true;
    }
  );
});

test("hasXCredentials needs a bearer token or all four OAuth values", () => {
  assert.equal(hasXCredentials({}), false);
  assert.equal(hasXCredentials({ X_ACCESS_TOKEN: "looks-like-a-token" }), false, "one value alone never authenticated anything");
  assert.equal(hasXCredentials(DOC_ENV), true);
  assert.equal(hasXCredentials({ X_BEARER_TOKEN: "app-only-token" }), true);
  assert.equal(hasOAuth1({ ...DOC_ENV, X_ACCESS_TOKEN_SECRET: "" }), false);
});

// The handler is what production calls; these prove the JSON an operator reads carries the reason.
const vercelReq = (url) => ({ url, method: "GET", headers: new Headers({ host: "cyber-live-desk.vercel.app" }) });

const withEnv = async (patch, fn) => {
  const names = ["X_BEARER_TOKEN", "X_CONSUMER_KEY", "X_CONSUMER_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  for (const [name, value] of Object.entries(patch)) process.env[name] = value;
  const savedFetch = globalThis.fetch;
  try {
    return await fn((fnStub) => { globalThis.fetch = fnStub; });
  } finally {
    globalThis.fetch = savedFetch;
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
};

test("the handler answers 502 with the upstream status and X's own words", async () => {
  await withEnv(DOC_ENV, async (setFetch) => {
    setFetch(async () => new Response(JSON.stringify({ title: "Unauthorized", detail: "Unauthorized", status: 401 }), { status: 401 }));
    const res = await xFeed.fetch(vercelReq("/api/x/feed?mode=trends&woeid=23424908"));
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, "X API 401");
    assert.equal(body.upstreamStatus, 401);
    assert.equal(body.detail, "Unauthorized");
  });
});

test("the handler answers 503 and names the missing variables when X is unconfigured", async () => {
  await withEnv({}, async (setFetch) => {
    setFetch(async () => { throw new Error("must not run"); });
    const res = await xFeed.fetch(vercelReq("/api/x/feed?mode=trends&woeid=23424908"));
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /X_BEARER_TOKEN/);
    assert.match(body.error, /X_CONSUMER_KEY/);
  });
});

test("the handler signs a real trends call and returns trends", async () => {
  await withEnv(DOC_ENV, async (setFetch) => {
    let authorization = "";
    let requestedUrl = "";
    setFetch(async (url, init) => {
      authorization = init.headers.Authorization;
      requestedUrl = url;
      // v1.1 shape: a one-element array with a trends list under it.
      return new Response(JSON.stringify([{ trends: [{ name: "#Lagos", tweet_volume: 12000 }], locations: [{ name: "Nigeria", woeid: 1398823 }] }]), { status: 200 });
    });
    const res = await xFeed.fetch(vercelReq("/api/x/feed?mode=trends&woeid=1398823"));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.trends, [{ name: "#Lagos", tweetCount: 12000 }]);
    assert.match(authorization, /^OAuth /);
    // OAuth 1.0a is only accepted by the v1.1 trends endpoint; v2 answers 403 for it.
    assert.equal(new URL(requestedUrl).pathname, "/1.1/trends/place.json");
  });
});
