/* ============================================================
   StripChart — real-time telemetry chart on a raw <canvas>.
   No chart library. Keeps the latest ~50 points, autoscales,
   draws grid + axes + glow line, survives having 0 or 1 points.
   ============================================================ */
"use strict";

class StripChart {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.label = opts.label;
    this.unit = opts.unit;
    this.color = opts.color;
    this.maxPoints = opts.maxPoints || 50;
    this.threshold = opts.threshold; // optional {value, label, color}
    this.data = []; // {t, v}
    this._resize();
    if (window.ResizeObserver) {
      new ResizeObserver(() => { this._resize(); this.draw(); }).observe(canvas);
    }
    this.draw();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(80, r.width), h = Math.max(60, r.height);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w; this.h = h;
  }

  push(t, v) {
    this.data.push({ t, v });
    if (this.data.length > this.maxPoints) this.data.shift();
    this.draw();
  }

  reset() {
    this.data.length = 0;
    this.draw();
  }

  draw() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    const padL = 48, padR = 12, padT = 26, padB = 20;
    const pw = w - padL - padR, ph = h - padT - padB;

    /* title */
    ctx.font = "600 12px 'Barlow Condensed', sans-serif";
    ctx.fillStyle = this.color;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(this.label.toUpperCase(), padL, 6);
    const labelW = ctx.measureText(this.label.toUpperCase()).width;
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "rgba(160,185,220,.75)";
    ctx.fillText("(" + this.unit + ")", padL + labelW + 8, 7);

    /* current value, top-right */
    if (this.data.length) {
      const cur = this.data[this.data.length - 1].v;
      ctx.font = "13px 'IBM Plex Mono', monospace";
      ctx.fillStyle = this.color;
      ctx.textAlign = "right";
      ctx.fillText(cur.toFixed(1) + " " + this.unit, w - padR, 5);
    }

    /* value range */
    let min = 0, max = 1;
    if (this.data.length) {
      min = Infinity; max = -Infinity;
      for (const d of this.data) { if (d.v < min) min = d.v; if (d.v > max) max = d.v; }
      if (this.threshold) min = Math.min(min, this.threshold.value);
      const span = (max - min) || 1;
      min -= span * 0.12; max += span * 0.12;
    }
    const yOf = v => padT + ph - ((v - min) / (max - min)) * ph;
    const xOf = i => padL + (i / (this.maxPoints - 1)) * pw;

    /* grid + y labels */
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.font = "9.5px 'IBM Plex Mono', monospace";
    const rows = 4;
    for (let i = 0; i <= rows; i++) {
      const v = min + (i / rows) * (max - min);
      const y = yOf(v);
      ctx.strokeStyle = "rgba(120,160,220,.13)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillStyle = "rgba(150,175,210,.8)";
      ctx.fillText(this._fmt(v), padL - 6, y);
    }
    /* vertical grid */
    for (let i = 0; i <= 5; i++) {
      const x = padL + (i / 5) * pw;
      ctx.strokeStyle = "rgba(120,160,220,.08)";
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke();
    }
    /* time axis labels */
    if (this.data.length > 1) {
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(150,175,210,.65)";
      const first = this.data[0].t, last = this.data[this.data.length - 1].t;
      ctx.fillText("T+" + Math.round(first) + "s", padL + 14, padT + ph + 5);
      ctx.fillText("T+" + Math.round(last) + "s", padL + xOf(this.data.length - 1) - padL, padT + ph + 5);
    } else {
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(140,165,200,.5)";
      ctx.font = "11px 'IBM Plex Sans', sans-serif";
      ctx.fillText("waiting for telemetry…", padL + pw / 2, padT + ph / 2);
    }

    /* threshold line */
    if (this.threshold && this.data.length) {
      const y = yOf(this.threshold.value);
      if (y > padT && y < padT + ph) {
        ctx.save();
        ctx.strokeStyle = this.threshold.color;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = this.threshold.color;
        ctx.font = "9px 'IBM Plex Mono', monospace";
        ctx.textAlign = "left"; ctx.textBaseline = "bottom";
        ctx.fillText(this.threshold.label, padL + 4, y - 2);
        ctx.restore();
      }
    }

    if (!this.data.length) return;

    /* area fill under the line */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(this.data[0].v));
    for (let i = 1; i < this.data.length; i++) ctx.lineTo(xOf(i), yOf(this.data[i].v));
    if (this.data.length > 1) {
      ctx.lineTo(xOf(this.data.length - 1), padT + ph);
      ctx.lineTo(xOf(0), padT + ph);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, padT, 0, padT + ph);
      g.addColorStop(0, this._alpha(this.color, 0.16));
      g.addColorStop(1, this._alpha(this.color, 0.0));
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.restore();

    /* trace line */
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(this.data[0].v));
    for (let i = 1; i < this.data.length; i++) ctx.lineTo(xOf(i), yOf(this.data[i].v));
    ctx.stroke();
    ctx.restore();

    /* live dot on the newest sample */
    const li = this.data.length - 1;
    ctx.beginPath();
    ctx.arc(xOf(li), yOf(this.data[li].v), 3.4, 0, Math.PI * 2);
    ctx.fillStyle = "#e8ecef";
    ctx.fill();
  }

  _fmt(v) {
    const a = Math.abs(v);
    if (a >= 1000) return v.toFixed(0);
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    return v.toFixed(1);
  }

  _alpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
}
