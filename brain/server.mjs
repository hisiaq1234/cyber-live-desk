/* The local server: overlay page, backstage-lite status page, command bus, one port.
 *
 * Everything is on 127.0.0.1 only — this is the streamer's machine, not the public web.
 * The overlay page is a STATELESS renderer: it connects, receives a snapshot, and applies
 * commands. Reload it as often as OBS likes; the brain owns the state (tech-notes §2).
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { WsServer } from "./ws.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
export const DESK_ASSETS = join(REPO, "public", "desk-assets");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
};

export function createBrainServer({ engine, memory, bus, personality, getStatus, log = console.log, host = "127.0.0.1", port = 7311, demo = false } = {}) {
  const ws = new WsServer();
  const server = createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (err) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(`brain error: ${err.message}`);
    }
  });

  function sendFile(res, file, status = 200) {
    return readFile(file).then((buf) => {
      res.writeHead(status, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(buf);
    });
  }

  async function route(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    const path = url.pathname;

    if (path === "/" || path === "/index.html") return sendFile(res, join(HERE, "index.html"));
    if (path === "/overlay" || path === "/overlay.html") return sendFile(res, join(HERE, "overlay.html"));
    if (path === "/overlay.js") return sendFile(res, join(HERE, "overlay.js"));
    if (path === "/overlay.css") return sendFile(res, join(HERE, "overlay.css"));
    if (path === "/favicon.ico") {
      res.writeHead(204);
      return res.end();
    }
    if (path === "/health") return json(res, { ok: true, ...(getStatus ? getStatus() : {}), memory: memory.summary() });
    if (path === "/state") return json(res, { status: getStatus ? getStatus() : {}, memory: memory.snapshot(), personality: personality.describe() });

    if (path.startsWith("/desk-assets/")) {
      // crid-bot.js resolves its sprites as ./desk-assets/crid/... from the page it is on,
      // so the overlay page must be served from a root where that path exists.
      const rel = normalize(path.replace("/desk-assets/", "")).replace(/^(\.\.[/\\])+/, "");
      const file = join(DESK_ASSETS, rel);
      if (!file.startsWith(DESK_ASSETS) || !existsSync(file)) {
        res.writeHead(404, { "content-type": "text/plain" });
        return res.end("not found");
      }
      return sendFile(res, file);
    }

    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }

  ws.attach(server, { path: "/ws" });
  ws.onconnect = (conn) => {
    conn.send(snapshotFrame());
    log(`[bus] overlay connected (${ws.clients.size} client${ws.clients.size === 1 ? "" : "s"})`);
    conn.onclose = () => {
      ws.clients.delete(conn);
      log(`[bus] overlay disconnected (${ws.clients.size} left)`);
    };
    conn.onmessage = (msg) => {
      if (msg && msg.type === "hello") conn.send(snapshotFrame());
    };
  };

  function snapshotFrame() {
    // What the renderer should look like right now, derived from the last commands the
    // brain sent. This is what makes a reload mid-stream invisible: state, not history.
    const last = (type) => [...bus.sent].reverse().find((c) => c.type === type);
    const presenceCmd = last("presence");
    const expressCmd = last("express");
    return {
      frame: "snapshot",
      v: 1,
      status: getStatus ? getStatus() : {},
      state: {
        presence: presenceCmd ? presenceCmd.payload.mode : "watching",
        expression: expressCmd ? expressCmd.payload : null,
      },
      memory: memory.snapshot(),
      personality: { name: personality.name, owner: personality.owner },
      bus: bus.snapshot(),
      demo,
    };
  }

  // commands and decisions leave the engine through here
  bus.onCommand((cmd) => ws.broadcast({ frame: "command", command: cmd }));

  function broadcastDecision(decision, commands) {
    ws.broadcast({ frame: "decision", decision, commands });
  }

  function broadcastStatus() {
    ws.broadcast({ frame: "status", status: getStatus ? getStatus() : {} });
  }

  return {
    ws,
    server,
    snapshotFrame,
    broadcastDecision,
    broadcastStatus,
    async listen(p = port) {
      await new Promise((ok, fail) => {
        server.once("error", fail);
        server.listen(p, host, () => {
          server.removeListener("error", fail);
          ok();
        });
      });
      return this;
    },
    async close() {
      ws.close();
      await new Promise((ok) => server.close(ok));
    },
    get url() {
      const addr = server.address();
      const p = addr && typeof addr === "object" ? addr.port : port;
      return `http://${host}:${p}`;
    },
  };
}

function json(res, body) {
  res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body, null, 2));
}
