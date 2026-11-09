/* The command bus contract (tech-notes §4/§5).
 *
 * The brain sets targets; the overlay owns timing curves. Every discrete instruction is
 * one versioned envelope:
 *   { v, seq, id, type, payload, priority, ttl, interrupt, ts, why }
 *
 * `interrupt` decides what a new command may cut off:
 *   hard — raid cards, subs: kill whatever is playing
 *   soft — quips, expressions: may replace each other
 *   none — ambient gaze / presence: never cuts anything
 *
 * The overlay is a STATELESS renderer: it takes a snapshot on connect and then applies
 * these deltas. It never decides anything and never remembers anything.
 */
export const COMMAND_VERSION = 1;

export const PRIORITY = {
  presence: 10,
  look: 15,
  micro: 20, // the quiet layer: a miniature feeling, under every loud one
  express: 25,
  gesture: 30,
  say: 40,
  memory: 45,
  effect: 50,
  move: 60, // a physical drag beats any quip or expression already playing
  card: 95,
};

const DEFAULT_INTERRUPT = {
  presence: "none",
  look: "none",
  micro: "none", // a small feeling never cuts anything, and is never cut by ambient gaze
  express: "soft",
  gesture: "soft",
  say: "soft",
  memory: "soft",
  effect: "hard",
  move: "hard",
  card: "hard",
};

export class CommandBus {
  constructor({ now = Date.now, version = COMMAND_VERSION } = {}) {
    this.now = now;
    this.version = version;
    this.seq = 0;
    this.listeners = new Set();
    this.sent = [];
  }

  /** Build a command without emitting it (used by rules to compose an action). */
  make(type, payload = {}, { priority, ttl, interrupt, why } = {}) {
    if (!PRIORITY[type]) throw new Error(`unknown command type: ${type}`);
    return {
      v: this.version,
      id: `${type}-${this.seq + 1}-${Math.random().toString(36).slice(2, 6)}`,
      seq: this.seq + 1,
      type,
      payload,
      priority: priority ?? PRIORITY[type],
      ttl: ttl ?? defaultTtl(type, payload),
      interrupt: interrupt ?? (DEFAULT_INTERRUPT[type] || "soft"),
      ts: this.now(),
      why: why || "",
    };
  }

  /** Emit a list of commands (or one). Returns the envelopes as sent. */
  emit(cmds) {
    const list = Array.isArray(cmds) ? cmds : [cmds];
    const sent = [];
    for (const cmd of list) {
      if (!cmd) continue;
      this.seq += 1;
      const type = cmd.type;
      const envelope = {
        ...cmd,
        seq: this.seq,
        v: this.version,
        priority: cmd.priority ?? PRIORITY[type],
        ttl: cmd.ttl ?? defaultTtl(type, cmd.payload),
        interrupt: cmd.interrupt ?? DEFAULT_INTERRUPT[type] ?? "soft",
        ts: cmd.ts ?? this.now(),
      };
      this.sent.push(envelope);
      if (this.sent.length > 200) this.sent.shift();
      for (const fn of this.listeners) {
        try {
          fn(envelope);
        } catch {
          /* a broken listener must never break the brain */
        }
      }
      sent.push(envelope);
    }
    return sent;
  }

  onCommand(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  snapshot() {
    return { v: this.version, seq: this.seq, commands: this.sent.slice(-12) };
  }
}

function defaultTtl(type, payload) {
  switch (type) {
    case "presence":
      return 0;
    case "look":
      return payload?.hold ?? 4000;
    case "micro":
      return payload?.duration ?? 1600;
    case "express":
      return payload?.hold ?? 5000;
    case "gesture":
      return payload?.duration ?? 2200;
    case "say":
      return payload?.duration ?? 5200;
    case "card":
      return 8000;
    case "effect":
      return 1200;
    case "move":
      return (payload?.travelMs ?? 900) + (payload?.dragMs ?? 700) + 1200;
    case "memory":
      return 12000;
    default:
      return 4000;
  }
}

/* ---------- builders: one per vocabulary entry, so rules stay readable ---------- */

export const presence = (mode, why = "") => ({ type: "presence", payload: { mode }, interrupt: "none", why });
export const look = (target, { hold = 4000, why = "" } = {}) => ({ type: "look", payload: { target, hold }, interrupt: "none", why });
export const express = (emotion, { intensity = 0.7, hold = 5000, why = "" } = {}) => ({
  type: "express",
  payload: { emotion, intensity, hold },
  interrupt: "soft",
  why,
});
export const gesture = (type, { duration = 2200, why = "" } = {}) => ({ type: "gesture", payload: { type, duration }, interrupt: "soft", why });
export const say = (text, { style = "quip", duration, why = "" } = {}) => ({
  type: "say",
  payload: { text, style, duration },
  interrupt: "soft",
  why,
});
export const card = (title, subtitle, { art = null, why = "" } = {}) => ({
  type: "card",
  payload: { title, subtitle, art },
  interrupt: "hard",
  why,
});
export const effect = (type, { intensity = 0.6, duration, why = "" } = {}) => ({
  type: "effect",
  payload: { type, intensity, duration },
  interrupt: "hard",
  why,
});
export const memory = (kind, text, { moments = [], why = "" } = {}) => ({
  type: "memory",
  payload: { kind, text, moments },
  interrupt: "soft",
  why,
});

/**
 * Crid physically relocates one of his own overlay layers.
 *
 * The brain names the layer and the side; the renderer owns the body work (walk to the
 * layer, grab it, drag it, walk back). `target` must be a name both sides agree on —
 * see LAYERS in brain/overlay.js and the contract in brain/README.md. The layer keeps
 * its rendered state (visible/hidden, contents); only its position changes.
 */
export const moveLayer = (target, to = "left", { travelMs = 900, dragMs = 700, why = "" } = {}) => ({
  type: "move",
  payload: { target: String(target || "").toLowerCase(), to, travelMs, dragMs },
  interrupt: "hard",
  why,
});

/**
 * A micro-emotion: one miniature feeling from the quiet layer.
 *
 * The brain names the emotion, its caption and how long it lasts. The renderer owns the
 * glyph and the pose (see MICRO in brain/overlay.js) — same split as the layer drag.
 * `interrupt: "none"` and the lowest visual priority mean a small feeling can never
 * displace a hype jump, a roast wince or a card: it plays underneath them or not at all.
 */
export const micro = (emotion, { line = "", duration = 1600, why = "" } = {}) => ({
  type: "micro",
  payload: { emotion, line, duration },
  interrupt: "none",
  why,
});

/** Validate an envelope — used by the overlay (defensive) and by tests. */
export function isValidCommand(cmd) {
  return (
    !!cmd &&
    typeof cmd === "object" &&
    cmd.v === COMMAND_VERSION &&
    typeof cmd.type === "string" &&
    !!PRIORITY[cmd.type] &&
    typeof cmd.payload === "object" &&
    cmd.payload !== null &&
    typeof cmd.priority === "number" &&
    typeof cmd.interrupt === "string"
  );
}
