#!/usr/bin/env node
/* Crid's brain — the local initiative loop.
 *
 *   npm run brain                     # live: anonymous Twitch IRC, channel from --channel or CRID_CHANNEL
 *   npm run brain -- --demo           # synthetic chat + events on a timer, no Twitch needed
 *   npm run brain -- --channel dave   # point it at a channel
 *
 * Then add http://127.0.0.1:7311/overlay as an OBS browser source (1920×1080, 60fps).
 * See README.md § Crid's brain.
 */
import { existsSync, watchFile } from "node:fs";
import { CommandBus } from "./commands.mjs";
import { SessionMemory } from "./memory.mjs";
import { InitiativeEngine, DEFAULT_TIMINGS, describeRules, clock } from "./engine.mjs";
import { loadPersonality, PERSONALITY_PATH } from "./personality.mjs";
import { createTwitchIrc } from "./twitch-irc.mjs";
import { createDemoSource, createReactionDemo, mulberry32 } from "./demo.mjs";
import { createBrainServer } from "./server.mjs";
import { createLettersGame } from "./letters.mjs";
import { createCueChannel } from "./cue.mjs";
import { cueFor } from "./cue-map.mjs";
import { attachBrainBridge } from "./bridge.mjs";

const DEFAULT_PORT = 7311;

/* ---------- arguments ---------- */

function parseArgs(argv) {
  const args = { demo: false, channel: null, port: DEFAULT_PORT, verbose: false, seed: null, help: false, scenario: null, cooldownScale: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--demo" || a === "-d") args.demo = true;
    else if (a === "--channel" || a === "-c") args.channel = argv[++i] || null;
    else if (a.startsWith("--channel=")) args.channel = a.split("=")[1];
    else if (a === "--port" || a === "-p") args.port = Number(argv[++i]) || DEFAULT_PORT;
    else if (a.startsWith("--port=")) args.port = Number(a.split("=")[1]) || DEFAULT_PORT;
    else if (a === "--verbose" || a === "-v") args.verbose = true;
    else if (a === "--seed") args.seed = Number(argv[++i]) || null;
    else if (a.startsWith("--seed=")) args.seed = Number(a.split("=")[1]) || null;
    else if (a === "--scenario" || a === "-s") args.scenario = String(argv[++i] || "").toLowerCase() || null;
    else if (a.startsWith("--scenario=")) args.scenario = a.split("=")[1].toLowerCase();
    else if (a === "--cooldown-scale") args.cooldownScale = Number(argv[++i]) || null;
    else if (a.startsWith("--cooldown-scale=")) args.cooldownScale = Number(a.split("=")[1]) || null;
    else if (a === "--help" || a === "-h") args.help = true;
  }
  args.channel = (args.channel || process.env.CRID_CHANNEL || process.env.CRID_TWITCH_CHANNEL || "").trim().replace(/^#/, "") || null;
  if (args.scenario) args.demo = true; // a scenario is always synthetic
  return args;
}

const HELP = `
Crid's brain — local initiative loop for the Crid overlay

  npm run brain                        connect to a Twitch channel (anonymous IRC, no login)
  npm run brain -- --channel <name>    which channel to watch
  npm run brain -- --demo              synthetic chat and events, no Twitch needed
  npm run brain -- --demo --scenario reactions
                                       only the owner's three reactions, on a loop:
                                       Ws/1s hype, L/roast tears, drag a layer aside
  npm run brain -- --port 7311         port for the overlay + command bus
  npm run brain -- --verbose           also log rules that were held back
  npm run brain -- --seed 42           reproducible demo
  npm run brain -- --cooldown-scale 0.25
                                       demo pacing only: shrink configured cooldowns

  channel can also come from the CRID_CHANNEL environment variable.

  the quiet layer (micro-emotions) plays underneath everything above: eight miniature
  feelings, one every 4-12s while chat is live and almost never when the room is quiet.
  Tune them in crid-personality.json → microEmotions.

  overlay:  http://127.0.0.1:<port>/overlay        (OBS browser source, transparent)
            http://127.0.0.1:<port>/overlay?preview=1
  status:   http://127.0.0.1:<port>/              (live decision log)
  memory:   http://127.0.0.1:<port>/state
  events:   POST http://127.0.0.1:<port>/event    (the desk reports what happened)
`;

/* ---------- timings ---------- */

// Demo runs a compressed session so every rule is visible within a couple of minutes.
const DEMO_TIMINGS = {
  firstMessageSilenceMs: 4_000,
  longSilenceMs: 18_000,
  musingMs: 10_000,
  recapLullMs: 26_000,
  callbackAgeMs: 45_000,
  returningGapMs: 30_000,
  minActionGapMs: 1_500,
};

// The reaction scenario only has three things to show, so it gets the floor: a tighter
// global gap, a higher per-minute ceiling, and the owner's configured cooldowns scaled
// down (pacing only — the vocabulary itself is untouched).
const REACTION_TIMINGS = {
  ...DEMO_TIMINGS,
  minActionGapMs: 600,
  maxActionsPerMinute: 14,
  cooldownScale: 0.2,
};

/* ---------- main ---------- */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  const log = (line) => console.log(line);
  const random = args.seed != null ? mulberry32(args.seed) : Math.random;

  if (!existsSync(PERSONALITY_PATH)) {
    console.error(`[brain] missing personality file: ${PERSONALITY_PATH}`);
    process.exitCode = 1;
    return;
  }

  let personality = loadPersonality();
  const memory = new SessionMemory();
  const bus = new CommandBus();
  const timings = { ...(args.demo ? DEMO_TIMINGS : {}), ...(args.scenario === "reactions" ? REACTION_TIMINGS : {}) };
  if (args.cooldownScale) timings.cooldownScale = args.cooldownScale;
  const engine = new InitiativeEngine({
    memory,
    personality,
    bus,
    log,
    random,
    timings,
  });
  engine.verbose = args.verbose;

  const status = {
    mode: args.demo ? "demo" : "live",
    channel: args.demo ? null : args.channel,
    twitch: { state: args.demo ? "synthetic" : "connecting", channel: args.channel, detail: "", attempts: 0 },
    startedAt: Date.now(),
    pid: process.pid,
    personality: personality.path,
  };

  const server = createBrainServer({
    engine,
    memory,
    bus,
    personality,
    demo: args.demo,
    log,
    getStatus: () => ({ ...status, uptimeMs: Date.now() - status.startedAt }),
    // The bridge is attached below; these closures resolve it lazily so the desk's
    // /being + /ingest posts land in the same world state the overlay reads.
    ingest: (raw) => bridge?.ingest?.(raw),
    onBeing: (snap) => bridge?.setBotBeing?.(snap),
    getBeing: () => bridge?.getBotBeing?.() || null,
  });

  // The same decision also goes to the desk the stream actually shows: cueFor picks the one
  // cue this action maps to and the cue channel posts it as state.bot.cue, which the desk
  // overlay is already polling. With CRID_DESK_URL / DESK_OPERATOR_TOKEN unset the channel
  // stays off and says so once — the local overlay above is unaffected either way.
  const deskCues = createCueChannel({ log });
  engine.onAction = (action, commands) => {
    server.broadcastDecision({ ...action }, commands);
    const cue = cueFor(commands);
    if (cue) deskCues.cue(cue.name, { text: cue.text });
  };

  // World persistence + multi-platform ingest (Gist voice, weather feeds, other
  // platforms). Attached AFTER onAction is set so the save-scheduling wrapper
  // wraps the real handler, not a placeholder. State restores before the first tick.
  const bridge = attachBrainBridge(engine, { log });

  // Letters rides on the chat the brain already reads. It needs one thing nothing else in here does —
  // a way to write desk state — so it stays off, and says why once, until that is configured.
  const letters = createLettersGame({ bus, log });

  // live personality edits: the owner can pour himself in without restarting the brain
  watchFile(PERSONALITY_PATH, { interval: 1500 }, (curr, prev) => {
    if (curr.mtimeMs === prev.mtimeMs) return;
    try {
      personality = loadPersonality();
      engine.personality = personality;
      server.personality = personality;
      log(`[brain] personality reloaded from ${PERSONALITY_PATH} — ${personality.describe().buckets.length} line buckets, ${personality.opinions.length} opinions`);
    } catch (err) {
      log(`[brain] personality reload failed (keeping the old one): ${err.message}`);
    }
  });

  let port = args.port;
  let listening = false;
  for (let attempt = 0; attempt < 10 && !listening; attempt++) {
    try {
      await server.listen(port);
      listening = true;
    } catch (err) {
      if (err.code !== "EADDRINUSE") throw err;
      log(`[brain] port ${port} is busy, trying ${port + 1}`);
      port += 1;
    }
  }
  if (!listening) {
    console.error("[brain] could not find a free port");
    process.exitCode = 1;
    return;
  }

  banner({ args, personality, port, engine, log });

  engine.start();
  letters.start();

  let source = null;
  if (args.demo) {
    if (args.scenario === "reactions") {
      source = createReactionDemo({ onEvent: (evt) => { letters.onEvent(evt); engine.handleEvent(evt); }, log });
      source.start();
      log("[reactions] looping the owner's vocabulary: Ws/1s hype → L tears → drag a layer aside");
    } else {
      if (args.scenario) log(`[brain] unknown scenario "${args.scenario}" — running the full demo instead`);
      source = createDemoSource({ onEvent: (evt) => { letters.onEvent(evt); engine.handleEvent(evt); }, log, random });
      source.start();
      log("[demo] synthetic chat started — watch the overlay, or this log");
    }
  } else {
    if (!args.channel) {
      log("");
      log("[brain] no channel set. Crid needs one channel to watch:");
      log("        npm run brain -- --channel <your-twitch-name>");
      log("        (or set CRID_CHANNEL, or run `npm run brain -- --demo` to see it without Twitch)");
      log("[brain] the brain and overlay are running; ingest is idle until a channel is given.");
    } else {
      source = createTwitchIrc({
        channel: args.channel,
        onEvent: (evt) => { letters.onEvent(evt); engine.handleEvent(evt); },
        log,
        onStatus: (s) => {
          status.twitch = { state: s.state, channel: s.channel, detail: s.detail, attempts: s.attempts };
          if (s.state !== "connected") log(`[twitch] ${s.state}: ${s.detail || ""}`);
          server.broadcastStatus();
        },
      });
      source.start();
    }
  }

  heartbeat({ memory, log, status });

  const shutdown = async (sig) => {
    log(`\n[brain] ${sig} — shutting down`);
    engine.stop();
    letters.stop();
    source?.stop?.();
    bridge?.flush?.();
    watchFile(PERSONALITY_PATH, { interval: 1500 }, () => {});
    try {
      await server.close();
    } catch {
      /* already down */
    }
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

function banner({ args, personality, port, engine, log }) {
  const d = personality.describe();
  log("");
  log("  CRID — brain");
  log(`  mode        ${args.demo ? `demo (${args.scenario === "reactions" ? "reaction pack only" : "synthetic chat + events"})` : `live (anonymous Twitch IRC${args.channel ? ` → #${args.channel}` : ", no channel yet"})`}`);
  log(`  overlay     http://127.0.0.1:${port}/overlay        ← OBS browser source (1920×1080, 60fps)`);
  log(`  preview     http://127.0.0.1:${port}/overlay?preview=1`);
  log(`  status      http://127.0.0.1:${port}/             (live decision log)`);
  log(`  personality ${personality.path}`);
  log(`              ${d.buckets.length} line buckets · ${d.opinions} opinions · ${d.catchphrases} catchphrases · ${d.keywords.length} keywords · ${d.never} banned phrases`);
  log(`  rules       ${describeRules().length} (${describeRules().filter((r) => r.kind === "quiet").length} unprompted)`);
  for (const line of reactionBanner(personality)) log(`  ${line}`);
  for (const line of microBanner(personality)) log(`  ${line}`);
  if (args.verbose) log(`  timings     ${JSON.stringify({ ...DEFAULT_TIMINGS, ...engine.timings })}`);
  log("");
}

function reactionBanner(personality) {
  const h = personality.reaction("hype");
  const r = personality.reaction("roast");
  const l = personality.reaction("layerDrag");
  const on = (c) => (c.enabled ? "on " : "off");
  const secs = (ms) => `${Math.round(ms / 1000)}s`;
  return [
    `reactions   ${on(h)} hype   ${h.tokens.join("/")} · ${h.threshold} in ${secs(h.windowMs)} from ${h.minUsers}+ people · ${secs(h.cooldownMs)} cooldown`,
    `            ${on(r)} roast  ${r.tokens.join("/")}${r.terms.length ? ` + ${r.terms.length} terms` : ""} · ${r.threshold} in ${secs(r.windowMs)} · ${secs(r.cooldownMs)} cooldown · tears`,
    `            ${on(l)} layer  drag ${l.allowedLayers.join("/") || "any"} to the ${l.defaultSide} · "${l.lines[0] || ""}" · ${secs(l.cooldownMs)} cooldown`,
  ];
}

/** The quiet layer, on one line: what it is called and how often it may play. */
function microBanner(personality) {
  const m = personality.microEmotions;
  const names = Object.entries(m.emotions)
    .filter(([, v]) => v.enabled)
    .map(([k]) => k);
  const secs = (ms) => `${Math.round(ms / 1000)}s`;
  return [
    `micro       ${m.enabled ? "on " : "off"} ${names.length} feelings · ${secs(m.minGapMs)}-${secs(m.maxGapMs)} apart while chat is live · ${secs(m.idleGapMs)} when the room is quiet · max ${m.maxPerMinute}/min`,
    `            ${names.join(" · ")}`,
  ];
}

function heartbeat({ memory, log, status }) {
  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    const s = memory.summary(now);
    const lastAction = memory.lastAction();
    const ago = lastAction ? `${Math.round((now - lastAction.ts) / 1000)}s ago` : "none yet";
    log(
      `· ${clock(now)} ${Math.round((now - last) / 1000)}s · ${s.counters.messages} msgs · ${s.moments} moments · ${s.counters.actions} actions · last action ${ago}` +
        (status.twitch?.state && status.twitch.state !== "connected" && status.mode !== "demo" ? ` · twitch ${status.twitch.state}` : ""),
    );
    last = now;
  }, 60_000);
  timer.unref?.();
}

main().catch((err) => {
  console.error(`[brain] fatal: ${err.stack || err.message}`);
  process.exitCode = 1;
});
