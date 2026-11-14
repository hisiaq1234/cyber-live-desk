// crid-3d.js rig coverage contract: every bone group must have a live driver.
// The frozen-hand bug was a wrist bone nobody ever wrote — these assertions
// keep wrists, fingers, spread, clavicles and the coverage probe wired.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const src = await readFile(new URL("../public/desk-assets/crid-3d.js", import.meta.url), "utf8");

test("wrist bones are measured and driven every frame", () => {
  assert.ok(src.includes('WRISTS.push({b:J["hand"+side]'), "wrist axes measured at bind");
  assert.ok(src.includes("wr.s.tw+=(twistT-wr.s.tw)*k"), "wrist twist eases on a spring");
  assert.ok(src.includes("b.quaternion.copy(b.userData.q0).multiply(_aq).multiply(_aq2)"),
    "wrist pose composes flex + twist on the rest quaternion");
});

test("fingers carry a spread axis besides the curl axis", () => {
  assert.ok(src.includes("spreadAxis"), "spread axis computed per finger");
  assert.ok(src.includes("f.spreadAxis"), "spread applied in the finger loop");
  assert.ok(src.includes("spreadSign"), "spread direction measured, not guessed");
});

test("clavicles have idle life outside stage channels", () => {
  assert.ok(src.includes('clavL:"L_clavicle_bind_JNT"'), "clavicle bones mapped");
  assert.ok(src.includes('pose("clavL"'), "clavicle posed in the idle path");
});

test("the coverage probe reports written vs frozen bones", () => {
  assert.ok(src.includes("__cridCoverage"), "probe exposed");
  assert.ok(src.includes("covered.clear()"), "coverage resets each frame");
  assert.ok(src.includes("frozen:"), "probe names the frozen bones");
});
