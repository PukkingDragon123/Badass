/* ============================================================
   FlightViz — 2D side-view of the flight on a raw <canvas>.
   Sky, ground, altitude ruler, CanSat + parachute, motion arrow,
   phase label, trail and max-altitude marker.
   ============================================================ */
"use strict";

class FlightViz {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.maxScale = 520;      // metres shown top-to-bottom
    this.trail = [];          // sparse {alt, x} history dots
    this.trailAcc = 0;
    this.reset();
    this._resize();
    if (window.ResizeObserver) {
      new ResizeObserver(() => this._resize()).observe(canvas);
    }
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(Math.max(100, r.width) * dpr);
    this.canvas.height = Math.round(Math.max(100, r.height) * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width; this.h = r.height;
  }

  reset() {
    this.trail.length = 0;
    this.trailAcc = 0;
    this.maxAltMark = 0;
  }

  /* state: {alt, vs, phase, chute, x, signalLost, t, maxAlt} */
  draw(state, time) {
    const { ctx, w, h } = this;
    if (!w) return;
    const alt = Math.max(0, state.alt);
    const groundH = 46;
    const skyH = h - groundH;
    const padTop = 34;
    const yOfAlt = a => padTop + (skyH - padTop) * (1 - a / this.maxScale);

    /* ---- sky gradient (darkens with altitude) ---- */
    const hi = Math.min(1, alt / 500);
    const g = ctx.createLinearGradient(0, 0, 0, skyH);
    g.addColorStop(0, this._mix([10, 20, 44], [3, 6, 18], hi));
    g.addColorStop(0.6, this._mix([22, 48, 92], [10, 22, 48], hi));
    g.addColorStop(1, this._mix([58, 106, 160], [30, 60, 100], hi));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, skyH);

    /* stars high up */
    ctx.fillStyle = `rgba(255,255,255,${0.5 * hi})`;
    for (let i = 0; i < 26; i++) {
      const sx = ((i * 97.3) % w), sy = ((i * 53.7) % (skyH * 0.45));
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 2 + i));
      ctx.globalAlpha = tw * hi * 0.8;
      ctx.fillRect(sx, sy, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;

    /* drifting clouds */
    for (let i = 0; i < 5; i++) {
      const ca = 130 + i * 68;
      const cy = yOfAlt(ca);
      if (cy < 0 || cy > skyH) continue;
      const cx = ((i * 173 + time * (4 + i)) % (w + 160)) - 80;
      ctx.fillStyle = "rgba(200,220,245,.10)";
      this._cloud(cx, cy, 34 + i * 6);
    }

    /* ---- ground ---- */
    const gg = ctx.createLinearGradient(0, skyH, 0, h);
    gg.addColorStop(0, "#1d3a24");
    gg.addColorStop(1, "#0c1c10");
    ctx.fillStyle = gg;
    ctx.fillRect(0, skyH, w, groundH);
    ctx.strokeStyle = "rgba(120,220,140,.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, skyH); ctx.lineTo(w, skyH); ctx.stroke();
    /* grass ticks */
    ctx.strokeStyle = "rgba(120,220,140,.22)";
    for (let x = 6; x < w; x += 14) {
      ctx.beginPath(); ctx.moveTo(x, skyH); ctx.lineTo(x - 3, skyH + 6); ctx.stroke();
    }
    /* launch pad */
    const padX = w * 0.5;
    ctx.fillStyle = "#3b4859";
    ctx.fillRect(padX - 26, skyH - 4, 52, 5);
    ctx.fillStyle = "rgba(251,191,36,.85)";
    for (let i = 0; i < 4; i++) ctx.fillRect(padX - 26 + i * 14, skyH - 4, 7, 5);

    /* ---- altitude ruler (left) ---- */
    ctx.font = "10px 'Share Tech Mono', monospace";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    for (let a = 0; a <= this.maxScale - 20; a += 50) {
      const y = yOfAlt(a);
      const major = a % 100 === 0;
      ctx.strokeStyle = major ? "rgba(140,180,230,.4)" : "rgba(140,180,230,.18)";
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(major ? 26 : 15, y); ctx.stroke();
      if (major) { ctx.fillStyle = "rgba(160,190,230,.75)"; ctx.fillText(a + "m", 30, y); }
    }

    /* horizontal drift → screen x (±260 m mapped to ±35% width) */
    const sx = padX + Math.max(-w * 0.36, Math.min(w * 0.36, (state.x || 0) / 260 * w * 0.35));
    const sy = yOfAlt(alt);

    /* ---- trail ---- */
    this.trailAcc++;
    if (state.phase !== "READY" && state.phase !== "LANDED" && this.trailAcc % 5 === 0) {
      this.trail.push({ x: sx, y: sy });
      if (this.trail.length > 90) this.trail.shift();
    }
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      ctx.globalAlpha = (i / this.trail.length) * 0.5;
      ctx.fillStyle = "#67e8f9";
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;

    /* ---- max-altitude marker ---- */
    if (state.maxAlt > 30 && state.phase !== "READY") {
      const my = yOfAlt(state.maxAlt);
      ctx.save();
      ctx.strokeStyle = "rgba(167,139,250,.6)";
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(26, my); ctx.lineTo(w - 8, my); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(196,181,253,.95)";
      ctx.font = "10px 'Share Tech Mono', monospace";
      ctx.textAlign = "right"; ctx.textBaseline = "bottom";
      ctx.fillText("MAX " + state.maxAlt.toFixed(0) + " m", w - 10, my - 2);
      ctx.restore();
    }

    /* ---- current-altitude dashed line to ruler ---- */
    if (alt > 2) {
      ctx.save();
      ctx.strokeStyle = "rgba(34,211,238,.4)";
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(28, sy); ctx.lineTo(sx - 20, sy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    /* ---- parachute ---- */
    const swing = Math.sin(time * 2.2) * (state.chute && alt > 1 ? 6 : 0);
    if (state.chute && alt > 1) {
      const cw = state.fast ? 20 : 30;   // partial chute is smaller
      const cx2 = sx + swing * 0.4;
      const topY = sy - 34;
      ctx.save();
      /* canopy */
      const grad = ctx.createLinearGradient(cx2 - cw, topY, cx2 + cw, topY);
      grad.addColorStop(0, "#fb923c"); grad.addColorStop(.5, "#fde68a"); grad.addColorStop(1, "#fb923c");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx2 - cw, topY + 8);
      ctx.quadraticCurveTo(cx2, topY - (state.fast ? 10 : 20), cx2 + cw, topY + 8);
      ctx.quadraticCurveTo(cx2 + cw * .5, topY + 13, cx2, topY + 9);
      ctx.quadraticCurveTo(cx2 - cw * .5, topY + 13, cx2 - cw, topY + 8);
      ctx.closePath();
      ctx.shadowColor = "rgba(251,146,60,.7)"; ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      /* shroud lines */
      ctx.strokeStyle = "rgba(230,240,255,.75)";
      ctx.lineWidth = 1;
      for (const dx of [-cw, -cw / 2.5, cw / 2.5, cw]) {
        ctx.beginPath(); ctx.moveTo(cx2 + dx, topY + 8); ctx.lineTo(sx, sy - 10); ctx.stroke();
      }
      ctx.restore();
    }

    /* ---- CanSat body ---- */
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(swing * 0.012);
    /* can */
    const cg = ctx.createLinearGradient(-7, 0, 7, 0);
    cg.addColorStop(0, "#8fa8c8"); cg.addColorStop(.5, "#e8f2ff"); cg.addColorStop(1, "#5f7896");
    ctx.fillStyle = cg;
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 1.2;
    this._roundRect(-7, -12, 14, 22, 3);
    ctx.fill(); ctx.stroke();
    /* label stripe */
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(-7, -4, 14, 5);
    /* antenna */
    ctx.strokeStyle = "#cbd5e1";
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, -19); ctx.stroke();
    /* blinking LED */
    const led = Math.sin(time * 6) > 0;
    ctx.fillStyle = state.signalLost ? "#f87171" : (led ? "#34d399" : "#134e3a");
    ctx.beginPath(); ctx.arc(0, -19, 2.4, 0, Math.PI * 2); ctx.fill();
    if (led && !state.signalLost) {
      ctx.strokeStyle = "rgba(52,211,153,.5)";
      ctx.beginPath(); ctx.arc(0, -19, 5 + Math.sin(time * 6) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    /* thrust flame during ascent */
    if (state.phase === "ASCENDING" && state.vs > 1) {
      const fl = 8 + Math.random() * 9;
      const fg = ctx.createLinearGradient(sx, sy + 10, sx, sy + 10 + fl);
      fg.addColorStop(0, "rgba(253,224,71,.95)");
      fg.addColorStop(1, "rgba(251,113,36,0)");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(sx - 4, sy + 10);
      ctx.lineTo(sx + 4, sy + 10);
      ctx.lineTo(sx, sy + 10 + fl);
      ctx.closePath();
      ctx.fill();
    }

    /* ---- motion arrow ---- */
    if (Math.abs(state.vs) > 0.5 && state.phase !== "LANDED") {
      const up = state.vs > 0;
      const ax = sx + 26;
      const col = up ? "#34d399" : (state.vs < -12 ? "#f87171" : "#fbbf24");
      ctx.save();
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 8;
      const bounce = Math.sin(time * 5) * 3;
      const ay = sy + (up ? -6 - bounce : 6 + bounce);
      ctx.beginPath();
      if (up) { ctx.moveTo(ax, ay - 10); ctx.lineTo(ax - 6, ay + 2); ctx.lineTo(ax + 6, ay + 2); }
      else { ctx.moveTo(ax, ay + 10); ctx.lineTo(ax - 6, ay - 2); ctx.lineTo(ax + 6, ay - 2); }
      ctx.closePath(); ctx.fill();
      ctx.font = "11px 'Share Tech Mono', monospace";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.shadowBlur = 0;
      ctx.fillText(state.vs.toFixed(1) + " m/s", ax + 10, sy);
      ctx.restore();
    }

    /* ---- phase label ---- */
    ctx.save();
    ctx.font = "700 13px Orbitron, sans-serif";
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    const phc = { READY: "#7d92b5", ASCENDING: "#22d3ee", APOGEE: "#a78bfa", "PARACHUTE DEPLOYED": "#fb923c", DESCENDING: "#fbbf24", LANDED: "#34d399" };
    ctx.fillStyle = phc[state.phase] || "#7d92b5";
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
    ctx.fillText(state.phase, w - 12, 10);
    ctx.restore();

    /* altitude readout under the phase */
    ctx.font = "12px 'Share Tech Mono', monospace";
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(210,230,255,.9)";
    ctx.fillText(alt.toFixed(1) + " m", w - 12, 28);

    /* landed flag */
    if (state.phase === "LANDED") {
      ctx.font = "700 15px Orbitron, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#34d399";
      ctx.shadowColor = "#34d399"; ctx.shadowBlur = 14;
      ctx.fillText("✔ TOUCHDOWN", sx, sy - 44);
      ctx.shadowBlur = 0;
    }
  }

  _cloud(x, y, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.arc(x + r * 0.5, y - r * 0.18, r * 0.42, 0, Math.PI * 2);
    ctx.arc(x - r * 0.55, y + r * 0.06, r * 0.4, 0, Math.PI * 2);
    ctx.arc(x + r * 0.95, y + r * 0.1, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  _mix(a, b, t) {
    return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
  }
}
