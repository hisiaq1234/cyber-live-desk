/* The personality hook.
 *
 * Everything Crid says comes from brain/crid-personality.json. This module loads it,
 * slot-fills templates, and enforces the `never` list — so the owner can pour himself
 * into one JSON file without touching the engine, and a bad line degrades to silence
 * rather than something out of character.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { normaliseReactions } from "./reactions.mjs";
import { normaliseMicroEmotions } from "./micro-emotions.mjs";

export const PERSONALITY_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "crid-personality.json");
const MAX_LINE = 140;

export function loadPersonality(path = PERSONALITY_PATH) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return new Personality(raw, path);
}

export class Personality {
  constructor(raw, path = null) {
    this.path = path;
    this.data = raw || {};
    this.name = this.data.name || "Crid";
    this.owner = this.data.owner || "";
    this.voice = this.data.voice || "";
    this.catchphrases = arr(this.data.catchphrases);
    this.opinions = arr(this.data.opinions);
    this.jokes = arr(this.data.runningJokes).map((j) => (typeof j === "string" ? { id: j, line: j } : j));
    this.never = arr(this.data.never).map((s) => String(s).toLowerCase());
    this.keywords = arr(this.data.keywords).map((k) => ({
      match: arr(k.match).map((m) => String(m).toLowerCase()),
      mood: k.mood || "curious",
      lines: arr(k.lines),
    }));
    this.lines = this.data.lines || {};
    // The owner's reaction vocabulary (Ws/1s hype, L/roast, layer drag). Thresholds,
    // trigger words, cooldowns and lines all live in this file — never in the engine.
    this.reactions = normaliseReactions(this.data.reactions);
    // The quiet layer: eight miniature feelings, their pacing and their lines. Same deal
    // as `reactions` — the owner retunes this file, never the engine.
    this.microEmotions = normaliseMicroEmotions(this.data.microEmotions);
  }

  /** One reaction's normalised config ("hype", "roast", "layerDrag"). */
  reaction(kind) {
    return this.reactions[kind] || normaliseReactions(null)[kind];
  }

  /**
   * Pick a line for a reaction, through the same `never` guard as every other line.
   * Returns "" when nothing survives — the reaction then still happens, silently.
   */
  reactionLine(kind, slots = {}, { avoid = [], random = Math.random } = {}) {
    const cfg = this.reaction(kind);
    const pool = arr(cfg.lines).map((t) => this.fill(t, { ...this.ambient(random), ...slots }));
    return this._pick(pool, avoid, random);
  }

  /** One micro-emotion's normalised config ("curious", "sleepy", …). */
  microEmotion(name) {
    return this.microEmotions.emotions[name] || normaliseMicroEmotions(null).emotions[name];
  }

  /** The tiny caption for a micro-emotion, through the same `never` guard as every line. */
  microLine(name, slots = {}, { avoid = [], random = Math.random } = {}) {
    const cfg = this.microEmotion(name);
    const pool = arr(cfg?.lines).map((t) => this.fill(t, { ...this.ambient(random), ...slots }));
    return this._pick(pool, avoid, random);
  }

  /** All templates for a bucket (never empty: falls back to a generic list). */
  bucket(name) {
    const list = arr(this.lines[name]);
    return list.length ? list : FALLBACK[name] || [];
  }

  /** True when a line is safe to put on screen. */
  guard(text) {
    if (typeof text !== "string") return false;
    const t = text.trim();
    if (!t || t.length > MAX_LINE) return false;
    const low = t.toLowerCase();
    return !this.never.some((bad) => bad && low.includes(bad));
  }

  /** Slot-fill a template: {user}, {count}, {topic}, {minutes}, {ago}, {moment}, {bits}, {months}, {viewers}, {opinion}, {joke}, {catchphrase}, {keyword}. */
  fill(template, slots = {}) {
    return String(template).replace(/\{(\w+)\}/g, (whole, key) => {
      const v = slots[key];
      return v === undefined || v === null || v === "" ? "" : String(v);
    });
  }

  /**
   * Pick a line for a bucket. `avoid` is a list of recently-said lines; a fresh one is
   * preferred. Returns "" when nothing survives the guard — the engine then stays silent,
   * which is always in character.
   */
  line(bucketName, slots = {}, { avoid = [], random = Math.random } = {}) {
    const pool = this.bucket(bucketName).map((t) => this.fill(t, { ...this.ambient(random), ...slots }));
    return this._pick(pool, avoid, random);
  }

  ambient(random = Math.random) {
    const opinion = this.opinions.length ? this.opinions[Math.floor(random() * this.opinions.length)] : "";
    const joke = this.jokes.length ? this.jokes[Math.floor(random() * this.jokes.length)].line : "";
    const catchphrase = this.catchphrases.length ? this.catchphrases[Math.floor(random() * this.catchphrases.length)] : "";
    return { opinion, joke, catchphrase, name: this.name, owner: this.owner };
  }

  _pick(pool, avoid = [], random = Math.random) {
    const clean = pool.filter((t) => this.guard(t));
    if (!clean.length) return "";
    const fresh = clean.filter((t) => !avoid.includes(t));
    const list = fresh.length ? fresh : clean;
    return list[Math.floor(random() * list.length)] || "";
  }

  /** Match a chat message against the keyword table. Returns {keyword, mood, lines} or null. */
  keywordFor(text) {
    const low = String(text || "").toLowerCase();
    if (!low) return null;
    const words = low.replace(/[^a-z0-9' ]+/g, " ").split(/\s+/);
    for (const entry of this.keywords) {
      for (const m of entry.match) {
        if (words.includes(m)) return { keyword: m, mood: entry.mood, lines: entry.lines };
      }
    }
    return null;
  }

  keywordLine(entry, { avoid = [], random = Math.random } = {}) {
    if (!entry) return "";
    return this._pick(entry.lines.map((t) => this.fill(t, { ...this.ambient(random), keyword: entry.keyword })), avoid, random);
  }

  /** A catchphrase / opinion / joke for a quiet moment. */
  musing({ avoid = [], random = Math.random } = {}) {
    const pool = [...this.catchphrases, ...this.opinions, ...this.jokes.map((j) => j.line)];
    return this._pick(pool, avoid, random);
  }

  describe() {
    return {
      name: this.name,
      owner: this.owner,
      voice: this.voice,
      buckets: Object.keys(this.lines).filter((k) => arr(this.lines[k]).length),
      opinions: this.opinions.length,
      catchphrases: this.catchphrases.length,
      jokes: this.jokes.length,
      keywords: this.keywords.map((k) => k.match).flat(),
      never: this.never.length,
      reactions: Object.fromEntries(
        Object.entries(this.reactions).map(([k, v]) => [
          k,
          { enabled: v.enabled, lines: v.lines.length, cooldownMs: v.cooldownMs, ...(v.windowMs ? { windowMs: v.windowMs, threshold: v.threshold } : {}) },
        ]),
      ),
      microEmotions: {
        enabled: this.microEmotions.enabled,
        minGapMs: this.microEmotions.minGapMs,
        maxGapMs: this.microEmotions.maxGapMs,
        maxPerMinute: this.microEmotions.maxPerMinute,
        emotions: Object.entries(this.microEmotions.emotions)
          .filter(([, v]) => v.enabled)
          .map(([k]) => k),
      },
    };
  }
}

const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

const FALLBACK = {
  greet: ["oh. people."],
  firstAfterSilence: ["and we're back."],
  newViewer: ["{user}. noted."],
  returning: ["{user}, back after {minutes}."],
  spike: ["chat's moving."],
  topic: ["{topic}. again."],
  keyword: ["hm. {keyword}."],
  silence: ["still here."],
  musing: ["{catchphrase}"],
  callback: ["{ago}: {moment}."],
  recap: ["{count} moments while you were gone."],
  showAndTell: ["look at this. I dragged it over so you have no excuse."],
  sub: ["{user}. noted."],
  gift: ["{user} gifted {count}."],
  bits: ["{bits} bits from {user}."],
  raid: ["{user} brings {viewers}."],
  ownerVoice: ["I heard that."],
  rankClimb: ["{user} moved up to {rank}."],
  weather: ["{weather} outside."],
  coldWeather: ["cold outside. still shirtless."],
  holiday: ["{holiday} on the desk."],
  lateNight: ["late shift in Lagos."],
};
