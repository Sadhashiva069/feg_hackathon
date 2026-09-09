// Game accelerator service worker. Scope: / (only /games/<id>/<version>/... requests are touched).
//
// - cache-first for game assets, keyed by path (the bundle appends ?v= to CSS; ignored)
// - in-flight de-duplication: if the engine asks for a file the prefetcher is already downloading, both wait
//   for the same response instead of downloading it twice
// - prefetch jobs (message {type:'prefetch'}) fill the cache in manifest order with bounded concurrency
//   and report progress to the requesting client
// - Range requests (audio) are served by slicing the cached full body
// - hold/release: while a game is pre-booted but not yet shown, requests outside its critical set
//   (SECONDARY bundle, lazy sounds: ~19 MB) are parked until the lobby reveals the game, so a warm
//   frame costs the critical set only
const SW_VERSION = 'accel-2026-09-08-5'; const INSTANCE = Math.random().toString(36).slice(2, 8); const BORN = Date.now();
const GAME_RE = /^\/games\/([a-z0-9_-]+)\/([A-Za-z0-9._-]+)\//;
const cacheName = (g, v) => `game:${g}:${v}`;
const keyOf = url => { const u = new URL(url, self.location.origin); return u.origin + u.pathname; };
const inflight = new Map();          // key -> Promise<Response> (resolves when the headers arrive; stays until the cache write is done)
const puts = new Map();              // key -> Promise<void>: background cache write of an in-flight response
const STREAM = !/(^|[?&])stream=0/.test(self.location.search); // registered as /sw.js?stream=0 by the lobby's ?stream=0 hook: answer only after the cache write (A/B)
const stats = new Map();             // game -> counters
const jobs = new Map();              // prefetch job id -> { cancel }
const holds = new Map();             // game -> { critical:Set<key>, waiters:[], since }
const st = g => { let s = stats.get(g); if (!s) { s = { hit: 0, miss: 0, hitBytes: 0, missBytes: 0, errors: 0, held: 0 }; stats.set(g, s); } return s; };

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

function networkFetch(key, gid, ver) {
  if (inflight.has(key)) return inflight.get(key).then(r => r.clone());
  const p = (async () => {
    // transient edge errors (5xx, e.g. Cloudflare 52x/530) are retried here so the engine's loader, which gives up on
    // the first failed file, never sees them; a 4xx is returned as is
    let res; for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 300 * attempt * attempt));
      try { res = await fetch(key, { credentials: 'same-origin' }); } catch (e) { if (attempt === 2) throw e; continue; }
      if (res.ok || res.status < 500) break; st(gid).retries = (st(gid).retries || 0) + 1;
    }
    // the response is handed on as soon as the headers arrive (the engine sees bytes while they stream); the cache
    // write runs in the background on a clone, so a 2-5 MB atlas is not delayed by its own disk write
    if (res.ok) { const c = await caches.open(cacheName(gid, ver)); const put = c.put(key, res.clone()).catch(() => {}); puts.set(key, put); if (!STREAM) await put; }
    return res;
  })();
  inflight.set(key, p);
  p.then(() => puts.get(key)).catch(() => {}).then(() => { inflight.delete(key); puts.delete(key); });
  return p.then(r => r.clone());
}
const putDone = key => puts.get(key) || Promise.resolve();

async function sliceRange(res, range) {
  const m = /bytes=(\d*)-(\d*)/.exec(range || ''); const buf = await res.arrayBuffer(); const size = buf.byteLength;
  if (!m) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  let start = m[1] ? +m[1] : Math.max(0, size - +m[2]); let end = (m[2] && m[1]) ? +m[2] : size - 1; end = Math.min(end, size - 1);
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  const h = new Headers(res.headers); h.set('Content-Range', `bytes ${start}-${end}/${size}`); h.set('Content-Length', String(end - start + 1)); h.delete('Content-Encoding');
  return new Response(buf.slice(start, end + 1), { status: 206, headers: h });
}

function maybeHold(gid, key) {
  const h = holds.get(gid); if (!h || h.critical.has(key)) return null;
  if (Date.now() - h.since > 15 * 60 * 1000) { holds.delete(gid); return null; } // safety valve
  st(gid).held++;
  return new Promise(resolve => h.waiters.push({ key, resolve }));
}
function setHold(game, critical) { // (re)define the allowed set; requests parked earlier that are now allowed continue
  const next = { critical: new Set((critical || []).map(keyOf)), waiters: [], since: Date.now() };
  const prev = holds.get(game); let released = 0;
  if (prev) for (const w of prev.waiters) { if (next.critical.has(w.key)) { w.resolve(); released++; } else next.waiters.push(w); }
  holds.set(game, next); return released;
}

async function handle(req, gid, ver) {
  const key = keyOf(req.url); const s = st(gid);
  const hold = maybeHold(gid, key); if (hold) await hold;
  const cache = await caches.open(cacheName(gid, ver));
  let res = await cache.match(key); const hit = !!res;
  if (!res) { try { res = await networkFetch(key, gid, ver); } catch (err) { s.errors++; return new Response('accel: network error ' + err, { status: 504 }); } }
  const len = +res.headers.get('content-length') || 0;
  if (hit) { s.hit++; s.hitBytes += len; } else { s.miss++; s.missBytes += len; }
  const range = req.headers.get('range');
  if (range && res.status === 200) return sliceRange(res, range);
  return res;
}

async function savePlan(plan) { const meta = await caches.open('accel-meta'); if (plan) await meta.put('/plan', new Response(JSON.stringify(plan), { headers: { 'Content-Type': 'application/json' } })); else await meta.delete('/plan'); }
async function loadPlan() { try { const meta = await caches.open('accel-meta'); const r = await meta.match('/plan'); return r ? await r.json() : null; } catch { return null; } }
let earlyJob = null;
async function earlyPrefetch() { // consented plan from the previous visit: start filling before the lobby JS runs
  const plan = await loadPlan(); if (!plan || !plan.urls || earlyJob) return;
  earlyJob = { id: 'early' + Date.now(), t0: Date.now() };
  await prefetch({ id: earlyJob.id, game: plan.game, version: plan.version, urls: plan.urls, concurrency: plan.concurrency || 8, boost: plan.boost, maxCachedGames: plan.maxCachedGames }, () => {});
  earlyJob.done = Date.now();
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url); if (url.origin !== self.location.origin) return;
  if (e.request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) { e.waitUntil(earlyPrefetch()); return; }
  const m = GAME_RE.exec(url.pathname); if (!m) return;
  e.respondWith(handle(e.request, m[1], m[2]));
});

async function touch(game, version, maxCachedGames) { // LRU cap on the number of game caches (disk budget)
  const meta = await caches.open('accel-meta'); let lru = {}; try { const r = await meta.match('/lru'); if (r) lru = await r.json(); } catch {}
  lru[cacheName(game, version)] = Date.now();
  const names = (await caches.keys()).filter(k => k.startsWith('game:'));
  for (const k of names) if (!(k in lru)) lru[k] = 0;
  const keep = Object.entries(lru).filter(([k]) => names.includes(k)).sort((a, b) => b[1] - a[1]);
  for (const [k] of keep.slice(Math.max(1, maxCachedGames || 3))) { await caches.delete(k); delete lru[k]; }
  await meta.put('/lru', new Response(JSON.stringify(lru), { headers: { 'Content-Type': 'application/json' } }));
}
async function prefetch({ id, game, version, urls, concurrency = 6, boost, maxCachedGames }, reply) {
  const job = { cancel: false }; jobs.set(id, job);
  try { await touch(game, version, maxCachedGames); } catch {}
  const c = await caches.open(cacheName(game, version)); const t0 = Date.now();
  const list = urls.map(u => keyOf(u)); const total = list.length;
  let done = 0, bytes = 0, fromCache = 0, errors = 0, i = 0, lastReport = 0, prefix = 0; const finished = new Uint8Array(total); let failed = []; // prefix = files completed in list order (lets the lobby act on "everything up to X is on disk")
  const worker = async () => {
    while (i < list.length && !job.cancel) {
      const idx = i++; const key = list[idx];
      try {
        if (await c.match(key)) fromCache++;
        else { const r = await networkFetch(key, game, version); try { r.body && r.body.cancel(); } catch {} if (!r.ok) { errors++; failed.push(idx); } else { await putDone(key); bytes += +r.headers.get('content-length') || 0; } }
      } catch { errors++; failed.push(idx); }
      done++; finished[idx] = 1; const p0 = prefix; while (prefix < total && finished[prefix]) prefix++;
      // more streams once the light tier is on disk: on a high-bandwidth, high-latency path (real WAN) 16 streams measured ~11 % faster
      // than 8; on a 9 Mbit/s link it changes nothing but would delay the light tier, hence the two stages
      if (boost && prefix >= boost.after && !job.boosted) { job.boosted = true; while (pool.length < Math.min(boost.concurrency, total)) pool.push(worker()); }
      if (Date.now() - lastReport > 150 || done === total || prefix !== p0) { lastReport = Date.now(); reply({ type: 'prefetch-progress', id, game, done, total, bytes, errors, prefix, ms: Date.now() - t0 }); }
    }
  };
  let pool = Array.from({ length: Math.max(1, Math.min(concurrency, total)) }, worker);
  for (let n = 0; n < pool.length; n++) await pool[n]; // the pool can grow while we wait
  // files that failed (edge 5xx bursts outlast the per-request retries) get two more passes; the engine's own loader never retries
  for (const delay of [2000, 6000]) { if (!failed.length || job.cancel) break; await new Promise(r => setTimeout(r, delay));
    const again = failed; failed = []; errors -= again.length; done -= again.length; for (const idx of again) finished[idx] = 0;
    const retryList = again.map(x => list[x]); let k = 0; const w2 = async () => { while (k < retryList.length && !job.cancel) { const idx = again[k], key = retryList[k++];
      try { if (await c.match(key)) fromCache++; else { const r = await networkFetch(key, game, version); try { r.body && r.body.cancel(); } catch {} if (!r.ok) { errors++; failed.push(idx); } else { await putDone(key); bytes += +r.headers.get('content-length') || 0; } } } catch { errors++; failed.push(idx); }
      done++; finished[idx] = 1; } };
    pool = Array.from({ length: Math.min(4, retryList.length) }, w2); await Promise.all(pool); prefix = 0; while (prefix < total && finished[prefix]) prefix++;
    st(game).prefetchRetryPasses = (st(game).prefetchRetryPasses || 0) + 1; }
  jobs.delete(id);
  reply({ type: 'prefetch-done', id, game, done, total, bytes, fromCache, errors, prefix, ms: Date.now() - t0, cancelled: job.cancel });
}

async function status({ id, game, version, urls }, reply) {
  const c = await caches.open(cacheName(game, version)); let cached = 0;
  for (const u of urls) if (await c.match(keyOf(u))) cached++;
  reply({ type: 'status', id, game, cached, total: urls.length });
}

self.addEventListener('message', e => {
  const d = e.data || {}; const reply = msg => { try { e.source && e.source.postMessage(msg); } catch {} };
  if (d.type === 'prefetch') prefetch(d, reply);
  else if (d.type === 'cancel') { const j = jobs.get(d.id); if (j) j.cancel = true; }
  else if (d.type === 'status') status(d, reply);
  else if (d.type === 'hold') { const released = setHold(d.game, d.critical); reply({ type: 'held', game: d.game, released }); }
  else if (d.type === 'release') { const h = holds.get(d.game); holds.delete(d.game); if (h) for (const w of h.waiters) w.resolve(); reply({ type: 'released', game: d.game, released: h ? h.waiters.length : 0 }); }
  else if (d.type === 'plan') { savePlan(d.plan); reply({ type: 'planned' }); }
  else if (d.type === 'stats') reply({ type: 'stats', stats: Object.fromEntries(stats), version: SW_VERSION, instance: INSTANCE, ageS: Math.round((Date.now() - BORN) / 1000), holds: [...holds.keys()], inflight: inflight.size, early: earlyJob });
  else if (d.type === 'clear') caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(() => { stats.clear(); reply({ type: 'cleared' }); });
  else if (d.type === 'ping') reply({ type: 'pong', version: SW_VERSION });
});
