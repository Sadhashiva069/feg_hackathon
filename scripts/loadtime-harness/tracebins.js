// Per-second breakdown of renderer main-thread and GPU-process busy time from a Chrome trace.
// node tracebins.js <label>   -> prints table, writes runs/<label>/tracebins.json
const fs = require('fs'), path = require('path');
const LABEL = process.argv[2]; const DIR = path.join(__dirname, '..', 'runs', LABEL);
const R = JSON.parse(fs.readFileSync(path.join(DIR, 'result.json'), 'utf8')); const marks = R.page.marks || {};
const ev = JSON.parse(fs.readFileSync(path.join(DIR, 'trace.json'), 'utf8')).traceEvents;
const threads = {}, procs = {};
for (const e of ev) { if (e.ph === 'M' && e.name === 'thread_name') threads[e.pid + ':' + e.tid] = e.args.name; if (e.ph === 'M' && e.name === 'process_name') procs[e.pid] = e.args.name; }
const navStart = ev.find(e => e.name === 'navigationStart' && e.args && e.args.data && e.args.data.isLoadingMainFrame);
const base = navStart ? navStart.ts : Math.min(...ev.filter(e => e.ts && e.ph === 'X').map(e => e.ts));
// find the renderer main thread that owns the page: the one with most RunTask time among CrRendererMain threads
const mainCand = {}; for (const e of ev) if (e.ph === 'X' && threads[e.pid + ':' + e.tid] === 'CrRendererMain' && /RunTask/.test(e.name)) mainCand[e.pid + ':' + e.tid] = (mainCand[e.pid + ':' + e.tid] || 0) + e.dur;
const mainKey = Object.entries(mainCand).sort((a, b) => b[1] - a[1])[0][0];
const CAT = n => {
  if (/FireAnimationFrame|Animation|RequestAnimationFrame/.test(n)) return 'raf(render loop)';
  if (/FunctionCall|EvaluateScript|v8\.(run|callFunction|evaluateModule)|V8\.Execute|RunMicrotasks|TimerFire|EventDispatch|XHRLoad|XHRReadyStateChange/.test(n)) return 'script';
  if (/V8\.Compile|v8\.compile|V8\.Parse|v8\.parse|CompileCode|CompileScript/.test(n)) return 'js parse/compile';
  if (/Decode Image|ImageDecode|DecodeLazyPixelRef|Decode LazyPixelRef|PaintImage/.test(n)) return 'image decode';
  if (/GC|MinorGC|MajorGC|GCEvent|BlinkGC/.test(n)) return 'gc';
  if (/Layout|UpdateLayoutTree|RecalcStyle|Paint|PrePaint|Commit|Layerize|CompositeLayers|UpdateLayer/.test(n)) return 'layout/paint';
  if (/WaitForCmd|CommandBufferHelper::Finish|WaitForGetOffset|ReadbackImagePixels|GetBucketContents|GLES2|RasterCHROMIUM|Flush/.test(n)) return 'gpu sync/upload';
  if (/ParseHTML|ResourceReceivedData|ResourceFinish|ResourceSendRequest|ResourceReceiveResponse|Receive mojo|SimpleWatcher/.test(n)) return 'net/parse';
  return null;
};
// Attribute top-level RunTask busy time on main thread; for categories, sum non-nested leaf-ish events by class.
const secs = Math.ceil(((marks['evt:IDLE_STATE_ENTRY'] || marks['evt:PRIMARY_ASSETS_LOADED'] || 30000) + 2000) / 1000);
const bins = Array.from({ length: secs }, (_, i) => ({ s: i, mainBusy: 0, gpuBusy: 0, cats: {} }));
const addSpan = (arr, key, start, dur, sub) => { let t = start; const end = start + dur; while (t < end) { const i = Math.floor(t / 1e6); if (i >= arr.length) break; const next = Math.min(end, (i + 1) * 1e6); if (sub) { arr[i].cats[sub] = (arr[i].cats[sub] || 0) + (next - t); } else arr[i][key] += next - t; t = next; } };
const TOP = ev.some(e => e.name === 'ThreadControllerImpl::RunTask') ? 'ThreadControllerImpl::RunTask' : 'RunTask';
const gpuMain = Object.entries(threads).filter(([k, v]) => v === 'CrGpuMain').map(([k]) => k);
for (const e of ev) {
  if (e.ph !== 'X' || !e.dur) continue; const rel = e.ts - base; if (rel < 0) continue; const k = e.pid + ':' + e.tid;
  if (k === mainKey) { if (e.name === TOP) addSpan(bins, 'mainBusy', rel, e.dur); else { const c = CAT(e.name); if (c) addSpan(bins, null, rel, e.dur, c); } }
  else if (gpuMain.includes(k)) { if (e.name === TOP) addSpan(bins, 'gpuBusy', rel, e.dur); }
}
// network bytes per second from CDP log
const T0 = R.page.timeOrigin; const netBins = new Array(secs).fill(0); const inflight = new Array(secs).fill(0);
for (const r of R.net_cdp) { const start = r.wall * 1000 - T0; const rs = r.tsResp ? start + (r.tsResp - r.ts) * 1000 : start; const end = start + (r.tsEnd - r.ts) * 1000; const b = r.encLen || 0; if (end <= rs) continue; for (let i = 0; i < secs; i++) { const s = Math.max(rs, i * 1000), e2 = Math.min(end, (i + 1) * 1000); if (e2 > s) netBins[i] += b * (e2 - s) / (end - rs); if (start < (i + 1) * 1000 && end > i * 1000) inflight[i]++; } }
const rows = bins.map((b, i) => { const c = b.cats; const top = Object.entries(c).sort((a, b2) => b2[1] - a[1]).slice(0, 3).map(([n, d]) => `${n} ${(d / 1000).toFixed(0)}`).join(', '); return { s: i, main: +(b.mainBusy / 10000).toFixed(0), gpu: +(b.gpuBusy / 10000).toFixed(0), netMB: +(netBins[i] / 1048576).toFixed(2), inflight: inflight[i], top, cats: Object.fromEntries(Object.entries(c).map(([n, d]) => [n, +(d / 1000).toFixed(0)])) }; });
fs.writeFileSync(path.join(DIR, 'tracebins.json'), JSON.stringify({ label: LABEL, mainThread: mainKey, rows }));
console.log(`=== ${LABEL}: per-second main-thread busy %, GPU-process busy %, MB received, requests in flight, top categories (ms)`);
for (const r of rows) console.log(`${String(r.s).padStart(3)}s main ${String(r.main).padStart(3)}%  gpu ${String(r.gpu).padStart(3)}%  net ${r.netMB.toFixed(2).padStart(5)} MB  inflight ${String(r.inflight).padStart(2)}  ${r.top}`);
