/* THE CUE CHANNEL, from the brain's side — the one call that makes CRID do something on stream.
 *
 * Everything he can do (the sequences and micro-emotions in public/desk-assets/crid-bot.js) already
 * renders, but only on the brain page. The stream page renders from /api/desk/state, so the brain
 * reaches it the same way it reaches everything else on the desk: POST /api/desk/action with the
 * operator token. That action mints state.bot.cue = { name, at, text? }, and the desk overlay — which
 * is already polling that state — performs it once and moves on.
 *
 *   const cues = createCueChannel();
 *   await cues.cue("wave");                  // a gesture
 *   await cues.cue("curious");               // a micro-emotion
 *   await cues.say("rent is due, by the way"); // one line, in his bubble
 *
 * With no CRID_DESK_URL or DESK_OPERATOR_TOKEN it stays off and says so once, exactly like the
 * letters game: a brain with no desk to talk to must not throw on every thought.
 */
export function createCueChannel({
  deskUrl = (process.env.CRID_DESK_URL || "").trim().replace(/\/+$/, ""),
  token = process.env.DESK_OPERATOR_TOKEN || "",
  fetchFn = globalThis.fetch,
  log = console.log,
} = {}) {
  const base = String(deskUrl || "").trim().replace(/\/+$/, "");
  const on = Boolean(base && token && fetchFn);
  let said = false;

  async function cue(name, { text } = {}) {
    if (!on) {
      if (!said) {
        said = true;
        log("[cue] off — set CRID_DESK_URL (the deployed desk) and DESK_OPERATOR_TOKEN so CRID can perform on stream");
      }
      return null;
    }
    const body = { action: "bot-cue", name, ...(typeof text === "string" && text.trim() ? { text: text.trim() } : {}) };
    try {
      const res = await fetchFn(`${base}/api/desk/action`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `desk said HTTP ${res.status}`);
      return json.state?.bot?.cue ?? null;
    } catch (err) {
      // A cue is a gesture, not a record: a failed one is worth a line in the log and nothing else.
      log(`[cue] ${name} failed: ${err.message}`);
      return null;
    }
  }

  return { on, cue, say: (text) => cue("say", { text }) };
}
