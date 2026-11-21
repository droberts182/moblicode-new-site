// Moblicode hero: three 3D iPhones showing real app screens.
// Falls back to the flat screenshots if WebGL or three.js is unavailable.
(function () {
  const stage = document.querySelector('.stage');
  const canvas = document.getElementById('phones3d');
  if (!stage || !canvas || !window.THREE) return;
  const THREE = window.THREE;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return; }

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  const CAM_Z = 5.4;
  camera.position.set(0, 0.55, CAM_Z);
  camera.lookAt(0, -0.05, 0);

  // ---- Studio environment for metal reflections (built in code, no HDR file) ----
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0x6b6f80, side: THREE.BackSide })));
  const panel = (w, h, x, y, z, ry, c) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); if (ry) m.rotation.z = ry; env.add(m);
  };
  panel(8, 3, 0, 7, 3, 0, 0xffffff);      // soft top key
  panel(3, 9, -8, 1, 4, 0, 0xe9e4ff);     // left strip (cool)
  panel(3, 9, 8, 0, 3, 0, 0xfff1e6);      // right strip (warm)
  panel(10, 2, 0, -6, 6, 0, 0x9aa0b8);    // floor bounce
  scene.environment = pmrem.fromScene(env, 0.035).texture;

  const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xb7a6ff, 0.6); rim.position.set(-4, 1, -3); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  // ---- Geometry helpers ----
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

  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const DEPTH = 0.082, BEVEL = 0.018, BORDER = 0.034, SCREEN_H = 1.40;

  const finishes = {
    natural: { frame: 0xb9b4ab, back: 0xcfcac1 },
    blue:    { frame: 0x34405a, back: 0x26324a },
    black:   { frame: 0x2e2f33, back: 0x141518 },
  };

  function makePhone(src, aspect, finishName) {
    const f = finishes[finishName];
    const sw = SCREEN_H * aspect, sh = SCREEN_H;
    const W = sw + BORDER * 2, H = sh + BORDER * 2, R = 0.115;
    const phone = new THREE.Group();

    // Titanium frame
    const body = new THREE.ExtrudeGeometry(roundedRect(W - BEVEL * 2, H - BEVEL * 2, R - BEVEL), {
      depth: DEPTH - BEVEL * 2, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 6, curveSegments: 32,
    });
    body.translate(0, 0, -(DEPTH - BEVEL * 2) / 2);
    phone.add(new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: f.frame, metalness: 0.92, roughness: 0.28 })));

    const zf = DEPTH / 2 + 0.0008;
    // Black glass front
    const glass = new THREE.Mesh(flatRounded(W - 0.012, H - 0.012, R - 0.006),
      new THREE.MeshStandardMaterial({ color: 0x050507, metalness: 0.2, roughness: 0.15 }));
    glass.position.z = zf; phone.add(glass);

    // Screen with the app screenshot
    const tex = loader.load(src, () => { needsRender = true; });
    tex.encoding = THREE.sRGBEncoding; tex.anisotropy = maxAniso;
    const screen = new THREE.Mesh(flatRounded(sw, sh, 0.085, 32), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    screen.position.z = zf + 0.0006; phone.add(screen);

    // Glass sheen over the screen (catches the studio highlights)
    const sheen = new THREE.Mesh(flatRounded(sw, sh, 0.085, 32), new THREE.MeshPhysicalMaterial({
      color: 0x000000, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, clearcoat: 1, depthWrite: false,
    }));
    sheen.position.z = zf + 0.0012; phone.add(sheen);

    // Frosted back glass
    const back = new THREE.Mesh(flatRounded(W - 0.012, H - 0.012, R - 0.006),
      new THREE.MeshStandardMaterial({ color: f.back, metalness: 0.35, roughness: 0.55 }));
    back.position.z = -zf; back.rotation.y = Math.PI; phone.add(back);

    // Camera plateau and lenses (top-left when viewed from behind)
    const bumpW = W * 0.47;
    const bumpGeo = new THREE.ExtrudeGeometry(roundedRect(bumpW, bumpW, 0.09), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3, curveSegments: 20 });
    const bump = new THREE.Mesh(bumpGeo, new THREE.MeshStandardMaterial({ color: f.back, metalness: 0.5, roughness: 0.35 }));
    const bx = W / 2 - 0.05 - bumpW / 2, by = H / 2 - 0.05 - bumpW / 2;
    bump.position.set(bx, by, -zf); bump.rotation.y = Math.PI; phone.add(bump);
    const ringMat = new THREE.MeshStandardMaterial({ color: f.frame, metalness: 0.95, roughness: 0.2 });
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x0b0c14, metalness: 0.6, roughness: 0.08 });
    const lr = bumpW * 0.21;
    [[-0.24, 0.24], [-0.24, -0.24], [0.26, 0]].forEach(([dx, dy]) => {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(lr, lr, 0.03, 40), ringMat);
      ring.rotation.x = Math.PI / 2; ring.position.set(bx + dx * bumpW * -1, by + dy * bumpW, -zf - 0.03); phone.add(ring);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(lr * 0.72, 40), lensMat);
      lens.rotation.y = Math.PI; lens.position.set(bx + dx * bumpW * -1, by + dy * bumpW, -zf - 0.0455); phone.add(lens);
    });

    // Side buttons
    const btnMat = new THREE.MeshStandardMaterial({ color: f.frame, metalness: 0.9, roughness: 0.3 });
    const btn = (len, x, y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.014, len, 0.04), btnMat); b.position.set(x, y, 0); phone.add(b); };
    btn(0.07, -W / 2 - 0.004, H * 0.30);   // action button
    btn(0.13, -W / 2 - 0.004, H * 0.18);   // volume up
    btn(0.13, -W / 2 - 0.004, H * 0.07);   // volume down
    btn(0.19, W / 2 + 0.004, H * 0.17);    // side button

    return phone;
  }

  const group = new THREE.Group();
  scene.add(group);

  const layout = [
    { src: 'assets/screen-wellness-info.png', aspect: 520 / 1128, finish: 'natural', pos: [-0.76, -0.06, -0.45], ry: 0.42, phase: 0.0 },
    { src: 'assets/screen-rfx.png',      aspect: 404 / 905,  finish: 'black',   pos: [0.76, -0.12, -0.55],  ry: -0.42, phase: 2.1 },
    { src: 'assets/screen-mytsa.png',    aspect: 554 / 1186, finish: 'blue',    pos: [0, 0.04, 0.25],       ry: 0.0,  phase: 4.2 },
  ];
  const phones = layout.map((l, i) => {
    const p = makePhone(l.src, l.aspect, l.finish);
    p.userData = Object.assign({}, l, { index: i, spin: 0, spinStart: -1 });
    group.add(p);
    return p;
  });

  // Soft contact shadow under the phones
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const sg = sc.getContext('2d'), grad = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(30,15,80,0.35)'); grad.addColorStop(1, 'rgba(30,15,80,0)');
  sg.fillStyle = grad; sg.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, opacity: 0.8 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, -0.95, -0.1);
  scene.add(shadow);

  // ---- Interaction: pointer tilt + drag to spin ----
  let tiltX = 0, tiltY = 0, targetTiltX = 0, targetTiltY = 0;
  let dragYaw = 0, dragVel = 0, dragging = false, lastX = 0;
  window.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    targetTiltY = ((e.clientX - (r.left + r.width / 2)) / window.innerWidth) * 0.5;
    targetTiltX = ((e.clientY - (r.top + r.height / 2)) / window.innerHeight) * 0.25;
    if (dragging) { const dx = e.clientX - lastX; lastX = e.clientX; dragVel = dx * 0.012; dragYaw += dragVel; }
  }, { passive: true });
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; dragVel = 0; canvas.classList.add('dragging'); canvas.setPointerCapture(e.pointerId); });
  const endDrag = () => { dragging = false; canvas.classList.remove('dragging'); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ---- Sizing ----
  let needsRender = true;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep all three phones in frame on narrow screens
    camera.position.z = camera.aspect < 1.05 ? CAM_Z * 1.05 / Math.max(camera.aspect, 0.7) : CAM_Z;
    camera.updateProjectionMatrix();
    needsRender = true;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // ---- Animation ----
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const INTRO = 1.8, SPIN_EVERY = 6.5, SPIN_TIME = 2.0;
  let visible = true, start = performance.now(), raf = 0, nextSpin = INTRO + 2.5, spinTurn = 2;

  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible && !raf) loop(); }).observe(stage);

  function frame(now) {
    const t = (now - start) / 1000;
    tiltX += (targetTiltX - tiltX) * 0.06; tiltY += (targetTiltY - tiltY) * 0.06;
    if (!dragging) { dragVel *= 0.94; dragYaw += dragVel; dragYaw *= 0.97; }
    group.rotation.set(tiltX, tiltY + dragYaw, 0);

    if (!reduceMotion && t > nextSpin) {             // showcase: one phone turns all the way around
      const p = phones[spinTurn % phones.length]; p.userData.spinStart = t; spinTurn++; nextSpin = t + SPIN_EVERY;
    }

    phones.forEach((p) => {
      const u = p.userData;
      const k = reduceMotion ? 1 : ease(Math.min(1, Math.max(0, (t - u.index * 0.15) / INTRO)));
      let spin = 0;
      if (u.spinStart >= 0) {
        const s = (t - u.spinStart) / SPIN_TIME;
        if (s >= 1) u.spinStart = -1; else spin = easeInOut(s) * Math.PI * 2;
      }
      const sway = reduceMotion ? 0 : Math.sin(t * 0.55 + u.phase) * 0.16;
      const bob = reduceMotion ? 0 : Math.sin(t * 0.9 + u.phase) * 0.045;
      p.position.set(u.pos[0] * (0.6 + 0.4 * k), u.pos[1] + bob - (1 - k) * 1.2, u.pos[2]);
      p.rotation.set(
        (reduceMotion ? 0 : Math.sin(t * 0.45 + u.phase) * 0.05) - (1 - k) * 0.5,
        u.ry + sway + spin + (1 - k) * Math.PI * 1.5,
        u.ry * -0.08
      );
    });
    renderer.render(scene, camera);
  }

  function loop() {
    raf = 0;
    if (!visible) return;
    frame(performance.now());
    if (!reduceMotion || dragging || Math.abs(dragVel) > 0.0005 || Math.abs(targetTiltY - tiltY) > 0.001 || needsRender) {
      needsRender = false;
      raf = requestAnimationFrame(loop);
    }
  }
  if (reduceMotion) window.addEventListener('pointermove', () => { if (!raf) loop(); }, { passive: true });

  frame(performance.now());
  stage.classList.add('is3d');
  loop();
})();
