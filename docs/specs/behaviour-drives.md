> Working spec kept with the code so an agent arriving cold can act on it. Read `AIM-OF-EXISTENCE.md`
> first. Crid is the owner's own Bitmoji: never redesign him, never generate art for him.
> This spec adds no images and touches no drawings. It is about what makes him decide.

# Crid's behaviour — drives, routine, arbitration, activities (spec v1)

## What this is

The answer to one question: **when nobody is touching anything, why does Crid do the thing he does
next?** It defines three quantities that move on their own (energy, boredom, attention), a daily
rhythm that biases the choice, a priority ladder in which chat always wins, an exact contract for
what happens when chat interrupts him, and the catalogue of activities — each with a **start, a
middle, an end and a trace left behind** — including walking the floor and climbing/using the panels
through the layer registry.

It is written so the engineer can build it in the slices in §13, each one testable on its own.

## What this is not

- Not art, not the rig, not the HUD, not the body ladder. `ladder.json` and the webps are untouched.
- Not a new transport. Everything it makes Crid do goes out through the **existing cue channel**
  (`state.bot.cue = {name, at, text?}`, see `public/desk-assets/cue.mjs`) and the existing desk poll.
- Not a second brain. Chat, the owner's voice, operator input and these drives all land in the same
  place and are weighed together (Aim, "One brain"). This module is one input to that brain.
- Not the thoughts layer. Thoughts are a *kind of activity* here; their content is designed
  elsewhere (`docs/briefs/thoughts-debate.md`).

---

## 1. Where it lives — two halves and one seam

| half | file (new) | runs where | owns |
|---|---|---|---|
| **brain** | `brain/being.mjs` (pure, no DOM, no `fetch`) | server, called from the brain tick | drives, routine, arbitration, activity choice, the trace ledger, the checkpoint |
| **body** | `public/desk-assets/being-body.mjs` | desk page, alongside `overlay.js` | his `x`, `surface`, walking, climbing, leaning, props, and executing an activity's steps |

**The seam is one object, carried on the existing cue field:**

```js
state.bot.cue = {
  name: "lean",            // an existing SEQ / FEEL / "say" name — unchanged vocabulary
  at: 1712,                // monotonically increasing stamp, as today
  text: "",                // only for name === "say"
  act: {                   // NEW, optional. Absent = a plain one-off gesture (today's behaviour).
    id: "a7f3",            // this activity instance
    key: "read-card",      // from the catalogue in §8
    step: "start",         // "start" | "middle" | "end" | "resume" | "abandon"
    layer: "card",         // target from the registry, or null
    side: "left",          // "left" | "right" | "top" | null
    resume: false,
    until: 1750000000000   // when the brain expects this step to be over (ms epoch)
  }
}
```

- An old overlay ignores `act` and performs the gesture — so **this ships without breaking the desk**.
- The body half never needs to know why. It executes `key` at `layer/side`, and when `until` passes it
  is done.
- The brain half never needs the DOM. It reads the layer registry's published snapshot
  (`layers.mjs` `snapshot()`) as plain JSON.

**Write-back is optional and must not block a slice.** The desk page does not currently hold the
operator token, so the body cannot report completion. The brain therefore **closes every activity on
its own `until` timer** with `outcome:"unconfirmed"`. If the operator surface (which does hold the
token, `public/desk-assets/control.js`) posts a `bot-being` action on activity end, the brain upgrades
that trace to `done`/`abandoned`. Slice 7 only; nothing else waits on it.

---

## 2. Time

- **One step per brain tick** (`api/brain-tick.mjs`, `poll` 1–30 s, default 3 s), and **all rates are
  per real second**, computed from `dt = now − lastStepAt`. Changing the poll rate must not change
  his life — a 30 s tick and a 1 s tick must produce the same drives a minute later.
- `dt` is clamped to `[0, 5000]` ms per step so a sleeping tab cannot teleport his state.
- Decisions (choosing a new activity) happen at most once per **1500 ms**; drive decay happens every
  step regardless.
- Time of day is **Africa/Lagos** (the owner's wall clock), not UTC.

---

## 3. The three drives

All three are floats **0–100**, persisted to one decimal, and **never reset by a reload** (§10).
`0` and `100` are real ends of a range, not decoration: thresholds below are the only thing the rest
of the system reads.

### 3.1 Energy — how much body he has

`0` = spent, `100` = fresh. Decays every second, faster the harder the activity, and recovers only
while resting.

```
energy -= ENERGY_DECAY * load(activity) * dt      // when load > 0
energy += RECOVER(activity) * dt                  // rest / doze / sitting
```

| constant | value |
|---|---|
| `ENERGY_DECAY` | `0.006` /s (100 → 0 in ~4.6 h of idle) |
| `load` idle / fidget | 1.0 |
| `load` walk | 2.2 |
| `load` climb | 3.2 |
| `load` workout | 4.5 |
| `load` read / work | 0.6 / 0.9 |
| `load` rest, doze, sit, lean | 0 |
| `RECOVER` doze / lie-back | `+0.050` /s |
| `RECOVER` sitting rest | `+0.012` /s |
| drink water | `+6` once, and **decay paused 60 s** |

**Thresholds and what each one biases:**

| energy | state | bias |
|---|---|---|
| > 70 | fresh | walk speed ×1.06; `workout`, `climb`, `wander` scores +0.25 |
| 40–70 | steady | no bias |
| 20–40 | flagging | walk speed ×0.90; `workout` disqualified; `sit`, `lean-watch`, `read-card`, `rest` +0.3 |
| < 20 | spent | only `rest`, `doze`, `sit`, `drink-water` are eligible; if he is on a layer top he **descends first** (§9.5) |
| < 8 | collapsing | he lies back **where he stands** (`lie-back`), trace `reason:"energy"`, and no non-rest activity is eligible until energy > 25 (hysteresis — he does not stand up at 8.1) |

### 3.2 Boredom — how much he needs something to happen

`0` = engaged, `100` = unbearable.

```
boredom += BORE_RATE(activity) * dt
boredom -= { 45 on any activity start, 30 on a chat message,
             12 on a new headline, 20 on a layer appearing near him }
```

| constant | value |
|---|---|
| `BORE_RATE` nothing running, no chat in 20 s | `+0.55` /s (0 → 55 in 100 s) |
| `BORE_RATE` low-stimulation activity (read, work, rest) | `+0.20` /s |
| `BORE_RATE` high-stimulation (workout, climb, show-story, wander) | `0` |

**Thresholds:**

| boredom | state | bias |
|---|---|---|
| < 25 | settled | idle fidgets only, slowest rate |
| 25–55 | restless | glance frequency up; `wander`, `check-map`, `lean-watch` +0.25 |
| > 55 | must move | boredom is the dominant score term (already weighted highest, §4); idle fidget interval drops toward its floor |
| > 80 | climbing the walls | the **highest-novelty eligible activity wins outright**, even out of its routine slot; may break a slot's forbidden list except `doze` |

Idle fidget interval (secondary motion, not an activity): `clamp(9 − 0.06·boredom, 2.5, 9)` seconds.

### 3.3 Attention — how much he needs to put something in front of people

`0` = keeps to himself, `100` = needs eyes on him.

**This is not a need for validation.** Per the Aim, *whether chat or the owner responds changes
nothing about whether he continues.* Attention is satisfied by **showing** — the act of putting a
thing in front of the audience — and acknowledgement is a bonus that relieves it faster, never a
precondition for him carrying on.

```
attention += { 0.35/s while chat has had a message in the last 60 s,
               0.12/s while the room is quiet,
               +3 per chat message not yet acknowledged,
               +8 per gift or sub,
               +2 per story he decides is worth showing }
attention -= { 40 when chat or the owner acknowledges him,
               25 when a "show" activity completes (shown is enough),
               15 when he speaks a line,
               0.05/s passive decay always }
```

**Thresholds:**

| attention | state | bias |
|---|---|---|
| < 30 | content | `read-card`, `work-at-dock`, `wander` +0.2; he does not seek the chat layer |
| 30–65 | social | `lean-watch`, `sit-on`, `check-map` +0.2; glances at the chat layer during any activity |
| > 65 | seeking | `show-story`, `lean-watch`, `drop-backpack`, `say` +0.45; he walks toward `chat` when idle |
| > 85 | performing | the loudest eligible activity wins (hop onto the card, wave at chat, drop the backpack in front of the chat layer) |

---

## 4. Choosing what to do — utility scoring

Every tick (at most once per 1500 ms) each eligible activity in §8 is scored, the best one wins, and
if it beats the current activity by enough he switches **at a phase boundary** (§6).

```
score(A) = 0.9·energyFit(A)
         + 1.1·(boredom/100)·novelty(A)
         + 0.8·(attention/100)·social(A)
         + routine(A)
         + recency(A)
         − cost(A)
         + jitter
```

- `energyFit(A) = 1 − |energy/100 − A.energyNeed|` — symmetric, so a demanding activity is bad when
  he is tired *and* a rest is bad when he is fresh.
- `novelty(A)` and `social(A)` are 0–1 constants per activity (§8 table).
- `routine(A)` = `+0.35` if A is preferred by the current slot, `−0.5` if forbidden by it, else 0 (§5).
- `recency(A)` = `+0.40` if A is not in the last 3 traces, `−0.60` if it is the most recent,
  `−0.30` / `−0.15` for the two before that. **He does not repeat himself.**
- `cost(A)` = `0.25` if A needs a layer that is absent or paints over him (registry `z`, §9.6);
  A is **disqualified** if `energy < A.minEnergy`, if it is in refractory, or if a required layer is
  absent and A has no floor fallback.
- `jitter` = uniform `±0.08`, from an injectable seeded RNG (tests need determinism).
- Weights sum so that at boredom 55+ boredom dominates, and at attention 85+ attention can beat it.
  Energy never dominates — it only shapes fitness.

**Switch rule (hysteresis):** a new activity is started only if
`score(new) > max(0.30, score(current) + 0.25)`, and only at a phase boundary, and only after
`ACTIVITY_COOLDOWN = 20 s` since the last one ended (idle micro-behaviour runs during the cooldown).

**Worked example** (the engineer should reproduce this as a test): energy 62, boredom 70, attention 35,
evening slot, card present.

| activity | fit | b-term | a-term | routine | recency | cost | score |
|---|---|---|---|---|---|---|---|
| `read-card` | 0.88 | 0.385 | 0.084 | +0.35 | +0.40 | 0 | **2.01** |
| `workout` | 0.77 | 0.693 | 0.056 | 0 | +0.40 | 0 | 1.84 |
| `show-story` | 0.78 | 0.539 | 0.252 | 0 | +0.40 | 0.25 | 1.49 |

`read-card` wins. At attention 90 instead of 35 the a-term for `show-story` becomes 0.648 and it wins.

---

## 5. Routine and daily rhythm

### 5.1 The day plan

Once per local day (first tick after 00:00 Lagos, or on first boot) the brain builds a **day plan**: an
ordered list of slots. Each slot has `from`, `to`, a preferred set and a forbidden set. The plan is
persisted; it does not change mid-day.

| slot | hours | preferred | forbidden | mood bias |
|---|---|---|---|---|
| `night` | 00:00–06:00 | `doze`, `rest` | `workout`, `show-story` | energy recovery ×1.5 |
| `morning` | 06:00–09:00 | `stretch`, `drink-water`, `workout`, `wander` | `doze` | boredom rises ×1.2 |
| `day` | 09:00–17:00 | `work-at-dock`, `read-card`, `check-map`, `letters` | `doze` | attention rises ×0.8 |
| `evening` | 17:00–22:00 | `lean-watch`, `show-story`, `letters`, `read-card` | — | attention ×1.3, `social` terms +0.1 |
| `late` | 22:00–24:00 | `rest`, `read-card`, `sit-on` | `workout` | energy decays ×1.1 |

- Only the **current** slot's bias is live; the rest of the plan exists so the day has a shape and so
  a reload at 14:00 does not make him act like it is 14:00 for the first time.
- A slot never *forces* an activity. It only moves scores. He can read at 7am; he just prefers not to.
- `boredom > 80` may break a forbidden entry except `doze` (§3.2).

### 5.2 The stream arc

A stream is three acts. The desk does not currently tell the brain when the owner goes live, so the
arc is **inferred** from operator activity and chat: the first chat message or desk action starts an
arc; 15 minutes with neither ends it. If the owner later adds a live flag, it overrides the inference.

| act | trigger | bias |
|---|---|---|
| `arrival` | first 10 min of an arc | `drink-water`, `stretch`, `wander`, `check-map` +0.4; he settles in and notices the room |
| `body` | until 15 min before the arc is expected to end | normal scoring |
| `wind-down` | last 15 min of a long arc, or chat going quiet for 10 min | `tidy`, `rest`, `sit-on` +0.5; `workout` disqualified |

`tidy` is the only activity that clears physical traces (§8.14). Wind-down is when the room gets put
back — and if it never runs, the room stays messy across streams, which is the point.

### 5.3 The environment reaches him

The existing weather / season / time-of-day / holiday / headline inputs bias scores directly. No new
pipeline: whatever the brain already knows becomes a modifier.

| condition | modifier |
|---|---|
| rain / cold | `wander`, `check-map` −0.3; `sit-on`, `lean-watch`, `read-card` +0.2 (he stays in) |
| heat | `drink-water` +0.5, `workout` −0.3 |
| holiday | `show-story` +0.3, `wander` +0.2 |
| a new headline the brain rated worth showing | `show-story` becomes eligible and +0.6 for 5 min |
| night (00:00–06:00) | `doze` eligible; everything else −0.2 |

---

## 6. Priority arbitration — chat always wins

Five classes. **Higher number wins, and the winner is decided every tick, not by whoever shouted
last.**

| class | what | examples | can it be preempted? |
|---|---|---|---|
| **P0 hard** | the operator, or a change he must obey | `bot.on` false, operator cue, body-stage change, layout-mode change, `?swae=0` reload | only by P0 |
| **P1 chat** | the audience and the owner's voice | chat message, gift, sub, follow, raid, a thought interrupted mid-line | only by P0 |
| **P2 world** | something changed in the room | a headline card appears, weather flips, a layer appears/moves/disappears under him | by P0, P1 |
| **P3 drives** | the activity chosen in §4 | read, workout, wander, climb | by P0, P1, and P2 only at a phase boundary — except the layer-gone safety case, which is immediate |
| **P4 idle** | secondary motion, always on | breathing, weight shifts, glances, fidgets | never blocks; suppressed during P1's first 1200 ms |

Rules:

1. **P1 preempts P2, P3 and P4 within one tick** (≤ the poll interval). There is no queue ahead of
   chat, ever.
2. **P1 never preempts P0.** The operator's state is not a suggestion.
3. **P1 during P1:** queue, max 3, coalesce messages of the same kind inside 2 s into one reaction.
   The oldest is answered first; a 4th drops the oldest, not the newest.
4. **P2 preempts P3 only at a phase boundary**, except layer-gone (immediate) and a card arriving
   within 200 px of him (he looks — a glance, not a preemption).
5. **P3 preempts nothing but P4**, and only at a phase boundary.
6. **P4 never stops.** It is the procedural idle layer; it is *attenuated*, not switched off. A held
   frame is a bug (rig brief), so even a suspended activity keeps breathing.

### 6.1 He must notice the interruption

A P1 preemption never silently cuts. Before the reaction cue, a **notice beat** of 400–900 ms
(randomised, seeded):

1. head and eyes turn toward the `chat` layer (or toward wherever the sound came from),
2. one weight shift away from what he was doing,
3. one micro-emotion from `FEEL` chosen by the reaction kind,
4. then the reaction cue itself.

If what was interrupted was a staged thought, the notice beat **is** the thought's turn — he
sharpens or abandons it in character, he does not pause politely (thoughts brief). The notice beat is
part of the interruption contract below; it is never skipped.

### 6.2 Anti-thrash

Chat can arrive faster than any body can answer. **≥ 3 P1 preemptions inside 10 s** puts him in
`BATCHED` mode for 20 s:

- reactions coalesce into **one** acknowledge beat (`shrug` + `say` if a line was queued),
- a suspended activity is **held**, not expired, and its resume window is doubled,
- chat is still never ignored — it is answered once, together, and he goes back to what he was doing.

`BATCHED` ends early if P1 goes quiet for 5 s. It is visible in state (`being.mode = "batched"`) so it
can be debugged rather than guessed at.

---

## 7. The interruption contract — exactly how an activity resumes or is abandoned

Every activity instance is a small state machine:

```js
{
  id, key, phase: "start" | "middle" | "end" | "done" | "abandoned",
  startedAt, phaseStartedAt,
  plan: { startMs, middleMs, endMs },        // from §8
  layer, side, surface: "floor" | "top",
  props: [],                                  // physical traces he is holding
  resumable: true, resumeWindowMs: 45000,
  resumeCount: 0
}
```

### 7.1 On preemption

```
p = (now − startedAt) / totalMs
```

1. **`phase === "start"` and elapsed < 400 ms** → **abort**. Cancel the cue, write no trace, re-plan
   immediately. Nothing readable was lost, so this is not counted as an interruption for §6.2.
2. **`phase === "end"`** → **defer**. The end is what leaves the trace, and a cut end reads as a bug.
   Chat waits behind it, and the end is shortened to finish within **1200 ms** (a faster settle, not a
   freeze-frame). P0 still cuts it, and then it is `abandoned` with a partial trace.
3. **`phase === "middle"` and resumable** → **suspend**:
   - stop at the next gait boundary (**≤ 250 ms**), never mid-step,
   - settle to neutral stand (400 ms),
   - if he is holding a prop and the activity is `dropToSuspend: true`, he **sets it down where he
     is** — that is a physical trace (§8), not a cleanup,
   - write the checkpoint (phase, elapsed in phase, layer, side, surface, props),
   - run the notice beat, then the reaction.
4. **`phase === "middle"` and not resumable** (drink, workout set, drop-backpack) → **finish then
   yield**: complete the current repetition / sip / placement (**≤ 600 ms**), set the object down,
   then notice. Never frozen mid-rep.
5. **Only one checkpoint exists at a time.** A second suspension while one is held expires the older
   one immediately (`abandoned`, `reason:"superseded"`). No stack, no thrash.

### 7.2 Resume

Resume happens when **all** of these hold:

- no P1 in the last `RESUME_QUIET_MS = 3000 ms`,
- `now − suspendedAt ≤ resumeWindowMs` (default 45 s; `read-card`/`work-at-dock` 90 s; `drink-water` 20 s),
- the world still allows it: the layer is present, its `edge` has not moved more than 6 px, and
  `energy ≥ A.minEnergy` (checked by the brain, not the body).

Then the brain posts a cue with `act.step = "resume"` and the **same activity id**. He resumes at the
**start of the phase he was in** — never mid-phase, because a half-held pose snapped back is what
looks broken. Concretely:

- if he is not within `reachTol = 24 px` of the stand point, he **walks back** first (gait from body
  stage), then replays the phase's entry beat;
- the phase's clock restarts at 0 for the replay; the activity's total elapsed keeps its original
  `startedAt`, so the trace is honest about how long the whole thing took;
- drives are **not** reset on resume (the interruption cost him the time, not the energy);
- `resumeCount += 1`; at `resumeCount ≥ 3` the activity becomes non-resumable and the next
  interruption abandons it — an activity that keeps being interrupted is not working.

### 7.3 Abandon, cleanly

The window expiring, a layer disappearing, energy falling below the minimum, or a P0 cut all end in
the same tail. **Abandon is a sequence, not a drop:**

1. if a prop was set down, it **stays** (that is the trace) unless `tidyOnAbandon`,
2. if he is on a layer top, **descend properly** — climb down if within reach, otherwise the
   controlled drop with a landing beat (§9.5). Never a teleport.
3. write the trace: `{ outcome:"abandoned", reason: "preempted"|"window"|"layer-gone"|"energy"|"operator"|"superseded" }`,
4. clear the checkpoint,
5. settle to neutral stand,
6. `ACTIVITY_COOLDOWN = 8 s` before a new drive-chosen activity (the normal 20 s cooldown is skipped —
   he has already been standing still).

**Resume vs abandon, in one line:** if the interruption is short and he was in the middle, he goes
back to the beginning of the phase; if it was long, or he was already ending, he finishes or leaves a
trace and the activity is over. Nothing is ever silently dropped, and nothing is ever resumed
half-way.

---

## 8. The activity catalogue

Every activity has all four parts. `energyNeed`, `novelty`, `social` feed §4. Timings are the
`plan` in §7.

| key | target | energyNeed | novelty | social | start | middle | end | trace left behind |
|---|---|---|---|---|---|---|---|---|
| `wander` | floor | 0.55 | 0.6 | 0.2 | pick a target x in the safe range, glance at camera (1.2 s) | 2–4 walks with a pause + glance each (8–20 s) | settle at the final x, look at the room (1.5 s) | `floorX` — the new resting spot, persisted |
| `lean-watch` | any layer, side | 0.35 | 0.4 | 0.5 | `walkTo(layer, side)`, settle (2 s) | lean pose held, breathing, glances at chat (10–40 s) | push off, stand, weight shift (1.5 s) | `leanedOn: layer` in the ledger |
| `sit-on` | layer top | 0.30 | 0.7 | 0.4 | walk to the layer, `hop-up` cue | sit, legs swing, look around (15–45 s) | `hop-up` down, landing settle | `satOn: layer`; `surface` reset to floor |
| `read-card` | card | 0.50 | 0.5 | 0.3 | walk, lean, take the card, scale to 1.15 | read beats: `lookUp`/`glanceL`/`glanceR`, a "page turn" every 8–12 s (20–40 s) | set the card back, restore scale, step back | `card.bookmark` (paragraph index); card left at the scale he chose |
| `drink-water` | dock | 0.25 | 0.5 | 0.1 | walk to dock, pick up the cup | 3 sips with a lower between (6–10 s) | set the cup down, `shrug` (wipe mouth) | cup at the dock, `emptiedAt`; energy +6, decay paused 60 s |
| `workout` | floor, clear span | 0.85 | 0.9 | 0.2 | find a clear span ≥ 1.4× body width, set the backpack down, crouch | 5–8 `pushup` cues, 2 sets with a rest beat (25–40 s) | stand, shake arms, pick the bag up (or leave it if energy < 30) | energy −8; `backpackAt: x` if left |
| `stretch` | floor or layer top | 0.40 | 0.4 | 0.1 | stand, arms out | 3 held stretches, 4 s each | settle | energy +2 |
| `rest` | rest spot | 0.15 | 0.2 | 0.0 | walk to the spot, sit/lean, settle | breathing, eyes half, occasional doze clip (45–120 s) | wake beat, stand, stretch | recovery applied; `restedUntil` |
| `doze` | rest spot | 0.05 | 0.1 | 0.0 | lie back | `hang`/`lie-back` cues, long holds (2–8 min) | wake beat | `dozedMs` |
| `show-story` | card → chat | 0.40 | 0.7 | 0.9 | notice the story (P2), pick the card up, scale to 1.4 | carry it toward chat, hold it up, gesture at it (10–20 s) | place it, step back, one `say` line | `shown: headlineId`; attention −25; the card stays where he put it, at 1.4 |
| `check-map` | map | 0.35 | 0.6 | 0.2 | walk, lean | look, glance, trace a line with a hand (8–15 s) | step back | `lookedAt: map` |
| `climb` | climbable layer | 0.70 | 0.9 | 0.3 | approach, reach | pull up (`hop-up`), stand, walk along the top (10–30 s) | crouch, drop down, landing settle | `climbed: layer`; `surface` reset |
| `letters` | chat / dock | 0.45 | 0.6 | 0.8 | walk to chat, lean | the round (owned by the letters feature) | close the round, step back | round record |
| `drop-backpack` | floor | 0.20 | 0.6 | 0.8 | reach back | swing it off, set it down (3 s) | stand, look at it | `backpackAt: x`; blocks `needsHands` until `pick-backpack` |
| `tidy` | whole floor | 0.30 | 0.3 | 0.0 | stand, look around | walk to each physical trace, restore it (20–60 s) | final look | clears all physical traces; ledger `tidiedAt` |

Notes that matter for implementation:

- **`read-card` and `show-story` move the card.** He scales it and leaves it scaled. That is a
  physical trace and the next `tidy` restores it. Nothing else may reflow the card.
- **`needsHands`** activities (`climb`, `workout` with the bag up, `read-card`) are disqualified while
  the backpack is on the floor — he picks it up first (`pick-backpack`, 4 s, not in the table above
  because it is a sub-step of those, not a choice).
- **`say`** is a cue, not an activity. A line can be attached to any activity's end beat, once.

---

## 9. Walking the floor and using the panels (the registry)

The body half owns all of this. It reads `createLayerRegistry` from
`public/desk-assets/layers.mjs` — `layer(name)` for live boxes, `snapshot()` for the brain,
`onChange(fn)` for invalidation.

### 9.1 Coordinates

- `x` is one number: desk pixels along the floor. `y` is derived from `surface`, so **feet are pinned**
  and he never floats.
- `surface: "floor"` → `y = groundY` (from `ladder.json` `ground`, mapped through the existing
  transform).
- `surface: "top"` → `y = layer.edge.top`.
- Body scale comes from the existing ladder (`ladder.json` `stages[key].ink.w`, `slow`, `heft`).
  Nothing here changes the drawings.

### 9.2 `walkTo(target)`

`target` is `{ layer, side }`, `{ layer, side:"top" }`, or `{ x }`.

- **Stand point:** `side:"left"` → `edge.left − clearance`; `side:"right"` → `edge.right + clearance`;
  `side:"top"` → `x` clamped into `[edge.left + 0.2·w, edge.right − 0.2·w]`.
- `clearance = ink.w · scale / 2 + 10` — so a heavier body stands further out and never intersects the
  panel.
- **Speed:** `92 px/s × (1 / stage.slow) × energySpeed(§3.1) × surfaceFactor`, `surfaceFactor = 1` on
  the floor, `0.7` on a layer top.
- Travel time = `|dx| / speed`; the gait is chosen by body stage (already built); the walk is
  **JavaScript-driven**, so it survives the Swae renderer that kills CSS animation.
- Unknown or absent layer → **ignored, no throw**, and the activity falls back to its floor target or
  is disqualified in scoring (§4 `cost`).
- Clamp every target into the safe range: `[deskPad.left + clearance, deskPad.right − clearance]`, and
  never into the chat input box.

### 9.3 Climbing

A layer is **climbable** when all of:

- `layer.h ≥ 80` and `layer.w ≥ 120`,
- `layer.edge.top < groundY − 40` (it is above the floor),
- `layer.z` does not paint over him (§9.6),
- `layer.name ∈ {card, map, dock, logo, clock}`.

`ticker`/`headlines` and `chat` are **bench** layers: he can lean on them and sit on their bottom
edge, never stand on them (they are wide text plates and standing on one hides the words).

The climb is a sequence, never a teleport: **approach → reach → pull (`hop-up` cue) → stand on
`edge.top` → walk along the top → use it → descend (crouch → drop → landing settle, 600 ms)**.
While on top, `surface` is the layer and his `x` is clamped to its width; if it is too narrow for his
current body stage (`w < 1.2 × ink.w · scale`), the climb is refused and the activity re-plans.

### 9.4 Using a panel

- **Lean** (`lean-watch`): the lean point is the layer edge and **stays fixed** while his breathing
  moves the rest of him, so contact reads as contact.
- **Sit** (`sit-on`): bottom edge as a bench, legs over the side.
- **Take** (`read-card`, `show-story`): the prop is the layer's own node; he never remounts, reflows
  or scrolls it. He is a guest on it.

### 9.5 The layer moved or vanished under him — safety, and it is P2

On every registry `onChange` and at least every 3 s:

- if his `surface` layer is **absent**, or its `edge.top` moved more than **6 px**, or its width shrank
  below his footprint — he must be **off it within 1200 ms**:
  - within reach → climb down normally,
  - otherwise → controlled drop with a landing beat (a hop down, not a fall through the panel),
  - the activity in flight becomes `abandoned`, `reason:"layer-gone"`, and the trace records it.
- this is the one P2 case that preempts P3 **immediately**, mid-phase, because leaving him standing
  on a vanished panel is the single most broken-looking thing the overlay can do.

### 9.6 If a layer paints over him

Compare the layer's `z` (registry) with the `crid` layer's `z`. If the layer paints over him, he
**does not lean or climb it** — he stands beside it, and the trace records `paintOver: true`. The
report says so plainly; faking contact is worse than not leaning. (The story card currently has no
z-index at all, so this will fire on the card until that is fixed.)

### 9.7 Awareness of what is around him

Cheap, and it is most of what makes him feel present:

- every 3 s build `near[]` = present layers with `|centerX − x| < 260`.
- a layer that **newly appears** within 200 px (and is not `chat`) triggers a `glance` (400–700 ms,
  head only). A P2 notice, **not** a preemption — he notices, he does not drop what he is doing.
- while `attention > 30` he glances at `chat` during any activity's middle, at the idle fidget rate.
- a story card arriving while `attention > 65` raises `show-story`'s score (§5.3).

---

## 10. Persistence — his state survives a reload and a stream

Written to desk state under `state.being`, **at most every 5 s and on every activity transition**,
read on boot. Never reset on reload; defaults apply only on the first ever boot.

```js
state.being = {
  v: 1,
  savedAt: 1750000000000,
  drives: { energy: 62.4, boredom: 70.1, attention: 35.0 },
  mode: "normal",                       // "normal" | "batched"
  day: { key: "2026-11-11", slot: "evening", plan: [...], arc: "body", arcStartedAt: 0 },
  activity: null | { id, key, phase, startedAt, phaseStartedAt, layer, side, surface, props },
  suspended: null | { id, key, phase, elapsedInPhase, layer, side, surface, props, suspendedAt, resumeCount },
  props: [ { kind: "backpack", x: 812, layer: null } ],   // physical traces in the room
  floorX: 812,
  traces: [ /* last 50, newest first */ { id, key, startedAt, endedAt, outcome, reason, layer, resumeCount } ]
}
```

**Offline decay on boot** (`dt = now − savedAt`, capped at 8 h):

- `energy += 0.05 × min(dt, 8h)` clamped to 100 — he slept. A 20-minute reload barely moves him; an
  overnight one brings him back fresh.
- `boredom` decays toward 60: `boredom = 60 − (60 − boredom)·e^(−dt/3600)` — an empty room is
  boring, not unbearable.
- `attention` decays toward 5 the same way.
- `props`, `floorX` and `traces` are **restored exactly**. The room is as he left it.
- a `suspended` checkpoint older than its `resumeWindowMs` is abandoned on boot (`reason:"window"`)
  before the first tick, so a reload never resurrects a half-done activity days later.

---

## 11. The trace — what "leave a trace behind" means concretely

Two kinds, both required:

1. **Ledger trace** (invisible, in `state.being.traces`): `{id, key, startedAt, endedAt, outcome,
   reason, layer, resumeCount}`. It is how he does not repeat himself (§4 `recency`), how the record
   of the stream accumulates, and how a bug is diagnosed.
2. **Physical trace** (visible in the room): props left where he put them (`backpackAt`, the cup on the
   dock, the card scaled to 1.4 and askew), and his `floorX`. These persist, are restored on reload,
   and are cleared **only** by `tidy` (§5.2 wind-down). A room that never gets tidied stays messy
   across streams — that is the continuity, not a bug.

An activity with no trace is not finished. That is the rule that keeps the catalogue honest.

---

## 12. Testing — the whole brain half is pure

`brain/being.mjs` takes `{ now, layers, world, rng }` as arguments and returns an intent; it touches no
DOM and no network. Tests to write (in `tests/being.test.mjs`):

- decay is monotonic and tick-rate independent: 60 steps of 1 s and 20 steps of 3 s agree within 1 %.
- the worked example in §4 picks `read-card`; at attention 90 it picks `show-story`.
- P1 preempts a P3 activity within one tick; P1 does not preempt P0.
- an `end` phase is never cut except by P0; a P0 cut writes `abandoned`.
- a middle-phase suspension resumes at the **start** of its phase, with `resumeCount` incremented.
- a checkpoint older than its window is abandoned with `reason:"window"`, and only one checkpoint
  ever exists.
- 3 preemptions in 10 s sets `mode:"batched"` and doubles the resume window.
- offline decay clamps (a 30-day `savedAt` does not produce NaN or 500).
- an unknown layer name is ignored without throwing, and disqualifies the activity rather than
  crashing the tick.
- a layer vanishing under him yields `abandoned`, `reason:"layer-gone"`.

Body half is checked on `/desk` by eye, against the layer-staging brief's proof: walk to the card,
lean, hold, walk to the clock, lean — and report whether the lean read as contact and whether any
layer painted over him.

---

## 13. Implementation slices (each shippable and testable alone)

| # | slice | done when |
|---|---|---|
| **1** | `brain/being.mjs`: drives + decay + thresholds + scoring, pure, no cues | the fixture table in §4 and the decay tests pass; a 24 h simulated day looks plausible |
| **2** | Routine: day plan, slots, stream arc, environment modifiers | a 24 h simulation never deadlocks and no slot forbids everything |
| **3** | Arbitration + the interruption contract, still with abstract intents (no DOM) | every preemption/resume/abandon test in §12 passes |
| **4** | Persistence: `state.being` write/read, offline decay, checkpoint restore | a reload mid-activity resumes it; a 3-day-old save restores the room and a fresh body |
| **5** | Body half: `being-body.mjs`, floor walk, `walkTo`, cue with `act` | he walks to a named layer and stops at the right clearance, on `/desk` |
| **6** | Climb/lean/sit on layers, layer-gone safety, paint-over guard, awareness glances | the layer-staging proof sequence works and the layer-gone case abandons cleanly |
| **7** | Traces: physical props, `tidy`, optional `bot-being` write-back | a dropped backpack is still there after a reload and `tidy` puts it back |

Slices 1–4 are invisible to the owner and carry all the risk. Slice 5 is the first one he can watch.

---

## 14. Decisions I made that the lead may want to overrule

- **The three constants are tuned guesses, not measurements.** `0.006/s` energy, `0.55/s` boredom,
  `0.35/s` attention are set so a 4-hour stream has a visible arc. They will need one live pass.
- **Attention is satisfied by showing, not by being answered**, because the Aim says whether anyone
  responds changes nothing about whether he continues. Acknowledgement relieves it faster; it is not
  required.
- **Checkpoint depth is 1.** Two suspended activities is thrash, not life.
- **The body cannot report completion today** (the desk page holds no operator token), so the brain
  closes activities on timers with `outcome:"unconfirmed"`. The write-back is slice 7 and optional.
- **`letters` is in the catalogue but its middle is owned by the letters feature**, not by this spec.
- **No new activity needs a new drawing.** Every cue named here is an existing `SEQ`/`FEEL` key or a
  clip from the rig brief; if one is missing, the activity is built from existing frames, not from
  new art.
