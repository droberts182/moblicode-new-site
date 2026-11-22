// Moblicode 3D devices: iPhones and iPads showing real app screens.
// Used by the hero (.stage) and every case study (.shot[data-devices]).
// Each scene can be dragged to spin. Falls back to the flat screenshots if WebGL or three.js is unavailable.
(function () {
  if (!window.THREE) return;
  const THREE = window.THREE;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FOV = 26, VIEW = 2 * Math.tan((FOV / 2) * Math.PI / 180); // visible height per unit of distance

  const finishes = {
    natural: { frame: 0xb9b4ab, back: 0xcfcac1 },
    blue:    { frame: 0x34405a, back: 0x26324a },
    black:   { frame: 0x2e2f33, back: 0x141518 },
    silver:  { frame: 0xc9cbd0, back: 0xd6d8dc },
  };

  // ---------- geometry helpers ----------
  function roundedRect(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  function flatRounded(w, h, r, segs) {
    const g = new THREE.ShapeGeometry(roundedRect(w, h, r), segs || 24);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
    uv.needsUpdate = true;
    return g;
  }

  // ---------- one scene per canvas ----------
  function mount(stage, canvas, opts) {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) { return null; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);

    // Studio environment for metal reflections (built in code, no HDR file)
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0x6b6f80, side: THREE.BackSide })));
    const panel = (w, h, x, y, z, c) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(8, 3, 0, 7, 3, 0xffffff);     // soft top key
    panel(3, 9, -8, 1, 4, 0xe9e4ff);    // left strip (cool)
    panel(3, 9, 8, 0, 3, 0xfff1e6);     // right strip (warm)
    panel(10, 2, 0, -6, 6, 0x9aa0b8);   // floor bounce
    scene.environment = pmrem.fromScene(env, 0.035).texture;

    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2, 4, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xb7a6ff, 0.6); rim.position.set(-4, 1, -3); scene.add(rim);
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    const loader = new THREE.TextureLoader();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    let needsRender = true;

    function makeDevice(d) {
      const tablet = d.kind === 'tablet';
      const f = finishes[d.finish] || finishes.natural;
      // screen size in world units
      const sh = tablet ? 2.0 / d.aspect : 1.40, sw = tablet ? 2.0 : 1.40 * d.aspect;
      const BORDER = tablet ? 0.085 : 0.034, DEPTH = tablet ? 0.07 : 0.082, BEVEL = tablet ? 0.016 : 0.018;
      const R = tablet ? 0.13 : 0.115, SR = tablet ? 0.06 : 0.085;
      const W = sw + BORDER * 2, H = sh + BORDER * 2;
      const g = new THREE.Group();

      // aluminium / titanium frame
      const body = new THREE.ExtrudeGeometry(roundedRect(W - BEVEL * 2, H - BEVEL * 2, R - BEVEL), {
        depth: DEPTH - BEVEL * 2, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 6, curveSegments: 32,
      });
      body.translate(0, 0, -(DEPTH - BEVEL * 2) / 2);
      g.add(new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: f.frame, metalness: 0.92, roughness: 0.28 })));

      const zf = DEPTH / 2 + 0.0008;
      const glass = new THREE.Mesh(flatRounded(W - 0.012, H - 0.012, R - 0.006),
        new THREE.MeshStandardMaterial({ color: 0x050507, metalness: 0.2, roughness: 0.15 }));
      glass.position.z = zf; g.add(glass);

      const tex = loader.load(d.src, () => { needsRender = true; kick(); });
      tex.encoding = THREE.sRGBEncoding; tex.anisotropy = maxAniso;
      const screen = new THREE.Mesh(flatRounded(sw, sh, SR, 32), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      screen.position.z = zf + 0.0006; g.add(screen);

      const sheen = new THREE.Mesh(flatRounded(sw, sh, SR, 32), new THREE.MeshPhysicalMaterial({
        color: 0x000000, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, clearcoat: 1, depthWrite: false,
      }));
      sheen.position.z = zf + 0.0012; g.add(sheen);

      const back = new THREE.Mesh(flatRounded(W - 0.012, H - 0.012, R - 0.006),
        new THREE.MeshStandardMaterial({ color: f.back, metalness: 0.35, roughness: 0.55 }));
      back.position.z = -zf; back.rotation.y = Math.PI; g.add(back);

      const ringMat = new THREE.MeshStandardMaterial({ color: f.frame, metalness: 0.95, roughness: 0.2 });
      const lensMat = new THREE.MeshStandardMaterial({ color: 0x0b0c14, metalness: 0.6, roughness: 0.08 });
      const btnMat = new THREE.MeshStandardMaterial({ color: f.frame, metalness: 0.9, roughness: 0.3 });

      if (tablet) {
        // single-lens camera on the back, near the top-left corner as seen from behind
        const bumpW = 0.2, bx = W / 2 - 0.1 - bumpW / 2, by = H / 2 - 0.1 - bumpW / 2;
        const bump = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRect(bumpW, bumpW, 0.06), { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 16 }),
          new THREE.MeshStandardMaterial({ color: f.back, metalness: 0.5, roughness: 0.35 }));
        bump.position.set(bx, by, -zf); bump.rotation.y = Math.PI; g.add(bump);
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.024, 40), ringMat);
        ring.rotation.x = Math.PI / 2; ring.position.set(bx, by, -zf - 0.024); g.add(ring);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 40), lensMat);
        lens.rotation.y = Math.PI; lens.position.set(bx, by, -zf - 0.0365); g.add(lens);
        // top button and volume buttons
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.03), btnMat); top.position.set(-W * 0.34, H / 2 + 0.004, 0); g.add(top);
        [0.26, 0.4].forEach((p) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.03), btnMat); b.position.set(W / 2 + 0.004, H * (0.5 - p), 0); g.add(b); });
      } else {
        // triple-lens camera plateau
        const bumpW = W * 0.47;
        const bump = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRect(bumpW, bumpW, 0.09), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3, curveSegments: 20 }),
          new THREE.MeshStandardMaterial({ color: f.back, metalness: 0.5, roughness: 0.35 }));
        const bx = W / 2 - 0.05 - bumpW / 2, by = H / 2 - 0.05 - bumpW / 2;
        bump.position.set(bx, by, -zf); bump.rotation.y = Math.PI; g.add(bump);
        const lr = bumpW * 0.21;
        [[-0.24, 0.24], [-0.24, -0.24], [0.26, 0]].forEach(([dx, dy]) => {
          const ring = new THREE.Mesh(new THREE.CylinderGeometry(lr, lr, 0.03, 40), ringMat);
          ring.rotation.x = Math.PI / 2; ring.position.set(bx - dx * bumpW, by + dy * bumpW, -zf - 0.03); g.add(ring);
          const lens = new THREE.Mesh(new THREE.CircleGeometry(lr * 0.72, 40), lensMat);
          lens.rotation.y = Math.PI; lens.position.set(bx - dx * bumpW, by + dy * bumpW, -zf - 0.0455); g.add(lens);
        });
        const btn = (len, x, y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.014, len, 0.04), btnMat); b.position.set(x, y, 0); g.add(b); };
        btn(0.07, -W / 2 - 0.004, H * 0.30);   // action button
        btn(0.13, -W / 2 - 0.004, H * 0.18);   // volume up
        btn(0.13, -W / 2 - 0.004, H * 0.07);   // volume down
        btn(0.19, W / 2 + 0.004, H * 0.17);    // side button
      }
      g.userData.height = H;
      return g;
    }

    const group = new THREE.Group();
    scene.add(group);
    const devices = opts.devices.map((d, i) => {
      const m = makeDevice(d);
      m.userData = Object.assign(m.userData, d, { index: i, phase: d.phase != null ? d.phase : i * 2.1, spinStart: -1 });
      group.add(m);
      return m;
    });

    // soft contact shadow
    const sc = document.createElement('canvas'); sc.width = sc.height = 128;
    const sg = sc.getContext('2d'), grad = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(30,15,80,0.35)'); grad.addColorStop(1, 'rgba(30,15,80,0)');
    sg.fillStyle = grad; sg.fillRect(0, 0, 128, 128);
    const tallest = Math.max.apply(null, devices.map((d) => d.userData.height));
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(opts.fit.w * 1.25, 1.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, opacity: 0.8 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, -tallest / 2 - 0.2, -0.1);
    scene.add(shadow);

    // interaction: pointer tilt + drag to spin (with momentum, then settles back to the front)
    let tiltX = 0, tiltY = 0, targetTiltX = 0, targetTiltY = 0;
    let dragYaw = 0, dragVel = 0, dragging = false, lastX = 0;
    const tilt = opts.tilt != null ? opts.tilt : 0.5;
    window.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      targetTiltY = ((e.clientX - (r.left + r.width / 2)) / window.innerWidth) * tilt;
      targetTiltX = ((e.clientY - (r.top + r.height / 2)) / window.innerHeight) * tilt * 0.5;
      if (dragging) { const dx = e.clientX - lastX; lastX = e.clientX; dragVel = dx * 0.012; dragYaw += dragVel; }
    }, { passive: true });
    canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; dragVel = 0; canvas.classList.add('dragging'); canvas.setPointerCapture(e.pointerId); kick(); });
    const endDrag = () => { dragging = false; canvas.classList.remove('dragging'); };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // sizing: pull the camera back until the scene's width and height both fit
    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const z = Math.max(opts.fit.h / VIEW, opts.fit.w / (VIEW * camera.aspect));
      camera.position.set(0, opts.camY != null ? opts.camY : 0.45, z);
      camera.lookAt(0, opts.lookY != null ? opts.lookY : -0.05, 0);
      camera.updateProjectionMatrix();
      needsRender = true; kick();
    }
    new ResizeObserver(resize).observe(canvas);

    // animation
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const INTRO = opts.intro === false ? 0 : 1.8, SPIN_EVERY = opts.spinEvery || 6.5, SPIN_TIME = 2.0;
    let visible = false, start = 0, raf = 0, nextSpin = INTRO + (opts.firstSpin || 2.5), spinTurn = opts.spinStartIndex || 0;

    function frame(now) {
      if (!start) start = now;
      const t = (now - start) / 1000;
      tiltX += (targetTiltX - tiltX) * 0.06; tiltY += (targetTiltY - tiltY) * 0.06;
      if (!dragging) { dragVel *= 0.94; dragYaw += dragVel; dragYaw *= 0.97; }
      group.rotation.set(tiltX, tiltY + dragYaw, 0);

      if (!reduceMotion && opts.spinEvery !== 0 && t > nextSpin) {
        devices[spinTurn % devices.length].userData.spinStart = t; spinTurn++; nextSpin = t + SPIN_EVERY;
      }
      devices.forEach((p) => {
        const u = p.userData;
        const k = reduceMotion || !INTRO ? 1 : ease(Math.min(1, Math.max(0, (t - u.index * 0.15) / INTRO)));
        let spin = 0;
        if (u.spinStart >= 0) { const s = (t - u.spinStart) / SPIN_TIME; if (s >= 1) u.spinStart = -1; else spin = easeInOut(s) * Math.PI * 2; }
        const sway = reduceMotion ? 0 : Math.sin(t * 0.55 + u.phase) * (u.kind === 'tablet' ? 0.1 : 0.16);
        const bob = reduceMotion ? 0 : Math.sin(t * 0.9 + u.phase) * 0.04;
        p.position.set(u.pos[0] * (0.6 + 0.4 * k), u.pos[1] + bob - (1 - k) * 1.2, u.pos[2]);
        p.rotation.set((reduceMotion ? 0 : Math.sin(t * 0.45 + u.phase) * 0.05) - (1 - k) * 0.5, u.ry + sway + spin + (1 - k) * Math.PI * 1.5, u.ry * -0.08);
      });
      renderer.render(scene, camera);
    }
    function loop() {
      raf = 0;
      if (!visible) return;
      frame(performance.now());
      if (!reduceMotion || dragging || Math.abs(dragVel) > 0.0005 || Math.abs(dragYaw) > 0.001 || Math.abs(targetTiltY - tiltY) > 0.001 || needsRender) {
        needsRender = false;
        raf = requestAnimationFrame(loop);
      }
    }
    function kick() { if (visible && !raf) raf = requestAnimationFrame(loop); }
    if (reduceMotion) window.addEventListener('pointermove', kick, { passive: true });

    new IntersectionObserver((es) => { visible = es[0].isIntersecting; kick(); }, { rootMargin: '100px' }).observe(stage);
    resize();
    frame(performance.now());
    stage.classList.add('is3d');
    return { scene, renderer };
  }

  // ---------- hero ----------
  const heroStage = document.querySelector('.stage');
  const heroCanvas = document.getElementById('phones3d');
  if (heroStage && heroCanvas) {
    mount(heroStage, heroCanvas, {
      fit: { w: 2.4, h: 2.49 }, camY: 0.55, tilt: 0.5, spinStartIndex: 2,
      devices: [
        { src: 'assets/screen-wellness-info.png?v=6', aspect: 1040 / 2256, finish: 'natural', pos: [-0.76, -0.06, -0.45], ry: 0.42, phase: 0.0 },
        { src: 'assets/screen-rfx.png?v=6',           aspect: 900 / 2017,  finish: 'black',   pos: [0.76, -0.12, -0.55],  ry: -0.42, phase: 2.1 },
        { src: 'assets/screen-mytsa.png?v=6',         aspect: 1100 / 2355, finish: 'blue',    pos: [0, 0.04, 0.25],       ry: 0.0,  phase: 4.2 },
      ],
    });
  }

  // ---------- case studies ----------
  document.querySelectorAll('.shot[data-devices]').forEach((shot, i) => {
    let devices;
    try { devices = JSON.parse(shot.dataset.devices); } catch (e) { return; }
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    shot.appendChild(canvas);
    const hint = document.createElement('span'); hint.className = 'drag-hint'; hint.textContent = 'Drag to spin';
    shot.appendChild(hint);
    const tablet = devices.some((d) => d.kind === 'tablet');
    mount(shot, canvas, {
      devices,
      fit: tablet ? { w: 2.75, h: 2.2 } : { w: 2.2, h: 2.05 },
      camY: 0.35, lookY: -0.02, tilt: 0.35,
      intro: false, spinEvery: 8, firstSpin: 2 + i * 1.3,
    });
  });
})();
