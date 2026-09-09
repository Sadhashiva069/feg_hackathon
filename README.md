# Game Load Accelerator — FEG Innovation Hackathon 2026, Challenge 3

## 1. Team, challenge, solution title

- **Team:** Team Cheetahs
- **Challenge:** 3, Game Load Time (PSK / Croatian track)
- **Solution:** *Game Load Accelerator*: tap-to-playable for a certified casino game from 10 s on a laptop over Wi-Fi (25 s on a 4G phone) to under 500 ms on every pre-loaded path (reveal 10 ms p50 / 26 ms p95 on the laptop, 27 / 156 ms on the phone), without changing a byte of the certified bundle and without weakening any responsible-gambling step.

## 2. Problem statement

The casino's core loop is choosing and switching games, and every switch costs 6–8 s by FEG's own figure. We measured the delivered bundle (Empire of Gold, 23.4 MB in 63 requests before the first spin, no cache headers) at **10.2 s to the Play button on a laptop over a 30 Mbit/s Wi-Fi link** (11.4 s playable; 4–11 s over the raw tunnel), **25–30 s on a mid-range 4G phone profile** and 8–33 s on a real phone on the venue network; the organisers' walkthrough videos show a 41 s launch that the presenter abandons (21 s of it black) and a second provider's game taking 20 s on desktop web. Slow loads suppress discovery: 44.8 % of sessions in the sample log never leave one game, and 10.8 % of launches are the same game re-tapped within a minute. Certified packages cannot be altered, so the load cost cannot be reduced; it can only be paid earlier, paid elsewhere, or hidden.

### Baseline evidence (the production site is not reachable from the hackathon)

The PSK casino lobby is VPN-only, so "today" is established from three sources that agree with each other. Every number below is frame-timed or instrumented, not quoted.

| Source | What it shows | Tap → Play button / reels | Black screen |
|---|---|---|---|
| `Gaming Casino.mp4` (organisers' walkthrough, desktop Chrome), first launch | tile clicked at 00:37.5 → black → SpinIQ preloader for 15 s → black → presenter back in the lobby at 01:19 **without the game ever appearing** | **41 s, abandoned** | 21 s |
| same video, second launch (partly warm) | click at 01:22.5 → black → preloader → reels at 01:41.5 | 19 s | 4.5 s |
| `Web application walkthrough.mp4`, 04:09 (desktop web, **Amusnet** "100 Power Hot Dice", a different provider) | click → black with a spinner for 11 s → provider loader for 8 s → reels at 04:29 | **20 s** | 11 s |
| Certified bundle served **as shipped** through the same WAN path as our solution (`--baseline` edge, Cloudflare tunnel / Render) | same three screens in the same order as the video; engine milestones logged | **10.2 s laptop on 30 Mbit/s Wi-Fi** (4–11 s over the raw tunnel); 24.7–26.5 s on the 4G phone profile; 8–33 s on a real OnePlus Nord 3 | until the SPLASH phase completes (3.6 s laptop, 6 s phone) |

Frame strips: `demo/screenshots/today-web-walkthrough-amusnet-20s.jpg` (video) and `demo/screenshots/today-4g-*.jpg` (as-shipped bundle on the 4G profile). The full baseline report with the per-request waterfall, CPU/GPU traces and the byte-floor analysis is `progress/runs/2026-09-08-baseline/report.html` and `progress/BASELINE_LOAD_ANALYSIS.md`. `Mobile View & Native apps.mp4` was scanned frame by frame as well: it covers the sportsbook app only and contains no casino launch, so the phone-side baseline is our own real-device measurement.

**Same device, same link, our solution.** Laptop over a 30 Mbit/s Wi-Fi link is the primary target; the emulated 4G phone (9 Mbit/s, 170 ms, CPU ×4) is the stress case. Laptop numbers are from the deployed edge on Render; phone numbers from the tunnel matrix (`progress/runs/2026-09-08-after/report.html`).

| Path | Today, laptop Wi-Fi | Accelerator, laptop Wi-Fi | Today, 4G phone | Accelerator, 4G phone | Raw or perceived |
|---|---|---|---|---|---|
| Tap → game frame on screen | first pixel after the SPLASH phase, 3.6 s (21 s black in the video) | poster + title in the next frame, 6 ms | 6 s | 19–37 ms | perceived |
| Tap → Play button, predicted game | 10.2 s | **already on screen; reveal 10 ms p50 / 26 ms p95** (n = 72) | 24.7–26.5 s | already on screen; reveal 27 ms p50 / 156 ms p95 (n = 19) | raw |
| Hot relaunch (back to lobby, tap again) | full reload, 10.2 s (19 s in the video) | 5–6 ms | 25 s | 10–16 ms | raw |
| Files on disk, engine not booted (miss on a known game) | 10.2 s | 0.97 s | 25 s | 2.8 s | raw |
| Light pre-boot (low-memory devices) | 10.2 s | 0.40 s | 25 s | 1.2 s | raw |
| Nothing on disk (first-ever visit, miss on an unknown game) | 10.2 s | 10.9 s, poster instead of black | 25 s | 23–25 s, poster instead of black | perceived only: the bytes are the certified bundle's |
| Play → reels | 1.2 s | 3 ms | 4 s (provider loader 8 s in the video) | 10–17 ms | raw |
| Pre-load window before a tap can hit (first visit / return visit) | — | 8.4–8.7 s / 0.6–0.9 s | — | 22 s / 2.0 s | cost moved before the tap |

## 3. Solution overview and key innovation

Four levers, all outside the bundle:

1. **Edge:** versioned immutable path, brotli for the text assets the provider ships uncompressed (Spine JSON 2.2 MB → 98 KB), shipped `.br` for JS, Range for audio. Repeat launches cost 0 bytes.
2. **Service worker:** cache-first for the game path with in-flight de-duplication, prefetch of the game's *critical set* in engine-phase order, and **hold/release** of the non-critical 19 MB tier while a game is pre-booted but not shown.
3. **RG-gated, switchable pre-load and hidden pre-boot** (the part the brief did not suggest): from the moment the lobby opens (on by default, as a cache optimisation; a visible switch lets a player turn it off, and `PRELOAD_DEFAULT_ON` in `src/lobby/app.js` exists only if Legal ever requires an opt-in), the predicted next game is downloaded and **booted in a hidden same-origin frame up to its own Play button, then parked with the engine's own `stopPixiApp()` hook**. The tap only reveals the frame and calls `startPixiApp()`: Play button before the tap, reveal in 10 ms p50 / 26 ms p95 on a laptop over Wi-Fi (n = 72) and 27 ms p50 / 156 ms p95 on a 4G phone profile (n = 19). A staged *light* pre-boot (splash only) covers low-memory devices; a *hot* path keeps the frame for 5 minutes after "back to lobby" (5–6 ms laptop, 10–16 ms phone). One gate checks self-exclusion, age, session limit and reality check before every open, every pre-load and every reveal, and the parked game is discarded the moment the player may no longer play.
4. **Perceived load:** poster, title and status in the next frame after the tap on every path; the 21 s blank screen is gone.

Measurement is part of the product: every launch reports `shell`, `reveal`, `play_button` and `idle` marks by path, and a **side-by-side page** runs the baseline origin (served as shipped: no compression, no caching, no worker) next to the accelerated one on the same device with live raw/perceived timers.

## 4. Key features / user journey

1. Player opens the lobby. If the account is self-excluded, unverified or over its session limit, a banner says so and nothing is pre-loaded.
2. The pre-load starts on its own the moment the lobby opens (a cache optimisation, on by default). The lobby shows a plain-language switch, *"Pre-load the game I am most likely to open next (on by default; stores up to ~25 MB on this device, switch off any time)"*, and a *Clear stored files* button; the choice is remembered per player.
3. The worker downloads the predicted game's critical set (23 MB at phone resolution); the lobby boots it hidden, first to the splash, then to the Play button when the rest lands, and parks it.
4. Player taps the tile: RG gate → reveal → the game's own Play button is already on screen → Play → reels in ~10 ms. On a miss: files on disk 1.0 s on the laptop (2.8 s on the 4G phone); nothing cached 10.9 s laptop / 23 s phone, today's numbers, with a poster instead of a black screen.
5. Back to lobby keeps the frame for 5 minutes; a second tap is instant. Reality checks and the session limit interrupt the game at full fidelity, with equal-weight choices.
6. Judges/engineers open the *Instrumentation* panel (`?debug=1`) or `/compare` to see the marks, cache hit rate, memory budget and the side-by-side race.

## 5. Technology stack

Vue 3 lobby (vendored production build, no build step), a dependency-free Node 18+ edge that stands in for **NGINX + CDN** rules (`config/nginx.conf.example`), a service worker, and an offline prediction replay (Node). Production mapping to FEG's approved stack (Vue.js, NGINX, Kafka, Redis, Python) is in [docs/architecture.md](docs/architecture.md). Measurement harness: Chrome over CDP via `playwright-core`, `cloudflared` quick tunnels, `adb` for real phones.

## 6. System requirements and prerequisites

- Node.js ≥ 18 (tested on 22.14), any OS. No npm install is needed to run the prototype or its tests.
- A Chromium-based browser with WebGL 2 (Chrome 128+; Chrome on Android for the phone demo).
- Optional, measurement only: `cloudflared`, Android platform-tools, `npm install` inside `scripts/loadtime-harness/` (playwright-core), Python 3.12 with `gdown`/`pandas`/`openpyxl` for the data scripts.
- The certified bundle is included in the repository (`assets/empireofgold/`, 98 MB, unmodified; `npm run verify-bundle`). The hackathon datasets are **not** included (`data/` is git-ignored) and are only needed for `npm run predict` and the impact-case analysis; `scripts/download_data.py` re-fetches them (Drive access required).

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

Deployed copy (Render, Singapore): **https://feg-hackathon.onrender.com/?player=demo-player** (accelerated edge; the pre-load starts on open). The instance sleeps when idle and takes up to 15 s to wake on the first request, so open it once before a demo. The compare page needs a second, `--baseline` instance: `render.yaml` defines both services.

Local:

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

Demo video link: [demo/demo-video-link.md](demo/demo-video-link.md). Script: [demo/demo-flow.md](demo/demo-flow.md), a 15-minute script (setup, side-by-side race on a real phone, hot relaunch, guardrails live with `excluded-player`, `limit-player` and `?rc=1`, instrumentation, impact and compliance), with fallbacks. Screenshots of the measured runs are in `demo/screenshots/` (today at 5/11/20/26 s vs accelerator at 172 ms, plus the frame strip of the organisers' walkthrough launch), the pitch outline is `demo/presentation/pitch-outline.md`, and the charted matrix is `progress/runs/2026-09-08-after/report.html`.

## 12. Known limitations, assumptions and future improvements

- **Sub-500 ms is the pre-loaded path.** On the laptop a miss costs 1.0 s with the files on disk and today's 10.9 s cold; on the 4G phone 2.8 s and ~23 s. Population-wide, with the phone timings, one warm slot gives p50 2.8 s and 38 % of launches under 500 ms (57 % with three slots on desktop memory). We report misses, not only hits.
- **Preload and cold paths are at the link's byte floor.** The engine's Play button waits for the whole 23.2 MB critical set (@0.5x), 4.6 MB of which is background music fetched serially after the atlases; measured link utilisation is 91 % (preload, 8.4–8.7 s) on the 30 Mbit/s laptop profile and 90 % (cold) / 97 % (preload) on the emulated 4G link, so no lobby/edge change can cut those paths further without a provider-side change (a real @0.5x atlas set, lazy music). Tap-time fills at 1/2/6 streams and an eager full pre-boot were measured and rejected (`progress/LOAD_TIME_PROGRESS.md`, late-evening pass).
- **Prediction is data-limited:** 37 % top-1 / 60 % top-3 on 65 heavy users and 887 games; the sandbox has one bundle, so the lobby only uses "last game" and the ranking model runs offline.
- **Same-origin assumption:** the bundle must be served from the casino origin (or reverse-proxied under it) for the worker and the pre-boot hook; cross-origin keeps only the edge gains (~1 s repeat loads measured).
- **Memory:** one fully parked game costs up to +240 MB renderer / +520 MB GPU process on a laptop at @1x; hence one warm game, full only on ≥ 4 GB devices, light otherwise. Real-phone memory (`dumpsys meminfo`) not yet recorded.
- **Real-phone after-runs** are pending (the baseline was measured on a OnePlus Nord 3; the accelerated matrix is emulated Pixel 7 at 4G/3G plus laptop, and through Render). The phone demo is live on the day. The organisers' mobile walkthrough contains no casino launch, so there is no video baseline for phones either.
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

Repository layout: `src/edge` (origin), `src/lobby` (shell, worker, compare page), `src/predict` (replay), `tests/`, `docs/`, `demo/`, `config/`, `scripts/loadtime-harness/` (measurement), `progress/` (results), `assets/empireofgold/` (certified bundle, read-only), `render.yaml` (deployment).
