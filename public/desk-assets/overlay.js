import{createCridAudioSync}from"./crid-audio.js";import{createSoundOrbSync}from"./sound-orb.js";import{createCridBot}from"./crid-bot.js";import{createLogo,LOGO_POSITIONS}from"./logo.js";import{CYBER_CSS}from"./cyber-theme.js";import{youtubeEmbedUrl}from"./youtube-embed.js";(()=>{"use strict";var _a,_b;const params=new URLSearchParams(location.search),num=(key,fallback2,lo,hi)=>{const value=Number.parseFloat(params.get(key));return Number.isFinite(value)?Math.min(hi,Math.max(lo,value)):fallback2},pick=(key,allowed,fallback2)=>allowed.includes(params.get(key))?params.get(key):fallback2,flag=(key,fallback2)=>{const raw=params.get(key);return raw===null?fallback2:raw==="0"||raw==="false"?!1:raw==="1"||raw==="true"?!0:fallback2},swaeHandler=(_b=(_a=window.webkit)==null?void 0:_a.messageHandlers)==null?void 0:_b.swae,SWAE=flag("swae",typeof swaeHandler!="undefined");SWAE&&document.documentElement.classList.add("swae");const CONFIG={pollMs:num("poll",3,1,30)*1e3,scale:num("scale",1,.6,1.4),anim:pick("anim",["slide","fade","none"],"slide"),layout:pick("layout",["alive","classic"],"alive"),debug:flag("debug",!1)&&!SWAE,crid:flag("crid",!0),theme:pick("theme",["creative","torn-paper","cyber"],"cyber"),musicMode:pick("music",["auto","player","poster"],"auto"),xMode:params.get("x.mode")||"",xUserId:params.get("x.userId")||"",xPollMs:num("x.jpoll",60,10,3600)*1e3,botArg:params.get("bot"),chat:(SWAE||params.get("chat")==="1")&&params.get("chat")!=="0",chatPrefix:params.get("chatPrefix")||"",clock:flag("clock",!0),logoUrl:params.get("logo")||"./crid-logo.png",logo:flag("logo",!0),logoPos:pick("logo.pos",LOGO_POSITIONS,"tc"),logoWidth:num("logo.w",24,10,60)},TIMING={requestTimeoutMs:12e3,maxBackoffMs:15e3,graceMs:8e3,headlinePollMs:3e5,headlineRotateMs:12e3,cardLeaveMs:320,playerFallbackMs:6e3},CHAT_LINES=3,MODULE_ORDER=["music","court","spaces","ledger","riad"];document.documentElement.dataset.theme=CONFIG.theme,document.documentElement.dataset.crop=flag("crop",!0)?"true":"false",params.get("power")==="low"&&document.documentElement.classList.add("low-power");const scene=pick("scene",["pip"],"");scene&&(document.documentElement.dataset.scene=scene,document.documentElement.style.setProperty("--pip-w",`${num("pip.w",34,10,60)}vw`),document.documentElement.style.setProperty("--pip-h",`${num("pip.h",34,10,60)}vh`));const CSS=`
html,body{margin:0;background:transparent!important;overflow:hidden;
  height:100%;overscroll-behavior:none;-webkit-text-size-adjust:100%}
#desk{position:fixed;inset:0;pointer-events:none;color:#f3f2f0;
  --accent:#ff453a;--accent-glow:rgba(255,69,58,.35);--ink:#f3f2f0;
  --glass:#111214f0;--surface-soft:#ededef11;--surface-line:#ededef21;
  --radius:1rem;
  --brand:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif;
  font-family:var(--brand);
  font-synthesis:none;text-rendering:optimizelegibility;-webkit-font-smoothing:antialiased;
  /* One root size drives the whole desk. vmin keeps the optical size constant across 1080p,
     1440p and a phone preview; the clamp stops it collapsing or ballooning. */
  --m:clamp(14px,2.2vmin,40px);
  --identity-w:min(36vw,32rem);
  --scale:1;
  font-size:calc(var(--scale)*clamp(15px,1.6vmin,24px));line-height:1.4;
  /* dvh where supported, svh as the stable fallback: a mobile browser's collapsing toolbar
     must not resize the desk mid-stream. */
  --vh:100svh;
  contain:layout style}

.slot{position:absolute;display:grid;width:min(calc(100vw - 2*var(--m)),56em)}
.slot>*{grid-area:1/1;justify-self:center}
.pos-top-left .slot{left:var(--m);top:calc(var(--m) + 4.5em + env(safe-area-inset-top,0px))}

/* ---- card ---- */
.card{box-sizing:border-box;align-self:start;position:relative;
  background:var(--glass);
  border:1px solid var(--surface-line);border-radius:1.6em;
  padding:1.3em 1.6em 1.2em;
  width:100%;max-height:min(46dvh,30em);overflow:auto;scrollbar-width:none;
  opacity:0;transform:translateY(11px) scale(.985);
  transition:opacity .24s cubic-bezier(.2,.8,.2,1),transform .24s cubic-bezier(.2,.8,.2,1),filter .24s ease}
.card::-webkit-scrollbar{display:none}
.anim-slide .card{transform:translateY(11px) scale(.985)}
.card.in{opacity:1;transform:none}
.card.out{opacity:0;transform:translateY(-10px) scale(.97)}
.anim-none .card{transition:none}

/* ---- debug scale ---- */
.scale-wrap{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);
  z-index:50;pointer-events:auto;background:rgba(15,15,18,.82);
  border:.09em solid rgba(255,255,255,.2);border-radius:999px;padding:.35em .85em;
  display:flex;align-items:center;gap:.7em;
  opacity:0;transition:opacity .3s ease}
#desk.debug .scale-wrap{opacity:1}
.scale-wrap label{font-size:.62em;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:#8E8E93;font-family:var(--brand)}
.scale-wrap input{appearance:none;width:90px;height:6px;background:rgba(255,255,255,.18);
  border-radius:3px;outline:none;pointer-events:auto}
.scale-wrap input::-webkit-slider-thumb{appearance:none;width:14px;height:14px;
  background:var(--accent);border-radius:50%;pointer-events:auto}
.scale-wrap .val{font-size:.68em;font-weight:700;color:#FFFFFF;
  font-variant-numeric:tabular-nums}

/* ---- card internals (geometry only; colour and type come from the theme) ---- */
.chip{border:.09em solid var(--accent);color:var(--accent);padding:.05em .7em;border-radius:.9em;
  font-weight:700;font-family:var(--brand);text-transform:uppercase;letter-spacing:.04em;font-size:.82em}
.conf-confirmed .chip{background:var(--accent);color:#111214}
.conf-reported .chip{border-color:#FFB224;color:#FFB224}
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

/* ---- poll ---- */
.poll{margin:.8em 0 .2em;display:grid;gap:.5em}
.opt{position:relative;overflow:hidden;border-radius:1em;background:rgba(255,255,255,.06);
  border:.09em solid rgba(255,255,255,.16);padding:.5em .7em;font-weight:600;font-size:.92em;
  font-family:var(--brand)}
.opt .fill{position:absolute;inset:0 auto 0 0;width:100%;transform:scaleX(0);transform-origin:left center;
  background:var(--accent);opacity:.9;
  transition:transform .7s cubic-bezier(.22,1,.36,1),opacity .3s}
.opt .row{position:relative;display:flex;justify-content:space-between;gap:.6em}
.opt .label{position:relative;z-index:1}
.opt .pct{position:relative;z-index:1;font-variant-numeric:tabular-nums}
.opt.lead{border-color:var(--accent);background:rgba(255,69,58,.2)}
.opt.lead .fill{opacity:1}
.anim-none .fill,.anim-none .opt{transition:none}
.poll-state{margin:0;font-size:.7em;font-weight:600;color:#8E8E93;text-transform:uppercase;letter-spacing:.06em}

/* ---- debug dot ---- */
.dot{position:fixed;right:10px;top:10px;width:10px;height:10px;border-radius:50%;background:#70d89a;
  animation:pulse-dot 2s ease-in-out infinite}
.dot.off{background:#ff453a}
.dot.loading{background:#ff453a}
@keyframes pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(1.15)}}

/* ---- CRID broadcast bug (top-left docked) ---- */
#crid-jumbotron{
  position:absolute;
  top:calc(var(--m) + env(safe-area-inset-top,0px));
  left:var(--m);
  width:auto;
  max-width:min(calc(100vw - 2*var(--m)),32em);
  box-sizing:border-box;pointer-events:none;z-index:10;
  background:var(--glass);
  border:1px solid var(--surface-line);
  border-radius:99px;
  padding:.6em 1em .6em .6em;
  display:flex;align-items:center;gap:1em;
  opacity:0;transform:translateX(-20px) scale(.96);
  transition:opacity .5s cubic-bezier(.16,1,.3,1),
              transform .5s cubic-bezier(.16,1,.3,1);
}
#crid-jumbotron.in{opacity:1;transform:translateX(0) scale(1)}
#crid-jumbotron.out{opacity:0;transform:translateX(-20px) scale(.96)}
.crid-logo{width:3.2em;height:3.2em;border-radius:50%;object-fit:contain;background:#000;
  border:2px solid var(--surface-line);flex-shrink:0}
.crid-body{display:flex;flex-direction:column;gap:.3em;flex:1;overflow:hidden}
.crid-head{display:flex;align-items:center;gap:.5em;font-size:.65em;font-weight:800;
  text-transform:uppercase;letter-spacing:.08em}
.crid-brand{color:var(--accent)}
.crid-kind{background:rgba(255,255,255,.08);color:#f3f2f0;padding:.1em .6em;border-radius:99px}
.crid-title{margin:0;font-size:1.1em;font-weight:800;line-height:1.2;letter-spacing:-.015em;
  color:#f3f2f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.crid-foot{display:flex;align-items:center;justify-content:space-between;gap:.6em}
.crid-verdict{display:inline-flex;align-items:center;padding:.15em .6em;border-radius:99px;
  font-weight:800;text-transform:uppercase;letter-spacing:.05em;font-size:.7em}
.crid-v-1{background:var(--accent);color:#111214}
.crid-v-0{background:transparent;color:var(--accent);border:1px solid var(--accent)}
.crid-v-none{color:#8E8E93;font-size:.75em;font-weight:600;text-transform:uppercase}

/* ---- sound orb (only when ?bot=0) ---- */
#sound-orb{position:fixed;right:calc(var(--m) + var(--identity-w) + .45em);
  bottom:calc(var(--m) + .45em + env(safe-area-inset-bottom,0px));z-index:26;
  width:clamp(32px,3vw,46px);aspect-ratio:1;border-radius:50%;pointer-events:none;
  display:grid;place-items:center;opacity:.82;transform:scale(.96);
  transition:width .42s cubic-bezier(.2,.85,.25,1),bottom .35s ease,opacity .35s ease,transform .42s cubic-bezier(.2,.85,.25,1)}
#sound-orb::before{content:"";position:absolute;inset:0;border-radius:50%;
  background:radial-gradient(circle at 72% 28%,rgba(40,104,166,.5),transparent 34%),
    radial-gradient(circle at 31% 24%,rgba(220,226,240,.26),transparent 20%),
    radial-gradient(circle at 42% 38%,#242a35 0,#11141b 45%,#07090e 78%);
  border:1px solid rgba(112,155,196,.42)}
#sound-orb::after{content:"";position:absolute;inset:26%;border-radius:50%;
  background:radial-gradient(circle at 35% 28%,#ff9a9e 0,#ff334d 35%,#9d102d 74%,#4b0c1e 100%)}
#sound-orb .orb-ring{position:absolute;inset:-20%;border:1px solid rgba(255,65,88,.72);
  border-radius:50%;opacity:0;transform:scale(.78)}
#sound-orb.is-active{width:clamp(50px,4.2vw,68px);opacity:1;transform:scale(1)}
#sound-orb.is-active .orb-ring{animation:orb-wave 1.65s ease-out infinite}
#sound-orb.is-active .orb-ring:nth-child(2){animation-delay:.82s}
#sound-orb.music-playing{bottom:calc(var(--m) + 1.05em + env(safe-area-inset-bottom,0px))}
@keyframes orb-wave{0%{opacity:.76;transform:scale(.76)}100%{opacity:0;transform:scale(1.58)}}

/* ---- animated brand lockup ----
   A Lottie module, not a dock panel: it is a fixed-position brand element that
   owns its own corner. Placement is a data attribute so the control room can
   move it without a re-render, and every position is chosen to clear the
   existing furniture (card top-left, dock right, clock bottom-left, ticker
   bottom-right, CRID bug top-left). */
#logo-module{position:fixed;z-index:18;pointer-events:none;
  width:var(--logo-w,24vmin);max-width:calc(100vw - 2*var(--m));
  opacity:1;transition:opacity .4s cubic-bezier(.22,1,.36,1),transform .4s cubic-bezier(.22,1,.36,1)}
#logo-module.off{opacity:0;transform:scale(.96)}
#logo-module .logo-stage{position:relative;width:100%;display:block;overflow:hidden}
#logo-module svg{display:block;overflow:visible}
/* The goat layer is a JPEG on a solid black matte; screen blending drops the
   matte and keeps the artwork, so the lockup sits on the scene instead of in a
   black rectangle. */
#logo-module svg image{mix-blend-mode:screen}
#logo-module .logo-fallback{display:grid;place-items:center;aspect-ratio:5/1;
  font-family:var(--display,var(--brand));font-weight:900;letter-spacing:.18em;
  color:var(--accent);font-size:1.4em}

/* top-centre is the default: the one band of the frame no other module claims */
#logo-module[data-pos="tc"]{left:50%;top:calc(var(--m) + env(safe-area-inset-top,0px));
  transform:translateX(-50%)}
#logo-module[data-pos="tc"].off{transform:translateX(-50%) scale(.96)}
#logo-module[data-pos="tl"]{left:var(--m);top:calc(var(--m) + 5.2em + env(safe-area-inset-top,0px))}
#logo-module[data-pos="tr"]{right:var(--m);top:calc(var(--m) + 5.2em + env(safe-area-inset-top,0px))}
#logo-module[data-pos="bl"]{left:var(--m);bottom:calc(var(--m) + 5.4em + env(safe-area-inset-bottom,0px))}
#logo-module[data-pos="bc"]{left:50%;bottom:calc(var(--m) + 5.4em + env(safe-area-inset-bottom,0px));
  transform:translateX(-50%)}
#logo-module[data-pos="bc"].off{transform:translateX(-50%) scale(.96)}
#logo-module[data-pos="br"]{right:var(--m);bottom:calc(var(--m) + 5.4em + env(safe-area-inset-bottom,0px))}
#logo-module[data-pos="custom"]{left:var(--logo-x,50%);top:var(--logo-y,50%);
  transform:translate(-50%,-50%)}
#logo-module[data-pos="custom"].off{transform:translate(-50%,-50%) scale(.96)}

/* In the PiP scene the inset owns the bottom-right, so the lockup moves up and
   shrinks rather than sitting under the video. */
html[data-scene="pip"] #logo-module{width:min(var(--logo-w,24vmin),18vmin)}
html[data-scene="pip"] #logo-module[data-pos="br"],
html[data-scene="pip"] #logo-module[data-pos="bc"]{
  bottom:calc(var(--m) + var(--pip-h,34vh) + 1.2em + env(safe-area-inset-bottom,0px))}

/* Swae composites one screenshot per frame: a looping tween gets sampled
   mid-flight, so hold a clean frame and drop the blend cost. */
html.swae #logo-module svg image{mix-blend-mode:normal}
html.swae #logo-module{transition:none}

@media (prefers-reduced-motion:reduce){
  #logo-module{transition:none}
}

/* ---- lower-third identity strip ---- */
#auto-headlines{position:fixed;right:var(--m);bottom:calc(var(--m) + env(safe-area-inset-bottom,0px));z-index:25;
  width:var(--identity-w);max-width:calc(100vw - 2*var(--m));
  display:grid;grid-template-columns:minmax(0,1fr);align-items:center;gap:.28em;
  padding:.42em .68em;background:rgba(7,9,14,.88);border:1px solid rgba(102,139,179,.32);
  border-left:.28em solid #ff334d;border-radius:.9em;
  font-size:clamp(13px,1.8vmin,19px);pointer-events:none;opacity:0;transform:translateY(8px);
  transition:opacity .25s ease,transform .25s ease}
#auto-headlines[data-status="ready"],#auto-headlines[data-status="empty"],#auto-headlines[data-status="error"]{opacity:1;transform:none}
.headline-feed-kicker{font-size:.68em;font-weight:900;letter-spacing:.08em;color:#ff5368;
  text-transform:uppercase;white-space:nowrap}
.identity-row{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:baseline;
  gap:.12em .5em;min-width:0}
.identity-row .headline-feed-title{grid-column:2;min-width:0;color:#f3f2f0;font-size:.82em;
  font-weight:750;line-height:1.15;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.identity-row .headline-feed-meta{grid-column:2;font-size:.6em;color:#a9bacb;
  white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.identity-music{padding-bottom:.25em;border-bottom:1px solid rgba(102,139,179,.26)}
.identity-music .headline-feed-kicker{color:#75b9e8}
.news-drop-card{position:fixed;left:calc(var(--m) + 2.2em);
  bottom:calc(var(--m) + 4.2em + env(safe-area-inset-bottom,0px));
  width:min(calc(100vw - 2*var(--m) - 2.2em),32em);max-height:20dvh;z-index:30;padding:.8em 1em}

/* ---- right dock ----
   The dock is a scroll container, not a clipping box: it owns the only height
   limit and scrolls if the modules exceed it, so a tall court panel is never
   cut off. Container queries let a module adapt to the dock's width rather
   than the viewport's. */
#dock-right{
  position:absolute;top:calc(var(--m) + env(safe-area-inset-top,0px));right:var(--m);
  display:flex;flex-direction:column;align-items:stretch;gap:.6em;box-sizing:border-box;
  width:min(calc(100vw - 2*var(--m)),26em);
  max-height:calc(100svh - 2*var(--m) - 5.5em);
  overflow-y:auto;overflow-x:hidden;scrollbar-width:none;
  pointer-events:none;z-index:15;
  container-type:inline-size;container-name:dock;
  overscroll-behavior:contain}
#dock-right::-webkit-scrollbar{display:none}
#dock-right:empty{display:none}
#dock-right>*{width:100%;box-sizing:border-box;flex:0 0 auto}

/* ---- X jumbotron ---- */
#x-jumbotron{
  background:#111214f0;
  border:.10em solid var(--surface-line);border-radius:1.4em;padding:.7em 1em;
}
.x-head{display:flex;align-items:center;gap:.5em;margin-bottom:.4em;
  font-size:.66em;font-weight:700;font-family:var(--brand);
  text-transform:uppercase;letter-spacing:.07em;color:#f3f2f0}
.x-brand{background:var(--accent);color:#111214;padding:.18em .65em;border-radius:.9em;font-weight:700}
.x-kind{background:rgba(255,255,255,.08);color:#f3f2f0;border:.09em solid rgba(255,255,255,.25);
  padding:.18em .6em;border-radius:.9em;text-transform:uppercase;font-weight:700;font-size:.72em}
.x-list{display:flex;flex-direction:column;gap:.35em}
/* -webkit-box is the only display that honours -webkit-line-clamp; the old rule
   also set display:flex, which the later declaration silently overrode. */
.x-item{font-size:.92em;line-height:1.3;color:#f3f2f0;overflow:hidden;
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.x-item .x-bullet{color:var(--accent);font-weight:800;font-size:1.1em;margin-right:.4em}
.x-item .x-text{color:#c7c7cc}
.x-item .x-author{color:var(--accent);font-weight:700}
.x-item .x-handle{color:#8E8E93;font-size:.82em}
.x-avatar{width:1.4em;height:1.4em;border-radius:50%;object-fit:cover;vertical-align:-.3em;margin-right:.35em}
.x-meta{display:inline-flex;gap:.4em;color:#8E8E93;font-size:.78em;margin-left:.4em}
.x-time,.x-metric{white-space:nowrap}
.x-trend{display:flex;align-items:center;gap:.5em}
.x-trend .x-count{color:#8E8E93;font-size:.78em;font-weight:600}

/* ---- dock modules: geometry only, no height caps ---- */
.court-wrap,.music-wrap,.space-wrap,.ledger-wrap,.riad-wrap{
  overflow:hidden;
  border:.09em solid var(--surface-line);border-radius:1.2em;padding:1em;
  background:var(--glass);margin:0;align-items:stretch;min-width:0;
}
.court-question{font-size:1.1em;font-weight:800;color:#f3f2f0;margin:0 0 .6em}
.court-viewpoints{display:flex;gap:.6em}
.court-viewpoint{flex:1;min-width:0;border:.09em solid var(--surface-line);border-radius:.8em;
  padding:.6em .8em;background:rgba(255,255,255,.03)}
.court-viewpoint .v-label{font-size:.62em;font-weight:800;text-transform:uppercase;
  letter-spacing:.06em;color:#8E8E93;margin:0 0 .3em}
.court-viewpoint .v-text{font-size:.9em;color:#f3f2f0;overflow-wrap:anywhere}
.court-votes{display:flex;gap:.6em;margin-top:.6em;flex-wrap:wrap}
.court-vote{border:.09em solid var(--surface-line);border-radius:.8em;padding:.4em .8em;
  background:rgba(255,255,255,.03);font-size:.85em;font-weight:700;color:#c7c7cc}
.court-verdict{margin-top:.6em;font-size:1em;font-weight:900;text-transform:uppercase;letter-spacing:.1em}
.court-verdict.w{color:#2ED3A5}.court-verdict.l{color:#FF7A66}.court-verdict.open{color:#FFB224}

.music-current{font-size:1em;font-weight:800;color:#f3f2f0;margin:0 0 .3em}
.music-artist{font-size:.8em;color:#c7c7cc;margin:0 0 .6em}
.music-video{width:100%;aspect-ratio:16/9;border:0;border-radius:.8em;display:block;background:#000}
.music-poster{display:flex;align-items:center;gap:.7em;padding:.4em 0}
.music-monogram{display:grid;place-items:center;width:2.6em;height:2.6em;border-radius:.7em;
  background:rgba(255,255,255,.08);border:1px solid var(--surface-line);
  font-weight:900;font-size:1.1em;color:var(--accent);flex:0 0 auto}
.music-poster-note{font-size:.66em;font-weight:700;letter-spacing:.08em;
  text-transform:uppercase;color:#8E8E93}
.music-empty{margin:.35em 0 0;font-size:.72em;color:#9A90B8}

.space-title{font-size:1em;font-weight:800;color:#f3f2f0;margin:0 0 .2em}
.space-host{font-size:.8em;color:#c7c7cc;margin:0 0 .3em}
.space-topic{font-size:.85em;color:#8E8E93;margin:0 0 .4em}
/* #desk is pointer-events:none so the overlay stays click-through; the one
   genuinely interactive element has to opt back in or the link is dead. */
.space-url{font-size:.72em;color:#7CC4FF;word-break:break-all;pointer-events:auto}
.ledger-title{font-size:1em;font-weight:800;color:#f3f2f0;margin:0 0 .4em}
.ledger-entry{font-size:.8em;color:#c7c7cc;padding:.3em 0;border-bottom:.06em solid var(--surface-line)}
.ledger-entry:last-child{border-bottom:none}
.ledger-type{font-size:.65em;font-weight:800;text-transform:uppercase;color:#FFB224;margin-right:.4em}
.riad-wrap{border:.12em solid #ff453a;border-radius:1.4em;padding:1.2em;background:var(--glass);margin:0}
.riad-title{font-size:1.2em;font-weight:900;color:#ff453a;text-transform:uppercase;
  letter-spacing:.1em;margin:0 0 .3em}
.riad-text{font-size:.95em;color:#f3f2f0;margin:0}

/* A narrow dock (phone preview, PiP) stacks the court viewpoints instead of
   squeezing two columns into 300px, where text wraps to one word per line. */
@container dock (max-width: 22em){
  .court-viewpoints{flex-direction:column}
  .court-question{font-size:1em}
}

/* ---- motion ---- */
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

/* ---- connection signal ---- */
#desk::after{content:"";position:absolute;z-index:100;top:0;left:0;right:0;height:2px;pointer-events:none;
  opacity:0;background:linear-gradient(90deg,transparent,var(--accent),transparent);
  transform:scaleX(.15);transform-origin:center}
#desk[data-connection="checking"]::after{opacity:.72;animation:poll-scan var(--poll-duration,800ms) cubic-bezier(.2,.8,.2,1) both}
#desk[data-connection="reconnecting"]::after{opacity:.8;
  background:linear-gradient(90deg,transparent,#ff453a,transparent);
  animation:reconnect-pulse 1.3s ease-in-out infinite}
#desk.telemetry-pulse::after{animation:state-ping .62s ease-out both}
@keyframes poll-scan{from{transform:scaleX(.12);opacity:.2}to{transform:scaleX(1);opacity:.75}}
@keyframes reconnect-pulse{0%,100%{opacity:.32}50%{opacity:.95}}
@keyframes state-ping{0%{transform:scaleX(.08);opacity:0}28%{opacity:.8}100%{transform:scaleX(1);opacity:0}}
.dot.loading{animation-duration:var(--poll-duration,800ms)}

@media (prefers-reduced-motion:reduce){
  .card{transform:none;transition:none;animation:none!important}
  #crid-jumbotron,#crid-jumbotron.in{transform:none;transition:none;animation:none!important}
  #sound-orb,#sound-orb.is-active{transition:none;transform:none}
  #sound-orb::before,#sound-orb::after,#sound-orb .orb-ring,
  #sound-orb.is-active .orb-ring{animation:none!important}
  #auto-headlines{transition:none}
  .opt,.fill{transition:none}
  .dot{animation:none}
  #modules>*{animation:none}
  #desk::after{animation:none!important}
}

/* ---- alternate themes (structure only; cyber is the default) ---- */
html[data-theme="creative"] #desk{
  --accent:#d9c29a;--accent-glow:rgba(192,169,232,.42);--glass:rgba(18,16,15,.93);
  --surface-line:rgba(217,194,154,.32);--surface-soft:rgba(217,194,154,.1);
  --brand:"Inter",system-ui,sans-serif;--serif:"Fraunces",Georgia,serif;
  --mono:"JetBrains Mono",ui-monospace,monospace;color:#f8f3ea}
html[data-theme="torn-paper"] #desk{
  --accent:#3d2b1f;--accent-glow:rgba(61,43,31,.24);--glass:#f7f1e6;
  --surface-line:rgba(61,43,31,.22);--surface-soft:rgba(61,43,31,.08);
  --brand:"Kalam","Caveat",system-ui,sans-serif;--serif:"Caveat","Kalam",Georgia,serif;
  --mono:"JetBrains Mono",ui-monospace,monospace;color:#2a1f16}

.layout-alive .slot{left:var(--m);top:calc(var(--m) + 4.5em + env(safe-area-inset-top,0px));
  display:block;width:min(460px,calc(100vw - 2*var(--m)));max-height:65dvh;
  overflow:auto;scrollbar-width:none}
.layout-alive .slot::-webkit-scrollbar{display:none}
.layout-alive .slot>*{grid-area:auto;justify-self:stretch;width:100%}
.layout-alive #dock-right{top:var(--m);right:var(--m);
  width:min(360px,calc(100vw - 2*var(--m)));align-items:stretch;gap:.55em}
.layout-alive #modules{display:flex;flex-direction:column;align-items:stretch;gap:.55em}
.layout-alive .card{max-height:36dvh;overflow:auto;border-radius:var(--radius)}
.layout-alive #crid-jumbotron{left:var(--m);top:var(--m);
  max-width:min(460px,calc(100vw - 2*var(--m)));border-radius:1.2em}
.layout-alive .meta{font-family:var(--mono);font-size:.64em;color:#9d9587}
.layout-alive .headline,.layout-alive .ask,.layout-alive .court-question,
.layout-alive .music-current,.layout-alive .ledger-title{font-family:var(--serif);letter-spacing:.005em}
.layout-alive .summary,.layout-alive .source,.layout-alive .court-viewpoint .v-text,
.layout-alive .ledger-entry{font-family:var(--brand)}

#time-dock{position:absolute;left:var(--m);bottom:calc(var(--m) + env(safe-area-inset-bottom,0px));
  z-index:20;pointer-events:none;min-width:10em;
  padding:.55em .85em;border:1px solid var(--surface-line);border-left:.28em solid var(--accent);
  border-radius:.75em;background:var(--glass);font-family:var(--mono);
  font-variant-numeric:tabular-nums}
#time-dock .clock-brand{font-size:.48em;letter-spacing:.16em;color:#9d9587}
#time-dock .clock-time{font-size:1em;font-weight:700;color:var(--ink,#f8f3ea);line-height:1.25}
#time-dock .clock-zone{font-size:.45em;letter-spacing:.12em;color:#9d9587}

/* Crop marks. NOTE: nothing in this file applies a .mod class — these rules are
   kept because cyber-theme.js may add it; they are inert otherwise. */
html[data-crop="true"] #desk .mod::before{content:"";position:absolute;inset:-1px;
  border-radius:inherit;pointer-events:none;opacity:.34;
  background:linear-gradient(to right,var(--accent) 2px,transparent 2px) 0 0/8px 8px no-repeat,
    linear-gradient(to bottom,var(--accent) 2px,transparent 2px) 0 0/8px 8px no-repeat,
    linear-gradient(to left,var(--accent) 2px,transparent 2px) 100% 100%/8px 8px no-repeat,
    linear-gradient(to top,var(--accent) 2px,transparent 2px) 100% 100%/8px 8px no-repeat}
html[data-theme="torn-paper"] #desk .mod{background:var(--glass);border-color:var(--surface-line);
  border-radius:.35em;color:#2a1f16;transform:rotate(-.25deg)}
html[data-theme="torn-paper"] #desk .headline,html[data-theme="torn-paper"] #desk .ask,
html[data-theme="torn-paper"] #desk .court-question,html[data-theme="torn-paper"] #desk .music-current,
html[data-theme="torn-paper"] #desk .ledger-title{font-family:var(--serif);font-weight:700;line-height:1.12}
html[data-theme="torn-paper"] #desk .chip{background:transparent;border:1.5px solid var(--accent);
  color:var(--accent);transform:rotate(-1.5deg)}
html.low-power #desk .mod{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
  background-image:none;transform:none;clip-path:none}

/* Swae: one screenshot per frame, no hit testing, microphone-only audio. The cyber
   theme handles its own snapshot style; these rules cover the alternate themes and
   the shared chrome so behaviour is the same whichever theme is loaded. */
html.swae #desk .card,html.swae #desk .court-wrap,html.swae #desk .music-wrap,
html.swae #desk .space-wrap,html.swae #desk .ledger-wrap,html.swae #desk .riad-wrap,
html.swae #desk #x-jumbotron,html.swae #desk .news-drop-card,html.swae #desk .mod{
  backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:#0b0d12f5}
html.swae #desk *{transition:none!important;animation:none!important}
html.swae .scale-wrap{display:none}

/* ---- Swae chat strip ---- */
#swae-chat{position:fixed;left:var(--m);bottom:calc(var(--m) + 4.4em + env(safe-area-inset-bottom,0px));
  z-index:24;width:min(26em,calc(100vw - 2*var(--m)));
  display:flex;flex-direction:column;gap:.18em;
  padding:.42em .7em;background:rgba(7,9,14,.88);border:1px solid rgba(102,139,179,.32);
  border-left:.28em solid #75b9e8;border-radius:.9em;
  font-size:clamp(12px,1.7vmin,17px);pointer-events:none}
#swae-chat[hidden]{display:none}
#swae-chat .swae-chat-line{display:flex;gap:.45em;min-width:0;line-height:1.25}
#swae-chat .swae-chat-user{color:#75b9e8;font-weight:800;flex:0 0 auto;max-width:9em;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#swae-chat .swae-chat-text{color:#e7ecf2;flex:1 1 auto;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

@media(max-width:900px){
  .layout-alive .slot{width:min(39vw,460px)}
  .layout-alive #dock-right{width:min(31vw,360px)}
  #time-dock{font-size:.72em}
}
@media(max-width:520px){
  #desk{--identity-w:min(58vw,32rem)}
  #auto-headlines{width:var(--identity-w);gap:.15em;padding:.32em .5em}
  .headline-feed-kicker{font-size:.58em}
  .identity-row .headline-feed-title{font-size:.72em}
  .identity-row .headline-feed-meta{font-size:.54em}
}
`,asText=value=>value==null||typeof value=="object"&&!(value instanceof Node)?"":String(value),h=(tag,props,...children)=>{const el=document.createElement(tag);if(typeof props=="string")el.className=props;else if(props)for(const[key,value]of Object.entries(props))value==null||value===!1||(key==="class"?el.className=value:key==="style"&&typeof value=="object"?Object.assign(el.style,value):key==="dataset"&&typeof value=="object"?Object.assign(el.dataset,value):key.startsWith("on")&&typeof value=="function"?el.addEventListener(key.slice(2).toLowerCase(),value):key in el?el[key]=value:el.setAttribute(key,value===!0?"":value));for(const c of children.flat())c==null||c===!1||c===!0||el.append(c instanceof Node?c:document.createTextNode(asText(c)));return el},CONFIDENCE_LABEL={confirmed:"Confirmed",reported:"Reported",disputed:"Disputed",unverified:"Unverified claim",test:"Test card"},formatDateTime=iso=>{if(!iso)return"";const date=new Date(iso);return Number.isNaN(date.getTime())?"":date.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})},formatAge=iso=>{const timestamp=Date.parse(iso);if(!Number.isFinite(timestamp))return"time unknown";const minutes=Math.floor(Math.max(0,Date.now()-timestamp)/6e4);return minutes<60?`${minutes}m ago`:`${Math.floor(minutes/60)}h ago`},formatSince=iso=>{if(!iso)return"";const timestamp=new Date(iso).getTime();if(!Number.isFinite(timestamp)||timestamp===0)return"";const seconds=Math.max(0,(Date.now()-timestamp)/1e3);return seconds<60?"just now":seconds<3600?`${Math.round(seconds/60)}m ago`:seconds<86400?`${Math.round(seconds/3600)}h ago`:`${Math.round(seconds/86400)}d ago`},renderers=new Map,register=(type,render2)=>renderers.set(type,render2),sourceLine=card=>{const parts=[card.publisher,formatDateTime(card.publishedAt)].filter(Boolean);return parts.length?h("p","source",`Source: ${parts.join(", ")}`):null},pollBlock=poll=>{const rows=(poll.options||[]).map(option=>{const fill=h("span","fill"),pct=h("span","pct"),el=h("div","opt",fill,h("div","row",h("span","label",option.label),pct));return{id:option.id,fill,pct,el}}),note=h("p","poll-state"),box=h("div","poll",rows.map(row=>row.el),note);return box.update=next=>{if(!next||!Array.isArray(next.options))return;const counts=next.options.map(option=>Number(option.count)||0),total=counts.reduce((sum,count)=>sum+count,0),top=counts.reduce((max,count)=>Math.max(max,count),0);for(const option of next.options){const row=rows.find(candidate=>candidate.id===option.id);if(!row)continue;const count=Number(option.count)||0,share=total?Math.round(count/total*100):0;row.fill.style.transform=`scaleX(${share/100})`,row.pct.textContent=`${share}% (${count})`,row.el.classList.toggle("lead",!next.active&&total>0&&count===top)}note.textContent=next.active?`Voting open, ${total} votes`:`Final result, ${total} votes`},box.update(poll),box},baseCard=(card,opts={})=>{const isNews=card.type==="news-drop",confidence=isNews&&CONFIDENCE_LABEL[card.confidence]?card.confidence:"none",ask=opts.poll?opts.poll.question:card.question,meta=h("div","meta",card.category?h("span","",card.category):null,isNews?h("span","chip",CONFIDENCE_LABEL[card.confidence]||""):null);return h("article",`card${isNews?" news-drop-card":""} conf-${confidence}`,meta,h("h1","headline",card.headline),card.summary?h("p","summary",card.summary):null,opts.showSource?sourceLine(card):null,opts.poll?pollBlock(opts.poll):null,card.type!=="poll"&&ask?h("div","ask",ask):null)};register("news-drop",baseCard);const fallback=baseCard;register("court",card=>{var _a2,_b2;try{const votesA=Number((_a2=card.votes)==null?void 0:_a2.a)||0,votesB=Number((_b2=card.votes)==null?void 0:_b2.b)||0,total=votesA+votesB,pctA=total?Math.round(votesA/total*100):0,pctB=total?100-pctA:0,verdict=h("div","court-verdict",card.verdict===1?"W":card.verdict===0?"L":card.status==="open"?"OPEN":"CLOSED");return verdict.classList.add(card.verdict===1?"w":card.verdict===0?"l":"open"),h("div","court-wrap",h("div","court-question",card.question),h("div","court-viewpoints",h("div","court-viewpoint",h("div","v-label","A"),h("div","v-text",card.viewpointA)),h("div","court-viewpoint",h("div","v-label","B"),h("div","v-text",card.viewpointB))),h("div","court-votes",h("div","court-vote",`A: ${votesA} (${pctA}%)`),h("div","court-vote",`B: ${votesB} (${pctB}%)`)),verdict)}catch(error){return console.warn("court module failed to render",error),h("div","court-wrap",h("div","court-question","Court"))}});const posterFor=(track,note)=>{const title=typeof track.title=="string"?track.title.trim():"";return h("div","music-poster",h("span","music-monogram",title.charAt(0).toUpperCase()||"?"),h("span","music-poster-note",note))};register("music",musicState=>{try{const music=musicState||{},current=music.current;if(!current)return null;let src="";try{src=youtubeEmbedUrl(current.videoId,{autoplay:music.playing===!0})||""}catch(error){console.warn("youtubeEmbedUrl failed",error)}const wantsPlayer=CONFIG.musicMode==="player"||CONFIG.musicMode==="auto"&&!SWAE&&!!src,wrap=h("section",{class:"music-wrap","aria-label":"Music player"},h("div","music-current",current.title||"Now playing"),current.artist?h("div","music-artist",current.artist):null);if(wantsPlayer&&src){wrap.dataset.mode="player";const iframe=h("iframe",{class:"music-video",src,title:`YouTube player: ${current.title||"current track"}`,referrerPolicy:"strict-origin-when-cross-origin",allow:"autoplay; encrypted-media; picture-in-picture; web-share",allowFullscreen:!0});let settled=!1;const toPoster=note=>{settled||(settled=!0,wrap.dataset.mode="poster",iframe.remove(),wrap.append(posterFor(current,note)))};iframe.addEventListener("load",()=>{settled=!0},{once:!0}),iframe.addEventListener("error",()=>toPoster("PLAYER UNAVAILABLE"),{once:!0}),setTimeout(()=>toPoster("PLAYER DID NOT LOAD"),TIMING.playerFallbackMs),wrap.append(iframe)}else wrap.dataset.mode="poster",wrap.append(posterFor(current,src?"AUDIO NOT CAPTURED":"NO VIDEO")),src||wrap.append(h("p","music-empty","No validated YouTube video for this track."));return wrap}catch(error){return console.warn("music module failed to render",error),null}}),register("space",card=>{try{const spaces=Array.isArray(card.spaces)?card.spaces:[];return h("div","space-wrap",...spaces.map(space=>h("div","",h("div","space-title",space.title),space.host?h("div","space-host",`Host: ${space.host}`):null,space.topic?h("div","space-topic",space.topic):null,space.url?h("a",{class:"space-url",href:space.url,target:"_blank",rel:"noopener noreferrer"},"Open on X"):null)))}catch(error){return console.warn("space module failed to render",error),h("div","space-wrap",h("div","space-title","Spaces"))}}),register("ledger",card=>{try{const ledger=Array.isArray(card.ledger)?card.ledger:[];return h("div","ledger-wrap",h("div","ledger-title","STRANGERS Ledger"),...ledger.slice(-8).map(entry=>h("div","ledger-entry",h("span","ledger-type",entry.type),entry.title,entry.description?h("span","",` — ${entry.description}`):null)))}catch(error){return console.warn("ledger module failed to render",error),h("div","ledger-wrap",h("div","ledger-title","Ledger"))}}),register("riad",card=>{try{return!card||!card.active?null:h("div","riad-wrap",h("div","riad-title","RIAD — RENT IS ALWAYS DUE"),h("div","riad-text",`Raid announced${card.channel?` from ${card.channel}`:""}.`))}catch(error){return console.warn("riad module failed to render",error),null}});const app={version:-1,lastUpdated:0,clockOffset:0,state:null,shownKey:null,summonedCardId:null,moduleNodes:new Map,identityMusicKey:"",headlineItems:[],headlineIndex:0,failures:0,online:!1,xStarted:!1,timers:{expiry:null,poll:null,telemetry:null,headlinePoll:null,headlineRotate:null,x:null}},serverNow=()=>Date.now()+(Number.isFinite(app.clockOffset)?app.clockOffset:0),style=document.createElement("style");style.textContent=CSS+CYBER_CSS,document.head.append(style);const slot=h("div","slot"),root=h("div",{id:"desk",class:[`layout-${CONFIG.layout}`,"pos-top-left",`anim-${CONFIG.anim}`,"crid-pos-top","x-pos-top",CONFIG.debug?"debug":""].filter(Boolean).join(" ")},slot);document.body.append(root);const headlineShelf=h("div",{id:"auto-headlines","aria-live":"off","data-status":"loading"});root.append(headlineShelf);const chatFeed=h("div",{id:"swae-chat",hidden:!0,"aria-live":"off"});if(root.append(chatFeed),CONFIG.chat&&typeof swae!="undefined"&&typeof swae.subscribe=="function"){swae.subscribe(CONFIG.chatPrefix?{chat:{prefix:CONFIG.chatPrefix}}:{chat:{}});const previousHandler=typeof swae.onmessage=="function"?swae.onmessage:null;swae.onmessage=data=>{previousHandler==null||previousHandler(data);const chat=data&&data.chat;if(!chat)return;const text=(chat.segments||[]).map(segment=>segment&&typeof segment.text=="string"?segment.text:"").join("").trim();if(text)for(chatFeed.hidden=!1,chatFeed.append(h("div","swae-chat-line",h("span","swae-chat-user",chat.user||"???"),h("span","swae-chat-text",text)));chatFeed.children.length>CHAT_LINES;)chatFeed.firstElementChild.remove()}}const cridAudio=document.createElement("audio");cridAudio.preload="none",cridAudio.hidden=!0,cridAudio.setAttribute("aria-hidden","true"),cridAudio.style.display="none",root.append(cridAudio);const syncCridAudio=createCridAudioSync(cridAudio,error=>{console.warn("CRID audio could not start. Browser autoplay policy or the audio URL may have blocked playback.",error)}),botPlaced=params.get("bot.x")!=null||params.get("bot.y")!=null,bot=CONFIG.botArg==="0"?null:createCridBot({root,swae:SWAE,lowPower:document.documentElement.classList.contains("low-power"),position:["bl","bc","br"].includes(CONFIG.botArg)?CONFIG.botArg:"br",x:botPlaced?num("bot.x",50,0,100):null,y:botPlaced?num("bot.y",88,0,100):null}),soundOrb=bot?bot.el:h("div",{id:"sound-orb","aria-hidden":"true"},h("span",{class:"orb-ring"}),h("span",{class:"orb-ring"}));bot||root.append(soundOrb);const disposeSoundOrb=createSoundOrbSync(cridAudio,soundOrb);window.addEventListener("pagehide",disposeSoundOrb,{once:!0});const logo=CONFIG.logo?createLogo({root,position:CONFIG.logoPos,width:CONFIG.logoWidth,reduced:typeof matchMedia=="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches}):null;logo&&window.addEventListener("pagehide",()=>logo.destroy(),{once:!0});const dockRight=h("div",{id:"dock-right"});root.append(dockRight);const modulesWrap=h("div",{id:"modules"});dockRight.append(modulesWrap);let dot=null;if(CONFIG.debug){const scaleValue=h("span","val",CONFIG.scale.toFixed(2)),scaleInput=h("input",{type:"range",min:"0.6",max:"1.4",step:"0.05",value:String(CONFIG.scale)});scaleInput.addEventListener("input",()=>{root.style.setProperty("--scale",scaleInput.value),scaleValue.textContent=Number(scaleInput.value).toFixed(2)}),root.append(h("div","scale-wrap",h("span","","SCALE"),scaleInput,scaleValue)),dot=h("div","dot"),root.append(dot)}function dropCard(replacing=!1){const old=slot.firstElementChild;old&&!old.dataset.leaving&&(old.dataset.leaving="1",bot&&!replacing?bot.dismiss(old,()=>old.remove()):(bot==null||bot.cancel(old),old.classList.add("out"),setTimeout(()=>old.remove(),TIMING.cardLeaveMs))),app.shownKey=null,replacing||(app.summonedCardId=null)}function showCard(card,opts={}){var _a2,_b2,_c,_d,_e;const key=[card.id,opts.showSource,card.headline,card.summary,card.question,card.confidence,(_b2=(_a2=opts.poll)==null?void 0:_a2.id)!=null?_b2:"",(((_c=opts.poll)==null?void 0:_c.options)||[]).map(option=>option.id).join(",")].join("|");if(key===app.shownKey){(_e=(_d=slot.lastElementChild)==null?void 0:_d.updatePoll)==null||_e.call(_d,opts.poll);return}dropCard(!0);const el=(renderers.get(card.type)||fallback)(card,opts);slot.append(el),bot&&app.summonedCardId!==card.id&&(app.summonedCardId=card.id,bot.summon(el)),requestAnimationFrame(()=>requestAnimationFrame(()=>{var _a3;el.classList.add("in"),(_a3=el.updatePoll)==null||_a3.call(el,opts.poll)})),app.shownKey=key}function clearModules(){for(const record of app.moduleNodes.values())bot==null||bot.cancel(record.el),record.el.remove();app.moduleNodes.clear(),app.identityMusicKey&&(app.identityMusicKey="",soundOrb.classList.remove("music-playing"),drawHeadlines())}function renderModule(state){var _a2,_b2,_c,_d;if(!state){clearModules();return}const track=(_a2=state.music)==null?void 0:_a2.current,musicKey=(_b2=state.music)!=null&&_b2.playing&&(track!=null&&track.title)?`${track.title}|${track.artist||""}`:"";musicKey!==app.identityMusicKey&&(app.identityMusicKey=musicKey,soundOrb.classList.toggle("music-playing",!!musicKey),drawHeadlines());const desired=[];if((_c=state.music)!=null&&_c.current){const current=state.music.current;desired.push({kind:"music",key:`music|${current.videoId||""}|${current.title||""}|${current.artist||""}`,build:()=>(renderers.get("music")||fallback)(state.music)})}state.court&&desired.push({kind:"court",key:`court|${JSON.stringify(state.court)}`,build:()=>(renderers.get("court")||fallback)({type:"court",...state.court})}),Array.isArray(state.spaces)&&state.spaces.length&&desired.push({kind:"spaces",key:`spaces|${JSON.stringify(state.spaces)}`,build:()=>(renderers.get("space")||fallback)({type:"space",spaces:state.spaces})}),Array.isArray(state.ledger)&&state.ledger.length&&desired.push({kind:"ledger",key:`ledger|${JSON.stringify(state.ledger)}`,build:()=>(renderers.get("ledger")||fallback)({type:"ledger",ledger:state.ledger})}),(_d=state.riad)!=null&&_d.active&&desired.push({kind:"riad",key:`riad|${JSON.stringify(state.riad)}`,build:()=>(renderers.get("riad")||fallback)({type:"riad",...state.riad})});const wanted=new Set(desired.map(item=>item.kind));for(const[kind,record]of[...app.moduleNodes])wanted.has(kind)||(bot==null||bot.cancel(record.el),record.el.remove(),app.moduleNodes.delete(kind));const fresh=[];for(const item of desired){const existing=app.moduleNodes.get(item.kind);if(existing&&existing.key===item.key)continue;const el=item.build();if(!el){existing&&(bot==null||bot.cancel(existing.el),existing.el.remove(),app.moduleNodes.delete(item.kind));continue}existing?(bot==null||bot.cancel(existing.el),existing.el.replaceWith(el),app.moduleNodes.set(item.kind,{el,key:item.key})):(app.moduleNodes.set(item.kind,{el,key:item.key}),fresh.push({kind:item.kind,el}))}for(const{kind,el}of fresh){const index=MODULE_ORDER.indexOf(kind);let reference=null;for(let i=index+1;i<MODULE_ORDER.length;i+=1){const next=app.moduleNodes.get(MODULE_ORDER[i]);if(next&&next.el.parentNode===modulesWrap){reference=next.el;break}}modulesWrap.insertBefore(el,reference)}if(bot)for(const{el}of fresh)bot.summon(el)}let cridEl=null,cridKey=null;function renderCrid(crid){var _a2,_b2,_c,_d,_e,_f;if(!CONFIG.crid||!crid){if(cridEl){const leaving=cridEl;cridEl=null,cridKey=null,leaving.classList.remove("in"),leaving.classList.add("out"),setTimeout(()=>leaving.remove(),TIMING.cardLeaveMs)}return}const key=[crid.id,crid.entry,crid.kind,crid.title,crid.credit,crid.verdict,(_a2=crid.result)==null?void 0:_a2.winner,(_b2=crid.result)==null?void 0:_b2.percent,(_c=crid.result)==null?void 0:_c.total,(_d=crid.result)==null?void 0:_d.tie].join("|");if(key===cridKey&&cridEl)return;const logo2=h("img",{class:"crid-logo",src:CONFIG.logoUrl,alt:"CRID Logo"});logo2.addEventListener("error",()=>{const badge=h("div",{class:"crid-logo",style:"background:radial-gradient(circle at 35% 35%,#2a0808 0%,#0d0d10 80%);border:2px solid var(--accent);display:flex;align-items:center;justify-content:center;font-size:.78em;font-weight:900;color:#fff;letter-spacing:.05em"},"CRID");logo2.replaceWith(badge)},{once:!0});const head=h("div","crid-head",h("span","crid-brand",`CRID #${(_e=crid.entry)!=null?_e:"—"}`),h("span","crid-kind",crid.kind||"topic"));let verdictEl;crid.verdict===1?verdictEl=h("span","crid-verdict crid-v-1","✔ RENT PAID"):crid.verdict===0?verdictEl=h("span","crid-verdict crid-v-0","✖ STILL OWING"):crid.result?verdictEl=h("div","crid-v-none",crid.result.tie?"TIE (50/50)":`${crid.result.winner} (${crid.result.percent}%)`):verdictEl=h("span","crid-v-none","LIVE SEGMENT");const credit=typeof crid.credit=="string"&&crid.credit?h("span","crid-v-none",`BY @${crid.credit.toUpperCase()}`):null,body=h("div","crid-body",head,h("div","crid-title",crid.title),h("div","crid-foot",verdictEl,credit));cridEl?cridEl.replaceChildren(logo2,body):((_f=document.getElementById("crid-jumbotron"))==null||_f.remove(),cridEl=h("div",{id:"crid-jumbotron"},logo2,body),root.append(cridEl),bot==null||bot.summon(cridEl),requestAnimationFrame(()=>requestAnimationFrame(()=>cridEl==null?void 0:cridEl.classList.add("in")))),cridKey=key}function renderLogo(logoState){if(logo)try{logo.update(logoState)}catch(error){console.warn("logo module failed to update",error)}}let xEl=null,xKey=null,xController=null;function renderXjumbotron(feed){if(!CONFIG.xMode||!feed){xEl&&(xEl.remove(),xEl=null,xKey=null),clearTimeout(app.timers.x);return}const key=[CONFIG.xMode,CONFIG.xUserId,JSON.stringify(feed)].join("|");if(key===xKey&&xEl){clearTimeout(app.timers.x),app.timers.x=setTimeout(fetchXfeed,CONFIG.xPollMs);return}const head=h("div","x-head",h("span","x-brand","X"),h("span","x-kind",CONFIG.xMode==="trends"?"Trending":CONFIG.xMode==="following"?"Following":"For You"));let list;if(CONFIG.xMode==="trends"){const items=(feed.trends||[]).map(trend=>h("div","x-item x-trend",h("span","x-bullet","•"),h("span","x-text",h("span","x-author",trend.name)),trend.tweetCount?h("span","x-count",`${Number(trend.tweetCount).toLocaleString()} posts`):null));list=h("div","x-list",...items)}else{const items=(feed.tweets||[]).map(tweet=>h("div","x-item",tweet.avatar?h("img",{class:"x-avatar",src:tweet.avatar,alt:"",loading:"lazy"}):null,h("span","x-text",h("span","x-author",tweet.author),tweet.handle?h("span","x-handle",` @${tweet.handle}`):null," — ",tweet.text),h("span","x-meta",h("span","x-time",formatSince(tweet.createdAt)),tweet.metrics?h("span","x-metric",`· ${Number(tweet.metrics.like||0).toLocaleString()} ❤  ${Number(tweet.metrics.repost||0).toLocaleString()} ↗`):null)));list=h("div","x-list",...items)}const updated=new Date(feed.updatedAt),stamp=Number.isNaN(updated.getTime())?"":updated.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),foot=h("div","",h("span","x-count",stamp));xEl?xEl.replaceChildren(head,list,foot):(xEl=h("div",{id:"x-jumbotron"},head,list,foot),dockRight.prepend(xEl),bot==null||bot.summon(xEl),requestAnimationFrame(()=>requestAnimationFrame(()=>xEl==null?void 0:xEl.classList.add("in")))),xKey=key,clearTimeout(app.timers.x),app.timers.x=setTimeout(fetchXfeed,CONFIG.xPollMs)}async function fetchXfeed(){if(!CONFIG.xMode)return;xController==null||xController.abort(),xController=new AbortController;const timeoutId=setTimeout(()=>xController.abort(),TIMING.requestTimeoutMs),query=new URLSearchParams({mode:CONFIG.xMode});CONFIG.xUserId&&query.set("userId",CONFIG.xUserId);try{const response=await fetch(`/api/x/feed?${query}`,{cache:"no-store",signal:xController.signal});response.ok&&renderXjumbotron(await response.json())}catch(error){}finally{clearTimeout(timeoutId)}}const HEADLINE_NOTE={loading:"Checking for fresh headlines…",empty:"No fresh headlines in the last 12 hours.",error:"Fresh headlines unavailable. Retrying automatically."};function drawHeadlines(status){var _a2,_b2;const track=(_b2=(_a2=app.state)==null?void 0:_a2.music)!=null&&_b2.playing?app.state.music.current:null,rows=[];track!=null&&track.title&&rows.push(h("div","identity-row identity-music",h("span","headline-feed-kicker","NOW PLAYING"),h("span","headline-feed-title",track.title),h("span","headline-feed-meta",track.artist||"Music desk")));const kicker=track!=null&&track.title?"NEWS":"LATEST · NIGERIA";if(!app.headlineItems.length){const state=status||"loading";headlineShelf.dataset.status=state,rows.push(h("div","identity-row identity-news",h("span","headline-feed-kicker",kicker),h("span","headline-feed-title",HEADLINE_NOTE[state]||HEADLINE_NOTE.loading),h("span","headline-feed-meta","RSS · last 12 hours"))),headlineShelf.replaceChildren(...rows);return}const item=app.headlineItems[app.headlineIndex%app.headlineItems.length];headlineShelf.dataset.status="ready",rows.push(h("div","identity-row identity-news",h("span","headline-feed-kicker",kicker),h("span","headline-feed-title",item.title),h("span","headline-feed-meta",`${item.publisher||"Google News"} · ${formatAge(item.publishedAt)} · RSS`))),headlineShelf.replaceChildren(...rows)}async function refreshHeadlines(){const controller=new AbortController,timeoutId=setTimeout(()=>controller.abort(),TIMING.requestTimeoutMs);try{const response=await fetch("/api/desk-headlines",{cache:"no-store",signal:controller.signal}),payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);app.headlineItems=Array.isArray(payload.headlines)?payload.headlines.filter(item=>(item==null?void 0:item.title)&&(item==null?void 0:item.publishedAt)):[],app.headlineIndex=0,drawHeadlines(app.headlineItems.length?"ready":"empty")}catch(error){app.headlineItems=[],drawHeadlines("error")}finally{clearTimeout(timeoutId),clearTimeout(app.timers.headlinePoll),app.timers.headlinePoll=setTimeout(refreshHeadlines,TIMING.headlinePollMs)}}function render(){var _a2;clearTimeout(app.timers.expiry);const state=app.state;if(!state)return;renderCrid(state.crid),syncCridAudio(state.crid),renderLogo(state.logo),renderModule(state),CONFIG.xMode&&!app.xStarted&&(app.xStarted=!0,fetchXfeed());const poll=state.poll||null,card=state.card||(poll?{id:`poll-${(_a2=poll.id)!=null?_a2:"live"}`,type:"poll",category:"Live poll",headline:poll.question}:null);if(!state.visible||!card){dropCard();return}const expiresAt=Number(state.expiresAt)||0;if(expiresAt&&expiresAt<=serverNow()){const overdue=serverNow()-expiresAt;if(!state.autoPlay||overdue>TIMING.graceMs){dropCard();return}schedulePoll(250)}showCard(card,{showSource:state.showSource,poll}),expiresAt&&(app.timers.expiry=setTimeout(render,Math.max(50,expiresAt-serverNow()+50)))}function apply(next){if(!next||typeof next!="object")return;const updatedAt=Number(next.updatedAt)||0;if(updatedAt&&updatedAt<app.lastUpdated)return;const changed=app.version>=0&&next.version!==app.version;next.version!=null&&(app.version=next.version),updatedAt&&(app.lastUpdated=updatedAt);const serverNowMs=Number(next.serverNow);Number.isFinite(serverNowMs)&&(app.clockOffset=serverNowMs-Date.now()),app.state=next,bot==null||bot.observe(next),changed&&(clearTimeout(app.timers.telemetry),root.classList.remove("telemetry-pulse"),requestAnimationFrame(()=>root.classList.add("telemetry-pulse")),app.timers.telemetry=setTimeout(()=>root.classList.remove("telemetry-pulse"),700)),render()}function setOnline(value){value!==app.online&&(app.online=value,bot==null||bot.setOnline(value))}function schedulePoll(delay){clearTimeout(app.timers.poll),app.timers.poll=setTimeout(tick,delay)}async function tick(){let delay=CONFIG.pollMs;const startedAt=performance.now(),controller=new AbortController,timeoutId=setTimeout(()=>controller.abort(),TIMING.requestTimeoutMs);root.dataset.connection="checking",dot==null||dot.classList.remove("off"),dot==null||dot.classList.add("loading");try{const response=await fetch(`/api/desk/state?since=${app.version}`,{cache:"no-store",signal:controller.signal});if(response.status!==204){if(!response.ok)throw new Error(`HTTP ${response.status}`);apply(await response.json())}app.failures=0,setOnline(!0);const elapsed=Math.round(performance.now()-startedAt);root.style.setProperty("--poll-duration",`${Math.min(900,280+elapsed)}ms`),root.dataset.connection="connected",dot==null||dot.classList.remove("off","loading"),dot&&(dot.title=`Connected · ${elapsed} ms poll`)}catch(error){app.failures+=1,setOnline(!1),root.dataset.connection="reconnecting",dot==null||dot.classList.remove("loading"),dot==null||dot.classList.add("off"),dot&&(dot.title=`Connection retry ${app.failures}`),delay=Math.min(TIMING.maxBackoffMs,CONFIG.pollMs*2**Math.min(app.failures,4))}finally{clearTimeout(timeoutId),schedulePoll(delay)}}function startClock(){let zone="";try{zone=Intl.DateTimeFormat().resolvedOptions().timeZone||""}catch(error){zone=""}const clockTime=h("div","clock-time","--:--:--");root.append(h("div",{id:"time-dock"},h("div","clock-brand","CYBER LIVE DESK"),clockTime,h("div","clock-zone",zone?zone.toUpperCase().replace(/_/g," "):"LOCAL TIME")));const formatter=new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:!1}),draw=()=>{const now=new Date(serverNow());clockTime.textContent=Number.isNaN(now.getTime())?"--:--:--":formatter.format(now)};draw();const timer=setInterval(draw,1e3);window.addEventListener("pagehide",()=>clearInterval(timer),{once:!0})}window.DeskOverlay={register},app.timers.headlineRotate=setInterval(()=>{app.headlineItems.length<=1||(app.headlineIndex=(app.headlineIndex+1)%app.headlineItems.length,drawHeadlines())},TIMING.headlineRotateMs),window.addEventListener("pagehide",()=>{clearTimeout(app.timers.headlinePoll),clearInterval(app.timers.headlineRotate),clearTimeout(app.timers.poll),clearTimeout(app.timers.expiry),clearTimeout(app.timers.x),xController==null||xController.abort()},{once:!0}),CONFIG.clock&&startClock(),refreshHeadlines(),tick()})();
