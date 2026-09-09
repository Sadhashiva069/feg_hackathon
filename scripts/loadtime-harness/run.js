// Load-time harness: opens the game in real Chrome, records network (CDP), CPU (CDP metrics +
// per-process cpuTime incl. GPU process), engine milestones (Pixi hooks + event emitter patch),
// screenshots and a Chrome trace. Usage:
//   node run.js --url <url> --label <name> [--net none|4g|3g|wifi] [--cpu 1] [--mobile] [--headless] [--max 120] [--autoclick]
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => { if (x.startsWith('--')) a.push([x.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : true]); return a; }, []));
const URL_ = args.url, LABEL = args.label || 'run', NET = args.net || 'none', CPU = +(args.cpu || 1), MOBILE = !!args.mobile, HEADLESS = !!args.headless, MAX = +(args.max || 120), AUTOCLICK = !!args.autoclick;
const OUT = path.join(__dirname, '..', 'runs', LABEL); fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const NETS = {
  '4g': { downloadThroughput: 9 * 1024 * 1024 / 8, uploadThroughput: 3 * 1024 * 1024 / 8, latency: 170, connectionType: 'cellular4g' },
  '3g': { downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, latency: 150, connectionType: 'cellular3g' },
  'wifi': { downloadThroughput: 30 * 1024 * 1024 / 8, uploadThroughput: 15 * 1024 * 1024 / 8, latency: 28, connectionType: 'wifi' },
};

const INIT = `(() => {
  const M = window.__marks = {}; const E = window.__events = []; const t = () => performance.now();
  const mark = (n) => { if (!(n in M)) { M[n] = t(); E.push({ t: t(), name: 'mark:' + n }); } };
  window.__mark = mark; window.__audioDecodes = []; window.__longtasks = []; window.__frames = []; window.__errors = [];
  try { performance.setResourceTimingBufferSize(5000); } catch {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__longtasks.push({ s: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) mark('paint:' + e.name); }).observe({ type: 'paint', buffered: true }); } catch {}
  window.addEventListener('error', e => window.__errors.push({ t: t(), m: String(e.message) }));
  window.addEventListener('unhandledrejection', e => window.__errors.push({ t: t(), m: 'rejection: ' + String(e.reason && e.reason.message || e.reason) }));
  const raf = (ts) => { window.__frames.push(ts); requestAnimationFrame(raf); }; requestAnimationFrame(raf);
  const oc = console.log; console.log = function (...a) { try { const s = a.map(String).join(' '); if (/^Version:/.test(s)) mark('engine_version_logged'); E.push({ t: t(), name: 'log:' + s.slice(0, 120) }); } catch {} return oc.apply(this, a); };
  const hookEmitter = (obj, tag) => { let p = obj; while (p && p !== Object.prototype) { if (Object.prototype.hasOwnProperty.call(p, 'emit') && !p.__hooked) { const orig = p.emit; p.__hooked = true; p.emit = function (ev, ...r) { try { if (typeof ev === 'string' && ev === ev.toUpperCase() && ev.length > 3 && /[A-Z]_[A-Z]/.test(ev)) { E.push({ t: t(), name: 'evt:' + ev, arg: (typeof r[0] === 'string' || typeof r[0] === 'number') ? r[0] : undefined }); mark('evt:' + ev); } } catch {} return orig.apply(this, arguments); }; E.push({ t: t(), name: 'hooked-emitter:' + tag }); return true; } p = Object.getPrototypeOf(p); } return false; };
  globalThis.__PIXI_APP_INIT__ = (app, v) => { mark('pixi_app_init'); window.__app = app; window.__pixiVersion = v; hookEmitter(app.stage, 'stage'); };
  globalThis.__PIXI_RENDERER_INIT__ = (r, v) => { mark('pixi_renderer_init'); window.__renderer = r; };
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    const od = AC.prototype.decodeAudioData;
    AC.prototype.decodeAudioData = function (buf, ok, err) { const t0 = t(), bytes = buf && buf.byteLength; mark('first_audio_decode_start'); const rec = { t0, bytes }; window.__audioDecodes.push(rec); const done = () => { rec.t1 = t(); rec.dur = rec.t1 - t0; }; const p = od.call(this, buf, (b) => { done(); ok && ok(b); }, (e) => { done(); err && err(e); }); if (p && p.then) p.then(done, done); return p; };
    const OA = AC; window.AudioContext = function (...a) { const c = new OA(...a); mark('audio_context_created'); return c; }; window.AudioContext.prototype = OA.prototype;
  }
  const obs = new MutationObserver(ms => { for (const m of ms) { for (const n of m.addedNodes) { if (n.tagName === 'CANVAS') mark('canvas_added'); if (n.querySelector && n.querySelector('canvas')) mark('canvas_added'); } for (const n of m.removedNodes) { if (n.id === 'preload') mark('preload_removed'); } if (m.type === 'attributes' && m.target.id === 'preload') { const cs = getComputedStyle(m.target); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') mark('preload_hidden'); } } });
  const startObs = () => { try { obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] }); } catch {} };
  if (document.documentElement) startObs(); else document.addEventListener('DOMContentLoaded', startObs);
  document.addEventListener('DOMContentLoaded', () => mark('DOMContentLoaded')); window.addEventListener('load', () => mark('load'));
})();`;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: HEADLESS, args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--window-size=1300,860', '--no-first-run'] });
  const ctxOpts = MOBILE
    ? { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36' }
    : { viewport: { width: 1280, height: 720 } };
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  await page.addInitScript(INIT);
  const cdp = await context.newCDPSession(page);
  const bcdp = await browser.newBrowserCDPSession();
  const sysInfo = await bcdp.send('SystemInfo.getInfo').catch(e => ({ err: String(e) }));
  await cdp.send('Network.enable'); await cdp.send('Performance.enable'); await cdp.send('Page.enable');
  if (NETS[NET]) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NETS[NET] });
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

  // ---- network bookkeeping ----
  const reqs = new Map(); const netlog = [];
  cdp.on('Network.requestWillBeSent', e => { reqs.set(e.requestId, { id: e.requestId, url: e.request.url, type: e.type, prio: e.request.initialPriority, init: e.initiator && e.initiator.type, ts: e.timestamp, wall: e.wallTime, redirect: !!e.redirectResponse }); });
  cdp.on('Network.responseReceived', e => {
    const r = reqs.get(e.requestId); if (!r) return;
    const h = e.response.headers || {};
    r.status = e.response.status; r.mime = e.response.mimeType; r.proto = e.response.protocol;
    r.fromCache = e.response.fromDiskCache || e.response.fromServiceWorker || e.response.fromPrefetchCache;
    r.enc = h['content-encoding'] || h['Content-Encoding'] || null; r.cl = +(h['content-length'] || h['Content-Length'] || 0);
    r.timing = e.response.timing; r.remoteIP = e.response.remoteIPAddress; r.tsResp = e.timestamp;
  });
  cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (!r) return; r.tsEnd = e.timestamp; r.encLen = e.encodedDataLength; netlog.push(r); });
  cdp.on('Network.loadingFailed', e => { const r = reqs.get(e.requestId); if (!r) return; r.tsEnd = e.timestamp; r.failed = e.errorText; r.canceled = e.canceled; netlog.push(r); });
  const consoleLog = []; page.on('console', m => consoleLog.push({ t: Date.now(), type: m.type(), text: m.text().slice(0, 300) }));
  page.on('pageerror', e => consoleLog.push({ t: Date.now(), type: 'pageerror', text: String(e.message).slice(0, 300) }));

  // ---- sampling ----
  const samples = []; const procSamples = [];
  const sampleProc = async () => { try { const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo'); procSamples.push({ t: Date.now(), p: processInfo.map(p => ({ type: p.type, id: p.id, cpu: p.cpuTime })) }); } catch {} };
  const sampleMetrics = async () => { try { const { metrics } = await cdp.send('Performance.getMetrics'); const o = { t: Date.now() }; for (const m of metrics) o[m.name] = m.value; samples.push(o); } catch {} };
  await browser.startTracing(page, { path: path.join(OUT, 'trace.json'), screenshots: false, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'v8.execute', 'blink.user_timing', 'loading', 'gpu', 'toplevel', 'disabled-by-default-v8.compile', 'latencyInfo'] });
  await sampleProc();
  const tStart = Date.now();
  console.log(`[${LABEL}] goto ${URL_} net=${NET} cpu=${CPU}x mobile=${MOBILE} headless=${HEADLESS}`);
  page.goto(URL_, { waitUntil: 'commit', timeout: 60000 }).catch(e => console.log('goto err', e.message));
  let shotN = 0, lastShot = -10000, lastNetActivity = Date.now(), lastCount = -1, stopReason = 'max', clicked = false, lastSample = -10000;
  const TAP_Y = [0.8, 0.7, 0.9, 0.6, 0.5, 0.75, 0.85]; let tapIdx = 0, lastTapAt = -10000;
  while (Date.now() - tStart < MAX * 1000) {
    await new Promise(r => setTimeout(r, 250));
    const el = Date.now() - tStart;
    if (el - lastShot >= (el < 60000 ? 1000 : 5000)) { lastShot = el; try { await page.screenshot({ path: path.join(OUT, 'shots', `${String(Math.round(el / 100)).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 45 }); shotN++; } catch {} }
    if (el - lastSample >= 500) { lastSample = el; await sampleMetrics(); await sampleProc(); }
    const doneCount = netlog.length + reqs.size;
    if (doneCount !== lastCount) { lastNetActivity = Date.now(); lastCount = doneCount; }
    const inflight = [...reqs.values()].filter(r => !r.tsEnd).length;
    const marks = await page.evaluate(() => window.__marks).catch(() => ({}));
    if (AUTOCLICK && marks && (marks['evt:PRIMARY_ASSETS_LOADED'] !== undefined || marks['evt:ACTIVATE_SPLASH'] !== undefined) && el > 500 && marks['evt:SPLASH_START_CLICKED'] === undefined && tapIdx < TAP_Y.length && el - lastTapAt > 1500) {
      if (!clicked) { clicked = true; await new Promise(r => setTimeout(r, 800)); }
      const vp = page.viewportSize(); const x = vp.width / 2, y = vp.height * TAP_Y[tapIdx++]; lastTapAt = Date.now() - tStart;
      if (MOBILE) await page.touchscreen.tap(x, y).catch(() => {}); else await page.mouse.click(x, y).catch(() => {});
      await page.evaluate((yy) => { window.__mark('harness_clicked_splash'); window.__events.push({ t: performance.now(), name: 'tap:' + yy }); }, TAP_Y[tapIdx - 1]).catch(() => {});
    }
    const gameReady = marks && (marks['evt:PRIMARY_ASSETS_LOADED'] !== undefined);
    if (gameReady && inflight === 0 && Date.now() - lastNetActivity > 4000 && (!AUTOCLICK || clicked)) { stopReason = 'game-ready+network-idle'; break; }
  }
  const tEnd = Date.now();
  await sampleMetrics(); await sampleProc();
  try { await page.screenshot({ path: path.join(OUT, 'final.jpg'), type: 'jpeg', quality: 60 }); } catch {}
  const pageData = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation').map(e => e.toJSON());
    const res = performance.getEntriesByType('resource').map(e => ({ name: e.name, type: e.initiatorType, start: e.startTime, end: e.responseEnd, dur: e.duration, ts: e.transferSize, ebs: e.encodedBodySize, dbs: e.decodedBodySize, proto: e.nextHopProtocol, fetchStart: e.fetchStart, reqStart: e.requestStart, respStart: e.responseStart }));
    let gl = null; try { const r = window.__renderer; if (r && r.gl) { const g = r.gl; const d = g.getExtension('WEBGL_debug_renderer_info'); gl = { type: r.type, name: r.name, version: g.getParameter(g.VERSION), renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : null, vendor: d ? g.getParameter(d.UNMASKED_VENDOR_WEBGL) : null, maxTex: g.getParameter(g.MAX_TEXTURE_SIZE) }; } } catch (e) { gl = { err: String(e) }; }
    let stage = null; try { const a = window.__app; stage = a ? { children: a.stage.children.length, w: a.renderer.width, h: a.renderer.height, res: a.renderer.resolution } : null; } catch {}
    return { nav, res, marks: window.__marks, events: window.__events, audioDecodes: window.__audioDecodes, longtasks: window.__longtasks, frames: window.__frames.length, frameTs: window.__frames.filter((_, i) => i % 10 === 0), errors: window.__errors, gl, stage, pixi: window.__pixiVersion, dpr: window.devicePixelRatio, ua: navigator.userAgent, hwc: navigator.hardwareConcurrency, mem: navigator.deviceMemory, timeOrigin: performance.timeOrigin };
  }).catch(e => ({ err: String(e) }));
  await browser.stopTracing().catch(() => {});
  const result = { label: LABEL, url: URL_, net: NET, cpu: CPU, mobile: MOBILE, headless: HEADLESS, tStart, tEnd, wall: tEnd - tStart, stopReason,
    sysInfo: { gpu: sysInfo.gpu && { devices: sysInfo.gpu.devices, aux: sysInfo.gpu.auxAttributes && { glRenderer: sysInfo.gpu.auxAttributes.glRenderer, glVendor: sysInfo.gpu.auxAttributes.glVendor } }, model: sysInfo.modelName },
    net_cdp: netlog, pending: [...reqs.values()].filter(r => !r.tsEnd).map(r => ({ url: r.url, ts: r.ts })), consoleLog, samples, procSamples, page: pageData };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result));

  // ---- quick summary ----
  const ms = pageData.marks || {};
  const fmt = v => v === undefined ? '-' : (v / 1000).toFixed(2) + 's';
  console.log(`stop=${stopReason} wall=${(result.wall / 1000).toFixed(1)}s requests=${netlog.length} pending=${result.pending.length} bytesOnWire=${(netlog.reduce((a, r) => a + (r.encLen || 0), 0) / 1048576).toFixed(2)}MB shots=${shotN}`);
  const keys = ['paint:first-contentful-paint', 'DOMContentLoaded', 'load', 'engine_version_logged', 'pixi_renderer_init', 'pixi_app_init', 'canvas_added', 'evt:BUNDLE_LOADED', 'evt:ACTIVATE_SPLASH', 'preload_removed', 'audio_context_created', 'first_audio_decode_start', 'evt:PRIMARY_ASSETS_LOADED', 'harness_clicked_splash', 'evt:SECONDARY_ASSETS_LOADED'];
  console.log('marks: ' + keys.map(k => `${k}=${fmt(ms[k])}`).join('  '));
  const evs = (pageData.events || []).filter(e => (e.name.startsWith('evt:') && !/ON_FRAME_UPDATE|LOAD_PROGRESS|APP_RESIZE/.test(e.name)) || e.name.startsWith('hooked') || (e.name.startsWith('log:') && !/PixiJS/.test(e.name)));
  const seen = new Set();
  console.log('events (first occurrence): ' + evs.filter(e => { const k = e.name + (e.arg || ''); if (seen.has(k)) return false; seen.add(k); return true; }).map(e => `${(e.t / 1000).toFixed(2)}s ${e.name}${e.arg !== undefined ? '(' + e.arg + ')' : ''}`).join(' | '));
  console.log('gl: ' + JSON.stringify(pageData.gl) + ' stage=' + JSON.stringify(pageData.stage) + ' pixi=' + pageData.pixi + ' errors=' + JSON.stringify((pageData.errors || []).slice(0, 5)));
  await browser.close();
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
