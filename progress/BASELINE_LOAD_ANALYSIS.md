# Baseline load analysis — Empire of Gold, measured 2026-09-08

Question answered: is the ~40 s load in `videos/Gaming Casino.mp4` real, and where does the time go?
Report with charts: `runs/2026-09-08-baseline/report.html` (open in a browser). Raw per-run data in the same folder.

## Method (why not localhost)

Served from localhost the bundle is playable in **4.8 s**, a false positive. For real numbers the untouched
`empireofgold/` was served by a logging static server, published through a `cloudflared` quick tunnel
(Cloudflare edge hyd01, 70–330 ms TTFB per request), and loaded in real Chrome 152 (Intel UHD, WebGL 2)
driven over CDP with a fresh profile per run. Chrome network + CPU throttling produced the phone profiles.
Logged: every request (CDP Network), main-thread task/script time, CPU seconds per Chrome process (renderer,
GPU process, browser), a Chrome trace binned per second, engine events hooked from the Pixi emitter
(`BUNDLE_LOADED`, `PRIMARY_ASSETS_LOADED` = Play button visible, `IDLE_STATE_ENTRY` = playable), audio
decodes, long tasks, screenshots every second. Harness: `scripts/loadtime-harness/`.

Caveat: no remote sandbox was available; the browser ran on the same PC and isolation came from the tunnel
path + throttling. The unthrottled laptop runs are bounded by the tunnel (3–7 MB/s), the throttled runs by
the throttle. The production origin (api.spiniq.io, Cloudflare, ~1.3 s TTFB from Hyderabad) is VPN-only.

## Video verification (frames every 0.5 s)

| Video time | What is on screen |
|---|---|
| 00:37.5 | game tile clicked in lobby |
| 00:38.0–00:39.0 | lobby spinner |
| 00:39.5–01:00.0 | **black page (21 s)** |
| 01:00.5–01:15.5 | SpinIQ engine preloader logo (15 s) |
| 01:16.0–01:18.5 | black again |
| 01:19.0 | presenter is back in the lobby: **41 s, game never appeared** |
| 01:22.5 → 01:41.5 | second attempt (partly cached): black 5 s, logo 10 s, reels at **19 s** |

## Results (cold, fresh profile, tunnel origin)

| Run | COMMON | SPLASH | PRIMARY | Play button | Playable | MB / req before playable | avg MB/s | main busy | GPU-proc CPU | long tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| localhost laptop | 1.1 | 1.1 | 2.2 | 2.9 | **4.8** | 28.0 / 64 | 9.66 | 98 % | 87 % | 5 / 1.7 s |
| tunnel laptop (no throttle) #1 | 2.8 | 3.5 | 6.0 | 7.0 | **8.4** | 25.3 / 63 | 3.59 | 46 % | 72 % | 5 / 0.6 s |
| tunnel laptop (no throttle) #2 | 0.8 | 0.9 | 2.5 | 3.3 | **4.2** | 25.3 / 63 | 7.56 | 50 % | 90 % | — |
| tunnel laptop, 30 Mbit/s 28 ms | 2.7 | 3.6 | 8.3 | 10.2 | **11.4** | 25.3 / 63 | 2.47 | 41 % | 74 % | — |
| tunnel phone 4G 9 Mbit/s 170 ms, CPU ×4 #1 | 5.3 | 6.1 | 20.1 | 25.9 | (tap missed) | 23.4 / 63 | 0.90 | 88 % | 39 % | 11 / 3.9 s |
| tunnel phone 4G #2 | 5.2 | 5.9 | 19.7 | 24.7 | **29.0** | 23.4 / 63 | 0.94 | 65 % | 33 % | — |
| tunnel phone 4G #3 | 5.6 | 6.4 | 21.4 | 26.5 | **30.6** | 23.4 / 63 | 0.88 | 63 % | 31 % | — |
| tunnel phone 3G 1.6 Mbit/s 150 ms, CPU ×4 | — | — | 97.4 | 121.6 | **126.1** | 23.4 / 63 | 0.19 | 73 % | 36 % | — |

All times in seconds from navigation start. Phone = Pixel 7 profile (412×915, DPR 2.625, touch).

## Where the time goes (ranked)

1. **23.4 MB in 63 requests before the first spin.** PRIMARY 15.0 MB (Spine PNG atlases: king_character 4.5,
   BG_king_2 3.4, king_character_2 2.4, BG_king 1.7, reels_frame 0.9 …), eager sounds 4.5 MB (BBGM.ogg),
   COMMON 2.9 MB (EOG logo Spine animation just for the preloader), SPLASH 0.3–1.5 MB, boot JS/CSS 0.5 MB.
   Pure transfer: 21 s at 9 Mbit/s, 37 s at 5 Mbit/s. The video's 40 s needs nothing else to be wrong.
2. **Five serial phases** (PRELOADER → COMMON → SPLASH → PRIMARY → BBGM/genericButtonSound), each waits for the
   slowest file of the previous one; bandwidth idles at every boundary. Phone: 2.5 / 5.3 / 6.1 / 20.1 / 24.6 s.
3. **Background music gates the scene.** BBGM.ogg 4.5 MB is fetched + decoded after PRIMARY and before the view is
   built (4.5 s alone on 4G). Immediately after, 49 lazy sounds (15.9 MB) + SECONDARY (12 MB) start: 42 MB on the
   wire in the first 45 s; 51 audio decodes ≈ 5.8 s of decode work on the ×4 CPU.
4. **Phones get desktop textures.** `@0.5x` is byte-identical to `@1x` (md5 on all files); the phone downloads and
   decodes the same 4096² atlases and 2.2 MB skeleton JSON. spines/ = 61.5 MB on disk, half duplicated.
5. **Main thread saturated on a mid-range phone**: 63–88 % busy for the whole load. Per second: ~300 ms rAF
   (SpinIQ logo Spine animation + progress bar rendered at DPR 2.6), ~200 ms layout/paint (HTML loader webp
   repaint), ~250 ms script; JS boot 1.4 s of the first 2 s (1.3 MB Pixi parse/compile 0.55 s); one 980 ms long
   task at PRIMARY_ASSETS_LOADED building the game view. Even on localhost the engine needs ~3 s of CPU (98 % busy).
6. **GPU busy before there is anything to play**: GPU process 72–90 % of a core on the laptop, ~35 % on the phone
   profile; GPUTask 1.9 s (laptop) / 3.7 s (phone) before the Play button; atlas uploads show as 0.3–0.4 s/s of
   command-buffer stalls right after PRIMARY starts. Not the bottleneck; battery/thermal on a real phone.
7. **Compression/caching left to the CDN + a broken asset.** Only the 4 JS files ship `.br`; Spine JSON (4.7 MB)
   and atlases are plain text at the origin (Cloudflare gzipped them to 0.7 MB and re-encoded br→gzip:
   vendor-pixi 306 KB → 388 KB). No cache headers, so every cold launch re-downloads (video's 2nd attempt: 19 s).
   `spines/@1x/book.png` is missing → 404 + "Error loading bundles" in SECONDARY (after playable).
8. **Nothing meaningful on screen until SPLASH completes**: HTML spinner → black canvas until COMMON (5.3 s phone)
   → SpinIQ logo until SPLASH (6.1 s) → splash art + progress bar until the Play button (25 s). `#preload` is
   never removed; the canvas paints over it. Video: 21 s of black.

## Implications for the 500 ms target

The bundle is frozen, so these costs can only be paid earlier or elsewhere: precache/prefetch the 23.4 MB
critical set (service worker, predicted next game) before the tap; warm the engine in a hidden iframe so the
five serial phases run before the reveal; serve compressed, cacheable, HTTP/2-prioritised responses from an edge
near the player; and give the player a poster/skeleton immediately (perceived load), since the first game pixel
today arrives only when SPLASH completes.

## Real device (added 2026-09-08, afternoon)

A OnePlus Nord 3 5G (CPH2491, MediaTek Dimensity 9000, 8 cores, Android 16, Chrome 152, Mali-G710, DPR 3.5,
viewport 354×696 CSS px) was driven over USB (`adb forward tcp:9222 localabstract:chrome_devtools_remote`,
`scripts/loadtime-harness/run-android.js`), browser cache cleared before each run, against the same tunnel.
On-device sampler (`sample.sh`): /proc/stat, per-process CPU of Chrome, interface bytes, battery temperature.
GPU sysfs nodes are root-only on this SoC, so GPU time comes from Chrome's trace.

| Network | Run | COMMON | SPLASH | PRIMARY | Play button | Playable | avg / peak MB/s |
|---|---|---|---|---|---|---|---|
| venue Wi-Fi (shared AP with origin laptop) | wifi-1 | 3.2 | 3.8 | 9.3 | **11.8** | (tap search) | 1.98 / 6.3 |
| venue Wi-Fi | wifi-2 | 4.3 | 4.9 | 29.7 | **32.8** | 34.5 | 0.71 / 2.3 |
| venue Wi-Fi | wifi-3 | 3.1 | 3.6 | 8.1 | **9.9** | 10.9 | 2.36 / 5.9 |
| venue Wi-Fi | wifi-4 | 2.8 | 3.3 | 6.4 | **8.1** | 9.1 | 2.89 / 8.1 |
| mobile data (LTE) | 5g-1 | 4.3 | 4.9 | 11.0 | **13.7** | 14.7 | 1.73 / 4.1 |
| mobile data (LTE) | 5g-2 | 2.0 | 2.4 | 6.0 | **7.7** | 8.6 | 3.05 / 6.7 |

On-device counters (wifi-4, until the Play button): all-core CPU busy 60 %; renderer process 68 % of one core,
GPU process 43 %, browser process 27 %; battery 34 °C, steady. Chrome trace on the phone: main thread 12–24 %
busy while bandwidth-bound, spikes to 67–82 % at JS boot (1 s) and at PRIMARY_ASSETS_LOADED (view creation,
10 s), GPU process 17–31 %; `CommandBufferHelper::Finish` stalls of 0.45–0.9 s/s while the 4096² atlases upload.
Two further mobile-data attempts failed with ERR_INTERNET_DISCONNECTED (no default data network after Wi-Fi was
switched off) and were discarded.

Conclusion: on a flagship-class phone the load is purely bandwidth-bound (23.4 MB / 63 requests every time);
throughput swings on the venue network turn the same page into 8 s or 33 s. The emulated ×4-CPU profile
(29–31 s at a fixed 9 Mbit/s) is the mid-range worst case; the video's 41 s sits between the two.

## Re-check: the cold path is at its byte floor (added 2026-09-08, 22:00)

Seven cold launches through the accelerator's worker on the 4G profile (engine drives the download, nothing pre-loaded):
24.9, 24.7, 24.5, 24.7, 25.4, 25.2, 23.9 s tap → Play button (baseline 24.7–26.5 s). With the origin access log lined up
against the engine milestones (per-client link cookie), the link was busy 85–90 % of that time (7.8–8.4 of 9 Mbit/s delivered),
i.e. 2–4 s above the 21.6 s floor for 23.2 MB. The idle seconds are CPU work between phases (JS parse 0.6–1.0 s, COMMON → SPLASH →
PRIMARY transitions 0.6–0.9 s, ~1.3 s of OGG decode + view build after the last byte). The music is a serial tail: the engine
requests BBGM.ogg (4.6 MB) only after the last atlas and fires `PRIMARY_ASSETS_LOADED` only after `soundsLoaded`, so the link
carries nothing else for 4 s. Tap-time cache fills at 1 / 2 / 6 streams measured 24.7 / 36.6 / 27.6 s against 24.9 / 24.9 / 24.2 s
engine-driven, and streaming worker responses were neutral (25.2 vs 25.4 s): reordering bytes cannot help a saturated link.
Provider-side items that would move the floor (estimates, bytes ÷ 9 Mbit/s): music after the Play button −4.6 MB ≈ −4.2 s; real
half-resolution `@0.5x` atlases (today byte-identical to `@1x`) ≈ −11 MB ≈ −10 s; sounds in parallel with PRIMARY: 0 on 4G, ≤ 1 s
on fast links. Details: `LOAD_TIME_PROGRESS.md` "Late-evening pass", `runs/2026-09-08-night/tables.md`, baseline report § 7b.
