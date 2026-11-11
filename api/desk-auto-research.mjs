// CYBER LIVE DESK — scheduled auto-research.
// Runs every 15 minutes. Only fires when "Auto research" is on in the controller.
// Calls the same runResearch as the manual button, so approval mode is honoured.
// Never touches the on-air card or live state.
//
// The free Vercel plan only accepts daily crons, so the schedule lives in
// .github/workflows/auto-research.yml, which calls this endpoint with CRON_SECRET —
// the same arrangement brain-tick.yml uses for Crid's brain tick.

import { getStore } from "./_store.mjs";
import { readState, runResearch } from "./_desk-core.mjs";

export const config = { runtime: "nodejs" };

const handler = async (req) => {
  // Vercel cron jobs call the function via GET with a special header.
  // Protect against random GET requests hitting this endpoint.
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
      req.headers.get("x-vercel-cron") !== "1") {
    return new Response("Unauthorized", { status: 401 });
  }

  const store = getStore();
  const state = await readState(store);

  if (!state.autoResearch) {
    console.log("[auto-research] skipped — autoResearch is off");
    return Response.json({ ok: true, skipped: "auto research is off" });
  }

  try {
    const result = await runResearch(store);
    console.log(
      `[auto-research] ${result.added} new (${result.autoApproved} auto-approved, ` +
      `mode ${result.approvalMode}), ${result.dropped} dropped, ` +
      `${result.pending} pending / ${result.cards} total`
    );
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[auto-research] failed:", err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
};

export default { fetch: handler };
