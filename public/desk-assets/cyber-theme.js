/* CYBER LIVE DESK — "Cyber" theme. One system, applied on purpose.

   COLOUR  60 / 30 / 10, taken from the palette cards in the reference
     60  Onyx            #0F0B17 family   every panel surface, the bot's body and face
     30  Electric Indigo #6531F8 family   structure only: panel outlines, label pills, poll bars,
                                          the hard shadow, the bot's shell
     10  Tropical Mint   #86F6BC          the one thing to look at: the chat prompt, live signals,
                                          the poll leader's percentage, "paid", the bot's eyes
     Text is a tinted off-white. Red (#FF5B57) is not a theme colour: it is reserved for
     meaning (disputed, still owing, offline) and stays under ~2% of any frame.
     Contrast on onyx: body 16.5:1, secondary 10.2:1, tertiary 6.2:1, mint 14:1.

   TYPE    Anton (heavy condensed caps) for what you read at a glance: headlines, titles, numbers.
           Instrument Serif italic for the voice: the question put to chat.
           System sans for everything dense. Fonts are self-hosted in /desk-assets/fonts/.

   SHAPE   Big radius, flat fills, one hard offset shadow in deep indigo. No blur and no glow: it
           matches the bot's sticker drawing and is cheap to snapshot on Swae. Panel surfaces stay
           flat; the one gradient is a mint highlight travelling inside the poll leader's bar, which
           reads as motion rather than as a surface. Each panel family leans up to half a degree on
           the individual rotate property and cuts one corner to .42em, so the desk looks placed by
           hand without any panel moving off its anchor.

   SCENES  ?scene=pip reserves the bottom-right dual-camera inset (?pip.w= ?pip.h= in vw/vh,
           default 34 x 34) and stacks the right column above it.                              */

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

/* ---- scene: dual-camera PiP. The inset owns the bottom-right; the right column stacks above it ---- */
html[data-scene="pip"] #auto-headlines{right:var(--m);bottom:calc(var(--m) + var(--pip-h,34vh));width:var(--pip-w,34vw)}
html[data-scene="pip"] #dock-right{max-height:calc(100dvh - var(--pip-h,34vh) - 2*var(--m) - 6em)}

@media (prefers-reduced-motion:reduce){
${T} #desk #crid-bot,${T} #desk #crid-bot svg{animation:none}
${T} #desk :is(${PANEL}){rotate:0deg;transition:none}
${T} #desk .meta::after,${T} #desk .opt.lead .fill::after{animation:none}
}
`;
