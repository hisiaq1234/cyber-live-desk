# CRID motion research — INSIDE/LIMBO feel, current 2.5D rig, future 3D game

Status: research and architecture decision record for PR #41. This is not a claim that CRID already reproduces Playdead's motion, and it is not approval to merge the current PR before CI and visual QA pass.

## Decision in one sentence

Build CRID as a **contact-led, animation-driven character with a physically authoritative root**: the motor decides where the body can go; authored/procedural performance decides how the body expresses that movement; hand/foot IK keeps contact honest; secondary motion and audio respond to actual events. Keep the current desk implementation 2.5D, but define the motion interface so a later 3D game can supply a Vector3 root and real 3D contacts without replacing the Bitmoji rig or rewriting the acting layer.

Do not turn the main character into a full ragdoll. Do not copy the Huddle's soft-body solver. Do not let both the stage planner and the physics world move the root.

---

## 1. What the Playdead material actually confirms

### INSIDE

Playdead's official [INSIDE presentations page](https://blog.playdead.com/articles/inside_presentations/inside_publications.html) is unusually useful because it tells us which aspects of the game they chose to expose publicly:

- **Animation-talk (Danish)** is described by Playdead as a high-level discussion of the animation needs of a game like INSIDE and the areas considered when building an interactive experience. The presentation itself is hosted on Google Slides and was not retrievable in this research pass. I am therefore not claiming access to its slides or attributing a specific controller design to it.
- **The Boy From INSIDE** (AES 2016) is listed as the talk about the main character's sound design.
- **The Playdead Approach to Audio** says the audio setup integrated Wwise with Unity, animation and gameplay.
- **Unbreaking Immersion** describes an audio sequencer integrated with gameplay, using the boy's breathing and the shockwave sequence as examples.
- **Huddle Up!** is specifically about the late-game Huddle creature: dynamic arms imposed on a sack of physics bodies, with physics and animation moving together. It is not evidence that the boy's ordinary locomotion is a soft-body or full-ragdoll character.

The official catalogue is here: https://blog.playdead.com/articles/inside_presentations/inside_publications.html

The distinction matters. The Huddle is a special creature problem. It is not a sound reason to simulate every bone of CRID as a rigid body.

### What players can actually observe in INSIDE

This section is observation and critical interpretation of the shipped game, not a claim to know Playdead's private implementation.

The movement feels convincing because the boy's body is continuously reacting to context, not because every joint is simulated:

- He changes cadence and breathing when danger approaches.
- He lowers and compresses himself when hiding under cover.
- His head turns and aims attention before or while the body commits.
- Running, slipping, falling, landing, swimming, pushing and climbing have different body tension and limb organization.
- A ledge grab is not just a hand pose: the arm reaches, the body weight follows, legs search for support, and the torso has to get over the edge.
- Small actions remain connected to their causes. Foot contacts, cloth movement and breathing do not feel like unrelated loops.

A contemporary review specifically called out the reactive head turns, tumbling down slopes, tiptoeing through shallow water and heavy breathing while hiding. Another described the boy's step and breath accelerating as a vehicle approaches, then curling into a hiding posture and letting the breath subside. These are useful observations of the experience, but they are not technical documentation of the internal controller.

Sources:
- Playdead official presentation catalogue: https://blog.playdead.com/articles/inside_presentations/inside_publications.html
- Xbox Wire review/feature: https://news.xbox.com/en-us/2016/06/14/inside-equal-parts-smart-stunning-scary/
- The Guardian review: https://www.theguardian.com/technology/2016/jul/05/inside-review-limbo-developer-playdead-xbox-pc-platform-puzzle
- Jakob Schmid's talk index, which lists the INSIDE talks and the 2016 audio material: https://schmid.dk/talks/

### LIMBO

Playdead's public [LIMBO presentations page](https://blog.playdead.com/articles/limbo_presentations/limbo_publications.html) mostly documents puzzle design and soundscape composition. It does not publish a detailed character animation or movement-controller breakdown. So LIMBO is a valid artistic reference for deliberate silhouette, timing and physical feedback, but I will not invent a technical LIMBO locomotion architecture.

The shared lesson from INSIDE and LIMBO is *clear, readable body action in a deliberately constrained world*. For CRID, the constraints need to be explicit: what surface supports him, what he is holding, which way gravity acts, what movement the action is attempting, and whether the motion succeeded.

---

## 2. The right open-source reference to mix into CRID

### Primary reference: three-procedural-locomotion

Repository: https://github.com/PabloMesquida/three-procedural-locomotion

License: MIT. Its MIT notice must be retained for any code copied or substantially adapted. The CRID repository already has a port of its analytic two-bone solver in `public/desk-assets/ik.mjs`, and that file already identifies the upstream source and MIT license.

Why this is the closest technical fit:

- It is written for Three.js and is not tied to Mixamo bone names.
- A `HumanRig` mapping describes hips, thighs, shins, feet, toes, spine, chest, neck, head, arms, hands and optional twist bones.
- Its locomotion is deliberately separated into body movement, gait timing, footstep planning, foot target/swing trajectories, pelvis support, torso response, arms and IK.
- It uses a world-space foot target that stays planted during stance and moves along a planned swing path while airborne.
- Its gait distinguishes planted, plant, lift and swing phases. Walking has double support; running can have flight.
- It emits liftoff/touchdown events and keeps a foot's duty factor stable for the current step, so a speed change does not cause a foot to teleport between gait states.
- When braking, it can retarget a foot that is still early in swing without changing the foot's position or velocity at the retarget moment.
- It has pelvis support weighting, lateral weight shift, torso/head lag, turning anticipation, foot roll, stair handling and hand touch behavior.
- Its own documentation says its root is **kinematic**, not a physics body. That is why it should supply gait/pose intelligence to CRID, not become a second root-motion engine.

Useful source files:
- `src/locomotion/LocomotionController.ts` — orchestration order.
- `src/locomotion/GaitController.ts` — gait phases, duty factor, frequency and contact events.
- `src/locomotion/FootstepPlanner.ts` — where each foot should land.
- `src/locomotion/FootTarget.ts` — planted pose, swing pose, start tangent and smooth mid-swing retargeting.
- `src/body/BodyController.ts` — acceleration, heading, grounded/airborne state, landing speed and foot support weights.
- `src/body/PelvisController.ts` — pelvis height and tilt from supporting legs.
- `src/body/TorsoController.ts` — counter-rotation, shoulder response, head stabilization and anticipation.
- `src/locomotion/JumpController.ts` — takeoff, airborne and landing phases.
- `src/rig/HumanRig.ts` — generic bone mapping.

The order used by its locomotion orchestrator is a useful design reference:

1. Body controller advances the root and reports movement/ground state.
2. Gait controller decides when each foot lifts and lands.
3. Footstep planner decides where the next footfall belongs.
4. Planted and swinging foot targets are updated.
5. Support weights drive pelvis height/shift/orientation.
6. Two-bone IK solves the actual leg chains.
7. Torso, head and arms follow with their own lag and anticipation.

**Adaptation decision:** selectively port/adapt these ideas around CRID's existing skeleton mapping and physical root. Do not add the whole package as an independent locomotion controller. The package's root movement, ground detector and navigation must not compete with `physics.mjs`.

### Secondary references

| Reference | Useful idea | What not to copy blindly |
|---|---|---|
| [AitorSimona/Traverser](https://github.com/AitorSimona/Traverser) (MIT, Unity) | Ability-based traversal, predictive collision, ledge detection, motion warping, free-hang/pull-up/drop-down, and selective physical-animation profiles | It is a Unity package, not a drop-in Three.js module. Keep its ideas as a future traversal design reference. |
| [ChrisDa2/Procedural-Animation](https://github.com/ChrisDa2/Procedural-Animation) (MIT, Unity) | A reaching-arm state machine (search → approach → rise → touch → reset), with TwoBoneIK and hand-surface rotation; hybrid base animation plus runtime foot IK | Unity's Animator/Rigging APIs are not available in CRID. Port the state/contact logic, not its components. |
| [majidmanzarpour/threejs-procedural-spider](https://github.com/majidmanzarpour/threejs-procedural-spider) (MIT) | World-space planted feet, step when the body outruns a leg, support-based body lean and analytic IK | Eight-legged gait and wall-walking are not humanoid behavior. Use only the contact principles. |

---

## 3. What CRID already has — and what is still missing

### Existing assets worth protecting

- The actual Snap Bitmoji GLB and its 91-bone skeleton / facial morph setup remain the character's identity source.
- `crid-3d.js` already owns procedural pose, the body stage blend, facial animation, finger curls, bag springs, landing squash and the renderer loop.
- `ik.mjs` already contains the analytic two-bone IK solver ported from the MIT-licensed locomotion reference.
- `being.mjs` chooses intent. It should not integrate physical movement.
- `stage.mjs` plans actions such as approach, reach, pull, slip, top, crouch, drop, lean, hop and seat. It should not invent physical root trajectories.
- `physics.mjs` is the shared world for CRID, the bag and loose paper. The desk spec intentionally avoids a second third-party rigid-body engine.

### Gaps that actually cause the puppet feeling

1. **Gait is still too simple.** The current phase is largely a sinusoidal leg swing. A planted-foot IK correction exists, but there is not yet a full stance / plant / lift / swing cycle with support weights, toe-off, heel strike and a planned landing target.
2. **Foot locking is not yet a general contact solver.** The desk's screen-space inverse-root correction can hold an ankle steady for planar movement. A true 3D game must store the ankle contact in world space, including surface normal and orientation.
3. **The pelvis has only limited support response.** A more convincing step needs hip height, lateral weight shift and knee loading to follow the actual supporting foot(s), rather than only a clock-driven body bob.
4. **Upper-body follow-through is approximate.** The current renderer has breathing and head drift, but needs acceleration-based torso lag, pelvis/spine counter-rotation, shoulder follow-through and anticipatory gaze tied to the next action.
5. **Climbing needs both a physical root and a real hand target.** Reaching toward a panel is not the same as gripping it. The hand target needs a point, normal, palm orientation and elbow pole; the root should be pulled by a bounded grip constraint.
6. **The sound/event clock is not yet shared with the contacts.** A footstep, landing, grip, release or breath cue should be emitted from the same movement state that drives the body, not estimated by a separate timer.

### Current feature branch is a first integration pass, not yet merge-ready

PR #41 is implementing the single-world 2.5D root motor and platform contacts. It remains a draft and `main` is untouched. The current CI run and physical lab QA still decide whether this branch is safe to merge. Do not merge just because a particular unit test passes; verify a real climb, a fall, a landing and ordinary cue movement in the lab.

---

## 4. Recommended hybrid motion controller

Keep one owner for each responsibility:

| Layer | Owns | Must not own |
|---|---|---|
| `being.mjs` | Motivation and intent: wander, rest, climb, sit, lean | Root position, collision or joint pose |
| `stage.mjs` / future traversal planner | Action phases and requests: approach, reach, grip, pull-up, slip, land, release | A scripted root path that overrides the motor |
| `physics.mjs` now / future 3D motor | Root position, velocity, gravity, collision, grounded state, platform support, grip feasibility and landing impact | Facial expression or bone animation |
| Gait / motion coordinator | Foot phases, step targets, stride, contact events, support weights, desired body motion | A second root integrator |
| `crid-3d.js` | The real GLB's pose, procedural/clip blend, body follow-through and visual secondary motion | Deciding whether the root can pass through a wall |
| `ik.mjs` + contact layer | Solving feet and hands to world targets, with pole vectors and surface orientation | Choosing the behavior or teleporting the root |
| Audio/event layer | Footstep, breath, impact, grip and release cues from motion events | Guessing timings from independent loops |

### Movement contract to design around

The current desk motor uses scalar stage coordinates (screen-plane X and vertical Y). Do not let that data shape become the long-term game contract.

Use a dimension-neutral motion state with a root transform and velocity that can be represented in either a plane or 3D:

- root position and orientation;
- linear and angular velocity;
- acceleration / movement intent;
- grounded and airborne state;
- support identifier and support surface normal;
- carried load / movement strength;
- current action and action phase;
- left/right foot phase, planted state, world target and touchdown/liftoff events;
- left/right hand contact state, anchor point, surface normal and grip capacity;
- landing speed / impact event.

For the desk, an adapter maps this to the present 2.5D world and screen. For the future game, another adapter maps it to `Vector3`, a 3D character collider and real 3D surfaces. The animation and contact layers consume the same semantic state in both cases.

### How to get the INSIDE-like body weight

**Walking**
- Use distance and actual speed for cadence, but separate the stance and swing intervals.
- A stance foot stays at its planted world point until toe-off. A swing foot has a planned landing point, a lift arc and a controlled landing.
- Keep a double-support interval when walking. Only move toward running/flight when the actual speed justifies it.
- Retarget a foot that is still early in swing when the root brakes or changes direction; do not snap its endpoint.
- Let the pelvis shift toward the supporting foot, bend the stance knee under load, and rise/fall smoothly across transfers.
- Counter-rotate the spine and chest against the pelvis; let the shoulders and head arrive later. The head should look toward an upcoming contact or threat before the torso arrives.

**Jump / fall / landing**
- The motor owns the ballistic root trajectory and collision.
- The animation layer adds takeoff anticipation, arm preparation, leg tuck, gaze, landing anticipation and impact cushioning.
- Landing compression is driven by measured impact speed; stronger impact should produce more compression and a longer settle.
- Emit the landing event on actual contact and feed it to sound, camera/visual effects and body squash.

**Climb / ledge**
- Search for a reachable surface; approach it; reach one or both hands; confirm contact; set a persistent hand anchor; pull the torso/hips while feet search for support; complete only when the body is fully supported on top.
- Hand IK follows the anchor's world position and surface normal; fingers curl only once the grip is acquired.
- A grip fails because the anchor is out of reach or load exceeds capacity over time—not because a random animation dice roll decided to slip.
- The motor decides whether the root can move over the ledge. The stage planner chooses the action phases. The animator controls the shape of the action.

**Idle / fear / hiding**
- Do not idle with an independent breathing sine that ignores movement.
- Blend respiration according to activity and recent exertion; the breathing should remain elevated after running and gradually recover.
- Gaze and head turns lead the body. Body tension, crouch height and arm position respond to threat proximity and hiding context.
- Keep small postural shifts and balance corrections alive, but avoid constant ornamental motion. INSIDE's restraint is part of the effect.

---

## 5. What should be mixed now vs saved for the full 3D game

### Mix now (desk / overlay)

1. Finish and verify the shared 2.5D character motor in PR #41. Keep the old separate cue movement from fighting stage-owned movement.
2. Replace the basic sine gait with a small, testable gait coordinator inspired by the reference's duty-factor and contact-state model. Keep the existing CRID-specific bone mapping and IK.
3. Derive stance / swing from travel distance and real root velocity. Add liftoff/touchdown events and make them available to the desk audio and QA.
4. Improve pelvis support shift and acceleration-driven torso / head lag as additive procedural channels. Do not change the GLB or create a new rig.
5. Make hand contacts persistent through reach, pull, hold and release, and validate that both grip and landing conditions match collision geometry.
6. Add lab probes that assert root path, support id, foot/hand error, event timing and no large bone-rotation spikes—not just a green unit test.

### Save the full 3D work for the actual game scene

1. Create a 3D motor adapter with `Vector3` velocity, grounded/airborne states, full capsule/sweep collision, arbitrary support normals, steps, ledges, moving platforms and camera-relative control.
2. Replace screen-projection foot correction with true world-space contact anchors and 3D terrain/surface sampling.
3. Use the generic rig mapping pattern from `three-procedural-locomotion` to map CRID's actual GLB hierarchy into hips, legs, arms, spine, head and hand/finger chains. Verify every mapping against the actual GLB before the first 3D motion port.
4. Add authored action clips for performance (walk, run, jump, climb, slip, drop, fall, swim if needed) while motor/collision remains authoritative. Blend clips with the procedural face, hands, feet and body correction.
5. Evaluate active ragdoll or partial physical animation only for high-impact actions in the 3D game. That is a separate scoped feature, not the baseline walking solution.

---

## 6. License and integration notes

- `three-procedural-locomotion` is MIT-licensed. If its source is copied or substantially adapted, retain its copyright/license notice and document the exact files adapted. Its root/body controller is kinematic and must not run alongside CRID's physical root motor.
- `Traverser` is MIT-licensed but Unity-specific. Treat it as an architecture reference unless the required C# is ported and reviewed.
- `ChrisDa2/Procedural-Animation` is MIT-licensed and Unity-specific. Its state/contact pattern is the reusable part.
- `threejs-procedural-spider` is MIT-licensed; its planted-foot and support-surface concepts are reusable, not its animal gait.
- The existing CRID Bitmoji GLB and its face / geometry identity are not to be replaced by a stock character or a Mixamo avatar.

## 7. Acceptance gate before PR #41 merges

- [ ] All repository tests green on the final PR head.
- [ ] Existing cue walk/lean/gesture tests still pass; cue-owned movement never fights the physical stage root.
- [ ] A reach target outside measured arm range is rejected.
- [ ] A heavy / bag-loaded climb either reaches the ledge or fails visibly and falls; it never teleports.
- [ ] The root is fully supported before the stage says `top` or `seat`.
- [ ] Drop and hop-down remain airborne until actual floor contact.
- [ ] Foot stance anchors do not slide while the root moves.
- [ ] Phone-sized and desktop `crid-lab` captures are inspected; no clipping, jitter, limb inversion or root/mesh offset.
- [ ] `window.__cridMotor` / `window.__cridStage` telemetry agrees with visible body contacts.
- [ ] No second physics loop, no second root owner, no new third-party physics engine.

## Sources

- Playdead, [INSIDE Presentations](https://blog.playdead.com/articles/inside_presentations/inside_publications.html) — official list of Animation-talk, The Boy From INSIDE, The Playdead Approach to Audio, Unbreaking Immersion and Huddle Up!
- Playdead, [LIMBO Presentations](https://blog.playdead.com/articles/limbo_presentations/limbo_publications.html) — publicly available design/audio talks; no detailed character locomotion implementation is listed there.
- [GDC Vault: Huddle Up! Making the [spoiler] of INSIDE](https://www.gdcvault.com/play/1024472/Huddle-up-Making-the-SPOILER%26lang%3Den) — specifically about the Huddle creature, not the boy's ordinary gait.
- Jakob Schmid, [Talks](https://schmid.dk/talks/) — catalogue of INSIDE audio presentations.
- Xbox Wire, [Inside Is Equal Parts Smart, Stunning, and Scary](https://news.xbox.com/en-us/2016/06/14/inside-equal-parts-smart-stunning-scary/) — observable main-character body-language review.
- The Guardian, [Inside review](https://www.theguardian.com/technology/2016/jul/05/inside-review-limbo-developer-playdead-xbox-pc-platform-puzzle) — observable movement/breathing/hiding behavior.
- Pablo Mesquida, [three-procedural-locomotion](https://github.com/PabloMesquida/three-procedural-locomotion) — MIT, Three.js, motion capture-informed gait, footstep planning, IK and support-driven body.
- Aitor Simona, [Traverser](https://github.com/AitorSimona/Traverser) — MIT, Unity traversal and physical-animation architecture.
- ChrisDa2, [Procedural Animation](https://github.com/ChrisDa2/Procedural-Animation) — MIT, Unity procedural reach and hybrid foot IK.
- Majid Manzarpour, [threejs-procedural-spider](https://github.com/majidmanzarpour/threejs-procedural-spider) — MIT, Three.js planted-contact and support-plane concepts.
