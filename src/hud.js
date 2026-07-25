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
        hud: $('hud'), xp: $('xpbar'), lvl: $('lvlnum'),
        hp: $('hpbar'), hpGhost: $('hpghost'), hpText: $('hptext'),
        clock: $('clock'), kills: $('killn'), speed: $('stSpeed'),
        scrap: $('stScrap'), score: $('stScore'),
        combo: $('combo'), comboN: $('combon'),
        weapons: $('weapons'), boost: $('boostbar'), boostLbl: $('boostlbl'),
        bossWrap: $('bosswrap'), bossBar: $('bossbar'),
        banner: $('banner'), bannerT: $('bannerT'), bannerS: $('bannerS'),
        toast: $('toast'), cards: $('cards'), luLevel: $('luLevel'),
        fuelWrap: $('fuelwrap'), fuelBar: $('fuelbar'), fuelLbl: $('fuellbl'),
        screens: {
          title: $('scTitle'), levelup: $('scLevel'),
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

    showLevelUp(choices, level, onPick) {
      this.el.luLevel.textContent = level;
      const wrap = this.el.cards;
      wrap.innerHTML = '';
      const game = window.GAME;
      choices.forEach((u, i) => {
        const lv = BA.upgrades.levelOf(game, u);
        const card = document.createElement('div');
        card.className = 'card';
        card.style.setProperty('--c', u.color);
        card.tabIndex = 0;
        const isNew = lv === 0 && u.id !== 'repair';
        card.innerHTML =
          `<div class="num">${i + 1}</div>` +
          (isNew ? `<div class="tag">NEW</div>` : (u.id !== 'repair' ? `<div class="tag">LV ${lv + 1}</div>` : '')) +
          `<div class="cic">${BA.icons.img(u.icon, 56)}</div>` +
          `<div class="cnm">${u.name}</div>` +
          `<div class="clv">${u.id === 'repair' ? 'EMERGENCY' : (isNew ? (game.weaponLevels[u.id] !== undefined ? 'NEW WEAPON' : 'NEW PERK') : 'UPGRADE')}</div>` +
          `<div class="cds">${u.desc(lv)}</div>`;
        card.addEventListener('click', () => onPick(u));
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter') onPick(u); });
        wrap.appendChild(card);
      });
      this.setScreen('levelup');
    }

    showGameOver(game) {
      $('ovScore').textContent = game.score.toLocaleString();
      $('ovKills').textContent = game.kills.toLocaleString();
      $('ovTime').textContent = fmtTime(game.time);
      $('ovLevel').textContent = game.level;
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
      this.el.xp.style.width = clamp01(game.xp / game.xpNext) * 100 + '%';
      this.el.lvl.textContent = game.level;
      this.el.clock.textContent = fmtTime(game.time);
      this.el.kills.textContent = game.kills.toLocaleString();
      this.el.speed.textContent = Math.round(Math.abs(car.vf) * 3.6 * 1.6) + ' KM/H';
      this.el.scrap.textContent = Math.floor(game.xp) + '/' + game.xpNext + ' SCRAP';
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
      const key = Object.entries(game.weaponLevels).map(([k, v]) => k + v).join('') +
        Object.entries(game.passiveLevels).map(([k, v]) => k + v).join('');
      if (key !== this.chipCache) {
        this.chipCache = key;
        const parts = [];
        for (const w of BA.upgrades.WEAPONS) {
          const l = game.weaponLevels[w.id] || 0;
          if (!l) continue;
          parts.push(chip(w, l));
        }
        for (const p of BA.upgrades.PASSIVES) {
          const l = game.passiveLevels[p.id] || 0;
          if (!l) continue;
          parts.push(chip(p, l));
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
