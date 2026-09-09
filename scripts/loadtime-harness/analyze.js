// Analyze one harness run: node analyze.js <label>
const fs = require('fs'), path = require('path');
const LABEL = process.argv[2]; const DIR = path.join(__dirname, '..', 'runs', LABEL);
const R = JSON.parse(fs.readFileSync(path.join(DIR, 'result.json'), 'utf8'));
const T0 = R.page.timeOrigin; const marks = R.page.marks || {};
const MB = b => (b / 1048576).toFixed(2);
const BUNDLES = {
  PRELOADER: ['gameContent.json', 'commonContent.json', 'brandLogo', 'Mulish'],
  COMMON: ['NewRocker-Regular', 'Oswald-Bold', 'EOG_Logo_Anim', 'controlPanelPrimaryAssets'],
  SPLASH: ['splashBG', 'splashAssets'],
  PRIMARY: ['loader_anim', 'bitmapFont', 'BG_king', 'controlPanelAssets', 'commonLangAssets', 'gameElements', 'reels_frame', 'symbols', 'king_character', 'explosion1', 'langImages'],
  SOUNDS_EAGER: ['BBGM', 'genericButtonSound'],
  SECONDARY: ['bigwins', 'scatter', 'chest', 'book', 'shield', 'cup', 'low_1', 'low_2', 'low_3', 'low_4', 'low_5'],
};
function bundleOf(u) {
  const p = decodeURIComponent(new URL(u).pathname); const base = path.basename(p); const stem = base.replace(/\.[a-z0-9]+$/i, '').replace(/_\d+$/, '');
  if (/\.(js|css|html)$/.test(base) || p === '/' ) return 'BOOT';
  for (const [b, names] of Object.entries(BUNDLES)) if (names.some(n => stem === n || base.startsWith(n + '.') || base.startsWith(n + '_'))) return b;
  if (/\/sounds\//.test(p)) return 'SOUNDS_LAZY';
  if (/\/panel\//.test(p) || /\/history\//.test(p) || /\/paytable\//.test(p) || /gameRules|cheat/.test(p)) return 'PANEL_UI';
  return 'OTHER';
}
function catOf(u) {
  const p = decodeURIComponent(new URL(u).pathname).toLowerCase();
  if (p === '/' || p.endsWith('.html')) return 'html'; if (p.endsWith('.js')) return 'js'; if (p.endsWith('.css')) return 'css';
  if (p.endsWith('.ttf') || p.endsWith('.woff') || p.endsWith('.woff2')) return 'font';
  if (p.includes('/spines/')) return p.endsWith('.png') ? 'spine-png' : p.endsWith('.json') ? 'spine-json' : 'spine-atlas';
  if (p.includes('/sounds/')) return p.endsWith('.ogg') ? 'sound-ogg' : 'sound-mp3';
  if (/\.(png|jpg|jpeg|webp|gif)$/.test(p)) return 'image'; if (p.endsWith('.json')) return 'json'; return 'other';
}
// ---- requests (CDP) ----
const reqs = R.net_cdp.map(r => { const start = r.wall * 1000 - T0; const end = start + (r.tsEnd - r.ts) * 1000; const respStart = r.tsResp ? start + (r.tsResp - r.ts) * 1000 : end; return { url: r.url, short: decodeURIComponent(new URL(r.url).pathname).replace('/assets/', ''), start, respStart, end, dur: end - start, bytes: r.encLen || 0, cl: r.cl, enc: r.enc, proto: r.proto, mime: r.mime, prio: r.prio, status: r.status, failed: r.failed, bundle: bundleOf(r.url), cat: catOf(r.url), ttfb: r.timing ? r.timing.receiveHeadersEnd - r.timing.sendEnd : null, connect: r.timing ? (r.timing.connectEnd > 0 ? r.timing.connectEnd - r.timing.connectStart : 0) : null }; }).sort((a, b) => a.start - b.start);
const tPrimary = marks['evt:PRIMARY_ASSETS_LOADED'], tIdle = marks['evt:IDLE_STATE_ENTRY'], tClick = marks['harness_clicked_splash'];
const critical = reqs.filter(r => tPrimary === undefined || r.end <= tPrimary + 50);
const sum = a => a.reduce((x, r) => x + r.bytes, 0);
const byKey = (arr, k) => { const m = {}; for (const r of arr) { const o = m[r[k]] || (m[r[k]] = { n: 0, bytes: 0, first: Infinity, last: 0, durSum: 0 }); o.n++; o.bytes += r.bytes; o.first = Math.min(o.first, r.start); o.last = Math.max(o.last, r.end); o.durSum += r.dur; } return m; };
// ---- concurrency / idle gaps up to PRIMARY_ASSETS_LOADED ----
const horizon = tPrimary || Math.max(...reqs.map(r => r.end));
const step = 250; const buckets = [];
for (let t = 0; t < horizon; t += step) { const inflight = reqs.filter(r => r.start < t + step && r.end > t).length; let bytes = 0; for (const r of reqs) { const s = Math.max(r.respStart, t), e = Math.min(r.end, t + step); if (e > s && r.end > r.respStart) bytes += r.bytes * (e - s) / (r.end - r.respStart); } buckets.push({ t, inflight, bytes }); }
const gaps = []; let g = null; for (const b of buckets) { if (b.inflight === 0) { if (!g) g = { from: b.t, to: b.t + step }; else g.to = b.t + step; } else if (g) { gaps.push(g); g = null; } } if (g) gaps.push(g);
// ---- CPU from Performance.getMetrics ----
const S = R.samples; const cpuSeries = []; for (let i = 1; i < S.length; i++) { const dt = (S[i].t - S[i - 1].t) / 1000; cpuSeries.push({ t: S[i].t - R.tStart, task: (S[i].TaskDuration - S[i - 1].TaskDuration) / dt, script: (S[i].ScriptDuration - S[i - 1].ScriptDuration) / dt, heapMB: S[i].JSHeapUsedSize / 1048576 }); }
const untilPrimary = S.filter(s => tPrimary === undefined || s.t - R.tStart <= tPrimary + 600); const sP = untilPrimary[untilPrimary.length - 1], s0 = S[0];
const mainBusy = sP ? { task: sP.TaskDuration - s0.TaskDuration, script: sP.ScriptDuration - s0.ScriptDuration, layout: sP.LayoutDuration - s0.LayoutDuration, style: sP.RecalcStyleDuration - s0.RecalcStyleDuration, heapMB: sP.JSHeapUsedSize / 1048576, window: (sP.t - s0.t) / 1000 } : null;
// ---- per-process CPU (renderer, gpu, browser) ----
const P = R.procSamples; const procTot = {}; const procSeries = [];
if (P.length > 1) { const first = P[0], last = P.filter(p => tPrimary === undefined || p.t - R.tStart <= tPrimary + 600).pop() || P[P.length - 1]; const idx = s => Object.fromEntries(s.p.map(x => [x.type + ':' + x.id, x.cpu])); const a = idx(first), b = idx(last); for (const k of Object.keys(b)) { const type = k.split(':')[0]; procTot[type] = (procTot[type] || 0) + Math.max(0, (b[k] || 0) - (a[k] || 0)); } procTot._window = (last.t - first.t) / 1000; for (let i = 1; i < P.length; i++) { const x = idx(P[i - 1]), y = idx(P[i]); const dt = (P[i].t - P[i - 1].t) / 1000; const o = { t: P[i].t - R.tStart }; for (const k of Object.keys(y)) { const type = k.split(':')[0]; o[type] = (o[type] || 0) + Math.max(0, (y[k] - (x[k] || y[k]))) / dt; } procSeries.push(o); } }
// ---- trace ----
let trace = null; const tp = path.join(DIR, 'trace.json');
if (fs.existsSync(tp)) {
  try {
    const ev = JSON.parse(fs.readFileSync(tp, 'utf8')).traceEvents; const threads = {}; for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') threads[e.pid + ':' + e.tid] = e.args.name; const procs = {}; for (const e of ev) if (e.ph === 'M' && e.name === 'process_name') procs[e.pid] = e.args.name;
    const navStart = ev.find(e => e.name === 'navigationStart' && e.args && e.args.data && e.args.data.isLoadingMainFrame); const tsBase = navStart ? navStart.ts : Math.min(...ev.filter(e => e.ts).map(e => e.ts)); const lim = tPrimary !== undefined ? tPrimary * 1000 : Infinity;
    const byName = {}, byThread = {}; let gpuTask = 0, gpuTaskAll = 0, imgDecode = 0, imgDecodeAll = 0, rasterAll = 0;
    for (const e of ev) { if (e.ph !== 'X' || !e.dur) continue; const rel = e.ts - tsBase; const inWin = rel >= 0 && rel <= lim; const th = threads[e.pid + ':' + e.tid] || '?'; const pn = procs[e.pid] || '?';
      if (e.name === 'GPUTask') { gpuTaskAll += e.dur; if (inWin) gpuTask += e.dur; }
      if (/ImageDecodeTask|Decode Image|DecodeImage|Decode LazyPixelRef|ImageDecode/.test(e.name)) { imgDecodeAll += e.dur; if (inWin) imgDecode += e.dur; }
      if (/RasterTask|Rasterize/.test(e.name)) rasterAll += e.dur;
      if (!inWin) continue; if (th === 'CrRendererMain') { byName[e.name] = (byName[e.name] || 0) + e.dur; } const tk = pn + '/' + th; if (/RunTask|ThreadControllerImpl::RunTask|MessageLoop::RunTask|TaskQueueManager::ProcessTaskFromWorkQueue/.test(e.name)) byThread[tk] = (byThread[tk] || 0) + e.dur; }
    const top = Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([n, d]) => [n, +(d / 1000).toFixed(0)]);
    const topThreads = Object.entries(byThread).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, d]) => [n, +(d / 1000).toFixed(0)]);
    trace = { events: ev.length, mainThreadTopMs: top, threadsRunTaskMs: topThreads, gpuTaskMsUntilPrimary: +(gpuTask / 1000).toFixed(0), gpuTaskMsAll: +(gpuTaskAll / 1000).toFixed(0), imageDecodeMsUntilPrimary: +(imgDecode / 1000).toFixed(0), imageDecodeMsAll: +(imgDecodeAll / 1000).toFixed(0), rasterMsAll: +(rasterAll / 1000).toFixed(0) };
  } catch (e) { trace = { err: String(e.message).slice(0, 200) }; }
}
// ---- assemble ----
const lt = R.page.longtasks || []; const ltWin = lt.filter(x => tPrimary === undefined || x.s <= tPrimary);
const ad = R.page.audioDecodes || [];
const out = {
  label: LABEL, url: R.url, net: R.net, cpu: R.cpu, mobile: R.mobile, wall: R.wall, stopReason: R.stopReason,
  milestones: { fcp: marks['paint:first-contentful-paint'], dcl: marks['DOMContentLoaded'], load: marks['load'], pixiInit: marks['pixi_app_init'], preloaderBundle: marks['evt:BUNDLE_LOADED'], gameInit: marks['evt:GAME_INIT_SUCCESS'], primaryAssetsLoaded: tPrimary, splashClicked: tClick, idleState: tIdle, bundles: Object.fromEntries(['PRELOADER', 'COMMON', 'SPLASH', 'PRIMARY'].map(b => [b, (R.page.events.find(e => e.name === 'evt:BUNDLE_LOADED' && e.arg === b) || {}).t])) },
  requests: { total: reqs.length, untilPrimary: critical.length, bytesTotal: sum(reqs), bytesUntilPrimary: sum(critical), failed: reqs.filter(r => r.failed).length, protocols: byKey(reqs, 'proto'), encodings: byKey(reqs, 'enc') },
  byBundle: byKey(reqs, 'bundle'), byCat: byKey(reqs, 'cat'), byBundleUntilPrimary: byKey(critical, 'bundle'),
  slowest: [...critical].sort((a, b) => b.dur - a.dur).slice(0, 15).map(r => ({ f: r.short, bundle: r.bundle, MB: MB(r.bytes), start: +(r.start / 1000).toFixed(2), dur: +(r.dur / 1000).toFixed(2), ttfb: r.ttfb && +r.ttfb.toFixed(0), enc: r.enc, proto: r.proto })),
  biggest: [...reqs].sort((a, b) => b.bytes - a.bytes).slice(0, 15).map(r => ({ f: r.short, bundle: r.bundle, MB: MB(r.bytes), start: +(r.start / 1000).toFixed(2), end: +(r.end / 1000).toFixed(2) })),
  concurrency: { maxInflight: Math.max(...buckets.map(b => b.inflight)), avgInflight: +(buckets.reduce((a, b) => a + b.inflight, 0) / buckets.length).toFixed(1), idleGapsMs: gaps.map(g => ({ from: g.from, to: g.to, len: g.to - g.from })).filter(g => g.len >= 250), idleTotalMs: gaps.reduce((a, g) => a + (g.to - g.from), 0), peakMBps: +(Math.max(...buckets.map(b => b.bytes)) / step * 1000 / 1048576).toFixed(2), avgMBpsUntilPrimary: +((sum(critical) / (horizon / 1000)) / 1048576).toFixed(2) },
  mainThreadUntilPrimary: mainBusy, processCpuSecondsUntilPrimary: procTot, longTasks: { countUntilPrimary: ltWin.length, msUntilPrimary: +ltWin.reduce((a, x) => a + x.d, 0).toFixed(0), top: [...ltWin].sort((a, b) => b.d - a.d).slice(0, 8).map(x => ({ at: +(x.s / 1000).toFixed(2), ms: +x.d.toFixed(0) })) },
  audioDecodes: { n: ad.length, MB: MB(ad.reduce((a, x) => a + (x.bytes || 0), 0)), totalMs: +ad.reduce((a, x) => a + (x.dur || 0), 0).toFixed(0), maxMs: +Math.max(0, ...ad.map(x => x.dur || 0)).toFixed(0), first: ad[0] && { at: +(ad[0].t0 / 1000).toFixed(2), ms: +(ad[0].dur || 0).toFixed(0), MB: MB(ad[0].bytes || 0) } },
  frames: R.page.frames, errors: R.page.errors, gl: R.page.gl, dpr: R.page.dpr, hwc: R.page.hwc, trace, cpuSeries, procSeries, buckets, timeline: reqs.map(r => ({ f: r.short, b: r.bundle, c: r.cat, s: +r.start.toFixed(0), r: +r.respStart.toFixed(0), e: +r.end.toFixed(0), MB: +MB(r.bytes) })),
};
fs.writeFileSync(path.join(DIR, 'analysis.json'), JSON.stringify(out));
const f = v => v === undefined || v === null ? '-' : (v / 1000).toFixed(2) + 's';
const m = out.milestones;
console.log(`=== ${LABEL}  (${R.net}, cpu ${R.cpu}x, ${R.mobile ? 'mobile' : 'desktop'})  url=${R.url}`);
console.log(`milestones: FCP ${f(m.fcp)} | DCL ${f(m.dcl)} | pixi ${f(m.pixiInit)} | PRELOADER ${f(m.bundles.PRELOADER)} | COMMON ${f(m.bundles.COMMON)} | SPLASH ${f(m.bundles.SPLASH)} | PRIMARY ${f(m.bundles.PRIMARY)} | PRIMARY_ASSETS_LOADED(sounds decoded, splash tappable) ${f(m.primaryAssetsLoaded)} | tap ${f(m.splashClicked)} | IDLE(playable) ${f(m.idleState)}`);
console.log(`requests: ${out.requests.total} total / ${out.requests.untilPrimary} before playable; bytes ${MB(out.requests.bytesTotal)} MB total / ${MB(out.requests.bytesUntilPrimary)} MB before playable; failed ${out.requests.failed}; protocols ${Object.entries(out.requests.protocols).map(([k, v]) => k + '=' + v.n).join(',')}; encodings ${Object.entries(out.requests.encodings).map(([k, v]) => k + '=' + v.n).join(',')}`);
console.log('by bundle (until playable): ' + Object.entries(out.byBundleUntilPrimary).sort((a, b) => a[1].first - b[1].first).map(([k, v]) => `${k}: ${v.n} req, ${MB(v.bytes)} MB, ${f(v.first)}→${f(v.last)}`).join(' | '));
console.log('by type (all): ' + Object.entries(out.byCat).sort((a, b) => b[1].bytes - a[1].bytes).map(([k, v]) => `${k} ${v.n}×${MB(v.bytes)}MB`).join(' | '));
console.log(`concurrency: max ${out.concurrency.maxInflight} avg ${out.concurrency.avgInflight} in-flight; peak ${out.concurrency.peakMBps} MB/s, avg ${out.concurrency.avgMBpsUntilPrimary} MB/s until playable; network idle gaps ${out.concurrency.idleTotalMs} ms: ${out.concurrency.idleGapsMs.map(g => `${(g.from / 1000).toFixed(2)}-${(g.to / 1000).toFixed(2)}s`).join(', ')}`);
console.log('main thread until playable: ' + JSON.stringify(out.mainThreadUntilPrimary) + '  per-process CPU s: ' + JSON.stringify(out.processCpuSecondsUntilPrimary));
console.log('long tasks: ' + JSON.stringify(out.longTasks) + '  audio decodes: ' + JSON.stringify(out.audioDecodes));
console.log('slowest requests (until playable): ' + out.slowest.map(r => `${r.f} ${r.MB}MB ${r.start}s+${r.dur}s ttfb${r.ttfb}`).join(' | '));
console.log('trace: ' + JSON.stringify(trace));
