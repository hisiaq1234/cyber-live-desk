# Arm gestures on the 3D path — spec

Status: implemented (2026-11-14). Research canon below; this file is the record
so the next agent inherits the *why*.

## The bug this fixes

SEQ cues carry arm intent in `mL`/`mR` (`up`, `wave`, `slam`, `push`, `down`,
`limp`). `crid-3d.js` never read them — arms got only idle sine drift, walk
gait, stage-machine channels (panel lean/reach/seat only) and the hand-plant
IK. Result on air: during `say`, `cheer`, `wave`, `salute`, `pushup`, `gift`,
`summon`, `die` the arms hold whatever the idle drift happened to be — the
"frozen hand" the owner reported.

## Research canon (what the best do)

- **Gears of War inertialization (GDC 2018):** transitions keep motion
  continuous by decaying a recorded pose+velocity offset — position AND
  velocity, spring-decayed, no cross-fade popping. Implemented twice here:
  bone-level pos+vel springs in `crid-3d.js`, program-level prev/next
  crossfade in `gesture.mjs`.
- **orangeduck spring canon:** spring-damper with position+velocity state;
  half-life parameterization. The bone springs use semi-implicit integration
  at 1/240 s substeps, frame-rate independent.
- **UE Layered Blend Per Bone / Unity Animation Layers:** locomotion owns the
  body; an upper-body layer adds on top through a bone mask, weight fading
  ~0.1 s, never snapping. Our version is *additive deltas*, not masked
  ownership — the gesturing arm keeps its gait swing underneath, which is
  strictly better for wave-over-walk.
- **Additive blending (ozz / three.js AdditiveAnimationBlendMode):** gesture
  = delta on top of the base pose, applied after it — same ordering rule as
  "call update() after mixer.update()".
- **Snap's own docs:** the Bitmoji GLB ships zero animations by design;
  procedural drive is a sanctioned route. We stay procedural — no DCC
  tooling, no new deps, Vercel-free static hosting.
- **Animation principles:** gesture leads, body answers a beat late
  (shrug/headPitch/leanFwd ride the stage channel path for exactly this).

## Design as built

`public/desk-assets/gesture.mjs` — per-side gesture programs over a
gesture-local clock `u`, with **true outgoing/incoming crossfade**: on an
mL/mR value change the active program moves to a `prev` slot and keeps
animating while its weight decays on a 55 ms half-life; the incoming program
fades in on the same clock. Weight is applied exactly once (the w² hand bug
is why `accumulateProgram` exists). `down`/unknown values release.

`crid-3d.js` `drive()` — two halves:

- **Body-answer keys** (`shrug*`, `headPitch`, `leanFwd`) merge into
  `stageC` and ride the existing `accStageChannels`/`flushStageChannels`
  spring — those bones have no gait to preserve.
- **Arm chain** (`armLift*`, `armFwd*`, `elbow*`, wrist `extra`, finger
  `curl`) becomes **additive euler deltas**: world-axis triples premultiplied
  (`P^-1·R·P`, the channel convention) onto whatever `pose()`/stage/IK just
  wrote — after the stage flush, before arm IK and `LIMB_TWIST`. Each of the
  six bones (`armUpper`, `armLower`, `hand` × L/R) tracks its delta with a
  pos+vel spring that **starts at zero** — engaging, tracking the wave wag
  and releasing can never pop; it is inertialization by construction. Runs
  every frame so a released gesture decays to zero instead of freezing.
  Bone taus: upper arm .13, forearm .10, hand .075; zeta .6/.7/.8.

### Measured axis map (do not re-derive)

Probe-verified on this rig (world-axis euler deltas, hand world-pos per
unit): **+z raises BOTH arms** (abduction is symmetric in world axes — the
stage channel's mirrored `armLift` signs encode a different semantic),
**+y swings BOTH arms forward** (he faces −z, toes confirm), **+x on the
forearm is elbow flexion for both sides**, x on the upper arm is near-twist.
`put()` in `drive()` encodes this; `accStageChannels`' arm mapping is NOT
reused — it was written for stage semantics, not gesture semantics.

Every program takes `(u, h)` where `h` is the body-ladder mass factor
(`BODIES[].heft`, forwarded through `init3d` state as `st.heft`, clamped
0.75–1.6): heavier Crid rises and settles slower (`√h` on ease times), waves
at a slightly lower frequency (`h^-0.3`, wider swing `h^-0.2`), and slams
deeper (`h` on lift/headPitch/leanFwd). Weight fades on a 55 ms half-life.

## mL/mR vocabulary → programs

| value  | program                                                        |
| ------ | -------------------------------------------------------------- |
| down   | release — crossfade out, springs decay to zero                 |
| limp   | arms hang low, elbows soft, hands slack (doze/dead flavour)     |
| up     | raise: lift ~1.72·h^-¼, soft elbow, hold, spring settles        |
| wave   | lift ~0.55·h^-⅕ + fwd 1.15 + elbow .85, forearm wag ~3.2·h^-⅓ Hz + wrist z-flick |
| slam   | strikes down at u=0 (paid/due wind-up plays `up` first), heavy follow-through |
| push   | both arms forward (fwd .88) + elbows soft, fingers to fist      |

SEQ details that matter: `wave` holds `mR:"wave"` across all middle frames
(never toggles `up`/`wave` — the 3.2 Hz oscillator would restart each swap);
`salute` holds `mR:"up"` on the mid frame so `baseOf` doesn't drop the arm
early.

## New cues invented (registered in api/_desk-core.mjs BOT_CUES)

- `point` — right arm extends, holds on the target a beat, retracts.
- `facepalm` — both hands rise to the face, hold, drop. Reads at 150 px.
- `mindblown` — both arms up and out, elbows bent, hands at head height.

All three are pure SEQ frame lists over existing fields (`mL/mR`, `hy`, `hr`,
`tr`, `by`, face channels) — they ride the gesture layer with zero renderer
changes beyond the vocabulary.

## Out of scope / decision notes

- `crid-clean.glb` stays as `?glb=crid-clean` trial param; rig names are
  identical so the gesture layer drives it unchanged.
- Arm IK still owns the chain during panel leans (`ikW`) — a planted hand
  plants; gesture deltas compose on top but the solve wins the arm.
- No animation clips, no retargeting, no new dependencies. All client-side
  JS — deploys to Vercel as static assets.
- QA hooks: `__cridGesture` (layer state), `__gestDbg` (spring pos/target
  per bone), `__cridPose` (live pose mL/mR), `__cridBones` (world transforms).
