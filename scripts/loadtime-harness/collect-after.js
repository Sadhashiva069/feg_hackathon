// Merge the baseline report data with the "after" runs (run-lobby.js results named after-<config>-<scenario>-<n>)
// into one JSON for the before/after report: progress/runs/<date>-after/after-data.json.
//   node collect-after.js [--out ../../progress/runs/2026-09-08-after] [--shots]
const fs = require('fs'), path = require('path');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => { if (x.startsWith('--')) a.push([x.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : true]); return a; }, []));
const ROOT = path.resolve(__dirname, '..', '..'); const RUNS = path.join(__dirname, '..', 'runs');
const OUT = path.resolve(__dirname, args.out || path.join(ROOT, 'progress', 'runs', '2026-09-08-after')); fs.mkdirSync(OUT, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'progress', 'runs', '2026-09-08-baseline', 'report-data.json'), 'utf8'));
let predictEval = null; try { predictEval = JSON.parse(fs.readFileSync(path.join(ROOT, 'var', 'predict-eval.json'), 'utf8')); } catch {}

const CONFIGS = [
  { key: 'direct-desktop', title: 'Laptop Chrome, localhost (the false positive)', device: 'laptop 1280×720, Intel UHD', link: 'none (same machine)', baseline: ['direct-desktop-1'], note: 'Not re-run: every after-run goes through the tunnel.' },
  { key: 'tunnel-desktop', title: 'Laptop Chrome through the Cloudflare tunnel', device: 'laptop 1280×720', link: 'venue Wi-Fi, no throttle (tunnel 3–7 MB/s)', baseline: ['tunnel-desktop-1', 'tunnel-desktop-2'] },
  { key: 'tunnel-desktop-wifi', title: 'Laptop Chrome, 30 Mbit/s link', device: 'laptop 1280×720', link: '30 Mbit/s, 28 ms RTT', baseline: ['tunnel-desktop-wifi-1'] },
  { key: 'tunnel-mobile-4g-cpu4', title: 'Emulated Pixel 7 on 4G', device: 'Pixel 7 profile 412×915, DPR 2.625, CPU ×4 slower', link: '9 Mbit/s, 170 ms RTT', baseline: ['tunnel-mobile-4g-cpu4-1', 'tunnel-mobile-4g-cpu4-2', 'tunnel-mobile-4g-cpu4-3'] },
  { key: 'tunnel-mobile-3g-cpu4', title: 'Emulated Pixel 7 on 3G', device: 'Pixel 7 profile, CPU ×4 slower', link: '1.6 Mbit/s, 150 ms RTT', baseline: ['tunnel-mobile-3g-cpu4-1'] },
  { key: 'phone-nord3-wifi', title: 'Real phone on venue Wi-Fi', device: 'OnePlus Nord 3 5G (CPH2491), Chrome 152, over USB', link: 'venue Wi-Fi', baseline: ['phone-nord3-wifi-1', 'phone-nord3-wifi-2', 'phone-nord3-wifi-3', 'phone-nord3-wifi-4'] },
  { key: 'phone-nord3-5g', title: 'Real phone on mobile data', device: 'OnePlus Nord 3 5G, Chrome 152, over USB', link: 'LTE', baseline: ['phone-nord3-5g-1', 'phone-nord3-5g-2'] },
];
const SCEN = { warm: 'warm', hot: 'hot', warmlight: 'warm-light', 'warm-light': 'warm-light', prefetched: 'prefetched', swcold: 'sw-cold', 'sw-cold': 'sw-cold', cold: 'cold' };
const baseRun = l => { const r = base.runs.find(x => x.label === l); if (!r) return null; const m = r.milestones || {}; const b = m.bundles || {};
  return { label: l, common_s: b.COMMON != null ? +(b.COMMON / 1000).toFixed(1) : null, splash_s: b.SPLASH != null ? +(b.SPLASH / 1000).toFixed(1) : null, primary_s: b.PRIMARY != null ? +(b.PRIMARY / 1000).toFixed(1) : null,
    playbtn_s: m.primaryAssetsLoaded != null ? +(m.primaryAssetsLoaded / 1000).toFixed(1) : null, playable_s: m.idleState != null ? +(m.idleState / 1000).toFixed(1) : null, mb: +(r.requests.bytesUntilPrimary / 1048576).toFixed(1), req: r.requests.untilPrimary, avgMBps: r.concurrency && r.concurrency.avgMBps }; };

const after = {}; const shots = [];
for (const d of fs.readdirSync(RUNS).filter(x => x.startsWith('after-')).sort()) {
  const fp = path.join(RUNS, d, 'result.json'); if (!fs.existsSync(fp)) continue;
  const m = /^after-(.+)-(warm-light|warmlight|warm|hot|prefetched|swcold|sw-cold|cold)-(\d+)$/.exec(d); if (!m) { console.log('skip', d); continue; }
  const cfg = m[1], scen = SCEN[m[2]], n = +m[3]; const r = JSON.parse(fs.readFileSync(fp, 'utf8'));
  for (const L of r.launches) {
    const rec = L.rec || {}; const t0 = rec.t0; const ms = v => (v && t0) ? +(v - t0).toFixed(1) : null;
    const g = r.netlog.filter(q => /\/games\//.test(q.url) && q.wall * 1000 >= t0 && (!rec.t_idle || q.wall * 1000 <= rec.t_idle + 50));
    const st = (r.swStats || {})[rec.game] || null; const sa = r.stateAtTap || {};
    const row = { label: d, launch: L.n, path: rec.path, scenario: scen, n, prep_s: +(r.prepMs / 1000).toFixed(1), android: !!r.android, ua: r.ua, link: r.link || null,
      shell_ms: ms(rec.t_shell), reveal_ms: ms(rec.t_reveal), playbtn_ms: rec.readyBeforeTap ? 0 : ms(rec.t_ready), readyBeforeTap: !!rec.readyBeforeTap, alreadyIdle: !!rec.alreadyIdle,
      play_tap_ms: ms(rec.t_play), idle_ms: ms(rec.t_idle), idle_after_play_ms: (rec.t_idle && rec.t_play) ? +(rec.t_idle - rec.t_play).toFixed(1) : null,
      req_after_tap: g.length, req_from_sw: g.filter(q => q.sw).length, mb_after_tap: +(g.reduce((s, q) => s + (q.bytes || 0), 0) / 1048576).toFixed(2),
      sw: st ? { hit: st.hit, miss: st.miss, hitMB: +(st.hitBytes / 1048576).toFixed(1), missMB: +(st.missBytes / 1048576).toFixed(1), held: st.held } : null,
      prefetch: sa.prefetch ? { done: sa.prefetch.done, total: sa.prefetch.total, mb: +(sa.prefetch.bytes / 1048576).toFixed(1), s: +(sa.prefetch.ms / 1000).toFixed(1) } : null,
      warmBoot_s: sa.warm && sa.warm.tReady ? +((sa.warm.tReady - sa.warm.tStart) / 1000).toFixed(1) : null,
      timeline: (r.lobbyEvents || []).filter(e => /lobby_ready|prefetch_start|prefetch_done|warm_start|warm_parked|warm_upgrade|engine:PRIMARY_ASSETS_LOADED|engine:BUNDLE_LOADED\b/.test(e.name)).map(e => ({ s: +((e.t - r.lobbyEvents[0].t) / 1000).toFixed(1), name: e.name.replace('engine:', '') + (e.arg ? '(' + e.arg + ')' : '') + (e.level ? '[' + e.level + ']' : '') })),
      errors: (r.consoleLog || []).filter(c => c.type === 'pageerror').length };
    if (L.n === 2) row.scenario = 'hot';
    (after[cfg] = after[cfg] || []).push(row);
  }
  if (args.shots && scen === 'warm' && n === 1 && fs.existsSync(path.join(RUNS, d, 'shots'))) { const all = fs.readdirSync(path.join(RUNS, d, 'shots')).sort(); const pick = [...all.filter(f => /before-tap/.test(f)), ...all.filter(f => /L1-\d{6}/.test(f)).slice(0, 2), ...all.filter(f => /L1-final/.test(f))];
    for (const f of pick) shots.push({ cfg, tag: f.replace(/^\d+-/, '').replace('.jpg', ''), src: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(RUNS, d, 'shots', f)).toString('base64') }); }
}
const q = (arr, p) => { const a = arr.filter(x => x != null).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null; };
// batch percentiles are over sessions that reached the scenario's state; sessions that did not are listed as failures, not dropped silently
const stats = all => { const rows = all.filter(r => r.path === 'warm'); const failed = all.filter(r => r.path !== 'warm').map(r => ({ label: r.label, path: r.path, prep_s: r.prep_s, errors: r.errors }));
  return { n: rows.length, failed, reveal: { p50: q(rows.map(r => r.reveal_ms), 0.5), p95: q(rows.map(r => r.reveal_ms), 0.95), max: Math.max(...rows.map(r => r.reveal_ms)) }, shell: { p50: q(rows.map(r => r.shell_ms), 0.5), p95: q(rows.map(r => r.shell_ms), 0.95) }, playToIdle: { p50: q(rows.map(r => r.idle_after_play_ms), 0.5), p95: q(rows.map(r => r.idle_after_play_ms), 0.95) }, prep: { p50: q(rows.map(r => r.prep_s), 0.5), p95: q(rows.map(r => r.prep_s), 0.95) }, readyBeforeTap: rows.filter(r => r.readyBeforeTap).length }; };
const configs = CONFIGS.map(c => { const rows = after[c.key] || []; const byScen = {}; for (const r of rows) (byScen[r.scenario] = byScen[r.scenario] || []).push(r);
  return { ...c, baseline: c.baseline.map(baseRun).filter(Boolean), after: byScen, warmStats: byScen.warm ? stats(byScen.warm) : null }; });
const out = { generated: new Date().toISOString(), configs, batch: after['tunnel-mobile-4g-cpu4'] ? stats(after['tunnel-mobile-4g-cpu4'].filter(r => r.scenario === 'warm')) : null, prediction: predictEval, shots };
fs.writeFileSync(path.join(OUT, 'after-data.json'), JSON.stringify(out));
for (const c of configs) { console.log(`\n${c.key}: baseline ${c.baseline.map(b => `${b.playbtn_s}s/${b.playable_s ?? '—'}s`).join(', ')}`); for (const [s, rows] of Object.entries(c.after)) console.log(`  ${s}: ` + rows.map(r => `${r.readyBeforeTap ? 'reveal ' + r.reveal_ms + 'ms' : 'playBtn ' + (r.playbtn_ms / 1000).toFixed(1) + 's'} (prep ${r.prep_s}s)`).join(' | ')); }
if (out.batch) console.log(`\n4G warm batch n=${out.batch.n}: reveal p50 ${out.batch.reveal.p50} ms p95 ${out.batch.reveal.p95} ms max ${out.batch.reveal.max} ms; Play→idle p50 ${out.batch.playToIdle.p50} ms; prep p50 ${out.batch.prep.p50} s p95 ${out.batch.prep.p95} s`);
console.log(`-> ${path.join(OUT, 'after-data.json')}`);
