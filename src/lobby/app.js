// Lobby shell for the game-load accelerator. Everything here runs outside the certified bundle.
//
// Levers (from the baseline report, section 7):
//   1. precache the critical asset set through the service worker, before the tap (predicted next game)
//   2. pre-boot the predicted game in a hidden same-origin iframe; park it with the engine's own
//      stopPixiApp() hook once the Play button is ready; resume with startPixiApp() on reveal
//   3. immutable, compressed origin responses (edge server)
//   4. perceived load: poster + status within one frame of the tap, never a blank screen
//
// Test hooks (URL): ?player=<id> ?sw=0 ?prefetch=0 ?warm=0|full|light|eager ?stage=0 ?consent=0|1 (default: on, unless the player switched it off) ?rc=<minutes> ?limit=<minutes> ?hold=0 ?fill=1 ?cc=<initial prefetch streams> ?boost=<streams after the light tier> ?early=0 (upgrade only when the whole prefetch is done) ?stream=0 (worker waits for the cache write before answering) ?debug=1 (instrumentation open)
// window.__lobby exposes state and epoch-ms marks for the measurement harness.
(() => {
  const Q = new URLSearchParams(location.search);
  const flag = (k, d) => (Q.has(k) ? Q.get(k) !== '0' : d);
  const CFG = { player: Q.get('player') || 'demo-player', sw: flag('sw', true), prefetch: flag('prefetch', true), warm: Q.get('warm') || '1',
    consent: Q.has('consent') ? Q.get('consent') === '1' : null, hotTtlMs: 5 * 60e3, rcMin: +(Q.get('rc') || 60), hold: flag('hold', true), concurrency: +(Q.get('cc') || 8), fill: flag('fill', false), stage: flag('stage', true), early: flag('early', true), stream: flag('stream', true),
    limitMin: Q.has('limit') ? +Q.get('limit') : null, debug: flag('debug', false) };
  // Resource budget (measured 2026-09-08 on a laptop, @1x assets: one fully pre-booted parked game = +240 MB renderer
  // private memory, +520 MB GPU process; 'light' (booted to SPLASH, PRIMARY atlases held back) is a fraction of that).
  // Prefetch is disk (Cache Storage), not RAM; it is capped by number of games and evicted LRU by the worker.
  // The pre-load is a cache optimisation, not a consent flow: it starts on lobby open, like a CDN prefetch or the browser's own cache.
  // The switch in the lobby is a player preference (off = nothing stored ahead of a tap) and the choice is kept per player. See docs/compliance-note.md.
  const PRELOAD_DEFAULT_ON = true;
  const BUDGET = { maxWarm: 1, fullWarmMinDeviceMemoryGB: +(Q.get('minmem') || 4), warmIdleTtlMs: 10 * 60e3, hiddenDropMs: 60e3, maxCachedGames: +(Q.get('maxgames') || 3), boostConcurrency: +(Q.get('boost') || 8) };
  const now = () => performance.timeOrigin + performance.now();
  const L = (window.__lobby = { cfg: CFG, swReady: false, prefetch: null, warm: { game: null, state: 'none' }, launches: [], current: null, events: [], res: null });
  L.budget = BUDGET;
  const log = (name, extra) => { L.events.push({ t: now(), name, ...(extra || {}) }); };
  const EXCLUDED = new Set(['excluded-player']);           // synthetic self-exclusion register (pattern only)
  const VERIFIED = new Set(['demo-player', 'player-2', 'player-3', 'limit-player']); // synthetic age-verified register
  const LIMITS = { 'limit-player': 1 }; const DEFAULT_LIMIT_MIN = 240; // synthetic session-limit register (minutes per session); ?limit=<min> overrides for the demo
  const OTHERS = [['Sizzling Hot Deluxe', 'Novomatic'], ['40 Super Hot Bell Link', 'EGT'], ['Royal Seven XXL', 'Gamomat'], ['Sugar Rush 1000', 'Pragmatic Play'], ['Mega Fire Blaze: Wild Pistolero', 'Playtech'], ['100 Hot Wild', 'Tech4Bet'], ['BlackJack MH', "Play'n GO"], ['Gates of Olympus Super Scatter', 'Pragmatic Play']];

  // engine picks @1x for desktop/tablet and @0.5x for phones (mirrors core-engine's assetResolution rule)
  function deviceRes() {
    const saved = localStorage.getItem('accel:res'); if (saved) return saved;
    const ua = navigator.userAgent; const uad = navigator.userAgentData;
    const phone = (uad && uad.mobile) || (/Android.+Mobile|iPhone|iPod|Windows Phone/i.test(ua) && !/iPad|Tablet/i.test(ua));
    return phone ? '@0.5x' : '@1x';
  }
  L.res = deviceRes();

  const app = Vue.createApp({
    data() {
      return { cfg: CFG, games: [], others: OTHERS.map(([name, provider]) => ({ name, provider })), players: ['demo-player', 'player-2', 'player-3', 'limit-player', 'guest', 'excluded-player'],
        player: CFG.player, consent: false, swReady: false, saveData: !!(navigator.connection && navigator.connection.saveData), effectiveType: navigator.connection && navigator.connection.effectiveType,
        prefetch: { game: null, total: 0, done: 0, bytes: 0, ms: 0, complete: false, active: false, errors: 0, fromCache: 0 },
        warm: { game: null, state: 'none', tStart: 0, tReady: 0, hot: false }, view: { open: false, game: null, revealed: false, poster: null, status: '', progress: null },
        launches: [], modal: null, toast: '', swNote: '', rg: { ageVerified: false, excluded: false, lastRc: Date.now(), limitMin: DEFAULT_LIMIT_MIN, limitHit: false }, sessionStart: Date.now(), clock: '0:00', swStats: null, manifests: {}, showInstr: CFG.debug };
    },
    computed: {
      predicted() { return this.predict().game; },
      predictReason() { return this.predict().reason; },
      predictedName() { const g = this.games.find(x => x.id === this.predicted); return g ? g.name : '—'; },
      rgBanner() { if (this.rg.excluded) return 'This account is on the self-exclusion register: games cannot be opened or pre-loaded.'; if (!this.rg.ageVerified) return 'Age verification (18+) is required before a game can be opened or pre-loaded.'; if (this.rg.limitHit) return `Session limit reached (${this.rg.limitMin} min): play is paused until your next session.`; return ''; },
      netInfo() { return (this.effectiveType ? this.effectiveType + ' (Chrome link-quality estimate, 4g = best bucket, also on Wi-Fi)' : 'unknown') + (this.saveData ? ' · data saver ON' : '') + ' · ' + L.res + ' assets'; },
      prefetchText() { const p = this.prefetch; if (!p.game) return this.consent ? (this.swReady ? 'idle' : ('waiting for accelerator' + (this.swNote ? ' — ' + this.swNote : ''))) : 'off (no consent)';
        const mb = (p.bytes / 1048576).toFixed(1); return p.complete ? `done: ${p.done} files, ${mb} MB${p.fromCache ? ` (${p.fromCache} already stored)` : ''} in ${(p.ms / 1000).toFixed(1)} s` : `${p.done}/${p.total} files, ${mb} MB`; },
      warmText() { const w = this.warm; if (w.state === 'none') return CFG.warm === '0' ? 'off' : 'not started';
        const g = this.games.find(x => x.id === w.game); const n = g ? g.name : w.game;
        return `${n}: ${w.state}${w.level ? ' (' + w.level + ')' : ''}${w.tReady ? ` (Play button ready ${((w.tReady - w.tStart) / 1000).toFixed(1)} s after boot)` : ''}${w.hot ? ' · kept from last play' : ''}`; },
      cacheText() { const s = this.swStats; if (!s) return '—'; const g = s[this.predicted] || Object.values(s)[0]; if (!g) return 'no game requests yet';
        const n = g.hit + g.miss; return n ? `${g.hit}/${n} requests from cache (${Math.round(100 * g.hit / n)} %), ${(g.hitBytes / 1048576).toFixed(1)} MB served locally, ${(g.missBytes / 1048576).toFixed(1)} MB from network${g.held ? `, ${g.held} deferred` : ''}` : 'no game requests yet'; }
    },
    async mounted() {
      log('lobby_mounted');
      this.applyPlayer();
      const stored = localStorage.getItem('accel:consent:' + this.player);
      this.consent = CFG.consent !== null ? CFG.consent : (stored === null ? PRELOAD_DEFAULT_ON : stored === '1');
      setInterval(() => { const s = Math.floor((Date.now() - this.sessionStart) / 1000); this.clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; this.rcTick(); this.post('state', this.snapshot()); }, 1000);
      window.addEventListener('message', e => this.onParentMessage(e));
      const r = await fetch('/api/games'); this.games = (await r.json()).games;
      await this.registerSW();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { clearTimeout(this._hidT); this._hidT = setTimeout(() => { if (document.hidden && this.warm.frame && !this.view.open) { log('warm_dropped_hidden'); this.pendingWarm = this.warm.game; this.dropWarm(); } }, BUDGET.hiddenDropMs); return; }
        clearTimeout(this._hidT); if (this.pendingWarm) { const g = this.pendingWarm; this.pendingWarm = null; this.warmBoot(g); } });
      ['pointerdown', 'keydown', 'scroll'].forEach(ev => document.addEventListener(ev, () => { if (this.warm.frame && !this.view.open) this.armWarmTtl(); }, { passive: true }));
      this.applyConsent();
      log('lobby_ready');
    },
    methods: {
      ms(a, b) { return a && b ? (a - b).toFixed(0) + ' ms' : '—'; },
      cls(v) { return v == null ? '' : v < 500 ? 'good' : v > 2000 ? 'slow' : ''; },
      say(t, ms = 2500) { this.toast = t; clearTimeout(this._tt); this._tt = setTimeout(() => (this.toast = ''), ms); },
      modalKey(e) { if (e.key !== 'Tab') return; const b = this.$refs.modalBtn || []; if (!b.length) return; const i = b.indexOf(document.activeElement); const n = e.shiftKey ? (i <= 0 ? b.length - 1 : i - 1) : (i >= b.length - 1 ? 0 : i + 1); b[n].focus(); e.preventDefault(); },
      // ---------------- embedding (side-by-side demo page /compare): state out, launch commands in. Sandbox only. ----------------
      post(type, data) { if (window.parent === window) return; try { window.parent.postMessage({ src: 'accel-lobby', type, player: this.player, ...(data || {}) }, '*'); } catch {} },
      snapshot() { const w = this.warm, p = this.prefetch, c = L.current; return { sw: this.swReady, consent: this.consent, warm: { game: w.game, state: w.state, level: w.level || null, hot: !!w.hot }, prefetch: { game: p.game, done: p.done, total: p.total, complete: p.complete, active: p.active }, open: this.view.open, rg: { ageVerified: this.rg.ageVerified, excluded: this.rg.excluded, limitMin: this.rg.limitMin, limitHit: this.rg.limitHit }, current: c ? { path: c.path, t0: c.t0, t_shell: c.t_shell, t_reveal: c.t_reveal, t_ready: c.t_ready, readyBeforeTap: !!c.readyBeforeTap, t_play: c.t_play, t_idle: c.t_idle } : null }; },
      onParentMessage(e) { const d = e.data; if (!d || d.src !== 'accel-compare') return;
        if (d.cmd === 'launch') { const g = this.games.find(x => x.id === (d.game || this.predicted)); if (g && g.available && !this.view.open) this.launch(g, now()); }
        else if (d.cmd === 'back') this.back(); else if (d.cmd === 'state') this.post('state', this.snapshot()); },
      // ---------------- responsible gambling gate (register-check pattern, synthetic data) ----------------
      applyPlayer() { this.rg.ageVerified = VERIFIED.has(this.player); this.rg.excluded = EXCLUDED.has(this.player); this.rg.limitMin = CFG.limitMin != null ? CFG.limitMin : (LIMITS[this.player] || DEFAULT_LIMIT_MIN); this.rg.limitHit = this.sessionMinutes() >= this.rg.limitMin; L.player = this.player; L.rg = this.rg; },
      sessionMinutes() { return (Date.now() - this.sessionStart) / 60000; },
      onPlayer() { this.applyPlayer(); const u = new URL(location.href); u.searchParams.set('player', this.player); history.replaceState(null, '', u); this.consent = (st => st === null ? PRELOAD_DEFAULT_ON : st === '1')(localStorage.getItem('accel:consent:' + this.player)); this.applyConsent(); },
      rgVerdict() { if (this.rg.excluded) return { allowed: false, reason: 'self-excluded (register check)' }; if (!this.rg.ageVerified) return { allowed: false, reason: 'age verification required' }; if (this.sessionMinutes() >= this.rg.limitMin) { this.rg.limitHit = true; return { allowed: false, reason: 'session limit reached (' + this.rg.limitMin + ' min)' }; } return { allowed: true, realityCheckDue: (Date.now() - this.rg.lastRc) / 60000 >= CFG.rcMin }; },
      rcTick() { // once a second: session limit first (hard stop), then the reality check. A pre-loaded game is dropped the moment the player may no longer play.
        if (this.sessionMinutes() >= this.rg.limitMin) { if (!this.rg.limitHit) { this.rg.limitHit = true; log('session_limit_hit', { min: this.rg.limitMin }); } if (this.warm.frame && !this.view.open) { log('warm_dropped_limit'); this.dropWarm(); } if (this.view.open && !this.modal) this.showSessionLimit(); return; }
        if (this.view.open && !this.modal && (Date.now() - this.rg.lastRc) / 60000 >= CFG.rcMin) this.showRealityCheck(); },
      showSessionLimit() { log('session_limit_shown'); this.post('rg', { kind: 'session-limit' });
        this.modal = { title: 'Session limit reached', body: [`Your session limit of ${this.rg.limitMin} minutes is used up (elapsed ${this.clock} min:s).`, 'Play is paused until your next session. Limits and self-exclusion are in Account › Responsible gaming.'],
          actions: [{ label: 'Back to lobby', fn: () => { this.modal = null; this.back(); this.dropWarm(); } }] };
        this.$nextTick(() => { const b = this.$refs.modalBtn; if (b && b[0]) b[0].focus(); }); },
      showRealityCheck() { return new Promise(res => { log('reality_check_shown'); this.post('rg', { kind: 'reality-check' });
        this.modal = { title: 'Reality check', body: [`You have been in this session for ${this.clock} (min:s).`, 'Take a moment to decide whether to keep playing. Limits and self-exclusion are in Account › Responsible gaming.'],
          actions: [{ label: 'Back to lobby', fn: () => { this.modal = null; this.rg.lastRc = Date.now(); this.back(); res(false); } }, { label: 'Continue playing', fn: () => { this.modal = null; this.rg.lastRc = Date.now(); res(true); } }] }; // both choices carry the same visual weight: no nudge to continue
        this.$nextTick(() => { const b = this.$refs.modalBtn; if (b && b[0]) b[0].focus(); }); }); },
      // ---------------- service worker ----------------
      async registerSW() {
        if (!CFG.sw || !('serviceWorker' in navigator)) { log('sw_skipped'); return; }
        try {
          navigator.serviceWorker.addEventListener('message', e => this.onSW(e.data));
          await navigator.serviceWorker.register('/sw.js' + (CFG.stream ? '' : '?stream=0'), { scope: '/' }); // ?stream=0: A/B hook, worker answers only after its cache write
          await navigator.serviceWorker.ready;
          if (!navigator.serviceWorker.controller) await new Promise(r => { const t = setTimeout(r, 3000); navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(t); r(); }, { once: true }); });
          this.swReady = L.swReady = !!navigator.serviceWorker.controller; log('sw_ready', { controlled: this.swReady });
          if (!this.swReady) { // page not controlled (hard reload / DevTools bypass / first install race): one guarded reload fixes it
            const k = 'accel:reloaded'; if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); log('sw_uncontrolled_reload'); location.reload(); return; }
            this.swNote = 'not controlling this page (hard reload or DevTools bypass): reload normally to enable'; log('sw_uncontrolled');
          } else sessionStorage.removeItem('accel:reloaded');
          this.pollStats();
        } catch (e) { log('sw_error', { m: String(e) }); }
      },
      sw(msg) { const c = navigator.serviceWorker && navigator.serviceWorker.controller; if (msg.type === 'release' || msg.type === 'hold') log('sw_' + msg.type, { game: msg.game, stack: String(new Error().stack).split(/\r?\n/).slice(2, 5).join(' < ') }); if (c) c.postMessage(msg); },
      pollStats() { clearInterval(this._st); this._st = setInterval(() => this.sw({ type: 'stats' }), 1000); },
      onSW(d) {
        if (!d) return;
        if (d.type === 'prefetch-progress' || d.type === 'prefetch-done') {
          if (d.id !== this.prefetch.id) return;
          Object.assign(this.prefetch, { done: d.done, total: d.total, bytes: d.bytes, ms: d.ms, errors: d.errors });
          if (d.type === 'prefetch-progress' && CFG.early && !this.prefetch.upgraded && d.prefix >= this.prefetch.primaryEnd && CFG.warm !== '0' && CFG.warm !== 'eager') { this.prefetch.upgraded = true; log('prefetch_primary_done', { game: d.game, prefix: d.prefix, ms: d.ms }); this.warmBoot(d.game); }
          if (this.view.open && !this.view.revealed && this.view.game && this.view.game.id === d.game) { this.view.progress = Math.round(100 * d.done / d.total); this.view.status = `downloading ${d.done}/${d.total} files (${(d.bytes / 1048576).toFixed(1)} MB)…`; }
          if (d.type === 'prefetch-done') { Object.assign(this.prefetch, { complete: !d.cancelled && !d.errors, active: false, fromCache: d.fromCache }); L.prefetch = { ...this.prefetch }; log('prefetch_done', { game: d.game, done: d.done, bytes: d.bytes, ms: d.ms, errors: d.errors, fromCache: d.fromCache });
            if (d.errors && !d.cancelled) { // edge failures outlasted the worker's retries: try the whole set again later (bounded), keep the pre-boot where it is
              this.prefetch.attempt = (this.prefetch.attempt || 0) + 1; if (this.prefetch.attempt < 4) { const att = this.prefetch.attempt; log('prefetch_retry_scheduled', { errors: d.errors, attempt: att }); setTimeout(() => { if (this.consent && this.predicted === d.game && !this.prefetch.complete) this.startPrefetch(d.game, 'critical', att); }, 8000 * att); }
              return; }
            this.armBootWatchdog(d.game);
            this.preloadBeacon('prefetch_done', { game: d.game, files: d.done, mb: +(d.bytes / 1048576).toFixed(1), fromCache: d.fromCache, ms: d.ms });
            if (!d.cancelled && CFG.warm !== '0' && CFG.warm !== 'eager') this.warmBoot(d.game); }
        } else if (d.type === 'stats') { this.swStats = d.stats; L.swStats = d.stats; L.swInfo = { instance: d.instance, ageS: d.ageS, holds: d.holds, inflight: d.inflight }; }
        else if (d.type === 'cleared') { this.say('Stored game files removed'); this.prefetch = { game: null, total: 0, done: 0, bytes: 0, ms: 0, complete: false, active: false, errors: 0, fromCache: 0 }; }
      },
      async manifest(gid) { if (!this.manifests[gid]) { const r = await fetch('/api/manifest/' + gid); this.manifests[gid] = await r.json(); } return this.manifests[gid]; },
      entriesFor(man, tier) { return man.entries.filter(e => e.tier === tier && (e.res === null || e.res === L.res)); },
      urlsFor(man, tier) { return this.entriesFor(man, tier).map(e => man.base + e.p); },
      // ---------------- consent + prediction + prefetch ----------------
      onConsent() { localStorage.setItem('accel:consent:' + this.player, this.consent ? '1' : '0'); log('consent', { on: this.consent }); if (!this.consent) { this.sw({ type: 'plan', plan: null }); localStorage.removeItem('accel:last:' + this.player); this.dropWarm(); } this.applyConsent(); },
      predict() {
        const avail = this.games.filter(g => g.available); if (!avail.length) return { game: null, reason: 'no games' };
        const last = localStorage.getItem('accel:last:' + this.player); const g = avail.find(x => x.id === last);
        if (g) return { game: g.id, reason: 'last game played, 35 % self-transition in the sample log' };
        return { game: avail[0].id, reason: 'only launchable game in sandbox; would be top affinity / transition' };
      },
      applyConsent() {
        if (!this.consent || !CFG.prefetch || !this.swReady) return;
        if (this.saveData || /(^|-)2g$/.test(this.effectiveType || '')) { log('prefetch_skipped', { saveData: this.saveData, et: this.effectiveType }); return; }
        if (!this.rgVerdict().allowed) { log('prefetch_skipped', { rg: true }); return; }
        const g = this.predicted; if (g && this.prefetch.game !== g) this.startPrefetch(g);
      },
      armBootWatchdog(gid) { // the engine gives up on the first failed file and never retries: a frame still booting 10 s after a clean pre-load is dead
        clearTimeout(this._wd); this._wd = setTimeout(() => { const w = this.warm; if (w.game === gid && w.frame && w.state === 'booting' && !this.view.open && !w.rebooted) {
          log('warm_watchdog_reboot', { level: w.level, sinceStartMs: Math.round(now() - w.tStart) }); this.preloadBeacon('warm_watchdog_reboot', { game: gid });
          const level = w.level; this.dropWarm(); this.warmBoot(gid, level === 'light' ? 'light' : undefined).then(() => { this.warm.rebooted = true; }); } }, 10000); },
      async startPrefetch(gid, tier = 'critical', attempt = 0) {
        const man = await this.manifest(gid); const all = this.entriesFor(man, tier);
        // engine order, except that the eager sounds (4.6 MB, needed only after the atlases are decoded) go last on every device:
        // once every file before them is on disk the light pre-boot is upgraded to full, so the engine decodes the atlases while the
        // music is still downloading (its own request for the music joins the prefetch in flight). Also keeps the desktop light tier
        // (@1x files, listed after the sounds in the merged manifest) ahead of the music.
        const entries = [...all.filter(e => e.phase !== 'SOUNDS_EAGER'), ...all.filter(e => e.phase === 'SOUNDS_EAGER')]; const urls = entries.map(e => man.base + e.p);
        const id = 'pf' + Date.now();
        let primaryEnd = entries.findIndex(e => e.phase === 'SOUNDS_EAGER'); if (primaryEnd < 0) primaryEnd = urls.length;
        const LIGHT = new Set(['BOOT', 'OTHER', 'PRELOADER', 'COMMON', 'SPLASH']); let lightEnd = 0; entries.forEach((e, i) => { if (LIGHT.has(e.phase)) lightEnd = i + 1; });
        const boost = { after: lightEnd, concurrency: BUDGET.boostConcurrency };
        this.prefetch = { id, game: gid, total: urls.length, done: 0, bytes: 0, ms: 0, complete: false, active: true, errors: 0, fromCache: 0, t0: now(), primaryEnd, upgraded: false, attempt };
        L.prefetch = { ...this.prefetch }; log('prefetch_start', { game: gid, n: urls.length, res: L.res });
        this.sw({ type: 'prefetch', id, game: gid, version: man.version, urls, concurrency: CFG.concurrency, boost, maxCachedGames: BUDGET.maxCachedGames });
        this.sw({ type: 'plan', plan: { game: gid, version: man.version, urls, concurrency: CFG.concurrency, boost, maxCachedGames: BUDGET.maxCachedGames } });
        if (CFG.warm === 'eager') this.warmBoot(gid); else if (CFG.stage && CFG.warm !== '0') this.warmBoot(gid, 'light');
      },
      // ---------------- warm engine (hidden pre-boot) ----------------
      frameFor(g) {
        const f = document.createElement('iframe'); f.title = g.name + ' (game)'; f.setAttribute('allow', 'autoplay; fullscreen'); f.style.opacity = '0';
        f.src = g.base + g.entry; document.getElementById('frames').insertBefore(f, document.getElementById('poster')); return f;
      },
      hookEngine(f, on) { // same-origin: the engine publishes its Pixi app; patch the shared emitter prototype
        const t0 = Date.now(); const timer = setInterval(() => {
          let w; try { w = f.contentWindow; } catch { return; } if (!w || !w.__PIXI_APP__) { if (Date.now() - t0 > 120000) clearInterval(timer); return; }
          clearInterval(timer);
          let p = w.__PIXI_APP__.stage; while (p) { if (Object.prototype.hasOwnProperty.call(p, 'emit')) { if (!p.__accel) { const orig = p.emit; p.__accel = true; p.emit = function (ev, a) { try { if (typeof ev === 'string' && ev.length > 3 && /^[A-Z][A-Z_]+$/.test(ev) && !/ON_FRAME_UPDATE|LOAD_PROGRESS|APP_RESIZE/.test(ev)) f.__on && f.__on(ev, a); } catch {} return orig.apply(this, arguments); }; } break; } p = Object.getPrototypeOf(p); }
          f.__on = on; on('__HOOKED');
        }, 25);
      },
      warmLevel() { // what the device can afford: full pre-boot only with enough RAM, otherwise light (JS + preloader + splash only)
        if (CFG.warm === '0') return '0'; if (CFG.warm === 'light') return 'light'; if (CFG.warm === 'full') return 'full';
        const mem = navigator.deviceMemory; return (mem === undefined || mem >= BUDGET.fullWarmMinDeviceMemoryGB) ? 'full' : 'light'; },
      async warmBoot(gid, levelWanted) {
        if (this.warmLevel() === '0') return; const g = this.games.find(x => x.id === gid); if (!g || !g.available) return;
        if (this.warm.game === gid && this.warm.frame) { if (levelWanted !== 'light' && this.warm.level === 'light' && this.warmLevel() === 'full') this.upgradeWarm(); return; }
        if (document.hidden) { this.pendingWarm = gid; return; }
        if (!this.rgVerdict().allowed) return;
        this.dropWarm();
        const man = await this.manifest(gid);
        const level = levelWanted === 'light' ? 'light' : this.warmLevel(); const allowPhases = level === 'light' ? new Set(['BOOT', 'OTHER', 'PRELOADER', 'COMMON', 'SPLASH']) : null;
        const allowed = allowPhases ? man.entries.filter(e => allowPhases.has(e.phase) && (e.res === null || e.res === L.res)).map(e => man.base + e.p) : this.urlsFor(man, 'critical');
        if (CFG.hold || level === 'light') this.sw({ type: 'hold', game: gid, critical: allowed });
        const f = this.frameFor(g); const tStart = now();
        Object.assign(this.warm, { game: gid, frame: f, state: 'booting', tStart, tReady: 0, hot: false, level }); L.warm = { game: gid, state: 'booting', tStart, level }; log('warm_start', { game: gid, level });
        this.armWarmTtl();
        this.hookEngine(f, (ev, a) => this.onEngine(f, ev, a));
      },
      onEngine(f, ev, a) {
        const t = now(); log('engine:' + ev, { arg: typeof a === 'string' ? a : undefined });
        const cur = L.current && L.current.frame === f ? L.current : null;
        if (ev === 'BUNDLE_LOADED' && a === 'SPLASH' && this.warm.frame === f && this.warm.level === 'light' && this.warm.state === 'booting') {
          this.warm.state = 'ready-light'; this.warm.tReady = t; L.warm = { ...L.warm, state: 'ready-light', tReady: t };
          if (!this.view.open || this.view.game.id !== this.warm.game) setTimeout(() => this.park(f), 400);
          this.preloadBeacon('warm_light_ready', { game: this.warm.game, bootMs: Math.round(t - this.warm.tStart) });
        }
        if (ev === 'PRIMARY_ASSETS_LOADED') {
          if (this.warm.frame === f && this.warm.state === 'booting') { this.warm.state = 'ready'; this.warm.tReady = t; L.warm = { ...L.warm, state: 'ready', tReady: t }; this.preloadBeacon('warm_full_ready', { game: this.warm.game, bootMs: Math.round(t - this.warm.tStart) });
            if (!this.view.open || this.view.game.id !== this.warm.game) setTimeout(() => this.park(f), 400); }
          if (cur) { cur.t_ready = t; cur.t_ready_rel = t - cur.t0; this.view.revealed = true; this.view.status = ''; this.post('mark', { mark: 'ready', t, path: cur.path }); this.finishLaunch(cur); }
        } else if (ev === 'SPLASH_START_CLICKED') { if (cur) { cur.t_play = t; this.post('mark', { mark: 'play', t }); } }
        else if (ev === 'IDLE_STATE_ENTRY') { f.__idle = true; if (cur && !cur.t_idle) { cur.t_idle = t; this.post('mark', { mark: 'idle', t }); this.beacon(cur); } }
      },
      park(f) { // engine's own tab-suspend hook: mutes all sounds and stops the ticker (no GPU/CPU while waiting)
        try { const w = f.contentWindow; if (w && w.stopPixiApp && this.warm.frame === f && (!this.view.open || this.view.game.id !== this.warm.game)) { w.stopPixiApp(); this.warm.state = this.warm.state === 'ready-light' ? 'parked-light' : 'parked'; L.warm = { ...L.warm, state: this.warm.state }; log('warm_parked', { level: this.warm.level }); } } catch (e) { log('park_error', { m: String(e) }); }
      },
      async upgradeWarm() { // light → full in place: let PRIMARY through (secondary stays held), resume, park again at the Play button
        const w = this.warm; if (!w.frame || w.level !== 'light') return; const man = await this.manifest(w.game);
        w.level = 'full'; L.warm = { ...L.warm, level: 'full' }; log('warm_upgrade', { from: w.state });
        this.sw({ type: 'hold', game: w.game, critical: this.urlsFor(man, 'critical') });
        if (w.state === 'parked-light') { try { w.frame.contentWindow.startPixiApp(); } catch {} }
        if (w.state === 'parked-light' || w.state === 'ready-light') { w.state = 'booting'; L.warm = { ...L.warm, state: 'booting' }; }
      },
      preloadBeacon(name, extra) { try { navigator.sendBeacon('/api/events', new Blob([JSON.stringify({ type: 'preload', name, player: this.player, sinceLobbyMs: Math.round(performance.now()), res: L.res, ua: navigator.userAgent.slice(0, 80), ...extra })], { type: 'application/json' })); } catch {} },
      armWarmTtl() { clearTimeout(this._warmT); this._warmT = setTimeout(() => { if (!this.view.open && this.warm.frame) { log('warm_idle_expired'); this.dropWarm(); } }, BUDGET.warmIdleTtlMs); },
      dropWarm() { if (this.warm.frame) { try { this.warm.frame.remove(); } catch {} } clearTimeout(this._hotT); this.sw({ type: 'release', game: this.warm.game }); Object.assign(this.warm, { game: null, frame: null, state: 'none', tReady: 0, hot: false }); L.warm = { game: null, state: 'none' }; },
      // ---------------- launch ----------------
      onTileDown(g, e) { if (!g.available) return; this.launch(g, now()); },
      onTileClick(g, e) { if (!g.available) { this.say('Not available in this sandbox (no certified bundle for ' + g.name + ')'); return; } if (!this.view.open) this.launch(g, now()); },
      async launch(g, t0) {
        if (this.view.open) return; t0 = t0 || now();
        const rec = { game: g.id, gameName: g.name, t0, path: '', frame: null }; L.current = rec; this.launches.push(rec); L.launches = this.launches;
        this.view = { open: true, game: g, revealed: false, poster: g.tile, status: 'opening…', progress: null }; this.post('launch', { t0, game: g.id, name: g.name });
        requestAnimationFrame(() => { rec.t_shell = now(); });
        const v = this.rgVerdict();
        if (!v.allowed) { rec.path = 'blocked'; this.view.status = 'blocked: ' + v.reason; log('launch_blocked', { reason: v.reason }); this.post('mark', { mark: 'blocked', t: now(), reason: v.reason }); setTimeout(() => this.back(), 1500); return; }
        if (v.realityCheckDue) { const ok = await this.showRealityCheck(); rec.t_rc = now(); if (!ok) { rec.path = 'reality-check-exit'; return; } }
        const w = this.warm;
        if (w.game === g.id && w.frame) {
          rec.path = w.hot ? 'hot' : (w.state === 'parked' || w.state === 'ready') ? 'warm' : (w.state === 'parked-light' || w.state === 'ready-light') ? 'warm-light' : 'warm-booting'; rec.frame = w.frame;
          rec.readyBeforeTap = w.state === 'parked' || w.state === 'ready'; if (rec.readyBeforeTap) { rec.t_ready = w.tReady; rec.t_ready_rel = 0; }
          this.reveal(rec);
        } else {
          rec.path = this.swReady ? (this.prefetch.game === g.id && this.prefetch.complete ? 'prefetched' : 'cold-sw') : 'cold'; this.dropWarm();
          if (CFG.fill && this.swReady && !(this.prefetch.game === g.id && this.prefetch.active)) this.startPrefetch(g.id); // tap-time parallel fill (measured slower than letting the engine drive on a saturated link; off by default)
          const f = this.frameFor(g); rec.frame = f; Object.assign(this.warm, { game: g.id, frame: f, state: 'booting', tStart: t0, tReady: 0, hot: false }); L.warm = { game: g.id, state: 'booting', tStart: t0 };
          this.hookEngine(f, (ev, a) => this.onEngine(f, ev, a));
          this.view.status = 'loading…'; this.reveal(rec, true);
        }
      },
      reveal(rec, keepPoster) {
        const f = rec.frame; const w = this.warm;
        f.style.opacity = '1'; f.style.pointerEvents = 'auto';
        this.sw({ type: 'release', game: rec.game });
        if (w.state === 'parked' || w.state === 'parked-light') { try { f.contentWindow.startPixiApp(); w.state = w.state === 'parked' ? 'ready' : 'booting'; } catch (e) { log('resume_error', { m: String(e) }); } } else if (w.state === 'ready-light') w.state = 'booting';
        L.warm = { ...L.warm, state: w.state };
        requestAnimationFrame(() => { rec.t_reveal = now(); this.post('mark', { mark: 'reveal', t: rec.t_reveal, path: rec.path, readyBeforeTap: !!rec.readyBeforeTap }); if (!keepPoster && rec.readyBeforeTap) { this.view.revealed = true; this.view.status = ''; this.finishLaunch(rec); } if (f.__idle && !rec.t_idle) { rec.alreadyIdle = true; rec.t_idle = rec.t_reveal; this.post('mark', { mark: 'idle', t: rec.t_idle }); this.beacon(rec); } });
        if (!rec.readyBeforeTap) this.view.status = w.state === 'booting' ? 'loading…' : '';
        log('reveal', { path: rec.path });
        try { f.focus(); } catch {}
      },
      finishLaunch(rec) { if (this.consent) localStorage.setItem('accel:last:' + this.player, rec.game); /* the only behavioural datum kept on the device, and only under the pre-load consent */ this.learnRes(rec.frame); },
      learnRes(f) { try { const rs = f.contentWindow.performance.getEntriesByType('resource'); const m = rs.map(r => (/\/(@1x|@0\.5x)\//.exec(r.name) || [])[1]).find(Boolean); if (m && m !== L.res) { localStorage.setItem('accel:res', m); log('res_learned', { from: L.res, to: m }); L.res = m; } } catch {} },
      back() {
        if (!this.view.open) return; const rec = L.current; const g = this.view.game; log('back', { game: g && g.id }); this.post('back', { game: g && g.id });
        try { if (document.fullscreenElement) document.exitFullscreen(); } catch {} // the game requests fullscreen on phones
        this.view = { open: false, game: null, revealed: false, poster: null, status: '', progress: null };
        const w = this.warm; if (CFG.warm === '0' && w.frame) this.dropWarm(); // no-acceleration mode (baseline side of /compare, harness 'cold'): nothing is kept
        else if (w.frame && w.game === g.id) { // keep the frame for a hot relaunch, parked
          w.frame.style.pointerEvents = 'none'; w.hot = true;
          if (w.state === 'ready') this.park(w.frame); else if (w.state === 'booting') { /* still loading: park when ready */ }
          L.warm = { ...L.warm, state: w.state, hot: true };
          clearTimeout(this._hotT); this._hotT = setTimeout(() => { if (!this.view.open) { log('hot_expired'); this.dropWarm(); } }, CFG.hotTtlMs);
        }
        if (rec && !rec.t_idle) this.beacon(rec);
        this.$nextTick(() => { const t = document.querySelector('[data-tile="' + g.id + '"]'); t && t.focus(); });
      },
      readyBadge(g) { return this.showInstr && g.available && this.warm.game === g.id && (this.warm.state === 'parked' || this.warm.state === 'ready'); }, // instrumentation only: the player-facing lobby never singles out a game
      beacon(rec) { if (rec._sent) return; rec._sent = true; const o = { type: 'launch', player: this.player, game: rec.game, path: rec.path, t0: rec.t0, shell_ms: rec.t_shell ? rec.t_shell - rec.t0 : null, reveal_ms: rec.t_reveal ? rec.t_reveal - rec.t0 : null, ready_ms: rec.t_ready ? Math.max(0, rec.t_ready - rec.t0) : null, readyBeforeTap: !!rec.readyBeforeTap, play_ms: rec.t_play ? rec.t_play - rec.t0 : null, idle_ms: rec.t_idle ? rec.t_idle - rec.t0 : null, res: L.res, ua: navigator.userAgent.slice(0, 80), sw: this.swReady, stats: this.swStats && this.swStats[rec.game] || null };
        try { navigator.sendBeacon('/api/events', new Blob([JSON.stringify(o)], { type: 'application/json' })); } catch {} },
      clearCache() { this.dropWarm(); this.sw({ type: 'clear' }); }
    }
  });
  app.mount('#app');
})();
