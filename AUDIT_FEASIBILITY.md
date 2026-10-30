# Cyber Live Desk — Audit & Feasibility Report

## What works immediately (no code change)

- **Card desk (cards mode)** — Approve, show, next, previous, hold, hide, source toggle, bulk approval, desk filters (politics/streamers/music/movies/business/trends), slang cards, viewer questions from chat, presenter notes, auto-play, auto-research.
- **CRID segment (Cyber's Rent Is Due)** — Open a jumbotron segment (kind/title/credit), stamp verdict (rent paid / still owing), run a Strangers' poll, close segment. Verdict + poll result render on the jumbotron.
- **Live poll** — Start/end/clear poll, vote manually, chat tally via the read-only Twitch chat reader, results show on the active card.
- **Twitch server control** — EventSub webhook at `/api/twitch/eventsub`, signature verification, challenge response, duplicate delivery protection, broadcaster/allowlist authorization, `desk next/prev/hold/hide/stop/poll/auto/desk` commands from chat.
- **Research pipeline** — Fetch headlines/trends from Nigeria + US feeds (Google News, Google Trends, RSS), held bucket for full queues, auto-approval modes (manual/trusted/all), scheduled cron every 15 min, 3-day freshness window, age-out pruning.
- **X jumbotron** — Native top/bottom bar showing X trends or tweets (following/for-you), fetched via `/api/x/feed` proxy (X_Bearer token never reaches browser).
- **Swae preview** — Controller preview iframe with 9:16 / 16:9 ratio toggle, "Copy Swae URL", debug scale slider, connection dot.
- **Tests** — 92 tests pass (`node --test`). Syntax checks pass on all frontend + functions files.

## What needs a small code change

| Area | Gap | Fix |
|------|-----|-----|
| **Swae audio** | Overlay has no `<audio>` element. Swae iPhone stream can't hear CRID/card audio. | Add an audio element to overlay.js, drive it from card/crid audioUrl, add play/pause/mute controls to control.js. |
| **CRID audio** | `crid-open` accepts kind/title/credit but no audio URL. | Add optional `audioUrl` to `crid-open` payload, persist on crid state, add `crid-audio` action to play/pause. |
| **Command parity** | `desk-commands.js` (browser) and `_twitch-core.mjs` (server) maintain duplicate command parsers. They stay in sync via a parity test, but drift is possible. | Extract one shared command module; both sides import it. |
| **X feed iframe** | X `following`/`for-you` mode still loads an external iframe via `xbase`. The native X jumbotron replaces it but the iframe path remains. | Remove the iframe path; use only the native `/api/x/feed` jumbotron. |

## What needs backend / OAuth / external service / second device

| Area | Gap | Requirement |
|------|-----|-------------|
| **Twitch webhook** | `TWITCH_WEBHOOK_SECRET` and `TWITCH_BROADCASTER_USER_ID` not set in Netlify. Webhook not verified. Server control shows "Not configured". | Set both env vars in Netlify, create `channel.chat.message` EventSub subscription with callback `https://cyber-live-desk.netlify.app/api/twitch/eventsub`. |
| **X API** | `X_BEARER_TOKEN` not set in Netlify. `/api/x/feed` returns 502. | Set `X_BEARER_TOKEN` in Netlify site env. Token needs X API v2 access (trends + user timeline). |
| **DESK_OPERATOR_TOKEN** | Required for `/control`. Netlify UI previously errored adding it. | Set in Netlify env vars; operator signs in at `/control`. |
| **Swae overlay URL** | Operator copies `/desk?pos=bottom-left` into Swae as a browser source. | Manual step; no code change. |

## Voice feasibility inside Swae

**Feasible, but with constraints.**

Swae runs a mobile stream (9:16 vertical). The overlay is a browser source loaded from `/desk?pos=bottom-left&scale=0.7`. Audio from the overlay plays through Swae's stream audio if:

1. The overlay `<audio>` element is unmuted and autoplay is allowed (browsers block autoplay until user gesture; the operator taps "Play" on the controller, which can trigger audio via the same user gesture context if the controller and overlay share an origin — they do, both on the same domain).
2. Audio URLs are https and serve CORS-friendly audio (MP3/AAC/WebM). Direct file URLs work; signed URLs work; YouTube/TikTok embed URLs do not (they're video players, not raw audio).
3. The operator controls audio from the controller (play/pause/mute/volume), which posts an action to `/api/desk/action`. The overlay polls state and picks up `audioUrl` + `audioPlaying`.

**Recommended approach:** Treat audio like a card field. `crid-open` accepts `audioUrl`. When a CRID segment opens with audio, the overlay creates/plays an `<audio>` element. When the segment closes or the card changes, audio pauses. The operator can override play/pause/mute from the controller. This is the smallest reliable version — no external TTS, no streaming server, just an audio URL field and an `<audio>` element.

## Recommended architecture for the smallest reliable version

```
Operator (/control)  →  POST /api/desk/action  →  Netlify Blobs (state)
                                               ↑
Overlay (/desk)      ←  GET /api/desk/state   ←  polls every 3s
```

- State blob carries `crid { audioUrl, audioPlaying }` and optional `card.audioUrl`.
- Overlay renders the card, then mounts an `<audio>` if `audioUrl` present. Plays when `audioPlaying === true`, pauses otherwise.
- Controller has Play/Pause/Mute/Volume buttons that dispatch `crid-audio` or `card-audio` actions.
- No new endpoints, no new env vars, no external services. Works with existing Netlify Blobs store.

## First end-to-end testable slice (Phase 2)

1. Add `<audio>` to overlay.js, driven by state `audioUrl` + `audioPlaying`.
2. Add `audioUrl` to `crid-open` in `_desk-core.mjs`; add `crid-audio` action to `runAction`.
3. Add Play/Pause/Mute buttons to control.js CRID panel.
4. Test: open CRID segment with audio URL in controller → overlay plays audio → stamp verdict → audio pauses → close segment → audio stops.
5. Add unit tests for audio actions + overlay audio mount/unmount behavior.
6. Run `node --test` (92+ tests) and `node --check` syntax validation.
