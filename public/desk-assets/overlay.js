/* CYBER LIVE DESK — public overlay, checkpoint 1.
   Transparent, no dependencies, no build step. Loaded by the /desk page.

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
  };
  const xBaseRaw = P.get("xbase") || "";
  const xBase = /^https:\/\/[a-z0-9.-]+$/i.test(xBaseRaw) ? xBaseRaw : "";
  const xQuery = new URLSearchParams(
    [...P].filter(([k]) => k.startsWith("x.")).map(([k, v]) => [k.slice(2), v])
  ).toString();

  // ---------- styles ----------
  const CSS = `
html,body{margin:0;background:transparent!important;overflow:hidden}
#desk{position:fixed;inset:0;pointer-events:none;color:#F4F7FB;
  font-family:ui-rounded,"SF Pro Rounded",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --m:clamp(10px,3vmin,28px);font-size:calc(var(--scale)*clamp(14px,3.5vmin,24px));line-height:1.25}
.slot{position:absolute;display:grid;width:min(calc(100vw - 2*var(--m)),22em)}
.slot>*{grid-area:1/1}
.pos-bottom-left .slot{left:var(--m);bottom:calc(var(--m) + env(safe-area-inset-bottom,0px))}
.pos-bottom-right .slot{right:var(--m);bottom:calc(var(--m) + env(safe-area-inset-bottom,0px))}
.pos-top-left .slot{left:var(--m);top:calc(var(--m) + env(safe-area-inset-top,0px))}
.pos-top-right .slot{right:var(--m);top:calc(var(--m) + env(safe-area-inset-top,0px))}
@media (min-aspect-ratio:1/1){.slot{width:min(44vw,24em)}}

.card{--c:#9AA7B8;box-sizing:border-box;align-self:end;overflow:hidden;
  background:rgba(15,28,46,.9);border-left:.45em solid var(--c);border-radius:.9em;
  padding:.8em .95em 0;box-shadow:0 .3em 1.2em rgba(0,0,0,.35);opacity:0;
  transition:opacity .28s ease,transform .28s ease}
.pos-top-left .card,.pos-top-right .card{align-self:start}
.anim-slide .card{transform:translateY(.8em)}
.card.in{opacity:1;transform:none}
.card.out{opacity:0}
.anim-none .card{transition:none}

.conf-confirmed{--c:#2ED3A5}.conf-reported{--c:#7CC4FF}
.conf-disputed{--c:#FF7A66}.conf-unverified{--c:#FF7A66}.conf-test{--c:#9AA7B8}

.meta{display:flex;align-items:center;gap:.6em;margin-bottom:.35em;font-size:.78em;font-weight:700;color:#B9C6D8}
.chip{border:.14em solid var(--c);color:var(--c);padding:.02em .6em;border-radius:99em;font-weight:800}
.conf-unverified .chip{border-style:dashed}
.headline{margin:0;font-size:1.28em;font-weight:800;line-height:1.15}
.summary{margin:.45em 0 0;font-size:.95em;font-weight:600;color:#DCE5F0}
.source{margin:.5em 0 0;font-size:.74em;font-weight:600;color:#9FB0C6}
.ask{margin:.75em -.95em 0 -.95em;padding:.6em .95em;background:#FFB224;color:#1A1204;font-weight:800}
.headline,.summary,.ask{overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical}
.headline{-webkit-line-clamp:3}.summary{-webkit-line-clamp:3}.ask{-webkit-line-clamp:2}

.conf-none{--c:#FFB224}
.poll{margin:.7em 0 .15em;display:grid;gap:.45em}
.opt{position:relative;overflow:hidden;border-radius:.5em;background:rgba(255,255,255,.1);padding:.4em .6em;font-weight:800;font-size:.95em}
.opt .fill{position:absolute;inset:0 auto 0 0;width:0;background:var(--c);opacity:.5;transition:width .6s cubic-bezier(.2,.8,.2,1),opacity .3s}
.opt .row{position:relative;display:flex;justify-content:space-between;gap:.6em}
.opt.lead .fill{opacity:.95}
.poll-state{margin:0;font-size:.74em;font-weight:700;color:#9FB0C6}
.anim-none .fill{transition:none}
.xframe{position:fixed;inset:0;width:100%;height:100%;border:0;background:transparent}
.dot{position:fixed;right:6px;top:6px;width:8px;height:8px;border-radius:50%;background:#2ED3A5}
.dot.off{background:#FF7A66}
@media (prefers-reduced-motion:reduce){.card{transition:none;transform:none}.fill{transition:none}}
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
      const pct = h("span", "");
      return { id: o.id, fill, pct, el: h("div", "opt", fill, h("div", "row", h("span", "", o.label), pct)) };
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
  const root = h("div", `pos-${CFG.pos} anim-${CFG.anim}`, slot);
  root.id = "desk";
  root.style.setProperty("--scale", CFG.scale);
  document.body.append(root);

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
  let failures = 0;

  const serverNow = () => Date.now() + clockOffset;

  const render = () => {
    clearTimeout(expiryTimer);
    if (!state) return;
    if (state.mode === "x-following") {
      dropCard();
      setX(state.visible);
      return;
    }
    setX(false);
    const poll = state.poll || null;
    const card = state.card || (poll ? { id: "poll-" + poll.id, type: "poll", category: "Live poll", headline: poll.question } : null);
    const live = state.visible && card && !(state.expiresAt && state.expiresAt <= serverNow());
    if (!live) return dropCard();
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
    setTimeout(tick, delay);
  };

  window.DeskOverlay = { register };
  tick();
})();
