// Smoke test for the accelerator: starts the edge in both modes on free ports and checks the behaviour a
// reviewer should be able to rely on. No dependencies beyond Node 18+.
//   node tests/smoke.js
const { spawn, execFileSync } = require('child_process');
const http = require('http'), path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const GAMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'edge', 'games.json'), 'utf8'));
const GID = 'empireofgold', VER = GAMES[GID].version, BASE = `/games/${GID}/${VER}/`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'accel-smoke-')); process.env.NODE_ENV = 'test';
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  ok   ' + msg); } else { fails++; console.log('  FAIL ' + msg); } };

function get(port, p, headers = {}) { return new Promise((res, rej) => { const req = http.get({ host: '127.0.0.1', port, path: p, headers }, r => { const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) })); }); req.on('error', rej); }); }
async function start(args) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [path.join(ROOT, 'src', 'edge', 'server.js'), '--port', String(port), '--log', path.join(TMP, `edge-${port}.jsonl`), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d);
  for (let i = 0; i < 100; i++) { try { const r = await get(port, '/api/health'); if (r.status === 200) return { child, port, health: JSON.parse(r.body) }; } catch {} await new Promise(r => setTimeout(r, 100)); }
  child.kill(); throw new Error('edge did not start: ' + out);
}

(async () => {
  console.log('1. certified bundle unaltered');
  try { console.log('  ' + execFileSync(process.execPath, [path.join(__dirname, 'verify-bundle.js')], { encoding: 'utf8' }).trim()); passes++; } catch (e) { fails++; console.log('  FAIL ' + String(e.stdout || e.message).trim()); }

  console.log('2. accelerated edge');
  const A = await start([]);
  try {
    ok(A.health.ok && A.health.mode === 'accelerated' && A.health.games.includes(GID), `/api/health: mode=${A.health.mode}, games=${A.health.games}`);
    const games = JSON.parse((await get(A.port, '/api/games')).body).games; const g = games.find(x => x.id === GID);
    ok(g && g.available && g.base === BASE, `/api/games lists ${GID} as available at ${g && g.base}`);
    const man = JSON.parse((await get(A.port, '/api/manifest/' + GID)).body);
    ok(man.entries && man.entries.length > 50 && man.version === VER, `/api/manifest: ${man.entries && man.entries.length} entries, version ${man.version}`);
    const idx = await get(A.port, BASE + 'index.html'); ok(idx.status === 200 && /text\/html/.test(idx.headers['content-type']), 'bundle index.html served');
    const js = await get(A.port, BASE + 'assets/vendor-pixi-C8WzrnZv.js', { 'accept-encoding': 'br, gzip' });
    ok(js.status === 200 && js.headers['content-encoding'] === 'br' && /immutable/.test(js.headers['cache-control']), `shipped .br served for JS with immutable caching (${js.headers['content-length']} bytes)`);
    const j = await get(A.port, BASE + 'assets/spines/@1x/BG_king.json', { 'accept-encoding': 'br' });
    ok(j.status === 200 && j.headers['content-encoding'] === 'br' && +j.headers['content-length'] < 400000, `spine JSON brotli-compressed on the fly (${j.headers['content-length']} bytes on the wire)`);
    const raw = await get(A.port, BASE + 'assets/spines/@1x/BG_king.json'); ok(raw.status === 200 && !raw.headers['content-encoding'] && raw.body.length > +j.headers['content-length'], `same file uncompressed when the client cannot decode (${raw.body.length} bytes)`);
    const rg = await get(A.port, BASE + 'assets/sounds/ogg/BBGM.ogg', { range: 'bytes=0-1023' }); ok(rg.status === 206 && rg.body.length === 1024 && /^bytes 0-1023\//.test(rg.headers['content-range']), `Range request on audio answered with 206 (${rg.headers['content-range']})`);
    const et = await get(A.port, BASE + 'index.html', { 'if-none-match': idx.headers.etag }); ok(et.status === 304, 'ETag revalidation returns 304');
    const sw = await get(A.port, '/sw.js'); ok(sw.status === 200 && sw.headers['service-worker-allowed'] === '/' && /no-cache/.test(sw.headers['cache-control']), 'service worker served with scope / and no-cache');
    for (const p of ['/', '/lobby/app.js', '/lobby/vendor/vue.global.prod.js', '/compare']) { const r = await get(A.port, p); ok(r.status === 200, `${p} served (${r.body.length} bytes)`); }
    const trav = await get(A.port, '/lobby/..%2F..%2Fpackage.json'); ok(trav.status !== 200 || !/"name"/.test(trav.body), 'path traversal outside the lobby folder is refused');
    const bad = await get(A.port, `/games/${GID}/wrong-version/index.html`); ok(bad.status === 404, 'unknown bundle version is a 404 (versioned immutable paths)');
    const ev = await new Promise((res, rej) => { const req = http.request({ host: '127.0.0.1', port: A.port, path: '/api/events', method: 'POST', headers: { 'content-type': 'application/json' } }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); }); req.on('error', rej); req.end(JSON.stringify({ type: 'smoke', ok: true })); });
    ok(ev.status === 200 && /"ok":true/.test(ev.body), 'POST /api/events accepted');
  } finally { A.child.kill(); }

  console.log('3. baseline edge (as shipped today, for the side-by-side demo)');
  const B = await start(['--baseline']);
  try {
    ok(B.health.mode === 'baseline', '/api/health: mode=baseline');
    const j = await get(B.port, BASE + 'assets/spines/@1x/BG_king.json', { 'accept-encoding': 'br' });
    ok(j.status === 200 && !j.headers['content-encoding'] && /no-store/.test(j.headers['cache-control']), `no edge compression and no-store caching (${j.body.length} bytes on the wire)`);
    const js = await get(B.port, BASE + 'assets/vendor-pixi-C8WzrnZv.js', { 'accept-encoding': 'br' }); ok(js.headers['content-encoding'] === 'br', 'the .br files the bundle itself ships are still served (as the provider CDN does)');
    const sw = await get(B.port, '/sw.js'); ok(sw.status === 404, 'no service worker on the baseline origin');
  } finally { B.child.kill(); }

  console.log('4. lobby and worker sources');
  for (const f of ['src/lobby/app.js', 'src/lobby/sw.js', 'src/edge/server.js', 'src/predict/build.js']) { try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)]); ok(true, `${f} parses`); } catch (e) { ok(false, `${f} parse error: ${e.message}`); } }
  const app = fs.readFileSync(path.join(ROOT, 'src', 'lobby', 'app.js'), 'utf8');
  ok(/rgVerdict\(\)/.test(app) && /self-excluded/.test(app) && /age verification required/.test(app) && /session limit reached/.test(app), 'RG gate covers self-exclusion, age verification and the session limit');
  ok(/if \(!this\.rgVerdict\(\)\.allowed\) \{ log\('prefetch_skipped'/.test(app) && /if \(!this\.rgVerdict\(\)\.allowed\) return;\s*\n\s*this\.dropWarm\(\)/.test(app), 'pre-load and pre-boot are refused when the player may not play');
  ok(/const PRELOAD_DEFAULT_ON = true;/.test(app) && /stored === null \? PRELOAD_DEFAULT_ON : stored === '1'/.test(app) && /st === null \? PRELOAD_DEFAULT_ON : st === '1'/.test(app) && /accel:consent:/.test(app) && /on by default/.test(fs.readFileSync(path.join(ROOT, 'src', 'lobby', 'index.html'), 'utf8')), 'pre-load is on by default (PRELOAD_DEFAULT_ON), the per-player switch-off is stored and honoured, and the label says so');
  ok(!/Continue playing', primary: true/.test(app), 'reality check offers both choices with equal weight');

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
