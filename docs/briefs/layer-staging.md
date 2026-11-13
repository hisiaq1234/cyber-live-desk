# Brief — Crid treats the panels as physical objects

**The owner's direction (2026-11-11).** He leans back against a layer, walks from that one to another
one, and takes a wondering pose as he counters. Chat that arrives mid-thought is slid *into* the
thought, not answered separately.

Today none of that is possible, because Crid does not know where anything is. The overlay builds
surfaces ad hoc (`#time-dock`, `#loc-map`, `#auto-headlines`, `.slot` card, `#dock-right`,
`#desk-logo`, `#swae-chat`) and nothing publishes their positions to the bot. Every "interaction with
an overlay" so far has been faked by putting him at a hardcoded spot.

## What to build

### 1. A layer registry (the actual prerequisite)

One place that knows the named surfaces and their **live** bounding boxes in desk coordinates:

`card`, `clock`, `map`, `ticker`, `dock`, `logo`, `chat`, `headlines`, `crid`

- Recomputed on resize, on layout-mode change, and when a surface is added/removed/shown/hidden —
  not on every animation frame.
- Published in desk state so both the renderer and the brain can read it, and readable by name:
  `layer("clock") -> {x,y,w,h,edge:{left,right,top,bottom},z}`.
- A layer that is not on screen is reported as absent, not as a zero box.

### 2. Three behaviours on top of it

- **`walkTo(layer, side?)`** — walk to the named layer's edge and stop at a sensible offset, feet still
  on the floor. Not a teleport: he travels, and his gait matches his body stage.
- **`lean(layer, side)`** — lean his back against that layer's edge, body angled, shoulder in contact.
  Contact has to read as contact: the lean point stays fixed while his idle breathing moves the rest of
  him. **If the layer paints over him, say so plainly in your report rather than faking the contact** —
  the card currently sits on no z-index at all, so this may need a z-index fix to work at all.
- **`ponder`** — a held wondering pose (weight on one leg, head tilted, hand toward the chin), usable
  while leaning and while standing. Reuse an existing sequence if one genuinely reads as thinking;
  otherwise build it from the existing frames. **No new drawings.**

## Constraints

- **No new images, no new frames, no edits to `ladder.json` or the body webps.**
- Movement stays JavaScript-driven — it must survive the broadcast renderer, which kills CSS animation.
- A lean or walk must never reflow, remount or scroll the layer he touches. He is a guest on it.
- Unknown layer names are ignored without throwing.

## Prove it

On `/desk`, a scripted sequence: walk to the card, lean on it, hold, then walk to the clock and lean
there. Report what you actually saw, including whether the lean read as contact or as floating, and
whether any layer painted over him.
