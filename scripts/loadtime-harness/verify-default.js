const { chromium } = require('playwright-core');
const URL_ = 'https://implied-firmware-dakota-expectations.trycloudflare.com/?player=demo-player';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const snap = () => page.evaluate(() => { const l = window.__lobby; return l && { consent: l.consent, sw: l.swReady, prefetch: l.prefetch && (l.prefetch.done + '/' + l.prefetch.total + (l.prefetch.complete ? ' done' : '')), warm: l.warm && l.warm.state, checkbox: document.getElementById('consent') && document.getElementById('consent').checked }; }).catch(() => null);
  const t0 = Date.now();
  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  let last = '';
  for (let i = 0; i < 60; i++) { const s = await snap(); const str = JSON.stringify(s); if (str !== last) { last = str; console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', str); } if (s && (s.warm === 'parked' || s.warm === 'ready')) break; await sleep(500); }
  console.log('--- switch the pre-load off via the checkbox, then reload');
  await page.click('#consent'); await sleep(500); console.log('after click', JSON.stringify(await snap()));
  await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(2500); console.log('after reload', JSON.stringify(await snap()));
  console.log('--- switch it back on, reload');
  await page.click('#consent'); await sleep(500); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(3000); console.log('after reload', JSON.stringify(await snap()));
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
