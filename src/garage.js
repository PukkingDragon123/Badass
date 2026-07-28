/* BADASS APOCALYPSE - the workbench screens.
   One shop, three faces: the GARAGE fits chassis hardware, the ARMORY builds
   weapons, the LAB spends research on perks. Opened from the matching bunker
   room, or from the roadside workshop halfway up a run. */
(function () {
  'use strict';
  const M = BA.meta;

  const FACES = {
    bunker: {
      title: 'GARAGE', sub: 'BOLT ON WHAT YOU HAULED HOME',
      filter: (c) => (!c.weapon && !c.perk) || c.chassis, color: '#ff4d4d',
    },
    armory: {
      title: 'ARMORY', sub: 'BUILD AND UPGRADE THE GUNS',
      filter: (c) => !!c.weapon && !c.chassis, color: '#ff6b6b',
    },
    lab: {
      title: 'RESEARCH LAB', sub: 'SPEND TECH ON THINGS NOBODY ELSE HAS',
      filter: (c) => !!c.perk, color: '#d47bff',
    },
    road: {
      title: 'ROADSIDE WORKSHOP', sub: 'SPEND IT BEFORE YOU LOSE IT',
      filter: (c) => !c.perk, color: '#ffd23a',
    },
  };

  class Garage {
    constructor(game) {
      this.game = game;
      this.meta = game.meta;
      this.origin = 'bunker';
      this.built = false;
    }

    ensureUI() {
      if (this.built) return;
      this.built = true;
      const root = document.createElement('div');
      root.id = 'garagescreen';
      root.innerHTML = `
        <div class="gwrap">
          <div class="ghead">
            <div>
              <div class="gtitle" id="gTitle">GARAGE</div>
              <div class="gsub" id="gSub"></div>
            </div>
            <div id="gRes"></div>
          </div>
          <div id="gList"></div>
          <div class="gfoot">
            <div id="gHint"></div>
            <div class="bbtn go" id="gClose">DONE</div>
          </div>
        </div>`;
      document.getElementById('ui').appendChild(root);
      this.root = root;
      root.querySelector('#gClose').addEventListener('click', () => this.close());
    }

    open(origin) {
      this.ensureUI();
      this.origin = origin || 'bunker';
      const face = FACES[this.origin] || FACES.bunker;
      this.root.classList.add('on');
      this.root.querySelector('#gTitle').textContent = face.title;
      this.root.querySelector('#gTitle').style.color = face.color;
      this.root.querySelector('#gSub').textContent = face.sub;
      this.game.audio.ui();
      this.refresh();
    }

    close() {
      if (this.root) this.root.classList.remove('on');
      this.game.audio.ui();
      if (this.origin === 'road') this.game.resumeFromGarage();
    }

    get isOpen() { return !!(this.root && this.root.classList.contains('on')); }

    /* only show resources this face actually spends, plus the raw staples */
    refresh() {
      const meta = this.meta;
      const face = FACES[this.origin] || FACES.bunker;
      const list = M.COMPONENTS.filter(face.filter);

      const relevant = new Set();
      for (const c of list) {
        const cost = c.cost(Math.min(meta.compLevel(c.id), c.max - 1));
        for (const k in cost) relevant.add(k);
      }
      this.root.querySelector('#gRes').innerHTML = M.RES
        .filter((r) => relevant.has(r.id))
        .map((r) => `<div class="rchip small">${BA.icons.img(r.icon, 20)}<b style="color:${r.color}">${Math.floor(meta.res[r.id] || 0)}</b></div>`)
        .join('');

      const hint = this.root.querySelector('#gHint');
      if (this.origin === 'armory') {
        const T = meta.truckStats();
        hint.innerHTML = `<b>${T.hardpoints}</b> HARDPOINT${T.hardpoints > 1 ? 'S' : ''} · only your best ${T.hardpoints} gun${T.hardpoints > 1 ? 's' : ''} deploy. Fit a WEAPON MOUNT in the garage for more.`;
      } else if (this.origin === 'lab') {
        hint.innerHTML = `LAB LEVEL <b>${meta.roomLevel('lab')}</b> · upgrade the lab room to unlock deeper research.`;
      } else {
        hint.innerHTML = '';
      }

      this.root.querySelector('#gList').innerHTML = list.map((c) => {
        const lv = meta.compLevel(c.id);
        const cost = meta.compCost(c.id);
        const maxed = lv >= c.max;
        const locked = meta.compLocked(c.id);
        const afford = !locked && cost && meta.can(cost);
        let pips = '';
        for (let i = 0; i < c.max; i++) {
          pips += `<div class="gpip${i < lv ? ' f' : ''}" style="${i < lv ? `background:${c.color};box-shadow:0 0 6px ${c.color}` : ''}"></div>`;
        }
        const costTxt = maxed ? 'MAXED' : Object.entries(cost).map(([k, v]) => {
          const rr = M.RESBY[k];
          return `<span class="${(meta.res[k] || 0) >= v ? '' : 'bad'}">${v} <i style="color:${rr ? rr.color : '#fff'}">${rr ? rr.name : k}</i></span>`;
        }).join(' · ');
        return `<div class="gcard${maxed ? ' maxed' : ''}${afford ? '' : ' poor'}${locked ? ' locked' : ''}" data-c="${c.id}" style="--c:${c.color}">
          <div class="gicon">${BA.icons.img(c.icon, 44)}</div>
          <div class="gbody">
            <div class="gname" style="color:${c.color}">${c.name}${locked ? ` <em class="lock">${locked}</em>` : ''}</div>
            <div class="gpips">${pips}</div>
            <div class="gdesc">${c.desc}</div>
            <div class="geff">${lv === 0 ? '<span class="dim">NOT FITTED</span>' : c.effect(lv)}
              ${maxed ? '' : `<span class="next">→ ${c.effect(lv + 1)}</span>`}</div>
          </div>
          <div class="gbuy">
            <div class="gcost">${costTxt}</div>
            ${maxed || locked ? '' : '<div class="bbtn go small buy">INSTALL</div>'}
          </div>
        </div>`;
      }).join('');

      for (const card of this.root.querySelectorAll('.gcard')) {
        const btn = card.querySelector('.buy');
        if (!btn) continue;
        btn.addEventListener('click', () => this.buy(card.dataset.c));
      }
    }

    buy(id) {
      const g = this.game;
      if (!this.meta.buyComponent(id)) {
        g.audio.hurt();
        const cost = this.meta.compCost(id);
        if (cost) {
          const missing = this.meta.missing(cost).map((k) => M.RESBY[k].name).join(', ');
          if (missing) g.hud.toast('NOT ENOUGH ' + missing);
        }
        return;
      }
      g.audio.levelUp();
      g.applyComponents();
      if (id === 'hydraulics' && this.meta.compLevel(id) === 1) {
        g.hud.flashBanner('JUMP UNLOCKED', 'SPACE TO LEAP, AGAIN TO SLAM');
      }
      if (id === 'nos' && this.meta.compLevel(id) === 1) {
        g.hud.flashBanner('NITROUS UNLOCKED', 'HOLD X TO BURN GAS FOR SPEED');
      }
      // In the bunker you watch it happen: the driver gets out and fits it.
      if (g.state === 'bunker' && g.bunker.playFix(id)) {
        this.root.classList.remove('on');
        g.bunker.reopenGarage = true;
        g.bunker.reopenFace = this.origin;
        return;
      }
      this.refresh();
    }
  }

  BA.Garage = Garage;
})();
