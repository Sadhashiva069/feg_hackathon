# Load-time progress log — Challenge 3

Goal: tap → playable in ~500 ms for a certified third-party game, without touching the bundle
(`empireofgold/`) and without weakening any responsible-gambling step.

How to use this file: every time a change is measured, add a row to the **Iteration log** and update
the **Scorecard**. Numbers only count if they come from the instrumented harness on a real device,
not from a desktop DevTools guess. Say for each gain whether it is *raw* (bytes/requests actually
removed from the critical path) or *perceived* (user sees something useful earlier).

---

## Scorecard (latest measurement)

| # | Metric (from challenge brief) | Target | Baseline | Current | Raw / Perceived | Status |
|---|---|---|---|---|---|---|
| M1 | Cold load p50 (tap → first interactive spin) | < 500 ms | 29.8 s emulated phone 4G (n=2); real Nord 3: ~11 s Wi-Fi (n=4, 9–34 s), ~11 s LTE (n=2, 8.6–14.7 s) | **predicted + warm: Play button on screen 27 ms (p50, n=19) after the tap on the emulated 4G phone, 6–7 ms laptop, 27 ms on 3G; Play→reels 11 ms** (after-matrix 2026-09-08 19:00, all via the tunnel). Prediction miss on files already on disk: 2.8 s; low-memory (light) device: 1.2 s; nothing cached: 23.4 s. Population projection from the event-log replay (1 warm slot, 4G): p50 2.8 s, 38 % of launches under 500 ms; with 3 warm slots (desktop memory): p50 41 ms, 57 % | raw | ☑ predicted path; ☐ population p50 with one slot |
| M2 | Cold load p95 | < 500 ms | 30.6 s (phone 4G, n=2); 126 s on 3G | predicted path: **p95 156 ms** (n=19 warm sessions, 4G phone; 18 of 19 under 43 ms, one at 156 ms). 1 of 20 sessions failed (tunnel HTTP 530 during pre-load → engine loader gave up; SW now retries 5xx). Population p95 stays at the cold value (24 s on 4G) because 36 % of launches are prediction misses | raw | ☑ predicted path; ☐ population |
| M3 | Warm / prefetched load p50 | < 500 ms | _TBD_ | hot relaunch (back to lobby, tap again): 16 ms, game already at the reels; prefetched, engine not booted: 2.8 s to Play button | raw | ☑ hot / ☐ prefetched-only |
| M4 | Launch-to-play conversion (launches that reach first spin) | ↑ vs baseline | _TBD_ | _TBD_ | — | ☐ |
| M5 | Games sampled per session | ↑ vs 2.2–3.1 (trends xlsx) / p50 3 (event log) | 3 | _TBD_ | — | ☐ |
| M6 | Perceived-load quality (time to first meaningful paint of game, skeleton/preview shown, blank-screen ms) | blank screen < 100 ms | black until COMMON 5.3 s, logo until SPLASH 6.1 s (phone 4G); video: 21 s black | poster + title + status within 37–43 ms of the tap on every path (next frame); no black screen | perceived | ☑ |
| M7 | Cache hit rate (asset requests served from SW/edge cache) | > 90 % on repeat | _TBD_ | prefetched/warm: 100 % of game requests after the tap served by the service worker (91/91, 59/59); origin gets 0 bytes | raw | ☑ |
| M8 | Prefetch accuracy (prefetched game == next launched game) | > 50 % top-1 / > 75 % top-3 | last-game rule: 32.4 % top-1 | **37.1 % top-1 / 59.6 % top-3** on the last 40 % of the month (5,473 launches; causal replay, `src/predict/build.js`). First launch of a session 45.2 / 63.8 %; within session 35.2 / 58.6 %; Casino Android 37.5 / 58.1 %. Popularity alone 4.2 %, affinity alone 36.5 %, transitions alone 29.0 % | raw | ☐ (below target; data-limited: 65 players, 887 games) |
| M9 | Prefetch waste (MB downloaded never used per session) | minimise | _TBD_ | _TBD_ | — | ☐ |

Guardrail checks (must stay ✅ on every iteration):

| Guardrail | How verified | Status |
|---|---|---|
| Certified bundle unaltered | SHA-256 of all 379 files recorded in `tests/bundle-hashes.json` from the delivered zip; `node tests/verify-bundle.js` (also in `npm test`) passes; `git diff 692b1ae HEAD -- empireofgold` is empty | ☑ 2026-09-08 19:40 |
| RG interstitials / reality checks / session limits / age gate shown at full fidelity | one gate (`rgVerdict`) before launch, pre-load, pre-boot and reveal; reality check (`?rc=`), session limit (`?limit=`, `limit-player`), self-exclusion + 18+ register check; walkthrough in `demo/demo-flow.md` (min 8–10); smoke test asserts the gate | ☑ code + smoke test; ☐ device screenshots |
| No change to game mechanics or payouts | only lobby/shell/CDN/cache layers touched; the game's own splash/Play button is never auto-clicked | ☑ |
| No provider code modified | bundle diff since the first commit is empty; hash manifest matches | ☑ |

---

## Measurement method

Definitions (fix these once, then never change them mid-hackathon):

- **t0** — user tap on the game tile in the lobby (pointerdown).
- **t_shell** — game container / iframe visible with a non-blank frame (skeleton, poster or last frame).
- **t_first_paint** — first frame drawn by the game's own canvas.
- **t_playable** — spin button enabled (engine reports `primaryAssetsLoaded` + splash dismissed). This is the number for M1–M3.
- **Cold** = no service-worker cache, no HTTP cache, no prefetch. **Warm** = same device, second launch. **Prefetched** = predicted game, assets pulled before tap.

Harness: instrumented lobby page that records `performance.mark()` for each t_x, plus a
`PerformanceObserver` on resource timing to count cache hits vs network. Export as JSON to
`progress/runs/<date>-<label>.json`. Minimum sample: 10 cold launches per device per configuration.

Devices to test (fill in what we actually have):

| Device | Network | Notes |
|---|---|---|
| Android mid-range phone | 4G throttled (Chrome "Fast 3G" as proxy) | primary — matches "Casino Android" 72 % of launches |
| Android same phone | venue Wi-Fi | |
| Laptop Chrome | Wi-Fi | desktop web ("GM") |

---

## Baseline facts (from the bundle, measured 2026-09-08)

| Item | Value |
|---|---|
| Bundle on disk | 98 MB, 375 files |
| JS on critical path (br) | vendor-pixi 306 KB + core-engine 67 KB + game 8 KB + index 2 KB ≈ 383 KB |
| Spine atlases | 61.5 MB; `@1x` and `@0.5x` byte-identical → device downloads ~30 MB regardless of DPR |
| Sounds | 28 MB (ogg + mp3 both shipped; FBGM/BBGM music ≈ 5 MB each) |
| Load order in engine | PRELOADER → COMMON → PRIMARY (splash) → sounds → SECONDARY → FEATURES |
| Runtime API | api.spiniq.io (game server, prefs, history) |

Baseline timings (fill from harness):

| Run | Device | Network | t_shell | t_first_paint | t_playable p50 | p95 | Bytes on critical path |
|---|---|---|---|---|---|---|---|
| B0 | laptop (localhost, false positive) | none | 0.4 s | 1.1 s | 4.8 s | — | 28.0 MB / 64 req |
| B1 | laptop over cloudflared tunnel | Wi-Fi, no throttle (n=2) | 1.1 s | 2.8 s / 0.8 s | 8.4 s / 4.2 s | — | 25.3 MB / 63 req |
| B2 | laptop over tunnel | 30 Mbit/s, 28 ms | 1.2 s | 2.7 s | 11.4 s | — | 25.3 MB / 63 req |
| B3 | Pixel 7 profile over tunnel, CPU ×4 | 4G 9 Mbit/s, 170 ms (n=3) | 0.7–1.3 s | 5.2–5.6 s | 29.8 s (Play button 24.7–26.5 s) | 30.6 s | 23.4 MB / 63 req |
| B4 | Pixel 7 profile over tunnel, CPU ×4 | 3G 1.6 Mbit/s, 150 ms | — | — | 126.1 s (Play button 121.6 s) | — | 23.4 MB / 63 req |
| B5 | **real OnePlus Nord 3 5G (CPH2491, Dimensity 9000) over tunnel, adb-driven Chrome 152** | venue Wi-Fi (n=4) | 1.4–1.6 s | 2.8–4.3 s | Play button 8.1 / 9.9 / 11.8 / 32.8 s; playable ≈ +1 s | 32.8 s | 23.4 MB / 63 req |
| B6 | real OnePlus Nord 3 5G over tunnel | mobile data LTE (n=2) | 0.5–2.5 s | 2.0–4.3 s | Play button 7.7 / 13.7 s; playable 8.6 / 14.7 s | 14.7 s | 23.4 MB / 63 req |

---

## Accelerated runs (2026-09-08, emulated Pixel 7 profile, CPU ×4, origin throttled to 9 Mbit/s + 170 ms, through the Cloudflare tunnel)

Definitions: t0 = pointerdown on the lobby tile. Shell = poster visible. Reveal = game frame visible. Play button =
engine `PRIMARY_ASSETS_LOADED`. Play→idle = Play tap in the game to `IDLE_STATE_ENTRY` (reels). Prep = seconds of lobby
time before the tap needed to reach the scenario's state (prefetch + boot). Raw data: `progress/runs/2026-09-08-accel/`.

| Scenario (state at the tap) | Prep before tap | Shell | Reveal | Play button | Play→idle | Requests after tap (from SW) | MB after tap |
|---|---|---|---|---|---|---|---|
| cold — no service worker, nothing cached | — | 43 ms | 43 ms | 24.2 s | 9 ms | 117 (0) | 25.9 |
| sw-cold — worker installed, empty cache, engine drives | — | 37 ms | 37 ms | 24.1 s | 13 ms | 85 (85) | 0 on page side; all from origin |
| sw-cold + tap-time parallel fill (rejected) | — | 40 ms | 40 ms | 27.6 s | 10 ms | 106 (106) | |
| prefetched — critical set cached, engine not booted | 29.7 s (prefetch 23.2 MB in 26.6 s) | 37 ms | 37 ms | 2.8 s | 11 ms | 91 (91) | 0 |
| **warm — cached + pre-booted + parked** | 27–29 s (prefetch 24.4 s + boot 2.5 s) | 24–40 ms | **24–41 ms** | **before tap** | 11–17 ms | 1 (1) | 0 |
| warm-light — cached + booted to splash, PRIMARY held by the SW | 24–27 s | 23 ms | 23 ms | 1.2 s | 10 ms | 24–35 (all) | 0 |
| **hot — back to lobby, tap again** | — | 16 ms | **16 ms** | before tap | already at reels | 0 | 0 |

Memory cost of a parked game versus the lobby alone (laptop, Intel UHD, @1x atlases; `memprobe.js`):

| Warm level | Right after parking | 20 s later (engine settled) | Tap → Play button (phone ×4 CPU) |
|---|---|---|---|
| full (to Play button) | renderer +244 MB, GPU process +524 MB | +160 MB / +380 MB | before the tap (reveal 24–41 ms) |
| light (to splash, PRIMARY held) | +121 MB / +329 MB | +28 MB / +212 MB | 1.2 s |
| none (prefetched only) | 0 | 0 | 2.8 s |

Real-phone figures (`dumpsys meminfo`) still to do. Policy in `src/lobby/app.js` (`BUDGET`): one warm game at most; full only when
`navigator.deviceMemory ≥ 4`, light otherwise; dropped after 10 min idle or 60 s tab-hidden; prefetch capped at 3 game caches (LRU).

## After-matrix (2026-09-08, 18:35–19:05): every baseline configuration re-run through the tunnel with the accelerated lobby

Report with charts: `runs/2026-09-08-after/report.html` (published: https://claude.ai/code/artifact/7b399dea-44ad-4c47-9e7c-c53136b6aebb); merged
numbers in `runs/2026-09-08-after/after-data.json`; raw runs in `scripts/runs/after-*`. Link profiles now applied at the origin **per client**
(`link=<4g|3g|wifi>.<id>` cookie set by `run-lobby.js --net`), so several devices can share one tunnel. Headless Chrome; fresh context per run.
Before = navigation → Play button (baseline report). After = pointerdown on the tile → game frame visible with the Play button already on it.

| Configuration | Before: Play button | After: reveal (Play button ready) | Prep (lobby open → parked) | Play→reels | Requests / MB after tap |
|---|---|---|---|---|---|
| Laptop via tunnel, no throttle (n=2) | 7.0 s, 3.3 s | **6 ms, 7 ms** | 5.6 s, 3.8 s | 3 ms | 1–2 (worker) / 0 |
| Laptop, 30 Mbit/s + 28 ms | 10.2 s | **6 ms** | 8.1 s | 2 ms | 1 / 0 |
| Emulated Pixel 7, CPU ×4, 9 Mbit/s + 170 ms (n=19 warm) | 24.7 / 25.9 / 26.5 s | **p50 27 ms, p95 156 ms, max 156 ms** | p50 24.1 s, p95 28.8 s | p50 11 ms | 1–2 / 0 |
| same, hot (back to lobby, tap again) | — | **10 ms**, already at the reels | — | — | 0 / 0 |
| same, warm-light (low-memory budget) | — | reveal 23 ms, Play button **1.2 s** | 23.6 s | 11 ms | 39 (worker) / 0 |
| same, prefetched only (files on disk, engine not booted) | — | Play button **2.8 s** | 22.8 s | 11 ms | 88 (worker) / 0 |
| same, sw-cold (first visit, no pre-load) | — | Play button 23.3 s | 1.1 s | 9 ms | 84 (worker, all from origin) |
| same, cold through the lobby (no worker) | — | Play button 23.4 s | 1.7 s | 9 ms | 87 / 24.9 MB |
| Emulated Pixel 7, CPU ×4, 1.6 Mbit/s + 150 ms (3G) | 121.6 s | **27 ms** | 121.6 s | 9 ms | 1 / 0 |
| Real OnePlus Nord 3, Wi-Fi (n=4) / LTE (n=2) | 8.1–32.8 s / 7.7–13.7 s | **not re-run: phone not attached over USB during this session** | | | |

Failures and exclusions: `warm-11` never reached the parked state — the tunnel answered three pre-load requests with HTTP 530 and the engine's
loader gave up on the first failed file (counted as a failed session, excluded from the percentiles; `sw.js` now retries 5xx up to twice).
`warmlight-1` was tapped before the download finished (harness ready-condition bug, fixed; folder renamed `invalid-…`), re-run as `warmlight-2`.
The `direct-desktop` (localhost) configuration was not re-run: it is the false positive the baseline report exists to disprove.

Population projection (`var/predict-eval.json`, from the causal replay + the measured state times; gap between launches from the log decides
whether the pre-load had time to finish; the worker keeps the last 3 games on disk):

| Profile | Path mix (hot / warm / light / prefetched / cold) | p50 before → after | p95 before → after | under 500 ms | under 3 s |
|---|---|---|---|---|---|
| Emulated 4G phone, 1 warm slot | 13 / 25 / 0 / 26 / 36 % | 24.7 s → **2.8 s** | 24.7 s → 24.2 s | 38 % | 64 % |
| Emulated 4G phone, 3 warm slots (projection) | | 24.7 s → **41 ms** | 24.7 s → 24.2 s | 57 % | |
| Laptop, 1 warm slot | 13 / 25 / 0 / 27 / 34 % | 6.3 s → 1.0 s | 6.3 s → 6.3 s | 38 % | 66 % |
| Laptop, 3 warm slots | | 6.3 s → **7 ms** | 6.3 s → 6.3 s | 59 % | |

## Findings from other devices (2026-09-08, 17:58–18:20, via the tunnel, read from the launch/preload beacons in `var/events.jsonl`)

| Device / network | What happened | Numbers |
|---|---|---|
| Windows laptop, Chrome, user's own link | First visit without consent: the plain cold path through the lobby | Play button 10.9 s, then 5.1 s on a later empty-cache launch |
| same | Second cold launch, **no service worker**, only the browser HTTP cache (immutable headers) | Play button 0.79–1.1 s: the edge headers alone give a ~10× repeat-visit gain even where the worker is off |
| same | Hard-reloaded page: worker installed but not controlling → "waiting for accelerator", every launch cold | fixed: lobby reloads itself once (guarded) |
| same, consent on | Warm launches | reveal 5–10 ms, Play button before the tap (n=6); hot 2–13 ms |
| same, first visit with staged preload | light-ready 2.0–3.5 s, full-ready 4.1–6.5 s (download 25.1 MB in 3.6–5.8 s); with the phone downloading at the same time: 13.5 s | tunnel throughput is the ceiling |
| same, revisit | full-ready 0.8–2.4 s, nothing downloaded | |
| **OnePlus (CPH2707, Android 16), its own network** | First visit, consent on, staged preload | light-ready **4.7 s**, prefetch of 23.2 MB done 8.3 s, **full-ready 9.0 s** after opening the lobby (engine boot 5.8 s of that, overlapped with the download) |

Notes: "4g" in the lobby card is Chrome's link-quality bucket (also on Wi-Fi), not the radio. On phones the game requests
fullscreen on the Play tap, which covers the lobby's top bar until fullscreen is left; the back control handles it.

## Late-evening pass (2026-09-08, 21:40–22:40): can preload, cold and hot go lower?

Method: fresh quick tunnel (`keith-bunny-contractors-recognized`), accelerated origin on 8080, per-client link profiles, headless Chrome,
one configuration change per run, A/B runs interleaved on the same tunnel minutes. Raw runs `scripts/runs/x1-* … x4-*`; link utilisation
per run computed from `var/edge-access.jsonl` (union of the origin's busy intervals ÷ span). Times below are lobby-open → event
(preload) or tap → Play button (cold); `full` = `PRIMARY_ASSETS_LOADED` in the parked frame.

**Where the time goes (before any change tonight).** Both remaining slow paths are at the link's byte floor, not at a request or
scheduling problem:

| Path (emulated 4G phone, 9 Mbit/s + 170 ms, CPU ×4) | Span | Origin busy | Idle | Effective rate | Floor for 23.2 MB at 9 Mbit/s |
|---|---|---|---|---|---|
| cold through the worker, engine drives (tap → Play button) | 23.3 s | 21.0 s | 2.3 s (JS parse 0.8–1.5 s, phase transitions 4.3–5.2 s, tail) | 8.35 Mbit/s (90 %) | 21.6 s |
| preload (first game byte → prefetch done, 8 streams) | 21.2 s | 20.6 s | 0.6 s | 8.75 Mbit/s (97 %) | 21.6 s |
| preload → Play button ready (light frame upgraded after the download) | 23.2 s | | 2.0 s of engine CPU after the last byte: atlas decode 0.7 s + OGG decode 1.3–1.7 s | | |

The bytes cannot move without touching the bundle: the engine's Play button waits for `assetsLoaded && soundsLoaded`
(`checkToCreateGame` in core-engine), and it fetches the eager sounds (BBGM.ogg 4.6 MB + genericButtonSound) only *after* the PRIMARY
atlases, so 20 % of the critical set is a serial tail on a cold link. Hot relaunch was 10–16 ms (one frame) and was not re-measured.

**Experiments (one run each unless noted; `x1-*`, `x2-*`).**

| # | Idea | Link | Result | Verdict |
|---|---|---|---|---|
| E1 | Tap-time cache fill in manifest order, 2 streams (`?fill=1&cc=2`), so the link never idles between the engine's phases | 4G | Play button **36.6 s** vs 24.9 s engine-driven. Edge log: the fill and the engine waited on each other, link idle 4.5 s in the first 10 s | ✗ rejected (third time: cc=6 → 27.6 s this afternoon) |
| E2 | same, 1 stream (`cc=1`) | 4G | 24.7 s vs 24.9 s | ✗ no effect (the engine simply overtakes the fill) |
| E3 | same, 2 streams | wifi 30 Mbit/s | 7.4 s vs 7.7 s | ✗ noise |
| E4 | Eager full pre-boot from the first byte instead of staged light → full (`?warm=eager`, new harness scenario `warm-eager`) | 4G / wifi / raw tunnel | full-ready 22.6 vs 23.2 s / 7.7 vs 7.6 s / 4.7 vs 4.3 s | ✗ wash; staged kept (memory story unchanged) |
| E5 | 16 prefetch streams instead of 8 (`?cc=16`) | raw tunnel, 3 interleaved pairs | full-ready **3.57 s vs 4.03 s** (download 2.87 vs 3.33 s): the real WAN path is round-trip-bound, not bandwidth-bound | ✓ but only after the light tier: on 4G flat 16 streams delayed light-ready 9.1 → 13.5 s (the light tier shared the link with 15 atlases) and gained nothing (21.5 vs 21.2 s) |

**Changes adopted from this (SW_VERSION `accel-2026-09-08-5`; A/B numbers in the next table).**

1. *Two-stage prefetch concurrency*: 8 streams until the light tier (BOOT…SPLASH, 3.6 MB) is on disk, then the pool grows to 16
   (`boost` in `sw.js prefetch`, `BUDGET.boostConcurrency`, `?boost=`). The worker now reports the contiguous completed *prefix* of the
   manifest order in every `prefetch-progress` message.
2. *Upgrade at PRIMARY-complete*: the light frame is upgraded to full as soon as the prefix reaches the end of the PRIMARY tier
   (`prefetch_primary_done` event), instead of at `prefetch-done`, so the engine decodes the atlases while the music is still
   downloading; its own request for the music joins the prefetch already in flight. The eager sounds are moved to the end of the prefetch
   order on every device (in the merged manifest the desktop `@1x` light files were listed *after* the sounds, so the desktop light tier
   used to queue behind 4.6 MB of music). `?early=0` restores the old trigger.
3. *Streaming worker responses*: `networkFetch` hands the response to the engine when the headers arrive and writes the cache from a
   clone in the background (`puts` map; the key stays in `inflight` until the write is done, so a second request still de-duplicates).
   Before, every file — including the 4.6 MB `king_character.png` — reached the engine only after its own cache write. `?stream=0`
   (registers `/sw.js?stream=0`) restores the old behaviour for A/B runs.

**A/B of the adopted changes, interleaved on the same tunnel minutes (`x4-*`, 22:05–22:18).** A = old behaviour
(`boost=8&early=0&stream=0`), B = new defaults. Preload: lobby open → download done → Play button ready in the parked frame.

| Link | Path | A (old) | B (new) | Reading |
|---|---|---|---|---|
| raw tunnel (real WAN, desktop) | preload, 3 pairs | download 3.5 / 3.3 / 5.1 s → full 4.2 / 4.0 / 5.8 s | download 4.2 / 5.3 / 3.5 s → full 4.7 / 5.7 / 3.9 s | **no reproducible gain**: run-to-run tunnel variance (±1 s) exceeds any effect; the post-download tail shrinks 0.7 → 0.4 s (early upgrade) |
| wifi profile 30 Mbit/s + 28 ms | preload, 3 pairs (one A run failed: tunnel 530 burst, 28 of 59 files, engine loader gave up — reported, not dropped) | download 6.8 / 7.0 s → full 7.4 / 7.7 s | download 7.9 / 8.0 / 7.3 s → full 8.4 / 8.5 / 7.7 s | **B slower by ~0.6 s**; separated in the next table |
| wifi profile | cold (sw-cold, tap → Play button), streaming only, 2 pairs | 8.50 / 8.48 s | 7.48 / 8.45 s | streaming worker: −0.5 s or noise (n=2) |
| 4G phone profile | cold, streaming only, 1 pair | 25.37 s | 25.23 s | no effect (bandwidth-bound) |
| 4G phone profile | preload (`x3-*`, not interleaved) | 23.2 s (earlier ref) | 23.2 / 24.8 s | no effect; the tail after the last byte is the engine's OGG decode |
| 4G phone profile | hot relaunch | 10–16 ms (8 Sep 19:00) | 13 ms | unchanged |

Separating the two preload changes on the wifi profile (`x6-*`, interleaved A/C/D, 2 each): A = old; C = early upgrade + streaming, 8
streams; D = 16 streams + streaming, late upgrade.

| Variant | Download done | Play button ready | Tail after the last byte |
|---|---|---|---|
| A old | 7.6 / 7.8 s | 8.7 / 8.9 s | 1.1 / 1.1 s |
| C early upgrade | 8.1 / 7.3 s | 8.7 / 7.9 s | **0.6 / 0.6 s** |
| D 16 streams | 7.1 / 6.7 s | 8.1 / 7.1 s | 1.0 / 0.4 s |

**Verdicts and shipped defaults.** *Early upgrade*: kept on — the only change with a consistent effect (tail 1.1 → 0.6 s on wifi,
0.7 → 0.4 s on the raw tunnel; nothing on 4G, where the tail is the OGG decode). *Streaming worker*: kept on (neutral everywhere,
−0.5 s or noise on wifi cold; the engine now sees bytes as they arrive). *8 → 16 streams*: **off by default**
(`BUDGET.boostConcurrency` = 8): −0.45, +0.1, +0.7, −0.8 s across four interleaved pair sets is noise, and the 4G preload downloads
looked 0.3–0.5 s slower with it (21.3–21.7 vs 21.1–21.2 s); `?boost=16` keeps it measurable. Net effect of the evening on the
headline numbers: preload on the emulated 4G phone unchanged at 23.2 s (download 21.7 s = 97 % of the link + 1.5 s engine decode),
preload on the laptop via the real tunnel 3.9–4.7 s (tunnel-bound), cold unchanged (24.5–25.4 s 4G, 7.5–8.5 s wifi), hot 13 ms,
files-only path 2.78 s (unchanged).

Light-path A/B (`x5-*`, warm-light on the 4G profile, CPU ×4) was **contaminated**: someone was using the laptop during the runs
(Edge and Helium browser renderers, 65 % CPU); with the ×4 throttle the parked frame took 5.8–28.7 s to reach the Play button from
a fully cached set (shell paint 200–400 ms instead of 15 ms). Those four runs are kept on disk but not used; yesterday's 1.2 s (n=2)
stands until re-measured on a quiet machine.

**Robustness (from two failed sessions: `after-…-warm-11` yesterday, `x4-wifi-warm-A-2` tonight — the quick tunnel answered HTTP
530 for ~15 s, 28 of 59 files failed after the worker's three retries, the engine's loader gave up and the frame stayed `booting`).**
Worker: files that failed get two more passes (after 2 s and 6 s) before the job reports done. Lobby: a prefetch that ends with
errors is not "complete", the pre-boot is not upgraded, and the prefetch is re-run (8 s × attempt, at most three times); a frame
still `booting` 15 s after a clean prefetch-done is dropped and booted again from the cache (`armBootWatchdog`, once). Test hook:
`run-lobby.js --chaos 60.10` (cookie `chaos=<pct>.<seconds>.<id>`, `chaosHit` in `src/edge/server.js`) makes the origin answer
60 % of the client's game-asset requests with 530 for 10 s.

Chaos results (`x7-wifi-chaos-*`, wifi profile, first visit; before tonight such a session stayed `booting` forever):

| Injection | Pre-load done (after retry passes) | Frame rebooted by the watchdog | Play button ready in the parked frame | Tap → reveal |
|---|---|---|---|---|
| 60 % of requests 530 for 10 s | 14.7 s | 29.8 s | **31.1 s** (before the tap) | 7 ms |
| 60 % for 10 s | 14.0 s | 29.1 s | **30.3 s** | 11 ms |
| 90 % for 15 s | 21.4 s | 36.5 s | **37.2 s** | 6 ms |

(The watchdog delay was 15 s in these runs and is 10 s in the shipped lobby, so the same sessions would be ready ~5 s earlier.)

Final sanity set on the shipped defaults (`x7-*-final-*`, 22:31–22:33, one run each): emulated 4G phone preload Play-button-ready
**21.9 s** (download 21.1 s), 4G cold 23.9 s, wifi preload 8.2 s, laptop via the raw tunnel 4.0 s, hot relaunch **5 ms**;
files-only (prefetched, engine not booted) 2.78 s (`x5-4g-prefetched-B-1`). All run tables: `runs/2026-09-08-night/tables.md`. Re-check 22:50–22:53 (`y1-*`, same tunnel, n=2 on 4G): 4G preload full-ready 21.8 / 22.4 s, 4G cold Play button 23.6 / 23.7 s, wifi preload 7.8 s, raw tunnel 4.0 s, hot relaunch 6 ms, reveal 6–26 ms — unchanged from the 22:33 sanity set. Preload-on set 22:55–22:59 (`y2-*`, n=2 on 4G): first visit on the 4G phone profile is full-ready 22.3 / 22.4 s after opening the lobby (23.2 MB at 86 % link utilisation), then tap → reveal 19–24 ms with the Play button already on screen; **return visit** on the same device is full-ready 2.0 / 2.1 s and parked 3.2 / 3.3 s with zero download, tap → reveal 24 / 27 ms; files-only (no pre-boot) tap → Play button 2.76 s; light pre-boot 1.23 s; wifi first visit 8.0 s → return 0.6 s; raw tunnel 3.0 s → 0.6 s; hot 5 ms.
This pass is also section 9 of the before/after report (`runs/2026-09-08-after/report.html`, published artifact 7b399dea), section 7b
of the baseline cold-load report (`runs/2026-09-08-baseline/report.html`, artifact f45c71e5: byte floor, idle-gap anatomy, tap-time
ideas rejected, provider-side levers) and `BASELINE_LOAD_ANALYSIS.md`; the submission audit page (artifact f950ab3b) carries a 22:45
update box.

## Iteration log

Format: one row per measured change. Keep failed experiments too.

| Date | Iter | Change | Layer | Raw / Perceived | p50 before → after | p95 before → after | Other metric moved | Keep? | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2026-09-08 | 0 | Baseline instrumented (tunnel + throttled Chrome, engine milestones hooked) | harness | — | 29.8 s phone-4G / 8.4 s laptop | 30.6 s | video verified: 41 s aborted, 19 s warm retry | — | see BASELINE_LOAD_ANALYSIS.md, runs/2026-09-08-baseline/report.html |
| 2026-09-08 | 1 | Edge: versioned bundle path, `immutable` 1-year caching, brotli for text assets (spine JSON 2.2 MB → 98 KB), shipped `.br` for JS, Range for audio (`src/edge/server.js`) | origin | raw | Play button 24.7–26.5 s → 24.2 s (cold, no SW) | — | text bytes −4 MB; link still saturated by 20 MB of PNG/OGG | ✅ | bandwidth-bound: compression alone cannot move a cold load |
| 2026-09-08 | 2 | Service worker cache-first for `/games/*`, in-flight de-dup, Range from cache (`src/lobby/sw.js`) | SW | raw | cold-sw 24.1 s (= cold; no overhead) | — | 100 % hit on repeat | ✅ | tap-time parallel fill of the whole critical set measured **slower** (27.6 s): competes with the engine on a saturated link → off by default (`?fill=1`) |
| 2026-09-08 | 3 | Predicted-game prefetch of the 97-file critical set (23.2 MB @0.5x) after opt-in, in phase order, 6-way; skipped on data-saver / 2G / RG-blocked | lobby+SW | raw | Play button 24.2 s → **2.8 s** (prefetched, engine boots from cache on ×4 CPU) | — | prefetch takes 24–27 s on 4G (window needed before the tap; median gap between launches in the log is 221 s) | ✅ | 2.8 s is the engine's own CPU boot: JS parse, atlas decode, view build. Cannot go lower without pre-booting |
| 2026-09-08 | 4 | Pre-boot the predicted game in a hidden same-origin frame behind the lobby; park with the engine's `stopPixiApp()` once the Play button is ready; secondary tier (19 MB) held back by the SW until reveal; resume with `startPixiApp()` on tap | lobby | raw | **Play button before the tap; reveal 30–41 ms; Play→reels 12–17 ms** (n=3) | 41 ms | 1 request after the tap; 49 secondary requests deferred while parked | ✅ | this is the sub-500 ms path. Cost: +244 MB renderer / +524 MB GPU-process memory for one parked game (laptop, @1x) → budget: max 1 warm game, only on ≥ 4 GB devices, 10-min idle TTL, dropped after 60 s hidden |
| 2026-09-08 | 5 | Hot relaunch: on back-to-lobby the frame is parked and kept 5 min; the game leaves fullscreen; tap again reveals the frame at the reels | lobby | raw | **16 ms**, playable at reveal | — | 0 requests | ✅ | |
| 2026-09-08 | 6 | Perceived load: poster (splash art) + game name + status text/progress within the next frame after pointerdown, on every path | lobby | perceived | blank screen 21 s (video) → 0; shell 37–43 ms | — | | ✅ | |
| 2026-09-08 | 8 | **Staged warm**: boot to the splash the moment the prefetch starts (first 3.7 MB), upgrade to full in place when the rest lands; worker remembers the consented plan and starts filling on the lobby navigation itself; 8 parallel streams | lobby+SW | raw (prep time) | laptop via tunnel, first visit: light-ready **2.2 s**, full-ready 3.9 s (sequential: 4.6 s); **revisit 1.3 s** to full-ready (all from cache) | — | preload cost is one download per game version per device | ✅ | first-visit time is the 25 MB download at the link's speed (tunnel: 3–7.5 MB/s → 3.3–6.5 s); after that only the engine boot remains |
| 2026-09-08 | 7 | Light pre-boot (JS + preloader + splash only; the SW holds the PRIMARY atlases and sounds until the tap) for devices under the memory budget | lobby+SW | raw | laptop: reveal 6 ms, **Play button 420 ms** after tap, Play→reels 2 ms; emulated phone ×4 CPU: reveal 23 ms, **Play button 1.2 s**, Play→reels 10 ms (n=2, headed = headless) | — | 24–35 requests after tap, all from cache | ✅ | memory while parked: +121 MB renderer / +329 MB GPU right after boot, settling to **+28 MB / +212 MB** after 20 s (full pre-boot: +244 / +524 settling to +160 / +380). The engine decodes and uploads the PRIMARY atlases after the tap, which is the 1.2 s on a ×4 CPU |

| 2026-09-08 | 9 | Per-client link profiles at the origin (`link=<profile>.<id>` cookie → own token bucket + latency; `run-lobby.js --net` sets it) and a bucket fix for rates below one chunk per 0.2 s (3G deadlocked before) | origin+harness | — (measurement) | — | 4g/3g/wifi profiles verified: 4.75 MB file in 4.2 s / 23.3 s / 1.4 s | ✅ | lets an emulated 4G phone and a real phone share one tunnel; the cold run through the lobby reproduces the baseline (23.4 s vs 24.7–26.5 s) |
| 2026-09-08 | 10 | After-matrix: every baseline configuration re-run through the tunnel (warm ×2 laptop, wifi, 4G ×20, 3G, plus hot/light/prefetched/sw-cold/cold on 4G) | harness | raw | 4G phone 25.9 s → **27 ms** (p50, n=19); laptop 7.0/3.3 s → 6–7 ms; 3G 121.6 s → 27 ms | 4G p95 156 ms | 1 of 20 sessions failed on tunnel HTTP 530 | ✅ | report: `runs/2026-09-08-after/report.html` + artifact 7b399dea |
| 2026-09-08 | 11 | Next-game prediction replayed causally on the event log (`src/predict/build.js`): last game + transition matrix + player affinity + popularity, weights picked on the first 60 % of the month | analysis | — | top-1 37.1 %, top-3 59.6 % (holdout); population p50 24.7 s → 2.8 s with one warm slot, → 41 ms with three | — | M8 measured | ✅ analysis only | **not wired into the lobby**: the sandbox has one bundle, so there is nothing to rank (user decision 2026-09-08 19:00) |
| 2026-09-08 | 13 | Compliance pass (evening): session-limit hard stop that also discards the pre-loaded game; reality-check buttons equal weight; "ready" badge and diagnostics moved into a collapsed instrumentation panel (`?debug=1`); last-game id stored only under consent and removed on revoke; modal Tab trap; RG banner; edge never logs a client address; committed run files scrubbed of SSID/MAC/IP; `--baseline` edge mode + `/compare` page; `tests/smoke.js` (30 checks) + bundle hash manifest | lobby+edge+tests | compliance / demo | — | — | no timing change intended; smoke test green | ✅ | see docs/compliance-note.md |
| 2026-09-08 | 12 | Service worker retries transient 5xx (up to 2 retries, 300/1200 ms) before handing a response to the engine | SW | robustness | — | — | removes the failure mode seen in warm-11 (tunnel 530 → engine "Error loading bundles") | ✅ | SW_VERSION accel-2026-09-08-4 |
| 2026-09-08 | 14 | Late-evening experiments E1–E5 (tap-time fill at 1/2 streams, eager pre-boot, flat 16 streams) via the tunnel | lobby+SW | — | cold 24.9 → 36.6 s (fill cc=2) / 24.7 s (cc=1); preload full-ready unchanged | — | link utilisation measured: cold 90 %, preload 97 % of the 9 Mbit/s profile | ❌ all rejected | see "Late-evening pass" above |
| 2026-09-08 | 15 | Upgrade the light pre-boot at PRIMARY-complete (eager sounds last in the prefetch order); streaming worker responses with background cache write; two-stage 8 → 16 streams behind `?boost=` | lobby+SW | raw (prep tail) | post-download tail 1.1 → 0.6 s wifi, 0.7 → 0.4 s raw tunnel; 0 on 4G | — | cold/hot unchanged; boost = noise, off by default | ✅ (early, stream) / ⚪ (boost off) | SW_VERSION accel-2026-09-08-5; interleaved A/B `x4-*`, `x6-*` |
| 2026-09-08 | 16 | Pre-load robustness: two extra worker passes for failed files, lobby re-runs an errored prefetch and never marks it complete, boot watchdog reboots a stuck frame; `--chaos` failure injection at the edge | lobby+SW+edge+harness | robustness | — | — | two failed sessions (warm-11, x4-wifi-warm-A-2) reproduced with `--chaos 60.10`; result in the chaos table below | ✅ | |
| 2026-09-09 | 17 | Pre-load **on by default** (`PRELOAD_DEFAULT_ON` in `src/lobby/app.js`); the per-player switch-off is stored and honoured on reload; compare-page wording, smoke test and docs (README, compliance note, demo flow, impact case) updated | lobby | — (demo UX) | — | — | verified 07:55 through a fresh tunnel with no URL flags: switch on at 0.7 s, worker 1.3 s, prefetch + light pre-boot start at 1.8 s, parked-light 5.6 s, full ready 25.7 s (raw tunnel, one stall); off + reload stays off with nothing fetched; on again → ready from cache at once | ✅ | `npm test` 30/30; old tunnel keith-bunny died overnight, new one implied-firmware-dakota-expectations |
| 2026-09-09 | 18 | Edge deployed on **Render** (Singapore, `render.yaml`), https://feg-hackathon.onrender.com; harness run against it (`r1-*`) | hosting | raw (path of the bytes) | laptop preload full-ready 7.2 / 7.2 s (25 MB at 3.6 MB/s), return visit 0.9 s, reveal 5–6 ms; 4G profile cold 25.2 s, preload 23.1 s, reveal 29 ms; hot 6 ms | — | brotli, immutable, Range, worker scope all verified over Render; first request after idle 12.5 s (instance wake-up), then 0.28 s | ✅ | no baseline service deployed yet, so /compare has no "today" origin on Render |

Candidate iterations (tick as done, reorder freely):

- [x] I1 Instrumented harness + baseline (emulated Android over tunnel + real OnePlus Nord 3 via adb) (M1, M2, M6 measured) — `scripts/loadtime-harness/` (`run.js` emulated, `run-android.js` real device)
- [x] I2 Lobby → game transition: poster + status within one frame of the tap (perceived) — `src/lobby/` (tile-to-frame animation not done)
- [x] I3 Service worker precache (whole critical set per game, not only engine JS) — `src/lobby/sw.js`
- [x] I4 Edge: brotli, immutable cache headers, versioned paths — `src/edge/server.js` (HTTP/2/3 and preconnect are CDN-side; `config/` not written yet)
- [ ] I5 Prefetch next game on hover/scroll-intent from search results & category rows (raw, prediction)
- [x] I6 Predict next game per player: last game + affinity + global transition matrix, replayed causally (M8 = 37 % / 60 %) — `src/predict/build.js`, analysis only (single-bundle sandbox; not in the lobby)
- [x] I7 Warm game iframe in background for predicted game — RG gate (register check, reality check) runs before reveal; frame parked with the engine's own suspend hook
- [x] I8 Defer the secondary tier (SECONDARY + lazy sounds, 19 MB) while a warm frame is parked — SW hold/release, no bundle edits
- [ ] ~~I9 Serve only one resolution folder~~ dropped: `spines/@1x` and `@0.5x` are **not** fully identical (`king_character.png` differs), `images/` differ; the edge serves exactly what the engine asks for
- [x] I10 Side-by-side demo page: `/compare?baseline=<origin B>` embeds the baseline lobby (served by `server.js --baseline`: no edge compression, no-store, no worker) next to the accelerated one; one button opens the game on both; live raw/perceived timers from the lobbies' own marks (postMessage)

---

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-09-08 | Bundle stays byte-identical; all work in lobby shell, SW, CDN, prediction service | contractual constraint in brief |
| 2026-09-08 | Emulated-phone runs throttle at the **origin** (`--throttle 9 --latency 170`), not in Chrome | Chrome's network emulation does not apply to service-worker fetches; the first matrix showed a 3.4 s "cold" that was really an unthrottled worker. Origin throttle reproduces the baseline (cold 24.2 s vs 24.7–26.5 s) |
| 2026-09-08 | **Resource budget**: prefetch = disk only, at most 3 game caches (LRU); pre-boot = at most ONE game, full pre-boot only when `navigator.deviceMemory ≥ 4`, else light; dropped after 10 min idle, 60 s tab-hidden, on data-saver; hold secondary tier while parked | one parked game measured at +244 MB renderer / +524 MB GPU process (laptop). A lobby with 100 games must never pre-boot more than one, and never on low-memory phones |
| 2026-09-08 | Do not auto-click the game's own Play/splash button from the lobby | the splash is part of the certified flow; auto-starting a game from outside it is a provider-behaviour change. "Playable" = Play button on screen and responsive; Play→reels is measured separately (12–17 ms) |
| 2026-09-08 | Preload is staged (light first, full when downloaded) and remembered by the worker across visits | user-visible "preload time" on a first visit is the 25 MB download; staging gives a usable light state at ~2 s and overlaps the engine boot with the download; the revisit needs no download at all |
| 2026-09-08 | Tap-time parallel cache fill stays off | measured 27.6 s vs 24.2 s: on a saturated 4G link it only reorders bytes and delays what the engine is waiting for |
| 2026-09-08 | All after-measurements go through the Cloudflare tunnel (`https://<name>.trycloudflare.com/?player=demo-player`), never localhost; link profiles are applied per client at the origin | localhost numbers are the false positive; Chrome's emulation misses service-worker fetches; per-client profiles let the phone and the emulated runs share one tunnel |
| 2026-09-08 | No prediction ranking in the lobby while the sandbox has one bundle | nothing to choose between; the replay stays as offline analysis for the impact case (M8 and the population projection) |
| 2026-09-09 | Pre-load **on by default** in the demo build (`PRELOAD_DEFAULT_ON` in `src/lobby/app.js`); the lobby switch turns it off per player and the choice is stored | the pre-load is a cache optimisation, not a consent flow: in production every game pre-loads and the player only taps; the switch is a preference. The compliance note states this reading of ePrivacy Art. 5(3) as the item for Legal review; `PRELOAD_DEFAULT_ON = false` exists only if Legal disagrees |
| 2026-09-08 | Report failed sessions, do not drop them | warm-11 (tunnel 530) is listed in the report as a failure and excluded from percentiles with the reason |
