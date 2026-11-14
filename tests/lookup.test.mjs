import test from "node:test";
import assert from "node:assert/strict";
import { parseCridQuestion, fetchGroundedFact, createLookupHandler } from "../brain/lookup.mjs";
import { SessionMemory } from "../brain/memory.mjs";
import { CommandBus } from "../brain/commands.mjs";
import { loadPersonality } from "../brain/personality.mjs";
import { InitiativeEngine } from "../brain/engine.mjs";

/* The lookup sidecar's contract: strict trigger, grounded providers, Crid's
 * guardrails. fetch is mocked — no test ever touches the network. */

test("parseCridQuestion: only direct questions to Crid parse", () => {
  assert.equal(parseCridQuestion("@crid what is the capital of Nigeria?"), "what is the capital of Nigeria");
  assert.equal(parseCridQuestion("crid who won the match?"), "who won the match");
  assert.equal(parseCridQuestion("hey crid, define entropy"), "define entropy");
  assert.equal(parseCridQuestion("@crid lol"), null, "no question intent, no search");
  assert.equal(parseCridQuestion("crid"), null);
  assert.equal(parseCridQuestion("what is the weather?"), null, "not addressed to Crid");
  assert.equal(parseCridQuestion("@crid " + "x".repeat(200)), null, "too long");
  assert.equal(parseCridQuestion(""), null);
  assert.equal(parseCridQuestion(null), null);
});

function mockFetch(responder) {
  return async (url) => {
    const out = responder(String(url));
    if (out == null) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => out };
  };
}

test("fetchGroundedFact: Brave wins when keyed, DDG next, Wikipedia last", async () => {
  const brave = mockFetch((u) =>
    u.includes("api.search.brave.com")
      ? { web: { results: [{ title: "T", description: "Brave says <b>42</b>.", url: "https://www.example.com/a" }] } }
      : null);
  process.env.BRAVE_SEARCH_API_KEY = "test-key";
  try {
    const hit = await fetchGroundedFact("meaning of life", { fetchImpl: brave });
    assert.equal(hit.source, "example.com");
    assert.match(hit.snippet, /42/);
    assert.ok(!/<b>/.test(hit.snippet), "html stripped");
  } finally {
    delete process.env.BRAVE_SEARCH_API_KEY;
  }

  const ddg = mockFetch((u) =>
    u.includes("api.duckduckgo.com")
      ? { AbstractText: "The capital of Nigeria is Abuja.", Heading: "Nigeria", AbstractSource: "Wikipedia" }
      : u.includes("wikipedia.org")
        ? { type: "standard", title: "Nigeria", extract: "Nigeria is a country." }
        : null);
  const hit2 = await fetchGroundedFact("capital of Nigeria", { fetchImpl: ddg });
  assert.equal(hit2.snippet, "The capital of Nigeria is Abuja.");
  assert.equal(hit2.source, "Wikipedia");

  const wikiOnly = mockFetch((u) =>
    u.includes("wikipedia.org") ? { type: "standard", title: "X", extract: "Extract sentence one. Sentence two." } : null);
  const hit3 = await fetchGroundedFact("what is quokka", { fetchImpl: wikiOnly });
  assert.equal(hit3.snippet, "Extract sentence one.", "first sentence only");
  assert.equal(hit3.source, "Wikipedia");

  const none = mockFetch(() => null);
  assert.equal(await fetchGroundedFact("anything", { fetchImpl: none }), null);
});

function harness(fetchImpl) {
  let t = Date.UTC(2024, 5, 15, 14);
  const memory = new SessionMemory({ now: () => t });
  const bus = new CommandBus({ now: () => t });
  const engine = new InitiativeEngine({
    memory, personality: loadPersonality(), bus, now: () => t, log: () => {}, random: () => 0,
  });
  const emitted = [];
  bus.onCommand((c) => emitted.push(c));
  const lookup = createLookupHandler(engine, { fetchImpl, log: () => {}, random: () => 0 });
  return { engine, memory, bus, emitted, lookup, advance: (ms) => (t += ms) };
}

test("maybeAnswer: thinking beat first, then card+say with the grounded answer", async () => {
  const fetchImpl = mockFetch((u) =>
    u.includes("duckduckgo") ? { AbstractText: "Abuja is the capital of Nigeria.", Heading: "Nigeria", AbstractSource: "Wikipedia" } : null);
  const h = harness(fetchImpl);
  const evt = { id: "q1", type: "chat", ts: h.engine.now(), user: "ada", text: "@crid what is the capital of Nigeria?", amount: 0 };
  const fired = await h.lookup.maybeAnswer(evt);
  assert.equal(fired, true);
  const types = h.emitted.map((c) => c.type);
  assert.ok(types.includes("look"), "he looks at chat");
  assert.ok(types.includes("express"), "thinking face");
  assert.ok(types.includes("card"), "answer card");
  assert.ok(types.includes("say"), "spoken answer");
  const card = h.emitted.find((c) => c.type === "card");
  assert.equal(card.payload.art, "lookup");
  const say = h.emitted.find((c) => c.type === "say" && /abuja/i.test(c.payload.text));
  assert.ok(say, "answer line mentions the fact");
  assert.ok(!/as an ai|according to my search/i.test(say.payload.text), "no AI boilerplate");
  assert.ok(h.memory.actions.some((a) => a.rule === "web-lookup"), "lookup logged as an action");
});

test("maybeAnswer: no hit means he says so and never guesses", async () => {
  const h = harness(mockFetch(() => null));
  const fired = await h.lookup.maybeAnswer({ id: "q2", type: "chat", ts: h.engine.now(), user: "ada", text: "@crid what is the airspeed velocity?", amount: 0 });
  assert.equal(fired, false);
  const say = h.emitted.find((c) => c.type === "say");
  assert.ok(say && /not guessing/i.test(say.payload.text));
  assert.ok(!h.emitted.some((c) => c.type === "card"), "no fabricated card");
});

test("maybeAnswer: non-questions and cooldown do not fire", async () => {
  const h = harness(mockFetch(() => ({ AbstractText: "fact.", Heading: "h" })));
  assert.equal(await h.lookup.maybeAnswer({ type: "chat", ts: 1, user: "a", text: "hello chat", amount: 0 }), false);
  assert.equal(await h.lookup.maybeAnswer({ type: "chat", ts: 1, user: "a", text: "@crid what is x?", amount: 0 }), true);
  // immediate second question inside the 15s cooldown is refused
  assert.equal(await h.lookup.maybeAnswer({ type: "chat", ts: 2, user: "b", text: "@crid what is y?", amount: 0 }), false);
});
