// probe-crid.mjs — load crid-lab headless, print console + page errors for N seconds.
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(ROOT, "public");
const [WIDTH, HEIGHT] = (process.env.PROBE_SIZE || "1280x800").split("x").map(Number);
const PROBE_NAME = process.env.PROBE_NAME || "desktop";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary",
  ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/crid-lab.html";
  const f = path.join(PUB, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(8124, "127.0.0.1", r));
const chromeBin = process.env.CHROME_BIN || process.env.CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "google-chrome");
const chrome = spawn(chromeBin, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-port=0", "--window-size=" + WIDTH + "," + HEIGHT,
  "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--mute-audio",
  "--no-first-run", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((res, rej) => {
  let b = ""; chrome.stderr.on("data", (d) => { b += d; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); });
  setTimeout(() => rej(new Error("no devtools")), 20000);
});
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  else if (m.method === "Runtime.consoleAPICalled" && ["warning", "error"].includes(m.params.type))
    console.log("[console." + m.params.type + "]", m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 500));
  else if (m.method === "Runtime.exceptionThrown")
    console.log("[exception]", JSON.stringify(m.params.exceptionDetails).slice(0, 800));
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++seq; pend.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const capture = async (suffix) => {
  const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  const dir = path.join(ROOT, "outputs"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "crid-lab-" + PROBE_NAME + "-" + suffix + ".png"), Buffer.from(shot.data, "base64"));
};
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
await send("Page.navigate", { url: "http://127.0.0.1:8124/crid-lab.html?scale=1.5" }, sessionId);
await new Promise((r) => setTimeout(r, 8000));
const probeInfo = await send("Runtime.evaluate", {
  expression: "JSON.stringify({canvas:!!document.querySelector('canvas'),size:document.querySelector('canvas')?{w:document.querySelector('canvas').width,h:document.querySelector('canvas').height}:null})",
  returnByValue: true
}, sessionId);
console.log("[viewport]", WIDTH + "x" + HEIGHT, "[canvas]", probeInfo.result?.value);
if (probeInfo.result?.value?.includes('"canvas":false')) process.exitCode = 1;
await capture("idle");
if (process.env.PROBE_CLIMB === "1") {
  const drive = await send("Runtime.evaluate", { expression: "String(window.lab.driveStage('climb','p-climb','start'))", returnByValue: true }, sessionId);
  console.log("[driveStage]", drive.result?.value);
  if (drive.result?.value !== "true") process.exitCode = 1;
  await new Promise((r) => setTimeout(r, 5000));
  await capture("climb");
  let sawClimb = false;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const s = await send("Runtime.evaluate", { expression: "JSON.stringify(window.__cridStage?{state:window.__cridStage().state,groundY:window.__cridStage().groundY,roll:+window.__cridStage().roll.toFixed(2)}:null)", returnByValue: true }, sessionId);
    console.log("[stage t+" + (i + 1) + "s]", s.result?.value);
    if (s.result?.value && !s.result.value.includes('"state":"floor"')) sawClimb = true;
  }
  if (!sawClimb) { console.error("[probe] climb never left floor state"); process.exitCode = 1; }
  await send("Runtime.evaluate", { expression: "window.lab.driveStage('climb','p-climb','end')" }, sessionId);
  await new Promise((r) => setTimeout(r, 4000));
  await capture("recovery");
} else {
  await new Promise((r) => setTimeout(r, 7000));
}
if (process.env.PROBE_EVAL) {
  const e = await send("Runtime.evaluate", { expression: process.env.PROBE_EVAL, returnByValue: true }, sessionId);
  console.log("[eval]", JSON.stringify(e.result?.value));
}
const state = await send("Runtime.evaluate", { expression: "window.lab&&window.lab.state?JSON.stringify(window.lab.state()):'no lab'", returnByValue: true }, sessionId);
console.log("[state]", state.result?.value);
ws.close(); chrome.kill("SIGKILL"); server.close();
