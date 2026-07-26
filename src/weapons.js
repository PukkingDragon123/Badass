/* BADASS APOCALYPSE - auto-firing arsenal */
(function () {
  'use strict';
  const { clamp, clamp01, lerp, rand, TAU } = BA;

  function beam(R, layer, x1, y1, z1, x2, y2, z2, w, r, g, b, e) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz) || 0.001;
    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.asin(clamp(dy / len, -1, 1));
    R.push('box', layer, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, yaw, pitch, 0, w, w, len, r, g, b, e === undefined ? 1 : e);
  }

  // squared distance from a point to a 2D segment
  function segDist2(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = clamp(t, 0, 1);
    const cx = ax + dx * t, cz = az + dz * t;
    return (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
  }

  class Weapons {
    constructor(fx, audio) {
      this.fx = fx;
      this.audio = audio;
      this.reset();
    }

    reset() {
      this.rockets = [];
      this.bullets = [];
      this.mines = [];
      this.patches = [];
      this.bolts = [];
      this.sawAngle = 0;
      this.laser = null;
      this.rail = { charge: 0, beam: null };
      this.droneAngle = 0;
      this.cd = { rocket: 0, minigun: 0, tesla: 0, mine: 0, flame: 0, pulse: 0, drone: 0 };
    }

    nearest(horde, x, z, maxDist, exclude) {
      let best = null, bd = maxDist * maxDist;
      for (const e of horde.list) {
        if (e.dead || (exclude && exclude.has(e))) continue;
        const d = (e.x - x) * (e.x - x) + (e.z - z) * (e.z - z);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    update(dt, car, horde, game) {
      const L = game.weaponLevels;
      const cdMul = 1 / car.stats.cooldown;
      const dmgMul = car.stats.damage;
      const fx_ = Math.sin(car.yaw), fz = Math.cos(car.yaw);

      /* ---------------------------------------------------- rockets */
      if (L.rocket > 0) {
        this.cd.rocket -= dt;
        if (this.cd.rocket <= 0) {
          this.cd.rocket = (1.65 - L.rocket * 0.15) * cdMul;
          const shots = 1 + Math.floor(L.rocket / 2);
          const used = new Set();
          for (let i = 0; i < shots; i++) {
            const t = this.nearest(horde, car.x, car.z, 62, used);
            if (!t) break;
            used.add(t);
            const side = i % 2 === 0 ? 1 : -1;
            const ox = Math.cos(car.yaw) * side * 0.9;
            const oz = -Math.sin(car.yaw) * side * 0.9;
            this.rockets.push({
              x: car.x + ox, y: 1.3, z: car.z + oz,
              vx: car.vx * 0.4 + ox * 5 + fx_ * 12, vy: 6.5, vz: car.vz * 0.4 + oz * 5 + fz * 12,
              target: t, life: 3.2, dmg: (34 + L.rocket * 16) * dmgMul,
              radius: 7 + L.rocket * 0.9, armed: 0.16,
            });
          }
          if (this.rockets.length) this.audio.rocket();
        }
      }

      for (let i = this.rockets.length - 1; i >= 0; i--) {
        const r = this.rockets[i];
        r.life -= dt;
        r.armed -= dt;
        let t = r.target;
        if (!t || t.dead) t = r.target = this.nearest(horde, r.x, r.z, 70);
        if (t && r.armed <= 0) {
          const dx = t.x - r.x, dy = 0.9 * t.scale - r.y, dz = t.z - r.z;
          const d = Math.hypot(dx, dy, dz) || 1;
          const steer = 15 * dt;
          r.vx += (dx / d) * 62 * dt; r.vy += (dy / d) * 62 * dt; r.vz += (dz / d) * 62 * dt;
          const sp = Math.hypot(r.vx, r.vy, r.vz);
          const want = 46;
          r.vx *= want / sp; r.vy *= want / sp; r.vz *= want / sp;
        } else {
          r.vy -= 18 * dt;
        }
        r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
        if (Math.random() < dt * 120) this.fx.fire(r.x, r.y, r.z, 1, 0.4, 0.4);
        if (Math.random() < dt * 30) this.fx.smoke(r.x, r.y, r.z, 1, 0.36, 0.30, 0.28, 0.28, 0.2);

        let hit = r.y <= 0.25 || r.life <= 0;
        if (!hit && t) {
          const d = Math.hypot(t.x - r.x, t.z - r.z);
          if (d < t.radius + 0.9 && Math.abs(r.y - 0.9 * t.scale) < 1.6 * t.scale) hit = true;
        }
        if (hit) {
          this.rockets.splice(i, 1);
          game.explosion(r.x, r.z, r.radius, r.dmg, 'rocket');
          this.fx.fire(r.x, Math.max(0.4, r.y), r.z, 20, 1.1, 1.6);
          this.fx.smoke(r.x, Math.max(0.5, r.y), r.z, 8, 1.3, 0.2, 0.19, 0.19, 1.2);
          this.fx.wave(r.x, 0.1, r.z, 1, r.radius * 1.6, 0.38, 1.4, 0.7, 0.2, 1.1);
          this.fx.splat(r.x, r.z, r.radius * 0.5, 0.08, 0.07, 0.06, 0.55);
          this.audio.explode(0.9);
          game.shake(0.3);
        }
      }

      /* ---------------------------------------------------- minigun */
      if (L.minigun > 0) {
        this.cd.minigun -= dt;
        const rate = (0.13 - L.minigun * 0.014) * cdMul;
        if (this.cd.minigun <= 0) {
          const t = this.nearest(horde, car.x, car.z, 46);
          if (t) {
            this.cd.minigun = rate;
            const barrels = 1 + Math.floor((L.minigun - 1) / 2);
            for (let k = 0; k < barrels; k++) {
              const ox = Math.cos(car.yaw) * (k === 0 ? 0.7 : -0.7);
              const oz = -Math.sin(car.yaw) * (k === 0 ? 0.7 : -0.7);
              const sx = car.x + ox, sz = car.z + oz, sy = 1.55;
              const dx = t.x - sx, dy = 1.0 * t.scale - sy, dz = t.z - sz;
              const d = Math.hypot(dx, dy, dz) || 1;
              const spread = 0.055;
              this.bullets.push({
                x: sx, y: sy, z: sz,
                vx: (dx / d + rand(-spread, spread)) * 105,
                vy: (dy / d) * 105,
                vz: (dz / d + rand(-spread, spread)) * 105,
                life: 0.65, dmg: (7 + L.minigun * 4.5) * dmgMul,
              });
            }
            this.audio.shoot();
            this.fx.sparks(car.x + fx_ * 0.5, 1.6, car.z + fz * 0.5, 2, 1.4, 1.0, 0.35, 0.5);
          } else this.cd.minigun = 0.1;
        }
      }
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        b.life -= dt;
        const px = b.x, py = b.y, pz = b.z;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        b.px = px; b.py = py; b.pz = pz;
        let done = b.life <= 0 || b.y < 0.1;
        if (!done) {
          const near = horde.grid.query(b.x, b.z, 2.2, []);
          for (const e of near) {
            if (e.dead) continue;
            if (Math.hypot(e.x - b.x, e.z - b.z) < e.radius + 0.35 && b.y < 2.2 * e.scale) {
              const d = Math.hypot(b.vx, b.vz) || 1;
              horde.damage(e, b.dmg, b.vx / d, b.vz / d, 6, game);
              this.fx.blood(b.x, b.y, b.z, b.vx / d, 0.3, b.vz / d, 3, 3);
              done = true;
              break;
            }
          }
        }
        if (done) this.bullets.splice(i, 1);
      }

      /* ---------------------------------------------------- saw blades */
      if (L.saw > 0) {
        const count = 1 + L.saw;
        const radius = 4.0 + L.saw * 0.65;
        const speed = 3.4 + L.saw * 0.45;
        this.sawAngle += dt * speed;
        const dmg = (13 + L.saw * 9) * dmgMul;
        for (let i = 0; i < count; i++) {
          const a = this.sawAngle + (i / count) * TAU;
          const sx = car.x + Math.sin(a) * radius;
          const sz = car.z + Math.cos(a) * radius;
          const near = horde.grid.query(sx, sz, 2.6, []);
          for (const e of near) {
            if (e.dead) continue;
            if (Math.hypot(e.x - sx, e.z - sz) < e.radius + 1.1) {
              e.sawCd = (e.sawCd || 0) - dt;
              if (e.sawCd <= 0) {
                e.sawCd = 0.28;
                const dx = e.x - car.x, dz = e.z - car.z;
                const d = Math.hypot(dx, dz) || 1;
                horde.damage(e, dmg, dx / d, dz / d, 16, game);
                this.fx.blood(sx, 1.0, sz, dx / d, 0.6, dz / d, 5, 5);
                this.fx.sparks(sx, 1.0, sz, 4, 1.3, 0.9, 0.4, 0.8);
              }
            }
          }
        }
      }

      /* ---------------------------------------------------- flame trail */
      if (L.flame > 0) {
        this.cd.flame -= dt;
        if (this.cd.flame <= 0) {
          this.cd.flame = 0.16;
          const bx = car.x - fx_ * 2.8, bz = car.z - fz * 2.8;
          const life = 2.2 + L.flame * 0.4;
          // refresh an overlapping patch instead of stacking additive discs
          let merged = null;
          for (const p of this.patches) {
            if ((p.x - bx) * (p.x - bx) + (p.z - bz) * (p.z - bz) < 4) { merged = p; break; }
          }
          if (merged) { merged.life = merged.max; }
          else {
            this.patches.push({
              x: bx, z: bz, r: 2.0 + L.flame * 0.42, life, max: life,
              dps: (10 + L.flame * 8) * dmgMul,
            });
          }
          this.fx.fire(bx, 0.35, bz, 1, 0.6, 0.5);
        }
      }
      for (let i = this.patches.length - 1; i >= 0; i--) {
        const p = this.patches[i];
        p.life -= dt;
        if (p.life <= 0) { this.patches.splice(i, 1); continue; }
        if (Math.random() < dt * 9) this.fx.fire(p.x + rand(-p.r * 0.6, p.r * 0.6), 0.25, p.z + rand(-p.r * 0.6, p.r * 0.6), 1, 0.5, 0.3);
        const near = horde.grid.query(p.x, p.z, p.r + 2, []);
        for (const e of near) {
          if (e.dead) continue;
          if (Math.hypot(e.x - p.x, e.z - p.z) < p.r + e.radius) {
            e.burn = Math.max(e.burn, 1.4);
            e.burnDps = Math.max(e.burnDps || 0, p.dps);
          }
        }
      }

      /* ---------------------------------------------------- tesla coil */
      if (L.tesla > 0) {
        this.cd.tesla -= dt;
        if (this.cd.tesla <= 0) {
          const first = this.nearest(horde, car.x, car.z, 34);
          if (first) {
            this.cd.tesla = (1.5 - L.tesla * 0.14) * cdMul;
            const chains = 2 + L.tesla;
            const dmg = (22 + L.tesla * 14) * dmgMul;
            const used = new Set();
            let from = { x: car.x, y: 1.9, z: car.z };
            let cur = first;
            const pts = [from];
            for (let i = 0; i < chains && cur; i++) {
              used.add(cur);
              pts.push({ x: cur.x, y: 1.1 * cur.scale, z: cur.z });
              const dx = cur.x - from.x, dz = cur.z - from.z;
              const d = Math.hypot(dx, dz) || 1;
              horde.damage(cur, dmg, dx / d, dz / d, 10, game);
              this.fx.sparks(cur.x, 1.2 * cur.scale, cur.z, 8, 0.5, 0.85, 1.5, 1.1);
              cur.slow = Math.max(cur.slow, 0.8);
              from = pts[pts.length - 1];
              cur = this.nearest(horde, from.x, from.z, 17, used);
            }
            this.bolts.push({ pts, life: 0.22, max: 0.22 });
            this.audio.zap();
          } else this.cd.tesla = 0.25;
        }
      }
      for (let i = this.bolts.length - 1; i >= 0; i--) {
        this.bolts[i].life -= dt;
        if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
      }

      /* ---------------------------------------------------- mines */
      if (L.mine > 0) {
        this.cd.mine -= dt;
        if (this.cd.mine <= 0) {
          this.cd.mine = (2.1 - L.mine * 0.2) * cdMul;
          this.mines.push({
            x: car.x - fx_ * 3.4, z: car.z - fz * 3.4, y: 0.35,
            arm: 0.6, life: 14, dmg: (55 + L.mine * 32) * dmgMul, radius: 7 + L.mine,
          });
        }
      }
      for (let i = this.mines.length - 1; i >= 0; i--) {
        const m = this.mines[i];
        m.life -= dt; m.arm -= dt;
        let boom = m.life <= 0;
        if (!boom && m.arm <= 0) {
          const near = horde.grid.query(m.x, m.z, 3.2, []);
          for (const e of near) {
            if (!e.dead && Math.hypot(e.x - m.x, e.z - m.z) < e.radius + 1.5) { boom = true; break; }
          }
        }
        if (boom) {
          this.mines.splice(i, 1);
          game.explosion(m.x, m.z, m.radius, m.dmg, 'mine');
          this.fx.fire(m.x, 0.6, m.z, 22, 1.2, 1.9);
          this.fx.wave(m.x, 0.1, m.z, 1, m.radius * 1.7, 0.4, 1.3, 0.9, 0.25, 1.2);
          this.fx.splat(m.x, m.z, m.radius * 0.45, 0.08, 0.07, 0.06, 0.5);
          this.audio.explode(1.0);
          game.shake(0.34);
        }
      }

      /* ---------------------------------------------------- laser array */
      if (L.laser > 0) {
        const t = this.nearest(horde, car.x, car.z, 34 + L.laser * 5);
        if (t) {
          const ox = car.x, oz = car.z, oy = 2.6;
          const dx = t.x - ox, dz = t.z - oz;
          const d = Math.hypot(dx, dz) || 1;
          const reach = 36 + L.laser * 6;
          const ex = ox + (dx / d) * reach, ez = oz + (dz / d) * reach;
          this.laser = { ox, oy, oz, ex, ez, t };
          const dps = (26 + L.laser * 22) * dmgMul;
          const width = 1.1 + L.laser * 0.22;
          // the beam burns straight through everything it touches
          const near = horde.grid.query((ox + ex) / 2, (oz + ez) / 2, reach * 0.6 + 6, []);
          for (const e of near) {
            if (e.dead) continue;
            if (segDist2(e.x, e.z, ox, oz, ex, ez) < (width + e.radius) * (width + e.radius)) {
              e.laserTick = (e.laserTick || 0) - dt;
              if (e.laserTick <= 0) {
                e.laserTick = 0.15;
                horde.damage(e, dps * 0.15, dx / d, dz / d, 2, game);
                if (Math.random() < 0.4) this.fx.fire(e.x, 1.1 * e.scale, e.z, 1, 0.35, 0.3);
              }
            }
          }
          if (Math.random() < dt * 40) this.fx.sparks(t.x, 1.0 * t.scale, t.z, 2, 1.2, 0.3, 1.4, 0.9);
        } else this.laser = null;
      } else this.laser = null;

      /* ---------------------------------------------------- railgun */
      if (L.rail > 0) {
        this.rail.charge += dt / ((2.6 - L.rail * 0.22) * cdMul);
        if (this.rail.charge >= 1) {
          const t = this.nearest(horde, car.x, car.z, 90);
          this.rail.charge = 0;
          const ang = t ? Math.atan2(t.x - car.x, t.z - car.z) : car.yaw;
          const ox = car.x, oz = car.z;
          const len = 110;
          const ex = ox + Math.sin(ang) * len, ez = oz + Math.cos(ang) * len;
          const dmg = (150 + L.rail * 120) * dmgMul;
          const width = 1.6 + L.rail * 0.3;
          for (const e of [...horde.list]) {
            if (e.dead) continue;
            if (segDist2(e.x, e.z, ox, oz, ex, ez) < (width + e.radius) * (width + e.radius)) {
              e.vy = 9; e.airborne = true;
              horde.damage(e, dmg, Math.sin(ang), Math.cos(ang), 60, game, true);
            }
          }
          this.rail.beam = { ox, oz, ex, ez, life: 0.45, max: 0.45 };
          this.audio.explode(1.2);
          this.fx.sparks(car.x + Math.sin(ang) * 3, 2.6, car.z + Math.cos(ang) * 3, 22, 0.7, 0.9, 1.6, 2.0);
          game.shake(0.5);
          game.flash(0.3, [0.6, 0.8, 1.0]);
          // recoil
          car.vx -= Math.sin(ang) * 6;
          car.vz -= Math.cos(ang) * 6;
        }
        if (this.rail.beam) {
          this.rail.beam.life -= dt;
          if (this.rail.beam.life <= 0) this.rail.beam = null;
        }
      }

      /* ---------------------------------------------------- drone swarm */
      if (L.drone > 0) {
        this.droneAngle += dt * 1.5;
        this.cd.drone -= dt;
        if (this.cd.drone <= 0) {
          const count = 1 + L.drone;
          const used = new Set();
          let fired = 0;
          for (let i = 0; i < count; i++) {
            const a = this.droneAngle + (i / count) * TAU;
            const dxp = car.x + Math.sin(a) * 5.5, dzp = car.z + Math.cos(a) * 5.5;
            const t = this.nearest(horde, dxp, dzp, 40, used);
            if (!t) break;
            used.add(t);
            const bx = dxp, by = 4.2, bz = dzp;
            const vx = t.x - bx, vy = 1.0 * t.scale - by, vz = t.z - bz;
            const d = Math.hypot(vx, vy, vz) || 1;
            this.bullets.push({
              x: bx, y: by, z: bz,
              vx: (vx / d) * 95, vy: (vy / d) * 95, vz: (vz / d) * 95,
              life: 0.8, dmg: (11 + L.drone * 8) * dmgMul,
            });
            fired++;
          }
          this.cd.drone = (0.42 - L.drone * 0.035) * cdMul;
          if (fired) this.audio.shoot();
        }
      }

      /* ---------------------------------------------------- shock pulse */
      if (L.slam > 0) {
        this.cd.pulse -= dt;
        if (this.cd.pulse <= 0) {
          this.cd.pulse = (4.2 - L.slam * 0.35) * cdMul;
          game.slamShock(car.x, car.z, 0.7 + L.slam * 0.16, 0.4, true);
        }
      }
    }

    /* -------------------------------------------------------------- draw */
    draw(R, car, game) {
      const L = game.weaponLevels;

      for (const r of this.rockets) {
        const yaw = Math.atan2(r.vx, r.vz);
        const pitch = -Math.asin(clamp(r.vy / (Math.hypot(r.vx, r.vy, r.vz) || 1), -1, 1));
        R.push('cyl', 'opaque', r.x, r.y, r.z, yaw, pitch + Math.PI / 2, 0, 0.34, 1.1, 0.34, 0.85, 0.85, 0.9, 0.05);
        R.push('cone', 'opaque', r.x, r.y, r.z, yaw, pitch + Math.PI / 2, 0, 0.36, 0.5, 0.36, 0.9, 0.2, 0.15, 0.2);
        R.push('sphere', 'glow', r.x - r.vx * 0.012, r.y - r.vy * 0.012, r.z - r.vz * 0.012, 0, 0, 0, 0.85, 0.85, 0.85, 1.3, 0.6, 0.15, 1);
      }

      for (const b of this.bullets) {
        // clamp the tracer so a long frame doesn't draw a laser across the map
        const tx = b.px === undefined ? b.x : b.px, ty = b.py === undefined ? b.y : b.py, tz = b.pz === undefined ? b.z : b.pz;
        let dx = tx - b.x, dy = ty - b.y, dz = tz - b.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        const k = Math.min(len, 2.6) / len;
        beam(R, 'glow', b.x + dx * k, b.y + dy * k, b.z + dz * k, b.x, b.y, b.z, 0.11, 1.2, 0.95, 0.4);
      }

      for (const m of this.mines) {
        const blink = m.arm > 0 ? 0.3 : (Math.sin(m.life * 14) > 0 ? 1 : 0.2);
        R.push('cyl', 'opaque', m.x, 0.22, m.z, 0, 0, 0, 1.3, 0.44, 1.3, 0.18, 0.18, 0.2, 0);
        R.push('sphere', 'glow', m.x, 0.5, m.z, 0, 0, 0, 0.4, 0.4, 0.4, 1.4 * blink, 0.25 * blink, 0.15 * blink, 1);
        R.shadow(m.x, m.z, 1.3, 0.4);
      }

      for (const p of this.patches) {
        const k = clamp01(p.life / p.max);
        R.push('disc', 'glow', p.x, 0.07, p.z, 0, 0, 0, p.r * 2, 1, p.r * 2, 0.07 * k, 0.024 * k, 0.005 * k, 1);
      }

      for (const bo of this.bolts) {
        const k = clamp01(bo.life / bo.max);
        for (let i = 0; i < bo.pts.length - 1; i++) {
          const a = bo.pts[i], b = bo.pts[i + 1];
          const segs = 4;
          let px = a.x, py = a.y, pz = a.z;
          for (let s = 1; s <= segs; s++) {
            const t = s / segs;
            const jitter = s === segs ? 0 : 0.9;
            const nx = lerp(a.x, b.x, t) + rand(-jitter, jitter);
            const ny = lerp(a.y, b.y, t) + rand(-jitter * 0.6, jitter * 0.6);
            const nz = lerp(a.z, b.z, t) + rand(-jitter, jitter);
            beam(R, 'glow', px, py, pz, nx, ny, nz, 0.22 * k + 0.06, 0.65 * k, 1.0 * k, 1.6 * k);
            px = nx; py = ny; pz = nz;
          }
        }
      }

      if (this.laser) {
        const l = this.laser;
        const w = 0.34 + L.laser * 0.09;
        const flick = 0.85 + Math.random() * 0.3;
        beam(R, 'glow', l.ox, l.oy, l.oz, l.ex, 1.2, l.ez, w, 1.5 * flick, 0.35 * flick, 1.7 * flick);
        beam(R, 'glow', l.ox, l.oy, l.oz, l.ex, 1.2, l.ez, w * 0.4, 1.9, 1.5, 2.0);
        // emitter on the roof
        R.push('box', 'opaque', car.x, 2.9, car.z, Math.atan2(l.ex - l.ox, l.ez - l.oz), 0, 0,
          0.7, 0.5, 1.5, 0.34, 0.36, 0.42, 0.05);
        R.push('sphere', 'glow', car.x, 2.9, car.z, 0, 0, 0, 1.5, 1.5, 1.5, 0.5, 0.12, 0.6, 1);
      }

      if (L.rail > 0) {
        const c = clamp01(this.rail.charge);
        R.push('cyl', 'opaque', car.x, 3.1, car.z, car.yaw, Math.PI / 2, 0, 0.5, 4.2, 0.5, 0.32, 0.33, 0.38, 0);
        R.push('sphere', 'glow', car.x + Math.sin(car.yaw) * 2.0, 3.1, car.z + Math.cos(car.yaw) * 2.0,
          0, 0, 0, 0.6 + c * 1.6, 0.6 + c * 1.6, 0.6 + c * 1.6, 0.35 * c, 0.55 * c, 1.2 * c, 1);
        if (this.rail.beam) {
          const b = this.rail.beam;
          const k = clamp01(b.life / b.max);
          beam(R, 'glow', b.ox, 2.2, b.oz, b.ex, 2.2, b.ez, 1.4 * k, 0.5 * k, 0.8 * k, 1.8 * k);
          beam(R, 'glow', b.ox, 2.2, b.oz, b.ex, 2.2, b.ez, 0.4 * k, 1.4 * k, 1.6 * k, 2.0 * k);
        }
      }

      if (L.drone > 0) {
        const count = 1 + L.drone;
        for (let i = 0; i < count; i++) {
          const a = this.droneAngle + (i / count) * TAU;
          const dx = car.x + Math.sin(a) * 5.5, dz = car.z + Math.cos(a) * 5.5;
          const dy = 4.2 + Math.sin(this.droneAngle * 3 + i) * 0.25;
          R.push('box', 'opaque', dx, dy, dz, a, 0, 0, 1.0, 0.34, 1.0, 0.36, 0.38, 0.44, 0);
          R.push('box', 'opaque', dx, dy - 0.3, dz, a, 0, 0, 0.5, 0.3, 0.7, 0.2, 0.2, 0.24, 0);
          for (const [ox, oz] of [[0.62, 0.62], [-0.62, 0.62], [0.62, -0.62], [-0.62, -0.62]]) {
            const rx = dx + (ox * Math.cos(a) + oz * Math.sin(a));
            const rz = dz + (-ox * Math.sin(a) + oz * Math.cos(a));
            R.push('cyl', 'glow', rx, dy + 0.2, rz, 0, 0, 0, 1.1, 0.06, 1.1, 0.12, 0.28, 0.45, 1);
          }
          R.push('sphere', 'glow', dx, dy - 0.4, dz, 0, 0, 0, 0.6, 0.6, 0.6, 0.5, 0.1, 0.1, 1);
          R.shadow(dx, dz, 1.2, 0.25);
        }
      }

      if (L.saw > 0) {
        const count = 1 + L.saw;
        const radius = 4.0 + L.saw * 0.65;
        for (let i = 0; i < count; i++) {
          const a = this.sawAngle + (i / count) * TAU;
          const sx = car.x + Math.sin(a) * radius;
          const sz = car.z + Math.cos(a) * radius;
          const spin = this.sawAngle * 9 + i;
          const y = 1.05 + Math.sin(a * 2 + this.sawAngle) * 0.12;
          // blade plane lies along the orbit tangent, spinning on its own axle
          R.push('saw', 'opaque', sx, y, sz, a + Math.PI / 2, 0, spin, 2.15, 2.15, 2.15, 0.44, 0.47, 0.55, 0.03);
          R.push('cylX', 'opaque', sx, y, sz, a, 0, 0, 0.4, 0.5, 0.5, 0.30, 0.30, 0.34, 0);
          R.shadow(sx, sz, 1.6, 0.3);
        }
      }
    }
  }

  BA.Weapons = Weapons;
  BA.beam = beam;
})();
