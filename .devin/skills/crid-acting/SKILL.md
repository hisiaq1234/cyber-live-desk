---
name: crid-acting
description: >
  Acting vocabulary for Crid's procedural performance — facial morph
  composition, body gesture timing, blinks, anticipation/settle/overlap,
  and Three.js animation/mixer rules. Use whenever animating Crid's face,
  body, gaze, or any timed performance beat in public/desk-assets/.
---

# Crid acting

Shared craft references for making Crid *act* rather than *move*. Read the
relevant reference before tuning timings, easings, or morph blends.

## References

- `references/animation-principles.md` — the acting vocabulary: timing
  charts (blink = 3–4 frames), easing library with reasons, anticipation /
  execution / settle / overlapping action, holds, squash & stretch, arcs,
  secondary motion, anti-pattern audit. Vendored from
  `matinsizen/ai-3d-animator-skill` (MIT).
- `references/threejs-animation.md` — Three.js AnimationMixer / Action /
  Clip / morph-target rules and crossfade patterns. Vendored from
  `Impertio-Studio/Three.js-Claude-Skill-Package` (MIT).
- `references/threejs-physics.md` — physics engine comparison and sync
  patterns. Reference only — Crid uses the project's own fixed-step
  `physics.mjs`, not cannon-es/Rapier. Vendored from the same package (MIT).
- `references/threejs-animation-api.md` — Three.js r186 animation API:
  AnimationClip/tracks, morph-target tracks, mixer/action crossfades,
  glTF clips, bone posing order. Vendored from
  `CloudAI-X/threejs-skills` (MIT).

## How Crid's face actually works

The GLB exposes ~100 `face_shapes.ai_*` morph targets; `crid-3d.js` drives
them through `facial.mjs`. Per-region channels (gaze, lids, brows, mouth,
jaw/cheeks) blend independently; emotion recipes set target weights and the
envelope handles onset/hold/release. Blinks and saccades are scheduled
events layered on top — never on the beat of an action.

## Rules of thumb

- Blink every 2.5–4 s, ~3 frames, eyes 1 frame apart; add half/asymmetric
  blinks rarely.
- Eyes lead the head by ~2 frames on gaze moves.
- Emotions ease in with `easeOutCubic`, hold, release slower than onset;
  never snap morph weights.
- Anticipation before big gestures; settle overshoot ~5–8% after.
- Run the anti-pattern audit in animation-principles.md §9 before calling
  a performance change done.
