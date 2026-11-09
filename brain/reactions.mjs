/* The owner's reaction vocabulary — the first words Crid actually understands.
 *
 * Everything here is deterministic and dependency-free: given a chat line and the config
 * from brain/crid-personality.json, decide whether it is a win signal ("W", "Ws", "www",
 * "1", "1s"), an L/roast signal, or neither. No model, no network, no state.
 *
 * The rule that keeps this honest: a signal must be a CANONICAL, STANDALONE token. The
 * whole message has to be made of hype tokens ("W", "Ws Ws", "www", "1 1"), so a message
 * that merely CONTAINS those characters is never hype:
 *
 *   "W"            → hype        "wow"            → nothing
 *   "Ws"           → hype        "water"          → nothing
 *   "www"          → hype        "www.google.com" → nothing (the token is the domain)
 *   "1" / "1s"     → hype        "1 kill left"    → nothing (not standalone)
 *   "11"           → hype        "was 1 there"    → nothing
 *   "L" / "Ls"     → roast       "lol" / "lmao"   → nothing
 *   "take the L"   → roast (configured term)     "cool" → nothing
 *
 * Thresholds, weights, windows, cooldowns and every line live in the personality file,
 * so the owner can retune the vocabulary without touching the engine.
 */

/* ---------- defaults: used when the personality file has no `reactions` block ---------- */

export const DEFAULT_REACTIONS = {
  hype: {
    enabled: true,
    windowMs: 8000,
    threshold: 3,
    minUsers: 2,
    cooldownMs: 45_000,
    maxPerMinute: 3,
    tokens: ["w", "ws", "1", "1s"],
    patterns: ["^w{2,}$", "^1+$"],
    presence: "hype",
    emotion: "hype",
    gesture: "jump",
    effect: { type: "particles", intensity: 0.8 },
    style: "hype",
    duration: 5200,
    lines: ["chat said W. I'll take it.", "Ws in chat. noted, and agreed."],
  },
  roast: {
    enabled: true,
    windowMs: 12_000,
    threshold: 2,
    termWeight: 2,
    minUsers: 1,
    cooldownMs: 60_000,
    maxPerMinute: 2,
    tokens: ["l", "ls"],
    patterns: ["^l{2,}$"],
    terms: ["take the l", "skill issue", "washed", "ratio"],
    emotion: "sad",
    gesture: "wince",
    effect: { type: "tears", intensity: 0.9, duration: 6000 },
    style: "dry",
    duration: 6000,
    lines: ["that's an L. I felt that one.", "chat called it. I'm crying about it."],
  },
  layerDrag: {
    enabled: true,
    cooldownMs: 20_000,
    maxPerMinute: 3,
    allowedLayers: ["card", "recap", "chips", "link"],
    sides: ["left", "right", "up", "down"],
    defaultSide: "left",
    travelMs: 900,
    dragMs: 700,
    style: "dry",
    duration: 6000,
    lines: ["I saw what you did there."],
  },
};

/* ---------- config ---------- */

const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const bool = (v, fallback) => (typeof v === "boolean" ? v : fallback);
const str = (v, fallback) => (typeof v === "string" && v.trim() ? v.trim() : fallback);

/** Fill a reaction config with defaults, keeping every owner-authored value. */
export function normaliseReactions(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const kind of Object.keys(DEFAULT_REACTIONS)) {
    const d = DEFAULT_REACTIONS[kind];
    const r = data[kind] && typeof data[kind] === "object" ? data[kind] : {};
    const merged = {
      ...d,
      ...r,
      enabled: bool(r.enabled, d.enabled),
      cooldownMs: Math.max(0, num(r.cooldownMs, d.cooldownMs)),
      maxPerMinute: Math.max(1, num(r.maxPerMinute, d.maxPerMinute)),
      lines: arr(r.lines).filter((l) => typeof l === "string" && l.trim()).length
        ? arr(r.lines).filter((l) => typeof l === "string" && l.trim())
        : d.lines.slice(),
    };
    if ("windowMs" in d) merged.windowMs = Math.max(1000, num(r.windowMs, d.windowMs));
    if ("threshold" in d) merged.threshold = Math.max(1, num(r.threshold, d.threshold));
    if ("minUsers" in d) merged.minUsers = Math.max(1, num(r.minUsers, d.minUsers));
    if ("termWeight" in d) merged.termWeight = Math.max(1, num(r.termWeight, d.termWeight));
    if ("tokens" in d) merged.tokens = arr(r.tokens).map((t) => String(t).toLowerCase()).filter(Boolean).length ? arr(r.tokens).map((t) => String(t).toLowerCase()).filter(Boolean) : d.tokens.slice();
    if ("patterns" in d) merged.patterns = arr(r.patterns).map(String).filter(Boolean).length ? arr(r.patterns).map(String).filter(Boolean) : d.patterns.slice();
    if ("terms" in d) merged.terms = arr(r.terms).map((t) => String(t).toLowerCase().trim()).filter(Boolean);
    if ("allowedLayers" in d) {
      const list = arr(r.allowedLayers).map((t) => String(t).toLowerCase().trim()).filter(Boolean);
      merged.allowedLayers = list.length ? list : d.allowedLayers.slice();
    }
    if ("sides" in d) merged.sides = arr(r.sides).map((t) => String(t).toLowerCase().trim()).filter(Boolean).length ? arr(r.sides).map((t) => String(t).toLowerCase().trim()).filter(Boolean) : d.sides.slice();
    if ("defaultSide" in d) merged.defaultSide = str(r.defaultSide, d.defaultSide).toLowerCase();
    if ("travelMs" in d) merged.travelMs = Math.max(0, num(r.travelMs, d.travelMs));
    if ("dragMs" in d) merged.dragMs = Math.max(0, num(r.dragMs, d.dragMs));
    if ("style" in d) merged.style = str(r.style, d.style);
    if ("duration" in d) merged.duration = Math.max(500, num(r.duration, d.duration));
    if ("presence" in d) merged.presence = str(r.presence, d.presence);
    if ("emotion" in d) merged.emotion = str(r.emotion, d.emotion);
    if ("gesture" in d) merged.gesture = str(r.gesture, d.gesture);
    if ("effect" in d) {
      const e = r.effect && typeof r.effect === "object" ? r.effect : {};
      merged.effect = {
        type: str(e.type, d.effect.type),
        intensity: Math.min(1, Math.max(0, num(e.intensity, d.effect.intensity))),
        duration: Math.max(200, num(e.duration, d.effect.duration ?? 1200)),
      };
    }
    out[kind] = merged;
  }
  return out;
}

/* ---------- tokenising ---------- */

// Leading/trailing punctuation is stripped ("W!" → "w"), inner punctuation is NOT
// ("www.google.com" must stay one token so a URL is never a W).
const EDGE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** Message → lowercase tokens. Empty/emoji-only messages produce []. */
export function tokenise(text) {
  return String(text == null ? "" : text)
    .toLowerCase()
    .normalize("NFKC")
    .split(/\s+/)
    .map((t) => t.replace(EDGE, ""))
    .filter(Boolean);
}

function matchesAny(token, tokens, patterns) {
  if (tokens.includes(token)) return true;
  return patterns.some((p) => {
    try {
      return new RegExp(p, "u").test(token);
    } catch {
      return false; // a bad pattern in the personality file must never crash the brain
    }
  });
}

/** A hype token: canonical ("w", "ws", "1", "1s") or a configured repeat ("www", "111"). */
export function isHypeToken(token, cfg) {
  return matchesAny(token, cfg.tokens, cfg.patterns);
}

export function isRoastToken(token, cfg) {
  return matchesAny(token, cfg.tokens, cfg.patterns);
}

/**
 * Hype: the WHOLE message must be made of hype tokens.
 * Returns { kind: "hype", token, count } or null.
 */
export function matchHype(text, cfg = DEFAULT_REACTIONS.hype) {
  const tokens = tokenise(text);
  if (!tokens.length) return null;
  if (!tokens.every((t) => isHypeToken(t, cfg))) return null;
  return { kind: "hype", token: tokens[0], count: tokens.length };
}

/**
 * Roast: either the whole message is canonical L tokens, or it contains a configured
 * roast term as a whole phrase/word ("take the L" matches; "relate" does not).
 * Returns { kind: "roast", via: "canonical"|"term", token|term } or null.
 */
export function matchRoast(text, cfg = DEFAULT_REACTIONS.roast) {
  const tokens = tokenise(text);
  if (!tokens.length) return null;
  if (tokens.every((t) => isRoastToken(t, cfg))) {
    return { kind: "roast", via: "canonical", token: tokens[0], count: tokens.length };
  }
  const phrase = ` ${tokens.join(" ")} `;
  for (const term of cfg.terms || []) {
    const termTokens = tokenise(term);
    if (!termTokens.length) continue;
    if (phrase.includes(` ${termTokens.join(" ")} `)) return { kind: "roast", via: "term", term };
  }
  return null;
}

/* ---------- window tallies ---------- */

/**
 * Score the recent chat against a reaction config.
 * `chatWindow` is SessionMemory.chatInWindow(...) — [{ts, user, text}].
 * Returns { count, weight, users, samples } where `count` is matching messages.
 */
export function tallySignals(chatWindow, cfg, kind) {
  const users = new Set();
  const samples = [];
  let count = 0;
  let weight = 0;
  for (const entry of arr(chatWindow)) {
    const hit = kind === "roast" ? matchRoast(entry.text, cfg) : matchHype(entry.text, cfg);
    if (!hit) continue;
    count += 1;
    weight += kind === "roast" && hit.via === "term" ? cfg.termWeight || 1 : 1;
    users.add(String(entry.user || "").toLowerCase());
    samples.push({ user: entry.user, text: entry.text, token: hit.token || hit.term, via: hit.via || "canonical" });
  }
  return { count, weight, users: [...users].filter(Boolean), samples };
}

/** Is a named overlay layer a legal drag target for this config? */
export function isAllowedLayer(layer, cfg) {
  const name = String(layer || "").toLowerCase().trim();
  if (!name) return false;
  const allowed = arr(cfg.allowedLayers).map((l) => String(l).toLowerCase());
  return allowed.length === 0 || allowed.includes(name);
}

/** Clamp a requested drag side to the configured vocabulary. */
export function normaliseSide(side, cfg) {
  const s = String(side || "").toLowerCase().trim();
  return arr(cfg.sides).map((x) => String(x).toLowerCase()).includes(s) ? s : cfg.defaultSide;
}
