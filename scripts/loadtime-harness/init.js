// In-page instrumentation injected into every frame (lobby + game). Extracted from run.js.
(() => {
  const M = window.__marks = {}; const E = window.__events = []; const t = () => performance.now();
  const mark = (n) => { if (!(n in M)) { M[n] = t(); E.push({ t: t(), name: 'mark:' + n }); } };
  window.__mark = mark; window.__audioDecodes = []; window.__longtasks = []; window.__frames = []; window.__errors = [];
  try { performance.setResourceTimingBufferSize(5000); } catch {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__longtasks.push({ s: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) mark('paint:' + e.name); }).observe({ type: 'paint', buffered: true }); } catch {}
  window.addEventListener('error', e => window.__errors.push({ t: t(), m: String(e.message) }));
  window.addEventListener('unhandledrejection', e => window.__errors.push({ t: t(), m: 'rejection: ' + String(e.reason && e.reason.message || e.reason) }));
  const raf = (ts) => { window.__frames.push(ts); requestAnimationFrame(raf); }; requestAnimationFrame(raf);
  const oc = console.log; console.log = function (...a) { try { const s = a.map(String).join(' '); if (/^Version:/.test(s)) mark('engine_version_logged'); E.push({ t: t(), name: 'log:' + s.slice(0, 120) }); } catch {} return oc.apply(this, a); };
  const hookEmitter = (obj, tag) => { let p = obj; while (p && p !== Object.prototype) { if (Object.prototype.hasOwnProperty.call(p, 'emit') && !p.__hooked) { const orig = p.emit; p.__hooked = true; p.emit = function (ev, ...r) { try { if (typeof ev === 'string' && ev === ev.toUpperCase() && ev.length > 3 && /[A-Z]_[A-Z]/.test(ev)) { E.push({ t: t(), name: 'evt:' + ev, arg: (typeof r[0] === 'string' || typeof r[0] === 'number') ? r[0] : undefined }); mark('evt:' + ev); } } catch {} return orig.apply(this, arguments); }; E.push({ t: t(), name: 'hooked-emitter:' + tag }); return true; } p = Object.getPrototypeOf(p); } return false; };
  globalThis.__PIXI_APP_INIT__ = (app, v) => { mark('pixi_app_init'); window.__app = app; window.__pixiVersion = v; hookEmitter(app.stage, 'stage'); };
  globalThis.__PIXI_RENDERER_INIT__ = (r, v) => { mark('pixi_renderer_init'); window.__renderer = r; };
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    const od = AC.prototype.decodeAudioData;
    AC.prototype.decodeAudioData = function (buf, ok, err) { const t0 = t(), bytes = buf && buf.byteLength; mark('first_audio_decode_start'); const rec = { t0, bytes }; window.__audioDecodes.push(rec); const done = () => { rec.t1 = t(); rec.dur = rec.t1 - t0; }; const p = od.call(this, buf, (b) => { done(); ok && ok(b); }, (e) => { done(); err && err(e); }); if (p && p.then) p.then(done, done); return p; };
    const OA = AC; window.AudioContext = function (...a) { const c = new OA(...a); mark('audio_context_created'); return c; }; window.AudioContext.prototype = OA.prototype;
  }
  const obs = new MutationObserver(ms => { for (const m of ms) { for (const n of m.addedNodes) { if (n.tagName === 'CANVAS') mark('canvas_added'); if (n.querySelector && n.querySelector('canvas')) mark('canvas_added'); } for (const n of m.removedNodes) { if (n.id === 'preload') mark('preload_removed'); } if (m.type === 'attributes' && m.target.id === 'preload') { const cs = getComputedStyle(m.target); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') mark('preload_hidden'); } } });
  const startObs = () => { try { obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] }); } catch {} };
  if (document.documentElement) startObs(); else document.addEventListener('DOMContentLoaded', startObs);
  document.addEventListener('DOMContentLoaded', () => mark('DOMContentLoaded')); window.addEventListener('load', () => mark('load'));
})();
