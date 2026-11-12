import test from "node:test";
import assert from "node:assert/strict";

import { Bone, Quaternion, Vector3 } from "../public/desk-assets/vendor/three/three.module.js";
import { TwoBoneIK } from "../public/desk-assets/ik.mjs";

// Minimal hip -> knee -> foot chain. Bone positions are the JOINT positions:
// hip at the origin, knee 1 unit up, foot 1 unit further up. Segment lengths
// are therefore lenAB = 1 (hip->knee) and lenBC = 1 (knee->foot), max reach = 2.
function buildChain() {
  const hip = new Bone();
  hip.name = "hip";
  const knee = new Bone();
  knee.name = "knee";
  knee.position.set(0, 1, 0);
  const foot = new Bone();
  foot.name = "foot";
  foot.position.set(0, 1, 0);
  hip.add(knee);
  knee.add(foot);
  hip.updateWorldMatrix(true, false);
  return { hip, knee, foot };
}

function worldPos(bone) {
  return bone.getWorldPosition(new Vector3());
}

function worldQuat(bone) {
  return bone.getWorldQuaternion(new Quaternion());
}

test("reachable target: foot lands on target and result reports reachable", () => {
  const { hip, knee, foot } = buildChain();
  const ik = new TwoBoneIK();
  const target = new Vector3(0.4, 0.2, 1.0);
  const poleTarget = new Vector3(1.0, 0.2, 1.0);

  const result = ik.solve({ rootBone: hip, middleBone: knee, endBone: foot, target, poleTarget });

  assert.equal(result.reachable, true);
  assert.ok(result.error < 1e-3, `error ${result.error} should be < 1e-3`);
  const footPos = worldPos(foot);
  assert.ok(footPos.distanceTo(target) < 1e-3, `foot at ${footPos} should be at ${target}`);
});

test("unreachable target: chain extends to max reach and clamps", () => {
  const { hip, knee, foot } = buildChain();
  const ik = new TwoBoneIK();
  const target = new Vector3(0, 0, 10); // distance 10, max reach 2
  const poleTarget = new Vector3(1, 0, 5);

  const result = ik.solve({ rootBone: hip, middleBone: knee, endBone: foot, target, poleTarget });

  assert.equal(result.reachable, false);
  // Foot should end up ~maxReach from the hip along the hip->target direction,
  // so the remaining error is ~dist - maxReach = 8.
  assert.ok(Math.abs(result.error - 8) < 0.01, `error ${result.error} should be ~8`);
  const hipPos = worldPos(hip);
  const footPos = worldPos(foot);
  assert.ok(
    Math.abs(footPos.distanceTo(hipPos) - 2) < 0.01,
    `hip->foot distance ${footPos.distanceTo(hipPos)} should be ~2`,
  );
});

test("pole vector bends the knee toward the pole side", () => {
  const { hip, knee, foot } = buildChain();
  const ik = new TwoBoneIK();
  const target = new Vector3(0, 0.2, 1.2); // mostly +Z, slightly up
  const poleTarget = new Vector3(1.5, 0.2, 0.6); // strongly +X side

  ik.solve({ rootBone: hip, middleBone: knee, endBone: foot, target, poleTarget });

  const kneePos = worldPos(knee);
  const hipPos = worldPos(hip);
  // The knee should sit on the +X side of the hip->target line.
  assert.ok(kneePos.x - hipPos.x > 0.05, `knee x ${kneePos.x} should be clearly positive (pole side)`);
  // Sanity: the knee is between hip and target in reach terms.
  assert.ok(kneePos.distanceTo(hipPos) < 1.5, "knee should stay within segment length range");
});

test("preserveEndRotation keeps the foot's world orientation", () => {
  const { hip, knee, foot } = buildChain();
  // Give the foot a distinctive non-identity orientation before solving.
  foot.quaternion.setFromAxisAngle(new Vector3(0.3, 0.8, 0.5).normalize(), 0.9);
  hip.updateWorldMatrix(true, false);
  const before = worldQuat(foot);

  const ik = new TwoBoneIK();
  const target = new Vector3(0.4, 0.2, 1.0);
  const poleTarget = new Vector3(1.0, 0.2, 1.0);

  const result = ik.solve({
    rootBone: hip,
    middleBone: knee,
    endBone: foot,
    target,
    poleTarget,
    preserveEndRotation: true,
  });

  assert.equal(result.reachable, true);
  const after = worldQuat(foot);
  const angle = 2 * Math.acos(Math.min(1, Math.abs(before.dot(after))));
  assert.ok(angle < 1e-4, `end orientation drifted by ${angle} rad`);
});

test("preserveEndRotation=false lets the end bone rotate with the solve", () => {
  const { hip, knee, foot } = buildChain();
  foot.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), 0.9);
  hip.updateWorldMatrix(true, false);

  const ik = new TwoBoneIK();
  const target = new Vector3(0.4, 0.2, 1.0);
  const poleTarget = new Vector3(1.0, 0.2, 1.0);

  ik.solve({
    rootBone: hip,
    middleBone: knee,
    endBone: foot,
    target,
    poleTarget,
    preserveEndRotation: false,
  });

  const footPos = worldPos(foot);
  assert.ok(footPos.distanceTo(target) < 1e-3, "foot should still reach the target");
});
