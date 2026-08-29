/* BADASS APOCALYPSE - the bunker: a side-on cutaway you walk around in.
   Same WebGL renderer as the road, just a camera locked to one axis. Floors
   stack downwards, the stairwell runs up the left edge, and every room is a
   1-3 cell bay cut into the rock. */
(function () {
  'use strict';
  const { clamp, clamp01, lerp, damp, rand, hash01, TAU } = BA;
  const M = BA.meta;
  const A = BA.actor;

  const CW = 6.6;          // cell width
  const CH = 5.2;          // floor pitch
  const ROOM_H = 4.0;      // headroom inside a bay
  const SLAB = CH - ROOM_H;
  const DEPTH = 5.0;       // how deep the cutaway reads
  const WALK = 7.2;        // player metres/sec

  const floorY = (f) => -f * CH;
  const colX = (c) => c * CW;

  /* material palette */
  const P = {
    rock: [0.145, 0.112, 0.094],
    rockLit: [0.21, 0.163, 0.135],
    dirt: [0.15, 0.115, 0.095],
    slab: [0.30, 0.295, 0.30],
    slabDark: [0.19, 0.19, 0.20],
    wall: [0.175, 0.175, 0.205],
    wallDark: [0.11, 0.11, 0.13],
    steel: [0.44, 0.46, 0.50],
    rust: [0.42, 0.24, 0.15],
    pipe: [0.36, 0.33, 0.30],
    lamp: [1.30, 1.02, 0.58],
  };

  class Bunker {
    constructor(game) {
      this.game = game;
      this.meta = game.meta;
      this.built = false;
      this.px = colX(2);
      this.pf = 0;
      this.py = floorY(0);
      this.facing = 1;
      this.vx = 0;
      this.walkT = 0;
      this.climbT = 0;
      this.climbing = 0;
      this.pose = A.newPose();
      this.cam = { x: this.px, y: this.py + 2.4, zoom: 1 };
      this.time = 0;
      this.sel = null;          // { f, c } cursor for build/dig
      this.panel = null;
      this.villagers = [];
      this.prompt = '';
      this.fix = null;          // the climb-out-and-fix cinematic
      this.pendingFix = null;
    }

    /* --------------------------------------------------------------- UI */
    ensureUI() {
      if (this.built) return;
      this.built = true;
      const root = document.createElement('div');
      root.id = 'bunker';
      root.innerHTML = `
        <div id="bkTop">
          <div id="bkRes"></div>
          <div id="bkStat"></div>
        </div>
        <div id="bkPrompt"></div>
        <div id="bkPanel"></div>
        <div id="bkHelp">
          <b>A</b>/<b>D</b> WALK &nbsp; <b>W</b>/<b>S</b> STAIRS &nbsp; <b>E</b> USE &nbsp; <b>Q</b> DEPLOY
        </div>`;
      document.getElementById('ui').appendChild(root);
      this.root = root;
      this.elRes = root.querySelector('#bkRes');
      this.elStat = root.querySelector('#bkStat');
      this.elPrompt = root.querySelector('#bkPrompt');
      this.elPanel = root.querySelector('#bkPanel');
    }

    enter() {
      this.ensureUI();
      this.root.classList.add('on');
      this.game.R.drawGround = false;
      this.game.R.fog = [0.055, 0.042, 0.038];
      this.game.R.fogDensity = 0.011;
      this.game.R.groundMode = 0;
      this.syncVillagers();
      this.refreshTop();
      this.closePanel();
    }

    exit() {
      if (this.root) this.root.classList.remove('on');
      this.closePanel();
      this.game.R.drawGround = true;
    }

    refreshTop() {
      const m = this.meta;
      const rates = m.rates();
      const groups = [[], [], []];
      for (const r of M.RES) {
        if (r.crew) continue;
        const v = Math.floor(m.res[r.id] || 0);
        const rate = rates[r.id] || 0;
        const cls = rate > 0.05 ? 'up' : rate < -0.05 ? 'dn' : '';
        groups[r.tier].push(
          `<div class="bres ${cls}" title="${r.name}">${BA.icons.img(r.icon, 18)}` +
          `<b style="color:${r.color}">${v}</b>` +
          `<i>${rate > 0.05 ? '+' : ''}${Math.abs(rate) < 0.05 ? '' : rate.toFixed(1)}</i></div>`);
      }
      this.elRes.innerHTML = groups.map((g, i) =>
        `<div class="brow t${i}">${g.join('')}</div>`).join('');

      const pw = m.power;
      const short = pw.supply < pw.demand;
      this.elStat.innerHTML =
        `<div class="bstat${short ? ' bad' : ''}">POWER <b>${Math.round(pw.supply)}/${Math.round(pw.demand)}</b></div>` +
        `<div class="bstat">CREW <b>${m.roster.length}/${m.housing}</b></div>` +
        `<div class="bstat">IDLE <b>${m.idleWorkers}</b></div>` +
        `<div class="bstat">DEPTH <b>${m.deepestFloor() + 1}</b></div>`;
    }

    closePanel() {
      this.panel = null;
      this.deployOpen = false;
      if (this.elPanel) { this.elPanel.classList.remove('on'); this.elPanel.innerHTML = ''; }
    }

    /* -------------------------------------------------------- interaction */
    get col() { return clamp(Math.round(this.px / CW), 0, M.COLS - 1); }

    contextAt(f, c) {
      const m = this.meta;
      if (c === M.SHAFT) {
        const next = f + 1;
        if (m.canSinkShaft(next)) return { kind: 'shaft', f: next, cost: m.shaftCost(next) };
        return null;
      }
      const room = m.roomAt(f, c);
      if (room) return { kind: 'room', room };
      if (m.isDug(f, c)) return { kind: 'empty', f, c };
      if (m.canDig(f, c)) return { kind: 'rock', f, c, cost: m.digCost(f) };
      return null;
    }

    updatePrompt() {
      if (this.fix) { this.setPrompt(''); return; }
      const ctx = this.contextAt(this.pf, this.col);
      if (!ctx) { this.setPrompt(''); return; }
      const m = this.meta;
      if (ctx.kind === 'room') {
        const def = M.ROOM[ctx.room.id];
        this.setPrompt(`<b>E</b> ${def.name} <em>LV${ctx.room.level}</em>`);
      } else if (ctx.kind === 'empty') {
        this.setPrompt('<b>E</b> BUILD A ROOM HERE');
      } else if (ctx.kind === 'rock') {
        this.setPrompt(`<b>E</b> EXCAVATE ${this.costText(ctx.cost, m)}`);
      } else if (ctx.kind === 'shaft') {
        this.setPrompt(`<b>E</b> SINK THE STAIRS TO FLOOR ${ctx.f + 1} ${this.costText(ctx.cost, m)}`);
      }
    }

    setPrompt(html) {
      if (this.prompt === html) return;
      this.prompt = html;
      this.elPrompt.innerHTML = html;
      this.elPrompt.classList.toggle('on', !!html);
    }

    costText(cost, m) {
      return '<span class="bcost">' + Object.entries(cost).map(([k, v]) => {
        const r = M.RESBY[k];
        const ok = (m.res[k] || 0) >= v;
        return `<span class="${ok ? '' : 'bad'}">${v} <i style="color:${r.color}">${r.name}</i></span>`;
      }).join(' ') + '</span>';
    }

    interact() {
      if (this.fix) return;
      const ctx = this.contextAt(this.pf, this.col);
      if (!ctx) return;
      const m = this.meta;
      const g = this.game;
      if (ctx.kind === 'rock') {
        if (m.dig(ctx.f, ctx.c)) {
          g.audio.explode(0.35);
          g.fx.smoke(colX(ctx.c), floorY(ctx.f) + 1.6, 0, 16, 1.2, 0.3, 0.24, 0.2, 1.1);
          g.fx.shard(colX(ctx.c), floorY(ctx.f) + 1.6, 0, 18, 0.3, 0.24, 0.2);
          this.refreshTop();
        } else { g.audio.hurt(); this.flashCost(ctx.cost); }
      } else if (ctx.kind === 'shaft') {
        if (m.sinkShaft(ctx.f)) {
          g.audio.explode(0.4);
          g.fx.smoke(0, floorY(ctx.f) + 1.6, 0, 20, 1.4, 0.3, 0.24, 0.2, 1.2);
          this.refreshTop();
        } else { g.audio.hurt(); this.flashCost(ctx.cost); }
      } else if (ctx.kind === 'empty') {
        this.openBuildMenu(ctx.f, ctx.c);
      } else if (ctx.kind === 'room') {
        this.openRoomPanel(ctx.room);
      }
    }

    flashCost(cost) {
      const missing = this.meta.missing(cost).map((k) => M.RESBY[k].name).join(', ');
      this.game.hud.toast('NOT ENOUGH ' + missing);
    }

    /* ---------------------------------------------------------- build menu */
    openBuildMenu(f, c) {
      const m = this.meta;
      this.game.audio.ui();
      const cats = M.CATS.map((cat) => {
        const list = M.ROOMS.filter((r) => r.cat === cat.id).map((def) => {
          const cost = def.cost(0);
          const afford = m.can(cost);
          return `<div class="brm${afford ? '' : ' poor'}" data-r="${def.id}" style="--c:${def.color}">
            <div class="brmi">${BA.icons.img(def.icon, 34)}</div>
            <div class="brmb">
              <div class="brmn" style="color:${def.color}">${def.name}</div>
              <div class="brmd">${def.desc}</div>
              <div class="brmc">${this.costText(cost, m)}</div>
            </div>
            <div class="bbtn go small bld">BUILD</div>
          </div>`;
        }).join('');
        return `<div class="bcat"><div class="bcath" style="color:${cat.color}">
          ${cat.name}<em>${cat.blurb}</em></div>${list}</div>`;
      }).join('');

      this.showPanel(`
        <div class="bph"><div class="bpt">EMPTY BAY · FLOOR ${f + 1}</div>
          <div class="bbtn x" id="bpx">CLOSE</div></div>
        <div class="bpbody">${cats}</div>`);

      for (const el of this.elPanel.querySelectorAll('.brm')) {
        el.querySelector('.bld').addEventListener('click', () => {
          const id = el.dataset.r;
          if (m.build(id, f, c)) {
            this.game.audio.levelUp();
            this.game.fx.sparks(colX(c), floorY(f) + 1.2, 0, 20, 1.0, 0.9, 0.4, 1.2);
            this.syncVillagers();
            this.refreshTop();
            this.openRoomPanel(m.roomAt(f, c));
          } else {
            this.game.audio.hurt();
            this.flashCost(M.ROOM[id].cost(0));
          }
        });
      }
    }

    /* ------------------------------------------------------- deploy panel */
    /* Q opens the sortie board. Four places to drive, each with its own
       generator, weather and loot bias; the deeper the bunker, the more of
       them the crew will sign off on. */
    openDeployPanel() {
      const m = this.meta;
      const g = this.game;
      this.game.audio.ui();
      const rank = m.rank;

      const cards = BA.stages.STAGES.map((st, i) => {
        const open = m.stageUnlocked(st);
        const clears = m.stageClearCount(st.id);
        const bias = Object.entries(st.reward)
          .sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([k, v]) => {
            const r = M.RESBY[k];
            return `<span class="sbias">${BA.icons.img(r.icon, 15)}` +
              `<b style="color:${r.color}">x${v.toFixed(1)}</b></span>`;
          }).join('');
        const badge = clears
          ? `<span class="stag done">EXTRACTED x${clears}</span>`
          : '<span class="stag">NEVER RUN</span>';
        return `<div class="brm stagecard${open ? '' : ' poor locked'}" data-s="${st.id}"
            style="--c:${st.color}">
          <div class="brmi">${BA.icons.img(st.icon, 34)}<span class="skey">${i + 1}</span></div>
          <div class="brmb">
            <div class="brmn" style="color:${st.color}">${st.name}
              ${badge}</div>
            <div class="brmd">${st.blurb}</div>
            <div class="brmc">${bias}
              <span class="sbias dim">${st.landmarkName}</span>
              <span class="sbias dim">${st.exitZ}m TO THE GATE</span></div>
          </div>
          ${open
            ? '<div class="bbtn go small roll">ROLL OUT</div>'
            : `<div class="bbtn x small dead">NEEDS RANK ${st.unlockRank}</div>`}
        </div>`;
      }).join('');

      const T = m.truckStats();
      const brief = `<div class="bdim brief">RANK <b style="color:#ffd23a">${rank}</b> ` +
        `· RESCUE <b style="color:#8dff3a">${Math.min(2 + rank, T.cargo)}</b> ` +
        `· CLEAR <b style="color:#8dff3a">3</b> WAVES ` +
        `· ${T.canJump ? 'JUMP READY' : 'NO JUMP - FIT HYDRAULIC RAMS'} ` +
        `· ${T.canNitro ? 'NOS READY' : 'NO NOS - FIT THE INJECTOR'}</div>`;

      this.showPanel(`
        <div class="bph"><div class="bpt" style="color:#ff5a36">DEPLOY
          <em>PICK A PLACE TO DRIVE</em></div>
          <div class="bbtn x" id="bpx">STAY HOME</div></div>
        <div class="bpbody deploy">
          ${brief}
          <div class="bcat"><div class="bcath" style="color:#ffd23a">SORTIE BOARD
            <em>rank climbs as you dig deeper and build more</em></div>
            ${cards}</div>
        </div>`);

      this.deployOpen = true;
      for (const el of this.elPanel.querySelectorAll('.stagecard')) {
        const id = el.dataset.s;
        const btn = el.querySelector('.roll');
        if (!btn) {
          el.addEventListener('click', () => {
            g.audio.hurt();
            g.hud.toast('DIG DEEPER FIRST');
          });
          continue;
        }
        btn.addEventListener('click', () => this.launch(id));
      }
    }

    launch(id) {
      const st = BA.stages.byId[id];
      if (!st || !this.meta.stageUnlocked(st)) { this.game.audio.hurt(); return; }
      this.meta.lastStage = id;
      this.meta.save();
      this.closePanel();
      this.game.stage = st;
      this.game.startRun();
    }

    /* --------------------------------------------------------- room panel */
    openRoomPanel(room) {
      const m = this.meta;
      const def = M.ROOM[room.id];
      this.game.audio.ui();
      const cat = M.CATS.find((c) => c.id === def.cat);
      const crew = m.crewOf(room);
      const capN = m.crewCap(room);
      const upCost = m.upgradeCost(room);
      const exCost = m.canExpand(room) ? m.expandCost(room) : null;

      const flow = (obj, sign) => obj ? Object.entries(obj).map(([k, v]) => {
        const r = M.RESBY[k];
        return `<span class="bflow"><b style="color:${r.color}">${sign}${(v * room.level * room.w).toFixed(0)}</b> ${r.name}</span>`;
      }).join('') : '';

      const crewRows = crew.map((p) => {
        const pr = M.PROF[p.prof], tr = M.TRAIT[p.trait];
        const fit = m.workerFactor(p, room.id);
        return `<div class="bcrew" data-u="${p.uid}">
          <span class="bcn">${p.name}</span>
          <span class="bcp" style="color:${pr.color}">${pr.name}</span>
          <span class="bct" style="color:${tr.color}">${tr.name}</span>
          <span class="bcf${fit >= 0.95 ? ' good' : ''}">x${fit.toFixed(2)}</span>
          <span class="bbtn x tiny pull">OUT</span></div>`;
      }).join('') || '<div class="bdim">NOBODY WORKING THIS ROOM</div>';

      const idle = m.roster.filter((p) => !p.job);
      const idleRows = idle.slice(0, 8).map((p) => {
        const pr = M.PROF[p.prof], tr = M.TRAIT[p.trait];
        const fit = m.workerFactor(p, room.id);
        return `<div class="bcrew idle" data-u="${p.uid}">
          <span class="bcn">${p.name}</span>
          <span class="bcp" style="color:${pr.color}">${pr.name}</span>
          <span class="bct" style="color:${tr.color}">${tr.name}</span>
          <span class="bcf${fit >= 0.95 ? ' good' : ''}">x${fit.toFixed(2)}</span>
          <span class="bbtn go tiny put">WORK</span></div>`;
      }).join('') || '<div class="bdim">NO IDLE CREW - RESCUE MORE</div>';

      this.showPanel(`
        <div class="bph">
          <div class="bpt" style="color:${def.color}">${def.name}
            <em style="color:${cat.color}">${cat.name}</em></div>
          <div class="bbtn x" id="bpx">CLOSE</div>
        </div>
        <div class="bpbody">
          <div class="bpg">
            <div class="bpcard">
              <div class="bplv">LEVEL <b>${room.level}</b>/${def.max} · WIDTH <b>${room.w}</b></div>
              <div class="bpdesc">${def.desc}</div>
              <div class="bpflow">${flow(def.out, '+')}${flow(def.in, '-')}
                ${def.power ? `<span class="bflow"><b style="color:#ffd23a">${def.power < 0 ? '+' : '-'}${Math.abs(def.power) * room.level * (def.power < 0 ? 1 : room.w)}</b> POWER</span>` : ''}</div>
              ${room.idle ? '<div class="bwarn">STARVED - NO INPUT MATERIAL</div>' : ''}
              <div class="bprow">
                ${upCost ? `<div class="bbtn go" id="bpup">UPGRADE ${this.costText(upCost, m)}</div>`
                  : '<div class="bbtn dead">MAX LEVEL</div>'}
                ${exCost ? `<div class="bbtn go" id="bpex">EXPAND ${this.costText(exCost, m)}</div>`
                  : `<div class="bbtn dead">${room.w >= 3 ? 'MAX WIDTH' : 'DIG THE BAY TO THE RIGHT'}</div>`}
                ${def.screen ? `<div class="bbtn hot" id="bpopen">OPEN ${def.screen.toUpperCase()}</div>` : ''}
                <div class="bbtn x" id="bpdemo">DEMOLISH</div>
              </div>
            </div>
            <div class="bpcard">
              <div class="bpsec">CREW ${crew.length}/${capN}</div>
              ${capN ? crewRows : '<div class="bdim">THIS ROOM RUNS ITSELF</div>'}
              ${capN && crew.length < capN ? `<div class="bpsec">AVAILABLE</div>${idleRows}` : ''}
            </div>
          </div>
        </div>`);

      const rerun = () => { this.refreshTop(); this.syncVillagers(); this.openRoomPanel(room); };
      const up = this.elPanel.querySelector('#bpup');
      if (up) up.addEventListener('click', () => {
        if (m.upgrade(room)) { this.game.audio.levelUp(); this.sparkRoom(room); rerun(); }
        else { this.game.audio.hurt(); this.flashCost(upCost); }
      });
      const ex = this.elPanel.querySelector('#bpex');
      if (ex) ex.addEventListener('click', () => {
        if (m.expand(room)) { this.game.audio.levelUp(); this.sparkRoom(room); rerun(); }
        else { this.game.audio.hurt(); this.flashCost(exCost); }
      });
      const op = this.elPanel.querySelector('#bpopen');
      if (op) op.addEventListener('click', () => this.openScreen(def.screen, room));
      const dm = this.elPanel.querySelector('#bpdemo');
      if (dm) dm.addEventListener('click', () => {
        m.demolish(room);
        this.game.audio.explode(0.4);
        this.closePanel();
        this.syncVillagers();
        this.refreshTop();
      });
      for (const el of this.elPanel.querySelectorAll('.bcrew')) {
        const uid = el.dataset.u;
        const pull = el.querySelector('.pull'), put = el.querySelector('.put');
        if (pull) pull.addEventListener('click', () => {
          m.setJob(m.personAt(uid), null); this.game.audio.ui(); rerun();
        });
        if (put) put.addEventListener('click', () => {
          if (m.crewOf(room).length >= m.crewCap(room)) return;
          m.setJob(m.personAt(uid), room); this.game.audio.ui(); rerun();
        });
      }
    }

    sparkRoom(room) {
      const x = colX(room.c) + (room.w - 1) * CW * 0.5;
      this.game.fx.sparks(x, floorY(room.f) + 1.4, 1.0, 26, 1.2, 1.0, 0.5, 1.3);
    }

    openScreen(kind, room) {
      if (kind === 'garage') this.game.garage.open('bunker');
      else if (kind === 'armory') this.game.garage.open('armory');
      else if (kind === 'lab') this.game.garage.open('lab');
    }

    showPanel(html) {
      this.elPanel.innerHTML = html;
      this.elPanel.classList.add('on');
      this.panel = true;
      const x = this.elPanel.querySelector('#bpx');
      if (x) x.addEventListener('click', () => { this.closePanel(); this.game.audio.ui(); });
    }

    /* ------------------------------------------------------- inhabitants */
    syncVillagers() {
      const m = this.meta;
      this.villagers = m.roster.map((p, i) => {
        const room = m.rooms.find((r) => M.roomKey(r) === p.job);
        const seed = hash01(i * 977 + 13);
        if (room) {
          const x = colX(room.c) + rand(-0.3, 0.3) + (room.w - 1) * CW * rand(0.1, 0.9);
          return { p, f: room.f, x, home: x, y: floorY(room.f), work: true, t: seed * TAU, seed, dir: 1 };
        }
        // loiterers spread themselves over whatever floors are actually dug
        const open = [];
        for (let ff = 0; ff < M.FLOORS; ff++) {
          for (let cc = 1; cc < M.COLS; cc++) if (m.isDug(ff, cc)) open.push([ff, cc]);
        }
        const spot = open.length ? open[(i * 5 + 3) % open.length] : [0, 1];
        const x = colX(spot[1]) + (seed - 0.5) * CW * 0.7;
        return { p, f: spot[0], x, home: x, y: floorY(spot[0]), work: false,
          t: seed * TAU, seed, dir: seed < 0.5 ? -1 : 1 };
      });
    }

    /* ------------------------------------------------------------ update */
    update(dt) {
      this.time += dt;
      const inp = this.game.input;
      const m = this.meta;
      m.tick(dt);
      if (this.time - (this.lastTop || 0) > 0.5) { this.lastTop = this.time; this.refreshTop(); }

      if (this.fix) this.updateFix(dt);

      const blocked = this.panel || this.game.garage.isOpen || this.fix;

      /* --- walk --- */
      let ax = 0;
      if (!blocked) {
        if (inp.down('KeyA') || inp.down('ArrowLeft')) ax -= 1;
        if (inp.down('KeyD') || inp.down('ArrowRight')) ax += 1;
        if (inp.virtual.active) ax += clamp(inp.virtual.steer * 1.6, -1, 1);
      }
      const maxX = colX(M.COLS - 1) + CW * 0.35;
      const minX = -CW * 0.35;
      if (this.climbing) {
        ax = 0;
      }
      this.vx = damp(this.vx, ax * WALK, 14, dt);
      this.px = clamp(this.px + this.vx * dt, minX, maxX);
      if (Math.abs(ax) > 0.1) this.facing = ax > 0 ? 1 : -1;
      this.walkT += Math.abs(this.vx) * dt * 1.5;

      /* --- stairs --- */
      const onStairs = Math.abs(this.px - colX(M.SHAFT)) < CW * 0.5;
      if (!blocked && onStairs && !this.climbing) {
        const wantUp = inp.down('KeyW') || inp.down('ArrowUp');
        const wantDn = inp.down('KeyS') || inp.down('ArrowDown');
        if (wantUp && this.pf > 0) this.startClimb(-1);
        else if (wantDn && this.pf < M.FLOORS - 1 && m.isDug(this.pf + 1, M.SHAFT)) this.startClimb(1);
      }
      if (this.climbing) {
        this.climbT += dt * 1.7;
        const t = clamp01(this.climbT);
        this.py = lerp(floorY(this.climbFrom), floorY(this.climbTo), t * t * (3 - 2 * t));
        this.px = damp(this.px, colX(M.SHAFT), 10, dt);
        if (t >= 1) { this.climbing = 0; this.pf = this.climbTo; this.py = floorY(this.pf); }
      } else {
        this.py = floorY(this.pf);
      }

      /* --- actions --- */
      if (!this.game.garage.isOpen) {
        if (inp.consume('KeyE') || inp.consume('Enter')) {
          if (this.panel) this.closePanel(); else this.interact();
        }
        if (inp.consume('Escape')) this.closePanel();
        if (inp.consume('KeyQ')) {
          if (this.deployOpen) this.closePanel(); else this.openDeployPanel();
        }
        if (this.deployOpen) {
          for (let i = 0; i < BA.stages.STAGES.length; i++) {
            if (inp.consume('Digit' + (i + 1))) this.launch(BA.stages.STAGES[i].id);
          }
        }
      }
      this.updatePrompt();

      /* --- pose --- */
      const p = this.pose;
      if (this.fix) { /* driven by updateFix */ }
      else if (this.climbing) A.climb(p, this.time, 7.5);
      else if (Math.abs(this.vx) > 0.4) A.walk(p, this.walkT, 6.2, clamp01((Math.abs(this.vx) - 2) / 6));
      else A.idle(p, this.time, 0.4);

      /* --- crew --- */
      for (const v of this.villagers) {
        v.t += dt;
        if (!v.pose) v.pose = A.newPose();
        if (v.work) {
          const kind = v.p.prof;
          if (v.t % 7 < 4.2) A.wrench(v.pose, v.t + v.seed * 3);
          else A.reachUp(v.pose, v.t + v.seed * 3);
          v.dir = 1;
        } else {
          // idlers pace the entrance floor
          const range = 6;
          v.x += v.dir * dt * 1.5;
          if (v.x > v.home + range) v.dir = -1;
          if (v.x < v.home - range) v.dir = 1;
          A.walk(v.pose, v.t * 1.5, 5.2, 0);
        }
      }

      /* --- camera --- */
      const c = this.cam;
      c.x = damp(c.x, clamp(this.px, colX(1) - 1, colX(M.COLS - 2) + 1), 6, dt);
      c.y = damp(c.y, this.py + 2.2, 6, dt);
    }

    startClimb(dir) {
      this.climbing = dir;
      this.climbT = 0;
      this.climbFrom = this.pf;
      this.climbTo = this.pf + dir;
      this.game.audio.ui();
    }

    /* --------------------------------------------- climb out and fix it up */
    /* Called by the garage when a component is bought. The driver gets out,
       walks to the part of the truck that changed, and works on it. */
    playFix(compId) {
      const room = this.meta.rooms.find((r) => r.id === 'garage');
      if (!room) return false;
      const bay = colX(room.c) + (room.w - 1) * CW * 0.5;
      const comp = M.COMP[compId];
      // where on the truck this component lives, front to back
      const spot = /engine|turbo|nos|plow|w_spikes/.test(compId) ? 1.9
        : /tires|hydraulics/.test(compId) ? -0.2
          : /bed|magnet|tank|w_mine|w_flame/.test(compId) ? -2.4 : 0.8;
      const roof = /minigun|rocket|laser|rail|drone|tesla|mount|slam/.test(compId);
      this.fix = {
        t: 0, comp, bay, spot, roof,
        stage: 'out',
        from: bay + 0.4, to: bay + spot,
        f: room.f, y: floorY(room.f),
      };
      this.pf = room.f;
      this.py = floorY(room.f);
      this.px = bay + 0.4;
      this.closePanel();
      this.game.audio.ui();
      return true;
    }

    updateFix(dt) {
      const F = this.fix;
      const g = this.game;
      F.t += dt;
      const p = this.pose;
      // long enough to be satisfying, short enough to sit through every purchase
      const doneAt = { out: 0.7, walk: 0.85, work: 2.0, back: 0.85, in: 0.6 };

      if (F.stage === 'out') {
        // swing down out of the cab
        const t = clamp01(F.t / doneAt.out);
        A.climb(p, this.time, 5.0);
        this.px = lerp(F.bay + 1.0, F.from, t);
        this.py = lerp(F.y + 1.5, F.y, t * t);
        this.facing = F.spot > 0 ? 1 : -1;
        if (t >= 1) { F.stage = 'walk'; F.t = 0; }
      } else if (F.stage === 'walk') {
        const t = clamp01(F.t / doneAt.walk);
        this.px = lerp(F.from, F.to, t * t * (3 - 2 * t));
        this.py = F.y;
        A.walk(p, this.time * 6, 6.0, 0);
        this.facing = F.to > F.from ? 1 : -1;
        if (t >= 1) { F.stage = 'work'; F.t = 0; g.audio.ui(); }
      } else if (F.stage === 'work') {
        const t = clamp01(F.t / doneAt.work);
        this.px = F.to;
        if (F.roof) A.reachUp(p, this.time);
        else if (t > 0.45) A.weld(p, this.time);
        else A.wrench(p, this.time);
        // sparks and clangs on a beat
        if (F.t - (F.lastSpark || 0) > 0.16) {
          F.lastSpark = F.t;
          const sx = this.px + this.facing * 0.7;
          const sy = this.py + (F.roof ? 2.5 : 0.8);
          g.fx.sparks(sx, sy, 0.9, 5, 1.4, 1.05, 0.35, 1.0);
          if (Math.random() < 0.4) g.audio.pickup(0.5);
        }
        if (t >= 1) { F.stage = 'back'; F.t = 0; }
      } else if (F.stage === 'back') {
        const t = clamp01(F.t / doneAt.back);
        this.px = lerp(F.to, F.bay + 0.4, t * t * (3 - 2 * t));
        A.walk(p, this.time * 6, 6.0, 0);
        this.facing = F.bay + 0.4 > F.to ? 1 : -1;
        if (t >= 1) { F.stage = 'in'; F.t = 0; }
      } else {
        const t = clamp01(F.t / doneAt.in);
        A.climb(p, this.time, 5.0);
        this.px = lerp(F.bay + 0.4, F.bay + 1.0, t);
        this.py = lerp(F.y, F.y + 1.5, t);
        if (t >= 1) {
          this.fix = null;
          this.py = F.y;
          this.px = F.bay + 0.4;
          g.fx.text(this.px, F.y + 3.4, 0, F.comp.name + ' FITTED', F.comp.color, 22, 'big');
          g.audio.levelUp();
          if (this.reopenGarage) {
            this.reopenGarage = false;
            g.garage.open(this.reopenFace || 'bunker');
          }
        }
      }
    }

    /* -------------------------------------------------------------- draw */
    draw(R) {
      R.time = this.time;
      R.beginFrame();
      const m = this.meta;

      this.drawEarth(R);
      for (let f = 0; f < M.FLOORS; f++) {
        for (let c = 0; c < M.COLS; c++) {
          if (m.isDug(f, c)) this.drawCell(R, f, c);
          else this.drawRock(R, f, c);
        }
      }
      this.drawShaft(R);
      for (const room of m.rooms) this.drawRoom(R, room);
      this.drawSurface(R);
      for (const v of this.villagers) this.drawVillager(R, v);
      this.drawPlayer(R);
      this.game.fx.draw(R);

      const P2 = R.post;
      P2.bloom = 0.95;
      P2.aberration = 0.0008;
      P2.vignette = 1.25;
      P2.speedBlur = 0;
      P2.flash = this.game.flashAmt;
      P2.hurt = 0;

      const c = this.cam;
      const dist = 30;
      R.setCamera([c.x, c.y, dist], [c.x, c.y, 0], [0, 1, 0], 0.62, 0.4, 300);
      R.render([c.x, 0]);

      const ctx = this.game.octx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.game.overlay.width, this.game.overlay.height);
      this.game.fx.drawText(ctx, R, this.game.overlay.width, this.game.overlay.height);
    }

    /* the mass of dirt the whole thing is buried in */
    drawEarth(R) {
      const w = M.COLS * CW + 20;
      const h = M.FLOORS * CH + 16;
      const cx = (M.COLS - 1) * CW * 0.5;
      const cy = -M.FLOORS * CH * 0.5 + CH * 0.5;
      R.push('box', 'opaque', cx, cy, -DEPTH - 1.2, 0, 0, 0, w, h, 2.4,
        P.dirt[0], P.dirt[1], P.dirt[2], 0);
      // strata so the cutaway does not read as one flat slab
      for (let i = 0; i < 16; i++) {
        const y = 1.2 - i * (h / 16) * 0.98;
        const s = hash01(i * 71 + 3);
        R.push('box', 'opaque', cx + (s - 0.5) * 6, y, -DEPTH - 0.1, 0, 0, 0,
          w * (0.7 + s * 0.3), 0.34 + s * 0.5, 0.5,
          P.dirt[0] * (1 + s * 0.5), P.dirt[1] * (1 + s * 0.45), P.dirt[2] * (1 + s * 0.4), 0);
      }
    }

    drawRock(R, f, c) {
      const x = colX(c), y = floorY(f);
      const s = hash01(f * 131 + c * 37);
      const k = 0.85 + s * 0.4;
      R.push('box', 'opaque', x, y + CH * 0.5 - SLAB * 0.5, -1.0, 0, 0, 0,
        CW, CH, DEPTH * 0.8, P.rock[0] * k, P.rock[1] * k, P.rock[2] * k, 0);
      // broken slabs in the face, so the rock is not one flat brown wall
      for (let i = 0; i < 4; i++) {
        const h = hash01(f * 313 + c * 91 + i * 17);
        const h2 = hash01(f * 511 + c * 61 + i * 29);
        const t = 0.72 + h2 * 0.5;
        R.push('box', 'opaque', x + (h - 0.5) * CW * 0.78,
          y + 0.4 + h2 * (CH - 1.4), 1.1 + h * 0.5, 0, 0, (h - 0.5) * 1.6,
          1.4 + h * 1.9, 0.7 + h2 * 1.1, 0.7,
          P.rockLit[0] * t, P.rockLit[1] * t, P.rockLit[2] * t, 0);
      }
    }

    /* an excavated but empty bay: slab, back wall, ribs */
    drawCell(R, f, c) {
      const x = colX(c), y = floorY(f);
      // floor slab
      R.push('box', 'opaque', x, y - SLAB * 0.5, -1.4, 0, 0, 0,
        CW, SLAB, DEPTH, P.slab[0], P.slab[1], P.slab[2], 0);
      R.push('box', 'opaque', x, y - 0.06, 1.1, 0, 0, 0,
        CW, 0.16, 0.5, P.slabDark[0], P.slabDark[1], P.slabDark[2], 0);
      // back wall
      R.push('box', 'opaque', x, y + ROOM_H * 0.5, -DEPTH * 0.5 - 0.4, 0, 0, 0,
        CW, ROOM_H, 0.5, P.wall[0], P.wall[1], P.wall[2], 0);
      // steel ribs either side
      for (const s of [-1, 1]) {
        R.push('box', 'opaque', x + s * CW * 0.47, y + ROOM_H * 0.5, -0.9, 0, 0, 0,
          0.32, ROOM_H, DEPTH * 0.7, P.steel[0] * 0.7, P.steel[1] * 0.7, P.steel[2] * 0.7, 0);
      }
      // ceiling beam
      R.push('box', 'opaque', x, y + ROOM_H + 0.1, -1.2, 0, 0, 0,
        CW, 0.45, DEPTH * 0.8, P.steel[0] * 0.55, P.steel[1] * 0.55, P.steel[2] * 0.58, 0);
      // strip light, plus the soft pool it throws down the back wall
      const flick = 0.85 + Math.sin(this.time * 9 + c * 3.1 + f) * 0.06;
      R.push('box', 'glow', x, y + ROOM_H - 0.25, -0.4, 0, 0, 0,
        CW * 0.62, 0.16, 0.34, P.lamp[0] * flick, P.lamp[1] * flick, P.lamp[2] * flick, 1);
      R.push('box', 'opaque', x, y + ROOM_H - 0.08, -0.4, 0, 0, 0,
        CW * 0.66, 0.18, 0.48, 0.16, 0.16, 0.18, 0);
      R.push('box', 'opaque', x, y + ROOM_H * 0.55, -DEPTH * 0.5 - 0.12, 0, 0, 0,
        CW * 0.8, ROOM_H * 0.8, 0.1, 0.30 * flick, 0.27 * flick, 0.24 * flick, 0.22);
      // cabling along the back wall
      R.push('cylX', 'opaque', x, y + ROOM_H - 0.75, -DEPTH * 0.5 - 0.1, 0, 0, 0,
        CW, 0.1, 0.1, 0.18, 0.16, 0.15, 0);
    }

    /* the stairwell running down the left edge */
    drawShaft(R) {
      const m = this.meta;
      const x = colX(M.SHAFT);
      for (let f = 0; f < M.FLOORS; f++) {
        if (!m.isDug(f, M.SHAFT)) continue;
        const y = floorY(f);
        // landing
        R.push('box', 'opaque', x, y - SLAB * 0.5, -1.4, 0, 0, 0,
          CW, SLAB, DEPTH, P.slabDark[0], P.slabDark[1], P.slabDark[2], 0);
        // the flight down to the next floor, if it exists
        if (m.isDug(f + 1, M.SHAFT)) {
          const steps = 9;
          for (let i = 0; i < steps; i++) {
            const t = i / steps;
            R.push('box', 'opaque', x - CW * 0.30 + t * CW * 0.62,
              y - SLAB - t * (CH - SLAB) - 0.15, -1.2, 0, 0, 0,
              CW * 0.62 / steps + 0.12, 0.22, DEPTH * 0.62,
              P.steel[0] * 0.62, P.steel[1] * 0.62, P.steel[2] * 0.66, 0);
            // stringer underneath
            R.push('box', 'opaque', x - CW * 0.30 + t * CW * 0.62,
              y - SLAB - t * (CH - SLAB) - 0.55, -1.2, 0, 0, 0,
              CW * 0.62 / steps + 0.2, 0.6, 0.24,
              P.steel[0] * 0.4, P.steel[1] * 0.4, P.steel[2] * 0.44, 0);
          }
          // handrail
          for (let i = 0; i <= 3; i++) {
            const t = i / 3;
            R.push('cyl', 'opaque', x - CW * 0.3 + t * CW * 0.62,
              y - SLAB - t * (CH - SLAB) + 0.55, 0.4, 0, 0, 0,
              0.09, 1.3, 0.09, P.rust[0], P.rust[1], P.rust[2], 0);
          }
        }
        // wall lamp
        const flick = 0.8 + Math.sin(this.time * 7 + f * 2.3) * 0.12;
        R.push('sphere', 'glow', x - CW * 0.4, y + ROOM_H - 0.5, 0.2, 0, 0, 0,
          0.5, 0.5, 0.5, 1.2 * flick, 0.55 * flick, 0.2, 1);
        R.push('box', 'opaque', x - CW * 0.42, y + ROOM_H - 0.3, 0.2, 0, 0, 0,
          0.3, 0.3, 0.3, 0.2, 0.19, 0.2, 0);
        // floor number stencil
        R.push('box', 'opaque', x + CW * 0.34, y + 1.4, -DEPTH * 0.5 + 0.2, 0, 0, 0,
          0.9, 0.9, 0.12, 0.55, 0.5, 0.2, 0.25);
      }
    }

    /* ----------------------------------------------------------- rooms */
    drawRoom(R, room) {
      const def = M.ROOM[room.id];
      if (!def) return;
      const x0 = colX(room.c);
      const cx = x0 + (room.w - 1) * CW * 0.5;
      const y = floorY(room.f);
      const w = room.w * CW;
      const t = this.time;
      const col = hexRGB(def.color);
      const eff = this.meta.roomEff(room);
      const busy = eff > 0.3 && !room.idle;
      const spin = busy ? t * 3 : t * 0.15;

      // floor paint + name plate over the door
      R.push('box', 'opaque', cx, y + 0.02, -0.6, 0, 0, 0, w * 0.88, 0.06, 3.4,
        col[0] * 0.16, col[1] * 0.16, col[2] * 0.16, 0.15);
      R.push('box', 'opaque', cx, y + ROOM_H - 0.62, -DEPTH * 0.5 + 0.05, 0, 0, 0,
        w * 0.5, 0.5, 0.2, 0.12, 0.12, 0.13, 0);
      R.push('box', 'glow', cx, y + ROOM_H - 0.62, -DEPTH * 0.5 + 0.18, 0, 0, 0,
        w * 0.44, 0.26, 0.1, col[0], col[1], col[2], 1);

      // status lamp: green while it works, red when starved
      const lit = room.idle ? [1.4, 0.2, 0.15] : busy ? [0.25, 1.4, 0.4] : [1.2, 0.9, 0.2];
      const pulse = 0.6 + Math.sin(t * (room.idle ? 7 : 2.4)) * 0.4;
      R.push('sphere', 'glow', x0 - CW * 0.36, y + ROOM_H - 0.5, 0.6, 0, 0, 0,
        0.34, 0.34, 0.34, lit[0] * pulse, lit[1] * pulse, lit[2] * pulse, 1);

      const B = (px, py, pz, sx, sy, sz, r, g, b, e, roll) =>
        R.push('box', 'opaque', cx + px, y + py, pz, 0, 0, roll || 0, sx, sy, sz, r, g, b, e || 0);
      const C = (px, py, pz, sx, sy, sz, r, g, b, e, roll) =>
        R.push('cyl', 'opaque', cx + px, y + py, pz, 0, 0, roll || 0, sx, sy, sz, r, g, b, e || 0);
      // Anything that turns on an axle faces the camera: pitch aims the mesh's
      // +Y down +Z, and roll then spins it about that axle.
      const AX = (px, py, pz, dia, len, spin, r, g, b, e) =>
        R.push('cyl', 'opaque', cx + px, y + py, pz, 0, TAU / 4, spin || 0,
          dia, len, dia, r, g, b, e || 0);
      const G = (px, py, pz, sx, sy, sz, r, g, b) =>
        R.push('sphere', 'glow', cx + px, y + py, pz, 0, 0, 0, sx, sy, sz, r, g, b, 1);

      switch (room.id) {
        /* ------------------------------------------------------- produce */
        case 'mine': {
          // rail track running into a hole in the back wall
          B(0, 0.12, -1.0, w * 0.8, 0.1, 0.16, 0.30, 0.26, 0.24);
          B(0, 0.12, -1.7, w * 0.8, 0.1, 0.16, 0.30, 0.26, 0.24);
          for (let i = 0; i < 6; i++) {
            B(-w * 0.38 + i * (w * 0.15), 0.06, -1.35, 0.22, 0.12, 1.1, 0.24, 0.17, 0.12);
          }
          // ore cart, trundling when the room is running
          const cart = busy ? Math.sin(t * 0.8) * w * 0.3 : -w * 0.2;
          B(cart, 0.55, -1.35, 1.7, 0.9, 1.5, 0.34, 0.30, 0.28);
          B(cart, 1.05, -1.35, 1.5, 0.3, 1.3, 0.42, 0.38, 0.30);
          for (const s of [-1, 1]) AX(cart + s * 0.6, 0.26, -0.9, 0.55, 0.3, spin * 2.2, 0.14, 0.13, 0.14);
          // pit head frame over a dark shaft
          B(-w * 0.3, 1.9, -2.2, 0.3, 3.6, 0.3, 0.36, 0.24, 0.15, 0, 0.12);
          B(w * 0.06, 1.9, -2.2, 0.3, 3.6, 0.3, 0.36, 0.24, 0.15, 0, -0.12);
          B(-w * 0.12, 3.6, -2.2, w * 0.34, 0.3, 0.5, 0.30, 0.20, 0.13);
          AX(-w * 0.12, 3.55, -2.2, 1.2, 0.5, spin * 0.6, 0.5, 0.42, 0.2);
          B(-w * 0.12, 2.4 + Math.sin(t * 0.9) * 0.7, -2.2, 0.12, 2.0, 0.12, 0.2, 0.2, 0.22);
          B(0, 1.6, -DEPTH * 0.5 + 0.3, 2.4, 3.0, 0.3, 0.05, 0.04, 0.04);
          // pick and props
          B(w * 0.32, 1.2, -0.6, 0.16, 2.4, 0.16, 0.42, 0.30, 0.18, 0, 0.5);
          break;
        }
        case 'lumber': {
          // stacked logs and a saw horse
          for (let i = 0; i < 4; i++) {
            const s = hash01(i * 41 + room.c);
            AX(-w * 0.34 + i * 0.85, 0.42 + (i % 2) * 0.7, -1.9, 0.9, 2.6, 0,
              0.42 + s * 0.1, 0.28, 0.15);
          }
          B(w * 0.18, 0.5, -1.2, 2.6, 1.0, 1.6, 0.36, 0.24, 0.14);
          // tree trunks coming down through the ceiling shaft
          C(w * 0.3, 2.4, -2.4, 1.0, 4.4, 1.0, 0.30, 0.20, 0.12);
          C(w * 0.3, 4.2, -2.4, 2.4, 1.2, 2.4, 0.12, 0.34, 0.14);
          // circular blade
          R.push('saw', busy ? 'opaque' : 'opaque', cx + w * 0.18, y + 1.5, -0.5,
            0, 0, spin * 2.4, 1.7, 1.7, 1.7, 0.72, 0.76, 0.82, 0);
          if (busy) G(w * 0.18, 1.5, -0.2, 1.2, 1.2, 1.2, 0.5, 0.4, 0.15);
          break;
        }
        case 'quarry': {
          for (let i = 0; i < 7; i++) {
            const s = hash01(i * 73 + room.c * 5);
            B(-w * 0.36 + (i % 4) * (w * 0.24), 0.45 + Math.floor(i / 4) * 0.95, -1.8 + s * 0.8,
              1.5 + s * 0.5, 0.9, 1.4, 0.44 + s * 0.08, 0.42, 0.39);
          }
          // jackhammer rig against the face
          B(w * 0.3, 1.5, -1.6, 0.4, 3.0, 0.4, 0.4, 0.4, 0.44, 0, 0.18);
          B(w * 0.34 + (busy ? Math.sin(t * 22) * 0.06 : 0), 0.3, -1.6, 0.3, 1.4, 0.3, 0.55, 0.5, 0.2);
          if (busy) G(w * 0.36, 0.1, -1.6, 1.0, 0.6, 1.0, 0.4, 0.34, 0.2);
          B(0, 2.6, -DEPTH * 0.5 + 0.3, w * 0.5, 2.0, 0.3, 0.26, 0.24, 0.22);
          break;
        }
        case 'salvage': {
          // scrap heap and a press
          for (let i = 0; i < 9; i++) {
            const s = hash01(i * 97 + room.c * 11);
            B(-w * 0.36 + s * w * 0.5, 0.3 + (i % 3) * 0.55, -1.9 + s, 1.1 + s, 0.5, 1.0,
              0.36 + s * 0.3, 0.30 + s * 0.16, 0.16, 0, s * 3);
          }
          B(w * 0.28, 2.2, -1.4, 2.4, 0.5, 2.0, 0.44, 0.42, 0.4);
          const press = busy ? 1.35 + Math.abs(Math.sin(t * 1.6)) * 1.1 : 2.3;
          B(w * 0.28, press, -1.4, 2.0, 0.7, 1.8, 0.5, 0.46, 0.2);
          B(w * 0.28, 0.5, -1.4, 2.4, 0.9, 2.0, 0.34, 0.32, 0.3);
          if (busy && press < 1.6) G(w * 0.28, 1.0, -0.9, 2.0, 1.2, 1.6, 0.5, 0.35, 0.08);
          break;
        }
        case 'hydro': {
          for (let r = 0; r < 3; r++) {
            const ry = 0.55 + r * 1.15;
            B(0, ry, -1.9, w * 0.82, 0.14, 1.9, 0.42, 0.42, 0.46);
            B(0, ry + 0.9, -1.9, w * 0.82, 0.1, 1.7, 0.2, 0.2, 0.22);
            R.push('box', 'glow', cx, y + ry + 0.82, -1.9, 0, 0, 0,
              w * 0.72, 0.12, 1.4, 0.55, 0.85, 0.35, 1);
            for (let i = 0; i < 7; i++) {
              const s = hash01(i * 31 + r * 17 + room.c);
              const gx = -w * 0.36 + i * (w * 0.72 / 6);
              C(gx, ry + 0.3, -1.9 + (s - 0.5) * 1.0, 0.5, 0.55, 0.5,
                0.18 + s * 0.2, 0.55 + s * 0.35, 0.15, 0);
              C(gx, ry + 0.55, -1.9 + (s - 0.5) * 1.0, 0.28, 0.5, 0.28, 0.25, 0.7, 0.2, 0);
            }
          }
          break;
        }
        case 'derrick': {
          C(-w * 0.26, 1.6, -2.0, 2.6, 3.2, 2.6, 0.46, 0.44, 0.40);
          C(-w * 0.26, 3.3, -2.0, 2.7, 0.3, 2.7, 0.3, 0.29, 0.27);
          B(-w * 0.26, 2.4, -0.7, 2.0, 0.35, 0.3, 0.85, 0.45, 0.08, 0.3);
          // nodding donkey
          B(w * 0.26, 1.2, -1.4, 0.35, 2.4, 0.35, 0.42, 0.4, 0.42);
          const nod = busy ? Math.sin(t * 2.2) * 0.4 : 0.1;
          B(w * 0.26, 2.5, -1.4, 3.0, 0.3, 0.4, 0.5, 0.3, 0.15, 0, nod);
          B(w * 0.26 + 1.4, 2.5 - Math.sin(nod) * 1.4, -1.4, 0.5, 0.9, 0.5, 0.4, 0.24, 0.12);
          C(0, 0.4, -0.6, 0.9, 0.8, 0.9, 0.7, 0.4, 0.1, 0.2);
          for (let i = 0; i < 3; i++) {
            C(-w * 0.05 + i * 1.0, 0.45, 0.6, 0.8, 0.9, 0.8, 0.75, 0.42, 0.1, 0.15);
          }
          break;
        }

        /* ------------------------------------------------------- process */
        case 'sawmill': {
          B(0, 0.75, -1.5, w * 0.78, 0.3, 2.0, 0.40, 0.30, 0.20);
          for (const s of [-1, 1]) B(s * w * 0.3, 0.4, -1.5, 0.35, 0.8, 1.8, 0.3, 0.22, 0.14);
          R.push('saw', 'opaque', cx, y + 1.35, -1.0, 0, 0, spin * 3.2,
            2.0, 2.0, 2.0, 0.78, 0.82, 0.88, 0);
          B(0, 2.5, -1.5, w * 0.4, 0.5, 1.4, 0.36, 0.34, 0.34);
          // fresh planks stacked at the out end
          for (let i = 0; i < 5; i++) {
            B(w * 0.3, 0.2 + i * 0.22, -0.6, 2.0, 0.18, 1.2, 0.80, 0.58, 0.32);
          }
          // logs waiting at the in end
          for (let i = 0; i < 2; i++) AX(-w * 0.34, 0.5 + i * 0.8, -0.6, 0.8, 1.9, 0, 0.38, 0.25, 0.14);
          if (busy) {
            G(0, 1.35, -0.6, 1.6, 1.0, 1.2, 0.55, 0.45, 0.2);
            if (Math.sin(t * 12) > 0.9) this.game.fx.sparks(cx, y + 1.3, -0.4, 2, 1.2, 1.0, 0.5, 0.7);
          }
          break;
        }
        case 'smelter': {
          // furnace with a glowing mouth
          B(-w * 0.22, 1.5, -1.8, 3.0, 3.0, 2.2, 0.34, 0.28, 0.26);
          B(-w * 0.22, 3.3, -1.8, 3.4, 0.45, 2.4, 0.26, 0.22, 0.2);
          C(-w * 0.22, 4.0, -1.8, 0.9, 1.6, 0.9, 0.3, 0.26, 0.24);
          const heat = busy ? 0.75 + Math.sin(t * 5) * 0.25 : 0.12;
          R.push('box', 'glow', cx - w * 0.22, y + 1.1, -0.65, 0, 0, 0,
            1.7, 1.4, 0.4, 1.5 * heat, 0.55 * heat, 0.10 * heat, 1);
          B(-w * 0.22, 1.1, -0.72, 2.0, 1.7, 0.3, 0.16, 0.13, 0.12);
          // crucible and ingot mould
          C(w * 0.2, 1.0, -1.4, 1.6, 1.6, 1.6, 0.36, 0.32, 0.3);
          if (busy) G(w * 0.2, 1.9, -1.4, 1.4, 0.8, 1.4, 1.2, 0.5, 0.1);
          for (let i = 0; i < 4; i++) {
            B(w * 0.28, 0.16, -0.3 + i * 0.42, 1.4, 0.24, 0.34,
              0.72, 0.76, 0.84, busy && i < 2 ? 0.5 : 0);
          }
          break;
        }
        case 'nailery': {
          B(0, 1.3, -1.7, w * 0.7, 2.4, 1.8, 0.36, 0.36, 0.4);
          B(0, 2.7, -1.7, w * 0.74, 0.4, 2.0, 0.28, 0.28, 0.32);
          const stamp = busy ? Math.abs(Math.sin(t * 9)) * 0.5 : 0.3;
          B(-w * 0.16, 1.0 + stamp, -0.8, 0.6, 1.0, 0.6, 0.5, 0.48, 0.2);
          B(w * 0.16, 1.0 + (busy ? Math.abs(Math.cos(t * 9)) * 0.5 : 0.3), -0.8, 0.6, 1.0, 0.6, 0.5, 0.48, 0.2);
          AX(w * 0.34, 2.2, -1.2, 1.6, 0.5, spin * 1.6, 0.6, 0.58, 0.6);
          // kegs of finished nails
          for (let i = 0; i < 3; i++) C(-w * 0.3 + i * 1.0, 0.45, 0.7, 0.9, 0.9, 0.9, 0.55, 0.5, 0.42);
          if (busy && Math.sin(t * 18) > 0.8) this.game.fx.sparks(cx, y + 1.2, -0.4, 2, 1.3, 1.2, 0.9, 0.6);
          break;
        }
        case 'machine': {
          B(0, 0.85, -1.6, w * 0.8, 0.35, 2.0, 0.34, 0.36, 0.40);
          for (let i = 0; i < 3; i++) {
            const mx = -w * 0.28 + i * (w * 0.28);
            B(mx, 1.7, -1.6, 1.5, 1.4, 1.4, 0.40, 0.42, 0.48);
            AX(mx, 1.7, -0.55, 0.5, 0.6, spin, 0.7, 0.72, 0.78);
            B(mx, 2.5, -1.6, 1.0, 0.4, 1.0, 0.3, 0.3, 0.34);
            if (busy) G(mx, 1.7, -0.3, 0.7, 0.7, 0.7, 0.4, 0.45, 0.55);
          }
          // belt drive overhead
          B(0, 3.1, -1.4, w * 0.8, 0.14, 0.3, 0.2, 0.18, 0.16);
          for (let i = 0; i < 3; i++) {
            AX(-w * 0.28 + i * (w * 0.28), 3.1, -1.4, 0.75, 0.22, spin * 0.8, 0.4, 0.36, 0.3);
          }
          break;
        }
        case 'mixer': {
          const drum = busy ? spin * 1.4 : 0;
          AX(-w * 0.16, 2.0, -1.6, 2.8, 2.4, drum, 0.48, 0.46, 0.44);
          B(-w * 0.16, 0.5, -1.6, 2.6, 1.0, 2.2, 0.32, 0.3, 0.3);
          C(-w * 0.16, 3.6, -1.6, 1.2, 0.8, 1.2, 0.4, 0.38, 0.36);
          // hopper of aggregate
          B(w * 0.28, 2.6, -1.8, 2.0, 1.6, 1.6, 0.38, 0.36, 0.34);
          B(w * 0.28, 1.3, -1.8, 0.5, 1.2, 0.5, 0.3, 0.29, 0.28);
          for (let i = 0; i < 4; i++) {
            B(w * 0.28 - 0.6 + i * 0.4, 0.3, -0.6, 0.4, 0.5, 0.4, 0.5, 0.48, 0.45, 0, i);
          }
          // poured slabs curing
          for (let i = 0; i < 3; i++) B(-w * 0.3 + i * 1.1, 0.2, 0.9, 1.0, 0.35, 1.0, 0.62, 0.60, 0.56);
          break;
        }
        case 'assembly': {
          // conveyor from left to right with parts on it
          B(0, 0.9, -1.5, w * 0.88, 0.24, 1.6, 0.30, 0.30, 0.34);
          for (let i = 0; i < 8; i++) {
            AX(-w * 0.4 + i * (w * 0.11), 0.75, -1.5, 0.4, 1.5, spin,
              0.42, 0.42, 0.46);
          }
          const nItems = 5;
          for (let i = 0; i < nItems; i++) {
            const off = ((t * (busy ? 0.9 : 0) + i / nItems) % 1);
            B(-w * 0.42 + off * w * 0.84, 1.2, -1.5, 0.7, 0.5, 0.7,
              col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 0.3);
          }
          // robot arms over the line
          for (const s of [-1, 1]) {
            const ax2 = s * w * 0.22;
            B(ax2, 2.9, -1.5, 0.5, 1.4, 0.5, 0.36, 0.36, 0.4);
            const swing = busy ? Math.sin(t * 2.6 + s) * 0.5 : 0.2;
            B(ax2 + Math.sin(swing) * 0.9, 2.1 - Math.cos(swing) * 0.6, -1.5,
              0.3, 1.6, 0.3, 0.5, 0.44, 0.2, 0, swing);
            if (busy) G(ax2 + Math.sin(swing) * 1.5, 1.5, -1.2, 0.6, 0.6, 0.6, 0.5, 0.55, 0.6);
          }
          break;
        }

        /* ------------------------------------------------------- special */
        case 'quarters': {
          for (let i = 0; i < room.w * 2; i++) {
            const bx = -w * 0.42 + i * (w * 0.84 / Math.max(1, room.w * 2 - 1));
            for (let b = 0; b < 2; b++) {
              const by = 0.55 + b * 1.5;
              B(bx, by, -1.9, 1.7, 0.18, 2.0, 0.36, 0.34, 0.32);
              B(bx, by + 0.22, -2.1, 1.6, 0.3, 1.5, 0.62, 0.58, 0.52);
              B(bx, by + 0.34, -1.35, 0.9, 0.26, 0.6, 0.85, 0.84, 0.80);
              B(bx - 0.8, by + 0.4, -1.9, 0.14, 1.1, 2.0, 0.3, 0.28, 0.26);
            }
          }
          B(w * 0.34, 0.6, -0.4, 1.2, 1.2, 1.2, 0.4, 0.3, 0.2);
          G(0, 3.2, -0.9, 3.0, 1.0, 2.0, 0.25, 0.20, 0.12);
          break;
        }
        case 'generator': {
          AX(0, 1.4, -1.7, 2.4, 3.2, 0, 0.44, 0.42, 0.36);
          B(0, 1.4, -1.7, 3.6, 1.6, 1.4, 0.36, 0.34, 0.3);
          AX(-w * 0.3, 1.4, -0.9, 1.7, 0.5, spin * 2, 0.5, 0.48, 0.44);
          // exhaust up through the ceiling
          C(w * 0.24, 3.0, -2.2, 0.55, 3.2, 0.55, 0.28, 0.24, 0.22);
          B(0, 0.35, -1.7, 4.0, 0.7, 2.4, 0.24, 0.23, 0.22);
          const hum = busy ? 0.7 + Math.sin(t * 14) * 0.3 : 0.08;
          R.push('box', 'glow', cx + w * 0.1, y + 1.9, -0.55, 0, 0, 0,
            1.2, 0.3, 0.2, 1.4 * hum, 1.15 * hum, 0.3 * hum, 1);
          // fuel drum feeding it
          C(w * 0.36, 0.7, -0.5, 1.1, 1.4, 1.1, 0.75, 0.42, 0.1);
          for (let i = 0; i < 3; i++) {
            R.push('cyl', 'opaque', cx - w * 0.1 + i * 0.5, y + 3.4, -1.2, 0, 0, TAU / 4,
              0.14, w * 0.5, 0.14, 0.3, 0.27, 0.24, 0);
          }
          break;
        }
        case 'garage': {
          this.drawGarageBay(R, room, cx, y, w, t);
          break;
        }
        case 'lab': {
          B(0, 0.9, -1.9, w * 0.84, 0.2, 1.6, 0.62, 0.62, 0.66);
          for (const s of [-1, 1]) B(s * w * 0.3, 0.45, -1.9, 0.3, 0.9, 1.4, 0.4, 0.4, 0.44);
          // glassware bubbling
          for (let i = 0; i < 5; i++) {
            const gx = -w * 0.32 + i * (w * 0.16);
            const bub = 0.6 + Math.sin(t * 3 + i * 1.7) * (busy ? 0.35 : 0.05);
            C(gx, 1.3, -1.9, 0.5, 0.8, 0.5, 0.7, 0.8, 0.85, 0.2);
            R.push('sphere', 'glow', cx + gx, y + 1.15, -1.9, 0, 0, 0,
              0.42, 0.42, 0.42, col[0] * bub, col[1] * bub * 0.6, col[2] * bub, 1);
            C(gx, 1.85, -1.9, 0.16, 0.5, 0.16, 0.7, 0.8, 0.85, 0.2);
          }
          // blueprint board and a server rack
          B(-w * 0.28, 2.9, -DEPTH * 0.5 + 0.3, w * 0.4, 1.6, 0.2, 0.12, 0.22, 0.42, 0.3);
          for (let i = 0; i < 4; i++) {
            R.push('box', 'glow', cx - w * 0.28, y + 2.4 + i * 0.32, -DEPTH * 0.5 + 0.42, 0, 0, 0,
              w * 0.32, 0.05, 0.1, 0.3, 0.55, 0.9, 1);
          }
          B(w * 0.3, 1.7, -2.0, 1.6, 3.4, 1.4, 0.20, 0.20, 0.24);
          for (let i = 0; i < 7; i++) {
            const on = ((t * 4 + i * 2.3) % 3) < 1.5 ? 1 : 0.15;
            R.push('box', 'glow', cx + w * 0.3, y + 0.5 + i * 0.42, -1.32, 0, 0, 0,
              1.2, 0.1, 0.1, 0.3 * on, 0.9 * on, 0.6 * on, 1);
          }
          break;
        }
        case 'armory': {
          // weapon racks on the back wall
          B(0, 2.2, -DEPTH * 0.5 + 0.25, w * 0.8, 0.16, 0.5, 0.34, 0.26, 0.18);
          B(0, 1.0, -DEPTH * 0.5 + 0.25, w * 0.8, 0.16, 0.5, 0.34, 0.26, 0.18);
          for (let i = 0; i < room.w * 4; i++) {
            const gx = -w * 0.38 + i * (w * 0.76 / Math.max(1, room.w * 4 - 1));
            const lean = 0.12 + hash01(i * 53 + room.c) * 0.1;
            B(gx, 1.7, -DEPTH * 0.5 + 0.5, 0.16, 1.9, 0.16, 0.26, 0.24, 0.26, 0, lean);
            B(gx + 0.2, 1.05, -DEPTH * 0.5 + 0.5, 0.3, 0.6, 0.22, 0.35, 0.24, 0.14, 0, lean);
          }
          // reloading bench
          B(-w * 0.2, 0.9, -1.4, w * 0.42, 0.22, 1.6, 0.40, 0.32, 0.22);
          const pressY = busy ? 1.5 + Math.abs(Math.sin(t * 4)) * 0.35 : 1.7;
          B(-w * 0.2, pressY, -1.4, 0.4, 0.9, 0.4, 0.55, 0.5, 0.24);
          B(-w * 0.2, 1.05, -1.4, 0.7, 0.3, 0.7, 0.4, 0.38, 0.4);
          // ammo crates
          for (let i = 0; i < 3; i++) {
            B(w * 0.26 + (i % 2) * 0.2, 0.4 + i * 0.72, -1.0, 1.9, 0.7, 1.3, 0.30, 0.34, 0.22);
            R.push('box', 'glow', cx + w * 0.26 + (i % 2) * 0.2, y + 0.4 + i * 0.72, -0.32, 0, 0, 0,
              1.0, 0.14, 0.1, 0.9, 0.25, 0.2, 1);
          }
          if (busy && Math.sin(t * 8) > 0.9) this.game.fx.sparks(cx - w * 0.2, y + 1.3, -0.8, 2, 1.3, 0.9, 0.4, 0.6);
          break;
        }
      }
    }

    /* the garage bay: the truck sits here between runs */
    drawGarageBay(R, room, cx, y, w, t) {
      // pit, tool wall, hoist
      R.push('box', 'opaque', cx, y - 0.3, -1.4, 0, 0, 0, w * 0.5, 0.6, 2.6, 0.10, 0.09, 0.09, 0);
      R.push('box', 'opaque', cx - w * 0.36, y + 2.3, -DEPTH * 0.5 + 0.25, 0, 0, 0,
        w * 0.24, 2.2, 0.3, 0.26, 0.24, 0.26, 0);
      for (let i = 0; i < 6; i++) {
        R.push('box', 'opaque', cx - w * 0.44 + (i % 3) * (w * 0.08), y + 1.7 + Math.floor(i / 3) * 0.9,
          -DEPTH * 0.5 + 0.45, 0, 0, hash01(i * 17) * 0.6, 0.14, 0.7, 0.14, 0.55, 0.52, 0.5, 0);
      }
      R.push('box', 'opaque', cx, y + ROOM_H - 0.55, -1.2, 0, 0, 0, w * 0.7, 0.22, 0.3, 0.4, 0.38, 0.34, 0);
      R.push('box', 'opaque', cx + 0.6, y + 3.0, -1.2, 0, 0, 0, 0.1, 1.0, 0.1, 0.3, 0.28, 0.26, 0);
      R.push('cyl', 'opaque', cx + 0.6, y + 2.5, -1.2, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.45, 0.15, 0);

      // the truck, side on, nose pointing at the ramp
      const meta = this.meta;
      const body = [0.62, 0.13, 0.10];
      const tx = cx + 0.3;
      const wob = Math.sin(t * 1.1) * 0.015;
      const ride = 1.15;
      const B = (px, py, pz, sx, sy, sz, r, g, b, e, roll) =>
        R.push('box', 'opaque', tx + px, y + ride + py, pz, 0, 0, (roll || 0) + wob,
          sx, sy, sz, r, g, b, e || 0);

      // ladder chassis
      B(0, 0.28, -1.3, 5.8, 0.34, 2.2, 0.20, 0.19, 0.20);
      // body tub and cab
      B(-0.2, 0.85, -1.3, 5.2, 0.9, 2.5, body[0], body[1], body[2]);
      B(-0.5, 1.72, -1.3, 2.6, 0.95, 2.35, body[0] * 0.92, body[1] * 0.92, body[2] * 0.92);
      B(-0.5, 1.80, -0.16, 2.0, 0.66, 0.26, 0.16, 0.30, 0.38, 0.25);   // side glass
      B(-0.5, 2.24, -1.3, 2.7, 0.16, 2.45, 0.16, 0.15, 0.16);          // roof lip
      // bonnet, grille, exhaust stacks
      B(1.75, 1.28, -1.3, 1.5, 0.6, 2.3, body[0] * 0.82, body[1] * 0.82, body[2] * 0.82);
      B(2.6, 1.05, -1.3, 0.42, 1.05, 2.45, 0.30, 0.29, 0.31);
      for (const pz of [-0.5, -2.1]) {
        R.push('cyl', 'opaque', tx + 0.95, y + ride + 2.35, pz, 0, 0, 0,
          0.24, 1.5, 0.24, 0.36, 0.35, 0.37, 0);
      }
      // cargo bed with a cage, and the plow if it is fitted
      B(-2.1, 1.35, -1.3, 1.9, 0.12, 2.3, 0.30, 0.28, 0.26);
      for (const px of [-1.25, -2.95]) B(px, 1.75, -1.3, 0.14, 0.8, 2.3, 0.34, 0.32, 0.30);
      for (let i = 0; i < 4; i++) B(-2.9 + i * 0.55, 1.75, -0.2, 0.1, 0.8, 0.1, 0.34, 0.32, 0.30);
      if (meta.compLevel('plow') > 0 || meta.compLevel('w_spikes') > 0) {
        B(3.05, 0.95, -1.3, 0.5, 1.3, 2.6, 0.42, 0.40, 0.42, 0, 0.22);
        for (let i = 0; i < 5; i++) {
          R.push('cone', 'opaque', tx + 3.35, y + ride + 0.45 + i * 0.28, -2.2 + i * 0.45,
            0, 0, -TAU / 4, 0.28, 0.7, 0.28, 0.70, 0.72, 0.76, 0);
        }
      }
      // wheels: axles face the camera, so they read as wheels not slabs
      for (const px of [1.62, -1.72]) {
        for (const pz of [-0.15, -2.45]) {
          R.push('cyl', 'opaque', tx + px, y + 1.05, pz, 0, TAU / 4, t * 0.2,
            2.1, 0.85, 2.1, 0.075, 0.07, 0.075, 0);
          R.push('cyl', 'opaque', tx + px, y + 1.05, pz + (pz > -1 ? 0.24 : -0.24), 0, TAU / 4, t * 0.2,
            1.05, 0.36, 1.05, 0.58, 0.57, 0.60, 0);
          for (let i = 0; i < 5; i++) {
            R.push('box', 'opaque', tx + px, y + 1.05, pz + (pz > -1 ? 0.3 : -0.3),
              0, TAU / 4, t * 0.2 + i * (TAU / 5), 0.16, 0.9, 0.16, 0.34, 0.33, 0.35, 0);
          }
        }
      }
      // inspection lamp swinging over the engine bay
      const lamp = 0.55 + Math.sin(t * 2.1) * 0.12;
      R.push('sphere', 'glow', cx + 0.6, y + 2.4, -1.2, 0, 0, 0, 2.6, 2.0, 2.2,
        lamp * 0.55, lamp * 0.46, lamp * 0.22, 1);
    }

    /* --------------------------------------------------------- actors */
    lookOf(person) {
      const L = person.look || { skin: 0, hair: 0, shirt: 0, tall: 1 };
      const SKINS = [[0.86, 0.66, 0.50], [0.70, 0.50, 0.36], [0.52, 0.36, 0.25],
        [0.38, 0.26, 0.19], [0.92, 0.75, 0.62], [0.62, 0.44, 0.31]];
      const HAIRS = [[0.14, 0.11, 0.09], [0.30, 0.19, 0.10], [0.62, 0.50, 0.24],
        [0.42, 0.16, 0.10], [0.55, 0.55, 0.58]];
      const prof = M.PROF[person.prof];
      const shirt = hexRGB(prof ? prof.color : '#8899aa');
      return {
        skin: SKINS[L.skin % SKINS.length],
        hair: HAIRS[L.hair % HAIRS.length],
        shirt: [shirt[0] * 0.55, shirt[1] * 0.55, shirt[2] * 0.55],
        pants: [0.20, 0.21, 0.26],
        scale: L.tall,
      };
    }

    drawVillager(R, v) {
      const look = this.lookOf(v.p);
      A.draw(R, {
        x: v.x, y: v.y, z: 0.9, yaw: v.work ? Math.PI * 0.5 * 0 + 0.4 : (v.dir > 0 ? 1.1 : -1.1),
        scale: look.scale * 0.95, pose: v.pose || A.newPose(),
        skin: look.skin, shirt: look.shirt, pants: look.pants, hair: look.hair,
        gloves: v.work, helmet: v.work && v.p.prof === 'miner',
        shadow: false,
      });
    }

    drawPlayer(R) {
      A.draw(R, {
        x: this.px, y: this.py, z: 1.35, yaw: this.facing > 0 ? 1.35 : -1.35,
        scale: 1.06, pose: this.pose,
        skin: [0.80, 0.60, 0.46], shirt: [0.55, 0.16, 0.12], pants: [0.20, 0.22, 0.28],
        hair: [0.16, 0.12, 0.09], gear: [0.42, 0.40, 0.38],
        gloves: true, pack: true, shadow: false,
      });
      // a pool of light around the player so you can always find yourself
      R.push('sphere', 'glow', this.px, this.py + 1.0, 1.6, 0, 0, 0,
        3.4, 3.0, 2.0, 0.10, 0.085, 0.06, 1);
    }

    /* the surface above floor 0: the hatch you drive out of */
    drawSurface(R) {
      const y = floorY(0) + ROOM_H + 0.35;
      const w = M.COLS * CW + 16;
      const cx = (M.COLS - 1) * CW * 0.5;
      R.push('box', 'opaque', cx, y + 0.9, -1.4, 0, 0, 0, w, 1.6, DEPTH + 3,
        0.17, 0.14, 0.11, 0);
      R.push('box', 'opaque', cx, y + 1.75, -1.4, 0, 0, 0, w, 0.2, DEPTH + 3,
        0.26, 0.22, 0.15, 0);
      // ramp and blast door over the garage
      const g = this.meta.rooms.find((r) => r.id === 'garage');
      if (g) {
        const gx = colX(g.c) + (g.w - 1) * CW * 0.5;
        R.push('box', 'opaque', gx, y + 0.85, -1.4, 0, 0, 0, CW * 1.3, 1.9, DEPTH,
          0.05, 0.04, 0.04, 0);
        R.push('box', 'opaque', gx, y + 1.85, -1.4, 0, 0, 0, CW * 1.5, 0.4, DEPTH + 0.6,
          0.30, 0.29, 0.30, 0);
        R.push('box', 'glow', gx, y + 1.85, 1.2, 0, 0, 0, CW * 1.1, 0.16, 0.2,
          0.9, 0.55, 0.1, 1);
      }
      // dead trees and wreckage up top, for scale
      for (let i = 0; i < 9; i++) {
        const s = hash01(i * 199 + 7);
        const x = -8 + i * (w / 9) + s * 3;
        R.push('cyl', 'opaque', x, y + 2.6 + s * 1.2, -2.2, 0, 0, (s - 0.5) * 0.3,
          0.4, 2.4 + s * 2.2, 0.4, 0.20, 0.15, 0.11, 0);
        if (s > 0.5) {
          R.push('box', 'opaque', x + 1.4, y + 2.2, -1.0, 0, 0, s, 2.2, 1.0, 1.6,
            0.24, 0.20, 0.19, 0);
        }
      }
    }
  }

  function hexRGB(hex) {
    return [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ];
  }

  BA.Bunker = Bunker;
  BA.bunkerConst = { CW, CH, ROOM_H, SLAB, DEPTH, floorY, colX };
})();
