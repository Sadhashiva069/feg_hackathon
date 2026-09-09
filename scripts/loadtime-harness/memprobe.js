// Memory cost of the accelerator: renderer + GPU process memory with nothing warm vs one parked game.
// Usage: node memprobe.js --url http://localhost:8080/ [--mobile]
const { chromium } = require('playwright-core'); const { execSync } = require('child_process');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => { if (x.startsWith('--')) a.push([x.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : true]); return a; }, []));
const URL_ = args.url, MOBILE = !!args.mobile, WARM = args.warm || 'full'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const memOf = pids => { const out = execSync('powershell -NoProfile -Command "Get-Process chrome | Select-Object Id,WorkingSet64,PrivateMemorySize64 | ConvertTo-Json"').toString(); const list = JSON.parse(out); const m = {}; for (const p of list) m[p.Id] = { ws: p.WorkingSet64, priv: p.PrivateMemorySize64 }; return pids.map(id => m[id] || { ws: 0, priv: 0 }); };
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist', '--window-size=1300,860', '--no-first-run'] });
  const context = await browser.newContext(MOBILE ? { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36' } : { viewport: { width: 1280, height: 720 } });
  const page = await context.newPage(); const bcdp = await browser.newBrowserCDPSession();
  const snap = async (tag) => { const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo'); const ren = processInfo.filter(p => p.type === 'renderer'); const gpu = processInfo.filter(p => p.type === 'GPU');
    const r = memOf(ren.map(p => p.id)), g = memOf(gpu.map(p => p.id)); const sum = a => a.reduce((s, x) => s + x.priv, 0) / 1048576;
    const heap = await page.evaluate(() => { const f = document.querySelector('#frames iframe'); const pm = w => { try { return w.performance.memory ? Math.round(w.performance.memory.usedJSHeapSize / 1048576) : null; } catch { return null; } }; return { lobbyHeapMB: pm(window), gameHeapMB: f ? pm(f.contentWindow) : null, warm: window.__lobby && window.__lobby.warm.state }; }).catch(() => ({}));
    const o = { tag, rendererPrivMB: +sum(r).toFixed(0), rendererMaxWSMB: +(Math.max(...r.map(x => x.ws)) / 1048576).toFixed(0), gpuPrivMB: +sum(g).toFixed(0), gpuWSMB: +(g.reduce((s, x) => s + x.ws, 0) / 1048576).toFixed(0), nRenderers: ren.length, ...heap }; console.log(JSON.stringify(o)); return o; };
  await page.goto(URL_ + '?sw=1&consent=1&prefetch=0&warm=0'); await page.waitForFunction(() => window.__lobby && window.__lobby.events.some(e => e.name === 'lobby_ready')); await sleep(3000);
  const a = await snap('lobby only, nothing warm');
  await page.goto(URL_ + '?sw=1&consent=1&prefetch=1&warm=' + WARM); await page.waitForFunction(() => window.__lobby && window.__lobby.warm && /^parked/.test(window.__lobby.warm.state), null, { timeout: 240000 }); await sleep(4000);
  const b = await snap('one game pre-booted and parked (' + WARM + ')');
  await sleep(20000); const c = await snap('parked +20 s (secondary held)');
  await page.evaluate(() => window.__lobby && document.querySelector('[data-tile="empireofgold"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); await sleep(15000);
  const d = await snap('revealed, secondary released, +15 s');
  console.log(`\nDELTA parked vs lobby-only: renderer +${b.rendererPrivMB - a.rendererPrivMB} MB private, GPU process +${b.gpuPrivMB - a.gpuPrivMB} MB; after reveal renderer +${d.rendererPrivMB - a.rendererPrivMB} MB, GPU +${d.gpuPrivMB - a.gpuPrivMB} MB`);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
