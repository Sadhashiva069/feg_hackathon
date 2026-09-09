# Architecture — Game Load Accelerator

The certified game bundle is frozen, so its load cost cannot be reduced; it can only be **paid earlier** (before the tap, with consent), **paid elsewhere** (at the edge), or **hidden** (perceived load). The accelerator does all three from outside the bundle.

## Components

| Component | Role | Prototype (this repo) | Production on FEG's stack |
|---|---|---|---|
| **Edge / origin** | Serves the bundle from a versioned, immutable path; brotli for the text assets the provider ships uncompressed (Spine JSON 2.2 MB → 98 KB); shipped `.br` for JS; Range for audio; ETag. Optional per-client link throttling for measurement. | `src/edge/server.js` (Node, no dependencies) | NGINX + CDN rules in `config/nginx.conf.example` (HTTP/2, brotli_static/brotli, immutable cache headers). No application code. |
| **Service worker** | Cache-first for `/games/<id>/<version>/*`; in-flight de-duplication; prefetch jobs with bounded concurrency; Range served from cache; **hold/release** of the non-critical tier (SECONDARY bundle + lazy sounds, 19 MB) while a game is pre-booted but not shown; retries transient 5xx per request and re-passes failed files twice per prefetch job; hands responses to the engine as the bytes stream and writes the cache from a clone in the background; reports the contiguous completed prefix of the manifest order; optional second concurrency stage once the light tier is on disk; LRU cap of 3 game caches; remembers a consented plan and starts filling on the next visit. | `src/lobby/sw.js` | Same file, served at the casino origin. |
| **Lobby shell** | Consent, RG gate, prediction hook, staged pre-load (light → full), hidden same-origin pre-boot parked with the engine's own `stopPixiApp()`, reveal on tap with `startPixiApp()`, hot relaunch, poster + status within one frame, measurement marks and beacons, embed protocol for the side-by-side page. | `src/lobby/app.js` (Vue 3, one file) | An `accelerator` module inside the Vue lobby exposing four calls: `init({player, consent})`, `plan(gameIds)`, `launch(gameId)`, `back()`. The lobby's existing tiles call `launch`. |
| **Prediction** | Next-game model: last game in session, transition matrix, per-player affinity, popularity; replayed causally on the sample log to measure accuracy and project the launch-time distribution. | `src/predict/build.js` (offline analysis; the sandbox has one bundle, so the lobby's `predict()` only needs "last game") | Small Python service on the existing `casino_game_launch` stream (Kafka) with per-player state in Redis; returns up to three candidate game ids after opt-in. |
| **Measurement** | Real Chrome over CDP through a Cloudflare tunnel (never localhost), engine milestones hooked from the Pixi emitter, on-device sampling over adb; before/after report. | `scripts/loadtime-harness/` | The same marks emitted as analytics events (`shell`, `reveal`, `play_button`, `idle`) per launch path. |
| **Side-by-side demo** | Two lobbies on one device: the baseline origin (as shipped: no compression, no caching, no worker) and the accelerated origin; one button opens the game on both; live timers. | `src/lobby/compare.html`, `server.js --baseline` | Demo only. |

## Launch paths (what is true at the tap)

```
tap ─► RG gate (self-exclusion, 18+, session limit, reality check due?) ─► blocked / interstitial
       │ allowed
       ├─ hot        frame kept from the last play (≤ 5 min)              reveal 10–16 ms, already at the reels
       ├─ warm       cached + pre-booted + parked at the Play button      reveal 27 ms p50 / 156 ms p95 (4G phone, n=19)
       ├─ warm-light cached + booted to the splash (low-memory devices)   Play button 1.2 s
       ├─ prefetched files on disk, engine not booted                     Play button 2.8 s (engine CPU boot)
       ├─ cold-sw    worker on, nothing cached                            Play button 23–24 s on 4G (= today)
       └─ cold       no worker                                            Play button 24–26 s on 4G (= today)
```

On every path the poster, game name and status appear within the next frame after the tap (37–43 ms): the blank screen (21 s in the walkthrough video) is gone. That gain is **perceived**; every number above it is **raw** (bytes and work removed from after the tap).

## Data flows

1. **Lobby open** → `GET /api/games` (game list) → worker registration → if the player consented earlier, the worker's saved plan starts filling the cache before the lobby JS runs.
2. **Consent on** → `GET /api/manifest/<game>` (critical asset set, ~97 files / 23 MB at phone resolution, ordered by engine phase) → `prefetch` message to the worker (8 streams, eager sounds moved to the end of the order) → **light pre-boot** as soon as the first 3.7 MB are in (JS + preloader + splash) → **upgrade to full** in place as soon as everything up to the end of the PRIMARY tier is on disk, so the engine decodes the atlases while the 4.6 MB music still downloads (only on devices with ≥ 4 GB) → `stopPixiApp()`: parked at the Play button, ticker stopped, sounds muted, SECONDARY tier held by the worker. A prefetch that ends with errors (edge 5xx bursts) is re-run and never counts as complete; a frame still booting 15 s after a clean prefetch is dropped and booted again (the engine's loader never retries).
3. **Tap** → RG gate → `startPixiApp()` → frame revealed → worker releases the held tier → game's own Play button → reels. Beacon `POST /api/events` with the marks (synthetic id, timings, truncated UA).
4. **Back** → frame parked again for 5 min (hot relaunch), fullscreen exited, session clock and reality check keep running in the lobby.
5. **Budget guards**: at most one pre-booted game; full pre-boot only with `deviceMemory ≥ 4`; dropped after 10 min idle, 60 s hidden, on data-saver/2G, on consent revoke, and the moment the RG gate says no.

## Measured cost of a parked game (laptop, @1x atlases)

| Level | Right after parking | Settled (20 s) | Tap → Play button (4G phone, CPU ×4) |
|---|---|---|---|
| full | +244 MB renderer, +524 MB GPU process | +160 MB / +380 MB | before the tap |
| light | +121 MB / +329 MB | +28 MB / +212 MB | 1.2 s |
| prefetched only | 0 | 0 | 2.8 s |

Disk: one game version = 23–25 MB in Cache Storage; cap 3 games.

## Deployment assumptions (and what breaks without them)

- **Same origin.** The lobby and the bundle path share one origin (or the bundle is reverse-proxied under the casino origin, as aggregators commonly do). A service worker can only cache requests made from its own origin, and the pre-boot hook reads the frame's `window`. Cross-origin bundles keep only the edge gains: measured 0.8–1.1 s repeat loads from HTTP cache with immutable headers alone, versus 5–11 s today.
- **Versioned immutable paths.** A re-certified package is published under a new version; nothing is overwritten. The worker keys its cache by `game:version`.
- **Provider hooks.** Park/resume uses `stopPixiApp` / `startPixiApp`, which this bundle exposes globally (they are its own tab-suspend handlers). A bundle without them still gets prefetch + light pre-boot (2.8 s / 1.2 s paths); the manifest per game is generated once from a recorded load (`scripts/loadtime-harness/manifest-from-analysis.js`).
- **Prediction data.** The `casino_game_launch` event already exists in FEG's analytics; the model needs nothing new collected.

## Why not the obvious alternatives

- *Tap-time parallel cache fill* was measured **slower** (27.6 s vs 24.2 s on 4G): it only reorders bytes on a saturated link.
- *Compression alone* cannot move a cold load: 20 MB of PNG atlases and OGG dominate; brotli removed 4 MB of text.
- *Serving one resolution folder*: `@1x` and `@0.5x` are not fully identical, and the engine chooses by DPR; the edge serves exactly what the engine asks for.
- *Auto-clicking the splash* would change the certified flow; "playable" is defined as the game's own Play button on screen and responsive, with Play → reels measured separately (9–17 ms).
