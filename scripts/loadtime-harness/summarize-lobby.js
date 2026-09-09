// Summarise run-lobby.js results into one table (markdown) and a compact JSON for progress/runs.
// Usage: node summarize-lobby.js <label-prefix> [outdir]
const fs = require('fs'), path = require('path');
const PREFIX = process.argv[2] || 'm1-'; const OUTDIR = process.argv[3];
const RUNS = path.join(__dirname, '..', 'runs');
const rows = [];
for (const d of fs.readdirSync(RUNS).filter(x => x.startsWith(PREFIX)).sort()) {
  const fp = path.join(RUNS, d, 'result.json'); if (!fs.existsSync(fp)) continue;
  const r = JSON.parse(fs.readFileSync(fp, 'utf8'));
  for (const L of r.launches) {
    const rec = L.rec || {}; const d0 = rec.t0; const ms = v => (v && d0) ? Math.round(v - d0) : null;
    const g = r.netlog.filter(q => /\/games\//.test(q.url) && q.wall * 1000 >= d0 && (!rec.t_idle || q.wall * 1000 <= rec.t_idle + 50));
    const st = (r.swStats || {})[rec.game] || null;
    rows.push({ label: r.label, scenario: r.scenario, launch: L.n, path: rec.path, device: r.android ? 'android' : (r.mobile ? 'emulated phone' : 'desktop'), net: r.net, cpu: r.cpu, prep_s: +(r.prepMs / 1000).toFixed(1),
      shell_ms: ms(rec.t_shell), reveal_ms: ms(rec.t_reveal), playbtn_ms: rec.readyBeforeTap ? 0 : ms(rec.t_ready), readyBeforeTap: !!rec.readyBeforeTap, alreadyIdle: !!rec.alreadyIdle,
      play_tap_ms: ms(rec.t_play), idle_ms: ms(rec.t_idle), idle_after_play_ms: (rec.t_idle && rec.t_play) ? Math.round(rec.t_idle - rec.t_play) : null,
      req_after_tap: g.length, req_from_sw: g.filter(q => q.sw).length, mb_after_tap: +(g.reduce((s, q) => s + (q.bytes || 0), 0) / 1048576).toFixed(2),
      sw_hit: st ? st.hit : null, sw_miss: st ? st.miss : null, sw_hitMB: st ? +(st.hitBytes / 1048576).toFixed(1) : null, sw_missMB: st ? +(st.missBytes / 1048576).toFixed(1) : null, sw_held: st ? st.held : null,
      prefetch: r.stateAtTap && r.stateAtTap.prefetch ? { done: r.stateAtTap.prefetch.done, total: r.stateAtTap.prefetch.total, mb: +(r.stateAtTap.prefetch.bytes / 1048576).toFixed(1), ms: r.stateAtTap.prefetch.ms } : null,
      warm: r.stateAtTap && r.stateAtTap.warm ? { state: r.stateAtTap.warm.state, boot_to_ready_s: r.stateAtTap.warm.tReady ? +((r.stateAtTap.warm.tReady - r.stateAtTap.warm.tStart) / 1000).toFixed(1) : null } : null,
      errors: (r.consoleLog || []).filter(c => c.type === 'pageerror').length });
  }
}
const f = v => v === null || v === undefined ? '—' : typeof v === 'number' ? (v >= 1000 ? (v / 1000).toFixed(1) + ' s' : v + ' ms') : v;
console.log('| Run | Scenario | Device / net | Prep before tap | Shell | Reveal | Play button | Play→idle | Playable (idle) | Requests after tap (from SW) | MB after tap | Prefetch | Warm boot→ready |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const x of rows) {
  const dev = `${x.device}${x.net !== 'none' ? ', ' + x.net : ''}${x.cpu > 1 ? ', CPU ×' + x.cpu : ''}`;
  const pb = x.readyBeforeTap ? 'before tap' : f(x.playbtn_ms);
  const idle = x.alreadyIdle ? 'at reveal (' + f(x.reveal_ms) + ')' : f(x.idle_ms);
  console.log(`| ${x.label}${x.launch > 1 ? ' #' + x.launch : ''} | ${x.path} | ${dev} | ${x.prep_s} s | ${f(x.shell_ms)} | ${f(x.reveal_ms)} | ${pb} | ${x.alreadyIdle ? '—' : f(x.idle_after_play_ms)} | ${idle} | ${x.req_after_tap} (${x.req_from_sw}) | ${x.mb_after_tap} | ${x.prefetch ? `${x.prefetch.done}/${x.prefetch.total}, ${x.prefetch.mb} MB, ${(x.prefetch.ms / 1000).toFixed(1)} s` : '—'} | ${x.warm && x.warm.boot_to_ready_s ? x.warm.boot_to_ready_s + ' s' : '—'} |`);
}
if (OUTDIR) { fs.mkdirSync(OUTDIR, { recursive: true }); fs.writeFileSync(path.join(OUTDIR, `${PREFIX.replace(/-$/, '')}.summary.json`), JSON.stringify(rows, null, 1)); console.log('-> ' + path.join(OUTDIR, `${PREFIX.replace(/-$/, '')}.summary.json`)); }
