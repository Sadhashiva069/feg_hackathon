# Dependencies, licences and AI-assistance disclosure

## Runtime (what a reviewer needs to run the prototype)

| Component | Version used | Licence | Role | Where |
|---|---|---|---|---|
| Node.js | 22.14 (any ≥ 18) | MIT-style (Node.js licence) | Edge/origin server, tests, prediction replay. **No npm packages are required to run the prototype.** | `src/`, `tests/` |
| Vue.js | 3.5.18, global production build, vendored | MIT (Yuxi "Evan" You and contributors) | Lobby shell | `src/lobby/vendor/vue.global.prod.js` |
| A Chromium-based browser | Chrome 128+ tested (Chrome 152 on the phone) | proprietary / BSD (Chromium) | Service worker, Cache Storage, `navigator.deviceMemory`; the game needs WebGL 2 | any device |

## Provided by FEG for the challenge (not licensed by this repository)

| Item | What it is | Handling |
|---|---|---|
| **Empire of Gold** game bundle (`empireofgold/`, 379 files, 98 MB) | Certified third-party package (provider SpinIQ; engine built on Pixi.js, MIT, and the Spine runtime, Esoteric Software licence, both inside the package). | Included **byte for byte, unmodified**; `tests/bundle-hashes.json` records the SHA-256 of every file as delivered and `node tests/verify-bundle.js` checks it. Served only under a versioned path by the edge; never edited, re-encoded or re-packed. Remains the property of its provider. |
| Sample datasets (event logs, `CA_Player.csv`, `hackathon_casino_trends.xlsx`, walkthrough videos, compliance guide) | Anonymised hackathon sample data (hashed player ids). | **Not committed** (`data/` is git-ignored); used offline for the prediction replay and the impact case. Derived model files stay in git-ignored `var/`. `scripts/download_data.py` re-fetches them from the hackathon Drive (requires Drive access). |

## Development / measurement only (not needed to run or judge the prototype)

| Component | Version | Licence | Role |
|---|---|---|---|
| playwright-core | 1.55.0 | Apache-2.0 | Drives the installed Chrome over CDP for the load-time harness (`scripts/loadtime-harness/`, own `package.json`) |
| cloudflared (quick tunnel) | 2025.7.0 | Apache-2.0 | Publishes the local origin on a public URL so measurements go over a real WAN path and real phones can connect |
| Android platform-tools (adb) | current | Apache-2.0 | Real-device runs over USB (`run-android.js`, `sample.sh`) |
| Python | 3.12 | PSF | `scripts/download_data.py` (uses `gdown`, MIT), the event-log profiling that produced `data/.../derived/`, `montage.py` |
| gdown, openpyxl, pandas | current | MIT / MIT / BSD-3 | Data download and offline analysis only |

No third-party API, SDK, model weights, template or paid service is used. No component imposes an obligation on FEG or T-Hub through review or evaluation.

## AI / code-assistance disclosure

Claude Code (Anthropic) was used throughout as a coding and analysis assistant: drafting and refactoring the lobby, service worker, edge server, harness and prediction replay; running and summarising measurements; and drafting the documentation. Every design decision, measurement definition and number in the docs was reviewed by the team, and all measurements were produced by running the harness on our own hardware. No hackathon data, credentials or restricted documents were pasted into public AI systems; the assistant ran locally against the workspace and the git-ignored data folder was never uploaded. The team remains responsible for originality, licensing, security and accuracy of everything in this repository.
