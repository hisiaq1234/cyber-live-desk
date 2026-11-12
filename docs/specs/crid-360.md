# Crid 360

360 images: `docs/reference/crid-360.zip`
2D reference: `public/desk-assets/crid/body-<key>-r0.webp`

| 360 folder | k | 2D file |
|---|---|---|
| base | 1 | the turn itself, pack removed |
| body-3 | 0.82 | public/desk-assets/crid/body-3-r0.webp |
| body-0 | 0.95 | public/desk-assets/crid/body-0-r0.webp |
| body-4 | 0.95 | public/desk-assets/crid/body-4-r0.webp |
| body-1 | 1.03 | public/desk-assets/crid/body-1-r0.webp |
| body-5 | 1.10 | public/desk-assets/crid/body-5-r0.webp |
| body-11 | 1.13 | public/desk-assets/crid/body-11-r0.webp |
| body-2 | 1.28 | public/desk-assets/crid/body-2-r0.webp |

Each 360 folder holds `angle-1.png` … `angle-8.png`.

| File | View |
|---|---|
| angle-8 | front, matches that row's 2D file |
| angle-1, angle-7 | three-quarter |
| angle-2, angle-6 | side |
| angle-3, angle-5 | rear three-quarter |
| angle-4 | back |

Keyed sprites (black background flood-filled to alpha, same 1050×1400 frame):
`public/desk-assets/crid/turn/<stage>/angle-<n>.webp`. Preview all 64 at `/crid-turn.html`.
