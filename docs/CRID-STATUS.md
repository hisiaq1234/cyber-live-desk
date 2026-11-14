# CRID status

The durable, source-verified handoff for CRID — the character who lives in the desk overlay.
Written for whoever picks CRID work up next. Everything here was checked against the code in this
repository at the commit that added this file; anything I could not verify is marked
**[UNVERIFIED]** and anything that needs the owner is marked **[OWNER]**.

Related reading: `AIM-OF-EXISTENCE.md` (intent), `PROGRESS.md` (what is live / in flight),
`README.md` (how to run the brain).

---

## 1. Intent

- CRID is a **body plus a brain**. The body is `public/desk-assets/crid-bot.js`; the brain is
  `brain/` (a local decision loop over stream chat, no cloud, no model). He does not speak in audio:
  every reaction is visual.
- The **presentation layer must never break, duplicate, hide or displace CRID**. A theme
  (`?overlay=brand`, `?variant=brand`, `?brand=1`, and any future theme) is a skin over one CRID —
  same functionality in every theme. This is an architectural rule, not a styling preference.
- One CRID per page: one host element, one cue reader, one state poll, one set of gestures.

## 2. Current reality (verified in code and in a browser)

**Where CRID is mounted.** `public/desk-assets/overlay.js` is the only renderer. It builds the
`#desk` root (`overlay.js:934`), creates one CRID (`overlay.js:989`) with the layer registry, the
SWAE flags, the audio sync and the `?bot`, `?bot.x`, `?bot.y`, `?bot.scale` options, reads the cue
channel with one `createCueReader` (`overlay.js:1004`), and publishes
`window.DeskOverlay = { register, logo, layers, crid: bot }` (`overlay.js:1740`). `?bot=0` yields no
CRID and restores the sound orb.

**Where CRID is not mounted.** `public/desk-assets/overlay-brand.js` is served instead of
`overlay.js` when `?overlay=brand|variant=brand|brand=1` (`api/desk.mjs:113-118`). It imports
`overlay.js` (which does all of the above) and adds a brand stylesheet. **It must not create a
CRID of its own** — that was the defect fixed in this change (see §3).

**Duplicate-mount defect, closed.** Until this change the brand variant imported `overlay.js` *and*
called its own `mountBot()` on `document.body`. Because `crid-bot.js` hardcodes
`host.id = "crid-bot"` (`crid-bot.js:209`), `/desk?overlay=brand` rendered **two CRIDs with a
duplicate DOM id**, two cue readers draining the same cue stamps, and two `/api/desk/state` polls.
Brand mode now adopts the single CRID the main renderer creates and reads its bot from
`window.DeskOverlay.crid`. No other file in the repository changes CRID's mount.

**State path (unchanged).** `GET /api/desk/state?since=<version>` → `200` JSON desk state or `204`
unchanged; the renderer calls `bot.observe(state)` and drains one cue per stamp via
`public/desk-assets/cue.mjs`, dropping names outside `CUE_NAMES`. `api/brain-tick.mjs` writes one
cue per 5-minute tick (GitHub Actions minimum interval).

**Control boundaries (unchanged, verified).** The local brain binds `127.0.0.1` only. Cue names are
an allowlist (`BOT_CUES` in `api/_desk-core.mjs`, kept equal to `CUE_NAMES` by a test). `say` text is
length-capped server-side and again in the renderer. The brain names a layer and a side; `move` is
refused for any layer not in the renderer's registry. The overlay never plays audio.

## 3. Tests and what they actually prove

- `node --test` — the full suite, including `tests/overlay-contract.test.mjs`, which now asserts the
  brand variant contains no `createCridBot(` and no `createCueReader(` and reads
  `window.DeskOverlay?.crid`. This is a **source-level** guard: it fails if the second mount comes
  back, and it does not prove runtime behaviour on its own.
- **Browser verification performed for this change** (headless Chromium, the repo's real
  `public/` files and the real page HTML from `api/desk.mjs`, `/api/*` stubbed):
  - `/desk?overlay=brand` with the pre-fix file → **2** `#crid-bot` hosts.
  - `/desk?overlay=brand` with this change → **1** `#crid-bot` host, one `#desk`, and
    `window.DeskOverlay.crid` populated.
- **[UNVERIFIED]** CRID has not been checked against the live Vercel deployment from this session,
  and gestures, walk/lean/ponder and cue playback were not exercised in the browser here — only the
  mount count and the brand flag.

## 4. Known gaps

1. **The brand skin is a full re-skin, not a token layer.** `overlay-brand.js` overrides
   backgrounds, borders, radii, fonts and `backdrop-filter` with `!important` on every desk surface.
   `AIM-OF-EXISTENCE.md` non-negotiable 5 forbids a full re-skin; the intent is brand through the
   shared design system. **[OWNER]** — re-scoping it is a design decision, not a bug fix.
2. **Two renderers, two vocabularies.** `brain/overlay.js` and `api/brain-tick.mjs` translate the
   same envelopes independently; a gesture the brain can emit but the stream path cannot map is
   silently dropped on stream.
3. **Agency is not deployed.** The 5-minute serverless tick is the only live brain; the local brain
   (`npm run brain`) is the fast path and is not wired into the desk write.
4. **Quiet-layer starvation.** The `long-silence` rule plus `engine.mjs` can own every tick, so the
   eight micro-emotions rarely reach the screen.
5. ~~**`say` is not queued.**~~ Fixed: `crid-bot.js` holds the shown line and queues up to two
   more; a fourth is refused and the cue reports `failed` rather than vanishing. The cue's
   `done` now fires when the line actually leaves the bubble, queued lines included.
6. **`PROGRESS.md` is stale in places** (test counts, an "in flight" branch that does not exist,
   items fixed since). Treat this file and the code as the source of truth for CRID state.

## 5. Next build order

Each step is small, single-purpose, and reuses existing modules.

1. **Keep the one-CRID rule enforced** — the contract test in §3 is the guard; any new theme must
   skin `overlay.js`'s output, never mount its own bot.
2. **Wire the cue channel into the local brain** — `createCueChannel()` (`brain/cue.mjs`) around the
   existing `engine.onAction` handler, reusing `cueFor()` from `api/brain-tick.mjs`. Small, uses
   code that already exists and is already tested.
3. **Run that brain during the stream** — a local process plus `CRID_DESK_URL` and
   `DESK_OPERATOR_TOKEN`; no code change, one documented command.
4. **Stop the quiet layer from being starved** — one-line change in `engine.tick()` so a winner
   carrying no `say`/`card`/`effect`/`move` does not block `microEmotion()`.
5. **Only then curiosity** — one quiet rule plus one personality bucket; the guards already apply.
6. **Then the serverless path** — retire `api/brain-tick.mjs` in favour of the local brain, or give
   it a chat ingest. Do not build ingest before step 2 is live.

## 6. Verification honesty

- **Read:** `public/desk-assets/overlay.js`, `overlay-brand.js`, `crid-bot.js`, `cue.mjs`,
  `api/desk.mjs`, `api/_desk-core.mjs`, `api/brain-tick.mjs`, `brain/`, `tests/`.
- **Executed:** `node --test` → 430 tests, 426 pass, 4 fail. All four failures are
  `ERR_MODULE_NOT_FOUND: Cannot find package '@upstash/redis'` (`api/_store.mjs`) in a checkout with
  no `node_modules` — an environment gap, not a CRID failure. `node --test
  tests/overlay-contract.test.mjs` → 3/3 pass, including the new brand-variant guard. The headless
  browser mount count in §3 was also executed.
- **Not executed:** anything against the deployed Vercel desk; any Twitch chat session; any
  measurement of Redis payload sizes.
