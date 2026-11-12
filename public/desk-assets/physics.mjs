/* PHYSICS — one world for everything Crid touches (docs/specs/physics.md).
   A fixed-step integrator, not a library: a handful of bodies, one gravity, one floor,
   floor-only collision plus whatever simple constraints the caller adds. Screen space,
   y down, px and seconds. Deterministic: same inputs, same result — nothing here
   rolls dice, so a stumble is always explainable as mass times velocity.

   A body is a plain object the caller owns:
     { x, y, vx, vy, mass, drag, restitution, floor, halfH }
   x/y is the body's centre; floor is the y its bottom rests on; halfH is half its
   height so the floor test is honest. mass is relative — only ratios matter.
   drag is a per-second exponential damp (0 = none, ~2 = paper). restitution is the
   fraction of impact speed kept on a bounce (0.2 reads as a soft thud). */

export const GRAVITY = 2400;          // px/s² — a bag dropped from chest height lands in ~0.4s
const REST_SPEED = 60;                // below this a bounce is just a settle

export function createWorld({ gravity = GRAVITY, fixedDt = 1 / 120 } = {}) {
  const bodies = new Set();
  let acc = 0;

  const add = (body) => {
    body.vx ??= 0; body.vy ??= 0;
    body.mass ??= 1; body.drag ??= 0;
    body.restitution ??= .22; body.floor ??= 0; body.halfH ??= 0;
    bodies.add(body);
    return body;
  };
  const remove = (body) => bodies.delete(body);

  // One fixed step. Call with the frame's dt; the world sub-steps so a 30fps
  // display and a 120Hz one integrate the same trajectory.
  const step = (dt) => {
    acc += Math.min(dt, .1);
    while (acc >= fixedDt) {
      acc -= fixedDt;
      for (const b of bodies) {
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

  const settled = (b) => b.vy === 0 && b.y >= b.floor - b.halfH - .5;

  return { add, remove, step, settled, get bodies() { return bodies; }, fixedDt };
}
