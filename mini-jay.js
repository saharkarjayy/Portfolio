/* ============================================================================
   mini-jay.js — Mini Jay v2
   • 2in × 3in on-screen character (CSS inches; slightly smaller on phones)
   • Grab him with mouse/finger and drop him aside (he falls to the floor)
   • Scroll the page → a ladder appears and he climbs up / down with the scroll
   • Click/tap anywhere → he walks there (climbs the ladder if the spot is high),
     then points at it. Tap HIM → he waves.
   Needs: three.min.js r128 + GLTFLoader r128 (already in your page), jay.glb
   ========================================================================== */
(function () {
  'use strict';
  if (typeof THREE === 'undefined' || !THREE.GLTFLoader) return;

  /* ── TUNABLES ───────────────────────────────────────────────────────────── */
  const SIZE_DESKTOP = ['2in', '3in'];        // width, height
  const SIZE_MOBILE  = ['1.45in', '2.175in']; // used under 768px wide
  const WALK_SPEED = 4.4, CLIMB_SPEED = 3.4;  // px per frame @60fps
  const SCROLL_PERCH_HOLD = 2200;             // ms after last scroll before he climbs back down
  const CLICK_PERCH_HOLD  = 9000;             // ms he stays up high after a click-to-height
  const LINES = ['Hey! I\u2019m Jay 👋', 'Drag me aside! 🖐️', 'Scroll — I\u2019ll take the ladder 🪜', 'Click anywhere, I\u2019ll walk there 🚶', 'AWS + Kotlin = ❤️'];

  /* ── 0. KEEP HERO GLOW + GSAP INTRO (these lived in the old IIFE) ──────── */
  const grid = document.getElementById('cloud-grid-canvas');
  const gctx = grid ? grid.getContext('2d') : null;
  const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  function sizeGrid() { if (grid) { grid.width = grid.offsetWidth || innerWidth; grid.height = grid.offsetHeight || innerHeight; } }
  sizeGrid(); addEventListener('resize', sizeGrid);
  if (window.gsap && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
    tl.from('[data-headline]', { yPercent: 55, opacity: 0, duration: 1.25, stagger: 0.12 }, 0.15);
    tl.from('[data-fade]', { y: 20, opacity: 0, duration: 0.9, stagger: 0.07 }, 0.45);
  }

  /* ── 1. DOM + CSS ───────────────────────────────────────────────────────── */
  ['mini-jay-stage', 'mini-jay-nametag'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
  const style = document.createElement('style');
  style.textContent = `
  :root{--jw:${SIZE_DESKTOP[0]};--jh:${SIZE_DESKTOP[1]}}
  @media (max-width:767px){:root{--jw:${SIZE_MOBILE[0]};--jh:${SIZE_MOBILE[1]}}}
  #mini-jay-stage{position:fixed;left:0;top:0;width:var(--jw);height:var(--jh);z-index:35;pointer-events:none;will-change:transform;opacity:0;transition:opacity .4s}
  #mini-jay-stage.ready{opacity:1}
  #mini-jay-canvas{width:100%;height:100%;display:block;pointer-events:none}
  #jay-hit{position:absolute;inset:0;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab;
    clip-path:ellipse(36% 48% at 50% 52%);-webkit-tap-highlight-color:transparent}
  #jay-hit.grabbing{cursor:grabbing}
  #mini-jay-nametag{position:absolute;left:50%;top:-4px;transform:translate(-50%,-100%);white-space:nowrap;pointer-events:none;
    padding:4px 10px;border-radius:999px;background:rgba(56,189,248,.95);color:#020617;border:1px solid #fff;
    font:800 10px 'JetBrains Mono',monospace;box-shadow:0 6px 16px rgba(0,0,0,.3)}
  #jay-ladder{position:fixed;top:0;bottom:0;left:0;width:calc(var(--jw)*.5);margin-left:calc(var(--jw)*-.25);z-index:34;pointer-events:none;
    opacity:0;transition:opacity .35s;border-left:7px solid #b45309;border-right:7px solid #b45309;border-radius:4px;
    box-shadow:0 0 18px rgba(0,0,0,.35);--rung:0px}
  #jay-ladder.on{opacity:1}
  #jay-ladder::before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(to bottom,transparent 0,transparent 34px,#f59e0b 34px,#f59e0b 40px);background-position:0 var(--rung)}
  body.strict-cv-preview #mini-jay-stage,body.strict-cv-preview #jay-ladder{display:none!important}
  @media print{#mini-jay-stage,#jay-ladder{display:none!important}}`;
  document.head.appendChild(style);

  const stage = document.createElement('div');
  stage.id = 'mini-jay-stage';
  stage.innerHTML = '<canvas id="mini-jay-canvas"></canvas><div id="mini-jay-nametag"><span id="mini-jay-status">JAY • DRAG ME</span></div><div id="jay-hit" title="Drag me aside!"></div>';
  const ladder = document.createElement('div');
  ladder.id = 'jay-ladder';
  document.body.append(ladder, stage);
  const hit = stage.querySelector('#jay-hit');
  const statusEl = stage.querySelector('#mini-jay-status');

  /* ── 2. THREE.JS (orthographic → exact pixel framing of the 2×3 in box) ── */
  const renderer = new THREE.WebGLRenderer({ canvas: stage.querySelector('canvas'), alpha: true, antialias: true });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1e293b, 1.35));
  const key = new THREE.DirectionalLight(0x38bdf8, 1.1); key.position.set(2.5, 3.5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xf97316, 0.65); rim.position.set(-2.5, 2, -2); scene.add(rim);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
  camera.position.z = 6;
  const pivot = new THREE.Group(); scene.add(pivot);

  let BW = 192, BH = 288, AH = 1.82, PAD = 8;
  function fit() {
    BW = stage.offsetWidth || 192; BH = stage.offsetHeight || 288;
    renderer.setSize(BW, BH, false);
    const fh = AH * 1.08, fw = fh * BW / BH;
    camera.left = -fw / 2; camera.right = fw / 2; camera.top = AH * 1.05; camera.bottom = AH * 1.05 - fh;
    camera.updateProjectionMatrix();
    PAD = BH * (0.03 / 1.08); // feet sit ~3% above the box bottom
  }
  fit();

  /* ── 3. STATE ───────────────────────────────────────────────────────────── */
  const floorY = () => innerHeight - 8;                                   // feet y when standing
  const minY = () => Math.min(64 + BH + 30, floorY() - 70);               // highest feet y (head stays under header)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const S = { x: innerWidth - 150, y: floorY(), vx: 0, vy: 0, tx: null, ty: null, pt: { x: 0, y: 0 }, pending: false,
    mode: 'idle', dir: 1, yaw: 0, walk: 0, climb: 0, waveT: 0, pointT: 0, scrollT: 0, ds: 0, lastClimb: 0, returnAt: 0, lastDrag: 0 };
  let lastFloor = floorY(), sayT = 0, lineIdx = 0;

  function say(s, ms) {
    statusEl.textContent = s; clearTimeout(sayT);
    sayT = setTimeout(() => { statusEl.textContent = 'JAY • DRAG ME'; }, ms || 1800);
  }

  /* ── 4. LOAD jay.glb + RIG HELPERS ─────────────────────────────────────── */
  const NAMES = ['Spine', 'Spine2', 'Neck', 'Head', 'LeftEye', 'RightEye', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];
  const B = {}, restL = {}, restP = {}, restPi = {}, morphs = [];
  let avatar = null;

  const urls = ['./jay.glb', 'jay.glb', '/Portfolio/jay.glb', 'https://saharkarjayy.github.io/Portfolio/jay.glb', 'https://raw.githubusercontent.com/saharkarjayy/Portfolio/main/jay.glb'];
  const loader = new THREE.GLTFLoader();
  (function load(i) { if (i < urls.length) loader.load(urls[i], onLoad, undefined, () => load(i + 1)); })(0);

  function onLoad(g) {
    avatar = g.scene;
    const box = new THREE.Box3().setFromObject(avatar);
    AH = box.max.y - box.min.y;
    avatar.position.y = -box.min.y;               // feet exactly on y = 0
    pivot.add(avatar);
    avatar.traverse(n => {
      if (n.isMesh) { n.frustumCulled = false; if (n.morphTargetDictionary && n.morphTargetInfluences) morphs.push(n); }
      if (n.isBone && NAMES.includes(n.name)) B[n.name] = n;
    });
    avatar.updateMatrixWorld(true);
    NAMES.forEach(k => {
      if (!B[k]) return;
      restL[k] = B[k].quaternion.clone();
      restP[k] = B[k].parent.getWorldQuaternion(new THREE.Quaternion());
      restPi[k] = restP[k].clone().invert();
    });
    fit();
    stage.classList.add('ready');
    say('JAY • HEY! 👋', 2500); S.waveT = 110;
  }

  // Rotate bone by an Euler given in AVATAR space (x = his left/right axis, y = up, z = forward),
  // layered on top of the T-pose rest rotation. T-pose arms along ±X, legs along −Y.
  const _R = new THREE.Quaternion(), _T = new THREE.Quaternion(), _E = new THREE.Euler();
  function applyPose(k, v, a) {
    const b = B[k]; if (!b || !restL[k]) return;
    _R.setFromEuler(_E.set(v[0], v[1], v[2], 'XYZ'));
    _T.copy(restPi[k]).multiply(_R).multiply(restP[k]).multiply(restL[k]);
    b.quaternion.slerp(_T, a);
  }

  /* ── 5. POINTER: GRAB & THROW ──────────────────────────────────────────── */
  let grab = null;
  addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });

  hit.addEventListener('pointerdown', e => {
    e.preventDefault();
    hit.setPointerCapture(e.pointerId); hit.classList.add('grabbing');
    grab = { ox: e.clientX - S.x, oy: e.clientY - S.y, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, lt: performance.now(), vx: 0, vy: 0, moved: false };
    S.tx = S.ty = null; S.pending = false; S.returnAt = 0; S.pointT = 0; S.waveT = 0;
  });
  hit.addEventListener('pointermove', e => {
    if (!grab) return;
    const now = performance.now(), dt = Math.max(1, now - grab.lt);
    grab.vx = 0.75 * grab.vx + 0.25 * (e.clientX - grab.lx) / dt * 16;
    grab.vy = 0.75 * grab.vy + 0.25 * (e.clientY - grab.ly) / dt * 16;
    grab.lx = e.clientX; grab.ly = e.clientY; grab.lt = now;
    if (!grab.moved && Math.hypot(e.clientX - grab.sx, e.clientY - grab.sy) > 5) { grab.moved = true; S.mode = 'drag'; say('Whoa! Put me down 😅', 1600); }
    if (grab.moved) {
      S.x = clamp(e.clientX - grab.ox, BW * 0.3, innerWidth - BW * 0.3);
      S.y = clamp(e.clientY - grab.oy, BH + 4, floorY());
      S.vx = grab.vx;
    }
  });
  function release() {
    if (!grab) return;
    const g = grab; grab = null; hit.classList.remove('grabbing'); S.lastDrag = performance.now();
    if (!g.moved) { S.mode = 'idle'; S.waveT = 100; say(LINES[lineIdx++ % LINES.length], 2200); return; } // tap = wave
    S.vx = clamp(g.vx, -28, 28); S.vy = clamp(g.vy, -28, 28); S.mode = 'fall';
  }
  hit.addEventListener('pointerup', release);
  hit.addEventListener('pointercancel', release);

  /* ── 6. CLICK / TAP ANYWHERE → WALK THERE ──────────────────────────────── */
  addEventListener('click', e => {
    if (performance.now() - S.lastDrag < 300 || S.mode === 'drag' || S.mode === 'fall' || !avatar) return;
    if (e.target.closest('#mini-jay-stage,.sticky-note,#note-modal,#mobile-notes-header,#sticky-notes-layer')) return;
    if (document.body.classList.contains('strict-cv-preview') || document.body.classList.contains('mobile-notes-open')) return;
    const el = e.target.closest('a,button,input,textarea,select,label,[onclick],[role="button"]');
    let tx = e.clientX;
    if (el) tx += (S.x <= e.clientX ? -1 : 1) * BW * 0.62;              // stand BESIDE buttons/links, don't hide them
    S.tx = clamp(tx, BW * 0.3, innerWidth - BW * 0.3);
    const fl = floorY(), want = e.clientY + BH * 0.45;                   // body centred on the click height
    S.ty = want > fl - BH * 0.25 ? fl : clamp(want, minY(), fl);        // high click → he'll use the ladder
    S.pt = { x: e.clientX, y: e.clientY }; S.pending = true; S.returnAt = 0; S.waveT = 0;
    const label = el ? (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 16) : '';
    say('JAY • → ' + (label || 'HERE').toUpperCase(), 2200);
  });

  /* ── 7. SCROLL → LADDER ────────────────────────────────────────────────── */
  let lastSY = scrollY;
  addEventListener('scroll', () => {
    const ds = scrollY - lastSY; lastSY = scrollY;
    ladder.style.setProperty('--rung', (-scrollY) + 'px');              // rungs are glued to the page
    if (S.mode === 'drag' || S.mode === 'fall' || !avatar) return;
    S.ds += ds; S.scrollT = performance.now();
    if (S.tx == null && S.ty == null && S.y >= floorY() - 4) {          // on the floor → go grab the ladder
      const fl = floorY(), mn = minY();
      S.ty = mn + (fl - mn) * 0.45; S.pointT = 0; S.waveT = 0;
      say('JAY • 🪜 CLIMBING', 2400);
    }
    if (S.y < floorY() - 4 || S.ty != null) S.returnAt = Math.max(S.returnAt, S.scrollT + SCROLL_PERCH_HOLD);
  }, { passive: true });

  addEventListener('resize', () => {
    const nf = floorY(); if (S.y >= lastFloor - 2) S.y = nf; lastFloor = nf;
    S.y = Math.min(S.y, nf); S.x = clamp(S.x, BW * 0.3, innerWidth - BW * 0.3); fit();
  });

  /* ── 8. MAIN LOOP ──────────────────────────────────────────────────────── */
  let last = performance.now();
  let ladderWas = false;

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(2.5, (now - last) / 16.667); last = now;
    const t = now / 1000;

    // hero glow (was in the old script)
    if (gctx && grid && grid.width) {
      const w = grid.width, h = grid.height, gx = w * (0.5 + ((mouse.x / innerWidth) - 0.5) * 0.5), gy = h * (0.45 + ((mouse.y / innerHeight) - 0.5) * 0.5);
      gctx.clearRect(0, 0, w, h);
      const r = gctx.createRadialGradient(gx, gy, 20, gx, gy, Math.max(w, h) * 0.55);
      r.addColorStop(0, 'rgba(56,189,248,.16)'); r.addColorStop(0.5, 'rgba(79,70,229,.07)'); r.addColorStop(1, 'rgba(5,5,5,0)');
      gctx.fillStyle = r; gctx.fillRect(0, 0, w, h);
    }
    if (!avatar || document.body.classList.contains('strict-cv-preview')) return;

    const fl = floorY();
    const dsum = S.ds; S.ds = 0;
    let walking = false, dyMove = 0;

    /* --- movement --------------------------------------------------------- */
    if (S.mode === 'fall') {
      S.vy += 0.9 * dt; S.x += S.vx * dt; S.y += S.vy * dt; S.vx *= 0.985;
      if (S.x < BW * 0.3 || S.x > innerWidth - BW * 0.3) { S.x = clamp(S.x, BW * 0.3, innerWidth - BW * 0.3); S.vx *= -0.5; }
      if (S.y < BH + 4) { S.y = BH + 4; S.vy = Math.abs(S.vy) * 0.3; }
      if (S.y >= fl) {
        S.y = fl;
        if (S.vy > 6) { S.vy *= -0.28; S.vx *= 0.6; }
        else { S.vy = S.vx = 0; S.mode = 'idle'; S.waveT = 70; say('JAY • LANDED 😎', 1800); }
      }
    } else if (S.mode !== 'drag') {
      if (S.returnAt && now > S.returnAt && S.tx == null && S.ty == null) { S.ty = fl; S.returnAt = 0; }
      const needX = S.tx != null && Math.abs(S.tx - S.x) > 3;
      const goalY = needX ? fl : (S.ty != null ? S.ty : S.y);            // must be on the floor to walk
      const dy = goalY - S.y;
      if (Math.abs(dy) > 1.5) { dyMove = Math.sign(dy) * Math.min(Math.abs(dy), CLIMB_SPEED * dt); S.y += dyMove; }
      else if (needX) {
        const dx = S.tx - S.x; S.dir = Math.sign(dx); walking = true;
        S.x += S.dir * Math.min(Math.abs(dx), WALK_SPEED * dt); S.walk += 0.22 * dt;
      } else {
        S.y = goalY; S.tx = S.ty = null;
        if (S.pending) { S.pending = false; S.pointT = 170; if (S.y < fl - 4) S.returnAt = now + CLICK_PERCH_HOLD; }
      }
    }
    S.waveT = Math.max(0, S.waveT - dt); S.pointT = Math.max(0, S.pointT - dt);

    /* --- pose selection --------------------------------------------------- */
    const onLadder = S.y < fl - 4 && S.mode !== 'drag' && S.mode !== 'fall';
    const relUp = -dyMove - (onLadder ? dsum : 0);                        // climbing speed relative to the rungs
    if (Math.abs(relUp) > 0.25 && (onLadder || dyMove)) { S.lastClimb = now; S.climb += clamp(relUp, -14, 14) * 0.07; }
    const climbActive = now - S.lastClimb < 650;
    const held = S.mode === 'drag' || S.mode === 'fall';
    const pose = held ? 'drag' : walking ? 'walk' : (onLadder || dyMove) ? (climbActive ? 'climb' : 'hang') : 'idle';

    const ladderOn = pose === 'climb' || pose === 'hang';
    if (ladderOn && !ladderWas) ladder.style.left = S.x + 'px';
    if (ladderOn !== ladderWas) ladder.classList.toggle('on', ladderOn);
    ladderWas = ladderOn;
    ladder.style.setProperty('--rung', (-scrollY) + 'px');

    /* --- body yaw --------------------------------------------------------- */
    const vx = S.pt.x - S.x, vy = -(S.pt.y - (S.y - BH * 0.62));          // vector to click point (screen-up positive)
    let yawT = 0;
    if (pose === 'walk') yawT = S.dir * 1.25;
    else if (pose === 'climb') yawT = Math.PI;
    else if (pose === 'idle' || pose === 'hang') yawT = S.pointT > 0 ? clamp(vx / 600, -0.5, 0.5) : clamp((mouse.x - S.x) / 900, -0.4, 0.4);
    const d = (((yawT - S.yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    S.yaw += d * Math.min(1, 0.14 * dt);
    pivot.rotation.y = S.yaw;
    const tiltT = held ? clamp(-S.vx * 0.02, -0.4, 0.4) : 0;
    pivot.rotation.z += (tiltT - pivot.rotation.z) * 0.15;
    pivot.position.y = pose === 'walk' ? Math.abs(Math.sin(S.walk)) * 0.025 : S.waveT > 0 ? Math.abs(Math.sin(t * 7)) * 0.05 : 0;

    /* --- bone targets (avatar space) ------------------------------------- */
    const P = {}; NAMES.forEach(n => { P[n] = [0, 0, 0]; });
    P.LeftArm = [0, 0, -1.3]; P.RightArm = [0, 0, 1.3];                 // relaxed arms (T-pose lowered)
    const gazeYaw = clamp((mouse.x - S.x) / 450, -1, 1) * 0.6, gazePitch = clamp((mouse.y - (S.y - BH * 0.85)) / 450, -1, 1) * 0.42;
    const gaze = () => {
      P.Head = [gazePitch * 0.55, gazeYaw * 0.55, 0]; P.Neck = [gazePitch * 0.3, gazeYaw * 0.3, 0];
      P.Spine2 = [gazePitch * 0.08, gazeYaw * 0.12, 0]; P.LeftEye = P.RightEye = [gazePitch * 0.4, gazeYaw * 0.45, 0];
    };
    const sideL = S.pt.x >= S.x;                                         // point with the arm on the target's side
    const pointArm = () => {
      if (sideL) P.LeftArm = [0, 0, clamp(Math.atan2(vy, vx), -0.7, 1.5)];
      else P.RightArm = [0, 0, clamp(Math.atan2(-vy, -vx), -1.5, 0.7)];
    };

    if (pose === 'walk') {
      const s = Math.sin(S.walk), c = Math.cos(S.walk);
      P.LeftUpLeg = [s * 0.6, 0, 0]; P.RightUpLeg = [-s * 0.6, 0, 0];
      P.LeftLeg = [0.8 * Math.max(0, -c), 0, 0]; P.RightLeg = [0.8 * Math.max(0, c), 0, 0];
      P.LeftArm = [-s * 0.5, 0, -1.3]; P.RightArm = [s * 0.5, 0, 1.3];
      P.Spine = [0.05, 0, 0];
    } else if (pose === 'climb') {
      const a = Math.sin(S.climb), b = Math.sin(S.climb + Math.PI), la = (1 + a) / 2, lb = (1 + b) / 2;
      P.LeftArm = [-2.55 - 0.45 * a, 0, -0.3]; P.RightArm = [-2.55 - 0.45 * b, 0, 0.3];   // hands up on the rungs
      P.LeftUpLeg = [-0.15 - 0.8 * la, 0, 0]; P.LeftLeg = [0.2 + 0.9 * la, 0, 0];
      P.RightUpLeg = [-0.15 - 0.8 * lb, 0, 0]; P.RightLeg = [0.2 + 0.9 * lb, 0, 0];
      P.Spine = [0.08, 0, 0]; P.Head = [-0.15, 0, 0];
      pivot.position.y = Math.abs(Math.sin(S.climb * 0.5)) * 0.012;
    } else if (pose === 'hang') {                                         // hanging on the ladder, facing you
      const sw = Math.sin(t * 1.6) * 0.05;
      P.LeftArm = [0, 0, 1.15]; P.RightArm = [0, 0, -1.15];
      P.LeftUpLeg = [-0.25 + sw, 0, 0.05]; P.LeftLeg = [0.45, 0, 0]; P.RightUpLeg = [-0.5 - sw, 0, -0.05]; P.RightLeg = [0.7, 0, 0];
      if (S.waveT > 0) P.RightArm = [0, 0, -1.95 + 0.3 * Math.sin(t * 14)];
      else if (S.pointT > 0) { if (sideL) P.LeftArm = [0, 0, clamp(Math.atan2(vy, vx), -0.7, 1.5)]; else P.RightArm = [0, 0, clamp(Math.atan2(-vy, -vx), -1.5, 0.7)]; }
      gaze();
    } else if (pose === 'drag') {                                         // being carried / thrown
      const w = t * 6;
      P.LeftArm = [0, 0, 0.9 + 0.35 * Math.sin(w)]; P.RightArm = [0, 0, -0.9 - 0.35 * Math.sin(w + 1.3)];
      P.LeftUpLeg = [0.35 * Math.sin(t * 5), 0, 0.08]; P.RightUpLeg = [-0.35 * Math.sin(t * 5), 0, -0.08];
      P.LeftLeg = [0.3 + 0.3 * Math.max(0, Math.sin(t * 5 + 1)), 0, 0]; P.RightLeg = [0.3 + 0.3 * Math.max(0, Math.sin(t * 5 + 4)), 0, 0];
      P.Head = [-0.25, 0, 0]; P.Spine = [0.04, 0, 0];
    } else {                                                              // idle on the floor
      P.Spine = [0.02 * Math.sin(t * 1.6), 0, 0];
      gaze();
      if (S.waveT > 0) { P.RightArm = [0, 0, -1.95 + 0.3 * Math.sin(t * 14)]; P.Head = [0, 0, 0.1]; }
      else if (S.pointT > 0) pointArm();
    }
    const a = Math.min(1, 0.25 * dt);
    NAMES.forEach(k => applyPose(k, P[k], a));

    /* --- face: smile / jaw / blink --------------------------------------- */
    const smile = (S.waveT > 0 || held) ? 0.75 : 0.32, jaw = held ? 0.35 : 0;
    const bc = t % 4.5, blink = bc > 4.3 ? Math.sin((bc - 4.3) / 0.2 * Math.PI) : 0;
    morphs.forEach(m => {
      const dct = m.morphTargetDictionary, inf = m.morphTargetInfluences;
      const set = (n, v, k) => { if (dct[n] !== undefined) inf[dct[n]] += (v - inf[dct[n]]) * (k || 0.2); };
      set('mouthSmileLeft', smile); set('mouthSmileRight', smile); set('jawOpen', jaw);
      set('eyeBlinkLeft', blink, 0.8); set('eyeBlinkRight', blink, 0.8);
    });

    /* --- place the 2×3 in box so his feet are at (S.x, S.y) --------------- */
    stage.style.transform = `translate3d(${(S.x - BW / 2).toFixed(1)}px,${(S.y - BH + PAD).toFixed(1)}px,0)`;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
})();
