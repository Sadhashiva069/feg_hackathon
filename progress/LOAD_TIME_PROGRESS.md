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
| M1 | Cold load p50 (tap → first interactive spin) | < 500 ms | _TBD_ | _TBD_ | raw | ☐ |
| M2 | Cold load p95 | < 500 ms | _TBD_ | _TBD_ | raw | ☐ |
| M3 | Warm / prefetched load p50 | < 500 ms | _TBD_ | _TBD_ | raw | ☐ |
| M4 | Launch-to-play conversion (launches that reach first spin) | ↑ vs baseline | _TBD_ | _TBD_ | — | ☐ |
| M5 | Games sampled per session | ↑ vs 2.2–3.1 (trends xlsx) / p50 3 (event log) | 3 | _TBD_ | — | ☐ |
| M6 | Perceived-load quality (time to first meaningful paint of game, skeleton/preview shown, blank-screen ms) | blank screen < 100 ms | _TBD_ | _TBD_ | perceived | ☐ |
| M7 | Cache hit rate (asset requests served from SW/edge cache) | > 90 % on repeat | _TBD_ | _TBD_ | raw | ☐ |
| M8 | Prefetch accuracy (prefetched game == next launched game) | > 50 % top-1 / > 75 % top-3 | _TBD_ | _TBD_ | raw | ☐ |
| M9 | Prefetch waste (MB downloaded never used per session) | minimise | _TBD_ | _TBD_ | — | ☐ |

Guardrail checks (must stay ✅ on every iteration):

| Guardrail | How verified | Status |
|---|---|---|
| Certified bundle unaltered | hash of `empireofgold/` tree matches original zip listing | ☐ |
| RG interstitials / reality checks / session limits / age gate shown at full fidelity | walkthrough on device, screenshots in `demo/` | ☐ |
| No change to game mechanics or payouts | only lobby/shell/CDN/cache layers touched | ☐ |
| No provider code modified | diff of bundle = empty | ☐ |

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
| B0 | | | | | | | |

---

## Iteration log

Format: one row per measured change. Keep failed experiments too.

| Date | Iter | Change | Layer | Raw / Perceived | p50 before → after | p95 before → after | Other metric moved | Keep? | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2026-09-08 | 0 | Baseline instrumented | harness | — | | | | — | |

Candidate iterations (tick as done, reorder freely):

- [ ] I1 Instrumented harness + baseline on real Android (M1, M2, M6 measured)
- [ ] I2 Lobby → game transition: keep lobby visible, animate tile into game frame, show poster/last-frame of game instantly (perceived)
- [ ] I3 Service worker precache of engine JS (vendor-pixi, core-engine) shared across games (raw)
- [ ] I4 Edge/CDN: brotli, HTTP/2 or 3, long-lived immutable cache headers, preconnect to api.spiniq.io (raw)
- [ ] I5 Prefetch next game on hover/scroll-intent from search results & category rows (raw, prediction)
- [ ] I6 Predict next game per player: last game + top-3 affinity + global transition matrix (from `data/challenge3_game_load/derived/`) (M8)
- [ ] I7 Warm game iframe in background for predicted game (pre-rendered, hidden) — check RG interstitial still fires before reveal
- [ ] I8 Priority hints / preload for PRIMARY bundle assets, defer sounds and FEATURES (raw, order only, no bundle edits)
- [ ] I9 Serve only one resolution folder path from the edge (both are identical) — via CDN rewrite, not by editing bundle
- [ ] I10 Side-by-side demo page: baseline vs solution with live timers

---

## Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-09-08 | Bundle stays byte-identical; all work in lobby shell, SW, CDN, prediction service | contractual constraint in brief |
