# Demo flow — 15 minutes, live, side by side, on real devices

Format required by the brief: *a live side-by-side demo on real devices, today's baseline vs the solution, instrumented, not slideware; say which gains are raw speed and which are perceived.*

## Setup (before the slot, 10 min)

```
npm start                                  # accelerated origin on :8080  (lobby + worker + immutable bundle)
npm run start:baseline                     # baseline origin on :8081     (same bundle, served as shipped today)
cloudflared tunnel --url http://localhost:8080     # -> https://<A>.trycloudflare.com
cloudflared tunnel --url http://localhost:8081     # -> https://<B>.trycloudflare.com
```

- Phone (Android, Chrome), on mobile data or the venue Wi-Fi: open `https://<A>.trycloudflare.com/compare?baseline=https://<B>.trycloudflare.com&player=demo-player`.
  On a second phone or the laptop, open the same URL; both are independent.
- Have a second tab with the accelerated lobby alone: `https://<A>.trycloudflare.com/?player=demo-player&debug=1` (instrumentation open).
- Keep `progress/runs/2026-09-08-after/report.html` open on the laptop for the measured matrix (n=19 phone runs, p50/p95).
- Reset between rehearsals: in the accelerated lobby, "Clear stored files"; the baseline origin is always cold (no-store).

## Script

| Min | What the judges see | What to say |
|---|---|---|
| 0–1 | The walkthrough video frame: tap → 21 s black → logo → back to the lobby at 41 s. `demo/screenshots/today-4g-*.jpg`. | "This is the product today. The core loop is choosing and switching games; every switch costs 8–30 s. We measured it on a real phone: 8 to 33 s on the venue Wi-Fi, 25–30 s at 4G speed." |
| 1–3 | **/compare on the phone.** Left = today (cold, as shipped), right = accelerator. Right starts pre-loading on its own the moment it opens: downloading → engine booting → *pre-loaded · engine parked · Play button ready*. | "The pre-load is a cache optimisation, on by default like a CDN prefetch: in production every game just pre-loads and the player only taps. The switch under the tile is a preference that turns it off and clears the files. The prediction only decides what to cache; it never changes what the player sees." |
| 3–5 | Press **Open the game on both**. Left timer climbs (5–25 s). Right: first frame in ~30 ms, Play button *before the tap*. Tap Play on the right: reels in ~10 ms. | "Raw gain: the Play button was ready before the tap. Perceived gain: poster and title in the next frame, never a black screen. Left is still loading." |
| 5–6 | Left finally shows the Play button. Read both numbers from the results table. | "Same bundle, byte for byte, same device, same network. The only difference is where and when the bytes are paid for." |
| 6–8 | **Back to lobby on both**, then **Open** again. Right: 10–16 ms, already at the reels (hot). Left: cold again. | "Switching games is the core loop; coming back to a game is free." |
| 8–10 | **Guardrails live.** Switch player to `excluded-player` on the right: banner, launch blocked, nothing pre-loaded. Switch to `limit-player` (1-minute limit): the game closes with the session-limit interstitial and the pre-loaded copy is discarded. Open the lobby with `?rc=1`: the reality check appears mid-game with two equal buttons. | "Speed never bypasses protection. One gate runs before every open, every pre-load and every reveal. The pre-booted game is discarded the moment the player may no longer play." |
| 10–12 | Instrumentation panel (`?debug=1`): cache hit 100 %, 0 bytes after the tap, memory budget, `report.html`: p50 27 ms / p95 156 ms (n=19), population projection p50 24.7 s → 2.8 s with one warm slot, 41 ms with three. | "These are harness numbers through a tunnel and throttled origin, not localhost. We report the misses too: a miss costs 2.8 s with files on disk, 23 s cold. Prediction is 37 % top-1 / 60 % top-3 on the sample log." |
| 12–14 | Impact case slide from `docs/impact-case.md`: time returned per session, quick-relaunch share in the log, egress cost, integration effort. | "Cost is an NGINX config, a 143-line worker and a lobby module; no new data collected; no bundle re-certification." |
| 14–15 | Compliance mapping (`docs/compliance-note.md`) and the hand-over list. | "Built compliant by design, with the six review items we'd hand to Legal before production." |

## Fallbacks

- Tunnel HTTP 530 mid-demo: the worker retries 5xx; if a frame stalls, **Reload both**.
- No phone signal: run the same compare page on the laptop with the origin throttled to 4G (`npm run start:4g`); say so.
- Judges ask for "cold with the accelerator": open the accelerated lobby with `?consent=0` (worker on, nothing pre-loaded): Play button 23 s. Then switch the pre-load on and show the staged pre-load reaching the Play button in 4–9 s on a first visit, 1–2 s on a revisit.
