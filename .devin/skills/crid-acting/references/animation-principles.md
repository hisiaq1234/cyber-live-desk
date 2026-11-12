<!--
  Vendored from https://github.com/matinsizen/ai-3d-animator-skill
  File: references/animation-principles.md
  License: MIT — see ../LICENSE
-->

# Phase 4 — Animation Principles (How a Human Pro Animates)

This document operationalizes the classical 12 principles into concrete 3D recipes. Read it before animating anything, and run the [anti-pattern audit](#anti-pattern-audit) before QA.

**Table of contents**
1. [The pro pipeline](#1-the-pro-pipeline) · 2. [Timing charts](#2-timing-charts) · 3. [Easing library](#3-easing-library) · 4. [Squash & stretch with volume preservation](#4-squash--stretch) · 5. [Anticipation, settle, overlap](#5-the-three-secret-sauces) · 6. [Secondary motion](#6-secondary-motion) · 7. [Arcs](#7-arcs) · 8. [Camera language](#8-camera-language) · 9. [Anti-pattern audit](#9-anti-pattern-audit) · 10. [Worked example: timing sheet](#10-worked-example)

---

## 1. The pro pipeline

Amateurs keyframe start → end and call it done. Professionals work in passes:

**Pass 0 — Intention.** For every action answer: what does the character *want*, what's in the way, what happens? (Blob wants the button; the button is far; he jumps.) Motion without intention is noise.

**Pass 1 — Blocking (stepped).** Place only the storytelling poses: anticipation, contact, extreme, settle. Roughly one pose every 4–8 frames. In Blender set keyframe interpolation to CONSTANT to preview the beats; in Three.js render the timeline with `?still=1` at each key frame.

**Pass 2 — Spline.** Switch to curves, assign each segment an easing *with a reason* (gravity = ease-in falling, muscle = ease-out push, camera = ease-in-out).

**Pass 3 — Polish.** Offset children (overlap), add secondary motion, squash on impact, settle overshoot, then remove 10% of the keys you added (snappier is better).

**Budget guide:** for a 240-frame (8 s @ 30 fps) shot expect ~10–16 keys for a simple action, ~30 for a character gag. If you have 5 keys the motion is stiff; if you have 80 it's mush.

## 2. Timing charts

Frame counts at 24 fps (multiply by 1.25 for 30 fps, 1.5 for 36…). These numbers *are* the craft — learn them:

| Action | Frames @24 | Note |
|---|---|---|
| Blink | 3–4 | 1f close, 1f closed, 1f open |
| Head turn (small) | 6–8 | eyes lead by 2f |
| Head turn (large) | 10–14 | |
| Wave (one cycle) | 12–16 | |
| Hop: anticipation | 4–6 | squash down |
| Hop: rise | 6–8 | ease-out (fast at start) |
| Hop: fall | 5–6 | ease-in (accelerate) |
| Landing squash | 2–3 | biggest deform frame is the contact frame |
| Settle after land | 6–8 | overshoot 5–8%, then rest |
| Door close / button press | 10–14 | |
| Reveal (panel/curtain) | 18–24 | |
| Camera push-in (subtle) | 72–120 | easeInOut |
| Whip pan | 3–5 | needs motion blur or smear |
| Idle breath cycle | 48–60 | period must divide loop length |
| Turn (character 360°, playful) | 30–36 | easeInOutQuint |

**Holds are shots too.** A 12-frame hold after a landing is where the audience catches up. Silence and stillness are timing tools, not empty time.

**Newton rules:** rise = decelerate (`easeOutCubic`), fall = accelerate (`easeInCubic`), hang time at apex = the arc's top 10% takes ~30% of the flight (parabola gives this for free — see [arcs](#7-arcs)).

## 3. Easing library

Choose easings deliberately; name the reason in the timing sheet. Reference implementations (drop-in JS):

```js
// Feel: fast→slow (energy spent). Use for: pushes, pops, landings, reveals
const easeOutCubic   = x => 1 - Math.pow(1 - x, 3);
// Smooth both ends. Use for: camera moves, loops, gentle turns
const easeInOutCubic = x => x < 0.5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3) / 2;
// Accelerate. Use for: falling, closing, charging up
const easeInCubic    = x => x*x*x;
// Overshoots then settles. Use for: entrances, buttons, anything "pops"
const easeOutBack = (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
// Elastic wobble. Use for: Puffy style only, tiny amounts
const easeOutElastic = x => x === 0 || x === 1 ? x : Math.pow(2, -10*x) * Math.sin((x*10 - 0.75) * (2*Math.PI/3)) + 1;
// Bounce. Use for: ball drops (rarely characters)
const easeOutBounce = x => { const n = 7.5625, d = 2.75;
  if (x < 1/d) return n*x*x;
  if (x < 2/d) return n*(x -= 1.5/d)*x + 0.75;
  if (x < 2.5/d) return n*(x -= 2.25/d)*x + 0.9375;
  return n*(x -= 2.625/d)*x + 0.984375; };
// Long elegant moves. Use for: dollies, big reveals
const easeInOutQuint = x => x < 0.5 ? 16*x**5 : 1 - Math.pow(-2*x + 2, 5) / 2;
// Damped spring for interactive follow (mouse/physics-ish)
function spring(cur, target, vel, stiffness = 120, damping = 14, dt = 1/60) {
  vel += (stiffness * (target - cur) - damping * vel) * dt;
  return [cur + vel * dt, vel];
}
```

| Ease | Feel | Typical use |
|---|---|---|
| `easeOutCubic` | fast→slow | pushes, pops, reveals |
| `easeInCubic` | slow→fast | falls, closes |
| `easeInOutCubic` | smooth S | camera, loops |
| `easeInOutQuint` | long dramatic S | dollies, big transitions |
| `easeOutBack` | overshoot ~10% | entrances, UI pops |
| `easeOutElastic` | springy wobble | puffy only, sparingly |
| `easeOutBounce` | physical bounce | balls |
| `linear` | mechanical | turntables, conveyors only |

**Blender equivalents:** keyframe → `interpolation='BEZIER'` with `handle_left_type = handle_right_type = 'AUTO_CLAMPED'` covers 90% (it gives a natural S-curve). For overshoot either place an explicit overshoot key (more control, recommended) or set `kp.interpolation='BACK'`, `kp.easing='EASE_OUT'`. `interpolation` also accepts `'SINE','EXPO','QUAD','CUBIC','QUART','BOUNCE','ELASTIC'`.

## 4. Squash & stretch

The #1 missing ingredient in AI animation. Rules:

- **Stretch** along the direction of travel while moving fast; **squash** perpendicular on impact.
- **Preserve volume:** if you scale Y by `s`, scale X and Z by `1/√s`:

```js
function squash(mesh, s, axis = 'y') {           // s = factor along axis
  const rest = 1 / Math.sqrt(s);
  if (axis === 'y') mesh.scale.set(rest, s, rest);
  if (axis === 'x') mesh.scale.set(s, rest, rest);
  if (axis === 'z') mesh.scale.set(rest, rest, s);
}
```

- Amounts: cartoony characters land at 0.75–0.85 (squash) and 1.15–1.3 (stretch). Props: half that. "Serious" styles (Glass, Isometric): 0.9/1.08 max.
- Scale from the **contact point** (bottom of the ball), not the center — in Three.js put the mesh in a group so the mesh's origin sits at its base; in Blender set the object origin to the base (`Set Origin → Origin to 3D Cursor` placed at the floor) or scale a parent empty.

## 5. The three secret sauces

These three moves are what separate "moves" from "animated". Apply to *every* action:

**Anticipation** — before any action, a small move the opposite way. Wind-up: squash 15–25% and/or lean back 5–10° for 4–6 frames *before* a jump; pull the hand back before a press; crouch before a dash. Big action = longer anticipation. This single habit makes motion readable.

**Settle (no dead stops)** — never end a move at rest exactly: overshoot ~5–8% past the target, then ease back over 4–8 frames. `easeOutBack` gives this for free; or key target → 105% → 100%.

**Overlapping action / follow-through** — nothing on a body stops at once. Offset each part's timing: body starts at f0, head +2f, arms +4f, tail/ears +6f, and they keep moving 2–4 frames *after* the body stops (rotate them slightly past, return, rest). In code: run the same easing with a per-part `offset` and a slightly longer duration for the looser parts.

## 6. Secondary motion

Constant micro-life, all loop-safe (periods divide loop length):

- **Breathing:** scale Y 1 → 1.015 → 1, period 2–2.5 s, phase-offset per character (`sin(2π t/T + phase)`).
- **Blinking:** every 2.5–4 s, 3 frames, two eyes 1 frame apart. Never blink on the beat of an action.
- **Idle sway:** rotation ±2–5° sine; tails/antennae lag with larger amplitude and +0.5 rad phase.
- **Float:** anything hovering bobs ±2–4% of its height, slow sine; shadow scales inversely (smaller + fainter at top of bob).

## 7. Arcs

Living things move on curves, never straight lines. For any jump/dash/fall through space, lerp along a quadratic Bézier:

```js
function arcPoint(a, b, height, t) {              // t in 0..1 (eased by caller)
  const mid = a.clone().lerp(b, 0.5); mid.y += height;
  const p1 = a.clone().lerp(mid, t), p2 = mid.clone().lerp(b, t);
  return p1.lerp(p2, t);
}
// usage: pos = arcPoint(start, end, 2.2, easeInOutCubic(t))
```

The apex hang-time comes free. For flips, add rotation `2π * t` around the travel axis.

## 8. Camera language

The camera is a performer. Default: it does *something subtle* every shot — or nothing, if the scene's motion is the story (isometric dioramas).

**Shot sizes** (vertical framing of subject): wide = subject ≤ 40% of frame height (establish), medium = 60% (action), close-up = >100% (emotion/reveal). A 5 s shot usually wants one size; change size = cut, not zoom, in story videos.

**Lenses:** 35 mm = playful wide (slight distortion, more environment) · 50 mm = neutral default · 85 mm = portrait compression, lovely for product close-ups. FOV in Three.js: h≈39° (35 mm), 27° (50 mm equivalent on full frame ≈ use fov 40 for wide-ish default), 16–20° for long-lens compression. Blender: `cam_d.lens = 35|50|85`.

**Standard moves (with recipes):**

| Move | Recipe |
|---|---|
| Push-in (tension/growth) | dolly distance −10% over 3–4 s, `easeInOutCubic`, target fixed on subject |
| Pull-out (reveal/departure) | dolly +15% over 3 s; end 0.5 s after action ends |
| Orbit (showcase) | constant angular speed 5–15°/s **(linear is legal here)** + tiny vertical sine bob; only turntable contexts |
| Follow | spring-damper toward subject (`spring()` above); stiffness low = dreamy |
| Whip pan | 3–5 f across, add horizontal stretch smear or motion blur |
| Handheld | add perlin-ish noise: `rot += 0.004*sin(7.3t)+0.003*sin(11.7t)` per axis — tiny! |

**Composition:** rule of thirds (subject on a third, not dead center — except symmetric "product" shots), look-room in front of moving characters, horizon level unless style says otherwise, and check the **first and last frame** of every camera move as standalone compositions.

**DOF:** f/2.8–4 for close-ups (Blender `dof.aperture_fstop`, focus_distance on subject eyes; Three.js: postprocess `BokehPass` — use sparingly, it costs perf).

## 9. Anti-pattern audit

Run this before QA. If ANY is true, redo the animation pass:

- [ ] Any motion uses default/linear easing without a mechanical reason
- [ ] Everything moves at the same time (no offset/overlap) — feels mechanical
- [ ] No anticipation before the main action
- [ ] Actions end dead (no overshoot/settle)
- [ ] Constant-speed character motion (machines move at constant speed; creatures don't)
- [ ] Landing without squash, or squash without volume preservation
- [ ] Jump on a straight line instead of an arc
- [ ] Idle scene where characters are frozen statues (no breath/blink/sway)
- [ ] Camera moves without a reason, or camera moves + fast action competing for attention
- [ ] Uniform scale pops (scaling x/y/z equally when deforming)
- [ ] Loop seam visible (first frame ≠ last frame pose)

## 10. Worked example

**Shot:** blob hops onto a button and presses it (240 f total, 30 fps).

| # | Action | f | Ease | Sound |
|---|---|---|---|---|
| 1 | Idle breath, one blink | 0–15 | sine | — |
| 2 | Eyes look at button | 15–21 | easeOutCubic | tiny blip |
| 3 | Anticipation: squash 0.8, lean back | 21–27 | easeInOutCubic | — |
| 4 | Jump arc (apex at 33) | 27–39 | parabola + easeInOut | whoosh @27 |
| 5 | Fall | 39–45 | easeInCubic | — |
| 6 | Contact: squash 0.78 + dust puff | 45–48 | easeOutCubic | thud + pop @45 |
| 7 | Settle overshoot 1.05→1.0 | 48–57 | easeOutBack | soft "boing" |
| 8 | Button depresses 20% | 57–61 | easeInCubic | click @58 |
| 9 | Panel rises (secondary payoff) | 61–81 | easeOutCubic | sparkle @61 |
| 10 | Blob blinks, happy bounce ×2 | 81–105 | easeOutElastic 30% | two plucks |
| 11 | Rest hold | 105–120 | — | music only |

Note beats 3/6/7: anticipation, squash, settle — the trio. Note silence at beat 3: a gap before an impact makes the impact land.
