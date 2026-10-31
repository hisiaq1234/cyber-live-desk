// CYBER LIVE DESK — Twitch EventSub webhook core.
// Official flow followed:
//   https://dev.twitch.tv/docs/eventsub/handling-webhook-events
//   https://dev.twitch.tv/docs/chat/send-receive-messages
//   https://dev.twitch.tv/docs/chat/authenticating
//
// The webhook only accepts signed Twitch requests, verifies the challenge while subscribing,
// and turns authorized channel.chat.message events into the same runAction calls the dashboard
// uses. Secrets and OAuth app credentials come from Netlify environment variables; no token or
// secret is ever sent to the browser. This module stays dependency-free so tests can exercise it
// with a plain in-memory Blob store.

import { createHmac, timingSafeEqual } from "node:crypto";

import { HttpError, readState, runAction } from "./_desk-core.mjs";
import {
  parseDeskCommand,
  parsePollSpec,
  parseAllowIds,
  commandBody,
  commandText,
} from "./_commands.mjs";

export { parseDeskCommand };

export const TWITCH_STATUS_KEY = "twitch-status";
export const TWITCH_SIGNATURE_TOLERANCE_MS = 10 * 60 * 1000;
export const TWITCH_EVENT_PATH = "/api/twitch/eventsub";

const SIGNATURE_PREFIX = "sha256=";

const allowedIds = (state, env) => [...new Set([
  ...(Array.isArray(state?.twitchAllowedUserIds) ? state.twitchAllowedUserIds : []),
  ...parseAllowIds(env?.TWITCH_ALLOWED_USER_IDS ?? ""),
].map(String).filter((id) => /^\d+$/.test(id)))];

// EventSub gives a stable numeric chatter id. The broadcaster is matched by that id, never by
// the display name, and allowlisted ids are explicit. A moderator badge is not enough.
export function twitchMayCommand(event, { broadcasterId = "", allowIds = [], enabled = false } = {}) {
  if (!enabled) return { ok: false, reason: "server chat control is off" };
  const id = String(event?.chatter_user_id ?? "").trim();
  if (!id) return { ok: false, reason: "no stable Twitch user id on the event" };
  if (broadcasterId && id === String(broadcasterId)) return { ok: true, as: "broadcaster" };
  if (allowIds.includes(id)) return { ok: true, as: "allowlist" };
  return { ok: false, reason: `${id} is not the broadcaster or on the allowlist` };
}

const header = (req, name) => req.headers.get(name) ?? "";

export function verifyTwitchSignature({ messageId, timestamp, signature, rawBody, secret, now = Date.now(), toleranceMs = TWITCH_SIGNATURE_TOLERANCE_MS }) {
  if (!secret || secret.length < 10) return { ok: false, status: 503, error: "TWITCH_WEBHOOK_SECRET is not configured." };
  if (!messageId || !timestamp || !signature) return { ok: false, status: 403, error: "Missing Twitch signature headers." };
  const sent = Date.parse(timestamp);
  if (!Number.isFinite(sent) || Math.abs(now - sent) > toleranceMs) {
    return { ok: false, status: 403, error: "Twitch signature timestamp is outside the replay window." };
  }
  const expected = SIGNATURE_PREFIX + createHmac("sha256", secret)
    .update(messageId + timestamp + rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 403, error: "Twitch signature does not match." };
  }
  return { ok: true };
}

export function twitchEnv(env = process.env) {
  const required = ["TWITCH_WEBHOOK_SECRET", "TWITCH_BROADCASTER_USER_ID"];
  const missing = required.filter((name) => !String(env?.[name] ?? "").trim());
  return {
    configured: missing.length === 0,
    missing,
    broadcasterId: String(env?.TWITCH_BROADCASTER_USER_ID ?? "").trim(),
    callbackUrl: String(env?.TWITCH_EVENTSUB_CALLBACK ?? "").trim() || null,
    appConfigured: Boolean(String(env?.TWITCH_CLIENT_ID ?? "").trim() && String(env?.TWITCH_CLIENT_SECRET ?? "").trim()),
    clipConfigured: Boolean(
      String(env?.TWITCH_CLIENT_ID ?? "").trim() &&
      String(env?.TWITCH_CLIP_ACCESS_TOKEN ?? "").trim() &&
      String(env?.TWITCH_BROADCASTER_USER_ID ?? "").trim()
    ),
    allowedEnvIds: parseAllowIds(env?.TWITCH_ALLOWED_USER_IDS ?? ""),
  };
}

export async function readTwitchStatus(store) {
  return (await store.get(TWITCH_STATUS_KEY, { type: "json" })) ?? {};
}

export async function writeTwitchStatus(store, patch, now = Date.now()) {
  const prev = await readTwitchStatus(store);
  const next = { ...prev, ...patch, updatedAt: now };
  await store.setJSON(TWITCH_STATUS_KEY, next);
  return next;
}

export async function twitchStatus(store, state, { env = process.env, origin = "" } = {}) {
  const cfg = twitchEnv(env);
  const status = await readTwitchStatus(store);
  const callbackUrl = cfg.callbackUrl || (origin ? origin.replace(/\/+$/, "") + TWITCH_EVENT_PATH : null);
  const verified = cfg.configured && Boolean(status.webhookVerifiedAt) && !status.revokedAt;
  const tested = verified && Boolean(status.lastCommandAt);
  return {
    configured: cfg.configured,
    missing: cfg.missing,
    appConfigured: cfg.appConfigured,
    clipConfigured: cfg.clipConfigured,
    callbackUrl,
    enabled: Boolean(state?.twitchChatEnabled),
    allowedUserIds: allowedIds(state, env),
    verifiedAt: status.webhookVerifiedAt ?? null,
    verified,
    tested,
    lastEventAt: status.lastEventAt ?? null,
    lastCommandAt: status.lastCommandAt ?? null,
    lastCommand: status.lastCommand ?? null,
    lastError: status.lastError ?? null,
    revokedAt: status.revokedAt ?? null,
    revocation: status.revocation ?? null,
    subscriptionId: status.subscriptionId ?? null,
    subscriptionStatus: status.subscriptionStatus ?? null,
    // "Ready" is deliberately stricter than "configured": Twitch must have completed the
    // webhook challenge AND an authorized command must have run successfully. Env values alone
    // are not evidence that the subscription works, and a challenge alone does not prove that
    // the authorization rules accept the broadcaster.
    ready: cfg.configured && Boolean(state?.twitchChatEnabled) && verified && tested,
  };
}

const claimKeys = (messageId, headerId) => [
  messageId ? `twitch:event:${messageId}` : null,
  headerId ? `twitch:header:${headerId}` : null,
].filter(Boolean);

export async function claimTwitchEvent(store, { messageId, headerId }, now = Date.now()) {
  const keys = claimKeys(messageId, headerId);
  if (!keys.length) return { ok: false, keys: [] };
  const claimed = [];
  for (const key of keys) {
    let result;
    try {
      result = await store.setJSON(key, { at: now }, { onlyIfNew: true });
    } catch (err) {
      // Do not leave half a claim behind: a later retry must not look like a duplicate when the
      // store failed before the event was actually handled.
      await releaseTwitchEvent(store, claimed);
      throw err;
    }
    if (!result?.modified) {
      await releaseTwitchEvent(store, claimed);
      return { ok: false, keys };
    }
    claimed.push(key);
  }
  return { ok: true, keys: claimed };
}

export async function releaseTwitchEvent(store, keys) {
  if (typeof store.delete !== "function") return;
  await Promise.all(keys.map((key) => store.delete(key).catch(() => {})));
}

const textResponse = (body, status, type = "text/plain; charset=utf-8") =>
  new Response(body, { status, headers: { "Content-Type": type, "Cache-Control": "no-store" } });

// Full handler, kept here so tests can drive a real Request against an in-memory store.
export async function handleTwitchWebhook(store, req, { env = process.env, now = Date.now(), action = runAction } = {}) {
  if (req.method !== "POST") return textResponse("Method not allowed.", 405);
  const rawBody = await req.text();
  const messageId = header(req, "twitch-eventsub-message-id");
  const timestamp = header(req, "twitch-eventsub-message-timestamp");
  const signature = header(req, "twitch-eventsub-message-signature");
  const messageType = header(req, "twitch-eventsub-message-type");

  const verified = verifyTwitchSignature({
    messageId, timestamp, signature, rawBody, secret: env.TWITCH_WEBHOOK_SECRET, now,
  });
  if (!verified.ok) return textResponse(verified.error, verified.status);

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return textResponse("Invalid JSON.", 400);
  }

  if (messageType === "webhook_callback_verification") {
    const challenge = typeof payload.challenge === "string" ? payload.challenge : "";
    if (!challenge) return textResponse("Missing challenge.", 400);
    // Twitch verifies every subscription by challenge. Only the chat subscription proves the
    // command path is live, so a challenge for another subscription must not turn Ready on.
    if (payload.subscription?.type === "channel.chat.message") {
      await writeTwitchStatus(store, {
        webhookVerifiedAt: now,
        subscriptionId: payload.subscription?.id ?? null,
        subscriptionStatus: payload.subscription?.status ?? "webhook_callback_verification_pending",
        revokedAt: null,
        revocation: null,
        lastError: null,
        // A newly verified subscription has not carried a real command yet, so "Ready" stays
        // off until the broadcaster's test command succeeds.
        lastCommandAt: null,
        lastCommand: null,
      }, now);
    }
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": String(Buffer.byteLength(challenge)),
        "Cache-Control": "no-store",
      },
    });
  }

  if (messageType === "revocation") {
    if (payload.subscription?.type === "channel.chat.message") {
      await writeTwitchStatus(store, {
        revokedAt: now,
        revocation: payload.subscription?.status ?? "revoked",
        subscriptionStatus: payload.subscription?.status ?? "revoked",
        // The old test command no longer proves anything about a revoked subscription.
        lastCommandAt: null,
        lastCommand: null,
      }, now);
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  if (messageType !== "notification") {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  // Only chat messages can move this desk. Other subscriptions are acknowledged and ignored.
  if (payload.subscription?.type !== "channel.chat.message") {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  const cfg = twitchEnv(env);
  if (!cfg.broadcasterId) {
    await writeTwitchStatus(store, { lastError: "TWITCH_BROADCASTER_USER_ID is not configured." }, now);
    return textResponse("Twitch broadcaster is not configured.", 503);
  }
  const event = payload.event ?? {};
  if (String(event.broadcaster_user_id ?? "") !== cfg.broadcasterId) {
    await writeTwitchStatus(store, { lastError: "Ignored a chat event for a different broadcaster." }, now);
    return textResponse("Wrong broadcaster.", 403);
  }

  const state = await readState(store);
  if (!state.twitchChatEnabled) {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  const allowIds = allowedIds(state, env);
  const gate = twitchMayCommand(event, { broadcasterId: cfg.broadcasterId, allowIds, enabled: true });
  const cmd = parseDeskCommand(event.message?.text ?? "");
  if (!cmd) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

  if (!gate.ok) {
    await writeTwitchStatus(store, { lastEventAt: now, lastError: `${event.chatter_user_id ?? "unknown"} refused: ${gate.reason}` }, now);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  const claim = await claimTwitchEvent(store, { messageId: event.message_id, headerId: messageId }, now);
  if (!claim.ok) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

  try {
    const result = await action(store, commandBody(cmd), now);
    // The command already ran. A failure to record its status must not make Twitch redeliver
    // and run it a second time; log it and keep the delivery claimed.
    try {
      await writeTwitchStatus(store, {
        lastEventAt: now,
        lastCommandAt: now,
        lastCommand: `${event.chatter_user_name ?? event.chatter_user_id} as ${gate.as}: ${commandText(cmd)}`,
        lastError: null,
        desk: result?.state?.desk ?? null,
        visible: Boolean(result?.state?.visible),
      }, now);
    } catch (statusErr) {
      console.error("twitch eventsub status write failed", statusErr);
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    await releaseTwitchEvent(store, claim.keys);
    await writeTwitchStatus(store, { lastEventAt: now, lastError: err?.message ?? "command failed" }, now)
      .catch((statusErr) => console.error("twitch eventsub status write failed", statusErr));
    if (err instanceof HttpError) {
      // A refused command (for example "no poll is running") is a valid outcome. Twitch should
      // not redeliver it, and the operator can read the reason from the dashboard status.
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }
    console.error("twitch eventsub command failed", err);
    return textResponse("Webhook command failed.", 500);
  }
}

export const TWITCH_SETUP_HELP = [
  "Create a Twitch application at https://dev.twitch.tv/console/apps.",
  "Set the OAuth redirect URL to the site that will authorize the bot, for example https://cyber-live-desk.netlify.app/.",
  "Generate user tokens with the scopes user:read:chat user:bot channel:bot.",
  "Add TWITCH_WEBHOOK_SECRET and TWITCH_BROADCASTER_USER_ID in Netlify environment variables. Optional: TWITCH_ALLOWED_USER_IDS, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_EVENTSUB_CALLBACK.",
  "Create the channel.chat.message EventSub webhook subscription with callback https://cyber-live-desk.netlify.app/api/twitch/eventsub.",
];

// Netlify makes a function out of every file in netlify/functions. This module is imported by
// twitch-eventsub.mjs, so it refuses a direct request instead of half-working.
export default () =>
  new Response(JSON.stringify({ error: "Internal module. Use /api/twitch/eventsub." }), {
    status: 501,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
