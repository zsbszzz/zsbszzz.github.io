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

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('show'); io.unobserve(e.target); } });
  }, { threshold: 0.2 });
  $$('.fade-in, .fade-in-eyes').forEach(el => io.observe(el));

  function computeShifts() {
    const vw = innerWidth, gapEdge = edgeGap(), g = getComputedStyle(topGroup);
    const groupGap = parseFloat(g.columnGap || g.gap) || 0;
    const avatarW = avatar.getBoundingClientRect().width, navW = nav.getBoundingClientRect().width;
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
      return { rail, el, x: 0, half: 0, duration: 20, paused: false, enabled: !reduce, speed: 1 };
    }).filter(Boolean);

    const measure = () => tracks.forEach(t => t.half = t.el.scrollWidth / 2);
    measure();
    addEventListener('resize', measure);
    addEventListener('orientationchange', measure);
    $$('.rail-track img').forEach(img => { if (!img.complete) img.addEventListener('load', measure, { once: true }); });
    tracks.forEach(t => {
      t.rail.addEventListener('mouseenter', () => t.speed = 0.25);
      t.rail.addEventListener('mouseleave', () => t.speed = 1);
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
        t.x -= (t.half / t.duration) * t.speed * dt;
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

    function init() {
      let svgDoc;
      try { svgDoc = obj.contentDocument; } catch (e) { return; }
      if (!svgDoc) return;

      const ringL = svgDoc.getElementById('ring-left');
      const ringR = svgDoc.getElementById('ring-right');
      const pupilL = svgDoc.getElementById('pupil-left');
      const pupilR = svgDoc.getElementById('pupil-right');
      if (!ringL || !ringR || !pupilL || !pupilR) return;

      const MAX_X = 120;       // 眼球最大水平偏移 (SVG 用户单位)
      const MAX_Y = 100;       // 眼球最大垂直偏移
      const TILT_RANGE = 30;   // 相对中立姿态倾斜多少度到达最大偏移
      const centers = { left: { x: 240, y: 87 }, right: { x: 1146, y: 87 } };
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

      // 目标 / 当前归一化偏移 (-1 ~ 1)，用 rAF 缓动让跟随更顺滑
      let tx = 0, ty = 0, cx = 0, cy = 0, running = false;
      const setTarget = (nx, ny) => {
        tx = clamp(nx, -1, 1);
        ty = clamp(ny, -1, 1);
        if (!running) { running = true; requestAnimationFrame(loop); }
      };
      function loop() {
        cx += (tx - cx) * 0.15;
        cy += (ty - cy) * 0.15;
        const dx = cx * MAX_X, dy = cy * MAX_Y;
        [ringL, pupilL].forEach(el => { el.setAttribute('cx', centers.left.x + dx); el.setAttribute('cy', centers.left.y + dy); });
        [ringR, pupilR].forEach(el => { el.setAttribute('cx', centers.right.x + dx); el.setAttribute('cy', centers.right.y + dy); });
        if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) requestAnimationFrame(loop);
        else running = false;
      }

      // 鼠标跟随（有指针的设备）——陀螺仪一旦收到数据就让位
      let gyroActive = false;
      addEventListener('mousemove', e => {
        if (gyroActive) return;
        setTarget((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2);
      }, { passive: true });

      // 重力 / 陀螺仪跟随（移动端）——用特性检测，不再依赖屏幕尺寸判断
      if ('DeviceOrientationEvent' in window) {
        let beta0 = null, gamma0 = null;   // 以首次读数为中立点
        const onOrient = e => {
          if (e.beta === null || e.gamma === null) return;
          gyroActive = true;
          if (beta0 === null) { beta0 = e.beta; gamma0 = e.gamma; }
          const g = e.gamma - gamma0, b = e.beta - beta0;
          const landscape = Math.abs(window.orientation) === 90;  // 横屏时两轴对调
          setTarget((landscape ? b : g) / TILT_RANGE, (landscape ? g : b) / TILT_RANGE);
        };
        const start = () => addEventListener('deviceorientation', onOrient, { passive: true });

        const rp = window.DeviceOrientationEvent.requestPermission;
        if (typeof rp === 'function') {
          // iOS 13+：权限须在用户手势中申请，未授权时下次交互再试
          const ask = () => rp().then(s => {
            if (s === 'granted') { start(); removeEventListener('click', ask); removeEventListener('touchend', ask); }
          }).catch(() => {});
          addEventListener('click', ask);
          addEventListener('touchend', ask);
        } else {
          start();   // Android 等：直接监听
        }
      }
    }

    // <object> 可能在脚本运行前就已加载完成
    if (obj.contentDocument && obj.contentDocument.getElementById('ring-left')) init();
    obj.addEventListener('load', init);
  })();
})();