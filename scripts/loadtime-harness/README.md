# Load-time harness (Challenge 3 baseline)

Measures how long the untouched `empireofgold/` bundle takes to become playable, over a real WAN path,
with network, CPU, GPU and engine milestones logged. Localhost numbers are a false positive (4.8 s);
use the tunnel.

```
npm install                                   # playwright-core only; uses the installed Chrome
node server.js ../../empireofgold 8787 server.log        # static origin, serves shipped .br/.gz, logs every request
cloudflared tunnel --url http://localhost:8787            # prints https://<name>.trycloudflare.com
node run.js --url https://<name>.trycloudflare.com/ --label phone-4g --mobile --net 4g --cpu 4 --autoclick
node analyze.js phone-4g        # runs/phone-4g/analysis.json + console summary
node tracebins.js phone-4g      # per-second main-thread / GPU / network bins from the Chrome trace
node collect.js                 # runs/report-data.json across all runs
python montage.py phone-4g      # screenshot contact sheet
```

Flags for `run.js`: `--net none|4g|3g|wifi` (Chrome network throttling: 4g = 9 Mbit/s down, 170 ms RTT;
3g = 1.6 Mbit/s, 150 ms; wifi = 30 Mbit/s, 28 ms), `--cpu N` (CPU slowdown factor), `--mobile` (Pixel 7
profile, DPR 2.625, touch), `--headless`, `--max <s>`, `--autoclick` (taps the splash Play button).

Milestones come from the engine itself (the Pixi event emitter is hooked before boot):
`BUNDLE_LOADED(PRELOADER|COMMON|SPLASH|PRIMARY)`, `PRIMARY_ASSETS_LOADED` (Play button visible),
`SPLASH_START_CLICKED`, `IDLE_STATE_ENTRY` (playable). Output per run: `result.json` (CDP network log,
metrics samples, per-process CPU samples, events, audio decodes, long tasks), `trace.json`, `shots/`.

## Real device (Android over USB)

```
adb devices                                   # phone must be authorised for USB debugging
adb shell am start -n com.android.chrome/com.google.android.apps.chrome.Main -d about:blank
adb forward tcp:9222 localabstract:chrome_devtools_remote
node run-android.js --url https://<name>.trycloudflare.com/ --label phone-wifi-1 --max 200 --autoclick --adb <path-to-adb>
node analyze.js phone-wifi-1 && node analyze-adb.js phone-wifi-1 && node tracebins.js phone-wifi-1
adb shell cmd wifi set-wifi-enabled disabled   # switch to mobile data (check `dumpsys connectivity` shows an active default network)
```

`run-android.js` connects Playwright to the phone's Chrome over CDP, clears the browser cache, records the same
data as `run.js`, and additionally pushes `sample.sh` to `/data/local/tmp` and runs it once a second for
/proc/stat, per-process CPU of every Chrome process, interface byte counters, CPU frequencies and battery
temperature (`analyze-adb.js` turns those into per-second rows). Chrome's `SystemInfo.getProcessInfo` is not
available on Android; GPU sysfs nodes are usually root-only, so GPU time comes from the Chrome trace.

## Accelerated lobby (scenario runs)

The optimisation layer lives in `src/` (edge server, lobby shell, service worker). Measure it with:

```
node ../../src/edge/server.js --port 8080 --throttle 9 --latency 170   # origin; throttle = shared 4G link for ALL requests
cloudflared tunnel --url http://localhost:8080
node run-lobby.js --url https://<name>.trycloudflare.com/ --label m2-phone4g-warm --scenario warm --mobile --net none --cpu 4
node summarize-lobby.js m2-phone4g ../../progress/runs/2026-09-08-accel      # markdown table + summary json
node manifest-from-analysis.js empireofgold 1788443825853 <phone.analysis.json> <desktop.analysis.json> ../../src/edge/manifests/empireofgold.json ../../empireofgold
```

Scenarios: `cold` (no service worker), `sw-cold` (worker installed, empty cache, engine drives the download at tap), `prefetched`
(critical set cached, engine not booted), `warm` (cached + staged light→full pre-boot, parked), `warm-light` (light pre-boot only),
`warm-eager` (full pre-boot from the first byte, measured as a wash against staged), `hot` (warm, back to lobby, tap again).
`--extra "cc=16&boost=8"` passes lobby flags through (`?cc=` initial prefetch streams, `?boost=` streams after the light tier is on disk,
`?early=0` upgrade the light frame only at prefetch-done, `?stream=0` worker answers only after its cache write, `?fill=1` tap-time fill;
all documented in `src/lobby/app.js`). `--revisit` reloads once the state is reached and reports the second-visit timeline.
`--chaos 60.10` makes the accelerated origin answer 60 % of this client's game-asset requests with HTTP 530 for 10 s (cookie
`chaos=<pct>.<seconds>.<id>`, `chaosHit` in `src/edge/server.js`): reproduces the quick-tunnel failure bursts that made the engine's
loader give up ("Error loading bundles") in `after-…-warm-11` and `x4-wifi-warm-A-2`.
The harness taps the tile (t0 = pointerdown in the lobby), waits for the Play button, taps Play in the game frame and
records `IDLE_STATE_ENTRY`; all marks are epoch ms so the lobby and the game frame share one clock.

Why the origin throttles: Chrome's `Network.emulateNetworkConditions` applies to the page target only, not to fetches
made by the service worker, so with Chrome-side throttling every service-worker scenario would download at full speed.
Since 2026-09-08 evening the profile is applied **per client at the origin**: `run-lobby.js --net 4g|3g|wifi` sets a
`link=<profile>.<id>` cookie and the edge gives that cookie its own token bucket + latency (`PROFILES` in `src/edge/server.js`:
4g = 9 Mbit/s + 170 ms, 3g = 1.6 Mbit/s + 150 ms, wifi = 30 Mbit/s + 28 ms). No server restart between configurations, and a
real phone (no cookie, `--android`) can share the same tunnel. `--chromenet` restores Chrome-side emulation if ever needed.

## Before/after matrix (2026-09-08)

```
bash ../../var/matrix-after.sh                       # every baseline configuration, through the tunnel, + 20-run 4G batch
node collect-after.js --shots                        # -> progress/runs/2026-09-08-after/after-data.json (+ frames)
node report-after.js                                 # -> progress/runs/2026-09-08-after/report.html (template: report-after.template.html)
node ../../src/predict/build.js                      # prediction replay -> var/predict-eval.json (used by the report's section 4)
```

Run labels follow `after-<config>-<scenario>-<n>`; `collect-after.js` maps them onto the baseline configurations. Sessions that
did not reach the scenario's state are reported as failures, not dropped (see `batch.failed`).

## Measurement gotchas (learned 2026-09-08)

- Chrome's network emulation does not throttle service-worker fetches: throttle at the origin (see above).
- Keep hands off headed Chrome windows during a run. A click on the tile in a popped-up window launched the game
  mid-measurement once and produced a "release" that looked like a bug. Use `--headless` when in doubt (timings matched headed).
- A page opened with a hard reload (Ctrl+Shift+R) or with DevTools "Bypass service worker" is never controlled by the
  worker: every launch goes cold and the lobby shows "waiting for accelerator". The lobby now reloads itself once to recover.
- On phones the game requests fullscreen on the Play tap; the lobby's top bar is covered until fullscreen is left.
  `back()` exits fullscreen; the hot scenario in `run-lobby.js` does the same before tapping back.
- `navigator.connection.effectiveType` ("4g") is Chrome's link-quality bucket, not the radio; "4g" is also what Wi-Fi reports.
- Beacons: every launch and every preload milestone posts to `/api/events` (`var/events.jsonl`), so remote devices can be
  read without a harness: `node -e` over the file, or the "Launch timings" table in the lobby card.
