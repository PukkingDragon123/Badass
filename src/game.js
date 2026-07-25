/* BADASS APOCALYPSE - game loop, director, camera, juice */
(function () {
  'use strict';
  const { clamp, clamp01, lerp, damp, rand, randInt, pick, TAU, angleDelta } = BA;

  const COMBO_TIME = 2.6;

  class Game {
    constructor(canvas, overlay, hud) {
      this.R = new BA.Renderer(canvas);
      this.overlay = overlay;
      this.octx = overlay.getContext('2d');
      this.hud = hud;
      this.audio = new BA.Audio();
      this.fx = new BA.FX();
      this.input = new BA.Input(document.body);
      this.world = new BA.World(this.fx, this.audio);
      this.horde = new BA.Horde(this.fx, this.audio);
      this.car = new BA.Car(this.fx, this.audio);
      this.weapons = new BA.Weapons(this.fx, this.audio);
      this.ragdolls = new BA.Ragdolls(this.fx, this.audio);
      this.touch = new BA.TouchControls(this.input, this.audio);

      this.state = 'title';
      this.renderScale = Math.min(window.devicePixelRatio || 1, 1.5);
      this.cam = { x: 0, y: 8, z: -16, yaw: 0, fov: 1.08, dist: 14, height: 6.4, tx: 0, ty: 0, tz: 0, roll: 0 };
      this.trauma = 0;
      this.freeze = 0;
      this.slowmo = 0;
      this.hurtFlash = 0;
      this.flashAmt = 0;
      this.flashCol = [1, 1, 1];
      this.orbs = [];
      this.pickups = [];
      this.scratch = [];
      this.best = Number(localStorage.getItem('ba_best') || 0);

      this.newRun();

      window.addEventListener('resize', () => this.resize());
      this.resize();

      this.last = performance.now();
      this.acc = 0;
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.overlay.width = Math.floor(w * Math.min(window.devicePixelRatio || 1, 2));
      this.overlay.height = Math.floor(h * Math.min(window.devicePixelRatio || 1, 2));
      this.overlay.style.width = w + 'px';
      this.overlay.style.height = h + 'px';
      this.R.canvas.style.width = w + 'px';
      this.R.canvas.style.height = h + 'px';
      this.R.resize(w, h, this.renderScale);
    }

    /* ------------------------------------------------------------- setup */
    newRun() {
      this.time = 0;
      this.kills = 0;
      this.score = 0;
      this.level = 1;
      this.xp = 0;
      this.xpNext = 6;
      this.combo = 0;
      this.comboTimer = 0;
      this.bestCombo = 0;
      this.spawnAcc = 0;
      this.nextBoss = 105;
      this.bossAlive = null;
      this.announce = null;
      this.weaponLevels = {};
      for (const w of BA.upgrades.WEAPONS) this.weaponLevels[w.id] = 0;
      this.passiveLevels = {};
      this.weaponLevels.spikes = 1;

      this.orbs.length = 0;
      this.pickups.length = 0;
      this.fx.clear();
      this.ragdolls.reset();
      this.horde.reset();
      this.world.reset();
      this.weapons.reset();
      this.car.reset();
      this.recalcStats();
      this.car.hp = this.car.maxHp;
      this.cam.yaw = 0;
      this.trauma = 0;
      this.hurtFlash = 0;
      this.deathTimer = 0;
    }

    recalcStats() {
      const P = this.passiveLevels;
      const lv = (k) => P[k] || 0;
      const S = this.car.stats;
      S.maxSpeed = 44 * (1 + lv('engine') * 0.12);
      S.accel = 34 * (1 + lv('turbo') * 0.18);
      S.boostMul = 1 + lv('turbo') * 0.12;
      S.grip = 14 * (1 + lv('grip') * 0.16);
      S.driftGrip = 2.7 * (1 + lv('grip') * 0.05);
      S.turn = 2.45 * (1 + lv('grip') * 0.08);
      S.jump = 14.5 * (1 + lv('hydraulics') * 0.14);
      S.airControl = 2.4 * (1 + lv('hydraulics') * 0.22);
      S.magnet = 5.5 * (1 + lv('magnet') * 0.5);
      S.damage = 1 + lv('overdrive') * 0.18;
      S.cooldown = 1 + lv('coolant') * 0.16;
      S.xpGain = 1 + lv('lucky') * 0.25;
      S.armor = lv('armor') * 0.06;
      S.fuelMax = 100 * (1 + lv('tank') * 0.22);
      S.fuelRegen = 4.5 * (1 + lv('tank') * 0.35);
      S.fuelBurn = 26 * (1 - lv('tank') * 0.07);
      S.nitroPower = 24 * (1 + lv('turbo') * 0.08);
      const prevFuelMax = this.car.maxFuel;
      this.car.maxFuel = S.fuelMax;
      if (S.fuelMax > prevFuelMax) this.car.fuel += S.fuelMax - prevFuelMax;
      this.car.fuel = Math.min(this.car.fuel, this.car.maxFuel);
      const spikes = this.weaponLevels.spikes || 0;
      S.ramDamage = 26 * (1 + spikes * 0.45) * (1 + lv('ramplate') * 0.25);
      this.car.spikeLevel = spikes;

      const newMax = 100 + lv('armor') * 28;
      if (newMax > this.car.maxHp) this.car.hp += Math.min(20, newMax - this.car.maxHp);
      this.car.maxHp = newMax;
      this.car.hp = Math.min(this.car.hp, this.car.maxHp);
    }

    start() {
      this.audio.resume();
      this.newRun();
      this.state = 'playing';
      this.hud.setScreen(null);
      this.hud.flashBanner('SURVIVE', 'THE HORDE IS COMING');
    }

    /* ------------------------------------------------------------- juice */
    shake(amount) { this.trauma = clamp01(this.trauma + amount); }
    hitstop(t) { this.freeze = Math.max(this.freeze, t); }
    flash(a, col) { this.flashAmt = Math.max(this.flashAmt, a); if (col) this.flashCol = col; }

    damageNumber(x, y, z, amount, crit) {
      if (!crit && amount < 14 && Math.random() > 0.22) return;
      this.fx.text(x, y + 0.6, z, String(amount), crit ? '#ffd23a' : '#ffffff', crit ? 24 : 17);
    }

    /* ------------------------------------------------------------ combat */
    explosion(x, z, radius, damage, source) {
      const near = this.horde.grid.query(x, z, radius + 3, this.scratch);
      for (let i = near.length - 1; i >= 0; i--) {
        const e = near[i];
        if (e.dead) continue;
        const dx = e.x - x, dz = e.z - z;
        const d = Math.hypot(dx, dz);
        if (d > radius + e.radius) continue;
        const fall = 1 - clamp01((d - e.radius) / radius) * 0.65;
        const nx = d > 0.01 ? dx / d : rand(-1, 1), nz = d > 0.01 ? dz / d : rand(-1, 1);
        e.vy = 6 + fall * 8;
        e.airborne = true;
        this.horde.damage(e, damage * fall, nx, nz, 42 * fall, this, true);
      }
      if (this.ragdolls) this.ragdolls.blast(x, z, radius * 1.4, 8 + damage * 0.09);
      // barrels chain off explosions too
      for (const p of this.world.props) {
        if (p.dead || p.type !== 'barrel') continue;
        if (Math.hypot(p.x - x, p.z - z) < radius + 1.5) {
          const rid = this.world.runId;
          setTimeout(() => this.world.explodeBarrel(p, this, rid), 70 + Math.random() * 120);
        }
      }
      if (source === 'barrel') {
        const d = Math.hypot(this.car.x - x, this.car.z - z);
        if (d < radius * 0.75) this.car.hurt(14, this);
      }
    }

    slamShock(x, z, power, airTime, auto) {
      const L = this.weaponLevels.slam || 0;
      const radius = (auto ? 8 : 9 + airTime * 6) * (1 + L * 0.22);
      const dmg = (auto ? 26 : 34 + airTime * 40) * (1 + L * 0.55) * this.car.stats.damage * power;
      if (!auto && L === 0 && airTime < 0.5) return;
      this.fx.wave(x, 0.08, z, 1.4, radius * 2.1, 0.42, 0.85, 0.75, 1.5, 1.3);
      this.fx.smoke(x, 0.3, z, 8, 1.1, 0.42, 0.4, 0.38, 1);
      this.fx.sparks(x, 0.4, z, 14, 0.7, 0.7, 1.4, 1.2);
      this.explosion(x, z, radius, dmg, 'slam');
      this.shake(auto ? 0.18 : 0.45);
      if (!auto) this.audio.explode(0.8);
      else this.audio.zap();
    }

    onKill(e, power) {
      this.kills++;
      this.combo++;
      this.comboTimer = COMBO_TIME;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.score += 10 + Math.floor(this.combo * 0.6) + (e.type === 'boss' ? 2500 : e.type === 'brute' ? 90 : 0);
      this.spawnXp(e.x, e.z, e.type === 'boss' ? 26 : e.type === 'brute' ? 5 : 1, e.xp);

      const c = this.combo;
      if (c === 10 || c === 25 || c === 50 || c === 100 || c === 200 || (c > 200 && c % 100 === 0)) {
        const msgs = { 10: 'ROADKILL!', 25: 'BLOODY MESS!', 50: 'MEAT GRINDER!', 100: 'APOCALYPSE!', 200: 'ABSOLUTE UNIT!' };
        this.fx.text(this.car.x, 4.2, this.car.z, (msgs[c] || 'UNSTOPPABLE!') + ' x' + c, '#ff4d3d', 34, 'big');
        this.audio.levelUp();
        this.flash(0.22, [1, 0.5, 0.35]);
        this.addXp(Math.floor(c * 0.55), this.car.x, this.car.z);
      }
      if (e.type === 'boss') this.bossAlive = null;
    }

    spawnXp(x, z, count, value) {
      for (let i = 0; i < count; i++) {
        this.orbs.push({
          x: x + rand(-1.4, 1.4), y: 0.7 + rand(0, 0.6), z: z + rand(-1.4, 1.4),
          vx: rand(-3, 3), vy: rand(2, 6), vz: rand(-3, 3),
          value: value, t: rand(TAU), grabbed: false, life: 26,
        });
      }
      if (this.orbs.length > 700) this.orbs.splice(0, this.orbs.length - 700);
    }

    dropHealth(x, z) {
      this.pickups.push({ x, y: 1.0, z, t: rand(TAU), kind: 'hp', life: 30 });
    }

    dropFuel(x, z) {
      this.pickups.push({ x, y: 1.0, z, t: rand(TAU), kind: 'gas', life: 34 });
    }

    addXp(amount, x, z) {
      this.xp += amount * this.car.stats.xpGain;
      this.score += amount * 2;
      while (this.xp >= this.xpNext) {
        this.xp -= this.xpNext;
        this.level++;
        this.xpNext = Math.floor(6 + this.level * 3.4 + Math.pow(this.level, 1.42) * 2.4);
        this.queueLevelUp();
      }
    }

    queueLevelUp() {
      this.pendingLevels = (this.pendingLevels || 0) + 1;
    }

    openLevelUp() {
      this.pendingLevels--;
      this.state = 'levelup';
      this.audio.levelUp();
      this.choices = BA.upgrades.roll(this, 3);
      this.hud.showLevelUp(this.choices, this.level, (u) => this.chooseUpgrade(u));
    }

    chooseUpgrade(u) {
      BA.upgrades.apply(this, u);
      this.audio.ui();
      this.hud.setScreen(null);
      this.state = 'playing';
      this.slowmo = 0.35;
      this.flash(0.3, [0.6, 0.9, 1.0]);
      this.fx.wave(this.car.x, 0.1, this.car.z, 1, 18, 0.55, 0.5, 1.0, 1.5, 1.2);
    }

    /* ---------------------------------------------------------- director */
    difficulty() { return this.time / 60; }

    spawnWave(dt) {
      const d = this.difficulty();
      const targetAlive = Math.min(70 + d * 62, this.horde.max);
      const alive = this.horde.count;
      if (alive >= targetAlive) return;

      this.spawnAcc += dt * (9 + d * 12);
      if (this.spawnAcc < 1) return;

      const hpMul = 1 + d * 0.62 + Math.pow(d, 1.7) * 0.12;
      const spMul = 1 + d * 0.05;

      // spawn as clusters so the horde reads as a wall of bodies
      const clusterSize = clamp(Math.floor(4 + d * 5), 4, 26);
      const n = Math.min(Math.floor(this.spawnAcc), clusterSize);
      this.spawnAcc -= n;

      const car = this.car;
      const vAng = Math.atan2(car.vx, car.vz);
      const ahead = car.speed > 12 && Math.random() < 0.62;
      const baseAng = ahead ? vAng + rand(-0.75, 0.75) : rand(TAU);
      const dist = rand(56, 80);
      const cxp = car.x + Math.sin(baseAng) * dist;
      const czp = car.z + Math.cos(baseAng) * dist;

      for (let i = 0; i < n; i++) {
        let type = 'walker';
        const r = Math.random();
        if (d > 0.6 && r < 0.20 + d * 0.05) type = 'runner';
        if (d > 1.4 && r > 0.86) type = 'bomber';
        if (d > 2.2 && r > 0.955) type = 'brute';
        const spread = 3 + clusterSize * 0.7;
        this.horde.spawn(type, cxp + rand(-spread, spread), czp + rand(-spread, spread), hpMul, spMul);
      }

      if (this.time > this.nextBoss && !this.bossAlive) {
        this.nextBoss = this.time + 115;
        const a = rand(TAU);
        const b = this.horde.spawn('boss', car.x + Math.sin(a) * 70, car.z + Math.cos(a) * 70, 1 + d * 0.85, 1 + d * 0.03);
        if (b) {
          this.bossAlive = b;
          this.audio.bigBad();
          this.hud.flashBanner('WARNING', 'A BEHEMOTH APPROACHES');
          this.shake(0.5);
        }
      }
    }

    /* ------------------------------------------------------------ update */
    update(dt) {
      const inp = this.input;
      inp.update();

      if (this.state === 'title') {
        this.time += dt * 0.2;
        this.updateCameraTitle(dt);
        this.fx.update(dt, null);
        if (inp.consume('Space') || inp.consume('Enter') || inp.consume('KeyW') || this.hud.startRequested) {
          this.hud.startRequested = false;
          this.start();
        }
        return;
      }

      if (inp.consume('Escape') || inp.consume('KeyP')) {
        if (this.state === 'playing') { this.state = 'paused'; this.hud.setScreen('pause'); this.audio.silenceEngine(); }
        else if (this.state === 'paused') { this.state = 'playing'; this.hud.setScreen(null); }
      }
      if (inp.consume('KeyT')) {
        this.hud.toast(this.touch.toggle() ? 'TOUCH CONTROLS ON' : 'TOUCH CONTROLS OFF');
      }
      if (inp.consume('KeyM')) {
        this.audio.muted = !this.audio.muted;
        if (this.audio.muted) this.audio.silenceEngine();
        this.hud.toast(this.audio.muted ? 'SOUND OFF' : 'SOUND ON');
      }

      if (this.state === 'paused') return;

      if (this.state === 'levelup') {
        const pick_ = ['Digit1', 'Digit2', 'Digit3'].findIndex((k) => inp.consume(k));
        if (pick_ >= 0 && this.choices[pick_]) this.chooseUpgrade(this.choices[pick_]);
        this.updateCamera(dt * 0.25, true);
        this.fx.update(dt * 0.15, (x, z) => this.world.groundHeight(x, z));
        this.ragdolls.update(dt * 0.15, (x, z) => this.world.groundHeight(x, z), null);
        return;
      }

      if (this.state === 'dead') {
        this.deathTimer += dt;
        this.updateCamera(dt, true);
        this.fx.update(dt * 0.55, (x, z) => this.world.groundHeight(x, z));
        this.ragdolls.update(dt * 0.55, (x, z) => this.world.groundHeight(x, z), null);
        this.horde.update(dt * 0.35, this.car, this, this.world);
        if (this.deathTimer > 1.1 && (inp.consume('Space') || inp.consume('Enter') || inp.consume('KeyR') || this.hud.startRequested)) {
          this.hud.startRequested = false;
          this.start();
        }
        return;
      }

      /* ---- playing ---- */
      if (this.car.hp <= 0) { this.die(); return; }
      if (this.pendingLevels > 0 && this.freeze <= 0) { this.openLevelUp(); return; }

      this.time += dt;
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }

      this.car.update(dt, inp, this.world, this);
      this.world.update(dt, this.car, this);
      this.horde.update(dt, this.car, this, this.world);
      this.weapons.update(dt, this.car, this.horde, this);
      this.spawnWave(dt);
      this.updateOrbs(dt);
      this.fx.update(dt, (x, z) => this.world.groundHeight(x, z));
      this.ragdolls.update(dt, (x, z) => this.world.groundHeight(x, z), this.car);
      this.updateCamera(dt, false);

      if (this.car.hp <= 0) this.die();

      // engine audio
      const c = this.car;
      const rpm = clamp01(Math.abs(c.vf) / c.stats.maxSpeed) * 0.75 + (inp.throttle > 0 ? 0.2 : 0) + (c.grounded ? 0 : 0.15);
      this.audio.engine(clamp01(rpm), inp.throttle, clamp01(Math.abs(c.vr) / 14), c.speed01, !c.grounded);
    }

    die() {
      this.state = 'dead';
      this.deathTimer = 0;
      this.audio.silenceEngine();
      this.audio.gameOver();
      this.audio.explode(2);
      this.fx.fire(this.car.x, 1.2, this.car.z, 46, 1.8, 2.4);
      this.fx.smoke(this.car.x, 1.6, this.car.z, 24, 2.0, 0.16, 0.15, 0.15, 1.5);
      this.fx.shard(this.car.x, 1.2, this.car.z, 26, this.car.color[0], this.car.color[1], this.car.color[2]);
      this.fx.wave(this.car.x, 0.1, this.car.z, 1, 30, 0.7, 1.4, 0.6, 0.2, 1.8);
      this.shake(1.2);
      this.flash(0.8, [1, 0.55, 0.3]);
      this.score += Math.floor(this.time * 12);
      if (this.score > this.best) {
        this.best = this.score;
        localStorage.setItem('ba_best', String(this.best));
      }
      this.hud.showGameOver(this);
    }

    updateOrbs(dt) {
      const car = this.car;
      const mag = car.stats.magnet;
      for (let i = this.orbs.length - 1; i >= 0; i--) {
        const o = this.orbs[i];
        o.life -= dt;
        o.t += dt * 4;
        const dx = car.x - o.x, dz = car.z - o.z;
        const d = Math.hypot(dx, dz);
        if (!o.grabbed && d < mag) o.grabbed = true;
        if (o.grabbed) {
          const pull = 34 + (mag - Math.min(d, mag)) * 4;
          o.vx += (dx / (d || 1)) * pull * dt;
          o.vz += (dz / (d || 1)) * pull * dt;
          o.vy += (1.0 - o.y) * 8 * dt;
          o.vx *= Math.exp(-2.2 * dt); o.vz *= Math.exp(-2.2 * dt);
        } else {
          o.vy -= 26 * dt;
          o.vx *= Math.exp(-3 * dt); o.vz *= Math.exp(-3 * dt);
        }
        o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
        if (o.y < 0.45) { o.y = 0.45; if (o.vy < 0) o.vy = -o.vy * 0.35; }
        if (d < 2.6 || o.life <= 0) {
          if (o.life > 0) {
            this.addXp(o.value, o.x, o.z);
            this.audio.pickup(clamp01(this.level / 24));
            this.fx.sparks(o.x, o.y, o.z, 3, 0.5, 1.2, 0.9, 0.5);
          }
          this.orbs.splice(i, 1);
        }
      }
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const p = this.pickups[i];
        p.life -= dt; p.t += dt * 3;
        if (Math.hypot(car.x - p.x, car.z - p.z) < 3.6) {
          if (p.kind === 'gas') {
            car.refuel(car.maxFuel * 0.55);
            this.fx.text(p.x, 2.8, p.z, 'GAS!', '#ffd23a', 24, 'big');
            this.fx.sparks(p.x, 1, p.z, 14, 1.4, 0.9, 0.3, 1);
          } else {
            car.hp = Math.min(car.maxHp, car.hp + 32);
            this.fx.text(p.x, 2.8, p.z, '+32 HP', '#7dffa0', 24, 'big');
            this.fx.sparks(p.x, 1, p.z, 14, 0.4, 1.4, 0.6, 1);
          }
          this.audio.levelUp();
          this.pickups.splice(i, 1);
        } else if (p.life <= 0) this.pickups.splice(i, 1);
      }
    }

    /* ------------------------------------------------------------ camera */
    updateCamera(dt, soft) {
      const car = this.car;
      const cam = this.cam;
      const sp = car.speed01;

      let targetYaw = car.yaw;
      if (car.drifting || Math.abs(car.vr) > 6) {
        const moveYaw = Math.atan2(car.vx, car.vz);
        targetYaw = car.yaw + angleDelta(car.yaw, moveYaw) * 0.35;
      }
      cam.yaw += angleDelta(cam.yaw, targetYaw) * clamp01(dt * (soft ? 2.2 : 5.4));

      const fx_ = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
      const boost = car.boosting ? 1 : 0;
      cam.dist = damp(cam.dist, 12.6 + sp * 3.8 + boost * 1.6 + clamp(car.y * 0.3, 0, 3.5), 6, dt);
      cam.height = damp(cam.height, 5.7 + sp * 1.2 + car.y * 0.5, 6, dt);

      const lookAhead = 4.0 + sp * 5.0;
      const tx = car.x + fx_ * lookAhead + car.vx * 0.06;
      const tz = car.z + fz * lookAhead + car.vz * 0.06;
      const ty = car.y + 2.6;
      cam.tx = damp(cam.tx, tx, 12, dt);
      cam.ty = damp(cam.ty, ty, 9, dt);
      cam.tz = damp(cam.tz, tz, 12, dt);

      const ex = car.x - fx_ * cam.dist;
      const ez = car.z - fz * cam.dist;
      const ey = car.y + cam.height;
      cam.x = damp(cam.x, ex, 11, dt);
      cam.y = damp(cam.y, ey, 8, dt);
      cam.z = damp(cam.z, ez, 11, dt);

      cam.fov = damp(cam.fov, 1.05 + sp * 0.16 + boost * 0.14 + (car.drifting ? 0.03 : 0), 5, dt);
      cam.roll = damp(cam.roll, -car.rollVis * 0.5 - car.vr * 0.006, 7, dt);
      this.applyCamera();
    }

    updateCameraTitle(dt) {
      const cam = this.cam;
      const t = this.time;
      cam.yaw = t * 0.25;
      const d = 26;
      cam.x = Math.sin(cam.yaw) * -d;
      cam.z = Math.cos(cam.yaw) * -d;
      cam.y = 9 + Math.sin(t * 0.4) * 1.5;
      cam.tx = 0; cam.ty = 1.6; cam.tz = 0;
      cam.fov = 0.95;
      cam.roll = Math.sin(t * 0.3) * 0.04;
      this.applyCamera();
    }

    applyCamera() {
      const cam = this.cam;
      const tr = this.trauma * this.trauma;
      const t = performance.now() * 0.001;
      const sx = Math.sin(t * 47.3) * tr * 1.5 + Math.sin(t * 91.7) * tr * 0.7;
      const sy = Math.cos(t * 53.1) * tr * 1.4 + Math.cos(t * 83.3) * tr * 0.6;
      const sz = Math.sin(t * 61.7) * tr * 1.1;
      const rollN = Math.sin(t * 37.9) * tr * 0.14;
      const roll = cam.roll + rollN;
      const up = [Math.sin(roll), Math.cos(roll), 0];
      this.R.setCamera(
        [cam.x + sx, cam.y + sy, cam.z + sz],
        [cam.tx + sx * 0.35, cam.ty + sy * 0.35, cam.tz + sz * 0.35],
        up, cam.fov, 0.4, 900
      );
    }

    /* ------------------------------------------------------------- draw */
    draw() {
      const R = this.R;
      const car = this.car;
      R.time = this.time;
      R.beginFrame();

      this.world.eyeX = this.cam.x;
      this.world.eyeZ = this.cam.z;
      this.world.draw(R, car.x, car.z);
      this.ragdolls.draw(R, car.x, car.z);
      this.horde.draw(R, car.x, car.z);
      if (this.state !== 'dead') car.draw(R);
      this.weapons.draw(R, car, this);
      this.fx.draw(R);

      // xp orbs
      for (const o of this.orbs) {
        const p = 0.42 + Math.sin(o.t) * 0.08;
        R.push('sphere', 'glow', o.x, o.y, o.z, o.t * 0.7, o.t * 0.4, 0, p, p, p, 0.16, 0.62, 0.20, 1);
        R.push('box', 'opaque', o.x, o.y, o.z, o.t * 0.7, o.t * 0.4, o.t * 0.3, p * 0.62, p * 0.62, p * 0.62, 0.35, 1.05, 0.42, 0.9);
      }
      for (const p of this.pickups) {
        const b = 1 + Math.sin(p.t) * 0.12;
        const y = p.y + Math.sin(p.t) * 0.18;
        if (p.kind === 'gas') {
          R.push('box', 'opaque', p.x, y, p.z, p.t * 0.5, 0, 0, 1.0, 1.3 * b, 0.7, 0.72, 0.16, 0.08, 0.12);
          R.push('box', 'opaque', p.x, y + 0.8, p.z, p.t * 0.5, 0, 0, 0.4, 0.3, 0.3, 0.3, 0.3, 0.32, 0);
          R.push('box', 'opaque', p.x, y + 0.1, p.z, p.t * 0.5, 0, 0, 1.04, 0.4, 0.74, 1.1, 0.85, 0.15, 0.5);
          R.push('sphere', 'glow', p.x, y, p.z, 0, 0, 0, 2.6, 2.6, 2.6, 0.28, 0.16, 0.03, 1);
        } else {
          R.push('box', 'opaque', p.x, y, p.z, p.t * 0.5, 0, 0, 1.1 * b, 0.34, 0.34, 0.2, 1.5, 0.4, 0.9);
          R.push('box', 'opaque', p.x, y, p.z, p.t * 0.5, 0, 0, 0.34, 1.1 * b, 0.34, 0.2, 1.5, 0.4, 0.9);
          R.push('sphere', 'glow', p.x, y, p.z, 0, 0, 0, 2.2, 2.2, 2.2, 0.05, 0.35, 0.12, 1);
        }
        R.shadow(p.x, p.z, 1.4, 0.35);
      }

      const P = R.post;
      const sp = car.speed01;
      P.bloom = 0.72;
      P.aberration = 0.0006 + sp * 0.0018 + this.trauma * 0.006 + (car.boosting ? 0.0025 : 0);
      P.vignette = 1;
      P.speedBlur = clamp01((sp - 0.45) / 0.55) * 1.1 + (car.boosting ? 0.85 : 0);
      P.flash = this.flashAmt;
      P.flashCol = this.flashCol;
      P.hurt = Math.max(this.hurtFlash, clamp01(1 - car.hp / (car.maxHp * 0.34)) * 0.35);

      R.render([car.x, car.z]);

      // 2D overlay
      const ctx = this.octx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
      this.fx.drawText(ctx, R, this.overlay.width, this.overlay.height);
    }

    /* -------------------------------------------------------------- loop */
    frame(now) {
      requestAnimationFrame(this.frame);
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (!(dt > 0)) dt = 0.016;
      dt = Math.min(dt, 0.05);
      const realDt = dt;

      if (this.freeze > 0) {
        this.freeze -= realDt;
        dt *= 0.03;
      }
      if (this.slowmo > 0) {
        this.slowmo -= realDt;
        dt *= 0.45;
      }
      if (this.state === 'dead') dt *= 0.55;

      this.trauma = Math.max(0, this.trauma - realDt * 1.5);
      this.flashAmt = Math.max(0, this.flashAmt - realDt * 3.2);
      this.hurtFlash = Math.max(0, this.hurtFlash - realDt * 2.2);

      this.update(dt);
      this.draw();

      const intensity = clamp01(this.horde.count / 130 + this.car.speed01 * 0.25 + (this.bossAlive ? 0.3 : 0));
      this.audio.updateMusic(realDt, intensity, this.state === 'playing' || this.state === 'levelup');
      this.touch.update(realDt, this);
      this.hud.update(this, realDt);
    }
  }

  BA.Game = Game;
})();
