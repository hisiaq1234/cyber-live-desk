// CYBER LIVE DESK — shared chat command rules.
// Single source of truth for command parsing, used by both the browser controller
// (public/desk-assets/desk-commands.js) and the Twitch EventSub webhook
// (api/_twitch-core.mjs). Pure JS: no Node imports, no DOM, so the
// same file runs in both environments.

// "crid" then the verb, glued, spaced, dashed or underscored: cridnext, crid next, !crid_next.
// A message must start with it, so nobody's ordinary chat line becomes a command by accident.
const COMMAND = /^[!/]?\s*crid[-_ ]*([a-z]+)\b(.*)$/i;
const NO_ARG = new Set(["next", "prev", "previous", "hold", "hide", "stop", "refresh", "read", "quiet"]);
const LEAVE_DESK = new Set(["all", "clear"]);
// CRID, the mascot. Restated here rather than imported from _desk-core.mjs because this module is
// also served to the browser, which cannot reach the api directory; the commands test asserts the
// two lists still agree.
export const BOT_REACTS = ["wave", "cheer", "think", "surprise", "wince", "nod", "shrug"];

// The Thought War deck's category, restated here for the same reason as BOT_REACTS: this module is
// served to the browser, which cannot reach scripts/thought-war-deck.mjs. The commands test
// asserts it still matches the deck.
export const THOUGHT_WAR_CATEGORY = "thought-war";

// The lockup is placed by eye, so chat gets the words a streamer actually says out loud. The
// six codes are the ones the server stores (see LOGO_POSITIONS in _desk-core.mjs); the commands
// test asserts this map only ever points at names the server accepts.
export const LOGO_POSITION_WORDS = {
  top: "tc", bottom: "bc", topleft: "tl", topright: "tr", bottomleft: "bl", bottomright: "br",
  tl: "tl", tc: "tc", tr: "tr", bl: "bl", bc: "bc", br: "br",
};

// One command, or null when the line is not a command at all. Trailing words after a verb that
// takes none (crid next after this one) are refused rather than guessed at: on air, a command
// that fires when nobody meant it is worse than one that is ignored.
export function parseDeskCommand(line) {
  const m = String(line ?? "").trim().match(COMMAND);
  if (!m) return null;
  const verb = m[1].toLowerCase();
  const rest = m[2].trim();

  if (NO_ARG.has(verb)) return rest ? null : { verb: verb === "previous" ? "prev" : verb };
  if (LEAVE_DESK.has(verb)) return rest ? null : { verb: "desk", desk: "all" };
  if (verb === "deeper") return rest.length <= 120 ? { verb, focus: rest } : null;
  if (verb === "research") return rest.length <= 120 ? { verb, topic: rest } : null;
  if (verb === "poll") return { verb: "poll", ...parsePollSpec(rest) };
  if (verb === "auto") {
    const value = /^(on|off)$/i.test(rest) ? rest.toLowerCase() : null;
    return value ? { verb: "auto", value } : null;
  }
  if (verb === "music") {
    // Preserve the existing category filter: "crid music" still selects the Music desk.
    if (!rest) return { verb: "desk", desk: "music" };
    const match = rest.match(/^(play|pause|next|stop|off)(?:\s+(.*))?$/i);
    if (!match) return null;
    const requested = match[1].toLowerCase();
    const action = requested === "off" ? "stop" : requested;
    const query = (match[2] ?? "").trim();
    if (query.length > 120 || (query && action !== "play")) return null;
    return { verb: "music", action, ...(query ? { query } : {}) };
  }
  if (verb === "bot") {
    // A bare "crid bot" flips it, which is exactly what the dashboard's single button posts.
    if (!rest) return { verb: "bot" };
    const asked = rest.toLowerCase();
    if (asked === "on" || asked === "off") return { verb: "bot", value: asked };
    return BOT_REACTS.includes(asked) ? { verb: "bot", react: asked } : null;
  }
  if (verb === "logo") {
    // Which layers take part stays on the panel: nobody asks for "just the rule" out loud, and a
    // chat line that quietly removes the wordmark mid-show is exactly the accident this gate is
    // here to prevent.
    if (!rest) return { verb: "logo" };
    const asked = rest.toLowerCase().replace(/[\s_-]+/g, "");
    if (asked === "on" || asked === "off") return { verb: "logo", value: asked };
    if (asked === "big" || asked === "small") return { verb: "logo", size: asked };
    if (asked === "replay" || asked === "again") return { verb: "logo", replay: true };
    // The mascot. Both words are the mark's own name, not an abstraction, so nobody has to
    // remember which of goat/bot is "the other one".
    if (asked === "goat" || asked === "bot") return { verb: "logo", mark: asked };
    const pos = LOGO_POSITION_WORDS[asked];
    return pos ? { verb: "logo", pos } : null;
  }
  // Thought War: one word pulls a random dilemma off the deck. "crid random" shuffles whatever
  // desk is already on instead, so the operator can draw from Politics or the whole queue.
  if (verb === "thought") return rest ? null : { verb: "draw", category: THOUGHT_WAR_CATEGORY };
  if (verb === "random") return rest ? null : { verb: "draw" };
  if (verb === "desk" || rest) return null;
  // Anything else is a desk name. Which names exist is the server's list, so an invented one
  // comes back as a refusal in the log instead of being silently swallowed here.
  return { verb: "desk", desk: verb };
}

// crid poll                       → the on-air card's question, Yes/No
// crid poll <question>             → that question, Yes/No
// crid poll <question>|<a>|<b>[|<c>] → those options (the server takes 2 or 3, 40 chars each)
export function parsePollSpec(rest) {
  const raw = String(rest ?? "").trim();
  if (!raw.includes("|")) return { question: raw.slice(0, 140), options: ["Yes", "No"] };
  const [question, ...options] = raw.split("|").map((s) => s.trim()).filter(Boolean);
  const opts = options.slice(0, 3);
  if (!question || opts.length < 2) return { question: raw.slice(0, 140), options: ["Yes", "No"] };
  return { question: question.slice(0, 140), options: opts.map((o) => o.slice(0, 40)) };
}

// The dashboard's poll form validates here, not in the card path. A poll with one answer or a
// repeated answer is a poll problem, so the message is shown beside the poll fields and card
// creation is never involved. The question may be blank because the server falls back to the
// question of the card on screen. Returns { question, options, error } with error null on success.
export function validatePollDraft(question, options) {
  const q = String(question ?? "").trim();
  const opts = (Array.isArray(options) ? options : [options])
    .map((o) => String(o ?? "").trim())
    .filter(Boolean);
  if (q.length > 140) return { error: "The poll question must be 140 characters or fewer." };
  if (opts.length < 2) return { error: "Add at least two answers, one per box." };
  if (opts.length > 3) return { error: "A poll takes at most three answers." };
  const tooLong = opts.find((o) => o.length > 40);
  if (tooLong) return { error: `Keep each answer to 40 characters. "${tooLong.slice(0, 24)}…" is too long.` };
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) {
    return { error: "Each answer must be different." };
  }
  return { question: q, options: opts, error: null };
}

// Twitch user ids are digits, so anything that is not a digit is a separator. Typing "and",
// spaces or newlines between ids is allowed on purpose.
export const parseAllowIds = (text) => String(text ?? "").split(/[^0-9]+/).filter(Boolean);

// Legacy tab-side gate, kept because the parser tests still exercise it. Production command
// authorization lives in api/_twitch-core.mjs: EventSub supplies a stable
// chatter_user_id, and a moderator badge or display name is never accepted as identity.
export function chatMayCommand(tags, { enabled = false, allowIds = [] } = {}) {
  if (!enabled) return { ok: false, reason: "chat control is off" };
  const badges = `${tags?.["badge-info"] ?? ""},${tags?.badges ?? ""}`;
  if (/(^|,)broadcaster\/1/.test(badges)) return { ok: true, as: "broadcaster" };
  const id = String(tags?.["user-id"] ?? "").trim();
  if (id && allowIds.includes(id)) return { ok: true, as: "allowlist" };
  return { ok: false, reason: id ? `${id} is not on the allowlist` : "no user id on the message" };
}

export const COMMAND_HELP =
  "crid next · crid prev · crid hold · crid hide · crid stop · crid poll <question>|<a>|<b> · " +
  "crid thought · crid random · " +
  "crid auto on|off · crid music · crid music play [song or artist; unique queued track first, YouTube search on miss if configured; bare play uses default] · crid music pause|next|stop · " +
  `crid bot on|off · crid bot ${BOT_REACTS.join("|")} · ` +
  "crid logo on|off · crid logo top|bottom|topleft|topright|bottomleft|bottomright · crid logo big|small · crid logo replay · crid logo goat|bot · " +
  "crid streamers · crid movies · crid politics · crid business · crid trends · crid all";

// Maps only implemented commands. Recognized-but-unimplemented verbs must never become
// `{ action: undefined }`, which obscures rejection at the voice and EventSub boundaries.
export const commandBody = (cmd) => {
  if (cmd.verb === "poll") return { action: "start-poll", question: cmd.question, options: cmd.options };
  if (cmd.verb === "draw") return { action: "draw", ...(cmd.category ? { category: cmd.category } : {}) };
  if (cmd.verb === "auto") return { action: "auto-play", value: cmd.value === "on" };
  if (cmd.verb === "desk") return { action: "desk", desk: cmd.desk };
  if (cmd.verb === "music") {
    const action = { play: "music-play", pause: "music-pause", next: "music-next", stop: "music-stop" }[cmd.action];
    return action ? { action, ...(cmd.query ? { query: cmd.query } : {}) } : null;
  }
  if (cmd.verb === "bot") {
    if (cmd.react) return { action: "bot-react", kind: cmd.react };
    return { action: "bot", ...(cmd.value ? { value: cmd.value === "on" } : {}) };
  }
  if (cmd.verb === "logo") {
    const body = { action: "logo" };
    if (cmd.value) body.value = cmd.value === "on";
    if (cmd.pos) body.pos = cmd.pos;
    if (cmd.mark) body.mark = cmd.mark;
    if (cmd.size) body.size = cmd.size;
    if (cmd.replay) body.replay = true;
    return body;
  }
  const action = { next: "next", prev: "previous", hold: "hold", hide: "hide", stop: "end-poll" }[cmd.verb];
  return action ? { action } : null;
};

// Human-readable form of a command, for logs and status displays.
export const commandText = (cmd) =>
  cmd.verb === "poll" ? `crid poll ${cmd.question || "(card question)"}`
    : cmd.verb === "draw" ? `crid ${cmd.category === THOUGHT_WAR_CATEGORY ? "thought" : "random"}`
    : cmd.verb === "auto" ? `crid auto ${cmd.value}`
    : cmd.verb === "desk" ? `crid ${cmd.desk}`
    : cmd.verb === "music" ? `crid music ${cmd.action}${cmd.query ? ` ${cmd.query}` : ""}`
    : cmd.verb === "bot" ? `crid bot${cmd.react ? ` ${cmd.react}` : cmd.value ? ` ${cmd.value}` : ""}`
    : cmd.verb === "logo"
      ? `crid logo${cmd.value ? ` ${cmd.value}` : cmd.pos ? ` ${cmd.pos}` : cmd.mark ? ` ${cmd.mark}` : cmd.size ? ` ${cmd.size}` : cmd.replay ? " replay" : ""}`
    : cmd.verb === "research" ? `crid research ${cmd.topic ?? ""}`.trim()
    : cmd.verb === "deeper" ? `crid deeper ${cmd.focus ?? ""}`.trim()
    : `crid ${cmd.verb}`;

// Vercel makes a function out of every file in the api directory. This module is imported by
// _twitch-core.mjs and desk-commands.js, so it refuses a direct request instead of half-working.
export default () =>
  new Response(JSON.stringify({ error: "Internal module. Import parseDeskCommand, parsePollSpec, validatePollDraft, parseAllowIds, chatMayCommand, COMMAND_HELP instead." }), {
    status: 501,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
