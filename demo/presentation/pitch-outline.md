# Pitch outline (15 min: three numbers and one honest limit)

## 1. Today (2 min)
- Frame strip from the organisers' web walkthrough: click → 11 s black → provider loader → reels at 20 s (Amusnet game). The casino video: 41 s, abandoned, 21 s of it black.
- The same certified bundle served as shipped through our edge: Play button at 10.2 s on a laptop over 30 Mbit/s Wi-Fi (the primary target), 24.7–26.5 s on a 4G phone profile, 8–33 s on a real OnePlus Nord 3.
- Why: 23.4 MB in 63 requests across five serial engine phases before the first spin, nothing cached, nothing compressed. The bundle is certified and cannot change.

## 2. The three numbers (5 min, live on a phone, compare page)

| | Today | Accelerator | Kind |
|---|---|---|---|
| Blank screen after the tap | 21 s (video); 3.6 s laptop, 6 s phone | 0, poster in the next frame | perceived |
| Tap → Play button, predicted game | 10.2 s laptop; 25 s phone | 10 ms p50 / 26 ms p95 laptop; 27 / 156 ms phone | raw |
| Hot relaunch | 10 s laptop; 19 s in the video | 5 ms | raw |

Live: open the lobby on the phone (the pre-load starts on its own), talk for 30 s, tap. Back to the lobby, tap again. Then `excluded-player` and `?rc=1` to show the gate at full fidelity.

## 3. How (3 min)
- Edge: immutable versioned path, brotli on text (2.2 MB Spine JSON → 98 KB), Range for audio.
- Worker: cache-first, critical-set prefetch in engine order, hold/release of the non-critical tier.
- Lobby: the predicted game is booted in a hidden same-origin frame, parked with the engine's own `stopPixiApp()`, revealed with `startPixiApp()`. One RG gate runs before every open, pre-load and reveal.
- Bundle hash-verified unchanged: 379 files, `npm test`.

## 4. The honest limit and the business case (3 min)
- A first-ever visit still costs the bytes: 23 MB is 8 s at 30 Mbit/s and 21 s at 9 Mbit/s for every entrant. Sub-500 ms is therefore a coverage problem: the hot path covers the 35 % same-game re-taps; prediction is 37 % top-1 and 60 % top-3 on the sample log; population p50 24.7 s → 2.8 s with one warm slot, and more warm slots or earlier triggers raise it.
- Impact case: games sampled per session (2.2–3.1 today), abandoned loads (half of the 10.8 % quick re-taps), egress saved on repeat launches. Numbers and assumptions in `docs/impact-case.md`.
- Provider hand-over that moves the floor: real half-resolution atlases (about −10 s), music after the Play button (about −4 s).

## 5. Compliance in one breath (1 min)
- Bundle unaltered. RG interstitials, reality check, session limit and age gate unchanged and tested. No dark patterns: the prediction only chooses what to cache. Sample data only. The pre-load is a cache with a player switch, flagged for Legal review.

## 6. Ask (1 min)
- A provider checklist call (hooks present, parked state opens no session) and a four-week A/B on PSK Android.
