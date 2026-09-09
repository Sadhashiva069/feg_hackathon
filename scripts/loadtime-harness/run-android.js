// Real-device harness: drives Chrome on a USB-connected Android phone through `adb forward tcp:9222
// localabstract:chrome_devtools_remote`, records the same CDP data as run.js, plus on-device counters
// sampled through adb (CPU busy from /proc/stat, per-process CPU of Chrome processes, bytes on the
// network interfaces, GPU utilisation from a sysfs node, battery temperature).
//   node run-android.js --url <url> --label <name> [--max 120] [--autoclick] [--adb <path>] [--gpu <sysfs path>]
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path'), { execFileSync, spawn } = require('child_process');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => { if (x.startsWith('--')) a.push([x.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : true]); return a; }, []));
const URL_ = args.url, LABEL = args.label || 'android', MAX = +(args.max || 120), AUTOCLICK = !!args.autoclick, ADB = args.adb || 'adb', GPU_PATH = args.gpu || '';
const OUT = path.join(__dirname, '..', 'runs', LABEL); fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const sh = (cmd) => { try { return execFileSync(ADB, ['shell', cmd], { encoding: 'utf8', timeout: 8000 }); } catch (e) { return ''; } };
const INIT = fs.readFileSync(path.join(__dirname, 'run.js'), 'utf8').match(/const INIT = `([\s\S]*?)`;\n/)[1];

(async () => {
  const device = { model: sh('getprop ro.product.model').trim(), manufacturer: sh('getprop ro.product.manufacturer').trim(), android: sh('getprop ro.build.version.release').trim(), soc: sh('getprop ro.board.platform').trim(), chrome: (sh('dumpsys package com.android.chrome | grep -m1 versionName').match(/versionName=(\S+)/) || [])[1], nproc: +sh('nproc').trim() || null, activeNetwork: sh("dumpsys connectivity | grep -iE 'Active default network' | head -1").trim(), wifi: sh("dumpsys wifi | grep -iE 'mWifiInfo' | head -1").trim().slice(0, 300).replace(/(SSID|BSSID|MAC|IP): [^,]*/g, '$1: <redacted>') /* no network identifiers in run files */, battery: sh('dumpsys battery | grep -E "level|temperature"').replace(/\s+/g, ' ').trim() };
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  await context.addInitScript(INIT);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Performance.enable'); await cdp.send('Page.enable');
  await cdp.send('Network.clearBrowserCache').catch(() => {}); await cdp.send('Network.clearBrowserCookies').catch(() => {});
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false }).catch(() => {});
  let bcdp = null, sysInfo = {}; try { bcdp = await browser.newBrowserCDPSession(); sysInfo = await bcdp.send('SystemInfo.getInfo'); } catch (e) { sysInfo = { err: String(e.message).slice(0, 100) }; }
  const reqs = new Map(); const netlog = [];
  cdp.on('Network.requestWillBeSent', e => { reqs.set(e.requestId, { id: e.requestId, url: e.request.url, type: e.type, prio: e.request.initialPriority, init: e.initiator && e.initiator.type, ts: e.timestamp, wall: e.wallTime, redirect: !!e.redirectResponse }); });
  cdp.on('Network.responseReceived', e => { const r = reqs.get(e.requestId); if (!r) return; const h = e.response.headers || {}; r.status = e.response.status; r.mime = e.response.mimeType; r.proto = e.response.protocol; r.fromCache = e.response.fromDiskCache || e.response.fromServiceWorker || e.response.fromPrefetchCache; r.enc = h['content-encoding'] || h['Content-Encoding'] || null; r.cl = +(h['content-length'] || h['Content-Length'] || 0); r.timing = e.response.timing; r.remoteIP = e.response.remoteIPAddress; r.tsResp = e.timestamp; });
  cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (!r) return; r.tsEnd = e.timestamp; r.encLen = e.encodedDataLength; netlog.push(r); });
  cdp.on('Network.loadingFailed', e => { const r = reqs.get(e.requestId); if (!r) return; r.tsEnd = e.timestamp; r.failed = e.errorText; r.canceled = e.canceled; netlog.push(r); });
  const consoleLog = []; page.on('console', m => consoleLog.push({ t: Date.now(), type: m.type(), text: m.text().slice(0, 300) })); page.on('pageerror', e => consoleLog.push({ t: Date.now(), type: 'pageerror', text: String(e.message).slice(0, 300) }));
  const samples = [], procSamples = [], adbSamples = [];
  const sampleMetrics = async () => { try { const { metrics } = await cdp.send('Performance.getMetrics'); const o = { t: Date.now() }; for (const m of metrics) o[m.name] = m.value; samples.push(o); } catch {} };
  const sampleProc = async () => { if (!bcdp) return; try { const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo'); procSamples.push({ t: Date.now(), p: processInfo.map(p => ({ type: p.type, id: p.id, cpu: p.cpuTime })) }); } catch {} };
  // ---- adb sampler (async, one shell call per tick) ----
  let chromePids = []; const findPids = () => { const ps = sh('ps -A -o PID,NAME | grep com.android.chrome'); chromePids = ps.trim().split('\n').filter(Boolean).map(l => { const m = l.trim().split(/\s+/); return { pid: m[0], name: (m[1] || '').replace('com.android.chrome', 'chrome') }; }); };
  try { execFileSync(ADB, ['push', path.join(__dirname, 'sample.sh'), '/data/local/tmp/sample.sh'], { stdio: 'ignore', timeout: 10000 }); } catch (e) { console.log('push sample.sh failed', e.message); }
  const adbTick = () => new Promise(res => { const t = Date.now(); const ch = spawn(ADB, ['shell', 'sh', '/data/local/tmp/sample.sh', ...chromePids.map(p => p.pid)]); let out = ''; ch.stdout.on('data', d => out += d); ch.on('close', () => { adbSamples.push({ t, raw: out }); res(); }); setTimeout(() => { try { ch.kill(); } catch {} res(); }, 4000); });
  let tracing = false; try { await browser.startTracing(page, { path: path.join(OUT, 'trace.json'), screenshots: false, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute', 'blink.user_timing', 'loading', 'gpu', 'toplevel', 'disabled-by-default-v8.compile'] }); tracing = true; } catch (e) { consoleLog.push({ t: Date.now(), type: 'harness', text: 'tracing unavailable: ' + e.message.slice(0, 120) }); }
  await adbTick(); await sampleProc();
  const tStart = Date.now();
  console.log(`[${LABEL}] ${device.manufacturer} ${device.model} Android ${device.android} Chrome ${device.chrome} → ${URL_}`);
  page.goto(URL_, { waitUntil: 'commit', timeout: 60000 }).catch(e => console.log('goto err', e.message));
  const TAP_Y = [0.85, 0.8, 0.9, 0.75, 0.7, 0.6, 0.5]; let tapIdx = 0, lastTapAt = -10000, clicked = false;
  let shotN = 0, lastShot = -10000, lastNetActivity = Date.now(), lastCount = -1, stopReason = 'max', lastSample = -10000, lastAdb = -10000, pidsFound = false;
  let adbBusy = false;
  while (Date.now() - tStart < MAX * 1000) {
    await new Promise(r => setTimeout(r, 250));
    const el = Date.now() - tStart;
    if (!pidsFound && el > 1500) { pidsFound = true; findPids(); }
    if (el - lastAdb >= 1000 && !adbBusy) { lastAdb = el; adbBusy = true; adbTick().then(() => adbBusy = false); }
    if (el - lastShot >= (el < 60000 ? 1500 : 5000)) { lastShot = el; try { await page.screenshot({ path: path.join(OUT, 'shots', `${String(Math.round(el / 100)).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 40 }); shotN++; } catch {} }
    if (el - lastSample >= 500) { lastSample = el; await sampleMetrics(); await sampleProc(); }
    const doneCount = netlog.length + reqs.size; if (doneCount !== lastCount) { lastNetActivity = Date.now(); lastCount = doneCount; }
    const inflight = [...reqs.values()].filter(r => !r.tsEnd).length;
    const marks = await page.evaluate(() => window.__marks).catch(() => ({}));
    if (AUTOCLICK && marks && (marks['evt:PRIMARY_ASSETS_LOADED'] !== undefined) && el > 500 && marks['evt:SPLASH_START_CLICKED'] === undefined && tapIdx < TAP_Y.length && el - lastTapAt > 1500) {
      if (!clicked) { clicked = true; await new Promise(r => setTimeout(r, 800)); }
      const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight })); const x = vp.w / 2, y = vp.h * TAP_Y[tapIdx++]; lastTapAt = Date.now() - tStart;
      try { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await new Promise(r => setTimeout(r, 60)); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } catch (e) {}
      await page.evaluate((yy) => { window.__mark('harness_clicked_splash'); window.__events.push({ t: performance.now(), name: 'tap:' + yy }); }, TAP_Y[tapIdx - 1]).catch(() => {});
    }
    const gameReady = marks && marks['evt:PRIMARY_ASSETS_LOADED'] !== undefined;
    if (gameReady && inflight === 0 && Date.now() - lastNetActivity > 4000 && (!AUTOCLICK || clicked)) { stopReason = 'game-ready+network-idle'; break; }
  }
  const tEnd = Date.now(); await sampleMetrics(); await sampleProc(); await adbTick();
  try { await page.screenshot({ path: path.join(OUT, 'final.jpg'), type: 'jpeg', quality: 60 }); } catch {}
  const pageData = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation').map(e => e.toJSON());
    const res = performance.getEntriesByType('resource').map(e => ({ name: e.name, type: e.initiatorType, start: e.startTime, end: e.responseEnd, dur: e.duration, ts: e.transferSize, ebs: e.encodedBodySize, dbs: e.decodedBodySize, proto: e.nextHopProtocol }));
    let gl = null; try { const r = window.__renderer; if (r && r.gl) { const g = r.gl; const d = g.getExtension('WEBGL_debug_renderer_info'); gl = { type: r.type, name: r.name, version: g.getParameter(g.VERSION), renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : null, vendor: d ? g.getParameter(d.UNMASKED_VENDOR_WEBGL) : null, maxTex: g.getParameter(g.MAX_TEXTURE_SIZE) }; } } catch (e) { gl = { err: String(e) }; }
    let stage = null; try { const a = window.__app; stage = a ? { children: a.stage.children.length, w: a.renderer.width, h: a.renderer.height, res: a.renderer.resolution } : null; } catch {}
    return { nav, res, marks: window.__marks || {}, events: window.__events || [], audioDecodes: window.__audioDecodes || [], longtasks: window.__longtasks || [], frames: (window.__frames || []).length, errors: window.__errors || [], gl, stage, pixi: window.__pixiVersion, dpr: window.devicePixelRatio, ua: navigator.userAgent, hwc: navigator.hardwareConcurrency, mem: navigator.deviceMemory, timeOrigin: performance.timeOrigin, vw: innerWidth, vh: innerHeight, conn: navigator.connection ? { type: navigator.connection.effectiveType, downlink: navigator.connection.downlink, rtt: navigator.connection.rtt } : null };
  }).catch(e => ({ err: String(e) }));
  if (tracing) await browser.stopTracing().catch(() => {});
  // ---- parse adb samples ----
  const parsed = adbSamples.map(s => { const o = { t: s.t, net: {}, proc: {} }; for (const line of s.raw.split('\n')) { const p = line.trim().split(/\s+/); if (p[0] === 'cpu') { const v = p.slice(1).map(Number); o.cpuTotal = v.reduce((a, b) => a + b, 0); o.cpuIdle = v[3] + (v[4] || 0); } else if (p[0] === 'N') { o.net[p[1].replace(':', '')] = { rx: +p[2], tx: +p[3] }; } else if (p[0] === 'G') { o.gpu = p.slice(1).join(' '); } else if (p[0] === 'B') { o.battTemp = +p[1] / 10; } else if (p[0] === 'F') { o.freq = p.slice(1).map(Number); } else if (p[0] === 'P') { o.proc[p[1]] = (+p[2] || 0) + (+p[3] || 0); } } return o; });
  const result = { label: LABEL, url: URL_, net: 'real-device', cpu: 1, mobile: true, headless: false, device, tStart, tEnd, wall: tEnd - tStart, stopReason, sysInfo: { gpu: sysInfo.gpu && { devices: sysInfo.gpu.devices }, err: sysInfo.err }, net_cdp: netlog, pending: [...reqs.values()].filter(r => !r.tsEnd).map(r => ({ url: r.url, ts: r.ts })), consoleLog, samples, procSamples, adbSamples: parsed, chromePids, page: pageData, tracing };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result));
  const ms = pageData.marks || {}; const fmt = v => v === undefined ? '-' : (v / 1000).toFixed(2) + 's';
  console.log(`stop=${stopReason} wall=${(result.wall / 1000).toFixed(1)}s requests=${netlog.length} pending=${result.pending.length} bytesOnWire=${(netlog.reduce((a, r) => a + (r.encLen || 0), 0) / 1048576).toFixed(2)}MB shots=${shotN} tracing=${tracing} conn=${JSON.stringify(pageData.conn)} dpr=${pageData.dpr} vp=${pageData.vw}x${pageData.vh}`);
  const keys = ['paint:first-contentful-paint', 'DOMContentLoaded', 'engine_version_logged', 'pixi_app_init', 'evt:BUNDLE_LOADED', 'audio_context_created', 'evt:PRIMARY_ASSETS_LOADED', 'harness_clicked_splash', 'evt:SPLASH_START_CLICKED', 'evt:IDLE_STATE_ENTRY'];
  console.log('marks: ' + keys.map(k => `${k}=${fmt(ms[k])}`).join('  '));
  const evs = (pageData.events || []).filter(e => (e.name.startsWith('evt:') && !/ON_FRAME_UPDATE|LOAD_PROGRESS|APP_RESIZE/.test(e.name)) || e.name.startsWith('hooked')); const seen = new Set();
  console.log('events: ' + evs.filter(e => { const k = e.name + (e.arg || ''); if (seen.has(k)) return false; seen.add(k); return true; }).map(e => `${(e.t / 1000).toFixed(2)}s ${e.name}${e.arg !== undefined ? '(' + e.arg + ')' : ''}`).join(' | '));
  console.log('gl: ' + JSON.stringify(pageData.gl) + ' errors=' + JSON.stringify((pageData.errors || []).slice(0, 3)) + ' adbSamples=' + parsed.length + ' pids=' + chromePids.map(p => p.name).join(','));
  await page.close().catch(() => {}); await browser.close().catch(() => {});
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
