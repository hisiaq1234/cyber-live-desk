# Brief — the cue channel: let the brain make Crid move on the live stream

**Why.** Crid's body already knows 18 gestures and 10 micro-emotions, and they render in `brain/overlay.js`
— a page that is not the stream. The desk overlay (`public/desk-assets/overlay.js`) renders from
`/api/desk/state` and has no way to be told "wave now". So everything he can do is invisible on air.
This is the smallest change that makes the whole existing vocabulary reachable from the stream.

**Do not build a command bus.** The desk page already polls `/api/desk/state` every tick and calls
`bot.observe(state)`. Use that. A new WebSocket or `/api/desk/command` route is not wanted.

## What to build

1. **A one-shot cue field.** `state.bot.cue = { name, at }` where `at` is a monotonically increasing
   stamp or counter minted by whoever posts it. Accepted `name` values are the `SEQ` keys plus the
   micro-emotion names already in `crid-bot.js`. An empty/absent cue means nothing to do.
2. **Desk side.** In `public/desk-assets/overlay.js`, on each poll, if `cue.at` differs from the last
   one seen, run that sequence through the existing renderer and remember the stamp. A cue that
   arrives while another is playing is **queued behind it or dropped** — never stacked or interleaved.
3. **Posting side.** One small helper the brain can call to mint `{ name, at }` into desk state, going
   through whatever write path `/api/desk/action` already uses. Auth stays `Bearer DESK_OPERATOR_TOKEN`.
4. **Two bugs to fix while you are in there**, both confirmed by reading:
   - `BOT_REACTS` advertises `gift` and `bits`, but `SEQ.gift` and `SEQ.bits` do not exist, so those
     reactions render nothing. Either implement them from existing frames or remove them from the
     advertised list — do not leave a name that silently does nothing.
   - `bot.say()` and `feel()` are never called on the desk page. Make `say` a cue too, so the brain can
     make him speak a line on stream.

## Constraints

- Crid's art does not change. **No new images, no new drawings, no regenerated frames** — this brief
  touches no pixels. The body ladder that just merged is the body; do not touch the webps or
  `ladder.json`.
- Nothing may disturb the stream: a cue must never clear, remount or reflow the overlay, and a cue
  arriving mid-walk must not teleport him.
- Unknown cue names must be ignored without throwing.

## Prove it

Extend `tests/crid-bot.test.mjs` (or a sibling) so a test posts a cue into desk state and asserts the
desk overlay picks it up exactly once, ignores a repeat of the same stamp, and ignores an unknown
name. Then say plainly in your report: what a real cue does on `/desk` when you posted one, and what
you could not verify without a live stream.
