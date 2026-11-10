import { createCridAudioSync } from "./crid-audio.js";

/* CYBER LIVE DESK — public landscape overlay with a compact Swae-safe identity strip.
   Transparent, no dependencies, no build step. Loaded by the /desk page.
   - Topic cards use top-left; news cards use the lower third; CRID stays top-docked.
   - X, Spaces and Court use #dock-right; now-playing and headlines share the lower identity strip.
   Renderer-independent: the same page is used by Swae, a desktop browser source or OBS.
   Swae is detected automatically (its "Swae access" bridge is injected into the page) and
   only then switches to snapshot-safe drawing — no blur, no animation. Stream audio is
   always microphone-only, so any audio here is heard on the rendering device, never on air.
   URL options (all optional)
     pos=top-left              (forced; news placement is fixed to the lower third)
     scale=0.6–1.4             poll=1–30 (seconds, default 3)
     anim=slide | fade | none  debug=1   (connection dot, leave off on air)
     x.mode=trends|following   x.userId=      x.jpoll=10–3600
     swae=0 | 1                (force the snapshot-safe style off / on)
     theme=cyber|creative|torn-paper   (default cyber; the theme CSS is ./cyber-theme.js)
     scene=pip                 pip.w=10–60 pip.h=10–60 (% of viewport)
     bot=0 | bl|bc|br          bot.x=0–100 bot.y=0–100  (CRID mascot; 0 restores the sound orb; default bc, the centre column)
     bot.scale=0.4–2.5         (mascot size multiplier on top of the theme's broadcast size; default 1)
     clock=0 | 1               (bottom-left clock plate; on by default)
     chat=0 | 1                chatPrefix=   (Swae chat strip; on by default inside Swae)
     cridLogo=                 (CRID badge logo URL, falls back to ./crid-logo.png)
     logo=0 | tl|tc|tr|bl|bc|br|custom   (desk lockup, see ./logo.js; 0 hides it; default tc)
     logo.w=6–46               (lockup width in vw; the server's state.logo wins over this)
     logo.x= logo.y=0–100      (percent placement, with logo=custom)
     lat= lon= alt= place=     (where the creator is: the readout top-right, the clock's topline and
                                the centre of the map plate; falls back to the desk state, then to
                                the browser's geolocation)
     Add a card type: DeskOverlay.register("my-type", (card, opts) => HTMLElement)  */
import { createSoundOrbSync } from "./sound-orb.js";
import { requestXFeed } from "./x-feed-client.js";
import { createCridBot } from "./crid-bot.js";
import { createLogo, LOGO_POSITIONS, LOGO_MARKS } from "./logo.js";
import { CYBER_CSS } from "./cyber-theme.js";
import { youtubeEmbedUrl } from "./youtube-embed.js";

(() => {
  "use strict";

  // ---------- config ----------
  const P = new URLSearchParams(location.search);
  const num = (k, d, lo, hi) => {
    const v = parseFloat(P.get(k));
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  };
  const pick = (k, list, d) => (list.includes(P.get(k)) ? P.get(k) : d);

  // ---------- renderer detection ----------
  // Swae's Browser Widget injects `window.webkit.messageHandlers.swae` only when the widget
  // has "Swae access" enabled. That makes its presence an exact, zero-config signal that we
  // are being composited by Swae, which matters because Swae draws a *snapshot* of this page
  // at 1/fps (5 by default, never a live view), runs it passively with no hit testing, and
  // mixes only the microphone into the broadcast. Everything else here is renderer-agnostic;
  // this only selects a cheaper drawing style. ?swae=1 forces the cheap style off-device,
  // ?swae=0 forces the full-fidelity one.
  const SWAE = P.get("swae") === "1" ||
    (P.get("swae") !== "0" && typeof window.webkit?.messageHandlers?.swae !== "undefined");
  if (SWAE) document.documentElement.classList.add("swae");

  const CFG = {
    pollMs: num("poll", 3, 1, 30) * 1000,
    pos: "top-left",
    scale: num("scale", 1, 0.6, 1.4),
    anim: pick("anim", ["slide", "fade", "none"], "slide"),
    layout: pick("layout", ["alive", "classic"], "alive"),
    debug: P.get("debug") === "1" && !SWAE,
    crid: P.get("crid") !== "0",
    cridPos: "top",
  };
  const theme = pick("theme", ["creative", "torn-paper", "cyber"], "cyber");
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.crop = P.get("crop") === "0" ? "false" : "true";
  if (P.get("power") === "low") document.documentElement.classList.add("low-power");
  // ?scene=pip reserves the bottom-right corner for the renderer's dual-camera inset and lifts
  // the right column above it. The inset itself is drawn by the renderer, so the page only has
  // to know how much room to leave; the CSS carries a default for when no size is given.
  const scene = pick("scene", ["pip"], "");
  if (scene) {
    document.documentElement.dataset.scene = scene;
    document.documentElement.style.setProperty("--pip-w", num("pip.w", 34, 10, 60) + "vw");
    document.documentElement.style.setProperty("--pip-h", num("pip.h", 34, 10, 60) + "vh");
  }
  // state.scene wins over the URL above, because going dual-camera means bringing in a second
  // camera, and nobody wants to stop the show to edit a browser-source URL to do it. A desk that
  // has never been told leaves the URL in charge, so the old links keep working.
  const renderScene = (s) => {
    if (!s?.mode) return;
    const html = document.documentElement;
    if (s.mode === "pip") {
      html.dataset.scene = "pip";
      html.style.setProperty("--pip-w", `${s.w ?? 34}vw`);
      html.style.setProperty("--pip-h", `${s.h ?? 34}vh`);
    } else delete html.dataset.scene;
  };
  const xMode = P.get("x.mode") || "";
  const xJPos = "top";
  const xJPollMs = num("x.jpoll", 60, 10, 3600) * 1000;
  const xUserId = P.get("x.userId") || "";

  // ---------- location ----------
  // Where the creator is. One source, several consumers — the readout top-right, the clock's
  // topline, and next the centre of his map — resolved in this order, first available wins:
  //   1. ?lat=&lon=&alt=&place= on this page. The URL travels with the frame, so it works in a
  //      Swae widget box and in a browser-source URL, where nobody can tap "allow".
  //   2. the point the operator stored in desk state.
  //   3. navigator.geolocation, when this browser has been granted permission.
  //   4. nothing at all: no readout, no label change, no error, no waiting. A refused prompt is
  //      the normal case here, not a failure — this page is drawn by three different renderers.
  const LOCATION_RANK = { geo: 1, control: 2, url: 3 };
  const PLACE_MAX = 80;
  const numOrNaN = (v) => (v == null || v === "" ? NaN : Number(v));

  // The nearest named place for a coordinate. Today the only name it can produce is one that
  // travelled with the coordinate, because the archive that answers this from coordinates alone —
  // his own unilag.pmtiles — is not in the repo yet. That is the seam: when it lands, look the
  // point up between the `given` check and the empty return, and every consumer below (the
  // readout, the clock topline, and next the map's centre) picks it up without changing.
  const nearestPlace = (lat, lon, given) => {
    const named = typeof given === "string" ? given.trim() : "";
    return named ? named.slice(0, PLACE_MAX) : "";
  };

  // A location is only a location if it carries a coordinate: everything else is optional, so a
  // URL with a place and no numbers (or the other way round) degrades to what it actually has.
  const readLocation = (raw, source) => {
    if (!raw) return null;
    const lat = numOrNaN(raw.lat);
    const lon = numOrNaN(raw.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    const alt = numOrNaN(raw.alt);
    const updatedAt = numOrNaN(raw.updatedAt);
    return {
      lat,
      lon,
      alt: Number.isFinite(alt) ? Math.round(alt) : null,
      place: nearestPlace(lat, lon, raw.place),
      source,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    };
  };

  const URL_LOCATION = readLocation({
    lat: P.get("lat"), lon: P.get("lon"), alt: P.get("alt"), place: P.get("place"),
  }, "url");
  let currentLocation = URL_LOCATION;
  let locationRank = URL_LOCATION ? LOCATION_RANK.url : 0;

  // Only a source that outranks what is already on screen can replace it: a browser fix that lands
  // after the operator's own point must not overwrite it, and nothing overwrites the URL. The same
  // source only replaces a different reading of itself, so a new operator point lands and a repeat
  // of the one already on screen does not redraw the frame.
  const useLocation = (next) => {
    if (!next) return;
    const rank = LOCATION_RANK[next.source] ?? 0;
    if (rank < locationRank) return;
    if (rank === locationRank && currentLocation &&
      currentLocation.lat === next.lat && currentLocation.lon === next.lon &&
      currentLocation.alt === next.alt && currentLocation.place === next.place) return;
    currentLocation = next;
    locationRank = rank;
    renderLocation();
  };

  // The clock's topline is one line of tracked caps, so a long place is trimmed at a word boundary
  // rather than wrapped inside the plate. The readout above keeps the whole name.
  const clockLabel = (place, max = 26) => {
    const p = place.trim();
    if (p.length <= max) return p;
    const cut = p.slice(0, max - 1);
    const at = Math.max(cut.lastIndexOf(","), cut.lastIndexOf(" "));
    return `${(at > 8 ? cut.slice(0, at) : cut).trim()}…`;
  };

  // ---------- styles ----------
  // "cyber" is the desk's own palette: onyx surfaces, indigo structure, mint for the single
  // thing worth looking at. Flat fills, big radii and one hard offset shadow in deep indigo
  // instead of blur or glow — that is both the look and the cheapest thing to snapshot on Swae.
  // The theme itself lives in ./cyber-theme.js and is appended to the base sheet below. Anton and
  // Instrument Serif are self-hosted there, with Impact and Georgia as the fallback stacks.
  const CSS = `
html,body{margin:0;background:transparent!important;overflow:hidden}
#desk{position:fixed;inset:0;pointer-events:none;color:#f3f2f0;
  --accent:#ff453a;--accent-glow:rgba(255,69,58,.35);--ink:#f3f2f0;
  --glass:#111214f0;--surface-soft:#ededef11;--surface-line:#ededef21;
  --radius:1rem;
  --brand:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif;
  --mono:ui-monospace,"SF Mono","Cascadia Mono","JetBrains Mono","Roboto Mono","Courier New",monospace;
  font-family:var(--brand);
  font-synthesis:none;text-rendering:optimizelegibility;-webkit-font-smoothing:antialiased;
  --m:clamp(12px,4vmin,32px);--identity-w:min(36vw,32rem);
  --feed-fs:calc(var(--scale)*clamp(13px,1.8vmin,19px));
  --scale:1;
  font-size:calc(var(--scale)*clamp(15px,3.5vmin,26px));line-height:1.4}
.slot{position:absolute;display:grid;width:min(calc(100vw - 2*var(--m)),56em)}
.slot>*{grid-area:1/1;justify-self:center}
.pos-top-left .slot{left:var(--m);top:calc(var(--m) + 4.5em + env(safe-area-inset-top,0px))}
.card{box-sizing:border-box;align-self:start;position:relative;
  background:var(--glass);backdrop-filter:blur(18px) saturate(1.14);
  -webkit-backdrop-filter:blur(18px) saturate(1.14);
  border:1px solid var(--surface-line);border-radius:1.6em;
  padding:1.3em 1.6em 1.2em;opacity:0;transform:translateY(11px) scale(.985);
  width:100%;max-height:34dvh;
  box-shadow:0 10px 30px #00000045,inset 0 1px #ffffff14;
  transition:opacity .24s cubic-bezier(.2,.8,.2,1),transform .24s cubic-bezier(.2,.8,.2,1)}
.anim-slide .card{transform:translateY(11px) scale(.985)}
.card.in{opacity:1;transform:none}
.card.out{opacity:0;transform:translateY(-10px) scale(.97)}
.anim-none .card{transition:none}
.scale-wrap{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);
  z-index:50;pointer-events:auto;background:rgba(15,15,18,.82);
  backdrop-filter:blur(12px) saturate(160%);-webkit-backdrop-filter:blur(12px) saturate(160%);
  border:.09em solid rgba(255,255,255,.2);border-radius:999px;padding:.35em .85em;
  display:flex;align-items:center;gap:.7em;box-shadow:0 10px 30px rgba(0,0,0,.45);
  opacity:0;transition:opacity .3s ease}
#desk.debug .scale-wrap{opacity:1}
.scale-wrap label{font-size:.62em;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:#8E8E93;font-family:var(--brand)}
.scale-wrap input{appearance:none;width:90px;height:6px;background:rgba(255,255,255,.18);
  border-radius:3px;outline:none;pointer-events:auto}
.scale-wrap input::-webkit-slider-thumb{appearance:none;width:14px;height:14px;
  background:var(--accent);border-radius:50%;pointer-events:auto;
  box-shadow:0 0 8px var(--accent-glow)}
.scale-wrap .val{font-size:.68em;font-weight:700;color:#FFFFFF;
  font-variant-numeric:tabular-nums}
.chip{border:.09em solid var(--accent);color:var(--accent);padding:.05em .7em;border-radius:.9em;
  font-weight:700;font-family:var(--brand);text-transform:uppercase;letter-spacing:.04em;font-size:.82em}
.conf-confirmed .chip{background:var(--accent);color:#111214}
.conf-disputed .chip{border-color:#f3f2f0;color:#f3f2f0}
.conf-unverified .chip{border-color:#f3f2f0;color:#f3f2f0;border-style:dashed}
.conf-test .chip{border-color:#8E8E93;color:#8E8E93}
.meta{display:flex;align-items:center;gap:.55em;margin-bottom:.4em;font-size:.66em;font-weight:600;
  font-family:var(--brand);text-transform:uppercase;letter-spacing:.08em;color:#a4a3a2}
.meta>span:first-child{color:var(--accent)}
.headline{margin:0;font-size:1.35em;font-weight:800;line-height:1.25;
  letter-spacing:-.01em;color:#f3f2f0}
.summary{margin:.55em 0 0;font-size:1.05em;font-weight:600;color:#c7c7cc}
.source{margin:.55em 0 0;font-size:.66em;font-weight:600;color:#a4a3a2;
  text-transform:uppercase;letter-spacing:.07em}
.ask{margin:.85em -1em 0 -1em;padding:.65em 1em;background:#d95d5314;
  border:1px solid var(--accent);color:#f3f2f0;
  font-weight:700;font-family:var(--brand);text-transform:uppercase;letter-spacing:.04em}
.headline,.summary,.ask{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical}
.headline{-webkit-line-clamp:3}.summary{-webkit-line-clamp:3}.ask{-webkit-line-clamp:2}
.conf-none{border-color:var(--accent)}
.poll{margin:.8em 0 .2em;display:grid;gap:.5em}
.opt{position:relative;overflow:hidden;border-radius:1em;background:rgba(255,255,255,.06);
  border:.09em solid rgba(255,255,255,.16);padding:.5em .7em;font-weight:600;font-size:.92em;
  font-family:var(--brand)}
.opt .fill{position:absolute;inset:0 auto 0 0;width:100%;transform:scaleX(0);transform-origin:left center;background:var(--accent);opacity:.9;
  transition:transform .7s cubic-bezier(.22,1,.36,1),opacity .3s}
.opt .row{position:relative;display:flex;justify-content:space-between;gap:.6em}
.opt .label{position:relative;z-index:1}
.opt .pct{position:relative;z-index:1;font-variant-numeric:tabular-nums}
.opt.lead{border-color:var(--accent);background:rgba(255,69,58,.2)}
.opt.lead .fill{opacity:1}
@keyframes lead-pulse{
  0%{box-shadow:0 0 0 0 rgba(255,69,58,.45)}
  70%{box-shadow:0 0 0 8px rgba(255,69,58,0)}
  100%{box-shadow:0 0 0 0 rgba(255,69,58,0)}
}
.opt.lead{animation:lead-pulse 1.2s ease-out}
.anim-none .fill,.anim-none .opt{transition:none}
.poll-state{margin:0;font-size:.7em;font-weight:600;color:#8E8E93;text-transform:uppercase;letter-spacing:.06em}
.dot{position:fixed;right:10px;top:10px;width:10px;height:10px;border-radius:50%;background:#70d89a;
  box-shadow:0 0 10px #70d89a80;animation:pulse-dot 2s ease-in-out infinite}
.dot.off{background:#ff453a}
.dot.loading{background:#ff453a}
@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(1.15)}}

/* CRID Broadcast Bug (Top-Left docked) */
#crid-jumbotron {
  position: absolute;
  top: calc(var(--m) + env(safe-area-inset-top, 0px));
  left: var(--m);
  width: auto;
  max-width: min(calc(100vw - 2*var(--m)), 32em);
  box-sizing: border-box; pointer-events: none; z-index: 10;
  background: var(--glass);
  backdrop-filter: blur(20px) saturate(190%);
  -webkit-backdrop-filter: blur(20px) saturate(190%);
  border: 1px solid var(--surface-line);
  border-radius: 99px;
  padding: 0.6em 1em 0.6em 0.6em;
  box-shadow: 0 10px 30px rgba(0,0,0,0.4), inset 0 1px rgba(255,255,255,0.1);
  display: flex; align-items: center; gap: 1em;
  opacity: 0; transform: translateX(-20px) scale(0.96);
  transition: opacity 0.55s cubic-bezier(0.2, 0.9, 0.25, 1),
              transform 0.55s cubic-bezier(0.2, 0.9, 0.25, 1);
}
#crid-jumbotron.in { opacity: 1; transform: translateX(0) scale(1); animation: bug-breathe 4s ease-in-out infinite; }
#crid-jumbotron.out { opacity: 0; transform: translateX(-20px) scale(0.96); }
.crid-logo { width: 3.2em; height: 3.2em; border-radius: 50%; object-fit: contain; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; text-align: center;
  font-size: .78em; font-weight: 900; letter-spacing: .05em; line-height: 1.05;
  background: var(--glass); border: 2px solid var(--surface-line); color: var(--ink); }
.crid-body { display: flex; flex-direction: column; gap: 0.3em; flex: 1; overflow: hidden; }
.crid-head { display: flex; align-items: center; gap: 0.5em; font-size: 0.65em; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; }
.crid-brand { color: var(--accent); }
.crid-kind { background: rgba(255,255,255,0.08); color: #f3f2f0; padding: 0.1em 0.6em; border-radius: 99px; }
.crid-title { margin: 0; font-size: 1.1em; font-weight: 800; line-height: 1.2; letter-spacing: -0.015em; color: #f3f2f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.crid-foot { display: flex; align-items: center; justify-content: space-between; gap: 0.6em; }
.crid-verdict { display: inline-flex; align-items: center; padding: 0.15em 0.6em; border-radius: 99px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.7em; }
.crid-v-1 { background: var(--accent); color: #111214; }
.crid-v-0 { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
.crid-v-none { color: #8E8E93; font-size: 0.75em; font-weight: 600; text-transform: uppercase; }
@keyframes bug-breathe { 0%,100% { opacity: 1; } 50% { opacity: .94; } }

/* Compact sound/music identity mark; always decorative and never a control. */
#sound-orb{position:fixed;right:calc(var(--m) + var(--identity-w) + .45em);bottom:calc(var(--m) + .45em + env(safe-area-inset-bottom,0px));z-index:26;
  width:clamp(32px,3vw,46px);aspect-ratio:1;border-radius:50%;pointer-events:none;
  display:grid;place-items:center;opacity:.82;transform:scale(.96);
  filter:drop-shadow(0 8px 18px rgba(0,0,0,.48));
  transition:width .42s cubic-bezier(.2,.85,.25,1),bottom .35s ease,opacity .35s ease,transform .42s cubic-bezier(.2,.85,.25,1)}
#sound-orb::before{content:"";position:absolute;inset:0;border-radius:50%;
  background:radial-gradient(circle at 72% 28%,rgba(40,104,166,.5),transparent 34%),
    radial-gradient(circle at 31% 24%,rgba(220,226,240,.26),transparent 20%),
    radial-gradient(circle at 42% 38%,#242a35 0,#11141b 45%,#07090e 78%);
  border:1px solid rgba(112,155,196,.42);box-shadow:inset 0 2px 9px rgba(225,235,255,.17),inset 0 -7px 16px rgba(0,0,0,.64),0 0 14px rgba(30,91,148,.2)}
#sound-orb::after{content:"";position:absolute;inset:26%;border-radius:50%;
  background:radial-gradient(circle at 35% 28%,#ff9a9e 0,#ff334d 35%,#9d102d 74%,#4b0c1e 100%);
  box-shadow:0 0 12px rgba(255,48,74,.58),0 0 26px rgba(255,48,74,.28)}
#sound-orb .orb-ring{position:absolute;inset:-20%;border:1px solid rgba(255,65,88,.72);border-radius:50%;opacity:0;transform:scale(.78)}
#sound-orb:not(.is-active)::before{animation:orb-idle-sheen 4.2s ease-in-out infinite}
#sound-orb:not(.is-active)::after{animation:orb-idle-core 3.2s ease-in-out infinite}
#sound-orb:not(.is-active) .orb-ring{border-color:rgba(65,122,175,.6);animation:orb-idle-ring 4s ease-in-out infinite}
#sound-orb:not(.is-active) .orb-ring:nth-child(2){animation-delay:2s}
#sound-orb.is-active{width:clamp(50px,4.2vw,68px);opacity:1;transform:scale(1)}
#sound-orb.is-active::after{animation:orb-core-pulse .9s ease-in-out infinite alternate}
#sound-orb.is-active .orb-ring{animation:orb-wave 1.65s ease-out infinite}
#sound-orb.is-active .orb-ring:nth-child(2){animation-delay:.82s}
#sound-orb.music-playing::before{border-color:rgba(83,155,211,.72);box-shadow:inset 0 2px 9px rgba(225,235,255,.18),inset 0 -7px 16px rgba(0,0,0,.64),0 0 16px rgba(45,122,186,.38)}
#sound-orb.music-playing{bottom:calc(var(--m) + 1.05em + env(safe-area-inset-bottom,0px))}
#sound-orb.music-playing::after{animation:orb-core-pulse 1.2s ease-in-out infinite alternate}
#sound-orb.music-playing .orb-ring{border-color:rgba(65,145,210,.72);animation:orb-wave 2s ease-out infinite}
#sound-orb.music-playing .orb-ring:nth-child(2){animation-delay:1s}
@keyframes orb-idle-sheen{0%,100%{filter:brightness(.92);transform:rotate(-5deg)}50%{filter:brightness(1.18);transform:rotate(8deg)}}
@keyframes orb-idle-core{0%,100%{filter:brightness(.9);transform:scale(.92)}50%{filter:brightness(1.18);transform:scale(1.04)}}
@keyframes orb-idle-ring{0%,100%{opacity:.08;transform:scale(.82)}50%{opacity:.3;transform:scale(1.12)}}
@keyframes orb-wave{0%{opacity:.76;transform:scale(.76)}100%{opacity:0;transform:scale(1.58)}}
@keyframes orb-core-pulse{from{filter:brightness(.92);transform:scale(.9)}to{filter:brightness(1.35);transform:scale(1.13)}}

/* Timestamp-filtered RSS headlines run automatically in a compact lower-third ticker. */
#auto-headlines{position:fixed;right:var(--m);bottom:calc(var(--m) + env(safe-area-inset-bottom,0px));z-index:25;
  width:var(--identity-w);max-width:calc(100vw - 2*var(--m));
  display:grid;grid-template-columns:minmax(0,1fr);align-items:center;gap:.28em;
  padding:.42em .68em;background:rgba(7,9,14,.88);border:1px solid rgba(102,139,179,.32);
  border-left:.28em solid #ff334d;border-radius:.9em;box-shadow:0 8px 24px rgba(0,0,0,.4);
  font-size:var(--feed-fs);pointer-events:none;opacity:0;transform:translateY(8px);
  transition:opacity .25s ease,transform .25s ease}
#auto-headlines[data-status="ready"],#auto-headlines[data-status="empty"],#auto-headlines[data-status="error"]{opacity:1;transform:none}
.headline-feed-kicker{font-size:.68em;font-weight:900;letter-spacing:.08em;color:#ff5368;text-transform:uppercase;white-space:nowrap}
.identity-row{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:baseline;gap:.12em .5em;min-width:0}
.identity-row .headline-feed-title{grid-column:2;min-width:0;color:#f3f2f0;font-size:.82em;font-weight:750;line-height:1.15;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.identity-row .headline-feed-meta{grid-column:2;font-size:.6em;color:#a9bacb;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.identity-music{padding-bottom:.25em;border-bottom:1px solid rgba(102,139,179,.26)}
.identity-music .headline-feed-kicker{color:#75b9e8}
.news-drop-card{position:fixed;left:calc(var(--m) + 2.2em);bottom:calc(var(--m) + 4.2em + env(safe-area-inset-bottom,0px));
  width:min(calc(100vw - 2*var(--m) - 2.2em),32em);max-height:20dvh;z-index:30;padding:.8em 1em}
@media(max-width:520px){#desk{--identity-w:min(58vw,32rem)}#auto-headlines{width:var(--identity-w);gap:.15em;padding:.32em .5em}.headline-feed-kicker{font-size:.58em}.identity-row .headline-feed-title{font-size:.72em}.identity-row .headline-feed-meta{font-size:.54em}}

/* Right dock (Top-Right docked) — hard height cap so it never reaches Swae's
   bottom and right-edge controls. Modules cap individually; shadows are kept
   inside each module box. */
#dock-right {
  position: absolute; top: calc(var(--m) + env(safe-area-inset-top, 0px)); right: var(--m);
  display: flex; flex-direction: column; align-items: flex-end; gap: 0.6em; box-sizing: border-box;
  width: min(calc(100vw - 2*var(--m)), 26em);
  max-height: 42dvh; overflow: hidden;
  pointer-events: none; z-index: 15;
}
#dock-right:empty { display: none; }
#dock-right > * { width: 100%; box-sizing: border-box; }

/* X jumbotron (docks at top of #dock-right) */
#x-jumbotron {
  max-height: 20dvh; overflow: hidden;
  background:#111214f0;backdrop-filter:blur(16px) saturate(180%);
  -webkit-backdrop-filter:blur(16px) saturate(180%);
  border:.10em solid var(--surface-line);border-radius:1.4em;padding:.7em 1em;
  box-shadow:0 24px 48px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.1);
}
.x-head{display:flex;align-items:center;gap:.5em;margin-bottom:.4em;
  font-size:.66em;font-weight:700;font-family:var(--brand);
  text-transform:uppercase;letter-spacing:.07em;color:#f3f2f0}
.x-brand{background:var(--accent);color:#111214;padding:.18em .65em;border-radius:.9em;font-weight:700;}
.x-kind{background:rgba(255,255,255,.08);color:#f3f2f0;border:.09em solid rgba(255,255,255,.25);
  padding:.18em .6em;border-radius:.9em;text-transform:uppercase;font-weight:700;font-size:.72em}
.x-list{display:flex;flex-direction:column;gap:.35em}
.x-item{display:flex;align-items:baseline;gap:.55em;font-size:.92em;line-height:1.3;
  color:#f3f2f0;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.x-item .x-bullet{color:var(--accent);font-weight:800;font-size:1.1em;flex-shrink:0}
.x-item .x-text{color:#c7c7cc}
.x-item .x-author{color:var(--accent);font-weight:700}
.x-item .x-handle{color:#8E8E93;font-size:.82em}
.x-trend{display:flex;align-items:center;gap:.5em}
.x-trend .x-count{color:#8E8E93;font-size:.78em;font-weight:600}
/* The unavailable panel carries a sentence, not a one-line trend, so it gets a little more
   room than the trend list and keeps its "retrying" footer on screen. */
#x-jumbotron.x-problem-panel{max-height:28dvh}
.x-item.x-problem{font-size:.86em;-webkit-line-clamp:4}

/* Module Component Styles — individual caps keep the dock total bounded */
.court-wrap,.music-wrap,.space-wrap,.ledger-wrap,.riad-wrap {
  max-height: 16dvh; overflow: hidden;
  border:.09em solid var(--surface-line);border-radius:1.2em;padding:1em;
  background:var(--glass);backdrop-filter:blur(12px) saturate(160%);margin:0;
}
.court-question{font-size:1.1em;font-weight:800;color:#f3f2f0;margin:0 0 .6em}
.court-viewpoints{display:flex;gap:.6em}
.court-viewpoint{flex:1;border:.09em solid var(--surface-line);border-radius:.8em;padding:.6em .8em;background:rgba(255,255,255,.03)}
.court-viewpoint .v-label{font-size:.62em;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#8E8E93;margin:0 0 .3em}
.court-viewpoint .v-text{font-size:.9em;color:#f3f2f0}
.court-votes{display:flex;gap:.6em;margin-top:.6em}
.court-vote{border:.09em solid var(--surface-line);border-radius:.8em;padding:.4em .8em;background:rgba(255,255,255,.03);font-size:.85em;font-weight:700;color:#c7c7cc}
.court-verdict{margin-top:.6em;font-size:1em;font-weight:900;text-transform:uppercase;letter-spacing:.1em}
.court-verdict.w{color:#2ED3A5}.court-verdict.l{color:#FF7A66}.court-verdict.open{color:#FFB224}
.music-current{font-size:1em;font-weight:800;color:#f3f2f0;margin:0 0 .3em}
.music-artist{font-size:.8em;color:#c7c7cc;margin:0 0 .6em}
.music-queue{font-size:.75em;color:#8E8E93;margin:0 0 .4em}
.music-track{display:flex;gap:.4em;align-items:center;padding:.2em .4em;border-radius:.6em;background:rgba(255,255,255,.03);margin-bottom:.2em}
.music-track.current{border-color:var(--accent);background:rgba(255,69,58,.15)}
.music-title{flex:1;font-size:.85em;color:#f3f2f0}
.music-artist-small{font-size:.75em;color:#c7c7cc}
#dock-right .music-wrap{width:min(42vw,24em);max-height:32dvh;overflow:hidden;padding:.65em}
.music-video{display:block;width:100%;aspect-ratio:16/9;height:auto;max-height:26dvh;border:0;border-radius:.65em;background:#05070b;pointer-events:none}
.music-empty{margin:.35em 0 0;font-size:.72em;color:#9A90B8}
.space-title{font-size:1em;font-weight:800;color:#f3f2f0;margin:0 0 .2em}
.space-host{font-size:.8em;color:#c7c7cc;margin:0 0 .3em}
.space-topic{font-size:.85em;color:#8E8E93;margin:0 0 .4em}
.space-url{font-size:.72em;color:#7CC4FF;word-break:break-all}
.ledger-title{font-size:1em;font-weight:800;color:#f3f2f0;margin:0 0 .4em}
.ledger-entry{font-size:.8em;color:#c7c7cc;padding:.3em 0;border-bottom:.06em solid var(--surface-line)}
.ledger-entry:last-child{border-bottom:none}
.ledger-type{font-size:.65em;font-weight:800;text-transform:uppercase;color:#FFB224;margin-right:.4em}
.riad-wrap{border:.12em solid #ff453a;border-radius:1.4em;padding:1.2em;background:var(--glass);backdrop-filter:blur(16px) saturate(200%);margin:0;box-shadow:0 0 30px rgba(255,69,58,.3)}
.riad-title{font-size:1.2em;font-weight:900;color:#ff453a;text-transform:uppercase;letter-spacing:.1em;margin:0 0 .3em}
.riad-text{font-size:.95em;color:#f3f2f0;margin:0}

/* Distinct, state-driven motion: slide has weight, fade stays truly still, none stays still. */
.anim-fade .card{transform:none}
.anim-fade .card.out{transform:none}
.anim-slide .card.in{animation:stage-arrive .5s cubic-bezier(.2,.8,.2,1) both}
.anim-slide .card.out{animation:stage-leave .24s cubic-bezier(.4,0,.8,.4) both}
.anim-none .card{animation:none}
#desk.anim-none .opt{animation:none!important;transition:none}
@keyframes stage-arrive{
  0%{opacity:0;transform:translate3d(0,14px,0) scale(.975)}
  70%{opacity:1;transform:translate3d(0,-2px,0) scale(1.004)}
  100%{opacity:1;transform:translate3d(0,0,0) scale(1)}
}
@keyframes stage-leave{
  0%{opacity:1;transform:translate3d(0,0,0) scale(1)}
  100%{opacity:0;transform:translate3d(0,-9px,0) scale(.985)}
}
#modules>*{animation:dock-arrive .32s cubic-bezier(.2,.8,.2,1) both}
#modules>*:nth-child(2){animation-delay:.035s}
#modules>*:nth-child(3){animation-delay:.07s}
#modules>*:nth-child(4){animation-delay:.105s}
@keyframes dock-arrive{
  from{opacity:0;transform:translate3d(0,-6px,0)}
  to{opacity:1;transform:translate3d(0,0,0)}
}

/* The thin top signal reflects measured state-poll latency and recovery state. */
#desk::after{content:"";position:absolute;z-index:100;top:0;left:0;right:0;height:2px;pointer-events:none;
  opacity:0;background:linear-gradient(90deg,transparent,var(--accent),transparent);transform:scaleX(.15);transform-origin:center}
#desk[data-connection="checking"]::after{opacity:.72;animation:poll-scan var(--poll-duration,800ms) cubic-bezier(.2,.8,.2,1) both}
#desk[data-connection="reconnecting"]::after{opacity:.8;background:linear-gradient(90deg,transparent,#ff453a,transparent);animation:reconnect-pulse 1.3s ease-in-out infinite}
#desk.telemetry-pulse::after{animation:state-ping .62s ease-out both}
@keyframes poll-scan{from{transform:scaleX(.12);opacity:.2}to{transform:scaleX(1);opacity:.75}}
@keyframes reconnect-pulse{0%,100%{opacity:.32}50%{opacity:.95}}
@keyframes state-ping{0%{transform:scaleX(.08);opacity:0}28%{opacity:.8}100%{transform:scaleX(1);opacity:0}}
.dot.loading{animation-duration:var(--poll-duration,800ms)}

@media (prefers-reduced-motion:reduce){
  .card{transform:none;transition:none;animation:none!important}
  #crid-jumbotron,#crid-jumbotron.in{transform:none;transition:none;animation:none!important}
  #sound-orb,#sound-orb.is-active{transition:none;transform:none}
  #sound-orb::before,#sound-orb::after,#sound-orb .orb-ring,#sound-orb.is-active::after,#sound-orb.is-active .orb-ring{animation:none!important}
  #auto-headlines{transition:none}
  .opt,.fill{transition:none}
  .opt.lead{animation:none!important}
  .dot{animation:none}
  #modules>*{animation:none}
  #desk::after{animation:none!important}
  .scale-wrap input::-webkit-slider-thumb{animation:none}
}
/* Port of overlay-alive.html: 16:9 left/center/right staging with an editorial footer. */
html[data-theme="creative"] #desk{
  --accent:#d9c29a;--accent-glow:rgba(192,169,232,.42);--glass:rgba(18,16,15,.93);
  --surface-line:rgba(217,194,154,.32);--surface-soft:rgba(217,194,154,.1);
  --brand:"Inter",system-ui,sans-serif;--serif:"Fraunces",Georgia,serif;--mono:"JetBrains Mono",ui-monospace,monospace;
  color:#f8f3ea
}
html[data-theme="torn-paper"] #desk{
  --accent:#3d2b1f;--accent-glow:rgba(61,43,31,.24);--glass:#f7f1e6;
  --surface-line:rgba(61,43,31,.22);--surface-soft:rgba(61,43,31,.08);
  --brand:"Kalam","Caveat",system-ui,sans-serif;--serif:"Caveat","Kalam",Georgia,serif;--mono:"JetBrains Mono",ui-monospace,monospace;
  --paper-grain:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E");
  color:#2a1f16
}
.layout-alive .slot{left:var(--m);top:calc(var(--m) + 4.5em + env(safe-area-inset-top,0px));display:block;
  width:min(460px,calc(100vw - 2*var(--m)));max-height:65dvh;overflow:auto;scrollbar-width:none}
.layout-alive .slot::-webkit-scrollbar,#dock-right::-webkit-scrollbar{display:none}
.layout-alive .slot>*{grid-area:auto;justify-self:stretch;width:100%}
.layout-alive #dock-right{top:var(--m);right:var(--m);width:min(360px,calc(100vw - 2*var(--m)));
  max-height:calc(100svh - 2*var(--m) - 5em);overflow:auto;scrollbar-width:none;align-items:stretch;gap:.55em}
.layout-alive #dock-right>*{width:100%;box-sizing:border-box}
.layout-alive #modules{display:flex;flex-direction:column;align-items:stretch;gap:.55em}
.layout-alive .card{max-height:36dvh;overflow:auto;border-radius:var(--radius);padding:var(--cp,1.1em 1.25em)}
.layout-alive #crid-jumbotron{left:var(--m);top:var(--m);max-width:min(460px,calc(100vw - 2*var(--m)));border-radius:1.2em}
.layout-alive .meta{font-family:var(--mono);font-size:.64em;color:#9d9587}
.layout-alive .headline,.layout-alive .ask,.layout-alive .court-question,.layout-alive .music-current,.layout-alive .ledger-title{
  font-family:var(--serif);letter-spacing:.005em}
.layout-alive .summary,.layout-alive .source,.layout-alive .court-viewpoint .v-text,.layout-alive .ledger-entry{font-family:var(--brand)}
.layout-alive .music-wrap{max-height:28dvh;overflow:auto}
.music-empty{font-size:.78em;color:#9d9587;margin-top:.4em}
/* The clock plate is the operator's own Black Market timestamp, ported rather than paraphrased
   (his index (2).html): crimson #dc143c on paper #f7f3ea, IBM Plex Mono digits at 2.35vw with
   -.045em tracking, a Space Grotesk topline and detail row, the 3px crimson left bar with the
   square-left/round-right corner, and the faint crimson ellipse bleeding out of the bottom-right.
   It keeps that fixed palette instead of the theme's --accent/--glass tokens because it is his
   original and he asked for it to look like it; every other surface still follows the theme.
   It lives bottom-left, which is where his reference frame put it. */
#time-dock{position:absolute;left:var(--m);bottom:var(--m);z-index:20;pointer-events:none;
  box-sizing:border-box;overflow:hidden;isolation:isolate;
  min-width:min(390px,82vw);max-width:calc(100vw - 2*var(--m));
  padding:16px 22px 17px 24px;
  border:1px solid rgba(247,243,234,.14);border-left:3px solid #dc143c;border-radius:0 12px 12px 0;
  background:rgba(8,11,16,.84);color:#f7f3ea;
  box-shadow:0 14px 40px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.05)}
#time-dock::after{position:absolute;z-index:-1;right:-30px;bottom:-44px;width:170px;height:110px;
  border:1px solid rgba(220,20,60,.2);border-radius:50%;content:"";transform:rotate(-18deg)}
#time-dock .clock-top{display:flex;align-items:center;justify-content:space-between;gap:18px;
  margin-bottom:11px;color:rgba(247,243,234,.62);
  font-family:"Space Grotesk",var(--brand),sans-serif;
  font-size:clamp(10px,.72vw,13px);font-weight:600;letter-spacing:.18em;line-height:1;text-transform:uppercase}
#time-dock .clock-live{display:inline-flex;align-items:center;gap:7px;color:#dc143c;white-space:nowrap}
#time-dock .clock-dot{width:7px;height:7px;border-radius:50%;background:#dc143c;
  box-shadow:0 0 0 4px rgba(220,20,60,.14),0 0 14px rgba(220,20,60,.7)}
#time-dock .clock-time{display:block;color:#f7f3ea;
  font-family:"IBM Plex Mono","Courier New",var(--mono);
  font-size:clamp(24px,2.35vw,43px);font-weight:500;letter-spacing:-.045em;line-height:1.05;
  white-space:nowrap;font-variant-numeric:tabular-nums lining-nums}
#time-dock .clock-detail{display:flex;align-items:center;gap:10px;margin-top:12px;
  color:rgba(247,243,234,.62);font-family:"Space Grotesk",var(--brand),sans-serif;
  font-size:clamp(11px,.8vw,14px);font-weight:500;letter-spacing:.04em}
#time-dock .clock-sep{flex:0 0 auto;width:4px;height:4px;border-radius:50%;background:#dc143c}
html[data-crop="true"] #desk .mod::before{content:"";position:absolute;inset:-1px;border-radius:inherit;pointer-events:none;opacity:.34;
  background:linear-gradient(to right,var(--accent) 2px,transparent 2px) 0 0/8px 8px no-repeat,
    linear-gradient(to bottom,var(--accent) 2px,transparent 2px) 0 0/8px 8px no-repeat,
    linear-gradient(to left,var(--accent) 2px,transparent 2px) 100% 100%/8px 8px no-repeat,
    linear-gradient(to top,var(--accent) 2px,transparent 2px) 100% 100%/8px 8px no-repeat}
html[data-theme="torn-paper"] #desk .mod{background:var(--glass) var(--paper-grain);border-color:var(--surface-line);
  border-radius:.35em;box-shadow:0 8px 24px rgba(61,43,31,.18),0 1px 0 rgba(255,255,255,.6) inset;color:#2a1f16;transform:rotate(-.25deg)}
html[data-theme="torn-paper"] #desk .card,html[data-theme="torn-paper"] #desk .court-wrap,
html[data-theme="torn-paper"] #desk .music-wrap,html[data-theme="torn-paper"] #desk .ledger-wrap,
html[data-theme="torn-paper"] #desk .space-wrap,html[data-theme="torn-paper"] #desk .riad-wrap,
html[data-theme="torn-paper"] #desk #x-jumbotron{clip-path:polygon(0 2%,4% 0,10% 1.5%,17% 0,24% 1.7%,33% 0,42% 1.5%,52% 0,63% 1.8%,72% 0,82% 1.4%,92% 0,100% 1%,100% 98%,96% 100%,87% 98.5%,77% 100%,66% 98%,56% 100%,44% 98.3%,34% 100%,23% 98.4%,13% 100%,4% 98.2%,0 99%)}
html[data-theme="torn-paper"] #desk .headline,html[data-theme="torn-paper"] #desk .ask,
html[data-theme="torn-paper"] #desk .court-question,html[data-theme="torn-paper"] #desk .music-current,
html[data-theme="torn-paper"] #desk .ledger-title{font-family:var(--serif);font-weight:700;line-height:1.12}
html[data-theme="torn-paper"] #desk .chip{background:transparent;border:1.5px solid var(--accent);color:var(--accent);transform:rotate(-1.5deg)}
html[data-theme="torn-paper"].low-power #desk .mod,html.low-power #desk .mod{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
  box-shadow:0 4px 12px rgba(0,0,0,.16);background-image:none;transform:none;clip-path:none}

/* Swae composites one screenshot per frame (5 per second by default) instead of showing
   this page live, never forwards taps or scrolling, and mixes only the microphone into the
   broadcast. So backdrop-filter costs a full re-render every snapshot, and animations get
   sampled mid-flight into arbitrary half-drawn frames. Same palette and hierarchy here,
   drawn with solid scrims instead of blur, and state changes land instantly and completely. */
html.swae #desk .card,html.swae #desk .court-wrap,html.swae #desk .music-wrap,
html.swae #desk .space-wrap,html.swae #desk .ledger-wrap,html.swae #desk .riad-wrap,
html.swae #desk #x-jumbotron,html.swae #desk .news-drop-card,html.swae #desk .mod{
  backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:#0b0d12f5}
html.swae #desk *{transition:none!important;animation:none!important}
html.swae .scale-wrap{display:none}

/* Live chat handed over by Swae's own chat bridge, shown only when it exists.
   Sits above #time-dock, which owns the bottom-left corner. */
#swae-chat{position:fixed;left:var(--m);bottom:calc(var(--m) + 4.4em + env(safe-area-inset-bottom,0px));z-index:24;
  width:min(26em,calc(100vw - 2*var(--m)));display:flex;flex-direction:column;gap:.18em;
  padding:.42em .7em;background:rgba(7,9,14,.88);border:1px solid rgba(102,139,179,.32);
  border-left:.28em solid #75b9e8;border-radius:.9em;box-shadow:0 8px 24px rgba(0,0,0,.4);
  font-size:clamp(12px,1.7vmin,17px);pointer-events:none}
#swae-chat[hidden]{display:none}
#swae-chat .swae-chat-line{display:flex;gap:.45em;min-width:0;line-height:1.25}
#swae-chat .swae-chat-user{color:#75b9e8;font-weight:800;flex:0 0 auto;max-width:9em;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#swae-chat .swae-chat-text{color:#e7ecf2;flex:1 1 auto;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Where the creator is, top-right, in the clock's Black Market language rather than the desk's
   cyber palette: the same dark plate, a crimson edge, IBM Plex Mono numerals, because it is the
   same fact about the same moment as the timestamp. It is the first item of the right column, so
   the corner stays his and a module arriving underneath can never land on top of it. No blur: on
   Swae this is drawn once per snapshot, and nothing here animates or transitions. */
#dock-right>#location-readout{align-self:flex-end;width:fit-content;max-width:100%;
  display:flex;flex-direction:column;align-items:flex-end;gap:5px;text-align:right;
  box-sizing:border-box;padding:9px 14px 10px 16px;
  border:1px solid rgba(247,243,234,.14);border-right:3px solid #dc143c;border-radius:12px 0 0 12px;
  background:rgba(8,11,16,.84);color:#f7f3ea;
  box-shadow:0 14px 40px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.05);
  font-family:"Space Grotesk",var(--brand),sans-serif}
#dock-right>#location-readout[hidden]{display:none}
#location-readout .loc-place{color:#dc143c;font-size:clamp(11px,.78vw,14px);font-weight:700;
  letter-spacing:.09em;line-height:1.25;text-transform:uppercase}
#location-readout .loc-fix{display:flex;align-items:center;gap:9px;color:rgba(247,243,234,.62);
  font-family:"IBM Plex Mono","Courier New",var(--mono);font-size:clamp(10px,.7vw,13px);
  letter-spacing:.02em;font-variant-numeric:tabular-nums lining-nums}
#location-readout .loc-sep{flex:0 0 auto;width:4px;height:4px;border-radius:50%;background:#dc143c}

@media(max-width:900px){.layout-alive .slot{width:min(39vw,460px)}
  .layout-alive #dock-right{width:min(31vw,360px)}}
/* On a narrow frame the reference let the plate fill the frame, because in its own file nothing
   else was there. Here the news ticker owns the bottom-right, so the clock keeps the reference's
   full-width plate and its own smaller digits, and steps up above the ticker instead of being laid
   under it. Nothing else changes at that width. */
@media(max-width:520px){#time-dock{min-width:0;width:calc(100vw - 2*var(--m));
  bottom:calc(var(--m) + 3.4em + env(safe-area-inset-bottom,0px))}
  #time-dock .clock-time{font-size:clamp(22px,7vw,34px)}}
/* A 500x500 Swae box: the lockup still owns the top-centre band, so the readout steps below it,
   drops to the place and the altitude, and shrinks its numerals rather than wrapping. Same plate,
   fewer lines — it is read on a phone, a thumbnail away from the full frame. */
@media(max-width:520px){
  #dock-right>#location-readout{margin-top:3.4em;padding:7px 11px 8px 12px;gap:3px;border-radius:9px 0 0 9px}
  #location-readout .loc-place{font-size:10px;letter-spacing:.06em}
  #location-readout .loc-fix{font-size:9px;gap:6px}
  #location-readout .loc-coords,#location-readout .loc-sep{display:none}}

/* The Cyber Radar location plate: the radar's own map, in the desk's frame. Lower-right, sitting
   directly on top of the news ticker, drawn in the clock plate's Black Market language — onyx
   plate, crimson edge, IBM Plex Mono readout — because it is the same fact about the same moment
   as the timestamp. It is geography and never a position: this overlay has no GPS, so the plate
   carries no marker, no accuracy circle and no rotation, and its one readout line names the MAP
   VIEW centre (where the map is looking), not where anybody is. */
#map-plate{position:fixed;right:var(--m);bottom:calc(var(--m) + 5.4em + env(safe-area-inset-bottom,0px));
  z-index:24;box-sizing:border-box;width:min(342px,calc(100vw - 2*var(--m)));
  padding:11px 13px 12px 15px;overflow:hidden;isolation:isolate;pointer-events:none;
  border:1px solid rgba(247,243,234,.14);border-right:3px solid #dc143c;border-radius:12px 0 0 12px;
  background:rgba(8,11,16,.84);color:#f7f3ea;
  box-shadow:0 14px 40px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.05)}
#map-plate[hidden]{display:none}
#map-plate::after{position:absolute;z-index:-1;right:-30px;bottom:-44px;width:170px;height:110px;
  border:1px solid rgba(220,20,60,.2);border-radius:50%;content:"";transform:rotate(-18deg)}
#map-plate .map-top{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:8px;
  color:rgba(247,243,234,.62);font-family:"Space Grotesk",var(--brand),sans-serif;
  font-size:clamp(9px,.66vw,12px);font-weight:600;letter-spacing:.18em;line-height:1;text-transform:uppercase}
#map-plate .map-name{color:#dc143c}
#map-plate .map-canvas{position:relative;height:clamp(108px,14vh,168px);border-radius:8px;overflow:hidden;
  border:1px solid rgba(247,243,234,.12);background:#0b0c0a}
#map-plate .map-canvas .cr-map{position:absolute;inset:0}
#map-plate .map-readout{margin:9px 0 0;color:rgba(247,243,234,.66);
  font-family:"IBM Plex Mono","Courier New",var(--mono);font-size:clamp(9px,.6vw,11px);
  font-weight:500;letter-spacing:.03em;line-height:1.45;text-transform:uppercase;
  font-variant-numeric:tabular-nums lining-nums}
@media(max-width:520px){#map-plate{width:calc(100vw - 2*var(--m));padding:8px 10px 9px 12px}
  #map-plate .map-canvas{height:clamp(92px,13vh,130px)}}
`;

// ---------- upgraded DOM helper ----------
  const asText = (v) => (v != null && typeof v === 'object' && !(v instanceof Node)) ? '' : String(v || '');
  const h = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    if (typeof props === "string") e.className = props;
    else for (const [k, v] of Object.entries(props || {})) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on") || k in e) e[k] = v;
      else e.setAttribute(k, v);
    }
    for (const k of kids.flat()) {
      if (k == null || k === false) continue;
      e.append(k instanceof Node ? k : document.createTextNode(asText(k)));
    }
    return e;
  };

  // ---------- card renderers ----------
  const renderers = new Map();
  const register = (type, fn) => renderers.set(type, fn);

  const CONF_LABEL = {
    confirmed: "Confirmed", reported: "Reported", disputed: "Disputed",
    unverified: "Unverified claim", test: "Test card",
  };

  const when = (iso) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  };

  const sourceLine = (c) => {
    const parts = [c.publisher, when(c.publishedAt)].filter(Boolean);
    return parts.length ? h("p", "source", "Source: " + parts.join(", ")) : null;
  };

  const pollBlock = (poll) => {
    const rows = poll.options.map((o) => {
      const fill = h("span", "fill");
      const pct = h("span", "pct");
      return { id: o.id, fill, pct, el: h("div", "opt", fill, h("div", "row", h("span", "label", o.label), pct)) };
    });
    const note = h("p", "poll-state");
    const box = h("div", "poll", rows.map((r) => r.el), note);
    box.update = (p) => {
      const total = p.options.reduce((n, o) => n + o.count, 0);
      const top = Math.max(...p.options.map((o) => o.count));
      for (const o of p.options) {
        const r = rows.find((x) => x.id === o.id);
        if (!r) continue;
        const share = total ? Math.round((o.count / total) * 100) : 0;
        r.fill.style.transform = `scaleX(${share / 100})`;
        r.pct.textContent = `${share}% (${o.count})`;
        r.el.classList.toggle("lead", !p.active && total > 0 && o.count === top);
      }
      note.textContent = p.active ? `Voting open, ${total} votes` : `Final result, ${total} votes`;
    };
    box.update({ ...poll, options: poll.options.map((o) => ({ ...o, count: 0 })) });
    return box;
  };

  const baseCard = (c, opts) => {
    const news = c.type === "news-drop";
    const ask = opts.poll ? opts.poll.question : c.question;
    const el = h(
      "article",
      `card${news ? " news-drop-card" : ""} conf-${news && CONF_LABEL[c.confidence] ? c.confidence : "none"}`,
      h("div", "meta", c.category && h("span", "", c.category), news && h("span", "chip", CONF_LABEL[c.confidence] || "")),
      h("h1", "headline", c.headline),
      c.summary && h("p", "summary", c.summary),
      opts.showSource && sourceLine(c),
      c.type !== "poll" && ask && h("div", "ask", ask)
    );
    if (opts.poll) {
      const pb = pollBlock(opts.poll);
      el.insertBefore(pb, el.querySelector(".ask"));
      el.updatePoll = pb.update;
    }
    return el;
  };

  register("news-drop", baseCard);
  const fallback = baseCard;

  register("court", (c) => {
    try {
      const total = (c.votes?.a ?? 0) + (c.votes?.b ?? 0);
      const pctA = total ? Math.round((c.votes.a / total) * 100) : 0;
      const pctB = total ? Math.round((c.votes.b / total) * 100) : 0;
      const verdictEl = h("div", "court-verdict", c.verdict === 1 ? "W" : c.verdict === 0 ? "L" : c.status === "open" ? "OPEN" : "CLOSED");
      verdictEl.classList.add(c.verdict === 1 ? "w" : c.verdict === 0 ? "l" : "open");
      return h("div", "court-wrap",
        h("div", "court-question", c.question),
        h("div", "court-viewpoints",
          h("div", "court-viewpoint", h("div", "v-label", "A"), h("div", "v-text", c.viewpointA)),
          h("div", "court-viewpoint", h("div", "v-label", "B"), h("div", "v-text", c.viewpointB))),
        h("div", "court-votes",
          h("div", "court-vote", `A: ${c.votes?.a ?? 0} (${pctA}%)`),
          h("div", "court-vote", `B: ${c.votes?.b ?? 0} (${pctB}%)`)),
        verdictEl);
    } catch { return h("div", "court-wrap", h("div", "court-question", "Court")); }
  });

  register("music", (musicState) => {
    try {
      const music = musicState || state?.music;
      const cur = music?.current;
      if (!cur) return null;
      const src = youtubeEmbedUrl(cur.videoId, { autoplay: music.playing === true });
      const player = src ? h("iframe", {
        class: "music-video",
        src,
        title: `YouTube player: ${cur.title || "current track"}`,
        loading: "lazy",
        referrerPolicy: "strict-origin-when-cross-origin",
        allow: "autoplay; encrypted-media; picture-in-picture; web-share",
        allowFullscreen: true,
      }) : h("p", "music-empty", "No validated YouTube video is available for this track.");
      return h("section", { class: "music-wrap", "aria-label": "Music player" },
        h("div", "music-current", cur.title || "Now playing"),
        cur.artist && h("div", "music-artist", cur.artist),
        player
      );
    } catch { return null; }
  });

  register("space", (c) => {
    try {
      const spaces = c.spaces || state?.spaces || [];
      return h("div", "space-wrap",
        ...spaces.map((s) => h("div", {},
          h("div", "space-title", s.title),
          s.host && h("div", "space-host", `Host: ${s.host}`),
          s.topic && h("div", "space-topic", s.topic),
          s.url && h("a", { class: "space-url", href: s.url, target: "_blank", rel: "noopener noreferrer" }, "Open on X")
        ))
      );
    } catch { return h("div", "space-wrap", h("div", "space-title", "Spaces")); }
  });

  register("ledger", (c) => {
    try {
      const ledger = c.ledger || state?.ledger || [];
      return h("div", "ledger-wrap",
        h("div", "ledger-title", "STRANGERS Ledger"),
        ...ledger.slice(-8).map((e) => h("div", "ledger-entry",
          h("span", "ledger-type", e.type), e.title,
          e.description && h("span", "", ` — ${e.description}`)
        ))
      );
    } catch { return h("div", "ledger-wrap", h("div", "ledger-title", "Ledger")); }
  });

  register("riad", (c) => {
    try {
      const riad = c || state?.riad;
      if (!riad || !riad.active) return null;
      return h("div", "riad-wrap",
        h("div", "riad-title", "RIAD — RENT IS ALWAYS DUE"),
        h("div", "riad-text", `Raid announced${riad.channel ? ` from ${riad.channel}` : ""}.`)
      );
    } catch { return null; }
  });

  // ---------- mount ----------
  const style = document.createElement("style");
  style.textContent = CSS + CYBER_CSS;
  document.head.append(style);

  const slot = h("div", "slot");
  const root = h("div", { id: "desk", class: `layout-${CFG.layout} pos-${CFG.pos} anim-${CFG.anim} crid-pos-${CFG.cridPos} x-pos-${xJPos}${CFG.debug ? " debug" : ""}` }, slot);
  document.body.append(root);
  const headlineShelf = h("div", { id: "auto-headlines", "aria-live": "off", "data-status": "loading" });
  root.append(headlineShelf);

  // ---------- Swae chat bridge ----------
  // Swae already reads the chat for the broadcast. With "Swae access" on it can hand those
  // messages straight to this page, so chat can be shown without a second connection to
  // Twitch. Messages arrive as { chat: { user, segments } }; a prefix can be requested so
  // Swae forwards only matching lines. Chat is a Swae-only surface today, ?chat=0 turns it
  // off and ?chat=1 previews the empty strip elsewhere.
  const chatFeed = h("div", { id: "swae-chat", hidden: true, "aria-live": "off" });
  root.append(chatFeed);
  const CHAT = (SWAE || P.get("chat") === "1") && P.get("chat") !== "0";
  const CHAT_LINES = 3;
  if (CHAT && typeof swae !== "undefined" && typeof swae.subscribe === "function") {
    const chatPrefix = P.get("chatPrefix") || "";
    swae.subscribe(chatPrefix ? { chat: { prefix: chatPrefix } } : { chat: {} });
    swae.onmessage = (data) => {
      const chat = data && data.chat;
      if (!chat) return;
      const text = (chat.segments || [])
        .map((s) => (s && typeof s.text === "string" ? s.text : ""))
        .join("")
        .trim();
      if (!text) return;
      chatFeed.hidden = false;
      chatFeed.append(h("div", "swae-chat-line",
        h("span", "swae-chat-user", chat.user || "???"),
        h("span", "swae-chat-text", text)));
      while (chatFeed.children.length > CHAT_LINES) chatFeed.firstElementChild.remove();
    };
  }

  const cridAudio = document.createElement("audio");
  cridAudio.preload = "none";
  cridAudio.hidden = true;
  cridAudio.setAttribute("aria-hidden", "true");
  cridAudio.style.display = "none";
  root.append(cridAudio);
  const syncCridAudio = createCridAudioSync(cridAudio, (error) => {
    console.warn("CRID audio could not start. Browser autoplay policy or the audio URL may have blocked playback.", error);
  });
  // CRID, the mascot, replaces the sound orb: it grooms itself when idle, reacts to the desk and
  // pushes docked modules out of its own chest. ?bot=0 restores the orb, ?bot=bl|bc|br picks the
  // spot (default bottom-centre: the centre column is his, and the lockup above him is the one band
  // he never reaches), and ?bot.x= / ?bot.y= place it by percent. The two are independent — giving
  // one anchors that axis and leaves the other on its default — so a corner can be nudged without
  // restating both.
  const BOT_ARG = P.get("bot");
  const botPlaced = P.get("bot.x") != null || P.get("bot.y") != null;
  const bot = BOT_ARG === "0" ? null : createCridBot({
    root,
    swae: SWAE,
    lowPower: document.documentElement.classList.contains("low-power"),
    position: ["bl", "bc", "br"].includes(BOT_ARG) ? BOT_ARG : "bc",
    x: botPlaced ? num("bot.x", 50, 0, 100) : null,
    y: botPlaced ? num("bot.y", 88, 0, 100) : null,
    // ?bot.scale= is the size knob: the mascot is drawn at broadcast size by default, and the
    // operator can shrink or grow him from the browser source URL without a code change.
    scale: num("bot.scale", 1, 0.4, 2.5),
  });
  const soundOrb = bot ? bot.el : h("div", { id: "sound-orb", "aria-hidden": "true" },
    h("span", { class: "orb-ring" }), h("span", { class: "orb-ring" }), h("span", { class: "orb-core" }));
  if (!bot) root.append(soundOrb);
  const disposeSoundOrb = createSoundOrbSync(cridAudio, soundOrb);
  window.addEventListener("pagehide", disposeSoundOrb, { once: true });

  // The desk lockup: the robot, the wordmark and the rule, arriving one layer at a time. It is a
  // separate thing from the mascot below it and from the CRID badge inside the jumbotron. Top-centre
  // is the one band of this layout nothing else claims — the jumbotron owns top-left, the dock owns
  // the right, the identity strip and clock own the bottom corners. state.logo wins over the URL,
  // so the operator can move, resize, silence or replay it on air without touching a browser source.
  const LOGO_ARG = P.get("logo");
  const lockup = LOGO_ARG === "0" ? null : createLogo({
    root,
    position: LOGO_POSITIONS.includes(LOGO_ARG) ? LOGO_ARG : "tc",
    width: num("logo.w", 24, 6, 46),
    x: P.get("logo.x") != null ? num("logo.x", 50, 0, 100) : null,
    y: P.get("logo.y") != null ? num("logo.y", 6, 0, 100) : null,
    mark: LOGO_MARKS.includes(P.get("logo.mark")) ? P.get("logo.mark") : "bot",
  });
  const renderLogo = (l) => { if (lockup) { lockup.update(l || {}); capBot(); } };

  // ?bot.scale= may only grow him into space that is actually empty. crid-bot caps the width it
  // draws against the frame's own edges; the desk adds the two bands *inside* the frame — the
  // lockup over his head and the floor band under his feet — because both are measured here and
  // move on their own. The cap is handed over as --bot-max, the one variable crid-bot already
  // multiplies into --bot-w, so a raised scale shrinks him instead of drawing his head over the
  // logo lockup or his feet past the floor band.
  const BOT_ASPECT = 160 / 168; // the sprite's width:height, from crid-bot's stylesheet
  const capBot = () => {
    if (!bot) return;
    const host = bot.el;
    // --m on #desk resolved by hand: a custom property's computed value is the clamp() token
    // itself, so it cannot be read back as pixels. This is the same clamp(12px, 4vmin, 32px).
    const m = Math.min(32, Math.max(12, 0.04 * Math.min(innerWidth, innerHeight)));
    const frameCap = Math.min(innerWidth - 2 * m, (innerHeight - 2 * m) * BOT_ASPECT);
    const band = host.getBoundingClientRect();
    const lock = lockup?.el.getBoundingClientRect();
    let cap = frameCap;
    if (lock && lock.height > 0 && lock.left < band.right && lock.right > band.left) {
      // The room between the lockup's measured bottom and his own feet — his feet, not the frame's,
      // because crid-bot has already lifted him onto the clock and the ticker where they reach his
      // column. Carried back through the aspect so the width he is given stays inside that room.
      const room = Math.max(0, band.bottom - lock.bottom - 8);
      if (room > 0) cap = Math.min(cap, room * BOT_ASPECT);
    }
    host.style.setProperty("--bot-max", `${Math.round(cap)}px`);
  };
  // The lockup and the floor band both move with the frame, and his feet are re-measured a frame
  // after a resize, so the cap is measured again on the next frame as well as immediately.
  window.addEventListener("resize", () => { bot?.place(); capBot(); requestAnimationFrame(capBot); });

  // ---------- location readout ----------
  // The place, the coordinate and the altitude, top-right, drawn in the clock's language because
  // it is the same fact about the same moment. It is the first item of the right column rather
  // than a floating plate, so a module arriving underneath it cannot land on top of it, and it is
  // hidden until there is a location: a frame with no location is byte-for-byte the frame that
  // shipped before this existed.
  const locationPlace = h("span", "loc-place");
  const locationFix = h("div", "loc-fix");
  const locationReadout = h("div", { id: "location-readout", hidden: true, "aria-live": "off" },
    locationPlace, locationFix);
  const fmtDegrees = (v, pos, neg) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
  // The map plate is built further down the file, so a location reaches it through this hook rather
  // than through a second render path: renderLocation() stays the one place where a location lands
  // on the frame, and the plate registers itself here when it exists (?map=0 means it never does).
  let syncMapLocation = null;
  const renderLocation = () => {
    if (syncMapLocation) syncMapLocation(currentLocation);
    // The clock's topline is the place when there is one, and his own "Black Market" when there is
    // not — the label it has always carried. Nothing else about the clock changes, and the
    // "Africa / Lagos" line below it is his, always.
    const market = root.querySelector("#time-dock .clock-market");
    if (market) market.textContent = currentLocation?.place ? clockLabel(currentLocation.place) : "Black Market";
    if (!currentLocation) {
      locationReadout.hidden = true;
      return;
    }
    locationReadout.hidden = false;
    locationReadout.dataset.source = currentLocation.source;
    locationPlace.hidden = !currentLocation.place;
    locationPlace.textContent = currentLocation.place || "";
    locationFix.replaceChildren(h("span", "loc-coords",
      `${fmtDegrees(currentLocation.lat, "N", "S")}, ${fmtDegrees(currentLocation.lon, "E", "W")}`));
    if (currentLocation.alt != null) {
      locationFix.append(h("i", { class: "loc-sep", "aria-hidden": "true" }),
        h("span", "loc-alt", `↕ ${currentLocation.alt}m`));
    }
  };

  // The browser's own fix, asked for once and never awaited: the page draws whether or not it
  // answers. A denied prompt, a missing API, or a browser that throws here is not an error state —
  // the frame keeps the location it already had, or none at all, and looks exactly as it did
  // before it knew where it was.
  const requestGeo = () => {
    if (locationRank >= LOCATION_RANK.control) return; // the URL or the operator already decided
    const geo = navigator.geolocation;
    if (!geo || typeof geo.getCurrentPosition !== "function") return;
    try {
      geo.getCurrentPosition(
        (pos) => useLocation(readLocation({
          lat: pos.coords.latitude, lon: pos.coords.longitude, alt: pos.coords.altitude,
        }, "geo")),
        () => {},
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
    } catch { }
  };

  const dockRight = h("div", { id: "dock-right" });
  dockRight.append(locationReadout);
  root.append(dockRight);

  const modulesWrap = h("div", { id: "modules" });
  dockRight.append(modulesWrap);

  if (CFG.debug) {
    const scaleWrap = h("div", "scale-wrap");
    const scaleLabel = h("span", "", "SCALE");
    const scaleInput = h("input", { type: "range", min: "0.6", max: "1.4", step: "0.05", value: String(CFG.scale) });
    const scaleVal = h("span", "val", CFG.scale.toFixed(2));
    scaleWrap.append(scaleLabel, scaleInput, scaleVal);
    scaleInput.addEventListener("input", () => {
      const v = scaleInput.value;
      root.style.setProperty("--scale", v);
      scaleVal.textContent = v;
    });
    document.body.append(scaleWrap);
    const dot = h("div", "dot");
    document.body.append(dot);
  }

  let shownKey = null;
  let moduleKey = null;
  let identityMusicKey = "";
  let shownKinds = new Set();

  // ---------- modules (docked right) ----------
  // Every teardown has to go through bot.cancel first: CRID owns a module's transform while it is
  // mid-flight, so removing the node underneath it would leave a queued animation pointing at a
  // detached element and stall the whole job queue.
  const clearModules = () => {
    if (bot) for (const c of [...modulesWrap.children]) bot.cancel(c);
    modulesWrap.innerHTML = "";
  };

  const renderModule = (s) => {
    if (!s) {
      clearModules();
      moduleKey = null;
      shownKinds = new Set();
      return;
    }
    const track = s.music?.current;
    const musicKey = s.music?.playing && track?.title ? `${track.title}|${track.artist || ""}` : "";
    if (musicKey !== identityMusicKey) {
      identityMusicKey = musicKey;
      soundOrb.classList.toggle("music-playing", Boolean(musicKey));
      drawHeadlines();
    }
    const parts = [];
    const kinds = [];
    if (s.music?.current) { parts.push((renderers.get("music") || fallback)(s.music)); kinds.push("music"); }
    if (s.court) { parts.push((renderers.get("court") || fallback)({ type: "court", ...s.court })); kinds.push("court"); }
    if (s.spaces && s.spaces.length) { parts.push((renderers.get("space") || fallback)({ type: "space", spaces: s.spaces })); kinds.push("spaces"); }
    if (s.ledger && s.ledger.length) { parts.push((renderers.get("ledger") || fallback)({ type: "ledger", ledger: s.ledger })); kinds.push("ledger"); }
    if (s.riad && s.riad.active) { parts.push((renderers.get("riad") || fallback)({ type: "riad", ...s.riad })); kinds.push("riad"); }
    const key = JSON.stringify({
      music: s.music?.current ? {
        title: s.music.current.title, artist: s.music.current.artist,
        videoId: s.music.current.videoId, playing: Boolean(s.music.playing),
      } : null,
      court: s.court, spaces: s.spaces, ledger: s.ledger, riad: s.riad,
    });
    if (key === moduleKey) return;
    clearModules();
    if (parts.length) parts.forEach(p => modulesWrap.append(p));
    // only a module that was not already up gets pushed out of the bot; the rest stay put
    if (bot) parts.forEach((p, i) => { if (p && !shownKinds.has(kinds[i])) bot.summon(p); });
    shownKinds = new Set(kinds);
    moduleKey = key;
  };

  // A card on air is dismissed *into* CRID rather than faded: the bot pulls it back into its chest
  // and only then removes the node. The `leaving` marker stops a second drop from grabbing a card
  // that is already on its way back, which matters because a replacement appends the new card
  // while the old one is still in the slot.
  let summonedCardId = null;
  const dropCard = (replacing = false) => {
    const old = slot.firstElementChild;
    if (old && !old.dataset.leaving) {
      old.dataset.leaving = "1";
      if (bot && !replacing) bot.dismiss(old, () => old.remove());
      else {
        bot?.cancel(old);
        old.classList.add("out");
        setTimeout(() => old.remove(), 320);
      }
    }
    shownKey = null;
    if (!replacing) summonedCardId = null;
  };

  const showCard = (card, opts) => {
    const key = [card.id, opts.showSource, card.headline, card.summary, card.question, card.confidence, opts.poll?.id ?? ""].join("|");
    if (key === shownKey) {
      slot.lastElementChild?.updatePoll?.(opts.poll);
      return;
    }
    dropCard(true);
    const el = (renderers.get(card.type) || fallback)(card, opts);
    slot.append(el);
    // an edit to the card already on air does not re-summon it; a different card does
    if (bot && summonedCardId !== card.id) { summonedCardId = card.id; bot.summon(el); }
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.classList.add("in");
        el.updatePoll?.(opts.poll);
      })
    );
    shownKey = key;
  };

  // ---------- state ----------
  let version = -1;
  let lastUpdated = 0;
  let clockOffset = 0;
  let state = null;
  let expiryTimer = null;
  let pollTimer = null;
  let telemetryTimer = null;
  let failures = 0;
  let headlineItems = [];
  let headlineIndex = 0;
  let headlinePollTimer = null;
  let headlineRotateTimer = null;

  const relativeHeadlineTime = (publishedAt) => {
    const elapsed = Math.max(0, Date.now() - Date.parse(publishedAt));
    if (!Number.isFinite(elapsed)) return "time unknown";
    const mins = Math.floor(elapsed / 60000);
    return mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
  };

  const drawHeadlines = (note = "Checking for fresh headlines…") => {
    const track = state?.music?.playing ? state.music.current : null;
    const rows = [];
    if (track?.title) rows.push(h("div", "identity-row identity-music",
      h("span", "headline-feed-kicker", "NOW PLAYING"),
      h("span", "headline-feed-title", track.title),
      h("span", "headline-feed-meta", track.artist || "Music desk")));
    if (!headlineItems.length) {
      headlineShelf.dataset.status = note.startsWith("No fresh") ? "empty" : note.startsWith("Fresh headlines unavailable") ? "error" : "loading";
      rows.push(h("div", "identity-row identity-news",
        h("span", "headline-feed-kicker", track?.title ? "NEWS" : "LATEST · NIGERIA"),
        h("span", "headline-feed-title", note),
        h("span", "headline-feed-meta", "RSS · last 12 hours")));
      headlineShelf.replaceChildren(...rows);
      return;
    }
    const item = headlineItems[headlineIndex % headlineItems.length];
    headlineShelf.dataset.status = "ready";
    rows.push(h("div", "identity-row identity-news",
      h("span", "headline-feed-kicker", track?.title ? "NEWS" : "LATEST · NIGERIA"),
      h("span", "headline-feed-title", item.title),
      h("span", "headline-feed-meta", `${item.publisher || "Google News"} · ${relativeHeadlineTime(item.publishedAt)} · RSS`)));
    headlineShelf.replaceChildren(...rows);
  };

  const refreshHeadlines = async () => {
    try {
      const response = await fetch("/api/desk-headlines", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      headlineItems = Array.isArray(payload.headlines) ? payload.headlines.filter((item) => item?.title && item?.publishedAt) : [];
      headlineIndex = 0;
      drawHeadlines(headlineItems.length ? "" : "No fresh headlines in the last 12 hours.");
    } catch {
      headlineItems = [];
      drawHeadlines("Fresh headlines unavailable. Retrying automatically.");
    } finally {
      clearTimeout(headlinePollTimer);
      headlinePollTimer = setTimeout(refreshHeadlines, 5 * 60 * 1000);
    }
  };
  headlineRotateTimer = setInterval(() => {
    if (headlineItems.length > 1) { headlineIndex = (headlineIndex + 1) % headlineItems.length; drawHeadlines(); }
  }, 12 * 1000);
  window.addEventListener("pagehide", () => { clearTimeout(headlinePollTimer); clearInterval(headlineRotateTimer); }, { once: true });

  const schedulePoll = (ms) => {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(tick, ms);
  };

  const GRACE_MS = 8000;
  const serverNow = () => Date.now() + clockOffset;

  // ---------- CRID Bug ----------
  let cridEl = null;
  let cridKey = null;

  const renderCrid = (crid) => {
    if (!CFG.crid || !crid) {
      if (cridEl) {
        cridEl.classList.remove("in");
        cridEl.classList.add("out");
        const old = cridEl;
        setTimeout(() => old.remove(), 320);
        cridEl = null;
        cridKey = null;
      }
      return;
    }
    const key = [
      crid.id, crid.entry, crid.kind, crid.title, crid.credit, crid.verdict,
      crid.result?.winner, crid.result?.percent, crid.result?.total, crid.result?.tie,
    ].join("|");
    if (key === cridKey && cridEl) return;
    const logoUrl = P.get("cridLogo") || "./crid-logo.png";
    const logo = h("img", { class: "crid-logo", src: logoUrl, alt: "CRID Logo" });
    logo.onerror = () => {
      // No mark file has ever been deployed, so this fallback is what is actually on air. It is
      // built from the theme's own tokens: cyber-theme.js reserves red for meaning and caps it at
      // ~2% of a frame, and a permanent red disc behind "CRID" broke that on every theme.
      const badge = h("div", { class: "crid-logo" }, "CRID");
      if (logo.parentNode) logo.replaceWith(badge);
    };
    const brand = h("span", "crid-brand", `CRID #${crid.entry}`);
    const kind = h("span", "crid-kind", crid.kind || "topic");
    const head = h("div", "crid-head", brand, kind);
    const title = h("div", "crid-title", crid.title);
    let vEl = null;
    if (crid.verdict === 1) {
      vEl = h("span", "crid-verdict crid-v-1", "✔ RENT PAID");
    } else if (crid.verdict === 0) {
      vEl = h("span", "crid-verdict crid-v-0", "✖ STILL OWING");
    } else if (crid.result) {
      vEl = h("div", "crid-v-none", crid.result.tie ? "TIE (50/50)" : `${crid.result.winner} (${crid.result.percent}%)`);
    } else {
      vEl = h("span", "crid-v-none", "LIVE SEGMENT");
    }
    const foot = h("div", "crid-foot", vEl, crid.credit ? h("span", "crid-v-none", `BY @${crid.credit.toUpperCase()}`) : null);
    const textBody = h("div", "crid-body", head, title, foot);
    if (cridEl) {
      cridEl.replaceChildren(logo, textBody);
    } else {
      cridEl = h("div", { id: "crid-jumbotron" }, logo, textBody);
      root.append(cridEl);
      bot?.summon(cridEl);
      requestAnimationFrame(() => requestAnimationFrame(() => cridEl?.classList.add("in")));
    }
    cridKey = key;
  };

  // ---------- X jumbotron (docks top-right inside #dock-right) ----------
  let xEl = null;
  let xKey = null;
  let xTimer = null;
  let xStarted = false;

  // The feed is down: say so on the jumbotron instead of leaving the corner blank. No stand-in
  // tweets — an empty panel that admits it is broken is honest, invented posts are not.
  const renderXproblem = (message) => {
    if (!xMode) return;
    if (xEl && xKey === `problem|${message}`) return;
    const head = h("div", "x-head", h("span", "x-brand", "X"), h("span", "x-kind", "Unavailable"));
    const list = h("div", "x-list",
      h("div", "x-item x-problem", h("span", "x-text", message)));
    const foot = h("div", "", h("span", "x-count", `Retrying every ${Math.round(xJPollMs / 1000)}s`));
    if (xEl) {
      xEl.replaceChildren(head, list, foot);
    } else {
      xEl = h("div", { id: "x-jumbotron" }, head, list, foot);
      dockRight.prepend(xEl);
      bot?.summon(xEl);
      requestAnimationFrame(() => requestAnimationFrame(() => xEl?.classList.add("in")));
    }
    xEl.classList.add("x-problem-panel");
    xKey = `problem|${message}`;
  };

  const renderXjumbotron = (feed) => {
    if (!xMode || !feed) {
      if (xEl) {
        xEl.remove();
        xEl = null;
        xKey = null;
      }
      clearTimeout(xTimer);
      return;
    }
    const key = [xMode, xUserId, JSON.stringify(feed)].join("|");
    if (key === xKey && xEl) {
      clearTimeout(xTimer);
      xTimer = setTimeout(fetchXfeed, xJPollMs);
      return;
    }
    const brand = h("span", "x-brand", "X");
    const kind = h("span", "x-kind", xMode === "trends" ? "Trending" : xMode === "following" ? "Following" : "For You");
    const head = h("div", "x-head", brand, kind);
    let list;
    if (xMode === "trends") {
      const items = (feed.trends || []).map((t) =>
        h("div", "x-item x-trend",
          h("span", "x-bullet", "•"),
          h("span", "x-text", h("span", "x-author", t.name)),
          t.tweetCount && h("span", "x-count", `${t.tweetCount.toLocaleString()} posts`)
        )
      );
      list = h("div", "x-list", ...items);
    } else {
      const since = (iso) => {
        if (!iso) return "";
        const s = new Date(iso).getTime();
        if (!s) return "";
        const m = Math.max(0, (Date.now() - s) / 1000);
        if (m < 60) return "just now";
        if (m < 3600) return `${Math.round(m / 60)}m ago`;
        if (m < 86400) return `${Math.round(m / 3600)}h ago`;
        return `${Math.round(m / 86400)}d ago`;
      };
      const items = (feed.tweets || []).map((t) =>
        h("div", "x-item",
          t.avatar && h("img", { class: "x-avatar", src: t.avatar, alt: "", loading: "lazy" }),
          h("span", "x-text",
            h("span", "x-author", t.author),
            t.handle && h("span", "x-handle", ` @${t.handle}`),
            " — ", t.text
          ),
          h("span", "x-meta",
            h("span", "x-time", since(t.createdAt)),
            t.metrics && h("span", "x-metric", `· ${t.metrics.like?.toLocaleString() ?? 0} ❤  ${t.metrics.repost?.toLocaleString() ?? 0} ↗`)
          )
        )
      );
      list = h("div", "x-list", ...items);
    }
    const foot = h("div", "", h("span", "x-count", new Date(feed.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })));
    if (xEl) {
      xEl.replaceChildren(head, list, foot);
    } else {
      xEl = h("div", { id: "x-jumbotron" }, head, list, foot);
      dockRight.prepend(xEl);
      bot?.summon(xEl);
      requestAnimationFrame(() => requestAnimationFrame(() => xEl?.classList.add("in")));
    }
    xKey = key;
    xEl?.classList.remove("x-problem-panel");
    clearTimeout(xTimer);
    xTimer = setTimeout(fetchXfeed, xJPollMs);
  };

  const fetchXfeed = async () => {
    if (!xMode) return;
    clearTimeout(xTimer);
    const result = await requestXFeed(globalThis.fetch, { mode: xMode, userId: xUserId });
    if (!xMode) return;
    if (result.ok) {
      renderXjumbotron(result.feed);
      return;
    }
    // A failure used to fall into an empty catch: nothing on air, nothing anywhere else, and the
    // poll timer was never re-armed, so one bad response ended the feed for the whole stream.
    console.warn("[desk] " + result.error);
    renderXproblem(result.error);
    clearTimeout(xTimer);
    xTimer = setTimeout(fetchXfeed, xJPollMs);
  };

  const render = () => {
    clearTimeout(expiryTimer);
    if (!state) return;
    renderCrid(state.crid);
    syncCridAudio(state.crid);
    renderModule(state);
    renderLogo(state.logo);
    renderScene(state.scene);
    if (xMode && !xStarted) {
      xStarted = true;
      fetchXfeed();
    }
    const poll = state.poll || null;
    const card = state.card || (poll ? { id: "poll-" + poll.id, type: "poll", category: "Live poll", headline: poll.question } : null);
    if (!state.visible || !card) return dropCard();
    if (state.expiresAt && state.expiresAt <= serverNow()) {
      if (!state.autoPlay) return dropCard();
      schedulePoll(250);
      if (serverNow() - state.expiresAt > GRACE_MS) return dropCard();
      expiryTimer = setTimeout(render, Math.max(50, state.expiresAt + GRACE_MS - serverNow()));
      return showCard(card, { showSource: state.showSource, poll });
    }
    showCard(card, { showSource: state.showSource, poll });
    if (state.expiresAt) expiryTimer = setTimeout(render, Math.max(50, state.expiresAt - serverNow() + 50));
  };

  const apply = (s) => {
    if (s.updatedAt < lastUpdated) return;
    const changed = version >= 0 && s.version !== version;
    version = s.version;
    lastUpdated = s.updatedAt;
    clockOffset = s.serverNow - Date.now();
    state = s;
    // A point the operator stored in desk state is the desk's own answer to "where is he". The
    // page's URL still wins over it, and it still wins over a browser fix.
    if (s.location) useLocation(readLocation(s.location, "control"));
    // CRID derives its own reactions, text tag and dozing from the same state the panels get; it
    // keeps the previous state itself and counts the diff, so it only fires on a real change.
    bot?.observe(s);
    if (changed) {
      clearTimeout(telemetryTimer);
      root.classList.remove("telemetry-pulse");
      requestAnimationFrame(() => root.classList.add("telemetry-pulse"));
      telemetryTimer = setTimeout(() => root.classList.remove("telemetry-pulse"), 700);
    }
    render();
  };

  // CRID is told about the connection only when it flips. A poll that keeps succeeding must not
  // re-boot a bot that is already up, and a run of failures must not stack restart animations —
  // setMode() returns early on a no-op, which would also freeze the doze timer in place.
  let online = true;
  const setOnline = (v) => { if (v !== online) { online = v; bot?.setOnline(v); } };

  const tick = async () => {
    let delay = CFG.pollMs;
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    root.dataset.connection = "checking";
    const dot = document.querySelector(".dot");
    dot?.classList.remove("off");
    dot?.classList.add("loading");
    try {
      const r = await fetch(`/api/desk/state?since=${version}`, { cache: "no-store", signal: controller.signal });
      if (r.ok && r.status !== 204) apply(await r.json());
      else if (!r.ok && r.status !== 204) throw new Error("HTTP " + r.status);
      failures = 0;
      setOnline(true);
      const elapsed = Math.round(performance.now() - startedAt);
      root.style.setProperty("--poll-duration", `${Math.min(900, 280 + elapsed)}ms`);
      root.dataset.connection = "connected";
      dot?.classList.remove("off", "loading");
      if (dot) dot.title = `Connected · ${elapsed} ms poll`;
    } catch {
      failures++;
      setOnline(false);
      root.dataset.connection = "reconnecting";
      dot?.classList.remove("loading");
      dot?.classList.add("off");
      if (dot) dot.title = `Connection retry ${failures}`;
      delay = Math.min(15000, CFG.pollMs * 2 ** Math.min(failures, 4));
    } finally {
      clearTimeout(timeoutId);
      schedulePoll(delay);
    }
  };

  // ---------- clock plate ----------
  // The bottom-left corner: what this desk is, the time, and the zone that time belongs to. The
  // time is the server's, shifted by the offset each poll keeps, so a phone whose own clock is
  // wrong still shows the stream's real time. The zone is pinned to the operator's own, exactly as
  // his timestamp file does it: the desk is a Lagos stream, so the reading is Lagos time on every
  // renderer rather than whatever the machine drawing it happens to be set to. Seconds are written
  // whole, four times a second as in his file, so a Swae snapshot can only ever catch a correct
  // reading — the cadence never changes a digit that has not changed on the clock.
  if (P.get("clock") !== "0") {
    const ZONE = "Africa/Lagos";
    const clockTime = h("time", "clock-time", "--- --, --:--:--");
    const clockDay = h("span", "clock-day", "");
    root.append(h("div", { id: "time-dock" },
      h("div", "clock-top",
        h("span", "clock-market", "Black Market"),
        h("span", "clock-live", h("i", { class: "clock-dot", "aria-hidden": "true" }), "Live")),
      clockTime,
      h("div", "clock-detail",
        clockDay,
        h("i", { class: "clock-sep", "aria-hidden": "true" }),
        h("span", "clock-place", "Africa / Lagos"))));

    // Three formatters, one per line, because the original reads "Oct 20, 17:11:30" over
    // "Tuesday, October 20" and neither is a substring of the other. h23 gives the desk its
    // 24-hour clock; the month and the weekday come from the same instant so the lines cannot
    // disagree at a rollover. The detail row counts the day plainly ("October 20"), which is what
    // the original does, so the two rows differ in day padding by design.
    const monthFormat = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: ZONE });
    const partsFormat = new Intl.DateTimeFormat("en-US", {
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23", timeZone: ZONE });
    const longFormat = new Intl.DateTimeFormat("en-US", {
      weekday: "long", month: "long", day: "numeric", timeZone: ZONE });
    const drawClock = () => {
      const now = new Date(serverNow());
      const v = {};
      for (const part of partsFormat.formatToParts(now)) v[part.type] = part.value;
      clockTime.textContent = `${monthFormat.format(now)} ${v.day}, ${v.hour}:${v.minute}:${v.second}`;
      clockTime.dateTime = now.toISOString();
      clockDay.textContent = longFormat.format(now);
    };
    drawClock();
    const clockTimer = setInterval(drawClock, 250);
    window.addEventListener("pagehide", () => clearInterval(clockTimer), { once: true });
  }

  // ---------- location plate (Cyber Radar) ----------
  // The radar's own map in the desk's frame: his archive read from our shipped PMTiles with
  // self-hosted glyphs, so every label is a real OSM name and the geometry is the real campus.
  // This plate is geography and nothing else. The overlay has no GPS — no marker, no accuracy
  // circle, no rotation — and the single readout line names the MAP VIEW centre, which is where
  // the map is looking, never where anybody is.
  // The centre and the name are the location source's, the same one the readout and the clock
  // topline draw: the coordinate from ?lat=&lon=, the stored point or the browser's fix, and the
  // campus point with the name it has always carried when there is no fix at all.
  // ?map=0 removes the plate and, because every map asset is loaded from this block and nowhere
  // else, removes the MapLibre scripts, the archive and the glyph requests with it.
  if (P.get("map") !== "0") {
    // The Cyber Radar app's own demo centre (UNILAG) and zoom: what the plate shows when the desk
    // does not know where he is, so a frame with no location looks exactly as it did before.
    const FALLBACK_CENTER = [3.398, 6.517]; // lon, lat
    const FALLBACK_PLACE = "UNILAG";
    const MAP_ZOOM = 15.5;
    const SOURCE_LINE = "SOURCE: OSM VIA GEOFABRIK · SNAPSHOT";
    const centreOf = (loc) => (loc ? [loc.lon, loc.lat] : FALLBACK_CENTER);
    const readout = h("p", "map-readout", `MAP VIEW —— · Z${MAP_ZOOM} · ${SOURCE_LINE}`);
    const canvas = h("div", "map-canvas", h("div", "cr-map"));
    const placeName = h("span", "map-place", currentLocation?.place || FALLBACK_PLACE);
    const plate = h("section", { id: "map-plate", "aria-label": "Cyber Radar location plate" },
      h("div", "map-top",
        h("span", "map-name", "Cyber Radar"),
        placeName),
      canvas,
      readout);
    root.append(plate);
    // Registered before the map itself exists, so a fix that lands while MapLibre is still loading
    // is not lost: the name moves at once and the camera takes it when the map is ready.
    let map = null;
    syncMapLocation = (loc) => {
      placeName.textContent = loc?.place || FALLBACK_PLACE;
      if (!map) return;
      const [lng, lat] = centreOf(loc);
      // Jumped, not eased: the plate is non-interactive and Swae renders it as a snapshot, so the
      // camera moves in one frame and the readout redraws from the map's own centre on moveend.
      if (map.getCenter().lng !== lng || map.getCenter().lat !== lat) map.jumpTo({ center: [lng, lat] });
    };

    // Sit directly on top of the news ticker instead of at a guessed offset: the ticker's height
    // follows its type size and the frame, and this plate must never cover it or be covered.
    const placePlate = () => {
      const ticker = document.getElementById("auto-headlines");
      if (!ticker) { plate.style.bottom = ""; return; }
      const top = ticker.getBoundingClientRect().top;
      plate.style.bottom = `${Math.round(Math.max(0, window.innerHeight - top)) + 12}px`;
    };
    placePlate();
    window.addEventListener("resize", placePlate);
    setTimeout(placePlate, 600);
    setTimeout(placePlate, 2500);

    // Build-free vendored browser scripts: maplibre-gl (UMD), pmtiles (UMD) and the ported style.
    const loadAsset = (tag, attrs) => new Promise((res, rej) => {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      el.onload = () => res(el);
      el.onerror = () => rej(new Error(attrs.src || attrs.href));
      document.head.append(el);
    });
    const fmtLat = (v) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? "N" : "S"}`;
    const fmtLon = (v) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? "E" : "W"}`;

    (async () => {
      await loadAsset("link", { rel: "stylesheet", href: "/desk-assets/vendor/maplibre-gl.css" });
      await loadAsset("script", { src: "/desk-assets/vendor/maplibre-gl.js" });
      await loadAsset("script", { src: "/desk-assets/vendor/pmtiles.js" });
      await loadAsset("script", { src: "/desk-assets/map-style.js" });
      const maplibregl = window.maplibregl;
      const pmtiles = window.pmtiles;
      const mapStyle = window.DESK_MAP_STYLE;
      if (!maplibregl || !pmtiles || !mapStyle) throw new Error("map assets missing");
      maplibregl.addProtocol("pmtiles", new pmtiles.Protocol().tile);
      map = new maplibregl.Map({
        container: canvas.firstElementChild,
        style: mapStyle,
        center: centreOf(currentLocation),
        zoom: MAP_ZOOM,
        pitch: 0,
        bearing: 0,
        interactive: false,
        attributionControl: false,
        preserveDrawingBuffer: true,
      });
      const draw = () => {
        const c = map.getCenter();
        readout.textContent =
          `MAP VIEW ${fmtLat(c.lat)} ${fmtLon(c.lng)} · Z${map.getZoom().toFixed(1)} · ${SOURCE_LINE}`;
      };
      let loaded = false;
      map.on("load", () => { loaded = true; draw(); });
      map.on("moveend", draw);
      // A map that never loads must say so rather than showing an empty box as if it were the
      // campus: the readout is the only place this plate makes a claim about what it is showing.
      setTimeout(() => {
        if (loaded) return;
        canvas.dataset.state = "unloaded";
        readout.textContent = `MAP VIEW —— · Z${MAP_ZOOM} · ${SOURCE_LINE} · NOT LOADED`;
      }, 12000);
    })().catch(() => {
      canvas.remove();
      plate.dataset.state = "unavailable";
      readout.textContent = `MAP VIEW —— · ${SOURCE_LINE} · UNAVAILABLE`;
    });
  }

  window.DeskOverlay = { register, logo: lockup };
  // One location, both consumers: the readout and the clock's topline are drawn once here, after
  // both plates exist, and again only when the location itself changes.
  renderLocation();
  requestGeo();
  refreshHeadlines();
  // He was placed before the clock existed, so the floor he measured was the frame's own. Now that
  // every plate is in the document, measure again: this is what puts him on top of the bottom band
  // on a narrow frame and on the floor of a broadcast one.
  if (bot) { bot.place(); capBot(); }
  tick();
})();
