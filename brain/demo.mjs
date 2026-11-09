/* Demo source — synthetic chat and events on a timer.
 *
 * `npm run brain -- --demo` runs the whole brain (memory, rules, command bus, overlay)
 * against this instead of Twitch, so Crid can be judged without a live channel. It
 * emits through exactly the same normalised event shape as the IRC client, so what you
 * see in demo is what the real thing does.
 *
 * The script is written to exercise every rule in turn, and to include a real lull so
 * the unprompted rules (silence, musing, "while you were gone") actually fire.
 */

const USERS = ["dave", "nova", "pixel", "mira", "joss", "kay", "reg", "tamsin", "yusuf", "bo"];
const CHATTER = [
  "that was clean",
  "no way that worked",
  "chat is this real",
  "he's doing it again",
  "hold on hold on",
  "that's a bug surely",
  "lag?",
  "clutch",
  "we're so back",
  "it's so over",
  "one more run",
  "he always does this",
  "someone clip that",
  "gg",
  "rip",
  "the menu again",
  "third time's the charm",
  "not the side quest",
];
const TOPIC_CHATTER = [
  "boss phase two is brutal",
  "the boss telegraphs that, just watch the boss",
  "boss again? we've done the boss",
  "that boss has one move and it's unfair",
  "boss is fine, the camera is the boss",
];

export function createDemoSource({ onEvent = () => {}, log = () => {}, random = Math.random } = {}) {
  let timers = [];
  let stopped = true;
  let quietUntil = 0;
  let cycleStart = 0;
  let cursor = 0;
  let fillerTimer = null;

  const now = () => Date.now();
  const pick = (list) => list[Math.floor(random() * list.length)];
  let seq = 0;
  const event = (type, extra = {}) => ({
    id: `demo${++seq}`,
    ts: now(),
    type,
    user: "someone",
    text: "",
    amount: 0,
    tier: null,
    months: 0,
    streak: 0,
    viewers: 0,
    detail: "",
    ...extra,
  });

  const chat = (user, text) => onEvent(event("chat", { user, text }));

  function schedule(fn, ms) {
    const t = setTimeout(() => {
      try {
        fn();
      } catch (err) {
        log(`[demo] step failed: ${err.message}`);
      }
    }, Math.max(0, ms));
    timers.push(t);
    return t;
  }

  // A scripted pass through every rule. Offsets are ms from the start of the cycle.
  const STEPS = [
    { at: 300, run: () => log("[demo] stream is live — Crid is on the desk, nobody has typed yet") },
    { at: 1600, run: () => chat("dave", "yo") },
    { at: 5200, run: () => chat("nova", "he's back") },
    { at: 7600, run: () => chat("pixel", "the lag is unreal") }, // keyword: lag
    { at: 12000, run: () => log("[demo] chat spike") },
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({
      at: 12200 + i * 320,
      run: () => chat(["dave", "nova", "mira", "joss", "kay"][i % 5], CHATTER[i % CHATTER.length]),
    })),
    { at: 19000, run: () => onEvent(event("sub", { user: "dave", months: 3, tier: "1000", detail: "resub 3 months", text: "" })) },
    { at: 25000, run: () => onEvent(event("gift", { user: "nova", amount: 5, tier: "1000", detail: "5 gifted subs" })) },
    { at: 31000, run: () => onEvent(event("bits", { user: "pixel", amount: 500, detail: "500 bits" })) },
    ...[0, 1, 2, 3, 4].map((i) => ({
      at: 37000 + i * 1400,
      run: () => chat(["mira", "joss", "kay", "reg", "tamsin"][i], TOPIC_CHATTER[i % TOPIC_CHATTER.length]),
    })),
    { at: 46000, run: () => log("[demo] the chat goes quiet — unprompted rules have the floor") },
    { at: 47000, run: () => (quietUntil = now() + 50000) },
    // things still happen while nobody is talking: that is what "while you were gone" is built from
    { at: 53000, run: () => onEvent(event("sub", { user: "kay", months: 1, tier: "1000", detail: "new sub", text: "" })) },
    { at: 59000, run: () => onEvent(event("gift", { user: "reg", amount: 2, tier: "1000", detail: "2 gifted subs" })) },
    { at: 96000, run: () => onEvent(event("raid", { user: "mira", viewers: 240, amount: 240, detail: "raid with 240 viewers" })) },
    { at: 100000, run: () => (quietUntil = 0) },
  ];

  function runStep() {
    if (stopped) return;
    const step = STEPS[cursor];
    const at = cycleStart + step.at;
    const delay = at - now();
    timers.push(
      schedule(() => {
        step.run();
        cursor += 1;
        if (cursor >= STEPS.length) {
          cursor = 0;
          cycleStart = now();
        }
        runStep();
      }, delay),
    );
  }

  function filler() {
    if (stopped) return;
    if (now() >= quietUntil) {
      // ambient chatter, weighted to feel like a small channel
      if (random() < 0.75) chat(pick(USERS), pick(CHATTER));
    }
    const wait = 1400 + Math.floor(random() * 2200);
    fillerTimer = setTimeout(filler, wait);
    timers.push(fillerTimer);
  }

  return {
    start() {
      stopped = false;
      cycleStart = now();
      cursor = 0;
      runStep();
      // let the scripted opening land before ambient chatter joins in
      timers.push(setTimeout(filler, 3200));
      return this;
    },
    stop() {
      stopped = true;
      for (const t of timers) clearTimeout(t);
      timers = [];
      clearTimeout(fillerTimer);
    },
    get stopped() {
      return stopped;
    },
  };
}

/** Small deterministic PRNG, so `--demo --seed 42` replays the same show. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
