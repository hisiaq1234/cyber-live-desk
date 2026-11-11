/* public/desk-assets/overlay-brand.js - Checkpoint-4 Brand Reskin (alternative overlay) */
(function () {
  'use strict';

  // Inject Brand Styles
  const STYLES = `
    :root {
      --red: #FF2D2D;
      --ink: #07070A;
      --white: #FFFFFF;
      --font-heavy: "Arial Black", Arial, sans-serif;
    }

    .crid-overlay-root {
      font-family: var(--font-heavy);
      color: var(--white);
      user-select: none;
      box-sizing: border-box;
      font-style: italic;
      font-weight: 900;
    }

    .crid-skew {
      transform: skewX(-8deg);
      display: inline-block;
    }

    .crid-unskew {
      transform: skewX(8deg);
      display: inline-block;
    }

    .crid-jumbotron {
      background: var(--ink);
      border: 3px solid var(--red);
      box-shadow: 0 0 24px rgba(255, 45, 45, 0.35);
      padding: 16px 24px;
      border-radius: 2px;
      transform: skewX(-8deg);
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 640px;
    }

    .crid-jumbotron-header {
      transform: skewX(8deg);
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 1.1rem;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    .crid-badge {
      background: var(--red);
      color: var(--ink);
      padding: 4px 10px;
      font-size: 0.85rem;
      line-height: 1;
    }

    .crid-title {
      color: var(--red);
    }

    .crid-jumbotron-body {
      transform: skewX(8deg);
      font-size: 1.65rem;
      line-height: 1.25;
      color: var(--white);
      text-shadow: 0 2px 4px rgba(0,0,0,0.8);
      word-break: break-word;
    }

    .crid-hidden {
      display: none !important;
    }
  `;

  function injectStyles() {
    if (document.getElementById('crid-overlay-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'crid-overlay-styles';
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
  }

  // URL Options Parser
  function getOptions() {
    const params = new URLSearchParams(window.location.search);
    const opts = {
      pos: params.get('pos') || 'bottom-left',
      scale: parseFloat(params.get('scale')) || 1.0,
      poll: parseInt(params.get('poll') || '5000', 10),
      anim: params.get('anim') !== 'false',
      debug: params.get('debug') === 'true',
      crid: params.get('crid') || 'default',
      cridpos: params.get('cridpos') || 'top-right',
      xbase: params.get('xbase') || '/api/desk',
      xParams: {}
    };

    for (const [key, value] of params.entries()) {
      if (key.startsWith('x.')) {
        opts.xParams[key.slice(2)] = value;
      }
    }
    return opts;
  }

  class DeskOverlay {
    constructor(options = {}) {
      this.opts = { ...getOptions(), ...options };
      this.timer = null;
      this.data = null;
      this.init();
    }

    init() {
      injectStyles();
      this.renderDOM();
      if (this.opts.poll > 0) {
        this.startPolling();
      }
    }

    renderDOM() {
      let root = document.getElementById('crid-desk-overlay');
      if (!root) {
        root = document.createElement('div');
        root.id = 'crid-desk-overlay';
        root.className = 'crid-overlay-root';
        document.body.appendChild(root);
      }

      root.style.position = 'fixed';
      root.style.transform = `scale(${this.opts.scale})`;
      root.style.transformOrigin = 'bottom left';
      root.style.zIndex = '99999';

      if (this.opts.pos.includes('top')) root.style.top = '24px';
      else root.style.bottom = '24px';
      if (this.opts.pos.includes('right')) root.style.right = '24px';
      else root.style.left = '24px';

      root.innerHTML = `
        <div class="crid-jumbotron">
          <div class="crid-jumbotron-header">
            <span class="crid-skew"><span class="crid-badge">CRID LIVE</span></span>
            <span class="crid-title" id="crid-title">CYBER LIVE DESK</span>
          </div>
          <div class="crid-jumbotron-body" id="crid-content">
            Awaiting live stream desk feed...
          </div>
        </div>
      `;
    }

    async fetchUpdate() {
      try {
        const queryParams = new URLSearchParams(this.opts.xParams);
        if (this.opts.crid) queryParams.set('crid', this.opts.crid);
        const queryStr = queryParams.toString();
        const url = `${this.opts.xbase}${queryStr ? '?' + queryStr : ''}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        this.update(json);
      } catch (err) {
        if (this.opts.debug) {
          console.error('[DeskOverlay] Feed fetch error:', err);
        }
      }
    }

    update(data) {
      this.data = data;
      const contentEl = document.getElementById('crid-content');
      const titleEl = document.getElementById('crid-title');
      if (contentEl && (data.text || data.message)) {
        contentEl.textContent = data.text || data.message;
      }
      if (titleEl && (data.title || data.source)) {
        titleEl.textContent = data.title || data.source;
      }
    }

    startPolling() {
      this.stopPolling();
      this.fetchUpdate();
      this.timer = setInterval(() => this.fetchUpdate(), this.opts.poll);
    }

    stopPolling() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }

    static register() {
      if (!window.DeskOverlay) {
        window.DeskOverlay = DeskOverlay;
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new DeskOverlay());
      } else {
        new DeskOverlay();
      }
    }
  }

  DeskOverlay.register();
})();
