// CYBER LIVE DESK — Twitch EventSub webhook endpoint.
// Twitch calls this URL; the dashboard does not need to be open. Signature verification,
// broadcaster/allowlist authorization and duplicate delivery protection live in _twitch-core.mjs.
//
// Required Vercel environment variables:
//   TWITCH_WEBHOOK_SECRET          the same secret used when creating the EventSub subscription
//   TWITCH_BROADCASTER_USER_ID     stable numeric id of the channel (never the login name)
// Optional:
//   TWITCH_ALLOWED_USER_IDS        comma/space separated stable numeric ids
//   TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET   used only to report whether app credentials exist
//   TWITCH_EVENTSUB_CALLBACK       overrides the callback URL shown in the controller
//
// The OAuth app token is not needed to receive webhooks, but Twitch requires one (and the
// channel:bot / user:bot grants described in TWITCH_SETUP.md) when the subscription is created.

import { getStore } from "./_store.mjs";

import { STORE_NAME } from "./_desk-core.mjs";
import { handleTwitchWebhook } from "./_twitch-core.mjs";

export const config = {
  path: "/api/twitch/eventsub",
};

const handler = async (req) => {
  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  return handleTwitchWebhook(store, req);
};
export default { fetch: handler };
