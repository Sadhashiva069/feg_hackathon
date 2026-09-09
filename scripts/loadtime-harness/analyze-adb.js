// Per-second on-device counters from a run-android.js result: node analyze-adb.js <label>
const fs = require('fs'), path = require('path');
const LABEL = process.argv[2]; const DIR = path.join(__dirname, '..', 'runs', LABEL);
const R = JSON.parse(fs.readFileSync(path.join(DIR, 'result.json'), 'utf8'));
const S = R.adbSamples.filter(s => s.cpuTotal); const marks = R.page.marks || {}; const t0 = R.tStart;
const nproc = R.device.nproc || 8; const HZ = 100; // /proc/<pid>/stat is in clock ticks (100 Hz on Android)
const nameOf = pid => { const p = (R.chromePids || []).find(x => x.pid === pid); if (!p) return pid; const n = p.name; if (n === 'chrome') return 'browser'; if (/privileged_process/.test(n)) return 'gpu'; if (/sandboxed_process/.test(n)) return 'renderer' + (n.match(/:(\d+)$/) || ['', ''])[1]; return n; };
const rows = [];
for (let i = 1; i < S.length; i++) {
  const a = S[i - 1], b = S[i]; const dt = (b.t - a.t) / 1000; const dTot = b.cpuTotal - a.cpuTotal, dIdle = b.cpuIdle - a.cpuIdle;
  const busy = dTot > 0 ? 100 * (dTot - dIdle) / dTot : 0; // share of all cores
  const rx = Object.keys(b.net).reduce((acc, k) => { if (/^(wlan|ccmni|rmnet)/.test(k) && a.net[k]) acc[k] = (b.net[k].rx - a.net[k].rx) / dt; return acc; }, {});
  const proc = {}; for (const pid of Object.keys(b.proc)) if (a.proc[pid] !== undefined) { const n = nameOf(pid); proc[n] = (proc[n] || 0) + 100 * (b.proc[pid] - a.proc[pid]) / HZ / dt; }
  rows.push({ t: +((b.t - t0) / 1000).toFixed(1), dt, busyAllCores: +busy.toFixed(0), rxMBps: +(Object.values(rx).reduce((x, y) => x + y, 0) / 1048576).toFixed(2), rxByIf: Object.fromEntries(Object.entries(rx).filter(([, v]) => v > 1024).map(([k, v]) => [k, +(v / 1048576).toFixed(2)])), proc: Object.fromEntries(Object.entries(proc).map(([k, v]) => [k, +v.toFixed(0)])), battTemp: b.battTemp, freqMHz: b.freq && b.freq.map(f => Math.round(f / 1000)) });
}
const tP = marks['evt:PRIMARY_ASSETS_LOADED']; const win = rows.filter(r => tP === undefined || r.t * 1000 <= tP + 1000);
const avg = (arr, f) => arr.length ? arr.reduce((x, r) => x + f(r), 0) / arr.length : 0;
const procAvg = {}; for (const r of win) for (const [k, v] of Object.entries(r.proc)) procAvg[k] = (procAvg[k] || 0) + v / win.length;
const out = { label: LABEL, device: R.device, conn: R.page.conn, dpr: R.page.dpr, viewport: [R.page.vw, R.page.vh], samples: rows.length, untilPlayButton: { seconds: tP && +(tP / 1000).toFixed(1), avgBusyAllCores: +avg(win, r => r.busyAllCores).toFixed(0), avgRxMBps: +avg(win, r => r.rxMBps).toFixed(2), peakRxMBps: +Math.max(0, ...win.map(r => r.rxMBps)).toFixed(2), procAvgPctOfOneCore: Object.fromEntries(Object.entries(procAvg).map(([k, v]) => [k, +v.toFixed(0)])), battTempStart: rows[0] && rows[0].battTemp, battTempEnd: win[win.length - 1] && win[win.length - 1].battTemp }, rows };
fs.writeFileSync(path.join(DIR, 'adb-analysis.json'), JSON.stringify(out));
console.log(`=== ${LABEL} on-device: ${R.device.manufacturer} ${R.device.model} (${nproc} cores, ${R.device.soc}) Android ${R.device.android} Chrome ${R.device.chrome}; DPR ${R.page.dpr} viewport ${R.page.vw}x${R.page.vh}`);
console.log(`until Play button (${out.untilPlayButton.seconds}s): all-core CPU busy avg ${out.untilPlayButton.avgBusyAllCores}%; rx avg ${out.untilPlayButton.avgRxMBps} MB/s peak ${out.untilPlayButton.peakRxMBps} MB/s; per-process avg (% of one core): ${JSON.stringify(out.untilPlayButton.procAvgPctOfOneCore)}; battery temp ${out.untilPlayButton.battTempStart}→${out.untilPlayButton.battTempEnd} °C`);
for (const r of rows) console.log(`${String(r.t).padStart(5)}s cpu-all ${String(r.busyAllCores).padStart(3)}%  rx ${r.rxMBps.toFixed(2).padStart(5)} MB/s ${JSON.stringify(r.rxByIf)}  proc ${JSON.stringify(r.proc)}  freq ${r.freqMHz}  ${r.battTemp}°C`);
