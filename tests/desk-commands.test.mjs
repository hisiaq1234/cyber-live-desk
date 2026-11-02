// Run with: node --test
// The chat command rules live in the browser asset so the controller and these tests read the
// same source. A rule that decides who may move cards on air is not something to leave untested.
import { test } from "node:test";
import assert from "node:assert/strict";

import { COMMAND_HELP, chatMayCommand, commandText, parseAllowIds, parseDeskCommand, parsePollSpec, validatePollDraft } from "../public/desk-assets/desk-commands.js";
import { commandBody as serverCommandBody, commandText as serverCommandText, parseDeskCommand as parseServerDeskCommand } from "../api/_commands.mjs";
import { commandBody as publicCommandBody, commandText as publicCommandText, parseDeskCommand as parsePublicDeskCommand } from "../public/desk-assets/_commands.mjs";

test("every shape the streamer actually types is a command", () => {
  for (const line of ["crid next", "cridnext", "!cridnext", "!crid next", "CRID_NEXT", "crid  next", "/crid next"]) {
    assert.deepEqual(parseDeskCommand(line), { verb: "next" }, line);
  }
  assert.deepEqual(parseDeskCommand("crid prev"), { verb: "prev" });
  assert.deepEqual(parseDeskCommand("cridprevious"), { verb: "prev" }, "previous folds into prev");
  assert.deepEqual(parseDeskCommand("crid hold"), { verb: "hold" });
  assert.deepEqual(parseDeskCommand("crid hide"), { verb: "hide" });
  assert.deepEqual(parseDeskCommand("crid stop"), { verb: "stop" });
});

test("a desk name becomes a desk command, and junk does not become one", () => {
  assert.deepEqual(parseDeskCommand("crid music"), { verb: "desk", desk: "music" });
  assert.deepEqual(parseDeskCommand("crid streamers"), { verb: "desk", desk: "streamers" });
  assert.deepEqual(parseDeskCommand("cridall"), { verb: "desk", desk: "all" }, "all is how you leave a desk");
  for (const line of ["next", "crid next after this one", "what desk next", "crid", "crid music later please", "crids next", "desk next", "desk music"]) {
    assert.equal(parseDeskCommand(line), null, `${line} is ordinary chat`);
  }
});

test("auto is only ever on or off", () => {
  assert.deepEqual(parseDeskCommand("crid auto on"), { verb: "auto", value: "on" });
  assert.deepEqual(parseDeskCommand("crid AUTO off"), { verb: "auto", value: "off" });
  assert.equal(parseDeskCommand("crid auto"), null);
  assert.equal(parseDeskCommand("crid auto maybe"), null);
});

test("a poll command takes a question and up to three options", () => {
  assert.deepEqual(parseDeskCommand("crid poll"), { verb: "poll", question: "", options: ["Yes", "No"] });
  assert.deepEqual(parseDeskCommand("crid poll Do you stream daily?"), { verb: "poll", question: "Do you stream daily?", options: ["Yes", "No"] });
  assert.deepEqual(parseDeskCommand("crid poll Which desk?|Music|Creators"), { verb: "poll", question: "Which desk?", options: ["Music", "Creators"] });
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
  assert.ok(COMMAND_HELP.includes("crid "));
  assert.ok(COMMAND_HELP.includes("queued track"));
});

test("server and browser parser copies agree; private research verbs never map to a chat action", () => {
  const lines = [
    "crid next", "crid previous", "crid hold", "crid hide", "crid stop", "crid all",
    "crid poll Q|A|B", "crid auto on", "crid music", "crid music play", "crid music play Burna Boy",
    "crid music pause", "crid music next", "crid music stop", "crid research", "crid research Lagos TikTok trends",
    "crid deeper", "crid deeper local impact", "crid refresh", "crid read", "crid quiet", "ordinary chat", "desk next",
  ];
  for (const line of lines) assert.deepEqual(parseServerDeskCommand(line), parsePublicDeskCommand(line), line);

  for (const line of ["crid research", "crid research Lagos TikTok trends", "crid deeper", "crid deeper local impact", "crid refresh", "crid read", "crid quiet"]) {
    const serverCommand = parseServerDeskCommand(line);
    assert.ok(serverCommand);
    assert.equal(serverCommandBody(serverCommand), null);
    assert.equal(publicCommandBody(parsePublicDeskCommand(line)), null);
    assert.equal(commandText(serverCommand), serverCommandText(serverCommand));
    assert.equal(commandText(serverCommand), publicCommandText(parsePublicDeskCommand(line)));
  }
  assert.deepEqual(parseServerDeskCommand("crid research Lagos TikTok trends"), { verb: "research", topic: "Lagos TikTok trends" });
  assert.deepEqual(parseServerDeskCommand("crid deeper local creator impact"), { verb: "deeper", focus: "local creator impact" });
  assert.deepEqual(parseServerDeskCommand("crid music play Burna Boy"), { verb: "music", action: "play", query: "Burna Boy" });
  assert.deepEqual(serverCommandBody(parseServerDeskCommand("crid music play Burna Boy")), { action: "music-play", query: "Burna Boy" });
  assert.deepEqual(serverCommandBody(parseServerDeskCommand("crid music next")), { action: "music-next" });
  assert.equal(commandText(parseServerDeskCommand("crid music play Burna Boy")), "crid music play Burna Boy");
  assert.equal(parseServerDeskCommand(`crid music play ${"x".repeat(121)}`), null, "overlong music queries are refused");
  assert.equal(parseServerDeskCommand(`crid research ${"x".repeat(121)}`), null, "overlong voice topics are refused, not silently truncated");
  assert.equal(parseServerDeskCommand(`crid deeper ${"x".repeat(121)}`), null, "overlong focus angles are refused");
});
