(() => {
  document.getElementById('year').textContent = new Date().getFullYear();

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Scroll reveal
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // Attack-path graph: light the exploited path one hop at a time, hold, reset.
  const graph = document.getElementById('graph');
  const stepped = graph.querySelectorAll('[data-step]');
  const LAST = 4;
  const showTo = (n) => stepped.forEach((el) => el.classList.toggle('on', +el.dataset.step <= n));
  if (reduced) {
    showTo(LAST);
  } else {
    let n = -1, timer = null;
    const tick = () => {
      n = n >= LAST + 3 ? -1 : n + 1;   // 3 extra ticks hold the finished path
      showTo(n);
    };
    new IntersectionObserver(([e]) => {
      clearInterval(timer);
      if (e.isIntersecting) timer = setInterval(tick, 1100);
    }, { threshold: 0.3 }).observe(graph);
  }

  // Briefing form: no backend yet, so say so instead of pretending to send.
  const form = document.getElementById('brief');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const status = document.getElementById('brief-status');
    status.textContent = `Not sent: this preview form is not connected yet. To request a briefing, email ${form.dataset.to}.`;
    status.classList.add('is-warn');
  });

  // Cookie consent. The only cookie is a strictly necessary session cookie
  // (no Expires/Max-Age) recording the visitor's choice. sessionStorage is a
  // fallback for sandboxed frames where cookies are blocked.
  const CONSENT = 'sgi_consent';
  const bar = document.getElementById('cookiebar');
  const dialog = document.getElementById('cookie-dialog');

  function readConsent() {
    try {
      const m = document.cookie.match(/(?:^|;\s*)sgi_consent=([^;]+)/);
      if (m) return m[1];
    } catch (e) { /* cookies unavailable */ }
    try { return sessionStorage.getItem(CONSENT); } catch (e) { return null; }
  }

  function saveConsent(value) {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    try { document.cookie = `${CONSENT}=${value}; Path=/; SameSite=Lax${secure}`; } catch (e) { /* ignore */ }
    try { sessionStorage.setItem(CONSENT, value); } catch (e) { /* ignore */ }
    bar.hidden = true;
  }

  bar.hidden = !!readConsent();
  document.querySelectorAll('[data-consent]').forEach((b) =>
    b.addEventListener('click', () => saveConsent(b.dataset.consent)));
  document.querySelectorAll('[data-open-cookies]').forEach((b) =>
    b.addEventListener('click', () => {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }));

  // Hero stream: raw detections flow left to right, the triage gate closes
  // most of them as noise and lets a few material ones through.
  const canvas = document.getElementById('stream');
  const ctx = canvas.getContext('2d');
  const statIn = document.getElementById('stat-in');
  const statNoise = document.getElementById('stat-noise');
  const statMat = document.getElementById('stat-mat');

  const GATE = 0.58;
  const LANES = 5;
  const MATERIAL_RATE = 0.012;
  const ACCENT = '207, 148, 238';

  let w = 0, h = 0, gateX = 0;
  let particles = [];
  let counts = { in: 0, noise: 0, mat: 0 };
  let frame = 0, running = false, visible = true;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    w = r.width; h = r.height; gateX = w * GATE;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawn(x) {
    particles.push({
      x, y: 14 + Math.random() * (h - 28),
      vx: 1.2 + Math.random() * 1.8,
      r: 0.8 + Math.random() * 1.1,
      a: 0.25 + Math.random() * 0.4,
      state: 'raw', ty: 0
    });
    counts.in++;
  }

  function step() {
    const rate = Math.max(1, Math.round(w / 260));
    for (let i = 0; i < rate; i++) spawn(-4);

    for (const p of particles) {
      if (p.state === 'raw' && p.x >= gateX) {
        if (Math.random() < MATERIAL_RATE) {
          p.state = 'mat';
          p.ty = (h / (LANES + 1)) * (1 + Math.floor(Math.random() * LANES));
          p.vx = 2.2;
          counts.mat++;
        } else {
          p.state = 'noise';
          counts.noise++;
        }
      }
      if (p.state === 'noise') { p.a -= 0.03; p.vx *= 0.9; }
      if (p.state === 'mat') p.y += (p.ty - p.y) * 0.06;
      p.x += p.vx;
    }
    particles = particles.filter((p) => p.a > 0 && p.x < w + 60);
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    // lanes
    ctx.strokeStyle = 'rgba(74, 61, 43, .7)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= LANES; i++) {
      const y = Math.round((h / (LANES + 1)) * i) + 0.5;
      ctx.beginPath(); ctx.moveTo(gateX, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // gate
    const g = ctx.createLinearGradient(gateX - 40, 0, gateX + 40, 0);
    g.addColorStop(0, `rgba(${ACCENT}, 0)`);
    g.addColorStop(0.5, `rgba(${ACCENT}, .13)`);
    g.addColorStop(1, `rgba(${ACCENT}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(gateX - 40, 0, 80, h);
    ctx.strokeStyle = `rgba(${ACCENT}, .8)`;
    ctx.beginPath(); ctx.moveTo(gateX + 0.5, 0); ctx.lineTo(gateX + 0.5, h); ctx.stroke();

    for (const p of particles) {
      if (p.state === 'mat') {
        const tail = Math.min(90, p.x - gateX);
        const tg = ctx.createLinearGradient(p.x - tail, 0, p.x, 0);
        tg.addColorStop(0, `rgba(${ACCENT}, 0)`);
        tg.addColorStop(1, `rgba(${ACCENT}, .9)`);
        ctx.strokeStyle = tg; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x - tail, p.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.fillStyle = `rgba(${ACCENT}, .22)`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#fbf2ff';
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 6.2832); ctx.fill();
      } else {
        ctx.fillStyle = `rgba(221, 198, 155, ${Math.max(0, p.a)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
      }
    }
  }

  function writeStats() {
    statIn.textContent = counts.in.toLocaleString();
    statNoise.textContent = counts.noise.toLocaleString();
    statMat.textContent = counts.mat.toLocaleString();
  }

  function loop() {
    if (!running) return;
    step(); draw();
    if (++frame % 6 === 0) writeStats();
    requestAnimationFrame(loop);
  }

  function setRunning(on) {
    if (reduced || on === running) return;
    running = on;
    if (on) requestAnimationFrame(loop);
  }

  // Pre-roll so the first paint already shows a full stream.
  function prime() {
    particles = [];
    counts = { in: 0, noise: 0, mat: 0 };
    for (let i = 0; i < 420; i++) step();
    draw(); writeStats();
  }

  // Re-prime when the canvas width changes a lot (it can measure 0 before layout settles).
  let primedW = 0;
  new ResizeObserver(() => {
    resize();
    if (w > 0 && Math.abs(w - primedW) > primedW * 0.3) { primedW = w; prime(); }
    else if (!running) draw();
  }).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; setRunning(visible && !document.hidden); }).observe(canvas);
  document.addEventListener('visibilitychange', () => setRunning(visible && !document.hidden));
})();
