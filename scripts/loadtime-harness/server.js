// Static server for the certified bundle. Serves pre-compressed .br/.gz when accepted,
// supports Range (audio), and writes one JSON line per request to server.log.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || 'd:/feg_hackathon/empireofgold';
const PORT = +(process.argv[3] || 8787);
const LOG = process.argv[4] || path.join(__dirname, 'server.log');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.webp':'image/webp', '.gif':'image/gif', '.ogg':'audio/ogg', '.mp3':'audio/mpeg', '.ttf':'font/ttf', '.woff':'font/woff',
  '.woff2':'font/woff2', '.atlas':'text/plain', '.fnt':'text/plain', '.ts':'text/plain', '.txt':'text/plain', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
const logStream = fs.createWriteStream(LOG, { flags: 'a' });
http.createServer((req, res) => {
  const t0 = Date.now();
  let url = decodeURIComponent(req.url.split('?')[0]);
  let fp = path.normalize(path.join(ROOT, url));
  if (!fp.startsWith(path.normalize(ROOT))) { res.writeHead(403); return res.end(); }
  let st; try { st = fs.statSync(fp); } catch { st = null; }
  if (st && st.isDirectory()) { fp = path.join(fp, 'index.html'); try { st = fs.statSync(fp); } catch { st = null; } }
  const done = (status, bytes, enc) => {
    logStream.write(JSON.stringify({ t: t0, ms: Date.now() - t0, m: req.method, u: req.url, s: status, b: bytes, enc,
      via: req.headers['cf-connecting-ip'] ? 'tunnel' : 'direct', ua: (req.headers['user-agent']||'').slice(0,60), range: req.headers.range||null }) + '\n');
  };
  if (!st) { res.writeHead(404); res.end('not found'); return done(404, 0); }
  const ext = path.extname(fp).toLowerCase();
  const ae = req.headers['accept-encoding'] || '';
  let enc = null, sendPath = fp, size = st.size;
  if (!req.headers.range) {
    for (const [e, sfx] of [['br', '.br'], ['gzip', '.gz']]) {
      if (ae.includes(e) && fs.existsSync(fp + sfx)) { enc = e; sendPath = fp + sfx; size = fs.statSync(sendPath).size; break; }
    }
  }
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  if (enc) { headers['Content-Encoding'] = enc; headers['Vary'] = 'Accept-Encoding'; }
  if (req.headers.range && !enc) {
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : st.size - 1;
    if (end >= st.size) end = st.size - 1;
    headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`; headers['Content-Length'] = end - start + 1;
    res.writeHead(206, headers);
    if (req.method === 'HEAD') { res.end(); return done(206, 0); }
    fs.createReadStream(fp, { start, end }).on('close', () => done(206, end - start + 1)).pipe(res);
    return;
  }
  headers['Content-Length'] = size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return done(200, 0, enc); }
  fs.createReadStream(sendPath).on('close', () => done(200, size, enc)).pipe(res);
}).listen(PORT, '0.0.0.0', () => console.log(`serving ${ROOT} on http://localhost:${PORT} log=${LOG}`));
