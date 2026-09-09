// Collect all run analyses into one compact report-data.json
const fs = require('fs'), path = require('path');
const RUNS = path.join(__dirname, '..', 'runs'); const out = { generated: new Date().toISOString(), runs: [], bins: {}, waterfall: null };
const order = ['direct-desktop-1', 'tunnel-desktop-1', 'tunnel-desktop-2', 'tunnel-desktop-wifi-1', 'tunnel-mobile-4g-cpu4-1', 'tunnel-mobile-4g-cpu4-2', 'tunnel-mobile-4g-cpu4-3', 'tunnel-mobile-3g-cpu4-1'];
for (const label of order) {
  const f = path.join(RUNS, label, 'analysis.json'); if (!fs.existsSync(f)) continue;
  const A = JSON.parse(fs.readFileSync(f, 'utf8'));
  const r = { label, net: A.net, cpu: A.cpu, mobile: A.mobile, url: A.url, milestones: A.milestones, requests: A.requests, byBundle: A.byBundleUntilPrimary, byBundleAll: A.byBundle, byCat: A.byCat, concurrency: { avgMBps: A.concurrency.avgMBpsUntilPrimary, peakMBps: A.concurrency.peakMBps, maxInflight: A.concurrency.maxInflight, idleTotalMs: A.concurrency.idleTotalMs }, mainThread: A.mainThreadUntilPrimary, processCpu: A.processCpuSecondsUntilPrimary, longTasks: { count: A.longTasks.countUntilPrimary, ms: A.longTasks.msUntilPrimary, top: A.longTasks.top }, audio: A.audioDecodes, trace: A.trace && { gpuTaskMs: A.trace.gpuTaskMsUntilPrimary, imageDecodeMs: A.trace.imageDecodeMsUntilPrimary, mainTop: A.trace.mainThreadTopMs }, slowest: A.slowest.slice(0, 8), gl: A.gl, dpr: A.dpr };
  delete r.requests.protocols; delete r.requests.encodings;
  out.runs.push(r);
  const tb = path.join(RUNS, label, 'tracebins.json'); if (fs.existsSync(tb)) out.bins[label] = JSON.parse(fs.readFileSync(tb, 'utf8')).rows.map(x => ({ s: x.s, main: x.main, gpu: x.gpu, net: x.netMB, inflight: x.inflight, cats: x.cats }));
  if (label === 'tunnel-mobile-4g-cpu4-1' || (label === 'tunnel-mobile-4g-cpu4-2' && !out.waterfall)) { const lim = (A.milestones.idleState || A.milestones.primaryAssetsLoaded) + 1500; out.waterfall = { label, items: A.timeline.filter(t => t.s <= lim).map(t => ({ f: t.f, b: t.b, c: t.c, s: t.s, r: t.r, e: t.e, MB: t.MB })), milestones: A.milestones }; }
}
// bundle sizes on disk (decoded) from the direct run's byBundle (all requests, uncompressed transfer)
const direct = out.runs.find(r => r.label === 'direct-desktop-1'); if (direct) out.bundleBytesOnDisk = Object.fromEntries(Object.entries(direct.byBundleAll).map(([k, v]) => [k, { n: v.n, bytes: v.bytes }]));
// thumbnails
const th = path.join(__dirname, '..', 'video', 'thumbs.json'); if (fs.existsSync(th)) out.thumbs = JSON.parse(fs.readFileSync(th, 'utf8'));
fs.writeFileSync(path.join(RUNS, 'report-data.json'), JSON.stringify(out));
console.log('runs:', out.runs.map(r => r.label).join(', '), '| bins:', Object.keys(out.bins).join(', '), '| waterfall:', out.waterfall && out.waterfall.label, '| size', (fs.statSync(path.join(RUNS, 'report-data.json')).size / 1024).toFixed(0), 'KB');
for (const r of out.runs) { const m = r.milestones; console.log(`${r.label.padEnd(26)} splashTappable ${(m.primaryAssetsLoaded / 1000).toFixed(1)}s  playable ${m.idleState ? (m.idleState / 1000).toFixed(1) + 's' : '-'}  PRIMARY ${(m.bundles.PRIMARY / 1000).toFixed(1)}s  MB-before-playable ${(r.requests.bytesUntilPrimary / 1048576).toFixed(1)}  avgMB/s ${r.concurrency.avgMBps}  mainBusy ${r.mainThread && (100 * r.mainThread.task / r.mainThread.window).toFixed(0)}%  gpuCPU ${r.processCpu && r.processCpu.GPU && (100 * r.processCpu.GPU / r.processCpu._window).toFixed(0)}%`); }
