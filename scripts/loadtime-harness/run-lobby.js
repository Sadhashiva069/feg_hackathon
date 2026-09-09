// Scenario harness for the accelerated lobby: opens the lobby in real Chrome, brings it to the state the
// scenario needs, taps the game tile (t0), then taps Play inside the game frame and records the engine
// milestones. All times are epoch ms so lobby and game frame share one clock.
//
//   node run-lobby.js --url <lobby url> --label <name> --scenario cold|sw-cold|prefetched|warm|hot
//                     [--mobile] [--net none|4g|3g|wifi] [--cpu 1] [--headless] [--android] [--player demo-player]
//                     [--wait 240]  (max seconds to reach the scenario's start state)
//
// Scenarios (what is true at the moment of the tap):
//   cold        no service worker, nothing cached: the bundle as shipped, through the lobby
//   sw-cold     service worker installed, cache empty, consent given, no prefetch before the tap
//               (the lobby fills the cache in parallel with the engine's serial phases at tap time)
//   prefetched  critical set already in the cache, engine not booted
//   warm        critical set cached and the game pre-booted + parked before the tap
//   hot         warm launch, back to lobby, tap again (frame kept)
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => { if (x.startsWith('--')) a.push([x.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : true]); return a; }, []));
const URL_ = args.url, LABEL = args.label || 'lobby-run', SCEN = args.scenario || 'warm', NET = args.net || 'none', CPU = +(args.cpu || 1), MOBILE = !!args.mobile, HEADLESS = !!args.headless, ANDROID = !!args.android, WAIT = +(args.wait || 240), PLAYER = args.player || 'demo-player';
const OUT = path.join(__dirname, '..', 'runs', LABEL); fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const NETS = { '4g': { downloadThroughput: 9 * 1024 * 1024 / 8, uploadThroughput: 3 * 1024 * 1024 / 8, latency: 170, connectionType: 'cellular4g' }, '3g': { downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, latency: 150, connectionType: 'cellular3g' }, 'wifi': { downloadThroughput: 30 * 1024 * 1024 / 8, uploadThroughput: 15 * 1024 * 1024 / 8, latency: 28, connectionType: 'wifi' } };
const INIT = fs.readFileSync(path.join(__dirname, 'init.js'), 'utf8');
const PARAMS = { cold: 'sw=0&prefetch=0&warm=0', 'sw-cold': 'sw=1&consent=1&prefetch=0&warm=0', prefetched: 'sw=1&consent=1&prefetch=1&warm=0', warm: 'sw=1&consent=1&prefetch=1&warm=full', 'warm-eager': 'sw=1&consent=1&prefetch=1&warm=eager', 'warm-light': 'sw=1&consent=1&prefetch=1&warm=light', hot: 'sw=1&consent=1&prefetch=1&warm=full' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let browser, context, page;
  if (ANDROID) { browser = await chromium.connectOverCDP('http://localhost:9222'); context = browser.contexts()[0]; page = await context.newPage(); }
  else {
    browser = await chromium.launch({ channel: 'chrome', headless: HEADLESS, args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--window-size=1300,860', '--no-first-run'] });
    context = await browser.newContext(MOBILE ? { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36' } : { viewport: { width: 1280, height: 720 } });
    page = await context.newPage();
  }
  await page.addInitScript(INIT);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Page.enable');
  const origin = new URL(URL_).origin;
  await cdp.send('Network.clearBrowserCache');
  try { await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' }); } catch (e) { console.log('clearDataForOrigin', e.message); }
  // Link throttling happens at the origin, per client (cookie), because Chrome's emulation does not cover service-worker fetches.
  const LINK = (!ANDROID && NETS[NET] && !args.chromenet) ? NET : null; const LINK_ID = LABEL.replace(/[^A-Za-z0-9_-]/g, '').slice(-24) + Math.random().toString(36).slice(2, 6);
  if (LINK) await cdp.send('Network.setCookie', { name: 'link', value: `${LINK}.${LINK_ID}`, url: origin + '/', path: '/' });
  if (args.chaos) await cdp.send('Network.setCookie', { name: 'chaos', value: `${args.chaos}.${LINK_ID}`, url: origin + '/', path: '/' }); // --chaos <pct>.<seconds>: origin answers 530 for a while (see src/edge/server.js)
  if (!ANDROID && NETS[NET] && args.chromenet) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NETS[NET] });
  if (!ANDROID && CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

  const reqs = new Map(), netlog = [];
  cdp.on('Network.requestWillBeSent', e => reqs.set(e.requestId, { url: e.request.url, type: e.type, ts: e.timestamp, wall: e.wallTime, frame: e.frameId }));
  cdp.on('Network.responseReceived', e => { const r = reqs.get(e.requestId); if (!r) return; r.status = e.response.status; r.sw = !!e.response.fromServiceWorker; r.disk = !!e.response.fromDiskCache; r.proto = e.response.protocol; r.enc = (e.response.headers || {})['content-encoding'] || (e.response.headers || {})['Content-Encoding'] || null; r.tsResp = e.timestamp; });
  cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (r) { r.tsEnd = e.timestamp; r.bytes = e.encodedDataLength; netlog.push(r); } });
  cdp.on('Network.loadingFailed', e => { const r = reqs.get(e.requestId); if (r) { r.tsEnd = e.timestamp; r.failed = e.errorText; netlog.push(r); } });
  const consoleLog = []; page.on('console', m => consoleLog.push({ t: Date.now(), type: m.type(), text: m.text().slice(0, 200) })); page.on('pageerror', e => consoleLog.push({ t: Date.now(), type: 'pageerror', text: String(e.message).slice(0, 300) }));

  const lobbyUrl = `${URL_.replace(/\/$/, '')}/?player=${encodeURIComponent(PLAYER)}&${PARAMS[SCEN] || PARAMS.warm}${args.extra ? '&' + args.extra : ''}`;
  console.log(`[${LABEL}] scenario=${SCEN} net=${NET}${LINK ? ' (origin link profile, cookie ' + LINK + '.' + LINK_ID + ')' : ''} cpu=${CPU}x mobile=${MOBILE} android=${ANDROID}\n  ${lobbyUrl}`);
  const tNav = Date.now();
  await page.goto(lobbyUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const L = () => page.evaluate(() => { const l = window.__lobby; return { swReady: l.swReady, prefetch: l.prefetch, warm: l.warm, current: l.current && { ...l.current, frame: undefined }, launches: l.launches.map(x => ({ ...x, frame: undefined })), events: l.events.slice(-5), res: l.res, swStats: l.swStats }; }).catch(() => null);
  let shotN = 0; const shot = async tag => { try { await page.screenshot({ path: path.join(OUT, 'shots', `${String(shotN++).padStart(3, '0')}-${tag}.jpg`), type: 'jpeg', quality: 40 }); } catch {} };

  // ---- reach the scenario's start state ----
  const ready = { cold: l => true, 'sw-cold': l => l.swReady, prefetched: l => l.prefetch && l.prefetch.complete, warm: l => l.warm && (l.warm.state === 'parked' || l.warm.state === 'ready'), 'warm-eager': l => l.warm && (l.warm.state === 'parked' || l.warm.state === 'ready'), 'warm-light': l => l.warm && (l.warm.state === 'parked-light' || l.warm.state === 'ready-light') && l.prefetch && l.prefetch.complete, hot: l => l.warm && (l.warm.state === 'parked' || l.warm.state === 'ready') }[SCEN];
  const t0wait = Date.now(); let last = '';
  await page.waitForFunction(() => window.__lobby && window.__lobby.events.some(e => e.name === 'lobby_ready'), null, { timeout: 60000 });
  while (Date.now() - t0wait < WAIT * 1000) { const l = await L(); if (!l) { await sleep(300); continue; }
    const s = `sw=${l.swReady} prefetch=${l.prefetch ? `${l.prefetch.done}/${l.prefetch.total}${l.prefetch.complete ? ' done' : ''}` : '-'} warm=${l.warm && l.warm.state}`; if (s !== last) { last = s; console.log(`  ${((Date.now() - tNav) / 1000).toFixed(1)}s ${s}`); }
    if (ready(l)) break; await sleep(300); }
  if (args.revisit) { // second visit on the same device: cache already filled, plan remembered by the worker
    console.log(`  first visit reached state in ${((Date.now() - tNav) / 1000).toFixed(1)}s; reloading for the revisit timeline`);
    await sleep(1000); const tNav2 = Date.now(); await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__lobby && window.__lobby.events.some(e => e.name === 'lobby_ready'), null, { timeout: 60000 });
    const t0w = Date.now(); while (Date.now() - t0w < WAIT * 1000) { const l = await L(); if (l && ready(l)) break; await sleep(200); }
    console.log(`  revisit: state reached ${((Date.now() - tNav2) / 1000).toFixed(1)}s after navigation`);
  }
  const stateAtTap = await L(); const prepMs = Date.now() - tNav;
  const tl = await page.evaluate(() => { const l = window.__lobby; const t0 = l.events[0].t; return l.events.filter(e => /lobby_ready|sw_ready|prefetch_start|prefetch_primary_done|prefetch_done|warm_start|warm_parked|warm_upgrade|engine:PRIMARY_ASSETS_LOADED|engine:BUNDLE_LOADED/.test(e.name)).map(e => ((e.t - t0) / 1000).toFixed(1) + 's ' + e.name.replace('engine:', '') + (e.arg ? '(' + e.arg + ')' : '') + (e.level ? '[' + e.level + ']' : '')).join(' | '); }).catch(() => '');
  console.log('  preload timeline: ' + tl);
  if (!ready(stateAtTap)) console.log('WARNING: start state not reached, tapping anyway');
  await sleep(500); await shot('before-tap');

  // ---- launch: tap tile, then Play in the game frame; twice for hot ----
  const launches = [];
  const doLaunch = async (n) => {
    const tile = page.locator(`[data-tile="empireofgold"]`); const box = await tile.boundingBox();
    const tapWall = Date.now();
    if (MOBILE || ANDROID) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const shots = []; const tTap = Date.now(); let lastShot = 0, played = false, rec = null, tapIdx = 0, lastTapAt = -1e9; const TAP_Y = [0.8, 0.7, 0.9, 0.6, 0.5, 0.75, 0.85];
    while (Date.now() - tTap < 180000) {
      const el = Date.now() - tTap;
      if (el - lastShot >= (el < 3000 ? 150 : el < 20000 ? 1000 : 3000)) { lastShot = el; await shot(`L${n}-${String(el).padStart(6, '0')}`); shots.push(el); }
      const l = await L(); rec = l && l.current; if (!rec) { await sleep(50); continue; }
      const readyNow = rec.t_ready || rec.readyBeforeTap;
      if (readyNow && !rec.t_play && tapIdx < TAP_Y.length && el - lastTapAt > 500 && el > 300) {
        const fb = await page.locator('#frames iframe').first().boundingBox().catch(() => null);
        if (fb) { const x = fb.x + fb.width / 2, y = fb.y + fb.height * TAP_Y[tapIdx++]; lastTapAt = el; if (MOBILE || ANDROID) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); await page.evaluate(yy => window.__lobby.events.push({ t: performance.timeOrigin + performance.now(), name: 'harness_play_tap', y: yy }), TAP_Y[tapIdx - 1]); }
      }
      if (rec.t_idle) break;
      if (rec.path === 'blocked') break;
      await sleep(60);
    }
    await sleep(800); await shot(`L${n}-final`);
    const l = await L(); rec = l.current;
    const gameFrame = page.frames().find(f => /\/games\//.test(f.url()));
    const fm = gameFrame ? await gameFrame.evaluate(() => { const o = performance.timeOrigin; const m = {}; for (const [k, v] of Object.entries(window.__marks || {})) m[k] = o + v; return { marks: m, res: performance.getEntriesByType('resource').length, errors: window.__errors }; }).catch(() => null) : null;
    const out = { n, tapWall, rec, frameMarks: fm, shots };
    launches.push(out);
    const d = (a, b) => (a && b) ? Math.round(a - b) : null;
    console.log(`  launch ${n}: path=${rec.path} shell=${d(rec.t_shell, rec.t0)}ms reveal=${d(rec.t_reveal, rec.t0)}ms playBtn=${rec.readyBeforeTap ? 'before tap' : d(rec.t_ready, rec.t0) + 'ms'} playTap=${d(rec.t_play, rec.t0)}ms idle=${d(rec.t_idle, rec.t0)}ms (idle-playTap=${d(rec.t_idle, rec.t_play)}ms)  tapWall-t0=${Math.round(rec.t0 - tapWall)}ms`);
    return rec;
  };
  await doLaunch(1);
  if (SCEN === 'hot') { // the game goes fullscreen on phones after the Play tap: leave fullscreen (back gesture equivalent), then tap the lobby's back button
    await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {}); await sleep(600);
    const bb = await page.locator('#stage .bar-top button').first().boundingBox(); if (MOBILE || ANDROID) await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); else await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await sleep(1500); await shot('back-in-lobby'); await doLaunch(2); }

  const bytesAfter = t => netlog.filter(r => r.wall * 1000 >= t && /\/games\//.test(r.url));
  const summ = launches.map(x => { const r = x.rec; const g = bytesAfter(r.t0); const untilIdle = g.filter(q => !r.t_idle || q.wall * 1000 <= r.t_idle); return { n: x.n, path: r.path, shell_ms: r.t_shell - r.t0, reveal_ms: r.t_reveal - r.t0, playbtn_ms: r.readyBeforeTap ? 0 : (r.t_ready ? r.t_ready - r.t0 : null), readyBeforeTap: !!r.readyBeforeTap, play_ms: r.t_play ? r.t_play - r.t0 : null, idle_ms: r.t_idle ? r.t_idle - r.t0 : null, requestsAfterTap: untilIdle.length, fromSW: untilIdle.filter(q => q.sw).length, bytesAfterTapMB: +(untilIdle.reduce((s, q) => s + (q.bytes || 0), 0) / 1048576).toFixed(2) }; });
  const l = await L();
  const result = { label: LABEL, scenario: SCEN, url: lobbyUrl, net: NET, link: LINK, linkId: LINK_ID, cpu: CPU, mobile: MOBILE, android: ANDROID, player: PLAYER, prepMs, stateAtTap, summary: summ, launches, lobbyEvents: await page.evaluate(() => window.__lobby.events), swStats: l && l.swStats, netlog, consoleLog, ua: await page.evaluate(() => navigator.userAgent) };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result));
  console.log(`prep=${(prepMs / 1000).toFixed(1)}s  ${JSON.stringify(summ)}\n  -> ${path.join(OUT, 'result.json')}`);
  if (ANDROID) { await page.close(); await browser.close(); } else await browser.close();
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
