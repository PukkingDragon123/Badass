/* BADASS APOCALYPSE - persistent meta layer: the resource chain, the bunker
   and its rooms, truck components, and everything that survives a run. */
(function () {
  'use strict';
  const { clamp } = BA;

  const SAVE_KEY = 'ba_save_v4';

  /* ------------------------------------------------------------ resources
     Three tiers. Tier 0 comes out of the ground or off the road, tier 1 is
     made from tier 0 in a processing room, tier 2 is made from tier 1. Almost
     nothing worth having is buyable with what you can pick up directly. */
  const RES = [
    { id: 'wood', name: 'WOOD', icon: 'res_wood', color: '#c07d3e', tier: 0 },
    { id: 'ore', name: 'ORE', icon: 'res_ore', color: '#8f9dae', tier: 0 },
    { id: 'stone', name: 'STONE', icon: 'res_stone', color: '#a49c96', tier: 0 },
    { id: 'scrap', name: 'SCRAP', icon: 'res_scrap', color: '#ffd23a', tier: 0 },
    { id: 'fuel', name: 'FUEL', icon: 'gas', color: '#ff9c1e', tier: 0 },
    { id: 'food', name: 'FOOD', icon: 'res_food', color: '#8dff3a', tier: 0 },

    { id: 'planks', name: 'PLANKS', icon: 'res_planks', color: '#e0a45a', tier: 1 },
    { id: 'metal', name: 'METAL', icon: 'res_metal', color: '#c8d4e4', tier: 1 },
    { id: 'nails', name: 'NAILS', icon: 'res_nails', color: '#e6eaf2', tier: 1 },
    { id: 'bolts', name: 'BOLTS', icon: 'res_bolts', color: '#9fb0c6', tier: 1 },
    { id: 'concrete', name: 'CONCRETE', icon: 'res_concrete', color: '#b9b6ae', tier: 1 },

    { id: 'parts', name: 'PARTS', icon: 'res_parts', color: '#7fd4ff', tier: 2 },
    { id: 'ammo', name: 'AMMO', icon: 'res_ammo', color: '#ff6b6b', tier: 2 },
    { id: 'tech', name: 'TECH', icon: 'res_tech', color: '#d47bff', tier: 2 },

    { id: 'people', name: 'CREW', icon: 'res_people', color: '#7fd4ff', tier: 3, crew: true },
  ];
  const RESBY = {};
  for (const r of RES) RESBY[r.id] = r;

  /* ---------------------------------------------------------- bunker rooms
     Every room is one of exactly three kinds:
       produce - pulls a raw resource out of the ground on its own
       process - turns one tier into the next
       special - does something that is not a rate: the truck, research, guns  */
  const ROOMS = [
    /* ------------------------------------------------------------ produce */
    {
      id: 'lumber', cat: 'produce', name: 'TIMBER SHAFT', icon: 'rm_lumber', color: '#c07d3e',
      desc: 'Cuts props and joists out of the old forest above the roof line.',
      out: { wood: 20 }, crew: 2, power: 1,
      cost: (l) => ({ scrap: 40 + l * 46, stone: 10 + l * 24 }),
    },
    {
      id: 'mine', cat: 'produce', name: 'MINE SHAFT', icon: 'rm_mine', color: '#8f9dae',
      desc: 'Follows the seam down. Everything metal starts here.',
      out: { ore: 16 }, crew: 2, power: 2,
      cost: (l) => ({ scrap: 55 + l * 58, wood: 25 + l * 30 }),
    },
    {
      id: 'quarry', cat: 'produce', name: 'STONE QUARRY', icon: 'rm_quarry', color: '#a49c96',
      desc: 'Hacks blocks out of the bedrock the bunker is cut into.',
      out: { stone: 15 }, crew: 2, power: 1,
      cost: (l) => ({ scrap: 45 + l * 48, wood: 20 + l * 26 }),
    },
    {
      id: 'salvage', cat: 'produce', name: 'SALVAGE BAY', icon: 'rm_salvage', color: '#ffd23a',
      desc: 'Strips the wrecks you haul home back into usable scrap.',
      out: { scrap: 18 }, crew: 2, power: 1,
      cost: (l) => ({ scrap: 50 + l * 52, planks: 8 + l * 14 }),
    },
    {
      id: 'hydro', cat: 'produce', name: 'HYDROPONICS', icon: 'rm_hydro', color: '#8dff3a',
      desc: 'Grow racks under sun lamps. Crew that does not eat does not work.',
      out: { food: 24 }, crew: 2, power: 3,
      cost: (l) => ({ scrap: 60 + l * 62, planks: 12 + l * 18, metal: 4 + l * 10 }),
    },
    {
      id: 'derrick', cat: 'produce', name: 'FUEL DERRICK', icon: 'rm_derrick', color: '#ff9c1e',
      desc: 'Taps the tank farm buried under the east wall.',
      out: { fuel: 10 }, crew: 2, power: 3,
      cost: (l) => ({ scrap: 90 + l * 88, metal: 20 + l * 28, concrete: 10 + l * 16 }),
    },

    /* ------------------------------------------------------------ process */
    {
      id: 'sawmill', cat: 'process', name: 'SAWMILL', icon: 'rm_sawmill', color: '#e0a45a',
      desc: 'Wood in, planks out. The first thing you should build.',
      in: { wood: 14 }, out: { planks: 9 }, crew: 2, power: 2,
      cost: (l) => ({ scrap: 55 + l * 55, wood: 30 + l * 34 }),
    },
    {
      id: 'smelter', cat: 'process', name: 'SMELTER', icon: 'rm_smelter', color: '#c8d4e4',
      desc: 'Cooks raw ore down into clean metal stock.',
      in: { ore: 13, fuel: 2 }, out: { metal: 8 }, crew: 2, power: 4,
      cost: (l) => ({ scrap: 80 + l * 78, stone: 40 + l * 42, planks: 12 + l * 16 }),
    },
    {
      id: 'nailery', cat: 'process', name: 'NAIL PRESS', icon: 'rm_nailery', color: '#e6eaf2',
      desc: 'Draws wire and chops it. Nails hold the whole bunker together.',
      in: { metal: 5 }, out: { nails: 18 }, crew: 1, power: 2,
      cost: (l) => ({ scrap: 70 + l * 70, metal: 16 + l * 22, planks: 10 + l * 14 }),
    },
    {
      id: 'machine', cat: 'process', name: 'MACHINE SHOP', icon: 'rm_machine', color: '#9fb0c6',
      desc: 'Threads bar stock into bolts. Nothing heavy gets built without them.',
      in: { metal: 6 }, out: { bolts: 12 }, crew: 2, power: 3,
      cost: (l) => ({ scrap: 95 + l * 92, metal: 22 + l * 28, nails: 20 + l * 26 }),
    },
    {
      id: 'mixer', cat: 'process', name: 'CONCRETE MIXER', icon: 'rm_mixer', color: '#b9b6ae',
      desc: 'Stone and grit into pour. Deep floors will not hold without it.',
      in: { stone: 16, scrap: 4 }, out: { concrete: 9 }, crew: 2, power: 3,
      cost: (l) => ({ scrap: 85 + l * 84, planks: 18 + l * 22, nails: 24 + l * 28 }),
    },
    {
      id: 'assembly', cat: 'process', name: 'ASSEMBLY LINE', icon: 'rm_assembly', color: '#7fd4ff',
      desc: 'Planks, bolts and nails become truck parts. The garage runs on these.',
      in: { planks: 6, bolts: 5, nails: 8 }, out: { parts: 3 }, crew: 3, power: 5,
      cost: (l) => ({ scrap: 140 + l * 130, metal: 45 + l * 50, bolts: 30 + l * 36, concrete: 15 + l * 22 }),
    },

    /* ------------------------------------------------------------ special */
    {
      id: 'quarters', cat: 'special', name: 'CREW QUARTERS', icon: 'rm_quarters', color: '#9ad6ff',
      desc: 'Bunks. Every survivor you pull off the road needs one waiting.',
      crew: 0, power: 1, house: 4,
      cost: (l) => ({ scrap: 45 + l * 50, planks: 14 + l * 20, nails: 18 + l * 24 }),
      effect: (l) => `Sleeps ${l * 4}`,
    },
    {
      id: 'generator', cat: 'special', name: 'GENERATOR', icon: 'rm_generator', color: '#ffd23a',
      desc: 'Burns fuel for the whole bunker. Everything else is dead without it.',
      in: { fuel: 4 }, crew: 1, power: -14,
      cost: (l) => ({ scrap: 70 + l * 72, metal: 18 + l * 26, concrete: 8 + l * 16 }),
      effect: (l) => `+${14 * l} power, burns ${4 * l} fuel/min`,
    },
    {
      id: 'garage', cat: 'special', name: 'GARAGE', icon: 'rm_garage', color: '#ff4d4d',
      desc: 'The truck lives here. Bolt on everything you have been hauling home.',
      crew: 1, power: 3, screen: 'garage',
      cost: (l) => ({ scrap: 120 + l * 120, metal: 35 + l * 42, bolts: 25 + l * 30, concrete: 20 + l * 26 }),
      effect: (l) => `Component costs -${l * 5}%, +${l * 5} truck HP`,
    },
    {
      id: 'lab', cat: 'special', name: 'RESEARCH LAB', icon: 'rm_lab', color: '#d47bff',
      desc: 'Turns parts into blueprints. Blueprints unlock the hardware nobody else has.',
      in: { parts: 1, metal: 3 }, out: { tech: 1 }, crew: 2, power: 6, screen: 'lab',
      cost: (l) => ({ scrap: 180 + l * 170, metal: 60 + l * 64, parts: 8 + l * 12, concrete: 30 + l * 34 }),
      effect: (l) => `+${l} tech/min, unlocks tier ${l} blueprints`,
    },
    {
      id: 'armory', cat: 'special', name: 'ARMORY', icon: 'rm_armory', color: '#ff6b6b',
      desc: 'Makes the ammunition and builds every gun the truck carries.',
      in: { metal: 4, bolts: 3 }, out: { ammo: 14 }, crew: 2, power: 4, screen: 'armory',
      cost: (l) => ({ scrap: 150 + l * 145, metal: 50 + l * 55, bolts: 35 + l * 40, concrete: 25 + l * 30 }),
      effect: (l) => `+${14 * l} ammo/min, weapon tier ${l}`,
    },
  ];
  const ROOM = {};
  for (const r of ROOMS) {
    if (!r.effect) {
      r.effect = (l) => {
        const bits = [];
        if (r.out) for (const k in r.out) bits.push(`+${Math.round(r.out[k] * l)} ${RESBY[k].name}/min`);
        if (r.in) for (const k in r.in) bits.push(`-${Math.round(r.in[k] * l)} ${RESBY[k].name}/min`);
        return bits.join(' · ') || `Level ${l}`;
      };
    }
    r.max = r.max || 5;
    ROOM[r.id] = r;
  }
  const CATS = [
    { id: 'produce', name: 'PRODUCTION', color: '#8dff3a', blurb: 'Pulls raw material out of the ground' },
    { id: 'process', name: 'PROCESSING', color: '#7fd4ff', blurb: 'Refines one tier into the next' },
    { id: 'special', name: 'SPECIAL', color: '#ff8a3d', blurb: 'Truck, research and weapons' },
  ];

  /* ------------------------------------------------- truck components ---- */
  const COMPONENTS = [
    {
      id: 'engine', name: 'ENGINE BLOCK', icon: 'engine', max: 6, color: '#ff4d4d',
      desc: 'Bigger block, more top speed.',
      cost: (l) => ({ metal: 24 + l * 30, bolts: 16 + l * 20, parts: 2 + l * 3 }),
      effect: (l) => `Top speed +${l * 9}%`,
    },
    {
      id: 'turbo', name: 'TURBO KIT', icon: 'turbo', max: 6, color: '#4dd2ff',
      desc: 'Spools up faster off the line.',
      cost: (l) => ({ metal: 20 + l * 26, bolts: 14 + l * 18, parts: 2 + l * 3 }),
      effect: (l) => `Acceleration +${l * 12}%`,
    },
    {
      id: 'tires', name: 'OFFROAD TIRES', icon: 'grip', max: 6, color: '#b0b6c2',
      desc: 'Grip that actually holds a line.',
      cost: (l) => ({ scrap: 60 + l * 70, metal: 14 + l * 18, bolts: 10 + l * 14 }),
      effect: (l) => `Grip +${l * 11}%, steering +${l * 6}%`,
    },
    {
      id: 'hydraulics', name: 'HYDRAULIC RAMS', icon: 'hydraulics', max: 5, color: '#7fffd4',
      desc: 'UNLOCKS JUMP. Slams the whole truck into the air.',
      cost: (l) => (l === 0
        ? { metal: 45, bolts: 40, parts: 6 }
        : { metal: 34 + l * 32, bolts: 28 + l * 26, parts: 4 + l * 4 }),
      effect: (l) => (l === 0 ? 'Locked - no jump' : `Jump unlocked, height +${(l - 1) * 12}%`),
    },
    {
      id: 'plating', name: 'ARMOR PLATING', icon: 'armor', max: 6, color: '#8fd18f',
      desc: 'Welded plate over every panel.',
      cost: (l) => ({ metal: 30 + l * 36, nails: 40 + l * 46, bolts: 12 + l * 16 }),
      effect: (l) => `+${l * 22} max HP, ${l * 4}% damage resist`,
    },
    {
      id: 'plow', name: 'RAM PLOW', icon: 'ramplate', max: 6, color: '#e0a06a',
      desc: 'A wedge of girders bolted to the nose.',
      cost: (l) => ({ metal: 28 + l * 34, bolts: 22 + l * 26, concrete: 8 + l * 12 }),
      effect: (l) => `Ram damage +${l * 20}%`,
    },
    {
      id: 'tank', name: 'FUEL CELL', icon: 'gas', max: 6, color: '#ffb03a',
      desc: 'More gas, and it comes back faster.',
      cost: (l) => ({ metal: 18 + l * 22, fuel: 30 + l * 36, bolts: 8 + l * 12 }),
      effect: (l) => `Gas capacity +${l * 18}%, refill +${l * 25}%`,
    },
    {
      id: 'bed', name: 'CARGO BED', icon: 'res_people', max: 6, color: '#7fd4ff',
      desc: 'Cages and benches. Room for the rescued.',
      cost: (l) => ({ planks: 30 + l * 34, nails: 45 + l * 50, bolts: 14 + l * 18 }),
      effect: (l) => `Carries ${2 + l * 2} survivors, +${l * 15}% haul`,
    },
    {
      id: 'magnet', name: 'SALVAGE RIG', icon: 'magnet', max: 6, color: '#ff9ad5',
      desc: 'Electromagnet on a boom arm.',
      cost: (l) => ({ metal: 22 + l * 26, parts: 2 + l * 3, bolts: 12 + l * 16 }),
      effect: (l) => `Pickup range +${l * 30}%, +${l * 12}% loot`,
    },
    {
      id: 'mount', name: 'WEAPON MOUNT', icon: 'minigun', max: 4, color: '#ffd75e',
      desc: 'Hardpoints. More guns can be bolted on at once.',
      cost: (l) => ({ metal: 55 + l * 60, bolts: 40 + l * 44, parts: 5 + l * 6 }),
      effect: (l) => (l === 0 ? 'One hardpoint' : `${1 + l} hardpoints`),
    },
    {
      id: 'nos', name: 'NOS INJECTOR', icon: 'coolant', max: 5, color: '#9fe8ff',
      desc: 'UNLOCKS NITROUS. Direct-port injection. Terrifying.',
      cost: (l) => (l === 0
        ? { metal: 40, fuel: 70, parts: 5 }
        : { metal: 30 + l * 32, fuel: 40 + l * 44, parts: 3 + l * 4 }),
      effect: (l) => (l === 0 ? 'Locked - no nitrous' : `Nitrous unlocked, power +${(l - 1) * 14}%`),
    },
  ];

  /* Weapons are components too. There is no in-run levelling: the only way to
     arm the truck is to build the hardware in the armory. */
  const WEAPON_COMPONENTS = [
    { id: 'w_spikes', w: 'spikes', name: 'RAM SPIKES', icon: 'spikes', color: '#c9d4e2', tech: 0, chassis: true,
      desc: 'Spiked bumper. Turns the nose into the primary weapon.',
      cost: (l) => ({ metal: 16 + l * 20, bolts: 12 + l * 15 }) },
    { id: 'w_minigun', w: 'minigun', name: 'ROOF MINIGUN', icon: 'minigun', color: '#ffd75e', tech: 0,
      desc: 'Auto-tracking gun. Never stops chewing.',
      cost: (l) => ({ metal: 26 + l * 30, bolts: 20 + l * 24, ammo: 40 + l * 46 }) },
    { id: 'w_saw', w: 'saw', name: 'BUZZ SPIN', icon: 'saw', color: '#9ad6ff', tech: 1,
      desc: 'Saw blades orbiting the truck on boom arms.',
      cost: (l) => ({ metal: 32 + l * 36, bolts: 26 + l * 30, parts: 2 + l * 3 }) },
    { id: 'w_flame', w: 'flame', name: 'FLAME EXHAUST', icon: 'flame', color: '#ff5a2b', tech: 1,
      desc: 'Dumps burning fuel out the back.',
      cost: (l) => ({ metal: 28 + l * 32, fuel: 50 + l * 55, bolts: 18 + l * 22 }) },
    { id: 'w_rocket', w: 'rocket', name: 'ROCKET POD', icon: 'rocket', color: '#ff8a3d', tech: 2,
      desc: 'Roof pod of homing rockets.',
      cost: (l) => ({ metal: 45 + l * 50, ammo: 70 + l * 80, parts: 4 + l * 5 }) },
    { id: 'w_mine', w: 'mine', name: 'MINE DROPPER', icon: 'mine', color: '#ff6b6b', tech: 2,
      desc: 'Kicks proximity mines out the back.',
      cost: (l) => ({ metal: 38 + l * 44, ammo: 55 + l * 62, bolts: 24 + l * 28 }) },
    { id: 'w_tesla', w: 'tesla', name: 'TESLA COIL', icon: 'tesla', color: '#7fd4ff', tech: 3,
      desc: 'Chain lightning between anything close enough.',
      cost: (l) => ({ metal: 55 + l * 60, parts: 6 + l * 8, tech: 2 + l * 3 }) },
    { id: 'w_slam', w: 'slam', name: 'SHOCK SLAM', icon: 'slam', color: '#c68bff', tech: 3,
      desc: 'Ground-pound shockwave on landing, and an auto-pulse.',
      cost: (l) => ({ metal: 58 + l * 64, concrete: 30 + l * 36, parts: 6 + l * 8 }) },
    { id: 'w_drone', w: 'drone', name: 'DRONE SWARM', icon: 'drone', color: '#63d3ff', tech: 4,
      desc: 'Gun drones that pick their own targets.',
      cost: (l) => ({ metal: 70 + l * 76, parts: 9 + l * 11, tech: 4 + l * 5, ammo: 60 + l * 70 }) },
    { id: 'w_laser', w: 'laser', name: 'LASER ARRAY', icon: 'laser', color: '#d47bff', tech: 5,
      desc: 'Continuous beam that burns clean through a line.',
      cost: (l) => ({ metal: 85 + l * 90, parts: 12 + l * 14, tech: 6 + l * 7, fuel: 80 + l * 90 }) },
    { id: 'w_rail', w: 'rail', name: 'RAILGUN', icon: 'railgun', color: '#7fb0ff', tech: 6,
      desc: 'Charges, then deletes a corridor.',
      cost: (l) => ({ metal: 110 + l * 115, parts: 16 + l * 18, tech: 9 + l * 10 }) },
  ];
  for (const c of WEAPON_COMPONENTS) {
    c.max = 5;
    c.weapon = true;
    c.effect = (l) => (l === 0 ? 'Not built' : `Level ${l} of 5`);
    COMPONENTS.push(c);
  }

  /* Perks: bought with tech out of the lab, not handed out for levelling. */
  const PERK_COMPONENTS = [
    { id: 'overdrive', name: 'OVERDRIVE ECU', icon: 'overdrive', max: 5, color: '#ffcf3d', tech: 1,
      desc: 'Remapped everything. All weapons hit harder.',
      cost: (l) => ({ parts: 5 + l * 6, tech: 3 + l * 4, metal: 30 + l * 34 }),
      effect: (l) => `+${l * 16}% weapon damage` },
    { id: 'coolant', name: 'COOLANT LOOP', icon: 'coolant', max: 5, color: '#9fe8ff', tech: 1,
      desc: 'Keeps the barrels cold. Everything cycles faster.',
      cost: (l) => ({ parts: 5 + l * 6, tech: 3 + l * 4, metal: 26 + l * 30 }),
      effect: (l) => `+${l * 14}% fire rate` },
    { id: 'vampire', name: 'BLOOD PUMP', icon: 'res_meds', max: 5, color: '#ff4d5e', tech: 2,
      desc: 'Salvage siphon welded to the plow. Kills patch the truck.',
      cost: (l) => ({ parts: 6 + l * 7, tech: 4 + l * 5, food: 40 + l * 46 }),
      effect: (l) => (l === 0 ? 'Not installed' : `Kills repair ${(0.5 + l * 0.5).toFixed(1)} HP`) },
    { id: 'chain', name: 'CHAIN CHARGES', icon: 'bld_fire', max: 5, color: '#ff8a1e', tech: 2,
      desc: 'Tags corpses with a charge. They go off.',
      cost: (l) => ({ parts: 7 + l * 8, tech: 5 + l * 6, ammo: 70 + l * 80 }),
      effect: (l) => (l === 0 ? 'Not installed' : `Corpses detonate for ${14 + l * 12}`) },
    { id: 'apex', name: 'APEX PACKAGE', icon: 'engine', max: 5, color: '#ff2f6d', tech: 4,
      desc: 'The whole build, turned up. Damage and speed together.',
      cost: (l) => ({ parts: 12 + l * 14, tech: 8 + l * 9, metal: 60 + l * 66 }),
      effect: (l) => `+${l * 12}% all damage, +${l * 7}% top speed` },
  ];
  for (const c of PERK_COMPONENTS) { c.perk = true; COMPONENTS.push(c); }

  const COMP = {};
  for (const c of COMPONENTS) COMP[c.id] = c;

  /* ------------------------------------------------------------- people */
  const PROFESSIONS = [
    { id: 'mechanic', name: 'MECHANIC', color: '#ffd23a', likes: ['garage', 'machine'], blurb: 'Strips wrecks faster than anyone.' },
    { id: 'farmer', name: 'FARMER', color: '#8dff3a', likes: ['hydro'], blurb: 'Can make anything grow down here.' },
    { id: 'medic', name: 'MEDIC', color: '#ff6b8a', likes: ['quarters', 'lab'], blurb: 'Keeps people breathing.' },
    { id: 'engineer', name: 'ENGINEER', color: '#ff8a3d', likes: ['smelter', 'generator'], blurb: 'Understands the furnaces.' },
    { id: 'miner', name: 'MINER', color: '#8f9dae', likes: ['mine', 'quarry'], blurb: 'Reads rock like a page.' },
    { id: 'carpenter', name: 'CARPENTER', color: '#c07d3e', likes: ['lumber', 'sawmill'], blurb: 'Measures once. Still right.' },
    { id: 'scavenger', name: 'SCAVENGER', color: '#b8c4d4', likes: ['salvage', 'mixer'], blurb: 'Finds things other people walk past.' },
    { id: 'gunsmith', name: 'GUNSMITH', color: '#ff6b6b', likes: ['armory', 'nailery'], blurb: 'Sleeps next to the presses.' },
    { id: 'chemist', name: 'CHEMIST', color: '#d47bff', likes: ['lab', 'derrick'], blurb: 'Cracks anything into anything.' },
    { id: 'driver', name: 'DRIVER', color: '#ff4d4d', likes: ['garage', 'assembly'], blurb: 'Rides shotgun and shoots straight.' },
  ];
  const TRAITS = [
    { id: 'tough', name: 'TOUGH', color: '#8fd18f', blurb: '+40% health as an escort' },
    { id: 'quick', name: 'QUICK', color: '#4dd2ff', blurb: 'Moves and reloads faster' },
    { id: 'crackshot', name: 'CRACK SHOT', color: '#ffd75e', blurb: '+50% escort damage' },
    { id: 'lucky', name: 'LUCKY', color: '#d2a6ff', blurb: '+15% haul while aboard' },
    { id: 'tireless', name: 'TIRELESS', color: '#7fffd4', blurb: '+35% output at work' },
    { id: 'green', name: 'GREEN', color: '#a89a9c', blurb: 'New to this. Learns slowly.' },
    { id: 'jumpy', name: 'JUMPY', color: '#ff9c1e', blurb: 'Fast, but folds under fire' },
    { id: 'stubborn', name: 'STUBBORN', color: '#e0a06a', blurb: '+20% output, argues about it' },
    { id: 'nightowl', name: 'NIGHT OWL', color: '#9ad6ff', blurb: 'Works the shifts nobody wants' },
    { id: 'strong', name: 'STRONG', color: '#ff8a3d', blurb: '+25% output in production rooms' },
  ];
  const FIRST = ['MAYA', 'RUBEN', 'ILSE', 'COLE', 'NIA', 'DEV', 'ASTRID', 'JONAH', 'PILAR', 'KWAME',
    'SOFIA', 'TOMAS', 'REN', 'HALLE', 'OSKAR', 'IMANI', 'VIK', 'NOOR', 'BRAM', 'ESME'];
  const LAST = ['OKONKWO', 'VANCE', 'DELACROIX', 'HOLT', 'RAMOS', 'KAUR', 'BJORN', 'MARSH',
    'ABARA', 'SOLIS', 'WREN', 'KOVAC', 'FEN', 'ASHBY'];

  const PROF = {}; for (const p of PROFESSIONS) PROF[p.id] = p;
  const TRAIT = {}; for (const t of TRAITS) TRAIT[t.id] = t;

  let personSeq = 1;
  function makePerson() {
    const prof = PROFESSIONS[(Math.random() * PROFESSIONS.length) | 0];
    const trait = TRAITS[(Math.random() * TRAITS.length) | 0];
    return {
      uid: 'p' + (personSeq++) + '_' + ((Math.random() * 1e6) | 0),
      name: FIRST[(Math.random() * FIRST.length) | 0] + ' ' + LAST[(Math.random() * LAST.length) | 0],
      prof: prof.id, trait: trait.id, job: null,
      look: {
        skin: (Math.random() * 6) | 0, hair: (Math.random() * 5) | 0,
        shirt: (Math.random() * 7) | 0, tall: 0.92 + Math.random() * 0.17,
      },
    };
  }

  /* ------------------------------------------------------------- bunker */
  const FLOORS = 6;               // 0 is the entrance level, 5 is the deepest
  const COLS = 8;                 // column 0 is the stair shaft
  const SHAFT = 0;
  const BASE_CAP = 600;

  const roomKey = (r) => r.f + ':' + r.c;
  const cellKey = (f, c) => f + ':' + c;

  class Meta {
    constructor() {
      this.res = {};
      for (const r of RES) this.res[r.id] = 0;
      this.roster = [];
      this.components = {};
      this.rooms = [];            // { id, f, c, w, level }
      this.dug = {};              // cellKey -> true
      this.runs = 0;
      this.bestScore = 0;
      this.totalKills = 0;
      this.totalRescued = 0;
      this.lastTick = Date.now();
      this.seen = {};
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
          this.rooms = d.rooms || [];
          this.dug = d.dug || {};
          this.runs = d.runs || 0;
          this.bestScore = d.bestScore || 0;
          this.totalKills = d.totalKills || 0;
          this.totalRescued = d.totalRescued || 0;
          this.roster = d.roster || [];
          this.lastTick = d.lastTick || Date.now();
          this.seen = d.seen || {};
        } catch (_) { /* corrupt save, start fresh */ }
      }
      for (const p of this.roster) if (!p.look) p.look = makePerson().look;
      if (!this.rooms.length) this.seedBunker();
      this.catchUp();
    }

    save() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
          res: this.res, components: this.components, rooms: this.rooms, dug: this.dug,
          roster: this.roster, runs: this.runs, bestScore: this.bestScore,
          totalKills: this.totalKills, totalRescued: this.totalRescued,
          lastTick: this.lastTick, seen: this.seen,
        }));
      } catch (_) { /* nothing we can do about a full quota */ }
    }

    /* You start with a hole in the ground, a generator and somewhere to sleep. */
    seedBunker() {
      this.rooms = [
        { id: 'generator', f: 0, c: 1, w: 1, level: 1 },
        { id: 'quarters', f: 0, c: 2, w: 2, level: 1 },
        { id: 'garage', f: 0, c: 4, w: 2, level: 1 },
      ];
      this.dug = {};
      this.dug[cellKey(0, SHAFT)] = true;
      this.dug[cellKey(1, SHAFT)] = true;
      for (let c = 1; c <= 5; c++) this.dug[cellKey(0, c)] = true;
      for (let c = 1; c <= 2; c++) this.dug[cellKey(1, c)] = true;
      this.res.scrap = 120;
      this.res.wood = 80;
      this.res.stone = 60;
      this.res.fuel = 50;
      this.res.food = 60;
      this.res.metal = 20;
      this.res.nails = 30;
      this.roster = [];
      this.addPeople(3);
    }

    /* --------------------------------------------------------- roster */
    addPeople(n) {
      let added = 0;
      for (let i = 0; i < n; i++) {
        if (this.roster.length >= this.housing) break;
        this.roster.push(makePerson());
        added++;
      }
      this.res.people = this.roster.length;
      return added;
    }

    personAt(uid) { return this.roster.find((p) => p.uid === uid); }

    /* what a worker contributes to a room, given fit and temperament */
    workerFactor(person, roomId) {
      if (!person) return 0.5;
      const prof = PROF[person.prof];
      const def = ROOM[roomId];
      let f = 0.5;
      if (prof && prof.likes.indexOf(roomId) >= 0) f = 1.0;
      const t = person.trait;
      if (t === 'tireless') f *= 1.35;
      else if (t === 'stubborn') f *= 1.20;
      else if (t === 'nightowl') f *= 1.15;
      else if (t === 'green') f *= 0.75;
      else if (t === 'jumpy') f *= 0.9;
      if (t === 'strong' && def && def.cat === 'produce') f *= 1.25;
      return f;
    }

    crewOf(room) { return this.roster.filter((p) => p.job === roomKey(room)); }

    setJob(person, room) {
      person.job = room ? roomKey(room) : null;
      this.save();
    }

    get assigned() { return this.roster.filter((p) => p.job).length; }
    get idleWorkers() { return this.roster.filter((p) => !p.job).length; }

    /* ------------------------------------------------------- the bunker */
    roomAt(f, c) {
      return this.rooms.find((r) => r.f === f && c >= r.c && c < r.c + r.w) || null;
    }

    isDug(f, c) { return !!this.dug[cellKey(f, c)]; }

    /* You can only dig next to something already dug - the bunker grows out
       from the stairwell rather than appearing in disconnected pockets. */
    canDig(f, c) {
      if (f < 0 || f >= FLOORS || c < 1 || c >= COLS) return false;
      if (this.isDug(f, c)) return false;
      return this.isDug(f, c - 1) || this.isDug(f, c + 1)
        || (c === 1 && this.isDug(f, SHAFT));
    }

    digCost(f) {
      // deeper rock is harder, and past floor 2 it needs shoring
      const d = f + 1;
      const cost = { scrap: 10 + d * 14 };
      if (f >= 1) cost.planks = 4 + f * 6;
      if (f >= 2) cost.nails = 8 + f * 9;
      if (f >= 3) cost.concrete = 5 + (f - 2) * 9;
      return cost;
    }

    dig(f, c) {
      if (!this.canDig(f, c)) return false;
      if (!this.spend(this.digCost(f))) return false;
      this.dug[cellKey(f, c)] = true;
      this.save();
      return true;
    }

    /* the stair shaft itself has to be sunk floor by floor */
    canSinkShaft(f) {
      return f > 0 && f < FLOORS && !this.isDug(f, SHAFT) && this.isDug(f - 1, SHAFT);
    }

    shaftCost(f) {
      const cost = { scrap: 20 + f * 22, planks: 8 + f * 10 };
      if (f >= 2) cost.concrete = 8 + (f - 1) * 10;
      return cost;
    }

    sinkShaft(f) {
      if (!this.canSinkShaft(f)) return false;
      if (!this.spend(this.shaftCost(f))) return false;
      this.dug[cellKey(f, SHAFT)] = true;
      this.save();
      return true;
    }

    deepestFloor() {
      let d = 0;
      for (let f = 0; f < FLOORS; f++) if (this.isDug(f, SHAFT)) d = f;
      return d;
    }

    canBuild(id, f, c) {
      const def = ROOM[id];
      if (!def) return false;
      if (!this.isDug(f, c) || this.roomAt(f, c)) return false;
      if (def.unique && this.rooms.some((r) => r.id === id)) return false;
      return true;
    }

    build(id, f, c) {
      if (!this.canBuild(id, f, c)) return false;
      const def = ROOM[id];
      if (!this.spend(def.cost(0))) return false;
      this.rooms.push({ id, f, c, w: 1, level: 1 });
      this.save();
      return true;
    }

    /* Expanding eats the dug cell to the room's right and makes it one wider,
       which is what raises its crew cap. */
    expandCost(room) {
      const def = ROOM[room.id];
      const base = def.cost(room.level);
      const out = {};
      for (const k in base) out[k] = Math.round(base[k] * (0.55 + room.w * 0.25));
      return out;
    }

    canExpand(room) {
      const nc = room.c + room.w;
      if (room.w >= 3 || nc >= COLS) return false;
      return this.isDug(room.f, nc) && !this.roomAt(room.f, nc);
    }

    expand(room) {
      if (!this.canExpand(room)) return false;
      if (!this.spend(this.expandCost(room))) return false;
      room.w++;
      this.save();
      return true;
    }

    upgradeCost(room) {
      const def = ROOM[room.id];
      if (!def || room.level >= def.max) return null;
      return def.cost(room.level);
    }

    upgrade(room) {
      const cost = this.upgradeCost(room);
      if (!cost || !this.spend(cost)) return false;
      room.level++;
      this.save();
      return true;
    }

    demolish(room) {
      const i = this.rooms.indexOf(room);
      if (i < 0) return false;
      for (const p of this.crewOf(room)) p.job = null;
      this.rooms.splice(i, 1);
      this.add('scrap', 18 * room.level * room.w);
      this.save();
      return true;
    }

    crewCap(room) {
      const def = ROOM[room.id];
      if (!def || !def.crew) return 0;
      return def.crew * room.w;
    }

    assign(room, delta) {
      const crew = this.crewOf(room);
      if (delta > 0) {
        if (crew.length >= this.crewCap(room)) return false;
        const idle = this.roster.filter((p) => !p.job);
        if (!idle.length) return false;
        idle.sort((a, b) => this.workerFactor(b, room.id) - this.workerFactor(a, room.id));
        this.setJob(idle[0], room);
      } else {
        if (!crew.length) return false;
        this.setJob(crew[crew.length - 1], null);
      }
      this.save();
      return true;
    }

    roomLevel(id) {
      let best = 0;
      for (const r of this.rooms) if (r.id === id) best = Math.max(best, r.level);
      return best;
    }

    hasRoom(id) { return this.rooms.some((r) => r.id === id); }

    /* ------------------------------------------------------- production */
    get housing() {
      let n = 2;
      for (const r of this.rooms) {
        const d = ROOM[r.id];
        if (d && d.house) n += d.house * r.level * r.w;
      }
      return n;
    }

    /* Generators supply, everything else draws. Short on power and the whole
       bunker runs slow rather than stopping dead. */
    get power() {
      let supply = 0, demand = 0;
      const dry = (this.res.fuel || 0) <= 0;
      for (const r of this.rooms) {
        const d = ROOM[r.id];
        if (!d || !d.power) continue;
        const n = d.power * r.level * (d.power < 0 ? 1 : r.w);
        // a generator with an empty tank is just a heavy box
        if (n < 0) { if (!dry) supply -= n; } else demand += n;
      }
      return { supply, demand };
    }

    get powerRatio() {
      const p = this.power;
      if (p.demand <= 0) return 1;
      return clamp(p.supply / p.demand, 0.15, 1);
    }

    /* how hard one room is actually working, 0..n */
    roomEff(room) {
      const def = ROOM[room.id];
      if (!def) return 0;
      let crewMul = 0.25;                       // an unmanned room ticks over
      for (const p of this.crewOf(room)) crewMul += this.workerFactor(p, room.id);
      if (!def.crew) crewMul = 1;
      return room.level * room.w * crewMul * this.powerRatio;
    }

    /* net resources per minute, for the readout. Rooms that cannot get their
       inputs report as starved rather than silently contributing nothing. */
    rates() {
      const out = {};
      const starved = [];
      for (const room of this.rooms) {
        const def = ROOM[room.id];
        if (!def) continue;
        const eff = this.roomEff(room);
        if (def.in) {
          let short = false;
          for (const k in def.in) if ((this.res[k] || 0) <= 0) short = true;
          if (short) { starved.push(room); continue; }
          for (const k in def.in) out[k] = (out[k] || 0) - def.in[k] * eff;
        }
        if (def.out) for (const k in def.out) out[k] = (out[k] || 0) + def.out[k] * eff;
      }
      out.food = (out.food || 0) - this.roster.length * 0.85;
      this.starved = starved;
      return out;
    }

    /* Run one room for `minutes`, limited by whatever inputs it can actually get. */
    runRoom(room, minutes) {
      const def = ROOM[room.id];
      if (!def) return;
      let scale = this.roomEff(room) * minutes;
      if (scale <= 0) return;
      if (def.in) {
        for (const k in def.in) {
          scale = Math.min(scale, (this.res[k] || 0) / def.in[k]);
        }
        if (scale <= 0) { room.idle = true; return; }
        for (const k in def.in) this.res[k] = Math.max(0, (this.res[k] || 0) - def.in[k] * scale);
      }
      room.idle = false;
      if (def.out) for (const k in def.out) this.add(k, def.out[k] * scale);
    }

    produce(minutes) {
      if (!(minutes > 0)) return;
      // producers first, so a processor built the same tick has stock to eat
      for (const r of this.rooms) if (ROOM[r.id] && ROOM[r.id].cat === 'produce') this.runRoom(r, minutes);
      for (const r of this.rooms) if (ROOM[r.id] && ROOM[r.id].cat !== 'produce') this.runRoom(r, minutes);
      this.res.food = Math.max(0, this.res.food - this.roster.length * 0.85 * minutes);
      // storage caps move with the bunker, so a stock that was legal before a
      // demolition has to settle back inside the new limit
      for (const r of RES) {
        if (r.crew) continue;
        this.res[r.id] = clamp(this.res[r.id] || 0, 0, this.cap(r.id));
      }
    }

    /* accrue offline production, capped so leaving it a month is not a strategy */
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

    cap(id) {
      if (id === 'people') return this.housing;
      let c = BASE_CAP;
      for (const r of this.rooms) if (r.id === 'quarters') c += r.level * 120;
      const res = RESBY[id];
      const tier = res ? res.tier : 0;
      return Math.round((c + this.rooms.length * 140) * (tier === 2 ? 0.35 : 1));
    }

    /* ------------------------------------------------------- transactions */
    can(cost) {
      if (!cost) return false;
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

    missing(cost) {
      const out = [];
      for (const k in cost) if ((this.res[k] || 0) < cost[k]) out.push(k);
      return out;
    }

    /* ------------------------------------------------------- components */
    compLevel(id) { return this.components[id] || 0; }

    /* Weapons need an armory, perks and exotic guns need a lab of the right
       rank. This is what replaces levelling: hardware gates hardware. */
    compLocked(id) {
      const c = COMP[id];
      if (!c) return 'UNKNOWN';
      if (c.weapon && !c.chassis && !this.hasRoom('armory')) return 'NEEDS AN ARMORY';
      if (c.perk && !this.hasRoom('lab')) return 'NEEDS A RESEARCH LAB';
      if (c.tech) {
        const lab = this.roomLevel('lab');
        const arm = this.roomLevel('armory');
        const rank = c.weapon ? Math.max(arm, lab) : lab;
        if (rank < c.tech) {
          return c.weapon ? `NEEDS ARMORY LV${c.tech}` : `NEEDS LAB LV${c.tech}`;
        }
      }
      return null;
    }

    compCost(id) {
      const c = COMP[id];
      const l = this.compLevel(id);
      if (!c || l >= c.max) return null;
      const raw = c.cost(l);
      const discount = this.roomLevel('garage') * 0.05;
      const out = {};
      for (const k in raw) out[k] = Math.max(1, Math.round(raw[k] * (1 - discount)));
      return out;
    }

    buyComponent(id) {
      if (this.compLocked(id)) return false;
      const cost = this.compCost(id);
      if (!cost || !this.spend(cost)) return false;
      this.components[id] = this.compLevel(id) + 1;
      this.save();
      return true;
    }

    /* -------------------------------------------------- derived run stats */
    get rank() {
      // how far the bunker has got, used to scale run difficulty and rewards
      return 1 + this.deepestFloor() + Math.floor(this.rooms.length / 4);
    }

    truckStats() {
      const L = (id) => this.compLevel(id);
      const garage = this.roomLevel('garage');
      const quarters = this.roomLevel('quarters');
      const derrick = this.roomLevel('derrick');

      return {
        speedMul: 1 + L('engine') * 0.09,
        accelMul: 1 + L('turbo') * 0.12,
        gripMul: 1 + L('tires') * 0.11,
        turnMul: 1 + L('tires') * 0.06,
        canJump: L('hydraulics') > 0,
        canNitro: L('nos') > 0,
        jumpMul: 1 + Math.max(0, L('hydraulics') - 1) * 0.12,
        hp: 80 + L('plating') * 22 + garage * 5,
        armor: L('plating') * 0.04,
        ramMul: 1 + L('plow') * 0.20,
        fuelMul: 1 + L('tank') * 0.18,
        fuelRegenMul: 1 + L('tank') * 0.25,
        cargo: 2 + L('bed') * 2,
        haulMul: 1 + L('bed') * 0.15 + L('magnet') * 0.12,
        magnetMul: 1 + L('magnet') * 0.30,
        hardpoints: 1 + L('mount'),
        nosMul: 1 + Math.max(0, L('nos') - 1) * 0.14,
        startFuel: clamp(0.5 + derrick * 0.09, 0, 1),
        startHpMul: 1 + quarters * 0.03,
      };
    }
  }

  BA.meta = {
    RES, RESBY, ROOMS, ROOM, CATS, COMPONENTS, COMP, Meta,
    PROFESSIONS, TRAITS, PROF, TRAIT, WEAPON_COMPONENTS, PERK_COMPONENTS,
    FLOORS, COLS, SHAFT, makePerson, roomKey, cellKey,
  };
})();
