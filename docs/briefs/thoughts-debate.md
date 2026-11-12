# Brief — thoughts as confrontations, not one-liners

**The owner's direction (2026-11-11).** Crid's thoughts should be shaped like *War of Thoughts* —
structured philosophical confrontations that escalate and end unresolved — but **not verbatim**, and
not a philosophy book. We write our own propositions and our own lines. Nothing is copied from that
book or from any published text.

## What exists today, and why it is wrong

`brain/engine.mjs:725` — the `musing` rule. After `musingMs` (45s) of quiet it calls
`ctx.personality.musing()`, which draws from `brain/crid-personality.json`: 6 `catchphrases`,
6 `opinions`, 4 `runningJokes`. One line, delivered, done. That is a punchline generator. It is the
opposite of what the owner is asking for.

## What a thought becomes

A **confrontation with himself** — two voices, one body. The owner's reference says people hear these
two voices "in your own head"; Crid is one character on stream, so the second voice has to be *him*.
He takes a position, then turns on it, and neither side wins.

**This is a spine, not a fixed beat count.** The owner's correction: it is not necessarily five beats.
Only three things are fixed:

1. **It opens with a proposition**, stated flatly, as fact. One line. ("Everyone says they'd tell the truth.")
2. **It turns on itself.** A voice takes the hard line, then something in him takes the other side and
   attacks that line's *strongest* point — never a strawman.
3. **It never resolves.** No verdict, no comfort, no "both sides". It stops while the tension is still
   standing and leaves the question with the viewer.

Everything between those is free: how many turns, how long, and what else gets in.

## What can slide in — and should

The owner's correction again: a thought is not a clean debate. He may slide in, at any point:

- **a joke** — usually at his own expense, or the kind of flat dark line that lands as one.
- **a random reference to something in the world** — the layer he is leaning on, the clock, the map,
  the ticker, the chat moving too fast, the fact that it is 1am.
- **the news** — what the research pipeline already found. It enters as a thing he noticed, not as a
  headline read aloud.
- **a viewer's message** — see interruption below.
- **something typed into chat.** He can write a beat instead of saying it. A thought can be half spoken
  and half typed, and the typed half is written the way he talks — short, lower case, no punctuation
  performance. **Outbound chat does not exist yet** (nothing can post to chat today); if you need it,
  build the smallest thing that works and say what you built.

None of these are a break from the thought. They are the thought. A joke mid-argument is the
character; a clean five-beat essay is a lecture.

## Hard rules

- **Usually 3–6 lines, and each line ≤ 14 words.** Not a hard count — it may run longer when something
  is genuinely being said — but never a paragraph, never an essay, never a lecture.
- **Never resolved.** If a thought could end with "so the answer is…", it is wrong.
- **No strawmen.** The other voice must attack the real position, or the whole thing is theatre.
- **No real philosophers quoted, no book text, no article text.** Original propositions and lines only.
  Headlines and chat may supply the *trigger*, never the words.
- **It is Crid's voice**, not a lecturer's. Shirtless, backpack, on a desk, at 1am. Short, blunt,
  a bit funny when it is dark.

## The staging is the product

The owner's direction: **he leans back against one layer, walks from there to another, and takes a
wondering pose as he counters.** The two voices are separated by *where he is*, not only by how he
stands. So a thought is staged in space:

- **Voice A lives on one layer.** He leans his back against it — the card, the clock, the map plate —
  still, cold, level.
- **He leaves it for a different layer to deliver the counter**, and takes a wondering pose there
  (weight on one leg, head tilted) as he turns the argument on himself.
- **Voice B gets a different posture and expression** from A (open, weight shifted, defensive —
  e.g. `tender` / `shrug`), and he switches **on the beat**, never mid-sentence.
- Beats land **6–14s apart**, and the walk between layers is *part of the beat*, not a gap. A whole
  thought runs 25–60s and can outlast the viewer's attention — that is fine, it is a world, not a
  notification.

This needs the layer registry and the lean/walk/ponder behaviours in `briefs/layer-staging.md`. Drive
the poses through the **cue channel** (`briefs/cue-channel.md`) so they survive the broadcast renderer.
If either prerequisite is not merged yet, build against its stated contract and say so.

## Interruption is a feature — his reply slides into the thought

The stream keeps running, and chat will land mid-thought constantly. He **replies to the viewer, but
slides that reply in with the thought** rather than breaking it:

- The reply is delivered **as a beat of the same confrontation** — it becomes the proposition, or the
  counter, or the thing he is arguing against. Not a separate answer, not a pause, not a detour.
- He **notices it first** — a glance, a turn toward chat — then folds it in and carries on.
- If it genuinely does not fit, he drops the thought and says why in one line. Never silently ignores
  it, never pauses politely, never pretends the viewer did not speak.
- One brain: the same thought queue is fed by idle time, a chat message, or a story the research
  pipeline already found. No second system.

## Where it appears

His voice (`say`), plus at most **one** short line on screen at a time. Never a paragraph on air.
If a card is used it is one beat, not the whole debate.

## Do not

- Do not rebuild the research/headline pipeline. It exists and it works.
- Do not touch the body frames or `ladder.json`.
- **No new images.**

## Prove it

A seeded test that a generated thought: has 4–6 beats in the fixed order, alternates voices, ends on
an unresolved line, keeps every line ≤ 14 words, and does not reuse a line within the last N thoughts.
Then paste one full generated thought into your report so the owner can read what Crid would actually
say on stream.
