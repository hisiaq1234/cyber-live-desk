# Cyber Live Desk — Production, Swae & Test Report

**Updated:** 2 November 2026

**Project:** `cyber-live-desk`

**Test command:** `node --test`

**Runtime:** Node.js 24 on Windows

![Node test-run distribution by discovered test file](test-suite-counts.svg)

## Executive result

The latest full run passed **160 / 160 runner-counted items**: 159 explicit `test()` cases plus one Node file-discovery item for `api/test.mjs` (that route module contains no assertion). There were 0 failures, skips, cancellations, or todos; duration was **15.22 seconds**. JavaScript syntax checks passed for all **36** `.js`/`.mjs` files under `api/`, `public/`, and `tests/`; the browser/server command parser copies match exactly, and `git diff --check` was clean.

Production commit `1c9a615` is deployed and marked **Ready** by Vercel. The public `/desk` route, automatic Nigeria RSS ticker, and compact music/news identity remain live. The spoken/chat control prefix now consistently uses **`crid`**, and the controller UI documents the queue-based voice music commands without claiming YouTube search is implemented.

## Test distribution

| Test file | Runner-counted items | Coverage |
|---|---:|---|
| `api/test.mjs`* | 1 | Node file-load discovery; no assertion in this route module |
| `tests/brief.test.mjs` | 6 | Freshness parsing, Gemini grounding metadata, private brief, citations and sources |
| `tests/brief-guards.test.mjs` | 3 | X opt-in, actual Search grounding, focused deeper research |
| `tests/desk-bulk-research.test.mjs` | 12 | Research approvals, ingestion, capacity and source handling |
| `tests/desk-commands.test.mjs` | 9 | `crid` grammar, old-prefix rejection, parser parity, polling and music phrases |
| `tests/desk-core.test.mjs` | 96 | Desk state/actions, CRID audio/mute, public projection, queue matching and Gemini fallback |
| `tests/desk-headlines.test.mjs` | 3 | 12-hour filtering, safe RSS items, cache and Vercel fetch-handler contract |
| `tests/desk-hotkeys.test.mjs` | 2 | Explicit shortcut mapping and safeguards |
| `tests/desk-route.test.mjs` | 2 | Public `/desk` GET/HEAD and private operator-route authorization |
| `tests/overlay-audio.test.mjs` | 5 | Audio synchronization, mute/source cleanup, end state and autoplay rejection |
| `tests/sound-orb.test.mjs` | 4 | Compact/active states, mute/volume, buffering/end and listener cleanup |
| `tests/twitch-eventsub.test.mjs` | 11 | Signature, authorization, deduplication and `crid` command path |
| `tests/x-feed.test.mjs` | 3 | Official X v2 endpoint, bounded parameters and validation |
| `tests/youtube-playlist.test.mjs` | 3 | Official playlist URL and unsafe-source rejection |
| **Total reported by Node** | **160** | **159 explicit tests + 1 route-module discovery** |

## Production verification

| Check | Result | Evidence |
|---|---|---|
| Vercel production build | **Ready** | Commit `1c9a615` (`feat: use crid voice command prefix`) is the latest production deployment. |
| Public Swae URL | **PASS** | `GET /desk` and `HEAD /desk` both returned HTTP 200; HEAD had an empty body. |
| Automatic headline API | **PASS** | `GET /api/desk-headlines` returned HTTP 200 with 6 Nigeria-region items. All 6 had publication dates and HTTPS source links; the live overlay showed an item marked 57 minutes old, and the response was a Vercel cache hit. |
| Public overlay state | **PASS** | `GET /api/desk/state?since=-1` returned HTTP 200; the public response did not expose the music queue or audio URL. |
| Operator gate | **PASS** | `/control` returned HTTP 200; unauthenticated `GET /api/desk/cards` returned the expected HTTP 401. |
| Live overlay DOM | **PASS** | The fresh production page rendered the automatic ticker (`data-status=ready`). The orb is a `DIV`, `aria-hidden=true`, `tabIndex=-1`, has no button ancestor, and uses `pointer-events:none`. |
| Deployed controller asset | **PASS** | `/desk-assets/control.js` returned HTTP 200 and contains the new `crid music play` help; the old `desk research` command prompt is absent. |
| Swae phone capture | **NOT TESTED ON DEVICE** | Route probes are fixed and live; the saved Browser Widget must still be reloaded/checked inside the Swae app. |
| YouTube playback/audio rights | **NOT VERIFIED** | The visible official playlist workflow is separate; no YouTube search or audio-extraction path was introduced. |

### Production incident and correction

The first production build of `176ff86` showed Ready, but Vercel runtime logs revealed that it treated the new headlines endpoint as a Node-style default function and ignored the returned Web `Response`, eventually timing out. The route was changed to the same `export default { fetch: handler }` contract as the working `/api/desk` route. Commit `cc0b99c` deployed Ready, and the live headlines API then returned six fresh items successfully. Regression tests import and exercise that exact fetch-style export. The subsequent CRID update `1c9a615` also deployed Ready.

## CRID control word and voice music

The shared server/browser command grammar now begins with `crid`; the old `desk` prefix is no longer accepted as a command. This applies to operator push-to-talk and Twitch chat command examples. Private research examples use `crid research`, `crid deeper`, `crid refresh`, `crid read`, and `crid quiet`.

The authenticated voice allowlist now includes the Music Desk queue actions:

- `crid music play` resumes the current track or starts the queue head.
- `crid music play <title or artist>` selects a unique match already in the queue/current track. No match, multiple matches, or an empty queue returns a clear error.
- `crid music pause`, `crid music next`, and `crid music stop` control the current queue.

This is **not automatic YouTube search**. Tracks must already exist in Music Desk; no scraped search, guessed video ID, or unrelated fallback video is used. The supplied `overlay-alive.html` was reviewed but is not a drop-in replacement for `/desk`: it expects a playable video ID, while the public projection deliberately exposes only current title, artist, and playing state. The official YouTube playlist helper remains the separate visible-player workflow. Automatic phrase-to-YouTube search would need its own supported search route and deployment configuration.

Gemini card enrichment now asks for one-sentence context when a topic is only a name or short phrase, treats the headline as quoted data rather than instructions, and guarantees a non-empty fallback summary if the model returns blank or fails. This prompt change does **not** make every RSS ticker headline Gemini-verified.

## Overlay behavior and privacy

The visual cluster sits in the lower-right region and keeps the camera view clear: a compact red-core/black-shell orb with a blue-black sheen beside the narrow news strip. The orb is decorative, never a button, and reacts to actual player/audio state rather than microphone input or waveform analysis. It remains small while idle and expands/pulses only for its active audio state, subject to reduced-motion settings.

When the public music state says a track is playing, the same compact capsule can show the current **title and artist** while preserving the rotating headline and source/age line. No music was active during the current live DOM check, so that visual transition was not physically exercised. A regression test verifies the public state exposes only `{ current: { title, artist }, playing }`; it does not expose the music queue, stream/audio URLs, volume or mute controls.

The RSS strip is automatic while the overlay page is open. It uses public Google News Nigeria RSS, filters out undated, unsafe, future-dated and older-than-12-hour entries, shows publisher and relative age, and refreshes on the overlay's periodic poll with a five-minute CDN cache. If fresh items cannot be fetched, the UI reports unavailability rather than silently reusing old headlines. This strip is **RSS headline display, not Gemini verification**. The existing Gemini-grounded private brief remains a separate operator-requested action; no recurring Gemini calls were added, avoiding hidden API use or charges.

The orb/music identity is a now-playing display, **not** a miniature YouTube player with play/pause controls. The official visible YouTube/YouTube Music playlist player remains a separate Swae web-page layer and does not scrape or extract audio.

## Research, safety and cost notes

The private research flow remains on-demand in `/control`: dated RSS context plus Gemini Google Search grounding, source links, freshness/corroboration limits, counterpoints and an explicit warning when evidence is thin. It is not sent to Swae chat or the public overlay. Search grounding is not guaranteed free; quota and billing depend on the configured Google project. X lookup remains opt-in per brief. The always-on headline strip itself uses the public RSS endpoint and does not invoke Gemini.

The production `/desk` page is public by design. Operator-only actions still require `DESK_OPERATOR_TOKEN`; a 401 from `/api/desk/cards` without that token is expected and must not be “fixed” by making those APIs public.

## Changed files in the CRID follow-up

| File | Purpose |
|---|---|
| `api/_commands.mjs`, `public/desk-assets/_commands.mjs` | Shared `crid` prefix, music command parsing, safe text/log formatting, and updated help |
| `api/desk.mjs` | Voice allowlist for queue play/pause/next/stop; operator authentication unchanged |
| `api/_desk-core.mjs` | Unique queued-track matching, explicit no-match/ambiguous errors, safe Gemini short-topic fallback, injectable fetch |
| `api/_brief.mjs` | Updated private research command examples |
| `public/desk-assets/control.js` | `crid` voice prompts, private research examples, queue-only music instructions, Twitch test hint |
| `tests/desk-commands.test.mjs`, `tests/twitch-eventsub.test.mjs` | `crid` grammar, old-prefix rejection, parser parity and Twitch coverage |
| `tests/desk-core.test.mjs` | Queued-track matching/errors and non-empty Gemini fallback regression |

## Operator steps

1. In Swae, use `https://cyber-live-desk.vercel.app/desk` as the landscape Browser Widget/Web Page URL. Its public `HEAD` and `GET` probes both return 200; reload/update the saved Swae widget once so it retries the corrected route.
2. Keep `/desk` open during the stream to display the automatically refreshed, timestamp-filtered RSS ticker. Headlines show source and age; they are not Gemini-reviewed.
3. Use the private `/control` page for on-demand research and operator controls. Keep the operator token private; do not paste it into the Swae public overlay URL.
4. Voice music commands begin with `crid`. For now, add a track in Music Desk first; `crid music play <name>` selects a unique queued match rather than searching YouTube.
5. For actual YouTube playback, use the official playlist-player URL as its own visible, interactive Swae layer. The compact identity only reports now-playing metadata from public state.

*Accounting note:* Node currently discovers `api/test.mjs` because of its filename. The total is reported exactly as Node reports it; it is not 160 assertion-bearing tests.
