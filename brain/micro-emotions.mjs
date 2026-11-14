/* Micro-emotions — the quiet layer under the loud one.
 *
 * hype, roast and layerDrag are the loud layer: they fire on a big audience moment and
 * hold the floor for five or six seconds. That leaves the other 90% of a stream with no
 * vocabulary at all. This module is that vocabulary: eight miniature feelings that play
 * often and briefly, driven by signals the engine already receives.
 *
 * The same two rules as reactions.mjs:
 *   1. Deterministic and dependency-free. No model, no network, no awaits. Given the
 *      session memory and a random source, `step()` decides; nothing is inferred from
 *      anything the brain cannot see.
 *   2. The vocabulary is data. Weights, cooldowns, per-emotion durations and every line
 *      live in brain/crid-personality.json → microEmotions, so the owner can retune the
 *      whole layer without touching engine code.
 *
 * What lives here is WHAT a feeling is called, WHICH signal fires it, and HOW OFTEN it may
 * play. What it LOOKS like (the glyph, the pose) lives in the renderer (brain/overlay.js +
 * overlay.css), because the brain names an emotion and the overlay owns the pixels — the
 * same contract the layer drag already follows.
 */
import { MIN } from "./memory.mjs";

/** The fixed vocabulary. An emotion name must exist here to be usable at all. */
export const MICRO_NAMES = ["curious", "delighted", "smug", "flustered", "sleepy", "startled", "proud", "sulky"];

/* ---------- defaults: used when the personality file has no `microEmotions` block ---------- */

export const DEFAULT_MICRO_EMOTIONS = {
  enabled: true,
  // Pacing. While chat is live: one small feeling every 4-12s. When the stream is idle:
  // one every 45s, which is what makes quiet time feel quiet rather than animated.
  minGapMs: 4000,
  maxGapMs: 12000,
  idleGapMs: 45_000,
  maxPerMinute: 6,
  // A tiny caption beside the mark. Off leaves the visual alone, with no words at all.
  caption: true,
  signals: {
    // A configured keyword's `mood` (see `keywords` in the personality file) names the
    // micro-emotion it produces. A mood with no entry here simply does nothing.
    keywordMoods: { curious: "curious", delighted: "delighted", proud: "proud", alarmed: "startled" },
    // A big moment's quiet tail: the small reaction AFTER the loud one, never instead.
    momentEmotions: { sub: "proud", gift: "proud", bits: "delighted", raid: "startled" },
    momentLeadMs: 1500, // let the loud reaction have its moment first
    afterMomentMs: 7000,
    rateRise: { windowMs: 8000, messages: 4, users: 2 },
    rateFall: { windowMs: 8000, priorMessages: 4 },
    startleGapMs: 10_000, // the first line after this much quiet is a flinch
    sulkAfterMs: 6000, // quiet after a busy patch
    sleepAfterMs: 25_000, // properly quiet: he dozes
  },
  emotions: {
    curious: { enabled: true, weight: 3, cooldownMs: 18_000, duration: 1500, lines: ["hm?", "what's this then?", "a question. bold."] },
    delighted: { enabled: true, weight: 2, cooldownMs: 22_000, duration: 1400, lines: ["yes. noted.", "oh, that's nice.", "I'll allow it."] },
    smug: { enabled: true, weight: 2, cooldownMs: 26_000, duration: 1600, lines: ["called it.", "no notes.", "I said that. earlier."] },
    flustered: { enabled: true, weight: 2, cooldownMs: 26_000, duration: 1400, lines: ["ok. ok. ok.", "one at a time.", "steady."] },
    sleepy: { enabled: true, weight: 2, cooldownMs: 60_000, duration: 1800, lines: ["five more.", "still here.", "the menu again."] },
    startled: { enabled: true, weight: 1, cooldownMs: 24_000, duration: 1200, lines: ["what—", "I was resting.", "hm!"] },
    proud: { enabled: true, weight: 2, cooldownMs: 28_000, duration: 1600, lines: ["no notes.", "tidy.", "I made that happen. sort of."] },
    sulky: { enabled: true, weight: 1, cooldownMs: 40_000, duration: 1600, lines: ["fine.", "I'll be here.", "noted. ignored."] },
  },
};

/* ---------- config ---------- */

const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const bool = (v, fallback) => (typeof v === "boolean" ? v : fallback);

function normaliseSignals(raw, d) {
  const r = raw && typeof raw === "object" ? raw : {};
  const map = (value, fallback) => {
    const src = value && typeof value === "object" ? value : fallback;
    const out = {};
    for (const [key, emotion] of Object.entries(src)) {
      if (MICRO_NAMES.includes(String(emotion))) out[String(key).toLowerCase()] = String(emotion);
    }
    return out;
  };
  const rise = r.rateRise && typeof r.rateRise === "object" ? r.rateRise : {};
  const fall = r.rateFall && typeof r.rateFall === "object" ? r.rateFall : {};
  return {
    keywordMoods: map(r.keywordMoods, d.keywordMoods),
    momentEmotions: map(r.momentEmotions, d.momentEmotions),
    momentLeadMs: Math.max(0, num(r.momentLeadMs, d.momentLeadMs)),
    afterMomentMs: Math.max(1000, num(r.afterMomentMs, d.afterMomentMs)),
    rateRise: {
      windowMs: Math.max(1000, num(rise.windowMs, d.rateRise.windowMs)),
      messages: Math.max(2, num(rise.messages, d.rateRise.messages)),
      users: Math.max(1, num(rise.users, d.rateRise.users)),
    },
    rateFall: {
      windowMs: Math.max(1000, num(fall.windowMs, d.rateFall.windowMs)),
      priorMessages: Math.max(2, num(fall.priorMessages, d.rateFall.priorMessages)),
    },
    startleGapMs: Math.max(1000, num(r.startleGapMs, d.startleGapMs)),
    sulkAfterMs: Math.max(1000, num(r.sulkAfterMs, d.sulkAfterMs)),
    sleepAfterMs: Math.max(1000, num(r.sleepAfterMs, d.sleepAfterMs)),
  };
}

/** Fill a micro-emotions config with defaults, keeping every owner-authored value. */
export function normaliseMicroEmotions(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_MICRO_EMOTIONS;
  const out = {
    enabled: bool(data.enabled, d.enabled),
    minGapMs: Math.max(1000, num(data.minGapMs, d.minGapMs)),
    maxGapMs: Math.max(1000, num(data.maxGapMs, d.maxGapMs)),
    idleGapMs: Math.max(1000, num(data.idleGapMs, d.idleGapMs)),
    maxPerMinute: Math.max(1, num(data.maxPerMinute, d.maxPerMinute)),
    caption: bool(data.caption, d.caption),
    signals: normaliseSignals(data.signals, d.signals),
    emotions: {},
  };
  if (out.maxGapMs < out.minGapMs) out.maxGapMs = out.minGapMs;
  const list = data.emotions && typeof data.emotions === "object" ? data.emotions : {};
  for (const name of MICRO_NAMES) {
    const dd = d.emotions[name];
    const r = list[name] && typeof list[name] === "object" ? list[name] : {};
    const lines = arr(r.lines).filter((l) => typeof l === "string" && l.trim());
    out.emotions[name] = {
      enabled: bool(r.enabled, dd.enabled),
      weight: Math.max(0, num(r.weight, dd.weight)),
      cooldownMs: Math.max(0, num(r.cooldownMs, dd.cooldownMs)),
      // A micro-emotion is small by contract: never more than 2s of visible motion.
      duration: Math.min(2000, Math.max(400, num(r.duration, dd.duration))),
      lines: lines.length ? lines : dd.lines.slice(),
    };
  }
  return out;
}

/* ---------- the driver ---------- */

const truncate = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * Decides which miniature feeling (if any) plays next.
 *
 * It is handed the same session memory the engine already keeps, so every signal it uses
 * is something that really happened — a chat line, a keyword, a rate change, a moment, a
 * silence. It holds its own pacing and knows nothing about the loud layer: the engine
 * calls it only when the loud loop found nothing to do, so it can never take the floor.
 */
export class MicroEmotionDriver {
  constructor({ personality, now = Date.now, random = Math.random } = {}) {
    // personality is hot-reloaded, so read it live rather than capturing it.
    this.getPersonality = typeof personality === "function" ? personality : () => personality;
    this.now = now;
    this.random = random;
    this.reset();
  }

  reset() {
    this.nextAt = 0;
    this.fires = [];
    this.lastAt = new Map();
    this.lastEmotion = null;
    this.chatCount = 0;
    this.lastMomentId = null;
    this.last = null;
  }

  get config() {
    return this.getPersonality()?.microEmotions || normaliseMicroEmotions(null);
  }

  /**
   * One step of the quiet layer. Returns { emotion, cfg, why, line } when a feeling
   * should play now, or null. Callers emit one `micro` command for a non-null result.
   */
  step({ memory } = {}) {
    const cfg = this.config;
    if (!cfg.enabled || !memory) return null;
    const now = this.now();

    // Consume the chat signals first: a micro-emotion is ambient, never queued. If the
    // pacing gate is closed, this line of chat is simply not felt — nothing piles up.
    const fresh = this.consumeChat(memory);

    if (now < this.nextAt) return null;
    this.fires = this.fires.filter((t) => t >= now - MIN);
    if (this.fires.length >= cfg.maxPerMinute) return null;

    const usable = this.signals({ memory, cfg, now, fresh }).filter((c) => {
      const emo = cfg.emotions[c.emotion];
      if (!emo || !emo.enabled || emo.weight <= 0) return false;
      if (c.emotion === this.lastEmotion) return false; // never the same feeling twice running
      const last = this.lastAt.get(c.emotion);
      return last === undefined || now - last >= emo.cooldownMs;
    });
    if (!usable.length) return null;

    const picked = pickWeighted(usable, cfg.emotions, this.random);
    if (!picked) return null;

    // While chat is live the gap is short and jittered; once the room is properly quiet,
    // the gap stretches so idle time reads as idle rather than as a twitchy loop.
    const idle = memory.silenceMs(now) >= cfg.signals.sleepAfterMs;
    const span = Math.max(0, cfg.maxGapMs - cfg.minGapMs);
    this.nextAt = now + Math.max(1000, idle ? cfg.idleGapMs : cfg.minGapMs + this.random() * span);
    this.fires.push(now);
    this.lastAt.set(picked.emotion, now);
    this.lastEmotion = picked.emotion;
    if (picked.momentId) this.lastMomentId = picked.momentId;

    const line = cfg.caption ? this.getPersonality()?.microLine?.(picked.emotion, {}, { random: this.random }) || "" : "";
    this.last = { emotion: picked.emotion, why: picked.why, line, ts: now };
    return { emotion: picked.emotion, cfg: cfg.emotions[picked.emotion], why: picked.why, line };
  }

  /** Chat lines recorded since the last step (ring-safe: counts, not indices). */
  consumeChat(memory) {
    const total = memory.counters.messages;
    const newCount = Math.min(total - this.chatCount, memory.chat.length);
    this.chatCount = total;
    return newCount > 0 ? memory.chat.slice(memory.chat.length - newCount) : [];
  }

  /** Every signal the engine already receives, as candidate feelings. */
  signals({ memory, cfg, now, fresh }) {
    const s = cfg.signals;
    const out = [];
    const add = (emotion, why, momentId = null) => {
      if (cfg.emotions[emotion] && !out.some((c) => c.emotion === emotion)) out.push({ emotion, why, momentId });
    };

    // 1. a chat line arriving: a question, or a configured keyword.
    const newest = fresh[fresh.length - 1];
    if (newest) {
      const text = String(newest.text || "").trim();
      if (/\?\s*$/.test(text)) add("curious", `${newest.user} asked "${truncate(text, 34)}" — a question mark at the end`);
      const kw = this.getPersonality()?.keywordFor?.(text);
      const mood = kw && s.keywordMoods[kw.mood];
      if (mood) add(mood, `keyword "${kw.keyword}" in chat (mood ${kw.mood})`);
    }

    // 2. the first line after a real gap: a flinch, not a greeting. Skip when the
    // gap was sleep-length (signal 5's "sleepy" owns that beat) or an action just
    // fired — a reaction already answered, a startle on top reads as noise.
    if (fresh.length && now - memory.lastActionTs > 4000) {
      const before = memory.chat[memory.chat.length - fresh.length - 1];
      const gap = before ? fresh[0].ts - before.ts : 0;
      if (gap >= s.startleGapMs && gap < s.sleepAfterMs) add("startled", `${fresh[0].user} broke ${Math.round(gap / 1000)}s of silence`);
    }

    // 3. message rate rising (chat speeding up around him) or falling (it settled).
    const rise = s.rateRise;
    const recent = memory.chatInWindow(rise.windowMs, now);
    const prior = memory.chat.filter((c) => c.ts >= now - rise.windowMs * 2 && c.ts < now - rise.windowMs);
    const users = new Set(recent.map((c) => String(c.user).toLowerCase())).size;
    if (recent.length >= rise.messages && users >= rise.users && recent.length > prior.length) {
      add("flustered", `${recent.length} messages from ${users} people in ${Math.round(rise.windowMs / 1000)}s — chat speeding up`);
    }
    if (prior.length >= s.rateFall.priorMessages && recent.length <= 1) {
      add("smug", `chat was ${prior.length} messages busy, now ${recent.length} — it settled, as called`);
    }

    // 4. the quiet tail of a big moment: the loud reaction happened, this is the after-beat.
    // A moment is read straight out of memory while it is fresh, not consumed on sight —
    // it arrives at the same instant the loud reaction fires, and must still be felt a
    // second or two later. It is marked spent only when a feeling is actually played.
    for (const m of memory.moments) {
      const age = now - m.ts;
      if (age < s.momentLeadMs || age > s.afterMomentMs) continue;
      if (m.id === this.lastMomentId) continue;
      const emotion = s.momentEmotions[m.kind];
      if (emotion) add(emotion, `${m.kind} ${Math.round(age / 1000)}s ago — the small reaction after the big one`, m.id);
    }

    // 5. silence: sulky when a busy room empties, sleepy once it is properly quiet.
    const silence = memory.silenceMs(now);
    if (silence >= s.sleepAfterMs) {
      add("sleepy", `no chat for ${Math.round(silence / 1000)}s`);
    } else if (silence >= s.sulkAfterMs && this.wasBusy(memory)) {
      add("sulky", `the room was busy, then ${Math.round(silence / 1000)}s of nothing`);
    }

    return out;
  }

  /** Was there a busy patch in the half-minute before chat stopped? */
  wasBusy(memory, spanMs = 30_000, atLeast = 3) {
    const anchor = Math.max(memory.lastChatTs, memory.startedAt);
    return memory.chat.filter((c) => c.ts >= anchor - spanMs && c.ts <= anchor).length >= atLeast;
  }
}

function pickWeighted(list, emotions, random) {
  const total = list.reduce((n, c) => n + emotions[c.emotion].weight, 0);
  if (total <= 0) return null;
  let r = random() * total;
  for (const c of list) {
    r -= emotions[c.emotion].weight;
    if (r <= 0) return c;
  }
  return list[list.length - 1];
}
