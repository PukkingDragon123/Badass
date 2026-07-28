/* BADASS APOCALYPSE - endless procedural wasteland: ramps, wrecks, barrels */
(function () {
  'use strict';
  const { clamp, clamp01, lerp, rand, TAU, smoothstep } = BA;

  const CHUNK = 62;
  const VIEW_CHUNKS = 3;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class World {
    constructor(fx, audio) {
      this.fx = fx;
      this.audio = audio;
      this.chunks = new Map();
      this.props = [];
      this.ramps = [];
      this.time = 0;
    }

    setStage(stage) {
      this.stage = stage;
      this.reset();
    }

    reset() {
      this.chunks.clear();
      this.props.length = 0;
      this.ramps.length = 0;
      this.time = 0;
      this.runId = (this.runId || 0) + 1;
    }

    key(cx, cz) { return cx + ',' + cz; }

    ensure(px, pz) {
      const ccx = Math.round(px / CHUNK), ccz = Math.round(pz / CHUNK);
      for (let dz = -VIEW_CHUNKS; dz <= VIEW_CHUNKS; dz++) {
        for (let dx = -VIEW_CHUNKS; dx <= VIEW_CHUNKS; dx++) {
          const cx = ccx + dx, cz = ccz + dz;
          const k = this.key(cx, cz);
          if (!this.chunks.has(k)) this.genChunk(cx, cz, k);
        }
      }
      // drop far chunks
      const far = (VIEW_CHUNKS + 1.6) * CHUNK;
      for (const [k, ch] of this.chunks) {
        if (Math.abs(ch.x - px) > far || Math.abs(ch.z - pz) > far) {
          this.chunks.delete(k);
          for (const p of ch.props) {
            const i = this.props.indexOf(p);
            if (i >= 0) this.props.splice(i, 1);
            if (p.type === 'ramp') {
              const j = this.ramps.indexOf(p);
              if (j >= 0) this.ramps.splice(j, 1);
            }
          }
        }
      }
    }

    genChunk(cx, cz, k) {
      const rng = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ 0x9e3779b9);
      const ox = cx * CHUNK, oz = cz * CHUNK;
      const ch = { x: ox, z: oz, props: [] };
      const isSpawn = cx === 0 && cz === 0;

      const add = (p) => {
        if (isSpawn && Math.hypot(p.x, p.z) < 16) return;
        p.seed = rng();
        ch.props.push(p);
        this.props.push(p);
        if (p.type === 'ramp') this.ramps.push(p);
      };

      const stage = this.stage || BA.stages.byId.waste;
      stage.gen(rng, ox, oz, (p) => {
        if (p.solid === undefined) p.solid = false;
        if (p.hp === undefined) p.hp = 60;
        if (p.radius === undefined) p.radius = 1.5;
        add(p);
      });

      this.chunks.set(k, ch);
    }

    /* ---------------------------------------------------------- terrain */
    groundHeight(x, z) {
      let h = 0;
      for (const r of this.ramps) {
        const dx = x - r.x, dz = z - r.z;
        if (dx * dx + dz * dz > (r.L + r.W) * (r.L + r.W)) continue;
        const c = Math.cos(-r.yaw), s = Math.sin(-r.yaw);
        const lx = dx * c + dz * s;
        const lz = -dx * s + dz * c;
        if (lz < -r.L / 2 || lz > r.L / 2) continue;
        const wf = 1 - smoothstep(r.W * 0.5 - 1.4, r.W * 0.5, Math.abs(lx));
        if (wf <= 0) continue;
        const t = clamp01((lz + r.L / 2) / r.L);
        const hh = r.H * t * wf;
        if (hh > h) h = hh;
      }
      return h;
    }

    /* ------------------------------------------------------- collisions */
    update(dt, car, game) {
      this.time += dt;
      this.ensure(car.x, car.z);

      const carR = 2.0;
      for (let i = this.props.length - 1; i >= 0; i--) {
        const p = this.props[i];
        if (p.dead) continue;
        if (p.type === 'ramp') continue;
        const dx = car.x - p.x, dz = car.z - p.z;
        const d = Math.hypot(dx, dz);
        const minD = carR + p.radius;
        if (d > minD) continue;
        const speed = car.speed;
        const nx = d > 0.001 ? dx / d : 1, nz = d > 0.001 ? dz / d : 0;

        if (p.type === 'barrel') { this.explodeBarrel(p, game); continue; }
        if (p.type === 'gascan') { this.grabGas(p, game); continue; }
        if (p.type === 'crate') { this.breakCrate(p, game); continue; }
        if (p.type === 'pile') { this.stripPile(p, game, speed); continue; }

        const impact = speed * (car.vx * -nx + car.vz * -nz > 0 ? 1 : 0.25);
        const dmg = impact * 9 * (1 + car.stats.ramDamage / 60);
        p.hp -= dmg;
        if (p.hp <= 0) {
          this.destroyProp(p, game, -nx, -nz, impact);
          continue;
        }
        // bounce
        const push = (minD - d) + 0.05;
        car.x += nx * push;
        car.z += nz * push;
        const vn = car.vx * nx + car.vz * nz;
        if (vn < 0) {
          const restitution = 0.42;
          car.vx -= (1 + restitution) * vn * nx;
          car.vz -= (1 + restitution) * vn * nz;
          const fx_ = Math.sin(car.yaw), fz = Math.cos(car.yaw);
          car.vf = car.vx * fx_ + car.vz * fz;
          car.vr = car.vx * Math.cos(car.yaw) + car.vz * -Math.sin(car.yaw);
          car.squashVel = -6 - Math.abs(vn) * 0.5;
          if (speed > 9) {
            game.shake(clamp01(speed / 40) * 0.5);
            game.hitstop(0.05);
            this.audio.hit(clamp01(speed / 45));
            this.fx.sparks(p.x + nx * p.radius, 1.0, p.z + nz * p.radius, 12, 1.0, 0.8, 0.35, 1.2);
            this.fx.smoke(p.x, 1.0, p.z, 3, 0.8, 0.4, 0.38, 0.35, 1);
            car.hurt(clamp(speed * 0.32, 3, 16), game);
          }
        }
      }
    }

    explodeBarrel(p, game, runId) {
      if (p.dead) return;
      if (runId !== undefined && runId !== this.runId) return;
      p.dead = true;
      this.audio.explode(1.1);
      this.fx.fire(p.x, 1.2, p.z, 26, 1.4, 2.2);
      this.fx.smoke(p.x, 1.4, p.z, 14, 1.7, 0.18, 0.16, 0.16, 1.4);
      this.fx.shard(p.x, 1.0, p.z, 10, 0.55, 0.15, 0.12);
      this.fx.wave(p.x, 0.1, p.z, 1, 13, 0.45, 1.4, 0.6, 0.15, 1.4);
      this.fx.splat(p.x, p.z, 5.5, 0.07, 0.06, 0.06, 0.7);
      game.explosion(p.x, p.z, 11, 95, 'barrel');
      game.shake(0.55);
      game.flash(0.35, [1.0, 0.55, 0.2]);
      // chain reaction
      for (const q of this.props) {
        if (q.dead || q === p) continue;
        if (q.type === 'barrel' && Math.hypot(q.x - p.x, q.z - p.z) < 12) {
          q.chain = (q.chain || 0) + 1;
          const rid = this.runId;
          setTimeout(() => this.explodeBarrel(q, game, rid), 90 + Math.random() * 130);
        }
      }
    }

    /* heaps come apart as you plough through them */
    stripPile(p, game, speed) {
      if (p.dead) return;
      p.hp -= 20 + speed * 3;
      this.fx.shard(p.x, 0.8, p.z, 4, 0.42, 0.40, 0.36);
      this.fx.smoke(p.x, 0.7, p.z, 2, 0.7, 0.34, 0.31, 0.28, 0.8);
      const res = p.kind < 0.55 ? 'scrap' : p.kind < 0.85 ? 'ore' : 'wood';
      game.dropLoot(p.x + rand(-1.5, 1.5), p.z + rand(-1.5, 1.5), res, 1);
      if (p.hp <= 0) {
        p.dead = true;
        this.audio.hit(0.5);
        this.fx.shard(p.x, 1.0, p.z, 10, 0.42, 0.40, 0.36);
        for (let i = 0; i < 4; i++) game.dropLoot(p.x + rand(-2, 2), p.z + rand(-2, 2), res, 2);
      }
    }

    grabGas(p, game) {
      if (p.dead) return;
      p.dead = true;
      const car = game.car;
      const before = car.fuel;
      car.refuel(car.maxFuel * 0.4);
      this.audio.pickup(0.6);
      this.fx.sparks(p.x, 1.0, p.z, 12, 1.3, 0.85, 0.25, 1.1);
      this.fx.shard(p.x, 0.8, p.z, 6, 0.62, 0.16, 0.09);
      this.fx.fire(p.x, 0.7, p.z, 5, 0.5, 0.6);
      const gained = Math.round(car.fuel - before);
      if (gained > 0) this.fx.text(p.x, 2.4, p.z, '+' + gained + ' GAS', '#ffd23a', 22, 'big');
    }

    breakCrate(p, game) {
      if (p.dead) return;
      p.dead = true;
      this.audio.squish();
      this.fx.shard(p.x, 0.9, p.z, 12, 0.55, 0.38, 0.18);
      this.fx.smoke(p.x, 0.8, p.z, 4, 0.7, 0.6, 0.5, 0.35, 1);
      if (p.loot < 0.32) game.dropHealth(p.x, p.z);
      else if (p.loot < 0.6) game.dropFuel(p.x, p.z);
      else game.spawnXp(p.x, p.z, 4, 3);
    }

    destroyProp(p, game, dx, dz, impact) {
      p.dead = true;
      if (p.type === 'shack' || p.type === 'silo') {
        const isSilo = p.type === 'silo';
        this.audio.explode(1.1);
        this.fx.shard(p.x, 1.6, p.z, 26, isSilo ? 0.72 : 0.5, isSilo ? 0.62 : 0.38, isSilo ? 0.3 : 0.22);
        this.fx.smoke(p.x, 2.0, p.z, 14, 1.6, 0.34, 0.30, 0.26, 1.3);
        this.fx.wave(p.x, 0.1, p.z, 1, 12, 0.5, 0.9, 0.7, 0.4, 1.2);
        game.shake(0.55);
        const table = isSilo ? [['food', 5], ['scrap', 2]]
          : p.kind < 0.4 ? [['ore', 4], ['scrap', 3]]
            : p.kind < 0.7 ? [['scrap', 5], ['stone', 2]]
              : [['wood', 3], ['food', 2]];
        for (const [res, n] of table) {
          for (let i = 0; i < n; i++) game.dropLoot(p.x + rand(-3, 3), p.z + rand(-3, 3), res, 2);
        }
        this.fx.text(p.x, 3.2, p.z, isSilo ? 'SILO DOWN!' : 'DEMOLISHED!', '#ffd84a', 24, 'big');
        game.spawnXp(p.x, p.z, 4, 2);
        return;
      }
      const big = p.type === 'wreck';
      this.audio.explode(big ? 1.3 : 0.7);
      if (big) {
        this.fx.fire(p.x, 1.2, p.z, 20, 1.3, 1.8);
        this.fx.wave(p.x, 0.1, p.z, 1, 11, 0.4, 1.3, 0.6, 0.2, 1.2);
        game.explosion(p.x, p.z, 9, 70, 'wreck');
        game.flash(0.25, [1.0, 0.6, 0.25]);
      }
      this.fx.shard(p.x, 1.0, p.z, big ? 18 : 10, 0.4, 0.4, 0.44);
      this.fx.smoke(p.x, 1.2, p.z, 8, 1.2, 0.2, 0.19, 0.19, 1.2);
      this.fx.sparks(p.x, 1.0, p.z, 16, 1.0, 0.8, 0.3, 1.4);
      game.shake(0.4);
      game.spawnXp(p.x, p.z, big ? 5 : 2, 2);
      this.fx.text(p.x, 2.5, p.z, 'SMASHED!', '#ffd84a', 22, 'big');
    }

    /* -------------------------------------------------------------- draw */
    draw(R, camX, camZ) {
      const t = this.time;
      for (const p of this.props) {
        if (p.dead) continue;
        const dx = p.x - camX, dz = p.z - camZ;
        const d2 = dx * dx + dz * dz;
        if (d2 > 240 * 240) continue;
        // don't render props sitting in the camera's lap - they fill the screen
        if (p.type !== 'ramp' && this.eyeX !== undefined) {
          const ex = p.x - this.eyeX, ez = p.z - this.eyeZ;
          if (ex * ex + ez * ez < 34) continue;
        }
        switch (p.type) {
          case 'ramp': this.drawRamp(R, p); break;
          case 'barrel': {
            const bob = Math.sin(t * 2 + p.bob) * 0.03;
            R.push('cyl', 'opaque', p.x, 0.95 + bob, p.z, p.yaw, 0, 0, 1.5, 1.9, 1.5, 0.62, 0.14, 0.09, 0.04);
            R.push('cyl', 'opaque', p.x, 1.25 + bob, p.z, p.yaw, 0, 0, 1.56, 0.22, 1.56, 0.92, 0.72, 0.10, 0.10);
            R.push('cyl', 'opaque', p.x, 0.62 + bob, p.z, p.yaw, 0, 0, 1.56, 0.22, 1.56, 0.92, 0.72, 0.10, 0.10);
            R.shadow(p.x, p.z, 1.5, 0.5);
            break;
          }
          case 'gascan': {
            const bob = Math.sin(t * 2.4 + p.bob) * 0.05;
            R.push('box', 'opaque', p.x, 0.75 + bob, p.z, p.yaw, 0, 0, 1.15, 1.5, 0.85, 0.66, 0.15, 0.08, 0.05);
            R.push('box', 'opaque', p.x, 0.85 + bob, p.z, p.yaw, 0, 0, 1.2, 0.42, 0.9, 1.05, 0.80, 0.14, 0.45);
            R.push('box', 'opaque', p.x, 1.6 + bob, p.z, p.yaw, 0, 0, 0.45, 0.32, 0.32, 0.28, 0.28, 0.3, 0);
            R.push('sphere', 'glow', p.x, 0.9 + bob, p.z, 0, 0, 0, 2.4, 2.4, 2.4, 0.16, 0.09, 0.02, 1);
            R.shadow(p.x, p.z, 1.4, 0.5);
            break;
          }
          case 'pile': {
            const hp01 = clamp01(p.hp / 60);
            const res = p.kind < 0.55 ? [0.55, 0.48, 0.22] : p.kind < 0.85 ? [0.5, 0.54, 0.6] : [0.7, 0.5, 0.55];
            for (let i = 0; i < 5; i++) {
              const a = p.seed * 6.28 + i * 1.9;
              const rr = 0.5 + (i % 3) * 0.55;
              R.push('box', 'opaque', p.x + Math.cos(a) * rr, 0.3 + (i % 2) * 0.4 * hp01, p.z + Math.sin(a) * rr,
                a, 0.3, 0.4, 1.1 * hp01 + 0.3, 0.7 * hp01 + 0.2, 1.0 * hp01 + 0.3,
                res[0], res[1], res[2], 0);
            }
            R.push('sphere', 'glow', p.x, 0.6, p.z, 0, 0, 0, 3.0, 1.4, 3.0, res[0] * 0.06, res[1] * 0.06, res[2] * 0.06, 1);
            R.shadow(p.x, p.z, 2.4, 0.45);
            break;
          }
          case 'shack': {
            const hp01 = clamp01(p.hp / 260);
            const lean = (1 - hp01) * 0.16;
            const wood = p.kind < 0.4 ? [0.34, 0.36, 0.40] : [0.46, 0.30, 0.19];
            R.push('box', 'opaque', p.x, 1.5, p.z, p.yaw, lean, 0, 5.0, 3.0, 4.2, wood[0], wood[1], wood[2], 0);
            R.push('box', 'opaque', p.x, 3.2, p.z, p.yaw, lean, 0, 5.6, 0.5, 4.8, wood[0] * 0.7, wood[1] * 0.7, wood[2] * 0.7, 0);
            R.push('box', 'opaque', p.x + Math.sin(p.yaw) * 2.1, 1.1, p.z + Math.cos(p.yaw) * 2.1, p.yaw, 0, 0,
              1.4, 2.2, 0.2, 0.16, 0.14, 0.12, 0);
            R.push('box', 'opaque', p.x + Math.sin(p.yaw + 1.6) * 2.5, 1.8, p.z + Math.cos(p.yaw + 1.6) * 2.5, p.yaw, 0, 0,
              0.2, 1.0, 1.2, 0.5, 0.7, 0.85, 0.2);
            if (hp01 < 0.6 && Math.random() < 0.05) this.fx.smoke(p.x, 3.4, p.z, 1, 0.8, 0.3, 0.28, 0.26, 1);
            R.shadow(p.x, p.z, 3.6, 0.55);
            break;
          }
          case 'silo': {
            const hp01 = clamp01(p.hp / 320);
            R.push('cyl', 'opaque', p.x, 3.4, p.z, p.yaw, 0, (1 - hp01) * 0.1, 4.4, 6.8, 4.4, 0.62, 0.58, 0.48, 0);
            R.push('cyl', 'opaque', p.x, 6.9, p.z, p.yaw, 0, 0, 4.8, 0.4, 4.8, 0.42, 0.40, 0.34, 0);
            R.push('cone', 'opaque', p.x, 7.1, p.z, p.yaw, 0, 0, 4.4, 1.8, 4.4, 0.5, 0.34, 0.18, 0);
            for (let i = 0; i < 3; i++) {
              R.push('cyl', 'opaque', p.x, 1.4 + i * 2.0, p.z, p.yaw, 0, 0, 4.6, 0.3, 4.6, 0.36, 0.34, 0.30, 0);
            }
            R.shadow(p.x, p.z, 3.0, 0.55);
            break;
          }
          case 'house': {
            const hp01 = clamp01(p.hp / 900);
            const wallPal = [[0.72, 0.68, 0.60], [0.60, 0.50, 0.42], [0.52, 0.56, 0.60], [0.68, 0.58, 0.48]];
            const roofPal = [[0.34, 0.20, 0.16], [0.24, 0.24, 0.28], [0.30, 0.26, 0.18], [0.20, 0.28, 0.30]];
            const wc = wallPal[(p.wall * wallPal.length) | 0] || wallPal[0];
            const rc = roofPal[(p.roof * roofPal.length) | 0] || roofPal[0];
            const dmg = lerp(0.55, 1, hp01);
            const w = p.w, d = p.d, h = p.h;
            const sy = Math.sin(p.yaw), cyw = Math.cos(p.yaw);
            const P2 = (lx, lz) => [p.x + lx * cyw + lz * sy, p.z - lx * sy + lz * cyw];
            for (let st = 0; st < (p.storey || 1); st++) {
              const y0 = h / 2 + st * h * 0.92;
              R.push('box', 'opaque', p.x, y0, p.z, p.yaw, 0, 0, w, h, d, wc[0] * dmg, wc[1] * dmg, wc[2] * dmg, 0);
              // windows on the long faces
              for (let i = -1; i <= 1; i++) {
                if (i === 0 && st === 0) continue;
                for (const face of [1, -1]) {
                  const q = P2(i * w * 0.3, face * (d / 2 + 0.06));
                  R.push('box', 'opaque', q[0], y0 + 0.3, q[1], p.yaw, 0, 0,
                    w * 0.18, h * 0.34, 0.12, 0.10, 0.14, 0.18, 0);
                }
              }
            }
            const top = h * (p.storey || 1) * 0.92;
            R.push('box', 'opaque', p.x, top + 0.35, p.z, p.yaw, 0, 0, w + 1.1, 0.7, d + 1.1, rc[0], rc[1], rc[2], 0);
            R.push('box', 'opaque', p.x, top + 1.15, p.z, p.yaw, 0, 0, w * 0.72, 1.1, d * 0.72, rc[0] * 0.85, rc[1] * 0.85, rc[2] * 0.85, 0);
            // porch + door + chimney
            const dr = P2(0, d / 2 + 0.2);
            R.push('box', 'opaque', dr[0], 1.2, dr[1], p.yaw, 0, 0, 1.5, 2.4, 0.2, 0.28, 0.18, 0.12, 0);
            R.push('box', 'opaque', dr[0], 2.9, dr[1], p.yaw, 0, 0, w * 0.55, 0.28, 1.8, rc[0] * 0.8, rc[1] * 0.8, rc[2] * 0.8, 0);
            const ch = P2(w * 0.3, -d * 0.25);
            R.push('box', 'opaque', ch[0], top + 1.6, ch[1], p.yaw, 0, 0, 1.0, 2.2, 1.0, 0.34, 0.26, 0.24, 0);
            if (hp01 < 0.55 && Math.random() < 0.04) this.fx.smoke(p.x, top + 2.4, p.z, 1, 0.9, 0.26, 0.24, 0.22, 1);
            R.shadow(p.x, p.z, Math.max(w, d) * 0.6, 0.55);
            break;
          }
          case 'tree': {
            const hp01 = clamp01(p.hp / 240);
            const h = p.h || 6;
            const lean = (1 - hp01) * 0.24;
            const conifer = p.kind < 0.45;
            R.push('cyl', 'opaque', p.x, h * 0.3, p.z, p.yaw, lean, 0, 1.0, h * 0.62, 1.0, 0.24, 0.17, 0.11, 0);
            if (conifer) {
              for (let i = 0; i < 4; i++) {
                const t2 = i / 4;
                R.push('cone', 'opaque', p.x + Math.sin(p.yaw) * lean * i, h * (0.34 + t2 * 0.5), p.z,
                  p.yaw + i, 0, 0, (4.4 - t2 * 2.6), h * 0.34, (4.4 - t2 * 2.6),
                  0.10 + t2 * 0.05, 0.26 + t2 * 0.08, 0.11, 0);
              }
            } else {
              for (let i = 0; i < 3; i++) {
                const a = p.seed * 6 + i * 2.1;
                R.push('sphere', 'opaque', p.x + Math.cos(a) * 1.1, h * 0.72 + Math.sin(a) * 0.7, p.z + Math.sin(a) * 1.1,
                  a, 0, 0, 4.4 - i * 0.5, 3.6 - i * 0.4, 4.4 - i * 0.5,
                  0.14 + i * 0.03, 0.30 + i * 0.04, 0.10, 0);
              }
            }
            R.shadow(p.x, p.z, 2.8, 0.5);
            break;
          }
          case 'bush': {
            const c = p.kind < 0.6 ? [0.14, 0.30, 0.12] : [0.26, 0.30, 0.13];
            for (let i = 0; i < 3; i++) {
              const a = p.seed * 6 + i * 2.1;
              R.push('sphere', 'opaque', p.x + Math.cos(a) * 0.6, 0.7 + (i % 2) * 0.3, p.z + Math.sin(a) * 0.6,
                a, 0, 0, 1.9, 1.5, 1.9, c[0], c[1], c[2], 0);
            }
            R.shadow(p.x, p.z, 1.5, 0.4);
            break;
          }
          case 'fence': {
            const sy2 = Math.sin(p.yaw), cy2 = Math.cos(p.yaw);
            for (let i = -1; i <= 1; i++) {
              R.push('box', 'opaque', p.x + cy2 * i * 0.9, 0.8, p.z - sy2 * i * 0.9, p.yaw, 0, 0,
                0.18, 1.5, 0.18, 0.66, 0.62, 0.54, 0);
            }
            R.push('box', 'opaque', p.x, 1.1, p.z, p.yaw, 0, 0, 2.9, 0.16, 0.1, 0.62, 0.58, 0.5, 0);
            R.push('box', 'opaque', p.x, 0.6, p.z, p.yaw, 0, 0, 2.9, 0.16, 0.1, 0.62, 0.58, 0.5, 0);
            break;
          }
          case 'parked': {
            const pal = [[0.30, 0.42, 0.58], [0.55, 0.50, 0.46], [0.48, 0.24, 0.22], [0.22, 0.40, 0.28], [0.62, 0.58, 0.26]];
            const c = pal[(p.kind * pal.length) | 0] || pal[0];
            const hp01 = clamp01(p.hp / 210);
            const dim = lerp(0.6, 1, hp01);
            R.push('box', 'opaque', p.x, 0.85, p.z, p.yaw, 0, 0, 2.2, 0.9, 4.6, c[0] * dim, c[1] * dim, c[2] * dim, 0);
            R.push('box', 'opaque', p.x, 1.5, p.z - 0.2, p.yaw, 0, 0, 1.9, 0.75, 2.2, c[0] * dim * 0.8, c[1] * dim * 0.8, c[2] * dim * 0.8, 0);
            R.push('box', 'opaque', p.x, 1.55, p.z + 0.9, p.yaw, 0, 0, 1.75, 0.6, 0.2, 0.09, 0.14, 0.2, 0);
            for (const fw of [1, -1]) for (const sd of [1, -1]) {
              R.push('cylX', 'opaque', p.x + Math.cos(p.yaw) * sd * 1.0 + Math.sin(p.yaw) * fw * 1.5, 0.42,
                p.z - Math.sin(p.yaw) * sd * 1.0 + Math.cos(p.yaw) * fw * 1.5, p.yaw, 0, 0,
                0.3, 0.84, 0.84, 0.07, 0.07, 0.08, 0);
            }
            R.shadow(p.x, p.z, 2.6, 0.5);
            break;
          }
          case 'hydrant': {
            R.push('cyl', 'opaque', p.x, 0.45, p.z, p.yaw, 0, 0, 0.7, 0.9, 0.7, 0.72, 0.14, 0.10, 0.05);
            R.push('sphere', 'opaque', p.x, 0.95, p.z, p.yaw, 0, 0, 0.7, 0.5, 0.7, 0.75, 0.16, 0.12, 0.05);
            for (const sd of [1, -1]) {
              R.push('cylX', 'opaque', p.x + Math.cos(p.yaw) * sd * 0.4, 0.55, p.z - Math.sin(p.yaw) * sd * 0.4,
                p.yaw, 0, 0, 0.3, 0.34, 0.34, 0.6, 0.12, 0.1, 0);
            }
            R.shadow(p.x, p.z, 0.7, 0.4);
            break;
          }
          case 'bin': {
            const c = p.kind < 0.5 ? [0.16, 0.32, 0.18] : [0.28, 0.26, 0.30];
            R.push('cyl', 'opaque', p.x, 0.75, p.z, p.yaw, 0, 0, 1.5, 1.5, 1.5, c[0], c[1], c[2], 0);
            R.push('cyl', 'opaque', p.x, 1.55, p.z, p.yaw, 0, 0, 1.6, 0.2, 1.6, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, 0);
            R.shadow(p.x, p.z, 1.0, 0.45);
            break;
          }
          case 'trolley': {
            R.push('box', 'opaque', p.x, 0.9, p.z, p.yaw, 0, 0.1, 1.1, 0.9, 1.6, 0.62, 0.64, 0.70, 0);
            R.push('box', 'opaque', p.x, 1.5, p.z - 0.7, p.yaw, 0, 0, 1.0, 0.5, 0.1, 0.55, 0.57, 0.62, 0);
            R.shadow(p.x, p.z, 1.0, 0.35);
            break;
          }
          case 'unit': {
            const hp01 = clamp01(p.hp / 1400);
            const dim = lerp(0.6, 1, hp01);
            R.push('box', 'opaque', p.x, p.h / 2, p.z, p.yaw, 0, 0, p.w, p.h, p.d, 0.42 * dim, 0.41 * dim, 0.44 * dim, 0);
            R.push('box', 'opaque', p.x, p.h + 0.35, p.z, p.yaw, 0, 0, p.w + 0.8, 0.7, p.d + 0.8, 0.28, 0.27, 0.30, 0);
            const sy2 = Math.sin(p.yaw), cy2 = Math.cos(p.yaw);
            const sc = [[1.0, 0.35, 0.2], [0.3, 0.7, 1.0], [1.0, 0.8, 0.2], [0.6, 0.35, 1.0]][(p.sign * 4) | 0] || [1, 0.5, 0.2];
            R.push('box', 'opaque', p.x + sy2 * (p.d / 2 + 0.2), p.h * 0.72, p.z + cy2 * (p.d / 2 + 0.2),
              p.yaw, 0, 0, p.w * 0.62, 1.5, 0.2, sc[0], sc[1], sc[2], 0.75);
            for (let i = 0; i < 3; i++) {
              R.push('box', 'opaque', p.x + cy2 * (i - 1) * p.w * 0.28 + sy2 * (p.d / 2 + 0.1), p.h * 0.28,
                p.z - sy2 * (i - 1) * p.w * 0.28 + cy2 * (p.d / 2 + 0.1), p.yaw, 0, 0,
                p.w * 0.2, p.h * 0.42, 0.16, 0.10, 0.14, 0.19, 0);
            }
            R.shadow(p.x, p.z, Math.max(p.w, p.d) * 0.55, 0.55);
            break;
          }
          case 'planter': {
            R.push('box', 'opaque', p.x, 0.6, p.z, p.yaw, 0, 0, 4.0, 1.2, 4.0, 0.48, 0.46, 0.44, 0);
            R.push('box', 'opaque', p.x, 1.25, p.z, p.yaw, 0, 0, 3.6, 0.3, 3.6, 0.22, 0.16, 0.10, 0);
            for (let i = 0; i < 4; i++) {
              const a = p.seed * 6 + i * 1.7;
              R.push('sphere', 'opaque', p.x + Math.cos(a) * 1.0, 2.0, p.z + Math.sin(a) * 1.0, a, 0, 0,
                2.2, 1.9, 2.2, 0.14, 0.30, 0.12, 0);
            }
            R.shadow(p.x, p.z, 2.4, 0.5);
            break;
          }
          case 'wreck': {
            const hp01 = clamp01(p.hp / 190);
            const c = lerp(0.12, 0.30, p.seed);
            R.push('box', 'opaque', p.x, 0.62, p.z, p.yaw, 0.06, 0.1, 2.0, 1.0, 4.0, c, c * 0.95, c * 0.9, 0);
            R.push('box', 'opaque', p.x, 1.32, p.z + 0.2, p.yaw, -0.08, 0.14, 1.7, 0.75, 1.8, c * 0.8, c * 0.78, c * 0.75, 0);
            R.push('box', 'opaque', p.x, 0.25, p.z, p.yaw, 0, 0.1, 2.2, 0.4, 4.2, 0.07, 0.07, 0.08, 0);
            if (hp01 < 0.6 && Math.random() < 0.06) this.fx.smoke(p.x, 1.4, p.z, 1, 0.7, 0.2, 0.19, 0.18, 1);
            R.shadow(p.x, p.z, 3.4, 0.55);
            break;
          }
          case 'rock': {
            const s = p.radius;
            R.push('sphere', 'opaque', p.x, s * 0.45, p.z, p.yaw, 0.2, 0.3, s * 1.7, s * 1.1, s * 1.6, 0.24, 0.22, 0.21, 0);
            R.push('box', 'opaque', p.x + s * 0.3, s * 0.3, p.z - s * 0.2, p.yaw * 1.7, 0.3, 0.5, s * 0.9, s * 0.8, s * 0.9, 0.20, 0.19, 0.18, 0);
            R.shadow(p.x, p.z, s * 1.9, 0.55);
            break;
          }
          case 'lamp': {
            R.push('cyl', 'opaque', p.x, 3.0, p.z, p.yaw, 0, 0, 0.34, 6.0, 0.34, 0.22, 0.23, 0.25, 0);
            R.push('box', 'opaque', p.x + Math.sin(p.yaw) * 0.9, 6.0, p.z + Math.cos(p.yaw) * 0.9, p.yaw, 0, 0, 0.4, 0.3, 2.0, 0.22, 0.23, 0.25, 0);
            if (p.lit) {
              const flick = 0.75 + Math.sin(t * 13 + p.seed * 30) * 0.2 + (Math.random() < 0.02 ? -0.5 : 0);
              R.push('box', 'glow', p.x + Math.sin(p.yaw) * 1.7, 5.75, p.z + Math.cos(p.yaw) * 1.7, p.yaw, 0, 0, 0.7, 0.3, 1.1,
                0.75 * flick, 0.62 * flick, 0.34 * flick, 1);
              R.push('disc', 'glow', p.x + Math.sin(p.yaw) * 1.7, 0.05, p.z + Math.cos(p.yaw) * 1.7, 0, 0, 0, 11, 1, 11,
                0.045 * flick, 0.036 * flick, 0.018 * flick, 1);
            }
            R.shadow(p.x, p.z, 1.0, 0.45);
            break;
          }
          case 'crate': {
            R.push('box', 'opaque', p.x, 0.75, p.z, p.yaw, 0, 0, 1.6, 1.5, 1.6, 0.42, 0.30, 0.15, 0);
            R.push('box', 'opaque', p.x, 0.75, p.z, p.yaw, 0, 0, 1.66, 0.22, 1.66, 0.55, 0.42, 0.20, 0);
            R.push('box', 'glow', p.x, 1.58, p.z, p.yaw + t, 0, 0, 0.36, 0.36, 0.36,
              p.loot < 0.42 ? 1.0 : 0.35, p.loot < 0.42 ? 0.2 : 1.0, p.loot < 0.42 ? 0.28 : 0.7, 1);
            R.shadow(p.x, p.z, 1.6, 0.5);
            break;
          }
        }
      }
    }

    drawRamp(R, p) {
      const th = Math.atan2(p.H, p.L);
      const len = Math.hypot(p.L, p.H);
      const t = 1.4;
      const c = Math.cos(th), s = Math.sin(th);
      const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
      // centre offset so the top face lines up with the wedge surface
      const ly = p.H / 2 - (t / 2) * c;
      const lz = (t / 2) * s;
      const wx = p.x + lz * sy, wz = p.z + lz * cy;
      R.push('box', 'opaque', wx, ly, wz, p.yaw, -th, 0, p.W, t, len, 0.26, 0.24, 0.22, 0);
      // hazard nose + rails
      R.push('box', 'opaque', p.x + Math.sin(p.yaw) * (p.L / 2), p.H + 0.18, p.z + Math.cos(p.yaw) * (p.L / 2),
        p.yaw, 0, 0, p.W, 0.36, 0.7, 1.0, 0.72, 0.06, 0.35);
      for (const side of [1, -1]) {
        const ox = Math.cos(p.yaw) * side * (p.W / 2), oz = -Math.sin(p.yaw) * side * (p.W / 2);
        R.push('box', 'opaque', p.x + ox + lz * sy, ly + t * 0.5 * c, p.z + oz + lz * cy,
          p.yaw, -th, 0, 0.3, t * 0.9, len, 0.85, 0.62, 0.08, 0.16);
      }
      R.shadow(p.x, p.z, Math.max(p.L, p.W) * 0.6, 0.30);
    }
  }

  BA.World = World;
})();
