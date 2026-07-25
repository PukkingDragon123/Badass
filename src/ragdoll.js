/* BADASS APOCALYPSE - verlet ragdolls, dismemberment and gore */
(function () {
  'use strict';
  const { clamp, clamp01, lerp, rand, randSign, TAU } = BA;

  const MAX_DOLLS = 34;
  const GRAV = 42;

  // bone layout, in local metres for a scale-1 zombie
  //  0 head   1 chest   2 hip   3 handL   4 handR   5 footL   6 footR
  const REST = [
    [0, 1, 0.42],   // neck
    [1, 2, 0.62],   // spine
    [1, 3, 0.86],   // arm L
    [1, 4, 0.86],   // arm R
    [2, 5, 0.88],   // leg L
    [2, 6, 0.88],   // leg R
    [3, 4, 1.05],   // shoulder brace
    [5, 6, 0.55],   // hip brace
  ];
  const START = [
    [0, 1.86, 0.05], [0, 1.30, 0], [0, 0.72, 0],
    [-0.52, 1.24, 0.42], [0.52, 1.24, 0.42],
    [-0.24, 0.02, 0], [0.24, 0.02, 0],
  ];

  class Ragdolls {
    constructor(fx, audio) {
      this.fx = fx;
      this.audio = audio;
      this.list = [];
      this.pool = [];
    }

    reset() {
      while (this.list.length) this.pool.push(this.list.pop());
    }

    alloc() {
      if (this.list.length >= MAX_DOLLS) {
        const old = this.list.shift();
        this.retire(old, true);
        this.pool.push(old);
      }
      let d = this.pool.pop();
      if (!d) {
        d = { p: [], sticks: [] };
        for (let i = 0; i < 7; i++) d.p.push({ x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, r: 0.2, cut: false });
        for (const s of REST) d.sticks.push({ a: s[0], b: s[1], len: s[2], broken: false });
      }
      this.list.push(d);
      return d;
    }

    /* spawn a corpse. dir is the impulse direction, power its magnitude */
    spawn(e, dirX, dirY, dirZ, power, gore) {
      const d = this.alloc();
      const s = e.scale;
      d.scale = s;
      d.col = e.col;
      d.tint = e.tint || 1;
      d.variant = e.variant || 0;
      d.skin = e.skin || [0.55, 0.62, 0.44];
      d.shirt = e.shirt || e.col;
      d.pants = e.pants || [0.2, 0.2, 0.24];
      d.boss = e.type === 'boss' || e.type === 'brute';
      d.life = d.max = d.boss ? 20 : 15;
      d.bleed = 0.9;
      d.settled = 0;
      d.pooled = false;

      const kick = clamp(power, 2, 26);
      for (let i = 0; i < 7; i++) {
        const p = d.p[i];
        const L = START[i];
        p.x = e.x + L[0] * s + rand(-0.05, 0.05);
        p.y = L[1] * s;
        p.z = e.z + L[2] * s;
        p.r = (i === 0 ? 0.30 : i >= 5 ? 0.2 : 0.24) * s;
        p.cut = false;
        // upper body takes more of the hit, so they fold over the bumper
        const w = i === 0 ? 1.35 : i <= 2 ? 1.0 : 0.75;
        const vx = dirX * kick * w + rand(-2.5, 2.5);
        const vy = (dirY * 0.5 + 1) * kick * 0.42 * w + rand(0, 3);
        const vz = dirZ * kick * w + rand(-2.5, 2.5);
        p.px = p.x - vx * (1 / 60);
        p.py = p.y - vy * (1 / 60);
        p.pz = p.z - vz * (1 / 60);
      }
      for (const st of d.sticks) st.broken = false;

      // dismemberment on a hard enough hit
      const goreLevel = gore === undefined ? clamp01((power - 14) / 22) : gore;
      if (goreLevel > 0.02 && !d.boss) {
        const limbs = [2, 3, 4, 5];          // arms and legs, never the spine
        for (const li of limbs) {
          if (Math.random() < goreLevel * 0.32) {
            d.sticks[li].broken = true;
            const idx = REST[li][1];
            d.p[idx].cut = true;
            this.fx.blood(d.p[idx].x, d.p[idx].y, d.p[idx].z, dirX, 0.8, dirZ, 4, 7);
          }
        }
        if (goreLevel > 0.8 && Math.random() < 0.22) {
          d.sticks[0].broken = true;         // decapitation
          d.p[0].cut = true;
          this.fx.blood(d.p[1].x, d.p[1].y + 0.3, d.p[1].z, 0, 1, 0, 7, 10);
          // one callout at a time, or a big pile-up turns into a wall of text
          const now = performance.now();
          if (now - (this.lastGoreShout || 0) > 2600) {
            this.lastGoreShout = now;
            this.fx.text(e.x, 2.8 * s, e.z, 'DECAPITATED!', '#ff4d3d', 22, 'big');
          }
        }
      }
      return d;
    }

    /* shove every nearby corpse - explosions should throw bodies around */
    blast(x, z, radius, power) {
      for (const d of this.list) {
        for (const p of d.p) {
          const dx = p.x - x, dz = p.z - z;
          const dist = Math.hypot(dx, dz);
          if (dist > radius) continue;
          const f = (1 - dist / radius) * power;
          const nx = dist > 0.01 ? dx / dist : rand(-1, 1);
          const nz = dist > 0.01 ? dz / dist : rand(-1, 1);
          p.px -= nx * f * (1 / 60);
          p.py -= (f * 0.75) * (1 / 60);
          p.pz -= nz * f * (1 / 60);
        }
        d.settled = 0;
        d.bleed = Math.max(d.bleed, 0.4);
      }
    }

    update(dt, groundAt, car) {
      const step = Math.min(dt, 1 / 45);
      for (let i = this.list.length - 1; i >= 0; i--) {
        const d = this.list[i];
        d.life -= dt;
        if (d.life <= 0) {
          this.retire(d, false);
          this.list.splice(i, 1);
          this.pool.push(d);
          continue;
        }

        let moving = 0;
        for (const p of d.p) {
          const vx = (p.x - p.px) * 0.995;
          const vy = (p.y - p.py) * 0.995;
          const vz = (p.z - p.pz) * 0.995;
          p.px = p.x; p.py = p.y; p.pz = p.z;
          p.x += vx; p.z += vz;
          p.y += vy - GRAV * step * step;
          moving += Math.abs(vx) + Math.abs(vy) + Math.abs(vz);

          const gy = groundAt ? groundAt(p.x, p.z) : 0;
          if (p.y < gy + p.r) {
            p.y = gy + p.r;
            const bounce = 0.22;
            if (p.py > p.y) p.py = p.y + (p.py - p.y) * bounce;
            // ground friction
            p.px = p.x - (p.x - p.px) * 0.62;
            p.pz = p.z - (p.z - p.pz) * 0.62;
          }
        }

        // constraint solve
        for (let it = 0; it < 3; it++) {
          for (const st of d.sticks) {
            if (st.broken) continue;
            const a = d.p[st.a], b = d.p[st.b];
            const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
            const dist = Math.hypot(dx, dy, dz) || 0.0001;
            const rest = st.len * d.scale;
            const diff = (dist - rest) / dist * 0.5;
            const cx = dx * diff, cy = dy * diff, cz = dz * diff;
            a.x += cx; a.y += cy; a.z += cz;
            b.x -= cx; b.y -= cy; b.z -= cz;
          }
        }

        // the truck can punt corpses around
        if (car) {
          const cr = 3.2;
          for (const p of d.p) {
            const dx = p.x - car.x, dz = p.z - car.z;
            const dist = Math.hypot(dx, dz);
            if (dist < cr && p.y < 2.4 && car.speed > 4) {
              const nx = dist > 0.01 ? dx / dist : 1, nz = dist > 0.01 ? dz / dist : 0;
              const push = (cr - dist) * 0.35 + car.speed * 0.02;
              p.px -= nx * push * step * 12;
              p.pz -= nz * push * step * 12;
              p.py -= 0.14;
              d.settled = 0;
              d.bleed = Math.max(d.bleed, 0.35);
            }
          }
        }

        d.speed = moving / (step * 7);
        if (d.speed < 0.9) d.settled += dt; else d.settled = 0;

        // blood trail while the body is still being dragged
        if (d.bleed > 0) {
          d.bleed -= dt * 0.35;
          if (d.speed > 2.5 && Math.random() < dt * 13) {
            const p = d.p[1];
            this.fx.blood(p.x, p.y, p.z, rand(-1, 1), 0.4, rand(-1, 1), 1, 3);
            if (Math.random() < 0.35) this.fx.splat(p.x, p.z, rand(0.5, 1.1) * d.scale, 0.30, 0.03, 0.05, 0.55);
          }
        }
        if (!d.pooled && d.settled > 0.55) {
          d.pooled = true;
          const p = d.p[1];
          this.fx.splat(p.x, p.z, rand(1.5, 2.4) * d.scale, 0.26, 0.02, 0.04, 0.72);
          for (const q of d.p) {
            if (q.cut) this.fx.splat(q.x, q.z, rand(0.8, 1.4) * d.scale, 0.30, 0.03, 0.05, 0.6);
          }
        }
      }
    }

    retire(d, violent) {
      const p = d.p[1];
      if (violent) this.fx.splat(p.x, p.z, 2.0 * d.scale, 0.22, 0.02, 0.03, 0.6);
    }

    draw(R, camX, camZ) {
      for (const d of this.list) {
        const p = d.p;
        if ((p[1].x - camX) ** 2 + (p[1].z - camZ) ** 2 > 190 * 190) continue;
        const fade = clamp01(d.life / 2.2);          // sink into the dirt at the end
        const s = d.scale * lerp(0.55, 1, fade);
        const sink = (1 - fade) * 0.5 * d.scale;

        const shirt = d.shirt, pants = d.pants, skin = d.skin;
        const dim = lerp(0.55, 1, fade);
        const C = (c, m) => [c[0] * dim * (m || 1), c[1] * dim * (m || 1), c[2] * dim * (m || 1)];

        const bone = (ia, ib, w, col, stick) => {
          if (stick !== undefined && d.sticks[stick].broken) return;
          const a = p[ia], b = p[ib];
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          const len = Math.hypot(dx, dy, dz) || 0.001;
          const yaw = Math.atan2(dx, dz);
          const pitch = -Math.asin(clamp(dy / len, -1, 1));
          R.push('box', 'opaque',
            (a.x + b.x) / 2, (a.y + b.y) / 2 - sink, (a.z + b.z) / 2,
            yaw, pitch, 0, w * s, w * s, len, col[0], col[1], col[2], 0);
        };

        // torso as a slab between chest and hip
        bone(1, 2, 0.78, C(shirt), 1);
        bone(1, 3, 0.26, C(skin, 0.95), 2);
        bone(1, 4, 0.26, C(skin, 0.95), 3);
        bone(2, 5, 0.30, C(pants), 4);
        bone(2, 6, 0.30, C(pants), 5);
        if (!d.sticks[0].broken) bone(0, 1, 0.30, C(skin, 0.9));

        // head
        const h = p[0];
        const neck = d.sticks[0].broken ? 0 : Math.atan2(h.x - p[1].x, h.z - p[1].z);
        R.push('box', 'opaque', h.x, h.y - sink, h.z, neck, 0, 0,
          0.55 * s, 0.55 * s, 0.55 * s, ...C(skin, 1.08), 0);
        // dead eyes keep glowing for a beat
        if (fade > 0.6) {
          R.push('box', 'glow', h.x, h.y + 0.06 * s - sink, h.z + 0.16 * s, neck, 0, 0,
            0.3 * s, 0.08 * s, 0.06 * s, 0.5 * fade, 0.06 * fade, 0.04 * fade, 1);
        }

        // stumps where limbs came off
        for (let i = 0; i < 7; i++) {
          if (!p[i].cut) continue;
          R.push('sphere', 'opaque', p[i].x, p[i].y - sink, p[i].z, 0, 0, 0,
            0.36 * s, 0.36 * s, 0.36 * s, 0.42 * dim, 0.04 * dim, 0.06 * dim, 0);
        }

        R.shadow(p[1].x, p[1].z, 1.8 * s, 0.42 * fade);
      }
    }
  }

  BA.Ragdolls = Ragdolls;
})();
