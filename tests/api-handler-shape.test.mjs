// Run with: node --test
// Three functions answered 500 live, then went completely silent, before this was pinned down.
// Vercel's nodejs runtime converts a returned Web Response into an HTTP response only when the
// module's default export is the web-standard shape `export default { fetch: handler }`. Export
// a bare async arrow and the runtime calls it as a Node (req, res) handler instead: req becomes
// an IncomingMessage, so req.headers.get() throws, and the Response the handler returns is
// discarded, leaving the invocation to hang until it times out with zero bytes.
// Tests that call the handler directly never pass through that adapter, so only this shape
// check can catch the class.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const apiDir = resolve(import.meta.dirname, "../api");

const functions = readdirSync(apiDir)
  .filter((file) => file.endsWith(".mjs") && !file.startsWith("_"))
  .sort();

test("every serverless function exports a web-standard fetch handler", async () => {
  assert.ok(functions.length >= 5, `expected several api functions, found ${functions.length}`);
  for (const file of functions) {
    const mod = await import(pathToFileURL(resolve(apiDir, file)).href);
    assert.equal(
      typeof mod.default?.fetch,
      "function",
      `${file}: default export must be { fetch: handler }, not a bare function`,
    );
  }
});
