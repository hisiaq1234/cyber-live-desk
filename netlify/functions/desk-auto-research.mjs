// CYBER LIVE DESK — scheduled auto-research.
// Runs on its own clock, does one thing, and only when the operator switched
// "Auto research" on in the controller. Cards land as PENDING, exactly like the
// manual button; nothing here can approve or show anything.
//
// Netlify rules this file obeys (checked against the docs on 2026-10-29):
//   - a function with `config.schedule` never accepts web requests, so there is no
//     route to protect and no token to check here
//   - it gets a Request whose JSON body carries `next_run`
//   - it has a 30 second execution limit; feeds run in parallel and each one gets
//     DESK_FEED_BUDGET_MS (8s by default) including its retries, so a slow proxy cannot
//     stack twelve of them past the limit
//   - it only fires on published deploys, never on deploy previews

import { getStore } from "@netlify/blobs";
import { RESEARCH_INTERVAL_MIN, STORE_NAME, readState, runResearch } from "./_desk-core.mjs";

export const config = {
  schedule: `*/${RESEARCH_INTERVAL_MIN} * * * *`, // UTC
};

export default async (req) => {
  const { next_run: nextRun } = await req.json().catch(() => ({}));
  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  const state = await readState(store);

  if (!state.autoResearch) {
    console.log("auto research off, skipping. next run:", nextRun);
    return Response.json({ ok: true, skipped: "auto research is off" });
  }

  try {
    const result = await runResearch(store);
    console.log(
      `auto research: ${result.added} new pending, ${result.dropped} stale dropped, ${result.held} held back (queue capped), ` +
        `${result.pending} waiting out of ${result.cards} cards; ${result.feeds.filter((f) => !f.ok).length} feed(s) failed`
    );
    return Response.json({ ok: true, ...result });
  } catch (err) {
    // The next scheduled run retries on its own; a bad run must not look like a success.
    console.error("auto research failed", err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
};
