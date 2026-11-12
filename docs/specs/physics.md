> Working spec kept with the code so an agent arriving cold can act on it. Read `CLAUDE.md` first.
> Crid is the owner's own Bitmoji: never redesign or generate him, never make him short.

# Gravity and weight — a real world for Crid

Owner's words (2026-11-12): *"the bag can sometimes be a drag for him when he is lean and weak, he
might be struggling to climb with it sometimes… he needs gravity, I need realism… it's like a
proper real engine world. If paper falls from the bag, gravity really had to work for all."*

This extends `crid-backpack-spec.md`. Everything below is one world with one set of rules — the
character, the bag and any loose object obey the same gravity, the same floor and the same mass
maths. No element gets to cheat for looks.

## The world
- **One gravity.** A single downward acceleration for every body, in screen units per second².
  A dropped bag, a slipping foot and a falling sheet of paper all accelerate by the same value; only
  air drag and mass change how they *look*.
- **One floor.** The scene's floor line (`--bot-floor`) is the only ground. Anything resting on it
  has a contact shadow; anything in the air has none. No body may rest above the floor without a
  reason, and nothing may pass through it.
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
- A new `public/desk-assets/physics.mjs`: bodies `{x, y, vx, vy, mass, drag, restitution}`, one
  gravity constant, one floor plane, a fixed-step integrator driven by the existing rAF loop.
  Collisions are floor-only plus one simple constraint (hand ↔ bag). No third-party engine, no
  canvas, no per-frame allocation.
- Crid's own motion goes through the same integrator: walk speed = strength / total mass, climb is an
  attempt resolved against a mass ratio, stumble is an impulse the body then recovers from.
- Budget: 60 fps on a phone with the bag plus at most a handful of loose bodies. If the frame budget
  is tight, the physics steps at a lower fixed rate and the drawing interpolates.

## What this is not
- Not a 3D ragdoll and not a full rigid-body engine. Two dimensions, one gravity, a floor, a handful
  of bodies — but every visible body in the frame obeys it.
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
