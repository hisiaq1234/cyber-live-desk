// Run with: node --test
// The chat command rules live in the browser asset so the controller and these tests read the
// same source. A rule that decides who may move cards on air is not something to leave untested.
import { test } from "node:test";
import assert from "node:assert/strict";

import { COMMAND_HELP, chatMayCommand, parseAllowIds, parseDeskCommand, parsePollSpec, validatePollDraft } from "../public/desk-assets/desk-commands.js";
import { commandBody as serverCommandBody, parseDeskCommand as parseServerDeskCommand } from "../api/_commands.mjs";
import { commandBody as publicCommandBody, parseDeskCommand as parsePublicDeskCommand } from "../public/desk-assets/_commands.mjs";

test("every shape the streamer actually types is a command", () => {
  for (const line of ["desk next", "desknext", "!desknext", "!desk next", "DESK_NEXT", "desk  next", "/desk next"]) {
    assert.deepEqual(parseDeskCommand(line), { verb: "next" }, line);
  }
  assert.deepEqual(parseDeskCommand("desk prev"), { verb: "prev" });
  assert.deepEqual(parseDeskCommand("deskprevious"), { verb: "prev" }, "previous folds into prev");
  assert.deepEqual(parseDeskCommand("desk hold"), { verb: "hold" });
  assert.deepEqual(parseDeskCommand("desk hide"), { verb: "hide" });
  assert.deepEqual(parseDeskCommand("desk stop"), { verb: "stop" });
});

test("a desk name becomes a desk command, and junk does not become one", () => {
  assert.deepEqual(parseDeskCommand("desk music"), { verb: "desk", desk: "music" });
  assert.deepEqual(parseDeskCommand("desk streamers"), { verb: "desk", desk: "streamers" });
  assert.deepEqual(parseDeskCommand("deskall"), { verb: "desk", desk: "all" }, "all is how you leave a desk");
  for (const line of ["next", "desk next after this one", "what desk next", "desk", "desk music later please", "desks next"]) {
    assert.equal(parseDeskCommand(line), null, `${line} is ordinary chat`);
  }
});

test("auto is only ever on or off", () => {
  assert.deepEqual(parseDeskCommand("desk auto on"), { verb: "auto", value: "on" });
  assert.deepEqual(parseDeskCommand("desk AUTO off"), { verb: "auto", value: "off" });
  assert.equal(parseDeskCommand("desk auto"), null);
  assert.equal(parseDeskCommand("desk auto maybe"), null);
});

test("a poll command takes a question and up to three options", () => {
  assert.deepEqual(parseDeskCommand("desk poll"), { verb: "poll", question: "", options: ["Yes", "No"] });
  assert.deepEqual(parseDeskCommand("desk poll Do you stream daily?"), { verb: "poll", question: "Do you stream daily?", options: ["Yes", "No"] });
  assert.deepEqual(parseDeskCommand("desk poll Which desk?|Music|Creators"), { verb: "poll", question: "Which desk?", options: ["Music", "Creators"] });
  assert.deepEqual(parsePollSpec("Pick|A|B|C|D").options, ["A", "B", "C"], "never more than three");
  assert.deepEqual(parsePollSpec("One option only|Maybe"), { question: "One option only|Maybe", options: ["Yes", "No"] }, "one option is not a poll");
});

test("the poll form needs two or three distinct short answers and never a card message", () => {
  assert.deepEqual(
    validatePollDraft("  Who wins? ", [" Yes ", "No", ""]),
    { question: "Who wins?", options: ["Yes", "No"], error: null },
  );
  assert.equal(validatePollDraft("", ["A", "B"]).error, null, "a blank question uses the card's question");
  assert.match(validatePollDraft("Q", ["Only one"]).error, /at least two/i);
  assert.match(validatePollDraft("Q", ["A", "A"]).error, /different/i);
  assert.match(validatePollDraft("Q", ["A", "B", "C", "D"]).error, /at most three/i);
  assert.match(validatePollDraft("Q", ["A".repeat(41), "B"]).error, /40 characters/i);
  assert.match(validatePollDraft("q".repeat(141), ["A", "B"]).error, /140 characters/i);
  assert.equal(validatePollDraft("Q", ["A", "B", "C"]).options.length, 3);
});

test("only the broadcaster or an allowed user id can move the desk", () => {
  const bc = { badges: "broadcaster/1,subscriber/012", "badge-info": "", "user-id": "111" };
  const mod = { badges: "moderator/1,subscriber/00", "badge-info": "", "user-id": "222" };
  const viewer = { badges: "", "badge-info": "", "user-id": "333" };
  assert.deepEqual(chatMayCommand(bc, { enabled: true, allowIds: [] }), { ok: true, as: "broadcaster" });
  assert.deepEqual(chatMayCommand(viewer, { enabled: true, allowIds: ["333"] }), { ok: true, as: "allowlist" });
  assert.equal(chatMayCommand(mod, { enabled: true, allowIds: [] }).ok, false, "a moderator is not you");
  assert.equal(chatMayCommand(viewer, { enabled: true, allowIds: ["999"] }).ok, false);
  assert.equal(chatMayCommand(bc, { enabled: false, allowIds: ["111"] }).ok, false, "off means off, even for you");
  assert.equal(chatMayCommand({ "user-id": "" }, { enabled: true, allowIds: [""] }).ok, false, "no id, no match");
});

test("allowlist ids survive the way a person types them", () => {
  assert.deepEqual(parseAllowIds("12345, 6789\n42  and 7"), ["12345", "6789", "42", "7"]);
  assert.deepEqual(parseAllowIds(""), []);
  assert.deepEqual(parseAllowIds("no digits here"), []);
});

test("the help line names the verbs the parser knows", () => {
  for (const verb of ["next", "prev", "hold", "hide", "poll", "auto", "all"]) assert.ok(COMMAND_HELP.includes(verb), verb);
});

test("server and browser parser copies agree, and unsupported research aliases have no action", () => {
  const lines = [
    "desk next", "desk previous", "desk hold", "desk hide", "desk stop", "desk all",
    "desk poll Q|A|B", "desk auto on", "desk music", "desk research", "desk refresh", "ordinary chat",
  ];
  for (const line of lines) assert.deepEqual(parseServerDeskCommand(line), parsePublicDeskCommand(line), line);

  for (const line of ["desk research", "desk refresh"]) {
    const serverCommand = parseServerDeskCommand(line);
    assert.deepEqual(serverCommand, { verb: "research" });
    assert.equal(serverCommandBody(serverCommand), null);
    assert.equal(publicCommandBody(parsePublicDeskCommand(line)), null);
  }
});
