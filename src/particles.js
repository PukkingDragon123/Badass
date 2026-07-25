/* BADASS APOCALYPSE - particles, shockwaves, decals, floating text */
(function () {
  'use strict';
  const { rand, randSign, clamp, clamp01, lerp, TAU } = BA;

  const MAX_P = 3000;

  class FX {
    constructor() {
      this.pool = [];
      this.live = [];
      for (let i = 0; i < MAX_P; i++) {
        this.pool.push({
          x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
          ry: 0, rx: 0, rz: 0, rvx: 0, rvy: 0, rvz: 0,
          sx: 1, sy: 1, sz: 1, r: 1, g: 1, b: 1, e: 0,
          life: 0, max: 1, grav: 0, drag: 0, bounce: 0,
          mesh: 'box', layer: 'opaque', shrink: 1, stretch: 0, spin: 0,
        });
      }
      this.waves = [];
      this.texts = [];
      this.decals = [];
      this.decalIdx = 0;
      this.maxDecals = 260;
    }

    spawn() {
      if (!this.pool.length) {
        // recycle the oldest
        const p = this.live.shift();
        if (!p) return null;
        this.live.push(p);
        return p;
      }
      const p = this.pool.pop();
      p.fade = 0; p.stretch = 0; p.e = 0;
      this.live.push(p);
      return p;
    }

    /* -------------------------------------------------------- emitters */
    blood(x, y, z, dx, dy, dz, count, power, col) {
      const c = col || [0.62, 0.06, 0.09];
      for (let i = 0; i < count; i++) {
        const p = this.spawn(); if (!p) return;
        const s = rand(0.11, 0.3) * (0.7 + clamp01(power / 14) * 0.75);
        p.x = x + rand(-0.3, 0.3); p.y = y + rand(-0.2, 0.4); p.z = z + rand(-0.3, 0.3);
        const spread = 0.75;
        p.vx = dx * power * rand(0.4, 1.4) + rand(-spread, spread) * power;
        p.vy = dy * power * rand(0.3, 1.2) + rand(1.5, 7.5);
        p.vz = dz * power * rand(0.4, 1.4) + rand(-spread, spread) * power;
        p.rx = rand(TAU); p.ry = rand(TAU); p.rz = rand(TAU);
        p.rvx = rand(-9, 9); p.rvy = rand(-9, 9); p.rvz = rand(-9, 9);
        p.sx = s; p.sy = s * rand(0.6, 1.3); p.sz = s;
        p.r = c[0] * rand(0.75, 1.15); p.g = c[1] * rand(0.7, 1.4); p.b = c[2] * rand(0.7, 1.3);
        p.e = 0;
        p.max = p.life = rand(0.7, 1.6);
        p.grav = 26; p.drag = 0.6; p.bounce = 0.28;
        p.mesh = 'box'; p.layer = 'opaque'; p.shrink = 0.55; p.stretch = 0.5;
      }
    }

    gibs(x, y, z, dx, dy, dz, count, power, col) {
      for (let i = 0; i < count; i++) {
        const p = this.spawn(); if (!p) return;
        const s = rand(0.22, 0.55);
        p.x = x + rand(-0.4, 0.4); p.y = y + rand(0.1, 1.2); p.z = z + rand(-0.4, 0.4);
        p.vx = dx * power * rand(0.5, 1.5) + rand(-4, 4);
        p.vy = rand(4, 11) + dy * power * 0.4;
        p.vz = dz * power * rand(0.5, 1.5) + rand(-4, 4);
        p.rx = rand(TAU); p.ry = rand(TAU); p.rz = rand(TAU);
        p.rvx = rand(-16, 16); p.rvy = rand(-16, 16); p.rvz = rand(-16, 16);
        p.sx = s * rand(0.7, 1.5); p.sy = s * rand(0.7, 1.6); p.sz = s * rand(0.7, 1.4);
        const c = col || [0.44, 0.55, 0.30];
        p.r = c[0] * rand(0.8, 1.15); p.g = c[1] * rand(0.8, 1.15); p.b = c[2] * rand(0.8, 1.15);
        p.e = 0;
        p.max = p.life = rand(1.4, 2.6);
        p.grav = 28; p.drag = 0.35; p.bounce = 0.42;
        p.mesh = 'box'; p.layer = 'opaque'; p.shrink = 0.15;
      }
    }

    sparks(x, y, z, count, r, g, b, power) {
      for (let i = 0; i < count; i++) {
        const p = this.spawn(); if (!p) return;
        p.x = x; p.y = y; p.z = z;
        const a = rand(TAU), e = rand(0.1, 1.3);
        const sp = rand(3, 15) * (power || 1);
        p.vx = Math.cos(a) * sp; p.vy = e * sp * 0.7; p.vz = Math.sin(a) * sp;
        p.rx = rand(TAU); p.ry = rand(TAU); p.rz = rand(TAU);
        p.rvx = rand(-20, 20); p.rvy = rand(-20, 20); p.rvz = rand(-20, 20);
        const s = rand(0.07, 0.17);
        p.sx = s; p.sy = s; p.sz = s * rand(1, 3.5);
        p.r = r; p.g = g; p.b = b; p.e = 1;
        p.max = p.life = rand(0.22, 0.6);
        p.grav = 16; p.drag = 1.4; p.bounce = 0.4;
        p.mesh = 'box'; p.layer = 'glow'; p.shrink = 0.9; p.stretch = 1.4;
      }
    }

    smoke(x, y, z, count, size, r, g, b, up) {
      for (let i = 0; i < count; i++) {
        const p = this.spawn(); if (!p) return;
        p.x = x + rand(-0.5, 0.5); p.y = y + rand(0, 0.4); p.z = z + rand(-0.5, 0.5);
        p.vx = rand(-1.4, 1.4); p.vy = rand(0.6, 2.6) * (up || 1); p.vz = rand(-1.4, 1.4);
        p.rx = rand(TAU); p.ry = rand(TAU); p.rz = rand(TAU);
        p.rvx = rand(-1.4, 1.4); p.rvy = rand(-1.4, 1.4); p.rvz = rand(-1.4, 1.4);
        const s = size * rand(0.9, 1.5);
        p.sx = p.sy = p.sz = s;
        p.r = r; p.g = g; p.b = b * 1.04; p.e = 0;
        p.max = p.life = rand(0.4, 0.95);
        p.grav = -1.2; p.drag = 2.4; p.bounce = 0;
        // puffs shrink away rather than darken - opaque geometry can't fade out
        p.mesh = 'sphere'; p.layer = 'opaque'; p.shrink = 0.94; p.fade = 0.35;
      }
    }

    fire(x, y, z, count, size, power) {
      for (let i = 0; i < count; i++) {
        const p = this.spawn(); if (!p) return;
        p.x = x + rand(-0.4, 0.4); p.y = y + rand(0, 0.5); p.z = z + rand(-0.4, 0.4);
        p.vx = rand(-2, 2) * (power || 1); p.vy = rand(2, 7); p.vz = rand(-2, 2) * (power || 1);
        p.rx = rand(TAU); p.ry = rand(TAU); p.rz = rand(TAU);
        p.rvx = rand(-4, 4); p.rvy = rand(-4, 4); p.rvz = rand(-4, 4);
        const s = size * rand(0.6, 1.5);
        p.sx = p.sy = p.sz = s;
        const t = rand(0, 1);
        p.r = 0.85; p.g = lerp(0.48, 0.15, t); p.b = lerp(0.14, 0.02, t); p.e = 1;
        p.max = p.life = rand(0.25, 0.65);
        p.grav = -4; p.drag = 1.6; p.bounce = 0;
        p.mesh = 'sphere'; p.layer = 'glow'; p.shrink = 0.8;
      }
    }

    shard(x, y, z, count, r, g, b) {
      for (let i = 0; i < count; i++) {
        const p = this.spawn(); if (!p) return;
        p.x = x; p.y = y; p.z = z;
        const a = rand(TAU);
        p.vx = Math.cos(a) * rand(2, 9); p.vy = rand(2, 9); p.vz = Math.sin(a) * rand(2, 9);
        p.rx = rand(TAU); p.ry = rand(TAU); p.rz = rand(TAU);
        p.rvx = rand(-12, 12); p.rvy = rand(-12, 12); p.rvz = rand(-12, 12);
        const s = rand(0.14, 0.3);
        p.sx = s; p.sy = s * 0.25; p.sz = s * rand(1, 2);
        p.r = r; p.g = g; p.b = b; p.e = 0.1;
        p.max = p.life = rand(0.8, 1.8);
        p.grav = 30; p.drag = 0.4; p.bounce = 0.5;
        p.mesh = 'box'; p.layer = 'opaque'; p.shrink = 0.2;
      }
    }

    wave(x, y, z, r0, r1, dur, cr, cg, cb, thick) {
      this.waves.push({ x, y, z, r0, r1, t: 0, dur, r: cr, g: cg, b: cb, thick: thick || 1 });
    }

    text(x, y, z, str, col, size, kind) {
      if (this.texts.length > 60) this.texts.shift();
      this.texts.push({ x, y, z, str, col: col || '#fff', size: size || 22, t: 0, dur: kind === 'big' ? 1.5 : 0.9, kind: kind || 'small', vy: kind === 'big' ? 2.4 : 3.4, jx: rand(-0.6, 0.6) });
    }

    splat(x, z, radius, r, g, b, alpha) {
      const d = { x, z, radius, yaw: rand(TAU), r, g, b, a: alpha === undefined ? 0.85 : alpha, born: 0 };
      if (this.decals.length < this.maxDecals) this.decals.push(d);
      else { this.decals[this.decalIdx] = d; this.decalIdx = (this.decalIdx + 1) % this.maxDecals; }
    }

    /* ---------------------------------------------------------- update */
    update(dt, groundAt) {
      const live = this.live;
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i];
        p.life -= dt;
        if (p.life <= 0) {
          live.splice(i, 1);
          this.pool.push(p);
          continue;
        }
        const dragK = Math.exp(-p.drag * dt);
        p.vx *= dragK; p.vz *= dragK;
        p.vy = (p.vy - p.grav * dt) * (p.grav < 0 ? dragK : 1);
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const gy = groundAt ? groundAt(p.x, p.z) : 0;
        if (p.y < gy + p.sy * 0.4 && p.bounce > 0) {
          p.y = gy + p.sy * 0.4;
          if (p.vy < 0) {
            p.vy = -p.vy * p.bounce;
            p.vx *= 0.62; p.vz *= 0.62;
            p.rvx *= 0.5; p.rvz *= 0.5;
            if (Math.abs(p.vy) < 0.7) { p.vy = 0; p.grav = 0; p.rvx = p.rvy = p.rvz = 0; }
          }
        } else if (p.y < gy && p.bounce === 0) {
          p.y = gy;
        }
        p.rx += p.rvx * dt; p.ry += p.rvy * dt; p.rz += p.rvz * dt;
      }

      for (let i = this.waves.length - 1; i >= 0; i--) {
        const w = this.waves[i];
        w.t += dt;
        if (w.t >= w.dur) this.waves.splice(i, 1);
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.t += dt;
        t.y += t.vy * dt;
        t.vy *= Math.exp(-2.4 * dt);
        if (t.t >= t.dur) this.texts.splice(i, 1);
      }
    }

    /* ------------------------------------------------------------ draw */
    draw(R) {
      for (const p of this.live) {
        const k = clamp01(p.life / p.max);
        let sx = p.sx, sy = p.sy, sz = p.sz;
        if (p.shrink > 0) {
          const f = lerp(1 - p.shrink, 1, k);
          sx *= f; sy *= f; sz *= f;
        } else if (p.shrink < 0) {
          const f = lerp(1 - p.shrink, 1, k);
          sx *= f; sy *= f; sz *= f;
        }
        if (p.stretch) {
          const sp = Math.hypot(p.vx, p.vy, p.vz);
          const st = 1 + clamp(sp * 0.028 * p.stretch, 0, 1.7);
          sz *= st;
          sx /= Math.sqrt(st); sy /= Math.sqrt(st);
        }
        const e = p.layer === 'glow' ? p.e * (0.35 + k * 0.9) : p.e;
        const dim = p.layer === 'glow' ? k : (p.fade ? lerp(1 - p.fade, 1, k * k) : 1);
        R.push(p.mesh, p.layer, p.x, p.y, p.z, p.ry, p.rx, p.rz, sx, sy, sz,
          p.r * dim, p.g * dim, p.b * dim, e);
      }

      for (const w of this.waves) {
        const k = clamp01(w.t / w.dur);
        const r = lerp(w.r0, w.r1, 1 - Math.pow(1 - k, 2.2));
        const a = Math.pow(1 - k, 1.6);
        R.push('ring', 'glow', w.x, w.y + 0.05, w.z, 0, 0, 0,
          r * 2, 1 + w.thick * 2 * a, r * 2, w.r * a, w.g * a, w.b * a, 1);
      }

      for (const d of this.decals) {
        R.decal(d.x, d.z, d.radius, d.yaw, d.r, d.g, d.b, d.a);
      }
    }

    drawText(ctx, R, w, h) {
      const out = [0, 0, 0];
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of this.texts) {
        R.worldToScreen(t.x + t.jx, t.y, t.z, out);
        if (out[2] < 0.1) continue;
        const k = t.t / t.dur;
        const alpha = k < 0.12 ? k / 0.12 : Math.pow(1 - (k - 0.12) / 0.88, 0.8);
        const pop = k < 0.16 ? 1 + (1 - k / 0.16) * 0.9 : 1;
        const distScale = clamp(26 / out[2], 0.35, 1.5);
        const size = t.size * pop * distScale;
        const x = out[0] * w, y = out[1] * h;
        ctx.globalAlpha = clamp01(alpha);
        ctx.font = `900 ${size.toFixed(1)}px "Arial Black", Impact, system-ui, sans-serif`;
        ctx.lineWidth = Math.max(2, size * 0.16);
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(t.str, x, y);
        ctx.fillStyle = t.col;
        ctx.fillText(t.str, x, y);
      }
      ctx.restore();
    }

    clear() {
      while (this.live.length) this.pool.push(this.live.pop());
      this.waves.length = 0;
      this.texts.length = 0;
      this.decals.length = 0;
      this.decalIdx = 0;
    }
  }

  BA.FX = FX;
})();
