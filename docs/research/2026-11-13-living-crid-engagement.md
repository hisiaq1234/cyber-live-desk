# Living CRID Engagement — Research Log

Status: research in progress. This is a decision record, not an approved implementation plan.

## Intent

Build an overnight-capable CRID experience people return to because a living character has a visible, coherent ambition. Viewers can help with real agency: chat shapes decisions, free Channel Points create named moments, and verified support can make him visibly stronger. The effect must be cinematic and calm—preparation, focus, failed grips, recovery and small victories—not a random alert machine.

Non-goals: a deceptive donation-pressure loop, a generic idle-game skin, a second animation/physics engine, or unlabelled test/demo material presented as live programming.

## Grade 1 — What leading platforms and research establish

- **Fact — separate free participation from paid support.** Twitch Channel Points are earned automatically while watching and support custom rewards; Twitch recommends clear reward names/descriptions and completing or refunding them. [Twitch Channel Points guide](https://help.twitch.tv/s/article/channel-points-guide) and [reward guidance](https://help.twitch.tv/s/article/making-the-most-of-channel-points?language=en_US.Craft).
- **Fact — make the effect specific and visible.** Twitch's current Custom Power-ups explicitly let viewers influence a stream or trigger a visible overlay effect; the creator defines the effect and Bits amount. [Twitch announcement](https://blog.twitch.tv/en/2026/05/19/new-ways-to-turn-your-community-s-participation-into-earnings).
- **Fact — reward presence and contribution differently.** Streamlabs' loyalty model pays for watching/lurking, adds an activity bonus, and separately rewards follows, subscriptions and raids; its currency can trigger commands, alerts, giveaways and minigames. [Streamlabs loyalty documentation](https://support.streamlabs.com/hc/en-us/articles/17170162687643-Cloudbot-101-Loyalty-Points).
- **Fact — crowd input needs aggregation.** Twitch Plays research documents how raw crowd commands can stall progress, while a short voting window and plurality/majority aggregation creates a workable shared-control experience. [Viewer-types study](https://link.springer.com/article/10.1007/s11257-022-09328-9) and [CrowdChess](https://umtl.cs.uni-saarland.de/paper_preprints/paper_crowdchess_a_system_to_investigate_shared_game_control_in_live-streams.pdf).
- **Fact — chat becomes noise at scale.** Studies identify information overload as message rate grows, so the game must accept a tiny command vocabulary, a per-viewer cap, and a visible countdown/decision result rather than interpret arbitrary chat. [Information-overload study](https://pmc.ncbi.nlm.nih.gov/articles/PMC6837236/).
- **Fact — EventSub is at-least-once and time-bounded.** Twitch can resend a webhook event; handlers need message-ID deduplication and quick acknowledgement. [Webhook handling](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/).

### Canon inferred from those facts

1. One legible shared objective; no hidden score maze.
2. A free input lane (vote / Channel Points) and a support lane (sub, gift, Bits), each with a bounded, named effect.
3. Aggregate chat in windows; never execute every message as movement.
4. The server is authoritative; the overlay only renders a snapshot and reports an outcome.
5. A newcomer can see: current goal, current danger, how to participate, what just changed, and what will happen next.

## Grade 2 — Open-source patterns

- [HackRU/twitch-plays](https://github.com/HackRU/twitch-plays) implements the essential crowd-control primitive: a whitelist of commands, a fixed vote interval, reset-after-count, and one result for the game loop. Its source is [GPL-3.0](https://github.com/HackRU/twitch-plays/blob/master/COPYING.txt); borrow no code.
- Twitch's official [Channel Points Node sample](https://github.com/twitchdev/channel-points-node-sample) creates/locates a unique reward, validates its token scopes, treats each redemption as a work item, and marks it fulfilled or cancelled. Its own README says production should use EventSub rather than polling. The project needs that lifecycle pattern, not its polling loop.
- [Raikiri](https://github.com/rash-pro/raikiri) normalizes subscription, gift, Bits, Channel Point and chat data into a typed event envelope, then separates initial widget state from live activation. That is the right boundary for an OBS overlay. It is GPL-3.0; borrow no code.

### Repeated open-source pattern

**normalize event -> dedupe -> validate against a small game contract -> commit authoritative state -> broadcast snapshot/cue -> record outcome**.

## Grade 3 — Cyber Live Desk audit

### Already present and worth preserving

- `public/desk-assets/physics.mjs` is the one fixed-step physics world. `stage.mjs` uses that motor for approach, reach, grip, pull, slip, recovery, top and descent. It already rejects unsupported climbs.
- `public/desk-assets/crid-bot.js` already has the selected `body-000-r7` ladder, the real cutout rig, `pushup`, `climb`, `sub`, palms/arms and facial reaction sequences. It must remain the only character motion loop.
- `brain/engine.mjs` already owns deliberate reactions, cool-downs, chat signals, memory and quiet moments. `brain/letters.mjs` proves a stored, timed, audience-visible game contract works.
- `api/_twitch-core.mjs` verifies signatures, checks broadcaster identity, deduplicates deliveries and maps subscription/gift/Bits events. Its test suite covers those protections.
- `api/_desk-core.mjs` is the persisted state authority, and `public/desk-assets/overlay.js` already polls it and consumes a one-shot cue safely.

### Current gap

1. Production EventSub ordinary chat is only used for owner/allowlisted desk commands; it does not reach a viewer game.
2. Verified sub/gift/Bits events currently increment the bot sub count and play a generic engagement reaction; they do not enter a durable game state or the brain event path.
3. `state.bot.being` persists CRID's body drives, floor position and bag, but no shared objective, round, contribution ledger, vote window, outcome or ledger of who helped.
4. The serverless brain tick creates quiet life but does not consume live engagement into a game. A game cannot rely on an open browser tab being alive.
5. The current cue field holds only one one-shot. A game must not post a cue for every chat message or overwrite a meaningful acting beat.

### Startup/overlay finding already corrected

Commit `80bf648` makes headline programming opt-in (`?headlines=1`), hides a closed/expired Letters board, and prevents fixture cards from entering a public/live queue. Full local suite after the rebase: **536/536 passed**. This keeps the first frame quiet and avoids pretending test content is live.

## Adversarial pass

- **Music-only, low-chat or overnight stream:** a game that needs constant chat is dead air. The objective must progress slowly on its own, pause at meaningful decision windows, and visually settle into sleep/rest rather than spam prompts.
- **Busy chat:** interpreting free-form messages or moving on each message becomes unreadable and game-breaking. Use exact commands, one vote per account per window, rate limits and a winner only at the end of a visible window.
- **Event loss/retry:** Twitch may retry, and a disconnected event stream can miss events. Commit event IDs atomically before granting power; make every action idempotent; never promise a reward until it is committed.
- **Browser refresh/OBS restart:** state must be enough to render the same expedition on a cold overlay reload. Animation may restart safely, but scoring/outcome cannot be browser-local.
- **Paid-pressure failure:** research links gifting with engagement and social/parasocial cues, but that is a reason for restraint, not extraction. Never say viewers are responsible for CRID's wellbeing, gate basic participation behind payment, or imply gifts buy a personal relationship. [Meta-analysis](https://doi.org/10.1186/s40359-026-04813-x).
- **Platform access:** custom Channel Points needs the right OAuth scope and EventSub subscription. It is an optional enhancement, not a dependency for the first playable version.

## Candidate directions — no choice made yet

### A. The Ascent (recommended)

One long-lived expedition: CRID wants a clearly visible place above the desk. He plans, rests, observes, takes a cautious attempt, slips or gains a ledge, and retains that world state overnight. A short vote window chooses the next safe tactic (for example, left route, right route, rest). Channel Points can nominate an intentional move; verified support gives a capped strength/resolve charge that changes a real attempt animation and probability, never an automatic win. This maximizes narrative continuity and directly fits the existing stage machine.

### B. Nightly micro-missions

CRID receives many small, resettable tasks: reach a shelf, carry a signal, inspect a card, solve a route. This is easier to balance and test, but risks becoming a generic minigame carousel and loses the strong “will he make it?” hook.

### C. Open companion sandbox

Chat can invoke many gestures/layer interactions at any time. It has the widest agency, but is the least cinematic, most vulnerable to spam, and directly conflicts with the owner's request for calm authored animation rather than random behavior.

## Parallel research addendum — unattended Ascent contract

### Transport and scope facts

- Retain signed EventSub **webhooks** as the paid-event authority for an unattended cloud/Vercel service. Twitch documents WebSocket EventSub as requiring subscription recreation after an unplanned disconnect and does not replay missed events; it is not the source of truth for a sleeping/overnight run. [Subscription authorization](https://dev.twitch.tv/docs/eventsub/manage-subscriptions/) and [WebSocket reconnection](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/).
- The smallest first version needs `channel.chat.message` only for an explicit route-vote grammar, plus `channel.subscribe` and `channel.subscription.gift` for named strength events. Do not add Bits, Channel Points, follows, an Extension or an LLM merely to launch the first story. [Chat EventSub reference](https://dev.twitch.tv/docs/eventsub/reference/chat) and [channel EventSub reference](https://dev.twitch.tv/docs/eventsub/reference/channel).
- The existing webhook core already does the required signature, time-window and delivery-deduplication protection. Keep gifted-recipient subscription events ignored when the aggregate gift event is the authoritative accounting record.

### Proposed single-record contract (not approved implementation)

One persisted `cridRun` record should own `status`, a finite visible goal/checkpoints, the currently open route vote, cumulative strength/tier, a currently requested or queued authored moment, and a bounded idempotency set of consumed delivery IDs. The webhook is the sole writer; the public overlay only renders the derived snapshot.

1. Chat selects direction only at a checkpoint: two pre-authored exact tokens, one vote per viewer in a visible 30-second window, plurality wins; no votes means CRID takes the pre-authored default.
2. A new subscription adds a small fixed strength amount; a gift adds its aggregate event count exactly once. Neither is required to finish the story.
3. Strength is a **separate simulation value**, never the body ladder: do not resize, regenerate or mutate `body-000-r7` or the fixed seven-stage sizing ladder.
4. A strength gain asks the existing motion/world queue for an authored acknowledgement. If the world is busy or the move is unsafe, record the gain and coalesce/queue the acknowledgement; never add a CSS/rAF/physics loop or fake a success.
5. Reaching the goal transitions to an explicit resting/completed state. Do not silently manufacture a new goal during an unattended night.

### Calm interaction rules (specification)

| Situation | Visible outcome | Required restraint |
| --- | --- | --- |
| Quiet room | Goal and one unobtrusive open-route cue; default route on expiry | No repeated plea or dead-air alert. |
| Busy chat | Two labels, compact tally and one result | Ignore malformed/repeated entries; never move per message. |
| New support | Small factual strength mark and one grounded acknowledgement when safe | Coalesce visual responses for 45–60 seconds; accounting is never dropped. |
| Threshold | One tier mark and an unlocked authored move | It is not a paywall or automatic victory. |
| Completed run | “Reached; resting here” state | Stop prompts and queue churn until an operator begins a new run. |

Avoid countdown pressure, “only X left,” loss/guilt wording, randomized rewards, supporter leaderboards and prompts in quiet periods. This is an ethical product constraint, not a growth experiment.

### Open-source comparison

- Twitch's [EventSub webhook Node sample](https://github.com/twitchdev/eventsub-webhooks-node-sample) demonstrates challenge, signature and dispatch structure; its repository has no license grant, so use only as a behavioral reference.
- [TwitchLib.EventSub.Websockets](https://github.com/TwitchLib/TwitchLib.EventSub.Websockets) is MIT and confirms event-specific handler/session boundaries, but its WebSocket model is not preferred for the unattended paid-event path.
- [tmi.js](https://github.com/tmijs/tmi.js) is MIT and demonstrates a small chat event-emitter shape; it may inform non-authoritative ambience only, not money-linked accounting.

## Provisional proposal

Choose **A: The Ascent**, delivered in small, independently testable steps:

1. Define an authoritative `ascent` state machine and a tiny event ledger in desk state; render its idle/goal card only while an operator explicitly enables an expedition.
2. Add one exact free voting window, with dedupe, per-viewer caps, visible deadline and a deterministic result.
3. Route verified sub/gift/Bits and optional Channel Point redemptions through the same ledger; each has a capped, clear effect.
4. Feed only milestone outcomes—not every event—into the existing cue channel and CRID's existing climb/push-up/palm/face acting.
5. Persist/recover across overlay reloads; use the shared physics stage for every actual climb and document the rules for the owner/moderators.
6. Measure engagement as voluntary participation and completed shared outcomes, not pressure metrics.

## Decision points for the owner

1. Is the first permanent story **The Ascent**—one destination CRID works toward over hours/nights—or do you want a different central desire?
2. Should non-paying viewers be able to choose the route by chat command, by Channel Points, or both?
3. What should a subscription/gift/Bits make visibly stronger: resolve for the next attempt, a recovery/save from a slip, or a temporary physical ability?
4. When you are asleep, should CRID remain fully autonomous on the expedition, or only wake up around viewer-triggered decision windows?

## Deployment-verification record — 2026-11-13

- **Vercel is the canonical target.** The production `/desk` endpoint returned HTTP 200 when checked on 2026-11-13. It is the only hosted runtime that can exercise this project's Vercel serverless routes and rewrites.
- **This branch has no Vercel preview by design.** `vercel.json` currently disables automatic Vercel deployments for `fix/crid-physical-mobility`; production therefore cannot prove this branch's unmerged overlay changes.
- **Netlify is non-authoritative for this app.** Its commit-status preview was marked ready, but its `/desk` URL returned the host's 404 page because no Netlify function/rewrite configuration exists in this repository. Do not use that preview as a product verification signal.
- **Local Vercel runtime was attempted without secrets.** Vercel CLI 65.15.0 linked the existing `crid/cyber-live-desk` project; development environment variables were explicitly not downloaded. The CLI then stopped before serving because its Windows builder cache could not create symlinks (`EPERM`). This is an environment/tooling blocker, not a repository build result, and left the Git working tree clean.
- **Production is demonstrably not the feature-branch overlay.** In a 2026-11-13 audit, the production `https://cyber-live-desk.vercel.app/desk` returned HTTP 200 from Vercel, but its live `overlay.js` had `Content-Length: 122629` and a different ETag from the feature-branch source (123725 bytes, SHA-256 `fa7267…`). It cannot be used as evidence for this branch. The branch-specific Vercel guard is documented by Vercel as preventing deployments triggered by commits on that named branch. [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration).
- **Focused regression evidence remains green.** The changed-area suite (`desk-core`, overlay contract and Twitch EventSub) passed **129/129** with zero failures in 15.0 seconds during that audit. This supports source behavior, but does not replace visual runtime verification.

### Consequence

The startup-overlay change has passing source and integration coverage, but an interactive visual check of this exact branch still needs either a working Vercel local runtime or an explicitly enabled Vercel preview. Vercel documents `vercel dev` as the local route/function replica; retry it only from a Windows/WSL context that permits its cache symlinks, without downloading secrets. [Vercel CLI `dev`](https://vercel.com/docs/cli/dev). No deployment was created while collecting this evidence.

## Confidence labels

- **Fact:** platform delivery, Channel Points, state and code-path claims linked above or verified in the repository.
- **Inference:** The Ascent best fits the existing staged physics and the owner's desired film-like pacing.
- **Speculation:** exact retention/FOMO effect sizes; no claim should be made until a controlled, ethical live trial produces real channel data.
