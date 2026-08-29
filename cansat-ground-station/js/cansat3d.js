/* ============================================================
   CanSat3D — interactive real-time 3D model (Three.js, WebGL).
   Procedurally built CanSat (soda-can satellite) with antenna,
   blinking beacon LED, deployable swaying parachute, clouds,
   stars, terrain — camera follows the flight; drag to orbit,
   scroll to zoom. Degrades gracefully if Three.js is missing.
   ============================================================ */
"use strict";

const ALT_SCALE = 0.5; // world units per metre of altitude

class CanSat3D {
  constructor(canvas, wrapEl) {
    this.ok = typeof THREE !== "undefined";
    this.canvas = canvas;
    this.wrap = wrapEl;
    if (!this.ok) return;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a2038, 60, 700);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    this.orbit = { yaw: 0.7, pitch: 0.34, dist: 10 };
    this._bindControls();

    /* ---- lights ---- */
    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x1c3a24, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3d6, 1.15);
    sun.position.set(60, 120, 40);
    this.scene.add(sun);

    this._buildGround();
    this._buildClouds();
    this._buildStars();
    this._buildCanSat();
    this._buildChute();

    this.chuteScale = 0;
    this.t = 0;
    this._resize();
    if (window.ResizeObserver) new ResizeObserver(() => this._resize()).observe(canvas);
  }

  /* ---------------- construction ---------------- */

  _canvasTexture(w, h, painter) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    painter(c.getContext("2d"), w, h);
    const tx = new THREE.CanvasTexture(c);
    tx.anisotropy = 4;
    return tx;
  }

  _buildGround() {
    /* terrain disc with painted fields + landing zone rings */
    const tex = this._canvasTexture(1024, 1024, (g, w, h) => {
      g.fillStyle = "#1c3a24"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        const fw = 40 + Math.random() * 140, fh = 30 + Math.random() * 120;
        const shades = ["#234a2c", "#2c5a34", "#1e4527", "#3a5a26", "#28502e"];
        g.fillStyle = shades[(Math.random() * shades.length) | 0];
        g.fillRect(x, y, fw, fh);
        g.strokeStyle = "rgba(10,25,14,.8)"; g.strokeRect(x, y, fw, fh);
      }
    });
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(800, 48),
      new THREE.MeshLambertMaterial({ map: tex })
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(800, 40, 0x2dd4bf, 0x14532d);
    grid.material.transparent = true;
    grid.material.opacity = 0.14;
    grid.position.y = 0.05;
    this.scene.add(grid);

    /* small, crisp launch pad right under the CanSat */
    const padTex = this._canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = "#3f4a5c"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#fbbf24"; g.lineWidth = 7;
      g.beginPath(); g.arc(w / 2, h / 2, 104, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(w / 2, h / 2, 62, 0, Math.PI * 2); g.stroke();
      g.fillStyle = "#fbbf24";
      g.font = "900 64px Arial"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("H", w / 2, h / 2 + 4);
      /* hazard corners */
      g.fillStyle = "#e5e7eb";
      for (const [cx, cy] of [[26, 26], [w - 26, 26], [26, h - 26], [w - 26, h - 26]])
        g.fillRect(cx - 12, cy - 12, 24, 24);
    });
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 40),
      new THREE.MeshLambertMaterial({ map: padTex })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.08;
    this.scene.add(pad);
  }

  _buildClouds() {
    const tex = this._canvasTexture(128, 128, (g, w, h) => {
      const rg = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      rg.addColorStop(0, "rgba(235,242,255,.9)");
      rg.addColorStop(0.55, "rgba(220,232,250,.4)");
      rg.addColorStop(1, "rgba(220,232,250,0)");
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    });
    this.clouds = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false });
      const s = new THREE.Sprite(m);
      const a = Math.random() * Math.PI * 2;
      const r = 25 + Math.random() * 200;
      s.position.set(Math.cos(a) * r, (60 + Math.random() * 380) * ALT_SCALE, Math.sin(a) * r);
      const sc = 18 + Math.random() * 30;
      s.scale.set(sc, sc * 0.5, 1);
      this.clouds.add(s);
    }
    this.scene.add(this.clouds);
  }

  _buildStars() {
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 150 + Math.random() * 600;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 80 + Math.random() * 600;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xdcecff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0,
    }));
    this.scene.add(this.stars);
  }

  _buildCanSat() {
    this.cansat = new THREE.Group();  // whole vehicle (can + chute), positioned by altitude
    this.swayGroup = new THREE.Group();// pendulum sway
    this.can = new THREE.Group();      // the can body itself (spins)
    this.swayGroup.add(this.can);
    this.cansat.add(this.swayGroup);

    /* can body — soda-can proportions (66 × 115 mm), drawn ~20× for visibility */
    const R = 0.66, H = 2.3;
    const label = this._canvasTexture(512, 256, (g, w, h) => {
      g.fillStyle = "#dde7f2"; g.fillRect(0, 0, w, h);
      /* red mission band */
      g.fillStyle = "#dc2626"; g.fillRect(0, h * 0.40, w, h * 0.22);
      g.fillStyle = "#0f172a";
      g.font = "900 44px Arial"; g.textAlign = "center";
      g.fillText("CANSAT-1", w / 2, h * 0.30);
      g.fillStyle = "#ffffff";
      g.font = "700 30px Arial";
      g.fillText("GROUND STATION DEMO", w / 2, h * 0.565);
      /* Thai flag stripes */
      const fy = h * 0.72, fh = h * 0.16, fx = w * 0.08, fw = w * 0.2;
      g.fillStyle = "#ef3340"; g.fillRect(fx, fy, fw, fh);
      g.fillStyle = "#ffffff"; g.fillRect(fx, fy + fh / 6, fw, fh / 6 * 4);
      g.fillStyle = "#2d2a4a"; g.fillRect(fx, fy + fh / 3, fw, fh / 3);
      /* fake barcode */
      g.fillStyle = "#0f172a";
      let bx = w * 0.62;
      while (bx < w * 0.92) { const bw = 2 + Math.random() * 7; g.fillRect(bx, fy, bw, fh); bx += bw + 3 + Math.random() * 6; }
      /* rivet dots */
      g.fillStyle = "rgba(15,23,42,.35)";
      for (let i = 0; i < 24; i++) { g.beginPath(); g.arc((i + 0.5) * w / 24, h * 0.05, 3, 0, Math.PI * 2); g.fill(); }
    });
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, H, 32),
      new THREE.MeshStandardMaterial({ map: label, metalness: 0.55, roughness: 0.35 })
    );
    this.can.add(body);

    const capMat = new THREE.MeshStandardMaterial({ color: 0x9aa8bd, metalness: 0.9, roughness: 0.25 });
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.92, R, 0.14, 32), capMat);
    capTop.position.y = H / 2 + 0.07;
    const capBot = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.92, 0.14, 32), capMat);
    capBot.position.y = -H / 2 - 0.07;
    this.can.add(capTop, capBot);

    /* camera window */
    const winMat = new THREE.MeshStandardMaterial({ color: 0x0b1220, metalness: 0.2, roughness: 0.1, emissive: 0x38bdf8, emissiveIntensity: 0.35 });
    const win = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), winMat);
    win.position.set(R * 0.98, -H * 0.28, 0);
    this.can.add(win);

    /* antenna + beacon LED */
    const ant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8, roughness: 0.4 })
    );
    ant.position.y = H / 2 + 0.6;
    this.can.add(ant);
    this.ledMat = new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x34d399, emissiveIntensity: 2 });
    this.led = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), this.ledMat);
    this.led.position.y = H / 2 + 1.08;
    this.can.add(this.led);
    this.ledGlow = new THREE.PointLight(0x34d399, 0.9, 6);
    this.ledGlow.position.copy(this.led.position);
    this.can.add(this.ledGlow);

    /* stabilizer fins */
    const finMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.75), finMat);
      const a = (i / 3) * Math.PI * 2;
      fin.position.set(Math.cos(a) * (R + 0.18), -H / 2 + 0.32, Math.sin(a) * (R + 0.18));
      fin.rotation.y = -a;
      this.can.add(fin);
    }

    this.scene.add(this.cansat);
  }

  _buildChute() {
    /* striped canopy */
    const tex = this._canvasTexture(512, 128, (g, w, h) => {
      const cols = ["#f97316", "#f8fafc"];
      const n = 12;
      for (let i = 0; i < n; i++) {
        g.fillStyle = cols[i % 2];
        g.fillRect(i * w / n, 0, w / n + 1, h);
      }
    });
    this.chute = new THREE.Group();
    const canopyGeo = new THREE.SphereGeometry(2.4, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2.25);
    this.canopyMat = new THREE.MeshStandardMaterial({
      map: tex, side: THREE.DoubleSide, metalness: 0.05, roughness: 0.85,
      transparent: true, opacity: 0.98,
    });
    this.canopy = new THREE.Mesh(canopyGeo, this.canopyMat);
    this.canopy.position.y = 4.3;
    this.chute.add(this.canopy);

    /* shroud lines from canopy rim down to the can top */
    const rimY = 4.3 + 2.4 * Math.cos(Math.PI / 2.25);
    const rimR = 2.4 * Math.sin(Math.PI / 2.25);
    const pts = [];
    const nLines = 8;
    for (let i = 0; i < nLines; i++) {
      const a = (i / nLines) * Math.PI * 2;
      pts.push(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR, 0, 1.3, 0);
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    this.shrouds = new THREE.LineSegments(lineGeo,
      new THREE.LineBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.85 }));
    this.chute.add(this.shrouds);

    this.chute.visible = false;
    this.chute.scale.setScalar(0.001);
    this.swayGroup.add(this.chute);
  }

  /* ---------------- controls ---------------- */

  _bindControls() {
    const cv = this.canvas;
    let drag = null;
    cv.addEventListener("pointerdown", e => {
      drag = { x: e.clientX, y: e.clientY, yaw: this.orbit.yaw, pitch: this.orbit.pitch };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", e => {
      if (!drag) return;
      this.orbit.yaw = drag.yaw - (e.clientX - drag.x) * 0.008;
      this.orbit.pitch = Math.max(-0.1, Math.min(1.3, drag.pitch + (e.clientY - drag.y) * 0.006));
    });
    cv.addEventListener("pointerup", () => { drag = null; });
    cv.addEventListener("wheel", e => {
      e.preventDefault();
      this.orbit.dist = Math.max(4, Math.min(70, this.orbit.dist * (e.deltaY > 0 ? 1.12 : 0.89)));
    }, { passive: false });
  }

  _resize() {
    if (!this.ok) return;
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(50, r.width), h = Math.max(50, r.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  reset() {
    if (!this.ok) return;
    this.chuteScale = 0;
    this.chute.visible = false;
  }

  /* ---------------- per-frame update ----------------
     state: {alt, vs, phase, chute, fast, x, y, signalLost, paused} */
  update(state, dtReal, time) {
    if (!this.ok) return;
    this.t = time;
    const animate = !state.paused;

    /* vehicle position (world) */
    const wx = (state.x || 0) * 0.35;
    const wz = -(state.y || 0) * 0.35;
    const wy = Math.max(0, state.alt) * ALT_SCALE + 1.35;
    this.cansat.position.set(wx, wy, wz);

    if (animate) {
      /* can spin + ascent wobble / descent pendulum sway */
      this.can.rotation.y += dtReal * (state.phase === "ASCENDING" ? 2.2 : 0.6);
      if (state.chute) {
        this.swayGroup.rotation.z = Math.sin(time * 1.35) * 0.16;
        this.swayGroup.rotation.x = Math.cos(time * 1.02) * 0.12;
      } else if (state.phase === "ASCENDING") {
        this.swayGroup.rotation.z = Math.sin(time * 6) * 0.03;
        this.swayGroup.rotation.x = Math.cos(time * 5) * 0.03;
      } else {
        this.swayGroup.rotation.z *= 0.95;
        this.swayGroup.rotation.x *= 0.95;
      }

      /* parachute deploy animation (elastic pop) */
      const target = state.chute ? 1 : 0;
      if (target > this.chuteScale) {
        this.chuteScale = Math.min(1, this.chuteScale + dtReal * 1.8);
        this.chute.visible = true;
        const s = this.chuteScale;
        const elastic = s >= 1 ? 1 : 1 - Math.pow(2, -10 * s) * Math.cos(s * 9);
        this.chute.scale.setScalar(Math.max(0.001, elastic));
      } else if (!state.chute) {
        this.chute.visible = false;
        this.chuteScale = 0;
      }
      /* fast-descent partial chute: squashed + fluttering + red-tinted */
      if (state.chute && this.chuteScale >= 0.99) {
        if (state.fast) {
          const flutter = 0.55 + Math.sin(time * 14) * 0.08 + Math.sin(time * 23) * 0.05;
          this.chute.scale.set(0.62, flutter, 0.62);
          this.canopyMat.color.setHex(0xff9b8a);
        } else {
          const breathe = 1 + Math.sin(time * 2.2) * 0.025;
          this.chute.scale.set(breathe, 1, breathe);
          this.canopyMat.color.setHex(0xffffff);
        }
      }

      /* beacon LED blink (red while link is down) */
      const on = Math.sin(time * 7) > -0.2;
      const col = state.signalLost ? 0xf87171 : 0x34d399;
      this.ledMat.color.setHex(col);
      this.ledMat.emissive.setHex(col);
      this.ledMat.emissiveIntensity = on ? 2.4 : 0.15;
      this.ledGlow.color.setHex(col);
      this.ledGlow.intensity = on ? 1.1 : 0.05;

      /* clouds drift slowly */
      this.clouds.rotation.y += dtReal * 0.004;
    }

    /* stars + fog fade in with altitude (always cosmetic) */
    const hi = Math.min(1, state.alt / 480);
    this.stars.material.opacity = hi * 0.9;
    this.scene.fog.color.setRGB(
      lerp(0.04, 0.01, hi), lerp(0.125, 0.03, hi), lerp(0.22, 0.09, hi));
    if (this.wrap) {
      this.wrap.style.background =
        `linear-gradient(180deg, rgb(${lerp(7, 2, hi) | 0},${lerp(20, 5, hi) | 0},${lerp(38, 14, hi) | 0}) 0%,` +
        ` rgb(${lerp(10, 4, hi) | 0},${lerp(32, 10, hi) | 0},${lerp(56, 24, hi) | 0}) 55%,` +
        ` rgb(${lerp(18, 8, hi) | 0},${lerp(50, 20, hi) | 0},${lerp(82, 40, hi) | 0}) 100%)`;
    }

    /* orbit camera follows the vehicle */
    const o = this.orbit;
    const cy = Math.sin(o.pitch) * o.dist;
    const ch = Math.cos(o.pitch) * o.dist;
    this.camera.position.set(
      wx + Math.sin(o.yaw) * ch,
      wy + cy + 0.8,
      wz + Math.cos(o.yaw) * ch
    );
    this.camera.lookAt(wx, wy + (state.chute ? 2.2 : 0.4), wz);

    this.renderer.render(this.scene, this.camera);
  }
}
