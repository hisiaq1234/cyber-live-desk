// CYBER LIVE DESK — one place that turns an X feed response into either a feed or a message
// an operator can read.
//
// Both /desk (overlay.js) and /control (control.js) use this, so a dead feed is reported with
// the same words in both places. Before this existed the overlay wrapped the call in
// `if (r.ok)` with an empty catch: switching to X mode on air showed nothing at all, and the
// operator had no way to tell an empty timeline from a 502.
//
// No DOM here, so tests can drive it with plain Response objects.

export const X_FEED_PATH = "/api/x/feed";

const clean = (value, max = 240) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function xFeedUrl({ mode = "trends", userId = "", max = 0 } = {}) {
  const params = new URLSearchParams({ mode: mode || "trends" });
  if (userId) params.set("userId", userId);
  if (max) params.set("max", String(max));
  return `${X_FEED_PATH}?${params}`;
}

// "X feed failed (HTTP 502): X API 401 — Unauthorized"
// The status is the desk function's own status; the rest is what the function said the upstream
// answered, which is the part the operator needs.
export function xFeedFailureMessage({ status = 0, error = "", detail = "" } = {}) {
  const head = status ? `X feed failed (HTTP ${status})` : "X feed request failed";
  const said = clean(error);
  const more = clean(detail);
  const parts = [];
  if (said && !said.includes(`HTTP ${status}`)) parts.push(said);
  if (more && more !== said) parts.push(more);
  return parts.length ? `${head}: ${parts.join(" — ")}` : `${head}.`;
}

// Never throws: a network error, a non-JSON body and an HTTP failure all come back as
// { ok: false, status, error }. Callers only have to check .ok.
export async function readXFeedResponse(response) {
  const status = Number(response?.status) || 0;
  let raw = "";
  try {
    raw = await response.text();
  } catch {
    raw = "";
  }
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response?.ok) {
    return {
      ok: false,
      status,
      error: xFeedFailureMessage({ status, error: body?.error, detail: body?.detail || body?.title || raw }),
    };
  }
  if (!body || typeof body !== "object") {
    return { ok: false, status, error: xFeedFailureMessage({ status, error: "the response was empty or not JSON" }) };
  }
  // A 200 that still carries an error field is a failure, not a feed.
  if (body.error) {
    return { ok: false, status, error: xFeedFailureMessage({ status, error: body.error, detail: body.detail }) };
  }
  return { ok: true, status, feed: body };
}

export async function requestXFeed(fetchFn = globalThis.fetch, options = {}) {
  const url = xFeedUrl(options);
  let response;
  try {
    response = await fetchFn(url, { cache: "no-store" });
  } catch (err) {
    const reason = err?.message || String(err || "");
    return { ok: false, status: 0, error: xFeedFailureMessage({ status: 0, error: reason || "the request did not complete" }) };
  }
  return readXFeedResponse(response);
}
