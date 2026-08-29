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

    /* ---- satellite imagery backdrop (real KSC tiles, painted fallback) ---- */
    ctx.fillStyle = "#26301f";
    ctx.fillRect(0, 0, w, h);
    if (typeof SatImagery !== "undefined" && SatImagery.canvas) {
      const Wm = SatImagery.widthMeters;
      const left = -SatImagery.padU * Wm;          // world metres, x east
      const top = SatImagery.padV * Wm;            // world metres, y north
      const dx = toSX(left), dy = toSY(top);
      const dwm = Wm / this.mpp;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(SatImagery.canvas, dx, dy, dwm, dwm);
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
      
      for (let i = 1; i < this.trail.length; i++) {
        ctx.strokeStyle = `rgba(255,210,63,${0.2 + 0.75 * (i / this.trail.length)})`;
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
    ctx.strokeStyle = "#7fd08a";
    ctx.fillStyle = "rgba(127,208,138,.25)";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(lx, ly, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx - 5, ly); ctx.lineTo(lx + 5, ly);
    ctx.moveTo(lx, ly - 5); ctx.lineTo(lx, ly + 5); ctx.stroke();
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "#c9ecd2";
    ctx.textAlign = "center";
    ctx.fillText("LAUNCH", lx, ly + 22);
    ctx.restore();

    /* ---- current position ---- */
    const px = toSX(state.x || 0), py = toSY(state.y || 0);
    const pulse = (time % 1.6) / 1.6;
    ctx.save();
    if (state.signalLost) {
      /* last-known ghost */
      ctx.strokeStyle = "rgba(224,104,92,.95)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(px, py, 10 + pulse * 8, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#e0685c";
      ctx.font = "600 11px 'Barlow Condensed', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("LAST KNOWN", px, py - 18);
    } else {
      ctx.strokeStyle = `rgba(255,220,90,${1 - pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 6 + pulse * 16, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = state.signalLost ? "#e0685c" : "#ffd23f";
    
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
    ctx.fillStyle = "#e0685c";
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-4, 2); ctx.lineTo(4, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(210,230,255,.9)";
    ctx.font = "9px 'IBM Plex Mono', monospace";
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
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "rgba(210,230,255,.8)";
    ctx.textAlign = "right";
    ctx.fillText(barM + " m", w - 16, h - 24);
  }
}
