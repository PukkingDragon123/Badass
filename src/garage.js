/* BADASS APOCALYPSE - the garage: bolt components onto the truck.
   Opened from the settlement, or by parking in a roadside garage mid-run. */
(function () {
  'use strict';
  const M = BA.meta;

  class Garage {
    constructor(game) {
      this.game = game;
      this.meta = game.meta;
      this.origin = 'base';
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
              <div class="gtitle">GARAGE</div>
              <div class="gsub" id="gSub">BOLT ON WHAT YOU CAN AFFORD</div>
            </div>
            <div id="gRes"></div>
          </div>
          <div id="gList"></div>
          <div class="gfoot">
            <div class="bbtn go" id="gClose">DONE</div>
          </div>
        </div>`;
      document.getElementById('ui').appendChild(root);
      this.root = root;
      root.querySelector('#gClose').addEventListener('click', () => this.close());
    }

    open(origin) {
      this.ensureUI();
      this.origin = origin || 'base';
      this.root.classList.add('on');
      this.root.querySelector('#gSub').textContent = this.origin === 'road'
        ? 'ROADSIDE WORKSHOP · SPEND IT BEFORE YOU LOSE IT'
        : 'BOLT ON WHAT YOU CAN AFFORD';
      this.game.audio.ui();
      this.refresh();
    }

    close() {
      if (this.root) this.root.classList.remove('on');
      this.game.audio.ui();
      if (this.origin === 'road') this.game.resumeFromGarage();
    }

    get isOpen() { return !!(this.root && this.root.classList.contains('on')); }

    refresh() {
      const meta = this.meta;
      this.root.querySelector('#gRes').innerHTML = M.RES.filter((r) => r.id !== 'people').map((r) =>
        `<div class="rchip small">${BA.icons.img(r.icon, 20)}<b style="color:${r.color}">${Math.floor(meta.res[r.id] || 0)}</b></div>`
      ).join('');

      this.root.querySelector('#gList').innerHTML = M.COMPONENTS.map((c) => {
        const lv = meta.compLevel(c.id);
        const cost = meta.compCost(c.id);
        const maxed = lv >= c.max;
        const afford = cost && meta.can(cost);
        let pips = '';
        for (let i = 0; i < c.max; i++) pips += `<div class="gpip${i < lv ? ' f' : ''}" style="${i < lv ? `background:${c.color};box-shadow:0 0 6px ${c.color}` : ''}"></div>`;
        const costTxt = maxed ? 'MAXED' : Object.entries(cost).map(([k, v]) => {
          const rr = M.RES.find((r) => r.id === k);
          return `<span class="${(meta.res[k] || 0) >= v ? '' : 'bad'}">${v} <i style="color:${rr ? rr.color : '#fff'}">${rr ? rr.name : k}</i></span>`;
        }).join(' · ');
        const locked = c.id === 'hydraulics' && lv === 0;
        return `<div class="gcard${maxed ? ' maxed' : ''}${afford ? '' : ' poor'}" data-c="${c.id}" style="--c:${c.color}">
          <div class="gicon">${BA.icons.img(c.icon, 44)}</div>
          <div class="gbody">
            <div class="gname" style="color:${c.color}">${c.name}${locked ? ' <em class="lock">LOCKED</em>' : ''}</div>
            <div class="gpips">${pips}</div>
            <div class="gdesc">${c.desc}</div>
            <div class="geff">${lv === 0 ? '<span class="dim">NOT FITTED</span>' : c.effect(lv)}
              ${maxed ? '' : `<span class="next">→ ${c.effect(lv + 1)}</span>`}</div>
          </div>
          <div class="gbuy">
            <div class="gcost">${costTxt}</div>
            ${maxed ? '' : `<div class="bbtn go small buy">INSTALL</div>`}
          </div>
        </div>`;
      }).join('');

      for (const card of this.root.querySelectorAll('.gcard')) {
        const btn = card.querySelector('.buy');
        if (!btn) continue;
        btn.addEventListener('click', () => {
          const id = card.dataset.c;
          if (this.meta.buyComponent(id)) {
            this.game.audio.levelUp();
            this.game.applyComponents();
            const c = M.COMP[id];
            if (id === 'hydraulics' && this.meta.compLevel(id) === 1) {
              this.game.hud.flashBanner('JUMP UNLOCKED', 'SPACE TO LEAP, AGAIN TO SLAM');
            }
          } else {
            this.game.audio.hurt();
          }
          this.refresh();
        });
      }
    }
  }

  BA.Garage = Garage;
})();
