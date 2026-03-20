/* ============================================================
   DODGE SCROLL EXPERIENCE — ENGINE v4 (Production)
   Optimized for: GitHub Pages / Render hosting
   - Graceful 404 handling (missing frames)
   - Touch scroll support
   - Relative paths only
   - Performance optimized
   ============================================================ */
(() => {
  'use strict';

  /* ---------- CONFIG ---------- */
  const TOTAL_SEQ1 = 192;
  const TOTAL_SEQ2 = 192;
  const FRAME_PATH = './photos/';    // Relative path for static hosting
  const INITIAL_BATCH = 40;
  const BG_BATCH = 25;

  const S = {
    intro:         { s: 0.000, e: 0.040 },
    interior:      { s: 0.040, e: 0.180 },
    interiorStats: { s: 0.180, e: 0.280 },
    transition:    { s: 0.280, e: 0.340 },
    exterior:      { s: 0.340, e: 0.480 },
    exteriorStats: { s: 0.480, e: 0.580 },
    rear:          { s: 0.580, e: 0.740 },
    hero:          { s: 0.740, e: 1.000 },
  };

  /* ---------- DOM ---------- */
  const $ = id => document.getElementById(id);
  const canvas  = $('frame-canvas');
  const ctx     = canvas.getContext('2d', { alpha: false });
  const loader  = $('loader');
  const bar     = $('loader-bar');
  const pct     = $('loader-percent');
  const progBar = $('scroll-progress');
  const hint    = $('scroll-hint');
  const tBlur   = $('transition-blur');
  const mBlur   = $('motion-blur');
  const hGlow   = $('hero-glow');
  const hGrad   = $('hero-gradient');
  const nav     = $('top-nav');
  const fcNum   = $('fc-num');
  const fcTot   = $('fc-total');

  const oIntro    = $('overlay-intro');
  const oInt      = $('overlay-interior');
  const oIntStats = $('overlay-interior-stats');
  const oExt      = $('overlay-exterior');
  const oExtStats = $('overlay-exterior-stats');
  const oRear     = $('overlay-rear');
  const oHero     = $('overlay-hero');

  const cSteer = $('callout-steering');
  const cDash  = $('callout-dashboard');
  const cAmb   = $('callout-ambient');
  const cWheel = $('callout-wheels');
  const cBody  = $('callout-body');
  const cLight = $('callout-lights');

  const dots = document.querySelectorAll('.indicator-dot');
  const navLinks = document.querySelectorAll('.nav-links a');

  /* ---------- STATE ---------- */
  const imgs1 = new Array(TOTAL_SEQ1);
  const imgs2 = new Array(TOTAL_SEQ2);
  let loaded = 0;
  const total = TOTAL_SEQ1 + TOTAL_SEQ2;
  let curFrame = -1, curSeq = -1;
  let scrollPos = 0, targetScroll = 0;
  let zoom = 1;
  let ready = false;
  let lastDrawnFrame = -1, lastDrawnSeq = -1, lastDrawnZoom = -1;
  let isLooping = false;

  /* ---------- HELPERS ---------- */
  const pad5 = n => String(n).padStart(5, '0');
  const pad3 = n => String(n).padStart(3, '0');
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const map = (v, a, b, c, d) => {
    if (a === b) return c;
    return clamp(c + ((v - a) / (b - a)) * (d - c), Math.min(c, d), Math.max(c, d));
  };
  const show = el => { if (el && !el.classList.contains('visible')) el.classList.add('visible'); };
  const hide = el => { if (el && el.classList.contains('visible')) el.classList.remove('visible'); };

  /* ---------- PRELOADER (graceful 404 handling) ---------- */
  function loadImg(seq, i) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        (seq === 1 ? imgs1 : imgs2)[i - 1] = img;
        loaded++;
        updateLoader();
        res(true);
      };
      img.onerror = () => {
        // Gracefully handle missing frames — no 404 errors shown
        loaded++;
        updateLoader();
        res(false);
      };
      img.src = `${FRAME_PATH}frame${seq}_${pad5(i)}.png`;
    });
  }

  function updateLoader() {
    const p = Math.round((loaded / total) * 100);
    bar.style.width = p + '%';
    pct.textContent = p + ' %';
  }

  async function batch(seq, from, count) {
    const mx = seq === 1 ? TOTAL_SEQ1 : TOTAL_SEQ2;
    const tasks = [];
    for (let i = from; i < from + count && i <= mx; i++) tasks.push(loadImg(seq, i));
    await Promise.all(tasks);
  }

  async function preload() {
    // Load initial batches of both sequences
    await Promise.all([
      batch(1, 1, INITIAL_BATCH),
      batch(2, 1, INITIAL_BATCH)
    ]);

    ready = true;
    loader.classList.add('hidden');

    // Draw first available frame
    if (imgs1[0]) draw(1, 1);

    // Background-load remaining frames in smaller chunks
    const loadRest = async (seq, tot) => {
      for (let i = INITIAL_BATCH + 1; i <= tot; i += BG_BATCH) {
        // Yield to main thread between batches
        await new Promise(r => setTimeout(r, 50));
        await batch(seq, i, BG_BATCH);
      }
    };
    // Load both sequences in parallel in background
    loadRest(1, TOTAL_SEQ1);
    loadRest(2, TOTAL_SEQ2);
  }

  /* ---------- CANVAS ---------- */
  let canvasW = 0, canvasH = 0;

  function resize() {
    canvasW = window.innerWidth;
    canvasH = window.innerHeight;
    canvas.width = canvasW;
    canvas.height = canvasH;
    // Force redraw
    lastDrawnFrame = -1;
    lastDrawnSeq = -1;
    if (curFrame > 0 && curSeq > 0) draw(curSeq, curFrame);
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  function coverDraw(img, alpha) {
    if (!img) return;
    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;

    if (zoom !== 1) {
      ctx.translate(canvasW * 0.5, canvasH * 0.5);
      ctx.scale(zoom, zoom);
      ctx.translate(-canvasW * 0.5, -canvasH * 0.5);
    }

    const ir = img.naturalWidth / img.naturalHeight;
    const cr = canvasW / canvasH;
    let dw, dh, dx, dy;
    if (ir > cr) { dh = canvasH; dw = canvasH * ir; dx = (canvasW - dw) * 0.5; dy = 0; }
    else         { dw = canvasW; dh = canvasW / ir; dx = 0; dy = (canvasH - dh) * 0.5; }
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  }

  function draw(seq, fi) {
    const arr = seq === 1 ? imgs1 : imgs2;
    const mx  = seq === 1 ? TOTAL_SEQ1 : TOTAL_SEQ2;
    const idx = clamp(Math.round(fi), 1, mx) - 1;

    // Skip if same frame already drawn at same zoom
    if (idx === lastDrawnFrame && seq === lastDrawnSeq && zoom === lastDrawnZoom) return;

    const img = arr[idx];
    if (!img) {
      // Find nearest available frame (graceful fallback)
      let nearest = null;
      for (let d = 1; d < 10; d++) {
        if (arr[idx + d]) { nearest = arr[idx + d]; break; }
        if (arr[idx - d]) { nearest = arr[idx - d]; break; }
      }
      if (!nearest) return;
      ctx.clearRect(0, 0, canvasW, canvasH);
      coverDraw(nearest, 1);
      return;
    }

    ctx.clearRect(0, 0, canvasW, canvasH);
    coverDraw(img, 1);
    lastDrawnFrame = idx;
    lastDrawnSeq = seq;
    lastDrawnZoom = zoom;
  }

  function drawX(progress) {
    const f1 = clamp(Math.round(map(progress, 0, 0.5, 180, 192)), 1, TOTAL_SEQ1);
    const f2 = clamp(Math.round(map(progress, 0.5, 1, 1, 25)), 1, TOTAL_SEQ2);
    ctx.clearRect(0, 0, canvasW, canvasH);
    coverDraw(imgs1[f1 - 1], 1 - progress);
    coverDraw(imgs2[f2 - 1], progress);
    lastDrawnFrame = -1;
    lastDrawnSeq = -1;
  }

  /* ---------- HIDE ALL ---------- */
  function hideAll() {
    hide(oIntro); hide(oInt); hide(oIntStats);
    hide(oExt); hide(oExtStats);
    hide(oRear); hide(oHero);
    hide(cSteer); hide(cDash); hide(cAmb);
    hide(cWheel); hide(cBody); hide(cLight);
    hide(hGlow); hide(hGrad);
  }

  function setActiveDot(i) {
    for (let d = 0; d < dots.length; d++) {
      if (d === i) { if (!dots[d].classList.contains('active')) dots[d].classList.add('active'); }
      else { dots[d].classList.remove('active'); }
    }
  }

  function setActiveNav(section) {
    navLinks.forEach(a => {
      if (a.dataset.section === section) { if (!a.classList.contains('active')) a.classList.add('active'); }
      else a.classList.remove('active');
    });
  }

  function updateFC(seq, frame) {
    fcNum.textContent = pad3(clamp(frame, 1, seq === 1 ? TOTAL_SEQ1 : TOTAL_SEQ2));
    fcTot.textContent = String(seq === 1 ? TOTAL_SEQ1 : TOTAL_SEQ2);
  }

  /* ---------- ANIMATION TICK ---------- */
  function tick() {
    if (!ready) { requestAnimationFrame(tick); return; }

    // Smooth interpolation — 0.12 for snappy, responsive feel
    scrollPos = lerp(scrollPos, targetScroll, 0.12);
    if (Math.abs(scrollPos - targetScroll) < 0.3) scrollPos = targetScroll;

    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const p = maxScroll > 0 ? clamp(scrollPos / maxScroll, 0, 1) : 0;

    progBar.style.width = (p * 100) + '%';

    // Scroll hint
    if (p > 0.015) hint.classList.add('hidden');
    else hint.classList.remove('hidden');

    // Nav
    if (p > 0.02) { if (!nav.classList.contains('scrolled')) nav.classList.add('scrolled'); }
    else nav.classList.remove('scrolled');

    // Reset blur
    tBlur.style.backdropFilter = 'none';
    tBlur.style.webkitBackdropFilter = 'none';
    mBlur.style.backdropFilter = 'none';
    mBlur.style.webkitBackdropFilter = 'none';

    hideAll();

    /* ===== INTRO ===== */
    if (p <= S.intro.e) {
      setActiveDot(0); setActiveNav('interior');
      zoom = 1;
      curFrame = 1; curSeq = 1; draw(1, 1);
      show(oIntro);
      updateFC(1, 1);
    }
    /* ===== INTERIOR ===== */
    else if (p <= S.interior.e) {
      setActiveDot(0); setActiveNav('interior');
      const t = map(p, S.interior.s, S.interior.e, 0, 1);
      const frame = clamp(Math.round(1 + t * (TOTAL_SEQ1 * 0.6)), 1, TOTAL_SEQ1);
      zoom = lerp(1.0, 1.05, t);
      curFrame = frame; curSeq = 1; draw(1, frame);
      updateFC(1, frame);

      if (t > 0.05 && t < 0.60) show(oInt);
      if (t > 0.30 && t < 0.70) show(cSteer);
      if (t > 0.45 && t < 0.80) show(cDash);
      if (t > 0.60 && t < 0.95) show(cAmb);
    }
    /* ===== INTERIOR STATS ===== */
    else if (p <= S.interiorStats.e) {
      setActiveDot(0); setActiveNav('interior');
      const t = map(p, S.interiorStats.s, S.interiorStats.e, 0, 1);
      const frame = clamp(Math.round(TOTAL_SEQ1 * 0.6 + t * (TOTAL_SEQ1 * 0.4)), 1, TOTAL_SEQ1);
      zoom = lerp(1.05, 1.0, t);
      curFrame = frame; curSeq = 1; draw(1, frame);
      updateFC(1, frame);
      show(oIntStats);
    }
    /* ===== TRANSITION ===== */
    else if (p <= S.transition.e) {
      setActiveDot(1); setActiveNav('');
      const t = map(p, S.transition.s, S.transition.e, 0, 1);
      zoom = 1;
      const blur = t < 0.5 ? map(t, 0, 0.5, 0, 16) : map(t, 0.5, 1, 16, 0);
      tBlur.style.backdropFilter = `blur(${blur}px)`;
      tBlur.style.webkitBackdropFilter = `blur(${blur}px)`;
      drawX(t);
      curFrame = -1; curSeq = -1;
      updateFC(1, 192);
    }
    /* ===== EXTERIOR ===== */
    else if (p <= S.exterior.e) {
      setActiveDot(2); setActiveNav('exterior');
      const t = map(p, S.exterior.s, S.exterior.e, 0, 1);
      const frame = clamp(Math.round(1 + t * (TOTAL_SEQ2 * 0.6)), 1, TOTAL_SEQ2);
      zoom = 1;
      curFrame = frame; curSeq = 2; draw(2, frame);
      updateFC(2, frame);

      const mb = map(t, 0.3, 0.7, 0, 2);
      mBlur.style.backdropFilter = `blur(${mb}px)`;
      mBlur.style.webkitBackdropFilter = `blur(${mb}px)`;

      if (t > 0.05 && t < 0.55) show(oExt);
      if (t > 0.25 && t < 0.60) show(cWheel);
      if (t > 0.40 && t < 0.75) show(cBody);
      if (t > 0.55 && t < 0.90) show(cLight);
    }
    /* ===== EXTERIOR STATS ===== */
    else if (p <= S.exteriorStats.e) {
      setActiveDot(2); setActiveNav('specs');
      const t = map(p, S.exteriorStats.s, S.exteriorStats.e, 0, 1);
      const frame = clamp(Math.round(TOTAL_SEQ2 * 0.6 + t * (TOTAL_SEQ2 * 0.25)), 1, TOTAL_SEQ2);
      zoom = 1;
      curFrame = frame; curSeq = 2; draw(2, frame);
      updateFC(2, frame);
      show(oExtStats);
    }
    /* ===== REAR ===== */
    else if (p <= S.rear.e) {
      setActiveDot(3); setActiveNav('power');
      const t = map(p, S.rear.s, S.rear.e, 0, 1);
      zoom = 1;
      const hf = clamp(Math.round(map(t, 0, 1, 163, 192)), 1, TOTAL_SEQ2);
      curFrame = hf; curSeq = 2; draw(2, hf);
      updateFC(2, hf);
      if (t > 0.08 && t < 0.92) show(oRear);
    }
    /* ===== HERO ===== */
    else {
      setActiveDot(4); setActiveNav('');
      zoom = 1;
      curFrame = 192; curSeq = 2; draw(2, 192);
      updateFC(2, 192);
      show(hGlow); show(hGrad);
      const t = map(p, S.hero.s, S.hero.e, 0, 1);
      if (t > 0.06) show(oHero);
    }

    if (isLooping) requestAnimationFrame(tick);
  }

  /* ---------- SCROLL LISTENER ---------- */
  window.addEventListener('scroll', () => {
    targetScroll = window.scrollY;
  }, { passive: true });

  targetScroll = window.scrollY;
  scrollPos = targetScroll;

  /* ---------- TOUCH: Prevent default only on canvas for better scroll ---------- */
  // (passive scroll is already set above; this ensures smooth touch on iOS)
  document.addEventListener('touchmove', () => {}, { passive: true });

  /* ---------- HANDLE VISIBILITY CHANGE (save battery) ---------- */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      isLooping = false;
    } else {
      if (!isLooping) {
        isLooping = true;
        targetScroll = window.scrollY;
        scrollPos = targetScroll;
        requestAnimationFrame(tick);
      }
    }
  });

  /* ---------- INIT ---------- */
  preload().catch(() => {
    // Even if preload fails, hide loader and show what we have
    ready = true;
    loader.classList.add('hidden');
  });

  isLooping = true;
  requestAnimationFrame(tick);
})();
