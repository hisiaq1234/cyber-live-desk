import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { BODY_LADDER } from "../public/desk-assets/crid/ladder.mjs";
import { RIGS } from "../public/desk-assets/crid/rig.mjs";

test("every production body stage has its own generated cutout rig", () => {
  const expected = BODY_LADDER.map(stage => String(stage.key)).sort();
  assert.deepEqual(Object.keys(RIGS).sort(), expected,
    "rig.mjs must include all seven stages, not just the last --check body");
  for (const key of expected) {
    const rig = RIGS[key];
    assert.equal(rig.source.w, 1050);
    assert.equal(rig.source.h, 1400);
    for (const name of Object.keys(rig.pieces)) {
      assert.ok(existsSync(new URL(`../public/desk-assets/crid/rigs/${key}/${name}.png`, import.meta.url)),
        `missing ${key}/${name}.png`);
    }
  }
});
