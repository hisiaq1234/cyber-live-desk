> Working spec kept with the code so an agent arriving cold can act on it. Read `CLAUDE.md` first.
> Crid is the owner's own Bitmoji: never redesign or generate him, never make him short.

# Crid's backpack — behaviour spec

He carries a backpack, drops it on the floor during the stream, and picks it up again later.
This is a continuity prop: it must remember where it was left, so a viewer who returns sees that
something happened while they were gone.

## The prop
- Drawn as **SVG inside `crid-bot.js`**, in the character's own palette (dark fabric, mint accent,
  bone straps). No photo, no generated bitmap, no new image budget.
- Sits on the **floor line** the scene already draws (`--bot-floor`), not on Crid's host box.
- Has its own contact shadow, tighter and darker than Crid's, so it reads as resting on the floor.
- Scale: about **0.45–0.55× his drawn width**. At 150 px phone scale it must still read as a bag
  (chunky body, two straps, one buckle) — test it there, not at 1920.

## The two beats
- `dropbag` — reaches back, shrugs one strap off, swings it down and lets go; it lands, settles with
  one small bounce. He keeps standing; no teleporting of the prop.
- `pickup` — walks to where the bag is, bends or crouches, takes the strap, swings it up onto one
  shoulder, settles. If the bag is off-screen he does not attempt it.

## State that survives
- The bag's **world position** (x on the floor, and whether it is worn) lives in the desk state, so a
  reload, a re-measure or a card shuffle does not teleport it back onto his shoulders.
- While worn it moves with him; while dropped it stays where it landed even as he roams.

## Triggers
- Cue names `dropbag` and `pickup`, added to `CUE_NAMES` in `crid-bot.js` **and** `BOT_CUES` in
  `api/_desk-core.mjs` (the cue-channel test keeps the two lists identical — do not break it).
- The brain's initiative loop may call either at a quiet moment: drop it early in a long quiet
  stretch, pick it up before he moves far or when he comes back into frame.
- The operator can drive both from `/control` with the same names.

## Rules
- Nothing may jump: no prop appearing mid-air, no bag sliding while he stands still.
- Reduced motion: the bag changes state, no bounce, no swing.
- Never block or overlap a card; if the floor space at his side is occupied, he waits.
- Judge at 150 px, 390 px and 1920×1080.
