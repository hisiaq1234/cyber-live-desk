// probe-walk.mjs — drive Crid on a walk in crid-lab headless and sample bone
// world positions over the gait, to sanity-check the world-axis pose() port.
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(ROOT, "public");
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
await new Promise((r) => server.listen(8125, "127.0.0.1", r));
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--remote-debugging-port=0", "--window-size=1280x800",
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
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++seq; pend.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
await send("Page.navigate", { url: "http://127.0.0.1:8125/crid-lab.html?scale=1.4" }, sessionId);
await new Promise((r) => setTimeout(r, 9000)); // GLB warm

const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  return r.result?.value;
};

// Send him walking to the left panel, then sample joints mid-stride.
console.log("walk start:", await ev(`window.lab.bot.lean("p-lean","left")`));
const samples = [];
for (let i = 0; i < 14; i++) {
  await new Promise((r) => setTimeout(r, 350));
  const s = await ev(`(()=>{const b=window.__cridBones();const g=n=>b[n]?b[n].w:null;
    return{t:performance.now()|0,hip:g('C_pelvis0001_bind_JNT'),shL:g('L_armUpper0001_bind_JNT'),
      handL:g('L_hand0001_bind_JNT'),footL:g('L_foot0001_bind_JNT'),footR:g('R_foot0001_bind_JNT'),
      kneeL:g('L_legLower0001_bind_JNT'),head:g('C_head_bind_JNT')}})()`);
  samples.push(s);
}
for (const s of samples) console.log(JSON.stringify(s));
ws.close(); chrome.kill("SIGKILL"); server.close();
