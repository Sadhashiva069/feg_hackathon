# FEG Innovation Hackathon 2026 — Challenge 3: Game Load Time (6–8 s → ~500 ms)

Workspace layout

| Path | Contents |
|---|---|
| `empireofgold/` | The certified game bundle, extracted as delivered. **Do not modify** (contractual guardrail); build everything around it. |
| `data/challenge3_game_load/` | Event logs, player data, trends, docs, walkthrough videos, participant requirements, derived datasets (inventory below). |
| `progress/` | `LOAD_TIME_PROGRESS.md` — running log of measurements against the challenge metrics. |

## Data inventory

Data downloaded 2026-09-08 from the two hackathon shares into `data/challenge3_game_load/`. Paths in the table below are relative to that folder. Everything relevant to Challenge 3 is here; the
sportsbook-only files were skipped on purpose (see bottom).

Sources
- Google Drive "Sample Data Set": https://drive.google.com/drive/folders/1K2GK1KJP6xvphik6y7LhNVyNzT1dzMV4
- Zoho WorkDrive "PARTICIPANT REQUIREMENTS": https://workdrive.zohoexternal.com/external/2bcd765f3ec86a8d0141b4d1c41c762e0f5c84a1134a4a9a2e6678fb3f12fe92

## Folder map

| Path | What it is | Why it matters for Challenge 3 |
|---|---|---|
| `../../empireofgold/` (root) | The certified third‑party game bundle (Pixi.js slot "Empire of Gold"), extracted from `empireofgold.zip` (Drive ID `1TeZPx8ZS7utmYcovF9lXfBTD9rqYJ8E9`, 85 MB, verified file‑for‑file). | This is the baseline you must load faster **without modifying**. |
| `event_logs/top_casino_users_event_logs.csv` (84 MB, 332,119 rows) | GA‑style event log for top casino users, 14 Aug – early Sep 2026. 24 columns. | Contains 13,682 `casino_game_launch` events with `game_name`, `provider`, `on_origin`, `on_route`, `from_route`, `platform`, `PlayerID`, `session`, `timestamp` → the training data for next‑game prediction / prefetch. |
| `event_logs/top_casino_users_event_logs_v2.xlsx` (17 MB) | Same 332,119 rows / same schema as the CSV, but timestamps in `2026-08-14 10:29:31.257373 UTC` format. | Duplicate of the CSV; use the CSV. |
| `event_logs/CA_Player.csv` (109 MB, 741,679 rows) | Daily casino stake aggregates per player × game (`brand, local_transaction_date, provider, reporting_bet_type (game code), src_game_type, total_stake_amt, PlayerID`), Aug 2026, brand `hr` (PSK). | Player affinity / popularity prior per game code; useful for cache warming and prefetch ranking. |
| `event_logs/hackathon_casino_trends.xlsx` | Monthly market KPIs (CASA/CZ/PSK): stake per session, spins per session, **avg games per session (2.2–3.1)**, sessions per player, median session length. | Baseline for the "games sampled per session" metric. |
| `docs/FEG Innovation Hackathon 2026 - EU regulations guide.pdf` | Compliance guide (GDPR, ePrivacy, AMLD, eIDAS, AI Act, WCAG, Croatian gambling rules). | Feeds `docs/compliance-note.md` in the submission; guardrail on RG interstitials, age gates. |
| `docs/image.png` | FEG approved tech stack diagram (Vue.js; Java/Python/.NET; NGINX/Kafka/RabbitMQ; PostgreSQL/Redis/Mongo/Elastic; crossed out: Velocity, PHP, C++, MS SQL, Ignite). | Pick stack for the lobby/prefetch service from this. |
| `videos/Gaming Casino.mp4` (113 MB) | Casino product walkthrough. | See the real lobby → game launch flow to reproduce the baseline. |
| `videos/Web application walkthrough.mp4` (100 MB) | Web app walkthrough. | Same. |
| `videos/Mobile View & Native apps.mp4` (85 MB) | Mobile/native app walkthrough. | Same, for "real devices" demo. |
| `participant_requirements/` | Zoho share: submission guidelines (docx + extracted .md), agenda (pdf + .txt), EU regulations guide (dup), VPN guide, WiFi + support contact PNGs, `Sample Data Set.url` (points at the Drive folder). | Repo structure & mandatory docs checklist. |
| `derived/` | Files computed from the event log (rebuild by rerunning the profiling steps; raw files come from `scripts/download_data.py`). | Ready‑to‑use inputs for prediction/prefetch work. |

## derived/ contents

- `casino_events.csv` — 95,227 rows: all casino‑platform / casino.psk.hr events (16 columns, sportsbook columns dropped).
- `casino_game_launches.csv` — the 13,682 `casino_game_launch` rows only.
- `session_game_sequences.csv` — one row per (PlayerID, session): games launched in order, providers, launch origins, first/last timestamps. 2,596 sessions.
- `game_transitions.csv` — first‑order Markov counts `from_game → to_game` across consecutive launches in a session.
- `game_popularity.csv` — launches per game and how often it is the first game of a session.
- `player_game_affinity.csv` — per player, share of launches by game.
- `summary.json` — headline numbers.

Headline numbers from the event log (see `summary.json`):

| Metric | Value |
|---|---|
| Game launches | 13,682 (65 players, 887 distinct games, 44 providers) |
| Launches per session p50 / p90 | 3 / 12 |
| Gap between consecutive launches p25 / p50 / p75 | 84 s / 221 s / 571 s |
| Same game relaunched next (self‑transition) | 34.7 % of switches |
| Top‑10 games' share of all launches | 34.7 % |
| Launch origins | search_results 3,580; category_game_row 3,235; grid 1,786; top_10 304; direct_landing 300 |
| Platforms | Casino Android 9,906; GM (web casino) 3,332; web 444 |

Implications: a per‑player "last game + top‑3 affinity" prefetch would cover a large share of launches;
search and category rows are the surfaces where hover/scroll‑intent prefetch pays off.

## Game bundle facts (baseline you are speeding up)

Extracted bundle (`empireofgold/`) is 98 MB on disk, 375 files. Breakdown:

| Part | Size |
|---|---|
| `assets/spines/` (Spine animations, PNG atlases + JSON) | 61.5 MB — `@1x` and `@0.5x` folders are byte‑identical (md5 checked), so half is pure duplication |
| `assets/sounds/` (ogg + mp3, both shipped) | 28 MB — two 5 MB background music tracks dominate |
| `assets/images/`, fonts, panel, paytable, locale, history | ~8 MB |
| JS: `vendor-pixi` 1.29 MB (br 306 KB), `core-engine` 389 KB (br 67 KB), `game-empireofgold` 46 KB, `index-canvas` 7 KB | pre‑compressed `.gz`/`.br` already shipped |

Load sequence found in `core-engine`: `PRELOADER` bundle → `COMMON` → `PRIMARY` (splash shown when `primaryAssetsLoaded`) → sounds → `SECONDARY` → `FEATURES`; resolution folder chosen at runtime from `devicePixelRatio` (`@1x` desktop/tablet, `@0.5x` otherwise). Runtime calls go to `api.spiniq.io` (game server, player preferences, bet history) and a Fortuna lobby URL. `assets/manifest.json` in the bundle is nearly empty; the real manifest is built in code (`createAssetsManifest`).

## Skipped from the Drive (not relevant to Challenge 3)

`EPS_Offers.csv` (1.58 GB, sports offers), `SB_MOM.csv`, `SB_Player.csv`, `top_sport_users_event_logs.csv`
(sportsbook), `anyconnect-*.msi` (VPN client), `top_casino_users_event_logs (1).csv` and `.xlsx` (duplicates of the CSV).
Drive IDs if needed later: EPS `14fqOL0II0JnEHR94T2HqhPIZ080pOend`, SB_MOM `1O1J7TnC7B7bskV0XWjdpqknJUo3vjIPx`,
SB_Player `1_LvnLvRiNPPuTr6fkTPRfjyRIppQHX7L`, sport logs `1ougoJc6yPo4zSOIt25g3jALwS_ur5gl_`.

## Handling rules (from the guidelines)

Player IDs are hashed but this is still restricted hackathon data: keep it out of the git repo (`.gitignore` the `data/` folder),
never paste it into public AI tools, do not commit any credentials from the VPN/WiFi files.
