/* BADASS APOCALYPSE - DOM HUD */
(function () {
  'use strict';
  const { clamp, clamp01, lerp } = BA;

  const $ = (id) => document.getElementById(id);

  function fmtTime(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  class Hud {
    constructor() {
      this.el = {
        hud: $('hud'),
        hp: $('hpbar'), hpGhost: $('hpghost'), hpText: $('hptext'),
        clock: $('clock'), kills: $('killn'), speed: $('stSpeed'),
        scrap: $('stScrap'), score: $('stScore'),
        combo: $('combo'), comboN: $('combon'),
        weapons: $('weapons'), boost: $('boostbar'), boostLbl: $('boostlbl'),
        bossWrap: $('bosswrap'), bossBar: $('bossbar'),
        banner: $('banner'), bannerT: $('bannerT'), bannerS: $('bannerS'),
        toast: $('toast'),
        fuelWrap: $('fuelwrap'), fuelBar: $('fuelbar'), fuelLbl: $('fuellbl'),
        obj: $('objectives'), haul: $('haulbar'),
        distFill: $('distfill'), distGar: $('distgar'), distTxt: $('disttxt'),
        screens: {
          title: $('scTitle'),
          pause: $('scPause'), over: $('scOver'),
        },
      };
      this.startRequested = false;
      this.current = 'title';
      this.toastT = 0;
      this.chipCache = '';

      const req = () => { this.startRequested = true; };
      $('scTitle').addEventListener('click', req);
      $('againBtn').addEventListener('click', (e) => { e.stopPropagation(); req(); });
      $('scOver').addEventListener('click', req);
    }

    setScreen(name) {
      for (const k in this.el.screens) this.el.screens[k].classList.toggle('on', k === name);
      this.el.hud.classList.toggle('on', name === null || name === 'pause');
      this.current = name;
    }

    flashBanner(title, sub) {
      const b = this.el.banner;
      this.el.bannerT.textContent = title;
      this.el.bannerS.textContent = sub || '';
      b.classList.remove('go');
      void b.offsetWidth;
      b.classList.add('go');
    }

    toast(msg) {
      this.el.toast.textContent = msg;
      this.el.toast.style.opacity = '1';
      this.toastT = 1.4;
    }

    showResults(game, success, gained, people) {
      const M = BA.meta;
      $('overT').textContent = success ? 'EXTRACTED' : 'WASTED';
      $('overT').style.color = success ? '#8dff3a' : '#fff';
      $('ovScore').textContent = game.score.toLocaleString();
      $('ovKills').textContent = game.kills.toLocaleString();
      $('ovTime').textContent = fmtTime(game.time);
      $('ovLevel').textContent = game.meta.deepestFloor() + 1;
      $('ovCombo').textContent = game.bestCombo;
      const haulTxt = M.RES.filter((r) => gained[r.id]).map((r) =>
        `<div class="hgain">${BA.icons.img(r.icon, 26)}<b style="color:${r.color}">+${gained[r.id]}</b></div>`).join('');
      $('newbest').innerHTML =
        `<div class="hauline">${people > 0 ? `<div class="hgain">${BA.icons.img('res_people', 26)}<b style="color:#7fd4ff">+${people}</b></div>` : ''}${haulTxt || '<span style="opacity:.6">NOTHING HAULED BACK</span>'}</div>` +
        (success ? '' : '<div class="lostwarn">HALF THE HAUL AND EVERY PASSENGER LOST</div>') +
        (game.meta.roster.length >= game.meta.housing
          ? '<div class="lostwarn" style="color:#ffd23a">NO SPARE BUNKS - EXPAND CREW QUARTERS OR NEW ARRIVALS TURN AWAY</div>' : '');
      $('againBtn').textContent = 'RETURN TO THE BUNKER';
      setTimeout(() => this.setScreen('over'), success ? 500 : 900);
    }

    showGameOver(game) {
      $('ovScore').textContent = game.score.toLocaleString();
      $('ovKills').textContent = game.kills.toLocaleString();
      $('ovTime').textContent = fmtTime(game.time);
      $('ovLevel').textContent = game.meta.deepestFloor() + 1;
      $('ovCombo').textContent = game.bestCombo;
      $('newbest').textContent = game.score >= game.best && game.score > 0 ? 'NEW PERSONAL BEST!' : `BEST: ${game.best.toLocaleString()}`;
      setTimeout(() => this.setScreen('over'), 900);
    }

    update(game, dt) {
      if (this.toastT > 0) {
        this.toastT -= dt;
        if (this.toastT <= 0) this.el.toast.style.opacity = '0';
      }
      if (game.state === 'title') return;

      const car = game.car;
      const hp01 = clamp01(car.hp / car.maxHp) * 100;
      this.el.hp.style.width = hp01 + '%';
      this.el.hpGhost.style.width = hp01 + '%';
      this.el.hpText.textContent = `${Math.max(0, Math.ceil(car.hp))} / ${car.maxHp}`;
      this.el.clock.textContent = fmtTime(game.time);
      this.el.kills.textContent = game.kills.toLocaleString();
      this.el.speed.textContent = Math.round(Math.abs(car.vf) * 3.6 * 1.6) + ' KM/H';
      this.el.scrap.textContent = Math.floor(game.run ? (game.run.haul.scrap || 0) : 0) + ' SCRAP';
      this.el.score.textContent = game.score.toLocaleString() + ' PTS';

      const showCombo = game.combo >= 3;
      this.el.combo.classList.toggle('on', showCombo);
      if (showCombo) this.el.comboN.textContent = 'x' + game.combo;

      // drift charge / boost meter
      let pct = 0, lbl = 'DRIFT CHARGE', col = '#39d0ff';
      if (car.boostTime > 0) {
        pct = clamp01(car.boostTime / 1.5) * 100;
        lbl = 'TURBO!';
        col = ['#5ec8ff', '#ffa63a', '#d07bff'][car.boostStage] || '#39d0ff';
      } else if (car.drifting) {
        const stages = BA.CarConst.DRIFT_STAGES;
        pct = clamp01(car.driftCharge / stages[2]) * 100;
        col = car.driftStage >= 2 ? '#d07bff' : car.driftStage >= 1 ? '#ffa63a' : car.driftStage >= 0 ? '#5ec8ff' : '#88919c';
        lbl = car.driftStage >= 0 ? ['BLUE SPARK', 'ORANGE SPARK', 'PURPLE SPARK'][car.driftStage] : 'DRIFTING...';
      }
      this.el.boost.style.width = pct + '%';
      this.el.boost.style.background = col;
      this.el.boostLbl.textContent = lbl;
      this.el.boostLbl.style.color = col;

      // objectives, haul and distance
      const r = game.run;
      if (r) {
        const done = (ok) => ok ? 'done' : '';
        const objHtml =
          `<div class="obj ${done(r.aboard >= r.rescueNeed)}">
             <i>${r.aboard >= r.rescueNeed ? '✔' : '●'}</i> RESCUE <b>${r.aboard}/${r.rescueNeed}</b></div>
           <div class="obj ${done(r.waveIdx >= r.waveNeed)}">
             <i>${r.waveIdx >= r.waveNeed ? '✔' : '●'}</i> CLEAR WAVES <b>${r.waveIdx}/${r.waveNeed}</b>
             ${r.waveIdx < r.waveNeed ? `<em>${r.waveKills}/${r.waveKillNeed}</em>` : ''}</div>
           <div class="obj ${done(game.objectivesDone())}">
             <i>${game.objectivesDone() ? '▶' : '✖'}</i> EXTRACT NORTH</div>`;
        if (objHtml !== this.objCache) { this.objCache = objHtml; this.el.obj.innerHTML = objHtml; }

        const haulHtml = BA.meta.RES.filter((x) => r.haul[x.id]).map((x) =>
          `<div class="hchip">${BA.icons.img(x.icon, 18)}<b style="color:${x.color}">${r.haul[x.id]}</b></div>`).join('')
          + `<div class="hchip">${BA.icons.img('res_people', 18)}<b style="color:#7fd4ff">${r.aboard}/${r.cargo}</b></div>`;
        if (haulHtml !== this.haulCache) { this.haulCache = haulHtml; this.el.haul.innerHTML = haulHtml; }

        const prog = clamp01(car.z / r.exitZ) * 100;
        this.el.distFill.style.width = prog + '%';
        this.el.distGar.style.left = (r.garageZ / r.exitZ * 100) + '%';
        this.el.distGar.classList.toggle('used', r.garageUsed);
        this.el.distTxt.textContent = Math.max(0, Math.round(r.exitZ - car.z)) + 'm TO EXTRACTION';
      }

      // gas / nitrous
      const fuel01 = clamp01(car.fuel / car.maxFuel);
      this.el.fuelBar.style.width = fuel01 * 100 + '%';
      this.el.fuelWrap.classList.toggle('low', fuel01 < 0.25);
      this.el.fuelLbl.textContent = car.nitroActive ? 'NITROUS!' : (fuel01 < 0.25 ? 'LOW GAS' : 'GAS');
      this.el.fuelLbl.style.color = car.nitroActive ? '#9fe8ff' : (fuel01 < 0.25 ? '#ff6b5e' : '#ffce8a');

      // boss bar
      const boss = game.bossAlive;
      this.el.bossWrap.classList.toggle('on', !!(boss && !boss.dead));
      if (boss && !boss.dead) this.el.bossBar.style.width = clamp01(boss.hp / boss.maxHp) * 100 + '%';

      // weapon chips
      const M2 = BA.meta;
      const key = Object.entries(game.weaponLevels).map(([k, v]) => k + v).join('|');
      if (key !== this.chipCache) {
        this.chipCache = key;
        const parts = [];
        for (const c of M2.WEAPON_COMPONENTS) {
          const l = game.weaponLevels[c.w] || 0;
          if (!l) continue;
          parts.push(chip(c, l));
        }
        for (const c of M2.PERK_COMPONENTS) {
          const l = game.meta.compLevel(c.id);
          if (!l) continue;
          parts.push(chip(c, l));
        }
        this.el.weapons.innerHTML = parts.join('');
      }
    }
  }

  function chip(u, l) {
    let pips = '';
    for (let i = 0; i < u.max; i++) pips += `<div class="pip${i < l ? ' f' : ''}"></div>`;
    return `<div class="wchip" title="${u.name}"><div class="ic">${BA.icons.img(u.icon, 26)}</div><div class="pips">${pips}</div></div>`;
  }

  BA.Hud = Hud;
})();
