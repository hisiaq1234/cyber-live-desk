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
.slot{position:absolute;display:grid;width:min(calc(100vw - 2*var(--m)),42em)}
.slot>*{grid-area:1/1;justify-self:center}
.slot::before{content:"";grid-area:1/1;align-self:end;pointer-events:none;opacity:0;
  border:.10em solid var(--accent);box-shadow:0 0 20px var(--accent-glow);
  transition:opacity .35s ease}
.slot:not(:empty)::before{opacity:1}
.pos-top-left .slot::before,.pos-top-right .slot::before{align-self:start}
.pos-bottom-left .slot{left:var(--m);bottom:calc(var(--m) + env(safe-area-inset-bottom,0px))}
.pos-bottom-right .slot{right:var(--m);bottom:calc(var(--m) + env(safe-area-inset-bottom,0px))}
.pos-top-left .slot{left:var(--m);top:calc(var(--m) + env(safe-area-inset-top,0px))}
.pos-top-right .slot{right:var(--m);top:calc(var(--m) + env(safe-area-inset-top,0px))}
@media (min-aspect-ratio:1/1){
  .slot{width:min(calc(100vw - 2*var(--m)),56em)}
  .card{padding:1.3em 1.6em 1.2em;border-radius:1.6em}
  .headline{font-size:1.5em}
  .summary{font-size:1.15em}
  #crid-jumbotron{width:min(calc(100vw - 2*var(--m)),60em);padding:1.1em 1.5em;border-radius:1.8em}
  .crid-title{font-size:1.2em}
}

.card{box-sizing:border-box;align-self:end;position:relative;
  background:var(--glass);backdrop-filter:blur(18px) saturate(1.14);
  -webkit-backdrop-filter:blur(18px) saturate(1.14);
  border:1px solid var(--surface-line);border-radius:19px;
  padding:13px 14px 12px;opacity:0;transform:translateY(11px) scale(.985);
  width:100%;max-height:34dvh;
  box-shadow:0 10px 30px #00000045,inset 0 1px #ffffff14;
  transition:opacity .24s cubic-bezier(.2,.8,.2,1),transform .24s cubic-bezier(.2,.8,.2,1),filter .24s ease}
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

/* ---------- CRID Jumbotron — alive, breathing, not just static ---------- */
.crid-pos-top #crid-jumbotron{top:calc(var(--m) + env(safe-area-inset-top,0px));bottom:auto}
.crid-pos-bottom #crid-jumbotron{bottom:calc(var(--m) + env(safe-area-inset-bottom,0px));top:auto}
#crid-jumbotron{position:absolute;left:50%;transform:translate(-50%,-14px);
  width:min(calc(100vw - 2*var(--m)),46em);max-width:96vw;box-sizing:border-box;pointer-events:none;z-index:10;
  background:#111214f0;backdrop-filter:blur(16px) saturate(180%);
  -webkit-backdrop-filter:blur(16px) saturate(180%);
  border:.10em solid var(--surface-line);border-radius:1.4em;padding:.85em 1.1em;
  box-shadow:0 24px 48px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.1);
  opacity:0;transform:translate(-50%,-14px) scale(.97);
  transition:opacity .5s cubic-bezier(.16,1,.3,1),
              transform .5s cubic-bezier(.16,1,.3,1),
              filter .5s ease}
.crid-pos-bottom #crid-jumbotron{transform:translate(-50%,14px) scale(.97)}
#crid-jumbotron.in{opacity:1;transform:translate(-50%,0) scale(1)}
#crid-jumbotron.out{opacity:0;transform:translate(-50%,-14px) scale(.97)}
.crid-pos-bottom #crid-jumbotron.out{transform:translate(-50%,14px) scale(.97)}
.crid-head{display:flex;align-items:center;justify-content:space-between;gap:.5em;margin-bottom:.45em;
  font-size:.66em;font-weight:700;font-family:var(--brand);
  text-transform:uppercase;letter-spacing:.07em}
.crid-tag-wrap{display:flex;align-items:center;gap:.4em;flex-wrap:wrap}
.crid-brand{background:var(--accent);color:#111214;padding:.18em .65em;border-radius:.9em;font-weight:700;
  animation:brand-glow 3s ease-in-out infinite alternate}
.crid-kind{background:rgba(255,255,255,.08);color:#f3f2f0;border:.09em solid rgba(255,255,255,.25);
  padding:.18em .6em;border-radius:.9em;text-transform:uppercase;font-weight:700}
.crid-stranger{color:#c7c7cc;font-size:.88em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.crid-stranger strong{color:#f3f2f0}
.crid-title{margin:0 0 .5em;font-size:1.05em;font-weight:700;line-height:1.3;
  color:#f3f2f0;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3}
.crid-foot{display:flex;align-items:center;justify-content:space-between;gap:.5em;padding-top:.5em;
  border-top:.08em solid rgba(255,255,255,.16);font-size:.78em;font-weight:700;font-family:var(--brand)}
.crid-verdict{display:inline-flex;align-items:center;gap:.4em;padding:.3em .85em;border-radius:.9em;
  font-weight:700;text-transform:uppercase;letter-spacing:.04em}
/* filled tint = rent paid, outlined = still owing */
.crid-v-1{background:var(--accent);color:#111214;border:.09em solid var(--accent);
  box-shadow:0 0 16px var(--accent-glow)}
.crid-v-0{background:transparent;color:var(--accent);border:.09em solid var(--accent);
  box-shadow:0 0 16px var(--accent-glow)}
.crid-v-none{color:#8E8E93;font-size:.9em;font-weight:600;letter-spacing:.03em}
.crid-tally{color:var(--accent);font-size:.9em;font-weight:700}

/* alive motions on the jumbotron */
@keyframes brand-glow{0%{box-shadow:0 0 0 rgba(255,69,58,.4);filter:brightness(1)}
  100%{box-shadow:0 0 14px rgba(255,69,58,.55);filter:brightness(1.08)}}
@keyframes breathe{0%,100%{transform:translate(-50%,0) scale(1);filter:brightness(1)}
  50%{transform:translate(-50%,-1px) scale(1.006);filter:brightness(1.03)}}
#crid-jumbotron.in{animation:breathe 5s ease-in-out infinite}
@keyframes drift{0%,100%{transform:translate(-50%,0) scale(1)}
  33%{transform:translate(-50%,-2px) scale(1.004)}
  66%{transform:translate(-50%,1px) scale(1.002)}}
.crid-pos-bottom #crid-jumbotron.in{animation:drift 6s ease-in-out infinite}
@keyframes badge-blink{0%,100%{opacity:1}50%{opacity:.45}}
.crid-brand{animation:brand-glow 3s ease-in-out infinite alternate,
                 badge-blink 2s ease-in-out infinite}

@media (prefers-reduced-motion:reduce){
  .card{transform:none;transition:none}
  #crid-jumbotron{transform:translate(-50%,0);transition:none;animation:none}
  .fill{transition:none}
  .dot{animation:none}
  .crid-brand{animation:none}
  .scale-wrap input::-webkit-slider-thumb{animation:none}}
`;

  // ---------- tiny DOM helper (text nodes only: nothing is parsed as HTML) ----------
  const h = (tag, cls, ...kids) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    for (const k of kids.flat()) {
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

  // ---------- mount ----------
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const slot = h("div", "slot");
  const root = h("div", `pos-${CFG.pos} anim-${CFG.anim} crid-pos-${CFG.cridPos}${CFG.debug ? " debug" : ""}`, slot);
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
      return;
    }

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
    ].join("|");

    if (key === cridKey && cridEl) return;

    const brand = h("span", "crid-brand", `CRID #${crid.entry}`);
    const kind = h("span", "crid-kind", crid.kind || "topic");
    const stranger = crid.credit ? h("span", "crid-stranger", "Suggested by ", h("strong", "", crid.credit)) : null;
    const head = h("div", "crid-head", h("div", "crid-tag-wrap", brand, kind), stranger);
    const title = h("div", "crid-title", crid.title);

    let vEl = null;
    if (crid.verdict === 1) {
      vEl = h("span", "crid-verdict crid-v-1", "✔ RENT PAID");
    } else if (crid.verdict === 0) {
      vEl = h("span", "crid-verdict crid-v-0", "✖ STILL OWING");
    } else if (crid.result) {
      vEl = h("span", "crid-tally", crid.result.tie ? "STRANGERS: TIE (50/50)" : `STRANGERS: ${crid.result.winner} (${crid.result.percent}%)`);
    } else {
      vEl = h("span", "crid-v-none", "Live Segment · Awaiting Verdict");
    }

    const foot = h("div", "crid-foot", vEl);

    if (cridEl) {
      cridEl.replaceChildren(head, title, foot);
    } else {
      cridEl = h("div", "", head, title, foot);
      cridEl.id = "crid-jumbotron";
      root.append(cridEl);
      requestAnimationFrame(() => requestAnimationFrame(() => cridEl?.classList.add("in")));
    }
    cridKey = key;
  };

  const render = () => {
    clearTimeout(expiryTimer);
    if (!state) return;
    if (state.mode === "x-following") {
      dropCard();
      setX(state.visible);
      renderCrid(null);
      return;
    }
    setX(false);
    renderCrid(state.crid);
    const poll = state.poll || null;
    const card = state.card || (poll ? { id: "poll-" + poll.id, type: "poll", category: "Live poll", headline: poll.question } : null);
    if (!state.visible || !card) return dropCard();
    if (state.expiresAt && state.expiresAt <= serverNow()) {
      if (!state.autoPlay) return dropCard();
      // The server only moves the card when something reads it, so read now and keep this
      // card on screen for a moment rather than showing a gap between the two.
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
