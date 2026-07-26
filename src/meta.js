/* BADASS APOCALYPSE - persistent meta layer: resources, truck components,
   the settlement, and everything that survives a run. */
(function () {
  'use strict';
  const { clamp, clamp01 } = BA;

  const SAVE_KEY = 'ba_save_v2';

  /* ------------------------------------------------------------ resources */
  const RES = [
    { id: 'scrap', name: 'SCRAP', icon: 'res_scrap', color: '#ffd23a' },
    { id: 'steel', name: 'STEEL', icon: 'res_steel', color: '#b8c4d4' },
    { id: 'food', name: 'FOOD', icon: 'res_food', color: '#8dff3a' },
    { id: 'meds', name: 'MEDS', icon: 'res_meds', color: '#ff6b8a' },
    { id: 'fuel', name: 'FUEL', icon: 'gas', color: '#ff9c1e' },
    { id: 'people', name: 'SURVIVORS', icon: 'res_people', color: '#7fd4ff' },
  ];

  /* ------------------------------------------------- truck components ---- */
  // cost(l) is the price to go from level l to l+1
  const COMPONENTS = [
    {
      id: 'engine', name: 'ENGINE BLOCK', icon: 'engine', max: 6, color: '#ff4d4d',
      desc: 'Bigger block, more top speed.',
      cost: (l) => ({ scrap: 40 + l * 55, steel: 10 + l * 22 }),
      effect: (l) => `Top speed +${l * 9}%`,
    },
    {
      id: 'turbo', name: 'TURBO KIT', icon: 'turbo', max: 6, color: '#4dd2ff',
      desc: 'Spools up faster off the line.',
      cost: (l) => ({ scrap: 35 + l * 48, steel: 8 + l * 18 }),
      effect: (l) => `Acceleration +${l * 12}%`,
    },
    {
      id: 'tires', name: 'OFFROAD TIRES', icon: 'grip', max: 6, color: '#b0b6c2',
      desc: 'Grip that actually holds a line.',
      cost: (l) => ({ scrap: 30 + l * 42, steel: 6 + l * 14 }),
      effect: (l) => `Grip +${l * 11}%, steering +${l * 6}%`,
    },
    {
      id: 'hydraulics', name: 'HYDRAULIC RAMS', icon: 'hydraulics', max: 5, color: '#7fffd4',
      desc: 'UNLOCKS JUMP. Slam the whole truck into the air.',
      cost: (l) => (l === 0 ? { scrap: 120, steel: 45 } : { scrap: 90 + l * 70, steel: 30 + l * 26 }),
      effect: (l) => (l === 0 ? 'Locked - no jump' : `Jump unlocked, height +${(l - 1) * 12}%`),
    },
    {
      id: 'plating', name: 'ARMOR PLATING', icon: 'armor', max: 6, color: '#8fd18f',
      desc: 'Welded scrap over every panel.',
      cost: (l) => ({ scrap: 45 + l * 50, steel: 18 + l * 26 }),
      effect: (l) => `+${l * 22} max HP, ${l * 4}% damage resist`,
    },
    {
      id: 'plow', name: 'RAM PLOW', icon: 'ramplate', max: 6, color: '#e0a06a',
      desc: 'A wedge of girders bolted to the nose.',
      cost: (l) => ({ scrap: 50 + l * 58, steel: 20 + l * 24 }),
      effect: (l) => `Ram damage +${l * 20}%`,
    },
    {
      id: 'tank', name: 'FUEL CELL', icon: 'gas', max: 6, color: '#ffb03a',
      desc: 'More gas, and it comes back faster.',
      cost: (l) => ({ scrap: 30 + l * 40, fuel: 20 + l * 30 }),
      effect: (l) => `Gas capacity +${l * 18}%, refill +${l * 25}%`,
    },
    {
      id: 'bed', name: 'CARGO BED', icon: 'res_people', max: 6, color: '#7fd4ff',
      desc: 'Cages and benches. Room for the rescued.',
      cost: (l) => ({ scrap: 55 + l * 60, steel: 22 + l * 30 }),
      effect: (l) => `Carries ${2 + l * 2} survivors, +${l * 15}% haul`,
    },
    {
      id: 'magnet', name: 'SALVAGE RIG', icon: 'magnet', max: 6, color: '#ff9ad5',
      desc: 'Electromagnet on a boom arm.',
      cost: (l) => ({ scrap: 35 + l * 44, steel: 12 + l * 16 }),
      effect: (l) => `Pickup range +${l * 30}%, +${l * 12}% loot`,
    },
    {
      id: 'mount', name: 'WEAPON MOUNT', icon: 'minigun', max: 4, color: '#ffd75e',
      desc: 'Hardpoints. Start every run already armed.',
      cost: (l) => ({ scrap: 90 + l * 110, steel: 40 + l * 55 }),
      effect: (l) => (l === 0 ? 'No hardpoints' : `Start runs with ${l} weapon${l > 1 ? 's' : ''} at Lv1`),
    },
    {
      id: 'nos', name: 'NOS INJECTOR', icon: 'coolant', max: 5, color: '#9fe8ff',
      desc: 'Direct-port nitrous. Terrifying.',
      cost: (l) => ({ scrap: 60 + l * 66, fuel: 30 + l * 40 }),
      effect: (l) => `Nitrous power +${l * 14}%`,
    },
  ];

  /* ------------------------------------------------------- base buildings */
  // prod is per real-time minute at level 1 with no workers
  const BUILDINGS = [
    {
      id: 'hq', name: 'COMMAND POST', icon: 'bld_hq', max: 8, color: '#ffd23a', unique: true,
      desc: 'The heart of the settlement. Raises every other cap.',
      cost: (l) => ({ scrap: 150 + l * 220, steel: 60 + l * 110, food: 40 + l * 80 }),
      slots: (l) => 0, prod: null,
      effect: (l) => `Settlement rank ${l}, +${l * 10}% all production`,
    },
    {
      id: 'house', name: 'BUNKHOUSE', icon: 'bld_house', max: 6, color: '#9ad6ff',
      desc: 'Beds. Every survivor needs one or they will not stay.',
      cost: (l) => ({ scrap: 60 + l * 70, steel: 15 + l * 25, food: 20 + l * 30 }),
      slots: () => 0, prod: null,
      effect: (l) => `Houses ${l * 4} survivors`,
    },
    {
      id: 'farm', name: 'HYDRO FARM', icon: 'bld_farm', max: 6, color: '#8dff3a',
      desc: 'Grow lights and rainwater. Feeds the settlement.',
      cost: (l) => ({ scrap: 70 + l * 80, steel: 20 + l * 30 }),
      slots: (l) => l, prod: { food: 26 },
      effect: (l) => `+${26 * l} food/min`,
    },
    {
      id: 'workshop', name: 'WORKSHOP', icon: 'bld_workshop', max: 6, color: '#ffd23a',
      desc: 'Strips wrecks down into usable scrap.',
      cost: (l) => ({ scrap: 80 + l * 95, steel: 25 + l * 35 }),
      slots: (l) => l, prod: { scrap: 22 },
      effect: (l) => `+${22 * l} scrap/min`,
    },
    {
      id: 'foundry', name: 'FOUNDRY', icon: 'bld_foundry', max: 6, color: '#ff8a3d',
      desc: 'Melts salvage into plate steel.',
      cost: (l) => ({ scrap: 120 + l * 130, steel: 40 + l * 50, food: 30 + l * 30 }),
      slots: (l) => l, prod: { steel: 11 },
      effect: (l) => `+${11 * l} steel/min`,
    },
    {
      id: 'refinery', name: 'REFINERY', icon: 'bld_refinery', max: 6, color: '#ff9c1e',
      desc: 'Cracks anything flammable into truck fuel.',
      cost: (l) => ({ scrap: 110 + l * 120, steel: 45 + l * 55 }),
      slots: (l) => l, prod: { fuel: 15 },
      effect: (l) => `+${15 * l} fuel/min`,
    },
    {
      id: 'infirmary', name: 'INFIRMARY', icon: 'bld_infirmary', max: 6, color: '#ff6b8a',
      desc: 'Patches people up and brews medicine.',
      cost: (l) => ({ scrap: 100 + l * 110, steel: 30 + l * 40, food: 40 + l * 45 }),
      slots: (l) => l, prod: { meds: 7 },
      effect: (l) => `+${7 * l} meds/min, +${l * 6}% run start HP`,
    },
    {
      id: 'watchtower', name: 'WATCHTOWER', icon: 'bld_tower', max: 6, color: '#c9d4e2',
      desc: 'Spotters mark the horde before it reaches you.',
      cost: (l) => ({ scrap: 90 + l * 100, steel: 35 + l * 45 }),
      slots: (l) => Math.ceil(l / 2), prod: null,
      effect: (l) => `+${l * 8}% run scrap, marks objectives further out`,
    },
    {
      id: 'storage', name: 'DEPOT', icon: 'bld_storage', max: 6, color: '#b8c4d4',
      desc: 'Somewhere to put it all.',
      cost: (l) => ({ scrap: 70 + l * 75, steel: 25 + l * 30 }),
      slots: () => 0, prod: null,
      effect: (l) => `+${l * 700} storage on every resource`,
    },
    {
      id: 'garage', name: 'HOME GARAGE', icon: 'bld_garage', max: 6, color: '#ff4d4d',
      desc: 'Cheaper truck work and a stronger chassis.',
      cost: (l) => ({ scrap: 130 + l * 140, steel: 55 + l * 65 }),
      slots: (l) => Math.ceil(l / 2), prod: null,
      effect: (l) => `Component costs -${l * 6}%, +${l * 4} truck HP`,
    },
    /* --- decoration: small morale bonus, mostly for making it yours --- */
    {
      id: 'campfire', name: 'CAMPFIRE', icon: 'bld_fire', max: 3, color: '#ff8a3d', decor: true,
      desc: 'Somewhere to sit. Morale is a production stat.',
      cost: (l) => ({ scrap: 25 + l * 30, food: 15 + l * 20 }),
      slots: () => 0, prod: null,
      effect: (l) => `+${l * 3}% all production`,
    },
    {
      id: 'garden', name: 'GARDEN', icon: 'bld_garden', max: 3, color: '#7fffd4', decor: true,
      desc: 'Green things, kept alive on purpose.',
      cost: (l) => ({ scrap: 30 + l * 32, food: 25 + l * 25 }),
      slots: () => 0, prod: null,
      effect: (l) => `+${l * 3}% all production`,
    },
    {
      id: 'statue', name: 'MEMORIAL', icon: 'bld_statue', max: 3, color: '#d2a6ff', decor: true,
      desc: 'For the ones who did not make it back.',
      cost: (l) => ({ scrap: 45 + l * 50, steel: 20 + l * 22 }),
      slots: () => 0, prod: null,
      effect: (l) => `+${l * 4}% all production`,
    },
  ];

  const BLD = {};
  for (const b of BUILDINGS) BLD[b.id] = b;
  const COMP = {};
  for (const c of COMPONENTS) COMP[c.id] = c;

  const GRID = 7;                 // base is GRID x GRID tiles
  const BASE_CAP = 900;

  class Meta {
    constructor() {
      this.res = { scrap: 0, steel: 0, food: 0, meds: 0, fuel: 0, people: 0 };
      this.components = {};
      this.tiles = [];            // { id, level, x, y, workers }
      this.runs = 0;
      this.bestScore = 0;
      this.totalKills = 0;
      this.totalRescued = 0;
      this.lastTick = Date.now();
      this.seen = {};             // one-time tutorial flags
      this.load();
    }

    /* ---------------------------------------------------------- storage */
    load() {
      let raw = null;
      try { raw = localStorage.getItem(SAVE_KEY); } catch (_) { /* private mode */ }
      if (raw) {
        try {
          const d = JSON.parse(raw);
          Object.assign(this.res, d.res || {});
          this.components = d.components || {};
          this.tiles = d.tiles || [];
          this.runs = d.runs || 0;
          this.bestScore = d.bestScore || 0;
          this.totalKills = d.totalKills || 0;
          this.totalRescued = d.totalRescued || 0;
          this.lastTick = d.lastTick || Date.now();
          this.seen = d.seen || {};
        } catch (_) { /* corrupt save, start fresh */ }
      }
      if (!this.tiles.length) this.seedBase();
      this.catchUp();
    }

    save() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
          res: this.res, components: this.components, tiles: this.tiles,
          runs: this.runs, bestScore: this.bestScore, totalKills: this.totalKills,
          totalRescued: this.totalRescued, lastTick: this.lastTick, seen: this.seen,
        }));
      } catch (_) { /* nothing we can do about a full quota */ }
    }

    seedBase() {
      const c = (GRID - 1) / 2;
      this.tiles = [{ id: 'hq', level: 1, x: c, y: c, workers: 0 }];
      this.res.scrap = 140;
      this.res.steel = 40;
      this.res.food = 60;
      this.res.fuel = 40;
      this.res.people = 2;
    }

    /* ------------------------------------------------------- production */
    get rank() {
      const hq = this.tiles.find((t) => t.id === 'hq');
      return hq ? hq.level : 1;
    }

    get moraleMul() {
      let m = 1 + this.rank * 0.10;
      for (const t of this.tiles) {
        if (!BLD[t.id] || !BLD[t.id].decor) continue;
        m += t.level * (t.id === 'statue' ? 0.04 : 0.03);
      }
      return m;
    }

    get housing() {
      let n = 2;
      for (const t of this.tiles) if (t.id === 'house') n += t.level * 4;
      return n;
    }

    get workerSlots() {
      let n = 0;
      for (const t of this.tiles) {
        const b = BLD[t.id];
        if (b && b.slots) n += b.slots(t.level);
      }
      return n;
    }

    get assigned() {
      let n = 0;
      for (const t of this.tiles) n += t.workers || 0;
      return n;
    }

    get idleWorkers() { return Math.max(0, Math.floor(this.res.people) - this.assigned); }

    cap(id) {
      if (id === 'people') return this.housing;
      let c = BASE_CAP;
      for (const t of this.tiles) if (t.id === 'storage') c += t.level * 700;
      return c + this.rank * 250;
    }

    /* resources produced per minute, as a plain object */
    rates() {
      const out = {};
      const mul = this.moraleMul;
      for (const t of this.tiles) {
        const b = BLD[t.id];
        if (!b || !b.prod) continue;
        const workerMul = 1 + (t.workers || 0) * 0.5;
        for (const k in b.prod) {
          out[k] = (out[k] || 0) + b.prod[k] * t.level * workerMul * mul;
        }
      }
      // people eat
      const eaters = Math.floor(this.res.people);
      out.food = (out.food || 0) - eaters * 1.6;
      return out;
    }

    /* accrue offline production, capped so leaving it for a month is not a win */
    catchUp() {
      const now = Date.now();
      const mins = clamp((now - this.lastTick) / 60000, 0, 60 * 8);
      this.lastTick = now;
      if (mins > 0.01) this.produce(mins);
      return mins;
    }

    tick(dtSeconds) {
      this.produce(dtSeconds / 60);
      this.lastTick = Date.now();
    }

    produce(minutes) {
      const r = this.rates();
      for (const k in r) {
        this.res[k] = clamp((this.res[k] || 0) + r[k] * minutes, 0, this.cap(k));
      }
      if (this.res.food <= 0) this.res.food = 0;
    }

    /* ------------------------------------------------------- transactions */
    can(cost) {
      for (const k in cost) if ((this.res[k] || 0) < cost[k]) return false;
      return true;
    }

    spend(cost) {
      if (!this.can(cost)) return false;
      for (const k in cost) this.res[k] -= cost[k];
      this.save();
      return true;
    }

    add(id, amount) {
      this.res[id] = clamp((this.res[id] || 0) + amount, 0, this.cap(id));
    }

    /* ------------------------------------------------------- components */
    compLevel(id) { return this.components[id] || 0; }

    compCost(id) {
      const c = COMP[id];
      const l = this.compLevel(id);
      if (!c || l >= c.max) return null;
      const raw = c.cost(l);
      let discount = 0;
      for (const t of this.tiles) if (t.id === 'garage') discount = t.level * 0.06;
      const out = {};
      for (const k in raw) out[k] = Math.max(1, Math.round(raw[k] * (1 - discount)));
      return out;
    }

    buyComponent(id) {
      const cost = this.compCost(id);
      if (!cost || !this.spend(cost)) return false;
      this.components[id] = this.compLevel(id) + 1;
      this.save();
      return true;
    }

    /* --------------------------------------------------------- buildings */
    tileAt(x, y) { return this.tiles.find((t) => t.x === x && t.y === y); }

    buildCost(id, level) {
      const b = BLD[id];
      if (!b) return null;
      return b.cost(level);
    }

    place(id, x, y) {
      const b = BLD[id];
      if (!b || this.tileAt(x, y)) return false;
      if (b.unique && this.tiles.some((t) => t.id === id)) return false;
      const cost = this.buildCost(id, 0);
      if (!this.spend(cost)) return false;
      this.tiles.push({ id, level: 1, x, y, workers: 0, born: Date.now() });
      this.save();
      return true;
    }

    upgrade(t) {
      const b = BLD[t.id];
      if (!b || t.level >= b.max) return false;
      const cost = this.buildCost(t.id, t.level);
      if (!this.spend(cost)) return false;
      t.level++;
      this.save();
      return true;
    }

    demolish(t) {
      if (BLD[t.id] && BLD[t.id].unique) return false;
      const i = this.tiles.indexOf(t);
      if (i < 0) return false;
      this.tiles.splice(i, 1);
      this.add('scrap', 20 * t.level);
      this.save();
      return true;
    }

    assign(t, delta) {
      const b = BLD[t.id];
      if (!b || !b.slots) return false;
      const max = b.slots(t.level);
      const want = clamp((t.workers || 0) + delta, 0, max);
      if (delta > 0 && this.idleWorkers <= 0) return false;
      t.workers = want;
      this.save();
      return true;
    }

    /* -------------------------------------------------- derived run stats */
    truckStats() {
      const L = (id) => this.compLevel(id);
      let garageHp = 0;
      for (const t of this.tiles) if (t.id === 'garage') garageHp = t.level * 4;
      let infirmary = 0;
      for (const t of this.tiles) if (t.id === 'infirmary') infirmary = t.level * 0.06;
      let towerBonus = 0;
      for (const t of this.tiles) if (t.id === 'watchtower') towerBonus = t.level * 0.08;

      return {
        speedMul: 1 + L('engine') * 0.09,
        accelMul: 1 + L('turbo') * 0.12,
        gripMul: 1 + L('tires') * 0.11,
        turnMul: 1 + L('tires') * 0.06,
        canJump: L('hydraulics') > 0,
        jumpMul: 1 + Math.max(0, L('hydraulics') - 1) * 0.12,
        hp: 80 + L('plating') * 22 + garageHp,
        armor: L('plating') * 0.04,
        ramMul: 1 + L('plow') * 0.20,
        fuelMul: 1 + L('tank') * 0.18,
        fuelRegenMul: 1 + L('tank') * 0.25,
        cargo: 2 + L('bed') * 2,
        haulMul: 1 + L('bed') * 0.15 + L('magnet') * 0.12 + towerBonus,
        magnetMul: 1 + L('magnet') * 0.30,
        startWeapons: L('mount'),
        nosMul: 1 + L('nos') * 0.14,
        startHpMul: 1 + infirmary,
      };
    }
  }

  BA.meta = { RES, COMPONENTS, BUILDINGS, BLD, COMP, GRID, Meta };
})();
