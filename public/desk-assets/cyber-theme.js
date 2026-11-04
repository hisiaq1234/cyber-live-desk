const T='html[data-theme="cyber"]',PANEL=".card,.court-wrap,.music-wrap,.space-wrap,.ledger-wrap,.riad-wrap,#x-jumbotron";export const CYBER_CSS=`
@font-face{font-family:"Anton";src:url(/desk-assets/fonts/anton-latin-400-normal.woff2) format("woff2");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"Instrument Serif";src:url(/desk-assets/fonts/instrument-serif-latin-400-italic.woff2) format("woff2");font-weight:400;font-style:italic;font-display:swap}

/* ============================================================ 1. TOKENS */
${T} #desk{
  /* palette */
  --onyx-950:#0F0B17;--onyx-900:#161025;--onyx-800:#1F1736;--onyx-700:#2A2049;
  --indigo-500:#6531F8;--indigo-700:#3A1D9E;--indigo-300:#A98BFF;--indigo-100:#E4DBFF;
  --mint:#86F6BC;--mint-dim:#4FBF8C;
  --ink-1:#F4F0FF;--ink-2:#C4BBE0;--ink-3:#9A90B8;--danger:#FF5B57;
  --accent:var(--mint);--ink:var(--ink-1);

  /* type */
  --display:"Anton","Arial Narrow",Impact,"Haettenschweiler",sans-serif;
  --voice:"Instrument Serif","Iowan Old Style",Georgia,serif;
  --ui:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Helvetica Neue",Arial,sans-serif;
  --mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;

  /* optical scale — em-based so the whole desk scales from one root size */
  --t-hero:2.05em;--t-title:1.42em;--t-lead:1.16em;--t-body:1em;--t-small:.86em;
  --t-caption:.72em;--t-micro:.62em;
  --lh-hero:.98;--lh-title:1.06;--lh-body:1.45;
  --tr-hero:-.012em;--tr-title:-.006em;--tr-body:0em;--tr-caps:.13em;

  /* material */
  --mat-1:color-mix(in oklab,var(--onyx-900) 78%,transparent);
  --mat-2:color-mix(in oklab,var(--onyx-900) 88%,transparent);
  --mat-3:color-mix(in oklab,var(--onyx-950) 94%,transparent);
  --hairline:color-mix(in oklab,var(--indigo-300) 20%,transparent);
  --hairline-strong:color-mix(in oklab,var(--indigo-500) 55%,transparent);
  --sheen:inset 0 1px 0 color-mix(in oklab,#fff 11%,transparent);
  --sheen-soft:inset 0 1px 0 color-mix(in oklab,#fff 7%,transparent);
  --blur:blur(28px) saturate(1.6);
  --blur-light:blur(18px) saturate(1.4);

  /* elevation — contact + key + ambient, never a single blur */
  --e1:0 1px 2px rgba(0,0,0,.30),0 4px 10px -2px rgba(0,0,0,.34);
  --e2:0 2px 4px rgba(0,0,0,.32),0 10px 24px -6px rgba(0,0,0,.44),0 22px 44px -18px rgba(0,0,0,.50);
  --e3:0 4px 8px rgba(0,0,0,.34),0 18px 40px -10px rgba(0,0,0,.48),0 40px 80px -28px rgba(0,0,0,.56);
  --e4:0 6px 12px rgba(0,0,0,.36),0 28px 60px -14px rgba(0,0,0,.52),0 60px 120px -40px rgba(0,0,0,.60);
  --glow-indigo:0 0 0 1px color-mix(in oklab,var(--indigo-500) 26%,transparent),0 8px 40px -12px color-mix(in oklab,var(--indigo-500) 55%,transparent);
  --glow-mint:0 0 0 1px color-mix(in oklab,var(--mint) 34%,transparent),0 0 28px -6px color-mix(in oklab,var(--mint) 42%,transparent);

  /* motion */
  --spring:cubic-bezier(.34,1.42,.5,1);
  --spring-soft:cubic-bezier(.32,1.12,.44,1);
  --ease-out:cubic-bezier(.22,1,.36,1);
  --ease-in:cubic-bezier(.4,0,1,1);
  --dur-1:180ms;--dur-2:280ms;--dur-3:420ms;--dur-4:620ms;

  /* geometry */
  --r-sm:.7em;--r-md:1.05em;--r-lg:1.5em;--r-xl:1.9em;--r-pill:99px;
  --pad-x:1.35em;--pad-y:1.15em;

  color:var(--ink-1);
  font-family:var(--ui);
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
  text-rendering:optimizeLegibility;font-synthesis:none;
  font-variant-numeric:tabular-nums;
}

/* ============================================================ 2. PANELS */
/* The material recipe, in one place: translucent onyx, backdrop blur, hairline indigo border,
   inner top sheen, and a three-part shadow. Every panel inherits it; components only add
   their own padding and internal rhythm. */
${T} #desk :is(${PANEL}){
  position:relative;
  background:var(--mat-1);
  -webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);
  border:1px solid var(--hairline);
  border-radius:var(--r-lg);
  box-shadow:var(--e2),var(--sheen);
  color:var(--ink-1);
  isolation:isolate;
}
/* a very soft indigo bloom under each panel, so it sits in the scene instead of on it */
${T} #desk :is(${PANEL})::after{
  content:"";position:absolute;inset:-1px;border-radius:inherit;pointer-events:none;z-index:-1;
  box-shadow:0 0 0 1px color-mix(in oklab,var(--indigo-500) 14%,transparent),
             0 10px 44px -16px color-mix(in oklab,var(--indigo-500) 62%,transparent);
  opacity:.9;
}
${T} #desk .card{padding:var(--pad-y) var(--pad-x) calc(var(--pad-y) + .05em)}

/* ============================================================ 3. TYPE */
${T} #desk .headline{
  margin:0;font-family:var(--display);font-weight:400;
  font-size:var(--t-hero);line-height:var(--lh-hero);letter-spacing:var(--tr-hero);
  text-transform:uppercase;color:var(--ink-1);
  text-wrap:balance;
}
${T} #desk .summary{
  margin:.62em 0 0;font-family:var(--ui);font-weight:450;
  font-size:var(--t-body);line-height:var(--lh-body);letter-spacing:var(--tr-body);
  color:var(--ink-2);text-wrap:pretty;
}
${T} #desk .source{
  margin:.7em 0 0;font-family:var(--mono);font-size:var(--t-micro);font-weight:500;
  color:var(--ink-3);letter-spacing:.09em;text-transform:uppercase;
}

/* label pill: category on indigo, confidence nested inside it */
${T} #desk .meta{
  display:inline-flex;align-items:center;gap:.55em;margin:0 0 .8em;
  padding:.24em .26em .24em .95em;border-radius:var(--r-pill);
  background:linear-gradient(180deg,color-mix(in oklab,var(--indigo-500) 96%,#fff 4%),var(--indigo-500));
  color:var(--ink-1);box-shadow:var(--e1),inset 0 1px 0 color-mix(in oklab,#fff 22%,transparent);
  font-family:var(--ui);font-size:var(--t-micro);font-weight:800;
  letter-spacing:var(--tr-caps);text-transform:uppercase;
}
${T} #desk .meta>span:first-child{color:var(--ink-1)}
${T} #desk .chip{
  border:0;border-radius:var(--r-pill);padding:.2em .8em;
  background:var(--onyx-950);color:var(--mint);
  font-family:var(--ui);font-size:1em;font-weight:800;letter-spacing:.1em;
  box-shadow:inset 0 1px 0 color-mix(in oklab,#fff 8%,transparent);
}
${T} #desk .conf-confirmed .chip{background:var(--mint);color:var(--onyx-950);box-shadow:var(--glow-mint)}
${T} #desk .conf-disputed .chip{background:var(--danger);color:var(--onyx-950)}
${T} #desk .conf-unverified .chip{background:transparent;color:var(--ink-2);box-shadow:inset 0 0 0 1px var(--ink-3)}
${T} #desk .conf-test .chip{background:transparent;color:var(--ink-3);box-shadow:inset 0 0 0 1px var(--ink-3)}

/* the question to chat is the 10%: mint, in the serif voice */
${T} #desk .ask{
  position:relative;margin:1.15em 0 0;padding:1.9em 0 0;
  background:none;border:0;border-top:1px solid color-mix(in oklab,var(--indigo-700) 80%,transparent);
  font-family:var(--voice);font-style:italic;font-weight:400;
  font-size:var(--t-lead);line-height:1.16;text-transform:none;letter-spacing:0;
  color:var(--mint);text-wrap:pretty;
}
${T} #desk .ask::before{
  content:"ASK CHAT";position:absolute;top:.72em;left:0;
  font:400 var(--t-micro)/1 var(--display);font-style:normal;
  letter-spacing:.22em;color:var(--indigo-300);
}

/* ============================================================ 4. POLL */
${T} #desk .poll{margin:.95em 0 .25em;display:grid;gap:.5em}
${T} #desk .opt{
  position:relative;overflow:hidden;border-radius:var(--r-md);
  background:color-mix(in oklab,var(--onyx-800) 88%,transparent);
  border:1px solid color-mix(in oklab,var(--indigo-700) 70%,transparent);
  padding:.62em .85em;font-family:var(--ui);font-weight:650;font-size:var(--t-small);
  color:var(--ink-1);box-shadow:var(--sheen-soft);
  transition:border-color var(--dur-2) var(--ease-out),box-shadow var(--dur-2) var(--ease-out),
             background-color var(--dur-2) var(--ease-out);
}
${T} #desk .opt .fill{
  position:absolute;inset:0 auto 0 0;width:100%;transform:scaleX(0);transform-origin:left center;
  background:linear-gradient(90deg,color-mix(in oklab,var(--indigo-500) 88%,transparent),color-mix(in oklab,var(--indigo-300) 62%,transparent));
  opacity:1;border-radius:inherit;
  transition:transform var(--dur-4) var(--spring-soft);
}
${T} #desk .opt .row{position:relative;display:flex;justify-content:space-between;gap:.7em;align-items:baseline}
${T} #desk .opt .label{position:relative;z-index:1}
${T} #desk .opt .pct{
  position:relative;z-index:1;font-family:var(--display);font-weight:400;
  letter-spacing:.03em;font-size:1.18em;color:var(--ink-1);
}
${T} #desk .opt.lead{
  border-color:color-mix(in oklab,var(--mint) 70%,transparent);
  background:color-mix(in oklab,var(--onyx-800) 92%,transparent);
  box-shadow:var(--glow-mint),var(--sheen-soft);
}
${T} #desk .opt.lead .pct{color:var(--mint)}
${T} #desk .poll-state{
  margin:.15em 0 0;font-family:var(--mono);font-size:var(--t-micro);font-weight:500;
  color:var(--ink-3);letter-spacing:.13em;text-transform:uppercase;
}

/* ============================================================ 5. CRID BUG */
${T} #desk #crid-jumbotron{
  background:var(--mat-2);
  -webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);
  border:1px solid var(--hairline-strong);
  box-shadow:var(--e3),var(--sheen),var(--glow-indigo);
}
${T} #desk .crid-logo{
  background:var(--onyx-950);border:1px solid var(--hairline-strong);
  box-shadow:inset 0 1px 0 color-mix(in oklab,#fff 10%,transparent),var(--e1);
}
${T} #desk .crid-brand{
  color:var(--mint);font-family:var(--display);font-weight:400;
  font-size:1.28em;letter-spacing:.15em;
}
${T} #desk .crid-kind{
  background:linear-gradient(180deg,color-mix(in oklab,var(--indigo-500) 96%,#fff 4%),var(--indigo-500));
  color:var(--ink-1);border-radius:var(--r-pill);
  box-shadow:inset 0 1px 0 color-mix(in oklab,#fff 20%,transparent);
}
${T} #desk .crid-title{
  font-family:var(--display);font-weight:400;font-size:1.3em;
  letter-spacing:.015em;text-transform:uppercase;color:var(--ink-1);
}
${T} #desk .crid-v-1{background:var(--mint);color:var(--onyx-950);box-shadow:var(--glow-mint)}
${T} #desk .crid-v-0{background:transparent;color:var(--danger);border:1px solid var(--danger)}
${T} #desk .crid-v-none{color:var(--ink-3)}

/* ============================================================ 6. DOCK MODULES */
${T} #desk .court-question,${T} #desk .music-current,${T} #desk .space-title,
${T} #desk .ledger-title,${T} #desk .riad-title{
  font-family:var(--display);font-weight:400;letter-spacing:.015em;
  text-transform:uppercase;color:var(--ink-1);line-height:var(--lh-title);
}
${T} #desk .court-question{font-size:var(--t-title);margin:0 0 .7em;text-wrap:balance}
${T} #desk .court-viewpoint,${T} #desk .court-vote,${T} #desk .music-track{
  background:color-mix(in oklab,var(--onyx-800) 82%,transparent);
  border:1px solid color-mix(in oklab,var(--indigo-700) 62%,transparent);
  border-radius:var(--r-md);box-shadow:var(--sheen-soft);
}
${T} #desk .court-viewpoint .v-label{color:var(--indigo-300)}
${T} #desk .court-verdict.w{color:var(--mint);text-shadow:0 0 18px color-mix(in oklab,var(--mint) 45%,transparent)}
${T} #desk .court-verdict.l{color:var(--danger)}
${T} #desk .court-verdict.open{color:var(--indigo-300)}
${T} #desk .music-track.current{
  border-color:color-mix(in oklab,var(--mint) 62%,transparent);
  background:color-mix(in oklab,var(--onyx-800) 90%,transparent);
  box-shadow:var(--glow-mint),var(--sheen-soft);
}
${T} #desk .music-artist,${T} #desk .space-host,${T} #desk .ledger-entry{color:var(--ink-2)}
${T} #desk .music-queue,${T} #desk .space-topic{color:var(--ink-3)}
${T} #desk .ledger-type{color:var(--mint)}
${T} #desk .space-url{color:var(--indigo-300)}
${T} #desk .riad-wrap{
  border-color:color-mix(in oklab,var(--mint) 55%,transparent);
  box-shadow:var(--e2),var(--sheen),var(--glow-mint);
}
${T} #desk .riad-title{color:var(--mint)}
${T} #desk .x-brand{
  background:linear-gradient(180deg,color-mix(in oklab,var(--mint) 96%,#fff 4%),var(--mint));
  color:var(--onyx-950);border-radius:var(--r-pill);
  box-shadow:inset 0 1px 0 color-mix(in oklab,#fff 40%,transparent);
}
${T} #desk .x-kind{
  background:linear-gradient(180deg,color-mix(in oklab,var(--indigo-500) 96%,#fff 4%),var(--indigo-500));
  border:0;color:var(--ink-1);border-radius:var(--r-pill);
  box-shadow:inset 0 1px 0 color-mix(in oklab,#fff 20%,transparent);
}
${T} #desk .x-item .x-author,${T} #desk .x-item .x-bullet{color:var(--mint)}
${T} #desk .x-item .x-text{color:var(--ink-2)}

/* ============================================================ 7. PLATES */
/* lower third, clock and chat share one plate recipe: material, a 3px accent edge, and a
   slightly tighter radius than the panels so they read as instruments, not cards. */
${T} #auto-headlines,${T} #time-dock,${T} #swae-chat{
  background:var(--mat-2);
  -webkit-backdrop-filter:var(--blur-light);backdrop-filter:var(--blur-light);
  border:1px solid var(--hairline);
  border-left:3px solid var(--indigo-500);
  border-radius:var(--r-md);
  box-shadow:var(--e2),var(--sheen);
}
${T} .headline-feed-kicker{
  font-family:var(--display);font-weight:400;letter-spacing:.17em;color:var(--indigo-300);
}
${T} .identity-row .headline-feed-title{font-family:var(--ui);font-weight:700;color:var(--ink-1)}
${T} .identity-row .headline-feed-meta{color:var(--ink-3)}
${T} .identity-music{border-bottom-color:color-mix(in oklab,var(--indigo-700) 70%,transparent)}
${T} .identity-music .headline-feed-kicker{color:var(--mint)}
${T} #time-dock .clock-brand,${T} #time-dock .clock-zone{color:var(--indigo-300)}
${T} #time-dock .clock-time{
  font-family:var(--display);font-weight:400;letter-spacing:.05em;color:var(--ink-1);
}
${T} #swae-chat .swae-chat-user{color:var(--indigo-300)}
${T} #swae-chat .swae-chat-text{color:var(--ink-1)}

/* ============================================================ 8. MUSIC MODULE */
/* Two states, chosen by the overlay: "player" (a live iframe) and "poster" (title only).
   Poster is the honest state when the iframe cannot render or its audio cannot be captured —
   a black rectangle with a title under it is worse than a designed title card. */
${T} #desk .music-wrap{display:flex;flex-direction:column;gap:.55em;padding:.9em 1em 1em;
  width:100%;box-sizing:border-box;align-self:stretch}
${T} #desk .music-wrap .music-current{margin:0;font-size:var(--t-lead)}
${T} #desk .music-wrap .music-artist{margin:0;font-size:var(--t-small);color:var(--ink-2)}
${T} #desk .music-video{
  display:block;width:100%;aspect-ratio:16/9;height:auto;
  border:1px solid color-mix(in oklab,var(--indigo-700) 60%,transparent);
  border-radius:var(--r-sm);background:var(--onyx-950);
  box-shadow:var(--e1);pointer-events:none;
}
/* poster: a designed title card with the track's initial as a monogram, no dead video box */
${T} #desk .music-wrap[data-mode="poster"] .music-poster{
  display:grid;place-items:center;position:relative;overflow:hidden;
  aspect-ratio:16/9;border-radius:var(--r-sm);
  background:
    radial-gradient(120% 90% at 18% 8%,color-mix(in oklab,var(--indigo-500) 42%,transparent),transparent 62%),
    radial-gradient(90% 80% at 88% 96%,color-mix(in oklab,var(--mint) 20%,transparent),transparent 58%),
    linear-gradient(160deg,var(--onyx-800),var(--onyx-950));
  border:1px solid color-mix(in oklab,var(--indigo-700) 60%,transparent);
  box-shadow:var(--e1),var(--sheen-soft);
}
${T} #desk .music-wrap[data-mode="poster"] .music-poster::before{
  content:"";position:absolute;inset:0;
  background:repeating-linear-gradient(115deg,transparent 0 14px,color-mix(in oklab,#fff 3%,transparent) 14px 15px);
  opacity:.5;
}
${T} #desk .music-monogram{
  position:relative;font-family:var(--display);font-size:2.6em;line-height:1;
  color:color-mix(in oklab,var(--ink-1) 92%,transparent);
  text-shadow:0 2px 24px color-mix(in oklab,var(--indigo-500) 70%,transparent);
  letter-spacing:.02em;
}
${T} #desk .music-poster-note{
  position:absolute;left:.7em;bottom:.55em;
  font-family:var(--mono);font-size:var(--t-micro);letter-spacing:.14em;
  text-transform:uppercase;color:color-mix(in oklab,var(--ink-1) 62%,transparent);
}
${T} #desk .music-wrap[data-mode="player"] .music-poster{display:none}
${T} #desk .music-wrap[data-mode="poster"] .music-video{display:none}
${T} #desk .music-empty{
  margin:.2em 0 0;font-family:var(--mono);font-size:var(--t-micro);
  letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);
}

/* ============================================================ 8b. BRAND LOCKUP */
/* The animated lockup is artwork, not a panel: it must not get the panel
   material, border or shadow. The theme's job here is only to make the
   artwork sit in the palette — a soft indigo bloom behind it so the red
   wordmark does not float on the raw scene, and a mint-tinted fallback if the
   animation cannot load. */
${T} #desk #logo-module{
  filter:drop-shadow(0 6px 26px color-mix(in oklab,var(--indigo-500) 42%,transparent));
}
${T} #desk #logo-module .logo-fallback{
  color:var(--mint);
  font-family:var(--display);
  text-shadow:0 0 24px color-mix(in oklab,var(--mint) 40%,transparent);
}
/* Swae snapshots: a drop-shadow is a per-frame re-render, so drop it. */
html.swae ${T} #desk #logo-module{filter:none}

/* ============================================================ 9. SCENES */
/* PiP: the inset owns the bottom-right. The dock stacks above it and the music module drops to
   a title-only poster, because a 16:9 player plus the court panel cannot both fit in the ~46%
   of height left above the inset. Shrinking beats clipping. */
html[data-scene="pip"] #auto-headlines{
  right:var(--m);bottom:calc(var(--m) + var(--pip-h,34vh));width:var(--pip-w,34vw);
}
html[data-scene="pip"] #dock-right{
  max-height:calc(100dvh - var(--pip-h,34vh) - 2*var(--m) - 5.5em);
}
html[data-scene="pip"] #desk .music-wrap[data-mode="player"] .music-video{
  aspect-ratio:auto;height:min(13dvh,110px);object-fit:cover;
}
html[data-scene="pip"] #desk .music-wrap[data-mode="poster"] .music-poster{
  aspect-ratio:auto;height:min(11dvh,92px);
}
html[data-scene="pip"] #desk .music-monogram{font-size:1.7em}
html[data-scene="pip"] #desk .court-question{font-size:var(--t-lead)}
html[data-scene="pip"] #desk .court-viewpoint .v-text{
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;
}

/* ============================================================ 10. SNAPSHOT / REDUCED MOTION */
/* Swae composites one screenshot per frame instead of showing the page live. A backdrop-filter
   costs a full re-render per snapshot, and a tween gets sampled mid-flight into a half-drawn
   frame. So: same palette and hierarchy, drawn with solid scrims, and every state change lands
   instantly and completely. This is a *rendering* concession, not a design one — the layout,
   type and depth are identical. */
html.swae #desk :is(${PANEL}),
html.swae #desk #auto-headlines,html.swae #desk #time-dock,html.swae #desk #swae-chat{
  -webkit-backdrop-filter:none!important;backdrop-filter:none!important;
  background:color-mix(in oklab,var(--onyx-900) 96%,transparent);
}
html.swae #desk :is(${PANEL})::after{opacity:.55}
html.swae #desk *{transition:none!important;animation:none!important}
html.swae #desk .opt .fill{transition:none!important}

@media (prefers-reduced-motion:reduce){
  ${T} #desk *{transition-duration:1ms!important;animation-duration:1ms!important;animation-iteration-count:1!important}
  ${T} #desk .opt .fill{transition:none!important}
}
`;
