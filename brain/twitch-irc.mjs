/* Twitch ingest: anonymous IRC over WebSocket.
 *
 * Anonymous read-only needs no OAuth and no registered app — `NICK justinfan12345`,
 * no PASS, any public channel (tech-notes §1). That is the whole reason the brain can
 * run with zero owner setup. Typed events (subs/gifts/raids) come through IRC too, as
 * USERNOTICE with an `msg-id` tag; richer EventSub coverage is a later pass and slots
 * into the same `normalise()` output shape.
 *
 * Nothing here may crash the process: a dead socket, a garbage line, or a Twitch
 * outage all resolve to "log it, back off, try again".
 */
import { randomInt } from "node:crypto";

export const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";

/** Parse one IRC line into { tags, prefix, command, params }. Never throws. */
export function parseIrcLine(raw) {
  let rest = String(raw ?? "").replace(/[\r\n]+$/, "");
  if (!rest) return null;
  const tags = {};
  if (rest.startsWith("@")) {
    const sp = rest.indexOf(" ");
    if (sp === -1) return null;
    for (const pair of rest.slice(1, sp).split(";")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const k = eq === -1 ? pair : pair.slice(0, eq);
      const v = eq === -1 ? "" : unescapeTag(pair.slice(eq + 1));
      tags[k] = v;
    }
    rest = rest.slice(sp + 1);
  }
  let prefix = null;
  if (rest.startsWith(":")) {
    const sp = rest.indexOf(" ");
    if (sp === -1) return null;
    prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
  }
  let trailing = null;
  const t = rest.indexOf(" :");
  if (t !== -1) {
    trailing = rest.slice(t + 2);
    rest = rest.slice(0, t);
  }
  const words = rest.split(" ").filter(Boolean);
  if (!words.length) return null;
  const command = words[0].toUpperCase();
  const params = words.slice(1);
  if (trailing !== null) params.push(trailing);
  return { tags, prefix, command, params };
}

function unescapeTag(v) {
  return v
    .replace(/\\s/g, " ")
    .replace(/\\:/g, ";")
    .replace(/\\\\/g, "\\")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n");
}

const nickOf = (prefix) => (prefix ? prefix.split("!")[0] : null);

/**
 * Normalise a parsed IRC message into zero or more CridEvents.
 * CridEvent = { id, type, ts, user, text, amount, tier, months, streak, viewers, detail }
 */
export function normalise(msg, { now = Date.now, channel = null } = {}) {
  if (!msg) return [];
  const ts = now();
  const tags = msg.tags || {};
  const user = tags["display-name"] || nickOf(msg.prefix) || "someone";
  const base = { id: `e${ts}${Math.random().toString(36).slice(2, 6)}`, ts, user, text: "", amount: 0, tier: null, months: 0, streak: 0, viewers: 0, detail: "" };

  if (msg.command === "PRIVMSG") {
    const text = msg.params[msg.params.length - 1] || "";
    const bits = Number(tags.bits || 0);
    if (bits > 0) {
      return [{ ...base, type: "bits", text, amount: bits, detail: `${bits} bits` }];
    }
    return [{ ...base, type: "chat", text }];
  }

  if (msg.command === "USERNOTICE") {
    const id = tags["msg-id"] || "";
    const systemMsg = msg.params[msg.params.length - 1] || "";
    const text = tags["message"] || systemMsg;
    const tier = tags["msg-param-sub-plan"] || null;
    switch (id) {
      case "sub":
        return [{ ...base, type: "sub", text, tier, months: 1, detail: `new sub${tier ? ` (${tierLabel(tier)})` : ""}` }];
      case "resub": {
        const months = Number(tags["msg-param-cumulative-months"] || 0);
        const streak = Number(tags["msg-param-streak-months"] || 0);
        return [{ ...base, type: "sub", text, tier, months, streak, detail: `resub ${months} month${months === 1 ? "" : "s"}` }];
      }
      case "subgift":
      case "submysterygift": {
        const count = Number(tags["msg-param-mass-gift-count"] || 1);
        const recipient = tags["msg-param-recipient-display-name"] || "";
        return [{ ...base, type: "gift", text: systemMsg, amount: count, tier, detail: count > 1 ? `${count} gifted subs` : `gift to ${recipient || "someone"}` }];
      }
      case "raid": {
        const viewers = Number(tags["msg-param-viewerCount"] || 0);
        return [{ ...base, type: "raid", text: systemMsg, viewers, amount: viewers, detail: `raid with ${viewers} viewer${viewers === 1 ? "" : "s"}` }];
      }
      case "bitsbadgetier": {
        const amount = Number(tags["msg-param-threshold"] || 0);
        return [{ ...base, type: "bits", text: systemMsg, amount, detail: `cheer tier ${amount}` }];
      }
      default:
        return [];
    }
  }

  return [];
}

export function tierLabel(tier) {
  const t = String(tier || "");
  if (t === "1000" || t === "Prime") return "tier 1";
  if (t === "2000") return "tier 2";
  if (t === "3000") return "tier 3";
  return t || "tier 1";
}

export function isPing(msg) {
  return msg && msg.command === "PING";
}

/**
 * Anonymous IRC client with reconnect + exponential backoff.
 * Options: { channel, onEvent, onStatus, log, url, WebSocketImpl }
 * onStatus({ state, channel, detail }) — state ∈ connecting | connected | disconnected | error
 */
export function createTwitchIrc({
  channel,
  onEvent = () => {},
  onStatus = () => {},
  log = () => {},
  url = IRC_URL,
  WebSocketImpl = globalThis.WebSocket,
  minBackoffMs = 1000,
  maxBackoffMs = 30000,
  now = Date.now,
} = {}) {
  const chan = String(channel || "").toLowerCase().replace(/^#/, "");
  let ws = null;
  let attempts = 0;
  let stopped = false;
  let retryTimer = null;
  let connected = false;
  let lastError = null;

  function status(state, detail) {
    onStatus({ state, channel: chan, detail, attempts, ts: now() });
  }

  function scheduleReconnect(reason) {
    if (stopped) return;
    attempts += 1;
    const base = Math.min(maxBackoffMs, minBackoffMs * 2 ** Math.min(attempts - 1, 5));
    const delay = Math.round(base * (0.75 + Math.random() * 0.5));
    status("disconnected", `${reason}; retrying in ${(delay / 1000).toFixed(1)}s`);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, delay);
    retryTimer.unref?.();
  }

  function connect() {
    if (stopped) return;
    if (!chan) {
      status("error", "no channel configured");
      return;
    }
    if (typeof WebSocketImpl !== "function") {
      status("error", "no WebSocket implementation available (Node 22+ required)");
      return;
    }
    status("connecting", `anonymous IRC → #${chan}`);
    let sock;
    try {
      sock = new WebSocketImpl(url);
    } catch (err) {
      lastError = err;
      scheduleReconnect(`connect failed: ${err.message}`);
      return;
    }
    ws = sock;

    sock.addEventListener("open", () => {
      try {
        sock.send(`NICK justinfan${randomInt(10000, 99999)}`);
        sock.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
        sock.send(`JOIN #${chan}`);
      } catch (err) {
        lastError = err;
        try {
          sock.close();
        } catch {
          /* ignore */
        }
      }
    });

    sock.addEventListener("message", (ev) => {
      try {
        const raw = typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8");
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          const msg = parseIrcLine(line);
          if (!msg) continue;
          if (msg.command === "PING") {
            try {
              sock.send(`PONG ${msg.params[msg.params.length - 1] || ""}`);
            } catch {
              /* socket gone; close handler will retry */
            }
            continue;
          }
          if (msg.command === "RECONNECT") {
            try {
              sock.close();
            } catch {
              /* ignore */
            }
            continue;
          }
          if (msg.command === "001" || msg.command === "JOIN") {
            if (!connected) {
              connected = true;
              attempts = 0;
              status("connected", `joined #${chan} as ${msg.command === "001" ? "justinfan" : "viewer"}`);
              log(`[twitch] connected to #${chan} (anonymous, read-only)`);
            }
            continue;
          }
          if (msg.command === "NOTICE" && /login authentication failed/i.test(msg.params.join(" "))) {
            status("error", "IRC rejected the connection");
            continue;
          }
          for (const evt of normalise(msg, { now, channel: chan })) onEvent(evt);
        }
      } catch (err) {
        lastError = err;
        log(`[twitch] ignored a bad line: ${err.message}`);
      }
    });

    sock.addEventListener("error", () => {
      /* the close handler owns reconnection */
    });

    sock.addEventListener("close", (ev) => {
      const wasConnected = connected;
      connected = false;
      ws = null;
      if (wasConnected) log(`[twitch] disconnected from #${chan}`);
      scheduleReconnect(ev && ev.code ? `socket closed (${ev.code})` : "socket closed");
    });
  }

  return {
    start() {
      stopped = false;
      connect();
      return this;
    },
    stop() {
      stopped = true;
      clearTimeout(retryTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      ws = null;
      connected = false;
    },
    get connected() {
      return connected;
    },
    get channel() {
      return chan;
    },
    get lastError() {
      return lastError;
    },
  };
}
