# Cyber Live Desk overlay/agent review

**Reviewed:** 1 November 2026
**Scope:** Compared the corrected Gemini checklist with the live project files; used five independent read-only code reviewers. Changes were applied in place, without replacing the project architecture.

## What was fixed

- **CRID audio:** Kept the server-authoritative state and existing audio synchronizer. Added HTTPS-only source validation and fixed a backend bug where a mute-only action also toggled playback. The public overlay uses one persistent media element, clears old sources, respects mute/play state, avoids restarting ended audio on unrelated updates, and catches autoplay failures.
- **Overlay motion and polling:** Made `fade` truly opacity-only, added short card/dock arrival motion, changed poll fills to transforms, and added measured request-latency/reconnect feedback. A state fetch now aborts after 12 seconds so a hung request can reach the existing retry/backoff path. Reduced-motion settings now suppress the new animation plus CRID breathing and poll-leader pulses.
- **Controller voice and keyboard:** Added one-utterance, button-initiated speech recognition with visible status, cancellation, and stop-on-hidden behavior. The UI discloses that the browser’s recognition provider may process microphone audio. Requests continue through the existing authenticated API helper; the inaccurate comment describing `/api/desk/voice` as public/tokenless was corrected. Ctrl+Shift+Right/Left/Space map to next/previous/toggle hold; shortcuts start off, can be enabled per tab, and are ignored while typing, composing, hidden, or using an open sheet.
- **Command safety:** Aligned the API and browser parser copies. The existing `research`/`refresh` aliases are recognized but have no action mapping; Twitch now rejects unsupported parsed commands before dispatch rather than passing an undefined action. This does **not** run a research job from chat or voice.

## Verification

`node --test`: **134 passed, 0 failed**. Node syntax checks: **24 JavaScript files passed**. `git diff --check`: clean. No deployment or Git commit was made. A browser/OBS playback session was not available for runtime verification.

## Remaining manual checks / separate follow-ups

Test audio in the actual OBS/browser-source target: autoplay policy depends on that browsing context, and amplitude analysis cannot be assumed because remote media may not grant CORS. No AudioContext/DSP layer or invented fallback media URL was added. The `research`/`refresh` aliases intentionally remain non-executable until their authorization, runtime budget, and desired behavior are specified.

The reviewers also found separate operational risks not changed in this focused pass: the controller’s chat-vote tally lacks a poll-generation ID (a delayed tally could affect a later poll), Twitch IRC has no connection-open timeout, and EventSub dedupe keys have no TTL. Review these as a separate reliability task before increasing chat volume.

## Files changed or added

- Controller: `public/desk-assets/control.js`, `public/desk-assets/desk-hotkeys.js`
- Overlay/audio: `public/desk-assets/overlay.js`, `public/desk-assets/crid-audio.js`
- API/commands: `api/_desk-core.mjs`, `api/desk.mjs`, `api/_commands.mjs`, `api/_twitch-core.mjs`, `public/desk-assets/_commands.mjs`
- Tests: `tests/desk-core.test.mjs`, `tests/desk-commands.test.mjs`, `tests/desk-hotkeys.test.mjs`, `tests/overlay-audio.test.mjs`
