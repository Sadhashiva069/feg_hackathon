// Edge / origin for the game-load accelerator. Evolved from scripts/loadtime-harness/server.js so the
// same JSONL access log and analysis scripts keep working.
//
// One origin serves everything (a service worker needs that):
//   /                          lobby shell                                   no-cache
//   /sw.js                     service worker (scope /)                      no-cache
//   /lobby/*                   lobby assets                                  no-cache (prototype)
//   /games/<id>/<version>/*    certified bundle, byte-for-byte               public, max-age=1y, immutable
//                              shipped .br/.gz when present, on-the-fly brotli/gzip for text assets
//                              (memoised), Range for audio, ETag/304
//   /api/games, /api/manifest/<id>, POST /api/events, /api/health
//
// Usage: node server.js [--port 8080] [--log var/edge-access.jsonl] [--baseline]
//   --baseline: serve the bundle the way the provider CDN does today (shipped .br only, no edge compression, no cache
//   headers, no service worker). Run it on a second port/origin for the side-by-side demo page (/compare).
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => { if (x.startsWith('--')) a.push([x.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : true]); return a; }, []));
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +(args.port || process.env.PORT || 8080);
const VAR = path.join(ROOT, 'var'); fs.mkdirSync(VAR, { recursive: true });
const LOG = args.log || path.join(VAR, 'edge-access.jsonl');
const LOBBY = path.join(ROOT, 'src', 'lobby');
const GAMES = JSON.parse(fs.readFileSync(path.join(__dirname, 'games.json'), 'utf8'));
for (const [id, g] of Object.entries(GAMES)) { g.id = id; g.absDir = path.resolve(__dirname, g.dir); g.available = fs.existsSync(path.join(g.absDir, 'index.html')); g.base = `/games/${id}/${g.version}/`; }
const MANIFESTS = {}; for (const f of fs.readdirSync(path.join(__dirname, 'manifests'))) if (f.endsWith('.json')) { const m = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifests', f), 'utf8')); MANIFESTS[m.game] = m; }


const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.atlas': 'text/plain; charset=utf-8',
  '.fnt': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.atlas', '.fnt', '.txt', '.svg', '.ttf']);
const IMMUTABLE = 'public, max-age=31536000, immutable', NO_CACHE = 'no-cache';
const BASELINE = !!args.baseline;
const anon = s => require('crypto').createHash('sha256').update(String(s)).digest('hex').slice(0, 8); // client addresses are never logged, only a short hash

// ---- on-the-fly compression, memoised (bytes decode to exactly the file on disk) ----
const czCache = new Map(); let czTotal = 0; const CZ_CAP = 256 * 1024 * 1024;
function compressed(fp, mtimeMs, enc) {
  const key = `${enc}:${fp}:${mtimeMs}`; if (czCache.has(key)) return czCache.get(key);
  const raw = fs.readFileSync(fp);
  const out = enc === 'br' ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } }) : zlib.gzipSync(raw, { level: 6 });
  if (czTotal + out.length <= CZ_CAP) { czCache.set(key, out); czTotal += out.length; }
  return out;
}
function prewarm() { // compress the text assets of every manifest once so the first request is never slow
  let n = 0;
  for (const [gid, m] of Object.entries(MANIFESTS)) { const g = GAMES[gid]; if (!g || !g.available) continue;
    for (const e of m.entries) { const fp = path.join(g.absDir, e.p); const ext = path.extname(fp).toLowerCase();
      if (COMPRESSIBLE.has(ext) && fs.existsSync(fp) && !fs.existsSync(fp + '.br') && !fs.existsSync(fp + '.gz')) { const st = fs.statSync(fp); if (st.size > 1024) { compressed(fp, st.mtimeMs, 'br'); n++; } } } }
  console.log(`[edge] pre-compressed ${n} text assets (brotli)`);
}

const logStream = fs.createWriteStream(LOG, { flags: 'a' });
// ---- optional shared-link throttle (token bucket over all responses + fixed latency). Chrome's own network
// emulation does not apply to service-worker fetches, so for emulated-phone runs the origin throttles instead. ----
const THR = args.throttle ? +args.throttle * 1024 * 1024 / 8 : 0; const LAT = +(args.latency || 0);
class Bucket { constructor(rate) { this.rate = rate; this.tokens = rate * 0.05; this.last = Date.now(); this.q = []; this.timer = null; }
  take(n) { return new Promise(res => { this.q.push([n, res]); this.pump(); }); }
  pump() { if (this.timer) return; const t = Date.now(); this.tokens = Math.min(this.rate * 0.2, this.tokens + (t - this.last) / 1000 * this.rate); this.last = t;
    const cap = this.rate * 0.2; // a chunk larger than the bucket goes out once the bucket is full and drives the balance negative (average rate is kept)
    while (this.q.length && Math.min(this.q[0][0], cap) <= this.tokens) { const [n, res] = this.q.shift(); this.tokens -= n; res(); }
    if (this.q.length) { const need = Math.min(this.q[0][0], cap) - this.tokens; this.timer = setTimeout(() => { this.timer = null; this.pump(); }, Math.max(4, need / this.rate * 1000)); } } }
const bucket = THR ? new Bucket(THR) : null;
// Per-client link profiles: a `link=<profile>.<id>` cookie (set by the harness, or by the lobby's "simulate" control)
// gets its own token bucket + latency, so an emulated 4G phone and a real phone can share one origin/tunnel.
const PROFILES = { '4g': [9, 170], '3g': [1.6, 150], 'wifi': [30, 28], '2g': [0.4, 400], 'slow4g': [4, 250] };
const links = new Map();
// Test hook: a `chaos=<pct>.<seconds>.<id>` cookie (harness `--chaos 60.12`) makes the origin answer <pct> % of that client's game-asset
// requests with HTTP 530 for <seconds> after its first request: reproduces the quick-tunnel failure bursts deterministically.
const chaos = new Map();
function chaosHit(req) {
  const m = /(?:^|;\s*)chaos=(\d+)\.(\d+)\.([A-Za-z0-9_-]+)/.exec(req.headers.cookie || ''); if (!m || BASELINE) return false;
  let c = chaos.get(m[3]); if (!c) { c = { since: Date.now() }; chaos.set(m[3], c); }
  return Date.now() - c.since < +m[2] * 1000 && Math.random() * 100 < +m[1];
}
function linkFor(req) {
  const m = /(?:^|;\s*)link=([a-z0-9]+)(?:\.([A-Za-z0-9_-]+))?/.exec(req.headers.cookie || '');
  if (!m || !PROFILES[m[1]]) return { bucket, lat: LAT, key: null };
  const key = m[1] + '.' + (m[2] || anon(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'x'));
  let l = links.get(key); if (!l) { const [mbit, ms] = PROFILES[m[1]]; l = { bucket: new Bucket(mbit * 1024 * 1024 / 8), lat: ms, key, seen: 0 }; links.set(key, l); }
  l.seen = Date.now(); return l;
}
setInterval(() => { const t = Date.now(); for (const [k, l] of links) if (t - l.seen > 15 * 60e3) links.delete(k); }, 60e3).unref();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function sendChunks(res, bkt, iter) { let n = 0; for await (const chunk of iter) { if (bkt) await bkt.take(chunk.length); if (!res.write(chunk)) await new Promise(r => res.once('drain', r)); n += chunk.length; } res.end(); return n; }
function* bufChunks(buf, sz = 1 << 16) { for (let i = 0; i < buf.length; i += sz) yield buf.subarray(i, Math.min(buf.length, i + sz)); }

async function serveFile(req, res, fp, cache, extra, done) {
  let st; try { st = fs.statSync(fp); } catch { st = null; }
  if (!st || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return done(404, 0); }
  const ext = path.extname(fp).toLowerCase();
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const ln = linkFor(req); req.__link = ln.key; if (ln.lat) await sleep(ln.lat);
  if ((req.headers['if-none-match'] || '').includes(etag)) { res.writeHead(304, { ETag: etag, 'Cache-Control': cache }); res.end(); return done(304, 0); }
  const ae = req.headers['accept-encoding'] || ''; const range = req.headers.range;
  let enc = null, sendPath = fp, size = st.size, body = null;
  if (!range) {
    for (const [e, sfx] of [['br', '.br'], ['gzip', '.gz']]) if (ae.includes(e) && fs.existsSync(fp + sfx)) { enc = e; sendPath = fp + sfx; size = fs.statSync(sendPath).size; break; }
    if (!BASELINE && !enc && COMPRESSIBLE.has(ext) && st.size > 1024) { enc = ae.includes('br') ? 'br' : ae.includes('gzip') ? 'gzip' : null; if (enc) { body = compressed(fp, st.mtimeMs, enc); size = body.length; } }
  }
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': cache, ETag: etag, 'X-Content-Type-Options': 'nosniff', ...(extra || {}) };
  if (enc) { headers['Content-Encoding'] = enc; headers.Vary = 'Accept-Encoding'; }
  try {
    if (range && !enc) {
      const m = /bytes=(\d*)-(\d*)/.exec(range); if (!m) { res.writeHead(416); res.end(); return done(416, 0); }
      let start = m[1] ? +m[1] : Math.max(0, st.size - +m[2]), end = (m[2] && m[1]) ? +m[2] : st.size - 1; end = Math.min(end, st.size - 1);
      if (start > end) { res.writeHead(416); res.end(); return done(416, 0); }
      headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`; headers['Content-Length'] = end - start + 1;
      res.writeHead(206, headers); if (req.method === 'HEAD') { res.end(); return done(206, 0); }
      return done(206, await sendChunks(res, ln.bucket, fs.createReadStream(fp, { start, end, highWaterMark: 1 << 16 })));
    }
    headers['Content-Length'] = size; res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return done(200, 0, enc); }
    if (body) return done(200, await sendChunks(res, ln.bucket, bufChunks(body)), enc);
    return done(200, await sendChunks(res, ln.bucket, fs.createReadStream(sendPath, { highWaterMark: 1 << 16 })), enc);
  } catch (e) { try { res.destroy(); } catch {} return done(499, 0, enc); }
}
function safeJoin(root, rel) { const fp = path.normalize(path.join(root, rel)); return fp.startsWith(path.normalize(root)) ? fp : null; }
function json(res, obj, status = 200, cache = NO_CACHE, done) { const b = Buffer.from(JSON.stringify(obj)); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, 'Content-Length': b.length }); res.end(b); done && done(status, b.length); }
const eventsStream = fs.createWriteStream(path.join(VAR, 'events.jsonl'), { flags: 'a' });

http.createServer((req, res) => {
  const t0 = Date.now();
  const done = (status, bytes, enc) => logStream.write(JSON.stringify({ t: t0, ms: Date.now() - t0, m: req.method, u: req.url, s: status, b: bytes, enc: enc || null, via: req.headers['cf-connecting-ip'] ? 'tunnel' : 'direct', ua: (req.headers['user-agent'] || '').slice(0, 60), range: req.headers.range || null, link: req.__link || null }) + '\n');
  const u = new URL(req.url, 'http://x'); const p = decodeURIComponent(u.pathname);
  if (req.method === 'POST') {
    let buf = ''; req.on('data', d => { buf += d; if (buf.length > 1e6) req.destroy(); });
    req.on('end', () => { let data; try { data = JSON.parse(buf || '{}'); } catch { return json(res, { error: 'bad json' }, 400, NO_CACHE, done); }
      if (p === '/api/events') { const evs = Array.isArray(data) ? data : [data]; for (const e of evs) eventsStream.write(JSON.stringify({ ...e, _rx: Date.now(), _ua: (req.headers['user-agent'] || '').slice(0, 80) }) + '\n'); return json(res, { ok: true, n: evs.length }, 200, NO_CACHE, done); }
      return json(res, { error: 'not found' }, 404, NO_CACHE, done); });
    return;
  }
  if (p === '/' || p === '/index.html') return serveFile(req, res, path.join(LOBBY, 'index.html'), NO_CACHE, null, done);
  if (p === '/sw.js') { if (BASELINE) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('no service worker on the baseline origin'); return done(404, 0); } return serveFile(req, res, path.join(LOBBY, 'sw.js'), NO_CACHE, { 'Service-Worker-Allowed': '/' }, done); }
  if (p === '/compare' || p === '/compare.html') return serveFile(req, res, path.join(LOBBY, 'compare.html'), NO_CACHE, null, done);
  if (p.startsWith('/lobby/')) { const fp = safeJoin(LOBBY, p.slice(7)); return fp ? serveFile(req, res, fp, NO_CACHE, null, done) : (res.writeHead(403), res.end(), done(403, 0)); }
  const m = /^\/games\/([a-z0-9_-]+)\/([A-Za-z0-9._-]+)\/(.*)$/.exec(p);
  if (m) { const g = GAMES[m[1]]; if (!g || !g.available || m[2] !== g.version) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('unknown game/version'); return done(404, 0); }
    let rel = m[3]; if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const fp = safeJoin(g.absDir, rel); if (!fp) { res.writeHead(403); res.end(); return done(403, 0); }
    if (rel !== 'index.html' && chaosHit(req)) { req.__link = linkFor(req).key; res.writeHead(530, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); res.end('chaos: simulated edge failure'); return done(530, 0); }
    return serveFile(req, res, fp, BASELINE ? 'no-store' : (rel === 'index.html' ? NO_CACHE : IMMUTABLE), null, done); }
  if (p === '/api/games') return json(res, { games: Object.values(GAMES).map(g => ({ id: g.id, name: g.name, provider: g.provider, version: g.version, available: g.available, base: g.base, entry: g.entry, tile: g.tile ? g.base + g.tile : null })) }, 200, NO_CACHE, done);
  const mm = /^\/api\/manifest\/([a-z0-9_-]+)$/.exec(p);
  if (mm) { const man = MANIFESTS[mm[1]]; const g = GAMES[mm[1]]; if (!man || !g) return json(res, { error: 'no manifest' }, 404, NO_CACHE, done); return json(res, { ...man, base: g.base }, 200, 'public, max-age=60', done); }
  if (p === '/api/health') return json(res, { ok: true, mode: BASELINE ? 'baseline' : 'accelerated', games: Object.values(GAMES).filter(g => g.available).map(g => g.id), throttle: THR ? { mbit: +args.throttle, latency: LAT } : null, links: [...links.keys()], profiles: PROFILES }, 200, NO_CACHE, done);
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); done(404, 0);
}).listen(PORT, '0.0.0.0', () => { console.log(`[edge] http://localhost:${PORT}  mode=${BASELINE ? 'BASELINE (as shipped today)' : 'accelerated'}  throttle=${THR ? args.throttle + ' Mbit/s +' + LAT + ' ms' : 'none'}  games=${Object.values(GAMES).filter(g => g.available).map(g => g.id)}  log=${LOG}`); if (!BASELINE) prewarm(); });
