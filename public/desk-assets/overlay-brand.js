/* public/desk-assets/overlay-brand.js - Brand presentation over the main desk renderer.
 *
 * This variant loads instead of overlay.js when ?overlay=brand|variant=brand|brand=1.
 * It must NOT be a separate reduced-functionality overlay: it shares the main renderer and its
 * modules, changing presentation only. The main overlay (overlay.js) owns state polling, 204
 * handling, desk-content rendering and CRID â€” this file loads it, mounts CRID, and applies a
 * brand skin on top of the same DOM/output.
 *
 * State/CRID: poll the real public desk-state endpoint (/api/desk/state, same response shape as
 * the main overlay: { ...publicProjection, card, serverNow, version }). 204 means "unchanged"
 * and must not be treated as an error or blank the view. The fetched state is passed to CRID so
 * he reacts to the same desk content the main renderer shows.
 */
import { createCridBot, CUE_NAMES } from "./crid-bot.js";
import { createCueReader } from "./cue.mjs";

(function () {
  "use strict";

  const STYLES = `
    :root { --red: #FF2D2D; --ink: #07070A; --white: #FFFFFF; --font-heavy: "Arial Black", Arial, sans-serif; }
    /* Brand presentation: skin the main renderer's surfaces without duplicating its modules. */
    html,body{background:transparent!important}
    #desk{font-family:var(--font-heavy)!important}
    #desk .card,#desk #crid-live,#desk .mod,#desk #x-feed,#desk .court-wrap,#desk .music-wrap,
    #desk .space-wrap,#desk .ledger-wrap,#desk .riad-wrap,#desk .letters{
      background:var(--ink)!important;border:3px solid var(--red)!important;border-radius:2px!important;
      box-shadow:0 0 24px rgba(255,45,45,.35)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    #desk .headline,#desk .summary,#desk .source,#desk .meta{color:var(--white)!important;font-style:italic;font-weight:900}
    #desk .chip,#desk .crid-brand,#desk .x-brand{background:var(--red)!important;color:var(--ink)!important;border-color:var(--red)!important}
    #crid-bot,#crid-bot *{font-style:normal;font-weight:normal;letter-spacing:normal;text-transform:none}
  `;

  function injectStyles() {
    if (document.getElementById("crid-overlay-styles")) return;
    const styleEl = document.createElement("style");
    styleEl.id = "crid-overlay-styles";
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  const P = new URLSearchParams(location.search);
  const num = (k, d, lo, hi) => { const v = parseFloat(P.get(k)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  const opts = {
    pollMs: Math.max(1000, (parseInt(P.get("poll") || "5", 10) || 5) * 1000),
  };

  // CRID lives on document.body (outside any transformed/skewed brand container).
  function mountBot() {
    if (P.get("bot") === "0") return null;
    try {
      const posArg = P.get("bot");
      const placed = P.get("bot.x") != null || P.get("bot.y") != null;
      return createCridBot({
        root: document.body,
        position: ["bl", "bc", "br"].includes(posArg) ? posArg : "bc",
        x: placed ? num("bot.x", 50, 0, 100) : null,
        y: placed ? num("bot.y", 88, 0, 100) : null,
        scale: num("bot.scale", 1, 0.4, 2.5),
      });
    } catch (err) {
      if (P.get("debug") === "1" || P.get("debug") === "true") console.error("[DeskOverlay brand] CRID mount failed:", err);
      return null;
    }
  }

  // Poll the real public desk-state endpoint and pass state to CRID. Mirrors the main overlay's
  // contract: GET /api/desk/state?since=<version>; 200 -> JSON desk state, 204 -> unchanged.
  // (Never the X feed endpoint â€” /api/x/feed is a different surface.)
  function startStateFeed(bot) {
    let version = -1;
    let failures = 0;
    const cues = createCueReader({ known: (name) => CUE_NAMES.includes(name) });
    const tick = async () => {
      let delay = opts.pollMs;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      try {
        const r = await fetch(`/api/desk/state?since=${version}`, { cache: "no-store", signal: controller.signal });
        if (r.ok && r.status !== 204) {
          const s = await r.json();
          if (s && typeof s === "object") {
            version = typeof s.version === "number" ? s.version : version;
            bot?.observe(s);
            const cue = cues.read(s.bot);
            if (cue && bot) bot.cue(cue.name, { text: cue.text });
          }
        } else if (!r.ok && r.status !== 204) {
          throw new Error("HTTP " + r.status);
        } // 204: unchanged â€” keep current content/state, do not clear.
        failures = 0;
        bot?.setOnline?.(true);
      } catch {
        failures++;
        bot?.setOnline?.(false);
        delay = Math.min(15000, opts.pollMs * 2 ** Math.min(failures, 4));
      } finally {
        clearTimeout(timeoutId);
        setTimeout(tick, delay);
      }
    };
    tick();
  }

  async function boot() {
    injectStyles();
    // Share the main renderer and its modules (presentation change only, not a duplicate overlay).
    // overlay.js bootstraps on load; once it has, it owns rendering. This layer adds CRID + brand skin.
    try { await import("./overlay.js"); } catch (err) {
      if (P.get("debug") === "1" || P.get("debug") === "true") console.error("[DeskOverlay brand] main renderer failed:", err);
    }
    const bot = mountBot();
    startStateFeed(bot);
    window.DeskOverlay = { ...(window.DeskOverlay || {}), brand: true, bot };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

