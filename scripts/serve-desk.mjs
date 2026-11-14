// serve-desk.mjs — local /desk dev server: static public/ + the real api/desk.mjs
// handler for /desk and /api/*. For visual QA and brain debugging only; it is
// not the deployment path (Vercel is).
//   node scripts/serve-desk.mjs [port]     then open http://127.0.0.1:<port>/desk
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Must be set before api/_store.mjs evaluates — it picks its backend at import time.
process.env.DESK_STORE = "memory";
const { default: desk } = await import("../api/desk.mjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(ROOT, "public");
const PORT = Number(process.argv[2]) || 8790;
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary",
  ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
};

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  const p = decodeURIComponent(u.pathname);
  if (p === "/desk" || p === "/api/desk" || p.startsWith("/api/")) {
    try {
      const body = ["GET", "HEAD"].includes(req.method) ? undefined : await new Promise((r) => {
        const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c)));
      });
      const r = await desk.fetch(new Request(`http://127.0.0.1${req.url}`, {
        method: req.method, headers: { "content-type": req.headers["content-type"] || "application/json" },
        body,
      }));
      res.writeHead(r.status, Object.fromEntries(r.headers.entries()));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(String(e && e.stack || e));
    }
    return;
  }
  const f = path.join(PUB, p);
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end("not found");
  }
  res.writeHead(200, { "content-type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
server.listen(PORT, "127.0.0.1", () => console.log(`desk dev → http://127.0.0.1:${PORT}/desk`));
