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
      this.meta = new BA.meta.Meta();
      this.bunker = new BA.Bunker(this);
      this.garage = new BA.Garage(this);
      this.survivors = [];
      this.loot = [];
      this.allies = new BA.Allies(this.fx, this.audio);
      this.stage = BA.stages.byId[this.meta.lastStage] || BA.stages.byId.suburb;

      this.state = 'title';
      this.renderScale = Math.min(window.devicePixelRatio || 1, 1.5);
      this.cam = { x: 0, y: 8, z: -16, yaw: 0, fov: 1.08, dist: 14, height: 6.4, tx: 0, ty: 0, tz: 0, roll: 0 };
      this.trauma = 0;
      this.freeze = 0;
      this.slowmo = 0;
      this.hurtFlash = 0;
      this.flashAmt = 0;
      this.flashCol = [1, 1, 1];
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
      const rank = this.meta.rank;
      const T = this.meta.truckStats();
      this.run = {
        rescueNeed: Math.min(2 + rank, T.cargo),
        aboard: 0,
        waveNeed: 3,
        waveIdx: 0,
        waveKills: 0,
        waveKillNeed: 22 + rank * 6,
        garageZ: 620,
        exitZ: 1240,
        garageUsed: false,
        haul: { scrap: 0, wood: 0, ore: 0, stone: 0, food: 0, fuel: 0 },
        cargo: T.cargo,
        haulMul: T.haulMul,
        complete: false,
      };
      this.survivors.length = 0;
      this.loot.length = 0;
      this.allies.reset();
      this.nextSurvivorZ = 90;
      const st = this.stage;
      this.run.garageZ = st.garageZ;
      this.run.exitZ = st.exitZ;
      this.run.stage = st.id;
      this.world.setStage(st);
      this.R.groundMode = st.ground;
      this.R.fog = st.fog.slice();
      this.R.fogDensity = st.fogDensity;
      this.time = 0;
      this.kills = 0;
      this.score = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.bestCombo = 0;
      this.spawnAcc = 0;
      this.nextBoss = 105;
      this.bossAlive = null;
      this.announce = null;
      this.syncWeapons();

      this.pickups.length = 0;
      this.fx.clear();
      this.ragdolls.reset();
      this.horde.reset();
      this.world.reset();
      this.weapons.reset();
      this.car.reset();
      this.applyComponents();
      this.car.hp = this.car.maxHp;
      this.car.fuel = this.car.maxFuel * (this.comp.startFuel || 0.55);
      this.car.nitroWarned = false;
      this.cam.yaw = 0;
      this.trauma = 0;
      this.hurtFlash = 0;
      this.deathTimer = 0;
    }

    /* fold the garage components into the truck's baseline */
    applyComponents() {
      const T = this.meta.truckStats();
      this.comp = T;
      this.car.canJump = T.canJump;
      this.car.canNitro = T.canNitro;
      this.syncWeapons();
      this.recalcStats();
    }

    /* The arsenal is exactly what is bolted to the truck - built in the armory,
       nothing handed out mid-run. Only the best `hardpoints` guns actually fire. */
    syncWeapons() {
      const T = this.comp || this.meta.truckStats();
      const owned = [];
      for (const c of BA.meta.WEAPON_COMPONENTS) {
        const l = this.meta.compLevel(c.id);
        if (l > 0) owned.push({ w: c.w, l });
      }
      owned.sort((a, b) => b.l - a.l);
      this.weaponLevels = {};
      // spikes are part of the plow, they never occupy a hardpoint
      let slots = T.hardpoints;
      for (const o of owned) {
        if (o.w === 'spikes') { this.weaponLevels.spikes = o.l; continue; }
        if (slots <= 0) continue;
        this.weaponLevels[o.w] = o.l;
        slots--;
      }
      this.mountedCount = owned.length;
    }

    hpMul() { const d = this.difficulty(); return 1 + d * 0.66 + Math.pow(d, 1.7) * 0.14; }
    spMul() { const d = this.difficulty(); return 1 + d * 0.06; }

    recalcStats() {
      const T = this.comp || this.meta.truckStats();
      const lv = (k) => this.meta.compLevel(k);
      const S = this.car.stats;
      const apex = lv('apex');
      S.maxSpeed = 30 * T.speedMul * (1 + apex * 0.07);
      S.accel = 22 * T.accelMul;
      S.boostMul = 1 + lv('turbo') * 0.06;
      S.grip = 12 * T.gripMul;
      S.driftGrip = 2.5;
      S.turn = 2.2 * T.turnMul;
      S.jump = 13 * T.jumpMul;
      S.airControl = 2.0 * (1 + lv('hydraulics') * 0.16);
      S.magnet = 5.0 * T.magnetMul;
      S.damage = (1 + lv('overdrive') * 0.16 + apex * 0.12);
      S.cooldown = 1 + lv('coolant') * 0.14;
      S.armor = T.armor;
      S.fuelMax = 100 * T.fuelMul;
      S.fuelRegen = 4.0 * T.fuelRegenMul;
      S.fuelBurn = 26 * (1 - Math.min(0.4, lv('tank') * 0.06));
      S.nitroPower = 20 * T.nosMul;
      S.lifesteal = lv('vampire') ? 0.5 + lv('vampire') * 0.5 : 0;
      S.chainDmg = lv('chain') ? 14 + lv('chain') * 12 : 0;
      this.car.canJump = T.canJump;
      this.car.canNitro = T.canNitro;
      const prevFuelMax = this.car.maxFuel;
      this.car.maxFuel = S.fuelMax;
      if (S.fuelMax > prevFuelMax) this.car.fuel += S.fuelMax - prevFuelMax;
      this.car.fuel = Math.min(this.car.fuel, this.car.maxFuel);
      const spikes = this.weaponLevels.spikes || 0;
      S.ramDamage = 16 * T.ramMul * (1 + spikes * 0.45);
      this.car.spikeLevel = spikes;

      const newMax = Math.round(T.hp * T.startHpMul);
      if (newMax > this.car.maxHp) this.car.hp += Math.min(20, newMax - this.car.maxHp);
      this.car.maxHp = newMax;
      this.car.hp = Math.min(this.car.hp, this.car.maxHp);
    }

    /* the bunker is the home screen; runs launch from the garage ramp */
    enterBase() {
      this.state = 'bunker';
      // a key buffered in a menu must not fire as a command in the next state
      this.input.pressed = Object.create(null);
      this.hud.setScreen(null);
      this.hud.el.hud.classList.remove('on');
      this.bunker.enter();
      this.audio.silenceEngine();
    }

    startRun() {
      this.audio.resume();
      this.bunker.exit();
      this.newRun();
      this.input.pressed = Object.create(null);
      this.state = 'playing';
      this.hud.setScreen(null);
      this.hud.el.hud.classList.add('on');
      this.hud.flashBanner(this.stage.name, 'RESCUE · CLEAR · EXTRACT');
      this.meta.runs++;
      this.meta.save();
    }

    start() { this.enterBase(); }

    /* ------------------------------------------------------- run flow */
    endRun(success) {
      if (this.run.complete) return;
      this.run.complete = true;
      this.state = 'results';
      this.audio.silenceEngine();
      const m = this.meta;
      const keep = success ? 1 : 0.5;
      const gained = {};
      for (const k in this.run.haul) {
        const v = Math.floor(this.run.haul[k] * keep);
        if (v > 0) { m.add(k, v); gained[k] = v; }
      }
      const people = success ? this.run.aboard : 0;
      if (people > 0) { m.add('people', people); m.totalRescued += people; }
      if (success) m.clearedStage(this.stage.id);
      m.totalKills += this.kills;
      this.score += Math.floor(this.time * 10) + this.run.aboard * 400 + this.run.waveIdx * 250;
      if (success) this.score = Math.floor(this.score * 1.4);
      if (this.score > m.bestScore) m.bestScore = this.score;
      this.best = m.bestScore;
      m.save();
      this.hud.showResults(this, success, gained, people);
    }

    resumeFromGarage() {
      if (this.state === 'garage') {
        this.state = 'playing';
        this.hud.toast('BACK ON THE ROAD');
      }
    }

    objectivesDone() {
      const r = this.run;
      return r.aboard >= r.rescueNeed && r.waveIdx >= r.waveNeed;
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
      const S = this.car.stats;
      if (S.lifesteal > 0 && this.car.hp > 0) {
        this.car.hp = Math.min(this.car.maxHp, this.car.hp + S.lifesteal);
      }
      if (S.chainDmg > 0) {
        this.fx.fire(e.x, 1.0 * e.scale, e.z, 6, 0.6, 1.0);
        this.fx.wave(e.x, 0.1, e.z, 1, 7, 0.3, 1.0, 0.5, 0.15, 0.8);
        this.explosion(e.x, e.z, 5.5, S.chainDmg, 'chain');
      }
      if (this.run && !this.run.complete) {
        const r = this.run;
        if (r.waveIdx < r.waveNeed) {
          r.waveKills++;
          if (r.waveKills >= r.waveKillNeed) {
            r.waveKills = 0;
            r.waveIdx++;
            r.waveKillNeed = Math.round(r.waveKillNeed * 1.35);
            this.audio.levelUp();
            this.hud.flashBanner('WAVE ' + r.waveIdx + ' CLEARED',
              r.waveIdx >= r.waveNeed ? 'ALL WAVES DOWN' : 'NEXT WAVE INCOMING');
            this.flash(0.25, [1, 0.8, 0.3]);
            this.checkObjectives();
          }
        }
        // resources also drop straight off the horde
        if (Math.random() < 0.16) this.dropLoot(e.x, e.z, Math.random() < 0.75 ? 'scrap' : 'meds', 1);
      }
      this.combo++;
      this.comboTimer = COMBO_TIME;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.score += 10 + Math.floor(this.combo * 0.6) + (e.type === 'boss' ? 2500 : e.type === 'brute' ? 90 : 0);
      if (e.type === 'boss') {
        for (let i = 0; i < 14; i++) this.dropLoot(e.x + rand(-4, 4), e.z + rand(-4, 4), pick(['scrap', 'ore', 'stone']), 3);
      } else if (e.type === 'brute') {
        for (let i = 0; i < 3; i++) this.dropLoot(e.x, e.z, Math.random() < 0.6 ? 'scrap' : 'ore', 2);
      }

      const c = this.combo;
      if (c === 10 || c === 25 || c === 50 || c === 100 || c === 200 || (c > 200 && c % 100 === 0)) {
        const msgs = { 10: 'ROADKILL!', 25: 'BLOODY MESS!', 50: 'MEAT GRINDER!', 100: 'APOCALYPSE!', 200: 'ABSOLUTE UNIT!' };
        this.fx.text(this.car.x, 4.2, this.car.z, (msgs[c] || 'UNSTOPPABLE!') + ' x' + c, '#ff4d3d', 34, 'big');
        this.audio.levelUp();
        this.flash(0.22, [1, 0.5, 0.35]);
        this.dropLoot(this.car.x, this.car.z, 'scrap', Math.max(2, Math.floor(c * 0.2)));
      }
      if (e.type === 'boss') this.bossAlive = null;
    }

    /* a scrap of a resource, flung out of whatever you just destroyed */
    dropLoot(x, z, res, amount) {
      if (this.loot.length > 260) this.loot.shift();
      this.loot.push({
        x, y: 1.0 + rand(0, 0.6), z, res, amount,
        vx: rand(-4, 4), vy: rand(3, 7), vz: rand(-4, 4),
        t: rand(TAU), grabbed: false, life: 30,
      });
    }

    updateLoot(dt) {
      const car = this.car;
      const mag = car.stats.magnet * 1.3;
      for (let i = this.loot.length - 1; i >= 0; i--) {
        const o = this.loot[i];
        o.life -= dt; o.t += dt * 3;
        const dx = car.x - o.x, dz = car.z - o.z;
        const d = Math.hypot(dx, dz);
        if (!o.grabbed && d < mag) o.grabbed = true;
        if (o.grabbed) {
          const pull = 40 + (mag - Math.min(d, mag)) * 4;
          o.vx += (dx / (d || 1)) * pull * dt;
          o.vz += (dz / (d || 1)) * pull * dt;
          o.vy += (1.4 - o.y) * 9 * dt;
          o.vx *= Math.exp(-2.4 * dt); o.vz *= Math.exp(-2.4 * dt);
        } else {
          o.vy -= 26 * dt;
          o.vx *= Math.exp(-3 * dt); o.vz *= Math.exp(-3 * dt);
        }
        o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
        if (o.y < 0.5) { o.y = 0.5; if (o.vy < 0) o.vy = -o.vy * 0.3; }
        if (d < 3.0 || o.life <= 0) {
          if (o.life > 0) {
            const bias = (this.stage.reward && this.stage.reward[o.res]) || 1;
            const gain = Math.max(1, Math.round(o.amount * this.run.haulMul * bias));
            this.run.haul[o.res] = (this.run.haul[o.res] || 0) + gain;
            this.audio.pickup(0.3);
            const rr = BA.meta.RES.find((r) => r.id === o.res);
            this.fx.sparks(o.x, o.y, o.z, 2, 1.0, 0.9, 0.4, 0.5);
            if (Math.random() < 0.28) this.fx.text(o.x, 2.2, o.z, '+' + gain + ' ' + (rr ? rr.name : ''), rr ? rr.color : '#fff', 15);
          }
          this.loot.splice(i, 1);
        }
      }
    }

    /* ------------------------------------------------------- survivors */
    updateSurvivors(dt) {
      const car = this.car;
      const r = this.run;
      // seed the road ahead with people waving a flare
      while (this.nextSurvivorZ < car.z + 220 && this.survivors.length < 4) {
        this.survivors.push({
          x: rand(-46, 46), z: this.nextSurvivorZ, t: rand(TAU),
          skin: [rand(0.5, 0.92), rand(0.4, 0.75), rand(0.3, 0.6)],
          shirt: [rand(0.2, 0.6), rand(0.2, 0.6), rand(0.25, 0.65)],
          picked: false, panic: 0,
        });
        this.nextSurvivorZ += rand(110, 190);
      }
      for (let i = this.survivors.length - 1; i >= 0; i--) {
        const sv = this.survivors[i];
        sv.t += dt * 3;
        if (sv.z < car.z - 140) { this.survivors.splice(i, 1); continue; }
        const d = Math.hypot(car.x - sv.x, car.z - sv.z);
        if (d < 60) sv.panic = 1;
        if (d < 6.5) {
          this.survivors.splice(i, 1);
          if (r.aboard < r.cargo) {
            r.aboard++;
            this.audio.levelUp();
            this.fx.text(sv.x, 3.4, sv.z, 'RESCUED! ' + r.aboard + '/' + r.cargo, '#7fd4ff', 26, 'big');
            // they do not just sit in the bed - hand them a rifle
            if (this.allies.addFighter(sv.x, sv.z, Math.min(3, this.meta.rank - 1))) {
              this.hud.toast('SURVIVOR ARMED - THEY FIGHT WITH YOU NOW');
            }
            this.fx.sparks(sv.x, 1.4, sv.z, 16, 0.4, 0.8, 1.4, 1.1);
            this.flash(0.2, [0.4, 0.8, 1.0]);
            this.checkObjectives();
          } else {
            this.hud.toast('CARGO BED FULL - UPGRADE IT AT THE GARAGE');
            this.fx.text(sv.x, 3.4, sv.z, 'NO ROOM', '#ff6b5e', 22, 'big');
          }
        }
      }
    }

    checkObjectives() {
      if (this.objectivesDone() && !this.run.exitOpen) {
        this.run.exitOpen = true;
        this.hud.flashBanner('EXTRACTION OPEN', 'DRIVE NORTH TO THE GATE');
        this.audio.levelUp();
      }
    }

    /* garage pit-stop and the extraction gate sit on the road north */
    updateLandmarks(dt) {
      const car = this.car, r = this.run;
      if (!r.garageUsed && Math.abs(car.z - r.garageZ) < 13 && Math.abs(car.x) < 15) {
        if (car.speed < 9) {
          r.garageUsed = true;
          this.state = 'garage';
          this.audio.silenceEngine();
          this.garage.open('road');
        } else if (!r.garageHint) {
          r.garageHint = true;
          this.hud.toast('SLOW DOWN IN THE GARAGE TO FIT PARTS');
        }
      }
      if (Math.abs(car.z - r.exitZ) < 14 && Math.abs(car.x) < 20) {
        if (this.objectivesDone()) this.endRun(true);
        else if (!r.exitHint) {
          r.exitHint = true;
          this.hud.toast('OBJECTIVES INCOMPLETE - THE GATE STAYS SHUT');
        }
      }
    }

    dropHealth(x, z) {
      this.pickups.push({ x, y: 1.0, z, t: rand(TAU), kind: 'hp', life: 30 });
    }

    dropFuel(x, z) {
      this.pickups.push({ x, y: 1.0, z, t: rand(TAU), kind: 'gas', life: 34 });
    }

    /* ---------------------------------------------------------- director */
    // difficulty tracks both clock and distance, so pushing north hurts
    difficulty() { return Math.max(this.time / 60, this.car.z / 260) * (1 + this.meta.rank * 0.06); }

    spawnWave(dt) {
      const d = this.difficulty();
      const targetAlive = Math.min(80 + d * 72, this.horde.max);
      const alive = this.horde.count;
      if (alive >= targetAlive) return;

      this.spawnAcc += dt * (11 + d * 14);
      if (this.spawnAcc < 1) return;

      const hpMul = this.hpMul();
      const spMul = this.spMul();

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
        if (d > 0.4 && r < 0.22 + d * 0.06) type = 'runner';
        if (d > 0.8 && r > 0.80 && r < 0.86) type = 'spitter';
        if (d > 1.2 && r > 0.86 && r < 0.90) type = 'bomber';
        if (d > 1.6 && r > 0.90 && r < 0.94) type = 'sniper';
        if (d > 2.0 && r > 0.94 && r < 0.965) type = 'screamer';
        if (d > 2.2 && r > 0.965) type = 'brute';
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
          this.audio.resume();
          this.enterBase();
        }
        return;
      }

      if (this.state === 'bunker') {
        this.bunker.update(dt);
        this.fx.update(dt, null);
        return;
      }

      if (this.state === 'garage') {
        // the world holds its breath while you are under the truck
        this.fx.update(dt * 0.1, (x, z) => this.world.groundHeight(x, z));
        this.updateCamera(dt * 0.4, true);
        return;
      }

      if (this.state === 'results') {
        this.deathTimer += dt;
        this.updateCamera(dt, true);
        this.fx.update(dt * 0.4, (x, z) => this.world.groundHeight(x, z));
        this.ragdolls.update(dt * 0.4, (x, z) => this.world.groundHeight(x, z), null);
        if (this.deathTimer > 0.8 && (inp.consume('Space') || inp.consume('Enter') || this.hud.startRequested)) {
          this.hud.startRequested = false;
          this.enterBase();
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

      if (this.state === 'dead') {
        this.deathTimer += dt;
        this.updateCamera(dt, true);
        this.fx.update(dt * 0.55, (x, z) => this.world.groundHeight(x, z));
        this.ragdolls.update(dt * 0.55, (x, z) => this.world.groundHeight(x, z), null);
        this.horde.update(dt * 0.35, this.car, this, this.world);
        if (this.deathTimer > 1.2 && !this.run.complete) this.endRun(false);
        return;
      }

      /* ---- playing ---- */
      if (this.car.hp <= 0) { this.die(); return; }

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
      this.updatePickups(dt);
      this.updateLoot(dt);
      this.updateSurvivors(dt);
      this.updateLandmarks(dt);
      this.allies.update(dt, this.car, this.horde, this);
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
    }

    updatePickups(dt) {
      const car = this.car;
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
      if (this.state === 'bunker') { this.bunker.draw(this.R); return; }
      const R = this.R;
      const car = this.car;
      R.time = this.time;
      R.beginFrame();

      this.world.eyeX = this.cam.x;
      this.world.eyeZ = this.cam.z;
      this.world.draw(R, car.x, car.z);
      this.ragdolls.draw(R, car.x, car.z);
      this.horde.draw(R, car.x, car.z);
      if (this.state !== 'dead') { car.draw(R); this.drawDriver(R); }
      this.weapons.draw(R, car, this);
      this.fx.draw(R);

      this.drawLandmarks(R);
      this.drawSurvivors(R);
      this.allies.draw(R, car.x, car.z);
      for (const o of this.loot) {
        const rr = BA.meta.RES.find((r2) => r2.id === o.res) || { color: '#fff' };
        const c = [
          parseInt(rr.color.slice(1, 3), 16) / 255,
          parseInt(rr.color.slice(3, 5), 16) / 255,
          parseInt(rr.color.slice(5, 7), 16) / 255,
        ];
        const p = 0.5 + Math.sin(o.t) * 0.08;
        R.push('box', 'opaque', o.x, o.y, o.z, o.t * 0.8, o.t * 0.5, o.t * 0.3, p, p, p, c[0], c[1], c[2], 0.55);
        R.push('sphere', 'glow', o.x, o.y, o.z, 0, 0, 0, p * 2.6, p * 2.6, p * 2.6, c[0] * 0.22, c[1] * 0.22, c[2] * 0.22, 1);
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

    /* the person actually doing the driving */
    drawDriver(R) {
      const car = this.car;
      if (!this.driverPose) this.driverPose = BA.actor.newPose();
      const steer = clamp((this.input.steer || 0), -1, 1);
      const shake = clamp01(Math.abs(car.vr) / 12 + (car.grounded ? 0 : 0.4));
      BA.actor.drive(this.driverPose, shake, steer);
      // sit them in the cab, riding the body's pitch and roll
      const fx_ = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
      const off = -0.25, side = -0.34;
      BA.actor.draw(R, {
        x: car.x + fx_ * off + rx * side,
        y: car.y + 1.42 + Math.sin(car.pitchVis) * 0.2,
        z: car.z + fz * off + rz * side,
        yaw: car.yaw, scale: 0.92, pose: this.driverPose,
        skin: [0.80, 0.60, 0.46], shirt: [0.55, 0.16, 0.12], pants: [0.20, 0.22, 0.28],
        hair: [0.16, 0.12, 0.09], gear: [0.42, 0.40, 0.38],
        gloves: true, helmet: true, shadow: false,
      });
    }

    drawSurvivors(R) {
      for (const sv of this.survivors) {
        const bob = Math.abs(Math.sin(sv.t)) * 0.12;
        const wave = Math.sin(sv.t * 2.2) * 0.7;
        const y = 0;
        R.push('box', 'opaque', sv.x, y + 1.05 + bob, sv.z, 0, 0, 0, 0.66, 0.9, 0.44, sv.shirt[0], sv.shirt[1], sv.shirt[2], 0);
        R.push('box', 'opaque', sv.x, y + 1.66 + bob, sv.z, 0, 0, 0, 0.48, 0.48, 0.46, sv.skin[0], sv.skin[1], sv.skin[2], 0);
        R.push('box', 'opaque', sv.x - 0.42, y + 1.5 + bob, sv.z, 0, wave, 0, 0.2, 0.75, 0.2, sv.skin[0], sv.skin[1], sv.skin[2], 0);
        R.push('box', 'opaque', sv.x + 0.42, y + 1.5 + bob, sv.z, 0, -wave, 0, 0.2, 0.75, 0.2, sv.skin[0], sv.skin[1], sv.skin[2], 0);
        for (const side of [-1, 1]) {
          R.push('box', 'opaque', sv.x + side * 0.2, y + 0.42, sv.z, 0, 0, 0, 0.24, 0.85, 0.24, 0.2, 0.2, 0.26, 0);
        }
        // signal flare so you can find them at speed
        const f = 0.7 + Math.sin(sv.t * 6) * 0.3;
        R.push('cone', 'glow', sv.x + 0.6, y + 2.6 + bob, sv.z, 0, Math.PI, 0, 1.2 * f, 2.2 * f, 1.2 * f, 1.4 * f, 0.5 * f, 0.15, 1);
        R.push('cyl', 'glow', sv.x, 14, sv.z, 0, 0, 0, 0.7, 28, 0.7, 0.10 * f, 0.34 * f, 0.62 * f, 1);
        R.push('ring', 'glow', sv.x, 0.08, sv.z, 0, 0, 0, 9, 1.2, 9, 0.2 * f, 0.45 * f, 0.7 * f, 1);
        R.shadow(sv.x, sv.z, 1.1, 0.45);
      }
    }

    drawLandmarks(R) {
      const r = this.run;
      if (!r) return;
      const t = this.time;
      const near = (z) => Math.abs(this.car.z - z) < 260;

      if (near(r.garageZ) && !r.garageUsed) {
        const gz = r.garageZ;
        for (const side of [-1, 1]) {
          R.push('box', 'opaque', side * 12, 3.0, gz, 0, 0, 0, 3.0, 6.0, 12.0, 0.34, 0.18, 0.16, 0);
        }
        R.push('box', 'opaque', 0, 6.4, gz, 0, 0, 0, 27, 1.2, 13, 0.26, 0.14, 0.13, 0);
        R.push('box', 'opaque', 0, 7.6, gz - 6.6, 0, 0, 0, 20, 1.8, 0.6, 0.9, 0.72, 0.1, 0.55);
        for (let i = 0; i < 5; i++) {
          R.push('box', 'glow', -8 + i * 4, 7.6, gz - 6.9, 0, 0, 0, 2.6, 0.9, 0.2,
            1.2, 0.9, 0.2, 1);
        }
        R.push('disc', 'glow', 0, 0.07, gz, 0, 0, 0, 26, 1, 26, 0.14, 0.09, 0.02, 1);
        R.push('ring', 'glow', 0, 0.1, gz, 0, 0, 0, 26 + Math.sin(t * 2) * 2, 1.4, 26, 0.5, 0.35, 0.06, 1);
        for (let i = 0; i < 4; i++) {
          R.push('cone', 'opaque', -9 + i * 6, 0.9, gz + 7, 0, 0, 0, 1.6, 1.8, 1.6, 0.9, 0.4, 0.06, 0.2);
        }
      }

      if (near(r.exitZ + 40)) this.drawEndBuilding(R, r.exitZ + 46);
      if (near(r.exitZ)) {
        const ez = r.exitZ;
        const open = this.objectivesDone();
        const c = open ? [0.2, 1.0, 0.35] : [1.0, 0.2, 0.15];
        for (const side of [-1, 1]) {
          R.push('box', 'opaque', side * 18, 5.0, ez, 0, 0, 0, 4.0, 10.0, 4.0, 0.3, 0.29, 0.32, 0);
          R.push('box', 'opaque', side * 18, 10.4, ez, 0, 0, 0, 5.0, 1.2, 5.0, 0.22, 0.21, 0.24, 0);
        }
        R.push('box', 'opaque', 0, 10.6, ez, 0, 0, 0, 40, 1.6, 2.0, 0.26, 0.25, 0.28, 0);
        R.push('box', 'glow', 0, 10.6, ez - 1.2, 0, 0, 0, 34, 1.0, 0.3, c[0], c[1], c[2], 1);
        if (!open) {
          for (let i = 0; i < 6; i++) {
            R.push('box', 'opaque', -15 + i * 6, 3.0, ez, 0, 0, 0, 1.0, 6.0, 1.0, 0.35, 0.34, 0.36, 0);
          }
        }
        const pulse = 0.6 + Math.sin(t * 3) * 0.4;
        R.push('disc', 'glow', 0, 0.07, ez, 0, 0, 0, 34, 1, 34, c[0] * 0.09 * pulse, c[1] * 0.09 * pulse, c[2] * 0.09 * pulse, 1);
        R.push('ring', 'glow', 0, 0.1, ez, 0, 0, 0, 36, 1.6, 36, c[0] * pulse, c[1] * pulse, c[2] * pulse, 1);
      }
    }

    /* the thing you drove all this way to loot */
    drawEndBuilding(R, ez) {
      const kind = this.stage.landmark;
      const B = (x, y, z, sx, sy, sz, r, g, b, e, yaw) =>
        R.push('box', 'opaque', x, y, z, yaw || 0, 0, 0, sx, sy, sz, r, g, b, e || 0);
      const t = this.time;

      if (kind === 'supermarket' || kind === 'mall') {
        const big = kind === 'mall';
        const w = big ? 96 : 62, d = big ? 46 : 30, h = big ? 15 : 10;
        B(0, h / 2, ez + d / 2, w, h, d, 0.60, 0.58, 0.55);
        B(0, h + 0.7, ez + d / 2, w + 3, 1.4, d + 3, 0.34, 0.33, 0.32);
        // glazed shopfront
        B(0, h * 0.34, ez + 0.3, w * 0.78, h * 0.5, 0.6, 0.10, 0.17, 0.22);
        for (let i = 0; i < 7; i++) {
          B(-w * 0.36 + i * (w * 0.12), h * 0.34, ez + 0.1, 0.7, h * 0.55, 0.7, 0.42, 0.41, 0.40);
        }
        // entrance canopy
        B(0, h * 0.62, ez - 3.2, w * 0.4, 0.9, 7.0, 0.30, 0.30, 0.32);
        for (const sx of [-1, 1]) B(sx * w * 0.17, h * 0.31, ez - 6.4, 0.8, h * 0.62, 0.8, 0.34, 0.33, 0.35);
        // fascia sign
        const sc = big ? [1.0, 0.72, 0.12] : [0.20, 0.62, 1.0];
        B(0, h * 0.82, ez - 0.4, w * 0.56, 3.2, 0.6, sc[0], sc[1], sc[2], 0.9);
        for (let i = 0; i < 8; i++) {
          const f = 0.6 + Math.sin(t * 4 + i) * 0.4;
          B(-w * 0.24 + i * (w * 0.068), h * 0.82, ez - 0.9, w * 0.045, 1.9, 0.3, 1.2 * f, 1.1 * f, 0.9 * f, 1);
        }
        // rooftop plant
        for (let i = 0; i < (big ? 6 : 3); i++) {
          B(-w * 0.3 + i * (w * 0.12), h + 2.4, ez + d * 0.6, 5.0, 2.6, 5.0, 0.40, 0.39, 0.41);
        }
        // trolley bays out front
        for (let i = 0; i < 5; i++) {
          B(-18 + i * 9, 0.9, ez - 12, 1.2, 1.6, 5.0, 0.5, 0.52, 0.56);
        }
        R.shadow(0, ez + d / 2, w * 0.5, 0.55);
      } else if (kind === 'ranger') {
        B(0, 3.4, ez + 8, 22, 6.6, 16, 0.40, 0.28, 0.17);
        B(0, 7.4, ez + 8, 25, 1.6, 19, 0.24, 0.17, 0.11);
        B(0, 9.0, ez + 8, 14, 2.0, 11, 0.28, 0.20, 0.13);
        B(0, 1.6, ez - 0.4, 4.0, 3.2, 0.5, 0.16, 0.12, 0.09);
        for (const sx of [-1, 1]) {
          B(sx * 8, 1.7, ez - 1.0, 0.7, 3.4, 0.7, 0.34, 0.24, 0.15);
          B(sx * 13, 5.0, ez + 8, 1.0, 10, 1.0, 0.30, 0.22, 0.14);
        }
        B(0, 4.2, ez - 1.2, 20, 0.6, 3.4, 0.26, 0.19, 0.12);
        B(0, 5.4, ez - 0.6, 9, 1.6, 0.4, 0.16, 0.42, 0.20, 0.7);
        for (let i = 0; i < 6; i++) {
          const a = i * 1.6;
          R.push('cone', 'opaque', Math.cos(a) * 26, 6, ez + 6 + Math.sin(a) * 20, a, 0, 0, 8, 14, 8, 0.10, 0.26, 0.11, 0);
        }
        R.shadow(0, ez + 8, 14, 0.55);
      } else {
        // fuel depot: tank farm behind a gantry
        for (let i = 0; i < 4; i++) {
          const x = -21 + i * 14;
          R.push('cyl', 'opaque', x, 6, ez + 14, 0, 0, 0, 12, 12, 12, 0.46, 0.45, 0.42, 0);
          R.push('cyl', 'opaque', x, 12.3, ez + 14, 0, 0, 0, 12.6, 0.8, 12.6, 0.30, 0.29, 0.27, 0);
          B(x, 8, ez + 8.2, 10, 1.2, 0.5, 0.85, 0.45, 0.08, 0.35);
        }
        B(0, 8, ez + 2, 62, 1.2, 1.2, 0.34, 0.33, 0.35);
        for (const sx of [-1, 1]) B(sx * 26, 4, ez + 2, 1.4, 8, 1.4, 0.36, 0.35, 0.37);
        R.shadow(0, ez + 14, 30, 0.5);
      }
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

      const intensity = this.state === 'bunker' ? 0.12
        : clamp01(this.horde.count / 130 + this.car.speed01 * 0.25 + (this.bossAlive ? 0.3 : 0));
      this.audio.updateMusic(realDt, intensity, this.state !== 'title');
      this.touch.update(realDt, this);
      this.hud.update(this, realDt);
    }
  }

  BA.Game = Game;
})();
