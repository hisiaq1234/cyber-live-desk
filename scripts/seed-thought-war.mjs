// CYBER LIVE DESK — one-off preload for the Thought War deck.
// Posts the dilemmas to /api/desk/cards as approved cards so they live in the queue permanently
// and "crid thought" has something to draw. Re-runnable by design: a headline already present in
// the deck's category is skipped, so a second run changes nothing.
//
//   DESK_OPERATOR_TOKEN=<from Vercel project settings> node scripts/seed-thought-war.mjs
//   DESK_OPERATOR_TOKEN=... node scripts/seed-thought-war.mjs --base http://localhost:3000
//
// The token is read from the environment and never written to a file, a log line or this repo.
import { THOUGHT_WAR_DECK, DECK_TYPE, DECK_CATEGORY, DECK_TTL_SEC } from "./thought-war-deck.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const base = flag("--base", process.env.DESK_BASE || "https://cyber-live-desk.vercel.app").replace(/\/+$/, "");
const token = process.env.DESK_OPERATOR_TOKEN;

if (!token) {
  console.error("DESK_OPERATOR_TOKEN is not set. It lives in Vercel project settings, not in this repo.");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function ask(path, init = {}) {
  const res = await fetch(`${base}${path}`, { ...init, headers, signal: AbortSignal.timeout(20000) });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`${init.method || "GET"} ${path} failed with ${res.status}: ${body?.error || "no message"}`);
  }
  return body;
}

const deckOf = async () => (await ask("/api/desk/cards")).cards.filter((c) => c.category === DECK_CATEGORY);

const before = await deckOf();
const have = new Set(before.map((c) => c.headline));

let added = 0;
for (const card of THOUGHT_WAR_DECK) {
  if (have.has(card.headline)) continue;
  await ask("/api/desk/cards", {
    method: "POST",
    body: JSON.stringify({
      ...card,
      type: DECK_TYPE,
      category: DECK_CATEGORY,
      approval: "approved",
      ttlSec: DECK_TTL_SEC,
    }),
  });
  added += 1;
}

const after = await deckOf();
console.log(`${base}`);
console.log(`Deck "${DECK_CATEGORY}": ${added} added, ${after.length - added} already present, ${after.length} in the queue.`);
if (after.length !== THOUGHT_WAR_DECK.length) {
  console.log(`Note: the queue holds ${after.length} of the ${THOUGHT_WAR_DECK.length} cards in scripts/thought-war-deck.mjs.`);
}
