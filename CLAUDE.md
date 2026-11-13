# CLAUDE.md — read this before you touch anything

You are picking up **Cyber Live Desk**, the live on-air desk for OTOLORIN's cyber stream. This file
is the handoff. It is written so that an AI agent arriving cold — with no chat history — can keep
the work moving in the direction the owner actually wants. Read it fully, then `docs/CRID-STATUS.md`,
`AIM-OF-EXISTENCE.md` and `PROGRESS.md`.

If this file and the code disagree, the code is right about *what is*, this file is right about
*what is wanted*. Fix the file in the same PR.

---

## 1. The one rule that outranks every other rule

**CRID IS THE OWNER'S OWN BITMOJI. HE IS NEVER REDESIGNED.**

Crid is not a mascot we invented and he is not a character to be reimagined, restyled, "improved",
generated or reinterpreted. His face, hair, moustache, earring, skin tone and colouring come from
the owner's real Bitmoji avatar, and the owner wants *that* character — exactly, every time.

Therefore, in this repo:

- **Never generate Crid's body or face with an image model** (nano-banana, DALL·E, Midjourney, any
  diffusion tool). Generated images are for **props and scene art only** — a backpack, a chair, a
  wall panel, a floor. Never the person. A generated Crid is a *different person*, and that is the
  single worst thing you can ship here.
- **Never hand-draw, re-illustrate, re-shade, re-proportion or "clean up" him.** No new art of the
  character. If he looks wrong, the fix is a better render from Snap's own renderer, not a drawing.
- **The identity of record is the shipped renders** in `public/desk-assets/crid/` and the exact
  avatar recipe in `docs/crid-avatar-params.json`. Re-render from that recipe to get a new *pose* or
  a new *weight* of the same man — never a new man.
- If you cannot render him faithfully, **stop and ask the owner**. Shipping a wrong Crid is worse
  than shipping no change.

### Never short

The owner has said this in as many words: *never short*. Crid keeps his height. What changes when
his weight changes is **width and mass only**:

- **Height is fixed.** Top of head and soles of feet sit at the same y on every stage of the ladder.
- **Head size is fixed.** No stage has a smaller or larger head than another.
- **Weight = width and mass.** A heavier stage carries more through the torso, hips, arms and legs,
  at the same height, in the same pose, wearing nothing.
- **Snap's renderer gives exactly seven distinct front-facing builds** — `body=3,0,4,5,1,11,2`,
  lean -> heavy; every other value duplicates one of them. All seven are measured to the same ink
  height and head top (`ladder.json`), so none of them is short.
- Never scale the whole sprite down to fit a layout. Fix the layout.

### Bare chest, his own kit

**Crid's torso is bare and he wears his own trousers, socks and shoes** — the owner's avatar
recipe verbatim (`bm-preview/v3/avatar/body`, the URL in `fetch-crid-views.mjs`), with the
backpack removed (`bag=-1`) because the bag is a prop he carries, not clothing. Bare chest means
bare chest: no shirt, no straps, no second outline over his body.

Snap's renderer has **no nude render** — its floor is a white undershirt and briefs, which is
what the old `avatar-builder-v3` ladder shipped and why he read as "a white top." That endpoint
is wrong for him; `bm-preview` with his real outfit params is the identity of record. Do not
revert to it.

### One pose, always

Every stage of the ladder is the **same front-facing render at `rotation=0`**. Never mix
three-quarter renders (`rotation=7`) into the ladder — that is what made a weight change swap the
person before. One pose, one outfit, one light, one character.

---

## 2. What the desk is

Three surfaces, no build step, deployed on Vercel from this repo:

| Surface | Served by | What it is |
| --- | --- | --- |
| `/desk` | `api/desk.mjs` (HTML shell) + `public/desk-assets/overlay.js` | The on-air overlay: headline cards, live clock, cyber radar, research ticker, scene, and Crid |
| `/control` | `public/control.html` (+ `control.js`) | The operator surface that drives the desk |
| `brain/` | local Node loop | Crid's decision loop — reactions over chat, no cloud, no model |

- `public/desk-assets/scene.js` contains an optional synthetic room backdrop (sky, grid, horizon, floor).
  The default `/desk` stays transparent over the real camera feeds; `?bg=1` opts into the synthetic room.
- Overlay long-polls `GET /api/desk/state?since=<version>` (204 = no change). Control writes with
  `POST /api/desk/action` and a `Bearer` operator token.
- `DESK_OPERATOR_TOKEN` is a **sensitive** Vercel variable — nobody can read it back, including the
  owner's own agents. Never try; ask the owner to run an authenticated check.
- **One CRID per page.** One host element, one cue reader, one state poll, one set of gestures. A
  theme (`?overlay=brand`, `?variant=brand`, `?brand=1`) is a skin over the same one CRID — never a
  second copy. This is an architectural rule, not a styling preference.

---

## 3. The design bar

Work here is judged on two things the owner named, and nothing else counts as done until they hold:

**Immersion.** GTA is the visual language of the entire broadcast HUD, not just Crid's surroundings.
The camera feeds remain the world; the overlay supplies the minimap, location, identity, live status,
stories, transitions and Crid as one coherent GTA-inspired interface. Use the game's HUD hierarchy,
map behaviour, markers and motion language without importing its branding or hiding the cameras.
Crid stands *in* the footage — his shadow lands on something and the HUD stays anchored to the feed.
If an element has no reason to be where it is, it is wrong.

**Return.** Something must visibly happen on a timer even when there is no news, and there must be
continuity — daily accessories, recurring bits, a running gag — so a viewer who comes back sees that
time passed. If two screenshots taken minutes apart look identical, the desk is dead on air.

**Judge at 150 px, 390 px and 1920×1080.** The desk is watched on a phone as often as on a desktop.
Passing tests prove nothing about how it reads. Take a screenshot and *look* at it — at phone scale
first, because that is where thin lines, small faces and floating props die.

---

## 4. Where the work is going (continue from here)

The owner's current arc, in order. Do not skip ahead; each step is the foundation of the next.

1. ~~**Body ladder, rebuilt from one render.**~~ **Done:** seven real builds from Snap's renderer
   at `rotation=0` — `body=3,0,4,5,1,11,2`, lean -> heavy — same pose, same height, width and mass
   only. Built by `scripts/build-body-ladder.py`; measured into `ladder.json`.
2. ~~**Rig on every stage.**~~ **Done:** `scripts/build-crid-rig.py --all` cuts all seven stages
   from their own frames into `public/desk-assets/crid/rigs/<key>/` (anatomy measured per body,
   no shared pixel constants); `crid-bot.js` re-points one set of piece images at the active
   stage's crops and pivots on every body swap, so limbs always match the body he wears.
3. **The backpack.** Crid carries a bag he drops and picks up during the stream. Spec:
   `docs/specs/backpack.md`. SVG in `crid-bot.js`, in his palette, no image budget, must read at
   150 px.
4. **Gravity.** The bag has weight, and weight drags on him when he is lean — he struggles to climb
   with it, he stumbles, and anything that falls out of it falls properly. Spec:
   `docs/specs/physics.md`. A small fixed-step integrator inside the existing rAF loop: one gravity,
   one floor, floor-only collision plus a hand↔bag constraint. No physics library, no canvas, 60 fps
   on a phone.

Open, older items (do not silently "fix" these — they need the owner's go-ahead):
the X feed can still answer `502` on air when the configured credentials are rejected upstream —
the OAuth 1.0a signing fix is merged, so what is left is credential validity: the Vercel project
needs `X_BEARER_TOKEN`, or all four of `X_CONSUMER_KEY`, `X_CONSUMER_SECRET`, `X_ACCESS_TOKEN`,
`X_ACCESS_TOKEN_SECRET` (see the env table in `AUDIT_FEASIBILITY.md`). Auto-research is driven by
`.github/workflows/auto-research.yml` (Vercel's free plan has no usable cron frequency), which
needs the `DESK_URL` repo variable and the `CRON_SECRET` secret set — verify they are, because a
missing secret makes every run answer 401. `/api/spotify/top` is unconfigured and nothing calls it.

---

## 5. How to verify, and how to ship

- **Run it.** `npm install` once, then serve the repo (`npx vercel dev` or any static server with the
  `api/` functions). `npm test` for the test suite.
- **Look at it.** Screenshot `/desk` at 1920×1080 and at phone width, and look. Then judge it against
  §3. Tests passing while the desk looks wrong is a failure, not a pass.
- **Deploy = merge.** Merging to `main` builds and deploys production automatically through the
  Vercel GitHub integration. There is no separate deploy step and no API token to use — the old
  `vcp_` token is dead, do not go looking for it.
- **Prove the deploy.** After a merge, compare the live file to the merged file:
  `curl -sI https://cyber-live-desk.vercel.app/desk-assets/overlay.js` (read `last-modified`) and
  `curl -s https://cyber-live-desk.vercel.app/desk-assets/overlay.js | wc -c` against
  `wc -c public/desk-assets/overlay.js`. Byte-identical or it is not shipped.
- Live desk: **https://cyber-live-desk.vercel.app/desk** (the root redirects).

## 6. Working style the owner has asked for

- **Do not rewrite what already works.** Read the code, diagnose, then make the smallest change that
  fixes the actual cause. Broad refactors, new frameworks and re-architecting are not wanted.
- **Do not stray and do not burn usage.** One focused task per branch. No speculative features, no
  "while I was in there" changes, no new dependencies without a reason that survives §3.
- **Small PRs on feature branches.** Finish with `main` checked out and a clean tree.
- **Say what you verified and how.** "Tests pass" is not a result. "Screenshot at 390 px shows his
  feet on the floor line and the bag resting on the ground" is.
