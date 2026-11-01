# Cyber Live Desk — Swae overlay handoff

**Updated:** 1 November 2026

**Target:** 16:9 landscape Twitch stream through Swae. `/desk` is the public viewer overlay; `/control` is the operator surface.

## The reported 401

The public Swae widget URL is [https://cyber-live-desk.vercel.app/desk](https://cyber-live-desk.vercel.app/desk). I added unauthenticated `HEAD` support as well as `GET` because Swae's Web Address check can probe a page without loading it normally. On the corrected live deployment, both requests return **200**, and the HEAD response is empty. The operator APIs were not opened: a live unauthenticated request to `/api/desk/cards` still returns the expected **401**.

The Swae app itself is not available for me to press its widget Save/Test control, so please reload or reselect the `/desk` URL once in Swae. The route-side cause is fixed and verified; that final phone-side confirmation is still outstanding.

## What changed in the visual layout

The red orb is now a **31 px decorative `DIV`**, not a button: it has no button ancestor or role, is `aria-hidden`, cannot receive pointer events, and is not keyboard-focusable. In the live preview it sits beside the compact bottom-right news strip; the strip measured **238 × 37 px** in the inspected viewport and displayed a fresh headline, publisher, age and RSS label. The 16:9 camera area stays clear.

When music is marked as playing, the same small identity capsule is designed to show the current track title and artist while the news row remains visible. Only that now-playing identity metadata and a boolean playing state are sent to the public overlay; the queue, audio URLs, volume and mute controls are not. No music was active during the live DOM check, so the playing-state animation/display still needs a quick real-playback check.

This is an identity/now-playing display, **not** a miniature YouTube player or a new play/pause control. The existing official YouTube/YouTube Music playlist-player workflow stays as its own visible Swae web-page layer.

## Automatic news versus Gemini

The public strip now loads Nigeria Google News RSS automatically while `/desk` is open, refreshes periodically with a five-minute CDN cache, and shows only dated items from the last 12 hours with publisher and age. The live API returned **six** items and all six passed the freshness and HTTPS-source checks. A repeated response was served from Vercel's CDN cache. It does not require you to type headlines or manually import cards.

This automatic strip is RSS-based; **it does not send every headline to Gemini for verification**. The private, source-linked Gemini brief remains on-demand in `/control`; no background Gemini calls were added, so the ticker does not silently incur repeated API usage. If you want automated Gemini review of every item, that is a separate change with recurring API requests and possible charges.

## Deployment and checks

The code is pushed to `main`. Vercel marked the corrected release (`cc0b99c`) **Ready**. A Vercel runtime warning on the first attempt showed that the headline route's default export was incompatible with the Node function contract; I corrected it to match the working `fetch` export used by `/api/desk`, redeployed, and verified the live feed returns 200.

- [Open the public Swae overlay](https://cyber-live-desk.vercel.app/desk)
- [Open the operator page](https://cyber-live-desk.vercel.app/control) — operator-only actions still require the private token
- `HEAD /desk`: 200
- `GET /desk`: 200
- `GET /api/desk-headlines`: 200; six fresh RSS items; CDN returned `HIT`
- `GET /api/desk/state?since=-1`: 200; safe public state
- `GET /api/desk/cards` without token: 401, as intended
- `node --test`: **159 passed, 0 failed**; `node --check`: 36 files; `git diff --check`: clean

The 159 runner count includes 158 explicit test cases plus Node's file-discovery count for `api/test.mjs`. The detailed [test report](comprehensive-test-report.md) and updated [test-suite chart](test-suite-counts.svg) are included beside this handoff.

## Use it

1. In Swae, set the Browser Widget/Web Page URL to `/desk` above, then reload the saved widget to clear the earlier 401 check.
2. Keep that page open during the stream for automatic headlines. The ticker is intentionally source/date-aware and fails visibly rather than falling back to old news.
3. Add the official YouTube playlist player separately if you want playback. The compact capsule reports the now-playing state; it is not a full player.
4. Use `/control` for the private Gemini brief and operator controls. Keep its token private.
