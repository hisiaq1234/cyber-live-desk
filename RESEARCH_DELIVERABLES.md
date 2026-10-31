# CRID × Swae Phase 0 — Research Deliverables

Repo: `C:\Users\hisia\Downloads\cyber-live-desk` (GitHub origin `https://github.com/hisiaq1234/cyber-live-desk.git`)
Research pack: `CRID_SWAE_PHASE0_ALL_IN_ONE.txt`
Scope: research-only audit. No code changes, commits, or deploys. Verified: `node --test` → **123 pass, 0 fail**.

---

## 1. Source-Code Inventory

### Netlify functions (server)

| File | Lines | Role |
|------|-------|------|
| `netlify/functions/_desk-core.mjs` | 1443 | Shared core: state shape, cards, queues, auto-play, desks, CRID (segment/verdict/audio), CRID Court, Music Desk, X Space Radar, STRANGERS Ledger, RIAD, research pipeline (feeds/prune/held/overlap), Twitch clip creation, public projection. Importable by tests (no `@netlify/blobs`). |
| `netlify/functions/desk.mjs` | 170 | HTTP shell: routes `/desk`, `/control`, `/api/desk/*` (`state`, `cards`, `action`, `research`, `twitch`, `voice`), operator-token auth, blob store. |
| `netlify/functions/_twitch-core.mjs` | 313 | Twitch EventSub webhook: signature verification, challenge/revocation, dedupe (header + event id), broadcaster/allowlist authorization, `runAction` dispatch, `twitchStatus` / "Ready" gating. |
| `netlify/functions/_commands.mjs` | 108 | Shared chat command parsing (pure JS, runs in browser + Node): `parseDeskCommand`, `parsePollSpec`, `validatePollDraft`, `parseAllowIds`, `chatMayCommand`, `commandBody`, `commandText`. |
| `netlify/functions/desk-auto-research.mjs` | — | Scheduled auto-research runner (cron every 15 min, matches `RESEARCH_INTERVAL_MIN`). Partially read — referenced by core. |
| `netlify/functions/twitch-eventsub.mjs` | — | EventSub HTTP entry point wrapping `_twitch-core`. Partially read. |
| `netlify/functions/x-feed.mjs` | — | X feed proxy. Read earlier. |
| `netlify/functions/audiomack.mjs` | — | Audiomack proxy (trending + search). Read earlier. |
| `netlify/functions/spotify-top.mjs` | — | Spotify top tracks proxy. Read earlier. |

### Frontend assets (`public/desk-assets/`)

| File | Lines | Role |
|------|-------|------|
| `control.js` | 1624 | Operator controller SPA: login (token), live status, queue/editor, bulk approval, CRID panel, court, music, X Space radar, ledger, RIAD, Twitch chat (IRC WS reader, vote tally only — no command execution), clip creation, Audiomack station, settings. |
| `desk-commands.js` | 13 | Browser re-export of `./_commands.mjs`. |
| `overlay.js` | — | Viewer overlay (rewritten during prior turn; `node --check` passed). Draws current card, CRID jumbotron, poll, desks; 204 long-poll on `?since=`. X-jumbotron wipe bug fixed, dock `max-height:42dvh`, configurable logo, renderer try/catch. |
| `overlay.html` / `control.html` | — | Served inline by `desk.mjs` (`PAGE` / `CONTROL_PAGE` strings), not separate files. |

### Tests (`tests/`)

| File | Lines | Coverage |
|------|-------|----------|
| `desk-core.test.mjs` | ~1295 | state defaults, auto-play rules, concurrency (race), public feed/204/private-field scrubbing, editorial gate, feed parsing (Google News/WordPress/Trends/blocked 403/proxy/slow proxy), research modes/dedupe/held/overflow/age-out, desks, CRID segment/verdict/audio, Twitch clip. |
| `desk-commands.test.mjs` | 78 | command shapes, desk names, auto on/off, poll spec, poll draft validation, authorization (broadcaster/allowlist/moderator rejected), allowlist id parsing, help text. |
| `desk-bulk-research.test.mjs` | 236 | bulk approval (gate, on-air protection), queue counts, manual/trusted/all modes, caller bypass rejected, unread cap, held overflow/retry, held retention expiry. |
| `twitch-eventsub.test.mjs` | 257 | challenge verbatim + content-length, non-chat subscription can't Ready, signature/refusal, missing secret 503, broadcaster commands, allowlist vs moderator vs name-only, dedupe, status-write failure no-replay, control off / wrong broadcaster, revocation → re-verify → Ready. |

### Fixtures (`tests/fixtures/`)
Trimmed real feed responses captured 2026-10-28: `gnews-ng.xml`, `premiumtimes.xml`, `bbc-pidgin.xml`, `gtrends-ng.xml`, `vanguard-403.html`, `businessday.xml` (and similar). Used by feed-parsing tests.

### Config / docs
- `netlify.toml`: `publish = "public"`, `functions = "netlify/functions"`, NODE 22, `@netlify/blobs ^11.0.0`.
- `package.json`: `node --test` test script, no runtime deps beyond Netlify blobs.
- `AUDIT_FEASIBILITY.md`: feature gap summary.
- `TWITCH_SETUP.md`: EventSub setup steps.
- `.gitignore`, `mcp.json` (empty).

---

## 2. Capability Matrix

| Capability | Implemented | Evidence | Notes |
|------------|-------------|----------|-------|
| Card queue (pending/approved/rejected) | Yes | `_desk-core.mjs:upsertCard`, `queueOf`, tests | TTL 5–300s, default 45s |
| Desks (sticky topic filters) | Yes | `DESKS` (politics, streamers, music, movies, business, trends), `matchesDesk`, `resolveDesk` | 6 desks + "all"; whole-word prefix matching; geography ≠ topic |
| Auto-play | Yes | `autoAdvancePlan`, `advanceIfExpired`, tests | Moves only visible+unheld+expired card in cards mode; no poll active; respects desk filter |
| Polls (2–3 options, manual + chat tally) | Yes | `start-poll`, `vote`, `set-votes`, `end-poll`, `pollResult` | Tie → no winner; result writes onto open CRID segment |
| CRID segment (jumbotron) | Yes | `crid-open/close/verdict/audio`, kinds topic/news/debate/music/question | Verdict 0/1 only; entry numbers never repeat; audio URL + play/pause; public projection |
| CRID Court (debate + verdict W/L) | Yes | `court-open/vote/verdict/close`, `wl()` mapping | Two viewpoints, A/B votes, verdict closes court |
| Music Desk (independent audio queue) | Yes | `music-add/play/pause/next/stop/volume/mute/clear` | Independent of Spotify proxy |
| X Space Radar | Yes | `space-add/remove` | Info card + external link only; no embed/rebroadcast |
| STRANGERS Ledger | Yes | `ledger-add` | Community interaction log |
| RIAD (raid identity) | Yes | `riad-trigger/clear` | Graphic trigger only; actual Twitch raid needs separate auth |
| Research pipeline (NG + US feeds) | Yes | `FEEDS` (14 feeds), `runResearch`, `candidates`, `proxyFor` | 3-day freshness, PER_FEED=6, shared room, held bucket (240 max, 7-day keep), age-out (24h), overlap (NG∩US trends) |
| Research approval modes | Yes | `manual`/`trusted`/`all`, persisted via `research-approval` action | Caller cannot bypass; scheduled run reads same persisted mode |
| Bulk approval | Yes | `bulkUpdateApproval`, on-air protection, editorial gate (news-drop needs publisher+url) | Select IDs or all-with-filter; skipped cards reported with reasons |
| Twitch EventSub webhook | Yes | `handleTwitchWebhook`, signature verify, challenge, revocation, dedupe | Broadcaster or allowlisted stable id only; moderator badge / display name rejected |
| Twitch clip creation | Yes | `createTwitchClip` (create + poll Get Clips verify) | Needs `TWITCH_CLIENT_ID`, `TWITCH_CLIP_ACCESS_TOKEN`, `TWITCH_BROADCASTER_USER_ID`; pending status if unindexed |
| Twitch chat reader (controller) | Yes | `control.js` IRC WS to `irc-ws.chat.twitch.tv` | Vote tally only; does NOT run desk commands (commands go via signed webhook) |
| Voice endpoint (`/api/desk/voice`) | Yes | `desk.mjs` POST `/api/desk/voice` | No token required; safe action subset only (`next`, `previous`, `hold`, `hide`, `desk`, `start-poll`, `end-poll`, `auto-play`, `clip-create`, `crid-open`) |
| Public overlay state (no private fields) | Yes | `publicProjection`, `publicState` | Strips `autoResearch`, `researchApprovalMode`, `trustedFeedIds`, `twitch*`, `activeCardId`, presenter notes, source URLs |
| Operator token auth | Yes | `requireOperator`, `DESK_OPERATOR_TOKEN` | Constant-time compare; 503 if unset |
| Netlify Blobs (strong consistency) | Yes | `getStore({name: STORE_NAME, consistency: "strong"})` | Store name `cyber-live-desk` |
| Witty headline rewrite (opt-in, offline) | Yes | `wittyRewrite`, `WITTY` matchers | Templates only, no external API |
| Test card (seeded) | Yes | `TEST_CARD` | Clearly labelled, not real news |

### Integrations
| Integration | Status | Env required |
|-------------|--------|--------------|
| Netlify Blobs | Built-in | None (deployed) |
| Twitch EventSub | Code complete | `TWITCH_WEBHOOK_SECRET`, `TWITCH_BROADCASTER_USER_ID` |
| Twitch clips | Code complete | `TWITCH_CLIENT_ID`, `TWITCH_CLIP_ACCESS_TOKEN`, `TWITCH_BROADCASTER_USER_ID` |
| Feed proxy | Code complete (optional) | `DESK_FEED_PROXY`, `DESK_FEED_TIMEOUT_MS`, `DESK_FEED_BUDGET_MS` |
| X feed proxy | Code complete | — |
| Audiomack proxy | Code complete | — |
| Spotify proxy | Code complete | — |

---

## 3. Discrepancy Report (Actual vs Research Pack)

The research pack (`CRID_SWAE_PHASE0_ALL_IN_ONE.txt`) describes six documents: RESEARCH, ARCHITECTURE, PROTOCOL, SECURITY, ROADMAP, CAPABILITY_DISCOVERY. Below are evidence-backed discrepancies between what the pack describes and what the repo actually implements.

### Confirmed aligned (pack matches code)

| Area | Pack claim | Code evidence |
|------|-----------|---------------|
| CRID jumbotron segment | branded segment, verdict 0/1, entry numbers, audio URL | `_desk-core.mjs:26-27`, `crid-open/close/verdict/audio` (lines 586-614, 844-911) |
| CRID Court | debate, two viewpoints, W/L verdict | `court-open/vote/verdict/close` (lines 680-704), `wl()` (line 1230) |
| Desks | sticky topic filters, "desk music" behavior | `DESKS` (lines 169-216), `runAction` desk case (lines 507-516) |
| Auto-play | visible+unheld+expired only, desk-scoped | `autoAdvancePlan` (lines 140-148), tests |
| Research | pending-only, approval modes, held bucket, age-out | `runResearch` (lines 1235-1422), `pruneAutoArrivals`, `readHeldResearch` |
| Twitch EventSub | signed webhook, challenge, broadcaster-only | `handleTwitchWebhook` (lines 167-297), `twitchMayCommand` (lines 39-46) |
| Bulk approval | on-air protection, editorial gate | `bulkUpdateApproval` (lines 444-481) |
| Public state scrubbing | no presenter notes, source URLs, private settings | `publicProjection` (lines 253-264), test assertions (lines 176-184) |

### Gaps / discrepancies requiring verification against pack

| # | Area | Discrepancy | Evidence | Research impact |
|---|------|-------------|----------|-----------------|
| 1 | GitLab vs GitHub | Pack may reference GitLab (`gitlab.com/crid1/cyber-live-desk`) as the linked Netlify repo; local origin is GitHub (`github.com/hisiaq1234/cyber-live-desk`). GitLab main at `f1dbc058` (overlay MR `!1` merged). Local HEAD `67a07f8`. `git fetch gitlab` timed out twice — could not confirm parity. | `git remote -v`, failed fetch | Unresolved: which branch/tag the pack audited; local may diverge from Netlify-linked GitLab. |
| 2 | `desk-auto-research.mjs` | Partially read — cron schedule and full behavior not fully confirmed against `RESEARCH_INTERVAL_MIN = 15` constant. | Core constant line 8; file not fully read | Verify cron matches 15-min interval and auto-research gate reads persisted mode. |
| 3 | `twitch-eventsub.mjs` | Partially read — entry-point wiring to `_twitch-core` not fully confirmed. | `_twitch-core.mjs` default export (line 309) refuses direct requests | Verify HTTP entry correctly imports and delegates. |
| 4 | Overlay (`overlay.js`) | Rewritten during prior turn (before research boundary). `node --check` passed, but not compared against pack's overlay spec. | Rewritten file exists | Verify overlay behavior matches pack's viewer spec (poll 204, CRID draw, desk awareness). |
| 5 | X-feed / Audiomack / Spotify proxies | Read earlier but not cross-checked against pack's integration spec. | Files exist | Verify against pack's integration requirements. |
| 6 | Test count | Pack/AUDIT_FEASIBILITY.md cited 92 tests; actual is **123 pass, 0 fail**. | `node --test` output | Pack figure is stale; update any pack references. |
| 7 | `desk-commands.js` legacy `chatMayCommand` | Browser-side `chatMayCommand` still checks moderator badges (line 78 of `_commands.mjs`), but production auth is server-side EventSub (stable id only). Pack may describe client-side auth. | `_commands.mjs:75-82`, comment says "Production command authorization lives in _twitch-core.mjs" | Clarify in docs: client-side `chatMayCommand` is legacy/test-only; server is authoritative. |
| 8 | Voice endpoint | Not obviously in pack's protocol doc; exists as public unauthenticated endpoint with safe-action subset. | `desk.mjs:122-138` | Confirm pack accounts for this attack surface (safe actions only, no token). |

### No discrepancies found (code exceeds or matches pack)
- CRID verdict strictly 0/1 ✓
- Research never touches live state ✓
- Operator token required for all mutating routes ✓
- Secrets never in repo / never sent to browser ✓
- Blocked outlets fall back to Google News twin ✓
- Proxy API key never leaks in reports ✓

---

## 4. Validated Architecture

### Layers

```
Browser (control.js module)
  ├─ REST: POST /api/desk/action   (operator token)
  ├─ REST: POST /api/desk/cards
  ├─ REST: POST /api/desk/research
  ├─ REST: GET  /api/desk/cards
  ├─ REST: GET  /api/desk/twitch
  ├─ WS:    wss://irc-ws.chat.twitch.tv (vote tally only, no commands)
  └─ GET    /desk → overlay.js (viewer, long-poll ?since=)
```

```
Netlify Functions (Node 22, @netlify/blobs strong consistency)
  desk.mjs (HTTP shell)
    ├─ GET  /desk              → overlay page
    ├─ GET  /control           → controller page
    ├─ GET  /api/desk/state    → publicState (204 if since=version)
    ├─ GET  /api/desk/cards    → full queue + state + counts + desks + feeds + research + twitch status
    ├─ GET  /api/desk/twitch   → Twitch status
    ├─ POST /api/desk/voice    → safe-action subset (no token)
    ├─ POST /api/desk/cards    → upsertCard
    ├─ POST /api/desk/action   → runAction (all verbs)
    └─ POST /api/desk/research → runResearch

  _desk-core.mjs (shared core, imported by desk.mjs + desk-auto-research.mjs + tests)
    ├─ State: DEFAULT_STATE, readState/commitState/commitStateIfCurrent (versioned, optimistic concurrency)
    ├─ Cards: upsertCard, readCards, queueOf, nextAfter, autoAdvancePlan, advanceIfExpired
    ├─ Desks: DESKS, resolveDesk, matchesDesk
    ├─ Public: publicCard, publicProjection, publicState
    ├─ Actions: runAction (show/desk/next/previous/poll/vote/set-votes/end-poll/crid-*/court-*/music-*/space-*/ledger-*/riad-*/auto-*/research-approval/twitch-*/bulk-approval/clip-create)
    ├─ Research: FEEDS, candidates, fetchFeed, proxyFor, runResearch, pruneAutoArrivals, readHeldResearch/writeHeldResearch, toCard, approvalForFeed, untouchedAuto, queueCounts
    ├─ Twitch clips: createTwitchClip (create + poll verify)
    └─ Helpers: wittyRewrite, decodeXml, tagText, safeUrl, clip, norm, sameTopic, wl, cryptoRandomId, HttpError

  _twitch-core.mjs (Twitch EventSub)
    ├─ verifyTwitchSignature (sha256 HMAC, replay window 10 min)
    ├─ handleTwitchWebhook (challenge/revocation/notification, dedupe, broadcaster+allowlist gate)
    ├─ twitchStatus (configured/verified/tested/ready gating)
    └─ twitchEnv, readTwitchStatus/writeTwitchStatus

  _commands.mjs (shared pure-JS command parsing, browser + server)
    ├─ parseDeskCommand, parsePollSpec, validatePollDraft, parseAllowIds
    ├─ chatMayCommand (legacy browser gate), commandBody, commandText, COMMAND_HELP
```

### Key invariants (validated by tests)
1. **Versioned optimistic concurrency**: `commitStateIfCurrent` re-reads state; two overlapping auto-advances move exactly one card (test line 142-151).
2. **Research never touches live state**: `runResearch` does not bump `version`, does not change `activeCardId`/`visible` (test lines 161-168).
3. **Caller cannot bypass approval mode**: `runResearch` reads persisted `researchApprovalMode`, ignores request parameters (test line 170-176).
4. **On-air card protected**: bulk rejection skips the active card; auto-play never shows unapproved cards (test lines 261-266).
5. **Public state scrubbing**: no presenter notes, source URLs, `activeCardId`, `autoResearch`, `researchApprovalMode`, `trustedFeedIds`, `twitch*` on the wire (test lines 176-184).
6. **Dedupe across runs**: `importKey` prevents re-filing; held bucket retrieves before new headlines (test lines 435-454).
7. **Twitch "Ready" is strict**: configured + enabled + webhook verified + a successful broadcaster command ran (test lines 139-153, 223-250).
8. **Twitch identity is stable id only**: moderator badge / display name never authorizes (test lines 155-173).

### State shape (DEFAULT_STATE, `_desk-core.mjs:30-62`)
`version`, `updatedAt`, `mode` (cards\|x-following), `visible`, `hold`, `showSource`, `activeCardId`, `expiresAt`, `poll`, `desk`, `crid` (segment), `cridSeq`, `court`, `music`, `spaces`, `ledger`, `riad`, `autoPlay`, `autoResearch`, `researchApprovalMode` (manual\|trusted\|all), `trustedFeedIds`, `twitchChatEnabled`, `twitchAllowedUserIds`.

---

## 5. Minimal E2E PoC Spec

**Goal:** Verify CRID segment + verdict + audio flows end-to-end through the real HTTP layer (not unit mocks), on a local or deployable instance, before iPhone 12 / macOS / Xcode testing.

### Prerequisites
- Netlify CLI or deployed site with `DESK_OPERATOR_TOKEN` set.
- `node --test` passes (123/123 confirmed).
- Optional: `TWITCH_*` env for clip tests (not required for CRID PoC).

### Test script (pseudocode, run against `/.netlify/functions/desk` or deployed equivalent)

```
1. GET  /api/desk/state          → version V0, visible=false, crid=null
2. POST /api/desk/action  {action:"crid-open", kind:"music", title:"Test segment", credit:"QA", audioUrl:"https://cdn.example/t.mp3"}
   → 200, state.crid.entry=1, verdict=null, audioPlaying=false
3. GET  /api/desk/state?since=V0 → 204 (no change)
4. GET  /api/desk/state          → 200, body.crid.entry=1, body.crid.audioUrl=..., body.crid.audioPlaying=false
   (assert: no activeCardId, no presenterNotes, no autoResearch in wire)
5. POST /api/desk/action  {action:"crid-verdict", value:1}
   → state.crid.verdict=1; public state carries verdict=1
6. POST /api/desk/action  {action:"crid-verdict", value:2} → 422 ("0 or 1")
7. POST /api/desk/action  {action:"crid-audio", playing:true}
   → state.crid.audioPlaying=true
8. POST /api/desk/action  {action:"crid-close"}
   → state.crid=null; public state crid=null; entry counter persists (next open = entry 2)
9. POST /api/desk/action  {action:"crid-verdict", value:1} (no segment) → 409 ("no CRID segment open")
10. POST /api/desk/action  {action:"crid-open", kind:"football", title:"x"} → 422 (kind)
11. POST /api/desk/action  {action:"crid-open", title:"x"} (no kind) → 422 (kind)
12. GET  /api/desk/cards         → queue unchanged by CRID ops (research/card isolation)
13. POST /api/desk/action  {action:"desk", desk:"music"} then auto-play expiry → advance inside desk only
```

### Success criteria
- All 13 steps return expected status codes and state transitions.
- Public state never leaks `activeCardId`, `presenterNotes`, `autoResearch`, `researchApprovalMode`, `trustedFeedIds`, `twitch*`.
- Verdict only 0/1, only on open segment; close clears verdict; entry numbers never repeat.
- Audio URL stored + play/pause + replace while playing.
- 123 unit tests still pass (regression).

---

## 6. Unresolved Questions (macOS / Xcode / iPhone 12 testing)

These require physical-device or simulator testing that cannot be done from this repo alone:

1. **GitLab parity:** Pack references GitLab (`gitlab.com/crid1/cyber-live-desk`, commit `f1dbc058`, overlay MR `!1`). Local origin is GitHub. `git fetch gitlab` timed out twice. **Question:** Is the Netlify-linked GitLab branch identical to local GitHub HEAD `67a07f8`? If not, which does the pack audit?

2. **Overlay on iPhone 12 Safari:** `overlay.js` was rewritten (dock `max-height:42dvh`, X-jumbotron wipe fix, configurable logo, renderer try/catch). `node --check` passed but no Safari/WebKit validation. **Question:** Does the jumbotron render correctly on iPhone 12 Safari? Does the dock fit within 42dvh? Does the CRID verdict pill (PAID/OWING/ON JUMBOTRON) display without overflow?

3. **Netlify Blobs on device:** Strong-consistency blob reads/writes from mobile network. **Question:** Any latency/consistency issues on iPhone 12 cellular vs Wi-Fi? Does `?since=` long-poll behave (204 on no-change)?

4. **Twitch EventSub on device:** Webhook callback `https://cyber-live-desk.netlify.app/api/twitch/eventsub` must be reachable from Twitch. **Question:** Is the deployed URL public and HTTPS? Does the challenge handshake complete?

5. **CRID audio on iOS:** `audioUrl` played via Swae/stream audio. **Question:** Does iOS Safari allow autoplay of the segment audio? Does play/pause toggle work? Does audio continue when tab backgrounds?

6. **Voice endpoint attack surface:** Public unauthenticated `POST /api/desk/voice` with safe-action subset. **Question:** Does the pack's security doc account for this? Is `clip-create`/`crid-open` in the safe set acceptable risk?

7. **`desk-auto-research.mjs` cron:** Not fully read. **Question:** Does the scheduled run respect `RESEARCH_INTERVAL_MIN = 15` and the persisted `researchApprovalMode`? Does it run on Netlify scheduled functions?

8. **Test count drift:** Pack/AUDIT_FEASIBILITY.md says 92 tests; actual is 123. **Question:** Should pack references be updated to 123?

---

## Engineering Decision

**Build first.** The codebase implements the CRID segment, verdict, audio, Court, desks, auto-play, research pipeline with approval modes, bulk approval, Twitch EventSub, clip creation, and public-state scrubbing — all validated by 123 passing tests. The architecture is sound (versioned optimistic concurrency, research/live-state separation, strict Twitch "Ready" gating, server-authoritative auth).

**Avoid:** Do not modify code during this research phase (per assignment boundary). Do not deploy until GitLab parity is confirmed (the Netlify-linked repo may differ from local GitHub HEAD).

**iPhone 12 test:** Required for overlay rendering (jumbotron, dock, verdict pill, CRID audio) and mobile network behavior of `?since=` long-poll. Cannot be validated from this repo alone — needs Xcode simulator or physical device.

**Next step (if user wants to proceed):** Confirm GitLab vs GitHub parity, then run the E2E PoC spec against a deployed instance, then test on iPhone 12 Safari.