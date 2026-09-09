// Build the per-game prefetch manifest from measured harness runs (no reading of provider code needed).
// The engine loads assets in phases; everything requested up to and including the eager sounds is the
// "critical" tier (needed before the Play button), the rest is "secondary".
// Usage: node manifest-from-analysis.js <game-id> <version> <analysis.json for @0.5x run> <analysis.json for @1x run> <out.json>
const fs = require('fs');
const [game, version, phoneRun, desktopRun, out, bundleDir] = process.argv.slice(2);
if (!out) { console.error('usage: node manifest-from-analysis.js <game> <version> <phone.analysis.json> <desktop.analysis.json> <out.json>'); process.exit(1); }
const CRIT = new Set(['BOOT', 'OTHER', 'PRELOADER', 'COMMON', 'SPLASH', 'PRIMARY', 'SOUNDS_EAGER']);
const entries = new Map(); // key -> {p, res, tier, mb}
function add(run) {
  const a = JSON.parse(fs.readFileSync(run, 'utf8'));
  for (const r of a.timeline) {
    let p = r.f; if (!p || p.startsWith('image/') || p.startsWith('data:')) continue; // inline data URIs
    if (p === '/') p = 'index.html'; else p = 'assets/' + p;
    p = p.replace(/\?.*$/, '');
    const m = /\/(@1x|@0\.5x)\//.exec(p); const res = m ? m[1] : null;
    const tier = CRIT.has(r.b) ? 'critical' : 'secondary';
    const key = p; const prev = entries.get(key);
    if (!prev || (prev.tier === 'secondary' && tier === 'critical')) entries.set(key, { p, res, tier, mb: +(r.MB || 0).toFixed(3), phase: r.b });
  }
}
add(phoneRun); add(desktopRun);
const dropped = [];
const list = [...entries.values()].filter(e => { if (bundleDir && !fs.existsSync(require('path').join(bundleDir, e.p))) { dropped.push(e.p); return false; } return true; }).sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'critical' ? -1 : 1));
const manifest = { game, version, generated: new Date().toISOString(), source: [phoneRun, desktopRun].map(x => x.replace(/\\/g, '/').split('/').pop()),
  note: 'Paths are relative to the game root. res = resolution folder the engine picks (@1x desktop/tablet, @0.5x phone); null = resolution-independent.',
  dropped_missing_in_bundle: dropped, entries: list };
fs.writeFileSync(out, JSON.stringify(manifest, null, 1));
const sum = (t, res) => list.filter(e => e.tier === t && (e.res === null || e.res === res)).reduce((s, e) => s + e.mb, 0).toFixed(1);
console.log(`${out}: ${list.length} entries; critical @0.5x ${sum('critical', '@0.5x')} MB, critical @1x ${sum('critical', '@1x')} MB, secondary @0.5x ${sum('secondary', '@0.5x')} MB`);
