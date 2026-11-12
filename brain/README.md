# Crid's brain — the local initiative loop

Crid's brain runs on the streamer's own machine. It watches a Twitch channel, keeps a
memory of the session, decides what Crid does next **without being told**, and drives the
overlay through one versioned command bus. Zero runtime dependencies beyond what the repo
already has.

```
Twitch chat (anonymous IRC)  ─┐
demo / desk POST /event      ─┼─→  engine.mjs  ──→  CommandBus  ──→  overlay.js  ──→ OBS
session memory (RAM)         ─┘    (rules)         (envelopes)      (stateless renderer)
```

---

## 1. Run it

Requires Node 20+ (developed on Node 22). Nothing to install for the brain itself.

```bash
# the whole initiative loop against synthetic chat + events (no Twitch, no setup)
npm run brain:demo

# ONLY the owner's reaction vocabulary, on a loop:
# Ws/1s hype → L/roast tears → a layer dragged aside
npm run brain:reactions

# live: watch a real channel's chat (anonymous IRC — no login, no OAuth)
npm run brain -- --channel otolorin

# anything you like, combined
npm run brain -- --demo --seed 42 --port 7311 --verbose
```

| flag | what it does |
|---|---|
| `--demo` | synthetic chat and events on a timer instead of Twitch |
| `--scenario reactions` | implies `--demo`; loops only the three owner reactions |
| `--channel <name>` | channel to watch (or `CRID_CHANNEL`) |
| `--port 7311` | port for overlay + command bus (default 7311, auto-increments if busy) |
| `--seed 42` | reproducible demo (deterministic PRNG) |
| `--cooldown-scale 0.25` | **demo pacing only** — shrinks configured cooldowns so a 45s cooldown doesn't stall a 30s demo |
| `--verbose` | also log rules that were held back, and why |

### URLs once it is running

| URL | what it is |
|---|---|
| `http://127.0.0.1:7311/overlay` | **the overlay** — add this to OBS (see §2) |
| `http://127.0.0.1:7311/overlay?preview=1` | same page with a hatched background, for a normal browser |
| `http://127.0.0.1:7311/` | live decision log (status page) |
| `http://127.0.0.1:7311/state` | JSON: status, memory snapshot, personality summary |
| `http://127.0.0.1:7311/health` | liveness + counters |
| `POST http://127.0.0.1:7311/event` | how the desk reports something happened (see §5) |

Everything binds to `127.0.0.1` only. This is the streamer's machine, not the public web.

---

## 2. OBS route

1. **Add → Browser** source.
2. **URL** `http://127.0.0.1:7311/overlay` (use the port the banner printed).
3. **Width 1920 / Height 1080** — the page is designed at 1080p and scales itself.
4. **Custom frame rate → 60**. OBS's default (custom off) is 30, which makes the tears and
   the drag look stepped.
5. **Custom CSS** — leave it as `body { background-color: rgba(0,0,0,0); }`. The overlay is
   transparent by design; an opaque background blacks out the game.
6. Leave "Shutdown source when not visible" **off** if you want Crid to keep reacting
   between scene switches. It is safe to turn on: the page holds no state and re-syncs from
   the brain on connect (snapshot + deltas).

Sound: **the overlay never plays audio.** Crid's audience-facing voice is text, expression
and motion. Spoken replies belong to the operator surface, not this page.

---

## 3. The owner's reaction vocabulary

All of it lives in **`brain/crid-personality.json` → `reactions`**. Trigger words,
thresholds, windows, cooldowns, per-minute ceilings, gesture/emotion/effect and every line
are there. The engine contains no trigger words and no lines.

### hype — `W`, `Ws`, `www…`, `1`, `1s`

A win signal from chat. **Standalone, canonical tokens only** — the whole message must be
made of them, so `wow`, `water`, `1 kill`, `11 kills` and `www.google.com` are not hype.

Crid's response: `presence:hype` · `express:hype` (mood *delighted* + cheer) ·
`gesture:jump` · `effect:particles` · a `say` bubble from `reactions.hype.lines`.

Fires when ≥ `threshold` hype messages from ≥ `minUsers` people land inside `windowMs`
(default 3 messages / 2 people / 8s), then holds for `cooldownMs` (45s) and at most
`maxPerMinute` (3) times a minute.

### roast — `L`, `Ls`, roast terms

An L. Canonical `l` / `ls` (whole message) or any configured `terms` entry matched as a
whole phrase (`take the l`, `skill issue`, `washed`, `ratio`, `cooked`). `lol`, `lmao`,
`cool`, `relate` are not roast. A configured term is worth `termWeight` (2), so one term
fires on its own; two L messages also reach the threshold.

Crid's response: `express:sad` (wince eyes + wavy mouth) · `gesture:wince` ·
`effect:tears` — **animated CSS water drops falling from his eyes**, anchored to the body
so they follow him — plus a bubble from `reactions.roast.lines`. No audio, ever.

### layerDrag — a layer is in the way

The input is an **explicit, normalised `layer` event** (see §5), never a guess. The brain
emits a `move` command naming the layer and the side; the renderer does the body work:
Crid walks to the layer, takes the weight (`weighted` pose), the layer slides aside under
his hands, and he walks back. The layer keeps its rendered state — contents, visibility,
fade — only its position changes (`--drag-x` / `--drag-y`).

The first line in `reactions.layerDrag.lines` must stay exactly:

```
I saw what you did there.
```

Only names in `allowedLayers` are accepted (`card`, `recap`, `chips`, `link`); anything
else is refused rather than guessed at. `side` must be one of `left`/`right`/`up`/`down`
or it falls back to `defaultSide`.

**Why explicit, not detected:** the brain cannot see the desk's pixels or its DOM. Automatic
"obstruction detection" from geometry the brain does not have would either be blind or fire
constantly. The desk knows when one of its own layers is covering the moment, so the desk
says so — one POST, one decision.

---

## 3b. The quiet layer: micro-emotions

The three reactions above are the **loud layer** — they fire on a big audience moment and
hold the floor for five or six seconds. That leaves the other 90% of a stream with no
vocabulary. Micro-emotions are that vocabulary: eight miniature feelings that play often
and briefly so the stream feels alive between big moments.

All of it lives in **`brain/crid-personality.json` → `microEmotions`**, in the same shape as
`reactions`. The engine contains no thresholds and no lines.

| feeling | fires from | on screen |
|---|---|---|
| `curious` | a chat line ending in `?` | head tilt (`peek`), a `?` drifting up |
| `delighted` | a keyword whose mood is `delighted`; the after-beat of bits | a hop, two sparks |
| `smug` | message rate falling — a busy room settling down | a side-eye, a raised mouth corner |
| `flustered` | message rate rising — chat speeding up around him | a wince, colour in the cheeks |
| `sleepy` | `sleepAfterMs` (25s) of silence | he sits down, small `z`s rise |
| `startled` | the first line after `startleGapMs` (10s) of quiet; the after-beat of a raid | a jolt, an expanding ring |
| `proud` | a keyword whose mood is `proud` (`gg`); the after-beat of a sub/gift | a nod, a bar filling above his head |
| `sulky` | a busy room that empties (`sulkAfterMs`, 6s) | a shrug, a puff drifting off |

**Pacing.** One feeling every `minGapMs`–`maxGapMs` (4–12s) while chat is live, one every
`idleGapMs` (45s) once the room is properly quiet, capped at `maxPerMinute` (6) and at each
feeling's own `cooldownMs`. The same feeling never plays twice in a row. Weights decide which
one wins when several signals are live at once.

**It can never drown out the loud layer.** Three separate guarantees:

1. The engine only asks the driver for a feeling when the loud loop decided *nothing* that
   tick (`tick()` → `microEmotion()`), so a hype jump, a roast wince, a sub card or a layer
   drag always has the floor.
2. A micro-emotion is **not an action**: it does not move the global anti-spam gap, spend the
   per-minute ceiling, or write to the moment record. It costs the loud layer nothing.
3. On the overlay it is `interrupt: "none"` at the lowest visual priority, and the renderer
   refuses to draw one over a card, an effect or a drag.

**The look is CSS, not assets.** The body is a painted webp, so his only face is what is
layered on top of it: the brain names the feeling and the caption, and
`brain/overlay.js` (`MICRO`) + `overlay.css` (`.crid-micro`) own the pose and the mark. Each
one is capped at 2s of motion, and every mark scales with the drawn width of the body
(`--micro-u`) so it stays in proportion as his presence changes. `caption: false` in the
config gives a silent, visual-only layer.

**The quiet tail.** A sub, gift, bits or raid produces the loud reaction *and* — a second or
two later — a small after-beat from `signals.momentEmotions`. That is the moment the loud
layer has finished and the quiet layer says the small true thing about it.

---

## 4. Command bus contract

Every instruction is one versioned envelope:

```js
{ v: 1, seq, id, type, payload, priority, ttl, interrupt, ts, why }
```

| type | payload | interrupt | priority |
|---|---|---|---|
| `presence` | `{mode}` | none | 10 |
| `look` | `{target, hold}` | none | 15 |
| `micro` | `{emotion, line, duration}` | none | 20 |
| `express` | `{emotion, intensity, hold}` | soft | 25 |
| `gesture` | `{type, duration}` | soft | 30 |
| `say` | `{text, style, duration}` | soft | 40 |
| `memory` | `{kind, text, moments}` | soft | 45 |
| `effect` | `{type, intensity, duration}` | hard | 50 |
| `move` | `{target, to, travelMs, dragMs}` | hard | 60 |
| `card` | `{title, subtitle, art}` | hard | 95 |

`ttl` is the overlay's expiry for that command, so nothing can stick: `move` expires after
travel + drag + 1.2s, `effect:tears` after its configured duration, cards after 8s.
The renderer is **stateless** — it takes a snapshot on connect and applies deltas, so an
OBS reload mid-stream is invisible.

Reaction pacing is layered: per-rule cooldown (from the personality file) → per-rule
`maxPerMinute` → the engine's global anti-spam floor and minute ceiling.

---

## 5. How the desk signals an obstructing layer

The desk (the existing `/desk` overlay) posts one normalised event and lets the brain
decide. It never sends commands.

```bash
curl -X POST http://127.0.0.1:7311/event \
  -H 'content-type: application/json' \
  -d '{"type":"layer","layer":"card","side":"left","source":"desk","detail":"sub card over the game feed"}'
```

```json
{ "ok": true, "fired": "layer-obstructed" }
```

Accepted types: `chat`, `sub`, `gift`, `bits`, `raid`, `layer`. A `layer` event **must**
carry a `layer` name. The response says which rule fired (or `null`), so the desk can log
it. This is the same normalised event shape the IRC client and the demo emit — one shape,
three sources.

To make a desk panel draggable by Crid, the panel needs to be a layer the overlay can
address. Two options:

1. **In the brain overlay** — add an entry to `LAYERS` in `brain/overlay.js` pointing at
   the element, and add its name to `reactions.layerDrag.allowedLayers`.
2. **In the desk** — keep ownership of the panel and apply the same drag contract yourself:
   on the brain's `move` command for your layer, add `.dragging` and set
   `--drag-x`/`--drag-y` (see `brain/overlay.css`), then clear them when the panel closes.
   The panel keeps its own rendered state; only its offset changes.

Either way the brain names the layer and the side. It never touches pixels.

---

## 6. Tests

```bash
node --test brain/tests/*.test.mjs     # the brain suite
node --test                            # the whole repo
```

`brain/tests/reactions.test.mjs` covers: W/Ws/www and 1/1s recognition; false-positive
rejection (`wow`, `water`, `1 kill`, `www.google.com`, `lol`); L/roast tears; cooldowns and
per-minute ceilings; the `never` guard on reaction lines; the `move` command contract; and
the refusal of unknown layers.

Every engine action is also translated to the desk's one-shot cue (`brain/cue-map.mjs`, the
same table `api/brain-tick.mjs` uses) and posted through `brain/cue.mjs` when the brain has a
desk to talk to: set `CRID_DESK_URL` to the deployed desk and `DESK_OPERATOR_TOKEN` to its
operator token. Without them the channel stays off and the local overlay is unaffected.

---

## 7. Files

| file | job |
|---|---|
| `index.mjs` | entry point: args, wiring, banner, heartbeat, shutdown |
| `reactions.mjs` | the owner's vocabulary as code: tokenising, matching, tallies (pure, no state) |
| `micro-emotions.mjs` | the quiet layer: the eight feelings, which signal fires each, and the pacing that keeps them rare |
| `engine.mjs` | the initiative loop: reactive + unprompted rules, cooldowns, priority, "why" logging |
| `memory.mjs` | session memory: chat, moments, Crid's own actions, topics, who was here |
| `personality.mjs` + `crid-personality.json` | everything Crid says, what he reacts to, and what he would never say |
| `commands.mjs` | the command bus and one builder per vocabulary entry |
| `server.mjs` | local HTTP + WebSocket on one port: overlay, status, `/state`, `/event` |
| `overlay.html/.js/.css` | stateless renderer around the existing `crid-bot.js`: tears, drag, surfaces |
| `demo.mjs` | the synthetic sessions behind `--demo` and `--scenario reactions` |
| `twitch-irc.mjs` | anonymous Twitch IRC → the same normalised event shape, with reconnect |
| `ws.mjs` | ~200-line zero-dependency WebSocket server |

Personality edits are hot-reloaded: save the JSON while the brain runs and the next
reaction uses the new vocabulary. A bad line degrades to silence, never to something out
of character.
