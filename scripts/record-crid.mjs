// record-crid.mjs — film Crid's animation beats for before/after review.
//
//   node scripts/record-crid.mjs --tag before
//   node scripts/record-crid.mjs --tag after
//
// Serves public/ (the same mapping Vercel gives it), drives headless Chrome over
// CDP, screencasts each scenario on public/crid-lab.html, and encodes mp4s with
// ffmpeg into shots/<tag>/. Every clip is one item from the polish list; the
// actions are the real bot API (cue/feel/lean/driveStage), never a mock.
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(ROOT, "public");
const TAG = (process.argv.find((a, i) => process.argv[i - 1] === "--tag") || "take").replace(/[^\w-]/g, "");
const OUT = path.join(ROOT, "shots", TAG);
const PORT_HTTP = 8123;
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WIN = process.env.REC_WIN || "1280x800";
const FFMPEG = process.env.FFMPEG || "ffmpeg";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary",
  ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

// --- tiny static server: /desk-assets/* -> public/desk-assets/*, else public/* ---
const server = http.createServer((req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/crid-lab.html";
    let f = path.join(PUB, p);
    if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("nf"); }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  } catch { res.writeHead(500); res.end(); }
});
await new Promise((r) => server.listen(PORT_HTTP, "127.0.0.1", r));

// --- chrome -----------------------------------------------------------------
const [w, h] = WIN.split("x").map(Number);
const chrome = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=0", `--window-size=${WIN}`,
  "--hide-scrollbars", "--mute-audio", "--disable-extensions", "--no-first-run",
  "--enable-unsafe-swiftshader", "--use-angle=swiftshader",
  "--autoplay-policy=no-user-gesture-required", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((res, rej) => {
  let buf = "";
  chrome.stderr.on("data", (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) res(m[1]);
  });
  setTimeout(() => rej(new Error("chrome did not expose devtools: " + buf.slice(-400))), 20000);
});

// --- minimal CDP client -------------------------------------------------------
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(), listeners = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  else if (m.method) for (const fn of listeners) fn(m);
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++seq; pend.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);

const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error("page eval failed: " + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
};

// --- scenarios: one clip per polish item --------------------------------------
// `at` is ms after the clip starts rolling; `js` runs in the page.
const ONLY = (process.env.REC_ONLY || "").split(",").filter(Boolean);
const SCENARIOS = [
  { name: "01-lead-order", dur: 15000, steps: [
    { at: 1200, js: "window.lab.driveStage('climb','p-climb','start')" },
    { at: 11000, js: "window.lab.driveStage('climb','p-climb','end')" }] },
  { name: "02-anticipation", dur: 12000, steps: [
    { at: 1500, js: "window.lab.cue('hop')" },
    { at: 7000, js: "window.lab.cue('jump')" }] },
  { name: "03-settle", dur: 14000, steps: [
    { at: 1000, js: "window.lab.cue('jump')" },
    { at: 5000, js: "window.lab.cue('hop')" },
    { at: 9000, js: "window.lab.cue('climb')" }] },
  { name: "04-blinks", dur: 20000, steps: [
    { at: 3000, js: "window.lab.cue('glanceL')" },
    { at: 11000, js: "window.lab.cue('glanceR')" }] },
  { name: "05-eyes", dur: 14000, steps: [
    { at: 1500, js: "window.lab.driveStage('climb','p-climb','start')" },
    { at: 12000, js: "window.lab.driveStage('climb','p-climb','end')" }] },
  { name: "06-never-still", dur: 14000, steps: [] },
  { name: "07-face", dur: 30000, steps: [
    { at: 1000, js: "window.lab.feel('delighted')" },
    { at: 5000, js: "window.lab.feel('smug')" },
    { at: 9000, js: "window.lab.feel('flustered')" },
    { at: 13000, js: "window.lab.feel('curious')" },
    { at: 17000, js: "window.lab.feel('sulky')" },
    { at: 21000, js: "window.lab.feel('startled')" },
    { at: 25000, js: "window.lab.feel('proud')" }] },
  { name: "08-overlap", dur: 18000, steps: [
    { at: 1200, js: "window.lab.lean('p-lean','right')" },
    { at: 8000, js: "window.lab.cue('dropbag')" },
    { at: 13000, js: "window.lab.cue('pickup')" }] },
  { name: "09-landings", dur: 20000, steps: [
    { at: 1200, js: "window.lab.driveStage('climb','p-climb','start')" },
    { at: 12000, js: "window.lab.driveStage('climb','p-climb','end')" },
    { at: 16000, js: "window.lab.cue('jump')" }] },
];

fs.mkdirSync(OUT, { recursive: true });

for (const sc of SCENARIOS.filter((s) => !ONLY.length || ONLY.some((o) => s.name.includes(o)))) {
  console.log(`[rec] ${sc.name} (${sc.dur / 1000}s)`);
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT_HTTP}/crid-lab.html?scale=1.5` }, sessionId);
  // wait for the lab + GLB: poll until window.lab exists and the 3d canvas is up
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    try { if (await evalJs("!!(window.lab&&window.lab.bot&&document.querySelector('canvas.crid3d'))")) break; } catch {}
    if (i === 119) throw new Error(sc.name + ": lab never came up");
  }
  await sleep(2500);                                     // let him settle into idle
  try {
    const health = await evalJs(`({bones:window.__cridBones?Object.keys(window.__cridBones()).length:0,
      stage:window.__cridStage?window.__cridStage().state:"-",
      face:Object.keys(window.__cridFace?window.__cridFace.channels():{}).length})`);
    console.log("  health:", JSON.stringify(health));
  } catch (e) { console.log("  health probe failed:", e.message); }
  const frames = [];
  const onFrame = (m) => {
    if (m.method !== "Page.screencastFrame") return;
    const { data, metadata, sessionId: sid } = m.params;
    frames.push({ data: Buffer.from(data, "base64"), ts: metadata.timestamp });
    send("Page.screencastFrameAck", { sessionId: sid }, sessionId).catch(() => {});
  };
  listeners.push(onFrame);
  await send("Page.startScreencast", { format: "jpeg", quality: 85, everyNthFrame: 1 }, sessionId);
  const t0 = Date.now();
  for (const s of sc.steps) {
    const wait = t0 + s.at - Date.now();
    if (wait > 0) await sleep(wait);
    try { await evalJs(s.js); } catch (e) { console.log(`  step failed: ${e.message}`); }
  }
  await sleep(Math.max(0, t0 + sc.dur - Date.now()));
  await send("Page.stopScreencast", {}, sessionId);
  listeners.splice(listeners.indexOf(onFrame), 1);

  // encode: per-frame durations from screencast timestamps via the concat demuxer
  const dir = path.join(OUT, ".frames-" + sc.name);
  fs.mkdirSync(dir, { recursive: true });
  const list = path.join(dir, "list.txt");
  let fd = "";
  frames.forEach((f, i) => {
    const n = String(i).padStart(6, "0") + ".jpg";
    fs.writeFileSync(path.join(dir, n), f.data);
    const dt = i + 1 < frames.length ? Math.max(.005, frames[i + 1].ts - f.ts) : 1 / 30;
    fd += `file '${n}'\nduration ${dt.toFixed(4)}\n`;
  });
  fs.writeFileSync(list, fd + `file '${String(frames.length - 1).padStart(6, "0")}.jpg'\n`);
  const mp4 = path.join(OUT, sc.name + ".mp4");
  const r = spawnSync(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", "scale=1280:800:force_original_aspect_ratio=decrease,pad=1280:800:(ow-iw)/2:(oh-ih)/2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", mp4], { encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  if (r.status !== 0) { console.log("  ffmpeg failed:", (r.stderr || "").slice(-300)); continue; }
  console.log(`  -> ${path.relative(ROOT, mp4)} (${frames.length} frames)`);
}

ws.close(); chrome.kill("SIGKILL"); server.close();
console.log(`done -> shots/${TAG}/`);
