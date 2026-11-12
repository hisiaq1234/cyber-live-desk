# cyber-live-desk

OTOLORIN's live desk: the `/desk` overlay, the `/control` operator surface, and **Crid** — the
character who lives in the overlay.

> **Before you change anything, read [`CLAUDE.md`](CLAUDE.md).** It is the handoff for any agent
> picking this project up: what is built, what is next, and the rules that are not negotiable.
> Crid is the owner's own Bitmoji — never redesign him, never generate his body or face, and never
> make him short.

---

## Crid's brain (initiative)

Crid has a body (`public/desk-assets/crid-bot.js`) and hands, but on the desk everything he does is
triggered by someone else. `brain/` is the missing organ: a **local decision loop** that watches the
stream's chat, remembers the session, and decides what Crid does next without being told.

It runs on the streamer's own machine — instant reactions, no per-event cost, no cloud, no model.
Crid does not speak: every reaction is visual (presence, expression, gesture, on-screen text, effects).

### Run it

```bash
npm run brain -- --demo              # synthetic chat + events on a timer — no Twitch, no setup
npm run brain -- --channel <name>    # live: watch a real Twitch channel's chat
```

`--demo` needs nothing at all: it scripts a session (greeting, keyword, spike, sub, gift, bits, a
repeated topic, a lull, a raid) so you can watch Crid act on his own within a minute.

Live mode reads chat **anonymously over IRC** (`NICK justinfan…`, no login, no OAuth, no app
registration), so pointing it at a channel is the only setup:

```bash
npm run brain -- --channel otolorin          # or:
CRID_CHANNEL=otolorin npm run brain
```

Subs, resubs, gifts and raids arrive through the same IRC connection as `USERNOTICE`. If the
connection drops — or the channel is offline — the brain keeps running, logs it, and reconnects with
backoff; the overlay shows a red dot instead of silently going quiet.

Other flags: `--port 7311`, `--verbose` (also logs the rules that were *held back*), `--seed 42`
(repeatable demo), `--help`.

### Put the overlay on stream

Add a **Browser Source** in OBS pointing at:

```
http://127.0.0.1:7311/overlay
```

1920×1080, custom frame rate 60. The page is transparent by default. To eyeball it in a normal
browser, use `http://127.0.0.1:7311/overlay?preview=1` (adds a visible stage background).

`http://127.0.0.1:7311/` is a live status page: what Crid is doing and **why**, one line per decision.

### What you will see

Every decision is one line of readable reasoning in the terminal — that log is the product:

```
10:34:10 ▲ sub · p94 — why: resub 3 months from dave · 1st sub this session
         └ card:"dave"|"+3 months" · express:pleased · gesture:cheer · effect:flash · say:"dave subbed. noted, logged, respected." (callout)
10:34:20 ▲ repeated-topic · p72 · unprompted — why: "clutch" mentioned by 3 people in the last 90s
         └ look:chat · express:thinking · memory:topic:"recurring: "clutch"" · say:"we're doing clutch then. fine." (dry)
10:35:16 ▲ callback · p52 · unprompted — why: remembering "chat wouldn't drop "lag"" from 45s ago (moment m47, never referenced)
         └ look:chat · express:thinking · memory:callback:"45s ago: chat wouldn't drop "lag"" · say:"chat wouldn't drop "lag". that was 45s ago. I don't forget." (dry)
```

### How it is put together

| file | job |
|---|---|
| `brain/index.mjs` | entry point: args, wiring, banner, heartbeat, shutdown |
| `brain/twitch-irc.mjs` | anonymous Twitch IRC over WebSocket → one normalised event shape; reconnect with backoff |
| `brain/memory.mjs` | session memory: chat, moments, **Crid's own past actions**, topics, who was here |
| `brain/engine.mjs` | the initiative loop: reactive rules + unprompted rules, cooldowns, priority, "why" logging |
| `brain/personality.mjs` + `brain/crid-personality.json` | everything Crid says, and what he would never say |
| `brain/commands.mjs` | the command bus: versioned envelopes `{v, seq, id, type, payload, priority, ttl, interrupt, why}` |
| `brain/server.mjs` | local HTTP + WebSocket on one port; overlay, status page, `/health`, `/state` |
| `brain/overlay.html/.js/.css` | a **stateless** renderer around the existing `crid-bot.js` |
| `brain/demo.mjs` | the synthetic session behind `--demo` |
| `brain/ws.mjs` | ~200-line zero-dependency WebSocket server (no new runtime dependencies) |

**Memory.** Not a log: a record of what happened, including a moment for every notable event, and
an entry for every action Crid took with the moment it belonged to. That is what lets him say
"that was 45s ago" about something he actually saw, instead of only reacting to the present.

**Initiative.** Five rules fire with nothing to react to — `repeated-topic`, `callback`, `recap`
("N moments while you were gone", built only from real moments), `long-silence`, `musing`. Nine
reactive rules fire on chat, keywords, spikes, subs, gifts, bits and raids. A cooldown per rule, a
priority-ordered global gap and a per-minute cap keep him from spamming.

**Stateless renderer.** The page holds no state. OBS reloads browser sources on several triggers;
on connect the brain sends a snapshot (presence, current expression, moments so far) and then
streams commands. Reloading mid-stream is invisible.

### Make him yours

`brain/crid-personality.json` is the character: opinions, running jokes, catchphrases, keyword
reactions, one line bucket per kind of moment, and a `never` list (any line containing one of those
phrases is dropped instead of said). Edit it while the brain is running — it reloads on save.

Slots: `{user} {count} {minutes} {topic} {ago} {moment} {bits} {months} {viewers}`.

### Tests

```bash
node --test                              # everything, including brain/
node --test "brain/tests/*.test.mjs"     # just the brain
```

The brain's tests cover the IRC parser and client (including reconnect and a dead socket), memory,
personality and its guard, every rule, cooldowns and the anti-spam floor, the command envelopes, the
hand-rolled WebSocket framing, and the real HTTP/WebSocket server end to end.
