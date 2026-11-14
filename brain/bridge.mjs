/* Cyber Live Desk — Multi-Platform Event Normalizer, Gist Voice Bridge & Disk Persistence.
 *
 * Ports stay open for Twitch, YouTube, X and TikTok: every platform normalizes into
 * the single event contract InitiativeEngine.handleEvent() consumes. Gist speech
 * feeds the exact same brain as `type: "voice"`, never a separate command channel.
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_STATE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), ".crid-world-state.json");

/**
 * Normalize incoming events from Twitch, YouTube, X, TikTok, Gist speech,
 * or environment telemetry into InitiativeEngine's single event shape.
 */
export function normalizeIngestEvent(raw, now = Date.now) {
  if (!raw || typeof raw !== "object") return null;
  const ts = Number.isFinite(Number(raw.ts)) ? Number(raw.ts) : now();
  const platform = String(raw.platform || "twitch").toLowerCase().trim();
  const kind = String(raw.type || raw.kind || "").toLowerCase().trim();

  // 1. Gist / owner live speech -> One Brain ("voice")
  if (kind === "voice" || kind === "gist" || kind === "transcript") {
    const text = String(raw.text || raw.transcript || "").trim();
    return text ? { type: "voice", text, platform: "gist", ts } : null;
  }

  // 2. Real environment / Lagos weather telemetry (never fabricated)
  if (kind === "environment" || kind === "weather") {
    return {
      type: "environment",
      weather: raw.weather ?? null,
      tempC: raw.tempC ?? raw.temp ?? null,
      holiday: raw.holiday ?? null,
      ts,
    };
  }

  // 3. Overlay layer obstruction signal
  if (kind === "layer") {
    const layer = String(raw.layer || "").trim();
    return layer ? { type: "layer", layer, side: raw.side || null, source: raw.source || "desk", ts } : null;
  }

  const user = String(raw.user || raw.username || raw.author || raw.displayName || "").trim();
  if (!user) return null;

  // 4. Chat message (Twitch, YouTube Live Chat, X Spaces/Stream, TikTok Live)
  if (kind === "chat" || kind === "message" || kind === "comment") {
    const text = String(raw.text || raw.message || raw.body || "").trim();
    return text ? { type: "chat", user, text, platform, ts } : null;
  }

  // 5. Subscriptions / Memberships (Twitch Sub, YouTube Member, TikTok Sub)
  if (kind === "sub" || kind === "resub" || kind === "member" || kind === "membership") {
    const months = Math.max(1, Number(raw.months || raw.tenure || 1) || 1);
    return { type: "sub", user, months, detail: raw.detail || `${platform} sub`, platform, ts };
  }

  // 6. Gifted Subs / Gifted Memberships
  if (kind === "gift" || kind === "subgift" || kind === "gift_membership") {
    const amount = Math.max(1, Number(raw.amount || raw.count || 1) || 1);
    return { type: "gift", user, amount, platform, ts };
  }

  // 7. Monetary Cheers / SuperChats / TikTok Gifts
  if (kind === "bits" || kind === "cheer" || kind === "superchat" || kind === "tiktok_gift") {
    // Normalize currency/coins into an integer bit-equivalent weight
    const amount = Math.max(1, Math.round(Number(raw.amount || raw.bits || raw.coins || 1) || 1));
    return { type: "bits", user, amount, detail: raw.text || "", platform, ts };
  }

  // 8. Raids / Incoming Redirects
  if (kind === "raid" || kind === "redirect") {
    const viewers = Math.max(1, Math.round(Number(raw.viewers || raw.amount || 1) || 1));
    return { type: "raid", user, viewers, platform, ts };
  }

  return null;
}

/**
 * Disk-backed persistence for Crid's world state (community rankings, moments,
 * and crid-bot.js `being` drive/bag snapshot). Atomic write via temp rename.
 */
export function createWorldPersistence({
  filePath = DEFAULT_STATE_PATH,
  memory,
  debounceMs = 10_000,
  log = console.log,
} = {}) {
  let timer = null;
  let botBeing = null;

  function load() {
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf8"));
      if (raw?.memory && memory?.importState) memory.importState(raw.memory);
      if (raw?.being && raw.being.v === 1) botBeing = raw.being;
      log(`[bridge] restored world state from ${filePath}`);
      return { memory: raw?.memory || null, being: botBeing };
    } catch {
      return { memory: null, being: null };
    }
  }

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      const payload = {
        v: 1,
        savedAt: Date.now(),
        memory: memory?.exportState ? memory.exportState() : null,
        being: botBeing,
      };
      const tmp = `${filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
      renameSync(tmp, filePath);
    } catch (err) {
      log(`[bridge] save failed: ${err.message}`);
    }
  }

  function scheduleSave() {
    if (timer) return;
    timer = setTimeout(flush, debounceMs);
    if (timer.unref) timer.unref();
  }

  function setBotBeing(snap) {
    if (snap && snap.v === 1) {
      botBeing = snap;
      scheduleSave();
    }
  }

  function getBotBeing() {
    return botBeing;
  }

  return { load, flush, scheduleSave, setBotBeing, getBotBeing };
}

/**
 * Wire an InitiativeEngine instance to the multi-platform ingest + persistence bridge.
 */
export function attachBrainBridge(engine, opts = {}) {
  const store = createWorldPersistence({ memory: engine.memory, ...opts });
  store.load();

  const origOnAction = engine.onAction;
  engine.onAction = (action, envelopes, event) => {
    store.scheduleSave();
    if (typeof origOnAction === "function") origOnAction(action, envelopes, event);
  };

  function ingest(raw) {
    const evt = normalizeIngestEvent(raw, engine.now);
    if (!evt) return null;
    const res = engine.handleEvent(evt);
    store.scheduleSave();
    return res;
  }

  return {
    ingest,
    ingestGist: (text, ts) => ingest({ type: "voice", text, ts }),
    ingestEnvironment: (env, ts) => ingest({ type: "environment", ...env, ts }),
    setBotBeing: store.setBotBeing,
    getBotBeing: store.getBotBeing,
    flush: store.flush,
  };
}
