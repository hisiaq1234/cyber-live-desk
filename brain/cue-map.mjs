/* Engine command envelopes → the one cue the desk overlay can perform.
 *
 * This table used to live inside api/brain-tick.mjs, which meant the only caller was the
 * five-minute serverless tick. The local brain needs the same translation — a second copy
 * would be the "two vocabularies" drift the desk audit warns about — so it lives here, in
 * brain/, where both the local loop and the serverless tick import it.
 *
 * brain/commands.mjs names gestures by intent ("double-take", "lean-in"); the overlay names
 * its sequences (public/desk-assets/crid-bot.js → CUE_NAMES, mirrored by BOT_CUES in
 * api/_desk-core.mjs). Only the ones both sides agree on are translated — an unknown gesture
 * is dropped rather than guessed at on air.
 */
import { BOT_CUES } from "../api/_desk-core.mjs";

const GESTURE_CUES = {
  wave: "wave",
  cheer: "cheer",
  nod: "nod",
  hop: "hop",
  jump: "jump",
  shrug: "shrug",
  sit: "sit",
  stand: "stand",
  salute: "salute",
  peek: "peek",
  kick: "kick",
  crawl: "crawl",
  "double-take": "surprise",
  "lean-in": "think",
};

// Expressions are a mood, not a sequence. These are the moods with an honest one-word equivalent.
const EXPRESS_CUES = {
  excited: "cheer",
  pleased: "nod",
  delighted: "delighted",
  thinking: "think",
  deadpan: "sideeye",
  curious: "curious",
  surprised: "surprise",
  sad: "wince",
};

/**
 * The one thing CRID performs from a batch of envelopes the engine just emitted.
 *
 * The desk state holds a single one-shot cue, so at most one is chosen: the line if he has
 * one (that is what reads as performing on stream), otherwise a gesture, otherwise a
 * micro-emotion, otherwise an expression. Everything else the engine emits — presence, look,
 * effects, layer moves — has no cue equivalent and is simply not posted.
 */
export function cueFor(envelopes = []) {
  const list = Array.isArray(envelopes) ? envelopes.filter(Boolean) : [];
  const said = list.find((e) => e.type === "say" && String(e.payload?.text ?? "").trim());
  if (said) return { name: "say", text: String(said.payload.text).trim() };
  for (const e of list) {
    if (e.type !== "gesture") continue;
    const name = GESTURE_CUES[e.payload?.type];
    if (name) return { name };
  }
  for (const e of list) {
    if (e.type !== "micro") continue;
    const name = e.payload?.emotion;
    if (BOT_CUES.includes(name)) return { name };
  }
  for (const e of list) {
    if (e.type !== "express") continue;
    const name = EXPRESS_CUES[e.payload?.emotion];
    if (name) return { name };
  }
  return null;
}
