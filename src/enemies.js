/* BADASS APOCALYPSE - the horde */
(function () {
  'use strict';
  const { clamp, clamp01, lerp, rand, randInt, randSign, TAU, angleDelta } = BA;

  const TYPES = {
    walker: { hp: 20, speed: 4.6, radius: 0.62, scale: 1.0, xp: 1, dmg: 7, mass: 1, col: [0.34, 0.52, 0.26] },
    runner: { hp: 13, speed: 10.5, radius: 0.52, scale: 0.9, xp: 1, dmg: 6, mass: 0.7, col: [0.62, 0.48, 0.20] },
    bomber: { hp: 26, speed: 5.4, radius: 0.78, scale: 1.15, xp: 3, dmg: 10, mass: 1.1, col: [0.35, 0.75, 0.22] },
    brute: { hp: 190, speed: 3.6, radius: 1.5, scale: 1.95, xp: 8, dmg: 22, mass: 5, col: [0.30, 0.19, 0.21] },
    boss: { hp: 1500, speed: 4.2, radius: 2.7, scale: 3.4, xp: 90, dmg: 34, mass: 22, col: [0.42, 0.10, 0.12] },
    // ---- ranged / support horde
    spitter: {
      hp: 38, speed: 4.2, radius: 0.72, scale: 1.08, xp: 3, dmg: 13, mass: 1.1,
      col: [0.30, 0.50, 0.24], range: 24, keep: 15, cd: 2.4,
    },
    sniper: {
      hp: 34, speed: 3.6, radius: 0.62, scale: 1.06, xp: 5, dmg: 24, mass: 1,
      col: [0.28, 0.32, 0.24], range: 58, keep: 34, cd: 4.0, windup: 1.15,
    },
    screamer: {
      hp: 72, speed: 5.2, radius: 0.82, scale: 1.22, xp: 6, dmg: 9, mass: 1.2,
      col: [0.52, 0.26, 0.42], range: 0, cd: 9.0,
    },
  };

  const SKINS = [
    [0.50, 0.58, 0.41], [0.42, 0.51, 0.37], [0.60, 0.61, 0.49],
    [0.36, 0.45, 0.33], [0.64, 0.55, 0.45], [0.47, 0.44, 0.40],
  ];
  const SHIRTS = [
    [0.20, 0.27, 0.42], [0.46, 0.17, 0.17], [0.28, 0.30, 0.33], [0.16, 0.35, 0.29],
    [0.49, 0.42, 0.19], [0.34, 0.21, 0.39], [0.60, 0.56, 0.48], [0.13, 0.16, 0.20],
  ];
  const PANTS = [
    [0.15, 0.17, 0.24], [0.24, 0.20, 0.16], [0.19, 0.21, 0.21],
    [0.30, 0.28, 0.22], [0.11, 0.12, 0.14],
  ];
  // 0 none, 1 cap, 2 hard hat, 3 matted hair, 4 helmet, 5 bandaged head
  const HEADGEAR = [0, 0, 1, 2, 3, 3, 5, 0];

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
      this.shots = [];      // spitter globs
      this.beams = [];      // sniper tracers / laser sights
      this.hazards = [];    // acid pools
    }

    reset() {
      for (const e of this.list) this.pool.push(e);
      this.list.length = 0;
      this.grid.clear();
      this.shots.length = 0;
      this.beams.length = 0;
      this.hazards.length = 0;
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
      // ---- cosmetic variant: nothing gameplay-relevant, everything visual
      e.variant = randInt(0, 7);
      e.skin = SKINS[randInt(0, SKINS.length - 1)];
      e.shirt = SHIRTS[randInt(0, SHIRTS.length - 1)];
      e.pants = PANTS[randInt(0, PANTS.length - 1)];
      e.hat = HEADGEAR[e.variant];
      e.girth = rand(0.85, 1.22);
      e.stoop = rand(0.08, 0.30);
      e.armless = Math.random() < 0.13 ? randSign() : 0;
      e.gore = Math.random() < 0.35;
      if (type === 'bomber') {
        e.skin = [0.40, 0.72, 0.26];
        e.shirt = [0.24, 0.46, 0.16];
        e.girth = rand(1.25, 1.5);
        e.hat = 0;
        e.armless = 0;
      } else if (type === 'runner') {
        e.girth = rand(0.72, 0.9);
        e.stoop = rand(0.3, 0.52);
      } else if (type === 'brute') {
        e.shirt = [0.26, 0.24, 0.27];
        e.pants = [0.17, 0.16, 0.18];
        e.hat = 4;
        e.girth = rand(1.15, 1.35);
        e.armless = 0;
      } else if (type === 'boss') {
        e.shirt = [0.30, 0.10, 0.11];
        e.pants = [0.14, 0.12, 0.13];
        e.hat = 4;
        e.girth = 1.35;
        e.armless = 0;
      }
      e.phase = rand(TAU);
      e.limp = rand(-1, 1);
      e.headTilt = rand(-0.3, 0.3);
      e.flash = 0;
      e.stun = 0;
      e.attackCd = rand(0.4, 2.0);
      e.range = T.range || 0;
      e.keep = T.keep || 0;
      e.fireCd = T.cd || 0;
      e.windup = 0;
      e.aiming = 0;
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
      this.fx.blood(e.x, 0.9 * s, e.z, dirX, 0.4, dirZ, 5 + (power * 6) | 0, 5 + power * 9);
      this.fx.gibs(e.x, 0.6 * s, e.z, dirX, 0.5, dirZ, 2 + (power * 4) | 0, 4 + power * 7, e.col);
      this.fx.splat(e.x + dirX * 1.2, e.z + dirZ * 1.2, 1.6 * s * rand(0.8, 1.4), 0.32, 0.03, 0.05, 0.8);
      if (!silent) this.audio.squish();
      if (game.ragdolls) {
        game.ragdolls.spawn(e, dirX, 0.45, dirZ, 5 + power * 24, clamp01(power * 1.45));
      }

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
      const halfL = 2.9 + car.spikeLevel * 0.24;
      const halfW = 1.62;
      const carAirborne = car.y > 1.8;

      this.updateShots(dt, car, game, world);

      for (let i = this.list.length - 1; i >= 0; i--) {
        const e = this.list[i];
        if (e.dead) continue;

        if (e.screamT > 0) e.screamT -= dt;
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
        let approach = 1;
        if (e.range > 0 && !stunned) approach = this.rangedAI(e, dt, dist, nx, nz, car, game);
        else if (e.type === 'screamer' && !stunned) this.screamAI(e, dt, game);
        const spd = e.speed * (e.slow > 0 ? 0.42 : 1) * (stunned ? 0 : 1) * approach;
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
              game.shake(0.06 + hitPower * 0.18);
              game.hitstop(0.018 + hitPower * 0.042);
              this.audio.hit(hitPower);
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

    /* ------------------------------------------------------ ranged AI */
    // returns a movement multiplier: 1 chase, 0 hold, -1 back off
    rangedAI(e, dt, dist, nx, nz, car, game) {
      e.attackCd -= dt;
      const inRange = dist < e.range;

      if (e.type === 'sniper') {
        if (e.aiming > 0) {
          e.aiming -= dt;
          e.beamX = car.x; e.beamZ = car.z;
          if (e.aiming <= 0) this.snipe(e, car, game);
          return 0;
        }
        if (inRange && e.attackCd <= 0 && dist > 8) {
          e.aiming = 1.15;
          e.attackCd = e.fireCd;
          this.audio.ui();
          return 0;
        }
      } else if (e.type === 'spitter') {
        if (inRange && e.attackCd <= 0) {
          e.attackCd = e.fireCd * rand(0.85, 1.2);
          const lead = 0.35;
          this.shots.push({
            x: e.x, y: 1.3 * e.scale, z: e.z,
            vx: (car.x + car.vx * lead - e.x) * 0.55 + rand(-1.5, 1.5),
            vy: 9.5,
            vz: (car.z + car.vz * lead - e.z) * 0.55 + rand(-1.5, 1.5),
            dmg: e.dmg, life: 3.5,
          });
          this.audio.squish();
          this.fx.fire(e.x, 1.4 * e.scale, e.z, 3, 0.3, 0.5);
          return 0;
        }
      }
      if (dist < e.keep) return -0.7;      // back away to stay at range
      return inRange ? 0.15 : 1;
    }

    snipe(e, car, game) {
      const dx = car.x - e.x, dz = car.z - e.z;
      const d = Math.hypot(dx, dz) || 1;
      this.beams.push({ x1: e.x, y1: 1.6 * e.scale, z1: e.z, x2: car.x, y2: 1.6, z2: car.z, life: 0.16, max: 0.16 });
      this.audio.shoot();
      this.fx.sparks(e.x + dx / d * 1.4, 1.6 * e.scale, e.z + dz / d * 1.4, 6, 1.3, 1.0, 0.4, 1.0);
      if (car.hurt(e.dmg, game)) {
        this.fx.sparks(car.x, 1.6, car.z, 12, 1.2, 0.8, 0.3, 1.3);
        game.shake(0.3);
      }
    }

    screamAI(e, dt, game) {
      e.attackCd -= dt;
      if (e.attackCd > 0) return;
      e.attackCd = e.fireCd;
      e.screamT = 0.9;
      this.audio.bigBad();
      this.fx.wave(e.x, 0.1, e.z, 1, 22, 0.7, 0.9, 0.3, 0.8, 1.2);
      const d = game.difficulty();
      const n = 5 + Math.floor(d * 3);
      for (let i = 0; i < n; i++) {
        const a = rand(TAU), r = rand(6, 16);
        this.spawn(Math.random() < 0.3 ? 'runner' : 'walker',
          e.x + Math.sin(a) * r, e.z + Math.cos(a) * r, game.hpMul(), game.spMul());
      }
      game.hud.toast('A SCREAMER CALLED THE HORDE');
    }

    /* ------------------------------------------------- enemy projectiles */
    updateShots(dt, car, game, world) {
      for (let i = this.shots.length - 1; i >= 0; i--) {
        const s2 = this.shots[i];
        s2.life -= dt;
        s2.vy -= 22 * dt;
        s2.x += s2.vx * dt; s2.y += s2.vy * dt; s2.z += s2.vz * dt;
        if (Math.random() < dt * 30) this.fx.sparks(s2.x, s2.y, s2.z, 1, 0.3, 0.8, 0.15, 0.4);
        const gh = world ? world.groundHeight(s2.x, s2.z) : 0;
        if (s2.y <= gh + 0.2 || s2.life <= 0) {
          this.shots.splice(i, 1);
          this.hazards.push({ x: s2.x, z: s2.z, r: 3.4, life: 5.5, max: 5.5, dps: s2.dmg * 0.9 });
          this.fx.fire(s2.x, 0.4, s2.z, 8, 0.5, 0.8);
          this.fx.splat(s2.x, s2.z, 3.0, 0.12, 0.30, 0.06, 0.7);
          this.audio.squish();
        }
      }
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const h = this.hazards[i];
        h.life -= dt;
        if (h.life <= 0) { this.hazards.splice(i, 1); continue; }
        if (Math.random() < dt * 6) this.fx.fire(h.x + rand(-h.r, h.r) * 0.6, 0.2, h.z + rand(-h.r, h.r) * 0.6, 1, 0.35, 0.3);
        if (Math.hypot(car.x - h.x, car.z - h.z) < h.r + 1.6) {
          h.tick = (h.tick || 0) - dt;
          if (h.tick <= 0) { h.tick = 0.5; car.hurt(h.dps * 0.5, game); }
        }
      }
      for (let i = this.beams.length - 1; i >= 0; i--) {
        this.beams[i].life -= dt;
        if (this.beams[i].life <= 0) this.beams.splice(i, 1);
      }
    }

    drawShots(R) {
      for (const s2 of this.shots) {
        R.push('sphere', 'opaque', s2.x, s2.y, s2.z, 0, 0, 0, 0.7, 0.7, 0.7, 0.22, 0.52, 0.10, 0.35);
        R.push('sphere', 'glow', s2.x, s2.y, s2.z, 0, 0, 0, 1.3, 1.3, 1.3, 0.16, 0.42, 0.06, 1);
      }
      for (const h of this.hazards) {
        const k = clamp01(h.life / h.max);
        R.push('disc', 'glow', h.x, 0.07, h.z, 0, 0, 0, h.r * 2, 1, h.r * 2, 0.08 * k, 0.22 * k, 0.04 * k, 1);
      }
      for (const b of this.beams) {
        const k = clamp01(b.life / b.max);
        BA.beam(R, 'glow', b.x1, b.y1, b.z1, b.x2, b.y2, b.z2, 0.14 * k + 0.03, 1.3 * k, 0.35 * k, 0.2 * k);
      }
      // sniper laser sights
      for (const e of this.list) {
        if (e.dead || e.aiming <= 0) continue;
        BA.beam(R, 'glow', e.x, 1.6 * e.scale, e.z, e.beamX || e.x, 1.4, e.beamZ || e.z, 0.05, 0.9, 0.06, 0.05);
      }
    }

    /* ------------------------------------------------------------- draw */
    draw(R, camX, camZ) {
      this.drawShots(R);
      for (const e of this.list) {
        if (e.dead) continue;
        const dx = e.x - camX, dz = e.z - camZ;
        const d2 = dx * dx + dz * dz;
        if (d2 > 200 * 200) continue;
        if (e.type === 'boss') { this.drawBoss(R, e); continue; }
        this.drawZombie(R, e, d2 > 62 * 62);
      }
    }

    drawZombie(R, e, far) {
      const s = e.scale;
      const yaw = e.yaw;
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const walk = Math.sin(e.phase);
      const walk2 = Math.cos(e.phase);
      const bob = Math.abs(walk) * 0.10 * s;
      const lean = e.stoop + walk2 * 0.05;
      const base = e.y;
      const g = e.girth;

      const f = e.flash;
      const em = f * 0.8 + (e.type === 'bomber' ? 0.30 + Math.sin(e.phase * 3) * 0.14 : 0);
      const mix3 = (c, m) => [
        lerp(c[0] * e.tint * (m || 1), 2.4, f),
        lerp(c[1] * e.tint * (m || 1), 2.0, f),
        lerp(c[2] * e.tint * (m || 1), 2.0, f),
      ];
      const skin = mix3(e.skin);
      const shirt = mix3(e.shirt);
      const pants = mix3(e.pants);

      // local -> world (yaw only; limb pitch is baked into the offsets)
      const P = (lx, ly, lz) => [e.x + lx * cy + lz * sy, base + ly, e.z - lx * sy + lz * cy];
      const B = (lx, ly, lz, sx, sy2, sz, col, pitch, roll, extraYaw) => {
        const p = P(lx, ly, lz);
        R.push('box', 'opaque', p[0], p[1], p[2], yaw + (extraYaw || 0), pitch || 0, roll || 0,
          sx, sy2, sz, col[0], col[1], col[2], em);
      };

      /* ---- rig: real joints, aimed limbs ---- */
      // local space is (x = right, y = up, z = forward); P() takes it to world
      const LIMB = (a, b, thick, col, mesh) => {
        const p0 = P(a[0], a[1], a[2]), p1 = P(b[0], b[1], b[2]);
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
        const len = Math.hypot(dx, dy, dz);
        if (len < 1e-4) return;
        R.push(mesh || 'cyl', 'opaque', (p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5, (p0[2] + p1[2]) * 0.5,
          Math.atan2(dx, dz), Math.atan2(Math.hypot(dx, dz), dy), 0,
          thick, len, thick, col[0], col[1], col[2], em);
      };
      const JOINT = (a, r2, col) => {
        const p = P(a[0], a[1], a[2]);
        R.push('sphere', 'opaque', p[0], p[1], p[2], 0, 0, 0, r2, r2, r2, col[0], col[1], col[2], em);
      };

      // the spine hunches, so everything above the hips rides forward of them
      const fwd = (h) => Math.sin(lean) * h * s;
      const hipY = 0.80 * s;
      const bellyY = (1.08 + bob) * s, bellyF = fwd(0.30);
      const chestY = (1.40 + bob) * s, chestF = fwd(0.62);
      const shY = (1.66 + bob) * s, shF = fwd(0.88);
      const headY = (2.08 + bob) * s;
      const headF = shF + 0.09 * s;
      const hyaw = walk2 * 0.14 + e.headTilt * 0.5;
      const bone = [skin[0] * 0.9, skin[1] * 0.88, skin[2] * 0.84];

      /* ---- trunk: pelvis, belly, ribcage ---- */
      const shirtLo = [shirt[0] * 0.78, shirt[1] * 0.78, shirt[2] * 0.80];
      const shirtHi = [shirt[0] * 1.12, shirt[1] * 1.12, shirt[2] * 1.14];
      B(0, hipY, 0, 0.62 * g * s, 0.40 * s, 0.44 * g * s, pants, lean * 0.5);
      // waist is narrower than the chest, so the silhouette tapers
      B(0, bellyY, bellyF, 0.66 * g * s, 0.54 * s, 0.44 * g * s, shirtLo, lean * 0.8);
      B(0, chestY, chestF, 0.82 * g * s, 0.60 * s, 0.52 * g * s, shirt, lean);
      // collar line and the shoulder caps that carry the arms
      B(0, shY, shF, 0.88 * g * s, 0.20 * s, 0.48 * g * s, shirtHi, lean);
      if (!far) {
        for (const side of [1, -1]) {
          JOINT([side * 0.41 * g * s, shY - 0.02 * s, shF], 0.29 * s, shirtHi);
        }
        if (e.gore) {
          // ribs showing through a torn shirt
          for (let i = 0; i < 3; i++) {
            B(0, chestY + (0.16 - i * 0.16) * s, chestF + 0.27 * g * s,
              0.46 * s, 0.07 * s, 0.05 * s, bone, lean);
          }
          B(0.02 * s, chestY - 0.02 * s, chestF + 0.26 * g * s,
            0.50 * s, 0.52 * s, 0.03 * s, [0.34, 0.04, 0.06], lean);
        }
      }

      /* ---- head: skull, brow, hanging jaw, sunken eyes ---- */
      const neckTop = [0, headY - 0.20 * s, headF - 0.02 * s];
      LIMB([0, shY - 0.02 * s, shF], neckTop, 0.19 * s,
        [skin[0] * 0.86, skin[1] * 0.84, skin[2] * 0.82]);
      const headSkin = [skin[0] * 1.08, skin[1] * 1.04, skin[2] * 1.0];
      B(0, headY, headF, 0.48 * s, 0.46 * s, 0.46 * s, headSkin, lean * 1.4, walk * 0.09, hyaw);
      if (!far) {
        // brow ridge and cheekbones give it a face at speed
        B(0, headY + 0.11 * s, headF + 0.22 * s, 0.46 * s, 0.11 * s, 0.10 * s,
          [headSkin[0] * 0.82, headSkin[1] * 0.80, headSkin[2] * 0.78], lean * 1.4, 0, hyaw);
        B(0, headY - 0.05 * s, headF + 0.21 * s, 0.40 * s, 0.16 * s, 0.06 * s,
          [headSkin[0] * 0.88, headSkin[1] * 0.86, headSkin[2] * 0.84], lean * 1.4, 0, hyaw);
      }
      // jaw hangs slack and open
      const gape = 0.16 + Math.abs(walk) * 0.06;
      B(0, headY - (0.22 + gape) * s, headF + 0.20 * s, 0.34 * s, 0.17 * s, 0.26 * s,
        [0.62, 0.26, 0.26], lean * 1.4, 0, hyaw);
      if (!far) {
        // teeth
        B(0, headY - (0.13 + gape * 0.4) * s, headF + 0.26 * s, 0.28 * s, 0.06 * s, 0.06 * s,
          [0.86, 0.84, 0.74], lean * 1.4, 0, hyaw);
      }
      for (const side of [1, -1]) {
        const sk = P(side * 0.13 * s, headY + 0.04 * s, headF + 0.20 * s);
        R.push('box', 'opaque', sk[0], sk[1], sk[2], yaw + hyaw, 0, 0,
          0.15 * s, 0.13 * s, 0.06 * s, 0.06, 0.04, 0.04, 0);
        const p = P(side * 0.13 * s, headY + 0.04 * s, headF + 0.24 * s);
        R.push('box', 'glow', p[0], p[1], p[2], yaw + hyaw, 0, 0, 0.10 * s, 0.09 * s, 0.05 * s,
          1.1, 0.42, 0.14, 1);
      }
      if (!far) {
        switch (e.hat) {
          case 1:  // cap
            B(0, headY + 0.28 * s, headF, 0.52 * s, 0.13 * s, 0.50 * s, mix3(e.shirt, 0.7), lean * 1.4, 0, hyaw);
            B(0, headY + 0.23 * s, headF + 0.34 * s, 0.48 * s, 0.06 * s, 0.24 * s, mix3(e.shirt, 0.7), lean * 1.4, 0, hyaw);
            break;
          case 2:  // hard hat
            B(0, headY + 0.30 * s, headF, 0.56 * s, 0.24 * s, 0.56 * s, [0.95, 0.72, 0.10], lean * 1.4, 0, hyaw);
            B(0, headY + 0.20 * s, headF + 0.02 * s, 0.66 * s, 0.08 * s, 0.66 * s, [0.85, 0.62, 0.08], lean * 1.4, 0, hyaw);
            break;
          case 3:  // matted hair
            B(0, headY + 0.25 * s, headF - 0.05 * s, 0.52 * s, 0.20 * s, 0.50 * s, [0.14, 0.11, 0.10], lean * 1.4, 0, hyaw);
            B(0, headY, headF - 0.26 * s, 0.42 * s, 0.44 * s, 0.14 * s, [0.14, 0.11, 0.10], lean * 1.4, 0, hyaw);
            break;
          case 4:  // riot helmet
            B(0, headY + 0.25 * s, headF, 0.60 * s, 0.28 * s, 0.60 * s, [0.20, 0.21, 0.24], lean * 1.4, 0, hyaw);
            B(0, headY + 0.03 * s, headF + 0.25 * s, 0.52 * s, 0.26 * s, 0.09 * s, [0.10, 0.16, 0.20], lean * 1.4, 0, hyaw);
            break;
          case 5:  // bandages
            B(0, headY + 0.12 * s, headF, 0.53 * s, 0.19 * s, 0.51 * s, [0.78, 0.75, 0.66], lean * 1.4, 0, hyaw);
            B(0.09 * s, headY + 0.12 * s, headF + 0.25 * s, 0.21 * s, 0.17 * s, 0.05 * s, [0.55, 0.10, 0.10], lean * 1.4, 0, hyaw);
            break;
        }
      }

      /* ---- arms: reaching, elbows bent, fingers hooked ---- */
      for (const side of [1, -1]) {
        const shoulder = [side * 0.41 * g * s, shY - 0.04 * s, shF];
        if (e.armless === side) {
          JOINT(shoulder, 0.32 * s, [0.45, 0.05, 0.07]);
          continue;
        }
        const swing = walk * side * 0.22;
        const a1 = -1.28 + swing + e.limp * 0.12 * side;
        const a2 = a1 - 0.42 - Math.abs(walk) * 0.22;
        const l1 = 0.44 * s, l2 = 0.42 * s;
        const elbow = [shoulder[0], shoulder[1] - Math.cos(a1) * l1, shoulder[2] - Math.sin(a1) * l1];
        LIMB(shoulder, elbow, 0.24 * s, shirt);
        if (far) continue;
        const hand = [elbow[0], elbow[1] - Math.cos(a2) * l2, elbow[2] - Math.sin(a2) * l2];
        JOINT(elbow, 0.23 * s, shirt);
        LIMB(elbow, hand, 0.20 * s, skin);
        // palm plus three hooked fingers
        const claw = [skin[0] * 0.82, skin[1] * 0.80, skin[2] * 0.78];
        B(hand[0], hand[1] - 0.06 * s, hand[2] + 0.10 * s, 0.22 * s, 0.20 * s, 0.20 * s, claw, a2);
        for (let fdx = -1; fdx <= 1; fdx++) {
          const tip = [hand[0] + fdx * 0.07 * s, hand[1] - 0.20 * s, hand[2] + 0.26 * s];
          LIMB([hand[0] + fdx * 0.07 * s, hand[1] - 0.08 * s, hand[2] + 0.16 * s], tip, 0.06 * s, claw);
        }
      }

      /* ---- legs: one drags, giving every walker a limp ---- */
      for (const side of [1, -1]) {
        const stiff = side === (e.limp > 0 ? 1 : -1) ? 0.35 : 1;
        const a1 = walk * side * 0.62 * (0.5 + stiff * 0.5);
        const a2 = a1 + Math.max(0, -walk * side) * 0.75 * stiff;
        const hip = [side * 0.24 * g * s, hipY - 0.14 * s, 0];
        const l1 = 0.42 * s, l2 = 0.42 * s;
        const knee = [hip[0], hip[1] - Math.cos(a1) * l1, hip[2] - Math.sin(a1) * l1];
        LIMB(hip, knee, 0.30 * s, pants);
        if (far) continue;
        const ankle = [knee[0], knee[1] - Math.cos(a2) * l2, knee[2] - Math.sin(a2) * l2];
        JOINT(knee, 0.27 * s, pants);
        LIMB(knee, ankle, 0.25 * s, [pants[0] * 0.85, pants[1] * 0.85, pants[2] * 0.85]);
        // boot, flat on the floor and pointing where it walks
        B(ankle[0], ankle[1] - 0.04 * s, ankle[2] + 0.10 * s,
          0.28 * s, 0.16 * s, 0.44 * s, [0.12, 0.11, 0.11], 0);
      }

      /* ---- type extras ---- */
      if (e.type === 'brute') {
        for (const side of [1, -1]) {
          B(side * 0.68 * g * s, 1.62 * s, 0, 0.52 * s, 0.42 * s, 0.62 * s, [0.24, 0.22, 0.24], 0, side * 0.25);
          if (!far) B(side * 0.78 * g * s, 1.82 * s, 0, 0.3 * s, 0.22 * s, 0.3 * s, [0.55, 0.56, 0.6], 0, side * 0.25);
        }
        B(0, 1.2 * s, -0.34 * g * s, 0.9 * s, 0.9 * s, 0.16 * s, [0.20, 0.19, 0.21], lean);
      }
      if (e.type === 'spitter') {
        // distended acid gut and a split jaw
        const pulse = 0.55 + Math.sin(e.phase * 2.6) * 0.35;
        const p2 = P(0, (1.05 + bob) * s, 0.34 * g * s);
        R.push('sphere', 'opaque', p2[0], p2[1], p2[2], yaw, 0, 0, 1.05 * s, 0.95 * s, 0.9 * s,
          0.24, 0.44, 0.16, em);
        R.push('sphere', 'glow', p2[0], p2[1], p2[2], 0, 0, 0, 1.2 * s, 1.1 * s, 1.0 * s,
          0.10 * pulse, 0.34 * pulse, 0.05 * pulse, 1);
        B(0, headY - 0.3 * s, 0.4 * s, 0.42 * s, 0.34 * s, 0.34 * s, [0.24, 0.5, 0.14], lean * 1.5, 0, hyaw);
      }
      if (e.type === 'sniper') {
        // scavenged rifle held across the body
        const gx = 0.34 * s, gy = (1.35 + bob) * s;
        B(gx, gy, 0.85 * s, 0.16 * s, 0.16 * s, 1.7 * s, [0.20, 0.18, 0.16], -0.15, 0, 0);
        B(gx, gy + 0.18 * s, 0.3 * s, 0.14 * s, 0.24 * s, 0.5 * s, [0.30, 0.24, 0.16], -0.15, 0, 0);
        B(gx, gy + 0.3 * s, 0.55 * s, 0.1 * s, 0.12 * s, 0.4 * s, [0.4, 0.42, 0.46], -0.15, 0, 0);
        // long coat
        B(0, (0.86 + bob) * s, -0.06 * s, 0.94 * g * s, 0.9 * s, 0.6 * g * s,
          [shirt[0] * 0.7, shirt[1] * 0.7, shirt[2] * 0.7], lean * 0.6);
        if (e.aiming > 0) {
          const q = P(0, headY, 0.4 * s);
          R.push('sphere', 'glow', q[0], q[1], q[2], 0, 0, 0, 0.9 * s, 0.9 * s, 0.9 * s, 0.7, 0.06, 0.05, 1);
        }
      }
      if (e.type === 'screamer') {
        const open = e.screamT > 0 ? 1 : 0.25 + Math.sin(e.phase * 2) * 0.1;
        B(0, headY - 0.26 * s, 0.34 * s, 0.44 * s, 0.5 * s * open + 0.1 * s, 0.3 * s,
          [0.7, 0.12, 0.22], lean * 1.5, 0, hyaw);
        const q = P(0, headY - 0.24 * s, 0.5 * s);
        R.push('sphere', 'glow', q[0], q[1], q[2], 0, 0, 0,
          (0.7 + open) * s, (0.7 + open) * s, (0.7 + open) * s, 0.55 * open, 0.10 * open, 0.28 * open, 1);
        if (e.screamT > 0) {
          R.push('ring', 'glow', e.x, 0.1, e.z, 0, 0, 0,
            (1 - e.screamT / 0.9) * 40, 1.6, (1 - e.screamT / 0.9) * 40,
            0.5 * e.screamT, 0.14 * e.screamT, 0.4 * e.screamT, 1);
        }
        for (const side of [1, -1]) {
          B(side * 0.5 * g * s, (1.68 + bob) * s, 0, 0.3 * s, 0.4 * s, 0.3 * s, [0.5, 0.2, 0.34], 0, side * 0.4);
        }
      }
      if (e.type === 'bomber') {
        // pulsing sacs
        const pulse = 0.6 + Math.sin(e.phase * 3.2) * 0.4;
        for (const o of [[0.34, 1.42, 0.3], [-0.36, 1.18, 0.28], [0.1, 0.96, 0.34]]) {
          const p = P(o[0] * s, o[1] * s, o[2] * g * s);
          R.push('sphere', 'glow', p[0], p[1], p[2], 0, 0, 0, 0.42 * s, 0.42 * s, 0.42 * s,
            0.24 * pulse, 0.7 * pulse, 0.12 * pulse, 1);
        }
      }

      R.shadow(e.x, e.z, 1.5 * s * g, clamp01(0.55 - e.y * 0.08));
    }

    /* ------------------------------------------------------------- boss */
    drawBoss(R, e) {
      const s = e.scale;
      const yaw = e.yaw;
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const walk = Math.sin(e.phase * 0.8);
      const walk2 = Math.cos(e.phase * 0.8);
      const bob = Math.abs(walk) * 0.12 * s;
      const base = e.y;
      const f = e.flash;
      const hp01 = clamp01(e.hp / e.maxHp);
      const rage = 1 - hp01;                       // armour blows off, core burns brighter
      const t = performance.now() * 0.001;

      const P = (lx, ly, lz) => [e.x + lx * cy + lz * sy, base + ly, e.z - lx * sy + lz * cy];
      const put = (lx, ly, lz, sx, sy2, sz, r, g, b, pitch, roll, em) => {
        const p = P(lx, ly, lz);
        R.push('box', 'opaque', p[0], p[1], p[2], yaw, pitch || 0, roll || 0, sx, sy2, sz,
          lerp(r, 2.4, f), lerp(g, 2.0, f), lerp(b, 2.0, f), (em || 0) + f * 0.8);
      };
      const glow = (mesh, lx, ly, lz, sx, sy2, sz, r, g, b) => {
        const p = P(lx, ly, lz);
        R.push(mesh, 'glow', p[0], p[1], p[2], yaw, 0, 0, sx, sy2, sz, r, g, b, 1);
      };

      const flesh = [0.40, 0.13, 0.14];
      const meat = [0.52, 0.16, 0.16];
      const iron = [0.19, 0.18, 0.20];

      /* legs: thick, splayed */
      for (const side of [1, -1]) {
        const a1 = walk * side * 0.42;
        const hX = side * 0.42 * s, hY = 0.92 * s;
        const l1 = 0.55 * s;
        const k1y = hY - Math.cos(a1) * l1, k1z = -Math.sin(a1) * l1;
        put(hX, (hY + k1y) / 2, k1z / 2, 0.52 * s, l1 + 0.14 * s, 0.5 * s, flesh[0], flesh[1], flesh[2], a1);
        const a2 = a1 + 0.24;
        const k2y = k1y - Math.cos(a2) * l1, k2z = k1z - Math.sin(a2) * l1;
        put(hX, (k1y + k2y) / 2, (k1z + k2z) / 2, 0.46 * s, l1 + 0.1 * s, 0.44 * s, 0.15, 0.14, 0.15, a2);
        put(hX, k2y - 0.08 * s, k2z + 0.14 * s, 0.5 * s, 0.2 * s, 0.66 * s, 0.11, 0.10, 0.11, 0);
      }

      /* torso: hunched slab with a cracked-open chest */
      const chestY = (1.55 + bob) * s;
      put(0, chestY, 0, 1.5 * s, 1.25 * s, 0.95 * s, meat[0], meat[1], meat[2], 0.14);
      put(0, (1.0 + bob) * s, 0, 1.25 * s, 0.5 * s, 0.85 * s, flesh[0], flesh[1], flesh[2], 0.1);
      // ribcage prised open around a burning core
      for (let i = 0; i < 4; i++) {
        const ry = chestY + (i - 1.5) * 0.26 * s;
        for (const side of [1, -1]) {
          put(side * 0.36 * s, ry, 0.5 * s, 0.28 * s, 0.13 * s, 0.28 * s, 0.78, 0.74, 0.62, 0, side * 0.3);
        }
      }
      const core = 0.5 + rage * 0.9 + Math.sin(t * 6) * 0.12;
      glow('sphere', 0, chestY, 0.42 * s, 0.95 * s, 1.15 * s, 0.6 * s, 0.95 * core, 0.20 * core, 0.06 * core);
      glow('disc', 0, 0.06 - base, 0, 13 * s * 0.3, 1, 13 * s * 0.3, 0.30 * core, 0.05, 0.04);

      /* armour plates: they shed as the boss takes damage */
      const plates = Math.ceil(4 * hp01);
      for (let i = 0; i < plates; i++) {
        const ly = (0.9 + i * 0.42) * s + bob;
        put(0, ly, -0.5 * s, 1.6 * s, 0.36 * s, 0.28 * s, iron[0], iron[1], iron[2], 0.14);
      }
      if (plates > 1) put(0, chestY + 0.1 * s, 0.52 * s, 0.55 * s, 0.9 * s, 0.2 * s, 0.24, 0.23, 0.25, 0.1);

      /* spiked shoulders */
      for (const side of [1, -1]) {
        put(side * 1.05 * s, (2.05 + bob) * s, 0, 0.78 * s, 0.62 * s, 0.86 * s, iron[0], iron[1], iron[2], 0, side * 0.3);
        for (let i = 0; i < 3; i++) {
          const p = P(side * (1.15 + i * 0.06) * s, (2.35 + bob + i * 0.02) * s, (-0.3 + i * 0.3) * s);
          R.push('cone', 'opaque', p[0], p[1], p[2], yaw, 0, side * 0.5,
            0.28 * s, 0.7 * s, 0.28 * s, 0.62, 0.63, 0.68, 0.05);
        }
      }

      /* arms: one normal, one grotesquely oversized */
      for (const side of [1, -1]) {
        const big = side === 1;
        const m = big ? 1.5 : 1.0;
        const swing = walk * side * 0.3;
        const a1 = -0.75 + swing;
        const l1 = 0.72 * s * m;
        const shX = side * 1.0 * s, shY = (1.95 + bob) * s;
        const e1y = shY - Math.cos(a1) * l1, e1z = -Math.sin(a1) * l1;
        put(shX * (big ? 1.12 : 1), (shY + e1y) / 2, e1z / 2, 0.44 * s * m, l1 + 0.14 * s, 0.44 * s * m,
          flesh[0], flesh[1], flesh[2], a1);
        const a2 = a1 - 0.7;
        const l2 = 0.7 * s * m;
        const e2y = e1y - Math.cos(a2) * l2, e2z = e1z - Math.sin(a2) * l2;
        put(shX * (big ? 1.12 : 1), (e1y + e2y) / 2, (e1z + e2z) / 2, 0.40 * s * m, l2 + 0.1 * s, 0.40 * s * m,
          meat[0], meat[1], meat[2], a2);
        // fist / claw
        const p = P(shX * (big ? 1.12 : 1), e2y - 0.2 * s * m, e2z + 0.1 * s);
        R.push('box', 'opaque', p[0], p[1], p[2], yaw, a2, 0, 0.55 * s * m, 0.5 * s * m, 0.6 * s * m,
          lerp(0.3, 2.4, f), lerp(0.1, 2.0, f), lerp(0.11, 2.0, f), f * 0.8);
        if (big) {
          for (let i = 0; i < 3; i++) {
            const q = P(shX * 1.12 + (i - 1) * 0.24 * s, e2y - 0.34 * s * m, e2z + 0.42 * s);
            R.push('cone', 'opaque', q[0], q[1], q[2], yaw, Math.PI / 2 + a2, 0,
              0.16 * s, 0.5 * s, 0.16 * s, 0.7, 0.68, 0.62, 0.05);
          }
        }
      }

      /* head: sunken, helmeted, furnace eyes */
      const headY = (2.55 + bob) * s;
      put(0, headY, 0.06 * s, 0.86 * s, 0.8 * s, 0.82 * s, 0.46, 0.15, 0.15, 0.2, walk2 * 0.06);
      put(0, headY + 0.4 * s, 0, 0.98 * s, 0.34 * s, 0.98 * s, iron[0], iron[1], iron[2], 0.2);
      put(0, headY - 0.3 * s, 0.36 * s, 0.6 * s, 0.28 * s, 0.34 * s, 0.72, 0.3, 0.3, 0.2);
      for (let i = 0; i < 4; i++) {
        const q = P((-0.24 + i * 0.16) * s, headY - 0.28 * s, 0.5 * s);
        R.push('cone', 'opaque', q[0], q[1], q[2], yaw, Math.PI, 0, 0.1 * s, 0.2 * s, 0.1 * s, 0.85, 0.83, 0.75, 0);
      }
      for (const side of [1, -1]) {
        glow('box', side * 0.22 * s, headY + 0.08 * s, 0.44 * s, 0.2 * s, 0.16 * s, 0.08 * s,
          1.5, 0.25 * (1 - rage * 0.5), 0.1);
      }

      /* chains swinging off the shoulders */
      for (const side of [1, -1]) {
        for (let i = 0; i < 4; i++) {
          const sw = Math.sin(t * 3 + i * 0.6 + side) * 0.12 * i;
          const p = P(side * (1.0 + sw) * s, (1.9 - i * 0.3 + bob) * s, -0.5 * s);
          R.push('box', 'opaque', p[0], p[1], p[2], yaw, 0, sw * 2,
            0.16 * s, 0.24 * s, 0.16 * s, 0.3, 0.29, 0.3, 0);
        }
      }

      R.shadow(e.x, e.z, 3.2 * s, clamp01(0.6 - e.y * 0.06));
    }
  }

  BA.Horde = Horde;
  BA.ENEMY_TYPES = TYPES;
})();
