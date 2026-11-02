# Twitch server-side desk control

This is the exact setup for the `channel.chat.message` webhook. The dashboard is still the
manual fallback. Until every step below is complete, the controller shows **Not configured**
or **waiting for Twitch to verify** and no command can arrive from Twitch.

The deployed endpoint is:

```
https://cyber-live-desk.vercel.app/api/twitch/eventsub
```

## 1. Create the Twitch application

1. Open <https://dev.twitch.tv/console/apps> and create an app.
2. Set **OAuth Redirect URL** to `https://cyber-live-desk.vercel.app/`.
3. Choose any category; the app is only used to obtain a user token.
4. Copy the **Client ID** and generate a **Client Secret**.

## 2. Authorize a user token

The token must belong to the broadcaster or to a bot account in the channel. It needs:

```
user:read:chat user:bot channel:bot
```

Use Twitch's OAuth authorization-code flow (or the Twitch CLI). A bot account also needs the
broadcaster to grant `channel:bot`; the broadcaster's own token already belongs to the channel.

Do not put this token in Vercel. The deployed functions do not need it; it is only used to
create the EventSub subscription in step 4. Keep it somewhere safe in case the subscription is
revoked and must be recreated; Vercel only needs the webhook secret below.

## 3. Set Vercel environment variables

In **Project → Settings → Environment Variables**, add:

| Name | Required | Value |
| --- | --- | --- |
| `TWITCH_WEBHOOK_SECRET` | yes | A random string of 10–100 characters. Twitch and this site must use the same value. |
| `TWITCH_BROADCASTER_USER_ID` | yes | The broadcaster's **numeric** Twitch user id, not the login name. |
| `TWITCH_ALLOWED_USER_IDS` | no | Comma/space separated numeric ids of additional people allowed to command. |
| `TWITCH_CLIENT_ID` | no | Shown in the status panel only. |
| `TWITCH_CLIENT_SECRET` | no | Shown in the status panel only. |
| `TWITCH_EVENTSUB_CALLBACK` | no | Overrides the callback URL shown in the controller. |

Redeploy after changing environment variables.

## 4. Create the EventSub subscription

Twitch verifies the callback by sending a challenge to the endpoint before it enables the
subscription. The endpoint answers that challenge and stores the verification. Only then does
the controller say **Ready**.

Example request (replace the bearer token, ids and secret; do not commit the token):

```bash
curl -X POST https://api.twitch.tv/helix/eventsub/subscriptions \
  -H "Client-Id: $TWITCH_CLIENT_ID" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "channel.chat.message",
    "version": "1",
    "condition": {
      "broadcaster_user_id": "BROADCASTER_NUMERIC_ID",
      "user_id": "BOT_OR_BROADCASTER_NUMERIC_ID"
    },
    "transport": {
      "method": "webhook",
      "callback": "https://cyber-live-desk.vercel.app/api/twitch/eventsub",
      "secret": "THE_SAME_VALUE_AS_TWITCH_WEBHOOK_SECRET"
    }
  }'
```

For the broadcaster's own account, `user_id` is the broadcaster id. For a bot, use the bot's
numeric id and make sure the bot has joined the channel.

## 5. Turn control on and verify

1. Open `/control` and sign in with the operator token.
2. In **Twitch server control**, confirm the callback URL and environment status.
3. Save the allowed user ids (the broadcaster is always allowed).
4. Click **Enable server control**.
5. The panel reports **Webhook verified** once Twitch's challenge has been stored, and
   **READY — verified webhook and successful test command** only after a signed command from
   the broadcaster has actually run. A challenge alone is not treated as proof that the
   authorization path works.

Test with `desk next` from the broadcaster account. The status panel shows the last command and
any refusal. A moderator badge is not enough; the sender must be the broadcaster's numeric id or
an explicitly allowed numeric id. Display names are never trusted.

## Supported commands

```
desk next
desk prev
desk hold
desk hide
desk stop
desk poll <question>
desk poll <question>|<option a>|<option b>[|<option c>]
desk auto on|off
desk music · desk streamers · desk movies · desk politics · desk business · desk trends · desk all
```

Commands can only move cards that are already approved. Approving, editing, deleting, research
and poll administration stay on the dashboard. Duplicate EventSub deliveries are ignored, and
requests outside the 10-minute signature timestamp window are refused.

## Troubleshooting

- **Not configured**: one of the required Vercel variables is missing.
- **Waiting for Twitch to verify**: the subscription has not completed its challenge, or the
  challenge was signed with a different secret.
- **Webhook verified but not Ready**: the challenge succeeded, but no authorized command has run
  yet. Send `desk next` from the broadcaster to finish the test.
- **Last error: … not the broadcaster or on the allowlist**: the numeric sender id is not
  authorized. Check `TWITCH_BROADCASTER_USER_ID` and the allowlist.
- **No events at all**: confirm the subscription status in the Twitch developer console and that
  the callback URL matches the deployed site exactly.
- Revoking the subscription through Twitch turns the controller back to not ready; create a new
  subscription or re-enable it to verify again.
