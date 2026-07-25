/* BADASS APOCALYPSE - the horde */
(function () {
  'use strict';
  const { clamp, clamp01, lerp, rand, randInt, TAU, angleDelta } = BA;

  const TYPES = {
    walker: { hp: 20, speed: 4.6, radius: 0.62, scale: 1.0, xp: 1, dmg: 7, mass: 1, col: [0.34, 0.52, 0.26] },
    runner: { hp: 13, speed: 10.5, radius: 0.52, scale: 0.9, xp: 1, dmg: 6, mass: 0.7, col: [0.62, 0.48, 0.20] },
    bomber: { hp: 26, speed: 5.4, radius: 0.78, scale: 1.15, xp: 3, dmg: 10, mass: 1.1, col: [0.35, 0.75, 0.22] },
    brute: { hp: 190, speed: 3.6, radius: 1.5, scale: 1.95, xp: 8, dmg: 22, mass: 5, col: [0.30, 0.19, 0.21] },
    boss: { hp: 1500, speed: 4.2, radius: 2.7, scale: 3.4, xp: 90, dmg: 34, mass: 22, col: [0.42, 0.10, 0.12] },
  };

  class Grid {
    constructor(cell) { this.cell = cell; this.map = new Map(); }
    clear() { this.map.clear(); }
    key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
    insert(e) {
      const ix = Math.floor(e.x / this.cell), iz = Math.floor(e.z / this.cell);
      const k = this.key(ix, iz);
      let a = this.map.get(k);
      if (!a) { a = []; this.map.set(k, a); }
      a.push(e);
    }
    query(x, z, r, out) {
      out.length = 0;
      const c = this.cell;
      const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
      const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
      for (let iz = z0; iz <= z1; iz++) {
        for (let ix = x0; ix <= x1; ix++) {
          const a = this.map.get(this.key(ix, iz));
          if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
        }
      }
      return out;
    }
  }

  class Horde {
    constructor(fx, audio) {
      this.fx = fx;
      this.audio = audio;
      this.list = [];
      this.pool = [];
      this.grid = new Grid(3.2);
      this.tmp = [];
      this.max = 400;
    }

    reset() {
      for (const e of this.list) this.pool.push(e);
      this.list.length = 0;
      this.grid.clear();
    }

    get count() { return this.list.length; }

    spawn(type, x, z, hpMul, speedMul) {
      if (this.list.length >= this.max && type !== 'boss') return null;
      const T = TYPES[type];
      const e = this.pool.pop() || {};
      e.type = type;
      e.x = x; e.z = z; e.y = 0;
      e.vx = 0; e.vz = 0; e.vy = 0;
      e.yaw = rand(TAU);
      e.maxHp = T.hp * (hpMul || 1);
      e.hp = e.maxHp;
      e.speed = T.speed * (speedMul || 1) * rand(0.88, 1.12);
      e.radius = T.radius;
      e.scale = T.scale * rand(0.92, 1.08);
      e.xp = T.xp;
      e.dmg = T.dmg;
      e.mass = T.mass;
      e.col = T.col;
      e.tint = rand(0.85, 1.15);
      e.phase = rand(TAU);
      e.flash = 0;
      e.stun = 0;
      e.attackCd = 0;
      e.burn = 0;
      e.slow = 0;
      e.airborne = false;
      e.wobble = rand(0.6, 1.5);
      e.dead = false;
      this.list.push(e);
      return e;
    }

    kill(e, dirX, dirZ, power, game, silent) {
      if (e.dead) return;
      e.dead = true;
      const i = this.list.indexOf(e);
      if (i >= 0) this.list.splice(i, 1);
      this.pool.push(e);

      const s = e.scale;
      this.fx.blood(e.x, 0.9 * s, e.z, dirX, 0.4, dirZ, 8 + (power * 8) | 0, 5 + power * 8);
      this.fx.gibs(e.x, 0.6 * s, e.z, dirX, 0.5, dirZ, 4 + (s * 2) | 0, 4 + power * 7, e.col);
      this.fx.splat(e.x + dirX * 1.2, e.z + dirZ * 1.2, 1.6 * s * rand(0.8, 1.4), 0.32, 0.03, 0.05, 0.8);
      if (!silent) this.audio.squish();

      if (e.type === 'bomber') {
        this.fx.fire(e.x, 1.0, e.z, 18, 1.1, 1.6);
        this.fx.wave(e.x, 0.1, e.z, 1, 9, 0.4, 0.5, 1.4, 0.3, 1.1);
        this.fx.splat(e.x, e.z, 4.5, 0.16, 0.30, 0.08, 0.75);
        game.explosion(e.x, e.z, 8, 60, 'bomber');
        this.audio.explode(0.8);
      }
      if (e.type === 'boss') {
        this.fx.fire(e.x, 2.0, e.z, 40, 2.2, 2.6);
        this.fx.wave(e.x, 0.1, e.z, 1, 26, 0.8, 1.4, 0.5, 0.2, 2.0);
        this.fx.gibs(e.x, 1.5, e.z, dirX, 1, dirZ, 26, 14, e.col);
        game.shake(1.0);
        game.flash(0.6, [1, 0.4, 0.3]);
        this.audio.explode(2);
        this.fx.text(e.x, 6, e.z, 'BOSS DOWN!', '#ff5a4a', 40, 'big');
      }
      game.onKill(e, power);
    }

    damage(e, amount, dirX, dirZ, knock, game, crit) {
      if (e.dead) return false;
      e.hp -= amount;
      e.flash = 1;
      if (knock) {
        const k = knock / Math.max(0.4, e.mass);
        e.vx += dirX * k;
        e.vz += dirZ * k;
        e.stun = Math.max(e.stun, Math.min(0.5, knock * 0.02));
      }
      if (amount >= 1) {
        game.damageNumber(e.x, 1.4 * e.scale, e.z, Math.round(amount), crit);
      }
      if (e.hp <= 0) {
        this.kill(e, dirX, dirZ, clamp01(amount / 60), game);
        return true;
      }
      return false;
    }

    /* --------------------------------------------------------- simulate */
    update(dt, car, game, world) {
      const grid = this.grid;
      grid.clear();
      for (const e of this.list) grid.insert(e);

      const cx = car.x, cz = car.z;
      const carSpeed = car.speed;
      const tmp = this.tmp;

      // car OBB
      const cyaw = car.yaw;
      const cfx = Math.sin(cyaw), cfz = Math.cos(cyaw);
      const crx = Math.cos(cyaw), crz = -Math.sin(cyaw);
      const halfL = 2.35 + car.spikeLevel * 0.22;
      const halfW = 1.25;
      const carAirborne = car.y > 1.4;

      for (let i = this.list.length - 1; i >= 0; i--) {
        const e = this.list[i];
        if (e.dead) continue;

        e.flash = Math.max(0, e.flash - dt * 5.5);
        if (e.stun > 0) e.stun -= dt;
        if (e.slow > 0) e.slow -= dt;

        if (e.burn > 0) {
          e.burn -= dt;
          e.burnTick = (e.burnTick || 0) - dt;
          if (e.burnTick <= 0) {
            e.burnTick = 0.28;
            if (this.damage(e, e.burnDps * 0.28, 0, 0, 0, game)) continue;
          }
          if (Math.random() < dt * 22) this.fx.fire(e.x, 0.8 * e.scale, e.z, 1, 0.28 * e.scale, 0.3);
        }

        // --- steering toward the car
        const dx = cx - e.x, dz = cz - e.z;
        const dist = Math.hypot(dx, dz) || 1;
        const nx = dx / dist, nz = dz / dist;

        const stunned = e.stun > 0;
        const spd = e.speed * (e.slow > 0 ? 0.42 : 1) * (stunned ? 0 : 1);
        const accel = stunned ? 0 : 26;
        e.vx += (nx * spd - e.vx) * clamp01(accel * dt / Math.max(1, e.mass * 0.5));
        e.vz += (nz * spd - e.vz) * clamp01(accel * dt / Math.max(1, e.mass * 0.5));

        // --- separation
        const near = grid.query(e.x, e.z, e.radius + 1.6, tmp);
        for (let j = 0; j < near.length; j++) {
          const o = near[j];
          if (o === e || o.dead) continue;
          const ox = e.x - o.x, oz = e.z - o.z;
          const d2 = ox * ox + oz * oz;
          const rr = (e.radius + o.radius) * 0.95;
          if (d2 < rr * rr && d2 > 0.0001) {
            const d = Math.sqrt(d2);
            const push = (rr - d) / d * 5.2 * dt * 30 / Math.max(1, e.mass);
            e.vx += ox * push * dt;
            e.vz += oz * push * dt;
          }
        }

        e.vx *= Math.exp(-3.2 * dt);
        e.vz *= Math.exp(-3.2 * dt);
        e.x += e.vx * dt;
        e.z += e.vz * dt;

        if (e.airborne || e.y > 0.01) {
          e.vy -= 40 * dt;
          e.y += e.vy * dt;
          if (e.y <= 0) { e.y = 0; e.vy = 0; e.airborne = false; }
        }

        const targetYaw = Math.atan2(e.vx, e.vz);
        e.yaw += angleDelta(e.yaw, targetYaw) * clamp01(dt * 8);
        e.phase += dt * (2.4 + Math.hypot(e.vx, e.vz) * 0.55) * e.wobble;

        // --- despawn strays
        if (dist > 190) {
          this.list.splice(i, 1);
          e.dead = true;
          this.pool.push(e);
          continue;
        }

        // --- car collision (OBB vs circle)
        const rel = { x: e.x - cx, z: e.z - cz };
        const lx = rel.x * crx + rel.z * crz;
        const lz = rel.x * cfx + rel.z * cfz;
        const overlapX = halfW + e.radius - Math.abs(lx);
        const overlapZ = halfL + e.radius - Math.abs(lz);
        if (overlapX > 0 && overlapZ > 0 && !carAirborne) {
          const frontal = lz > 0 && car.vf > 0;
          const impactSpeed = Math.abs(car.vf) + Math.abs(car.vr) * 0.5;
          const hitPower = clamp01(impactSpeed / 34);

          if (impactSpeed > 6) {
            const dmg = car.stats.ramDamage * (0.35 + hitPower * 1.9) * (frontal ? 1.35 : 0.8)
              * (car.boostTime > 0 ? 1.6 : 1) * car.stats.damage;
            const kdirX = (e.x - cx) / (Math.hypot(e.x - cx, e.z - cz) || 1);
            const kdirZ = (e.z - cz) / (Math.hypot(e.x - cx, e.z - cz) || 1);
            const killed = this.damage(e, dmg, kdirX, kdirZ, 20 + impactSpeed * 1.4, game, car.boostTime > 0);
            if (killed) {
              e.dead = true;
              game.shake(0.06 + hitPower * 0.16);
              game.hitstop(0.016 + hitPower * 0.038);
              this.audio.hit(hitPower);
              // ragdoll launch
              const lp = this.fx.spawn();
              if (lp) {
                lp.x = e.x; lp.y = 0.9; lp.z = e.z;
                lp.vx = kdirX * (7 + impactSpeed * 0.85) + car.vx * 0.32;
                lp.vy = 6 + hitPower * 12;
                lp.vz = kdirZ * (7 + impactSpeed * 0.85) + car.vz * 0.32;
                lp.rvx = rand(-16, 16); lp.rvy = rand(-10, 10); lp.rvz = rand(-16, 16);
                lp.rx = 0; lp.ry = e.yaw; lp.rz = 0;
                lp.sx = 0.75 * e.scale; lp.sy = 1.1 * e.scale; lp.sz = 0.5 * e.scale;
                lp.r = e.col[0]; lp.g = e.col[1]; lp.b = e.col[2]; lp.e = 0;
                lp.max = lp.life = 2.4;
                lp.grav = 30; lp.drag = 0.3; lp.bounce = 0.45;
                lp.mesh = 'box'; lp.layer = 'opaque'; lp.shrink = 0.1; lp.stretch = 0;
              }
            } else {
              // heavy things shove back
              const push = (e.mass > 3 ? 1 : 0.25);
              car.vx -= car.vx * push * 0.35;
              car.vz -= car.vz * push * 0.35;
              car.vf *= (1 - push * 0.3);
              car.squashVel = -4 - hitPower * 5;
              game.shake(0.12 * push + 0.05);
              game.hitstop(0.03);
              this.audio.hit(hitPower * 0.7);
              // separate
              if (overlapX < overlapZ) {
                const s = Math.sign(lx) || 1;
                e.x += crx * s * overlapX; e.z += crz * s * overlapX;
              } else {
                const s = Math.sign(lz) || 1;
                e.x += cfx * s * overlapZ; e.z += cfz * s * overlapZ;
              }
            }
            continue;
          } else {
            // too slow: they claw at you
            e.attackCd -= dt;
            if (e.attackCd <= 0) {
              e.attackCd = 0.75;
              if (car.hurt(e.dmg, game)) {
                this.fx.blood(car.x, 1.2, car.z, 0, 1, 0, 5, 3, [0.7, 0.15, 0.1]);
              }
            }
            const s = Math.sign(lx) || 1;
            e.x += crx * s * overlapX * 0.5; e.z += crz * s * overlapX * 0.5;
          }
        }
      }
    }

    /* ------------------------------------------------------------- draw */
    draw(R, camX, camZ) {
      for (const e of this.list) {
        if (e.dead) continue;
        const dx = e.x - camX, dz = e.z - camZ;
        if (dx * dx + dz * dz > 200 * 200) continue;

        const s = e.scale;
        const yaw = e.yaw;
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        const walk = Math.sin(e.phase);
        const walk2 = Math.cos(e.phase);
        const bob = Math.abs(walk) * 0.09 * s;
        const lean = 0.16 + walk2 * 0.05;
        const base = e.y;

        const f = e.flash;
        const boss = e.type === 'boss';
        const hurtT = boss ? clamp01(1 - e.hp / e.maxHp) * 0.4 : 0;
        let r = lerp(e.col[0] * e.tint, 2.4, f);
        let g = lerp(e.col[1] * e.tint, 2.0, f);
        let b = lerp(e.col[2] * e.tint, 2.0, f);
        r = lerp(r, 0.9, hurtT);
        const em = f * 0.7 + (e.type === 'bomber' ? 0.28 + Math.sin(e.phase * 3) * 0.12 : 0) + (boss ? 0.16 : 0);

        const P = (lx, ly, lz) => [e.x + lx * cy + lz * sy, base + ly, e.z - lx * sy + lz * cy];

        // torso
        let p = P(0, (1.05 + bob) * s, 0);
        R.push('box', 'opaque', p[0], p[1], p[2], yaw, lean, walk2 * 0.08, 0.78 * s, 1.05 * s, 0.5 * s, r, g, b, em);
        // head
        p = P(0, (1.78 + bob) * s, 0.08 * s);
        R.push('box', 'opaque', p[0], p[1], p[2], yaw + walk2 * 0.12, lean * 1.6, walk * 0.1,
          0.56 * s, 0.56 * s, 0.56 * s, r * 1.15, g * 1.1, b * 1.05, em);
        // jaw
        p = P(0, (1.62 + bob) * s, 0.3 * s);
        R.push('box', 'opaque', p[0], p[1], p[2], yaw, lean, 0, 0.34 * s, 0.2 * s, 0.24 * s, 0.75, 0.35, 0.35, em);
        // eyes
        for (const side of [1, -1]) {
          p = P(side * 0.15 * s, (1.85 + bob) * s, 0.3 * s);
          R.push('box', 'glow', p[0], p[1], p[2], yaw, 0, 0, 0.12 * s, 0.1 * s, 0.06 * s,
            boss ? 1.6 : 1.0, boss ? 0.2 : 0.55, 0.12, 1);
        }
        // arms reaching forward
        for (const side of [1, -1]) {
          const swing = walk * side * 0.25;
          const hx = side * 0.5 * s, hy = (1.45 + bob) * s;
          const ang = -1.25 + swing;
          const ax = Math.sin(ang) * 0 + 0;
          const cxr = Math.cos(ang), sxr = Math.sin(ang);
          const lz = -sxr * 0.5 * s, ly = -cxr * 0.5 * s;
          p = P(hx + ax, hy + ly, lz);
          R.push('box', 'opaque', p[0], p[1], p[2], yaw, ang, 0, 0.24 * s, 0.95 * s, 0.24 * s, r * 0.92, g * 0.92, b * 0.92, em);
        }
        // legs
        for (const side of [1, -1]) {
          const ang = walk * side * 0.75;
          const cxr = Math.cos(ang), sxr = Math.sin(ang);
          const hx = side * 0.24 * s, hy = 0.62 * s;
          p = P(hx, hy - cxr * 0.34 * s, -sxr * 0.34 * s);
          R.push('box', 'opaque', p[0], p[1], p[2], yaw, ang, 0, 0.26 * s, 0.8 * s, 0.26 * s, r * 0.7, g * 0.7, b * 0.72, em * 0.5);
        }

        if (boss || e.type === 'brute') {
          // shoulder armour
          for (const side of [1, -1]) {
            p = P(side * 0.62 * s, 1.62 * s, 0);
            R.push('box', 'opaque', p[0], p[1], p[2], yaw, 0, side * 0.25, 0.5 * s, 0.4 * s, 0.6 * s, 0.24, 0.22, 0.24, em);
          }
        }
        if (boss) {
          R.push('disc', 'glow', e.x, 0.06, e.z, 0, 0, 0, 11, 1, 11, 0.35, 0.05, 0.04, 1);
        }

        R.shadow(e.x, e.z, 1.5 * s, clamp01(0.55 - e.y * 0.08));
      }
    }
  }

  BA.Horde = Horde;
  BA.ENEMY_TYPES = TYPES;
})();
