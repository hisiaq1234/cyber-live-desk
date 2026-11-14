/* Grounded live-question sidecar for Crid.
 *
 * InitiativeEngine stays synchronous and dependency-free: this module watches the
 * same events AFTER handleEvent returns, detects a direct question addressed to
 * Crid, and does the slow part — a real web lookup — off the hot path. Whatever
 * comes back is filtered through personality.guard() (the `never` list) and a
 * 140-char cap, then emitted through engine.bus like any other decision, so the
 * overlay's stateless renderer needs to know nothing new.
 *
 * Providers, in order:
 *   1. Brave Search API      — only when BRAVE_SEARCH_API_KEY is set (breaking news,
 *      live scores, current events).
 *   2. DuckDuckGo Instant Answer — zero key, instant facts.
 *   3. Wikipedia REST summary — zero key, entity/topic questions.
 *
 * No key and no hit means Crid says so and does not guess — that is the whole
 * point of "grounded": he never fabricates an answer.
 */
import { look, express, gesture, say, card } from "./commands.mjs";

const TRIGGER_RE = /^(?:@?crid[,:\s]+|hey\s+crid[,:\s]+)(.+)$/i;

/** Extract a clean search query if the message directly asks Crid a question. */
export function parseCridQuestion(text) {
  const raw = String(text || "").trim();
  const m = raw.match(TRIGGER_RE);
  if (!m) return null;
  const body = m[1].trim();
  if (body.length < 4 || body.length > 160) return null;
  // Require question intent so "@crid lol" never burns a search.
  const isQuestion =
    body.endsWith("?") ||
    /^(what|who|where|when|why|how|is|are|was|were|did|does|can|tell me|define|explain|check)\b/i.test(body);
  if (!isQuestion) return null;
  return body.replace(/\?+$/, "").trim();
}

async function fetchBrave(query, fetchImpl, signal) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return null;
  const u = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`;
  const res = await fetchImpl(u, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
    signal,
  });
  if (!res.ok) return null;
  const data = await res.json();
  const top = data?.web?.results?.[0];
  if (!top?.description) return null;
  return {
    title: String(top.title || query).slice(0, 60),
    snippet: cleanSnippet(top.description),
    source: safeHost(top.url),
  };
}

async function fetchDuckDuckGo(query, fetchImpl, signal) {
  const u = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetchImpl(u, { signal });
  if (!res.ok) return null;
  const ddg = await res.json();
  const text = ddg.AbstractText || ddg.Answer || ddg.Definition;
  if (!text) return null;
  return {
    title: String(ddg.Heading || query).slice(0, 60),
    snippet: cleanSnippet(text),
    source: ddg.AbstractSource || "DuckDuckGo",
  };
}

async function fetchWikipedia(query, fetchImpl, signal) {
  const topic = query.replace(/^(what is|who is|who was|what are|define|explain)\s+/i, "").trim();
  if (topic.length < 2) return null;
  const u = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic.replace(/\s+/g, "_"))}`;
  const res = await fetchImpl(u, { signal });
  if (!res.ok) return null;
  const w = await res.json();
  if (w?.type !== "standard" || !w.extract) return null;
  return {
    title: String(w.title || topic).slice(0, 60),
    snippet: cleanSnippet(w.extract),
    source: "Wikipedia",
  };
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

/** Query the providers in order; first grounded hit wins. */
export async function fetchGroundedFact(query, { fetchImpl = globalThis.fetch, timeoutMs = 4500 } = {}) {
  if (typeof fetchImpl !== "function") return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    for (const provider of [fetchBrave, fetchDuckDuckGo, fetchWikipedia]) {
      const hit = await provider(query, fetchImpl, ac.signal).catch(() => null);
      if (hit?.snippet) return hit;
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function cleanSnippet(raw) {
  const s = String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // First crisp sentence only — Crid does not read paragraphs aloud.
  return (s.split(/(?<=[.!?])\s+/)[0] || s).trim();
}

const OPENERS = ["checked. ", "looked it up. ", "receipts: ", ""];

function formatInCridVoice(snippet, personality, random = Math.random) {
  const prefix = OPENERS[Math.floor(random() * OPENERS.length)];
  let line = `${prefix}${snippet.charAt(0).toLowerCase()}${snippet.slice(1)}`;
  if (line.length > 138) {
    line = `${line.slice(0, 135).replace(/\s+\S*$/, "")}…`;
  }
  return personality?.guard ? (personality.guard(line) ? line : "") : line;
}

/**
 * Attach live question-answering to an engine. Call maybeAnswer(evt) after
 * engine.handleEvent(evt) — it is async and never blocks the decision loop.
 * One lookup in flight at a time, 15s global cooldown.
 */
export function createLookupHandler(engine, { cooldownMs = 15_000, log = console.log, fetchImpl, random = Math.random } = {}) {
  let lastLookupAt = -Infinity;
  let inFlight = false;

  async function maybeAnswer(evt) {
    if (!evt || (evt.type !== "chat" && evt.type !== "voice") || !evt.text) return false;
    const query = parseCridQuestion(evt.text);
    if (!query) return false;

    const now = engine.now();
    if (inFlight || now - lastLookupAt < cooldownMs) return false;

    inFlight = true;
    lastLookupAt = now;
    const asker = evt.type === "voice" ? engine.personality.owner || "owner" : evt.user || "chat";

    // The thinking beat lands immediately; the answer arrives when it arrives.
    engine.memory.addThought({ ts: now, kind: "lookup", text: `${asker} asked: "${query}" — checking.` });
    engine.bus.emit([
      look(evt.type === "voice" ? "streamer" : "chat"),
      express("thinking", { intensity: 0.85 }),
    ]);

    try {
      const hit = await fetchGroundedFact(query, fetchImpl ? { fetchImpl } : {});
      if (!hit) {
        const missLine = "looked. nothing solid came back, so I'm not guessing.";
        if (!engine.personality.guard || engine.personality.guard(missLine)) {
          engine.bus.emit([
            gesture("shrug"),
            say(missLine, { style: "dry", duration: 4200 }),
          ]);
        }
        return false;
      }

      const spoken = formatInCridVoice(hit.snippet, engine.personality, random);
      if (!spoken) return false;

      log(`[lookup] "${query}" → ${hit.source}: "${spoken}"`);
      engine.memory.recordAction({
        ts: engine.now(),
        rule: "web-lookup",
        why: `answered ${asker}'s question "${query}" via ${hit.source}`,
        say: spoken,
        summary: `lookup:${query}`,
      });

      engine.bus.emit([
        card(hit.title, `${hit.source} · asked by ${asker}`, { art: "lookup" }),
        express("smug", { intensity: 0.75 }),
        gesture("nod"),
        say(spoken, { style: "callout", duration: 6000 }),
      ]);
      return true;
    } finally {
      inFlight = false;
    }
  }

  return { maybeAnswer, parseCridQuestion };
}
