/* PHYSICS — the single world for everything Crid touches.
 * Screen space: x right, y down, px and seconds. One gravity, one fixed-step
 * accumulator, and one Set of bodies. Characters, the worn/dropped bag and
 * loose paper all advance here; rendering and stage planning never integrate.
 *
 * Ordinary bodies keep the compact floor solver used by the bag and paper:
 *   {x,y,vx,vy,mass,drag,restitution,floor,halfH}
 *
 * A character opts into platform-aware root physics:
 *   {character:true,halfW,halfH,floor,mass,strength,grounded,supportId}
 * Its controller writes intent (moveCharacter / climbCharacter); this world
 * owns velocity, gravity, platform contacts, grip failure and landing.
 */
export const GRAVITY = 2400;
const REST_SPEED = 60;
const EPS = 0.001;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const approach = (v, target, amount) => v < target
  ? Math.min(target, v + amount) : Math.max(target, v - amount);

export function createWorld({ gravity = GRAVITY, fixedDt = 1 / 120 } = {}) {
  const bodies = new Set();
  let platforms = [];
  let acc = 0;

  const add = (body) => {
    body.vx ??= 0; body.vy ??= 0;
    body.mass ??= 1; body.drag ??= 0;
    body.restitution ??= .22; body.floor ??= 0; body.halfH ??= 0;
    if (body.character) {
      body.halfW ??= Math.max(1, body.halfH * .38);
      body.strength ??= 1;
      body.grounded ??= body.y + body.halfH >= body.floor - .5;
      body.supportId ??= body.grounded ? "floor" : null;
      body.distanceTravelled ??= 0;
      body.grip ??= null;
      body.climb ??= null;
      body.motor ??= null;
      body.gripFailed ??= false;
    }
    bodies.add(body);
    return body;
  };
  const remove = (body) => {
    if (!body) return false;
    body.motor = null; body.climb = null; body.grip = null;
    return bodies.delete(body);
  };

  // Platforms are static collision geometry measured from the visible layer
  // registry. Keep the registry id so stage.mjs can distinguish the surface
  // Crid actually landed on from a merely nearby rectangle.
  const setPlatforms = (items = []) => {
    platforms = items.filter(p => p &&
      Number.isFinite(p.left) && Number.isFinite(p.right) &&
      Number.isFinite(p.top) && Number.isFinite(p.bottom) &&
      p.right > p.left && p.bottom > p.top)
      .map(p => ({
        id: String(p.id),
        left: Math.min(p.left, p.right),
        right: Math.max(p.left, p.right),
        top: p.top,
        bottom: p.bottom,
        solidSides: p.solidSides !== false,
      }));
    for (const b of bodies) {
      if (!b.character || !b.grounded || !b.supportId || b.supportId === "floor") continue;
      if (!platforms.some(p => p.id === b.supportId)) {
        b.grounded = false;
        b.supportId = null;
      }
    }
    return platforms.length;
  };

  const hasBody = (body) => !!body && bodies.has(body) && body.character;

  const moveCharacter = (body, targetX, {
    maxSpeed = 180, acceleration = 640, strength = body?.strength ?? 1, load = 0,
  } = {}) => {
    if (!hasBody(body) || !Number.isFinite(targetX)) return false;
    body.motor = {
      targetX,
      maxSpeed: Math.max(0, maxSpeed),
      acceleration: Math.max(1, acceleration),
      strength: Math.max(.05, strength),
      load: Math.max(0, load),
    };
    return true;
  };

  const stopCharacter = (body) => {
    if (!hasBody(body)) return false;
    body.motor = null;
    return true;
  };

  const jumpCharacter = (body, { height = 120, horizontal = 0 } = {}) => {
    if (!hasBody(body) || !body.grounded || !Number.isFinite(height)) return false;
    body.vy = -Math.sqrt(2 * Math.max(1, gravity) * Math.max(0, height));
    body.vx += Number.isFinite(horizontal) ? horizontal : 0;
    body.grounded = false;
    body.supportId = null;
    body.grip = null;
    body.climb = null;
    body.gripFailed = false;
    return true;
  };

  // The anchor is a real screen-space point on the ledge. The arm may articulate
  // around it; the root is not rigidly welded to a guessed shoulder offset.
  const grabCharacter = (body, anchor, {
    side = -1, reach, strength = body?.strength ?? 1, load = 0,
  } = {}) => {
    if (!hasBody(body) || !anchor ||
        !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return false;
    const toward = side < 0 ? -1 : 1;
    const armReach = Math.max(24, Number.isFinite(reach) ? reach : body.halfH * 1.9);
    const shoulderX = body.x + toward * body.halfW * .18;
    const shoulderY = body.y - body.halfH * .25;
    if (Math.hypot(anchor.x - shoulderX, anchor.y - shoulderY) > armReach * 1.35) return false;
    body.grip = {
      id: String(anchor.id ?? "ledge"),
      x: anchor.x, y: anchor.y, side: toward,
      reach: armReach, strength: Math.max(.05, strength),
      load: Math.max(0, load), strain: 0,
    };
    body.gripFailed = false;
    body.climb = null;
    body.motor = null;
    return true;
  };

  const climbCharacter = (body, { x, feetY }, {
    strength = body?.strength ?? 1, load = 0,
    maxAcceleration = 5200, stiffness = 18, damping = 8,
  } = {}) => {
    if (!hasBody(body) || !body.grip ||
        !Number.isFinite(x) || !Number.isFinite(feetY)) return false;
    body.climb = {
      x, feetY,
      strength: Math.max(.05, strength),
      load: Math.max(0, load),
      maxAcceleration: Math.max(1, maxAcceleration),
      stiffness: Math.max(1, stiffness),
      damping: Math.max(0, damping),
    };
    body.motor = null;
    return true;
  };

  const releaseGrip = (body) => {
    if (!hasBody(body)) return false;
    body.grip = null;
    body.climb = null;
    body.motor = null;
    return true;
  };

  const overlapsX = (body, platform) =>
    body.x + body.halfW > platform.left + EPS &&
    body.x - body.halfW < platform.right - EPS;

  const supportFor = (body) => {
    if (body.supportId === "floor") return { id: "floor", top: body.floor };
    return platforms.find(p => p.id === body.supportId) || null;
  };

  const pinSupport = (body) => {
    if (!body.grounded) return;
    const support = supportFor(body);
    if (!support || (support.id !== "floor" && !overlapsX(body, support))) {
      body.grounded = false;
      body.supportId = null;
      return;
    }
    const top = support.id === "floor" ? body.floor : support.top;
    if (Math.abs(body.y + body.halfH - top) > 2) {
      body.grounded = false;
      body.supportId = null;
      return;
    }
    body.y = top - body.halfH;
    body.vy = 0;
  };

  const resolveHorizontal = (body, oldX, oldY) => {
    const oldLeft = oldX - body.halfW, oldRight = oldX + body.halfW;
    const top = body.y - body.halfH, bottom = body.y + body.halfH;
    for (const p of platforms) {
      if (!p.solidSides || bottom <= p.top + EPS || top >= p.bottom - EPS) continue;
      const left = body.x - body.halfW, right = body.x + body.halfW;
      if (body.vx > 0 && oldRight <= p.left + EPS && right > p.left) {
        body.x = p.left - body.halfW;
        body.vx = 0;
      } else if (body.vx < 0 && oldLeft >= p.right - EPS && left < p.right) {
        body.x = p.right + body.halfW;
        body.vx = 0;
      } else if (right > p.left + EPS && left < p.right - EPS) {
        // Recover cleanly from a moved panel or a resized actor. Choose the
        // shallowest push-out rather than guessing from the sign of velocity.
        const pushLeft = right - p.left;
        const pushRight = p.right - left;
        if (pushLeft <= pushRight) body.x = p.left - body.halfW;
        else body.x = p.right + body.halfW;
        body.vx = 0;
      }
    }
  };

  const resolveVertical = (body, oldY, oldVy) => {
    const oldTop = oldY - body.halfH, oldBottom = oldY + body.halfH;
    let landing = null;
    if (oldVy >= 0 && body.vy >= 0) {
      for (const p of platforms) {
        if (!overlapsX(body, p)) continue;
        const bottom = body.y + body.halfH;
        if (oldBottom <= p.top + EPS && bottom >= p.top - EPS &&
            (!landing || p.top < landing.top)) landing = p;
      }
      // A pull may bring the feet exactly level with the ledge without crossing
      // it in a downward step. Treat that as a valid support contact.
      if (!landing && body.vy >= 0) {
        landing = platforms.find(p =>
          overlapsX(body, p) && Math.abs(body.y + body.halfH - p.top) <= 1.25) || null;
      }
    } else if (oldVy < 0 && body.vy <= 0) {
      for (const p of platforms) {
        if (!overlapsX(body, p)) continue;
        const top = body.y - body.halfH;
        if (oldTop >= p.bottom - EPS && top <= p.bottom + EPS) {
          body.y = p.bottom + body.halfH;
          body.vy = 0;
          break;
        }
      }
    }
    if (landing) {
      body.y = landing.top - body.halfH;
      body.vy = 0;
      body.grounded = true;
      body.supportId = landing.id;
      return;
    }
    if (body.y + body.halfH >= body.floor) {
      body.y = body.floor - body.halfH;
      if (body.vy > 0) body.vy = 0;
      body.grounded = true;
      body.supportId = "floor";
      return;
    }
    body.grounded = false;
    body.supportId = null;
  };

  const integrateCharacter = (body, dt) => {
    pinSupport(body);
    const oldX = body.x, oldY = body.y, oldVy = body.vy;
    const control = body.climb || body.motor;
    const load = control?.load ?? 0;
    const strength = control?.strength ?? body.strength;
    const mobility = Math.max(.08, strength / Math.max(.05, body.mass + load));

    if (body.climb && body.grip) {
      const targetY = body.climb.feetY - body.halfH;
      let ax = (body.climb.x - body.x) * body.climb.stiffness - body.vx * body.climb.damping;
      let ay = (targetY - body.y) * body.climb.stiffness - body.vy * body.climb.damping;
      const demand = Math.hypot(ax, ay);
      const capacity = body.climb.maxAcceleration * mobility;
      if (demand > capacity) {
        const scale = capacity / demand;
        ax *= scale; ay *= scale;
      }
      body.vx += ax * dt;
      body.vy += (gravity + ay) * dt;

      // A grip is lost only when the ledge leaves the arm's reachable envelope
      // for a sustained interval. The IK renderer keeps the hand on this same
      // world-space point; the body motor supplies the load-aware pull.
      const g = body.grip;
      const shoulderX = body.x + g.side * body.halfW * .18;
      const shoulderY = body.y - body.halfH * .25;
      const reachError = Math.hypot(g.x - shoulderX, g.y - shoulderY) - g.reach;
      if (reachError > Math.max(8, g.reach * .07)) g.strain += dt;
      else g.strain = Math.max(0, g.strain - dt * 1.5);
      if (g.strain >= .24) {
        body.gripFailed = true;
        body.grip = null;
        body.climb = null;
      }
    } else {
      if (body.motor) {
        const m = body.motor;
        const maxSpeed = m.maxSpeed * mobility;
        const accel = m.acceleration * mobility;
        const dx = m.targetX - body.x;
        const brakingSpeed = Math.sqrt(Math.max(0, 2 * accel * Math.abs(dx)));
        const desired = Math.sign(dx) * Math.min(maxSpeed, brakingSpeed);
        body.vx = approach(body.vx, desired, accel * dt);
      } else {
        body.vx *= Math.exp(-(body.grounded ? 10 : .8) * dt);
      }
      body.vy += gravity * dt;
    }

    body.x += body.vx * dt;
    resolveHorizontal(body, oldX, oldY);
    body.y += body.vy * dt;
    resolveVertical(body, oldY, oldVy);
    body.deltaX = body.x - oldX;
    body.distanceTravelled += Math.abs(body.deltaX);
  };

  // One fixed-step world. The same accumulator advances the character, bag and
  // every loose sheet, so they cannot drift onto separate clocks or gravities.
  const step = (dt) => {
    if (!Number.isFinite(dt) || dt <= 0) return;
    acc += Math.min(dt, .1);
    while (acc >= fixedDt) {
      acc -= fixedDt;
      for (const b of bodies) {
        if (b.character) {
          integrateCharacter(b, fixedDt);
          continue;
        }
        b.vy += gravity * fixedDt;
        const damp = b.drag ? Math.exp(-b.drag * fixedDt) : 1;
        b.vx *= damp; b.vy *= damp;
        b.x += b.vx * fixedDt;
        b.y += b.vy * fixedDt;
        const bottom = b.floor - b.halfH;
        if (b.y > bottom) {
          b.y = bottom;
          if (b.vy > REST_SPEED) { b.vy = -b.vy * b.restitution; b.vx *= .72; }
          else { b.vy = 0; b.vx *= .6; }
          if (Math.abs(b.vy) < REST_SPEED) b.vy = 0;
        }
      }
    }
  };

  const settled = (b) => b.vy === 0 &&
    (b.character ? b.grounded : b.y >= b.floor - b.halfH - .5);

  return {
    add, remove, step, settled,
    setPlatforms,
    moveCharacter, stopCharacter, jumpCharacter,
    grabCharacter, climbCharacter, releaseGrip,
    get bodies() { return bodies; },
    get platforms() { return platforms; },
    fixedDt,
  };
}
