import { test } from "node:test";
import assert from "node:assert/strict";
import { deskHotkeyAction } from "../public/desk-assets/desk-hotkeys.js";

const key = (code, overrides = {}) => ({
  code,
  repeat: false,
  ctrlKey: true,
  shiftKey: true,
  altKey: false,
  metaKey: false,
  defaultPrevented: false,
  isComposing: false,
  ...overrides,
});

test("transport shortcuts map only the explicit next, previous, and hold combinations", () => {
  assert.equal(deskHotkeyAction(key("ArrowRight"), { enabled: true }), "next");
  assert.equal(deskHotkeyAction(key("ArrowLeft"), { enabled: true }), "previous");
  assert.equal(deskHotkeyAction(key("Space"), { enabled: true }), "hold");
  assert.equal(deskHotkeyAction(key("Escape"), { enabled: true }), null);
});

test("ordinary keys, alternate modifiers, repeated keys, editing, and open sheets are ignored", () => {
  const enabled = { enabled: true };
  assert.equal(deskHotkeyAction(key("ArrowRight", { ctrlKey: false }), enabled), null);
  assert.equal(deskHotkeyAction(key("ArrowRight", { altKey: true }), enabled), null);
  assert.equal(deskHotkeyAction(key("ArrowRight", { metaKey: true }), enabled), null);
  assert.equal(deskHotkeyAction(key("ArrowRight", { repeat: true }), enabled), null);
  assert.equal(deskHotkeyAction(key("ArrowRight", { defaultPrevented: true }), enabled), null);
  assert.equal(deskHotkeyAction(key("ArrowRight", { isComposing: true }), enabled), null);
  assert.equal(deskHotkeyAction(key("ArrowRight"), { ...enabled, editable: true }), null);
  assert.equal(deskHotkeyAction(key("ArrowRight"), { ...enabled, sheetOpen: true }), null);
  assert.equal(deskHotkeyAction(key("ArrowRight"), { ...enabled, visible: false }), null);
  assert.equal(deskHotkeyAction(key("ArrowRight")), null, "shortcuts start disabled");
});
