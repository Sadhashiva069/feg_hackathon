// Next-game prediction: builds the model from the sample event log and replays it causally (online) over every
// launch to measure prefetch accuracy (metric M8) and to project the launch-time distribution (M1/M2) when the
// predicted game is pre-loaded. No dependencies. Reads data/challenge3_game_load/derived/casino_events.csv
// (never committed); writes var/predict-model.json (served by the edge at /api/predict) and var/predict-eval.json.
//
//   node src/predict/build.js [--measured var/measured.json] [--out var]
//
// Scoring (per candidate game c, given the player's state at the moment of the tap):
//   score = w.self*[c == last game this session] + w.prev*[c == last game of the previous session]
//         + w.tr * P(c | last game)  (first-order transition matrix, all players)
//         + w.aff * share of the player's own launches that were c
//         + w.pop * global share of launches that were c
// Weights are chosen on the first 60 % of the month (by time) and reported on the last 40 %; the model itself is
// updated online after every launch, so every prediction only uses launches that happened before it.
const fs = require('fs'), path = require('path');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => { if (x.startsWith('--')) a.push([x.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : true]); return a; }, []));
const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'data', 'challenge3_game_load', 'derived', 'casino_events.csv');
const OUTDIR = path.resolve(ROOT, args.out || 'var'); fs.mkdirSync(OUTDIR, { recursive: true });

function parseCSV(text) { // RFC 4180: quoted fields with commas/newlines
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch; }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift(); return rows.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const t0 = Date.now();
const events = parseCSV(fs.readFileSync(SRC, 'utf8'));
const sessionStart = new Map(); for (const e of events) { const t = Date.parse(e.timestamp); const s = sessionStart.get(e.session); if (s === undefined || t < s) sessionStart.set(e.session, t); }
const launches = events.filter(e => e.event_name === 'casino_game_launch' && e.game_name && e.game_name !== 'null').map(e => ({ t: Date.parse(e.timestamp), player: e.PlayerID, session: e.session, game: e.game_name, provider: e.provider, platform: e.platform, origin: e.on_origin })).sort((a, b) => a.t - b.t);
console.log(`${events.length} events, ${launches.length} launches, ${sessionStart.size} sessions (parsed in ${Date.now() - t0} ms)`);

// ---- causal replay: per launch, the feature vector of every candidate, computed from state BEFORE the launch ----
const T = new Map(), Tsum = new Map(), A = new Map(), Asum = new Map(), Pop = new Map(); let PopSum = 0;
const lastInSession = new Map(), lastOfPlayer = new Map(), lastLaunchT = new Map(), playerLaunches = new Map(), playerRecent = new Map();
const inc = (m, k, d = 1) => m.set(k, (m.get(k) || 0) + d);
const topPop = () => [...Pop.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(x => x[0]);
let popCache = null, popCacheAt = -1;
const samples = [];
for (let i = 0; i < launches.length; i++) {
  const L = launches[i];
  const last = lastInSession.get(L.session) || null, prev = lastOfPlayer.get(L.player) || null;
  const first = !lastInSession.has(L.session);
  const gap = first ? (sessionStart.has(L.session) ? (L.t - sessionStart.get(L.session)) / 1000 : null) : (L.t - lastLaunchT.get(L.session)) / 1000;
  if (i - popCacheAt >= 200 || !popCache) { popCache = topPop(); popCacheAt = i; }
  const cand = new Set(popCache); if (last) { cand.add(last); for (const k of (T.get(last) || new Map()).keys()) cand.add(k); } if (prev) cand.add(prev); for (const k of (A.get(L.player) || new Map()).keys()) cand.add(k);
  const feats = []; const tl = T.get(last), ts = Tsum.get(last) || 0, ap = A.get(L.player), as = Asum.get(L.player) || 0;
  for (const c of cand) feats.push([c, c === last ? 1 : 0, c === prev ? 1 : 0, ts ? (tl.get(c) || 0) / ts : 0, as ? (ap.get(c) || 0) / as : 0, PopSum ? (Pop.get(c) || 0) / PopSum : 0]);
  samples.push({ i, t: L.t, game: L.game, player: L.player, platform: L.platform, first, gap, last, sameAsLast: L.game === last, seen: (playerLaunches.get(L.player) || 0), recent: (playerRecent.get(L.player) || []).includes(L.game), feats });
  // update state
  if (last) { if (!T.has(last)) T.set(last, new Map()); inc(T.get(last), L.game); inc(Tsum, last); }
  if (!A.has(L.player)) A.set(L.player, new Map()); inc(A.get(L.player), L.game); inc(Asum, L.player); inc(Pop, L.game); PopSum++;
  lastInSession.set(L.session, L.game); lastOfPlayer.set(L.player, L.game); lastLaunchT.set(L.session, L.t); inc(playerLaunches, L.player);
  const rec = playerRecent.get(L.player) || []; const j = rec.indexOf(L.game); if (j >= 0) rec.splice(j, 1); rec.unshift(L.game); rec.length = Math.min(rec.length, 3); playerRecent.set(L.player, rec);
}
const rank = (feats, w, k) => { const sc = feats.map(f => [f[0], w.self * f[1] + w.prev * f[2] + w.tr * f[3] + w.aff * f[4] + w.pop * f[5], f[5]]); sc.sort((a, b) => b[1] - a[1] || b[2] - a[2]); return sc.slice(0, k).map(x => x[0]); };
const evalW = (w, S) => { let h1 = 0, h3 = 0; for (const s of S) { const r = rank(s.feats, w, 3); if (r[0] === s.game) h1++; if (r.includes(s.game)) h3++; } return { top1: h1 / (S.length || 1), top3: h3 / (S.length || 1), n: S.length }; };

// ---- weights: pick on the first 60 % of the month, report on the last 40 % ----
const tSplit = launches[Math.floor(launches.length * 0.6)].t;
const train = samples.filter(s => s.t < tSplit && s.seen > 0), test = samples.filter(s => s.t >= tSplit);
let best = null;
for (const self of [0.5, 1, 2]) for (const prev of [0, 0.5, 1]) for (const tr of [0.5, 1, 2]) for (const aff of [0.5, 1, 2]) for (const pop of [0.1, 0.3]) {
  const w = { self, prev, tr, aff, pop }; const r = evalW(w, train); if (!best || r.top1 + 0.5 * r.top3 > best.r.top1 + 0.5 * best.r.top3) best = { w, r };
}
const W = best.w;
const report = (S) => ({ ...evalW(W, S), sameAsLast: S.filter(s => s.sameAsLast).length / (S.length || 1) });
const byFirst = { first: report(test.filter(s => s.first)), within: report(test.filter(s => !s.first)) };
const byPlatform = Object.fromEntries(['Casino Android', 'GM', 'web'].map(p => [p, report(test.filter(s => s.platform === p))]));
const coldStart = report(test.filter(s => s.seen < 5)), known = report(test.filter(s => s.seen >= 5));
const baselines = { lastGame: (() => { const S = test.filter(s => !s.first); return { top1: S.filter(s => s.sameAsLast).length / S.length, n: S.length }; })(), popularityOnly: evalW({ self: 0, prev: 0, tr: 0, aff: 0, pop: 1 }, test), affinityOnly: evalW({ self: 0, prev: 0, tr: 0, aff: 1, pop: 0.01 }, test), transitionOnly: evalW({ self: 0, prev: 0, tr: 1, aff: 0, pop: 0.01 }, test) };
const gaps = test.map(s => s.gap).filter(g => g !== null && g >= 0).sort((a, b) => a - b); const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : null;

// ---- projected launch-time distribution when the predicted game is pre-loaded (measured inputs, see --measured) ----
// Measured tap -> Play-button times per path (ms). Defaults are the 2026-09-08 emulated Pixel 7 / 4G / CPU x4 runs and
// laptop-through-tunnel runs; pass --measured <json> to override with the latest matrix.
const measuredDefault = {
  'phone-4g': { cold: 24200, prefetched: 2800, 'warm-light': 1200, warm: 41, hot: 16, prepFirstVisitS: 27, prepCachedS: 4, lightReadyS: 5, prefetch3S: 75, baselineCold: 24700 },
  'desktop': { cold: 6300, prefetched: 1000, 'warm-light': 420, warm: 7, hot: 5, prepFirstVisitS: 4.5, prepCachedS: 1.5, lightReadyS: 2.2, prefetch3S: 12, baselineCold: 6300 } };
const measured = args.measured ? JSON.parse(fs.readFileSync(path.resolve(ROOT, args.measured), 'utf8')) : measuredDefault;
// warmSlots = how many predicted games are pre-booted (memory budget: 1 on phones, up to 3 on >= 8 GB desktops);
// the worker keeps the player's last 3 games on disk (LRU), so a relaunch of a recent game is at least "prefetched".
function project(S, M, warmSlots = 1) {
  const out = []; const paths = {};
  for (const s of S) {
    const r = rank(s.feats, W, 3); const hitWarm = r.slice(0, warmSlots).includes(s.game), hit3 = r.includes(s.game); const gap = s.gap === null ? 60 : s.gap;
    let p;
    if (s.sameAsLast && gap <= 300) p = 'hot';
    else if (hitWarm && gap >= (s.recent ? M.prepCachedS : M.prepFirstVisitS) * (warmSlots > 1 && !s.recent ? 1.5 : 1)) p = 'warm';
    else if (hitWarm && gap >= M.lightReadyS) p = 'warm-light';
    else if (s.recent || (hit3 && gap >= M.prefetch3S)) p = 'prefetched';
    else p = 'cold';
    paths[p] = (paths[p] || 0) + 1; out.push(M[p]);
  }
  out.sort((a, b) => a - b);
  return { n: S.length, warmSlots, p50: pct(out, 0.5), p90: pct(out, 0.9), p95: pct(out, 0.95), mean: Math.round(out.reduce((a, b) => a + b, 0) / (out.length || 1)), under500: out.filter(x => x < 500).length / (out.length || 1), under3s: out.filter(x => x < 3000).length / (out.length || 1), paths: Object.fromEntries(Object.entries(paths).map(([k, v]) => [k, +(v / S.length).toFixed(3)])), before: { p50: M.baselineCold, p95: M.baselineCold } };
}
const projection = Object.fromEntries(Object.entries(measured).map(([k, M]) => [k, { all: project(test, M, M.warmSlots || 1), android: project(test.filter(s => s.platform === 'Casino Android'), M, M.warmSlots || 1), slots3: project(test, M, 3) }]));

const evalOut = { generated: new Date().toISOString(), launches: launches.length, sessions: sessionStart.size, players: new Set(launches.map(l => l.player)).size, games: Pop.size, split: { trainUntil: new Date(tSplit).toISOString(), train: train.length, test: test.length },
  weights: W, trainScore: best.r, test: report(test), byFirst, byPlatform, coldStart, known, baselines, gapsSeconds: { p25: pct(gaps, 0.25), p50: pct(gaps, 0.5), p75: pct(gaps, 0.75), firstLaunchP50: pct(test.filter(s => s.first && s.gap !== null).map(s => s.gap).sort((a, b) => a - b), 0.5) }, measured, projection };
fs.writeFileSync(path.join(OUTDIR, 'predict-eval.json'), JSON.stringify(evalOut, null, 1));
// serving model (final state after the whole month): transition matrix, per-player affinity (hashed ids, stays in var/), popularity
const model = { generated: evalOut.generated, weights: W, popularity: Object.fromEntries([...Pop.entries()].sort((a, b) => b[1] - a[1])), transitions: Object.fromEntries([...T.entries()].map(([k, m]) => [k, Object.fromEntries(m)])), affinity: Object.fromEntries([...A.entries()].map(([p, m]) => [p, Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20))])), lastOfPlayer: Object.fromEntries(lastOfPlayer), recentOfPlayer: Object.fromEntries(playerRecent) };
fs.writeFileSync(path.join(OUTDIR, 'predict-model.json'), JSON.stringify(model));
const pc = x => (100 * x).toFixed(1) + ' %';
console.log(`weights ${JSON.stringify(W)} (chosen on ${train.length} launches before ${evalOut.split.trainUntil.slice(0, 10)}; train top-1 ${pc(best.r.top1)})`);
console.log(`TEST (${test.length} launches, last 40 % of the month): top-1 ${pc(evalOut.test.top1)}  top-3 ${pc(evalOut.test.top3)}`);
console.log(`  first launch of a session: top-1 ${pc(byFirst.first.top1)} top-3 ${pc(byFirst.first.top3)} (n=${byFirst.first.n}) | within session: top-1 ${pc(byFirst.within.top1)} top-3 ${pc(byFirst.within.top3)} (n=${byFirst.within.n}; same-as-last ${pc(byFirst.within.sameAsLast)})`);
for (const [p, r] of Object.entries(byPlatform)) console.log(`  ${p}: top-1 ${pc(r.top1)} top-3 ${pc(r.top3)} (n=${r.n})`);
console.log(`  cold-start players (<5 prior launches): top-1 ${pc(coldStart.top1)} (n=${coldStart.n}) | known players: top-1 ${pc(known.top1)} top-3 ${pc(known.top3)} (n=${known.n})`);
console.log(`  baselines: last-game only ${pc(baselines.lastGame.top1)} | popularity only ${pc(baselines.popularityOnly.top1)}/${pc(baselines.popularityOnly.top3)} | affinity only ${pc(baselines.affinityOnly.top1)}/${pc(baselines.affinityOnly.top3)} | transition only ${pc(baselines.transitionOnly.top1)}/${pc(baselines.transitionOnly.top3)}`);
console.log(`  gap before a launch (s): p25 ${evalOut.gapsSeconds.p25} p50 ${evalOut.gapsSeconds.p50} p75 ${evalOut.gapsSeconds.p75}; first launch after session start p50 ${evalOut.gapsSeconds.firstLaunchP50}`);
for (const [k, v] of Object.entries(projection)) console.log(`  projected tap->Play button, ${k} (${v.all.warmSlots} warm slot): p50 ${v.all.p50} ms p95 ${v.all.p95} ms (<500 ms: ${pc(v.all.under500)}, <3 s: ${pc(v.all.under3s)}; paths ${JSON.stringify(v.all.paths)}) | Casino Android p50 ${v.android.p50} ms (<500 ms: ${pc(v.android.under500)}) | 3 warm slots: p50 ${v.slots3.p50} ms p95 ${v.slots3.p95} ms (<500 ms: ${pc(v.slots3.under500)})`);
console.log(`-> ${path.join(OUTDIR, 'predict-eval.json')}, ${path.join(OUTDIR, 'predict-model.json')} (${Date.now() - t0} ms)`);
