/* The initiative loop — the organ Crid was missing.
 *
 * Deterministic by design (tech-notes §3): no model, no network, no awaits on the hot
 * path. Two ways in:
 *   handleEvent(evt) — a chat/sub/gift/bits/raid arrives; reactive rules fire in the
 *                      same synchronous call, so event → command is well under 50ms.
 *   tick()           — a timer, unprompted. This is the part that makes him feel alive:
 *                      quiet rules fire on silence, repeated topics, memory callbacks
 *                      and a "while you were gone" recap built only from real moments.
 *
 * Every action that leaves this file is one line of "why" on the console. That log is
 * how the owner judges whether it reads as a mind.
 */
import { PRIORITY, presence, look, express, gesture, say, card, effect, memory as memCmd, moveLayer, micro as microCmd } from "./commands.mjs";
import { labelFor, MIN } from "./memory.mjs";
import { matchHype, matchRoast, tallySignals, isAllowedLayer, normaliseSide } from "./reactions.mjs";
import { MicroEmotionDriver } from "./micro-emotions.mjs";

export const DEFAULT_TIMINGS = {
  firstMessageSilenceMs: 60_000, // first message after this much quiet gets a greeting
  longSilenceMs: 120_000, // unprompted "still here" after this
  musingMs: 45_000, // quiet enough to volunteer an opinion
  recapLullMs: 180_000, // "while you were gone" only after a real lull
  callbackAgeMs: 180_000, // don't cite a moment from 20 seconds ago as a memory
  spikeWindowMs: 10_000,
  spikeThreshold: 7,
  spikeUsers: 3,
  topicWindowMs: 90_000,
  topicUsers: 3,
  returningGapMs: 300_000,
  minActionGapMs: 2000, // global anti-spam floor
  maxActionsPerMinute: 7,
  cooldownScale: 1, // demo pacing only; never lowered in a live run
};

const GAP_BY_PRIORITY = [
  [90, 1200],
  [70, 3500],
  [45, 6000],
  [0, 11000],
];

export class InitiativeEngine {
  constructor({ memory, personality, bus, now = Date.now, log = console.log, timings = {}, random = Math.random, onAction = null } = {}) {
    this.memory = memory;
    this.personality = personality;
    this.bus = bus;
    this.now = now;
    this.log = log;
    this.random = random;
    this.onAction = onAction;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.lastFired = new Map();
    this.ruleFires = new Map();
    this.lastActionAt = 0;
    this.actionTimes = [];
    this.timer = null;
    this.tickMs = 500;
    this.seq = 0;
    this.decisions = [];
    this.verbose = false;
    // The quiet layer. It reads the same session memory the loud rules do, but it is not
    // a rule: it gets the floor only when the loud loop decided nothing (see tick()).
    this.micro = new MicroEmotionDriver({ personality: () => this.personality, now: this.now, random: this.random });
    this.lastThoughtAt = 0;
    this.thoughtGapMs = 25_000;
  }

  /* ---------- public ---------- */

  handleEvent(evt) {
    if (!evt) return null;
    this.record(evt);
    const candidates = [];
    for (const rule of REACTIVE_RULES) {
      const c = this.safeRun(rule, evt);
      if (c) candidates.push(c);
    }
    return this.decide(candidates, { source: "event", event: evt });
  }

  /** The unprompted tick. */
  tick() {
    const candidates = [];
    for (const rule of QUIET_RULES) {
      const c = this.safeRun(rule, null);
      if (c) candidates.push(c);
    }
    const winner = this.decide(candidates, { source: "tick" });
    // The quiet layer is not a fallback for an empty tick — it is an ambient layer with its
    // own pacing (micro-emotions.mjs: gap, idle gap, per-minute ceiling, never-repeat). Gating
    // it on `!winner` starved it completely: on a quiet stream a quiet rule is eligible almost
    // every tick, so the eight feelings could never play. It still cannot displace anything —
    // it is not an action, spends no budget and interrupts nothing.
    this.microEmotion();
    if (!winner) this.think();
    return winner;
  }

  start() {
    if (this.timer) return this;
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        this.log(`[brain] tick failed: ${err.message}`);
      }
    }, this.tickMs);
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /* ---------- internals ---------- */

  record(evt) {
    const ts = evt.ts ?? this.now();
    const e = { ...evt, ts };
    // Owner voice (Gist transcripts) enters the same brain as chat: topics and a
    // moment, but never a viewer counter. Rules see it as e.type === "voice".
    if (e.type === "voice") {
      const text = String(e.text || "").trim();
      if (!text) return;
      this.memory._touchTopics(text, this.personality.owner || "owner", ts);
      this.memory.addMoment({ ts, kind: "voice", label: `${this.personality.owner || "owner"} said: "${truncate(text, 48)}"`, user: this.personality.owner || "owner" });
      return;
    }
    // World telemetry (weather, holiday) — real feed only, stored not reacted to here.
    if (e.type === "environment") {
      const w = this.memory.setWorld({ weather: e.weather, tempC: e.tempC, holiday: e.holiday }, ts);
      if (w.weather) {
        this.memory.addThought({ ts, kind: "world", text: `Lagos outside: ${w.weather}${w.tempC != null ? ` (${w.tempC}°C)` : ""}` });
      }
      return;
    }
    if (e.type === "chat") {
      // snapshot who they were before this message, so gap rules can measure the gap
      const prior = this.memory.user(e.user);
      evt.prior = prior ? { name: prior.name, first: prior.first, last: prior.last, count: prior.count } : null;
      this.memory.recordChat(e);
    } else {
      // notable events become moments — the honest record — and carry their id
      // so the action Crid takes can be tied back to the moment it belongs to.
      const moment = this.memory.recordNotable(e);
      evt.momentId = moment.id;
    }
  }

  safeRun(rule, evt) {
    try {
      return rule.test(this.ctx(evt), rule);
    } catch (err) {
      this.log(`[brain] rule ${rule.id} failed: ${err.message}`);
      return null;
    }
  }

  ctx(evt) {
    return {
      now: this.now(),
      evt,
      memory: this.memory,
      personality: this.personality,
      timings: this.timings,
      random: this.random,
      engine: this,
    };
  }

  cooldownLeft(ruleId, now) {
    const last = this.lastFired.get(ruleId);
    if (last === undefined) return 0;
    const rule = RULE_INDEX.get(ruleId);
    // A rule may take its cooldown from the personality file (owner-authored pacing),
    // so the number lives with the vocabulary rather than in this file.
    const raw = typeof rule?.cooldownMs === "function" ? rule.cooldownMs({ personality: this.personality, timings: this.timings }) : rule?.cooldownMs ?? 0;
    const cd = Math.max(0, Number(raw) || 0) * (this.timings.cooldownScale ?? 1);
    return Math.max(0, last + cd - now);
  }

  /** Per-rule ceiling, also configurable per rule (reactions carry their own). */
  ruleRateLimited(rule, now) {
    const cap = typeof rule?.maxPerMinute === "function" ? rule.maxPerMinute({ personality: this.personality, timings: this.timings }) : rule?.maxPerMinute;
    if (!cap) return false;
    const cutoff = now - MIN;
    const times = (this.ruleFires.get(rule.id) || []).filter((t) => t >= cutoff);
    this.ruleFires.set(rule.id, times);
    return times.length >= cap;
  }

  gapLeft(priority, now) {
    const gap = GAP_BY_PRIORITY.find(([p]) => priority >= p)?.[1] ?? 0;
    const floor = Math.max(gap, this.timings.minActionGapMs);
    return Math.max(0, this.lastActionAt + floor - now);
  }

  rateLimited(now) {
    const cutoff = now - MIN;
    this.actionTimes = this.actionTimes.filter((t) => t >= cutoff);
    return this.actionTimes.length >= this.timings.maxActionsPerMinute;
  }

  decide(candidates, { source, event } = {}) {
    const now = this.now();
    if (!candidates.length) return null;
    const eligible = [];
    for (const c of candidates) {
      const cd = this.cooldownLeft(c.rule, now);
      if (cd > 0) {
        this.trace(`· ${c.rule} held — cooldown ${Math.ceil(cd / 1000)}s`);
        continue;
      }
      const gap = this.gapLeft(c.priority, now);
      if (gap > 0 && c.priority < 90) {
        this.trace(`· ${c.rule} held — too soon (${Math.ceil(gap / 1000)}s)`);
        continue;
      }
      if (this.rateLimited(now) && c.priority < 90) {
        this.trace(`· ${c.rule} held — rate limit (${this.timings.maxActionsPerMinute}/min)`);
        continue;
      }
      if (this.ruleRateLimited(RULE_INDEX.get(c.rule), now)) {
        this.trace(`· ${c.rule} held — its own ceiling for this minute`);
        continue;
      }
      eligible.push(c);
    }
    if (!eligible.length) return null;
    eligible.sort((a, b) => b.priority - a.priority);
    const winner = eligible[0];
    this.fire(winner, now, source, event);
    return winner;
  }

  fire(c, now, source, event) {
    const built = c.commands.filter(Boolean);
    const envelopes = this.bus.emit(built);
    this.lastFired.set(c.rule, now);
    this.lastActionAt = now;
    this.actionTimes.push(now);
    this.ruleFires.set(c.rule, [...(this.ruleFires.get(c.rule) || []), now]);
    // Memory is written after the emit, so it never delays a reaction (tech-notes §5),
    // and only for the action that actually happened — not for every rule that was considered.
    const moment = c.moment ? this.memory.addMoment({ ts: now, ...c.moment }) : null;
    const sayCmd = envelopes.find((e) => e.type === "say");
    const action = this.memory.recordAction({
      ts: now,
      rule: c.rule,
      why: c.why,
      say: sayCmd ? sayCmd.payload.text : null,
      momentId: c.momentId || moment?.id || null,
      summary: c.summary || c.rule,
    });
    this.decisions.push({ ts: now, rule: c.rule, priority: c.priority, why: c.why, source, say: action.say });
    if (this.decisions.length > 60) this.decisions.shift();
    this.logDecision(c, envelopes, now, source);
    this.onAction?.(action, envelopes, event);
  }

  /**
   * One miniature feeling from the quiet layer.
   *
   * It emits through the same bus and logs the same "why", but it is deliberately not an
   * action: it does not move the global gap, spend the per-minute ceiling or write to the
   * moment record. A small feeling is not a moment, and it must never cost the loud layer
   * its turn — so `tick()` still reports "nothing fired" when only this happened.
   */
  microEmotion() {
    const cand = this.micro.step({ memory: this.memory });
    if (!cand) return null;
    const now = this.now();
    const envelopes = this.bus.emit([microCmd(cand.emotion, { line: cand.line, duration: cand.cfg.duration, why: cand.why })]);
    const action = { ts: now, rule: `micro-emotion:${cand.emotion}`, why: cand.why, say: null, momentId: null, summary: `micro:${cand.emotion}`, priority: PRIORITY.micro };
    this.log(`${clock(now)} ▲ ${action.rule} · p${PRIORITY.micro} · quiet — why: ${cand.why}`);
    this.log(`${" ".repeat(9)}└ ${envelopes.map(describeCommand).join(" · ")}`);
    this.onAction?.(action, envelopes, null);
    return cand;
  }

  /** Quiet inner monologue: on a tick that fired nothing loud, Crid may still
   *  have a thought. Thoughts are memory, not actions — no budget spent. */
  think() {
    const now = this.now();
    if (now - this.lastThoughtAt < this.thoughtGapMs) return null;
    const clk = this.memory.lagosClock(now);
    const w = this.memory.world;
    const topic = this.memory.repeatedTopic({ ts: now });
    let text = "";
    let kind = "observation";

    if (w.weather && now - w.updatedAt < 3600_000 && this.random() < 0.35) {
      kind = "weather";
      text = w.weather.includes("rain") || w.weather.includes("storm")
        ? "raining in Lagos. good day to stay on the desk."
        : `${w.weather} outside${w.tempC != null ? `, ${w.tempC}°C` : ""}. desk stays dry.`;
    } else if (topic && this.random() < 0.4) {
      kind = "topic";
      text = `chat is stuck on "${topic.word}" again.`;
    } else if (clk.isChristmas || w.holiday) {
      kind = "season";
      text = `${w.holiday || "Christmas"} on the calendar. still on shift.`;
    } else if (clk.period === "late-night") {
      kind = "clock";
      text = "past midnight in Lagos. chat should be asleep.";
    } else {
      text = this.personality.musing({ avoid: this.memory.recentThoughts(8).map((x) => x.text), random: this.random });
    }

    if (!text) return null;
    this.lastThoughtAt = now;
    const thought = this.memory.addThought({ ts: now, kind, text });
    if (thought) this.trace(`· thought (${kind}): "${thought.text}"`);
    return thought;
  }

  logDecision(c, envelopes, now, source) {
    const stamp = clock(now);
    const head = `${stamp} ▲ ${c.rule} · p${c.priority}${source === "tick" ? " · unprompted" : ""} — why: ${c.why}`;
    const parts = envelopes.map(describeCommand);
    this.log(head);
    this.log(`${" ".repeat(9)}└ ${parts.join(" · ")}`);
  }

  trace(line) {
    if (this.verbose) this.log(`${" ".repeat(9)}${line}`);
  }
}

export function describeCommand(cmd) {
  switch (cmd.type) {
    case "say":
      return `say:"${cmd.payload.text}" (${cmd.payload.style})`;
    case "express":
      return `express:${cmd.payload.emotion}`;
    case "gesture":
      return `gesture:${cmd.payload.type}`;
    case "look":
      return `look:${cmd.payload.target}`;
    case "micro":
      return `micro:${cmd.payload.emotion}`;
    case "presence":
      return `presence:${cmd.payload.mode}`;
    case "card":
      return `card:"${cmd.payload.title}"|"${cmd.payload.subtitle || ""}"`;
    case "effect":
      return `effect:${cmd.payload.type}`;
    case "move":
      return `move:${cmd.payload.target}→${cmd.payload.to}`;
    case "memory":
      return `memory:${cmd.payload.kind}:"${cmd.payload.text}"`;
    default:
      return cmd.type;
  }
}

export function clock(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

const fmtSecs = (ms) => `${Math.round(ms / 1000)}s`;
const fmtMins = (ms) => `${Math.max(1, Math.round(ms / MIN))} min`;

function say1(ctx, bucket, slots, extra = {}) {
  const text = ctx.personality.line(bucket, slots, { avoid: ctx.memory.recentSayings(), random: ctx.random });
  return text ? say(text, extra) : null;
}

/* ---------- reactive rules: something happened, react now ---------- */

export const REACTIVE_RULES = [
  {
    /* The owner's own vocabulary: a layer is in the way, so Crid goes to it and moves it.
     * The input is an explicit, normalised `layer` event — the desk says "this layer is
     * obstructing", the brain never guesses from geometry it cannot see. */
    id: "layer-obstructed",
    priority: 92,
    cooldownMs: (ctx) => ctx.personality.reaction("layerDrag").cooldownMs,
    maxPerMinute: (ctx) => ctx.personality.reaction("layerDrag").maxPerMinute,
    test(ctx, rule) {
      const cfg = ctx.personality.reaction("layerDrag");
      if (!cfg.enabled) return null;
      const e = ctx.evt;
      if (!e || e.type !== "layer") return null;
      if (!isAllowedLayer(e.layer, cfg)) return null;
      const target = String(e.layer).toLowerCase().trim();
      const side = normaliseSide(e.side, cfg);
      const line = ctx.personality.reactionLine("layerDrag", { layer: target }, { avoid: ctx.memory.recentSayings(), random: ctx.random });
      return {
        rule: rule.id,
        priority: rule.priority,
        moment: { kind: "layer", label: `Crid dragged "${target}" out of the way` },
        why: `"${target}" is blocking the moment (signalled by ${e.source || "desk"}) — going to it and moving it ${side}`,
        commands: [
          presence("engaged"),
          moveLayer(target, side, { travelMs: cfg.travelMs, dragMs: cfg.dragMs, why: `layer ${target} obstructing` }),
          line ? say(line, { style: cfg.style, duration: cfg.duration }) : null,
        ],
      };
    },
  },
  {
    /* W / Ws / www / 1 / 1s — chat calling the play. Standalone tokens only. */
    id: "chat-hype",
    priority: 88,
    cooldownMs: (ctx) => ctx.personality.reaction("hype").cooldownMs,
    maxPerMinute: (ctx) => ctx.personality.reaction("hype").maxPerMinute,
    test(ctx, rule) {
      const cfg = ctx.personality.reaction("hype");
      if (!cfg.enabled) return null;
      const e = ctx.evt;
      if (!e || e.type !== "chat") return null;
      const hit = matchHype(e.text, cfg);
      if (!hit) return null; // this message is not a hype token at all
      const window = ctx.memory.chatInWindow(cfg.windowMs, e.ts);
      const tally = tallySignals(window, cfg, "hype");
      if (tally.weight < cfg.threshold) return null;
      if (tally.users.length < cfg.minUsers) return null;
      const spanS = Math.max(1, Math.round((window[window.length - 1].ts - window[0].ts) / 1000));
      const line = ctx.personality.reactionLine("hype", { count: tally.count, users: tally.users.length, user: e.user, token: hit.token }, { avoid: ctx.memory.recentSayings(), random: ctx.random });
      return {
        rule: rule.id,
        priority: rule.priority,
        moment: { kind: "hype", label: `${tally.count} hype messages from ${tally.users.length} people ("${e.text.trim().slice(0, 24)}")` },
        why: `${tally.count} hype messages from ${tally.users.length} people in ${spanS}s — "${truncate(e.text, 24)}" is a win signal`,
        commands: [
          presence(cfg.presence),
          express(cfg.emotion, { intensity: 1 }),
          gesture(cfg.gesture),
          effect(cfg.effect.type, { intensity: cfg.effect.intensity, duration: cfg.effect.duration }),
          line ? say(line, { style: cfg.style, duration: cfg.duration }) : null,
        ],
      };
    },
  },
  {
    /* L / Ls, or a configured roast term — the unmistakable sad one. */
    id: "chat-roast",
    priority: 84,
    cooldownMs: (ctx) => ctx.personality.reaction("roast").cooldownMs,
    maxPerMinute: (ctx) => ctx.personality.reaction("roast").maxPerMinute,
    test(ctx, rule) {
      const cfg = ctx.personality.reaction("roast");
      if (!cfg.enabled) return null;
      const e = ctx.evt;
      if (!e || e.type !== "chat") return null;
      const hit = matchRoast(e.text, cfg);
      if (!hit) return null;
      const window = ctx.memory.chatInWindow(cfg.windowMs, e.ts);
      const tally = tallySignals(window, cfg, "roast");
      if (tally.weight < cfg.threshold) return null;
      if (tally.users.length < cfg.minUsers) return null;
      const spanS = Math.max(1, Math.round((window[window.length - 1].ts - window[0].ts) / 1000));
      const what = hit.via === "term" ? `roast term "${hit.term}"` : `${tally.count}× L from chat`;
      const line = ctx.personality.reactionLine("roast", { count: tally.count, users: tally.users.length, user: e.user, token: hit.token || hit.term }, { avoid: ctx.memory.recentSayings(), random: ctx.random });
      return {
        rule: rule.id,
        priority: rule.priority,
        moment: { kind: "roast", label: `${what} in ${spanS}s` },
        why: `${what} in ${spanS}s (${tally.users.length} people) — visibly sad, tears on`,
        commands: [
          presence("engaged"),
          express(cfg.emotion, { intensity: 1 }),
          gesture(cfg.gesture),
          effect(cfg.effect.type, { intensity: cfg.effect.intensity, duration: cfg.effect.duration }),
          line ? say(line, { style: cfg.style, duration: cfg.duration }) : null,
        ],
      };
    },
  },
  {
    id: "raid",
    priority: 96,
    cooldownMs: 0,
    test(ctx, rule) {
      const e = ctx.evt;
      if (!e || e.type !== "raid") return null;
      const viewers = e.viewers || e.amount || 0;
      const n = ctx.memory.counters.raids;
      const line = say1(ctx, "raid", { user: e.user, viewers }, { style: "hype", duration: 6000 });
      return {
        rule: rule.id,
        priority: rule.priority,
        why: `raid from ${e.user} with ${viewers} viewers · raid #${n} this session`,
        momentId: ctx.evt.momentId || null,
        commands: [
          presence("hype"),
          effect("flash", { intensity: 0.9 }),
          card(e.user, `${viewers} raiders`, { art: "raid" }),
          express("excited", { intensity: 1 }),
          gesture("double-take"),
          line,
        ],
      };
    },
  },
  {
    id: "sub",
    priority: 94,
    cooldownMs: 0,
    test(ctx, rule) {
      const e = ctx.evt;
      if (!e || e.type !== "sub") return null;
      const months = e.months || 1;
      const subs = ctx.memory.counters.subs;
      const line = say1(ctx, "sub", { user: e.user, months, count: subs }, { style: "callout", duration: 6000 });
      return {
        rule: rule.id,
        priority: rule.priority,
        why: `${e.detail || "new sub"} from ${e.user} · ${subs}${ordinal(subs)} sub this session`,
        momentId: ctx.evt.momentId || null,
        commands: [
          card(e.user, months > 1 ? `+${months} months` : "new sub", { art: "sub" }),
          express("pleased", { intensity: 1 }),
          gesture("cheer"),
          effect("flash", { intensity: 0.5 }),
          line,
        ],
      };
    },
  },
  {
    id: "gift",
    priority: 90,
    cooldownMs: 3000,
    test(ctx, rule) {
      const e = ctx.evt;
      if (!e || e.type !== "gift") return null;
      const count = e.amount || 1;
      const line = say1(ctx, "gift", { user: e.user, count }, { style: "callout", duration: 6000 });
      return {
        rule: rule.id,
        priority: rule.priority,
        why: `${count} gifted sub${count === 1 ? "" : "s"} from ${e.user} · ${ctx.memory.counters.gifts} gifted total`,
        momentId: ctx.evt.momentId || null,
        commands: [
          card(e.user, `gifted ×${count}`, { art: "gift" }),
          express("delighted", { intensity: 1 }),
          gesture("nod"),
          line,
        ],
      };
    },
  },
  {
    id: "bits",
    priority: 86,
    cooldownMs: 4000,
    test(ctx, rule) {
      const e = ctx.evt;
      if (!e || e.type !== "bits") return null;
      const bits = e.amount || 0;
      const line = say1(ctx, "bits", { user: e.user, bits }, { style: "hype", duration: 5000 });
      return {
        rule: rule.id,
        priority: rule.priority,
        why: `${bits} bits from ${e.user} · ${ctx.memory.counters.bits} bits tonight`,
        momentId: ctx.evt.momentId || null,
        commands: [express("excited", { intensity: 0.9 }), gesture("hop"), effect("particles", { intensity: 0.5 }), line],
      };
    },
  },
  {
    id: "chat-spike",
    priority: 80,
    cooldownMs: 45_000,
    test(ctx, rule) {
      const e = ctx.evt;
      if (!e || (e.type !== "chat" && e.type !== "bits")) return null;
      const { spikeWindowMs, spikeThreshold, spikeUsers } = ctx.timings;
      const window = ctx.memory.chatInWindow(spikeWindowMs);
      if (window.length < spikeThreshold) return null;
      const users = new Set(window.map((c) => c.user.toLowerCase())).size;
      if (users < spikeUsers) return null;
      const topic = ctx.memory.repeatedTopic({ windowMs: spikeWindowMs, minUsers: 2 })?.word;
      const spanS = Math.max(1, Math.round((window[window.length - 1].ts - window[0].ts) / 1000));
      const line = say1(ctx, "spike", { count: window.length, users, topic }, { style: "hype", duration: 5500 });
      return {
        rule: rule.id,
        priority: rule.priority,
        moment: { kind: "spike", label: `${window.length} messages in ${spanS}s${topic ? ` about "${topic}"` : ""}` },
        why: `${window.length} messages in ${spanS}s from ${users} people${topic ? ` · about "${topic}"` : ""}`,
        commands: [presence("hype"), look("chat"), express("excited", { intensity: 0.9 }), gesture("lean-in"), line],
      };
    },
  },
  {
    id: "keyword",
    priority: 62,
    cooldownMs: 25_000,
    test(ctx, rule) {
      const e = ctx.evt;
      if (!e || e.type !== "chat" || !e.text) return null;
      const hit = ctx.personality.keywordFor(e.text);
      if (!hit) return null;
      const text = ctx.personality.keywordLine(hit, { avoid: ctx.memory.recentSayings(), random: ctx.random });
      if (!text) return null;
      return {
        rule: rule.id,
        priority: rule.priority,
        why: `${e.user} said "${truncate(e.text, 40)}" → keyword "${hit.keyword}"`,
        commands: [look("chat"), express(hit.mood, { intensity: 0.7 }), say(text, { style: "dry", duration: 4200 })],
      };
    },
  },
  {
    id: "first-after-silence",
    priority: 56,
    cooldownMs: 20_000,
    test(ctx, rule) {
      const e = ctx.evt;
      if (!e || e.type !== "chat") return null;
      const t = ctx.timings;
      // Was there a real gap before this message? Look at the previous chat entry.
      const prev = ctx.memory.chat.length >= 2 ? ctx.memory.chat[ctx.memory.chat.length - 2] : null;
      if (!prev) return null;
      const gap = e.ts - prev.ts;
      if (gap < t.firstMessageSilenceMs) return null;
      const line = say1(ctx, "firstAfterSilence", { user: e.user, minutes: fmtMins(gap) }, { style: "dry", duration: 5000 });
      return {
        rule: rule.id,
        priority: rule.priority,
        why: `first message after ${fmtSecs(gap)} of silence (${e.user})`,
        commands: [presence("watching"), look("chat"), express("pleased", { intensity: 0.6 }), line],
      };
    },
  },
  {
    id: "session-open",
    priority: 50,
    cooldownMs: 0,
    test(ctx, rule) {
      const e = ctx.evt;
      if (!e || e.type !== "chat") return null;
      if (ctx.memory.counters.messages !== 1) return null;
      if (e.ts - ctx.memory.startedAt < 500) return null;
      const line = say1(ctx, "greet", { user: e.user }, { style: "callout", duration: 4800 });
      return {
        rule: rule.id,
        priority: rule.priority,
        why: `first message of the session (${e.user}) — Crid was already watching`,
        commands: [presence("watching"), look("chat"), express("pleased", { intensity: 0.7 }), gesture("nod"), line],
      };
    },
  },
  {
    id: "new-viewer",
    priority: 48,
    cooldownMs: 12_000,
    test(ctx, rule) {
      const e = ctx.evt;
      if (!e || e.type !== "chat") return null;
      if (ctx.memory.counters.messages < 4) return null; // ignore the very first messages of the night
      const u = ctx.memory.user(e.user);
      if (!u || u.count !== 1) return null;
      const line = say1(ctx, "newViewer", { user: e.user }, { style: "callout", duration: 4500 });
      return {
        rule: rule.id,
        priority: rule.priority,
        why: `first message from ${e.user} this session (${ctx.memory.seen.size} people seen)`,
        commands: [look("chat"), gesture("nod"), express("pleased", { intensity: 0.6 }), line],
      };
    },
  },
  {
    id: "returning-viewer",
    priority: 44,
    cooldownMs: 30_000,
    test(ctx, rule) {
      const e = ctx.evt;
      if (!e || e.type !== "chat") return null;
      const u = ctx.memory.user(e.user);
      const prior = ctx.evt.prior || null;
      if (!u || !prior || prior.count < 1) return null;
      const gap = e.ts - prior.last;
      if (!(gap >= ctx.timings.returningGapMs)) return null;
      const minutes = fmtMins(gap);
      const line = say1(ctx, "returning", { user: e.user, minutes }, { style: "dry", duration: 5000 });
      return {
        rule: rule.id,
        priority: rule.priority,
        why: `${e.user} back after ${minutes} (seen ${u.count}× this session)`,
        commands: [look("chat"), memCmd("returning", `${e.user} · back after ${minutes}`), express("pleased", { intensity: 0.5 }), line],
      };
    },
  },
  {
    id: "owner-voice",
    priority: 68,
    cooldownMs: 35_000,
    test(ctx, rule) {
      const e = ctx.evt;
      if (!e || e.type !== "voice" || !e.text) return null;
      const hit = ctx.personality.keywordFor(e.text);
      if (hit) {
        const text = ctx.personality.keywordLine(hit, { avoid: ctx.memory.recentSayings(), random: ctx.random });
        if (!text) return null;
        return {
          rule: rule.id,
          priority: rule.priority,
          why: `owner said "${truncate(e.text, 40)}" → keyword "${hit.keyword}"`,
          commands: [look("streamer"), express(hit.mood, { intensity: 0.8 }), say(text, { style: "dry", duration: 4800 })],
        };
      }
      const words = String(e.text).trim().split(/\s+/);
      if (words.length < 6 || ctx.memory.quietMs(ctx.now) < 20_000) return null;
      const line = say1(ctx, "ownerVoice", { user: ctx.personality.owner || "owner", quote: truncate(e.text, 36) }, { style: "dry", duration: 4800 });
      if (!line) return null;
      return {
        rule: rule.id,
        priority: rule.priority,
        why: `heard owner on mic ("${truncate(e.text, 40)}") during a quiet beat`,
        commands: [look("streamer"), gesture("nod"), line],
      };
    },
  },
  {
    id: "rank-climb",
    priority: 58,
    cooldownMs: 45_000,
    test(ctx, rule) {
      const e = ctx.evt;
      if (!e || !e.user || !["chat", "sub", "gift", "bits"].includes(e.type)) return null;
      if (ctx.memory.counters.messages < 6) return null;
      const u = ctx.memory.user(e.user);
      const r = ctx.memory.rankOf(e.user);
      if (!u || !r || r.rank > 3) return null;
      const climbed = r.prevRank && r.rank < r.prevRank && u.announcedRank !== r.rank;
      const newTop = !r.prevRank && r.rank === 1 && u.count >= 4 && u.announcedRank !== 1;
      if (!climbed && !newTop) return null;
      u.announcedRank = r.rank;
      const line = say1(ctx, "rankClimb", { user: e.user, rank: `#${r.rank}`, prev: r.prevRank ? `#${r.prevRank}` : "unranked" }, { style: "callout", duration: 5200 });
      if (!line) return null;
      return {
        rule: rule.id,
        priority: rule.priority,
        moment: { kind: "rank", label: `${e.user} climbed to #${r.rank} on the desk board` },
        why: `${e.user} moved to #${r.rank}${r.prevRank ? ` (was #${r.prevRank})` : " (new #1 today)"}`,
        commands: [look("chat"), express("pleased", { intensity: 0.8 }), gesture("point"), line],
      };
    },
  },
];

/* ---------- quiet rules: nothing happened, act anyway ---------- */

export const QUIET_RULES = [
  {
    id: "repeated-topic",
    priority: 72,
    cooldownMs: 120_000,
    test(ctx, rule) {
      const { topicWindowMs, topicUsers } = ctx.timings;
      const topic = ctx.memory.repeatedTopic({ windowMs: topicWindowMs, minUsers: topicUsers });
      if (!topic) return null;
      if (ctx.memory.silenceMs(ctx.now) > topicWindowMs) return null; // only while it is live
      const line = say1(ctx, "topic", { topic: topic.word, users: topic.users.length }, { style: "dry", duration: 5200 });
      return {
        rule: rule.id,
        priority: rule.priority,
        moment: { kind: "topic", label: `chat wouldn't drop "${topic.word}"` },
        why: `"${topic.word}" mentioned by ${topic.users.length} people in the last ${Math.round(topicWindowMs / 1000)}s`,
        commands: [look("chat"), express("thinking", { intensity: 0.7 }), memCmd("topic", `recurring: "${topic.word}"`), line],
      };
    },
  },
  {
    id: "callback",
    priority: 52,
    cooldownMs: 100_000,
    test(ctx, rule) {
      const t = ctx.timings;
      const now = ctx.now;
      const candidates = ctx.memory.moments.filter((m) => now - m.ts >= t.callbackAgeMs && !ctx.memory.momentCited(m.id));
      if (!candidates.length) return null;
      const m = candidates[candidates.length - 1];
      const ago = ctx.memory.ago(m.ts, now);
      const line = say1(ctx, "callback", { ago, moment: m.label }, { style: "dry", duration: 5500 });
      if (!line) return null;
      return {
        rule: rule.id,
        priority: rule.priority,
        why: `remembering "${m.label}" from ${ago} (moment ${m.id}, never referenced)`,
        momentId: m.id,
        commands: [look("chat"), express("thinking", { intensity: 0.6 }), memCmd("callback", `${ago}: ${m.label}`), line],
      };
    },
  },
  {
    id: "recap",
    priority: 42,
    cooldownMs: 240_000,
    test(ctx, rule) {
      const t = ctx.timings;
      const silence = ctx.memory.silenceMs(ctx.now);
      if (silence < t.recapLullMs) return null;
      // Only moments from inside the lull itself — what actually happened while chat was gone.
      const since = ctx.memory.lastChatTs || ctx.memory.startedAt;
      const moments = ctx.memory.momentsSince(since, ctx.now);
      if (moments.length < 2) return null;
      const count = moments.length;
      const line = say1(ctx, "recap", { count }, { style: "dry", duration: 6500 });
      return {
        rule: rule.id,
        priority: rule.priority,
        why: `${count} real moments during a ${fmtMins(silence)} lull — honest record, nothing invented`,
        commands: [
          memCmd("since-left", `${count} moments while you were gone`, {
            moments: moments.map((m) => ({ label: m.label, ago: ctx.memory.ago(m.ts, ctx.now) })),
          }),
          express("deadpan", { intensity: 0.8 }),
          gesture("shrug"),
          line,
        ],
      };
    },
  },
  {
    id: "long-silence",
    priority: 32,
    cooldownMs: 75_000,
    test(ctx, rule) {
      const t = ctx.timings;
      const silence = ctx.memory.silenceMs(ctx.now);
      if (silence < t.longSilenceMs) return null;
      if (ctx.memory.quietMs(ctx.now) < t.longSilenceMs) return null;
      const line = say1(ctx, "silence", { minutes: fmtMins(silence) }, { style: "dry", duration: 5000 });
      return {
        rule: rule.id,
        priority: rule.priority,
        why: `no chat for ${fmtMins(silence)} — speaking into the quiet unprompted`,
        commands: [presence("watching"), look("offscreen"), express("deadpan", { intensity: 0.6 }), gesture("shrug"), line],
      };
    },
  },
  {
    id: "musing",
    priority: 24,
    cooldownMs: 90_000,
    test(ctx, rule) {
      const t = ctx.timings;
      if (ctx.memory.quietMs(ctx.now) < t.musingMs) return null;
      if (ctx.memory.counters.actions === 0 && ctx.memory.counters.messages < 2) return null;
      const text = ctx.personality.musing({ avoid: ctx.memory.recentSayings(), random: ctx.random });
      if (!text) return null;
      return {
        rule: rule.id,
        priority: rule.priority,
        why: `${fmtSecs(ctx.memory.quietMs(ctx.now))} of nothing happening — volunteering a thought from the personality file`,
        commands: [look("offscreen"), express("thinking", { intensity: 0.5 }), say(text, { style: "quip", duration: 4800 })],
      };
    },
  },
  {
    id: "world-check",
    priority: 28,
    cooldownMs: 300_000, // at most once every 5 minutes
    test(ctx, rule) {
      const now = ctx.now;
      if (ctx.memory.quietMs(now) < ctx.timings.musingMs) return null;
      const clk = ctx.memory.lagosClock(now);
      const w = ctx.memory.world;
      const hasFreshWeather = !!(w.weather && now - w.updatedAt < 3600_000);
      const isCold = hasFreshWeather && (w.tempC != null && w.tempC <= 23 || /rain|storm|harmattan|cold|chill/.test(w.weather));
      const isHoliday = !!(clk.isChristmas || w.holiday);
      const isLate = clk.period === "late-night";
      if (!hasFreshWeather && !isHoliday && !isLate) return null;

      // Holiday and late-night are once-a-day remarks, not cooldown spam: after
      // the day's one line, only fresh weather can still get a word in.
      const dayKey = `${clk.month}-${clk.day}`;
      let bucket = isHoliday ? "holiday" : isCold ? "coldWeather" : hasFreshWeather ? "weather" : "lateNight";
      if ((bucket === "holiday" || bucket === "lateNight") && w.lastWorldDay === dayKey) {
        bucket = hasFreshWeather ? (isCold ? "coldWeather" : "weather") : null;
        if (!bucket) return null;
      }
      const line = say1(ctx, bucket, {
        weather: w.weather || "",
        temp: w.tempC != null ? `${w.tempC}°C` : "",
        holiday: w.holiday || (clk.isChristmas ? "Christmas" : ""),
      }, { style: "quip", duration: 5000 });
      if (!line) return null;
      if (bucket === "holiday" || bucket === "lateNight") w.lastWorldDay = dayKey;

      return {
        rule: rule.id,
        priority: rule.priority,
        why: `Lagos world check (${bucket}${w.weather ? `: ${w.weather}` : ""})`,
        commands: [look("offscreen"), express(isCold ? "annoyed" : "thinking", { intensity: 0.6 }), line],
      };
    },
  },
];

export const ALL_RULES = [...REACTIVE_RULES, ...QUIET_RULES];
export const RULE_INDEX = new Map(ALL_RULES.map((r) => [r.id, r]));

export function describeRules() {
  return ALL_RULES.map((r) => ({
    id: r.id,
    priority: r.priority,
    // reaction rules take their pacing from the personality file
    cooldownMs: typeof r.cooldownMs === "function" ? null : r.cooldownMs,
    cooldownFrom: typeof r.cooldownMs === "function" ? "personality" : null,
    maxPerMinute: typeof r.maxPerMinute === "function" ? "personality" : r.maxPerMinute ?? null,
    kind: REACTIVE_RULES.includes(r) ? "reactive" : "quiet",
  }));
}

function truncate(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export { labelFor, PRIORITY };
