/* CYBER LIVE DESK — chat command rules.
   No DOM in here on purpose: the controller imports this file and so do the tests, so the rule
   that decides who may move your on-air cards is the one rule on this page that is proven. */

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

// Anonymous Twitch chat still tags every message with the sender's badges and user id, so the
// gate does not need a bot account: your own account is recognised by the broadcaster badge, and
// anyone else you trust by the numeric user id you typed in. Moderators are NOT enough — a mod
// you gave to another channel would otherwise be able to drive this desk.
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
