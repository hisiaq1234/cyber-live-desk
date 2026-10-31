// Twitch EventSub webhook regressions: signatures, challenge, authorization, dedupe and status.
// The handler takes a plain store, so these run without Netlify.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { DEFAULT_STATE, commitState, readState } from "../api/_desk-core.mjs";
import {
  TWITCH_EVENT_PATH,
  handleTwitchWebhook,
  parseDeskCommand,
  twitchStatus,
} from "../api/_twitch-core.mjs";

const NOW = Date.parse("2026-10-29T12:00:00Z");
const SECRET = "test-webhook-secret-at-least-ten";
const env = { TWITCH_WEBHOOK_SECRET: SECRET, TWITCH_BROADCASTER_USER_ID: "111" };
const iso = (at = NOW) => new Date(at).toISOString();

const makeStore = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return {
    async get(key, opts) {
      const v = m.get(key);
      if (v == null) return null;
      return opts?.type === "json" ? JSON.parse(v) : v;
    },
    async setJSON(key, value, opts) {
      if (opts?.onlyIfNew && m.has(key)) return { modified: false };
      m.set(key, JSON.stringify(value));
      return { modified: true };
    },
    async delete(key) { m.delete(key); },
    dump: () => Object.fromEntries(m),
  };
};

const card = (id, over = {}) => ({
  id,
  type: "news-drop",
  headline: id,
  approval: "approved",
  createdAt: 1,
  order: null,
  ttlSec: null,
  source: { publisher: "P", url: `https://e.com/${id}` },
  ...over,
});

const readyStore = async () => {
  const store = makeStore({ cards: JSON.stringify([card("a"), card("b")]) });
  await commitState(store, DEFAULT_STATE, { visible: true, activeCardId: "a", twitchChatEnabled: true }, NOW);
  return store;
};

const message = (over = {}) => ({
  subscription: { id: "sub-1", type: "channel.chat.message", version: "1", status: "enabled" },
  event: {
    broadcaster_user_id: "111",
    chatter_user_id: "111",
    chatter_user_name: "Cyber",
    message_id: "event-1",
    message: { text: "desk next" },
    ...over,
  },
});

const signedRequest = ({ payload, messageType = "notification", messageId = "header-1", timestamp = iso(), secret = SECRET, signature }) => {
  const raw = JSON.stringify(payload);
  const sig = signature ?? "sha256=" + createHmac("sha256", secret).update(messageId + timestamp + raw).digest("hex");
  return new Request("https://desk.example" + TWITCH_EVENT_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Twitch-Eventsub-Message-Id": messageId,
      "Twitch-Eventsub-Message-Timestamp": timestamp,
      "Twitch-Eventsub-Message-Signature": sig,
      "Twitch-Eventsub-Message-Type": messageType,
    },
    body: raw,
  });
};

const send = (store, opts) => handleTwitchWebhook(store, signedRequest(opts), { env, now: NOW });

const challengeBody = (type = "channel.chat.message") => ({
  challenge: "challenge-token-123",
  subscription: { id: "sub-1", type, version: "1", status: "webhook_callback_verification_pending" },
});

test("the challenge is returned verbatim with its exact content length", async () => {
  const store = makeStore();
  const res = await send(store, { payload: challengeBody(), messageType: "webhook_callback_verification" });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "challenge-token-123");
  assert.equal(res.headers.get("content-length"), String(Buffer.byteLength("challenge-token-123")));

  const state = await readState(store);
  const status = await twitchStatus(store, { ...state, twitchChatEnabled: true }, { env, origin: "https://desk.example" });
  assert.equal(status.configured, true);
  assert.equal(status.verified, true);
  assert.equal(status.tested, false);
  assert.equal(status.ready, false, "a challenge alone is not a successful command test");
  assert.equal(status.callbackUrl, "https://desk.example" + TWITCH_EVENT_PATH);
});

test("a challenge for another subscription is acknowledged but cannot turn Ready on", async () => {
  const store = makeStore();
  const res = await send(store, { payload: challengeBody("channel.follow"), messageType: "webhook_callback_verification" });
  assert.equal(res.status, 200, "Twitch still gets its challenge back");
  const status = await twitchStatus(store, { ...DEFAULT_STATE, twitchChatEnabled: true }, { env });
  assert.equal(status.verifiedAt, null);
  assert.equal(status.ready, false, "only channel.chat.message proves the command path");
});

test("a missing or wrong signature is refused before any command runs", async () => {
  const store = await readyStore();
  const before = await readState(store);

  const forged = await send(store, { payload: message(), signature: "sha256=" + "0".repeat(64) });
  assert.equal(forged.status, 403);
  assert.equal((await readState(store)).version, before.version);

  const missing = await send(store, { payload: message(), signature: "" });
  assert.equal(missing.status, 403);

  const stale = await send(store, { payload: message(), timestamp: iso(NOW - 11 * 60_000) });
  assert.equal(stale.status, 403, "outside the replay window");
  assert.equal((await readState(store)).activeCardId, "a", "nothing moved");
});

test("without the webhook secret the endpoint refuses rather than guessing", async () => {
  const store = await readyStore();
  const res = await handleTwitchWebhook(store, signedRequest({ payload: message() }), { env: { TWITCH_BROADCASTER_USER_ID: "111" }, now: NOW });
  assert.equal(res.status, 503);
  assert.match(await res.text(), /TWITCH_WEBHOOK_SECRET/);
});

test("the broadcaster may run the existing desk commands", async () => {
  const store = await readyStore();
  await send(store, { payload: challengeBody(), messageType: "webhook_callback_verification", messageId: "header-challenge" });
  const res = await send(store, { payload: message() });
  assert.equal(res.status, 204);
  const state = await readState(store);
  assert.equal(state.activeCardId, "b", "desk next moved the approved queue");
  assert.equal(state.visible, true);

  const status = await twitchStatus(store, state, { env, origin: "https://desk.example" });
  assert.match(status.lastCommand, /broadcaster.*desk next/);
  assert.equal(status.lastError, null);
  assert.equal(status.tested, true);
  assert.equal(status.ready, true, "verified webhook plus a successful broadcaster command is Ready");
});

test("an allowlisted stable id may command; a moderator badge or a display name may not", async () => {
  const store = await readyStore();
  const state = await readState(store);
  await commitState(store, state, { twitchAllowedUserIds: ["222"] }, NOW);

  const allowed = await send(store, { payload: message({ chatter_user_id: "222", chatter_user_name: "Helper", message_id: "event-2" }), messageId: "header-2" });
  assert.equal(allowed.status, 204);
  assert.equal((await readState(store)).activeCardId, "b");

  const before = await readState(store);
  const spoof = await send(store, { payload: message({ chatter_user_id: "999", chatter_user_name: "Cyber", message_id: "event-3" }), messageId: "header-3" });
  assert.equal(spoof.status, 204);
  assert.equal((await readState(store)).version, before.version, "a display name is not an identity");
  assert.match((await twitchStatus(store, before, { env })).lastError, /not the broadcaster/);

  const nameOnly = await send(store, { payload: message({ chatter_user_id: "", chatter_user_name: "Cyber", message_id: "event-4" }), messageId: "header-4" });
  assert.equal(nameOnly.status, 204);
  assert.equal((await readState(store)).version, before.version);
});

test("duplicate deliveries are claimed once by header id and by event message id", async () => {
  const store = await readyStore();
  const payload = message({ message_id: "twitch-message-77" });
  assert.equal((await send(store, { payload, messageId: "header-dup" })).status, 204);
  assert.equal((await readState(store)).activeCardId, "b");
  assert.equal((await send(store, { payload, messageId: "header-dup" })).status, 204);
  assert.equal((await readState(store)).activeCardId, "b", "the same delivery cannot advance twice");

  // A Twitch redelivery may carry a new header id but the same event message id.
  assert.equal((await send(store, { payload, messageId: "header-new" })).status, 204);
  assert.equal((await readState(store)).activeCardId, "b", "the event id still dedupes it");
});

test("a status-record failure after a successful command does not replay it", async () => {
  const base = await readyStore();
  await send(base, { payload: challengeBody(), messageType: "webhook_callback_verification", messageId: "header-challenge" });
  const flaky = {
    ...base,
    async setJSON(key, value, opts) {
      if (key === "twitch-status") throw new Error("status blob unavailable");
      return base.setJSON(key, value, opts);
    },
  };
  const payload = message({ message_id: "twitch-message-once" });
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal((await send(flaky, { payload, messageId: "header-once" })).status, 204);
    assert.equal((await readState(base)).activeCardId, "b", "the command ran even though status could not be saved");
    assert.equal((await send(flaky, { payload, messageId: "header-once-new" })).status, 204);
    assert.equal((await readState(base)).activeCardId, "b", "the claimed delivery cannot advance the queue again");
  } finally {
    console.error = originalError;
  }
});

test("control off, or an event for another broadcaster, is ignored", async () => {
  const off = makeStore({ cards: JSON.stringify([card("a"), card("b")]) });
  const before = await commitState(off, DEFAULT_STATE, { visible: true, activeCardId: "a", twitchChatEnabled: false }, NOW);
  assert.equal((await send(off, { payload: message() })).status, 204);
  assert.equal((await readState(off)).version, before.version);

  const on = await readyStore();
  const other = await send(on, { payload: message({ broadcaster_user_id: "999" }) });
  assert.equal(other.status, 403);
  assert.equal((await readState(on)).activeCardId, "a");
});

test("revocation turns Ready off and a new verification turns it back on", async () => {
  const store = makeStore();
  await send(store, { payload: challengeBody(), messageType: "webhook_callback_verification" });
  let state = await commitState(store, await readState(store), { twitchChatEnabled: true }, NOW);
  assert.equal((await send(store, { payload: message(), messageId: "header-test" })).status, 204);
  let status = await twitchStatus(store, state, { env });
  assert.equal(status.ready, true);

  const revocation = {
    subscription: { id: "sub-1", type: "channel.chat.message", version: "1", status: "authorization_revoked" },
  };
  assert.equal((await send(store, { payload: revocation, messageType: "revocation", messageId: "header-revoke" })).status, 204);
  status = await twitchStatus(store, { ...DEFAULT_STATE, twitchChatEnabled: true }, { env });
  assert.equal(status.ready, false);
  assert.equal(status.verified, false);
  assert.equal(status.tested, false);
  assert.equal(status.revokedAt, NOW);

  await send(store, { payload: challengeBody(), messageType: "webhook_callback_verification", messageId: "header-again" });
  status = await twitchStatus(store, { ...DEFAULT_STATE, twitchChatEnabled: true }, { env });
  assert.equal(status.verified, true);
  assert.equal(status.ready, false, "re-verification still needs a fresh test command");

  state = await readState(store);
  assert.equal((await send(store, { payload: message({ message_id: "event-after-revoke" }), messageId: "header-test-2" })).status, 204);
  status = await twitchStatus(store, state, { env });
  assert.equal(status.ready, true, "a signed command after re-verification turns Ready back on");
});

test("the server parser still understands every command the dashboard advertises", () => {
  for (const text of ["desk next", "desk prev", "desk hold", "desk hide", "desk stop", "desk music", "desk all", "desk auto on", "desk poll Q|A|B"]) {
    assert.ok(parseDeskCommand(text), text);
  }
  assert.equal(parseDeskCommand("hello chat"), null);
});
