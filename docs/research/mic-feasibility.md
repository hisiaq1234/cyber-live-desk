# Feasibility: can a second phone hold `/control` open for hours with the mic live, feeding Crid?

Question asked: can a second phone keep the `/control` page open for hours with the mic live, feeding speech into Crid?
Basis read: `public/desk-assets/crid-voice.js` (repo `hisiaq1234/cyber-live-desk`).
Nothing here was tested on a real device. Everything in "Verified" is traceable to an official source; everything in "Unverified" is a hypothesis to be settled by the test protocol at the end.

---

## 1. What the code does today

From `crid-voice.js`:

- Uses `window.SpeechRecognition || window.webkitSpeechRecognition`, with `continuous = true`, `interimResults = false`, `lang = "en-US"`.
- `onresult` takes only the last result (`e.results[e.results.length - 1][0].transcript`), i.e. one final transcript per utterance — correct for `continuous = true`, where `results` accumulates.
- Prefixes `"crid "` if the utterance does not start with it, parses via `parseDeskCommand`, posts the command to `/api/desk/action` with `Authorization: Bearer <token>`.
- `onend` → `if (running) rec.start()` — the standard keep-alive restart loop.
- Token: `localStorage.getItem("desk.token")`.
- Not present: any wake lock, any `visibilitychange` handling, any restart backoff, any error classification, any queuing of a command that failed to POST.

So the whole feasibility question reduces to: **does the browser let this restart loop keep running for hours, and does the mic stay open when the screen is off or the app is backgrounded?** The code already does the one thing it can do about it (restart on `end`).

---

## 2. Verified (official sources)

### 2.1 Speech recognition support and the `continuous` flag

From `mdn/browser-compat-data` (`api/SpeechRecognition.json`, the data behind MDN's compatibility tables):

| | Support |
|---|---|
| Chrome | `webkitSpeechRecognition` since 33; unprefixed `SpeechRecognition` since 139 |
| Chrome Android | mirrors desktop Chrome |
| Safari (desktop) | `webkitSpeechRecognition` only, since 14.1 |
| Safari iOS | mirrors Safari (14.1+) |
| Firefox | 160+ (both prefixed and unprefixed) |
| Firefox Android | **not supported** (`bugzil.la/1244242`) |

Critically: **`SpeechRecognition.continuous` is supported in Safari only from version 17.** Before Safari/iOS 17 the property is ignored, so recognition returns a single result and stops. The existing `onend` restart is what makes old iOS usable at all — at the cost of one restart per utterance.

MDN also flags the whole interface as "Limited availability — not Baseline because it does not work in some of the most widely-used browsers."

### 2.2 Recognition is server-side and needs the network

MDN, `SpeechRecognition`: "On some browsers, like Chrome, using Speech Recognition on a web page involves a server-based recognition engine. Your audio is sent to a web service for recognition processing, so it won't work offline."

Consequence for this use case: an hours-long session is an hours-long dependency on a vendor cloud service you do not control, with its own quotas and failure modes.

### 2.3 Screen Wake Lock

MDN, Screen Wake Lock API:

- "Secure context: available only in secure contexts (HTTPS)."
- "A request may be rejected for a number of reasons, including system settings (such as power save mode or low battery level) **or if the document is not active or visible**."
- "It can be released by the system … if the battery power is too low or **the document is not active or visible**."
- "After being released a WakeLockSentinel can no longer be used. If a screen wake lock is required again/still, the application will need to request a new one."
- Gated by the `screen-wake-lock` Permissions-Policy directive.

Support (BCD `api/WakeLock.json`): Chrome/Chrome Android 84+; Safari 16.4+; **Safari iOS 16.4+ partial — "Does not work in standalone Home Screen Web Apps" until 18.4**, full from 18.4. Firefox 126+.

Two hard conclusions:
1. Wake lock only *delays* the screen turning off; it is **not** a way to keep working with the screen locked. The moment the document is hidden (screen off), the lock is dropped.
2. On iOS 16.4–18.3, adding `/control` to the home screen breaks wake lock. On iOS it must run in a normal Safari tab.

### 2.4 Backgrounding, screen off, and throttling

MDN, Page Visibility API:

- "Pages only become hidden when the user switches tabs or minimizes the browser window"; `hidden` is true "either due to the document's tab being in the background or part of a window that is minimized, **or because the device's screen is off**."
- Background/hidden tabs: `requestAnimationFrame` stops, `setTimeout` is throttled.
- Exemptions: "Tabs which are playing audio are considered foreground and aren't throttled." and "**Tabs running code that's using real-time network connections (WebSockets and WebRTC) go unthrottled** in order to avoid closing these connections timing out and getting unexpectedly closed."

That last line is the single strongest technical argument in favour of the WebSocket-STT route over `webkitSpeechRecognition`: a page holding a WebSocket is explicitly exempt from background throttling in the platforms that implement this policy, whereas a page waiting on a vendor recognition engine has no such guarantee.

### 2.5 Permission model

MDN, `MediaDevices.getUserMedia()`:

- "Powerful feature that can only be used in secure contexts"; in an insecure context `navigator.mediaDevices` is `undefined`.
- "User permission is always required to access the user's audio and video inputs."
- "Browsers may offer a once-per-domain permission feature, but they must ask at least the first time, and the user must specifically grant ongoing permission if they choose to do so." Browsers must show a recording indicator while permission is held.
- `NotAllowedError` (denied / policy) and `NotFoundError` (no device); `InvalidStateError` if "current document is not fully active".
- Only the top-level document may request it, unless an iframe is granted it via Permissions-Policy `microphone`.

Practical read: mic permission on a phone is a per-origin grant that survives reloads but can be revoked by the OS or the browser at any time (Safari in particular re-asks more often than Chrome). Any long-running design must treat "permission was withdrawn mid-shift" as an expected state, not an exception.

### 2.6 Holding an operator token in a phone browser

The token lives in `localStorage` under `desk.token` and is sent as a Bearer header.

- `localStorage` is origin-scoped and readable by **any** JavaScript running on that origin. On a shared phone that means anyone who opens the browser and that URL has the operator token; an XSS anywhere on the origin also hands it over.
- WebKit (Safari) deletes all script-writable storage — LocalStorage and SessionStorage named explicitly — "after seven days of Safari use without user interaction on the site" (WebKit blog, "Full Third-Party Cookie Blocking and More", 7-Day Cap on All Script-Writeable Storage). Web applications added to the home screen are exempt and use their own counter.
- So on iOS the phone can silently lose its token after a week of not touching the site — which will look like "Crid stopped working" and is indistinguishable from a mic failure unless the UI says so.

---

## 3. Unverified (no official source; needs a real device)

These are the questions that decide the answer, and none of them are documented:

1. **Does the mic stay open when an iPhone screen locks?** Expected: no — the page is suspended, recognition ends, the restart loop cannot run because timers/JS are frozen. Not documented anywhere official.
2. **Does the mic stay open when the user switches apps on iOS?** Same expectation, same absence of documentation.
3. **Android Chrome with the screen off / app backgrounded:** does `webkitSpeechRecognition` keep running? Does `getUserMedia` + WebSocket keep capturing? Chrome may keep the mic for a while (mic indicator stays) and then stop it under Doze or audio-focus rules. Widely reported in both directions; not officially specified.
4. **How long does a Chrome `continuous` recognition actually last before `onend`?** The commonly reported behaviour is that it ends after a stretch of silence or a few minutes regardless of `continuous = true`. Not documented by Google as a limit.
5. **Does the `onend` restart survive on iOS?** Safari may require a fresh user gesture for each `start()`. If so, the restart loop works on desktop Chrome and dies after the first utterance on iOS, which would be a silent failure — exactly the failure mode the test protocol must catch.
6. **Restart storms.** With no backoff, if `start()` throws (e.g. `InvalidStateError` because the previous session has not fully torn down) the `onend` handler can loop hot and burn battery without ever listening. Expected risk from reading the code, not observed.
7. **Battery and thermal endurance** for hours of mic + screen on + wake lock. No official figures; varies by device.
8. **False triggers.** `interimResults = false` and `continuous = true` means every final transcript that starts with "crid" (or is prefixed with it) is executed. In a noisy room, ambient speech becomes desk commands. Not a platform question, but it is the operational risk of leaving this listening for hours.

---

## 4. WebSocket streaming STT vs. `webkitSpeechRecognition`

**How the WS route works:** `getUserMedia({audio:true})` → `AudioContext` + `AudioWorkletNode` → downsample to 16 kHz PCM (or Opus via `MediaRecorder`) → `wss://` to your own server → STT → commands into the same `/api/desk/action` path.

What it genuinely fixes:

- No dependence on the vendor recognition engine's undocumented session limits or restart caps — you own the session lifetime.
- Page Visibility's explicit WebSocket/WebRTC exemption from background throttling applies.
- Works on Firefox Android, where `SpeechRecognition` does not exist at all.
- Interim results are available, so a command can be recognised while it is still being spoken, and a VAD can be tuned server-side.
- You get real error signals (socket close codes, HTTP status on the STT call) instead of the opaque `onerror` error strings.

What it does **not** fix:

- **Screen lock and backgrounding.** `getUserMedia` capture is tied to the page being alive; suspending the page stops capture on iOS and, per the same visibility model, likely on Android too. The WS route makes the *foreground* case more robust, not the *locked* case. **No web API lets a page keep the microphone open with the screen locked on iOS.**
- Permission: still needs the mic grant, still HTTPS-only.
- Wake lock: still needed, same limits.
- It adds real engineering: AudioWorklet, PCM framing, backpressure, reconnect with resume, server-side STT cost and latency, and an audio-privacy decision (audio now reaches your server instead of the vendor's).

**Judgement:** for *this* codebase the WS route is a second project, not a fix. It buys reliability in the foreground and a better failure signal; it does not buy the one thing the owner actually wants (hours of hands-free listening). The cheaper first move is to make the existing loop honest: classify errors, back off on restart, re-acquire the wake lock on `visibilitychange`, and show a visible "listening / not listening" state on the phone.

---

## 5. Answer

**Can a phone hold the mic open for hours with the screen locked? No — not on iOS, and almost certainly not on Android.** Nothing in the web platform keeps a page's microphone alive across screen lock; wake lock is released exactly when the document becomes hidden (MDN, Screen Wake Lock).

**Can it hold the mic open for hours with the screen on and the tab in the foreground? Plausibly yes on Android Chrome, and on iOS 17+ in a normal Safari tab** — subject to the restart behaviour in §3.5 and to the vendor recognition service staying up. iOS 16.x ignores `continuous`, so every utterance costs a restart.

**Is a second phone a sound design for this?** As a shift-length, screen-on, plugged-in, dedicated device: yes, with the hardening in §4. As a "leave it in a pocket and talk to it" device: no.

---

## 6. Real-device test protocol

Two devices: one iPhone on current iOS (and, if available, one on iOS 16), one Android phone on current Chrome. Use a build that shows a live status line — `listening`, `ended`, `restarted N`, `last error`, `wake lock active` — because every failure mode above is silent otherwise.

Setup for every run: phone on charger, normal browser tab (not a home-screen web app on iOS < 18.4), `/control` open, mic permission granted, screen brightness default, `console` captured via remote debugging (Safari Web Inspector / `chrome://inspect`).

**Test A — foreground endurance (the only case expected to pass).**
1. Start listening, acquire wake lock, say "crid status" once. Confirm the command lands.
2. Leave the phone on the desk, screen on, untouched, for 60 minutes. Do not speak.
3. At 60 min say "crid status" again. Record: did it land, how many restarts, any errors.
4. Repeat for 3 hours. Log battery % every 30 min and device temperature/thermal-throttle warnings.
   Pass: ≥ 95% of spoken commands land, no gap > 10 s, no unattended restart storm.

**Test B — screen lock / backgrounding (expected to fail; record how).**
1. Start listening, then press the power button to lock the screen. Wait 5 min. Unlock, say "crid status".
2. Repeat but switch to another app for 5 min instead of locking.
3. Repeat with the browser tab backgrounded but the screen on (Android).
   Record for each: does the restart loop resume on return, how many commands were lost, does the wake lock re-acquire, does the mic indicator come back.

**Test C — silence and long-utterance limits (settles §3.4).**
1. Start listening and stay silent for 30 min. Log every `onend`/`onerror` with timestamps. This measures the vendor engine's real session length.
2. Then speak one continuous 60-second sentence. Does it come back as one result or several?
3. Speak immediately after a restart (within 1 s) — is the first word lost?

**Test D — permission and token persistence (settles §2.6 in practice).**
1. Revoke the mic permission in OS/browser settings mid-session. Does the UI say so, or does it fail silently?
2. Clear site data, then reopen `/control`. Is the token still there? Does the page say "no token" or just stop posting?
3. On iOS, simulate the 7-day storage purge by clearing website data, and separately test after 8 days of not visiting the site in Safari (not home-screen). Record whether `desk.token` survives.

**Test E — network flap (reconnect reliability).**
1. During a listening session, toggle airplane mode for 30 s, then off. Count commands lost and whether the restart loop recovers unattended.
2. Let the phone's screen time out naturally (no wake lock) and come back — same measurement.

**Pass criteria for the owner's use case:** Test A passes on the target phone for 3 hours, and Test B's failure is surfaced to the operator within 5 seconds (visible state change on the phone and, ideally, on the desk side). If Test A fails, the phone-as-listener idea is dead on the web platform and a native app (which can hold a background audio session) is the only path.

---

## 7. Sources

- MDN, `SpeechRecognition` — https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition (server-based engine note, event list)
- MDN, `SpeechRecognition.continuous` — https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/continuous
- `mdn/browser-compat-data`, `api/SpeechRecognition.json` — https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json (source of the MDN compat table; Safari `continuous` = 17, Safari iOS mirrors)
- MDN, Screen Wake Lock API — https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
- `mdn/browser-compat-data`, `api/WakeLock.json` — https://github.com/mdn/browser-compat-data/blob/main/api/WakeLock.json (iOS 16.4 partial, 18.4 full, home-screen caveat)
- MDN, Page Visibility API — https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API (hidden on screen off; WebSocket/WebRTC unthrottled)
- MDN, `MediaDevices.getUserMedia()` — https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia (secure context, permission, errors, Permissions-Policy)
- WebKit blog, "Full Third-Party Cookie Blocking and More", 7-Day Cap on All Script-Writeable Storage — https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
