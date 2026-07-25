/* BADASS APOCALYPSE - the car: arcade physics, springs, squash & stretch */
(function () {
  'use strict';
  const { clamp, clamp01, lerp, damp, rand, TAU, angleDelta } = BA;

  const GRAV = 36;

  const DRIFT_STAGES = [0.75, 1.7, 2.9];
  const BOOST_POWER = [13, 20, 28];
  const BOOST_TIME = [0.55, 0.95, 1.45];
  const SPARK_COL = [[0.35, 0.75, 1.0], [1.0, 0.55, 0.12], [0.85, 0.32, 1.0]];

  class Car {
    constructor(fx, audio) {
      this.fx = fx;
      this.audio = audio;
      this.reset();
    }

    reset() {
      this.x = 0; this.y = 0; this.z = 0;
      this.yaw = 0;
      this.vx = 0; this.vz = 0; this.vy = 0;
      this.vf = 0; this.vr = 0;
      this.grounded = true;
      this.groundPrev = 0;
      this.lastClimb = 0;
      this.airTime = 0;
      this.airSpin = 0;
      this.slamming = false;

      this.pitchVis = 0; this.pitchVel = 0;
      this.rollVis = 0; this.rollVel = 0;
      this.squash = 1; this.squashVel = 0;
      this.wheelSpin = 0;
      this.steerVis = 0;
      this.bodyY = 0;

      this.drifting = false;
      this.driftDir = 0;
      this.driftCharge = 0;
      this.driftStage = -1;
      this.boostTime = 0;
      this.boostPower = 0;
      this.boostStage = 0;

      this.hp = 100; this.maxHp = 100;
      this.invuln = 0;
      this.hurtFlash = 0;
      this.damageSmoke = 0;

      this.stats = {
        maxSpeed: 44, accel: 34, grip: 14, driftGrip: 2.7, turn: 2.45,
        jump: 14.5, airControl: 2.4, magnet: 5.5, damage: 1, cooldown: 1,
        xpGain: 1, ramDamage: 26, armor: 0, boostMul: 1,
      };
      this.spikeLevel = 0;
      this.color = [0.90, 0.13, 0.14];
    }

    get forwardX() { return Math.sin(this.yaw); }
    get forwardZ() { return Math.cos(this.yaw); }
    get speed() { return Math.hypot(this.vx, this.vz); }
    get speed01() { return clamp01(this.speed / this.stats.maxSpeed); }

    /* ------------------------------------------------------------ update */
    update(dt, inp, world, game) {
      const S = this.stats;
      const fx_ = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);

      this.vf = this.vx * fx_ + this.vz * fz;
      this.vr = this.vx * rx + this.vz * rz;

      const prevVf = this.vf;
      const boosting = this.boostTime > 0;
      const maxSpeed = S.maxSpeed + (boosting ? this.boostPower : 0);

      /* ---- throttle / brake ---- */
      if (this.grounded) {
        if (inp.throttle > 0) {
          const headroom = clamp01(1 - this.vf / maxSpeed);
          this.vf += S.accel * inp.throttle * (0.35 + headroom * 0.9) * dt;
        }
        if (inp.brake > 0) {
          if (this.vf > 1.5) this.vf -= 62 * inp.brake * dt;
          else this.vf = Math.max(this.vf - 26 * inp.brake * dt, -16);
        }
        if (inp.throttle <= 0 && inp.brake <= 0) {
          this.vf -= this.vf * 0.85 * dt;
          this.vf -= Math.sign(this.vf) * Math.min(Math.abs(this.vf), 5.5 * dt);
        }
        // quadratic drag, per-second so it behaves the same at any frame rate.
        // tuned so terminal speed lands just under stats.maxSpeed
        this.vf -= this.vf * Math.abs(this.vf) * 0.0065 * dt;
      } else {
        this.vf -= this.vf * 0.12 * dt;
      }
      if (boosting) {
        this.vf = Math.max(this.vf, S.maxSpeed * 0.85);
        this.vf += this.boostPower * 0.45 * dt;
      }
      this.vf = clamp(this.vf, -16, maxSpeed * 1.25);

      /* ---- steering + drift ---- */
      const speedFactor = clamp01(Math.abs(this.vf) / 9) * lerp(1, 0.72, clamp01(this.vf / 60));
      const dirSign = this.vf < -0.4 ? -1 : 1;

      if (this.grounded) {
        // easier to hold a drift than to start one, so a slide never cancels itself
        const wantDrift = inp.handbrake && Math.abs(this.vf) > (this.drifting ? 6 : 12);
        if (wantDrift && !this.drifting) {
          this.drifting = true;
          this.driftDir = Math.abs(inp.steer) > 0.12 ? Math.sign(inp.steer) : (this.vr > 0 ? 1 : -1);
          this.driftCharge = 0;
          this.driftStage = -1;
          this.vr += this.driftDir * 5.5;
        } else if (!wantDrift && this.drifting) {
          this.releaseDrift();
        }
      } else if (this.drifting) {
        this.releaseDrift();
      }

      let turn = inp.steer * S.turn * speedFactor * dirSign;
      if (this.drifting) {
        const bias = this.driftDir;
        turn = (bias * 0.62 + inp.steer * 0.75) * S.turn * 1.35 * speedFactor;
        // clamp the slip angle: past ~45 degrees of sideways the car would scrub
        // all its speed off and drop out of the drift on its own
        const moveYaw = Math.atan2(this.vx, this.vz);
        const slipAngle = angleDelta(moveYaw, this.yaw);
        if (Math.abs(slipAngle) > 0.8 && turn * slipAngle > 0) turn *= 0.12;
        this.driftCharge += dt * (0.55 + clamp01(Math.abs(this.vr) / 12) * 0.8);
        const st = DRIFT_STAGES.filter((s) => this.driftCharge >= s).length - 1;
        if (st > this.driftStage) {
          this.driftStage = st;
          if (st >= 0) {
            this.audio.pickup(st * 0.5);
            const c = SPARK_COL[st];
            this.fx.sparks(this.x - fx_ * 1.8, 0.4, this.z - fz * 1.8, 14, c[0], c[1], c[2], 1.1);
          }
        }
      }
      if (!this.grounded) {
        turn = inp.steer * S.airControl;
        this.airSpin += Math.abs(turn) * dt;
      }
      this.yaw += turn * dt;
      this.steerVis = damp(this.steerVis, inp.steer, 16, dt);

      /* ---- lateral grip ---- */
      let grip = this.grounded ? (this.drifting ? S.driftGrip : S.grip) : 0.6;
      if (inp.brake > 0.5 && !this.drifting) grip *= 0.75;
      this.vr *= Math.exp(-grip * dt);

      /* ---- back to world space ---- */
      this.vx = fx_ * this.vf + rx * this.vr;
      this.vz = fz * this.vf + rz * this.vr;

      /* ---- jump / slam ---- */
      if (inp.jumpPressed) {
        if (this.grounded) {
          this.vy = S.jump;
          this.grounded = false;
          this.airTime = 0;
          this.airSpin = 0;
          this.squashVel = 5.5;
          this.audio.jump();
          this.fx.smoke(this.x, 0.2, this.z, 6, 0.7, 0.36, 0.32, 0.29, 1);
          this.fx.wave(this.x, 0.06, this.z, 1.0, 3.4, 0.35, 0.7, 0.75, 0.85, 0.5);
        } else if (!this.slamming && this.airTime > 0.12) {
          this.slamming = true;
          this.vy = -34;
          this.fx.sparks(this.x, this.y + 0.5, this.z, 10, 1.0, 0.75, 0.25, 0.8);
        }
      }

      /* ---- vertical ---- */
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      const gh = world.groundHeight(this.x, this.z);
      this.shadowY = gh;
      if (this.grounded) {
        const climb = (gh - this.groundPrev) / Math.max(dt, 0.0001);
        if (climb < -16 && Math.abs(this.vf) > 8) {
          this.grounded = false;
          this.vy = Math.max(0, this.lastClimb * 0.92);
          this.airTime = 0;
          this.airSpin = 0;
        } else {
          this.y = gh;
          this.vy = 0;
          this.lastClimb = clamp(climb, 0, 34);
        }
        this.groundPrev = gh;
      } else {
        this.vy -= GRAV * dt * (this.slamming ? 2.1 : 1);
        this.y += this.vy * dt;
        this.airTime += dt;
        if (this.y <= gh) {
          this.land(gh, game, world);
        }
        this.groundPrev = gh;
      }

      /* ---- boost timer ---- */
      if (this.boostTime > 0) {
        this.boostTime -= dt;
        const c = SPARK_COL[this.boostStage];
        if (Math.random() < dt * 90) {
          this.fx.fire(this.x - fx_ * 2.4 + rand(-0.6, 0.6), 0.55, this.z - fz * 2.4, 1, 0.55, 1);
          this.fx.sparks(this.x - fx_ * 2.4, 0.5, this.z - fz * 2.4, 1, c[0], c[1], c[2], 0.8);
        }
      }

      /* ---- visual springs (this is where the bounce lives) ---- */
      const accelF = (this.vf - prevVf) / Math.max(dt, 0.0001);
      const latAcc = this.vr * 2.2 + turn * this.vf * 0.9;

      const pitchTarget = clamp(-accelF * 0.0052, -0.20, 0.20) + (this.grounded ? 0 : clamp(this.vy * 0.006, -0.18, 0.16));
      const rollTarget = clamp(latAcc * 0.011, -0.32, 0.32);
      const spring = (val, vel, target, k, d) => {
        vel += (target - val) * k * dt;
        vel *= Math.exp(-d * dt);
        return [val + vel * dt, vel];
      };
      [this.pitchVis, this.pitchVel] = spring(this.pitchVis, this.pitchVel, pitchTarget, 190, 11);
      [this.rollVis, this.rollVel] = spring(this.rollVis, this.rollVel, rollTarget, 165, 9.5);

      this.squashVel += (1 - this.squash) * 260 * dt;
      this.squashVel *= Math.exp(-12 * dt);
      this.squash += this.squashVel * dt;
      this.squash = clamp(this.squash, 0.45, 1.7);

      this.wheelSpin += (this.vf / 0.55) * dt;
      this.bodyY = damp(this.bodyY, this.grounded ? 0 : 0.06, 8, dt);

      if (this.invuln > 0) this.invuln -= dt;
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.6);

      /* ---- surface fx ---- */
      const slip = Math.abs(this.vr);
      if (this.grounded && (slip > 4 || this.drifting)) {
        const n = this.drifting ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const side = i === 0 ? 1 : -1;
          const px = this.x - fx_ * 1.5 + rx * side * 0.95;
          const pz = this.z - fz * 1.5 + rz * side * 0.95;
          if (Math.random() < dt * 22) this.fx.smoke(px, 0.12, pz, 1, 0.5, 0.34, 0.31, 0.30, 0.5);
        }
        if (this.drifting && Math.random() < dt * 9) {
          this.fx.splat(this.x - fx_ * 1.6, this.z - fz * 1.6, 1.3, 0.02, 0.02, 0.025, 0.20);
        }
        if (this.drifting && this.driftStage >= 0 && Math.random() < dt * 70) {
          const c = SPARK_COL[this.driftStage];
          for (const side of [1, -1]) {
            this.fx.sparks(this.x - fx_ * 1.6 + rx * side, 0.28, this.z - fz * 1.6 + rz * side, 2, c[0], c[1], c[2], 0.55);
          }
        }
      }
      if (this.damageSmoke > 0 && Math.random() < dt * 30 * this.damageSmoke) {
        this.fx.smoke(this.x + rand(-0.7, 0.7), 1.1, this.z + rand(-0.7, 0.7), 1, 0.8, 0.16, 0.15, 0.16, 1.4);
        if (this.damageSmoke > 0.6 && Math.random() < 0.4) this.fx.fire(this.x, 1.0, this.z, 1, 0.35, 0.4);
      }
      this.damageSmoke = clamp01(1 - this.hp / (this.maxHp * 0.55));
    }

    releaseDrift() {
      this.drifting = false;
      const st = this.driftStage;
      this.driftCharge = 0;
      this.driftStage = -1;
      if (st >= 0) {
        this.boostStage = st;
        this.boostPower = BOOST_POWER[st] * this.stats.boostMul;
        this.boostTime = Math.max(this.boostTime, BOOST_TIME[st] * this.stats.boostMul);
        this.vf += BOOST_POWER[st] * 0.42;
        this.audio.boost();
        const c = SPARK_COL[st];
        this.fx.sparks(this.x, 0.6, this.z, 26, c[0], c[1], c[2], 1.6);
        this.fx.wave(this.x, 0.06, this.z, 1.2, 7 + st * 2, 0.4, c[0], c[1], c[2], 0.7);
        if (st >= 1) this.fx.text(this.x, 2.6, this.z, st >= 2 ? 'ULTRA BOOST!' : 'TURBO!', st >= 2 ? '#dd7bff' : '#ffb03a', 26, 'big');
      }
    }

    land(gh, game, world) {
      const impact = clamp01(-this.vy / 30);
      this.y = gh;
      this.grounded = true;
      this.slamming = false;
      this.groundPrev = gh;
      this.squashVel = -8 - impact * 22;
      this.vy = 0;
      this.audio.land(impact);
      this.fx.smoke(this.x, 0.2, this.z, 4 + (impact * 10) | 0, 0.8, 0.38, 0.34, 0.31, 1);
      if (game) {
        game.shake(0.12 + impact * 0.4);
        if (this.airTime > 0.35) {
          const power = 0.5 + impact;
          game.slamShock(this.x, this.z, power, this.airTime);
        }
        if (this.airTime > 0.85) {
          const spins = this.airSpin / TAU;
          let msg = 'BIG AIR!';
          let bonus = 12;
          if (spins > 1.6) { msg = 'INSANE SPIN!'; bonus = 45; }
          else if (spins > 0.75) { msg = 'SICK SPIN!'; bonus = 28; }
          else if (this.airTime > 1.4) { msg = 'HUGE AIR!'; bonus = 26; }
          this.fx.text(this.x, 3.4, this.z, msg, '#7cf5ff', 28, 'big');
          game.addXp(bonus, this.x, this.z);
          game.shake(0.2);
        }
      }
      this.airSpin = 0;
      this.airTime = 0;
    }

    hurt(amount, game) {
      if (this.invuln > 0) return false;
      const dmg = amount * (1 - clamp(this.stats.armor, 0, 0.75));
      this.hp -= dmg;
      this.invuln = 0.42;
      this.hurtFlash = 1;
      this.audio.hurt();
      this.fx.sparks(this.x, 1.1, this.z, 10, 1.0, 0.7, 0.2, 1.0);
      if (game) { game.shake(0.32); game.hurtFlash = 1; }
      return true;
    }

    /* -------------------------------------------------------------- draw */
    draw(R) {
      const yaw = this.yaw;
      const pitch = this.pitchVis;
      const roll = this.rollVis;
      const sq = this.squash;
      const stretch = 1 + (1 - sq) * 0.55;
      const bx = this.x, bz = this.z;
      const by = this.y + 0.62 * sq + this.bodyY;

      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      // local (right, up, fwd) -> world, ignoring the small pitch/roll for offsets
      const px = (lx, ly, lz) => bx + lx * cy + lz * sy;
      const pz = (lx, ly, lz) => bz - lx * sy + lz * cy;
      const py = (lx, ly, lz) => by + ly * sq - lz * Math.sin(pitch) * 0.9 + lx * Math.sin(roll) * 0.5;

      const put = (lx, ly, lz, sx, sy2, sz, r, g, b, e) => {
        R.push('box', 'opaque', px(lx, ly, lz), py(lx, ly, lz), pz(lx, ly, lz),
          yaw, pitch, roll, sx, sy2 * sq, sz * stretch, r, g, b, e || 0);
      };

      const C = this.color;
      const flash = this.hurtFlash;
      const cr = lerp(C[0], 2.2, flash), cg = lerp(C[1], 1.6, flash), cb = lerp(C[2], 1.6, flash);
      const dark = [cr * 0.42, cg * 0.42, cb * 0.42];

      // chassis
      put(0, 0, 0, 2.15, 0.72, 4.3, cr, cg, cb, flash * 0.5);
      // lower skirt / armour
      put(0, -0.42, -0.1, 2.32, 0.34, 3.9, 0.13, 0.13, 0.15, 0);
      // bonnet scoop
      put(0, 0.42, 1.05, 0.95, 0.3, 1.1, 0.10, 0.10, 0.11, 0);
      put(0, 0.60, 1.05, 0.72, 0.18, 0.86, 0.16, 0.16, 0.18, 0);
      // cabin
      put(0, 0.55, -0.55, 1.82, 0.68, 1.95, cr * 0.85, cg * 0.85, cb * 0.85, flash * 0.4);
      // glass
      put(0, 0.62, 0.42, 1.62, 0.55, 0.42, 0.10, 0.16, 0.22, 0);
      put(0, 0.62, -1.52, 1.5, 0.5, 0.3, 0.10, 0.16, 0.22, 0);
      put(0.92, 0.6, -0.55, 0.06, 0.5, 1.7, 0.10, 0.16, 0.22, 0);
      put(-0.92, 0.6, -0.55, 0.06, 0.5, 1.7, 0.10, 0.16, 0.22, 0);
      // roll cage
      for (const s of [1, -1]) {
        put(s * 0.86, 0.95, -0.55, 0.12, 0.55, 0.12, 0.2, 0.2, 0.22, 0);
      }
      put(0, 1.2, -0.55, 1.9, 0.14, 1.9, 0.22, 0.22, 0.24, 0);
      // spoiler
      put(0, 0.75, -2.0, 2.0, 0.14, 0.5, 0.08, 0.08, 0.09, 0);
      for (const s of [1, -1]) put(s * 0.75, 0.45, -1.95, 0.16, 0.5, 0.16, 0.14, 0.14, 0.16, 0);
      // bumpers
      put(0, -0.2, 2.2, 2.3, 0.5, 0.4, 0.20, 0.20, 0.22, 0);
      put(0, -0.2, -2.2, 2.25, 0.45, 0.35, 0.18, 0.18, 0.20, 0);
      // headlights
      for (const s of [1, -1]) {
        put(s * 0.72, 0.12, 2.16, 0.42, 0.24, 0.14, 1.0, 0.95, 0.72, 1);
      }
      // tail lights
      for (const s of [1, -1]) put(s * 0.72, 0.1, -2.2, 0.36, 0.18, 0.12, 1.0, 0.12, 0.08, 0.9);

      // exhausts
      for (const s of [1, -1]) {
        R.push('cyl', 'opaque', px(s * 0.55, -0.15, -2.35), py(s * 0.55, -0.15, -2.35), pz(s * 0.55, -0.15, -2.35),
          yaw, pitch + Math.PI / 2, roll, 0.22, 0.5, 0.22, 0.3, 0.3, 0.32, 0);
      }

      // spikes
      if (this.spikeLevel > 0) {
        const n = 2 + this.spikeLevel;
        const len = 0.55 + this.spikeLevel * 0.24;
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
          const lx = t * 0.92;
          R.push('cone', 'opaque', px(lx, -0.1, 2.35), py(lx, -0.1, 2.35), pz(lx, -0.1, 2.35),
            yaw, pitch + Math.PI / 2, roll, 0.34, len, 0.34, 0.72, 0.74, 0.8, 0.05);
        }
        for (const s of [1, -1]) {
          for (let i = 0; i < this.spikeLevel; i++) {
            const lz = -0.9 + i * 0.9;
            R.push('cone', 'opaque', px(s * 1.12, -0.15, lz), py(s * 1.12, -0.15, lz), pz(s * 1.12, -0.15, lz),
              yaw, pitch, roll + s * Math.PI / 2, 0.26, 0.5, 0.26, 0.72, 0.74, 0.8, 0.05);
          }
        }
      }

      /* wheels: they hug the ground, not the springy body */
      const steerA = this.steerVis * 0.42 * (this.drifting ? 1.5 : 1);
      const wheelR = 0.58;
      for (const fwd of [1, -1]) {
        for (const s of [1, -1]) {
          const lx = s * 1.02, lz = fwd * 1.42;
          const wx = bx + lx * cy + lz * sy;
          const wz = bz - lx * sy + lz * cy;
          const comp = clamp((sq - 1) * 0.4, -0.18, 0.18);
          const wy = this.y + wheelR + comp + (this.grounded ? 0 : 0.08);
          const wyaw = yaw + (fwd > 0 ? steerA : 0);
          R.push('cylX', 'opaque', wx, wy, wz, wyaw, 0, this.wheelSpin,
            0.42, wheelR * 2, wheelR * 2, 0.06, 0.06, 0.07, 0);
          R.push('cylX', 'opaque', wx + Math.cos(wyaw) * s * 0.16, wy, wz - Math.sin(wyaw) * s * 0.16, wyaw, 0, this.wheelSpin,
            0.14, wheelR * 1.05, wheelR * 1.05, 0.75, 0.72, 0.2, 0.12);
        }
      }

      // boost flames
      if (this.boostTime > 0) {
        const c = SPARK_COL[this.boostStage];
        const k = clamp01(this.boostTime / 0.5);
        for (const s of [1, -1]) {
          const l = 1.1 + Math.random() * 0.9;
          R.push('cone', 'glow', px(s * 0.55, -0.1, -2.6 - l * 0.3), py(s * 0.55, -0.1, -2.6), pz(s * 0.55, -0.1, -2.6 - l * 0.3),
            yaw, pitch - Math.PI / 2, roll, 0.5, l, 0.5, c[0] * k, c[1] * k, c[2] * k, 1);
        }
      }

      // drift sparks glow under the car
      if (this.drifting && this.driftStage >= 0) {
        const c = SPARK_COL[this.driftStage];
        R.push('disc', 'glow', bx, 0.06, bz, 0, 0, 0, 5, 1, 5, c[0] * 0.25, c[1] * 0.25, c[2] * 0.25, 1);
      }

      R.shadow(bx, bz, 3.0 + clamp(this.y * 0.35, 0, 2.4), clamp01(0.62 - this.y * 0.06), (this.shadowY || 0) + 0.016);
    }
  }

  BA.Car = Car;
  BA.CarConst = { DRIFT_STAGES, SPARK_COL };
})();
