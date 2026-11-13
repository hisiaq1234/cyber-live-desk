/* CYBER LIVE DESK — GTA-inspired whole-stream HUD.
   The camera feeds are the world. This shared theme styles every layer that appears over them:
   channel identity, CRID, GPS/minimap, active stories, polls, music and community modules.
   It uses GTA's compact HUD hierarchy and map behaviour without importing Rockstar assets or
   pretending to be GTA branding. The Black Market timestamp and the owner's own lockup remain
   their original authored assets. */
const T = 'html[data-theme="cyber"]';
const PANEL = ".card,.court-wrap,.music-wrap,.space-wrap,.ledger-wrap,.riad-wrap,#x-feed";

export const CYBER_CSS = `
@font-face{font-family:"Anton";src:url(/desk-assets/fonts/anton-latin-400-normal.woff2) format("woff2");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"Instrument Serif";src:url(/desk-assets/fonts/instrument-serif-latin-400-italic.woff2) format("woff2");font-weight:400;font-style:italic;font-display:swap}

${T} #desk{
  --onyx-950:#0F0B17;--onyx-900:#161025;--onyx-800:#1F1736;
  --indigo-500:#6531F8;--indigo-700:#3A1D9E;--indigo-300:#A98BFF;--indigo-100:#E4DBFF;
  --mint:#86F6BC;
  --ink-1:#F4F0FF;--ink-2:#C4BBE0;--ink-3:#9A90B8;--danger:#FF5B57;
  --accent:var(--mint);--ink:var(--ink-1);--glass:var(--onyx-900);--surface-line:var(--indigo-500);--radius:1.5em;
  --display:"Anton","Arial Narrow",Impact,"Haettenschweiler",sans-serif;
  --voice:"Instrument Serif","Iowan Old Style",Georgia,serif;
  --sticker:.28em .32em 0 var(--indigo-700);
  color:var(--ink-1)}

/* ---- panels: onyx body, indigo outline, one hard shadow ---- */
${T} #desk :is(${PANEL}){
  background:var(--onyx-900);border:.14em solid var(--indigo-500);border-radius:var(--chaos-radius,1.5em);
  box-shadow:var(--sticker);backdrop-filter:none;-webkit-backdrop-filter:none;color:var(--ink-1);
  rotate:var(--lean,0deg);
  transition:rotate .5s cubic-bezier(.2,.8,.2,1),border-radius .5s cubic-bezier(.2,.8,.2,1),
    box-shadow .5s cubic-bezier(.2,.8,.2,1),opacity .24s cubic-bezier(.2,.8,.2,1),transform .24s cubic-bezier(.2,.8,.2,1)}
${T} #desk .card{padding:1.1em 1.4em 1.15em;--lean:-.3deg;--chaos-radius:1.5em 1.5em 1.5em .42em}

/* The hand. Each family leans on the individual rotate property so the lean composes with the
   arrival animation instead of overwriting its transform. Tilts stay inside half a degree, one
   corner is cut to .42em, and the shadow depth says how heavy the panel is. The clock, ticker,
   lockup, mascot and CRID bug are pinned to the frame and never lean. */
${T} #desk .court-wrap,${T} #desk .riad-wrap{--lean:.4deg;--chaos-radius:1.5em 1.5em .42em 1.5em;
  --sticker:.34em .4em 0 var(--indigo-700)}
${T} #desk .music-wrap,${T} #desk .space-wrap{--lean:-.55deg;--chaos-radius:.42em 1.5em 1.5em 1.5em;
  --sticker:.2em .24em 0 var(--indigo-700)}
${T} #desk .ledger-wrap{--lean:.3deg;--chaos-radius:1.5em 1.5em 1.5em .42em}
${T} #desk #x-feed{--lean:0deg;--chaos-radius:1.5em}

/* label pill: category on indigo, confidence nested inside it */
${T} #desk .meta{display:inline-flex;align-items:center;gap:.6em;margin:0 0 .65em;padding:.2em .25em .2em .9em;
  border-radius:99px;background:var(--indigo-500);color:var(--ink-1);
  font-family:var(--brand);font-size:.62em;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
${T} #desk .meta>span:first-child{color:var(--ink-1)}
${T} #desk .chip{border:0;border-radius:99px;padding:.14em .75em;background:var(--onyx-950);color:var(--mint);
  font-family:var(--brand);font-size:1em;font-weight:800;letter-spacing:.1em}
${T} #desk .conf-confirmed .chip{background:var(--mint);color:var(--onyx-950)}
${T} #desk .conf-disputed .chip{background:var(--danger);color:var(--onyx-950)}
${T} #desk .conf-unverified .chip{background:transparent;color:var(--ink-2);box-shadow:inset 0 0 0 .12em var(--ink-3)}
${T} #desk .conf-test .chip{background:transparent;color:var(--ink-3);box-shadow:inset 0 0 0 .12em var(--ink-3)}

${T} #desk .headline{font-family:var(--display);font-weight:400;font-size:1.7em;line-height:1.05;
  letter-spacing:.012em;text-transform:uppercase;color:var(--ink-1)}
${T} #desk .summary{font-weight:500;color:var(--ink-2)}
${T} #desk .source{color:var(--ink-3);letter-spacing:.1em}

/* the question to chat is the 10%: mint, in the serif voice */
${T} #desk .ask{position:relative;margin:1em 0 0;padding:1.75em 0 0;background:none;border:0;
  border-top:.1em solid var(--indigo-700);font-family:var(--voice);font-style:italic;font-weight:400;
  font-size:1.5em;line-height:1.1;text-transform:none;letter-spacing:0;color:var(--mint)}
${T} #desk .ask::before{content:"ASK CHAT";position:absolute;top:.6em;left:0;
  font:400 .5em/1 var(--display);font-style:normal;letter-spacing:.2em;color:var(--indigo-300)}

/* poll: indigo bars for everyone, the leader earns the mint outline and number */
${T} #desk .opt{border-radius:.8em;background:var(--onyx-800);border:.1em solid var(--indigo-700);
  font-family:var(--brand);font-weight:700;color:var(--ink-1);animation:none}
${T} #desk .opt .fill{background:var(--indigo-500);opacity:1}
${T} #desk .opt.lead{border-color:var(--mint);background:var(--onyx-800);animation:none}
${T} #desk .opt .pct{font-family:var(--display);font-weight:400;letter-spacing:.04em;font-size:1.15em}
${T} #desk .opt.lead .pct{color:var(--mint)}
${T} #desk .poll-state{color:var(--ink-3);letter-spacing:.14em}

/* Two live marks, both cheap: the pill says the desk is receiving, and one mint pass travels the
   leader's bar. The sweep lives on the fill, not the option — the option's own animation is off. */
${T} #desk .meta::after{content:"";width:.42em;height:.42em;border-radius:50%;background:var(--mint);
  margin-left:.15em;animation:chaos-tick 2.6s ease-in-out infinite}
${T} #desk .opt.lead .fill::after{content:"";position:absolute;inset:0;
  background:linear-gradient(90deg,transparent,rgba(134,246,188,.28),transparent);
  animation:chaos-sweep 2.8s linear infinite}
@keyframes chaos-tick{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes chaos-sweep{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}

/* CRID segment bug. The breathe is an opacity pulse, so the theme lets it run; taking the stage
   lifts the badge onto a deeper cut than the resting sticker. */
${T} #desk #crid-live{background:var(--onyx-900);border:.14em solid var(--indigo-500);box-shadow:var(--sticker);
  backdrop-filter:none;-webkit-backdrop-filter:none}
${T} #desk #crid-live.in{box-shadow:.4em .46em 0 var(--indigo-700)}
${T} #desk .crid-logo{background:var(--onyx-950);border:.14em solid var(--indigo-500)}
${T} #desk .crid-logo:not(img){font-family:var(--display);font-weight:400;letter-spacing:.08em;color:var(--mint)}

/* The desk lockup. Named here so the theme owns its logo colours outright rather than leaving
   them to the module's fallback chain — and so nothing in the lockup can ever be red. Red is
   reserved above for disputed / owing / offline and is capped at ~2% of a frame; a permanent red
   bar across the top of the stream broke that on every theme. */
${T} #desk-logo{
  --t-logo-shell:var(--indigo-500);--t-logo-plate:var(--onyx-900);--t-logo-screen:var(--onyx-950);
  --t-logo-edge:var(--indigo-700);--t-logo-eye:var(--mint);--t-logo-rule:var(--indigo-500);
  --t-logo-gesture:var(--indigo-300);--t-logo-1:var(--ink-1);--t-logo-2:var(--mint);
  --t-logo-bone:var(--indigo-300)}
${T} #desk .crid-brand{color:var(--mint);font-family:var(--display);font-weight:400;font-size:1.3em;letter-spacing:.14em}
${T} #desk .crid-kind{background:var(--indigo-500);color:var(--ink-1);border-radius:99px}
${T} #desk .crid-title{font-family:var(--display);font-weight:400;font-size:1.3em;letter-spacing:.02em;text-transform:uppercase;color:var(--ink-1)}
${T} #desk .crid-v-1{background:var(--mint);color:var(--onyx-950)}
${T} #desk .crid-v-0{background:transparent;color:var(--danger);border-color:var(--danger)}
${T} #desk .crid-v-none{color:var(--ink-3)}

/* right dock modules */
${T} #desk .court-question,${T} #desk .music-current,${T} #desk .space-title,${T} #desk .ledger-title,${T} #desk .riad-title{
  font-family:var(--display);font-weight:400;letter-spacing:.02em;text-transform:uppercase;color:var(--ink-1)}
${T} #desk .court-question{font-size:1.3em}
${T} #desk .court-viewpoint,${T} #desk .court-vote,${T} #desk .music-track{background:var(--onyx-800);border:.1em solid var(--indigo-700);border-radius:1em}
${T} #desk .court-viewpoint .v-label{color:var(--indigo-300)}
${T} #desk .court-verdict.w{color:var(--mint)}${T} #desk .court-verdict.l{color:var(--danger)}${T} #desk .court-verdict.open{color:var(--indigo-300)}
${T} #desk .music-track.current{border-color:var(--mint);background:var(--onyx-800)}
${T} #desk .music-artist,${T} #desk .space-host,${T} #desk .ledger-entry{color:var(--ink-2)}
${T} #desk .music-queue,${T} #desk .space-topic{color:var(--ink-3)}
${T} #desk .ledger-type{color:var(--mint)}
${T} #desk .space-url{color:var(--indigo-300)}
${T} #desk .riad-wrap{border-color:var(--mint)}
${T} #desk .riad-title{color:var(--mint)}
${T} #desk .x-brand{background:var(--mint);color:var(--onyx-950);border-radius:99px}
${T} #desk .x-kind{background:var(--indigo-500);border:0;color:var(--ink-1);border-radius:99px}
${T} #desk .x-item .x-author,${T} #desk .x-item .x-bullet{color:var(--mint)}
${T} #desk .x-item .x-text{color:var(--ink-2)}

/* Lower third and chat share the same plate. The clock deliberately does not: #time-dock is the
   operator's own Black Market timestamp, drawn in full by overlay.js (crimson bar, dark panel,
   IBM Plex Mono digits), and no theme repaints it. A theme rule on #time-dock would be the
   "themes causing rubbish" the owner complained about — leave it alone. */
${T} #auto-headlines,${T} #swae-chat{
  background:var(--onyx-900);border:.14em solid var(--indigo-500);border-left-width:.5em;border-radius:1em;
  box-shadow:.22em .26em 0 var(--indigo-700);backdrop-filter:none;-webkit-backdrop-filter:none}
${T} .headline-feed-kicker{font-family:var(--display);font-weight:400;letter-spacing:.16em;color:var(--indigo-300)}
${T} .identity-row .headline-feed-title{font-family:var(--brand);font-weight:700;color:var(--ink-1)}
${T} .identity-row .headline-feed-meta{color:var(--ink-3)}
${T} .identity-music{border-bottom-color:var(--indigo-700)}
${T} .identity-music .headline-feed-kicker{color:var(--mint)}
${T} #swae-chat .swae-chat-user{color:var(--indigo-300)}
${T} #swae-chat .swae-chat-text{color:var(--ink-1)}

/* ---- the mascot: presence first, then an answer ----
   The pose engine owns every inner <g> and never writes the host's transform, so the host and the
   root svg are the only safe places to add motion. The bottom-centre anchor uses margin-left, not
   a transform, so nothing here may translate on X. */
/* The mascot's size lives in the bot module (crid-bot.js) alone: one clamp, one source of truth,
   and ?bot.scale= multiplies it. The theme only styles what the module cannot: the cast shadow.
   A zero-blur offset copy of the silhouette read as a sticker, so the shadow is soft and low. */
${T} #desk #crid-bot svg{filter:drop-shadow(0 calc(var(--bot-w)*.028) calc(var(--bot-w)*.07) rgba(0,0,0,.42))}
${T} #desk #crid-bot[data-mode="on"]{animation:bot-idle 4.5s ease-in-out infinite}
${T} #desk #crid-bot.music-playing svg{animation:bot-groove 1.6s ease-in-out infinite}
${T} #desk #crid-bot.is-active svg{animation:bot-answer .8s ease-out}
@keyframes bot-idle{0%,100%{transform:translateY(0)}50%{transform:translateY(calc(var(--bw)*-.016))}}
@keyframes bot-groove{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}
@keyframes bot-answer{0%,100%{transform:scale(1)}40%{transform:scale(1.09) translateY(-3px)}}
/* The theme's selector out-specifies the bot module's own swae/low-power filter:none, and the
   blanket swae guard only kills transition and animation — so the shadow has to be waived here. */
html.swae ${T} #desk #crid-bot svg,html.low-power ${T} #desk #crid-bot svg{filter:none}
/* Once the GLB is on the GPU the flat svg is gone and the host transform belongs
   to the stage machine's translate3d — the idle bob and the svg shadow are both
   switched off here so the theme's selectors cannot out-specify the bot module. */
${T} #desk #crid-bot.has-glb[data-mode]{animation:none}
${T} #desk #crid-bot.has-glb svg{filter:none;animation:none}

/* ---- scene: dual-camera PiP. The inset owns the bottom-right; the right column stacks above it ---- */
html[data-scene="pip"] #auto-headlines{right:var(--m);bottom:calc(var(--m) + var(--pip-h,34vh));width:var(--pip-w,34vw)}
html[data-scene="pip"] #dock-right{max-height:calc(100dvh - var(--pip-h,34vh) - 2*var(--m) - 6em)}

@media (prefers-reduced-motion:reduce){
${T} #desk #crid-bot,${T} #desk #crid-bot svg{animation:none}
${T} #desk :is(${PANEL}){rotate:0deg;transition:none}
${T} #desk .meta::after,${T} #desk .opt.lead .fill::after{animation:none}
}

/* ---- GTA HUD layer: applies to the whole broadcast, not just the character ---------------- */

${T} #desk{
  --gta-panel:rgba(8,11,14,.82);--gta-panel-solid:#0b0e12;
  --gta-line:rgba(236,239,241,.28);--gta-line-soft:rgba(236,239,241,.13);
  --gta-amber:#e8bd48;--gta-green:#9bc45b;--gta-red:#d9574f;--gta-blue:#72a9d7;
  --accent:var(--gta-amber);--glass:var(--gta-panel);--surface-line:var(--gta-line);
  --ink:#f0f1ed;--ink-1:#f0f1ed;--ink-2:#c1c6c7;--ink-3:#8c969b;
  --radius:2px;--display:"Arial Narrow","Roboto Condensed",Impact,sans-serif;
  --voice:"Inter",system-ui,sans-serif;color:var(--ink-1)
}

${T} #desk :is(.card,.court-wrap,.music-wrap,.space-wrap,.ledger-wrap,.riad-wrap,#x-feed){
  background:var(--gta-panel);border:1px solid var(--gta-line-soft);border-left:3px solid var(--gta-amber);
  border-radius:2px;box-shadow:0 5px 18px rgba(0,0,0,.34);backdrop-filter:none;-webkit-backdrop-filter:none;
  color:var(--ink-1);rotate:0deg;--lean:0deg;--chaos-radius:2px
}

${T} #desk .card{padding:.78em .95em .82em;max-height:32dvh}

${T} #desk .meta{display:flex;width:max-content;max-width:100%;align-items:center;gap:.55em;
  margin:0 0 .5em;padding:0 0 .38em;border-radius:0;background:transparent;color:var(--gta-amber);
  border-bottom:1px solid var(--gta-line-soft);font:700 .56em/1.1 var(--mono);letter-spacing:.15em}

${T} #desk .meta>span:first-child{color:var(--gta-amber)}

${T} #desk .meta::after{width:.38em;height:.38em;background:var(--gta-green);margin-left:.15em}

${T} #desk .chip{background:transparent;color:var(--gta-amber);border:1px solid currentColor;border-radius:2px}

${T} #desk .conf-confirmed .chip{background:var(--gta-green);border-color:var(--gta-green);color:#10140d}

${T} #desk .conf-disputed .chip{background:var(--gta-red);border-color:var(--gta-red);color:#160b0a}

${T} #desk .headline{font:700 clamp(1em,1.35vw,1.35em)/1.1 var(--display);letter-spacing:.015em;text-transform:uppercase;color:#fff}

${T} #desk .summary{font-size:.78em;line-height:1.38;color:#c6cbcb}

${T} #desk .source{font:600 .55em/1.2 var(--mono);letter-spacing:.08em;color:#929a9e}

${T} #desk .ask{margin:.72em 0 0;padding:.52em 0 0;border-top:1px solid var(--gta-line);
  font:600 .86em/1.3 var(--brand);color:var(--gta-amber)}

${T} #desk .ask::before{position:static;display:block;margin-bottom:.28em;content:"YOUR MOVE";
  font:700 .58em/1 var(--mono);letter-spacing:.15em;color:var(--gta-green)}

${T} #desk .opt{border:1px solid var(--gta-line-soft);border-radius:2px;background:rgba(255,255,255,.035);color:#eff0ec}

${T} #desk .opt .fill{background:rgba(232,189,72,.38)}

${T} #desk .opt.lead{border-color:var(--gta-amber);background:rgba(232,189,72,.08)}

${T} #desk .opt.lead .pct{color:var(--gta-amber)}

${T} #desk .opt.lead .fill{background:rgba(232,189,72,.58)}

${T} #desk .poll-state{font:600 .58em/1.2 var(--mono);letter-spacing:.12em;color:#90999d}

${T} #desk :is(.court-question,.music-current,.space-title,.ledger-title,.riad-title){
  font:700 1.05em/1.14 var(--display);letter-spacing:.04em;text-transform:uppercase;color:#fff}

${T} #desk :is(.court-viewpoint,.court-vote,.music-track){border:1px solid var(--gta-line-soft);border-radius:2px;background:rgba(255,255,255,.035)}

${T} #desk .court-viewpoint .v-label,${T} #desk .ledger-type{color:var(--gta-amber)}

${T} #desk .court-verdict.w{color:var(--gta-green)}

${T} #desk .court-verdict.l{color:var(--gta-red)}

${T} #desk .music-track.current{border-color:var(--gta-green);background:rgba(155,196,91,.08)}

${T} #desk .space-url{color:var(--gta-blue)}

${T} #desk .riad-wrap{border-color:var(--gta-amber)}

${T} #desk .riad-title{color:var(--gta-amber)}

${T} #desk #crid-live{border:1px solid var(--gta-line);border-left:3px solid var(--gta-green);
  border-radius:2px;background:var(--gta-panel);box-shadow:0 5px 18px rgba(0,0,0,.34);backdrop-filter:none}

${T} #desk .crid-logo{border:1px solid var(--gta-line);border-radius:2px;background:#080b0e}

${T} #desk .crid-brand,${T} #desk .crid-title{font-family:var(--display);font-weight:700;letter-spacing:.04em}

${T} #desk .crid-brand{color:var(--gta-green)}

${T} #desk .crid-kind{border:1px solid var(--gta-line-soft);border-radius:2px;background:transparent}

${T} #desk .crid-v-1{background:var(--gta-green);color:#10140d}

${T} #desk .crid-v-0{color:var(--gta-red);border:1px solid var(--gta-red);border-radius:2px}

${T} #desk #desk-logo{
  --t-logo-shell:var(--gta-amber);--t-logo-plate:#0a0e12;--t-logo-screen:#05070a;
  --t-logo-edge:#313a3e;--t-logo-eye:var(--gta-green);--t-logo-rule:var(--gta-amber);
  --t-logo-gesture:var(--gta-amber);--t-logo-1:#f1f1eb;--t-logo-2:var(--gta-amber);
  --t-logo-bone:#d7dedc
}

${T} #desk #dock-right>#location-readout{
  border:1px solid var(--gta-line-soft);border-right:3px solid var(--gta-amber);
  border-radius:2px;background:var(--gta-panel);box-shadow:0 5px 18px rgba(0,0,0,.34)}

${T} #desk #location-readout .loc-place{color:var(--gta-amber);font:700 .66em/1.2 var(--mono);letter-spacing:.1em}

${T} #desk #location-readout .loc-fix{font-size:.62em;color:#c5cbca}

${T} #desk #loc-map{border:1px solid var(--gta-line);border-left:3px solid var(--gta-green);
  border-radius:2px;background:rgba(7,10,13,.84);box-shadow:0 6px 20px rgba(0,0,0,.4)}

${T} #desk #loc-map .map-top{font:700 .62em/1.1 var(--mono);letter-spacing:.14em}

${T} #desk #loc-map .map-name{color:var(--gta-green)}

${T} #desk #loc-map .map-place{color:#f1f2ed}

${T} #desk #loc-map .map-canvas{border:1px solid rgba(255,255,255,.2);border-radius:0}

${T} #desk #loc-map .loc-marker::before{left:-5px;top:-10px;border:0;
  border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:10px solid var(--gta-amber);
  filter:drop-shadow(0 1px 2px #000)}

${T} #desk #loc-map .loc-marker::after{display:none}

${T} #desk #loc-map .map-readout,${T} #desk #loc-map .loc-status{font:600 .52em/1.3 var(--mono);letter-spacing:.06em}

${T} #desk #loc-map .loc-status{color:var(--gta-green)}

${T} #desk #auto-headlines,${T} #desk #swae-chat{
  border:1px solid var(--gta-line);border-left:3px solid var(--gta-amber);border-radius:2px;
  background:var(--gta-panel);box-shadow:0 5px 18px rgba(0,0,0,.34);backdrop-filter:none}

${T} #desk .headline-feed-kicker{font:700 .6em/1.2 var(--mono);letter-spacing:.12em;color:var(--gta-amber)}

${T} #desk .identity-row .headline-feed-title{font-family:var(--brand);font-size:.78em;color:#f0f1ed}

${T} #desk .identity-row .headline-feed-meta{font:500 .54em/1.2 var(--mono);color:#929b9e}

${T} #desk #swae-chat .swae-chat-user{color:var(--gta-amber)}

${T} #desk #swae-chat .swae-chat-text{color:#f0f1ed}

${T} #desk #music-plate .music-wrap{max-height:28dvh}


html.swae ${T} #desk :is(.card,.court-wrap,.music-wrap,.space-wrap,.ledger-wrap,.riad-wrap,#x-feed,#crid-live,#loc-map,#auto-headlines){
  backdrop-filter:none!important;-webkit-backdrop-filter:none!important
}

@media(max-width:520px){
  ${T} #desk .card{padding:.65em .78em}
  ${T} #desk #loc-map .map-readout{font-size:8px}
}

`;
