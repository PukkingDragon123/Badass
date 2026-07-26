/* BADASS APOCALYPSE - the car: arcade physics, springs, squash & stretch */
(function () {
  'use strict';
  const { clamp, clamp01, lerp, damp, rand, TAU, angleDelta } = BA;

  const GRAV = 36;

  const DRIFT_STAGES = [0.75, 1.7, 2.9];
  const BOOST_POWER = [13, 20, 28];
  const BOOST_TIME = [0.55, 0.95, 1.45];
  const SPARK_COL = [[0.35, 0.75, 1.0], [1.0, 0.55, 0.12], [0.85, 0.32, 1.0]];

  /* monster truck geometry */
  const WHEEL_R = 1.15;      // tyre radius
  const WHEEL_W = 0.9;       // tyre width
  const WHEEL_X = 1.55;      // track half-width
  const WHEEL_Z = 1.9;       // wheelbase half-length
  const CHASSIS_Y = 2.05;    // body centre above the ground at rest
  const SUS_TRAVEL = 0.75;   // how far each corner can droop

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
      this.wheelY = [WHEEL_R, WHEEL_R, WHEEL_R, WHEEL_R];
      this.wheelVel = [0, 0, 0, 0];

      this.drifting = false;
      this.driftDir = 0;
      this.driftCharge = 0;
      this.driftStage = -1;
      this.boostTime = 0;
      this.boostPower = 0;
      this.boostStage = 0;

      this.hp = 80; this.maxHp = 80;
      this.fuel = 100; this.maxFuel = 100;
      this.nitroActive = false;
      this.fuelIdle = 0;
      this.invuln = 0;
      this.hurtFlash = 0;
      this.damageSmoke = 0;

      // a stock truck is deliberately slow and weak - everything good about it
      // is bolted on in the garage or picked up during a run
      this.stats = {
        maxSpeed: 30, accel: 22, grip: 12, driftGrip: 2.5, turn: 2.2,
        jump: 13, airControl: 2.0, magnet: 5.0, damage: 1, cooldown: 1,
        xpGain: 1, ramDamage: 16, armor: 0, boostMul: 1,
        nitroPower: 20, fuelBurn: 26, fuelRegen: 4.0, fuelMax: 100,
        lifesteal: 0, chainDmg: 0,
      };
      this.canJump = false;
      this.canNitro = false;
      this.spikeLevel = 0;
      this.color = [0.90, 0.13, 0.14];
    }

    get forwardX() { return Math.sin(this.yaw); }
    get forwardZ() { return Math.cos(this.yaw); }
    get speed() { return Math.hypot(this.vx, this.vz); }
    get speed01() { return clamp01(this.speed / this.stats.maxSpeed); }
    get boosting() { return this.boostTime > 0 || this.nitroActive; }
    get fuel01() { return clamp01(this.fuel / this.maxFuel); }

    refuel(amount) {
      this.fuel = Math.min(this.maxFuel, this.fuel + amount);
    }

    /* ------------------------------------------------------------ update */
    update(dt, inp, world, game) {
      const S = this.stats;
      const fx_ = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);

      this.vf = this.vx * fx_ + this.vz * fz;
      this.vr = this.vx * rx + this.vz * rz;

      const prevVf = this.vf;

      /* ---- nitrous: burns gas for a held speed boost ---- */
      const wantNitro = inp.nitro && this.canNitro && this.fuel > 0.4;
      if (wantNitro && !this.nitroActive) this.audio.boost();
      this.nitroActive = wantNitro;
      if (this.nitroActive) {
        this.fuel = Math.max(0, this.fuel - S.fuelBurn * dt);
        this.fuelIdle = 0;
        if (this.fuel <= 0) this.nitroActive = false;
      } else {
        this.fuelIdle += dt;
        if (this.fuelIdle > 0.9) this.fuel = Math.min(this.maxFuel, this.fuel + S.fuelRegen * dt);
      }
      const nitro = this.nitroActive ? S.nitroPower * S.boostMul : 0;

      const boosting = this.boostTime > 0;
      const maxSpeed = S.maxSpeed + (boosting ? this.boostPower : 0) + nitro;

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
      if (this.nitroActive) {
        this.vf += nitro * 0.55 * dt;
        if (Math.random() < dt * 70) {
          this.fx.sparks(this.x - fx_ * 2.6 + rand(-1, 1), 0.7, this.z - fz * 2.6, 1, 0.35, 0.85, 1.0, 1.1);
          this.fx.fire(this.x - fx_ * 2.6, 0.6, this.z - fz * 2.6, 1, 0.5, 0.8);
        }
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
      if (inp.nitro && !this.canNitro && game && !this.nitroWarned) {
        this.nitroWarned = true;
        game.hud.toast('NO NITROUS - INSTALL THE NOS INJECTOR AT THE GARAGE');
        this.audio.hurt();
      }
      if (inp.jumpPressed && !this.canJump && game) {
        game.hud.toast('JUMP LOCKED - INSTALL HYDRAULIC RAMS AT THE GARAGE');
        this.audio.hurt();
      }
      if (inp.jumpPressed && this.canJump) {
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

      const pitchTarget = clamp(-accelF * 0.0072, -0.28, 0.28) + (this.grounded ? 0 : clamp(this.vy * 0.008, -0.24, 0.22));
      const rollTarget = clamp(latAcc * 0.016, -0.42, 0.42);
      const spring = (val, vel, target, k, d) => {
        vel += (target - val) * k * dt;
        vel *= Math.exp(-d * dt);
        return [val + vel * dt, vel];
      };
      // soft springs with low damping: the truck wallows and overshoots
      [this.pitchVis, this.pitchVel] = spring(this.pitchVis, this.pitchVel, pitchTarget, 150, 6.2);
      [this.rollVis, this.rollVel] = spring(this.rollVis, this.rollVel, rollTarget, 128, 5.4);

      this.squashVel += (1 - this.squash) * 210 * dt;
      this.squashVel *= Math.exp(-7.0 * dt);
      this.squash += this.squashVel * dt;
      this.squash = clamp(this.squash, 0.42, 1.8);

      this.wheelSpin += (this.vf / WHEEL_R) * dt;
      this.bodyY = damp(this.bodyY, this.grounded ? 0 : 0.10, 8, dt);
      this.updateSuspension(dt, world);

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

    /* each corner chases the ground under it, so the truck articulates over
       ramps and debris instead of sliding around as one rigid block */
    updateSuspension(dt, world) {
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      const pitch = this.pitchVis, roll = this.rollVis;
      for (let i = 0; i < 4; i++) {
        const fwd = i < 2 ? 1 : -1;
        const side = (i % 2) ? -1 : 1;
        const lx = side * WHEEL_X, lz = fwd * WHEEL_Z;
        const wx = this.x + lx * cy + lz * sy;
        const wz = this.z - lx * sy + lz * cy;
        // where the hub sits if the suspension were at full droop
        const hub = this.y + CHASSIS_Y + this.bodyY + (this.squash - 1) * 0.55
          - lz * Math.sin(pitch) * 0.95 + lx * Math.sin(roll) * 0.7 - 0.55;
        const gh = world ? world.groundHeight(wx, wz) : 0;
        let target = Math.max(gh + WHEEL_R, hub - SUS_TRAVEL);
        target = Math.min(target, hub + SUS_TRAVEL * 0.35);
        // critically-under-damped chase so the tyres visibly bounce on landing
        this.wheelVel[i] += (target - this.wheelY[i]) * 320 * dt;
        this.wheelVel[i] *= Math.exp(-13 * dt);
        this.wheelY[i] += this.wheelVel[i] * dt;
        this.wheelY[i] = clamp(this.wheelY[i], gh + WHEEL_R * 0.55, hub + SUS_TRAVEL);
      }
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
      const bx = this.x, bz = this.z;
      // chassis rides high on the axles and bobs with the suspension
      const by = this.y + CHASSIS_Y + this.bodyY + (sq - 1) * 0.55;

      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const px = (lx, ly, lz) => bx + lx * cy + lz * sy;
      const pz = (lx, ly, lz) => bz - lx * sy + lz * cy;
      const py = (lx, ly, lz) => by + ly * sq - lz * Math.sin(pitch) * 0.95 + lx * Math.sin(roll) * 0.7;

      const put = (lx, ly, lz, sx, sy2, sz, r, g, b, e) => {
        R.push('box', 'opaque', px(lx, ly, lz), py(lx, ly, lz), pz(lx, ly, lz),
          yaw, pitch, roll, sx, sy2 * sq, sz, r, g, b, e || 0);
      };
      const putM = (mesh, lx, ly, lz, p2, r2, sx, sy2, sz, r, g, b, e) => {
        R.push(mesh, 'opaque', px(lx, ly, lz), py(lx, ly, lz), pz(lx, ly, lz),
          yaw, pitch + p2, roll + r2, sx, sy2, sz, r, g, b, e || 0);
      };

      const C = this.color;
      const flash = this.hurtFlash;
      const cr = lerp(C[0], 2.2, flash), cg = lerp(C[1], 1.6, flash), cb = lerp(C[2], 1.6, flash);
      const steel = 0.26, steelD = 0.15;

      /* ---- ladder frame + skid plate ---- */
      for (const s of [1, -1]) put(s * 0.95, -0.62, -0.1, 0.26, 0.3, 4.9, steelD, steelD, 0.17, 0);
      put(0, -0.72, 0.1, 2.0, 0.16, 3.4, 0.11, 0.11, 0.13, 0);

      /* ---- axles + coil-overs, drawn to each wheel's actual height ---- */
      for (let i = 0; i < 4; i++) {
        const fwd = i < 2 ? 1 : -1;
        const side = (i % 2) ? -1 : 1;
        const lx = side * WHEEL_X, lz = fwd * WHEEL_Z;
        const wx = bx + lx * cy + lz * sy, wz = bz - lx * sy + lz * cy;
        const wy = this.wheelY[i];
        const hubX = px(lx * 0.32, -0.5, lz), hubY = py(lx * 0.32, -0.5, lz), hubZ = pz(lx * 0.32, -0.5, lz);
        // solid axle tube from the diff out to the hub
        const ax = wx - hubX, ay = wy - hubY, az = wz - hubZ;
        const alen = Math.hypot(ax, ay, az) || 0.01;
        R.push('box', 'opaque', (wx + hubX) / 2, (wy + hubY) / 2, (wz + hubZ) / 2,
          Math.atan2(ax, az), -Math.asin(clamp(ay / alen, -1, 1)), 0,
          0.28, 0.28, alen, 0.19, 0.19, 0.21, 0);
        // coil-over shock
        const topX = px(lx * 0.8, 0.15, lz), topY = py(lx * 0.8, 0.15, lz), topZ = pz(lx * 0.8, 0.15, lz);
        const sxv = wx - topX, syv = wy + 0.3 - topY, szv = wz - topZ;
        const slen = Math.hypot(sxv, syv, szv) || 0.01;
        R.push('cyl', 'opaque', (wx + topX) / 2, (wy + 0.3 + topY) / 2, (wz + topZ) / 2,
          Math.atan2(sxv, szv), -Math.asin(clamp(syv / slen, -1, 1)) + Math.PI / 2, 0,
          0.3, slen, 0.3, 0.85, 0.42, 0.10, 0.10);
      }
      // differentials
      for (const fwd of [1, -1]) {
        putM('sphere', 0, -0.5, fwd * WHEEL_Z, 0, 0, 0.9, 0.9, 0.9, 0.22, 0.22, 0.24, 0);
      }

      /* ---- body tub ---- */
      put(0, 0.05, -0.25, 2.55, 1.0, 4.5, cr, cg, cb, flash * 0.5);
      put(0, 0.05, -0.25, 2.62, 0.34, 4.2, cr * 0.45, cg * 0.45, cb * 0.45, 0);   // belt line
      put(0, 0.42, -0.25, 2.58, 0.16, 4.3, 0.86, 0.80, 0.72, 0.06);               // racing stripe
      for (const s2 of [1, -1]) put(s2 * 1.3, -0.22, 0.6, 0.22, 0.5, 2.6, 0.12, 0.12, 0.14, 0);  // rock sliders
      // bed rails
      put(0, 0.62, -1.75, 2.5, 0.36, 1.7, cr * 0.8, cg * 0.8, cb * 0.8, 0);
      for (const s of [1, -1]) put(s * 1.2, 0.86, -1.75, 0.2, 0.6, 1.7, steel, steel, 0.28, 0);
      // hood + scoop
      put(0, 0.5, 1.5, 2.2, 0.34, 1.5, cr * 0.9, cg * 0.9, cb * 0.9, 0);
      put(0, 0.78, 1.45, 1.0, 0.34, 1.0, 0.10, 0.10, 0.11, 0);
      put(0, 0.98, 1.45, 0.78, 0.16, 0.8, 0.20, 0.20, 0.22, 0);

      /* ---- cab ---- */
      put(0, 0.92, 0.05, 2.15, 1.05, 2.2, cr * 0.88, cg * 0.88, cb * 0.88, flash * 0.4);
      put(0, 1.0, 1.16, 1.95, 0.8, 0.24, 0.09, 0.15, 0.21, 0);        // windscreen
      put(0, 1.0, -1.06, 1.8, 0.7, 0.2, 0.09, 0.15, 0.21, 0);
      for (const s of [1, -1]) put(s * 1.09, 0.98, 0.05, 0.16, 0.66, 1.9, 0.09, 0.15, 0.21, 0);
      // roof
      put(0, 1.5, 0.05, 2.2, 0.22, 2.3, cr * 0.7, cg * 0.7, cb * 0.7, 0);

      /* ---- roll cage + light bar ---- */
      for (const s of [1, -1]) {
        put(s * 1.12, 1.72, -0.95, 0.16, 0.55, 0.16, steel, steel, 0.28, 0);
        put(s * 1.12, 1.72, 1.0, 0.16, 0.55, 0.16, steel, steel, 0.28, 0);
      }
      put(0, 1.96, 0.05, 2.4, 0.16, 2.2, steel, steel, 0.28, 0);
      put(0, 2.08, 1.0, 2.1, 0.22, 0.34, 0.14, 0.14, 0.16, 0);
      for (let i = 0; i < 4; i++) {
        const lx = -0.72 + i * 0.48;
        put(lx, 2.08, 1.16, 0.36, 0.3, 0.14, 1.15, 1.05, 0.72, 1);
      }

      /* ---- exhaust stacks ---- */
      for (const s of [1, -1]) {
        putM('cyl', s * 1.16, 1.3, -0.9, 0, 0, 0.34, 2.2, 0.34, 0.38, 0.36, 0.34, 0);
        putM('cyl', s * 1.16, 2.42, -0.9, 0, 0, 0.42, 0.24, 0.42, 0.26, 0.24, 0.22, 0);
      }

      /* ---- bull bar, bumpers, lights ---- */
      put(0, -0.15, 2.55, 2.75, 0.55, 0.45, steel, steel, 0.3, 0);
      put(0, 0.45, 2.5, 0.24, 1.1, 0.24, steel, steel, 0.3, 0);
      for (const s of [1, -1]) put(s * 0.9, 0.45, 2.5, 0.2, 1.0, 0.2, steel, steel, 0.3, 0);
      put(0, 0.98, 2.5, 2.6, 0.22, 0.3, steel, steel, 0.3, 0);
      put(0, -0.25, -2.55, 2.6, 0.5, 0.4, steelD, steelD, 0.18, 0);
      for (const s of [1, -1]) {
        put(s * 0.85, 0.2, 2.62, 0.5, 0.34, 0.14, 1.2, 1.1, 0.8, 1);      // headlights
        put(s * 0.9, 0.25, -2.6, 0.42, 0.24, 0.12, 1.1, 0.12, 0.08, 0.9); // tail lights
      }

      /* ---- nitrous bottles strapped in the bed, they empty as you burn gas ---- */
      const fuel01 = clamp01(this.fuel / this.maxFuel);
      for (const side of [1, -1]) {
        putM('cyl', side * 0.58, 0.66, -1.9, Math.PI / 2, 0, 0.5, 1.4, 0.5, 0.14, 0.14, 0.16, 0);
        putM('cyl', side * 0.58, 0.665, -1.9, Math.PI / 2, 0, 0.53, 1.1 * fuel01, 0.53,
          0.62 * fuel01, 0.24 * fuel01, 0.03 * fuel01, 0.35 * fuel01);
        put(side * 0.58, 0.66, -1.3, 0.6, 0.6, 0.14, 0.26, 0.25, 0.28, 0);
      }

      /* ---- ram spikes ---- */
      if (this.spikeLevel > 0) {
        const n = 2 + this.spikeLevel;
        const len = 0.7 + this.spikeLevel * 0.28;
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
          putM('cone', t * 1.1, -0.1, 2.7, Math.PI / 2, 0, 0.4, len, 0.4, 0.74, 0.76, 0.82, 0.05);
        }
        for (const s of [1, -1]) {
          for (let i = 0; i < this.spikeLevel; i++) {
            putM('cone', s * 1.32, -0.1, -1.1 + i * 1.0, 0, s * Math.PI / 2, 0.3, 0.6, 0.3, 0.74, 0.76, 0.82, 0.05);
          }
        }
      }

      /* ---- wheels: huge, knobby, each on its own suspension ---- */
      const steerA = this.steerVis * 0.40 * (this.drifting ? 1.5 : 1);
      for (let i = 0; i < 4; i++) {
        const fwd = i < 2 ? 1 : -1;
        const side = (i % 2) ? -1 : 1;
        const lx = side * WHEEL_X, lz = fwd * WHEEL_Z;
        const wx = bx + lx * cy + lz * sy;
        const wz = bz - lx * sy + lz * cy;
        const wy = this.wheelY[i];
        const wyaw = yaw + (fwd > 0 ? steerA : 0);
        const spin = this.wheelSpin;
        // tyre carcass
        R.push('cylX', 'opaque', wx, wy, wz, wyaw, 0, spin,
          WHEEL_W, WHEEL_R * 2, WHEEL_R * 2, 0.055, 0.055, 0.065, 0);
        // tread blocks around the rim
        for (let t = 0; t < 8; t++) {
          const a = spin + (t / 8) * TAU;
          const tx = wx + Math.sin(wyaw) * 0 + Math.cos(wyaw) * 0;
          const oy = Math.cos(a) * WHEEL_R * 0.93;
          const oz = Math.sin(a) * WHEEL_R * 0.93;
          R.push('box', 'opaque',
            tx + Math.sin(wyaw) * oz, wy + oy, wz + Math.cos(wyaw) * oz,
            wyaw, -a + Math.PI / 2, 0,
            WHEEL_W * 1.06, 0.26, 0.34, 0.10, 0.10, 0.115, 0);
        }
        // beadlock rim
        // beadlock rim, pushed out to the outboard face where it can be seen
        const rimOff = side * (WHEEL_W * 0.5 + 0.02);
        const rx2 = wx + Math.cos(wyaw) * rimOff, rz2 = wz - Math.sin(wyaw) * rimOff;
        R.push('cylX', 'opaque', rx2, wy, rz2, wyaw, 0, spin,
          0.12, WHEEL_R * 1.24, WHEEL_R * 1.24, 0.78, 0.70, 0.18, 0.12);
        R.push('cylX', 'opaque', rx2, wy, rz2, wyaw, 0, spin,
          0.2, WHEEL_R * 0.95, WHEEL_R * 0.95, 0.30, 0.30, 0.34, 0);
        for (let t = 0; t < 5; t++) {
          const a = spin + (t / 5) * TAU;
          const oy = Math.cos(a) * WHEEL_R * 0.5, oz = Math.sin(a) * WHEEL_R * 0.5;
          R.push('box', 'opaque',
            rx2 + Math.sin(wyaw) * oz, wy + oy, rz2 + Math.cos(wyaw) * oz,
            wyaw, -a, 0, 0.14, WHEEL_R * 0.9, 0.22, 0.52, 0.50, 0.54, 0);
        }
      }

      /* ---- nitrous / drift boost flames ---- */
      const boostCol = this.nitroActive ? [0.35, 0.85, 1.0] : (this.boostTime > 0 ? SPARK_COL[this.boostStage] : null);
      if (boostCol) {
        const k = this.nitroActive ? 1 : clamp01(this.boostTime / 0.5);
        for (const s of [1, -1]) {
          const l = 1.4 + Math.random() * 1.2;
          putM('cone', s * 1.16, 2.5, -0.9, -Math.PI, 0, 0.6, l, 0.6,
            boostCol[0] * k, boostCol[1] * k, boostCol[2] * k, 1);
          const l2 = 1.0 + Math.random() * 0.8;
          putM('cone', s * 0.7, -0.2, -2.7 - l2 * 0.3, -Math.PI / 2, 0, 0.55, l2, 0.55,
            boostCol[0] * k, boostCol[1] * k, boostCol[2] * k, 1);
        }
      }

      if (this.drifting && this.driftStage >= 0) {
        const c = SPARK_COL[this.driftStage];
        R.push('disc', 'glow', bx, 0.06, bz, 0, 0, 0, 7, 1, 7, c[0] * 0.22, c[1] * 0.22, c[2] * 0.22, 1);
      }

      R.shadow(bx, bz, 4.0 + clamp(this.y * 0.35, 0, 2.6), clamp01(0.6 - this.y * 0.05), (this.shadowY || 0) + 0.016);
    }
  }

  BA.Car = Car;
  BA.CarConst = { DRIFT_STAGES, SPARK_COL };
})();
