// CYBER LIVE DESK — in-memory storage adapter (Vercel serverless).
// Implements the same store interface that @netlify/blobs provided to _desk-core.mjs:
//   get(key, { type: "json" }) → parsed JSON value or null
//   setJSON(key, value) → void
//   setJSON(key, value, { onlyIfNew: true }) → { modified: boolean }
//   delete(key) → void
//
// NOTE: This is an in-memory store. Each serverless function invocation runs in
// isolation, so state does not persist across invocations. For persistent storage,
// replace this with a database adapter (e.g., Upstash Redis, PlanetScale, etc.).

const store = new Map();

export async function getStore() {
  return {
    async get(key, opts) {
      const val = store.get(key);
      if (val === undefined) return null;
      if (opts?.type === "json") return JSON.parse(val);
      return val;
    },
    async setJSON(key, value, opts) {
      if (opts?.onlyIfNew && store.has(key)) return { modified: false };
      store.set(key, JSON.stringify(value));
      return { modified: true };
    },
    async delete(key) {
      store.delete(key);
    },
  };
}
