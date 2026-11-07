# Cyber Live Desk — Swae overlay handoff

**Updated:** 3 November 2026  
**Target:** 16:9 landscape Twitch stream through Swae. `/desk` is the public viewer overlay; `/control` is the private operator surface.

## Current production status

- [Open the public overlay](https://cyber-live-desk.vercel.app/desk)
- [Open the operator controller](https://cyber-live-desk.vercel.app/control)
- Voice-search app code is on `main` at `6e08900`; Vercel marked the Production deployment **Ready**. The Vercel project now lists `YOUTUBE_API_KEY` as a **Secret** scoped to **Production**. The value was not viewed or copied into source. A fresh production build is needed for a function deployment created before that environment-variable update to use it; verify the follow-up deployment before relying on voice search.
- `GET /desk` and Swae's `HEAD /desk` check return **200**. `/control` returns **200**. Operator APIs still return the expected **401** without the operator token.

The Swae phone app itself is not available for a final tap/capture test. Reload or reselect the `/desk` Browser Widget/Web Page URL once in Swae to clear its previous result, then confirm it shows the latest design on the phone.

## What “non-interactive” means

The CRID mascot is a decorative `DIV`, not a button or control. Live production DOM verification found it at **60×63 px**, `aria-hidden=true`, `tabIndex=-1`, `pointer-events:none`, and with no button ancestor. A tap cannot start/stop music or open anything; screen readers skip it and keyboard focus cannot land on it. The separate private controller provides actual controls.

The overlay remains the existing JavaScript-driven `/desk` page; the provided HTML design and downloaded theme/bot/controller changes were ported into the real JS runtime rather than deployed as a second standalone page. The live root has the `layout-alive` class.

## Automatic headlines and music

The narrow lower-third RSS feed updates automatically while `/desk` is open. Its latest live response had six dated Nigeria-region headlines. It is **not Gemini-verified**; the private, source-linked Gemini brief remains on-demand in `/control` and is never pushed to the public overlay or Swae chat.

Voice music commands now use `crid`:

- `crid music play` starts the current/first queued track; if there is none, it selects the default YE video **MAMA'S FAVORITE** (`8jDVdq70zUI`). This is command-triggered, not automatic page-load autoplay.
- `crid music play <song or artist>` checks for one unique queued match first. If there is no match, it searches YouTube automatically through the server-only `YOUTUBE_API_KEY`, chooses one embeddable result and updates the now-playing state. Ambiguous queue matches are refused.
- `crid music pause`, `crid music next`, and `crid music stop` control playback state.

The public overlay uses the official YouTube privacy-enhanced embed and never extracts audio. The video was not actively playing during the DOM check. **Swae may not mix iframe/browser-widget audio into the live broadcast**, and its snapshot mode may restrict autoplay; confirm on the phone. If sound is not carried, use a separate official YouTube player layer in Swae.

## Quick checks

| Check | Result |
|---|---|
| `GET /desk` / `HEAD /desk` | 200 / 200 (HEAD body empty) |
| `/control` | 200 |
| `/api/desk-headlines` | 200; six dated objects in the latest probe |
| `/api/desk/cards` without token | 401, expected private gate |
| `/api/desk/voice` without token | 401, expected private gate |
| Live alive layout | Present |
| Mascot semantics | Decorative non-button DIV, 60×63 px, hidden from assistive tech |
| Full `node --test` | **179 passed, 0 failed** (178 explicit tests + one file-discovery item) |
| JavaScript syntax | 43 files checked; browser/server parsers byte-identical |

See the [comprehensive test report](comprehensive-test-report.md) and [test distribution chart](test-suite-counts.svg) for the full breakdown.

## Use it

1. Add `/desk` as the Swae landscape Browser Widget/Web Page URL; reload the saved widget to retry the fixed availability check.
2. Keep `/desk` open for compact automatic RSS headlines.
3. Use `/control` for operator controls, one-shot voice input and private research; keep the operator token private.
4. Say `crid music play` for the queue/default, or `crid music play <song>` for queue-first YouTube search after the Production environment has been redeployed with `YOUTUBE_API_KEY`.
5. Confirm on-device whether Swae routes the official player audio into the broadcast; the public overlay itself does not guarantee that audio path.
