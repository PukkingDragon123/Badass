/* ============================================================
   AnalogGauge — aircraft-instrument style dial on a <canvas>.
   270° sweep, tick marks, red/amber arcs, damped needle and a
   digital readout. Professional flight-deck look, no glow.
   ============================================================ */
"use strict";

class AnalogGauge {
  /* opts: {label, unit, min, max, ticks, redLow?, redHigh?, amberLow?, amberHigh?, fmt?} */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.o = Object.assign({ ticks: 10, fmt: v => v.toFixed(1) }, opts);
    this.value = this.o.min;
    this.shown = this.o.min;         // damped needle position
    this._resize();
    if (window.ResizeObserver) new ResizeObserver(() => { this._resize(); this.draw(); }).observe(canvas);
    this.draw();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(Math.max(60, r.width) * dpr);
    this.canvas.height = Math.round(Math.max(60, r.height) * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width; this.h = r.height;
  }

  set(v) { this.value = Math.min(this.o.max, Math.max(this.o.min, v)); }

  /* call every frame; needle eases toward the value */
  tick(dt) {
    const k = 1 - Math.exp(-(dt || 0.016) * 6);
    this.shown += (this.value - this.shown) * k;
    this.draw();
  }

  _angle(v) {
    const f = (v - this.o.min) / (this.o.max - this.o.min);
    return Math.PI * 0.75 + f * Math.PI * 1.5;   // 135° .. 405°
  }

  draw() {
    const { ctx, w, h, o } = this;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.54;
    const R = Math.min(w / 2, h * 0.54) - 6;

    /* bezel + face */
    ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
    ctx.fillStyle = "#0e1114"; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = "#3a4149"; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = "#171b20"; ctx.fill();

    /* colored range arcs */
    const arc = (from, to, col) => {
      if (from == null || to == null) return;
      ctx.beginPath();
      ctx.arc(cx, cy, R - 5, this._angle(Math.max(o.min, from)), this._angle(Math.min(o.max, to)));
      ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.stroke();
    };
    arc(o.min, o.max, "#2c3238");
    if (o.amberLow != null) arc(o.min, o.amberLow, "#b98900");
    if (o.amberHigh != null) arc(o.amberHigh, o.max, "#b98900");
    if (o.redLow != null) arc(o.min, o.redLow, "#a33a32");
    if (o.redHigh != null) arc(o.redHigh, o.max, "#a33a32");

    /* ticks + numerals */
    ctx.font = `${Math.max(7, R * 0.14)}px 'IBM Plex Mono', monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let i = 0; i <= o.ticks; i++) {
      const v = o.min + (i / o.ticks) * (o.max - o.min);
      const a = this._angle(v);
      const major = i % 2 === 0;
      const r1 = R - 5, r2 = R - (major ? 13 : 9);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.lineWidth = major ? 1.6 : 1;
      ctx.strokeStyle = "#cdd3d9";
      ctx.stroke();
      if (major) {
        const rt = R - 21;
        ctx.fillStyle = "#aab2ba";
        const num = Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : (Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1));
        ctx.fillText(String(num), cx + Math.cos(a) * rt, cy + Math.sin(a) * rt);
      }
    }

    /* label */
    ctx.font = `600 ${Math.max(8, R * 0.15)}px 'Barlow Condensed', 'Arial Narrow', sans-serif`;
    ctx.fillStyle = "#8a929b";
    ctx.fillText(o.label.toUpperCase(), cx, cy - R * 0.42);
    ctx.font = `${Math.max(7, R * 0.12)}px 'IBM Plex Mono', monospace`;
    ctx.fillText(o.unit, cx, cy - R * 0.26);

    /* needle */
    const a = this._angle(this.shown);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-R * 0.12, 0);
    ctx.lineTo(R * 0.78, 0);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "#e8ecef";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(R * 0.78, 0); ctx.lineTo(R * 0.62, -3.2); ctx.lineTo(R * 0.62, 3.2);
    ctx.closePath();
    ctx.fillStyle = "#e8ecef"; ctx.fill();
    ctx.restore();
    /* hub */
    ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#2b3138"; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = "#5a636c"; ctx.stroke();

    /* digital readout window */
    const dw = R * 0.9, dh = Math.max(15, R * 0.26);
    ctx.fillStyle = "#0b0d10";
    ctx.strokeStyle = "#343b43";
    ctx.beginPath();
    ctx.rect(cx - dw / 2, cy + R * 0.34, dw, dh);
    ctx.fill(); ctx.stroke();
    ctx.font = `${Math.max(10, R * 0.2)}px 'IBM Plex Mono', monospace`;
    ctx.fillStyle = this._readoutColor();
    ctx.fillText(this.o.fmt(this.value), cx, cy + R * 0.34 + dh / 2 + 1);
  }

  _readoutColor() {
    const v = this.value, o = this.o;
    if ((o.redLow != null && v <= o.redLow) || (o.redHigh != null && v >= o.redHigh)) return "#ff6a5e";
    if ((o.amberLow != null && v <= o.amberLow) || (o.amberHigh != null && v >= o.amberHigh)) return "#ffc24b";
    return "#7fd08a";
  }
}
