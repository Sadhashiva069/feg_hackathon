# Impact case — Challenge 3, Game Load Time

**Claim.** For a certified game the accelerator turns a tap-to-Play-button time of 8–30 s (measured, real phone and emulated 4G) into **27 ms p50 / 156 ms p95** on the predicted path and **2.8 s** when only the files were pre-loaded, without changing a byte of the bundle. Across a whole population the median launch drops from 24.7 s to 2.8 s on 4G with one warm game (38 % of launches under 500 ms), and to 41 ms with three (57 %). The cost is an NGINX configuration, a 143-line service worker, a lobby module and a small prediction service; no new data collection and no re-certification. Every number below says whether it is **measured**, **from FEG's sample data**, or an **assumption**.

## 1. Baseline (what the product loses today)

| Fact | Value | Source |
|---|---|---|
| Tap → Play button, real phone (OnePlus Nord 3, venue Wi-Fi / LTE) | 8.1–32.8 s / 7.7–13.7 s | measured, `progress/BASELINE_LOAD_ANALYSIS.md` |
| Tap → Play button, mid-range phone at 4G (9 Mbit/s, CPU ×4) / 3G | 24.7–26.5 s / 121.6 s | measured |
| Bytes before the first spin | 23.4 MB in 63 requests, re-downloaded on every launch (no cache headers) | measured |
| Blank screen after the tap | 21 s black in the walkthrough video; first game pixel only after the splash phase | measured (video frames) |
| Aborted load in the walkthrough | 41 s, game never appeared; retry took 19 s | measured (video) |
| Games per session (PSK, Aug 2026) | 2.49 | FEG trends workbook |
| Median session length / stake per session / spins per session (PSK, Aug 2026) | 722 s / €343 / 379 | FEG trends workbook |
| Sessions per player per month (PSK, Aug 2026) | 15.1 | FEG trends workbook |
| Same game re-tapped within 60 s of the previous launch | 10.8 % of launches; present in 14.5 % of sessions; p25 gap between such taps 20 s | FEG event log (13,682 launches) |
| Sessions that never leave one game | 44.8 % of sessions (top users) | FEG event log |
| Player-days on one game vs several | see §3 | FEG `CA_Player.csv` |

The 10.8 % "same game within a minute" figure is the closest thing in the log to an abandoned load: the player tapped, waited, went back and tapped the same tile again. It cannot be separated from intentional replays in this data, so we treat only part of it as retries (assumption A3).

## 2. What changes, per metric named in the brief

| Metric | Before | After | Raw / perceived | Status |
|---|---|---|---|---|
| Cold load p50 / p95 (tap → Play button) | 24.7 s / 30.6 s (4G phone) | predicted path **27 ms / 156 ms** (n=19); files-only path 2.8 s; population p50 2.8 s (1 warm slot) → 41 ms (3 slots) | raw | measured + projected from the log |
| Perceived-load quality | 21 s blank | poster + title + status in the next frame, 37–43 ms, on every path | perceived | measured |
| Cache hit / prefetch accuracy | 0 % (no cache headers) / n.a. | 100 % of post-tap requests from the worker; prediction top-1 37 %, top-3 60 % (causal replay, holdout 5,473 launches) | raw | measured |
| Launch-to-play conversion | not instrumented today | the same marks (`shell`, `reveal`, `play_button`, `idle`) become analytics events per launch; the 10.8 % quick-relaunch share is the pre-launch proxy | — | needs production A/B |
| Games sampled per session | 2.49 | projection under A2 (below) | — | needs production A/B |

## 3. Quantified business effect (per 1,000 active players per month)

**Sessions:** 1,000 × 15.1 = **15,100 sessions/month**.

**Time returned to play.** Loading time per session today = 2.49 launches × *T*. After: the projected path mix on 4G (hot 13 %, warm 25 %, files-only 26 %, cold 36 %) gives a mean launch of 9.5 s against 24.7 s, a **62 % reduction in mean time-to-Play** (the same 62 % on the laptop profile: 6.3 s → 2.4 s). Applied to three load-time scenarios:

| Scenario for *T* today | Basis | Loading per session | Returned per session |
|---|---|---|---|
| Conservative: 8 s | upper end of the brief's "6–8 s" | 19.9 s (2.8 % of the session) | 12.3 s |
| Base: 12 s | median of our real-phone LTE/Wi-Fi runs | 29.9 s (4.1 %) | 18.5 s |
| Mobile-heavy: 25 s | mid-range phone at 4G (72 % of launches are Casino Android) | 62.3 s (8.6 %) | 38.6 s |

**Converted to stake (assumption A1: returned time is played at the session's average rate, 379 spins / 722 s = 0.52 spins/s, €0.91 per spin):**

| Scenario | Extra spins / session | Extra stake / session | Extra stake / month per 1,000 players | GGR at 4 % hold (A4) |
|---|---|---|---|---|
| Conservative | 6.4 | €5.8 | **€88 k** | €3.5 k |
| Base | 9.7 | €8.8 | **€133 k** | €5.3 k |
| Mobile-heavy | 20.2 | €18.3 | **€276 k** | €11 k |

**Abandoned launches (A3: half of the 10.8 % quick same-game re-taps are load retries).** 5.4 % of launches × 2.49 × 15,100 = 2,030 wasted loads/month per 1,000 players. Under the accelerator a re-tap within 60 s is the *hot* path (frame kept, 10–16 ms), so the retry cost disappears even when the first attempt was cold. At *T* = 12 s that is another 6.8 hours/month of player time returned per 1,000 players; the retention effect of removing the "41 s black screen then give up" experience is not priced here.

**Discovery (the brief's thesis).** In `CA_Player.csv` (Aug 2026, PSK: 26,852 players, 182,154 player-days), days on which a player touched more games carry more stake, *within the same player*: relative to that player's own median day, one-game days sit at 0.47×, two games at 0.80×, three at 1.00×, 4–5 at 1.19×, 6–10 at 1.64× and 11+ at 2.27× (Spearman 0.44 between distinct games and relative stake; 34.6 % of player-days never leave one game). This is correlation, not causation (longer days touch more games and stake more), so we use it only as the direction and size of the prize, not as a forecast. **Assumption A2:** the accelerator raises games sampled per session by +0.25 (2.49 → 2.74, +10 %), since switching becomes free. If even a quarter of the within-player stake gradient is causal, that is worth more than the time-returned effect above; we propose to measure it in the A/B rather than claim it.

## 4. Costs

| Item | One-off | Monthly per 1,000 players | Basis |
|---|---|---|---|
| Edge / CDN rules (NGINX: versioned path, brotli, immutable) | 0.5 sprint | **negative**: today every cold launch re-downloads 23.4 MB (15,100 × 2.49 × 23.4 MB ≈ 880 GB/month); with immutable caching repeat launches cost 0 bytes and brotli removes 4 MB of text per cold load | measured bytes, FEG session counts |
| Pre-load egress | — | ≤ 1,000 devices × 3 games × 25 MB once (75 GB), then only on version changes; ≈ €2–6 at €0.03–0.08/GB (A5) | measured bundle size |
| Prediction service (Python, Redis, existing Kafka `casino_game_launch` stream) | 1 sprint | ~€100–300 hosting (A6) | architecture |
| Lobby module (Vue) + service worker | 1 sprint | 0 | this repo (401 lines) |
| Provider checklist (hooks present? parked state opens no session?) + QA | 0.5 sprint | 0 | `docs/compliance-note.md` |
| Player-side | — | ≤ 25 MB per pre-load, on by default with a player switch (cache optimisation, see compliance note), off on data-saver/2G; one warm game ≤ +240 MB RAM on ≥ 4 GB devices, light mode otherwise | measured |
| Re-certification of the bundle | **none** (unchanged) | 0 | hash-verified |

Total: about **3 sprints of integration** and a hosting cost in the low hundreds of euros per month, against a conservative **€88 k/month of stake per 1,000 active players** from returned time alone.

## 5. Assumptions and how to validate them

| # | Assumption | Validation |
|---|---|---|
| A1 | Returned loading time is played at the session's average spin rate (players budget time, not spins) | A/B: spins per session, session length |
| A2 | +0.25 games sampled per session when switching is free | A/B: distinct games per session |
| A3 | Half of same-game re-taps within 60 s are load retries | Production marks: re-tap after `shell` without `play_button` |
| A4 | 4 % hold on stake (RTP ≈ 96 %) | FEG finance |
| A5 | CDN egress €0.03–0.08/GB | FEG CDN contract |
| A6 | Prediction service on existing Kafka + Redis | FEG platform |
| A7 | Prediction accuracy in production ≥ the 37 % / 60 % measured on 65 heavy users and 887 games | Replay `src/predict/build.js` on the full stream |
| A8 | Bundles are served same-origin (or reverse-proxied) and expose `stopPixiApp`/`startPixiApp` (this one does); otherwise the files-only and edge gains apply (2.8 s / ~1 s repeat loads) | Provider checklist |

**Proposed A/B (4 weeks, PSK Android):** treatment = accelerator on by default (player switch available); control = today. Primary metric: launches reaching first spin. Secondary: distinct games per session, spins per session, quick re-tap rate, switch-off rate, egress per session, crash/memory reports on < 4 GB devices.

## 6. Sources

Measured: `progress/BASELINE_LOAD_ANALYSIS.md`, `progress/LOAD_TIME_PROGRESS.md`, `progress/runs/2026-09-08-after/report.html` (n=19 warm phone runs plus every baseline configuration re-run). FEG sample data: `hackathon_casino_trends.xlsx` (PSK, Aug 2026 row), `top_casino_users_event_logs.csv` (13,682 launches, 2,595 sessions), `CA_Player.csv` (741,679 player-day-game rows). Prediction replay: `var/predict-eval.json` from `node src/predict/build.js`.
