// Guardrail check: the certified bundle must be byte-for-byte what the provider delivered.
// Compares every file under assets/empireofgold/ with tests/bundle-hashes.json (SHA-256 recorded from the
// delivered zip on 2026-09-08). Exit code 1 on any mismatch, missing or extra file.
//   node tests/verify-bundle.js [bundleDir]
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const DIR = path.resolve(process.argv[2] || path.join(ROOT, 'assets', 'empireofgold'));
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'bundle-hashes.json'), 'utf8')).sha256;
const seen = new Set(); const bad = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else {
  const rel = path.relative(DIR, p).split(path.sep).join('/'); seen.add(rel);
  const h = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  if (!(rel in ref)) bad.push(`extra file: ${rel}`); else if (ref[rel] !== h) bad.push(`modified: ${rel}`); } } })(DIR);
for (const rel of Object.keys(ref)) if (!seen.has(rel)) bad.push(`missing: ${rel}`);
if (bad.length) { console.error(`bundle check FAILED (${bad.length} problems)\n  ` + bad.slice(0, 20).join('\n  ')); process.exit(1); }
console.log(`bundle check OK: ${seen.size} files match the delivered package (${DIR})`);
