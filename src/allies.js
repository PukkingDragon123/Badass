/* BADASS APOCALYPSE - friendlies: armed escorts, stray dogs, and cats that
   want nothing to do with any of this. */
(function () {
  'use strict';
  const { clamp, clamp01, lerp, rand, TAU, angleDelta } = BA;

  const MAX_ESCORT = 6;

  class Allies {
    constructor(fx, audio) {
      this.fx = fx;
      this.audio = audio;
      this.list = [];
      this.shots = [];
      this.nextSpawnZ = 60;
    }

    reset() {
      this.list.length = 0;
      this.shots.length = 0;
      this.nextSpawnZ = 60;
    }

    get escorts() { return this.list.filter((a) => a.type === 'fighter').length; }

    /* a rescued survivor grabs a rifle and rides shotgun */
    addFighter(x, z, tier) {
      if (this.escorts >= MAX_ESCORT) return null;
      const a = {
        type: 'fighter', x, z, y: 0, vx: 0, vz: 0, yaw: 0,
        hp: 44 + tier * 18, maxHp: 44 + tier * 18, cd: rand(0, 1), tier: tier || 0,
        phase: rand(TAU), orbit: rand(TAU), reload: 0,
        skin: [rand(0.5, 0.92), rand(0.42, 0.75), rand(0.32, 0.6)],
        shirt: [rand(0.18, 0.4), rand(0.26, 0.5), rand(0.2, 0.42)],
      };
      this.list.push(a);
      return a;
    }

    addDog(x, z) {
      const a = {
        type: 'dog', x, z, y: 0, vx: 0, vz: 0, yaw: 0,
        hp: 40, maxHp: 40, cd: 0, phase: rand(TAU), orbit: rand(TAU),
        coat: [rand(0.28, 0.62), rand(0.2, 0.45), rand(0.12, 0.3)],
      };
      this.list.push(a);
      return a;
    }

    addCat(x, z) {
      this.list.push({
        type: 'cat', x, z, y: 0, vx: 0, vz: 0, yaw: rand(TAU),
        hp: 1, maxHp: 1, phase: rand(TAU), flee: 0,
        coat: [[0.62, 0.34, 0.12], [0.38, 0.36, 0.34], [0.09, 0.08, 0.09],
          [0.78, 0.74, 0.68], [0.46, 0.36, 0.22]][(Math.random() * 5) | 0],
      });
    }

    /* strays and volunteers dotted along the route */
    seed(car, stage) {
      while (this.nextSpawnZ < car.z + 200) {
        const x = rand(-50, 50);
        const z = this.nextSpawnZ;
        const r = Math.random();
        if (r < 0.42) this.addDog(x, z);
        else if (r < 0.72) this.addCat(x, z);
        this.nextSpawnZ += rand(120, 240);
      }
    }

    update(dt, car, horde, game) {
      this.seed(car, game.stage);

      for (let i = this.list.length - 1; i >= 0; i--) {
        const a = this.list[i];
        a.phase += dt * 6;
        if (a.hp <= 0) {
          this.fx.blood(a.x, 1.0, a.z, 0, 1, 0, 8, 6);
          this.fx.text(a.x, 2.4, a.z, a.type === 'dog' ? 'DOG DOWN' : 'ESCORT DOWN', '#ff6b5e', 20, 'big');
          this.list.splice(i, 1);
          continue;
        }
        const dcx = car.x - a.x, dcz = car.z - a.z;
        const dc = Math.hypot(dcx, dcz) || 1;

        if (a.type === 'cat') {
          // cats bolt from anything that moves and never fight
          let fx_ = 0, fz = 0;
          if (dc < 22) { fx_ -= dcx / dc; fz -= dcz / dc; a.flee = 1.4; }
          const near = horde.grid.query(a.x, a.z, 16, []);
          for (const e of near) {
            if (e.dead) continue;
            const d = Math.hypot(e.x - a.x, e.z - a.z) || 1;
            if (d < 16) { fx_ -= (e.x - a.x) / d; fz -= (e.z - a.z) / d; a.flee = 1.4; }
          }
          a.flee = Math.max(0, a.flee - dt);
          const sp = a.flee > 0 ? 13 : 2.4;
          a.vx = lerp(a.vx, fx_ * sp, clamp01(dt * 5));
          a.vz = lerp(a.vz, fz * sp, clamp01(dt * 5));
          a.x += a.vx * dt; a.z += a.vz * dt;
          if (Math.hypot(a.vx, a.vz) > 0.4) a.yaw = Math.atan2(a.vx, a.vz);
          if (dc > 200) this.list.splice(i, 1);
          continue;
        }

        // fighters and dogs both hunt, but hold station near the truck
        const target = this.nearestEnemy(horde, a.x, a.z, a.type === 'dog' ? 34 : 40);
        let tx, tz, sp;
        if (a.type === 'dog' && target) {
          tx = target.x; tz = target.z; sp = 13;
          if (Math.hypot(target.x - a.x, target.z - a.z) < target.radius + 1.6) {
            a.cd -= dt;
            if (a.cd <= 0) {
              a.cd = 0.55;
              const d = Math.hypot(target.x - a.x, target.z - a.z) || 1;
              horde.damage(target, 16, (target.x - a.x) / d, (target.z - a.z) / d, 12, game);
              this.fx.blood(target.x, 1.0, target.z, 0, 1, 0, 3, 4);
              this.audio.squish();
            }
          }
        } else {
          // ring up behind the truck so they do not get run over
          a.orbit += dt * 0.6;
          const rad = a.type === 'dog' ? 7 : 9;
          tx = car.x + Math.sin(a.orbit) * rad - Math.sin(car.yaw) * 3;
          tz = car.z + Math.cos(a.orbit) * rad - Math.cos(car.yaw) * 3;
          sp = a.type === 'dog' ? 14 : 12;
        }

        const dx = tx - a.x, dz = tz - a.z;
        const d = Math.hypot(dx, dz) || 1;
        // teleport stragglers rather than lose them behind the horde
        if (dc > 120) { a.x = car.x + rand(-8, 8); a.z = car.z - 10 + rand(-4, 4); }
        const move = d > 2 ? 1 : 0;
        a.vx = lerp(a.vx, (dx / d) * sp * move, clamp01(dt * 6));
        a.vz = lerp(a.vz, (dz / d) * sp * move, clamp01(dt * 6));
        a.x += a.vx * dt; a.z += a.vz * dt;
        const face = target ? Math.atan2(target.x - a.x, target.z - a.z) : Math.atan2(a.vx, a.vz);
        a.yaw += angleDelta(a.yaw, face) * clamp01(dt * 9);

        if (a.type === 'fighter') {
          a.cd -= dt;
          if (target && a.cd <= 0) {
            a.cd = 0.62 - a.tier * 0.06;
            const sx = a.x, sy = 1.5, sz = a.z;
            const vx = target.x - sx, vy = 1.0 * target.scale - sy, vz = target.z - sz;
            const dd = Math.hypot(vx, vy, vz) || 1;
            const spread = 0.05;
            this.shots.push({
              x: sx, y: sy, z: sz,
              vx: (vx / dd + rand(-spread, spread)) * 90,
              vy: (vy / dd) * 90,
              vz: (vz / dd + rand(-spread, spread)) * 90,
              life: 0.8, dmg: 13 + a.tier * 6,
            });
            this.audio.shoot();
            this.fx.sparks(sx + Math.sin(a.yaw), 1.6, sz + Math.cos(a.yaw), 2, 1.3, 1.0, 0.4, 0.5);
          }
        }

        // the horde bites back
        const near = horde.grid.query(a.x, a.z, 2.6, []);
        for (const e of near) {
          if (e.dead) continue;
          if (Math.hypot(e.x - a.x, e.z - a.z) < e.radius + 0.9) {
            a.bitten = (a.bitten || 0) - dt;
            if (a.bitten <= 0) { a.bitten = 0.8; a.hp -= e.dmg * 0.5; this.fx.blood(a.x, 1.1, a.z, 0, 1, 0, 3, 3); }
          }
        }
      }

      /* friendly bullets */
      for (let i = this.shots.length - 1; i >= 0; i--) {
        const b = this.shots[i];
        b.life -= dt;
        b.px = b.x; b.py = b.y; b.pz = b.z;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        let done = b.life <= 0 || b.y < 0.1;
        if (!done) {
          const near = horde.grid.query(b.x, b.z, 2.2, []);
          for (const e of near) {
            if (e.dead) continue;
            if (Math.hypot(e.x - b.x, e.z - b.z) < e.radius + 0.4 && b.y < 2.2 * e.scale) {
              const d = Math.hypot(b.vx, b.vz) || 1;
              horde.damage(e, b.dmg, b.vx / d, b.vz / d, 6, game);
              this.fx.blood(b.x, b.y, b.z, b.vx / d, 0.3, b.vz / d, 2, 3);
              done = true;
              break;
            }
          }
        }
        if (done) this.shots.splice(i, 1);
      }
    }

    nearestEnemy(horde, x, z, maxDist) {
      let best = null, bd = maxDist * maxDist;
      for (const e of horde.list) {
        if (e.dead) continue;
        const d = (e.x - x) * (e.x - x) + (e.z - z) * (e.z - z);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    /* ------------------------------------------------------------- draw */
    draw(R, camX, camZ) {
      for (const b of this.shots) {
        BA.beam(R, 'glow', b.px === undefined ? b.x : b.px, b.py === undefined ? b.y : b.py,
          b.pz === undefined ? b.z : b.pz, b.x, b.y, b.z, 0.10, 0.5, 1.1, 1.3);
      }
      for (const a of this.list) {
        if ((a.x - camX) ** 2 + (a.z - camZ) ** 2 > 190 * 190) continue;
        const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
        const P = (lx, ly, lz) => [a.x + lx * cy + lz * sy, ly, a.z - lx * sy + lz * cy];
        const put = (lx, ly, lz, sx, sy2, sz, c, pitch, roll) => {
          const p = P(lx, ly, lz);
          R.push('box', 'opaque', p[0], p[1], p[2], a.yaw, pitch || 0, roll || 0, sx, sy2, sz, c[0], c[1], c[2], 0);
        };
        const walk = Math.sin(a.phase);
        const moving = Math.hypot(a.vx, a.vz) > 1;
        const bob = moving ? Math.abs(walk) * 0.09 : 0;

        if (a.type === 'cat') {
          const c = a.coat;
          put(0, 0.42 + bob, 0, 0.3, 0.3, 0.9, c);
          put(0, 0.55 + bob, 0.5, 0.28, 0.28, 0.28, [c[0] * 1.1, c[1] * 1.1, c[2] * 1.1]);
          put(-0.09, 0.72 + bob, 0.5, 0.1, 0.16, 0.08, c);
          put(0.09, 0.72 + bob, 0.5, 0.1, 0.16, 0.08, c);
          put(0, 0.6 + bob, -0.62, 0.1, 0.1, 0.5, c, -0.6 + walk * 0.3);
          for (const side of [1, -1]) for (const fw of [1, -1]) {
            put(side * 0.14, 0.2, fw * 0.3, 0.1, 0.42, 0.1, c, walk * side * fw * 0.6);
          }
          R.shadow(a.x, a.z, 0.6, 0.35);
          continue;
        }

        if (a.type === 'dog') {
          const c = a.coat;
          put(0, 0.66 + bob, 0, 0.46, 0.46, 1.3, c);
          put(0, 0.86 + bob, 0.78, 0.42, 0.42, 0.5, [c[0] * 1.1, c[1] * 1.08, c[2] * 1.05]);
          put(0, 0.78 + bob, 1.06, 0.24, 0.2, 0.28, [c[0] * 0.6, c[1] * 0.5, c[2] * 0.45]);
          for (const side of [1, -1]) put(side * 0.16, 1.1 + bob, 0.74, 0.12, 0.26, 0.1, c);
          put(0, 0.9 + bob, -0.8, 0.12, 0.12, 0.6, c, -0.7 + Math.sin(a.phase * 2) * 0.4);
          for (const side of [1, -1]) for (const fw of [1, -1]) {
            put(side * 0.2, 0.3, fw * 0.42, 0.14, 0.62, 0.14, [c[0] * 0.85, c[1] * 0.85, c[2] * 0.85], walk * side * fw * 0.8);
          }
          R.shadow(a.x, a.z, 0.9, 0.4);
          continue;
        }

        // fighter
        const s = 1.0;
        const hurt = 1 - clamp01(a.hp / a.maxHp) * 0.4;
        put(0, (1.06 + bob) * s, 0, 0.68, 0.9, 0.44, a.shirt);
        put(0, (1.56 + bob) * s, 0, 0.76, 0.22, 0.5, [a.shirt[0] * 0.7, a.shirt[1] * 0.7, a.shirt[2] * 0.7]);
        put(0, (1.72 + bob) * s, 0.04, 0.48, 0.48, 0.46, a.skin);
        put(0, (1.96 + bob) * s, 0, 0.54, 0.18, 0.52, [0.20, 0.24, 0.18]);
        // rifle held across the chest, muzzle forward
        const kick = a.cd > 0.5 ? 0.12 : 0;
        put(0.3, (1.34 + bob) * s, 0.8 - kick, 0.14, 0.14, 1.5, [0.20, 0.18, 0.16], -0.08);
        put(0.3, (1.44 + bob) * s, 0.3, 0.12, 0.22, 0.4, [0.32, 0.24, 0.16], -0.08);
        for (const side of [1, -1]) {
          put(side * 0.44, (1.3 + bob) * s, 0.34, 0.19, 0.6, 0.19, a.skin, -0.9);
        }
        for (const side of [1, -1]) {
          put(side * 0.2, 0.44, 0, 0.22, 0.86, 0.22, [0.20, 0.22, 0.26], walk * side * 0.6 * (moving ? 1 : 0));
        }
        // little green pip so you can tell them from the horde at speed
        R.push('sphere', 'glow', a.x, 2.5, a.z, 0, 0, 0, 0.5, 0.5, 0.5,
          0.1 * hurt, 0.55 * hurt, 0.16 * hurt, 1);
        R.shadow(a.x, a.z, 1.0, 0.45);
      }
    }
  }

  BA.Allies = Allies;
})();
