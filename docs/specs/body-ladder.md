# CRID body ladder

## Approved visual reference

The user-selected face and lean reference is [body-000-r7](https://github.com/hisiaq1234/cyber-live-desk/blob/cc1902269b6d36a4d086af3f67241af79a5bcbb0/public/desk-assets/crid/body-000-r7.webp). Its source commit is `cc1902269b6d36a4d086af3f67241af79a5bcbb0` and its verified Git blob is `864979d00e0e76de5ca87c30b6a99df57a33a417`.

The old r7 set is **not** reused as the production ladder: its companion frames change camera angle/pose and include attached straps. The selected `000` frame is now the actual production leanest render: the build fetches its exact bytes from the pinned source commit, preserves it as `body-3-r0.webp`, and uses its decoded pixels as the canonical head/face source for all six heavier stages. The production bag remains a separate prop.

## Verified historical sizing

The r7 `ladder.json` at the same commit records these measured ink widths, in order:

| Stage | Historical width |
|---|---:|
| `000` — lean reference | 307 px |
| `00` | 366 px |
| `3` | 420 px |
| `0` | 486 px |
| `5` | 560 px |
| `1` | 676 px |
| `2` — heaviest | 822 px |

All reference frames were 1050×1400. The selected lean frame measures 307×1156 ink, with its floor at y=1325. The historical torso axis is x=560; the generator measures it from the pinned reference rather than assuming it from the image bounding-box centre. These widths are the seven production silhouette targets.

## Production ladder rules

- Render one front-facing pose at rotation 0 for body keys `3, 0, 4, 5, 1, 11, 2`.
- Restore the historical r7 facial parameter values selected by the user. Keep the face identical across every body stage.
- Keep all frames 1050×1400 and preserve the selected r7 head/face pixels exactly across stages. Align each body to the reference torso axis and floor y=1325. Measure ink height per stage; do not force a false shared height.
- Apply deterministic horizontal body-only deformation below the head lock line. Blend through the shoulders and taper the lower legs; never scale the head or move the feet.
- Hit widths 307, 366, 420, 486, 560, 676 and 822 px in order. Every adjacent stage must be visibly wider.
- Do not bake the backpack into the character. The bag stays a separate physical prop.
- Do not use AI redraws or change the character's identity.

## One source of truth

`scripts/build-body-ladder.py` fetches the pinned r7 reference plus six front-facing Snap masters, uses the exact r7 image as the leanest stage, locks its head crop into the other six, aligns their torso axis and floor, applies the measured width targets, and writes:

- `public/desk-assets/crid/body-*-r0.webp` — production frames;
- `public/desk-assets/crid/ladder.json` — measured build report;
- `public/desk-assets/crid/ladder.mjs` — runtime source of truth for width, height, movement slow-down, heft and 3D girth.

Both `crid-bot.js` (2D silhouette and physical collider) and `crid-3d.js` (GLB girth) will consume the same `ladder.mjs`, preventing the 2D body, collision footprint and 3D body from drifting apart.
