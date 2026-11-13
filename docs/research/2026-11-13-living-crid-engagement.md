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

## Confidence labels

- **Fact:** platform delivery, Channel Points, state and code-path claims linked above or verified in the repository.
- **Inference:** The Ascent best fits the existing staged physics and the owner's desired film-like pacing.
- **Speculation:** exact retention/FOMO effect sizes; no claim should be made until a controlled, ethical live trial produces real channel data.
