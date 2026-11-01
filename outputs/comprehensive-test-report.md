# Cyber Live Desk — Production, Swae & Test Report

**Updated:** 1 November 2026

**Project:** `cyber-live-desk`

**Test command:** `node --test`

**Runtime:** Node.js 24 on Windows

![Node test-run distribution by discovered test file](test-suite-counts.svg)

## Executive result

The latest full run passed **159 / 159 runner-counted items**: 158 explicit `test()` cases plus one Node file-discovery item for `api/test.mjs` (that route module contains no assertion). There were 0 failures, skips, cancellations, or todos; duration was **15.27 seconds**. JavaScript syntax checks passed for all **36** `.js`/`.mjs` files under `api/`, `public/`, and `tests/`; `git diff --check` was clean.

The production release now serves the landscape Swae overlay, an automatically refreshing Nigeria RSS headline ticker, and a compact music/news identity cluster. The earlier Swae 401 was addressed by making the public `/desk` route answer `HEAD` as well as `GET`. A separate Vercel export-contract problem initially caused the headlines function to time out; that was corrected and then verified against the live production domain.

## Test distribution

| Test file | Runner-counted items | Coverage |
|---|---:|---|
| `api/test.mjs`* | 1 | Node file-load discovery; no assertion in this route module |
| `tests/brief.test.mjs` | 6 | Freshness parsing, Gemini grounding metadata, private brief, citations and sources |
| `tests/brief-guards.test.mjs` | 3 | X opt-in, actual Search grounding, focused deeper research |
| `tests/desk-bulk-research.test.mjs` | 12 | Research approvals, ingestion, capacity and source handling |
| `tests/desk-commands.test.mjs` | 9 | Command grammar, parser parity, polling and deeper-angle parsing |
| `tests/desk-core.test.mjs` | 95 | Desk state/actions, CRID audio/mute, public projection and music privacy |
| `tests/desk-headlines.test.mjs` | 3 | 12-hour filtering, safe RSS items, cache and Vercel fetch-handler contract |
| `tests/desk-hotkeys.test.mjs` | 2 | Explicit shortcut mapping and safeguards |
| `tests/desk-route.test.mjs` | 2 | Public `/desk` GET/HEAD and private operator-route authorization |
| `tests/overlay-audio.test.mjs` | 5 | Audio synchronization, mute/source cleanup, end state and autoplay rejection |
| `tests/sound-orb.test.mjs` | 4 | Compact/active states, mute/volume, buffering/end and listener cleanup |
| `tests/twitch-eventsub.test.mjs` | 11 | Signature, authorization, deduplication and command path |
| `tests/x-feed.test.mjs` | 3 | Official X v2 endpoint, bounded parameters and validation |
| `tests/youtube-playlist.test.mjs` | 3 | Official playlist URL and unsafe-source rejection |
| **Total reported by Node** | **159** | **158 explicit tests + 1 route-module discovery** |

## Production verification

| Check | Result | Evidence |
|---|---|---|
| Vercel production build | **Ready** | Code-corrected release `cc0b99c` on `main` was marked Ready. |
| Public Swae URL | **PASS** | `GET /desk` and `HEAD /desk` both returned HTTP 200; HEAD had an empty body. |
| Automatic headline API | **PASS** | `GET /api/desk-headlines` returned HTTP 200 with 6 Nigeria-region headlines; all 6 had publisher/date metadata, HTTPS URLs, and publication times within the 12-hour window. A repeated live request showed `x-vercel-cache: HIT` and `Age: 186` seconds. |
| Public overlay state | **PASS** | `GET /api/desk/state?since=-1` returned HTTP 200; no music queue or stream URL was exposed. No music was active at the time of this live check. |
| Operator gate | **PASS** | `/control` returned HTTP 200; unauthenticated `GET /api/desk/cards` returned the expected HTTP 401. |
| Live overlay DOM | **PASS** | Orb is a 31 × 31 px `DIV`, `aria-hidden`, not inside a button, `tabIndex=-1`, and `pointer-events:none`. The ticker rendered as a 238 × 37 px lower-right panel with a current headline, publisher, relative age and RSS label in the tested viewport. |
| Swae phone capture | **NOT TESTED ON DEVICE** | The public HEAD fix matches the reported Web Address probe; a final check inside the Swae app is still needed to confirm its saved widget state/crop. |
| YouTube playback/audio rights | **NOT VERIFIED** | The official playlist helper creates a visible player URL but does not guarantee Swae audio capture or grant broadcast rights. |

### Production incident and correction

The first production build of `176ff86` showed Ready, but Vercel runtime logs revealed that it treated the new headlines endpoint as a Node-style default function and ignored the returned Web `Response`, eventually timing out. The route was changed to the same `export default { fetch: handler }` contract as the working `/api/desk` route. Commit `cc0b99c` deployed Ready, and the live headlines API then returned six fresh items successfully. Regression tests now import and exercise that exact fetch-style export.

## Overlay behavior and privacy

The visual cluster sits in the lower-right region and keeps the camera view clear: a compact red-core/black-shell orb with a blue-black sheen beside the narrow news strip. The orb is decorative, never a button, and reacts to actual player/audio state rather than microphone input or waveform analysis. It remains small while idle and expands/pulses only for its active audio state, subject to reduced-motion settings.

When the public music state says a track is playing, the same compact capsule can show the current **title and artist** while preserving the rotating headline and source/age line. The live production state had no active track during inspection, so that visual transition was not physically exercised in the browser. A regression test verifies the public state exposes only `{ current: { title, artist }, playing }`; it does not expose the music queue, stream/audio URLs, volume or mute controls.

The RSS strip is automatic while the overlay page is open. It uses public Google News Nigeria RSS, filters out undated, unsafe, future-dated and older-than-12-hour entries, shows publisher and relative age, and refreshes on the overlay's periodic poll with a five-minute CDN cache. If fresh items cannot be fetched, the UI reports unavailability rather than silently reusing old headlines. This strip is **RSS headline display, not Gemini verification**. The existing Gemini-grounded private brief remains a separate operator-requested action; no recurring Gemini calls were added, avoiding hidden API use or charges.

The orb/music identity is a now-playing display, **not** a miniature YouTube player with play/pause controls. The official visible YouTube/YouTube Music playlist player remains a separate Swae web-page layer and does not scrape or extract audio.

## Research, safety and cost notes

The private research flow remains on-demand in `/control`: dated RSS context plus Gemini Google Search grounding, source links, freshness/corroboration limits, counterpoints and an explicit warning when evidence is thin. It is not sent to Swae chat or the public overlay. Search grounding is not guaranteed free; quota and billing depend on the configured Google project. X lookup remains opt-in per brief. The always-on headline strip itself uses the public RSS endpoint and does not invoke Gemini.

The production `/desk` page is public by design. Operator-only actions still require `DESK_OPERATOR_TOKEN`; a 401 from `/api/desk/cards` without that token is expected and must not be “fixed” by making those APIs public.

## Changed files in this pass

| File | Purpose |
|---|---|
| `api/desk.mjs` | Public `HEAD /desk` support without relaxing operator API authorization |
| `api/_headlines.mjs` | Nigeria RSS parsing/fetch with a strict 12-hour freshness window |
| `api/desk-headlines.mjs` | Public cached headline endpoint using Vercel's fetch-handler export contract |
| `api/_desk-core.mjs` | Public music projection limited to now-playing title, artist and playing state |
| `public/desk-assets/overlay.js` | Compact orb/music/headline cluster, automatic lower ticker and reduced-motion behavior |
| `public/desk-assets/control.js` | Accurate wording distinguishing automatic RSS display from unconfigured recurring card imports |
| `tests/desk-route.test.mjs` | Swae GET/HEAD and private-route authorization regressions |
| `tests/desk-headlines.test.mjs` | Freshness/source/cache/handler-contract regressions |
| `tests/desk-core.test.mjs` | Music metadata privacy regression |

## Operator steps

1. In Swae, use `https://cyber-live-desk.vercel.app/desk` as the landscape Browser Widget/Web Page URL. Its public `HEAD` and `GET` probes both return 200; reload/update the saved Swae widget once so it retries the corrected route.
2. Keep `/desk` open during the stream to display the automatically refreshed, timestamp-filtered RSS ticker. Headlines show source and age; they are not Gemini-reviewed.
3. Use the private `/control` page for the operator workflow and the existing on-demand Gemini brief. Keep the operator token private; do not paste it into the Swae public overlay URL.
4. For actual music playback, use the official playlist-player URL as its own visible, interactive Swae layer. The compact identity only reports now-playing metadata from the public state.

*Accounting note:* Node currently discovers `api/test.mjs` because of its filename. The total is reported exactly as Node reports it; it is not 159 assertion-bearing tests.
