/* THE STAGING MACHINE — the body half of `public/crid3d.html` (the `stage` object, `begin`,
 * `abandon`, `finishStage`, `checkSurface`, `floorRange`, `standFor`, `stageStep`, and the pose
 * channels at the foot of its tick), lifted out so `/desk` can run the same man on the same
 * panels without a renderer, a camera or a DOM.
 *
 * Pure on purpose, same contract as being.mjs: no DOM, no three.js, no timers. Time arrives as
 * `now` (ms) on `step`, and `dt` in seconds. Everything environmental is injected:
 *
 *   targets()  -> {lean:[], sit:[], climb:[]}   the panels the desk offers right now
 *   boxes      -> {name:{left,right,top,w,h,z}} panel boxes in world units
 *   worldX(px) -> world x of a desk-pixel column (the 48 px floor margins need it)
 *   unit()     -> desk px per world unit (the page's pxPerUnit)
 *   screenWidth-> desk px wide the walkable frame is (innerWidth on the rig page)
 *   rand/mass/bagOn/slip -> the physics.md §2 slip dice and the bag's drag
 *   onInterrupt(reason)   -> what being.interrupt(reason) did on the rig page
 *
 * `walkX` lives on the returned object as `walkX`. The renderer integrates it during floor
 * states (the wander walk); the machine owns it during every panel phase — the same split the
 * original had, where `walkX` was a page-level `let` both sides wrote.
 *
 * `state` stays a readable string property (it was `stage.state` in the original), so there is
 * no `state()` method — read `stage.state`.
 */

export const TRANSIENT = ["approach","reach","pull","crouch","drop","settle","lean-in","push-off","hop","hop-down","slip","recover"];

// layers.mjs measures the desk by the ids the overlay uses; these are the wide text plates he
// leans on but never stands on.
const BENCH = ["ticker","headlines","chat"];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

export function createStage({
  targets = () => ({ lean: [], sit: [], climb: [] }),
  boxes = {},
  worldX = (px) => px,
  unit = () => 100,
  screenWidth = 1920,
  rand = Math.random,
  mass = 1,
  bagOn = () => false,
  slip = false,                    // boolean, or () => bool — the page's ?slip=1 forceSlip
  onInterrupt = () => {},
  walkX = 0,
  hisW = 0.55,
  hipY = 0.85,
} = {}) {
  const stage = {
    state: "floor", key: null, layer: null, side: "right", t: 0,
    targetX: 0, groundY: 0, roll: 0, pitch: 0, topY: 0, lipX: 0, seatY: 0,
    fromX: 0, fromY: 0, fromRoll: 0, fromPitch: 0, surface: null, walking: false, hold: 0,
    abandoned: false, trace: "floor", reason: "",
    slipFromX: 0, slipFromY: 0, slipRolled: false, stumble: 0,
    walkX,
    // The move he is winding up for: "anticipate" is a 130 ms opposite dip that
    // runs between the reach/wind-up and the commit (pull, hop, lean-in).
    next: null,
    // Landing squash clock: set on every state entry that ends a descent
    // (top, seat, settle), read as stage.squashEnv by the renderer.
    squashAt: null, squashEnv: 0,
  };
  let lastSurfaceCheck = 0;
  let lastNow = null;

  const boxOf = (n) => {
    const b = boxes[n];
    return b && Number.isFinite(b.left) && Number.isFinite(b.right) && Number.isFinite(b.top) ? b : null;
  };
  const leftOf = (b) => b.left, rightOf = (b) => b.right, topOf = (b) => b.top;
  const widthOf = (b) => b.right - b.left;
  const pxW = () => 1 / Math.max(1e-6, unit());       // one desk px in world units

  const clearance = () => hisW / 2 + 10 * pxW();      // §9.2: a heavier body stands further out

  function go(state) { stage.state = state; stage.t = 0; }

  // physics.md §2 — a climb is an attempt with a cost. The bag is a drag on a lean man:
  // the lighter he is and the more he is carrying, the more the lip can beat him, and
  // heavy Crid does not slip at all. Rolled once per pull, when his weight commits.
  function slipChance() {
    return bagOn() ? clamp((1.10 - mass) * 0.9, 0, 0.38) : clamp((1.02 - mass) * 0.35, 0, 0.12);
  }
  const forcedSlip = () => (typeof slip === "function" ? !!slip() : !!slip);

  function endStage() {
    if (!stage.abandoned && stage.key) stage.trace = stage.key + " · done";
    stage.abandoned = false; stage.key = null; stage.layer = null; stage.surface = null;
    stage.roll = 0; stage.pitch = 0; stage.groundY = 0; stage.walking = false;
    stage.next = null; stage.squashAt = null; stage.squashEnv = 0;
    go("floor");
  }

  // The floor he may walk: between whatever is on his left and whatever is on his right.
  function floorRange() {
    const clr = clearance(); let lo = -1e3, hi = 1e3;
    for (const name of Object.keys(boxes)) {
      if (name === "crid") continue;
      const b = boxOf(name); if (!b) continue;
      const l = leftOf(b), r = rightOf(b);
      if (r < -0.05) lo = Math.max(lo, r + clr);
      else if (l > 0.05) hi = Math.min(hi, l - clr);
    }
    if (lo < -999) lo = worldX(48) + clr;
    if (hi > 999) hi = worldX(screenWidth - 48) - clr;
    return hi - lo < 0.4 ? [0, 0] : [lo, hi];
  }

  // Where he stands to use a panel: the edge that faces the room, at his own clearance.
  function standFor(name) {
    const b = boxOf(name); if (!b) return null;
    const l = leftOf(b), r = rightOf(b), clr = clearance();
    const side = (l + r) / 2 < stage.walkX ? "right" : "left";
    return { b, side, l, r, top: topOf(b), x: side === "right" ? r + clr : l - clr };
  }

  // The brain says which panel; the body decides how he gets on it and where he stands.
  function begin(intent) {
    if (!intent || !intent.layer) return false;
    const want = intent.key === "climb" ? "climb" : intent.key === "sit-on" ? "sit" : intent.key === "lean-watch" ? "lean" : null;
    if (!want) return false;
    if (!((targets()[want] || []).includes(intent.layer))) return false;   // not reachable any more
    const s = standFor(intent.layer); if (!s) return false;
    const lip = Math.min(hisW / 2 + 6 * pxW(), (s.r - s.l) / 2);
    stage.key = intent.key; stage.layer = intent.layer; stage.side = s.side;
    stage.topY = s.top; stage.targetX = s.x; stage.fromX = s.x; stage.fromY = 0;
    stage.lipX = s.side === "right" ? s.r - lip : s.l + lip;
    stage.abandoned = false; stage.reason = ""; stage.slipRolled = false; stage.stumble = 0;
    stage.next = null; stage.squashAt = null; stage.squashEnv = 0;
    go("approach");
    return true;
  }

  // §9.5 — a panel that is gone, moved or narrowed under him is the one thing that interrupts him
  // mid-phase, because leaving him standing on a vanished panel is the most broken thing on air.
  function checkSurface(nowMs) {
    if (!stage.surface) return;
    if (nowMs - lastSurfaceCheck < 1000) return;
    lastSurfaceCheck = nowMs;
    const b = boxOf(stage.surface.name);
    let why = "";
    if (!b) why = "absent";
    else if (Math.abs(topOf(b) - stage.surface.top) > 6 * pxW()) why = "moved";
    else if (widthOf(b) < hisW * 1.2) why = "narrow";
    if (why) abandon("layer-gone");
  }

  function abandon(reason) {
    const was = stage.key;
    stage.abandoned = true; stage.reason = reason;
    stage.trace = (was || "activity") + " · abandoned (" + reason + ")";
    stage.surface = null;
    onInterrupt(reason);                        // the activity in flight ends, and the trace says why
    if (stage.groundY > 0.02) { stage.fromY = stage.groundY; go("drop"); }
    else if (stage.state === "lean" || stage.state === "lean-in") { stage.fromRoll = stage.roll; stage.fromPitch = stage.pitch; go("push-off"); }
    else if (stage.state === "seat") { stage.fromY = stage.seatY; go("hop-down"); }
    else endStage();
  }

  // Off it, the slow way: crouch, drop, land. Never a cut, and never longer than §9.5's 1200 ms.
  // `fromX` stays the floor stand point, so he lands beside the panel and not inside it.
  function finishStage() {
    if (stage.state === "top") { stage.fromY = stage.groundY; go("crouch"); }
    else if (stage.state === "lean" || stage.state === "lean-in") { stage.fromRoll = stage.roll; stage.fromPitch = stage.pitch; stage.surface = null; go("push-off"); }
    else if (stage.state === "seat") { stage.fromY = stage.seatY; stage.surface = null; go("hop-down"); }
    else endStage();
  }

  function step(nowMs, intent, dtArg) {
    // like being.step: time is the argument, dt defaults to the gap since the last call.
    const dt = Number.isFinite(dtArg) ? dtArg
      : lastNow === null ? 0
      : Math.min(5, Math.max(0, (nowMs - lastNow) / 1000));
    lastNow = nowMs;
    stage.t += dt;
    // Landing squash envelope: ~8% for the first 80 ms of contact, then a
    // damped recovery whose cosine lobe lets him stretch a hair past rest
    // once before settling — the same "one small overshoot" the settle ease gives.
    if (stage.squashAt != null) {
      const s = (nowMs - stage.squashAt) / 1000;
      stage.squashEnv = s < 0 ? 0
        : s < 0.08 ? 0.08
        : Math.max(-0.02, 0.08 * Math.exp(-6 * (s - 0.08)) * Math.cos((s - 0.08) * 14));
      if (s > 1.2) { stage.squashAt = null; stage.squashEnv = 0; }
    }
    checkSurface(nowMs);

    if (stage.state === "floor") {
      if (intent && intent.layer && intent.phase === "start") begin(intent);   // he starts it at its start beat
      else if (intent && intent.key === "wander") {
        const [lo, hi] = floorRange();
        stage.targetX = lo + (hi - lo) * clamp(intent.x, 0, 1);
        stage.walking = true; stage.trace = "wander";
      } else stage.walking = false;
      return stage;
    }
    // the brain has moved on: finish the sequence instead of holding a pose nobody asked for — but
    // not before he has actually used the panel, or a long walk would eat the whole activity
    if (intent && intent.key !== stage.key && !TRANSIENT.includes(stage.state) && stage.hold <= 0) return finishStage();

    switch (stage.state) {
      case "approach":
        stage.walking = true;
        if (Math.abs(stage.targetX - stage.walkX) <= 0.02) {
          stage.walking = false;
          // Every commit gets its anticipation beat first: 130 ms of opposite
          // dip (stageChannels "anticipate") before the pull, the hop or the lean.
          // A climb keeps its longer wind-up: approach -> reach (hands on the lip)
          // -> anticipate -> pull, so the dip lands right before the commit.
          if (stage.key === "climb") go("reach");
          else { stage.next = stage.key === "lean-watch" ? "lean-in" : "hop"; go("anticipate"); }
        }
        break;
      case "anticipate":                            // the wind-up: eyes already on target, body dips opposite
        stage.walking = false;
        if (stage.t >= 0.13) go(stage.next || "floor");
        break;
      case "reach": {                              // hands on the lip, weight down
        stage.walking = false;
        if (stage.t >= 0.5) { stage.next = "pull"; go("anticipate"); }
        break;
      }
      case "pull": {                               // the feet leave the floor and land on the top
        // Committed a third of the way up, the lip gets one verdict. A slip is a state,
        // not a glitch: he slides back down and pays a recovery beat before the trace moves on.
        if (!stage.slipRolled && stage.t >= 0.22) {
          stage.slipRolled = true;
          if (forcedSlip() || rand() < slipChance()) {
            stage.slipFromX = stage.walkX; stage.slipFromY = stage.groundY;
            stage.trace = "climb · slipping"; go("slip"); break;
          }
        }
        const e = ease(stage.t / 0.75);
        stage.groundY = stage.topY * e;
        stage.walkX = stage.fromX + (stage.lipX - stage.fromX) * e;
        if (stage.t >= 0.75) {
          stage.groundY = stage.topY; stage.walkX = stage.lipX;
          stage.surface = { name: stage.layer, top: stage.topY };
          stage.squashAt = nowMs; stage.hold = 2.5; go("top");
        }
        break;
      }
      case "slip": {                               // hands lose the lip: slide back down the face
        const e = ease(stage.t / 0.8);
        stage.groundY = stage.slipFromY * (1 - e);
        stage.walkX = stage.slipFromX + (stage.fromX - stage.slipFromX) * e;
        if (stage.t >= 0.8) { stage.groundY = 0; stage.walkX = stage.fromX; stage.surface = null; stage.squashAt = nowMs; go("recover"); }
        break;
      }
      case "recover":                              // the scramble: a beat on the floor, then done
        stage.walking = false;
        if (stage.t >= 1.0) {
          stage.abandoned = true; stage.reason = "slip";
          stage.trace = "climb · abandoned (slip)";
          onInterrupt("slip"); stage.surface = null; endStage();
        }
        break;
      case "top": {                                // standing on it, drifting along the top
        stage.groundY = stage.topY;
        const b = boxOf(stage.layer);
        if (b) {
          const lo = leftOf(b) + hisW / 2 + 4 * pxW(), hi = rightOf(b) - hisW / 2 - 4 * pxW();
          const want = lo + (hi - lo) * (0.5 + 0.5 * Math.sin(stage.t * 0.35 + 1));
          stage.targetX = clamp(want, Math.min(lo, hi), Math.max(lo, hi));
          stage.walking = Math.abs(stage.targetX - stage.walkX) > 0.03;
        } else stage.walking = false;
        stage.hold = Math.max(0, stage.hold - dt);
        if (stage.hold <= 0 && ((intent && intent.phase === "end") || !intent || intent.key !== stage.key)) { stage.walking = false; finishStage(); }
        break;
      }
      case "crouch":
        stage.walking = false;
        if (stage.t >= 0.28) go("drop");
        break;
      case "drop": {                               // a controlled drop with a landing, not a fall
        const e = ease(stage.t / 0.4);
        stage.groundY = stage.fromY * (1 - e);
        stage.walkX = stage.lipX + (stage.fromX - stage.lipX) * e;
        if (stage.t >= 0.4) { stage.groundY = 0; stage.walkX = stage.fromX; stage.surface = null; stage.squashAt = nowMs; go("settle"); }
        break;
      }
      case "settle":
        stage.walking = false;
        if (stage.t >= 0.6) endStage();
        break;
      case "lean-in": {                            // his shoulder goes back onto the panel edge
        const e = ease(stage.t / 0.45), dir = stage.side === "right" ? 1 : -1;
        stage.roll = dir * 0.20 * e; stage.pitch = -0.06 * e;
        if (stage.t >= 0.45) { stage.surface = { name: stage.layer, top: stage.topY }; stage.hold = 3; go("lean"); }
        break;
      }
      case "lean":
        // the lean point is the edge and it stays fixed: only the chest breathes, so contact reads
        stage.walking = false;
        stage.hold = Math.max(0, stage.hold - dt);
        if (stage.hold <= 0 && ((intent && intent.phase === "end") || !intent || intent.key !== stage.key)) { stage.surface = null; finishStage(); }
        break;
      case "push-off": {
        const e = ease(stage.t / 0.45);
        stage.roll = stage.fromRoll * (1 - e); stage.pitch = stage.fromPitch * (1 - e);
        if (stage.t >= 0.45) { stage.roll = 0; stage.pitch = 0; go("settle"); }
        break;
      }
      case "hop": {                                // up onto the panel to sit on its lip
        const e = ease(stage.t / 0.55);
        stage.groundY = stage.topY * e;
        stage.walkX = stage.fromX + (stage.lipX - stage.fromX) * e;
        if (stage.t >= 0.55) {
          stage.walkX = stage.lipX; stage.seatY = stage.topY - hipY + 0.02; stage.groundY = stage.seatY;
          stage.surface = { name: stage.layer, top: stage.topY };
          stage.squashAt = nowMs; stage.hold = 3; go("seat");
        }
        break;
      }
      case "seat":
        stage.walking = false;
        stage.hold = Math.max(0, stage.hold - dt);
        if (stage.hold <= 0 && ((intent && intent.phase === "end") || !intent || intent.key !== stage.key)) { stage.surface = null; finishStage(); }
        break;
      case "hop-down": {
        const e = ease(stage.t / 0.5);
        stage.groundY = stage.fromY * (1 - e);
        stage.walkX = stage.lipX + (stage.fromX - stage.lipX) * e;
        if (stage.t >= 0.5) { stage.groundY = 0; stage.walkX = stage.fromX; stage.squashAt = nowMs; go("settle"); }
        break;
      }
      default: endStage();
    }
    return stage;
  }

  return Object.assign(stage, {
    step,
    /** The body-side interrupt: the panel he was using is gone or the caller says stop. */
    interrupt(reason = "interrupt") { abandon(reason); return stage; },
  });
}

/* --- the stage's own pose: a reach, a landing, a seat ----------------------
 * The rig page built these as deltas on the idle channels (`C`), blended the same way the clips
 * blend. Here they come back as a channel map of deltas — the renderer adds them onto its own
 * idle pose. `t` is seconds (`now / 1000` on the page); the seat's leg swing is on the wall
 * clock, not the state clock, and keeps that. */
export function stageChannels(stage, t) {
  const C = {
    armLiftL: 0, armLiftR: 0, armFwdL: 0, armFwdR: 0,
    kneeL: 0, kneeR: 0, legFwdL: 0, legFwdR: 0,
    leanFwd: 0, headPitch: 0, elbowL: 0, elbowR: 0, rootY: 0,
  };
  // anticipation: 130 ms of the opposite move before every commit — crouch down,
  // lean back, arms drop — while the eyes are already on the target (the gaze
  // bias lives in crid-bot's lookBias, not here).
  if (stage.state === "anticipate") {
    const u = clamp(stage.t / 0.13, 0, 1), dip = Math.sin(Math.PI * u);
    C.rootY -= 0.05 * dip; C.kneeL += 0.5 * dip; C.kneeR += 0.5 * dip;
    C.leanFwd -= 0.12 * dip;
    C.armLiftL -= 0.3 * dip; C.armLiftR -= 0.3 * dip;
    C.headPitch += 0.10 * dip;
  }
  if (stage.state === "reach" || stage.state === "pull") {
    const reach = stage.state === "reach" ? clamp(stage.t / 0.5, 0, 1) : 1 - clamp(stage.t / 0.75, 0, 1) * 0.6;
    C.armLiftL += 1.9 * reach; C.armLiftR += 1.9 * reach;
    C.armFwdL += 0.5 * reach; C.armFwdR += 0.5 * reach;
    C.kneeL += 0.45 * reach; C.kneeR += 0.45 * reach;
    C.leanFwd += 0.16 * reach;
  }
  if (stage.state === "crouch" || stage.state === "drop" || stage.state === "settle") {
    // settle is a damped stop, not a linear fade: the crouch overshoots a touch
    // past rest once (negative dip = a small rise) before he stands square.
    const dip = stage.state === "settle"
      ? Math.max(-0.18, Math.exp(-4 * stage.t) * Math.cos(stage.t * 8))
      : 1;
    C.kneeL += 0.55 * dip; C.kneeR += 0.55 * dip; C.leanFwd += 0.18 * dip;
    C.armLiftL += 0.35 * dip; C.armLiftR += 0.35 * dip;
  }
  if (stage.state === "seat" || stage.state === "hop-down") {
    const u = stage.state === "seat" ? 1 : 1 - clamp(stage.t / 0.5, 0, 1);
    C.kneeL += 1.4 * u; C.kneeR += 1.4 * u; C.legFwdL += 1.2 * u; C.legFwdR += 1.2 * u;
    C.armFwdL += 0.30 * u; C.armFwdR += 0.30 * u;
    C.kneeL += Math.sin(t * 1.9) * 0.10 * u; C.kneeR += Math.sin(t * 1.9 + 1.2) * 0.10 * u;   // the legs swing
  }
  // the struggle beats (physics.md §2): a slip scrabbles, a stumble flails, a recover crouches
  if (stage.state === "slip") {
    const u = clamp(stage.t / 0.8, 0, 1);
    C.legFwdL += Math.sin(stage.t * 22) * 0.3 * u; C.legFwdR -= Math.sin(stage.t * 22) * 0.3 * u;
    C.kneeL += 0.5 * u; C.kneeR += 0.5 * u; C.leanFwd += 0.22 * u;
    C.armLiftL += 1.2 * u; C.armLiftR += 1.2 * u; C.headPitch += 0.2 * u;
  }
  if (stage.state === "recover") {
    const u = clamp(stage.t / 1, 0, 1);
    C.kneeL += 0.55 * u; C.kneeR += 0.55 * u; C.leanFwd += 0.18 * u;
    C.armLiftL += 0.4 * u; C.armLiftR += 0.4 * u;
  }
  if (stage.stumble > 0) {
    const u = stage.stumble / 0.7;
    C.leanFwd += 0.20 * u; C.rootY -= 0.035 * u; C.headPitch += 0.18 * u;
    C.armLiftL += 0.9 * u; C.armLiftR += 0.9 * u; C.elbowL += 0.7 * u; C.elbowR += 0.7 * u;
    C.kneeL += 0.35 * u; C.kneeR += 0.35 * u;
  }
  return C;
}
