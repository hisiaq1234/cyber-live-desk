import { parseDeskCommand, commandBody } from "./desk-commands.js";

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

  rec.onresult = async (e) => {
    const raw = e.results[e.results.length - 1][0].transcript.trim();
    onHeard?.(raw);
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
