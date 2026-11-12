> Reference only. Read once. Do the pass below once. Then stop.
> Do not re-run this file. Do not retry a picture that looks wrong. Report it and stop.
> Read `docs/specs/body-ladder.md` first. Those rules still hold.

# Crid 360 — folder reference

The zip is `docs/reference/crid-360.zip`. It is not served.
Do not copy any angle into `public/desk-assets/crid/`.
`rotation` other than 0 must never enter the body ladder.

## Stop

One pass. Eight angles, seven stages, one bake. Then stop.
If Snap has no rotation, skip that angle. Do not invent a retry.
If a bake misses the mesh, stop. Do not bake it again.

## What the zip is

One turn of the owner, pack removed, then that turn scaled per stage.
It is a stand-in, not a Snap render.

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

## Size

The head does not change. The height does not change.
Every part that does change takes the same factor.
`k` is that stage's chest divided by the base chest (200px on `base/angle-8`).

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

## One pass

Nano Banana, once per file. Edit the angle that is already in the zip.
Use `body-<key>-r0` as the front reference. Do not redraw him.

- Pack and straps off.
- Fill the hole in the back from his own sides.
- Same head. Same height. Width and depth both take `k`.

Then bake those views once onto the unwrap already in `crid.glb`.
Front, back, and the two sides paint. The other four only fill gaps.
Black is not skin. Then stop.

## Do not

- Do not scale bones. That bend already shipped once and was removed.
- Do not put the pack back.
- Do not run this file again.
