# Progress

A running record of what is live, what is in flight, and what is waiting on the owner.
Written for the owner and for whoever picks the work up next. Updated as work lands.

**CRID's own status, tests and next build order: [`docs/CRID-STATUS.md`](docs/CRID-STATUS.md).**

_Last updated: 2026-11-12._

## Live and verified on the real deployment

**Crid's initiative works on the live desk.** `api/brain-tick.mjs` steps the existing
`InitiativeEngine` once per call and writes whatever it emits into the desk state as a cue. An
external pinger (`.github/workflows/brain-tick.yml`) calls it every 5 minutes, because the free
Vercel plan will not accept a cron more frequent than daily. `desk-auto-research` has the same
pinger (`.github/workflows/auto-research.yml`, every 15 minutes).

Confirmed against `https://cyber-live-desk.vercel.app/api/brain-tick`: 401 with no bearer, 200 with
it, and a real tick fired `micro-emotion:sleepy` — _"quiet — why: no chat for 25s"_ — writing
`{"name":"sleepy"}` into the desk state. Ticks that emit nothing are correct: the engine's silence
rules and cooldowns mean it acts on its own schedule, not on every call.

Two things worth knowing:

- Vercel only gives a newly added environment variable to a **new** deployment. `CRON_SECRET` sat
  unused until a redeploy; an empty commit on `main` (13f2c75) is what triggered one.
- The bot no longer starts dead: the first state whose `bot.on` is not `false` summons him
  (`crid-bot.js` `observe()`), so an idle desk shows a living Crid, not a still frame.

**The local brain can now reach the stream.** `brain/index.mjs` wraps every engine action in the
cue channel (`brain/cue.mjs` → `POST /api/desk/action` → `state.bot.cue`) using the same
envelope→cue table the serverless tick uses (`brain/cue-map.mjs`, shared — no second vocabulary).
Run `npm run brain` with `CRID_DESK_URL` and `DESK_OPERATOR_TOKEN` set and the full 18-rule engine,
500 ms reactions and all eight micro-emotions perform on the live desk instead of only on the
local overlay page. Without those two variables the channel stays off and says so once.

## Landed since the last handoff

- **CRID works a shift** (`feat/crid-shift-routine`): spec slice 2 of
  `docs/specs/behaviour-drives.md`, page-side. Lagos day-plan slots move scores and drive
  rates, the stream arc is inferred from desk/chat signals (arrival → wind-down → closed),
  an `env()` seam carries the §5.3 modifiers, and the catalogue grew to ten activities —
  doze, read-card, check-map and workout on verbs that already existed. The live activity
  and arc stamps persist through `state.bot.being`, so a reload continues the same shift.
  `say` lines queue (CRID-STATUS gap 5 closed), and `scripts/serve-desk.mjs` now answers
  HTTP range requests so the PMTiles plate loads in local QA (probe console is clean).
- **Rig at rest + brand overlay** (`d1f93d3`, `ee25427`, `91cafe6`): the cut-out rig animates a
  living idle on base body `000` (not only mid-stride), and `/desk?overlay=brand` is a skin over
  the main renderer.
- **One CRID on brand** (`4e8cc7b`, PR #30): brand mode adopted `window.DeskOverlay.crid` instead
  of mounting a second `#crid-bot`; contract test keeps it that way. See `docs/CRID-STATUS.md`.
- **The doubled hand is gone** (`46f98a4`): the rig slicer only read the outermost ink run per
  row, so finger-notched second runs of each hand fell through to the torso/thigh pieces — 366 px
  of hand stayed behind when the arm swung. `in_arm()` now claims every run inside `HAND_W` of the
  outer edge; pieces rebuilt, `--check` still proves coverage and sealed joints.
- **He visits the furniture** (`46f98a4`): every ~40–95 s of quiet he walks to a random visible
  layer, leans (sometimes pondering), and drifts home — first visit ~30–45 s in. Uses the existing
  `walkTo`/`lean`/`unlean` verbs and the desk's layer registry; hidden panels are never picked.
- **Logo sting loops like the source** (`a9869bb`): the Lottie plays its full 146-frame loop and
  parks on the finished frame; the old code froze it mid-assembly at frame 101.
- **Standing idle reads as alive** (`d77718b`, `a9869bb`): idle amplitudes raised to survive the
  ~0.19× shrink to screen, and the whole-body "lollipop" sway stands down while the rig owns the
  weight shift.
- **Suite is green**: 441/441 (`node --test`), including the previously failing empty-catch test.
- **Micro-emotions can play again** (`brain/engine.mjs`): `tick()` gated them on an empty winner,
  which a quiet stream never produces — they are an ambient layer with their own pacing and now
  run every tick. `personality.ambient()` also takes the engine's seeded rng, so `--seed` demos
  reproduce fully.

## In flight

**Live map plate (D3).** The radar plate is a snapshot camera — centre follows the location source
but there is no player marker, accuracy circle or rotation. The aim describes the Cyber Radar
behaviour (marker centred, map moves underneath, real GPS). This is the largest remaining gap
against `AIM-OF-EXISTENCE.md`.

**Place names from coordinates (D4).** `nearestPlace()` still only returns a `?place=` name;
`public/tiles/unilag.pmtiles` already ships, so a real lookup is possible and unimplemented. The
clock topline still falls back to the literal "Black Market" when no place is supplied.

**The deployed tick still starves the brain.** `api/brain-tick` gets no chat events, so most
rules cannot fire there and it mostly posts silence lines. The local brain (above) is the fix;
whether the serverless tick stays as a fallback or is retired is an open decision.

## Owner direction not yet built

The owner supplied reference files for all of these; they are in `docs/reference/`.

1. **The Black Market timestamp is in the wrong place.** The live desk draws `#time-dock` bottom-left
   at a given size. The owner's reference frame shows it drawn twice — the current one, and an older,
   larger, lower one he wants back. **Waiting on the owner to confirm which of the two is the one he
   wants.** His original standalone widget is `docs/reference/black-market-timestamp.html`.
2. **The right-hand side has moved too.** The location readout doubles the same way in his frame, and
   the old version showed different information: coordinates (`6.5252° N, 3.3673° E · 2.2m`) where the
   current one shows street, area and `±9m`. Which one he wants is an open question.
3. ~~**Dual camera.**~~ Built on this branch: default `scene=split` is a 50/50 side-by-side
   HUD safe-zone layout. Black Market clock and minimap stay in the left half; location readout and
   live modules stay in the right half. Swae/OBS still supplies and positions the actual camera feeds.
4. ~~**The goat sting is not playing.**~~ Fixed — `a183584`, `ab7472c`, `a9869bb`: the lockup plays
   the operator's goat Lottie, looped, with the vector fallback only when the sting cannot.
5. **The X news panel.** `index-biybl5ta.js` and `index-p0keguo4.css` in the owner's drop are the built
   React X overlay, and it is meant to replace the desk's existing X feed. It calls two endpoints this
   repo does not have — `GET /api/x-timeline/feed` and `POST /api/x-overlay/control`. The contract is in
   `/home/team/shared/x-overlay-contract.md`. The server side can be built over the existing
   `api/x-feed.mjs` rather than a second X client. The panel's own UI cannot be changed: the drop is
   build output with no source.
6. **The thoughts layer.** `AIM-OF-EXISTENCE.md` says it already exists and must be recovered, not
   rebuilt — but this repo's history contains no such artifact (only the Thought War card deck).
   The nearest things are the pondering pose, `?staging=1` and the eight micro-emotions. **Waiting on
   the owner to say which he means** before anything is built.

## Waiting on the owner

- Which timestamp plate he wants (item 1) and which location readout (item 2).
- What the "thoughts layer" refers to (item 6).
- The React source for the X overlay, if its UI is to change at all (item 5).
- `CRID_DESK_URL` + `DESK_OPERATOR_TOKEN` in the brain's environment to take the cue channel live,
  and the Twitch EventSub variables (`DESK_OPERATOR_TOKEN`, `TWITCH_WEBHOOK_SECRET`,
  `TWITCH_BROADCASTER_USER_ID`), and `X_BEARER_TOKEN` in Vercel.
