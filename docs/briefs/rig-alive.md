# Brief — the rig must be alive on its own

**The owner's direction (2026-11-11).** The rig should be alive like an animation, not a game-control
body: **swift and active, like a kid.** He moves himself. Nothing drives him but his own state.

Today the GLB ships T-posed and is posed by hand into a standing frame. That is a mannequin, and it
reads as one.

## What "alive like a kid" means in practice

- **There is no static pose.** Even at rest he breathes, shifts weight, looks at something, scratches,
  bounces on his heels. A held frame is a bug, not a rest state.
- **Bursts, not drift.** Kids move in quick starts and stops: fast into a movement, then still. Avoid
  slow continuous lerping — that is what reads as a game controller.
- **Snap, overshoot, settle.** 120–200ms to the new shape, a small overshoot past it, then a settle.
  Anticipation for anything big — he dips before he jumps.
- **Overlapping action.** The head leads, the spine follows, the limbs trail. Nothing arrives at once.
- **Never a visible loop.** Randomise timing and amplitude per cycle so no two breaths are identical.
  An idle that loops on the frame is worse than no idle.
- **Asymmetry.** Weight on one leg, one shoulder lower, head tilted. Symmetry is the tell of a rig.
- **Secondary motion.** The backpack straps and the bag lag behind him and settle after he stops.
- **Root motion.** He changes where he is, not just how he stands — a step, a half-turn, a shift along
  the layer he is on.
- **Feet plant.** No sliding. When he shifts weight the foot stays put and the hip moves.

## What to build

1. **A procedural idle layer** that runs continuously with no input — breathing, weight shifts,
   look-arounds, fidgets, at randomised intervals.
2. **A small set of authored clips** the brain can trigger: fidget, bounce, look-around, stretch,
   hop-up, sit, hang, lie-back. Short — a second or two each.
3. **Drive them through the existing cue channel** (`state.bot.cue`) so the brain chooses what he does,
   the same way it already makes him gesture. No new transport.

## The backpack comes back

The render match hid `outfit_bag_GEO` to avoid the broken back. But the backpack is not optional —
Crid is **always shirtless, always with a backpack he can drop.** That is his identity, not an accessory.
So the bag must render correctly on him by default, and be hidden only at the moment he drops it. Fix
the bag's rendering rather than leaving it off; the straps also give you the secondary motion above.

## Constraints

- It must run with **no input at all** — the owner is streaming, not playing a character.
- **No AI-generated images.** Everything is rendered from the rig.
- The desk still ships flat images to the browser; do not add runtime 3D cost to the stream overlay.
- Do not lose the render match to the 2D look — that is the current task and it stays the reference.

## Prove it

Capture a few seconds of him idling with nobody touching anything, and a couple of the authored clips,
and put them where the owner can watch them. Say plainly what still reads as stiff.
