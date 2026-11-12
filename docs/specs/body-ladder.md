> Working spec kept with the code so an agent arriving cold can act on it. Read `CLAUDE.md` first.
> Crid is the owner's own Bitmoji: never redesign or generate him, never make him short.

# Crid body ladder — rebuild spec (v3)

## Why

`public/desk-assets/crid/body-*-r7.webp` are **different Snap renders**, not one figure at different
weights: `000`/`00` face the camera, `3`/`0`/`5` are three-quarter turned, and `1`/`2` are turned
further with a visibly smaller head. So a stage swap changes the pose, the head size and the
silhouette — it reads as a different person, not the same man heavier. On top of that the outfit
(bare chest + yellow backpack straps + baggy camo cargos) makes the straps read as a second body
under him at small sizes.

## The fix is in the source, not in generated art

Snap's own renderer takes a **body** parameter and returns the same avatar in the same front-facing
pose at genuinely different builds. Verified at `scale=2`, `rotation=0`:

| body | ink width | ink height | note |
|---|---|---|---|
| 0 | 984 px | 2377 px | lean |
| 1 | 989 px | 2377 px | average |
| 2 | 1214 px | 2377 px | **short and heavy** — belly, thicker limbs, same head |
| 3 | 982 px | 2377 px | average |
| 4 | 984 px | 2377 px | average |

## The owner's rule: never short

The owner has said it plainly — *he is never short*. So:

- **Height is fixed across every stage.** Top of head and ink bottom sit at the same y on every
  stage. `body=2` comes out at the same raw ink height but reads short because its legs shorten and
  its torso thickens; if it is used at all, it must be normalised so the top of the head and the
  soles land exactly where they do on the lean stage, and the comparison sheet must prove it.
- **Head size is fixed.** No stage may show a smaller or larger head than the lean stage. This is
  what made the old ladder read as different people.
- **Weight = width.** A heavier stage is wider through torso, hips, arms and legs at the same height,
  same pose, same outfit.
- **Acceptable ground truth: `body=0` (lean) and `body=1` (average).** A third, heavier stage is
  welcome only if it holds height and head size; if it cannot, ship two stages and say so in the PR.
  Two honest stages beat three where one is a different person.
- Anything between stages is a small (±4 %) warp of the neighbouring render, never a new drawing.

## Exact source recipe (front-facing, no clothes)

`https://preview.bitmoji.com/avatar-builder-v3/preview/body?scale=3&gender=1&style=5&rotation=0`
plus:
`beard=2212 brow=1555 cheek_details=1356 ear=1423 eye=1614 eyelash=-1 eye_details=1352
face_lines=1366 glasses=-1 hair=1657 hat=-1 jaw=1392 mouth=2337 nose=1482
beard_tone=0x181b1a blush_tone=16754088 brow_tone=0x181b1a eyeshadow_tone=-1 hair_tone=0x272b2a
hair_treatment_tone=0x332b28 lipstick_tone=16740668 pupil_tone=0x5b341c skin_tone=0x935d37
face_proportion=13 eye_spacing=0 eye_size=2 body=<0|1>`

**No `outfit` parameter.** The owner's direction is *no cloth*: he renders as the base body, with no
camo cargos, no tee, no straps and no shoes. Omit it entirely — `outfit=-1` is rejected with HTTP 400,
and the old camo outfit id `990491` must not be passed any more. Send the `*_tone` values as decimal
integers; writing them as hex strings in the URL also gets you a 400 with an empty body.

The same recipe is machine-readable in `docs/crid-avatar-params.json`.

`rotation=0` is the front view — this is the whole point. The shipped set used `rotation=7`.

## Resolution: render a 2x master, cut the rig from the master

`scale` in the renderer is not a multiplier above 2 — measured today:

| scale | image | ink |
|---|---|---|
| 2 | **2100x2800** | 994x2374 |
| 3 | 1050x1400 | 496x1187 |
| 5, 6 | 1050x1400 | 496x1187 |
| 4 | HTTP 500 | — |

So **scale=2 is the biggest the renderer gives** and everything else is the small frame. Render the
master at `scale=2` (2100x2800, no outfit) and treat it as the source of truth:

- **Cut the rig from the 2100x2800 master**, not the shrunken sprite — limb edges are clean at 2x, and
  the cut-out is what makes the walk / climb / carry poses not look like a different person.
- **Derive the desk sprite by downscaling the master to 1050x1400** (LANCZOS), so the sprite is
  supersampled and stays crisp at 150 px.
- Keep the framing rule on the 1050x1400 sprite: ink bottom y=1325, axis x=560, and the same head-top
  and sole line on every stage.

Detail the owner asked for is in the master: hair texture, earring, moustache, eye whites, the line
between arm and torso. If any of that is mush at 150 px, the silhouette or the outline is wrong — not
the resolution.

## Deliverables

1. `body-0-r0.webp`, `body-1-r0.webp` (and `body-2-r0.webp` only if it passes the height rule) at
   **1050×1400**, ink bottom on **y=1325**, mid-torso on **x=560** — the framing the renderer already
   assumes (`INK_BOTTOM`, `FIG_X/FIG_Y` in `crid-bot.js`).
2. `ladder.json` re-measured from the new frames.
3. The cut-out rig rebuilt from **`body-0-r0.webp`** with `scripts/build-crid-rig.py`, so the limbs
   and the flat drawing are the same drawing at the same pose.
4. A comparison sheet: every stage at 336 px wide and again at **150 px wide** (phone scale) — if the
   lean one's limbs disappear at 150 px, the silhouette is wrong and the stage needs a bolder
   outline, not thinner art. The sheet must show head tops and feet on the same two lines.

## Rules

- The character is the owner's Bitmoji. Do not redesign his face, hair, moustache or colouring; the
  mini-me (`public/desk-assets/otolorin-mini-me.png`) is the reference.
- No AI-generated body: the body comes from Snap. Generated images are for props only (backpack,
  headphones, chair, desk lamp) and for scene art.
- Max 6 generated images in this task, one revision pass.
