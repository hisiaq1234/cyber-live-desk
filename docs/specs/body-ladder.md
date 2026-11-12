> Working spec kept with the code so an agent arriving cold can act on it. Read `CLAUDE.md` first.
> Crid is the owner's own Bitmoji: never redesign or generate him, never make him short.

# Crid body ladder — spec (v4, shipped)

## What ships today

Seven stages, lean -> heavy, all front-facing renders of the **same** avatar at `rotation=0`:

| stage key | Snap `body=` | build |
|---|---|---|
| 3 | 3 | leanest |
| 0 | 0 | lean |
| 4 | 4 | light |
| 5 | 5 | average |
| 1 | 1 | full |
| 11 | 11 | heavy |
| 2 | 2 | heaviest (belly, thicker limbs) |

Snap's renderer only produces these seven distinct builds at rotation 0 — `body=4/6/7/8/9/10/12`
all return the same picture as `body=4`, and `00`/`000` clamp to `body=0`. There is no eighth stage
to fetch; growth *between* stages is the renderer's own sub-step stretch (`SUB_STEPS` in
`scripts/build-body-ladder.py`, mirrored in `crid-bot.js`), never a new drawing.

## Why it is built this way

- **One render, one pose.** Every stage is the same Snap render parameters with only `body=`
  changed, so head, face, stance, height and ground line are identical pixels. The old ladder
  mixed rotation-7 renders and read as different people; that is what this rebuild removed.
- **Never short.** Every shipped frame measures the same ink height and head top — enforced by
  `ladder.json` (written by the build script) and by `tests/crid-bot.test.mjs`, which fails if
  any stage's ink box, ground line or axis drifts.
- **Weight = width and mass.** The six lighter builds differ mostly in *area*, not silhouette
  width — only the heaviest is measurably wider — so stage order and `slow`/`heft` are proven on
  ink area, not width.
- **No cloth = wearing nothing.** The owner's words. He renders as Snap's base body — no camo
  cargos, no straps, no shoes. `outfit` is omitted entirely (`outfit=-1` is HTTP 400). The
  backpack is a separate prop the overlay draws; it is never part of the render.

## The recipe

The authoritative parameters are the `RECIPE` constant in `scripts/build-body-ladder.py`
(the face parameters now live verbatim in the `RECIPE` constant — `beard=8696`, `brow=1538`,
`eye=1626`, `mouth=2338`, `jaw=1396`, `nose=1449`, `hair=1657`, `face_proportion=10`,
`skin_tone=8080170`, plus the two gold hoops), mirrored in `docs/crid-avatar-params.json`. Fetch with
`python3 scripts/build-body-ladder.py --fetch`, rebuild frames + `ladder.json` with a plain run.
Render at `scale=3` (1050x1400); framing is a shared translation putting ink bottom on y=1325 and
the mid-torso axis on x=560.

`rotation=7` or any non-zero rotation must never enter the ladder.

## The rig

`scripts/build-crid-rig.py` cuts **`body-3-r0.webp`** (the leanest stage) into ten pieces —
head, torso, upper arm/forearm+hand per side, thigh/shin+foot per side — with joint overlap bands
so no seam opens at the angles `crid-bot.js` uses. `rig.json`/`rig.mjs` carry pivots and draw
order. The overlay draws the rig only while he is on the lean stage and not leaning; heavier
stages use the flat drawing until every stage has its own rig cut (open item — cut each stage
from its own frame, never borrow limbs across builds).

## Verification

- `python3 scripts/build-crid-rig.py --check` — coverage, rest-pose tolerance, joint openings.
- `python3 scripts/build-body-ladder.py --sheet out.png` — all stages at 336px and 150px.
- `npm test` — the ladder test re-measures `ladder.json` against `crid-bot.js`'s table.
- Screenshot `/desk` at 150px, 390px and 1920x1080 and *look*.

## Rules that still hold

- The character is the owner's Bitmoji. No AI-generated body; generated images are for props
  (backpack, headphones, chair) and scene art only.
- One pose, one light, one character. If a change would make Crid look like a different person,
  stop and ask the owner.
