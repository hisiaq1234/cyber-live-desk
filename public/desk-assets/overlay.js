import { createCridAudioSync } from "./crid-audio.js";

/* CYBER LIVE DESK — public overlay, Apple feel reskin (Swae Safe Top-Docked Layout).
   Transparent, no dependencies, no build step. Loaded by the /desk page.
   - Topic cards forced top-left under CRID bug.
   - Widgets (X, Spaces, Music, Court) forced to #dock-right (top-right).
   URL options (all optional)
     pos=top-left              (forced; bottom-* mapped to top)
     scale=0.6–1.4             poll=1–30 (seconds, default 3)
     anim=slide | fade | none  debug=1   (connection dot, leave off on air)
     x.mode=trends|following   x.userId=      x.jpoll=10–3600
     logo=                     (CRID badge logo URL, falls back to ./crid-logo.png)
     Add a card type: DeskOverlay.register("my-type", (card, opts) => HTMLElement)  */
import { createSoundOrbSync } from "./sound-orb.js";

(() => {
  "use strict";

  // ---------- config ----------
  const P = new URLSearchParams(location.search);
  const num = (k, d, lo, hi) => {
    const v = parseFloat(P.get(k));
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  };
  const pick = (k, list, d) => (list.includes(P.get(k)) ? P.get(k) : d);
  const CFG = {
    pollMs: num("poll", 3, 1, 30) * 1000,
    pos: "top-left",
    scale: num("scale", 1, 0.6, 1.4),
    anim: pick("anim", ["slide", "fade", "none"], "slide"),
    debug: P.get("debug") === "1",
    crid: P.get("crid") !== "0",
    cridPos: "top",
  };
  const xMode = P.get("x.mode") || "";
  const xJPos = "top";
  const xJPollMs = num("x.jpoll", 60, 10, 3600) * 1000;
  const xUserId = P.get("x.userId") || "";

  // ---------- styles ----------
  const CSS = `
html,body{margin:0;background:transparent!important;overflow:hidden}
#desk{position:fixed;inset:0;pointer-events:none;color:#f3f2f0;
  --accent:#ff453a;--accent-glow:rgba(255,69,58,.35);--ink:#f3f2f0;
  --glass:#111214f0;--surface-soft:#ededef11;--surface-line:#ededef21;
  --radius:1rem;
  --brand:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif;
  font-family:var(--brand);
  font-synthesis:none;text-rendering:optimizelegibility;-webkit-font-smoothing:antialiased;
  --m:clamp(12px,4vmin,32px);
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
  transition:opacity .24s cubic-bezier(.2,.8,.2,1),transform .24s cubic-bezier(.2,.8,.2,1),filter .24s ease}
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
  transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
#crid-jumbotron.in { opacity: 1; transform: translateX(0) scale(1); animation: bug-breathe 4s ease-in-out infinite; }
#crid-jumbotron.out { opacity: 0; transform: translateX(-20px) scale(0.96); }
.crid-logo { width: 3.2em; height: 3.2em; border-radius: 50%; object-fit: contain; background: #000; border: 2px solid var(--surface-line); flex-shrink: 0; }
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
@keyframes bug-breathe { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.05); } }

/* Mid-left sound orb: compact in silence, expanding only during audible CRID playback. */
#sound-orb{position:fixed;left:calc(var(--m) + env(safe-area-inset-left,0px));top:54%;z-index:8;
  width:clamp(28px,4vw,72px);aspect-ratio:1;border-radius:50%;pointer-events:none;
  display:grid;place-items:center;opacity:.76;transform:translate3d(0,-50%,0) scale(.92);
  filter:drop-shadow(0 8px 18px rgba(0,0,0,.48));
  transition:width .42s cubic-bezier(.2,.85,.25,1),opacity .35s ease,transform .42s cubic-bezier(.2,.85,.25,1)}
#sound-orb::before{content:"";position:absolute;inset:0;border-radius:50%;
  background:radial-gradient(circle at 31% 24%,rgba(220,226,240,.22),transparent 18%),
    radial-gradient(circle at 42% 38%,#242a35 0,#11141b 45%,#07090e 78%);
  border:1px solid rgba(112,127,153,.25);box-shadow:inset 0 2px 7px rgba(225,235,255,.12),inset 0 -7px 16px rgba(0,0,0,.64)}
#sound-orb::after{content:"";position:absolute;inset:26%;border-radius:50%;
  background:radial-gradient(circle at 35% 28%,#ff9a9e 0,#ff334d 35%,#9d102d 74%,#4b0c1e 100%);
  box-shadow:0 0 12px rgba(255,48,74,.58),0 0 26px rgba(255,48,74,.28)}
#sound-orb .orb-ring{position:absolute;inset:-20%;border:1px solid rgba(255,65,88,.72);border-radius:50%;opacity:0;transform:scale(.78)}
#sound-orb.is-active{width:clamp(54px,7vw,120px);opacity:1;transform:translate3d(0,-50%,0) scale(1)}
#sound-orb.is-active::after{animation:orb-core-pulse .9s ease-in-out infinite alternate}
#sound-orb.is-active .orb-ring{animation:orb-wave 1.65s ease-out infinite}
#sound-orb.is-active .orb-ring:nth-child(2){animation-delay:.82s}
@keyframes orb-wave{0%{opacity:.76;transform:scale(.76)}100%{opacity:0;transform:scale(1.58)}}
@keyframes orb-core-pulse{from{filter:brightness(.92);transform:scale(.9)}to{filter:brightness(1.35);transform:scale(1.13)}}

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
.anim-slide .card.in{animation:stage-arrive .44s cubic-bezier(.2,1.12,.32,1) both}
.anim-slide .card.out{animation:stage-leave .24s cubic-bezier(.4,0,.8,.4) both}
.anim-none .card{animation:none}
#desk.anim-none .opt{animation:none!important;transition:none}
@keyframes stage-arrive{
  0%{opacity:0;filter:blur(2px) brightness(1.08);transform:translate3d(0,16px,0) scale(.975)}
  72%{opacity:1;filter:blur(0) brightness(1);transform:translate3d(0,-2px,0) scale(1.006)}
  100%{opacity:1;filter:none;transform:translate3d(0,0,0) scale(1)}
}
@keyframes stage-leave{
  0%{opacity:1;transform:translate3d(0,0,0) scale(1)}
  100%{opacity:0;filter:blur(1px);transform:translate3d(0,-9px,0) scale(.985)}
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
  #sound-orb,#sound-orb.is-active{transition:none;transform:translateY(-50%)}
  #sound-orb.is-active::after,#sound-orb.is-active .orb-ring{animation:none!important}
  .opt,.fill{transition:none}
  .opt.lead{animation:none!important}
  .dot{animation:none}
  #modules>*{animation:none}
  #desk::after{animation:none!important}
  .scale-wrap input::-webkit-slider-thumb{animation:none}
}
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
      `card conf-${news && CONF_LABEL[c.confidence] ? c.confidence : "none"}`,
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

  register("music", (c) => {
    try {
      const music = c || state?.music || { queue: [], current: null, playing: false, volume: 1, muted: false };
      const cur = music.current;
      return h("div", "music-wrap",
        cur ? h("div", "music-current", cur.title) : null,
        cur && cur.artist ? h("div", "music-artist", cur.artist.toUpperCase()) : null,
        h("div", "music-queue", `Queue: ${music.queue.length} · ${music.playing ? "playing" : "paused"}${music.muted ? " · muted" : ""}`),
        music.queue.map((t) => h("div", "music-track" + (t.id === cur?.id ? " current" : ""),
          h("span", "music-title", t.title),
          t.artist && h("span", "music-artist-small", t.artist)))
      );
    } catch { return h("div", "music-wrap", h("div", "music-current", "Music")); }
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
  style.textContent = CSS;
  document.head.append(style);

  const slot = h("div", "slot");
  const root = h("div", { id: "desk", class: `pos-${CFG.pos} anim-${CFG.anim} crid-pos-${CFG.cridPos} x-pos-${xJPos}${CFG.debug ? " debug" : ""}` }, slot);
  document.body.append(root);

  const cridAudio = document.createElement("audio");
  cridAudio.preload = "none";
  cridAudio.hidden = true;
  cridAudio.setAttribute("aria-hidden", "true");
  cridAudio.style.display = "none";
  root.append(cridAudio);
  const syncCridAudio = createCridAudioSync(cridAudio, (error) => {
    console.warn("CRID audio could not start. Browser autoplay policy or the audio URL may have blocked playback.", error);
  });
  const soundOrb = h("div", { id: "sound-orb", "aria-hidden": "true" },
    h("span", { class: "orb-ring" }), h("span", { class: "orb-ring" }), h("span", { class: "orb-core" }));
  root.append(soundOrb);
  const disposeSoundOrb = createSoundOrbSync(cridAudio, soundOrb);
  window.addEventListener("pagehide", disposeSoundOrb, { once: true });

  const dockRight = h("div", { id: "dock-right" });
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

  // ---------- modules (docked right) ----------
  const renderModule = (s) => {
    if (!s) {
      modulesWrap.innerHTML = "";
      moduleKey = null;
      return;
    }
    const parts = [];
    if (s.court) parts.push((renderers.get("court") || fallback)({ type: "court", ...s.court }));
    if (s.music && (s.music.queue.length || s.music.current)) parts.push((renderers.get("music") || fallback)({ type: "music", ...s.music }));
    if (s.spaces && s.spaces.length) parts.push((renderers.get("space") || fallback)({ type: "space", spaces: s.spaces }));
    if (s.ledger && s.ledger.length) parts.push((renderers.get("ledger") || fallback)({ type: "ledger", ledger: s.ledger }));
    if (s.riad && s.riad.active) parts.push((renderers.get("riad") || fallback)({ type: "riad", ...s.riad }));
    const key = JSON.stringify({ court: s.court, music: s.music, spaces: s.spaces, ledger: s.ledger, riad: s.riad });
    if (key === moduleKey) return;
    modulesWrap.innerHTML = "";
    if (parts.length) parts.forEach(p => modulesWrap.append(p));
    moduleKey = key;
  };

  const dropCard = () => {
    const old = slot.firstElementChild;
    if (old) {
      old.classList.add("out");
      setTimeout(() => old.remove(), 320);
    }
    shownKey = null;
  };

  const showCard = (card, opts) => {
    const key = [card.id, opts.showSource, card.headline, card.summary, card.question, card.confidence, opts.poll?.id ?? ""].join("|");
    if (key === shownKey) {
      slot.lastElementChild?.updatePoll?.(opts.poll);
      return;
    }
    dropCard();
    const el = (renderers.get(card.type) || fallback)(card, opts);
    slot.append(el);
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
    const logoUrl = P.get("logo") || "./crid-logo.png";
    const logo = h("img", { class: "crid-logo", src: logoUrl, alt: "CRID Logo" });
    logo.onerror = () => {
      const badge = h("div", { class: "crid-logo", style: "background:radial-gradient(circle at 35% 35%,#2a0808 0%,#0d0d10 80%);border:2px solid var(--accent);display:flex;align-items:center;justify-content:center;font-size:.78em;font-weight:900;color:#fff;letter-spacing:.05em;box-shadow:0 0 14px var(--accent-glow)" }, "CRID");
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
      requestAnimationFrame(() => requestAnimationFrame(() => cridEl?.classList.add("in")));
    }
    cridKey = key;
  };

  // ---------- X jumbotron (docks top-right inside #dock-right) ----------
  let xEl = null;
  let xKey = null;
  let xTimer = null;
  let xStarted = false;

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
      requestAnimationFrame(() => requestAnimationFrame(() => xEl?.classList.add("in")));
    }
    xKey = key;
    clearTimeout(xTimer);
    xTimer = setTimeout(fetchXfeed, xJPollMs);
  };

  const fetchXfeed = async () => {
    if (!xMode) return;
    const params = new URLSearchParams({ mode: xMode });
    if (xUserId) params.set("userId", xUserId);
    try {
      const r = await fetch(`/api/x/feed?${params}`, { cache: "no-store" });
      if (r.ok) renderXjumbotron(await r.json());
    } catch { }
  };

  const render = () => {
    clearTimeout(expiryTimer);
    if (!state) return;
    renderCrid(state.crid);
    syncCridAudio(state.crid);
    renderModule(state);
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
    if (changed) {
      clearTimeout(telemetryTimer);
      root.classList.remove("telemetry-pulse");
      requestAnimationFrame(() => root.classList.add("telemetry-pulse"));
      telemetryTimer = setTimeout(() => root.classList.remove("telemetry-pulse"), 700);
    }
    render();
  };

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
      const elapsed = Math.round(performance.now() - startedAt);
      root.style.setProperty("--poll-duration", `${Math.min(900, 280 + elapsed)}ms`);
      root.dataset.connection = "connected";
      dot?.classList.remove("off", "loading");
      if (dot) dot.title = `Connected · ${elapsed} ms poll`;
    } catch {
      failures++;
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

  window.DeskOverlay = { register };
  tick();
})();
