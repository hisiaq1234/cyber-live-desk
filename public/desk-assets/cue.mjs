/* THE CUE CHANNEL — one gesture, feeling or line the desk has been told to perform.
 *
 * CRID's whole vocabulary (the sequences in crid-bot.js and its micro-emotions) already renders on
 * the brain page, but the stream page renders from /api/desk/state and had no way to be told "wave
 * now". The state carries a one-shot field instead of a second transport: state.bot.cue =
 * { name, at, text? }, where `at` is minted by whoever posted it and only ever counts up.
 *
 * This reader is the desk's half of that contract, kept in its own module so the rule that makes a
 * cue safe on air can be tested without a browser:
 *
 *   - one stamp is performed exactly once — a re-poll of the same state, a reload mid-gesture, or a
 *     second page watching the same desk cannot replay it;
 *   - an unknown name is consumed and ignored, never thrown, so the desk may pass whatever its
 *     state happens to carry;
 *   - nothing here reads or writes the frame: the caller hands the result to CRID, who queues it
 *     behind whatever he is already doing rather than being remounted or reflowed mid-move.
 *
 * A missing or empty cue means there is nothing to do, which is what every frame looked like
 * before the channel existed, so an old state renders unchanged.
 */
export function createCueReader({ known = () => true } = {}) {
  let last = null;
  return {
    /** The cue to perform for this state, or null. Call once per poll. */
    read(bot) {
      const cue = bot && typeof bot === "object" ? bot.cue : null;
      if (!cue || typeof cue !== "object") return null;
      const at = Number(cue.at);
      if (!Number.isFinite(at)) return null;
      // Stamped before the name is checked: an unknown cue must not fire later just because a
      // future one shares its number.
      if (last !== null && at <= last) return null;
      last = at;
      const name = typeof cue.name === "string" ? cue.name.trim() : "";
      if (!name || !known(name)) return null;
      return { name, at, text: typeof cue.text === "string" ? cue.text : "" };
    },
    /** The last stamp performed, so a caller can report what it has already seen. */
    get at() {
      return last;
    },
  };
}
