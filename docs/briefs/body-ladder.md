# Crid body ladder — first task

## Goal
Make Crid's physical progression genuinely visible on stream. The owner's words: "he really has to show him lanky when lanky"; at extreme subscription levels "he gets so obese that it's obvious", so large he falls onto his back, rolls over, does push-ups and calisthenics, goes to the gym and builds himself back. A GTA San Andreas-style body system: the body changes shape over time in both directions.

## What exists (verified)
- `public/desk-assets/crid/body-{000,00,3,0,5,1,2}-r7.webp` — seven frames, all 600x800.
- `public/desk-assets/crid-bot.js`: `BODIES=["000","00",3,0,5,1,2]`, `SUB_STEPS=[0,4,8,12,16,20,24]`, `STAGE_STRETCH=.06`, `ROT=7`.
- Measured ink widths in ladder order: 251, 252, 250, 255, 257, 261, 294 px. Ink height is 688/684 px in every frame.
- Three of the five older frames sit within 2 px of each other, so a stage change is invisible.
- `views/` holds the masters: `shape-{0,1,2,3,5}.png` (1050x1400) and `angle-{1..8}.png`. `fetch-crid-views.mjs` and the `libmoji` dependency are how the renders were produced.
- The renderer already handles body swap, walk/roam, flights and gestures.

## Required outcome
1. Consecutive stages must be visibly different **at desk size**, not just in pixels. Decide the mechanism and justify it in your report: more distinct masters, a real scale ladder (height and width), or both. Height is currently frozen at 688 px on purpose — the owner now wants size itself to change.
2. The top of the ladder is dramatically larger and visibly obese. The bottom must read as lanky.
3. Body state must drive movement: gait, walk speed, gesture weight and how he handles objects should follow the stage.
4. Keep the invariants: feet stay on the same ground line, the body stays centred, and a swap must not jump sideways. Shirtless and backpack always; accessories are separate variants.
5. Do not import character art or design from older projects. Crid is the owner's Bitmoji.

## Verification (report all of it)
- Ink bounding box width and height per stage, measured with a script, not by eye.
- Minimum pairwise difference between consecutive stages — state the number and the threshold you chose.
- A side-by-side sheet at real desk size, saved under `/home/team/shared/`, that the owner can look at.
- `node --test` passing, and the existing tests that assert sprite framing still honest (update them if the design legitimately changed, and say so).

## If blocked
If the masters cannot produce a real ladder without new renders, say exactly what is missing (which Bitmoji renders, at what scale/angle) and implement the best available ladder in the meantime. Do not invent art.
