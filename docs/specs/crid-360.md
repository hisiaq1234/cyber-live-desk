> Reference for the 3D turn. Not a ladder frame, and not a new character.
> Read `docs/specs/body-ladder.md` first. Those rules still hold.

# Crid 360 — folder reference

The zip is `docs/reference/crid-360.zip`. Unpack it and perfect the folders.
Do not serve this zip. Do not copy any angle into `public/desk-assets/crid/`.
`rotation` other than 0 must never enter the body ladder.

## What the zip is

One turn of the owner, eight angles, pack removed, then the same turn
scaled to each ladder stage. It is a stand-in, not a Snap render.

```
base/        the turn, pack removed, k = 1
body-3/      leanest
body-0/
body-4/
body-5/
body-1/
body-11/
body-2/      heaviest
```

Each folder has `angle-1.png` … `angle-8.png`, 1050×1400, black background.

| File | View |
|---|---|
| angle-8 | Front |
| angle-1, angle-7 | Three-quarter |
| angle-2, angle-6 | Side |
| angle-3, angle-5 | Rear three-quarter |
| angle-4 | Back |

## The one rule for the size

The head does not change. The height does not change. Every part that
does change takes the **same** factor.

The base is angle-8 of `base/`. Its chest, arms excluded, measured 200px.
`k` is that stage's front chest divided by 200. Width and depth both get `k`.
The head is not scaled. The height is not scaled.

| Folder | k |
|---|---|
| base | 1 |
| body-3 | 0.82 |
| body-0 | 0.95 |
| body-4 | 0.95 |
| body-1 | 1.03 |
| body-5 | 1.10 |
| body-11 | 1.13 |
| body-2 | 1.28 |

Re-measure from the real front (`body-<key>-r0`, chest against the head)
before treating a number as final. If a real render disagrees with `k`,
the render wins. Do not invent a second factor for depth.

## What is wrong with the folders now

- `angle-4` (and parts of 3 and 5) has a hole where the upper back was.
  The pack was the only pixels there. Do not paint a back.
- A strap stub can remain on the shoulder in the side views.
- `body-*` is a horizontal stretch of `base/` from the chin down.
  The neck steps, and the arms thicken by the same `k`. That is the
  proportion, not a finished picture.

## What perfecting means

Replace each file with a real Snap render of this same avatar:

- `bag=-1` (bare chest, no straps, no pack)
- the stage's own `body=` (`3, 0, 4, 5, 1, 11, 2`)
- the eight views above, in that order
- the same framing as the ladder fronts: ink bottom on one shared line,
  head the same size, height the same
- the front of `body-<key>/angle-8.png` must match `body-<key>-r0`

The recipe is `RECIPE` in `scripts/build-body-ladder.py` and
`docs/crid-avatar-params.json`. Only the camera rotation changes per angle.
If Snap cannot return a rotation, Nano Banana edits the angle that is already
in the zip. It does not invent a new person.

## Who makes the pictures

Nano Banana makes the pictures. A projection script does not. One was run
against this GLB and the color missed the surface, so it was thrown out.
Do not write another.

For each stage, give Nano Banana the real front (`body-<key>-r0`) and the
matching angle from `base/`. It edits. It does not redraw him.

- Remove the pack and the straps.
- Fill the back only from the sides of this same man. No new body.
- The head stays the same head. The height stays the same height.
- Width and depth both take that stage's `k`, and nothing else changes.

The finished `angle-1` … `angle-8` are the color. Bake those onto the unwrap
already in `crid.glb`. Black pixels are not skin.

## What the 2D is for

The perfected pictures are the color on the mesh. They are not a UV layout.

`crid.glb` already has the unwrap. Do not replace it, and do not draw a new
face or a new circuit. Project these views onto that unwrap and bake:

- angle-8 paints the front
- angle-4 paints the back
- angle-2 and angle-6 paint the sides
- angle-1, 3, 5 and 7 only fill what the four views missed

The black background is not part of the body. It must not land on a pixel.
One bake per stage. The mesh being painted has to be that stage's build,
or the picture slides off the surface.

Do not bake the folders as they stand. A hole in angle-4 bakes as a hole.
A stretched neck bakes as a stretched neck.

## What not to do

- Do not generate a texture. The only new color is a bake of these views onto the unwrap that is already in `crid.glb`.
- Do not scale bones to fake a stage. That bend already shipped once and was removed.
- Do not put the pack back. The ladder fronts have no pack. The rig hides `bag` for the same reason.
