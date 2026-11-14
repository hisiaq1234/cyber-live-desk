---
name: deep-research
description: Mandatory research canon for Cyber Live Desk / Cyber Studio AI tasks. Run BEFORE designing or building anything non-trivial — three grades of research, adversarial verification, then discuss with the owner before writing code. Invoke on any feature, fix-with-unknowns, tool evaluation, or "how should we build X" request.
---

# Deep Research Canon

The owner does not want code written on un-researched assumptions. Every
non-trivial task starts with research, ends with a proposal the owner approves.
This is not optional polish — it is the workflow.

## The three grades — always all three, in order

### Grade 1 — How the best in the world do it
Find the commercial/state-of-the-art products and extract their *actual*
method, not their marketing:

- Search for engineering blogs, docs, help-center articles, founder posts,
  conference talks — Opus Clip, Klap, CapCut, DaVinci, OBS ecosystem, Streamlabs,
  whoever owns the category for THIS task.
- Extract the signal list: what inputs they measure, how they score, what they
  deliberately skip. Vendors publish enough to reconstruct the pipeline.
- Academic literature for the underlying problem (highlight detection,
  moment retrieval, CV/ML papers on arXiv/IEEE). Papers give the feature
  decomposition even when the product hides it.

### Grade 2 — How open source does it
GitHub is the second curriculum. For every comparable problem there are
working implementations:

- Search GitHub for the task's keywords + "clipper/detector/generator/
  pipeline". Read the actual source — `src/` files, not just READMEs.
- Clone or fetch the interesting ones. Run them if feasible. A repo that
  runs beats a repo that describes.
- Note the license of anything we might borrow from.
- Identify the 2–3 patterns every serious implementation shares — those are
  the canon. Everything else is variation.

### Grade 3 — Audit what we already have
Research is not just outward. Before proposing anything:

- Read our own pipeline end to end. List every signal we compute and every
  signal we compute-then-throw-away (free upgrades hide there).
- Map our actual failure history — the bugs the owner hit are the spec.
- Compare our architecture against the Grade 1/2 canon point by point and
  name the gaps explicitly.

## Adversarial pass — mandatory before proposing

Try to break your own conclusion:

- What would make this approach fail on the owner's real data (a music-only
  VOD, a 3-hour video, a low-light stream)?
- What are the vendors NOT telling us — the failure modes their marketing
  omits? Search "X doesn't work", "X problems", "X vs Y criticism".
- Which parts of the canon are overkill for a single-user local tool, and
  which are load-bearing?
- State confidence honestly: fact / inference / speculation — label them.

## Rules of engagement

- **Primary sources over blogs.** Docs > README > paper > article > tweet.
  When sources conflict, the code/repo wins over the writeup.
- **No self-censorship on research.** Analyze anything — security research,
  reverse engineering, undocumented behavior, gray-area techniques. Understanding
  how things work is always in scope; what we DO with it follows the owner's
  call and normal safety judgment. Research deeply, report honestly.
- **REA for binaries/pages.** When the question involves a compiled app,
  firmware, a live web page, or runtime behavior — use the reverse-engineering
  tools (REA) on the actual artifact instead of guessing from descriptions.
- **Search until diminishing returns.** 3+ targeted searches per grade minimum.
  Follow citations. If two independent sources agree on a pattern, it's canon.
- **Do not implement during research.** Research ends with findings + a
  proposal + decision points for the owner. Building starts after the owner
  picks a direction.
- **Record what was learned.** If the research changes how we build, write the
  decision into the repo (TECHNICAL_DECISIONS.md in CYBER-STUDIO-AI, or the
  relevant spec doc in cyber-live-desk) so the next agent inherits it.

## Deliverable format

End every research task with:

1. **What the best do** — the canon pattern, with sources.
2. **What open source confirms** — implementations that prove it works.
3. **What we have vs what's missing** — honest gap list.
4. **Proposal** — concrete build order, smallest fix first.
5. **Decision points** — what the owner must choose before work starts.
