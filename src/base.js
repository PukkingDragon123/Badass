/* BADASS APOCALYPSE - the settlement: isometric base building, workers,
   production. Rendered with the same 3D renderer from a locked camera. */
(function () {
  'use strict';
  const { clamp, clamp01, lerp, damp, rand, TAU } = BA;
  const M = BA.meta;

  const TILE = 7.2;
  const HALF = (M.GRID - 1) / 2;

  const tileWorld = (x, y) => [(x - HALF) * TILE, (y - HALF) * TILE];

  /* ------------------------------------------------------------ visuals */
  function drawBuilding(R, t, wx, wz, time, sel) {
    const lv = t.level;
    const b = M.BLD[t.id];
    const bob = sel ? Math.sin(time * 4) * 0.12 : 0;
    const y0 = bob;
    const box = (dx, dy, dz, sx, sy, sz, r, g, bl, e, yaw) =>
      R.push('box', 'opaque', wx + dx, y0 + dy, wz + dz, yaw || 0, 0, 0, sx, sy, sz, r, g, bl, e || 0);
    const glow = (dx, dy, dz, sx, sy, sz, r, g, bl) =>
      R.push('sphere', 'glow', wx + dx, y0 + dy, wz + dz, 0, 0, 0, sx, sy, sz, r, g, bl, 1);

    // shared plinth
    box(0, 0.16, 0, TILE * 0.86, 0.32, TILE * 0.86, 0.20, 0.19, 0.20);

    switch (t.id) {
      case 'hq': {
        const h = 1.6 + lv * 0.42;
        box(0, 0.3 + h / 2, 0, 4.6, h, 4.6, 0.44, 0.42, 0.46);
        box(0, 0.3 + h + 0.2, 0, 5.1, 0.4, 5.1, 0.30, 0.29, 0.32);
        box(0, 0.3 + h + 0.9, 0, 2.2, 1.2, 2.2, 0.52, 0.50, 0.54);
        box(0, 0.3 + h + 2.2, 0, 0.24, 1.6, 0.24, 0.3, 0.3, 0.32);
        box(0.5, 0.3 + h + 2.7, 0, 1.1, 0.6, 0.08, 0.85, 0.16, 0.12, 0.15);
        for (let i = 0; i < Math.min(lv, 5); i++) {
          box(-2.0 + i * 1.0, 0.3 + h * 0.55, 2.35, 0.6, 0.6, 0.1, 0.9, 0.85, 0.35, 0.85);
        }
        glow(0, 0.3 + h + 2.9, 0, 1.4, 1.4, 1.4, 0.4, 0.06, 0.04);
        break;
      }
      case 'house': {
        for (let i = 0; i < Math.min(lv, 3); i++) {
          const ox = (i - 1) * 1.9 * (lv > 1 ? 1 : 0);
          box(ox, 1.1, 0, 1.7, 1.6, 2.6, 0.52, 0.34, 0.22);
          box(ox, 2.1, 0, 2.0, 0.5, 2.9, 0.34, 0.20, 0.14);
          box(ox, 1.0, 1.35, 0.5, 0.9, 0.1, 0.22, 0.14, 0.1);
          box(ox + 0.55, 1.4, 1.35, 0.4, 0.4, 0.08, 0.55, 0.75, 0.95, 0.5);
        }
        if (lv > 3) box(0, 2.9, 0, 3.4, 0.6, 2.4, 0.42, 0.28, 0.18);
        break;
      }
      case 'farm': {
        box(0, 0.5, 0, 5.6, 0.5, 5.6, 0.30, 0.21, 0.13);
        for (let r2 = 0; r2 < 3; r2++) {
          for (let c = 0; c < 3; c++) {
            const gx = (c - 1) * 1.7, gz = (r2 - 1) * 1.7;
            const grow = clamp01(lv / 3) * (0.6 + Math.sin(time + r2 + c) * 0.08);
            box(gx, 0.8 + grow * 0.4, gz, 1.1, 0.3 + grow * 0.8, 1.1, 0.22, 0.62, 0.16);
          }
        }
        for (const sx of [-1, 1]) box(sx * 2.6, 1.6, -2.6, 0.2, 2.4, 0.2, 0.4, 0.4, 0.44);
        if (lv >= 3) box(0, 2.9, 0, 5.6, 0.12, 5.6, 0.55, 0.85, 0.95, 0.25);
        break;
      }
      case 'workshop': {
        box(0, 1.2, 0, 5.0, 1.9, 4.2, 0.36, 0.35, 0.38);
        box(0, 2.35, 0, 5.3, 0.4, 4.5, 0.24, 0.23, 0.26);
        for (let i = 0; i < 3; i++) box(-1.6 + i * 1.6, 2.9, -1.0, 0.5, 0.8, 0.5, 0.28, 0.27, 0.3);
        box(0, 1.1, 2.2, 2.6, 1.7, 0.2, 0.85, 0.62, 0.12, 0.1);
        glow(1.7, 1.4, 2.2, 1.4, 1.4, 1.4, 0.5, 0.3, 0.05);
        for (let i = 0; i < lv; i++) box(-2.2 + i * 0.9, 0.55, -2.4, 0.7, 0.5, 0.7, 0.6, 0.5, 0.2);
        break;
      }
      case 'foundry': {
        box(0, 1.3, 0, 4.4, 2.1, 4.4, 0.30, 0.28, 0.30);
        box(0, 2.6, 0, 3.0, 0.6, 3.0, 0.22, 0.21, 0.23);
        for (const s of [-1, 1]) {
          box(s * 1.5, 3.4, -1.2, 0.7, 2.0, 0.7, 0.26, 0.25, 0.27);
          glow(s * 1.5, 4.6, -1.2, 1.2, 1.2, 1.2, 0.5, 0.22, 0.04);
        }
        const heat = 0.5 + Math.sin(time * 3) * 0.2;
        box(0, 1.1, 2.3, 2.0, 1.4, 0.2, 0.95 * heat, 0.4 * heat, 0.05, 0.9);
        glow(0, 1.1, 2.6, 2.6, 2.6, 2.6, 0.55 * heat, 0.2 * heat, 0.02);
        break;
      }
      case 'refinery': {
        for (const s of [-1, 1]) {
          R.push('cyl', 'opaque', wx + s * 1.5, y0 + 1.7, wz, 0, 0, 0, 2.2, 2.8, 2.2, 0.42, 0.41, 0.44, 0);
          R.push('cyl', 'opaque', wx + s * 1.5, y0 + 3.2, wz, 0, 0, 0, 2.4, 0.3, 2.4, 0.28, 0.27, 0.3, 0);
          box(s * 1.5, 1.7, 1.15, 2.3, 0.5, 0.2, 0.9, 0.55, 0.08, 0.2);
        }
        box(0, 3.6, 0, 3.6, 0.25, 0.25, 0.35, 0.34, 0.37);
        box(2.4, 2.4, -2.0, 0.3, 4.4, 0.3, 0.4, 0.39, 0.42);
        glow(2.4, 4.7, -2.0, 1.0, 1.0, 1.0, 0.45, 0.2, 0.04);
        break;
      }
      case 'infirmary': {
        box(0, 1.2, 0, 5.0, 1.9, 4.4, 0.80, 0.80, 0.82);
        box(0, 2.4, 0, 5.3, 0.4, 4.7, 0.62, 0.62, 0.66);
        box(0, 1.6, 2.25, 1.4, 0.35, 0.14, 0.9, 0.14, 0.2, 0.5);
        box(0, 1.6, 2.25, 0.35, 1.4, 0.14, 0.9, 0.14, 0.2, 0.5);
        for (let i = 0; i < Math.min(lv, 4); i++) box(-1.8 + i * 1.2, 1.3, -2.3, 0.8, 0.9, 0.12, 0.55, 0.75, 0.95, 0.35);
        break;
      }
      case 'watchtower': {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          box(sx * 1.2, 2.0 + lv * 0.2, sz * 1.2, 0.3, 4.0 + lv * 0.4, 0.3, 0.42, 0.28, 0.18);
        }
        const h = 4.1 + lv * 0.4;
        box(0, h, 0, 3.4, 0.3, 3.4, 0.5, 0.34, 0.2);
        box(0, h + 0.9, 0, 3.0, 1.5, 3.0, 0.55, 0.38, 0.24);
        box(0, h + 1.9, 0, 3.6, 0.3, 3.6, 0.34, 0.22, 0.14);
        const sweep = time * 0.9;
        R.push('cone', 'glow', wx + Math.sin(sweep) * 1.2, y0 + h + 1.0, wz + Math.cos(sweep) * 1.2,
          sweep, Math.PI / 2, 0, 1.6, 7, 1.6, 0.30, 0.28, 0.12, 1);
        break;
      }
      case 'storage': {
        for (let i = 0; i < Math.min(lv, 4); i++) {
          const ox = (i % 2) * 2.2 - 1.1, oz = Math.floor(i / 2) * 2.2 - 1.1;
          box(ox, 1.0, oz, 2.0, 1.6, 2.0, 0.34 + i * 0.04, 0.36, 0.40);
          box(ox, 1.85, oz, 2.2, 0.2, 2.2, 0.9, 0.6, 0.1, 0.1);
        }
        break;
      }
      case 'garage': {
        box(0, 1.3, 0, 5.4, 2.1, 4.6, 0.42, 0.20, 0.18);
        box(0, 2.5, 0, 5.7, 0.4, 4.9, 0.28, 0.14, 0.12);
        box(0, 1.1, 2.35, 3.6, 1.8, 0.18, 0.16, 0.16, 0.18);
        for (let i = 0; i < 4; i++) box(0, 0.5 + i * 0.45, 2.42, 3.6, 0.12, 0.06, 0.85, 0.62, 0.08, 0.12);
        box(-2.2, 1.6, -2.0, 0.5, 1.4, 0.5, 0.5, 0.48, 0.52);
        glow(0, 1.3, 2.7, 3.0, 2.0, 2.0, 0.35, 0.1, 0.04);
        break;
      }
      case 'campfire': {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          box(Math.cos(a) * 1.3, 0.45, Math.sin(a) * 1.3, 0.6, 0.35, 0.6, 0.34, 0.32, 0.32);
        }
        const f = 0.7 + Math.sin(time * 8) * 0.25;
        box(0, 0.7, 0, 1.0, 0.5, 1.0, 0.35, 0.22, 0.12);
        R.push('cone', 'glow', wx, y0 + 1.2, wz, time * 3, 0, 0, 1.3 * f, 1.8 * f, 1.3 * f, 0.9 * f, 0.4 * f, 0.06, 1);
        glow(0, 1.2, 0, 5 * f, 4 * f, 5 * f, 0.24, 0.10, 0.02);
        for (let i = 0; i < lv; i++) {
          const a = (i / 3) * TAU + 0.6;
          box(Math.cos(a) * 2.6, 0.6, Math.sin(a) * 2.6, 1.2, 0.5, 0.5, 0.4, 0.28, 0.16, 0, a);
        }
        break;
      }
      case 'garden': {
        box(0, 0.45, 0, 5.4, 0.4, 5.4, 0.26, 0.20, 0.13);
        for (let i = 0; i < 5 + lv * 2; i++) {
          const a = i * 2.399, r2 = 0.6 + (i % 4) * 0.6;
          const gx = Math.cos(a) * r2, gz = Math.sin(a) * r2;
          const h = 0.7 + (i % 3) * 0.35;
          box(gx, 0.6 + h / 2, gz, 0.22, h, 0.22, 0.22, 0.5, 0.16);
          const petal = [[0.95, 0.35, 0.5], [0.95, 0.85, 0.3], [0.6, 0.4, 0.95]][i % 3];
          box(gx, 0.6 + h + 0.18, gz, 0.5, 0.32, 0.5, petal[0], petal[1], petal[2], 0.12);
        }
        break;
      }
      case 'statue': {
        box(0, 0.6, 0, 3.0, 0.6, 3.0, 0.40, 0.40, 0.44);
        box(0, 1.1, 0, 2.2, 0.5, 2.2, 0.48, 0.48, 0.52);
        box(0, 2.2, 0, 1.0, 1.8, 0.7, 0.62, 0.62, 0.66);
        box(0, 3.4, 0, 0.66, 0.66, 0.62, 0.68, 0.68, 0.72);
        box(0.62, 2.5, 0.1, 0.26, 1.5, 0.26, 0.62, 0.62, 0.66);
        box(-0.62, 2.4, 0.1, 0.26, 1.5, 0.26, 0.62, 0.62, 0.66);
        box(0, 1.45, 1.5, 1.6, 0.2, 0.4, 0.85, 0.72, 0.2, 0.2);
        if (lv >= 2) glow(0, 2.6, 0, 4.0, 5.0, 4.0, 0.10, 0.07, 0.16);
        break;
      }
      default:
        box(0, 1.0, 0, 3.5, 1.6, 3.5, 0.4, 0.4, 0.44);
    }

    R.shadow(wx, wz, TILE * 0.5, 0.5);
    if (sel) {
      R.push('ring', 'glow', wx, 0.08, wz, 0, 0, 0, TILE * 1.1, 1.4, TILE * 1.1, 0.5, 0.45, 0.12, 1);
    }
  }

  /* ---------------------------------------------------------- villagers */
  function drawVillager(R, v, time) {
    const s = 0.85;
    const walk = Math.sin(v.phase);
    const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);
    const P = (lx, ly, lz) => [v.x + lx * cy + lz * sy, ly, v.z - lx * sy + lz * cy];
    const put = (lx, ly, lz, sx, sy2, sz, c, pitch) => {
      const p = P(lx, ly, lz);
      R.push('box', 'opaque', p[0], p[1], p[2], v.yaw, pitch || 0, 0, sx, sy2, sz, c[0], c[1], c[2], 0);
    };
    const bob = Math.abs(walk) * 0.06;
    put(0, (1.05 + bob) * s, 0, 0.62 * s, 0.85 * s, 0.42 * s, v.shirt);
    put(0, (1.62 + bob) * s, 0, 0.46 * s, 0.46 * s, 0.44 * s, v.skin);
    put(0, (1.84 + bob) * s, -0.04 * s, 0.5 * s, 0.16 * s, 0.48 * s, v.hair);
    for (const side of [1, -1]) {
      put(side * 0.42 * s, (1.2 + bob) * s, 0, 0.18 * s, 0.62 * s, 0.18 * s, v.skin, walk * side * 0.5);
      const a = walk * side * 0.6;
      put(side * 0.2 * s, 0.4 * s, -Math.sin(a) * 0.2 * s, 0.22 * s, 0.8 * s, 0.22 * s, v.pants, a);
    }
    R.shadow(v.x, v.z, 0.9, 0.4);
  }

  /* ---------------------------------------------------------------- base */
  class BaseScene {
    constructor(game) {
      this.game = game;
      this.meta = game.meta;
      this.time = 0;
      this.camYaw = Math.PI * 0.25;
      this.camDist = 62;
      this.camHeight = 46;
      this.sel = null;
      this.armed = null;          // building id queued for placement
      this.hover = null;
      this.villagers = [];
      this.dragging = null;
      this.built = false;
      this.toastT = 0;
    }

    ensureUI() {
      if (this.built) return;
      this.built = true;
      const root = document.createElement('div');
      root.id = 'basescreen';
      root.innerHTML = `
        <div id="baseTop">
          <div id="resBar"></div>
          <div id="baseRank"></div>
        </div>
        <div id="basePalette">
          <div class="ptitle">BUILD</div>
          <div id="paletteList"></div>
        </div>
        <div id="baseInspect"><div id="inspectBody"></div></div>
        <div id="baseFoot">
          <div id="baseHint">DRAG TO ORBIT · CLICK A PLOT TO BUILD</div>
          <div class="deploycol">
            <div id="stagePick"></div>
            <div class="baserow">
              <div class="bbtn ghost" id="btnGarage">GARAGE</div>
              <div class="bbtn go" id="btnDeploy">DEPLOY <span>▶</span></div>
            </div>
          </div>
        </div>
        <div id="baseToast"></div>`;
      document.getElementById('ui').appendChild(root);
      this.root = root;

      root.querySelector('#btnDeploy').addEventListener('click', () => this.game.startRun());
      root.querySelector('#btnGarage').addEventListener('click', () => this.game.garage.open('base'));

      const canvas = this.game.R.canvas;
      let moved = 0;
      const dn = (e) => {
        if (e.target !== canvas) return;
        this.dragging = { x: e.clientX, y: e.clientY, yaw: this.camYaw };
        moved = 0;
      };
      const mv = (e) => {
        if (!this.dragging) return;
        const dx = e.clientX - this.dragging.x;
        moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
        this.camYaw = this.dragging.yaw - dx * 0.008;
      };
      const up = (e) => {
        if (this.dragging && moved < 6 && e.target === canvas) this.click(e);
        this.dragging = null;
      };
      window.addEventListener('pointerdown', dn);
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
      canvas.addEventListener('wheel', (e) => {
        if (this.game.state !== 'base') return;
        e.preventDefault();
        this.camDist = clamp(this.camDist + Math.sign(e.deltaY) * 5, 34, 105);
        this.camHeight = this.camDist * 0.74;
      }, { passive: false });
    }

    enter() {
      this.ensureUI();
      this.root.classList.add('on');
      this.spawnVillagers();
      this.refresh();
    }

    exit() {
      if (this.root) this.root.classList.remove('on');
      this.armed = null;
      this.sel = null;
    }

    toast(msg) {
      if (!this.root) return;
      const el = this.root.querySelector('#baseToast');
      el.textContent = msg;
      el.style.opacity = '1';
      this.toastT = 1.8;
    }

    spawnVillagers() {
      const n = clamp(Math.floor(this.meta.res.people), 0, 14);
      this.villagers.length = 0;
      const skins = [[0.86, 0.70, 0.55], [0.62, 0.45, 0.32], [0.92, 0.78, 0.64], [0.44, 0.31, 0.22]];
      const shirts = [[0.24, 0.42, 0.62], [0.6, 0.28, 0.24], [0.3, 0.52, 0.32], [0.62, 0.56, 0.3], [0.4, 0.3, 0.5]];
      for (let i = 0; i < n; i++) {
        this.villagers.push({
          x: rand(-HALF * TILE, HALF * TILE), z: rand(-HALF * TILE, HALF * TILE),
          tx: 0, tz: 0, yaw: rand(TAU), phase: rand(TAU), wait: rand(0, 3),
          skin: skins[i % skins.length], shirt: shirts[i % shirts.length],
          pants: [0.2, 0.2, 0.26], hair: [0.15, 0.11, 0.08],
        });
      }
    }

    click(e) {
      const R = this.game.R;
      const rect = R.canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = 1 - ((e.clientY - rect.top) / rect.height) * 2;
      const hit = R.screenToGround(nx, ny);
      if (!hit) return;
      const gx = Math.round(hit[0] / TILE + HALF);
      const gy = Math.round(hit[1] / TILE + HALF);
      if (gx < 0 || gy < 0 || gx >= M.GRID || gy >= M.GRID) return;

      const t = this.meta.tileAt(gx, gy);
      if (this.armed) {
        if (t) { this.toast('PLOT TAKEN'); return; }
        const b = M.BLD[this.armed];
        if (!this.meta.can(this.meta.buildCost(this.armed, 0))) { this.toast('NOT ENOUGH RESOURCES'); return; }
        if (this.meta.place(this.armed, gx, gy)) {
          this.game.audio.levelUp();
          this.toast(b.name + ' BUILT');
          this.armed = null;
          this.sel = this.meta.tileAt(gx, gy);
          this.refresh();
        }
        return;
      }
      this.sel = t || null;
      if (t) this.game.audio.ui();
      this.refresh();
    }

    /* -------------------------------------------------------------- UI */
    refresh() {
      if (!this.root) return;
      const meta = this.meta;

      const rates = meta.rates();
      this.root.querySelector('#resBar').innerHTML = M.RES.map((r) => {
        const v = Math.floor(meta.res[r.id] || 0);
        const rate = rates[r.id];
        const cap = meta.cap(r.id);
        const rateTxt = rate === undefined ? '' :
          `<em style="color:${rate >= 0 ? '#8dff3a' : '#ff6b5e'}">${rate >= 0 ? '+' : ''}${rate.toFixed(1)}/m</em>`;
        return `<div class="rchip" title="${r.name}">${BA.icons.img(r.icon, 22)}
          <b style="color:${r.color}">${v}</b><i>/${Math.floor(cap)}</i>${rateTxt}</div>`;
      }).join('');

      const rank = meta.rank;
      this.root.querySelector('#stagePick').innerHTML = BA.stages.STAGES.map((st) => {
        const locked = rank < st.unlockRank;
        const on = this.game.stage.id === st.id;
        return `<div class="scard${on ? ' on' : ''}${locked ? ' locked' : ''}" data-s="${st.id}" style="--c:${st.color}">
          ${BA.icons.img(st.icon, 26)}
          <div class="sinfo"><b>${st.name}</b><i>${locked ? 'NEEDS RANK ' + st.unlockRank : st.blurb}</i></div>
        </div>`;
      }).join('');
      for (const el of this.root.querySelectorAll('.scard')) {
        el.addEventListener('click', () => {
          const st = BA.stages.byId[el.dataset.s];
          if (meta.rank < st.unlockRank) { this.toast('LOCKED - RAISE YOUR COMMAND POST'); return; }
          this.game.stage = st;
          this.game.audio.ui();
          this.refresh();
        });
      }

      this.root.querySelector('#baseRank').innerHTML =
        `<b>RANK ${meta.rank}</b> · ${meta.assigned}/${meta.workerSlots} WORKING · ${meta.idleWorkers} IDLE · BEDS ${Math.floor(meta.res.people)}/${meta.housing}`;

      this.root.querySelector('#paletteList').innerHTML = M.BUILDINGS.filter((b) => !b.unique).map((b) => {
        const cost = b.cost(0);
        const afford = meta.can(cost);
        const costTxt = Object.entries(cost).map(([k, v]) => {
          const rr = M.RES.find((r) => r.id === k);
          return `<span class="${(meta.res[k] || 0) >= v ? '' : 'bad'}">${v}<i style="color:${rr ? rr.color : '#fff'}">${rr ? rr.name[0] : '?'}</i></span>`;
        }).join('');
        return `<div class="pitem${this.armed === b.id ? ' armed' : ''}${afford ? '' : ' poor'}" data-b="${b.id}">
          ${BA.icons.img(b.icon, 30)}
          <div class="pinfo"><b style="color:${b.color}">${b.name}</b><div class="pcost">${costTxt}</div></div>
        </div>`;
      }).join('');
      for (const el of this.root.querySelectorAll('.pitem')) {
        el.addEventListener('click', () => {
          this.armed = this.armed === el.dataset.b ? null : el.dataset.b;
          this.sel = null;
          this.game.audio.ui();
          this.refresh();
        });
      }

      const body = this.root.querySelector('#inspectBody');
      const t = this.sel;
      if (!t) {
        const armed = this.armed ? M.BLD[this.armed] : null;
        body.innerHTML = armed
          ? `<div class="ihead">${BA.icons.img(armed.icon, 40)}<div><b style="color:${armed.color}">${armed.name}</b>
             <div class="isub">CLICK AN EMPTY PLOT</div></div></div><p>${armed.desc}</p>`
          : `<div class="isub">SELECT A BUILDING<br>OR PICK ONE TO BUILD</div>`;
        this.root.querySelector('#baseInspect').classList.toggle('on', !!armed);
        return;
      }
      this.root.querySelector('#baseInspect').classList.add('on');
      const b = M.BLD[t.id];
      const maxed = t.level >= b.max;
      const cost = maxed ? null : meta.buildCost(t.id, t.level);
      const slots = b.slots ? b.slots(t.level) : 0;
      const costTxt = cost ? Object.entries(cost).map(([k, v]) => {
        const rr = M.RES.find((r) => r.id === k);
        return `<span class="${(meta.res[k] || 0) >= v ? '' : 'bad'}">${v} <i style="color:${rr ? rr.color : '#fff'}">${rr ? rr.name : k}</i></span>`;
      }).join(' · ') : '';

      body.innerHTML =
        `<div class="ihead">${BA.icons.img(b.icon, 40)}<div><b style="color:${b.color}">${b.name}</b>
          <div class="isub">LEVEL ${t.level} / ${b.max}</div></div></div>
         <p>${b.desc}</p>
         <div class="ieff">${b.effect(t.level)}</div>
         ${slots ? `<div class="workers">
            <span>WORKERS ${t.workers || 0}/${slots}</span>
            <button class="wbtn" data-w="-1">−</button><button class="wbtn" data-w="1">+</button>
          </div>` : ''}
         ${maxed ? '<div class="ieff maxed">FULLY UPGRADED</div>'
          : `<div class="upcost">${costTxt}</div>
             <div class="bbtn go small" id="btnUp">UPGRADE → LV ${t.level + 1}</div>`}
         ${b.unique ? '' : '<div class="bbtn ghost small" id="btnDown">DEMOLISH</div>'}`;

      const up = body.querySelector('#btnUp');
      if (up) up.addEventListener('click', () => {
        if (this.meta.upgrade(t)) { this.game.audio.levelUp(); this.toast(b.name + ' → LV ' + t.level); }
        else this.toast('NOT ENOUGH RESOURCES');
        this.refresh();
      });
      const dn = body.querySelector('#btnDown');
      if (dn) dn.addEventListener('click', () => {
        if (this.meta.demolish(t)) { this.sel = null; this.toast('DEMOLISHED'); this.game.audio.hit(0.4); }
        this.refresh();
      });
      for (const w of body.querySelectorAll('.wbtn')) {
        w.addEventListener('click', () => {
          if (!this.meta.assign(t, Number(w.dataset.w))) this.toast('NO IDLE SURVIVORS');
          this.game.audio.ui();
          this.refresh();
        });
      }
    }

    /* ---------------------------------------------------------- update */
    update(dt) {
      this.time += dt;
      this.meta.tick(dt);
      if (this.toastT > 0) {
        this.toastT -= dt;
        if (this.toastT <= 0 && this.root) this.root.querySelector('#baseToast').style.opacity = '0';
      }
      this.refreshT = (this.refreshT || 0) - dt;
      if (this.refreshT <= 0) { this.refreshT = 1.0; this.refresh(); }

      // villagers wander between plots
      for (const v of this.villagers) {
        v.wait -= dt;
        if (v.wait <= 0) {
          v.wait = rand(2, 6);
          v.tx = rand(-HALF * TILE, HALF * TILE);
          v.tz = rand(-HALF * TILE, HALF * TILE);
        }
        const dx = v.tx - v.x, dz = v.tz - v.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.6) {
          const sp = 3.0;
          v.x += (dx / d) * sp * dt;
          v.z += (dz / d) * sp * dt;
          v.yaw = lerp(v.yaw, Math.atan2(dx, dz), clamp01(dt * 6));
          v.phase += dt * 7;
        }
      }

      const R = this.game.R;
      const eye = [Math.sin(this.camYaw) * this.camDist, this.camHeight, Math.cos(this.camYaw) * this.camDist];
      R.setCamera(eye, [0, 2, 0], [0, 1, 0], 0.62, 1, 400);
    }

    draw(R) {
      R.time = this.time;
      R.beginFrame();

      // plots
      for (let y = 0; y < M.GRID; y++) {
        for (let x = 0; x < M.GRID; x++) {
          const [wx, wz] = tileWorld(x, y);
          const t = this.meta.tileAt(x, y);
          const free = !t;
          const armed = this.armed && free;
          const tint = (x + y) % 2 ? 0.20 : 0.16;
          R.push('box', 'opaque', wx, 0.06, wz, 0, 0, 0, TILE * 0.96, 0.12, TILE * 0.96,
            tint, tint * 0.98, tint * 0.94, 0);
          if (armed) {
            R.push('ring', 'glow', wx, 0.12, wz, 0, 0, 0, TILE * 0.9, 0.8, TILE * 0.9,
              0.12, 0.30, 0.10, 1);
          }
        }
      }
      // perimeter wall
      const edge = (HALF + 0.62) * TILE;
      for (let i = -M.GRID; i <= M.GRID; i++) {
        const p = i * TILE * 0.5;
        for (const [ax, az] of [[p, -edge], [p, edge], [-edge, p], [edge, p]]) {
          if (Math.abs(ax) > edge + 0.1 || Math.abs(az) > edge + 0.1) continue;
          R.push('box', 'opaque', ax, 0.9, az, 0, 0, 0, TILE * 0.52, 1.8, 0.7, 0.24, 0.20, 0.17, 0);
          R.push('box', 'opaque', ax, 1.9, az, 0, 0, 0, TILE * 0.5, 0.24, 0.9, 0.42, 0.32, 0.10, 0.05);
        }
      }

      for (const t of this.meta.tiles) {
        const [wx, wz] = tileWorld(t.x, t.y);
        drawBuilding(R, t, wx, wz, this.time, this.sel === t);
      }
      for (const v of this.villagers) drawVillager(R, v, this.time);

      const P = R.post;
      P.bloom = 0.75; P.aberration = 0.0006; P.vignette = 1;
      P.speedBlur = 0; P.flash = this.game.flashAmt; P.flashCol = this.game.flashCol; P.hurt = 0;
      R.render([0, 0]);

      const ctx = this.game.octx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.game.overlay.width, this.game.overlay.height);
    }
  }

  BA.BaseScene = BaseScene;
  BA.baseTile = { TILE, tileWorld };
})();
