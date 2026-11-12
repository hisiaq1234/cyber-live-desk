/* CRID'S SAVE FILE — the write half of his persistence (docs/specs/behaviour-drives.md §10).
 *
 * The desk page is where Crid actually lives: his drives decay on this machine's clock, his
 * body knows where it is standing and where the dropped bag lies. This module is the only
 * thing that carries that knowledge back to the desk state (POST /api/desk/being, under
 * state.bot.being), so the next load — a reload, an OBS restart, a phone checking in — reads
 * one snapshot and continues the same Crid instead of rolling a fresh one.
 *
 * Three rules, all testable without a browser:
 *   - throttled: at most one save every `minMs` (5 s, matching the spec's write cadence);
 *   - flushed: pagehide and visibilitychange→hidden send the freshest snapshot even inside
 *     the throttle window, because a tab that is going away will not get another poll;
 *   - best-effort: a failed post is swallowed like the cue reporter's — losing one save costs
 *     a few seconds of decay, never the stream.
 *
 * The token is the same one the cue reporter uses: the page is served it for exactly these
 * writes and nothing else (see api/desk.mjs). Without it the sync is simply off, exactly as
 * the cue channel is off without one.
 */
export function createBeingSync({
  token = "",
  url = "/api/desk/being",
  get = null,
  fetchFn = globalThis.fetch,
  minMs = 5000,
  log = null,
} = {}) {
  const on = Boolean(token && url && fetchFn && typeof get === "function");
  let lastAt = -Infinity;
  const send = async () => {
    const snap = get();
    if (!snap) return null;
    try {
      const res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(snap),
        // The unload flush has to survive the page going away; keepalive is what allows it.
        keepalive: true,
      });
      if (!res.ok) return null;
      return await res.json().catch(() => null);
    } catch (err) {
      log?.(`[being] save not delivered: ${err?.message || err}`);
      return null;
    }
  };
  return {
    /** False when the page was served without a token — same contract as the cue reporter. */
    on,
    /** Called on each state poll: keeps a save going at most every minMs. */
    poll() {
      if (!on) return null;
      const now = Date.now();
      if (now - lastAt < minMs) return null;
      lastAt = now;
      return send();
    },
    /** pagehide / hidden: the freshest snapshot goes out even inside the throttle window. */
    flush() {
      if (!on) return null;
      lastAt = Date.now();
      return send();
    },
  };
}
