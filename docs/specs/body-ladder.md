# CRID body ladder

## Approved visual reference

The user-selected face and lean reference is [body-000-r7](https://github.com/hisiaq1234/cyber-live-desk/blob/cc1902269b6d36a4d086af3f67241af79a5bcbb0/public/desk-assets/crid/body-000-r7.webp). Its source commit is `cc1902269b6d36a4d086af3f67241af79a5bcbb0`.

The old r7 set is **not** reused as the production ladder: its companion frames change camera angle/pose and include attached straps. The selected `000` frame supplies the preferred neutral face and lean-silhouette target only. The production bag remains a separate prop.

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

All reference frames were 1050×1400. The shared floor line is y=1325 and the body axis is x=560. These measurements are the seven production silhouette-width targets.

## Production ladder rules

- Render one front-facing pose at rotation 0 for body keys `3, 0, 4, 5, 1, 11, 2`.
- Restore the historical r7 facial parameter values selected by the user. Keep the face identical across every body stage.
- Keep all frames 1050×1400, the head/face pixels fixed, ink height 1190 px, floor y=1325 and torso axis x=560.
- Apply deterministic horizontal body-only deformation below the head lock line. Blend through the shoulders and taper the lower legs; never scale the head or move the feet.
- Hit widths 307, 366, 420, 486, 560, 676 and 822 px in order. Every adjacent stage must be visibly wider.
- Do not bake the backpack into the character. The bag stays a separate physical prop.
- Do not use AI redraws or change the character's identity.

## One source of truth

`scripts/build-body-ladder.py` fetches the seven front-facing masters, locks the same head crop, applies the measured width targets, and writes:

- `public/desk-assets/crid/body-*-r0.webp` — production frames;
- `public/desk-assets/crid/ladder.json` — measured build report;
- `public/desk-assets/crid/ladder.mjs` — runtime source of truth for width, height, movement slow-down, heft and 3D girth.

Both `crid-bot.js` (2D silhouette and physical collider) and `crid-3d.js` (GLB girth) will consume the same `ladder.mjs`, preventing the 2D body, collision footprint and 3D body from drifting apart.
