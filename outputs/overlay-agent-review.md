# Cyber Live Desk — Swae overlay and private operator review

**Updated:** 1 November 2026
**Target:** Landscape 16:9 Twitch stream through Swae; `/control` is the private operator surface and `/desk` is the public viewer overlay.

## Yes — this is being built for Swae

The live production deployment defaults to **16:9 landscape** for Twitch through Swae, and the controller describes `/desk` as a Swae Browser Widget/Web Page layer. The same public `/desk` route remains distinct from `/control`; the private research brief, microphone controls, and operator notes are not rendered on the public overlay.

## What is implemented

- **Fresh, on-demand research:** A requested topic is checked against dated Google News RSS material and Gemini Google Search grounding. The controller displays evidence links, dates, grounding links, the freshness window, balanced analysis, counterpoint, and what could change the assessment. It refuses to present output as verified when dated evidence or actual Search grounding is missing.
- **Personalized expansion:** A topic can have an optional angle, such as local creator impact, who benefits, or what is disputed. The operator can say `desk research <topic>` and then `desk deeper <angle>`, or enter both in `/control`. Expansion is bounded and avoids repeating covered points.
- **Private read-aloud:** `desk read` uses speech synthesis on the controller device; `desk quiet` stops it. It is never sent to Swae chat or the viewer overlay.
- **Push-to-talk, not stream listening:** Voice recognition starts only after the operator presses Listen and is one-shot. It listens to the controller device’s microphone, not the broadcast audio from Swae. Use a separate device while streaming or type the topic; the app does not run an always-on microphone.
- **Optional X, off by default:** X trend lookup happens only when explicitly enabled for that individual brief request. TikTok is not scraped or claimed as a live feed; TikTok Creative Center remains a manual check.
- **Official YouTube playlist player:** Music Desk accepts a public YouTube/YouTube Music playlist link and generates a standard visible YouTube player URL for a Swae web-page layer. It keeps player controls, does not request autoplay, and does not extract raw audio. The creator must still ensure rights for any music broadcast.
- **Earlier overlay reliability changes:** CRID audio state/mute behavior, reduced-motion-aware transitions, polling timeout/latency status, and opt-in keyboard shortcuts remain covered by the existing regression suite.
- **Animated sound orb:** A compact orb sits mid-left in the landscape overlay. Red and black lead, with a faint blue-black sheen. It expands and pulses during actual CRID audio playback, then contracts when muted, waiting, ended, or stopped. It follows audio-player events—not microphone input or waveform amplitude—and respects reduced-motion preferences.

## Cost and source limits

Google News RSS is a public dated input. Gemini Search grounding is **not guaranteed free**: Google requires a paid-tier project for grounding; quota may apply and additional use can be billed. The app discloses this before use. X requires an available API credential and may have access costs, so it is opt-in. No unlimited-free live data source is promised.

Undated Search results can help with context but do not count as proof of freshness. A live X snapshot is only a platform conversation signal, not evidence of why a term is trending or that it is trending on TikTok. The brief is a research aid, not a substitute for checking linked sources before repeating a claim.

## How to use it in Swae

1. Open the authenticated `/control` page. In **Private research brief**, enter a topic and optional angle, then choose **Research topic**. For voice, press **Listen** and say `desk research <topic>`; the control device’s microphone is the one used.
2. Ask for more detail with **Go deeper** or `desk deeper <angle>`. Review the freshness warning, dated headlines, grounding links, and counterpoint. Use **Read aloud** for private listening on the controller.
3. Copy the public `/desk` URL and add it as a Browser Widget/Web Page layer in the Swae landscape Twitch scene. To add a playlist player, paste a public YouTube playlist URL into the YouTube section of Music Desk, copy the generated player URL, and add it as a separate visible web-page layer.
4. Keep the YouTube player visible and interactive. Test layout/audio in Swae privately; the generated URL does not guarantee the platform captures player audio or grant music rights.

## Verification and remaining checks

The latest `node --test` run passed **153 / 153 runner-counted items** (152 explicit tests plus one Node file-discovery item for `api/test.mjs`). Changed JavaScript modules passed `node --check`, and `git diff --check` is clean.

The initial branch-preview verification used commit `567167a` at [the deployed `/desk` preview](https://cyber-live-desk-4ats8g0yk-crid.vercel.app/desk). That branch was subsequently merged to production.

### Production promotion (1 November 2026)

Commit `3078ec7` is merged into `main`, and Vercel reports the production deployment **Ready**. [Open the live `/desk` overlay](https://cyber-live-desk.vercel.app/desk); the orb is present. [Open the private `/control` page](https://cyber-live-desk.vercel.app/control); it requires the operator token. The actual Swae scene still needs a private on-device check for widget crop and audio capture.
