/* ============================================================
   GpsMap — simulated GPS tracking view on a raw <canvas>.
   Procedural terrain (no map tiles, no API keys), launch marker,
   breadcrumb trail, pulsing live position, pan + Center button.
   ============================================================ */
"use strict";

class GpsMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.mpp = 1.35;              // metres per CSS pixel
    this.camX = 0; this.camY = 0; // camera centre, world metres
    this.follow = true;
    this.trail = [];              // {x, y} world metres
    this.trailAcc = 0;
    this._terrain = null;
    this._resize();
    if (window.ResizeObserver) new ResizeObserver(() => this._resize()).observe(canvas);
    this._bindPan();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(Math.max(100, r.width) * dpr);
    this.canvas.height = Math.round(Math.max(100, r.height) * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width; this.h = r.height;
  }

  _bindPan() {
    let drag = null;
    this.canvas.addEventListener("pointerdown", e => {
      drag = { x: e.clientX, y: e.clientY, camX: this.camX, camY: this.camY };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", e => {
      if (!drag) return;
      this.follow = false;
      this.camX = drag.camX - (e.clientX - drag.x) * this.mpp;
      this.camY = drag.camY + (e.clientY - drag.y) * this.mpp;
    });
    this.canvas.addEventListener("pointerup", () => { drag = null; });
  }

  center() { this.follow = true; }

  reset() {
    this.trail.length = 0;
    this.trailAcc = 0;
    this.camX = 0; this.camY = 0;
    this.follow = true;
  }

  /* Deterministic pseudo-terrain, seeded so it never changes between frames */
  _feature(i, salt) {
    const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  /* state: {x, y, lat, lon, phase, signalLost} — x east, y north (metres) */
  draw(state, time) {
    const { ctx, w, h } = this;
    if (!w) return;

    if (this.follow) {
      this.camX = lerp(this.camX, state.x || 0, 0.08);
      this.camY = lerp(this.camY, state.y || 0, 0.08);
    }
    const toSX = wx => w / 2 + (wx - this.camX) / this.mpp;
    const toSY = wy => h / 2 - (wy - this.camY) / this.mpp;

    /* ---- base ground ---- */
    ctx.fillStyle = "#0b1a10";
    ctx.fillRect(0, 0, w, h);

    /* field patches */
    for (let i = 0; i < 26; i++) {
      const fx = (this._feature(i, 1) - 0.5) * 1600;
      const fy = (this._feature(i, 2) - 0.5) * 1600;
      const fw = 90 + this._feature(i, 3) * 260;
      const fh = 80 + this._feature(i, 4) * 220;
      const sx = toSX(fx), sy = toSY(fy);
      const shade = this._feature(i, 5);
      ctx.fillStyle = shade > 0.6 ? "rgba(48,92,52,.5)" : shade > 0.3 ? "rgba(36,74,44,.55)" : "rgba(58,84,38,.4)";
      ctx.fillRect(sx, sy, fw / this.mpp, fh / this.mpp);
      ctx.strokeStyle = "rgba(20,40,24,.8)";
      ctx.strokeRect(sx, sy, fw / this.mpp, fh / this.mpp);
    }
    /* a road */
    ctx.strokeStyle = "rgba(90,96,110,.85)";
    ctx.lineWidth = 9 / this.mpp * 1.35;
    ctx.beginPath();
    ctx.moveTo(toSX(-900), toSY(-260));
    ctx.quadraticCurveTo(toSX(-100), toSY(-180), toSX(300), toSY(-320));
    ctx.quadraticCurveTo(toSX(700), toSY(-460), toSX(1000), toSY(-380));
    ctx.stroke();
    ctx.setLineDash([10, 12]);
    ctx.strokeStyle = "rgba(240,220,120,.5)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(toSX(-900), toSY(-260));
    ctx.quadraticCurveTo(toSX(-100), toSY(-180), toSX(300), toSY(-320));
    ctx.quadraticCurveTo(toSX(700), toSY(-460), toSX(1000), toSY(-380));
    ctx.stroke();
    ctx.setLineDash([]);
    /* trees */
    for (let i = 0; i < 60; i++) {
      const tx = (this._feature(i, 7) - 0.5) * 1700;
      const ty = (this._feature(i, 8) - 0.5) * 1700;
      ctx.fillStyle = "rgba(30,90,50,.7)";
      ctx.beginPath();
      ctx.arc(toSX(tx), toSY(ty), (2.2 + this._feature(i, 9) * 3) / this.mpp * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    /* grid overlay (100 m squares) */
    ctx.strokeStyle = "rgba(120,180,240,.10)";
    ctx.lineWidth = 1;
    const grid = 100;
    const x0 = Math.floor((this.camX - w / 2 * this.mpp) / grid) * grid;
    const y0 = Math.floor((this.camY - h / 2 * this.mpp) / grid) * grid;
    for (let gx = x0; gx < this.camX + w / 2 * this.mpp + grid; gx += grid) {
      ctx.beginPath(); ctx.moveTo(toSX(gx), 0); ctx.lineTo(toSX(gx), h); ctx.stroke();
    }
    for (let gy = y0; gy < this.camY + h / 2 * this.mpp + grid; gy += grid) {
      ctx.beginPath(); ctx.moveTo(0, toSY(gy)); ctx.lineTo(w, toSY(gy)); ctx.stroke();
    }

    /* ---- trail ---- */
    this.trailAcc++;
    if (state.phase !== "READY" && this.trailAcc % 4 === 0) {
      const last = this.trail[this.trail.length - 1];
      if (!last || Math.hypot(state.x - last.x, state.y - last.y) > 1.5) {
        this.trail.push({ x: state.x, y: state.y });
        if (this.trail.length > 600) this.trail.shift();
      }
    }
    if (this.trail.length > 1) {
      ctx.save();
      ctx.lineWidth = 2.2;
      ctx.lineJoin = "round";
      ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 6;
      for (let i = 1; i < this.trail.length; i++) {
        ctx.strokeStyle = `rgba(34,211,238,${0.15 + 0.8 * (i / this.trail.length)})`;
        ctx.beginPath();
        ctx.moveTo(toSX(this.trail[i - 1].x), toSY(this.trail[i - 1].y));
        ctx.lineTo(toSX(this.trail[i].x), toSY(this.trail[i].y));
        ctx.stroke();
      }
      ctx.restore();
    }

    /* ---- launch marker ---- */
    const lx = toSX(0), ly = toSY(0);
    ctx.save();
    ctx.strokeStyle = "#34d399";
    ctx.fillStyle = "rgba(52,211,153,.22)";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(lx, ly, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx - 5, ly); ctx.lineTo(lx + 5, ly);
    ctx.moveTo(lx, ly - 5); ctx.lineTo(lx, ly + 5); ctx.stroke();
    ctx.font = "10px 'Share Tech Mono', monospace";
    ctx.fillStyle = "#6ee7b7";
    ctx.textAlign = "center";
    ctx.fillText("LAUNCH", lx, ly + 22);
    ctx.restore();

    /* ---- current position ---- */
    const px = toSX(state.x || 0), py = toSY(state.y || 0);
    const pulse = (time % 1.6) / 1.6;
    ctx.save();
    if (state.signalLost) {
      /* last-known ghost */
      ctx.strokeStyle = "rgba(248,113,113,.9)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(px, py, 10 + pulse * 8, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#f87171";
      ctx.font = "700 10px Orbitron, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("LAST KNOWN", px, py - 18);
    } else {
      ctx.strokeStyle = `rgba(34,211,238,${1 - pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 6 + pulse * 16, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = state.signalLost ? "#f87171" : "#22d3ee";
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#04121a";
    ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* ---- north compass + scale bar ---- */
    ctx.save();
    ctx.translate(w - 26, 26);
    ctx.strokeStyle = "rgba(180,210,250,.7)";
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#f87171";
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-4, 2); ctx.lineTo(4, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(210,230,255,.9)";
    ctx.font = "9px 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("N", 0, -17);
    ctx.restore();

    const barM = 100, barPx = barM / this.mpp;
    ctx.strokeStyle = "rgba(210,230,255,.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w - 16 - barPx, h - 16); ctx.lineTo(w - 16, h - 16);
    ctx.moveTo(w - 16 - barPx, h - 20); ctx.lineTo(w - 16 - barPx, h - 12);
    ctx.moveTo(w - 16, h - 20); ctx.lineTo(w - 16, h - 12);
    ctx.stroke();
    ctx.font = "10px 'Share Tech Mono', monospace";
    ctx.fillStyle = "rgba(210,230,255,.8)";
    ctx.textAlign = "right";
    ctx.fillText(barM + " m", w - 16, h - 24);
  }
}
