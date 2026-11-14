/* The operator's voice lane: typed desk commands from the control page and
   Twitch chat, posted to /api/desk/action with the operator token. */
import { parseDeskCommand } from "./desk-commands.js";
// commandBody lives in the shared rules, which the browser and the api both import
// as this same served file: importing anything out of api/ here would 404 and
// cascade-fail control.js, blanking the operator panel.
import { commandBody } from "./_commands.mjs";

const TOKEN_KEY = "desk.token";

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}

async function postAction(body) {
  const token = getToken();
  if (!token) throw new Error("No operator token");
  const r = await fetch("/api/desk/action", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Action failed");
  return j;
}

export function createCridVoice({ onHeard, onError } = {}) {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) {
    onError?.("Speech recognition not supported");
    return { start() {}, stop() {}, supported: false };
  }
  const rec = new Speech();
  rec.continuous = true;
  rec.interimResults = false;
  rec.lang = "en-US";
  let running = false;

  // One brain: every transcript also goes to the local InitiativeEngine as a
  // voice event, so what the operator says feeds the same mind as chat. The
  // desk-command path below stays for explicit actions only. ?brain=<url>
  // overrides the loopback default; a brain that isn't running costs nothing.
  const brainBase = (new URLSearchParams(location.search).get("brain") || "http://127.0.0.1:7311").replace(/\/+$/, "");
  const tellBrain = (raw) => {
    fetch(`${brainBase}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "voice", text: raw, source: "operator-voice" }),
    }).catch(() => {});
  };

  rec.onresult = async (e) => {
    const raw = e.results[e.results.length - 1][0].transcript.trim();
    onHeard?.(raw);
    tellBrain(raw);
    const line = raw.toLowerCase().startsWith("crid") ? raw : "crid " + raw;
    const cmd = parseDeskCommand(line);
    if (!cmd) return;
    const body = commandBody(cmd);
    if (!body) return;
    try { await postAction(body); }
    catch (err) { onError?.(err.message || String(err)); }
  };

  rec.onerror = (e) => onError?.(e.error || "recognition error");
  rec.onend = () => { if (running) rec.start(); };

  return {
    supported: true,
    start() { running = true; rec.start(); },
    stop() { running = false; rec.stop(); },
  };
}
