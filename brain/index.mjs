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
import { createDemoSource, mulberry32 } from "./demo.mjs";
import { createBrainServer } from "./server.mjs";

const DEFAULT_PORT = 7311;

/* ---------- arguments ---------- */

function parseArgs(argv) {
  const args = { demo: false, channel: null, port: DEFAULT_PORT, verbose: false, seed: null, help: false };
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
    else if (a === "--help" || a === "-h") args.help = true;
  }
  args.channel = (args.channel || process.env.CRID_CHANNEL || process.env.CRID_TWITCH_CHANNEL || "").trim().replace(/^#/, "") || null;
  return args;
}

const HELP = `
Crid's brain — local initiative loop for the Crid overlay

  npm run brain                        connect to a Twitch channel (anonymous IRC, no login)
  npm run brain -- --channel <name>    which channel to watch
  npm run brain -- --demo              synthetic chat and events, no Twitch needed
  npm run brain -- --port 7311         port for the overlay + command bus
  npm run brain -- --verbose           also log rules that were held back
  npm run brain -- --seed 42           reproducible demo

  channel can also come from the CRID_CHANNEL environment variable.

  overlay:  http://127.0.0.1:<port>/overlay        (OBS browser source, transparent)
            http://127.0.0.1:<port>/overlay?preview=1
  status:   http://127.0.0.1:<port>/              (live decision log)
  memory:   http://127.0.0.1:<port>/state
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
  const engine = new InitiativeEngine({
    memory,
    personality,
    bus,
    log,
    random,
    timings: args.demo ? DEMO_TIMINGS : {},
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
  });

  engine.onAction = (action, commands) => server.broadcastDecision({ ...action }, commands);

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

  let source = null;
  if (args.demo) {
    source = createDemoSource({ onEvent: (evt) => engine.handleEvent(evt), log, random });
    source.start();
    log("[demo] synthetic chat started — watch the overlay, or this log");
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
        onEvent: (evt) => engine.handleEvent(evt),
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
    source?.stop?.();
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
  log(`  mode        ${args.demo ? "demo (synthetic chat + events)" : `live (anonymous Twitch IRC${args.channel ? ` → #${args.channel}` : ", no channel yet"})`}`);
  log(`  overlay     http://127.0.0.1:${port}/overlay        ← OBS browser source (1920×1080, 60fps)`);
  log(`  preview     http://127.0.0.1:${port}/overlay?preview=1`);
  log(`  status      http://127.0.0.1:${port}/             (live decision log)`);
  log(`  personality ${personality.path}`);
  log(`              ${d.buckets.length} line buckets · ${d.opinions} opinions · ${d.catchphrases} catchphrases · ${d.keywords.length} keywords · ${d.never} banned phrases`);
  log(`  rules       ${describeRules().length} (${describeRules().filter((r) => r.kind === "quiet").length} unprompted)`);
  if (args.verbose) log(`  timings     ${JSON.stringify({ ...DEFAULT_TIMINGS, ...engine.timings })}`);
  log("");
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
