// CYBER LIVE DESK — one place to turn a serverless request into a URL.
//
// Vercel's Node runtime hands a handler a RELATIVE req.url ("/api/x/feed?mode=trends"),
// and new URL() rejects a relative string outright. Every handler parsed it before its own
// try block, so the TypeError skipped the JSON fallback and surfaced as a bare
// 500 FUNCTION_INVOCATION_FAILED. Supplying a base makes the relative form legal and leaves
// an absolute url untouched, so the overlay and the existing tests keep working unchanged.
//
// Only pathname and searchParams are ever read from the result, so the base is a placeholder
// for parsing, not a claim about where the request arrived.
export const BASE = "https://cyber-live-desk.vercel.app";

export const requestUrl = (req) => new URL(String(req?.url ?? "/"), BASE);
