/* Jumbo — the word game, fed by the chat the brain already reads.
 *
 * Chat is the input: a viewer types a word, the brain decides whether it is a word the board can
 * spell and whether the dictionary knows it, and the desk records the claim. The brain never
 * invents a word, a score or a player — every number on the jumbotron came back from a claim the
 * desk accepted.
 *
 * The one thing this needs that nothing else in brain/ does is a way to write desk state, so it
 * stays off (and says why once) until CRID_DESK_URL is set. That URL is the deployed desk; the
 * token is the same DESK_OPERATOR_TOKEN the operator surface uses.
 *
 *   CRID_DESK_URL=https://<the desk> DESK_OPERATOR_TOKEN=<token> npm run brain -- --channel <name>
 *
 * Crid's five beats go out on the existing command bus, so they queue behind whatever is loud.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { say, micro, express } from "./commands.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const WORDS_PATH = join(HERE, "..", "public", "data", "words.txt");

const MIN = 3;
const MAX = 7; // a board of seven cannot spell anything longer
const SILENCE_MS = 20_000; // 20s with no valid word is the silence beat
const VOWELS = "aeiou";

/** The dictionary: one lowercase word per line, into a Set at boot. No dependency, no request. */
export function loadWords(path = WORDS_PATH) {
  return new Set(
    readFileSync(path, "utf8").split("\n").map((w) => w.trim().toLowerCase()).filter(Boolean),
  );
}

const counts = (letters) => {
  const m = new Map();
  for (const ch of letters) m.set(ch, (m.get(ch) ?? 0) + 1);
  return m;
};

/** Can the board spell this word, and does the dictionary have it? */
export function judge(word, letters, words) {
  const w = String(word ?? "").trim().toLowerCase();
  if (!/^[a-z]+$/.test(w)) return { ok: false, reason: "not-a-word" };
  if (w.length < MIN || w.length > MAX) return { ok: false, reason: "length" };
  const board = counts(letters);
  const used = new Map();
  for (const ch of w) {
    const want = (used.get(ch) ?? 0) + 1;
    if (want > (board.get(ch) ?? 0)) return { ok: false, reason: "letters" };
    used.set(ch, want);
  }
  if (!words.has(w)) return { ok: false, reason: "dictionary" };
  return { ok: true, word: w };
}

export function createJumboGame({
  bus, log = console.log, words = loadWords(), now = Date.now,
  deskUrl = (process.env.CRID_DESK_URL || "").trim().replace(/\/+$/, ""),
  token = process.env.DESK_OPERATOR_TOKEN || "",
  fetchFn = globalThis.fetch,
} = {}) {
  const on = Boolean(deskUrl && token && fetchFn);
  let round = null; // { id, letters, endsAt, status }
  let lastValidAt = 0;
  let silentBeats = 0; // how many times the room has gone quiet this round
  const rejected = new Set(); // `${user}|${word}` — one quiet line, never a repeat
  let deadline = null;
  let ticker = null;
  let said = false;

  const post = async (body) => {
    const res = await fetchFn(`${deskUrl}/api/desk/action`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `desk said HTTP ${res.status}`);
    return json;
  };

  const emit = (cmds) => { try { bus?.emit(cmds.filter(Boolean)); } catch (err) { log(`[jumbo] bus: ${err.message}`); } };

  const applyRound = (jumbo) => {
    round = jumbo ? { id: jumbo.id, letters: jumbo.letters ?? [], endsAt: jumbo.endsAt, status: jumbo.status } : null;
    clearTimeout(deadline);
    if (!round || round.status !== "open") return;
    deadline = setTimeout(() => { close("deadline"); }, Math.max(0, round.endsAt - now()) + 50);
    if (deadline.unref) deadline.unref();
  };

  /** Open a round. The desk draws the board unless letters are handed in. */
  async function open({ seconds, letters } = {}) {
    if (!on) return null;
    try {
      const out = await post({ action: "jumbo-open", ...(seconds ? { seconds } : {}), ...(letters ? { letters } : {}) });
      applyRound(out.state?.jumbo);
      rejected.clear();
      silentBeats = 0;
      lastValidAt = now();
      emit([
        say(`Seven letters. ${round ? Math.round((round.endsAt - now()) / 1000) : 90} seconds. Longest word pays most.`, { style: "host", why: "jumbo round opened" }),
        express("curious", { intensity: 0.5, hold: 3500, why: "the board just landed" }),
      ]);
      log(`[jumbo] round open · ${round?.letters.join(" ")} · ends ${new Date(round.endsAt).toLocaleTimeString()}`);
      return round;
    } catch (err) {
      log(`[jumbo] open failed: ${err.message}`);
      return null;
    }
  }

  /** Close it and name the winner, the word and the leader. */
  async function close(why = "operator") {
    if (!on || !round) return null;
    clearTimeout(deadline);
    try {
      const out = await post({ action: "jumbo-close" });
      const result = out.jumbo ?? {};
      applyRound(out.state?.jumbo);
      const best = result.best;
      const leader = result.leader;
      const big = best && best.word.length >= 6;
      emit([
        say(best
          ? `${best.word.toUpperCase()} — ${best.user}, ${best.score} points. ${leader ? `${leader.user} leads on ${leader.points}.` : ""}`
          : "No words this round. The board won.",
          { style: "host", why: `jumbo round closed (${why})` }),
        express(big ? "proud" : "smug", { intensity: 0.7, hold: 5000, why: big ? "the room found a long word" : "the round is over" }),
      ]);
      log(`[jumbo] closed (${why}) · ${result.words ?? 0} words · best ${best ? best.word : "none"}`);
      round = null;
      return result;
    } catch (err) {
      log(`[jumbo] close failed: ${err.message}`);
      return null;
    }
  }

  async function claim(user, word) {
    try {
      const out = await post({ action: "jumbo-claim", user, word });
      const r = out.jumbo ?? {};
      if (!r.accepted) return r;
      if (out.state?.jumbo) applyRound(out.state.jumbo);
      lastValidAt = now();
      silentBeats = 0;
      if (r.firstBlood) {
        emit([say(`${word.toUpperCase()} — ${user} opens the round.`, { style: "host", why: "first word of the round" }), express("proud", { intensity: 0.6, hold: 3000, why: "first blood" })]);
      } else if (r.newBest) {
        emit([say(`${word.toUpperCase()} — ${user} takes the best word, ${r.score} points.`, { style: "host", why: "new best word" }), express("delighted", { intensity: 0.8, hold: 3500, why: "a longer word landed" })]);
      }
      log(`[jumbo] ${user} claimed ${word} (+${r.score}, total ${r.total})`);
      return r;
    } catch (err) {
      log(`[jumbo] claim failed: ${err.message}`);
      return { accepted: false, reason: "desk" };
    }
  }

  /** One chat line. Anything that is not a word is ignored, quietly. */
  async function onEvent(evt) {
    if (!on || !round || round.status !== "open" || evt?.type !== "chat") return;
    const user = String(evt.user ?? "").slice(0, 30);
    if (!user) return;
    const text = String(evt.text ?? "").trim();
    // A line of prose is not a submission: only a single bare token is judged.
    if (!/^[a-zA-Z]{3,7}$/.test(text)) return;
    const verdict = judge(text, round.letters, words);
    if (!verdict.ok) {
      const key = `${user}|${verdict.word ?? text.toLowerCase()}`;
      if (rejected.has(key)) return; // one quiet line per viewer per word, never a repeat
      rejected.add(key);
      emit([say(`"${text.slice(0, 20)}" isn't a word the board can make.`, { style: "dry", why: `rejected ${verdict.reason}` })]);
      return;
    }
    const key = `${user}|${verdict.word}`;
    const result = await claim(user, verdict.word);
    if (result.accepted === false && result.reason !== "taken" && !rejected.has(key)) {
      rejected.add(key);
      emit([say(`"${verdict.word}" didn't land.`, { style: "dry", why: `desk refused: ${result.reason}` })]);
    }
    // "taken" says nothing at all: the first viewer owns the word, the second gets silence.
  }

  /** The unprompted half: the room has gone quiet. */
  function tick() {
    if (!on || !round || round.status !== "open") return;
    if (now() >= round.endsAt) { close("deadline"); return; }
    if (now() - lastValidAt < SILENCE_MS) return;
    if (now() - lastValidAt < SILENCE_MS * (silentBeats + 1)) return;
    silentBeats += 1;
    // Alternate the feeling, so the same nag never lands twice in a row.
    const feeling = silentBeats % 2 ? "curious" : "sulky";
    emit([micro(feeling, { line: silentBeats % 2 ? "no words yet" : "the board is waiting", duration: 2000, why: `${Math.round(SILENCE_MS / 1000)}s without a word` })]);
  }

  function start() {
    if (!on) {
      if (!said) {
        said = true;
        log("[jumbo] off — set CRID_DESK_URL (the deployed desk) and DESK_OPERATOR_TOKEN so chat can reach it");
      }
      return;
    }
    ticker = setInterval(tick, 1000);
    if (ticker.unref) ticker.unref();
    log("[jumbo] on — watching chat for words while a round is open");
  }

  function stop() {
    clearInterval(ticker);
    clearTimeout(deadline);
    ticker = null;
    deadline = null;
  }

  return { on, open, close, claim, onEvent, tick, start, stop, get round() { return round; }, get words() { return words.size; } };
}

export { VOWELS };
