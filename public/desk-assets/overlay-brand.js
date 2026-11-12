/* public/desk-assets/overlay-brand.js - Brand presentation over the main desk renderer.
 *
 * This variant loads instead of overlay.js when ?overlay=brand|variant=brand|brand=1.
 * It must NOT be a separate reduced-functionality overlay: it shares the main renderer and its
 * modules, changing presentation only. The main overlay (overlay.js) owns state polling, 204
 * handling, desk-content rendering, the cue reader and CRID — this file loads it and applies a
 * brand skin on top of the same DOM/output. It must never mount a CRID of its own: doing that
 * gave /desk?overlay=brand two characters and two #crid-bot ids (see docs/CRID-STATUS.md).
 */

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

  async function boot() {
    injectStyles();
    // Share the main renderer and its modules (presentation change only, not a duplicate overlay).
    // overlay.js bootstraps on load and owns rendering, CRID, the desk-state poll and the cue
    // reader. This layer adds the brand skin and nothing else: mounting a second CRID here put two
    // #crid-bot hosts on the page (duplicate DOM id, two characters, two cue readers), so brand
    // mode adopts the one CRID the main renderer made.
    try { await import("./overlay.js"); } catch (err) {
      if (P.get("debug") === "1" || P.get("debug") === "true") console.error("[DeskOverlay brand] main renderer failed:", err);
    }
    const bot = window.DeskOverlay?.crid || null;
    window.DeskOverlay = { ...(window.DeskOverlay || {}), brand: true, bot };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

