/* THE ACTIVITY, on the brain's side — what the desk was told to do, and how it ended.
 *
 * A cue is a one-shot: the brain mints a stamp, the page performs it, and until now the brain never
 * learned whether he actually finished. The desk page now reports back into the ledger the desk
 * keeps (api/_desk-core.mjs → reportCue), and this module turns that report into the one thing the
 * brain wants to know: was this activity confirmed by the body that performed it, or is the brain
 * only assuming?
 *
 * The timer stays. Every activity carries its own `until`, and when that passes with no report the
 * activity closes anyway and says so — `outcome: "unconfirmed"`. That is deliberate: a page that is
 * reloaded, killed or suspended mid-activity never reports, and an activity that could only be
 * closed by a report would leave him stuck in it forever. The report makes the record accurate; the
 * timer makes it terminate.
 *
 * Nothing here touches the DOM, the network or a clock it is not handed: the same activity settles
 * the same way in a test as it does on a live tick.
 */
import { CUE_OUTCOMES } from "../api/_desk-core.mjs";

// The longest a cue can reasonably take on screen. It is a ceiling, not a measurement — the desk's
// report is the measurement. A gesture is a handful of frames; a line is a bubble that is held for
// roughly its own reading time (public/desk-assets/crid-bot.js says the same number out loud).
export const CUE_WINDOW_MS = 8000;
export const SAY_MS_PER_CHAR = 65;
export const SAY_MIN_MS = 2000;
export const SAY_MAX_MS = 6000;
const SAY_TAIL_MS = 1500; // the bubble fades after the reading time, and the report comes after that

/** How long the brain is willing to wait for a cue to finish before it closes it itself. */
export function cueWindow(name, text = "") {
  if (name === "say") {
    const len = String(text ?? "").trim().length;
    const held = Math.min(SAY_MAX_MS, Math.max(SAY_MIN_MS, len * SAY_MS_PER_CHAR));
    return held + SAY_TAIL_MS;
  }
  return CUE_WINDOW_MS;
}

/** The activity one cue starts. `stamp` is the cue's own stamp — the only id the two sides share. */
export function openActivity(cue, now = Date.now()) {
  const stamp = Number(cue?.at);
  if (!Number.isFinite(stamp)) return null;
  const name = String(cue?.name ?? "");
  return {
    stamp,
    name,
    startedAt: now,
    until: now + cueWindow(name, cue?.text),
    outcome: null, // open, until a report or the timer closes it
    confirmed: false,
    endedAt: null,
  };
}

/** The report, if one arrived for this activity's stamp. */
export function reportFor(activity, reports = []) {
  const stamp = Number(activity?.stamp);
  if (!Number.isFinite(stamp) || !Array.isArray(reports)) return null;
  return reports.find((r) => Number(r?.at) === stamp && CUE_OUTCOMES.includes(r?.outcome)) ?? null;
}

/**
 * Close the activity if it can be closed. A matching report wins and marks it confirmed; otherwise
 * the timer closes it unconfirmed once `until` has passed. An activity that is already closed is
 * returned untouched — a late report must not reopen a record the brain has moved on from.
 */
export function settleActivity(activity, { reports = [], now = Date.now() } = {}) {
  if (!activity || typeof activity !== "object") return null;
  if (activity.outcome) return activity;
  const report = reportFor(activity, reports);
  if (report) {
    return { ...activity, outcome: report.outcome, confirmed: true, endedAt: Number(report.reportedAt) || now };
  }
  if (Number(now) >= Number(activity.until)) {
    return { ...activity, outcome: "unconfirmed", confirmed: false, endedAt: now };
  }
  return activity;
}

/** A cue that replaces one still open: the old activity is over, and nobody said how. */
export function supersedeActivity(activity, now = Date.now()) {
  if (!activity || activity.outcome) return activity;
  return { ...activity, outcome: "unconfirmed", confirmed: false, endedAt: now };
}
