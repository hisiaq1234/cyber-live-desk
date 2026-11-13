/* Distance-driven humanoid gait timing.
 *
 * The root motor owns translation. This module only schedules each foot's
 * stance/swing phase from measured root travel, and emits contact transitions.
 * Coordinates are world units; strideLength is one complete left-foot-to-left-
 * foot gait cycle. No Three.js dependency, DOM, clock or root motion.
 */
const clamp01 = value => Math.max(0, Math.min(1, value));
const fract = value => value - Math.floor(value);

function footAt(phase, duty) {
  const p = fract(phase);
  if (p < duty) {
    const stanceProgress = p / duty;
    return {
      phase: p,
      state: stanceProgress < .16 ? "plant" : stanceProgress > .84 ? "toe-off" : "stance",
      stance: true,
      swingProgress: 0,
      swing: 0,
    };
  }
  const swingProgress = clamp01((p - duty) / (1 - duty));
  return {
    phase: p,
    state: "swing",
    stance: false,
    swingProgress,
    swing: Math.sin(Math.PI * swingProgress),
  };
}

export function createDistanceGait({ dutyFactor = .62 } = {}) {
  const duty = Math.max(.5, Math.min(.85, dutyFactor));
  let phase = 0;
  let lastDistance = null;
  let leftSteps = 0;
  let rightSteps = 0;

  const update = (distanceTravelled, strideLength, active = true) => {
    const distance = Number.isFinite(distanceTravelled) ? distanceTravelled : 0;
    const stride = Math.max(.01, Number.isFinite(strideLength) ? strideLength : .5);
    const previous = phase;

    if (lastDistance === null || distance < lastDistance) {
      // First sample or a deliberate root reset: rebase without a fake step.
      phase = 0;
    } else if (active) {
      // Incremental integration keeps the phase continuous if body size or the
      // calibrated stride length changes gradually during character progression.
      phase = fract(phase + (distance - lastDistance) / stride);
    }
    lastDistance = distance;

    const events = [];
    if (active && phase !== previous) {
      for (const [side, offset] of [["left", 0], ["right", .5]]) {
        const before = fract(previous + offset);
        const after = fract(phase + offset);
        if (before < duty && after >= duty) events.push({ side, type: "liftoff" });
        if (after < before) {
          events.push({ side, type: "touchdown" });
          if (side === "left") leftSteps += 1;
          else rightSteps += 1;
        }
      }
    }

    return {
      phase,
      dutyFactor: duty,
      active: !!active,
      left: footAt(phase, duty),
      right: footAt(phase + .5, duty),
      events,
      steps: { left: leftSteps, right: rightSteps },
    };
  };

  const reset = () => {
    phase = 0;
    lastDistance = null;
    leftSteps = 0;
    rightSteps = 0;
  };

  return { update, reset };
}
