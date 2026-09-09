// Link utilisation of one harness run from the edge access log: busy time (union of request intervals),
// idle gaps, bytes and effective rate, per phase of the run (prep = before the tap, launch = after).
// usage: node util.js <runLabel> [<accessLog>]
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const label = process.argv[2]; const logFile = process.argv[3] || path.join(ROOT, 'var', 'edge-access.jsonl');
const res = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'runs', label, 'result.json'), 'utf8'));
const linkKey = res.link ? res.link + '.' + res.linkId : null;
if (!linkKey) { console.log('run has no link cookie; cannot isolate it in the log'); process.exit(0); }
const rows = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(r => r && r.link === linkKey && /\/games\//.test(r.u));
if (!rows.length) { console.log('no rows for', linkKey); process.exit(0); }
const t0 = Math.min(...rows.map(r => r.t)); const tEnd = Math.max(...rows.map(r => r.t + r.ms));
const tap = res.launches[0].rec.t0; const tReady = res.launches[0].rec.t_ready || tap;
function stats(rs, from, to) {
  const iv = rs.map(r => [Math.max(from, r.t), Math.min(to, r.t + r.ms)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let busy = 0, cur = null; const gaps = []; let maxConc = 0;
  for (const [a, b] of iv) { if (!cur) cur = [a, b]; else if (a <= cur[1]) cur[1] = Math.max(cur[1], b); else { busy += cur[1] - cur[0]; gaps.push([cur[1], a]); cur = [a, b]; } }
  if (cur) busy += cur[1] - cur[0];
  // concurrency samples every 100 ms
  const conc = []; for (let t = from; t < to; t += 100) { const n = iv.filter(([a, b]) => a <= t && t < b).length; conc.push(n); maxConc = Math.max(maxConc, n); }
  const bytes = rs.reduce((s, r) => s + (r.b || 0), 0);
  const span = to - from;
  return { span_s: +(span / 1000).toFixed(2), busy_s: +(busy / 1000).toFixed(2), idle_s: +((span - busy) / 1000).toFixed(2), util: +(busy / span).toFixed(3), n: rs.length, MB: +(bytes / 1048576).toFixed(2), mbit_s: +((bytes * 8 / 1e6) / (span / 1000)).toFixed(2), maxConc, meanConc: +(conc.reduce((a, b) => a + b, 0) / conc.length).toFixed(2), gaps: gaps.filter(([a, b]) => b - a >= 100).map(([a, b]) => `${((a - from) / 1000).toFixed(1)}s+${((b - a) / 1000).toFixed(2)}`).slice(0, 25) };
}
console.log(label, 'link', linkKey, 'scenario', res.scenario, 'rows', rows.length);
console.log('prep   (first request → tap)  ', JSON.stringify(stats(rows.filter(r => r.t < tap), t0, tap)));
console.log('launch (tap → Play button)    ', JSON.stringify(stats(rows.filter(r => r.t + r.ms > tap && r.t < tReady), tap, tReady)));
console.log('launch (tap → last byte)      ', JSON.stringify(stats(rows.filter(r => r.t + r.ms > tap), tap, tEnd)));
// timeline in 1-s bins after the tap: bytes finishing per second and active concurrency
const bins = []; for (let t = tap; t < Math.min(tEnd, tReady + 2000); t += 1000) { const act = rows.filter(r => r.t < t + 1000 && r.t + r.ms > t); const done = rows.filter(r => r.t + r.ms >= t && r.t + r.ms < t + 1000); bins.push(`${((t - tap) / 1000).toFixed(0)}s:${act.length}/${(done.reduce((s, r) => s + r.b, 0) / 1048576).toFixed(2)}`); }
console.log('after tap, per second (active requests / MB completed):', bins.join(' '));
const order = rows.filter(r => r.t >= tap).sort((a, b) => a.t - b.t).map(r => `${((r.t - tap) / 1000).toFixed(2)}+${(r.ms / 1000).toFixed(2)} ${r.b ? (r.b / 1024).toFixed(0) + 'K' : ''} ${r.u.replace(/^\/games\/empireofgold\/[^/]+\//, '').replace('assets/', '')}`);
if (process.argv.includes('--order')) console.log(order.join('\n'));
