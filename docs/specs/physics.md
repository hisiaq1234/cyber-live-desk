> Working spec kept with the code so an agent arriving cold can act on it. Read `CLAUDE.md` first.
> Crid is the owner's own Bitmoji: never redesign or generate him, never make him short.

# Gravity and weight — a real world for Crid

Owner's words (2026-11-12): *"the bag can sometimes be a drag for him when he is lean and weak, he
might be struggling to climb with it sometimes… he needs gravity, I need realism… it's like a
proper real engine world. If paper falls from the bag, gravity really had to work for all."*

This extends `crid-backpack-spec.md`. Physical traversal and props use one world with one set of rules — the character, the bag and any loose object obey the same gravity, support and mass maths. The desk's separate cue-layout navigation is explicitly kinematic presentation, not game-world traversal.

## The world
- **One gravity.** A single downward acceleration for every body, in screen units per second².
  A dropped bag, a slipping foot and a falling sheet of paper all accelerate by the same value; only
  air drag and mass change how they *look*.
- **One floor, plus explicit solid surfaces.** The scene's floor line (`--bot-floor`) is the base
  ground plane. Registered climbable layers become static platform/ledge collision rectangles;
  a visual layer is not solid unless it is in that collision map. Anything resting on the floor or
  a platform has support/contact; anything in the air has none. Nothing may pass through a floor,
  platform top, platform underside or solid side.
- **Mass is real.** Every body has a mass. Crid's mass follows his body stage (lean → heavy), the
  bag has a fixed mass, paper has almost none.

## What that buys, in order of visible payoff
1. **Weight while carrying.** Carrying the bag slows his walk and shortens his stride by the ratio of
   bag mass to his strength. Lean Crid visibly works harder than heavy Crid — same bag, different
   man. This is the "the bag is a drag on him" the owner asked for.
2. **Climbing can fail.** A climb is an attempt with a cost: lean Crid with the bag has a real chance
   of slipping — a short slide back down, a scramble, a second attempt. Heavy Crid with the bag does
   not slip. Failure is a state, not an animation glitch, and he recovers from it.
3. **Swinging can pull him off balance.** Picking the bag up with one arm puts a torque on him: a
   lean, tired Crid can be swung off his feet, stumble, and land — then get up. A heavy Crid barely
   rocks. Probability scales with mass ratio and his current state, never random for drama.
4. **Loose things fall properly.** A paper that slips out of the bag falls, catches air, flutters
   (drag, sideways drift, spin), lands, and stays where it lands. A dropped bag falls, bounces once
   with low restitution, settles and stops. Nothing floats, nothing fades out mid-air.

## How it is built (small, cheap, no library)
- `public/desk-assets/physics.mjs` is the single world: ordinary bodies
  `{x, y, vx, vy, mass, drag, restitution}` and one character body with a capsule-like AABB
  (`halfW/halfH`), velocity, strength, grounded/support id, motor intent and optional hand grip.
  One gravity constant, one fixed-step accumulator (1/120 s), one body set and one floor plane.
  The existing bag and loose paper stay in this same integrator. No third-party engine, no canvas,
  no second character simulation loop. Cue-layout navigation is a mutually exclusive screen-space mode; it is not stepped by this world.
- The layer registry supplies static platform rectangles to that world. The motor resolves solid
  sides, platform tops and undersides; the stage planner requests movement but cannot write root
  trajectories. Walk speed/acceleration and grip capacity use strength divided by character mass
  plus carried load. Jump impulses use the same gravity. A ledge grip is a bounded world-space
  anchor; climbing is a force-limited motor toward a target, and sustained overload releases it.
- During physical stage traversal, the DOM host is positioned from the physics body's root. During cue-layout navigation, `startWalk()/advanceWalk()` owns the screen-space position and the stage motor is bypassed; measured displacement still feeds the distance gait. These modes never write the root simultaneously. `crid-3d.js` remains a pose renderer:
  gait phase comes from measured root distance / stride length, stance ankles retain screen-space
  anchors while the root moves, and the existing two-bone IK solves the leg/arm chains. The stage
  state machine only completes a climb/hop after the physics body reports support on that layer.
- Budget: 60 fps on a phone with the bag plus at most a handful of loose bodies. If the frame budget
  is tight, the physics steps at a lower fixed rate and the drawing interpolates.

## What this is not
- Not a 3D ragdoll and not a full rigid-body engine. Two dimensions, one gravity, a floor, a handful
  of bodies — but every physical actor and prop in the world obeys it. Cue-layout presentation is deliberately outside that world.
- Not random. Every stumble, slip and bounce is derived from mass and velocity so it reads as cause
  and effect, and the same input always produces the same result.

## Stages
1. Gravity, floor and the bag: fall, bounce, settle, and carrying slows him by mass ratio.
2. Struggle: climb attempts that can slip, stumble on a heavy swing, recovery beats.
3. Loose paper and small debris with drag and flutter.

## Rules
- Judge at 150 px, 390 px and 1920×1080; a fall that reads only at 1920 is not finished.
- Reduced motion: no bounce, no flutter — states change, positions still obey the floor.
- Nothing may jump, teleport, or rest in mid-air.
