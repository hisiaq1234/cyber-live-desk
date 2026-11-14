// CYBER LIVE DESK — Upstash Redis storage adapter.
// Backed by @upstash/redis so state persists across serverless function invocations.
//
// Required environment variables — set automatically when you connect an Upstash for
// Redis database in the Vercel dashboard (Storage tab → Connect to project):
//   KV_REST_API_URL     (labelled "Endpoint" or "REST API URL" in the Upstash dashboard)
//   KV_REST_API_TOKEN   (labelled "REST API token" in the Upstash dashboard)
//
// All keys are namespaced under "cld:" so this store can share a Redis database
// with other projects without collision.
//
// Interface matches _desk-core.mjs expectations:
//   get(key, { type: "json" }) → parsed value or null
//   setJSON(key, value)        → void
//   setJSON(key, value, { onlyIfNew: true }) → { modified: boolean }
//   compareAndSetJSON(key, expectedVersion, value) → { modified: boolean }
//   delete(key)                → void

import { Redis } from "@upstash/redis";

const NS = "cld:";

// Redis client is constructed once per module load (one cold start = one client).
// @upstash/redis reads KV_REST_API_URL and KV_REST_API_TOKEN from process.env by default.
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export function getStore() {
  return {
    async get(key, opts) {
      const val = await redis.get(`${NS}${key}`);
      if (val === null || val === undefined) return null;
      if (opts?.type === "json") {
        // Upstash returns already-parsed JSON objects; if it's still a string, parse it.
        if (typeof val === "string") {
          try { return JSON.parse(val); } catch { return null; }
        }
        return val;
      }
      return typeof val === "string" ? val : JSON.stringify(val);
    },

    async setJSON(key, value, opts) {
      const full = `${NS}${key}`;
      const serialized = JSON.stringify(value);
      if (opts?.onlyIfNew) {
        // SET NX — only write if key does not already exist.
        // Upstash returns "OK" on success, null when the key existed.
        const result = await redis.set(full, serialized, { nx: true });
        return { modified: result !== null };
      }
      await redis.set(full, serialized);
      return { modified: true };
    },

    // A state version is the compare-and-set token. This protects concurrent EventSub delivery
    // from last-write-wins tally loss without leaking Redis implementation into desk rules.
    async compareAndSetJSON(key, expectedVersion, value) {
      const full = `${NS}${key}`;
      const script = `
        local raw = redis.call('GET', KEYS[1])
        if not raw then return 0 end
        local current = cjson.decode(raw)
        if tonumber(current.version) ~= tonumber(ARGV[1]) then return 0 end
        redis.call('SET', KEYS[1], ARGV[2])
        return 1
      `;
      const result = await redis.eval(script, [full], [String(expectedVersion), JSON.stringify(value)]);
      return { modified: Number(result) === 1 };
    },

    async delete(key) {
      await redis.del(`${NS}${key}`);
    },
  };
}
