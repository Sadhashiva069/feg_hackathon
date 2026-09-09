// Summarise scenario runs by label prefix: node summarize-runs.js <labelPrefix> [--md]   (e.g. x4-  or  after-tunnel-mobile-4g)
// prep = nav -> scenario state; light = BUNDLE_LOADED(SPLASH) in the warm frame; dl = prefetch_done; full = PRIMARY_ASSETS_LOADED
// before the tap; playbtn = tap -> Play button; util = origin link utilisation before the tap (busy/span) from the access log.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..'); const RUNS = path.join(ROOT, 'scripts', 'runs');
const prefix = process.argv[2]; const md = process.argv.includes('--md');
let accessRows = null;
function loadAccess() { if (accessRows) return accessRows; accessRows = fs.readFileSync(path.join(ROOT, 'var', 'edge-access.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(r => r && /\/games\//.test(r.u)); return accessRows; }
function util(res, from, to) {
  if (!res.link) return null; const key = res.link + '.' + res.linkId; const rows = loadAccess().filter(r => r.link === key && r.t < to && r.t + r.ms > from);
  if (!rows.length) return null;
  const iv = rows.map(r => [Math.max(from, r.t), Math.min(to, r.t + r.ms)]).sort((a, b) => a[0] - b[0]); let busy = 0, cur = null;
  for (const [a, b] of iv) { if (!cur) cur = [a, b]; else if (a <= cur[1]) cur[1] = Math.max(cur[1], b); else { busy += cur[1] - cur[0]; cur = [a, b]; } } if (cur) busy += cur[1] - cur[0];
  const bytes = rows.reduce((s, r) => s + (r.b || 0), 0); return { util: +(busy / (to - from)).toFixed(2), MB: +(bytes / 1048576).toFixed(1), mbit: +((bytes * 8 / 1e6) / ((to - from) / 1000)).toFixed(1), n: rows.length };
}
const out = [];
for (const d of fs.readdirSync(RUNS).filter(d => d.startsWith(prefix)).sort()) {
  let res; try { res = JSON.parse(fs.readFileSync(path.join(RUNS, d, 'result.json'), 'utf8')); } catch { out.push({ label: d, note: 'no result.json (failed?)' }); continue; }
  const ev = res.lobbyEvents || []; const t0 = ev.length ? ev[0].t : 0; const tap = res.launches[0] && res.launches[0].rec.t0;
  const first = name => { const e = ev.find(x => x.name === name && (!tap || x.t < tap)); return e ? +((e.t - t0) / 1000).toFixed(1) : null; };
  const firstArg = (name, arg) => { const e = ev.find(x => x.name === name && x.arg === arg && (!tap || x.t < tap)); return e ? +((e.t - t0) / 1000).toFixed(1) : null; };
  const extra = (/&(fill=[^&]*|cc=\d+|warm=eager)/g.exec(res.url) || [])[0]; const extras = (res.url.match(/(fill=[^&]*|cc=\d+|warm=eager|fcc=\d+)/g) || []).join(',');
  const s = res.summary[0] || {};
  const u = tap ? util(res, t0, tap) : null;
  out.push({ label: d.replace(prefix, ''), scen: res.scenario, net: res.net, dev: res.mobile ? `mob x${res.cpu}` : 'desk', extras, prep_s: +(res.prepMs / 1000).toFixed(1), light_s: firstArg('engine:BUNDLE_LOADED', 'SPLASH'), dl_s: first('prefetch_done'), full_s: first('engine:PRIMARY_ASSETS_LOADED'), parked_s: first('warm_parked'), path: s.path, reveal_ms: Math.round(s.reveal_ms), playbtn_ms: s.readyBeforeTap ? 'before' : Math.round(s.playbtn_ms), idle_ms: Math.round(s.idle_ms), req: s.requestsAfterTap, sw: s.fromSW, MB: s.bytesAfterTapMB, util: u && u.util, mbit: u && u.mbit, dlMB: u && u.MB, errs: (res.consoleLog || []).filter(c => /error/i.test(c.type) && !/favicon|book\.png/i.test(c.text)).length });
}
if (md) { const cols = Object.keys(out.find(o => !o.note) || out[0]); console.log('| ' + cols.join(' | ') + ' |'); console.log('|' + cols.map(() => '---').join('|') + '|'); for (const o of out) console.log('| ' + cols.map(c => o[c] == null ? '' : o[c]).join(' | ') + ' |'); }
else console.table(out);
