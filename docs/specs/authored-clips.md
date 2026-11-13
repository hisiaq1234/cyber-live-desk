# Authored clips plan — walk, climb, slip, jump

Status: plan only. The procedural layer (stage.mjs / facial.mjs / crid-3d.js) is the
acting system of record until authored clips land. This doc is the contract for how
they arrive without breaking identity or the one-Crid rule.

## Why authored clips

The procedural pass gives Crid *reactive* acting — lead order, anticipation, settle,
overlap — but keyframed clips give *performance*: weight, line of action, held poses,
and micro-timing a spring can't invent. The four clips below are the ones the stage
machine already knows how to request; nothing new is invented for them.

## Source of truth

- Rig: the real Snap GLB `public/desk-assets/crid3d/crid.glb` (91 bones, 100 morphs).
  It is already a skinned mesh — do **not** re-rig, re-mesh, or touch vertex data.
  Blender imports the GLB as-is; animate on its existing bone names.
- Identity: unchanged. Clips move the same skeleton the procedural layer drives;
  no geometry, texture, or morph-target edits are permitted. Face morphs stay
  procedural (facial.mjs owns them during playback).
- One pose rule: the GLB rest pose is front-facing `rotation=0` — every clip is
  authored from that pose. No three-quarter anything.

## Clip set

| Clip | Replaces / layers over | Length target | Notes |
| --- | --- | --- | --- |
| `walk` | SEQ walk cycle inside crid-bot gait + crid-3d gait blend | loop ~0.9 s | Contact, passing, push-off per side; heel-strike squash on each plant (~3%), arm counter-swing lagging torso by 2–3 frames |
| `climb` | stage.mjs `approach→reach→pull→top` body path | ~2.2 s non-loop | Anticipation dip (100–140 ms) → reach → pull with elbow-driven torso arc → mantle over lip → drop to stand. Feet last in the lead order |
| `slip` | stage.mjs `slip` + `recover` | ~1.4 s | Traction loss on the lip edge: knee-buckle anticipation, torso pitch-forward arc (not line), one-handed catch, recover to stand |
| `jump` | SEQ `jump`/`hop` beats | ~1.1 s | Crouch anticipation (opposite dip) → launch with stretch (~+6% spine) → airborne arc → landing squash ~8% for ~80 ms → damped settle |

## Pipeline

1. `blender --background --python scripts/import-crid-glb.py` — imports GLB,
   names collection `CRID`, verifies bone/morph inventory matches the live list.
2. Author each clip on the armature in Blender (30 fps scene; export at 24/30 fps
   matching the desk's frame budget — pick one and record it here).
3. Export each clip as its own GLB (`walk.glb`, `climb.glb`, `slip.glb`, `jump.glb`)
   containing only the armature animation — meshes/morphs unchanged.
4. `public/desk-assets/crid3d/clips/` hosts the four files.

## Playback contract (how clips coexist with procedural)

- `crid-3d.js` gains a clip mixer slot: when `stage.state` (or the bot's requested
  clip name) matches an authored clip, the mixer drives bone rotations and the
  procedural bone layer is *attenuated* (weight ramps 0→1 over ~120 ms) rather
  than hard-cut. Morph targets, face, bag springs, IK feet-hands stay procedural.
- Lead order survives playback: the clip's own keys are authored eyes→head→torso→
  feet, and facial.mjs keeps owning gaze/blinks throughout.
- Squash/settle on landings stays owned by the procedural layer unless the clip
  demonstrably does it better — decide per clip during review, record the choice
  here.
- Weight-shift idle, breathing, and never-still rules are *not* replaced by clips;
  clips cover the four committed actions only.

## Verification

- Same bar as the procedural pass: before/after video per clip in `shots/`,
  screenshots at 150 px / 390 px / 1920×1080, `npm test` green.
- Each clip gets a side-by-side: procedural version vs authored version, judged
  on line of action, anticipation, settle, and whether Crid still reads as the
  same man.
- No clip ships that changes silhouette, outfit, or face at any frame.
