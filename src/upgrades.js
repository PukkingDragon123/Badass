/* BADASS APOCALYPSE - roguelite upgrade pool */
(function () {
  'use strict';
  const { rand, clamp } = BA;

  const WEAPONS = [
    {
      id: 'spikes', name: 'RAM SPIKES', icon: '🔱', max: 5, color: '#c9d4e2',
      desc: (l) => l === 0 ? 'Weld spikes to the bumper. Ramming hurts a LOT more.' : `+45% ram damage, longer spikes (Lv${l + 1})`,
    },
    {
      id: 'rocket', name: 'ROCKET LAUNCHER', icon: '🚀', max: 5, color: '#ff8a3d',
      desc: (l) => l === 0 ? 'Roof pod auto-fires homing rockets. Big boom.' : `Faster reload, +damage, more rockets (Lv${l + 1})`,
    },
    {
      id: 'saw', name: 'BUZZ SPIN', icon: '⚙️', max: 5, color: '#9ad6ff',
      desc: (l) => l === 0 ? 'Saw blades orbit the car and shred anything close.' : `+1 blade, wider orbit, +damage (Lv${l + 1})`,
    },
    {
      id: 'flame', name: 'FLAME EXHAUST', icon: '🔥', max: 5, color: '#ff5a2b',
      desc: (l) => l === 0 ? 'Leave a burning trail behind you. Cook the horde.' : `Bigger, hotter, longer-lasting fire (Lv${l + 1})`,
    },
    {
      id: 'minigun', name: 'ROOF MINIGUN', icon: '🔫', max: 5, color: '#ffd75e',
      desc: (l) => l === 0 ? 'Auto-tracking minigun. Never stops chewing.' : `Faster fire rate, +damage, +barrel (Lv${l + 1})`,
    },
    {
      id: 'tesla', name: 'TESLA COIL', icon: '⚡', max: 5, color: '#7fd4ff',
      desc: (l) => l === 0 ? 'Chain lightning that jumps between corpses-to-be.' : `+1 chain, +damage, slows targets (Lv${l + 1})`,
    },
    {
      id: 'mine', name: 'DROP MINES', icon: '💣', max: 5, color: '#ff6b6b',
      desc: (l) => l === 0 ? 'Drop proximity mines out the back. Rude.' : `Faster drops, bigger blast (Lv${l + 1})`,
    },
    {
      id: 'slam', name: 'SHOCK SLAM', icon: '💥', max: 5, color: '#c68bff',
      desc: (l) => l === 0 ? 'Landing from a jump detonates a shockwave. Auto-pulses too.' : `Bigger wave, more damage, faster pulse (Lv${l + 1})`,
    },
  ];

  const PASSIVES = [
    { id: 'engine', name: 'V8 ENGINE', icon: '🏎️', max: 5, color: '#ff4d4d', desc: () => '+12% top speed' },
    { id: 'turbo', name: 'TURBOCHARGER', icon: '🌀', max: 5, color: '#4dd2ff', desc: () => '+18% acceleration, +12% drift boost' },
    { id: 'grip', name: 'RACING TIRES', icon: '🛞', max: 5, color: '#b0b6c2', desc: () => '+16% grip, +8% steering' },
    { id: 'armor', name: 'ARMOR PLATING', icon: '🛡️', max: 5, color: '#8fd18f', desc: () => '+28 max HP, +6% damage resist, repairs 20' },
    { id: 'magnet', name: 'SCRAP MAGNET', icon: '🧲', max: 5, color: '#ff9ad5', desc: () => '+50% pickup range' },
    { id: 'overdrive', name: 'OVERDRIVE', icon: '☠️', max: 5, color: '#ffcf3d', desc: () => '+18% weapon damage' },
    { id: 'coolant', name: 'COOLANT TANK', icon: '❄️', max: 5, color: '#9fe8ff', desc: () => '+16% fire rate' },
    { id: 'lucky', name: 'LUCKY DICE', icon: '🎲', max: 5, color: '#d2a6ff', desc: () => '+25% scrap gained' },
    { id: 'hydraulics', name: 'HYDRAULICS', icon: '🦿', max: 5, color: '#7fffd4', desc: () => '+14% jump, +22% air control' },
    { id: 'ramplate', name: 'RAM PLATE', icon: '🪓', max: 5, color: '#e0a06a', desc: () => '+25% ram damage, tougher bumper' },
  ];

  const HEAL = {
    id: 'repair', name: 'FIELD REPAIR', icon: '🔧', max: Infinity, color: '#7dffa0',
    desc: () => 'Patch the wreck. Restore 45 HP right now.',
  };

  function levelOf(game, u) {
    if (u.id === 'repair') return 0;
    return game.weaponLevels[u.id] !== undefined ? game.weaponLevels[u.id] : (game.passiveLevels[u.id] || 0);
  }

  function roll(game, n) {
    const pool = [];
    const ownedWeapons = WEAPONS.filter((w) => game.weaponLevels[w.id] > 0).length;
    for (const w of WEAPONS) {
      const l = game.weaponLevels[w.id] || 0;
      if (l >= w.max) continue;
      // don't flood the player with brand-new weapons once they have a build
      let weight = l === 0 ? (ownedWeapons >= 5 ? 0.4 : 1.5) : 1.15;
      pool.push({ u: w, weight });
    }
    for (const p of PASSIVES) {
      const l = game.passiveLevels[p.id] || 0;
      if (l >= p.max) continue;
      pool.push({ u: p, weight: 1.0 });
    }
    if (game.car.hp < game.car.maxHp * 0.75) pool.push({ u: HEAL, weight: 0.9 + (1 - game.car.hp / game.car.maxHp) * 1.6 });

    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
      let total = 0;
      for (const p of pool) total += p.weight;
      let r = rand(total);
      let idx = 0;
      for (let j = 0; j < pool.length; j++) {
        r -= pool[j].weight;
        if (r <= 0) { idx = j; break; }
      }
      out.push(pool[idx].u);
      pool.splice(idx, 1);
    }
    if (!out.length) out.push(HEAL);
    return out;
  }

  function apply(game, u) {
    if (u.id === 'repair') {
      game.car.hp = Math.min(game.car.maxHp, game.car.hp + 45);
      game.fx.text(game.car.x, 3.2, game.car.z, '+45 HP', '#7dffa0', 26, 'big');
      return;
    }
    if (game.weaponLevels[u.id] !== undefined) {
      game.weaponLevels[u.id]++;
    } else {
      game.passiveLevels[u.id] = (game.passiveLevels[u.id] || 0) + 1;
    }
    game.recalcStats();
  }

  BA.upgrades = { WEAPONS, PASSIVES, HEAL, roll, apply, levelOf };
})();
