// CYBER LIVE DESK — Vercel KV storage adapter.
// Implements the same store interface as the old in-memory stub, now backed by
// Vercel KV (Upstash Redis under the hood) so state persists across serverless
// function invocations.
//
// Required environment variables (set in Vercel dashboard → Settings → Environment Variables):
//   KV_REST_API_URL     — from your Vercel KV database page
//   KV_REST_API_TOKEN   — from your Vercel KV database page
//
// All keys are namespaced under "cld:" so this store can share a KV database
// with other projects without collision.
//
// Interface matches _desk-core.mjs expectations:
//   get(key, { type: "json" }) → parsed value or null
//   setJSON(key, value)        → void
//   setJSON(key, value, { onlyIfNew: true }) → { modified: boolean }
//   delete(key)                → void

import { kv } from "@vercel/kv";

const NS = "cld:";

export function getStore() {
  return {
    async get(key, opts) {
      const val = await kv.get(`${NS}${key}`);
      if (val === null || val === undefined) return null;
      // Vercel KV returns parsed JSON already when you stored with set(key, value)
      // but _desk-core uses setJSON which stringifies first, so we need to handle both.
      if (opts?.type === "json") {
        if (typeof val === "string") {
          try { return JSON.parse(val); } catch { return null; }
        }
        return val; // already a parsed object (stored via kv.set directly)
      }
      return typeof val === "string" ? val : JSON.stringify(val);
    },

    async setJSON(key, value, opts) {
      const full = `${NS}${key}`;
      if (opts?.onlyIfNew) {
        // SET NX — only set if key does not already exist
        const result = await kv.set(full, JSON.stringify(value), { nx: true });
        // Upstash returns "OK" when set, null when skipped (key existed)
        return { modified: result !== null };
      }
      await kv.set(full, JSON.stringify(value));
      return { modified: true };
    },

    async delete(key) {
      await kv.del(`${NS}${key}`);
    },
  };
}
