> Working spec kept with the code so an agent arriving cold can act on it. Read `CLAUDE.md` first.
> Crid is the owner's own Bitmoji: never redesign or generate him, never make him short.

# Crid on the live desk — visual diagnosis (2026-11-12)

> **Status update (later):** T1 shipped (`scene.js`, `?bg=0` keeps OBS transparent). T2 is half
> done — the ladder is now seven rotation-0 builds of one render (`body=3,0,4,5,1,11,2`, see
> `body-ladder.md`) and the rig is re-cut from `body-3-r0.webp`, but only the lean stage is
> articulated; heavier stages still draw flat. The stale quote in item 3 refers to the old
> rotation-7 ladder, since replaced.

Inspected: `https://cyber-live-desk.vercel.app/desk` at 1920×1080 in a browser, the live DOM,
the live `crid-bot.js` against `origin/main`, and every sprite in `public/desk-assets/crid/`.
Screenshots: `screenshots/live-desk-now.png`, `screenshots/crid-assets-sheet.png`.

**Live is current.** Live `crid-bot.js` is byte-identical to `origin/main` (72,740 B). Nothing on
the list is waiting on an unmerged branch — this is the newest code, judged as it looks.

## What is actually wrong (in order of what the eye sees)

1. **The white space is the page, not Crid.** `api/desk.mjs:75` serves
   `html,body{margin:0;background:transparent}` because `/desk` is an OBS overlay. There is no
   scene layer anywhere in the repo — no backdrop, no horizon, no floor, no furniture. On air over
   a stream that is correct; in a browser it is a white void with three cards. This is the single
   biggest reason he reads as "standing alone".

2. **He has no ground.** `--bot-floor` is computed from the cards' tops, so he hovers at the right
   height, but nothing on screen says "floor". A drop-shadow with no surface under it reads as a
   sticker. He is 224 px wide in a 1280 px frame (17.5vw) with nothing to be small *against*.

3. **Only one body in the ladder is rigged.** `crid/rig.mjs`, first line:
   "body-000-r7.webp is the only stage with a rig; every other body in the ladder is still the
   flat drawing." `crid-bot.js` hides the flat drawing and shows the rig pieces for walk, crawl,
   climb, push-up and the gestures. So the moment he moves with joints, a fat stage (1, 2, 5) is
   swapped for the lanky 000 body mid-move. That is the "broken / disconnected / not the same
   character" effect — not a broken joint, a *different person's* limb.

4. **He is drawn at rotation 7 — three-quarter turned — with a painted face.** That is the Snap
   render as shipped, but the mini-me is front-facing and flat. At 3/4 with a baked face he never
   looks at camera and cannot blink or talk by swapping a face: `eyes-*/mouth-*` (600×800 crops)
   were retired precisely because they never registered and produced a ghost face. So today
   "emotion" is a body swap plus a motion beat, which is why it feels like sprite swaps.

5. **Not wrong, worth saying:** the character *is* the owner's Bitmoji, the rig pieces are real
   crops that reassemble pixel-perfect, and the lanky→heavy ladder is real (307 px of ink to
   822 px, driven by subs). The design intent is right; the staging and the rig coverage are not.

## Task breakdown (small, in order)

- **T1 — a world to stand in.** Scene layer behind the cards: navy-to-black gradient, faint cyber
  grid, horizon glow, floor line at the height `--bot-floor` already uses. `?bg=0` keeps the
  OBS-transparent overlay. *Delegated.*
- **T2 — one Crid, one rig.** Re-render him front-facing (rotation 0) from the same avatar, then
  rebuild the ladder *and* the rig from that single render so every stage has matching limbs.
  Delete the 3/4 sprites and the unregistered eye/mouth crops. This is what stops the joints
  looking disconnected.
- **T3 — stage him.** Contact shadow on the floor line, scale against the room rather than 17.5vw,
  and an idle that carries weight (shift, glance, a step) so he belongs to the frame.
- Then the behaviour the owner described — wandering, reading, the backpack, accessories by day —
  on top of a character that already reads as alive standing still.
