# Crid living world — diagnosis and dependency-ordered plan

Written against the owner's full brief (body / rig / physics / backpack / climbing / falling /
brain / persistence / immersion). Read `CLAUDE.md` and `docs/specs/body-ladder.md` first.

## What is actually true today (verified, not assumed)

- **Canonical body**: seven real builds from the owner's own `bm-preview` avatar recipe —
  bare chest, camo trousers, socks, shoes, `bag=-1` (backpack is a prop, not a render). Same
  pose, same 1190px ink height, same head top, same ground line on every stage
  (`ladder.json`). Order lean→heavy proven on ink area: `3,0,4,5,1,11,2`.
- **Snap's floor**: there is no nude render. `bm-preview` with no clothes still paints a white
  undershirt + briefs; `avatar-builder-v3` does the same and ignores outfit params. Bare chest +
  his own kit is the most naked Crid can be — do not chase a "fully nude" render that does not exist.
- **Rig**: every stage has its own ten-piece cut from its own frame (`rigs/<stage>/`), anatomy
  measured per body, `--check` proves coverage/reconstruction/joint integrity. `crid-bot.js`
  re-points one set of piece images at the active stage's crops and pivots on every body swap.
- **Motion**: procedural joint animation — walk cycle (alternating steps, arm counter-swing,
  chest bob), living idle (weight shift, knee softening, asymmetric arms), lean/ponder, gestures,
  micro-emotions, death transition. `slow`/`heft` per stage already scale timing.
- **Brain**: `brain/` — rules engine, memory/moments, personality lines, micro-emotions, cue
  channel into the overlay. Twitch IRC + EventSub normalization already exists.
- **Gaps**: no physics simulation, no backpack object, no climbable surfaces, no object
  persistence, no body-mass-driven behaviour differences beyond `slow`/`heft` timing.

## Dependency order (each step is its own branch/PR)

1. **Physical properties per stage** — extend `ladder.json`/`BODY_LADDER` with mass, strength,
   balance, reach, centre-of-mass offset, grip, stamina, carry capacity derived from measured
   ink (torso area, limb width). One `bodyProps(stage)` accessor; actions read it, never hardcode.
2. **Shared physics core** — small fixed-step integrator inside the existing rAF loop: gravity,
   floor + platform collision, momentum, friction. No library, no canvas. One world, one gravity.
3. **Backpack as an object** — SVG prop in `crid-bot.js` (his palette, reads at 150px): worn /
   one-strap / dropped / carried states, own mass and collision, contents (papers/books) as
   bodies under the same integrator. Weight feeds step length, speed, lean-forward compensation,
   stumble chance — scaled by `bodyProps`, so lean+heavy bag ≠ heavy+heavy bag.
4. **Surfaces and climbing** — floor + platforms/ledges as collision geometry (not visual layers).
   Climb = approach → grip/contact → weight transfer → ascend/fail, driven by the same rig
   joints and physics. Falls have consequences (height, speed, load, posture → land/stumble/
   recover); nearby objects react.
5. **World state + persistence** — object positions, Crid's activity, dropped-item locations
   persisted as meaningful state (not per-frame); reload restores coherently.
6. **Brain-driven activities** — reuse the existing initiative engine: decide → feasibility check
   (can he carry it? reach it?) → execute → react to physical outcome → remember. No second brain.
7. **CRIDOLITH / game night** — campus game on the jumbotron with Crid as director; Twitch chat
   commands through the existing cue/state path; phone join via Twitch identity (profile images),
   subs as gameplay assistance. Separate spec once the living world exists — the game needs a
   body that can move, carry and fall first.

## Rules that do not move

- Identity: crops of his real renders only; never redraw, never generate him.
- One pose (`rotation=0`), one light, one Crid per page.
- Transparent overlay for live stream; room/scene only for AFK mode.
- Small focused PRs; verify at 150px / 390px / 1920×1080; `npm test` + `git diff --check`.
