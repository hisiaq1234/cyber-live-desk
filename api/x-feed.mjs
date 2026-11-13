// CYBER LIVE DESK — X feed proxy for the desk and private briefs.
// Credentials stay server-side. Trend requests are explicit and bounded.
// Routes:
//   GET /api/x/feed?mode=trends&woeid=23424908   Nigeria trends (default)
//   GET /api/x/feed?mode=following              home timeline (people the account follows)
//   GET /api/x/feed?mode=for-you                closest available: home timeline
//   GET /api/x/feed?mode=following&userId=123   bearer-token path only: that user's timeline
//
// Auth, in order of preference:
//   1. X_BEARER_TOKEN — an app-only bearer token, when the project has one. With a bearer
//      token the timeline modes use the v2 user-timeline endpoints and userId is required.
//   2. OAuth 1.0a user context, signed here with the four credentials the project
//      actually provisions: X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN,
//      X_ACCESS_TOKEN_SECRET. This used to be broken: the code sent X_ACCESS_TOKEN as
//      `Authorization: Bearer`, which is not a bearer token, so every call came back
//      "X API 401" and the feed was dead on air. v2 refuses OAuth 1.0a outright, so under
//      OAuth 1.0a every mode uses the v1.1 endpoints that accept it: trends/place.json
//      and statuses/home_timeline.json.
//
// The signing function is pure and takes the nonce and timestamp as arguments, so tests
// pin them and the signature is reproducible.

import crypto from "node:crypto";

import { requestUrl } from "./_http.mjs";

export const config = { runtime: "nodejs" };

// api.twitter.com and api.x.com both answer the v2 endpoints; the rest of this codebase
// already talks to api.twitter.com, so the desk uses that one everywhere instead of
// mixing the two hosts in one file.
export const X_API = "https://api.twitter.com";
const X_TIMEOUT_MS = 8000;
const MAX_DETAIL = 300;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const boundedInt = (value, fallback, min, max) => {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const text = (value, limit = MAX_DETAIL) =>
  String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);

// ---------- OAuth 1.0a (HMAC-SHA1) ----------

// RFC 3986 percent-encoding. encodeURIComponent leaves !'()* alone and OAuth 1.0a does not
// allow that: the signature is computed over the encoded form, so they must be escaped.
export const rfc3986 = (value) =>
  encodeURIComponent(String(value ?? "")).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export const oauthCredentials = (env = process.env) => ({
  consumerKey: String(env.X_CONSUMER_KEY ?? "").trim(),
  consumerSecret: String(env.X_CONSUMER_SECRET ?? "").trim(),
  accessToken: String(env.X_ACCESS_TOKEN ?? "").trim(),
  accessTokenSecret: String(env.X_ACCESS_TOKEN_SECRET ?? "").trim(),
});

export const bearerToken = (env = process.env) => String(env.X_BEARER_TOKEN ?? "").trim();

export const hasOAuth1 = (env = process.env) => Object.values(oauthCredentials(env)).every(Boolean);

// True when either auth path is usable, so callers can skip the call instead of collecting a
// configuration error (api/_brief.mjs used to test X_ACCESS_TOKEN alone, which proves nothing).
export const hasXCredentials = (env = process.env) => Boolean(bearerToken(env)) || hasOAuth1(env);

export const oauthNonce = () => crypto.randomBytes(16).toString("hex");

// Signature base string: METHOD & encoded(base url) & encoded(sorted, encoded parameters).
// Query parameters from the url and any body parameters are part of the signature; the
// oauth_signature itself is not. Params arrive already assembled so tests can pin them.
export function signatureBaseString({ method = "GET", url, params = {} }) {
  const target = new URL(url);
  const baseUrl = `${target.protocol}//${target.host.toLowerCase()}${target.pathname || "/"}`;
  const pairs = [];
  for (const [key, value] of target.searchParams) pairs.push([key, value]);
  for (const [key, value] of Object.entries(params)) pairs.push([key, String(value ?? "")]);
  const normalized = pairs
    .map(([key, value]) => [rfc3986(key), rfc3986(value)])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return `${String(method).toUpperCase()}&${rfc3986(baseUrl)}&${rfc3986(normalized)}`;
}

export const hmacSha1 = (key, base) => crypto.createHmac("sha1", key).update(base).digest("base64");

// Pure given (env, url, method, nonce, timestamp): same inputs, same header.
export function oauth1Header({
  method = "GET",
  url,
  env = process.env,
  nonce = oauthNonce(),
  timestamp = Math.floor(Date.now() / 1000),
  bodyParams = {},
} = {}) {
  const creds = oauthCredentials(env);
  const missing = [
    ["X_CONSUMER_KEY", creds.consumerKey],
    ["X_CONSUMER_SECRET", creds.consumerSecret],
    ["X_ACCESS_TOKEN", creds.accessToken],
    ["X_ACCESS_TOKEN_SECRET", creds.accessTokenSecret],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    const error = new Error(`X OAuth 1.0a credentials are incomplete: ${missing.join(", ")} is not set.`);
    error.code = "X_NOT_CONFIGURED";
    error.missing = missing;
    throw error;
  }

  const oauthParams = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: String(nonce),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(timestamp),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };
  const baseString = signatureBaseString({ method, url, params: { ...oauthParams, ...bodyParams } });
  const signingKey = `${rfc3986(creds.consumerSecret)}&${rfc3986(creds.accessTokenSecret)}`;
  const signature = hmacSha1(signingKey, baseString);
  const signed = { ...oauthParams, oauth_signature: signature };
  const header = "OAuth " + Object.keys(signed)
    .sort()
    .map((key) => `${rfc3986(key)}="${rfc3986(signed[key])}"`)
    .join(", ");
  return { header, signature, baseString, params: signed };
}

// ---------- transport ----------

const parseBody = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// X answers failures with {title, detail} (v2) or {errors:[{message}]} / {error}. Keep whatever
// it said, because the operator needs the reason, not just the status code.
const upstreamDetail = (body, raw, statusText) => {
  const errors = Array.isArray(body?.errors)
    ? body.errors.map((e) => text(e?.message || e?.detail || "")).filter(Boolean).join("; ")
    : "";
  return text(body?.detail || errors || body?.error || body?.title || raw || statusText || "");
};

export class XApiError extends Error {
  constructor(status, detail) {
    super(detail ? `X API ${status}: ${detail}` : `X API ${status}`);
    this.name = "XApiError";
    this.upstreamStatus = status;
    this.detail = detail || "";
  }
}

export async function xFetch(path, { env = process.env, fetchFn = globalThis.fetch, now = Date.now(), nonce } = {}) {
  const url = `${X_API}${path}`;
  const bearer = bearerToken(env);
  let authorization;
  if (bearer) {
    authorization = `Bearer ${bearer}`;
  } else if (hasOAuth1(env)) {
    authorization = oauth1Header({ method: "GET", url, env, nonce: nonce ?? oauthNonce(), timestamp: Math.floor(now / 1000) }).header;
  } else {
    const error = new Error(
      "X is not configured on the server: set X_BEARER_TOKEN, or all four of X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET."
    );
    error.code = "X_NOT_CONFIGURED";
    throw error;
  }

  const r = await fetchFn(url, {
    method: "GET",
    headers: { Authorization: authorization, Accept: "application/json" },
    signal: AbortSignal.timeout(X_TIMEOUT_MS),
    redirect: "follow",
  });
  const raw = await r.text().catch(() => "");
  const body = parseBody(raw);
  if (!r.ok) throw new XApiError(r.status, upstreamDetail(body, text(raw, MAX_DETAIL), r.statusText));
  if (!body) throw new XApiError(r.status, "X returned an empty or non-JSON body.");
  return body;
}

// ---------- feed shapes ----------

const trendFromV2 = (item) => {
  const name = String(item?.trend_name ?? item?.name ?? "").trim().slice(0, 160);
  if (!name) return [];
  const countValue = Number(item?.tweet_count);
  return [{ name, tweetCount: Number.isFinite(countValue) && countValue >= 0 ? countValue : null }];
};

const trendFromV1 = (item) => {
  const name = String(item?.name ?? "").trim().slice(0, 160);
  if (!name) return [];
  const countValue = Number(item?.tweet_volume);
  return [{ name, tweetCount: Number.isFinite(countValue) && countValue >= 0 ? countValue : null }];
};

export async function fetchXTrends({
  env = process.env,
  fetchFn = globalThis.fetch,
  woeid = "23424908",
  max = 10,
  now = Date.now(),
  nonce,
} = {}) {
  const id = String(woeid ?? "").trim();
  if (!/^\d{1,10}$/.test(id) || Number(id) <= 0) throw new Error("A valid positive X trends WOEID is required.");
  const count = boundedInt(max, 10, 1, 50);

  // v2 trends refuses OAuth 1.0a outright: "Authenticating with OAuth 1.0a User Context is forbidden
  // for this endpoint", HTTP 403. This project has the four OAuth 1.0a values and no bearer token, so
  // asking v2 is what kept the feed dead. v1.1 trends/place.json accepts OAuth 1.0a, so that is the
  // path used whenever there is no bearer token; v2 stays the path when one is configured.
  if (bearerToken(env)) {
    const params = new URLSearchParams({ max_trends: String(count), "trend.fields": "trend_name,tweet_count" });
    const data = await xFetch(`/2/trends/by/woeid/${id}?${params}`, { env, fetchFn, now, nonce });
    const trends = (Array.isArray(data?.data) ? data.data : []).slice(0, count).flatMap(trendFromV2);
    return { mode: "trends", woeid: id, updatedAt: now, trends };
  }

  const data = await xFetch(`/1.1/trends/place.json?id=${id}`, { env, fetchFn, now, nonce });
  const place = Array.isArray(data) ? data[0] : data?.data?.[0];
  const trends = (Array.isArray(place?.trends) ? place.trends : []).slice(0, count).flatMap(trendFromV1);
  return { mode: "trends", woeid: id, updatedAt: now, trends };
}

// v1.1 statuses, shaped like the v2 tweets the overlay already renders.
const tweetFromV1 = (t) => {
  const u = t?.user || {};
  return {
    id: String(t?.id_str ?? t?.id ?? ""),
    text: text(t?.full_text ?? t?.text ?? ""),
    author: text(u.name || t?.user?.screen_name || "", 80),
    handle: text(u.screen_name || "", 80),
    avatar: u.profile_image_url ? String(u.profile_image_url).replace(/^http:/, "https:") : null,
    createdAt: t?.created_at || null,
    metrics: {
      reply: null, // v1.1 timelines do not report a reply count
      repost: Number.isFinite(Number(t?.retweet_count)) ? Number(t.retweet_count) : 0,
      like: Number.isFinite(Number(t?.favorite_count)) ? Number(t.favorite_count) : 0,
    },
  };
};

// The home timeline is "the posts of the people this account follows" — exactly what the
// desk's following/for-you card means. v1.1 accepts OAuth 1.0a user context; the v2
// user-timeline endpoints do not, which is why this path exists at all. There is no v1.1
// equivalent of "a different user's timeline", so userId only applies on the bearer path.
export async function fetchXHomeTimeline({
  env = process.env,
  fetchFn = globalThis.fetch,
  max = 10,
  now = Date.now(),
  nonce,
} = {}) {
  const count = boundedInt(max, 10, 1, 200);
  const data = await xFetch(`/1.1/statuses/home_timeline.json?count=${count}&tweet_mode=extended`, { env, fetchFn, now, nonce });
  const tweets = (Array.isArray(data) ? data : []).slice(0, count).map(tweetFromV1);
  return { mode: "home", updatedAt: now, tweets };
}

// The handler turns a thrown error into the JSON the overlay and the operator both read.
// upstreamStatus and detail are kept separate from the human message so /control can show
// exactly what X said instead of a generic failure.
const errorResponse = (err) => {
  if (err?.code === "X_NOT_CONFIGURED") {
    return json({ error: err.message, hint: "X is not configured on the server." }, 503);
  }
  if (err?.upstreamStatus) {
    return json({ error: `X API ${err.upstreamStatus}`, upstreamStatus: err.upstreamStatus, detail: err.detail || "" }, 502);
  }
  return json({ error: err?.message || "X feed failed." }, 502);
};

const handler = async (req) => {
  const url = requestUrl(req);
  const mode = url.searchParams.get("mode") || "trends";
  const woeid = url.searchParams.get("woeid") || "23424908";
  const userId = url.searchParams.get("userId");
  const max = boundedInt(url.searchParams.get("max"), 10, 1, 100);

  try {
    if (mode === "trends") {
      return json(await fetchXTrends({ woeid, max }));
    }

    if (mode === "following" || mode === "for-you") {
      // With no bearer token the project only has OAuth 1.0a, and the v2 user-timeline
      // endpoints refuse it. The v1.1 home timeline is the same feed under the auth the
      // project actually has, so userId is not needed on this path — it names the account
      // that signed the request, which is the one whose follows the desk wants.
      if (!bearerToken()) {
        const home = await fetchXHomeTimeline({ max });
        return json({ mode, userId: userId || null, updatedAt: home.updatedAt, tweets: home.tweets });
      }
      if (!userId) return json({ error: "userId is required for following / for-you" }, 422);
      // The v2 path is reverse_chronological with an underscore. It was spelled with a hyphen, which
      // X answers with a bare 404, so this mode could not have worked either.
      const data = await xFetch(
        `/2/users/${encodeURIComponent(userId)}/timelines/reverse_chronological?max_results=${Math.min(max, 100)}&expansions=author_id&user.fields=username,name,profile_image_url&tweet.fields=created_at,public_metrics`
      );
      const users = new Map(((data.includes && data.includes.users) || []).map((u) => [u.id, u]));
      const tweets = (data.data || []).slice(0, max).map((t) => {
        const u = users.get(t.author_id);
        const m = t.public_metrics || {};
        return {
          id: t.id,
          text: t.text,
          author: u ? u.name : t.author_id,
          handle: u ? u.username : "",
          avatar: u ? u.profile_image_url : null,
          createdAt: t.created_at,
          metrics: { reply: m.reply_count, repost: m.retweet_count, like: m.like_count },
        };
      });
      return json({ mode, userId, updatedAt: Date.now(), tweets });
    }

    return json({ error: `Unknown mode: ${mode}` }, 422);
  } catch (err) {
    return errorResponse(err);
  }
};

export default { fetch: handler };
