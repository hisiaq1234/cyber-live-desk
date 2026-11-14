/* REA AUDIT — Resource / Event / Agent connection & invariant checker.
 *
 * One command answers "is everything wired, balanced and working end-to-end?" by walking
 * the live graph the brain already owns: the engine's memory, the activity ledger the desk
 * reports into, Crid's persisted `being` snapshot, the WebSocket clients, and the cue
 * vocabulary contract between brain/ and public/.
 *
 * Pure and zero-dependency: every input is injected ({ engine, bridge, wsClients,
 * activities, botSnapshot, status }), the only imports are sibling modules the brain
 * already uses, and nothing here mutates what it reads. The cue-contract check does import
 * the two vocabulary modules — the same ones tests/cue-channel.test.mjs imports — so the
 * audit proves the lists the desk actually ships, not a copy of them.
 *
 * Output: { ok, checkedAt, agents, events, resources, violations, warnings }.
 * `ok` is violations.length === 0. Warnings are real-but-expected conditions (no overlay
 * connected yet, weather feed not configured) — they never fail the audit.
 */
import { SessionMemory } from "./memory.mjs";
import { CUE_OUTCOMES } from "../api/_desk-core.mjs";

/* ---------- tuning ---------- */

// A being snapshot older than this is the same window crid-bot.js itself applies when it
// decides whether to trust a saved Crid (public/desk-assets/crid-bot.js, observe()).
export const BEING_FRESH_MS = 8 * 60 * 60 * 1000;
// Owner voice is "connected" while the last Gist transcript is this fresh; older is "idle",
// never-seen is "unseen". Gist is a human speaking — minutes, not milliseconds.
export const VOICE_CONNECTED_MS = 10 * 60 * 1000;
// An unconfirmed cue only violates while it is recent: a stale unconfirmed from hours ago
// is history, not a live broken pipe.
export const ACTIVITY_FLAG_MS = 15 * 60 * 1000;
// Lagos wall-clock sanity window for the world agent.
export const WORLD_CLOCK_MAX_AGE_MS = 10 * 60 * 1000;

const ECONOMIC_KINDS = new Set(["sub", "gift", "bits", "raid", "challenge"]);
const ADAPTERS = ["twitch", "youtube", "x", "tiktok"];

/* ---------- helpers ---------- */

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const inUnit = (v) => isNum(v) && v >= 0 && v <= 1;
const inPct = (v) => isNum(v) && v >= 0 && v <= 100;

function clientCount(wsClients) {
  if (wsClients == null) return 0;
  if (typeof wsClients === "number") return Math.max(0, wsClients | 0);
  if (typeof wsClients.size === "number") return wsClients.size;
  if (Array.isArray(wsClients)) return wsClients.length;
  return 0;
}

function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

/* ---------- the audit ---------- */

export async function auditReaConnections({
  engine,
  bridge = null,
  wsClients = 0,
  activities = null,
  botSnapshot = null,
  status = {},
  env = typeof process !== "undefined" ? process.env : {},
  now = Date.now,
  cueContract = null,
} = {}) {
  const ts = typeof now === "function" ? now() : Number(now) || Date.now();
  const violations = [];
  const warnings = [];
  const fail = (area, code, message, detail) => violations.push({ area, code, message, ...(detail !== undefined ? { detail } : {}) });
  const warn = (area, code, message, detail) => warnings.push({ area, code, message, ...(detail !== undefined ? { detail } : {}) });

  const memory = engine?.memory ?? null;
  if (!memory) fail("agents", "no-engine", "audit ran without an engine — there is no memory to audit");

  /* ================= AGENTS ================= */

  const agents = {};

  // -- crid: the body. Mode + the drives his save file last reported. --
  {
    const being = botSnapshot && botSnapshot.v === 1 ? botSnapshot : null;
    const drives = being?.drives && typeof being.drives === "object" ? being.drives : null;
    const driveReport = {};
    let drivesOk = true;
    if (drives) {
      for (const k of ["energy", "boredom", "attention"]) {
        const v = drives[k];
        driveReport[k] = v;
        if (!inPct(v)) {
          drivesOk = false;
          fail("agents", "drive-out-of-range", `crid drive "${k}" is ${JSON.stringify(v)} — expected a number in 0..100`, { drive: k, value: v });
        }
      }
    } else if (being) {
      warn("agents", "drives-missing", "being snapshot carries no drives object");
    }
    const online = botSnapshot?.on !== false; // absent means "not told otherwise"
    agents.crid = {
      status: online ? "online" : "offline",
      mode: botSnapshot?.mode ?? status?.mode ?? (engine ? "engine" : "unknown"),
      being: being ? { savedAt: being.savedAt ?? null, fresh: isNum(being.savedAt) && ts - being.savedAt <= BEING_FRESH_MS && ts - being.savedAt >= -WORLD_CLOCK_MAX_AGE_MS } : null,
      drives: drives ? driveReport : null,
      drivesOk,
    };
  }

  // -- owner: the human. Last Gist voice transcript is the heartbeat. --
  {
    const voiceMoments = memory ? memory.moments.filter((m) => m.kind === "voice") : [];
    const last = voiceMoments[voiceMoments.length - 1] || null;
    const lastTs = last ? Number(last.ts) || 0 : 0;
    const status_ = !last ? "unseen" : ts - lastTs <= VOICE_CONNECTED_MS ? "connected" : "idle";
    agents.owner = {
      status: status_,
      lastVoiceAt: lastTs || null,
      lastVoiceAgoMs: lastTs ? Math.max(0, ts - lastTs) : null,
    };
  }

  // -- audience: the room. Seen viewers + which ingest doors are actually open. --
  {
    const twitchState = status?.twitch?.state ?? null;
    const adapters = {};
    for (const p of ADAPTERS) {
      // Only Twitch has a live source in this process (brain/twitch-irc.mjs). The rest are
      // normalised by the bridge but have no adapter wired — reported honestly, never faked.
      const live = p === "twitch";
      adapters[p] = {
        ready: live && (twitchState === "connected" || status?.mode === "demo"),
        state: live ? twitchState ?? "unconfigured" : "no-adapter",
      };
    }
    agents.audience = {
      viewersSeen: memory ? memory.seen.size : 0,
      twitch: { state: twitchState ?? "unconfigured", channel: status?.channel ?? status?.twitch?.channel ?? null },
      adapters,
    };
  }

  // -- overlays: who is listening. WS client count + whether the desk's being sync is fresh. --
  {
    const n = clientCount(wsClients);
    const being = botSnapshot && botSnapshot.v === 1 ? botSnapshot : null;
    const deskSync = being
      ? { synced: isNum(being.savedAt) && Math.abs(ts - being.savedAt) <= BEING_FRESH_MS, savedAt: being.savedAt ?? null }
      : { synced: false, savedAt: null };
    agents.overlays = { clients: n, deskStateSync: deskSync };
    if (n === 0) warn("agents", "no-overlays", "no WebSocket clients connected — cues have nowhere to land");
    if (being && !deskSync.synced) warn("agents", "desk-state-stale", "being snapshot is older than the trust window — the desk may be offline", { savedAt: being.savedAt });
  }

  // -- world: Lagos clock + real telemetry only. --
  {
    let clockOk = false;
    let clock = null;
    if (memory) {
      try {
        clock = memory.lagosClock(ts);
        clockOk = isNum(clock?.hour) && clock.hour >= 0 && clock.hour <= 23;
      } catch {
        clockOk = false;
      }
    }
    if (!clockOk) fail("agents", "world-clock-invalid", "Africa/Lagos clock did not produce a valid hour — world-awareness rules are flying blind");
    const w = memory?.world ?? null;
    const weatherFresh = w && isNum(w.updatedAt) && w.weather ? ts - w.updatedAt <= WORLD_CLOCK_MAX_AGE_MS * 6 : null;
    agents.world = {
      tz: w?.tz ?? "Africa/Lagos",
      clock,
      weather: w?.weather ?? null,
      tempC: w?.tempC ?? null,
      holiday: w?.holiday ?? null,
      telemetryAt: w?.updatedAt || null,
      telemetryFresh: weatherFresh,
    };
    if (w && !w.weather) warn("agents", "weather-unset", "no weather telemetry yet — world rules run without it (never fabricated)");
  }

  /* ================= EVENTS ================= */

  const events = { activities: [], reciprocity: { economicMoments: 0, checked: 0, violations: 0 } };
  const overlaysConnected = clientCount(wsClients) > 0;

  // -- cue confirmation duality: what was emitted vs. how the desk settled it --
  for (const a of asArray(activities)) {
    if (!a || typeof a !== "object") {
      fail("events", "activity-malformed", "an activity entry is not an object", a);
      continue;
    }
    const stamp = Number(a.stamp);
    const name = String(a.name ?? "");
    const outcome = a.outcome ?? null;
    const confirmed = a.confirmed === true;
    const endedAt = Number(a.endedAt ?? a.startedAt ?? 0);
    const recent = isNum(endedAt) && ts - endedAt <= ACTIVITY_FLAG_MS;

    if (!isNum(stamp)) fail("events", "activity-no-stamp", `activity "${name || "?"}" has no numeric stamp — the desk can never confirm it`);
    if (outcome != null && ![...CUE_OUTCOMES, "unconfirmed"].includes(outcome)) {
      fail("events", "activity-bad-outcome", `activity "${name}" settled with unknown outcome ${JSON.stringify(outcome)}`, { outcome });
    }
    if (confirmed && !(CUE_OUTCOMES.includes(outcome))) {
      fail("events", "activity-confirmed-unsettled", `activity "${name}" is marked confirmed but its outcome ${JSON.stringify(outcome)} is not a real settlement`, { outcome });
    }
    if (outcome === "unconfirmed" && overlaysConnected && recent) {
      fail("events", "cue-unconfirmed", `cue "${name}" timed out unconfirmed while an overlay client is connected — the desk saw it and never reported back`, {
        stamp, endedAt, clients: clientCount(wsClients),
      });
    }
    events.activities.push({
      stamp: isNum(stamp) ? stamp : null,
      name,
      outcome,
      confirmed,
      endedAt: isNum(endedAt) ? endedAt : null,
      recent,
    });
  }

  // -- support & challenge reciprocity: economic moments must have moved a score --
  if (memory) {
    for (const m of memory.moments) {
      if (!ECONOMIC_KINDS.has(m.kind)) continue;
      events.reciprocity.economicMoments += 1;
      const user = m.user ? memory.user(m.user) : null;
      if (!user) {
        fail("events", "economic-event-dropped", `a ${m.kind} moment has no viewer record — support vanished between event and memory`, { moment: m.id, kind: m.kind, user: m.user ?? null });
        events.reciprocity.violations += 1;
        continue;
      }
      events.reciprocity.checked += 1;
      if (!isNum(user.score) || user.score <= 0) {
        fail("events", "economic-event-no-score", `${m.kind} moment for "${m.user}" produced no score — the leaderboard never saw it`, { moment: m.id, kind: m.kind, user: m.user, score: user.score });
        events.reciprocity.violations += 1;
      }
    }
    for (const [key, v] of Object.entries(memory.counters || {})) {
      if (!isNum(v) || v < 0) {
        fail("events", "counter-corrupt", `memory counter "${key}" is ${JSON.stringify(v)} — counters must be finite and non-negative`);
      }
    }
  }

  /* ================= RESOURCES ================= */

  const resources = {};

  // -- community leaderboard: monotonic ranks, non-negative scores, clean round-trip --
  {
    const board = memory ? memory.leaderboard(200) : [];
    let boardOk = true;
    for (let i = 0; i < board.length; i++) {
      const r = board[i];
      if (r.rank !== i + 1) {
        boardOk = false;
        fail("resources", "leaderboard-rank-gap", `leaderboard rank ${r.rank} at position ${i + 1} — ranks must be strictly 1..N`, { name: r.name, rank: r.rank, position: i + 1 });
      }
      if (!isNum(r.score) || r.score < 0) {
        boardOk = false;
        fail("resources", "leaderboard-negative-score", `leaderboard entry "${r.name}" has score ${JSON.stringify(r.score)}`, { name: r.name, score: r.score });
      }
    }
    // Conservation inside `seen` itself — the board only shows score>0, so check the store.
    if (memory) {
      for (const [key, u] of memory.seen) {
        if (!isNum(u.score) || u.score < 0) {
          boardOk = false;
          fail("resources", "seen-negative-score", `viewer "${u.name}" carries score ${JSON.stringify(u.score)}`, { user: u.name, score: u.score });
        }
      }
    }
    // exportState → importState round-trip on a scratch memory: proves the durable shape restores.
    let roundTrip = { ok: false, users: 0, priorRanks: 0 };
    if (memory) {
      try {
        const snap = memory.exportState(ts);
        const scratch = new SessionMemory({ now: () => ts });
        const imported = scratch.importState(snap);
        roundTrip = {
          ok: imported === true && scratch.seen.size === (snap.users?.length ?? -1),
          users: scratch.seen.size,
          exported: snap.users?.length ?? 0,
          priorRanks: scratch.priorRanks.size,
        };
        if (!roundTrip.ok) {
          boardOk = false;
          fail("resources", "leaderboard-roundtrip", "exportState/importState did not restore the community board cleanly", roundTrip);
        }
      } catch (err) {
        boardOk = false;
        fail("resources", "leaderboard-roundtrip", `exportState/importState threw: ${err.message}`);
      }
    }
    resources.leaderboard = { entries: board.length, ok: boardOk, roundTrip };
  }

  // -- backpack conservation: worn XOR dropped-at-normalized-spot; drives bounded --
  {
    const being = botSnapshot && botSnapshot.v === 1 ? botSnapshot : null;
    if (!being) {
      resources.backpack = { status: "unseen", ok: true };
      warn("resources", "being-unseen", "no being snapshot — backpack conservation cannot be checked until the desk reports in");
    } else {
      let ok = true;
      const bag = being.bag;
      const floorX = being.floorX;
      if (!bag || typeof bag !== "object") {
        ok = false;
        fail("resources", "bag-missing", "being snapshot has no bag object — the pack's state is unknown", { being: Object.keys(being) });
      } else if (bag.worn === true) {
        // Worn: the GLB carries it. Coordinates would be meaningless — ignored, not flagged.
      } else if (bag.worn === false) {
        if (!inUnit(bag.x) || !inUnit(bag.y)) {
          ok = false;
          fail("resources", "bag-unphysical", `dropped bag has coordinates x=${JSON.stringify(bag.x)} y=${JSON.stringify(bag.y)} — dropped props live in normalized 0..1 viewport space`, { x: bag.x, y: bag.y });
        }
      } else {
        ok = false;
        fail("resources", "bag-state-ambiguous", `bag.worn is ${JSON.stringify(bag.worn)} — must be strictly true or false`, { worn: bag.worn });
      }
      if (isNum(floorX) && !inUnit(floorX)) {
        ok = false;
        fail("resources", "floorx-out-of-bounds", `being.floorX is ${floorX} — the floor band is normalized 0..1`);
      }
      resources.backpack = { status: ok ? "conserved" : "violated", worn: bag?.worn ?? null, floorX: floorX ?? null };
    }
  }

  // -- cue vocabulary contract: CUE_NAMES (desk renderer) ≡ BOT_CUES (desk API) --
  {
    let contract = cueContract;
    if (!contract) {
      try {
        const [bot, core] = await Promise.all([
          import("../public/desk-assets/crid-bot.js"),
          import("../api/_desk-core.mjs"),
        ]);
        contract = { cueNames: bot.CUE_NAMES, botCues: core.BOT_CUES };
      } catch (err) {
        fail("resources", "cue-contract-unreadable", `could not load the cue vocabulary modules: ${err.message}`);
        contract = { cueNames: [], botCues: [] };
      }
    }
    const a = [...(contract.cueNames || [])].map(String).sort();
    const b = [...(contract.botCues || [])].map(String).sort();
    const onlyRenderer = a.filter((x) => !b.includes(x));
    const onlyApi = b.filter((x) => !a.includes(x));
    const ok = onlyRenderer.length === 0 && onlyApi.length === 0 && a.length > 0;
    if (!ok) {
      fail("resources", "cue-vocabulary-drift", "CUE_NAMES and BOT_CUES have drifted apart — the API can accept a cue the renderer drops, or vice versa", {
        onlyInRenderer: onlyRenderer, onlyInApi: onlyApi, rendererCount: a.length, apiCount: b.length,
      });
    }
    resources.cueVocabulary = { ok, rendererCount: a.length, apiCount: b.length, onlyInRenderer: onlyRenderer, onlyInApi: onlyApi };
  }

  /* ================= REPORT ================= */

  return {
    ok: violations.length === 0,
    checkedAt: ts,
    agents,
    events,
    resources,
    violations,
    warnings,
    bridge: bridge ? { attached: true } : { attached: false },
  };
}
