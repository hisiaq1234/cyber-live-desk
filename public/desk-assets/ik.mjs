/**
 * ik.mjs — analytic two-bone IK solver for three.js Bone chains.
 *
 * Ported from PabloMesquida/three-procedural-locomotion
 *   src/ik/TwoBoneIK.ts + the world-pose helpers it needs from src/core/pose.ts
 * License: MIT (https://github.com/PabloMesquida/three-procedural-locomotion)
 *
 * Vanilla ES module, no build step. three.js is vendored in this repo and
 * imported via a relative path so `node --test` can load this file directly.
 *
 * The solver works on the "joints" model: bone positions are the joint
 * positions (root→middle→end), and rotating a bone rotates whatever hangs
 * below it. Segment lengths come from the current world offsets, so it works
 * with any hierarchy that has uniform scale. It does NOT support non-uniform
 * scales in the hierarchy.
 */

import { Matrix4, Quaternion, Vector3 } from './vendor/three/three.module.js';

const EPS = 1e-8;

// Module-level temps for the world-pose helpers (zero allocation per call).
const _p = new Vector3();
const _s = new Vector3();
const _q = new Quaternion();
const _chain = [];
const _orthoFallback = new Vector3(0, 0, 1);

/** Recomputes the world matrix of `obj` (only its own; its parent must be up to date). */
function updateNode(obj) {
  obj.updateWorldMatrix(false, false);
}

/**
 * Recomputes, top-down, the nodes between `ancestor` (excluded; must be up to date) and `obj`
 * (included). If `ancestor` is not an ancestor of `obj`, recomputes the whole chain of ancestors.
 */
function updateDown(ancestor, obj) {
  _chain.length = 0;
  let node = obj;
  while (node && node !== ancestor) {
    _chain.push(node);
    node = node.parent;
  }
  if (!node) {
    _chain.length = 0;
    obj.updateWorldMatrix(true, false);
    return;
  }
  for (let i = _chain.length - 1; i >= 0; i--) _chain[i].updateWorldMatrix(false, false);
  _chain.length = 0;
}

/** Recomputes everything below `obj` (and `obj`), with its parent up to date. */
function updateSubtree(obj) {
  obj.updateWorldMatrix(false, true);
}

/** World position of `obj`, read from its matrix (must be up to date). */
function worldPosition(obj, out) {
  return out.setFromMatrixPosition(obj.matrixWorld);
}

/** World rotation of `obj`, read from its matrix (must be up to date). */
function worldQuaternion(obj, out) {
  obj.matrixWorld.decompose(_p, out, _s);
  return out;
}

/** Sets a world rotation on `obj` (with its parent up to date) and updates only its matrix. */
function setWorldQuaternionNode(obj, worldQuat) {
  if (obj.parent) obj.quaternion.copy(worldQuaternion(obj.parent, _q).invert().multiply(worldQuat));
  else obj.quaternion.copy(worldQuat);
  updateNode(obj);
}

/**
 * Analytic IK solver for two-bone chains (hip-knee-foot, shoulder-elbow-hand).
 *
 * Steps:
 *  1. The law of cosines gives where the middle joint (knee) and the end (foot) must end up, in the
 *     hip–target–pole plane.
 *  2. The root bone is rotated by aligning its "frame" (bone direction + hinge axis) with the desired
 *     frame, so that the knee doesn't twist.
 *  3. The middle bone is rotated so that the end lands on the target.
 *  4. Optionally, the world orientation of the end is restored.
 *
 * Everything is computed in world space and converted to local using the parent's world rotation.
 */
export class TwoBoneIK {
  // Reusable vectors/quaternions — no per-frame allocations.
  constructor() {
    this.a = new Vector3();
    this.b = new Vector3();
    this.c = new Vector3();
    this.dir = new Vector3();
    this.poleDir = new Vector3();
    this.bDesired = new Vector3();
    this.cDesired = new Vector3();
    this.curDir = new Vector3();
    this.curHinge = new Vector3();
    this.curBinormal = new Vector3();
    this.newDir = new Vector3();
    this.newHinge = new Vector3();
    this.newBinormal = new Vector3();
    this.v1 = new Vector3();
    this.v2 = new Vector3();
    this.m0 = new Matrix4();
    this.m1 = new Matrix4();
    this.q = new Quaternion();
    this.qWorld = new Quaternion();
    this.qEnd = new Quaternion();
  }

  /**
   * @param {object} input
   * @param {import('./vendor/three/three.module.js').Bone} input.rootBone  First bone of the chain (thigh).
   * @param {import('./vendor/three/three.module.js').Bone} input.middleBone Middle bone (shin), direct child of rootBone.
   * @param {import('./vendor/three/three.module.js').Bone} input.endBone   End bone (foot), direct child of middleBone.
   * @param {import('./vendor/three/three.module.js').Vector3} input.target      Target position of endBone, world space.
   * @param {import('./vendor/three/three.module.js').Vector3} input.poleTarget  Point the middle joint must aim at, world space.
   * @param {boolean} [input.preserveEndRotation=true] Keep the world orientation of endBone.
   * @param {import('./vendor/three/three.module.js').Vector3} [input.hingeAxis]
   *   Hinge axis of the middle joint, in rootBone's local space (perpendicular to the knee-bend plane).
   *   If given, the root bone rotates as a whole to orient the knee toward the pole and the knee always
   *   bends about that axis. Otherwise it is derived from the current pole.
   * @returns {{reachable: boolean, error: number}}
   *   `reachable`: the target was within the chain's reach. `error`: final world distance endBone→target.
   */
  solve(input) {
    const { rootBone, middleBone, endBone, target, poleTarget } = input;
    const preserveEnd = input.preserveEndRotation ?? true;
    const { a, b, c, dir, poleDir, bDesired, cDesired } = this;

    // Only the chain: its ancestors and root → middle → end (whatever hangs below is updated last).
    rootBone.updateWorldMatrix(true, false);
    updateDown(rootBone, middleBone);
    updateDown(middleBone, endBone);
    worldPosition(rootBone, a);
    worldPosition(middleBone, b);
    worldPosition(endBone, c);
    if (preserveEnd) worldQuaternion(endBone, this.qEnd);

    const lenAB = a.distanceTo(b);
    const lenBC = b.distanceTo(c);
    const maxReach = lenAB + lenBC;
    const minReach = Math.abs(lenAB - lenBC);

    // --- 1. Desired geometry -------------------------------------------
    dir.subVectors(target, a);
    const dist = dir.length();
    const reachable = dist <= maxReach && dist >= minReach;

    if (dist > EPS) dir.divideScalar(dist);
    else dir.subVectors(c, a).normalize(); // target at the hip: keep current direction

    // Avoid a 100% straight chain (the hinge would be undefined).
    const d = clamp(dist, minReach + maxReach * 1e-4, maxReach * (1 - 1e-4));

    // Pole direction, perpendicular to the hip→target line.
    perpendicularTo(dir, poleDir.subVectors(poleTarget, a), this.v1.subVectors(b, a));

    const cosA = clamp((lenAB * lenAB + d * d - lenBC * lenBC) / (2 * lenAB * d), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    bDesired.copy(a).addScaledVector(dir, lenAB * cosA).addScaledVector(poleDir, lenAB * sinA);
    cDesired.copy(a).addScaledVector(dir, d);

    // --- 2. Root bone: align current frame → desired frame --------------
    // Frame = (bone direction, hinge axis, binormal).
    // Hinge axis = perpendicular to the hip–foot–pole plane.
    const { curDir, curHinge, curBinormal, newDir, newHinge, newBinormal, v1, v2 } = this;

    curDir.subVectors(b, a).normalize();
    worldQuaternion(rootBone, this.qWorld);
    if (input.hingeAxis) {
      curHinge.copy(input.hingeAxis).applyQuaternion(this.qWorld);
    } else {
      v1.subVectors(c, a);
      if (v1.lengthSq() < EPS) v1.copy(curDir);
      v1.normalize();
      perpendicularTo(v1, v2.subVectors(poleTarget, a), curDir);
      curHinge.crossVectors(v1, v2);
    }
    orthonormalize(curHinge, curDir);
    curBinormal.crossVectors(curDir, curHinge);

    newDir.subVectors(bDesired, a).normalize();
    newHinge.crossVectors(dir, poleDir).normalize();
    newBinormal.crossVectors(newDir, newHinge);

    this.m0.makeBasis(curDir, curHinge, curBinormal).transpose(); // inverse (orthonormal)
    this.m1.makeBasis(newDir, newHinge, newBinormal).multiply(this.m0);
    this.q.setFromRotationMatrix(this.m1);

    setWorldQuaternionNode(rootBone, this.qWorld.premultiply(this.q));
    updateDown(rootBone, middleBone);
    updateDown(middleBone, endBone);

    // --- 3. Middle bone: bring the end to the target --------------------
    worldPosition(middleBone, b);
    worldPosition(endBone, c);
    v1.subVectors(c, b).normalize();
    v2.subVectors(cDesired, b).normalize();
    this.q.setFromUnitVectors(v1, v2);

    worldQuaternion(middleBone, this.qWorld);
    setWorldQuaternionNode(middleBone, this.qWorld.premultiply(this.q));
    updateDown(middleBone, endBone);

    // --- 4. End bone: restore its world orientation ---------------------
    if (preserveEnd) setWorldQuaternionNode(endBone, this.qEnd);
    updateSubtree(endBone);

    worldPosition(endBone, c);
    return { reachable, error: c.distanceTo(target) };
  }
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

/**
 * Leaves in `v` its component perpendicular to `axis` (unit), normalized.
 * If `v` is almost parallel to `axis`, uses `fallback`; if that is too, any perpendicular.
 */
function perpendicularTo(axis, v, fallback) {
  v.addScaledVector(axis, -v.dot(axis));
  if (v.lengthSq() > EPS) return v.normalize();

  v.copy(fallback).addScaledVector(axis, -fallback.dot(axis));
  if (v.lengthSq() > EPS) return v.normalize();

  v.set(1, 0, 0);
  if (Math.abs(axis.x) > 0.9) v.set(0, 1, 0);
  return v.addScaledVector(axis, -v.dot(axis)).normalize();
}

/** Makes `v` perpendicular to `axis` (unit) and normalized. */
function orthonormalize(v, axis) {
  v.addScaledVector(axis, -v.dot(axis));
  if (v.lengthSq() < EPS) perpendicularTo(axis, v.set(0, 0, 0), _orthoFallback);
  else v.normalize();
}
