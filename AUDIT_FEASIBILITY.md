# Cyber Live Desk — Audit & Feasibility Report

## What works immediately (no code change)

- **Card desk (cards mode)** — Approve, show, next, previous, hold, hide, source toggle, bulk approval, desk filters (politics/streamers/music/movies/business/trends), slang cards, viewer questions from chat, presenter notes, auto-play, auto-research.
- **CRID segment (Cyber's Rent Is Due)** — Open a card segment (kind/title/credit), stamp verdict (rent paid / still owing), run a Strangers' poll, close segment. Verdict + poll result render on the card.
- **Live poll** — Start/end/clear poll, vote manually, chat tally via the read-only Twitch chat reader, results show on the active card.
- **Twitch server control** — EventSub webhook at `/api/twitch/eventsub`, signature verification, challenge response, duplicate delivery protection, broadcaster/allowlist authorization, `desk next/prev/hold/hide/stop/poll/auto/desk` commands from chat.
- **Research pipeline** — Fetch headlines/trends from Nigeria + US feeds (Google News, Google Trends, RSS), held bucket for full queues, auto-approval modes (manual/trusted/all), scheduled cron every 15 min, 3-day freshness window, age-out pruning.
- **X feed** — Native top/bottom bar showing X trends or tweets (following/for-you), fetched via `/api/x/feed` proxy (X_Bearer token never reaches browser).
- **Swae preview** — Controller preview iframe with 9:16 / 16:9 ratio toggle, "Copy Swae URL", connection dot. The preview is a real browser, so it is smoother than Swae's on-stream snapshots; treat it as a layout check, not a fidelity check.
- **Tests** — 161 tests pass (`node --test`). Syntax checks pass on all frontend + functions files.

## What needs a small code change

| Area | Gap | Fix |
|------|-----|-----|
| **Swae audio** | Swae's published stream mixes the microphone only (`AVCaptureDevice.default(for: .audio)`), so nothing inside a widget can reach the broadcast — this is not fixable in the page. The overlay does carry an `<audio>` element driven by `crid.audioUrl` (play/pause/mute from the controller), but it is heard on the rendering device only. | Keep the element for on-device playback, and say so plainly in the UI. Put overlay audio on air with a renderer that mixes page audio, e.g. a desktop browser source. |
| **CRID audio** | Done: `crid-open` takes an optional `audioUrl`, it persists on the CRID state, and `crid-audio` handles play/pause/mute. | None. |
| **Command parity** | `desk-commands.js` (browser) and `_twitch-core.mjs` (server) maintain duplicate command parsers. They stay in sync via a parity test, but drift is possible. | Extract one shared command module; both sides import it. |
| **X feed iframe** | X `following`/`for-you` mode still loads an external iframe via `xbase`. The native X feed replaces it but the iframe path remains. | Remove the iframe path; use only the native `/api/x/feed` card. |

## What needs backend / OAuth / external service / second device

| Area | Gap | Requirement |
|------|-----|-------------|
| **Twitch webhook** | `TWITCH_WEBHOOK_SECRET` and `TWITCH_BROADCASTER_USER_ID` not set in Vercel. Webhook not verified. Server control shows "Not configured". | Set both env vars in Vercel, create `channel.chat.message` EventSub subscription with callback `https://cyber-live-desk.vercel.app/api/twitch/eventsub`. |
| **X API** | `X_BEARER_TOKEN` not set in Vercel. `/api/x/feed` returns 502. | Set `X_BEARER_TOKEN` in the Vercel project env. Token needs X API v2 access (trends + user timeline). |
| **DESK_OPERATOR_TOKEN** | Required for `/control`. | Set in the Vercel project env; operator signs in at `/control`. |
| **Swae overlay URL** | Operator pastes the overlay URL into a Swae Browser Widget. Query parameters do survive here — Swae loads the configured URL verbatim through `URLRequest(url:)` — so `?theme=torn-paper` and the other switches are usable. The page forces its own placement, and it recognises Swae from the "Swae access" bridge that Swae injects. | Manual step; no code change. |
| **Scheduled research** | `desk-auto-research.mjs` documents its schedule as "declared in vercel.json under `crons`" and authorises itself with `CRON_SECRET`, but `vercel.json` declares no `crons` entry. The 15-minute auto-research run therefore never fires; research only happens when the operator presses the button. | Add a `crons` entry for `/api/desk-auto-research`. Note Vercel restricts cron frequency by plan: Hobby allows one run per day, so `*/15 * * * *` needs Pro. |
| **`/api/desk/voice`** | Publicly reachable with **no operator token**. It parses `crid …` text and runs only a fixed safe subset — `next`, `previous`, `hold`, `hide`, `desk`, `start-poll`, `end-poll`, `auto-play`, `clip-create`, `crid-open`, `music-play`, `music-pause`, `music-next`, `music-stop` — and forces voice-opened CRID segments to `kind: "topic"`, `title: "Voice segment"`. Approved for deliberate use; listed here so the surface stays visible. | None if intended; remove the route otherwise. |

## Environment variables (Vercel project settings)

| Name | Needed for | Notes |
|------|-----------|-------|
| `DESK_OPERATOR_TOKEN` | `/control` and every mutating route | Operator auth. Constant-time compare; routes answer 503 when unset. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | All state | Upstash Redis REST endpoint and token. Vercel fills these in when you connect an Upstash database from the Storage tab. Without them the desk comes up empty. |
| `TWITCH_WEBHOOK_SECRET` | Chat control | Shared with Twitch; signs every EventSub delivery. |
| `TWITCH_BROADCASTER_USER_ID` | Chat control | The broadcaster's **numeric** id, not the login name. |
| `TWITCH_ALLOWED_USER_IDS` | Chat control (optional) | Extra numeric ids allowed to command. |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | Status panel (optional) | Also used to create clips. |
| `TWITCH_CLIP_ACCESS_TOKEN` | Clip creation (optional) | Needs the `clips:edit` scope. |
| `TWITCH_EVENTSUB_CALLBACK` | Optional | Overrides the callback URL the controller displays. |
| `X_BEARER_TOKEN` | X feed / brief | Legacy `X_ACCESS_TOKEN` still works as a fallback. |
| `GEMINI_API_KEY` | Trends + brief (optional) | Enriches trends and powers the brief and the witty rewrite. |
| `AUDIOMACK_KEY` / `AUDIOMACK_SECRET` | Audiomack station (optional) | A curated station is served when these are absent. |
| `YOUTUBE_API_KEY` | Music Desk search (optional) | A Google Cloud key with the **YouTube Data API v3** enabled. Powers `crid music play <song>` and the controller's "Search YouTube" box. Without it a spoken song name is refused and the queue stays manual. This only resolves which video is on air; the player itself stays a Swae web-page layer. |
| `DESK_FEED_PROXY` | Research (optional) | Proxy used for outlets that block direct fetches. |
| `DESK_FEED_TIMEOUT_MS` / `DESK_FEED_BUDGET_MS` | Research (optional) | Per-fetch timeout and total budget; default 6000 / 8000. |
| `CRON_SECRET` | Scheduled research | Authorises the cron invocation. |
| `BRIEF_MODEL` / `BRIEF_MAX_AGE_HOURS` / `BRIEF_X_WOEID` | Brief (optional) | Model name, cache age and X location id. |

The Spotify proxy needs no credentials.

## How Swae actually renders the overlay

Two limits come from Swae's own source (read from `suhailsaqan/swae`, not from its README) and
shape everything else:

1. **Snapshots, not a live view.** `BrowserEffect` calls `webView.takeSnapshot` on a timer at
   `1/fps` — `fps` defaults to 5 and is adjustable from 1 to 15 — and composites the resulting
   images. The on-stream widget therefore redraws a handful of times a second. Continuous
   `backdrop-filter` blur and CSS animation cost a full re-render per snapshot and get sampled
   mid-flight, so the overlay switches to a snapshot-safe style (solid scrims, no animation) as
   soon as it detects Swae.
2. **Microphone-only stream audio.** The published stream mixes
   `AVCaptureDevice.default(for: .audio)`. Audio played by a widget is heard on the phone and
   never reaches the broadcast.

Three more details worth knowing: the widget frame is a fixed pixel size (500×500 by default,
settable up to 4000) and the CSS viewport resolves against *that*, not the video; the widget is
drawn passively, so taps, scrolling and on-page controls never reach it; and the page must be
https, because Swae ships no App Transport Security exception.

**What this means for CRID audio and the sound orb:** they are device-local. They are still
worth keeping for the operator and anyone watching the phone, but nothing in the page — no
`<audio>` element, no autoplay gesture, no same-origin trick — can put that audio on a Swae
stream. Getting overlay audio on air needs a renderer that mixes page audio, such as a desktop
browser source.

**What the overlay does about it:** it detects Swae from the injected bridge and drops to the
snapshot-safe style automatically, and it can also show chat handed over by Swae's own chat
bridge (`swae.subscribe({ chat: … })`) instead of opening a second connection to Twitch.

## Recommended architecture for the smallest reliable version

```
Operator (/control)  →  POST /api/desk/action  →  Upstash Redis (state)
                                               ↑
Overlay (/desk)      ←  GET /api/desk/state   ←  polls every 3s
```

- State blob carries `crid { audioUrl, audioPlaying }` and optional `card.audioUrl`.
- Overlay renders the card, then mounts an `<audio>` if `audioUrl` present. Plays when `audioPlaying === true`, pauses otherwise.
- Controller has Play/Pause/Mute/Volume buttons that dispatch `crid-audio` or `card-audio` actions.
- No new endpoints, no new env vars, no external services. Works with the existing Upstash Redis store.
- Audio is device-local by nature: this path cannot put it on a Swae stream (see the section above).

## First end-to-end testable slice (Phase 2) — shipped

1. Add `<audio>` to overlay.js, driven by state `audioUrl` + `audioPlaying`.
2. Add `audioUrl` to `crid-open` in `_desk-core.mjs`; add `crid-audio` action to `runAction`.
3. Add Play/Pause/Mute buttons to control.js CRID panel.
4. Test: open CRID segment with audio URL in controller → overlay plays audio → stamp verdict → audio pauses → close segment → audio stops.
5. Add unit tests for audio actions + overlay audio mount/unmount behavior.
6. Run `node --test` (161 tests) and `node --check` syntax validation.
