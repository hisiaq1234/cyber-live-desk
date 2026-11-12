/* CYBER LIVE DESK — the room the desk stands in.

   The page is served with `html,body{background:transparent}` on purpose: the same /desk file is
   loaded straight into OBS as a browser source, and a transparent page is what lets the desk be
   keyed over the stream. In a browser that same transparency is the browser's own white canvas,
   so the desk read as three cards floating in a void. This layer is the fix — the room is drawn
   inside the page instead of being left to the renderer.

   Four things, back to front, all static:
     sky       deep navy at the horizon falling to black at both ends
     grid      a faint cyber grid, masked so it fades out before it reaches an edge
     horizon   the glow that sits ON the floor line, half above it and half below
     floor     the line itself, at the height the cards already give CRID

   The floor is not a guessed height: crid-bot.js measures the band the clock and the ticker leave
   under him and writes it to --bot-floor on his own host. The line reads that same value (see
   syncFloor below), so his feet land on it whether the plates reach the centre column or not. With
   no bot on the page (?bot=0) the line falls back to the exact expression his CSS falls back to,
   so it still sits where he would have stood.

   Nothing here animates and nothing here is a filter over the whole frame, so a Swae snapshot and
   a low-power box pay nothing for it. The one blur is on the horizon glow and is switched off for
   both of those renderers.

   ?bg=0 on /desk removes the layer entirely and gives back the transparent page OBS needs. */

export const SCENE_CSS = `
#desk-scene{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;
  --scene-floor:calc(clamp(12px,4vmin,32px) + env(safe-area-inset-bottom,0px));
  background:
    radial-gradient(120% 62% at 50% 100%, rgba(58,92,220,.20), rgba(8,13,34,0) 64%),
    linear-gradient(180deg,#02040a 0%,#050a18 30%,#0a1330 56%,#070d1f 80%,#010206 100%)}
#desk-scene .scene-grid{position:absolute;inset:0;
  background-image:
    linear-gradient(to right, rgba(122,170,255,.20) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(122,170,255,.16) 1px, transparent 1px);
  background-size:64px 64px,64px 64px;
  -webkit-mask-image:radial-gradient(125% 92% at 50% 60%,#000 10%,rgba(0,0,0,.5) 46%,transparent 80%);
  mask-image:radial-gradient(125% 92% at 50% 60%,#000 10%,rgba(0,0,0,.5) 46%,transparent 80%);
  opacity:.55}
#desk-scene .scene-horizon{position:absolute;left:-12%;right:-12%;bottom:var(--scene-floor);
  height:38vh;transform:translateY(50%);filter:blur(2px);
  background:radial-gradient(58% 50% at 50% 50%,rgba(101,49,248,.42),rgba(44,78,210,.18) 46%,rgba(10,18,48,0) 74%)}
html.swae #desk-scene .scene-horizon,html.low-power #desk-scene .scene-horizon{filter:none}
#desk-scene .scene-floor{position:absolute;left:0;right:0;bottom:var(--scene-floor);height:1px;
  background:linear-gradient(90deg,transparent 0%,rgba(134,246,188,.30) 16%,rgba(101,49,248,.80) 50%,
    rgba(134,246,188,.30) 84%,transparent 100%);
  box-shadow:0 0 18px rgba(101,49,248,.55),0 0 44px rgba(101,49,248,.26)}
#desk-scene .scene-floor::after{content:"";position:absolute;left:0;right:0;top:1px;height:42vh;
  background:linear-gradient(180deg,rgba(2,4,10,.88),rgba(3,6,16,.35) 42%,transparent 100%)}
`;

/**
 * Builds the room. Returns the layer; the caller puts it behind everything (document.body.prepend).
 * `bot` is CRID's mount (createCridBot's return value) — only used to read --bot-floor off it.
 */
export function createScene({ bot = null, doc = document, win = window } = {}) {
  const el = doc.createElement("div");
  el.id = "desk-scene";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = '<div class="scene-grid"></div><div class="scene-horizon"></div><div class="scene-floor"></div>';

  // His floor, read straight off his host rather than re-measured here: crid-bot.js already knows
  // which plates reach the centre column, and a second measurement in a second file would drift
  // from his the first time either one changed.
  let last = "";
  const syncFloor = () => {
    const v = String(bot?.el?.style?.getPropertyValue?.("--bot-floor") || "").trim();
    if (v === last) return;
    last = v;
    if (v) el.style.setProperty("--scene-floor", v);
    else el.style.removeProperty("--scene-floor");
  };
  syncFloor();
  win.addEventListener("resize", syncFloor);
  win.addEventListener("orientationchange", syncFloor);
  // He re-measures on a resize and whenever a plate moves under him, and every one of those writes
  // --bot-floor on his own style, so watching that attribute is enough to keep the line in step.
  if (bot?.el && typeof MutationObserver === "function") {
    new MutationObserver(syncFloor).observe(bot.el, { attributes: true, attributeFilter: ["style"] });
  }
  return el;
}
