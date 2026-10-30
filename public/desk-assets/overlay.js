/* CYBER LIVE DESK — public overlay, Apple feel reskin.
   Transparent, no dependencies, no build step. Loaded by the /desk page.

   Keeps every behaviour from checkpoint 1 unchanged: same DOM, same classes,
   same URL options, same DeskOverlay.register() hook, same polling and
   auto-play logic. Only the stylesheet changes: straight clean panels,
   system fonts, subtle glass, soft rounded corners, and readable smooth
   animations so headlines are fully legible.

   URL options (all optional)
     pos=bottom-left | bottom-right | top-left | top-right
     scale=0.6–1.4        poll=1–30 (seconds between checks, default 3)
     anim=slide | fade | none
     debug=1              shows a small connection dot (leave off on air)
     x.<name>=<value>     passed to the existing X overlay, e.g. x.position=bottom-right
     xbase=https://your-x-site.netlify.app   only if your X overlay lives on a different site

   Add a new card type without touching this file's core:
     DeskOverlay.register("my-type", (card, opts) => HTMLElement)  */
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
    pos: pick("pos", ["bottom-left", "bottom-right", "top-left", "top-right"], "bottom-left"),
    scale: num("scale", 1, 0.6, 1.4),
    anim: pick("anim", ["slide", "fade", "none"], "slide"),
    debug: P.get("debug") === "1",
    crid: P.get("crid") !== "0",
    cridPos: pick("cridpos", ["top", "bottom"], "top"),
  };
  const xBaseRaw = P.get("xbase") || "";
  const xBase = /^https:\/\/[a-z0-9.-]+$/i.test(xBaseRaw) ? xBaseRaw : "";
  const xQuery = new URLSearchParams(
    [...P].filter(([k]) => k.startsWith("x.")).map(([k, v]) => [k.slice(2), v])
  ).toString();
  const xMode = P.get("x.mode") || "";
  const xJPos = pick("x.jpos", ["top", "bottom"], "bottom");
  const xJPollMs = num("x.jpoll", 60, 10, 3600) * 1000;
  const xUserId = P.get("x.userId") || "";

  // ---------- styles ----------
  // Brand tokens: --ink is the deep panel, --accent the soft brand tint,
  // --glass the frosted panel surface. Everything is straight (no skew) so
  // text reads easily, with subtle glass panels and smooth readable motion.
  // A live --scale UI slider lets the operator size cards on air; polls and
  // scores animate into place; the CRID jumbotron breathes so it feels alive.
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
  /* slot::before glow border removed — was injecting a red neon outline
     around every card bounding box, clashing with the glass card design */
  .slot::before{content:"";grid-area:1/1;pointer-events:none;display:none}
  .pos-top-left .slot::before,.pos-top-right .slot::before{display:none}
  .pos-bottom-left .slot{left:var(--m);bottom:calc(var(--m) + env(safe-area-inset-bottom,0px))}
  .pos-bottom-right .slot{right:var(--m);bottom:calc(var(--m) + env(safe-area-inset-bottom,0px))}
  .pos-top-left .slot{left:var(--m);top:calc(var(--m) + env(safe-area-inset-top,0px));transition:top .35s cubic-bezier(.16,1,.3,1)}
  .pos-top-right .slot{right:var(--m);top:calc(var(--m) + env(safe-area-inset-top,0px))}
  /* When CRID Bug is active in top-left, topic cards sit right below it forming one unified desk */
  .has-crid.pos-top-left .slot{top:calc(var(--m) + env(safe-area-inset-top,0px) + 4.8em)}

  /* Landscape 16:9 Widescreen Stream Frame Optimization:
     Bounds corner cards to ~30em so the center 65%+ of widescreen camera remains unobstructed. */
  @media (min-aspect-ratio: 16/10) {
    .slot { width: min(calc(100vw - 2*var(--m)), 30em); }
    .pos-bottom-left .slot, .pos-top-left .slot { right: auto; }
    .pos-bottom-right .slot, .pos-top-right .slot { left: auto; }
  }

@media (max-aspect-ratio:1/1){
  .slot{width:min(calc(100vw - 2*var(--m)),42em)}
  .card{padding:13px 14px 12px;border-radius:19px}
  .headline{font-size:1.35em}
  .summary{font-size:1.05em}
  #crid-jumbotron{width:min(calc(100vw - 2*var(--m)),46em);padding:1.1em 1.3em;border-radius:1.6em}
  .crid-title{font-size:1.1em}
}

.card{box-sizing:border-box;align-self:end;position:relative;
  background:var(--glass);backdrop-filter:blur(18px) saturate(1.14);
  -webkit-backdrop-filter:blur(18px) saturate(1.14);
  border:1px solid var(--surface-line);border-radius:1.6em;
  padding:1.3em 1.6em 1.2em;opacity:0;transform:translateY(11px) scale(.985);
  width:100%;max-height:34dvh;
  box-shadow:0 10px 30px #00000045,inset 0 1px #ffffff14;
  transition:opacity .24s cubic-bezier(.2,.8,.2,1),transform .24s cubic-bezier(.2,.8,.2,1),filter .24s ease}
@media (max-aspect-ratio:1/1){
  .card{border-radius:19px;padding:13px 14px 12px;max-height:34dvh}
}
.pos-top-left .card,.pos-top-right .card{align-self:start}
.anim-slide .card{transform:translateY(11px) scale(.985)}
.card.in{opacity:1;transform:none}
.card.out{opacity:0;transform:translateY(-10px) scale(.97)}
.anim-none .card{transition:none}
.conf-test{border-color:rgba(255,255,255,.35)}

/* live scale control — the whole desk scales with --scale, operator-driven */
#desk{transform:scale(var(--scale));transform-origin:var(--scale-origin,50% 100%)}
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

/* confidence chips: filled tint = confirmed, outlined = reported,
   dashed = disputed/unverified, grey = test */
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
.opt .fill{position:absolute;inset:0 auto 0 0;width:0;background:var(--accent);opacity:.9;
  transition:width .7s cubic-bezier(.22,1,.36,1),opacity .3s}
.opt .row{position:relative;display:flex;justify-content:space-between;gap:.6em}
.opt .label{position:relative;z-index:1}
.opt .pct{position:relative;z-index:1;font-variant-numeric:tabular-nums}
.opt.lead{border-color:var(--accent);background:rgba(255,69,58,.2)}
.opt.lead .fill{opacity:1}

/* pulse the whole poll row when it takes the lead */
@keyframes lead-pulse{
  0%{box-shadow:0 0 0 0 rgba(255,69,58,.45)}
  70%{box-shadow:0 0 0 8px rgba(255,69,58,0)}
  100%{box-shadow:0 0 0 0 rgba(255,69,58,0)}
}
.opt.lead{animation:lead-pulse 1.2s ease-out}
.anim-none .fill,.anim-none .opt{transition:none}
.poll-state{margin:0;font-size:.7em;font-weight:600;color:#8E8E93;text-transform:uppercase;letter-spacing:.06em}
.xframe{position:fixed;inset:0;width:100%;height:100%;border:0;background:transparent}
.dot{position:fixed;right:10px;top:10px;width:10px;height:10px;border-radius:50%;background:#70d89a;
  box-shadow:0 0 10px #70d89a80;animation:pulse-dot 2s ease-in-out infinite}
.dot.off{background:#ff453a}
.dot.loading{background:#ff453a}
@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(1.15)}}

/* ---------- CRID Broadcast Bug (Persistent Dynamic Network Bug) ---------- */
.crid-pos-bottom #crid-jumbotron{top:auto;bottom:calc(var(--m) + env(safe-area-inset-bottom,0px));transform:translateX(-20px) scale(.96)}
#crid-jumbotron{position:absolute;top:calc(var(--m) + env(safe-area-inset-top,0px));left:var(--m);right:auto;bottom:auto;
  width:auto;max-width:min(calc(100vw - 2*var(--m)),34em);box-sizing:border-box;pointer-events:none;z-index:20;
  background:var(--glass);backdrop-filter:blur(20px) saturate(190%);
  -webkit-backdrop-filter:blur(20px) saturate(190%);
  border:1px solid var(--surface-line);border-radius:99px;padding:.55em 1.1em .55em .6em;
  box-shadow:0 10px 30px rgba(0,0,0,.45),inset 0 1px rgba(255,255,255,.12);
  display:flex;align-items:center;gap:.85em;
  opacity:0;transform:translateX(-20px) scale(.96);
  transition:opacity .5s cubic-bezier(.16,1,.3,1),transform .5s cubic-bezier(.16,1,.3,1)}
.crid-pos-bottom #crid-jumbotron.in{transform:translateX(0) scale(1)}
#crid-jumbotron.in{opacity:1;transform:translateX(0) scale(1);animation:bug-breathe 4s ease-in-out infinite}
#crid-jumbotron.out{opacity:0;transform:translateX(-20px) scale(.96)}
.crid-pos-bottom #crid-jumbotron.out{transform:translateX(-20px) scale(.96)}

/* Logo / Authentic Branding Integration */
.crid-logo{width:3em;height:3em;border-radius:50%;object-fit:cover;background:#000;border:2px solid var(--surface-line);flex-shrink:0;box-shadow:0 0 12px rgba(255,69,58,.25)}
.crid-logo-badge{width:3em;height:3em;border-radius:50%;background:radial-gradient(circle at 35% 35%,#2a0808 0%,#0d0d10 80%);border:2px solid var(--accent);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:.78em;font-weight:900;color:#fff;letter-spacing:.05em;box-shadow:0 0 14px var(--accent-glow)}
.crid-body{display:flex;flex-direction:column;gap:.25em;flex:1;overflow:hidden;min-width:0}
.crid-head{display:flex;align-items:center;gap:.5em;font-size:.65em;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
.crid-brand{color:var(--accent);font-weight:900}
.crid-kind{background:rgba(255,255,255,.08);color:#f3f2f0;padding:.1em .6em;border-radius:99px;font-size:.9em}
.crid-title{margin:0;font-size:1.05em;font-weight:800;line-height:1.2;letter-spacing:-.015em;color:#f3f2f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.crid-foot{display:flex;align-items:center;justify-content:space-between;gap:.6em;font-size:.75em}
.crid-verdict{display:inline-flex;align-items:center;padding:.15em .6em;border-radius:99px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;font-size:.85em}
.crid-v-1{background:var(--accent);color:#111214}
.crid-v-0{background:transparent;color:var(--accent);border:1px solid var(--accent)}
.crid-v-none{color:#8E8E93;font-size:.9em;font-weight:600;text-transform:uppercase}

@keyframes bug-breathe{0%,100%{filter:brightness(1)}50%{filter:brightness(1.05)}}

/* X jumbotron — a live bar of X content at the top or bottom of the desk,
   like the CRID segment: always visible, always readable, never in the card slot. */
.x-pos-top #x-jumbotron{top:calc(var(--m) + env(safe-area-inset-top,0px));bottom:auto}
.x-pos-bottom #x-jumbotron{bottom:calc(var(--m) + env(safe-area-inset-bottom,0px));top:auto}
#x-jumbotron{position:absolute;left:50%;transform:translate(-50%,-14px);
  width:min(calc(100vw - 2*var(--m)),46em);max-width:96vw;box-sizing:border-box;pointer-events:none;z-index:10;
  background:#111214f0;backdrop-filter:blur(16px) saturate(180%);
  -webkit-backdrop-filter:blur(16px) saturate(180%);
  border:.10em solid var(--surface-line);border-radius:1.4em;padding:.7em 1em;
  box-shadow:0 24px 48px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.1);
  opacity:0;transform:translate(-50%,-14px) scale(.97);
  transition:opacity .5s cubic-bezier(.16,1,.3,1),transform .5s cubic-bezier(.16,1,.3,1),filter .5s ease}
.x-pos-bottom #x-jumbotron{transform:translate(-50%,14px) scale(.97)}
#x-jumbotron.in{opacity:1;transform:translate(-50%,0) scale(1)}
#x-jumbotron.out{opacity:0;transform:translate(-50%,-14px) scale(.97)}
.x-pos-bottom #x-jumbotron.out{transform:translate(-50%,14px) scale(.97)}
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
.x-item .x-avatar{width:1.5em;height:1.5em;border-radius:50%;object-fit:cover;flex-shrink:0;
  border:.08em solid var(--surface-line);box-shadow:0 0 6px rgba(0,0,0,.4)}
.x-item .x-meta{display:flex;align-items:center;gap:.4em;font-size:.7em;color:#8E8E93;font-weight:600;
  letter-spacing:.02em;margin-top:.15em}
.x-item .x-time{color:#a4a3a2}
.x-item .x-metric{color:#c7c7cc}

/* audio strip — debug-only, operator controls audio from the controller */
.audio-wrap{position:fixed;bottom:14px;right:14px;z-index:60;pointer-events:auto;
  background:rgba(15,15,18,.85);backdrop-filter:blur(12px) saturate(160%);
  border:.09em solid rgba(255,255,255,.2);border-radius:999px;padding:.35em .7em;
  display:flex;align-items:center;gap:.6em;box-shadow:0 10px 30px rgba(0,0,0,.45);
  opacity:0;transition:opacity .3s ease}
#desk.debug .audio-wrap{opacity:1}
.audio-btn{width:26px;height:26px;border:0;border-radius:50%;background:rgba(255,255,255,.15);
  color:#f3f2f0;font-size:1rem;cursor:pointer;display:grid;place-items:center}
.audio-btn.on{background:var(--accent);color:#111214}
.audio-vol{width:70px;height:4px;background:rgba(255,255,255,.18);border-radius:2px;
  outline:none;pointer-events:auto}
.audio-vol::-webkit-slider-thumb{appearance:none;width:12px;height:12px;background:#f3f2f0;
  border-radius:50%;pointer-events:auto}
.audio-label{font-size:.62em;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:#8E8E93;font-family:var(--brand)}

/* voice control — debug-only, operator arms listening from Swae */
.voice-wrap{position:fixed;bottom:14px;left:14px;z-index:60;pointer-events:auto;
  background:rgba(15,15,18,.85);backdrop-filter:blur(12px) saturate(160%);
  border:.09em solid rgba(255,255,255,.2);border-radius:999px;padding:.35em .7em;
  display:flex;align-items:center;gap:.6em;box-shadow:0 10px 30px rgba(0,0,0,.45);
  opacity:0;transition:opacity .3s ease}
#desk.debug .voice-wrap{opacity:1}
.voice-btn{width:28px;height:28px;border:0;border-radius:50%;background:rgba(255,255,255,.15);
  color:#f3f2f0;font-size:1.1rem;cursor:pointer;display:grid;place-items:center}
.voice-btn.armed{background:var(--accent);color:#111214}
.voice-btn.listening{background:#ff453a;color:#111214;animation:voice-pulse 1.5s ease-in-out infinite}
.voice-label{font-size:.62em;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:#8E8E93;font-family:var(--brand)}
.voice-heard{font-size:.62em;font-weight:600;color:#7CC4FF;font-family:var(--brand);
  min-width:120px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@keyframes voice-pulse{0%,100%{box-shadow:0 0 0 rgba(255,69,58,.4)}50%{box-shadow:0 0 12px rgba(255,69,58,.6)}}

/* CRID Court — structured debate */
.court-wrap{border:.09em solid var(--surface-line);border-radius:1.2em;padding:1em;background:var(--glass);backdrop-filter:blur(12px) saturate(160%);margin:.5em 0}
.court-question{font-size:1.1em;font-weight:800;color:#f3f2f0;margin:0 0 .6em}
.court-viewpoints{display:flex;gap:.6em}
.court-viewpoint{flex:1;border:.09em solid var(--surface-line);border-radius:.8em;padding:.6em .8em;background:rgba(255,255,255,.03)}
.court-viewpoint .v-label{font-size:.62em;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#8E8E93;margin:0 0 .3em}
.court-viewpoint .v-text{font-size:.9em;color:#f3f2f0}
.court-votes{display:flex;gap:.6em;margin-top:.6em}
.court-vote{border:.09em solid var(--surface-line);border-radius:.8em;padding:.4em .8em;background:rgba(255,255,255,.03);font-size:.85em;font-weight:700;color:#c7c7cc}
.court-verdict{margin-top:.6em;font-size:1em;font-weight:900;text-transform:uppercase;letter-spacing:.1em}
.court-verdict.w{color:#2ED3A5}.court-verdict.l{color:#FF7A66}.court-verdict.open{color:#FFB224}

/* Music Desk */
.music-wrap{border:.09em solid var(--surface-line);border-radius:1.2em;padding:1em;background:var(--glass);backdrop-filter:blur(12px) saturate(160%);margin:.5em 0}
.music-current{font-size:1em;font-weight:800;color:#f3f2f0;margin:0 0 .3em}
.music-artist{font-size:.8em;color:#c7c7cc;margin:0 0 .6em}
.music-queue{font-size:.75em;color:#8E8E93;margin:0 0 .4em}
.music-track{display:flex;gap:.4em;align-items:center;padding:.2em .4em;border-radius:.6em;background:rgba(255,255,255,.03);margin-bottom:.2em}
.music-track.current{border-color:var(--accent);background:rgba(255,69,58,.15)}
.music-title{flex:1;font-size:.85em;color:#f3f2f0}
.music-artist-small{font-size:.75em;color:#c7c7cc}

/* X Space Radar */
.space-wrap{border:.09em solid var(--surface-line);border-radius:1.2em;padding:1em;background:var(--glass);backdrop-filter:blur(12px) saturate(160%);margin:.5em 0}
.space-title{font-size:1em;font-weight:800;color:#f3f2f0;margin:0 0 .2em}
.space-host{font-size:.8em;color:#c7c7cc;margin:0 0 .3em}
.space-topic{font-size:.85em;color:#8E8E93;margin:0 0 .4em}
.space-url{font-size:.72em;color:#7CC4FF;word-break:break-all}

/* STRANGERS Ledger */
.ledger-wrap{border:.09em solid var(--surface-line);border-radius:1.2em;padding:1em;background:var(--glass);backdrop-filter:blur(12px) saturate(160%);margin:.5em 0}
.ledger-title{font-size:1em;font-weight:800;color:#f3f2f0;margin:0 0 .4em}
.ledger-entry{font-size:.8em;color:#c7c7cc;padding:.3em 0;border-bottom:.06em solid var(--surface-line)}
.ledger-entry:last-child{border-bottom:none}
.ledger-type{font-size:.65em;font-weight:800;text-transform:uppercase;color:#FFB224;margin-right:.4em}

/* RIAD — Rent Is Always Due */
.riad-wrap{border:.12em solid #ff453a;border-radius:1.4em;padding:1.2em;background:var(--glass);backdrop-filter:blur(16px) saturate(200%);margin:.5em 0;box-shadow:0 0 30px rgba(255,69,58,.3)}
.riad-title{font-size:1.2em;font-weight:900;color:#ff453a;text-transform:uppercase;letter-spacing:.1em;margin:0 0 .3em}
.riad-text{font-size:.95em;color:#f3f2f0;margin:0}

/* W/L */
.wl-badge{display:inline-flex;align-items:center;gap:.3em;padding:.15em .6em;border-radius:.8em;font-weight:900;font-size:.85em;text-transform:uppercase;letter-spacing:.08em}
.wl-badge.w{background:#14594A;color:#2ED3A5;border:.09em solid #2ED3A5}
.wl-badge.l{background:#6B2E26;color:#FF7A66;border:.09em solid #FF7A66}

@media (prefers-reduced-motion:reduce){
  .card{transform:none;transition:none}
  #crid-jumbotron{transform:none;transition:none;animation:none}
  .fill{transition:none}
  .dot{animation:none}
  .crid-brand{animation:none}
  .scale-wrap input::-webkit-slider-thumb{animation:none}}
`;

  // ---------- upgraded DOM helper (handles attributes, classes, and kids) ----------
  const h = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    const applyProps = (obj) => {
      for (const [k, v] of Object.entries(obj || {})) {
        if (v == null || v === false) continue;
        if (k === "class" || k === "className") {
          e.className = (e.className ? e.className + " " : "") + v;
        } else if (k.startsWith("on") || k in e) {
          e[k] = v;
        } else {
          e.setAttribute(k, v);
        }
      }
    };

    let flatKids = kids.flat();
    if (typeof props === "string") {
      if (props) e.className = props;
      if (flatKids.length > 0 && flatKids[0] && typeof flatKids[0] === "object" && !(flatKids[0] instanceof Node)) {
        applyProps(flatKids.shift());
      }
    } else if (props && typeof props === "object") {
      applyProps(props);
    }
    for (const k of flatKids) {
      if (k == null || k === false) continue;
      e.append(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return e;
  };

  // ---------- card renderers ----------
  const renderers = new Map();
  const register = (type, fn) => renderers.set(type, fn);

  const CONF_LABEL = {
    confirmed: "Confirmed",
    reported: "Reported",
    disputed: "Disputed",
    unverified: "Unverified claim",
    test: "Test card",
  };

  const when = (iso) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime())
      ? d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";
  };

  const sourceLine = (c) => {
    const parts = [c.publisher, when(c.publishedAt)].filter(Boolean);
    return parts.length ? h("p", "source", "Source: " + parts.join(", ")) : null;
  };

  // Bars start empty and are filled on the next frame, so they animate in; later votes animate in place.
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
        r.fill.style.width = share + "%";
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
  const fallback = baseCard; // unknown types still render as a plain card

  // CRID Court renderer
  register("court", (c) => {
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
  });

  // Music Desk renderer
  register("music", (c) => {
    const music = c || state?.music || { queue: [], current: null, playing: false, volume: 1, muted: false };
    const cur = music.current;
    return h("div", "music-wrap",
      cur ? h("div", "music-current", cur.title) : null,
      cur && cur.artist ? h("div", "music-artist", cur.artist) : null,
      h("div", "music-queue", `Queue: ${music.queue.length} · ${music.playing ? "playing" : "paused"}${music.muted ? " · muted" : ""}`),
      music.queue.map((t) => h("div", "music-track" + (t.id === cur?.id ? " current" : ""),
        h("span", "music-title", t.title),
        t.artist && h("span", "music-artist-small", t.artist))),
      h("div", "row",
        btn("⏯", () => act("music-play"), "b small"),
        btn("⏹", () => act("music-stop"), "b small"),
        btn("⏭", () => act("music-next"), "b small")));
  });

  // X Space Radar renderer
  register("space", (c) => {
    const spaces = c.spaces || state?.spaces || [];
    return h("div", "space-wrap",
      ...spaces.map((s) => h("div", {},
        h("div", "space-title", s.title),
        s.host && h("div", "space-host", `Host: ${s.host}`),
        s.topic && h("div", "space-topic", s.topic),
        s.url && h("a", "space-url", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, "Open on X")
      ))
    );
  });

  // STRANGERS Ledger renderer
  register("ledger", (c) => {
    const ledger = c.ledger || state?.ledger || [];
    return h("div", "ledger-wrap",
      h("div", "ledger-title", "STRANGERS Ledger"),
      ...ledger.slice(-8).map((e) => h("div", "ledger-entry",
        h("span", "ledger-type", e.type),
        e.title,
        e.description && h("span", {}, ` — ${e.description}`)
      ))
    );
  });

  // RIAD renderer
  register("riad", (c) => {
    const riad = c || state?.riad;
    if (!riad || !riad.active) return null;
    return h("div", "riad-wrap",
      h("div", "riad-title", "RIAD — RENT IS ALWAYS DUE"),
      h("div", "riad-text", `Raid announced${riad.channel ? ` from ${riad.channel}` : ""}.`)
    );
  });

  // ---------- mount ----------
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const slot = h("div", "slot");
  const root = h("div", `pos-${CFG.pos} anim-${CFG.anim} crid-pos-${CFG.cridPos} x-pos-${xJPos}${CFG.debug ? " debug" : ""}`, slot);
  root.id = "desk";
  root.style.setProperty("--scale", CFG.scale);
  document.body.append(root);

  // live scale slider — debug-only control so the operator can size cards on air
  const scaleWrap = h("div", "scale-wrap");
  const scaleLabel = h("span", "", "SCALE");
  const scaleInput = h("input", "", { type: "range", min: "0.6", max: "1.4", step: "0.05", value: String(CFG.scale) });
  const scaleVal = h("span", "val", CFG.scale.toFixed(2));
  scaleWrap.append(scaleLabel, scaleInput, scaleVal);
  scaleInput.addEventListener("input", () => {
    const v = scaleInput.value;
    root.style.setProperty("--scale", v);
    scaleVal.textContent = v;
  });
  if (CFG.debug) document.body.append(scaleWrap);

  const dot = CFG.debug ? h("div", "dot") : null;
  if (dot) document.body.append(dot);

  let shownKey = null;
  let xFrame = null;

  // ---------- audio (Swae / stream audio) ----------
  let audioEl = null;
  let audioUrl = null;
  let audioPlaying = false;
  let audioVol = 0.7;

  const audioWrap = CFG.debug ? h("div", "audio-wrap") : null;
  const audioPlayBtn = CFG.debug ? h("button", "audio-btn", "▶") : null;
  const audioMuteBtn = CFG.debug ? h("button", "audio-btn", "🔊") : null;
  const audioVolIn = CFG.debug ? h("input", "", { type: "range", min: "0", max: "1", step: "0.05", value: String(audioVol) }) : null;
  const audioLabel = CFG.debug ? h("span", "audio-label", "AUDIO") : null;
  if (audioWrap) {
    audioWrap.append(audioLabel, audioPlayBtn, audioMuteBtn, audioVolIn);
    document.body.append(audioWrap);
    audioPlayBtn.addEventListener("click", () => { audioPlaying = !audioPlaying; applyAudio(); });
    audioMuteBtn.addEventListener("click", () => { audioVolIn.value = audioVol > 0 ? "0" : String(audioVol || 0.7); audioVol = Number(audioVolIn.value); applyAudio(); });
    audioVolIn.addEventListener("input", () => { audioVol = Number(audioVolIn.value); applyAudio(); });
  }

  const applyAudio = () => {
    if (!audioEl) return;
    audioPlayBtn?.classList.toggle("on", audioPlaying);
    audioMuteBtn.textContent = audioVol <= 0 ? "🔇" : "🔊";
    audioVolIn.disabled = audioVol <= 0;
    audioEl.volume = audioVol;
    if (audioUrl && audioPlaying) {
      audioEl.play().catch(() => { /* autoplay blocked; wait for user gesture */ });
    } else {
      audioEl.pause();
    }
  };

  const setAudio = (url, playing) => {
    const changed = url !== audioUrl;
    audioUrl = url;
    audioPlaying = playing === true;
    if (changed) {
      if (audioEl) { audioEl.pause(); audioEl.remove(); audioEl = null; }
      if (url) {
        audioEl = new Audio(url);
        audioEl.volume = audioVol;
        audioEl.addEventListener("ended", () => { audioPlaying = false; applyAudio(); });
      }
    }
    applyAudio();
  };

  const stopAudio = () => setAudio(null, false);

  // ---------- module elements (court, music, spaces, ledger, riad) ----------
  let moduleEl = null;
  let moduleKey = null;

  const renderModule = (s) => {
    if (!s) {
      if (moduleEl) {
        moduleEl.remove();
        moduleEl = null;
        moduleKey = null;
      }
      return;
    }

    const parts = [];
    if (s.court) {
      const el = (renderers.get("court") || fallback)({ type: "court", ...s.court });
      parts.push(el);
    }
    if (s.music && (s.music.queue.length || s.music.current)) {
      const el = (renderers.get("music") || fallback)({ type: "music", ...s.music });
      parts.push(el);
    }
    if (s.spaces && s.spaces.length) {
      const el = (renderers.get("space") || fallback)({ type: "space", spaces: s.spaces });
      parts.push(el);
    }
    if (s.ledger && s.ledger.length) {
      const el = (renderers.get("ledger") || fallback)({ type: "ledger", ledger: s.ledger });
      parts.push(el);
    }
    if (s.riad && s.riad.active) {
      const el = (renderers.get("riad") || fallback)({ type: "riad", ...s.riad });
      parts.push(el);
    }

    const key = parts.map((p) => JSON.stringify(p)).join("|");
    if (key === moduleKey && moduleEl) return;

    if (moduleEl) {
      moduleEl.remove();
      moduleEl = null;
    }

    if (parts.length) {
      moduleEl = h("div", "module-wrap", ...parts);
      moduleEl.id = "modules";
      moduleEl.style.position = "absolute";
      moduleEl.style.top = "calc(var(--m) + env(safe-area-inset-top, 0px))";
      moduleEl.style.right = "var(--m)";
      moduleEl.style.bottom = "auto";
      moduleEl.style.left = "auto";
      moduleEl.style.pointerEvents = "none";
      moduleEl.style.display = "flex";
      moduleEl.style.flexDirection = "column";
      moduleEl.style.alignItems = "flex-end";
      moduleEl.style.gap = "8px";
      moduleEl.style.maxWidth = "min(calc(100vw - 2*var(--m)), 26em)";
      moduleEl.style.zIndex = "15";
      root.append(moduleEl);
    }
    moduleKey = key;
  };

  // ---------- voice control (Swae / iPhone microphone) ----------
  // Web Speech API requires a user gesture to start. The overlay exposes an ARM button
  // (debug-only). When armed, recognized phrases are sent to /api/desk/voice which maps
  // them to a safe subset of desk actions. The overlay never holds the operator token.
  let voiceRecognition = null;
  let voiceArmed = false;
  let voiceListening = false;
  let voiceTimeout = null;

  const voiceWrap = CFG.debug ? h("div", "voice-wrap") : null;
  const voiceBtn = CFG.debug ? h("button", "voice-btn", "🎤") : null;
  const voiceLabel = CFG.debug ? h("span", "voice-label", "VOICE") : null;
  const voiceHeard = CFG.debug ? h("span", "voice-heard") : null;
  if (voiceWrap) {
    voiceWrap.append(voiceLabel, voiceBtn, voiceHeard);
    document.body.append(voiceWrap);
    voiceBtn.addEventListener("click", () => {
      if (voiceListening) { voiceStop(); return; }
      if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
        toast("Speech recognition not supported in this browser.", true);
        return;
      }
      const Ctor = window.webkitSpeechRecognition || window.SpeechRecognition;
      voiceRecognition = new Ctor();
      voiceRecognition.continuous = true;
      voiceRecognition.interimResults = false;
      voiceRecognition.lang = "en-US";
      voiceRecognition.onstart = () => { voiceArmed = true; voiceListening = true; applyVoice(); };
      voiceRecognition.onend = () => { voiceListening = false; applyVoice(); };
      voiceRecognition.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const transcript = e.results[i][0].transcript;
          voiceHeard.textContent = transcript;
          voiceCmd(transcript);
        }
      };
      voiceRecognition.onerror = () => { voiceListening = false; applyVoice(); };
      voiceRecognition.start();
    });
  }

  const applyVoice = () => {
    voiceBtn?.classList.toggle("armed", voiceArmed && !voiceListening);
    voiceBtn?.classList.toggle("listening", voiceListening);
  };

  const voiceStop = () => {
    voiceArmed = false;
    voiceListening = false;
    try { voiceRecognition?.stop(); } catch { /* ignore */ }
    voiceRecognition = null;
    applyVoice();
    clearTimeout(voiceTimeout);
    voiceTimeout = setTimeout(() => { voiceHeard.textContent = ""; }, 3000);
  };

  const voiceCmd = (text) => {
    const lower = text.trim().toLowerCase();
    const phrases = [
      { re: /clip.?that/i, action: "clip-create" },
      { re: /next.?(topic|card)?/i, action: "next" },
      { re: /previous|prev/i, action: "previous" },
      { re: /hold/i, action: "hold" },
      { re: /hide/i, action: "hide" },
      { re: /show.?poll|open.?poll/i, action: "start-poll" },
      { re: /lock.?vote|end.?poll|close.?poll/i, action: "end-poll" },
      { re: /switch.?crid|open.?jumbotron/i, action: "crid-open" },
      { re: /space.?radar|x.?space/i, action: "space-radar" },
    ];
    const match = phrases.find((p) => p.re.test(lower));
    if (!match) return;
    voiceStop();
    fetch("/api/desk/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.text().catch(() => "");
          toast(`Voice refused: ${err}`, true);
          return;
        }
        const j = await r.json();
        toast(`Voice: ${j.command || text}`, true);
      })
      .catch(() => toast("Voice request failed.", true));
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
      slot.lastElementChild?.updatePoll?.(opts.poll); // same card: only the vote bars change
      return;
    }
    const old = slot.firstElementChild;
    if (old) {
      old.classList.add("out");
      setTimeout(() => old.remove(), 320);
    }
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

  // The existing X overlay runs in a frame only while its mode is on air,
  // so it makes no X requests the rest of the time.
  const setX = (on) => {
    if (on && !xFrame) {
      xFrame = h("iframe", "xframe");
      xFrame.title = "X Following timeline";
      xFrame.src = xBase + "/" + (xQuery ? "?" + xQuery : "");
      document.body.append(xFrame);
    } else if (!on && xFrame) {
      xFrame.remove();
      xFrame = null;
    }
  };

  // ---------- state ----------
  let version = -1;
  let lastUpdated = 0;
  let clockOffset = 0; // server clock minus device clock
  let state = null;
  let expiryTimer = null;
  let pollTimer = null;
  let failures = 0;

  // One cancellable poll timer, so an expiry can jump the queue instead of waiting for it.
  const schedulePoll = (ms) => {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(tick, ms);
  };

  // How long an expired card may stay up while auto-play's next card is in flight. Bounded
  // on purpose: if the advance never arrives, the overlay must not freeze a stale story.
  const GRACE_MS = 8000;

  const serverNow = () => Date.now() + clockOffset;

  // ---------- CRID Jumbotron ----------
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
      root.classList.remove("has-crid");
      return;
    }

    root.classList.add("has-crid");

    // Authentic Logo / Asset handling
    const logoUrl = P.get("logo") || P.get("logourl") || crid.logo || state?.logo || "";

    const key = [
      crid.id,
      crid.entry,
      crid.kind,
      crid.title,
      crid.credit,
      crid.verdict,
      crid.result?.winner,
      crid.result?.percent,
      crid.result?.total,
      crid.result?.tie,
      logoUrl,
    ].join("|");

    if (key === cridKey && cridEl) return;

    // 1. Authentic Logo / Circular Monogram Badge
    let logoEl = null;
    if (logoUrl) {
      logoEl = h("img", "crid-logo", { src: logoUrl, alt: "CRID Logo" });
      logoEl.onerror = () => {
        const badge = h("div", "crid-logo-badge", "CRID");
        if (logoEl && logoEl.parentNode) logoEl.replaceWith(badge);
      };
    } else {
      logoEl = h("div", "crid-logo-badge", "CRID");
    }

    // 2. Text Assembly
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
      vEl = h("div", "crid-v-none",
        crid.result.tie ? "TIE (50/50)" : `${crid.result.winner} (${crid.result.percent}%)`);
    } else {
      vEl = h("span", "crid-v-none", "LIVE SEGMENT");
    }

    const foot = h("div", "crid-foot", vEl, crid.credit ? h("span", "crid-v-none", `BY @${crid.credit.toUpperCase()}`) : null);

    // 3. Compact Horizontal Assembly
    const textBody = h("div", "crid-body", head, title, foot);

    if (cridEl) {
      cridEl.replaceChildren(logoEl, textBody);
    } else {
      cridEl = h("div", "", logoEl, textBody);
      cridEl.id = "crid-jumbotron";
      root.append(cridEl);
      requestAnimationFrame(() => requestAnimationFrame(() => cridEl?.classList.add("in")));
    }
    cridKey = key;
  };

  // ---------- X jumbotron ----------
  let xEl = null;
  let xKey = null;
  let xTimer = null;
  let xStarted = false;

  const renderXjumbotron = (feed) => {
    if (!xMode || !feed) {
      if (xEl) {
        xEl.classList.remove("in");
        xEl.classList.add("out");
        const old = xEl;
        setTimeout(() => old.remove(), 320);
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
          t.avatar && h("img", "x-avatar", { src: t.avatar, alt: "", loading: "lazy" }),
          h("span", "x-text",
            h("span", "x-author", t.author),
            t.handle && h("span", "x-handle", ` @${t.handle}`),
            " — ",
            t.text
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
      xEl = h("div", "", head, list, foot);
      xEl.id = "x-jumbotron";
      root.append(xEl);
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
      if (r.ok) {
        renderXjumbotron(await r.json());
      }
    } catch {
      // keep whatever is on screen; retry on the next cycle
    }
  };

  const render = () => {
    clearTimeout(expiryTimer);
    if (!state) return;
    if (state.mode === "x-following") {
      dropCard();
      setX(state.visible);
      renderCrid(null);
      stopAudio();
      renderModule(null);
      return;
    }
    setX(false);
    renderCrid(state.crid);
    // Audio: CRID segment audio plays on the jumbotron; card audio plays on the card.
    const crid = state.crid;
    if (crid && crid.audioUrl) {
      setAudio(crid.audioUrl, crid.audioPlaying === true);
    } else if (state.visible && state.mode === "cards" && state.activeCardId) {
      // Card-level audio is handled by the card renderer via opts.audioUrl when present.
    } else {
      stopAudio();
    }
    // Module rendering (court, music, spaces, ledger, riad) — separate from the card slot.
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
    // Ignore anything older than what is already shown (late response after a reconnect).
    if (s.updatedAt < lastUpdated) return;
    version = s.version;
    lastUpdated = s.updatedAt;
    clockOffset = s.serverNow - Date.now();
    state = s;
    render();
  };

  const tick = async () => {
    let delay = CFG.pollMs;
    try {
      const r = await fetch(`/api/desk/state?since=${version}`, { cache: "no-store" });
      if (r.ok && r.status !== 204) apply(await r.json());
      else if (!r.ok && r.status !== 204) throw new Error("HTTP " + r.status);
      failures = 0;
      dot?.classList.remove("off");
    } catch {
      // Keep whatever is on screen (it still expires on its own timer); back off the checks.
      failures++;
      dot?.classList.add("off");
      delay = Math.min(15000, CFG.pollMs * 2 ** Math.min(failures, 4));
    }
    schedulePoll(delay);
  };

  window.DeskOverlay = { register };
  tick();
})();
