# Game Load Accelerator — FEG Innovation Hackathon 2026, Challenge 3

## 1. Team, challenge, solution title

- **Team:** _fill in team name, members and Team Lead before submission_
- **Challenge:** 3, Game Load Time (PSK / Croatian track)
- **Solution:** *Game Load Accelerator*: tap-to-playable for a certified casino game from 8–30 s to under 500 ms on the predicted path, without changing a byte of the certified bundle and without weakening any responsible-gambling step.

## 2. Problem statement

The casino's core loop is choosing and switching games, and every switch costs 6–8 s by FEG's own figure. We measured the delivered bundle (Empire of Gold, 23.4 MB in 63 requests before the first spin, no cache headers) at **8–33 s on a real phone** on the venue network and **25–30 s at 4G speed** on a mid-range profile; the product walkthrough video shows a 41 s black screen after which the presenter gives up. Slow loads suppress discovery: 44.8 % of sessions in the sample log never leave one game, and 10.8 % of launches are the same game re-tapped within a minute. Certified packages cannot be altered, so the load cost cannot be reduced; it can only be paid earlier, paid elsewhere, or hidden.

## 3. Solution overview and key innovation

Four levers, all outside the bundle:

1. **Edge:** versioned immutable path, brotli for the text assets the provider ships uncompressed (Spine JSON 2.2 MB → 98 KB), shipped `.br` for JS, Range for audio. Repeat launches cost 0 bytes.
2. **Service worker:** cache-first for the game path with in-flight de-duplication, prefetch of the game's *critical set* in engine-phase order, and **hold/release** of the non-critical 19 MB tier while a game is pre-booted but not shown.
3. **RG-gated, switchable pre-load and hidden pre-boot** (the part the brief did not suggest): from the moment the lobby opens (on by default, as a cache optimisation; a visible switch lets a player turn it off, and `PRELOAD_DEFAULT_ON` in `src/lobby/app.js` exists only if Legal ever requires an opt-in), the predicted next game is downloaded and **booted in a hidden same-origin frame up to its own Play button, then parked with the engine's own `stopPixiApp()` hook**. The tap only reveals the frame and calls `startPixiApp()`: Play button before the tap, reveal in 27 ms p50 / 156 ms p95 on a 4G phone. A staged *light* pre-boot (splash only) covers low-memory devices; a *hot* path keeps the frame for 5 minutes after "back to lobby" (10–16 ms). One gate checks self-exclusion, age, session limit and reality check before every open, every pre-load and every reveal, and the parked game is discarded the moment the player may no longer play.
4. **Perceived load:** poster, title and status in the next frame after the tap on every path; the 21 s blank screen is gone.

Measurement is part of the product: every launch reports `shell`, `reveal`, `play_button` and `idle` marks by path, and a **side-by-side page** runs the baseline origin (served as shipped: no compression, no caching, no worker) next to the accelerated one on the same device with live raw/perceived timers.

## 4. Key features / user journey

1. Player opens the lobby. If the account is self-excluded, unverified or over its session limit, a banner says so and nothing is pre-loaded.
2. Player ticks *"Pre-load the game I am most likely to open next (stores up to ~25 MB on this device)"*, unticked by default, with a plain-language note of what is stored and a *Clear stored files* button.
3. The worker downloads the predicted game's critical set (23 MB at phone resolution); the lobby boots it hidden, first to the splash, then to the Play button when the rest lands, and parks it.
4. Player taps the tile: RG gate → reveal → the game's own Play button is already on screen → Play → reels in ~10 ms. On a miss: files on disk 2.8 s; nothing cached 23 s (today's number) with a poster instead of a black screen.
5. Back to lobby keeps the frame for 5 minutes; a second tap is instant. Reality checks and the session limit interrupt the game at full fidelity, with equal-weight choices.
6. Judges/engineers open the *Instrumentation* panel (`?debug=1`) or `/compare` to see the marks, cache hit rate, memory budget and the side-by-side race.

## 5. Technology stack

Vue 3 lobby (vendored production build, no build step), a dependency-free Node 18+ edge that stands in for **NGINX + CDN** rules (`config/nginx.conf.example`), a service worker, and an offline prediction replay (Node). Production mapping to FEG's approved stack (Vue.js, NGINX, Kafka, Redis, Python) is in [docs/architecture.md](docs/architecture.md). Measurement harness: Chrome over CDP via `playwright-core`, `cloudflared` quick tunnels, `adb` for real phones.

## 6. System requirements and prerequisites

- Node.js ≥ 18 (tested on 22.14), any OS. No npm install is needed to run the prototype or its tests.
- A Chromium-based browser with WebGL 2 (Chrome 128+; Chrome on Android for the phone demo).
- Optional, measurement only: `cloudflared`, Android platform-tools, `npm install` inside `scripts/loadtime-harness/` (playwright-core), Python 3.12 with `gdown`/`pandas`/`openpyxl` for the data scripts.
- The certified bundle is included in the repository (`empireofgold/`, 98 MB, unmodified; `npm run verify-bundle`). The hackathon datasets are **not** included (`data/` is git-ignored) and are only needed for `npm run predict` and the impact-case analysis; `scripts/download_data.py` re-fetches them (Drive access required).

## 7. Installation / setup steps

```
git clone <this repo> && cd feg_hackathon
npm test                 # 30 checks: bundle hashes, edge behaviour in both modes, RG gate, pre-load default
npm start                # accelerated origin on http://localhost:8080
npm run start:baseline   # (second terminal) baseline origin on http://localhost:8081 for the side-by-side page
```

## 8. Environment variables and configuration

None are required. `.env.example` documents `PORT` (edge port, default 8080), `BASELINE_PORT`, `EDGE_LOG` and the optional tunnel/adb paths. Edge flags: `--port`, `--baseline`, `--log`, `--throttle <Mbit/s> --latency <ms>` (origin-side link emulation used for the measurements). Lobby URL flags for tests and demos: `?player=<synthetic id>` (`demo-player`, `player-2`, `player-3`, `limit-player`, `guest`, `excluded-player`), `?consent=1`, `?sw=0`, `?prefetch=0`, `?warm=0|light|full`, `?rc=<minutes>` (reality-check interval), `?limit=<minutes>` (session limit), `?debug=1` (instrumentation open). Games are registered in `src/edge/games.json`; the per-game critical-set manifest is `src/edge/manifests/<game>.json`.

## 9. How to run the prototype

- Lobby: `http://localhost:8080/?player=demo-player` → the pre-load starts on its own → wait for *Warm engine: parked* in the Instrumentation panel (`?debug=1`) → tap the tile.
- Side by side: `http://localhost:8080/compare?baseline=http://localhost:8081` → wait for the right side to show *pre-loaded · engine parked* → *Open the game on both*.
- 4G-like conditions on a laptop: `npm run start:4g` (origin throttled to 9 Mbit/s + 170 ms for every client).
- Real phone over the internet: `cloudflared tunnel --url http://localhost:8080` (and a second tunnel for 8081), then open `https://<A>.trycloudflare.com/compare?baseline=https://<B>.trycloudflare.com` on the phone.

## 10. How to test / validate

- `npm test` runs `tests/smoke.js`: bundle integrity (SHA-256 of all 379 files), accelerated edge (brotli, immutable, Range, ETag, worker scope, traversal refused, versioned 404), baseline edge (no compression, no-store, no worker), source parsing, and static assertions on the RG gate and the consent default.
- `npm run verify-bundle` alone checks the guardrail.
- Measured numbers are reproduced with the harness: `scripts/loadtime-harness/README.md` (baseline runs, accelerated scenarios `cold | sw-cold | prefetched | warm | warm-light | hot`, before/after report). All published numbers went through a tunnel and a throttled origin, never localhost (localhost gives a 4.8 s false positive).
- Prediction accuracy and the population projection: `npm run predict` (needs `data/`), writes `var/predict-eval.json`.
- Failure injection: `run-lobby.js --chaos 60.10` makes the accelerated origin answer 60 % of a client's game-asset requests with HTTP 530 for 10 s (the quick-tunnel failure mode seen twice in the measurements); the pre-load must still reach the parked state through the worker's retry passes and the lobby's boot watchdog.

## 11. Demo instructions

[demo/demo-flow.md](demo/demo-flow.md): a 15-minute script (setup, side-by-side race on a real phone, hot relaunch, guardrails live with `excluded-player`, `limit-player` and `?rc=1`, instrumentation, impact and compliance), with fallbacks. Screenshots of the measured runs are in `demo/screenshots/` (today at 5/11/20/26 s vs accelerator at 172 ms), and the charted matrix is `progress/runs/2026-09-08-after/report.html`.

## 12. Known limitations, assumptions and future improvements

- **Sub-500 ms is the predicted path.** Population-wide, one warm slot gives p50 2.8 s and 38 % of launches under 500 ms on 4G (57 % with three slots on desktop memory); a prediction miss costs 2.8 s with files on disk and today's ~23 s cold. We report misses, not only hits.
- **Preload and cold paths are at the link's byte floor.** The engine's Play button waits for the whole 23.2 MB critical set (@0.5x), 4.6 MB of which is background music fetched serially after the atlases; measured link utilisation is 90 % (cold, engine-driven) and 97 % (preload) on the emulated 4G link, so no lobby/edge change can cut those paths further without a provider-side change (a real @0.5x atlas set, lazy music). Tap-time fills at 1/2/6 streams and an eager full pre-boot were measured and rejected (`progress/LOAD_TIME_PROGRESS.md`, late-evening pass).
- **Prediction is data-limited:** 37 % top-1 / 60 % top-3 on 65 heavy users and 887 games; the sandbox has one bundle, so the lobby only uses "last game" and the ranking model runs offline.
- **Same-origin assumption:** the bundle must be served from the casino origin (or reverse-proxied under it) for the worker and the pre-boot hook; cross-origin keeps only the edge gains (~1 s repeat loads measured).
- **Memory:** one fully parked game costs up to +240 MB renderer / +520 MB GPU process on a laptop at @1x; hence one warm game, full only on ≥ 4 GB devices, light otherwise. Real-phone memory (`dumpsys meminfo`) not yet recorded.
- **Real-phone after-runs** are pending (the baseline was measured on a OnePlus Nord 3; the accelerated matrix is emulated Pixel 7 at 4G/3G plus laptop). The phone demo is live on the day.
- **Provider assumption:** parked at its own Play button, the engine opens no game session (the sandbox build is offline); to be confirmed with the provider before production. See the hand-over list in the compliance note.
- Not done: hover/scroll-intent prefetch from search results and category rows (the two surfaces with the most launches), tile-to-frame transition animation, a device-memory probe on Android, an accelerator module extracted from `app.js` with a four-call API (`init`, `plan`, `launch`, `back`).

## 13. Links

- Architecture / technical overview: [docs/architecture.md](docs/architecture.md)
- Impact case and cost-value analysis: [docs/impact-case.md](docs/impact-case.md)
- Compliance note (EU baseline + responsible gambling): [docs/compliance-note.md](docs/compliance-note.md)
- Dependencies, licences, AI-assistance disclosure: [docs/dependencies.md](docs/dependencies.md)
- Data inventory and handling: [docs/data.md](docs/data.md)
- Measurements: [progress/LOAD_TIME_PROGRESS.md](progress/LOAD_TIME_PROGRESS.md), [progress/BASELINE_LOAD_ANALYSIS.md](progress/BASELINE_LOAD_ANALYSIS.md), `progress/runs/`
- Production edge config: [config/nginx.conf.example](config/nginx.conf.example)

Repository layout: `src/edge` (origin), `src/lobby` (shell, worker, compare page), `src/predict` (replay), `tests/`, `docs/`, `demo/`, `config/`, `scripts/loadtime-harness/` (measurement), `progress/` (results), `empireofgold/` (certified bundle, read-only).
