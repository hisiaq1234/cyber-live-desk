# Progress

A running record of what is live, what is in flight, and what is waiting on the owner.
Written for the owner and for whoever picks the work up next. Updated as work lands.

**CRID's own status, tests and next build order: [`docs/CRID-STATUS.md`](docs/CRID-STATUS.md).**

_Last updated: 2026-11-11._

## Live and verified on the real deployment

**Crid's initiative works on the live desk.** `api/brain-tick.mjs` steps the existing
`InitiativeEngine` once per call and writes whatever it emits into the desk state as a cue. An
external pinger (`.github/workflows/brain-tick.yml`) calls it every 5 minutes, because the free
Vercel plan will not accept a cron more frequent than daily.

Confirmed against `https://cyber-live-desk.vercel.app/api/brain-tick`: 401 with no bearer, 200 with
it, and a real tick fired `micro-emotion:sleepy` — _"quiet — why: no chat for 25s"_ — writing
`{"name":"sleepy"}` into the desk state. Ticks that emit nothing are correct: the engine's silence
rules and cooldowns mean it acts on its own schedule, not on every call.

Two things worth knowing:

- Vercel only gives a newly added environment variable to a **new** deployment. `CRON_SECRET` sat
  unused until a redeploy; an empty commit on `main` (13f2c75) is what triggered one.
- A cue only plays on screen when Crid is summoned. The bot starts in `mode="dead"` and every
  gesture is gated on that, so an idle desk shows nothing however busy the brain is.

## In flight

**Crid rig at rest + brand overlay mount** (branch `fix/crid-rig-rest-brand`, unmerged). Targeted fixes for two gaps on `main` (`ee25427`):

- **Rig at rest:** `public/desk-assets/crid-bot.js` only animated the cut-out rig while a step was travelling (`walk && walk.to`, base body `000`), showing the flat drawing between steps/at rest. Now the rig runs at rest for base body `000` when not leaning, at reduced amplitude on a slow idle cycle (walk uses full step amplitude/phase); render dirty-signature includes phase/amp so idle animation advances. Rig still only applies to base stage `000` and not while leaning; other body stages remain flat drawings.
- **Brand overlay:** `public/desk-assets/overlay-brand.js` (`/desk?overlay=brand|variant=brand|brand=1`) is a skin over `overlay.js` and mounts no CRID of its own — it adopts the single one the main renderer creates (`window.DeskOverlay.crid`), so brand mode has one `#crid-bot` (fixed on `fix/brand-single-crid`; see `docs/CRID-STATUS.md`).
- **Tests:** added `tests/crid-rig-rest.test.mjs` (rig visible at rest, joints move). Fixed `tests/crid-bot.test.mjs` sprite-size scan to ignore directories (e.g. `public/desk-assets/crid/rig/`) so it inspects real sprite files only.
- **Verification:** targeted tests/syntax checks pass locally (see branch diff/test run); full suite and actual browser-overlay verification (`/desk`, `/desk?overlay=brand`, walk/lean/gestures/non-`000` stages, `?bot=0`) still required before merge.

**A cut-out rig for Crid's body** (PR #28, branch `crid-cut-out-rig`). Slices the existing render at
shoulder, elbow, hip and knee and pivots the pieces, so the walk is a walk: one leg planted and
vertical with its foot on the floor line while the other lifts ~80px, folds at the knee and comes
down; the chest rises over the carrying foot and the shoulder line tips against the hip line. The
flat drawing is hidden while the rig is drawn, so there are no longer two pairs of legs.

Not merged. Rotating joints expose their cut edges — a hairline at rest, a wedge gap at the knee and
crotch once a leg lifts. At the 2.5× the owner streams (850 CSS px against a 1050 px master) that is
visible on stream. A seam pass is in flight: overlap each piece past its cut, pad with its own edge
colour, paint upper pieces over lower.

## Owner direction not yet built

The owner supplied reference files for all of these; they are in `docs/reference/`.

1. **The Black Market timestamp is in the wrong place.** The live desk draws `#time-dock` bottom-left
   at a given size. The owner's reference frame shows it drawn twice — the current one, and an older,
   larger, lower one he wants back. **Waiting on the owner to confirm which of the two is the one he
   wants.** His original standalone widget is `docs/reference/black-market-timestamp.html`.
2. **The right-hand side has moved too.** The location readout doubles the same way in his frame, and
   the old version showed different information: coordinates (`6.5252° N, 3.3673° E · 2.2m`) where the
   current one shows street, area and `±9m`. Which one he wants is an open question.
3. **Dual camera.** The stream runs two camera feeds side by side with a split down the centre. The
   current layout puts the clock bottom-left, the radar bottom-right and the logo top-centre, so the
   logo straddles the split and the radar crosses it. The layout has to keep each feed's half clear.
   The split ratio is an open question.
4. **The goat sting is not playing.** The owner's original is a Lottie animation — `docs/reference/lottie-logo.html`
   loading `docs/reference/lottie-logo.json`, v5.7.0, 1920×1080, 146 frames — whose mark is a goat.
   That data is already shipped in the repo as `public/desk-assets/logo-motion.js`, and the goat asset
   is intact inside it (`logo-sting.js` defaults to `mark = "goat"`). But the live desk is drawing the
   vector fallback in `logo.js`, which always draws the robot. Making the sting the thing that actually
   plays is the fix.
5. **The X news panel.** `index-biybl5ta.js` and `index-p0keguo4.css` in the owner's drop are the built
   React X overlay, and it is meant to replace the desk's existing X feed. It calls two endpoints this
   repo does not have — `GET /api/x-timeline/feed` and `POST /api/x-overlay/control`. The contract is in
   `/home/team/shared/x-overlay-contract.md`. The server side can be built over the existing
   `api/x-feed.mjs` rather than a second X client. The panel's own UI cannot be changed: the drop is
   build output with no source.

## Known broken, not yet fixed

- `tests/x-feed-client.test.mjs` — "the empty catch is gone" fails against
  `public/desk-assets/x-feed-client.js:42`. It closes when the old X feed is deleted, which the X
  overlay replacement does.
- `public/desk-assets/crid-logo.png` does not exist, so the CRID badge falls back to text.

## Waiting on the owner

- Which timestamp plate he wants (item 1) and which location readout (item 2).
- The dual-camera split ratio (item 3).
- The React source for the X overlay, if its UI is to change at all (item 5).
- The Twitch EventSub subscription and its environment variables (`DESK_OPERATOR_TOKEN`,
  `TWITCH_WEBHOOK_SECRET`, `TWITCH_BROADCASTER_USER_ID`), and `X_BEARER_TOKEN`.
