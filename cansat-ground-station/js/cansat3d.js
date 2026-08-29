/* ============================================================
   CanSat3D — cinematic real-time 3D launch range (Three.js).

   Real satellite terrain of Kennedy Space Center (SatImagery),
   an uploaded rocket model that carries the CanSat up and
   separates at apogee, a ground crew of astronauts that watch
   the flight and walk out to recover the payload, instanced
   swaying trees, a distant mountain range, drifting clouds
   that part around the vehicle, engine fire / smoke / dust
   particles, sun shadows and a soft sky dome.

   Drag to orbit, scroll to zoom. Degrades gracefully when
   Three.js or the GLB models are unavailable (e.g. file://).
   ============================================================ */
"use strict";

const ALT_SCALE = 0.5;          // world units per metre of altitude
const GRAV = 9.81 * ALT_SCALE;  // gravity in world units

class CanSat3D {
  constructor(canvas, wrapEl) {
    this.ok = typeof THREE !== "undefined";
    this.canvas = canvas;
    this.wrap = wrapEl;
    if (!this.ok) return;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xc2d4e2, 300, 2600);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 6000);
    this.orbit = { yaw: 0.85, pitch: 0.16, dist: 26 };
    this._bindControls();

    /* ---- lights ---- */
    this.scene.add(new THREE.HemisphereLight(0xbfd3e6, 0x4a5a40, 0.75));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.25);
    sun.position.set(-140, 210, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
    sc.near = 60; sc.far = 480;
    this.scene.add(sun);
    this.sun = sun;

    this._buildSky();
    this._buildGround();
    this._buildPad();
    this._buildMountains();
    this._buildTrees();
    this._buildClouds();
    this._buildCanSat();
    this._buildChute();
    this._buildParticles();
    this._loadModels();

    this.chuteScale = 0;
    this.separated = false;
    this.rocketBody = null;     // free-fall state after separation
    this.shake = 0;
    this.recover = 0;           // recovery-walk progress
    this.t = 0;

    this._resize();
    if (window.ResizeObserver) new ResizeObserver(() => this._resize()).observe(canvas);
  }

  /* ================= helpers ================= */

  _canvasTexture(w, h, painter) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    painter(c.getContext("2d"), w, h);
    const tx = new THREE.CanvasTexture(c);
    tx.anisotropy = 8;
    return tx;
  }

  _rand(i, s) { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); }

  /* ================= environment ================= */

  _buildSky() {
    const geo = new THREE.SphereGeometry(4200, 24, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x3d6fb4) },
        mid: { value: new THREE.Color(0x9dbfdd) },
        bot: { value: new THREE.Color(0xd8e4ea) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
        void main(){ float h = clamp(normalize(vP).y, -0.05, 1.0);
          vec3 c = h < 0.18 ? mix(bot, mid, smoothstep(-0.05, 0.18, h)) : mix(mid, top, smoothstep(0.18, 0.85, h));
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.scene.add(this.sky);

    /* high-altitude stars, invisible near the ground */
    const n = 350, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 1500 + Math.random() * 2200;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 500 + Math.random() * 2600;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0,
    }));
    this.scene.add(this.stars);
  }

  _buildGround() {
    /* real KSC satellite imagery, procedurally painted until tiles arrive */
    const S = SatImagery.widthMeters * ALT_SCALE;
    this.groundTex = new THREE.CanvasTexture(SatImagery.canvas);
    this.groundTex.anisotropy = 8;
    SatImagery.onUpdate = () => { this.groundTex.needsUpdate = true; };
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(S, S),
      new THREE.MeshLambertMaterial({ map: this.groundTex })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((0.5 - SatImagery.padU) * S, 0, (0.5 - SatImagery.padV) * S);
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.groundHalf = S / 2;
    this.coastX = (0.78 - SatImagery.padU) * S;   // fallback-scene coastline

    /* surrounding earth so the horizon never shows void */
    const rim = new THREE.Mesh(
      new THREE.CircleGeometry(4800, 48),
      new THREE.MeshLambertMaterial({ color: 0x39543a })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = -0.4;
    this.scene.add(rim);
    /* distant ocean sheet to the east */
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(4200, 4800),
      new THREE.MeshLambertMaterial({ color: 0x1d4257 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(this.groundHalf + 2100, -0.2, 0);
    this.scene.add(sea);
  }

  _buildPad() {
    const pad = new THREE.Group();
    /* concrete apron */
    const apron = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 0.5, 36),
      new THREE.MeshStandardMaterial({ color: 0x8d8f8a, roughness: 0.95 })
    );
    apron.position.y = 0.25;
    apron.receiveShadow = true;
    pad.add(apron);
    /* scorch mark */
    const scorch = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 24),
      new THREE.MeshStandardMaterial({ color: 0x3c3a36, roughness: 1 })
    );
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.51;
    pad.add(scorch);
    /* launch stool */
    const stool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.2, 0.6, 12),
      new THREE.MeshStandardMaterial({ color: 0x5f6469, metalness: 0.6, roughness: 0.5 })
    );
    stool.position.y = 0.8;
    stool.castShadow = true;
    pad.add(stool);
    /* service tower */
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xb8493c, metalness: 0.4, roughness: 0.6 });
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.4, 14, 1.4), towerMat);
    tower.position.set(-4.4, 7.5, -2.5);
    tower.castShadow = true;
    pad.add(tower);
    for (let i = 0; i < 4; i++) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 0.22), towerMat);
      strut.position.set(-2.9, 2.8 + i * 3.2, -2.5);
      pad.add(strut);
    }
    /* lightning masts */
    const mastMat = new THREE.MeshStandardMaterial({ color: 0xcfd4d9, metalness: 0.7, roughness: 0.4 });
    for (const [mx, mz] of [[7, 5], [-6, 6], [6, -6]]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 11, 8), mastMat);
      mast.position.set(mx, 5.5, mz);
      mast.castShadow = true;
      pad.add(mast);
    }
    /* windsock */
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 6), mastMat);
    pole.position.set(10, 2, 8);
    pad.add(pole);
    this.sock = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 1.6, 8, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xe8642c, side: THREE.DoubleSide, roughness: 0.9 })
    );
    this.sock.rotation.z = Math.PI / 2;
    this.sock.position.set(10.8, 3.9, 8);
    pad.add(this.sock);
    this.scene.add(pad);
  }

  _buildMountains() {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x7688a0, flatShading: true });
    const matFar = new THREE.MeshLambertMaterial({ color: 0x8fa0b6, flatShading: true });
    for (let i = 0; i < 26; i++) {
      /* range across the west and north horizon only (ocean is east) */
      const a = Math.PI * 0.55 + this._rand(i, 1) * Math.PI * 1.15;
      const r = 2400 + this._rand(i, 2) * 1400;
      const h = 130 + this._rand(i, 3) * 320;
      const geo = new THREE.ConeGeometry(h * (1.5 + this._rand(i, 4)), h, 5 + (i % 3));
      const m = new THREE.Mesh(geo, this._rand(i, 5) > 0.5 ? mat : matFar);
      m.position.set(Math.cos(a) * r, h / 2 - 6, -Math.abs(Math.sin(a)) * r);
      m.rotation.y = this._rand(i, 6) * Math.PI;
      g.add(m);
    }
    this.scene.add(g);
  }

  _buildTrees() {
    const N = 320;
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1.6, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6d4c33 });
    const canGeo = new THREE.ConeGeometry(1.15, 2.6, 7);
    const canMat = new THREE.MeshLambertMaterial({ color: 0x2f5c33, flatShading: true });
    this.trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
    this.canopies = new THREE.InstancedMesh(canGeo, canMat, N);
    this.treeBase = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    let placed = 0, i = 0;
    while (placed < N && i < N * 30) {
      i++;
      const x = (this._rand(i, 11) - 0.5) * 2 * (this.groundHalf - 40);
      const z = (this._rand(i, 12) - 0.5) * 2 * (this.groundHalf - 40);
      const dPad = Math.hypot(x, z);
      if (dPad < 26) continue;                 // keep the apron clear
      if (x > this.coastX - 60) continue;      // not in the Atlantic
      const s = 0.8 + this._rand(i, 13) * 1.9;
      eu.set(0, this._rand(i, 14) * Math.PI * 2, 0);
      q.setFromEuler(eu);
      m.compose(new THREE.Vector3(x, 0.8 * s, z), q, new THREE.Vector3(s, s, s));
      this.trunks.setMatrixAt(placed, m);
      m.compose(new THREE.Vector3(x, (1.6 + 1.1) * s, z), q, new THREE.Vector3(s, s, s));
      this.canopies.setMatrixAt(placed, m);
      this.treeBase.push({ x, z, s, y: (1.6 + 1.1) * s, q: q.clone(), ph: this._rand(i, 15) * Math.PI * 2 });
      placed++;
    }
    this.trunks.count = this.canopies.count = placed;
    this.scene.add(this.trunks, this.canopies);
    this._swayM = new THREE.Matrix4();
    this._swayV = new THREE.Vector3();
    this._swayS = new THREE.Vector3();
  }

  _buildClouds() {
    const tex = this._canvasTexture(128, 128, (g, w, h) => {
      const rg = g.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
      rg.addColorStop(0, "rgba(255,255,255,.95)");
      rg.addColorStop(0.5, "rgba(245,248,252,.55)");
      rg.addColorStop(1, "rgba(245,248,252,0)");
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    });
    this.cloudClusters = [];
    for (let c = 0; c < 9; c++) {
      const cluster = {
        x: (this._rand(c, 21) - 0.5) * 1800,
        z: (this._rand(c, 22) - 0.5) * 1800,
        y: (110 + this._rand(c, 23) * 320) * ALT_SCALE + 40,
        speed: 3 + this._rand(c, 24) * 5,
        sprites: [],
      };
      const n = 4 + ((c * 7) % 4);
      for (let s = 0; s < n; s++) {
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.75, depthWrite: false });
        const sp = new THREE.Sprite(mat);
        const base = new THREE.Vector3(
          (this._rand(c * 9 + s, 25) - 0.5) * 55,
          (this._rand(c * 9 + s, 26) - 0.5) * 10,
          (this._rand(c * 9 + s, 27) - 0.5) * 40);
        const sc = 28 + this._rand(c * 9 + s, 28) * 42;
        sp.scale.set(sc, sc * 0.45, 1);
        sp.userData = { base, repel: new THREE.Vector3() };
        cluster.sprites.push(sp);
        this.scene.add(sp);
      }
      this.cloudClusters.push(cluster);
    }
  }

  /* ================= vehicle ================= */

  _buildCanSat() {
    this.cansat = new THREE.Group();
    this.swayGroup = new THREE.Group();
    this.can = new THREE.Group();
    this.swayGroup.add(this.can);
    this.cansat.add(this.swayGroup);

    const R = 0.5, H = 1.7;
    const label = this._canvasTexture(512, 256, (g, w, h) => {
      g.fillStyle = "#e9ebee"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#b7bcc3"; g.fillRect(0, 0, w, h * 0.09);
      g.fillRect(0, h * 0.91, w, h * 0.09);
      g.fillStyle = "#c8342a"; g.fillRect(0, h * 0.44, w, h * 0.14);
      g.fillStyle = "#1c2733";
      g.font = "700 46px Arial"; g.textAlign = "center";
      g.fillText("CANSAT-1", w / 2, h * 0.33);
      g.font = "600 22px Arial";
      g.fillText("FLIGHT UNIT · SN 001", w / 2, h * 0.74);
      g.fillStyle = "#1c2733";
      let bx = w * 0.66;
      while (bx < w * 0.9) { const bw = 2 + Math.random() * 6; g.fillRect(bx, h * 0.8, bw, h * 0.1); bx += bw + 3 + Math.random() * 5; }
    });
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, H, 32),
      new THREE.MeshStandardMaterial({ map: label, metalness: 0.35, roughness: 0.45 })
    );
    body.castShadow = true;
    this.can.add(body);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.85, roughness: 0.3 });
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.9, R, 0.12, 32), capMat);
    capTop.position.y = H / 2 + 0.06;
    const capBot = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.9, 0.12, 32), capMat);
    capBot.position.y = -H / 2 - 0.06;
    this.can.add(capTop, capBot);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: 0xd6dade, metalness: 0.8, roughness: 0.4 }));
    ant.position.y = H / 2 + 0.45;
    this.can.add(ant);
    this.ledMat = new THREE.MeshStandardMaterial({ color: 0x28a745, emissive: 0x28a745, emissiveIntensity: 1.6 });
    this.led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), this.ledMat);
    this.led.position.y = H / 2 + 0.84;
    this.can.add(this.led);
    this.cansat.visible = false;      // rides inside the rocket until separation
    this.scene.add(this.cansat);
  }

  _buildChute() {
    const tex = this._canvasTexture(512, 128, (g, w, h) => {
      const cols = ["#d84e2a", "#f2f2ef"];
      for (let i = 0; i < 12; i++) { g.fillStyle = cols[i % 2]; g.fillRect(i * w / 12, 0, w / 12 + 1, h); }
    });
    this.chute = new THREE.Group();
    const canopyGeo = new THREE.SphereGeometry(1.9, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2.25);
    this.canopyMat = new THREE.MeshStandardMaterial({
      map: tex, side: THREE.DoubleSide, metalness: 0.02, roughness: 0.9, transparent: true, opacity: 0.98,
    });
    this.canopy = new THREE.Mesh(canopyGeo, this.canopyMat);
    this.canopy.position.y = 3.4;
    this.canopy.castShadow = true;
    this.chute.add(this.canopy);
    const rimY = 3.4 + 1.9 * Math.cos(Math.PI / 2.25);
    const rimR = 1.9 * Math.sin(Math.PI / 2.25);
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      pts.push(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR, 0, 0.95, 0);
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    this.chute.add(new THREE.LineSegments(lineGeo,
      new THREE.LineBasicMaterial({ color: 0xdfe3e8, transparent: true, opacity: 0.9 })));
    this.chute.visible = false;
    this.chute.scale.setScalar(0.001);
    this.swayGroup.add(this.chute);
  }

  /* ================= uploaded GLB models ================= */

  _loadModels() {
    /* fallback stand-ins first, swapped out if the GLBs load */
    this.rocket = this._fallbackRocket();
    this.rocket.position.y = 1.1;
    this.scene.add(this.rocket);
    this.crew = this._makeCrew(this._fallbackAstronaut.bind(this));

    if (!THREE.GLTFLoader) return;
    const loader = new THREE.GLTFLoader();

    loader.load("assets/rocket.glb", gltf => {
      const model = this._normalize(gltf.scene, 11);   // ~22 m tall
      const grp = new THREE.Group();
      grp.add(model);
      grp.position.copy(this.rocket.position);
      grp.rotation.copy(this.rocket.rotation);
      this.scene.remove(this.rocket);
      this.rocket = grp;
      this.scene.add(grp);
    }, undefined, () => { /* keep fallback */ });

    loader.load("assets/astronaut.glb", gltf => {
      const proto = this._normalize(gltf.scene, 1.7);
      for (const c of this.crew) {
        c.group.clear();
        c.group.add(proto.clone(true));
      }
    }, undefined, () => { /* keep fallback */ });
  }

  /* scale a loaded scene to `height` units, feet at y=0, centered in xz */
  _normalize(scene, height) {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3(); box.getSize(size);
    const s = height / (size.y || 1);
    const wrap = new THREE.Group();
    wrap.add(scene);
    scene.position.set(
      -(box.min.x + size.x / 2) * s,
      -box.min.y * s,
      -(box.min.z + size.z / 2) * s);
    scene.scale.setScalar(s);
    wrap.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = true; } });
    return wrap;
  }

  _fallbackRocket() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf0f1f2, metalness: 0.3, roughness: 0.4 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x30353b, metalness: 0.5, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 8, 24), bodyMat);
    body.position.y = 4; body.castShadow = true;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.4, 24), darkMat);
    nose.position.y = 9.2; nose.castShadow = true;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, 0.8, 16), darkMat);
    nozzle.position.y = -0.3;
    g.add(body, nose, nozzle);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.12), darkMat);
      const a = (i / 4) * Math.PI * 2;
      fin.position.set(Math.cos(a) * 1.2, 1.0, Math.sin(a) * 1.2);
      fin.rotation.y = -a + Math.PI / 2;
      fin.castShadow = true;
      g.add(fin);
    }
    return g;
  }

  _fallbackAstronaut() {
    const g = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: 0xe8e9ea, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 1.05, 10), suit);
    body.position.y = 0.85; body.castShadow = true;
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), suit);
    helm.position.y = 1.5; helm.castShadow = true;
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x2a3340, metalness: 0.8, roughness: 0.15 }));
    visor.position.set(0, 1.5, 0.12);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xcfd2d6, roughness: 0.8 }));
    pack.position.set(0, 1.0, -0.3);
    g.add(body, helm, visor, pack);
    return g;
  }

  _makeCrew(builder) {
    const crew = [];
    const spots = [[14, 10, -0.6], [16.5, 7.5, -0.9], [13, 13.5, -0.4]];
    for (let i = 0; i < spots.length; i++) {
      const group = new THREE.Group();
      group.add(builder());
      const outer = new THREE.Group();     // outer: position/facing, inner: bob+lean
      outer.add(group);
      outer.position.set(spots[i][0], 0, spots[i][1]);
      outer.rotation.y = spots[i][2];
      this.scene.add(outer);
      crew.push({ outer, group, ph: i * 2.1, home: new THREE.Vector3(spots[i][0], 0, spots[i][1]) });
    }
    return crew;
  }

  /* ================= particles ================= */

  _buildParticles() {
    /* engine fire — additive points */
    const N = 420;
    this.fire = {
      n: N, i: 0,
      pos: new Float32Array(N * 3),
      vel: new Float32Array(N * 3),
      life: new Float32Array(N),
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.fire.pos, 3));
    this.fireTex = this._canvasTexture(64, 64, (g, w, h) => {
      const rg = g.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
      rg.addColorStop(0, "rgba(255,244,200,1)");
      rg.addColorStop(0.35, "rgba(255,160,48,.9)");
      rg.addColorStop(1, "rgba(255,90,20,0)");
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    });
    this.firePoints = new THREE.Points(geo, new THREE.PointsMaterial({
      map: this.fireTex, size: 2.4, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xffc06a, opacity: 0.95,
    }));
    this.firePoints.frustumCulled = false;
    this.scene.add(this.firePoints);
    this.fire.life.fill(0);
    /* park dead particles far underground */
    for (let i = 0; i < N; i++) this.fire.pos[i * 3 + 1] = -9999;

    /* smoke — pooled sprites */
    const smokeTex = this._canvasTexture(96, 96, (g, w, h) => {
      const rg = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      rg.addColorStop(0, "rgba(190,190,192,.55)");
      rg.addColorStop(1, "rgba(190,190,192,0)");
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    });
    this.smoke = [];
    for (let i = 0; i < 70; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: smokeTex, transparent: true, opacity: 0, depthWrite: false,
      }));
      sp.visible = false;
      sp.userData = { life: 0, max: 0, vel: new THREE.Vector3(), grow: 0 };
      this.scene.add(sp);
      this.smoke.push(sp);
    }
    this.smokeI = 0;
  }

  _spawnFire(origin, dt) {
    const perSec = 260;
    let count = perSec * dt;
    while (count > 0) {
      if (Math.random() > count) break;
      count--;
      const i = this.fire.i = (this.fire.i + 1) % this.fire.n;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.35;
      this.fire.pos[i * 3] = origin.x + Math.cos(a) * r;
      this.fire.pos[i * 3 + 1] = origin.y;
      this.fire.pos[i * 3 + 2] = origin.z + Math.sin(a) * r;
      this.fire.vel[i * 3] = (Math.random() - 0.5) * 3;
      this.fire.vel[i * 3 + 1] = -14 - Math.random() * 10;
      this.fire.vel[i * 3 + 2] = (Math.random() - 0.5) * 3;
      this.fire.life[i] = 0.35 + Math.random() * 0.3;
    }
  }

  _spawnSmoke(pos, vel, grow, max) {
    const sp = this.smoke[this.smokeI = (this.smokeI + 1) % this.smoke.length];
    sp.position.copy(pos);
    sp.userData.vel.copy(vel);
    sp.userData.life = 0.001;
    sp.userData.max = max;
    sp.userData.grow = grow;
    const s = 1.5 + Math.random();
    sp.scale.set(s, s, 1);
    sp.material.opacity = 0.5;
    sp.visible = true;
  }

  _updateParticles(dt) {
    const f = this.fire;
    for (let i = 0; i < f.n; i++) {
      if (f.life[i] <= 0) continue;
      f.life[i] -= dt;
      if (f.life[i] <= 0) { f.pos[i * 3 + 1] = -9999; continue; }
      f.pos[i * 3] += f.vel[i * 3] * dt;
      f.pos[i * 3 + 1] += f.vel[i * 3 + 1] * dt;
      f.pos[i * 3 + 2] += f.vel[i * 3 + 2] * dt;
      /* fire splashes sideways when it hits the pad */
      if (f.pos[i * 3 + 1] < 0.6 && f.vel[i * 3 + 1] < 0) {
        f.vel[i * 3 + 1] = 0;
        f.vel[i * 3] *= 4; f.vel[i * 3 + 2] *= 4;
      }
    }
    this.firePoints.geometry.attributes.position.needsUpdate = true;

    for (const sp of this.smoke) {
      if (!sp.visible) continue;
      const u = sp.userData;
      u.life += dt;
      if (u.life >= u.max) { sp.visible = false; continue; }
      sp.position.addScaledVector(u.vel, dt);
      u.vel.y += 1.2 * dt;                       // buoyancy
      u.vel.multiplyScalar(1 - 0.4 * dt);        // drag
      const k = u.life / u.max;
      sp.scale.x = sp.scale.y = sp.scale.x + u.grow * dt;
      sp.material.opacity = 0.5 * (1 - k);
    }
  }

  /* ================= controls / resize ================= */

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
      this.orbit.pitch = Math.max(-0.05, Math.min(1.35, drag.pitch + (e.clientY - drag.y) * 0.006));
    });
    cv.addEventListener("pointerup", () => { drag = null; });
    cv.addEventListener("wheel", e => {
      e.preventDefault();
      this.orbit.dist = Math.max(6, Math.min(160, this.orbit.dist * (e.deltaY > 0 ? 1.12 : 0.89)));
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
    this.separated = false;
    this.rocketBody = null;
    this.recover = 0;
    this.shake = 0;
    this.cansat.visible = false;
    this.rocket.visible = true;
    this.rocket.rotation.set(0, 0, 0);
    this.rocket.position.set(0, 1.1, 0);
    for (const c of this.crew) {
      c.outer.position.copy(c.home);
      c.group.rotation.set(0, 0, 0);
    }
    for (const sp of this.smoke) sp.visible = false;
    this.fire.life.fill(0);
    for (let i = 0; i < this.fire.n; i++) this.fire.pos[i * 3 + 1] = -9999;
  }

  /* ================= per-frame update =================
     state: {alt, vs, phase, chute, fast, x, y, signalLost, paused, burn} */
  update(state, dtReal, time) {
    if (!this.ok) return;
    this.t = time;
    const animate = !state.paused;
    const dt = animate ? dtReal : 0;

    const wx = (state.x || 0) * 0.35;
    const wz = -(state.y || 0) * 0.35;
    const wy = Math.max(0, state.alt) * ALT_SCALE;

    /* ---- separation happens when the chute pops ---- */
    if (state.chute && !this.separated) {
      this.separated = true;
      this.cansat.visible = true;
      this.rocketBody = {
        vel: new THREE.Vector3((Math.random() - 0.5) * 4, 2.5, (Math.random() - 0.5) * 4),
        ang: new THREE.Vector3(1.2 + Math.random(), 0.6, 1.6 + Math.random()),
        down: false,
      };
      /* separation puff */
      for (let i = 0; i < 6; i++) {
        this._spawnSmoke(new THREE.Vector3(wx, wy + 10, wz),
          new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), 3, 2.5);
      }
    }

    /* ---- rocket ---- */
    if (!this.separated) {
      /* rocket carries the CanSat */
      this.rocket.position.set(wx, wy + 1.1, wz);
      if (animate && state.phase === "ASCENDING") {
        this.rocket.rotation.z = Math.sin(time * 9) * 0.008;
        this.rocket.rotation.x = Math.cos(time * 8) * 0.008;
      }
      if (animate && state.burn) {
        const nozzle = new THREE.Vector3(wx, wy + 0.7, wz);
        this._spawnFire(nozzle, dt);
        if (Math.random() < dt * 30)
          this._spawnSmoke(nozzle, new THREE.Vector3((Math.random() - 0.5) * 4, -8, (Math.random() - 0.5) * 4), 4, 3.5);
        /* liftoff ground clouds + shake */
        if (wy < 22) {
          this.shake = Math.min(1, this.shake + dt * 3);
          if (Math.random() < dt * 40) {
            const a = Math.random() * Math.PI * 2;
            this._spawnSmoke(new THREE.Vector3(Math.cos(a) * 2, 0.8, Math.sin(a) * 2),
              new THREE.Vector3(Math.cos(a) * (8 + Math.random() * 8), 0.6, Math.sin(a) * (8 + Math.random() * 8)), 7, 4.5);
          }
        }
      }
      if (!state.burn || wy >= 22) this.shake = Math.max(0, this.shake - dt * 0.8);
    } else if (this.rocketBody && animate) {
      /* spent booster tumbles down under gravity */
      const rb = this.rocketBody;
      if (!rb.down) {
        rb.vel.y -= GRAV * dt;
        rb.vel.y = Math.max(rb.vel.y, -55);
        this.rocket.position.addScaledVector(rb.vel, dt);
        this.rocket.rotation.x += rb.ang.x * dt;
        this.rocket.rotation.z += rb.ang.z * dt;
        if (this.rocket.position.y <= 1.2) {
          rb.down = true;
          this.rocket.position.y = 1.2;
          for (let i = 0; i < 5; i++)
            this._spawnSmoke(this.rocket.position.clone(),
              new THREE.Vector3((Math.random() - 0.5) * 8, 1, (Math.random() - 0.5) * 8), 4, 2.2);
        }
      } else {
        /* settle flat */
        this.rocket.rotation.x = lerp(this.rocket.rotation.x, Math.PI / 2, 1 - Math.exp(-dt * 2));
        this.rocket.position.y = lerp(this.rocket.position.y, 0.9, 1 - Math.exp(-dt * 2));
      }
    }

    /* ---- CanSat + parachute ---- */
    this.cansat.position.set(wx, wy + 0.9, wz);
    if (animate && this.separated) {
      this.can.rotation.y += dt * 0.5;
      if (state.chute) {
        this.swayGroup.rotation.z = Math.sin(time * 1.3) * (state.fast ? 0.3 : 0.14);
        this.swayGroup.rotation.x = Math.cos(time * 1.02) * (state.fast ? 0.22 : 0.1);
      }
      const target = state.chute ? 1 : 0;
      if (target > this.chuteScale) {
        this.chuteScale = Math.min(1, this.chuteScale + dt * 1.8);
        this.chute.visible = true;
        const s = this.chuteScale;
        const elastic = s >= 1 ? 1 : 1 - Math.pow(2, -10 * s) * Math.cos(s * 9);
        this.chute.scale.setScalar(Math.max(0.001, elastic));
      }
      if (state.chute && this.chuteScale >= 0.99) {
        if (state.fast) {
          const flutter = 0.5 + Math.sin(time * 15) * 0.09 + Math.sin(time * 24) * 0.05;
          this.chute.scale.set(0.6, flutter, 0.6);
        } else {
          const breathe = 1 + Math.sin(time * 2.1) * 0.02;
          this.chute.scale.set(breathe, 1, breathe);
        }
      }
      if (state.phase === "LANDED") {
        /* canopy collapses on the ground */
        this.chute.scale.y = lerp(this.chute.scale.y, 0.12, 1 - Math.exp(-dt * 1.5));
        this.chute.scale.x = lerp(this.chute.scale.x, 1.25, 1 - Math.exp(-dt * 1.5));
        this.chute.scale.z = lerp(this.chute.scale.z, 1.25, 1 - Math.exp(-dt * 1.5));
        this.swayGroup.rotation.z *= 0.97;
        this.swayGroup.rotation.x *= 0.97;
      }
    }

    /* beacon LED */
    if (animate) {
      const on = Math.sin(time * 7) > -0.2;
      const col = state.signalLost ? 0xd83933 : 0x28a745;
      this.ledMat.color.setHex(col);
      this.ledMat.emissive.setHex(col);
      this.ledMat.emissiveIntensity = on ? 2 : 0.15;
    }

    /* ---- ground crew: watch the flight, then walk out to recover ---- */
    const vehX = wx, vehZ = wz;
    for (const c of this.crew) {
      const u = c.outer;
      if (state.phase === "LANDED" && this.separated && animate) {
        this.recover = Math.min(1, this.recover + dt * 0.02);
        const tx = wx + (c.ph - 2) * 1.6, tz = wz + 2.2 + (c.ph % 2);
        const dx = tx - u.position.x, dz = tz - u.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.8) {
          const sp = Math.min(2.6, d) * dt;
          u.position.x += dx / d * sp * 2.2;
          u.position.z += dz / d * sp * 2.2;
          u.rotation.y = Math.atan2(dx, dz);
          c.group.position.y = Math.abs(Math.sin(time * 7 + c.ph)) * 0.07;  // walk bob
          c.group.rotation.x = 0.06;
        } else {
          c.group.position.y = 0;
          c.group.rotation.x = 0;
          c.group.rotation.z = Math.sin(time * 2.4 + c.ph) * 0.05;          // celebrate
        }
      } else if (animate) {
        /* face and lean back to track the vehicle */
        const dx = vehX - u.position.x, dz = vehZ - u.position.z;
        const targetYaw = Math.atan2(dx, dz);
        u.rotation.y += (targetYaw - u.rotation.y) * Math.min(1, dt * 3);
        const up = Math.atan2(wy, Math.hypot(dx, dz));
        c.group.rotation.x = lerp(c.group.rotation.x, -up * 0.45, Math.min(1, dt * 3));
        c.group.position.y = Math.sin(time * 1.7 + c.ph) * 0.015;           // idle breathing
        if (state.phase === "ASCENDING" || state.phase === "READY") {
          c.group.rotation.z = state.phase === "ASCENDING" ? Math.sin(time * 5 + c.ph) * 0.06 : 0; // excited
        }
      }
    }

    /* ---- environment animation ---- */
    if (animate) {
      /* trees sway in the wind */
      const M = this._swayM, V = this._swayV, S = this._swayS;
      for (let i = 0; i < this.treeBase.length; i++) {
        const b = this.treeBase[i];
        V.set(b.x + Math.sin(time * 1.4 + b.ph) * 0.12 * b.s, b.y, b.z + Math.cos(time * 1.1 + b.ph) * 0.09 * b.s);
        S.set(b.s, b.s, b.s);
        M.compose(V, b.q, S);
        this.canopies.setMatrixAt(i, M);
      }
      this.canopies.instanceMatrix.needsUpdate = true;

      /* windsock */
      this.sock.rotation.x = Math.sin(time * 3.1) * 0.16;
      this.sock.rotation.y = Math.sin(time * 0.4) * 0.4;

      /* clouds drift with the wind and part around the vehicle */
      const veh = new THREE.Vector3(wx, wy, wz);
      for (const cl of this.cloudClusters) {
        cl.x += cl.speed * dt;
        if (cl.x > 1100) cl.x = -1100;
        for (const sp of cl.sprites) {
          const u = sp.userData;
          const px = cl.x + u.base.x, py = cl.y + u.base.y, pz = cl.z + u.base.z;
          const d = veh.distanceTo(new THREE.Vector3(px, py, pz));
          const R = 34;
          if (d < R && d > 0.01) {
            const push = (R - d) * 0.8;
            u.repel.set(px - veh.x, (py - veh.y) * 0.4, pz - veh.z).normalize().multiplyScalar(push);
          } else {
            u.repel.multiplyScalar(1 - Math.min(1, dt * 1.5));
          }
          sp.position.set(px + u.repel.x, py + u.repel.y, pz + u.repel.z);
        }
      }

      this._updateParticles(dt);
    }

    /* stars + sky darken subtly with altitude */
    const hi = Math.min(1, state.alt / 500);
    this.stars.material.opacity = hi * 0.5;
    this.skyMat.uniforms.top.value.setRGB(lerp(0.24, 0.10, hi), lerp(0.44, 0.22, hi), lerp(0.71, 0.45, hi));

    /* ---- camera: orbit-follow with launch shake ---- */
    const followY = this.separated || state.phase === "READY" || !this.rocket.visible
      ? wy + 0.9
      : wy + 6;
    const o = this.orbit;
    const ch = Math.cos(o.pitch) * o.dist;
    const shx = this.shake * 0.25;
    this.camera.position.set(
      wx + Math.sin(o.yaw) * ch + (Math.random() - 0.5) * shx,
      followY + Math.sin(o.pitch) * o.dist + 1.2 + (Math.random() - 0.5) * shx,
      wz + Math.cos(o.yaw) * ch + (Math.random() - 0.5) * shx);
    this.camera.lookAt(wx, followY + (state.chute ? 1.6 : 0.6), wz);

    /* keep the shadow box centred on the action near the ground */
    this.sun.target.position.set(wx, 0, wz);
    this.sun.target.updateMatrixWorld();

    this.renderer.render(this.scene, this.camera);
  }
}
