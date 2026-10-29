/* CYBER LIVE DESK — shared chat command rules.
   No DOM in here on purpose: the controller imports this file for the command help and poll
   validation, and the tests pin the parser against the server copy so the two can never drift. */

// "desk" then the verb, glued, spaced, dashed or underscored: desknext, desk next, !desk_next.
// A message must start with it, so nobody's ordinary chat line becomes a command by accident.
const COMMAND = /^[!/]?\s*desk[-_ ]*([a-z]+)\b(.*)$/i;

const NO_ARG = new Set(["next", "prev", "previous", "hold", "hide", "stop"]);
const LEAVE_DESK = new Set(["all", "clear"]);

// One command, or null when the line is not a command at all. Trailing words after a verb that
// takes none (desk next after this one) are refused rather than guessed at: on air, a command
// that fires when nobody meant it is worse than one that is ignored.
export function parseDeskCommand(line) {
  const m = String(line ?? "").trim().match(COMMAND);
  if (!m) return null;
  const verb = m[1].toLowerCase();
  const rest = m[2].trim();

  if (NO_ARG.has(verb)) return rest ? null : { verb: verb === "previous" ? "prev" : verb };
  if (LEAVE_DESK.has(verb)) return rest ? null : { verb: "desk", desk: "all" };
  if (verb === "poll") return { verb: "poll", ...parsePollSpec(rest) };
  if (verb === "auto") {
    const value = /^(on|off)$/i.test(rest) ? rest.toLowerCase() : null;
    return value ? { verb: "auto", value } : null;
  }
  if (verb === "desk" || rest) return null;
  // Anything else is a desk name. Which names exist is the server's list, so an invented one
  // comes back as a refusal in the log instead of being silently swallowed here.
  return { verb: "desk", desk: verb };
}

// desk poll                       → the on-air card's question, Yes/No
// desk poll <question>             → that question, Yes/No
// desk poll <question>|<a>|<b>[|<c>] → those options (the server takes 2 or 3, 40 chars each)
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

// Legacy tab-side gate, kept because the parser tests still exercise it. Production command
// authorization lives in netlify/functions/_twitch-core.mjs: EventSub supplies a stable
// chatter_user_id, and a moderator badge or display name is never accepted as identity.
export function chatMayCommand(tags, { enabled = false, allowIds = [] } = {}) {
  if (!enabled) return { ok: false, reason: "chat control is off" };
  const badges = `${tags?.["badge-info"] ?? ""},${tags?.badges ?? ""}`;
  if (/(^|,)broadcaster\/1/.test(badges)) return { ok: true, as: "broadcaster" };
  const id = String(tags?.["user-id"] ?? "").trim();
  if (id && allowIds.includes(id)) return { ok: true, as: "allowlist" };
  return { ok: false, reason: id ? `${id} is not on the allowlist` : "no user id on the message" };
}

// Twitch user ids are digits, so anything that is not a digit is a separator. Typing "and",
// spaces or newlines between ids is allowed on purpose.
export const parseAllowIds = (text) => String(text ?? "").split(/[^0-9]+/).filter(Boolean);

export const COMMAND_HELP =
  "desk next · desk prev · desk hold · desk hide · desk stop · desk poll <question>|<a>|<b> · " +
  "desk auto on|off · desk music · desk streamers · desk movies · desk politics · desk business · desk trends · desk all";
