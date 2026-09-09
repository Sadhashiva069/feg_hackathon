# Late-evening runs, 2026-09-08 (21:40–22:35), via tunnel keith-bunny-contractors-recognized

Generated with `node scripts/loadtime-harness/summarize-runs.js <prefix> --md`. Times in s unless the column says ms; prep = lobby open → scenario state (over-reports on ×4 CPU), light/dl/full = lobby open → SPLASH loaded / prefetch done / PRIMARY_ASSETS_LOADED in the parked frame, playbtn = tap → Play button. x1 experiments, x2 8-vs-16 streams + raw-tunnel cold refs, x3 first patched runs (not interleaved), x4 interleaved A/B (A = boost=8&early=0&stream=0), x5 light/prefetched A/B (CONTAMINATED by concurrent CPU load), x6 wifi A/C/D separation, x7 chaos + final sanity.

## x1-

| label | scen | net | dev | extras | prep_s | light_s | dl_s | full_s | parked_s | path | reveal_ms | playbtn_ms | idle_ms | req | sw | MB | util | mbit | dlMB | errs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4g-swcold-fill1 | sw-cold | 4g | mob x4 | fill=1,cc=1 | 1.6 |  |  |  |  | cold-sw | 64 | 24691 | 27621 | 97 | 97 | 0 | 0.15 | 0.3 | 0 | 3 |
| 4g-swcold-fill2 | sw-cold | 4g | mob x4 | fill=1,cc=2 | 4.2 |  |  |  |  | cold-sw | 138 | 36561 | 40209 | 122 | 122 | 0 | 0.04 | 0.1 | 0 | 4 |
| 4g-swcold-ref | sw-cold | 4g | mob x4 |  | 1.6 |  |  |  |  | cold-sw | 75 | 24915 | 28011 | 119 | 119 | 0 | 0.15 | 0.3 | 0 | 4 |
| 4g-warm-cc16 | warm | 4g | mob x4 | cc=16 | 27.6 | 13.5 | 21.5 | 25.6 | 14.3 | warm | 23 | before | 2220 | 1 | 1 | 0 | 0.7 | 6.6 | 23.2 | 4 |
| 4g-warm-eager | warm-eager | 4g | mob x4 | warm=eager | 26.9 | 9.2 | 21.2 | 22.6 | 25.4 | warm | 40 | before | 2342 | 2 | 2 | 0 | 0.79 | 7.4 | 23.2 | 4 |
| 4g-warm-ref | warm | 4g | mob x4 |  | 24.9 | 9.1 | 21.2 | 23.2 | 10.3 | warm | 12 | before | 2168 | 1 | 1 | 0 | 0.78 | 7.3 | 23.2 | 4 |
| none-warm-cc16 | warm | none | desk | cc=16 | 4.8 | 1.9 | 2.8 | 3.5 | 2.3 | warm | 11 | before | 554 | 3 | 3 | 0 |  |  |  | 4 |
| none-warm-eager | warm-eager | none | desk | warm=eager | 5.2 | 1.9 | 4.1 | 4.7 | 5.3 | warm | 13 | before | 550 | 3 | 3 | 0 |  |  |  | 4 |
| none-warm-ref | warm | none | desk |  | 4.7 | 2.2 | 3.6 | 4.3 | 2.6 | warm | 20 | before | 571 | 2 | 2 | 0 |  |  |  | 3 |
| wifi-swcold-fill2 | sw-cold | wifi | desk | fill=1,cc=2 | 1 |  |  |  |  | cold-sw | 14 | 7421 | 8289 | 110 | 110 | 0 | 0.05 | 0.6 | 0 | 4 |
| wifi-swcold-ref | sw-cold | wifi | desk |  | 0.6 |  |  |  |  | cold-sw | 12 | 7744 | 8661 | 106 | 106 | 0 | 0.04 | 0.6 | 0 | 4 |
| wifi-warm-cc16 | warm | wifi | desk | cc=16 | 8.5 | 4.6 | 6.7 | 7.5 | 5.1 | warm | 12 | before | 594 | 1 | 1 | 0 | 0.74 | 23.8 | 25.2 | 4 |
| wifi-warm-eager | warm-eager | wifi | desk | warm=eager | 8 | 2.9 | 7.2 | 7.7 | 8.4 | warm | 15 | before | 513 | 1 | 1 | 0 | 0.72 | 23.3 | 25.2 | 4 |
| wifi-warm-ref | warm | wifi | desk |  | 8 | 3.6 | 6.8 | 7.6 | 4.1 | warm | 10 | before | 562 | 2 | 2 | 0 | 0.73 | 23.7 | 25.2 | 4 |

## x2-

| label | scen | net | dev | extras | prep_s | light_s | dl_s | full_s | parked_s | path | reveal_ms | playbtn_ms | idle_ms | req | sw | MB | util | mbit | dlMB | errs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| none-swcold-ref-1 | sw-cold | none | desk |  | 2.2 |  |  |  |  | cold-sw | 65 | 24324 | 26382 | 138 | 138 | 0 |  |  |  | 4 |
| none-swcold-ref-2 | sw-cold | none | desk |  | 0.5 |  |  |  |  | cold-sw | 19 | 16211 | 17941 | 130 | 130 | 0 |  |  |  | 4 |
| none-warm-cc16-1 | warm | none | desk | cc=16 | 4.4 | 1.6 | 2.6 | 3.3 | 2 | warm | 15 | before | 561 | 2 | 2 | 0 |  |  |  | 4 |
| none-warm-cc16-2 | warm | none | desk | cc=16 | 4.2 | 1.9 | 3.3 | 4 | 2.4 | warm | 9 | before | 548 | 2 | 2 | 0 |  |  |  | 3 |
| none-warm-cc16-3 | warm | none | desk | cc=16 | 3.6 | 1.7 | 2.7 | 3.4 | 2.1 | warm | 12 | before | 621 | 2 | 2 | 0 |  |  |  | 4 |
| none-warm-cc8-1 | warm | none | desk |  | 4.8 | 1.9 | 3.6 | 4.2 | 2.3 | warm | 12 | before | 508 | 2 | 2 | 0 |  |  |  | 3 |
| none-warm-cc8-2 | warm | none | desk |  | 4.8 | 0.9 | 3 | 3.8 | 1.4 | warm | 9 | before | 612 | 1 | 1 | 0 |  |  |  | 3 |
| none-warm-cc8-3 | warm | none | desk |  | 4.3 | 1.4 | 3.4 | 4.1 | 1.8 | warm | 16 | before | 621 | 2 | 2 | 0 |  |  |  | 3 |

## x3-

| label | scen | net | dev | extras | prep_s | light_s | dl_s | full_s | parked_s | path | reveal_ms | playbtn_ms | idle_ms | req | sw | MB | util | mbit | dlMB | errs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4g-hot-1 | hot | 4g | mob x4 |  | 24.8 | 9.2 | 21.7 | 23.5 | 9.6 | warm | 20 | before | 2158 | 2 | 2 | 0 | 0.77 | 7.2 | 23.2 | 4 |
| 4g-swcold-1 | sw-cold | 4g | mob x4 |  | 1.5 |  |  |  |  | cold-sw | 17 | 24525 | 27929 | 122 | 122 | 0 | 0.14 | 0.3 | 0 | 4 |
| 4g-swcold-2 | sw-cold | 4g | mob x4 |  | 2 |  |  |  |  | cold-sw | 76 | 24690 | 27947 | 119 | 119 | 0 | 0.11 | 0.3 | 0 | 4 |
| 4g-warm-1 | warm | 4g | mob x4 |  | 24.9 | 9.1 | 21.7 | 23.2 | 10.3 | warm | 15 | before | 2199 | 1 | 1 | 0 | 0.78 | 7.3 | 23.2 | 4 |
| 4g-warm-2 | warm | 4g | mob x4 |  | 26.4 | 8.9 | 22.9 | 24.8 | 9.3 | warm | 57 | before | 2615 | 2 | 2 | 0 | 0.74 | 6.9 | 23.2 | 4 |
| 4g-warmlight-1 | warm-light | 4g | mob x4 |  | 22.3 | 10.1 | 21.3 |  | 10.5 | warm-light | 14 | 2952 | 6208 | 69 | 69 | 0 | 0.94 | 8.8 | 23.2 | 4 |
| none-revisit-1 | warm | none | desk |  | 8.7 | 0.2 | 0.1 | 1.1 | 1.7 | warm | 11 | before | 545 | 0 | 0 | 0 |  |  |  | 3 |
| none-swcold-1 | sw-cold | none | desk |  | 0.5 |  |  |  |  | cold-sw | 11 | 4559 | 5330 | 138 | 138 | 0 |  |  |  | 4 |
| none-swcold-2 | sw-cold | none | desk |  | 1 |  |  |  |  | cold-sw | 12 | 5208 | 5987 | 131 | 131 | 0 |  |  |  | 3 |
| none-warm-1 | warm | none | desk |  | 5.7 | 1.8 | 4.5 | 5 | 2.3 | warm | 13 | before | 600 | 1 | 1 | 0 |  |  |  | 3 |
| none-warm-2 | warm | none | desk |  | 7 | 1.9 | 5.6 | 6.1 | 2.4 | warm | 9 | before | 537 | 1 | 1 | 0 |  |  |  | 3 |
| none-warm-3 | warm | none | desk |  | 5.9 | 1.8 | 4.6 | 5 | 2.3 | warm | 12 | before | 547 | 1 | 1 | 0 |  |  |  | 3 |
| wifi-swcold-1 | sw-cold | wifi | desk |  | 1.6 |  |  |  |  | cold-sw | 11 | 8342 | 8998 | 96 | 96 | 0 | 0.03 | 0.4 | 0 | 3 |
| wifi-warm-1 | warm | wifi | desk |  | 10.2 | 3.1 | 8.6 | 9.1 | 3.6 | warm | 10 | before | 620 | 1 | 1 | 0 | 0.77 | 20.2 | 25.2 | 4 |

## x4-

| label | scen | net | dev | extras | prep_s | light_s | dl_s | full_s | parked_s | path | reveal_ms | playbtn_ms | idle_ms | req | sw | MB | util | mbit | dlMB | errs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4g-swcold-A-1 | sw-cold | 4g | mob x4 |  | 1.8 |  |  |  |  | cold-sw | 16 | 25367 | 29225 | 123 | 123 | 0 | 0.13 | 0.3 | 0 | 4 |
| 4g-swcold-B-1 | sw-cold | 4g | mob x4 |  | 2.3 |  |  |  |  | cold-sw | 97 | 25228 | 28920 | 121 | 121 | 0 | 0.08 | 0.2 | 0 | 4 |
| none-warm-A-1 | warm | none | desk |  | 4.6 | 1.3 | 3.5 | 4.2 | 1.8 | warm | 13 | before | 662 | 1 | 1 | 0 |  |  |  | 3 |
| none-warm-A-2 | warm | none | desk |  | 4.5 | 1.1 | 3.3 | 4 | 1.7 | warm | 14 | before | 590 | 2 | 2 | 0 |  |  |  | 3 |
| none-warm-A-3 | warm | none | desk |  | 6.8 | 1.9 | 5.1 | 5.8 | 2.3 | warm | 9 | before | 563 | 2 | 2 | 0 |  |  |  | 3 |
| none-warm-B-1 | warm | none | desk |  | 6.4 | 2 | 4.2 | 4.7 | 2.5 | warm | 11 | before | 576 | 2 | 2 | 0 |  |  |  | 4 |
| none-warm-B-2 | warm | none | desk |  | 6.2 | 1 | 5.3 | 5.7 | 1.5 | warm | 11 | before | 569 | 2 | 2 | 0 |  |  |  | 4 |
| none-warm-B-3 | warm | none | desk |  | 5 | 1.1 | 3.5 | 3.9 | 1.6 | warm | 16 | before | 615 | 1 | 1 | 0 |  |  |  | 2 |
| wifi-swcold-A-1 | sw-cold | wifi | desk |  | 1.6 |  |  |  |  | cold-sw | 14 | 8503 | 9158 | 87 | 87 | 0 | 0.03 | 0.4 | 0 | 4 |
| wifi-swcold-A-2 | sw-cold | wifi | desk |  | 1.5 |  |  |  |  | cold-sw | 13 | 8484 | 9222 | 92 | 92 | 0 | 0.03 | 0.4 | 0 | 3 |
| wifi-swcold-B-1 | sw-cold | wifi | desk |  | 0.9 |  |  |  |  | cold-sw | 10 | 7482 | 8192 | 101 | 101 | 0 | 0.04 | 0.4 | 0 | 4 |
| wifi-swcold-B-2 | sw-cold | wifi | desk |  | 1.2 |  |  |  |  | cold-sw | 12 | 8448 | 9079 | 96 | 96 | 0 | 0.03 | 0.4 | 0 | 3 |
| wifi-warm-A-1 | warm | wifi | desk |  | 7.7 | 2.8 | 6.8 | 7.4 | 3.3 | warm | 10 | before | 595 | 1 | 1 | 0 | 0.76 | 24.4 | 25.2 | 4 |
| wifi-warm-A-2 | warm | wifi | desk |  | 200.8 |  | 17.9 |  |  | warm-booting | 10 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 1.1 | 6 |
| wifi-warm-A-3 | warm | wifi | desk |  | 8.1 | 2.8 | 7 | 7.7 | 3.3 | warm | 15 | before | 620 | 1 | 1 | 0 | 0.73 | 23.5 | 25.2 | 4 |
| wifi-warm-B-1 | warm | wifi | desk |  | 9.4 | 2.5 | 7.9 | 8.4 | 3 | warm | 10 | before | 491 | 1 | 1 | 0 | 0.68 | 22.1 | 25.2 | 4 |
| wifi-warm-B-2 | warm | wifi | desk |  | 9.6 | 2.6 | 8 | 8.5 | 3.1 | warm | 8 | before | 539 | 1 | 1 | 0 | 0.66 | 21.9 | 25.2 | 4 |
| wifi-warm-B-3 | warm | wifi | desk |  | 9.1 | 2.5 | 7.3 | 7.7 | 3 | warm | 14 | before | 548 | 1 | 1 | 0 | 0.73 | 23.6 | 25.2 | 4 |

## x5-

| label | scen | net | dev | extras | prep_s | light_s | dl_s | full_s | parked_s | path | reveal_ms | playbtn_ms | idle_ms | req | sw | MB | util | mbit | dlMB | errs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4g-prefetched-A-1 | prefetched | 4g | mob x4 |  | 27.6 |  | 25.8 |  |  | prefetched | 311 | 9145 | 11666 | 92 | 92 | 0 | 0.89 | 7.2 | 23.2 | 4 |
| 4g-prefetched-B-1 | prefetched | 4g | mob x4 |  | 22.3 |  | 21.3 |  |  | prefetched | 36 | 2778 | 14598 | 143 | 143 | 0 | 0.94 | 8.8 | 23.2 | 4 |
| 4g-warmlight-A-1 | warm-light | 4g | mob x4 |  | 24.4 | 10.5 | 22.5 |  | 11.4 | warm-light | 405 | 21121 | 50170 | 97 | 97 | 0 | 0.86 | 8 | 23.2 | 4 |
| 4g-warmlight-A-2 | warm-light | 4g | mob x4 |  | 29.4 | 10.9 | 24.2 |  | 13 | warm-light | 49 | 8699 | 20691 | 28 | 28 | 0 | 0.79 | 7.4 | 23.2 | 1 |
| 4g-warmlight-B-1 | warm-light | 4g | mob x4 |  | 28.2 | 17.2 | 22.9 |  | 19.8 | warm-light | 214 | 28659 | 38119 | 93 | 93 | 0 | 0.86 | 7.9 | 23.2 | 4 |
| 4g-warmlight-B-2 | warm-light | 4g | mob x4 |  | 24.9 | 7.1 | 22.4 |  | 7.6 | warm-light | 62 | 5776 | 13671 | 92 | 92 | 0 | 0.87 | 8.1 | 23.2 | 4 |

## x6-

| label | scen | net | dev | extras | prep_s | light_s | dl_s | full_s | parked_s | path | reveal_ms | playbtn_ms | idle_ms | req | sw | MB | util | mbit | dlMB | errs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| wifi-warm-A-1 | warm | wifi | desk |  | 9.5 | 2.4 | 7.6 | 8.7 | 3.2 | warm | 23 | before | 671 | 1 | 1 | 0 | 0.64 | 20.6 | 25.2 | 4 |
| wifi-warm-A-2 | warm | wifi | desk |  | 10 | 2.7 | 7.8 | 8.9 | 3.3 | warm | 32 | before | 699 | 1 | 1 | 0 | 0.63 | 20.3 | 25.2 | 4 |
| wifi-warm-C-1 | warm | wifi | desk |  | 9.8 | 2.6 | 8.1 | 8.7 | 3.2 | warm | 26 | before | 750 | 1 | 1 | 0 | 0.64 | 20.5 | 25.2 | 4 |
| wifi-warm-C-2 | warm | wifi | desk |  | 8.4 | 2.4 | 7.3 | 7.9 | 3 | warm | 23 | before | 706 | 2 | 2 | 0 | 0.74 | 23.7 | 25.2 | 4 |
| wifi-warm-D-1 | warm | wifi | desk |  | 8.6 | 2.1 | 7.1 | 8.1 | 2.7 | warm | 34 | before | 778 | 1 | 1 | 0 | 0.68 | 22 | 25.2 | 4 |
| wifi-warm-D-2 | warm | wifi | desk |  | 7.9 | 1.9 | 6.7 | 7.1 | 2.3 | warm | 6 | before | 378 | 1 | 1 | 0 | 0.8 | 26.2 | 25.2 | 4 |

## x7-

| label | scen | net | dev | extras | prep_s | light_s | dl_s | full_s | parked_s | path | reveal_ms | playbtn_ms | idle_ms | req | sw | MB | util | mbit | dlMB | errs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4g-swcold-final-1 | sw-cold | 4g | mob x4 |  | 1.4 |  |  |  |  | cold-sw | 45 | 23868 | 27219 | 116 | 116 | 0 | 0.17 | 0.4 | 0 | 4 |
| 4g-warm-final-1 | warm | 4g | mob x4 |  | 22.7 | 8.7 | 21.1 | 21.9 | 9.8 | warm | 34 | before | 2222 | 1 | 1 | 0 | 0.85 | 8 | 23.2 | 4 |
| none-hot-final-1 | hot | none | desk |  | 3.6 | 1.1 | 2.9 | 3.3 | 1.5 | warm | 8 | before | 597 | 3 | 3 | 0 |  |  |  | 4 |
| none-warm-final-1 | warm | none | desk |  | 4.8 | 1.7 | 3.6 | 4 | 2.2 | warm | 16 | before | 646 | 2 | 2 | 0 |  |  |  | 4 |
| wifi-chaos-warm-1 | warm | wifi | desk |  | 31.8 | 30.1 | 14.7 | 31.1 | 31.6 | warm | 7 | before | 507 | 1 | 1 | 0 | 0.21 | 6.7 | 25.2 | 7 |
| wifi-chaos-warm-2 | warm | wifi | desk |  | 30.6 | 29.2 | 14 | 30.3 | 30.9 | warm | 11 | before | 685 | 1 | 1 | 0 | 0.27 | 6.8 | 25.1 | 11 |
| wifi-chaos-warm-3 | warm | wifi | desk |  | 38.2 | 36.6 | 21.4 | 37.2 | 37.7 | warm | 6 | before | 377 | 1 | 1 | 0 | 0.18 | 5.5 | 25.1 | 13 |
| wifi-warm-final-1 | warm | wifi | desk |  | 8.8 | 2.6 | 7.8 | 8.2 | 3 | warm | 22 | before | 856 | 2 | 2 | 0 | 0.7 | 22.6 | 25.2 | 4 |

## y1- (re-check 22:50–22:53, same tunnel, edge on 8080 unchanged since 22:33; laptop ~30 % busy with VS Code/browsers)

| label | scen | net | dev | extras | prep_s | light_s | dl_s | full_s | parked_s | path | reveal_ms | playbtn_ms | idle_ms | req | sw | MB | util | mbit | dlMB | errs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4g-swcold-1 | sw-cold | 4g | mob x4 |  | 1.9 |  |  |  |  | cold-sw | 42 | 23596 | 25896 | 84 | 84 | 0 | 0.12 | 0.3 | 0 | 3 |
| 4g-swcold-2 | sw-cold | 4g | mob x4 |  | 1.1 |  |  |  |  | cold-sw | 48 | 23675 | 26028 | 85 | 85 | 0 | 0.18 | 0.4 | 0 | 3 |
| 4g-warm-1 | warm | 4g | mob x4 |  | 22.7 | 9.8 | 21.2 | 21.8 | 10.7 | warm | 23 | before | 1895 | 1 | 1 | 0 | 0.88 | 8.2 | 23.2 | 4 |
| 4g-warm-2 | warm | 4g | mob x4 |  | 23.8 | 9.1 | 21.8 | 22.4 | 9.9 | warm | 26 | before | 1783 | 2 | 2 | 0 | 0.86 | 8 | 23.2 | 4 |
| none-hot-1 | hot | none | desk |  | 3.9 | 1.2 | 3.4 | 3.7 | 1.6 | warm | 6 | before | 388 | 3 | 3 | 0 |  |  |  | 4 |
| none-warm-1 | warm | none | desk |  | 5.3 | 1.6 | 3.8 | 4 | 2 | warm | 6 | before | 426 | 1 | 1 | 0 |  |  |  | 2 |
| wifi-warm-1 | warm | wifi | desk |  | 8.5 | 2.3 | 7.6 | 7.8 | 2.8 | warm | 6 | before | 463 | 1 | 1 | 0 | 0.75 | 24.3 | 25.2 | 4 |

## y2- (preload ON for every run, 22:55–22:59, same tunnel; `revisit` rows = second visit on the same device: light/dl/full/parked are measured from the reload, prep_s includes the first visit)

| label | scen | net | dev | extras | prep_s | light_s | dl_s | full_s | parked_s | path | reveal_ms | playbtn_ms | idle_ms | req | sw | MB | util | mbit | dlMB | errs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4g-prefetched-1 | prefetched | 4g | mob x4 |  | 22.8 |  | 21.6 |  |  | prefetched | 37 | 2759 | 5187 | 73 | 73 | 0 | 0.93 | 8.7 | 23.2 | 3 |
| 4g-revisit-1 | warm | 4g | mob x4 |  | 26.4 | 0.6 | 0.2 | 2.1 | 3.3 | warm | 24 | before | 1775 | 2 | 2 | 0 |  |  |  | 4 |
| 4g-revisit-2 | warm | 4g | mob x4 |  | 25.9 | 0.5 | 0.1 | 2 | 3.2 | warm | 27 | before | 1770 | 2 | 2 | 0 |  |  |  | 4 |
| 4g-warm-1 | warm | 4g | mob x4 |  | 24 | 8.8 | 21.8 | 22.4 | 9.6 | warm | 19 | before | 1798 | 1 | 1 | 0 | 0.86 | 8 | 23.2 | 4 |
| 4g-warm-2 | warm | 4g | mob x4 |  | 23.4 | 8.8 | 21.7 | 22.3 | 9.6 | warm | 24 | before | 1844 | 1 | 1 | 0 | 0.86 | 8.1 | 23.2 | 4 |
| 4g-warmlight-1 | warm-light | 4g | mob x4 |  | 23.2 | 8.7 | 21.7 |  | 9.6 | warm-light | 20 | 1226 | 3548 | 24 | 24 | 0 | 0.93 | 8.7 | 23.2 | 3 |
| none-hot-1 | hot | none | desk |  | 5.8 | 1.5 | 4.2 | 4.5 | 2 | warm | 6 | before | 475 | 3 | 3 | 0 |  |  |  | 4 |
| none-revisit-1 | warm | none | desk |  | 4.4 | 0.1 | 0 | 0.6 | 1 | warm | 5 | before | 467 | 1 | 1 | 0 |  |  |  | 4 |
| none-warm-1 | warm | none | desk |  | 3.2 | 0.9 | 2.8 | 3 | 1.3 | warm | 6 | before | 372 | 1 | 1 | 0 |  |  |  | 2 |
| wifi-revisit-1 | warm | wifi | desk |  | 9.9 | 0.2 | 0 | 0.6 | 1 | warm | 7 | before | 490 | 0 | 0 | 0 |  |  |  | 4 |
| wifi-warm-1 | warm | wifi | desk |  | 9 | 2.5 | 7.8 | 8 | 2.9 | warm | 6 | before | 465 | 1 | 1 | 0 | 0.72 | 23.7 | 25.2 | 4 |

## r1- (9 Sep 08:59–09:02, edge deployed on Render, https://feg-hackathon.onrender.com, Singapore; first request after idle took 12.5 s = instance wake-up, then 0.28 s)

| label | scen | net | dev | extras | prep_s | light_s | dl_s | full_s | parked_s | path | reveal_ms | playbtn_ms | idle_ms | req | sw | MB | util | mbit | dlMB | errs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4g-swcold-1 | sw-cold | 4g | mob x4 |  | 2.4 |  |  |  |  | cold-sw | 37 | 25227 | 27576 | 77 | 77 | 0 |  |  |  | 3 |
| 4g-warm-1 | warm | 4g | mob x4 |  | 25 | 8.7 | 22.5 | 23.1 | 9.5 | warm | 29 | before | 1784 | 1 | 1 | 0 |  |  |  | 3 |
| none-hot-1 | hot | none | desk |  | 7 | 3.6 | 5.7 | 6 | 4 | warm | 6 | before | 390 | 1 | 1 | 0 |  |  |  | 3 |
| none-revisit-1 | warm | none | desk |  | 11.2 | 0.4 | 0.3 | 0.9 | 1.3 | warm | 6 | before | 386 | 0 | 0 | 0 |  |  |  | 3 |
| none-warm-1 | warm | none | desk |  | 7.9 | 4.3 | 7 | 7.2 | 4.7 | warm | 6 | before | 380 | 1 | 1 | 0 |  |  |  | 3 |
| none-warm-2 | warm | none | desk |  | 8.5 | 4.1 | 7 | 7.2 | 4.5 | warm | 5 | before | 554 | 2 | 2 | 0 |  |  |  | 4 |
| wifi-warm-1 | warm | wifi | desk |  | 9.8 | 4.1 | 8.5 | 8.7 | 4.5 | warm | 5 | before | 367 | 1 | 1 | 0 |  |  |  | 4 |

## r4- (9 Sep 09:35, Render, laptop on the 30 Mbit/s Wi-Fi profile, the primary target: files-on-disk 0.97 s, light pre-boot 0.40 s, cold via worker 10.85 s, predicted 6 ms). Across all 72 laptop pre-booted launches so far: reveal p50 9.6 ms, p95 26 ms.

| label | scen | net | dev | extras | prep_s | light_s | dl_s | full_s | parked_s | path | reveal_ms | playbtn_ms | idle_ms | req | sw | MB | util | mbit | dlMB | errs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| wifi-prefetched-1 | prefetched | wifi | desk |  | 10.5 |  | 9.6 |  |  | prefetched | 6 | 970 | 1383 | 90 | 90 | 0 |  |  |  | 3 |
| wifi-swcold-1 | sw-cold | wifi | desk |  | 1.8 |  |  |  |  | cold-sw | 6 | 10850 | 11264 | 80 | 80 | 0 |  |  |  | 3 |
| wifi-warm-1 | warm | wifi | desk |  | 9.3 | 4.1 | 8.4 | 8.6 | 4.5 | warm | 6 | before | 530 | 1 | 1 | 0 |  |  |  | 4 |
| wifi-warmlight-1 | warm-light | wifi | desk |  | 9.4 | 4.3 | 8.5 |  | 4.7 | warm-light | 6 | 404 | 794 | 37 | 37 | 0 |  |  |  | 3 |
