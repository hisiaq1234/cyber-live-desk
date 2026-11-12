# AGENTS.md

Any agent working in this repository reads **`CLAUDE.md`** first and follows it. It is the handoff
for this project; this file is only the short version of the rules that are not negotiable.

## Non-negotiables

1. **Crid is the owner's own Bitmoji.** Never redesign him, never restyle him, never re-draw him,
   never generate his body or face with an image model. Generated images are for **props and scene
   art only**. The identity of record is `public/desk-assets/crid/` plus the exact Snap recipe in
   `docs/crid-avatar-params.json`.
2. **Never short.** His height and head size are fixed on every stage of the body ladder; weight
   changes width and mass only. Snap's `body=2` render is short-and-heavy and is **banned**.
3. **No cloth.** He renders as the base body — no camo cargos, no tee, no straps, no shoes. Omit the `outfit` parameter. The backpack is a prop drawn separately, not clothing.
4. **One pose.** Every ladder stage is the same front-facing render at `rotation=0`. Never mix
   three-quarter renders into the ladder.
5. **One CRID per page.** A theme is a skin over the same character, never a second copy.
6. **Judge by looking.** Screenshot `/desk` at 150 px, 390 px and 1920×1080 and look at it. Passing
   tests prove nothing.
7. **Merging to `main` deploys production.** Verify the live file is byte-identical to the merged
   file before calling anything shipped.
8. **Don't rewrite what works, don't stray, don't burn usage.** Small focused PRs on feature
   branches, `main` clean at the end.

If a change would make Crid look like a different person, stop and ask the owner instead of shipping
it. That is the one mistake this project does not recover from.
