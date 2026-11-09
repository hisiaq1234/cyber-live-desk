/* Minimal RFC 6455 WebSocket server — zero dependencies.
 *
 * The brain is a local process on the streamer's machine; the only consumer is the
 * overlay page (one browser tab / OBS browser source). That does not justify pulling
 * `ws` into the product's dependency tree, so this file implements exactly what we
 * need: server-side upgrade handshake, text frames, ping/pong, close.
 *
 * Deliberately NOT implemented: permessage-deflate, binary application data,
 * subprotocols. If a future client needs those, add them here or adopt `ws`.
 */
import { createHash } from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const OP = { CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa };

export function acceptKey(key) {
  return createHash("sha1").update(String(key) + GUID).digest("base64");
}

/** Encode a server→client frame (servers never mask). */
export function encodeFrame(payload, opcode = OP.TEXT) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload ?? ""), "utf8");
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, data]);
}

/**
 * Stateful frame parser for client→server traffic (masked, possibly fragmented).
 * Returns a feed(chunk) function; callbacks fire per complete message/control frame.
 */
export function createFrameParser({ onText, onBinary, onPing, onPong, onClose } = {}) {
  let buf = Buffer.alloc(0);
  let fragOp = null;
  let frags = [];

  return function feed(chunk) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (buf.length < 2) return;
      const b0 = buf[0];
      const b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        off = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < off + maskLen + len) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      off += maskLen;
      const payload = Buffer.from(buf.subarray(off, off + len));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buf = buf.subarray(off + len);

      if (opcode === OP.PING) {
        onPing?.(payload);
        continue;
      }
      if (opcode === OP.PONG) {
        onPong?.(payload);
        continue;
      }
      if (opcode === OP.CLOSE) {
        onClose?.(payload);
        return;
      }
      if (opcode === OP.CONT) {
        frags.push(payload);
        if (fin) {
          const whole = Buffer.concat(frags);
          const op = fragOp;
          fragOp = null;
          frags = [];
          deliver(op, whole);
        }
        continue;
      }
      // TEXT / BINARY
      if (!fin) {
        fragOp = opcode;
        frags = [payload];
        continue;
      }
      deliver(opcode, payload);
    }
  };

  function deliver(opcode, payload) {
    if (opcode === OP.TEXT) onText?.(payload.toString("utf8"));
    else onBinary?.(payload);
  }
}

export class WsConnection {
  constructor(socket, req) {
    this.socket = socket;
    this.req = req;
    this.alive = true;
    this.closed = false;
    this.onmessage = null;
    this.onclose = null;
    this._feed = createFrameParser({
      onText: (text) => {
        this.alive = true;
        let msg = text;
        try {
          msg = JSON.parse(text);
        } catch {
          /* leave as raw string */
        }
        this.onmessage?.(msg);
      },
      onPing: (payload) => this._raw(encodeFrame(payload, OP.PONG)),
      onPong: () => {
        this.alive = true;
      },
      onClose: () => this.close(),
    });
    socket.on("data", (chunk) => {
      try {
        this._feed(chunk);
      } catch {
        this.close();
      }
    });
    socket.on("error", () => this.close());
    socket.on("close", () => this._teardown());
    socket.on("end", () => this.close());
  }

  _raw(frame) {
    if (this.closed) return;
    try {
      this.socket.write(frame);
    } catch {
      this.close();
    }
  }

  send(data) {
    this._raw(encodeFrame(typeof data === "string" ? data : JSON.stringify(data), OP.TEXT));
  }

  ping() {
    this._raw(encodeFrame(Buffer.alloc(0), OP.PING));
  }

  close() {
    if (this.closed) return;
    this._raw(encodeFrame(Buffer.alloc(0), OP.CLOSE));
    this._teardown();
    try {
      this.socket.end();
    } catch {
      /* already gone */
    }
  }

  _teardown() {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }
}

/** Attach a WebSocket endpoint to an existing http.Server. */
export class WsServer {
  constructor() {
    this.clients = new Set();
    this._heartbeat = null;
  }

  attach(httpServer, { path = "/ws", heartbeatMs = 20000 } = {}) {
    httpServer.on("upgrade", (req, socket) => {
      const url = new URL(req.url, "http://127.0.0.1");
      const key = req.headers["sec-websocket-key"];
      if (url.pathname !== path || !key || String(req.headers.upgrade).toLowerCase() !== "websocket") {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`,
      );
      socket.setNoDelay(true);
      const conn = new WsConnection(socket, req);
      conn.onclose = () => this.clients.delete(conn);
      this.clients.add(conn);
      this.onconnect?.(conn);
    });

    this._heartbeat = setInterval(() => {
      for (const c of this.clients) {
        if (!c.alive) {
          c.close();
          this.clients.delete(c);
          continue;
        }
        c.alive = false;
        c.ping();
      }
    }, heartbeatMs);
    this._heartbeat.unref?.();
    return this;
  }

  broadcast(data) {
    const text = typeof data === "string" ? data : JSON.stringify(data);
    for (const c of this.clients) c.send(text);
    return this.clients.size;
  }

  close() {
    if (this._heartbeat) clearInterval(this._heartbeat);
    for (const c of this.clients) c.close();
    this.clients.clear();
  }
}
