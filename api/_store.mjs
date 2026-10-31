// CYBER LIVE DESK — Vercel KV storage adapter.
// Implements the same store interface that @netlify/blobs provided to _desk-core.mjs:
//   get(key, { type: "json" }) → parsed JSON value or null
//   setJSON(key, value) → void
//   setJSON(key, value, { onlyIfNew: true }) → { modified: boolean }
//   delete(key) → void
//
// Vercel KV is Redis-backed, so each function invocation shares the same store.
// Set KV_URL, KV_REST_API_URL, KV_REST_API_TOKEN, KV_REST_API_READ_ONLY_TOKEN
// in Vercel project settings (add Vercel KV integration first).

import { kv } from "@vercel/kv";

const PREFIX = "cyber-live-desk:";

export async function getStore() {
  return {
    async get(key, opts) {
      const val = await kv.json.get(PREFIX + key);
      return val === undefined || val === null ? null : val;
    },
    async setJSON(key, value, opts) {
      const fullKey = PREFIX + key;
      if (opts?.onlyIfNew) {
        const existing = await kv.get(fullKey);
        if (existing !== null) return { modified: false };
        await kv.json.set(fullKey, value);
        return { modified: true };
      }
      await kv.json.set(fullKey, value);
      return { modified: true };
    },
    async delete(key) {
      await kv.del(PREFIX + key);
    },
  };
}
