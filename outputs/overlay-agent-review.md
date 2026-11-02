# Cyber Live Desk — Swae overlay handoff

**Updated:** 2 November 2026

**Target:** 16:9 landscape Twitch stream through Swae. `/desk` is the public viewer overlay; `/control` is the operator surface.

## Swae 401 status

The public widget URL is [https://cyber-live-desk.vercel.app/desk](https://cyber-live-desk.vercel.app/desk). The latest production commit, `1c9a615`, is marked **Ready** in Vercel. Live `GET /desk` and `HEAD /desk` both return **200**; the HEAD response has no body. Operator APIs were not opened: unauthenticated `GET /api/desk/cards` still returns the expected **401**.

The Swae app itself is not available for me to press its widget Save/Test control. Please reload or reselect the `/desk` URL once in Swae so it retries the now-working route. The server-side cause is fixed and verified; final phone-side confirmation remains outstanding.

## Compact overlay and news

The red/black orb with its blue-black sheen is a small decorative `DIV`, not a button: live DOM verification found `aria-hidden=true`, `tabIndex=-1`, no button ancestor, and `pointer-events:none`. The automatic lower-third showed a fresh RSS headline, publisher, relative age, and source label while preserving the landscape camera view.

The Nigeria RSS ticker runs automatically while `/desk` is open. The live endpoint returned **six** dated headlines with HTTPS source links and a CDN cache hit; the current overlay reported a sample item as 57 minutes old. If no fresh items can be fetched, the ticker reports an error instead of silently reusing stale news.

This ticker is RSS-based; **it does not send every headline to Gemini for verification**. The private source-linked Gemini brief remains on-demand in `/control` and is not sent to Swae chat or the viewer overlay.

## Control word and voice music

The shared spoken/chat command prefix is now **`crid`**, not `desk`. The deployed controller prompts and help use the new prefix. For example:

- `crid research Lagos TikTok trends` starts a private research brief.
- `crid music play` resumes the current track or starts the queue head.
- `crid music play <title or artist>` selects a unique match already in the Music Desk queue/current track.
- `crid music pause`, `crid music next`, and `crid music stop` control that queue.

Voice music is queue-based in this update: if a requested track is missing or ambiguous, it reports the problem and does not guess. It does **not** yet search YouTube automatically. The supplied `overlay-alive.html` is not deployed as a drop-in `/desk` replacement: it expects a playable video ID that the public state intentionally does not expose, and this change adds no YouTube search service or hard-coded fallback video. The official YouTube/YouTube Music playlist-player workflow remains a separate visible Swae layer.

## Production checks

- [Open the public Swae overlay](https://cyber-live-desk.vercel.app/desk)
- [Open the operator page](https://cyber-live-desk.vercel.app/control) — operator-only actions still require the private token
- `GET /desk`: 200
- `HEAD /desk`: 200, empty body
- `GET /api/desk-headlines`: 200; six dated HTTPS items; Vercel cache hit
- `GET /api/desk/state?since=-1`: 200; queue and audio URL not exposed
- `GET /api/desk/cards` without token: 401, as intended
- Live overlay: ticker status ready; orb is `aria-hidden`, non-interactive, and not a button
- `node --test`: **160 passed, 0 failed** (159 explicit test cases plus one route-module discovery)
- `node --check`: 36 JavaScript files; browser/server parser copies match

The detailed [comprehensive test report](comprehensive-test-report.md) and [test-suite chart](test-suite-counts.svg) are included beside this handoff. Swae-device playback/crop and the orb’s actual music-playing state still need a phone-side test.

## Use it

1. In Swae, set the Browser Widget/Web Page URL to `/desk` above, then reload the saved widget to clear the old 401 check.
2. Keep that page open during the stream for automatic, dated RSS headlines. They are not Gemini-verified.
3. Use `/control` for the private brief and operator controls; keep its token private.
4. For voice track control, add the track to Music Desk first, then say a `crid music ...` command. Automatic phrase-to-YouTube search is not included yet.
5. Add the official playlist player separately if you need actual YouTube playback. The compact capsule reports now-playing metadata; it is not a full player.
