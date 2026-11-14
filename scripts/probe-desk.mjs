// probe-desk.mjs — load /desk headless, print console errors + CRID debug hooks.
// PROBE_SIZE=1920x1080 PROBE_URL=/desk node scripts/probe-desk.mjs
import { spawn } from "node:child_process";
const [WIDTH, HEIGHT] = (process.env.PROBE_SIZE || "1920x1080").split("x").map(Number);
const URL_ = process.env.PROBE_URL || "http://127.0.0.1:8791/desk";
const WAIT = Number(process.env.PROBE_WAIT || 14000);
const chromeBin = process.env.CHROME_BIN || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const chrome = spawn(chromeBin, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-port=0",
  "--window-size=" + WIDTH + "," + HEIGHT, "--enable-unsafe-swiftshader", "--use-angle=swiftshader",
  "--mute-audio", "--no-first-run", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((res, rej) => {
  let b = ""; chrome.stderr.on("data", (d) => { b += d; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); });
  setTimeout(() => rej(new Error("no devtools")), 20000);
});
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  else if (m.method === "Runtime.consoleAPICalled" && ["warning", "error"].includes(m.params.type))
    errors.push("[console." + m.params.type + "] " + m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 400));
  else if (m.method === "Runtime.exceptionThrown")
    errors.push("[exception] " + JSON.stringify(m.params.exceptionDetails).slice(0, 600));
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++seq; pend.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
await send("Page.navigate", { url: URL_ }, sessionId);
await new Promise((r) => setTimeout(r, WAIT));
const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
const diag = await evalJs(`JSON.stringify({
  crid3d: window.__crid3D ? window.__crid3D() : null,
  gait: window.__cridGait ? window.__cridGait() : null,
  ik: window.__cridIk ? {w:window.__cridIk.w(),dbg:window.__cridIk.dbg()} : null,
  stage: window.__cridStage ? window.__cridStage() : null,
  motor: window.__cridMotor ? window.__cridMotor() : null,
  coverage: window.__cridCoverage ? window.__cridCoverage() : null,
  face: window.__cridFace ? Object.keys(window.__cridFace.channels()).length : null,
  canvases: [...document.querySelectorAll("canvas")].map(c => ({w:c.width,h:c.height,vis:c.offsetParent!==null})),
  botHost: !!document.querySelector(".bot-host, .crid-bot, [class*=bot]"),
  webglFail: !!document.querySelector(".bot-fallback, .crid-fallback"),
})`);
console.log("DIAG", diag);
const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
const fs = await import("node:fs");
fs.mkdirSync("outputs", { recursive: true });
const name = `desk-probe-${WIDTH}x${HEIGHT}.png`;
fs.writeFileSync("outputs/" + name, Buffer.from(shot.data, "base64"));
console.log("SHOT outputs/" + name);
for (const e of errors.slice(0, 30)) console.log(e);
console.log(`ERRORS ${errors.length}`);
chrome.kill();
process.exit(0);
