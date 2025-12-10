(function () {
  'use strict';

  const DUR = { retract: 420, clickNav: 520, clickAvatar: 260 };
  const MOBILE_THRESHOLDS = { downDy: 4, upDy: -6, minY: 30 };
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const root = document.documentElement;
  const topGroup = $('#top-group');
  const avatarWrap = $('#avatar-wrap');
  const avatar = $('#avatar');
  const nav = $('nav');
  const state = { avatarShift: 0, navShift: 0, t: 0, scrollDistance: 320 };

  let ticking = false, retractRAF = null, programmaticScroll = false, navProgrammatic = false, lastY = scrollY;

  const edgeGap = () => parseFloat(getComputedStyle(root).getPropertyValue('--edge-gap')) || 24;
  const isMobile = () => matchMedia('(max-width: 1360px)').matches;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('show'); io.unobserve(e.target); }
    });
  }, { threshold: 0.2 });
  $$('.fade-in, .fade-in-eyes').forEach(el => io.observe(el));

  function computeShifts() {
    const vw = innerWidth, gapEdge = edgeGap();
    const g = getComputedStyle(topGroup);
    const groupGap = parseFloat(g.columnGap || g.gap) || 0;
    const avatarW = avatar.getBoundingClientRect().width;
    const navW = nav.getBoundingClientRect().width;
    const centerLeft = vw / 2 - (avatarW + groupGap + navW) / 2;
    state.avatarShift = gapEdge - centerLeft;
    state.navShift = vw - gapEdge - navW - (centerLeft + avatarW + groupGap);
    applyTransforms();
  }

  function applyTransforms() {
    if (isMobile()) {
      avatarWrap.style.transform = nav.style.transform = 'translateX(0)';
    } else {
      avatarWrap.style.transform = `translateX(${state.avatarShift * state.t}px)`;
      nav.style.transform = `translateX(${state.navShift * state.t}px)`;
    }
  }

  function handleMobileCollapse(y) {
    if (!isMobile()) { topGroup.classList.remove('collapsed'); lastY = y; return; }
    if (navProgrammatic) { topGroup.classList.add('collapsed'); lastY = y; return; }
    const dy = y - lastY;
    if (y <= 0) topGroup.classList.remove('collapsed');
    else if (dy > MOBILE_THRESHOLDS.downDy && y > MOBILE_THRESHOLDS.minY) topGroup.classList.add('collapsed');
    else if (dy < MOBILE_THRESHOLDS.upDy) topGroup.classList.remove('collapsed');
    lastY = y;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      if (!programmaticScroll) state.t = Math.min(Math.max(scrollY / state.scrollDistance, 0), 1);
      applyTransforms();
      updateBackgroundByScroll();
      handleMobileCollapse(scrollY);
      if (programmaticScroll && scrollY === 0) programmaticScroll = false;
      ticking = false;
    });
  }

  function goTopAndRetract() {
    const wasAtTop = scrollY === 0;
    if (!wasAtTop) { programmaticScroll = true; scrollTo({ top: 0, behavior: 'smooth' }); }
    avatar.classList.add('clicked');
    setTimeout(() => avatar.classList.remove('clicked'), DUR.clickAvatar);
    if (retractRAF) cancelAnimationFrame(retractRAF);
    const from = state.t, start = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - start) / DUR.retract);
      state.t = from * (1 - (1 - (1 - p) ** 3));
      applyTransforms();
      if (p < 1) retractRAF = requestAnimationFrame(step);
      else { retractRAF = null; if (wasAtTop) programmaticScroll = false; }
    })(performance.now());
  }
  window.goTopAndRetract = goTopAndRetract;

  $$('nav a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const target = $(a.getAttribute('href'));
      if (target) {
        navProgrammatic = true;
        target.scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => navProgrammatic = false, 800);
      }
      a.classList.add('clicked');
      setTimeout(() => a.classList.remove('clicked'), DUR.clickNav);
      if (isMobile()) topGroup.classList.add('collapsed');
    });
  });

  new ResizeObserver(computeShifts).observe(nav);
  new ResizeObserver(computeShifts).observe(avatarWrap);
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { computeShifts(); if (!isMobile()) topGroup.classList.remove('collapsed'); });
  addEventListener('orientationchange', computeShifts);
  document.fonts?.ready.then(computeShifts);
  addEventListener('load', computeShifts);
  computeShifts();

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const resetToTop = () => { scrollTo(0, 0); state.t = 0; applyTransforms(); updateBackgroundByScroll(); };
  addEventListener('pageshow', resetToTop);
  addEventListener('load', resetToTop);

  (function () {
    const rails = [...$$('.work-rail')];
    if (!rails.length) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tracks = rails.map(rail => {
      const el = rail.querySelector('.rail-track');
      if (!el) return null;
      if (!el.dataset.marqueeDoubled) {
        [...el.children].forEach(n => el.appendChild(n.cloneNode(true)));
        el.dataset.marqueeDoubled = '1';
      }
      return { rail, el, x: 0, half: 0, duration: 20, paused: false, enabled: !reduce, speedMultiplier: 1 };
    }).filter(Boolean);

    const measure = () => tracks.forEach(t => t.half = t.el.scrollWidth / 2);
    measure();
    addEventListener('resize', measure);
    addEventListener('orientationchange', measure);
    $$('.rail-track img').forEach(img => { if (!img.complete) img.addEventListener('load', measure, { once: true }); });
    tracks.forEach(t => {
      t.rail.addEventListener('mouseenter', () => t.speedMultiplier = 0.25);
      t.rail.addEventListener('mouseleave', () => t.speedMultiplier = 1);
    });
    addEventListener('blur', () => tracks.forEach(t => t.paused = true));
    addEventListener('focus', () => tracks.forEach(t => t.paused = false));
    if (!tracks.some(t => t.enabled)) return;

    let last = performance.now();
    (function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      tracks.forEach(t => {
        if (!t.enabled || t.paused || !t.half) return;
        t.x -= (t.half / t.duration) * t.speedMultiplier * dt;
        if (t.x <= -t.half) t.x += t.half;
        t.el.style.transform = `translate3d(${t.x}px,0,0)`;
      });
      requestAnimationFrame(tick);
    })(performance.now());
  })();

  (function () {
    const els = [...$$('header[data-bg], section[data-bg]')];
    if (!els.length) return;
    const hexToRgb = hex => {
      const s = hex.replace('#', '');
      const b = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
      const n = parseInt(b, 16);
      return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 };
    };
    let segments = [];
    const measureSegments = () => {
      segments = els.map((el, i) => {
        const toEl = els[i + 1];
        return {
          start: el.offsetTop,
          end: toEl ? toEl.offsetTop : document.documentElement.scrollHeight - innerHeight,
          fromColor: hexToRgb(el.dataset.bg || '#fff'),
          toColor: hexToRgb(toEl?.dataset.bg || el.dataset.bg || '#fff')
        };
      });
    };
    const lerp = (a, b, t) => a + (b - a) * t;
    const lerpColor = (c1, c2, t) => ({
      r: Math.round(lerp(c1.r, c2.r, t)),
      g: Math.round(lerp(c1.g, c2.g, t)),
      b: Math.round(lerp(c1.b, c2.b, t))
    });
    window.updateBackgroundByScroll = () => {
      if (!segments.length) return;
      const y = scrollY;
      let seg = segments.find((s, i) => y >= s.start && (i === segments.length - 1 || y < segments[i + 1].start)) || segments[0];
      const span = Math.max(1, seg.end - seg.start);
      const t = Math.min(1, Math.max(0, (y - seg.start) / span));
      const c = lerpColor(seg.fromColor, seg.toColor, t);
      document.body.style.backgroundColor = `rgb(${c.r},${c.g},${c.b})`;
    };
    const doMeasure = () => { measureSegments(); updateBackgroundByScroll(); };
    document.fonts?.ready.then(doMeasure);
    addEventListener('load', doMeasure);
    addEventListener('resize', doMeasure);
    addEventListener('orientationchange', doMeasure);
    doMeasure();
  })();

  (function () {
    const obj = $('#eyes-object');
    if (!obj) return;

    obj.addEventListener('load', () => {
      try {
        const svgDoc = obj.contentDocument;
        if (!svgDoc) return;

        const CONFIG = { maxMoveX: 120, maxMoveY: 80, smoothing: 0.08 };
        const GYRO = { minBeta: 30, maxBeta: 110, baseBeta: 70, sensitivity: 30 };
        const centers = { left: { x: 240, y: 87 }, right: { x: 1146, y: 87 } };
        const els = {
          ringL: svgDoc.getElementById('ring-left'),
          ringR: svgDoc.getElementById('ring-right'),
          pupilL: svgDoc.getElementById('pupil-left'),
          pupilR: svgDoc.getElementById('pupil-right')
        };

        if (!els.ringL || !els.ringR || !els.pupilL || !els.pupilR) return;

        let curX = 0, curY = 0, tarX = 0, tarY = 0;
        let lastGamma = null, smoothGamma = 0, smoothBeta = GYRO.baseBeta;
        let animating = false;

        const render = () => {
          curX += (tarX - curX) * CONFIG.smoothing;
          curY += (tarY - curY) * CONFIG.smoothing;
          [['ringL', 'pupilL', 'left'], ['ringR', 'pupilR', 'right']].forEach(([r, p, s]) => {
            els[r].setAttribute('cx', centers[s].x + curX);
            els[r].setAttribute('cy', centers[s].y + curY);
            els[p].setAttribute('cx', centers[s].x + curX);
            els[p].setAttribute('cy', centers[s].y + curY);
          });
          if (Math.abs(tarX - curX) > 0.3 || Math.abs(tarY - curY) > 0.3) requestAnimationFrame(render);
          else animating = false;
        };

        const update = (dx, dy) => {
          tarX = dx; tarY = dy;
          if (!animating) { animating = true; requestAnimationFrame(render); }
        };

        if (isTouchDevice && 'DeviceOrientationEvent' in window) {
          const startGyro = () => {
            addEventListener('deviceorientation', e => {
              if (e.gamma === null || e.beta === null) return;

              if (lastGamma !== null && Math.abs(e.gamma - lastGamma) > 70) {
                lastGamma = e.gamma;
                return;
              }
              lastGamma = e.gamma;

              smoothGamma += (e.gamma - smoothGamma) * 0.15;
              smoothBeta += (e.beta - smoothBeta) * 0.15;

              const dx = Math.max(-1, Math.min(1, smoothGamma / GYRO.sensitivity)) * CONFIG.maxMoveX;
              const dy = (smoothBeta >= GYRO.minBeta && smoothBeta <= GYRO.maxBeta)
                ? Math.max(-1, Math.min(1, (smoothBeta - GYRO.baseBeta) / GYRO.sensitivity)) * CONFIG.maxMoveY
                : (smoothBeta < GYRO.minBeta ? -CONFIG.maxMoveY : CONFIG.maxMoveY);

              update(dx, dy);
            }, { passive: true });
          };

          const rp = DeviceOrientationEvent.requestPermission;
          if (typeof rp === 'function') {
            document.body.addEventListener('click', function once() {
              rp().then(s => { if (s === 'granted') startGyro(); });
              document.body.removeEventListener('click', once);
            });
          } else startGyro();
        } else {
          document.addEventListener('mousemove', e => {
            const dx = (e.clientX / innerWidth - 0.5) * 2 * CONFIG.maxMoveX;
            const dy = (e.clientY / innerHeight - 0.5) * 2 * CONFIG.maxMoveY;
            update(dx, dy);
          }, { passive: true });
        }
      } catch (e) {}
    });
  })();
})();