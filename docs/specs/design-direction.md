> Working spec kept with the code so an agent arriving cold can act on it. Read `CLAUDE.md` first.
> Crid is the owner's own Bitmoji: never redesign or generate him, never make him short.

# Design direction — Cyber Live Desk (owner's words, 2026-11-12)

> "The designer needs great UI/UX intentionality for immersion and form so they return."

Two goals, one sentence: the desk must feel like a real place people are watching (**immersion**),
and it must look considered enough that a viewer who leaves comes back (**return**).

## Who Crid is
The owner's own Bitmoji. Never redesign his face, hair, moustache, earring or colouring — the
reference is `public/desk-assets/otolorin-mini-me.png`. Every weight of him is the same man in the
same pose; Snap's renderer gives lean / average / heavy at `rotation=0` (`crid-ladder-spec.md`).
He is not a mascot and not a generic creature.

## Immersion — the rules
1. **One room, one light.** Crid, the cards and the scene share a floor plane, a horizon and a
   light direction. Nothing floats without a surface under it.
2. **Depth is built, not decorated.** Sky → horizon glow → floor → foreground cards. The eye
   should read the layers in that order without being told.
3. **Information lives at the edges, life lives in the middle.** Cards, ticker and clock hold the
   frame's corners; Crid owns the centre column. Neither invades the other.
4. **Every element earns its place.** If a thing on screen has no job, it goes. No filler shapes,
   no ambient noise that competes with him.
5. **Motion means something.** A move is a reaction, an intent or a state change. Idle motion is
   weight and breathing, never random jitter.
6. **Judge at three sizes:** 150 px (phone), 390 px (phone full frame), 1920×1080 (stream).
   A silhouette that only reads at 1920 is not finished.

## Return — the loop
- **Something must happen on a timer the viewer can feel**, even with no news: he shifts weight,
  glances at the ticker, picks something up, walks the floor, sits.
- **Continuity rewards coming back**: his accessories change by day, the backpack gets dropped and
  picked up, small running bits that a returning viewer recognises.
- **The frame must never look frozen.** If a screenshot of two moments apart looks identical, the
  desk is dead on air.
- **Nothing silent.** Every failure shows something honest on screen rather than an empty panel.

## Form
- One type scale, one spacing scale, one card grammar (title / value / meta).
- Colour has roles, not moods: ink, surface, accent, alert. No new hue per feature.
- Corners, strokes and shadows are consistent across every card, including Crid's bubble.
- The brand lockup is one element in one place.

## Budget
Few images, no exploratory batches. Generated images are for props and scene art only — never for
Crid's body or face.
