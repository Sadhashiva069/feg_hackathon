// Render the before/after report from after-data.json (collect-after.js) + report-after.template.html.
//   node report-after.js [--data ../../progress/runs/2026-09-08-after/after-data.json] [--out <html path>] [--copy <second html path>] [--baseline <url>]
const fs = require('fs'), path = require('path');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => { if (x.startsWith('--')) a.push([x.slice(2), (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : true]); return a; }, []));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.resolve(__dirname, args.data || path.join(ROOT, 'progress', 'runs', '2026-09-08-after', 'after-data.json'));
const OUT = path.resolve(__dirname, args.out || path.join(path.dirname(DATA), 'report.html'));
const d = JSON.parse(fs.readFileSync(DATA, 'utf8'));
d.baselineUrl = args.baseline || 'https://claude.ai/code/artifact/f45c71e5-99a3-44d8-8feb-587555fc7ef8';
// pending notes for configurations without after-runs
for (const c of d.configs) if (!(c.after.warm || []).length) c.pending = c.key === 'direct-desktop' ? 'not re-run: every after-run goes through the tunnel' : 'phone not attached during this session';
const tpl = fs.readFileSync(path.join(__dirname, 'report-after.template.html'), 'utf8');
const html = tpl.replace('/*DATA*/', JSON.stringify(d).replace(/<\/script/gi, '<\\/script'));
fs.writeFileSync(OUT, html);
if (args.copy) { fs.mkdirSync(path.dirname(path.resolve(args.copy)), { recursive: true }); fs.writeFileSync(path.resolve(args.copy), html); }
console.log(`report: ${OUT} (${(html.length / 1024).toFixed(0)} KB)${args.copy ? ' + copy ' + args.copy : ''}`);
