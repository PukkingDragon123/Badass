/* BADASS APOCALYPSE - stages. Each one generates a different place to drive
   through and ends at a different landmark worth raiding. */
(function () {
  'use strict';
  const { clamp, clamp01, lerp, TAU } = BA;

  /* Every generator gets a seeded rng, the chunk origin, and an `add` callback.
     Streets are laid on a fixed world grid so blocks line up across chunks. */

  const BLOCK = 62;          // town block pitch, matches the chunk size
  const ROAD_W = 13;         // half-width of a carriageway

  const onRoad = (x, z) => {
    const rx = Math.abs(((x % BLOCK) + BLOCK) % BLOCK - BLOCK / 2);
    const rz = Math.abs(((z % BLOCK) + BLOCK) % BLOCK - BLOCK / 2);
    return rx < ROAD_W || rz < ROAD_W;
  };

  /* --------------------------------------------------------- neighbourhood */
  function genSuburb(rng, ox, oz, add) {
    // four house plots per block, gardens facing the street
    for (let qz = 0; qz < 2; qz++) {
      for (let qx = 0; qx < 2; qx++) {
        const cx = ox + (qx - 0.5) * 27;
        const cz = oz + (qz - 0.5) * 27;
        if (rng() < 0.18) {                       // occasional empty lot
          for (let i = 0; i < 3; i++) {
            add({ type: 'pile', x: cx + (rng() - 0.5) * 14, z: cz + (rng() - 0.5) * 14,
              yaw: rng() * TAU, radius: 2.2, hp: 60, kind: rng() });
          }
          continue;
        }
        const yaw = Math.round(rng() * 3) * (Math.PI / 2);
        add({
          type: 'house', x: cx, z: cz, yaw, radius: 6.2, hp: 900, solid: true, mass: 4,
          w: 9 + rng() * 3, d: 8 + rng() * 3, h: 4.2 + rng() * 2.2,
          wall: rng(), roof: rng(), storey: rng() < 0.35 ? 2 : 1,
        });
        // picket fence along the plot edge
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        for (let i = -1; i <= 1; i++) {
          add({ type: 'fence', x: cx + fx * 9 + fz * i * 4.6, z: cz + fz * 9 - fx * i * 4.6,
            yaw, radius: 1.5, hp: 24, solid: false });
        }
        // garden greenery
        for (let i = 0; i < 3 + (rng() * 3 | 0); i++) {
          const gx = cx + (rng() - 0.5) * 18, gz = cz + (rng() - 0.5) * 18;
          if (rng() < 0.45) add({ type: 'tree', x: gx, z: gz, yaw: rng() * TAU, radius: 1.9, hp: 220, solid: true, mass: 2.5, kind: rng(), h: 5 + rng() * 4 });
          else add({ type: 'bush', x: gx, z: gz, yaw: rng() * TAU, radius: 1.4, hp: 18, solid: false, kind: rng() });
        }
        if (rng() < 0.5) add({ type: 'parked', x: cx + fx * 12, z: cz + fz * 12, yaw: yaw + Math.PI / 2, radius: 2.4, hp: 210, solid: true, mass: 1, kind: rng() });
      }
    }
    // street furniture along the kerb
    for (let i = 0; i < 6; i++) {
      const along = (rng() - 0.5) * BLOCK;
      const side = rng() < 0.5 ? -1 : 1;
      const vert = rng() < 0.5;
      const sx = vert ? ox + side * (ROAD_W + 2.4) : ox + along;
      const sz = vert ? oz + along : oz + side * (ROAD_W + 2.4);
      const r = rng();
      if (r < 0.34) add({ type: 'lamp', x: sx, z: sz, yaw: rng() * TAU, radius: 0.7, hp: 40, solid: true, mass: 0.35, lit: rng() > 0.3 });
      else if (r < 0.55) add({ type: 'hydrant', x: sx, z: sz, yaw: rng() * TAU, radius: 0.7, hp: 22, solid: false });
      else if (r < 0.78) add({ type: 'bin', x: sx, z: sz, yaw: rng() * TAU, radius: 1.0, hp: 26, solid: false, kind: rng() });
      else add({ type: 'barrel', x: sx, z: sz, yaw: rng() * TAU, radius: 1.05, hp: 1, solid: false, bob: rng() * TAU });
    }
    // wrecks abandoned mid-road
    for (let i = 0; i < 2; i++) {
      if (rng() > 0.55) continue;
      const along = (rng() - 0.5) * BLOCK;
      const vert = rng() < 0.5;
      add({ type: 'wreck', yaw: vert ? 0 : Math.PI / 2, radius: 2.4, hp: 190, solid: true, mass: 1,
        x: vert ? ox + (rng() - 0.5) * 12 : ox + along,
        z: vert ? oz + along : oz + (rng() - 0.5) * 12 });
    }
  }

  /* ------------------------------------------------------------- mall */
  function genMall(rng, ox, oz, add) {
    // vast parking aprons, light towers, big-box units around the edge
    for (let i = 0; i < 5; i++) {
      const px = ox + (rng() - 0.5) * BLOCK * 0.9;
      const pz = oz + (rng() - 0.5) * BLOCK * 0.9;
      const r = rng();
      if (r < 0.34) add({ type: 'parked', x: px, z: pz, yaw: Math.round(rng()) * Math.PI / 2, radius: 2.4, hp: 210, solid: true, mass: 1, kind: rng() });
      else if (r < 0.5) add({ type: 'trolley', x: px, z: pz, yaw: rng() * TAU, radius: 1.1, hp: 14, solid: false });
      else if (r < 0.62) add({ type: 'lamp', x: px, z: pz, yaw: rng() * TAU, radius: 0.7, hp: 40, solid: true, mass: 0.35, lit: rng() > 0.25 });
      else if (r < 0.74) add({ type: 'pile', x: px, z: pz, yaw: rng() * TAU, radius: 2.2, hp: 60, kind: rng() });
      else if (r < 0.86) add({ type: 'crate', x: px, z: pz, yaw: rng() * TAU, radius: 1.15, hp: 30, loot: rng() });
      else add({ type: 'barrel', x: px, z: pz, yaw: rng() * TAU, radius: 1.05, hp: 1, bob: rng() * TAU });
    }
    if (rng() < 0.55) {
      add({ type: 'unit', x: ox + (rng() - 0.5) * 30, z: oz + (rng() - 0.5) * 30,
        yaw: Math.round(rng()) * Math.PI / 2, radius: 8, hp: 1400, solid: true, mass: 6,
        w: 16 + rng() * 8, d: 11 + rng() * 5, h: 6 + rng() * 2, sign: rng() });
    }
    for (let i = 0; i < 2; i++) {
      add({ type: 'planter', x: ox + (rng() - 0.5) * 46, z: oz + (rng() - 0.5) * 46, yaw: rng() * TAU, radius: 2.0, hp: 90, solid: true, mass: 2, kind: rng() });
    }
  }

  /* ----------------------------------------------------------- forest */
  function genForest(rng, ox, oz, add) {
    const n = 12 + (rng() * 8 | 0);
    for (let i = 0; i < n; i++) {
      const px = ox + (rng() - 0.5) * BLOCK;
      const pz = oz + (rng() - 0.5) * BLOCK;
      const r = rng();
      if (r < 0.62) add({ type: 'tree', x: px, z: pz, yaw: rng() * TAU, radius: 2.1, hp: 240, solid: true, mass: 2.6, kind: rng() * 0.5, h: 7 + rng() * 7 });
      else if (r < 0.76) add({ type: 'bush', x: px, z: pz, yaw: rng() * TAU, radius: 1.5, hp: 18, kind: rng() });
      else if (r < 0.84) add({ type: 'rock', x: px, z: pz, yaw: rng() * TAU, radius: 2.0 + rng() * 1.4, hp: 1e9, solid: true, mass: 3 });
      else if (r < 0.9) add({ type: 'pile', x: px, z: pz, yaw: rng() * TAU, radius: 2.2, hp: 60, kind: rng() });
      else if (r < 0.95) add({ type: 'ramp', x: px, z: pz, yaw: rng() * TAU, L: 10 + rng() * 5, W: 7 + rng() * 3, H: 3.2 + rng() * 2, radius: 0, hp: Infinity });
      else add({ type: 'shack', x: px, z: pz, yaw: rng() * TAU, radius: 3.2, hp: 260, solid: true, mass: 1.2, kind: rng() });
    }
    if (rng() < 0.3) add({ type: 'gascan', x: ox + (rng() - 0.5) * 40, z: oz + (rng() - 0.5) * 40, yaw: rng() * TAU, radius: 1.0, hp: 1, bob: rng() * TAU });
  }

  /* --------------------------------------------------------- wasteland */
  function genWaste(rng, ox, oz, add) {
    const n = 4 + (rng() * 4 | 0);
    for (let i = 0; i < n; i++) {
      const x = ox + (rng() - 0.5) * BLOCK;
      const z = oz + (rng() - 0.5) * BLOCK;
      const r = rng();
      if (r < 0.10) add({ type: 'ramp', x, z, yaw: rng() * TAU, L: 9 + rng() * 5, W: 6 + rng() * 3, H: 3 + rng() * 2.2, radius: 0, hp: Infinity });
      else if (r < 0.34) add({ type: 'barrel', x, z, yaw: rng() * TAU, radius: 1.05, hp: 1, bob: rng() * TAU });
      else if (r < 0.42) add({ type: 'gascan', x, z, yaw: rng() * TAU, radius: 1.0, hp: 1, bob: rng() * TAU });
      else if (r < 0.54) add({ type: 'wreck', x, z, yaw: rng() * TAU, radius: 2.4, hp: 190, solid: true, mass: 1 });
      else if (r < 0.62) add({ type: 'rock', x, z, yaw: rng() * TAU, radius: 2 + rng() * 1.4, hp: 1e9, solid: true, mass: 3 });
      else if (r < 0.70) add({ type: 'lamp', x, z, yaw: rng() * TAU, radius: 0.7, hp: 40, solid: true, mass: 0.35, lit: rng() > 0.35 });
      else if (r < 0.78) add({ type: 'crate', x, z, yaw: rng() * TAU, radius: 1.15, hp: 30, loot: rng() });
      else if (r < 0.87) add({ type: 'pile', x, z, yaw: rng() * TAU, radius: 2.2, hp: 60, kind: rng() });
      else if (r < 0.95) add({ type: 'shack', x, z, yaw: rng() * TAU, radius: 3.2, hp: 260, solid: true, mass: 1.2, kind: rng() });
      else add({ type: 'silo', x, z, yaw: rng() * TAU, radius: 2.6, hp: 320, solid: true, mass: 2 });
    }
  }

  const STAGES = [
    {
      id: 'suburb', name: 'PINEWOOD ESTATE', icon: 'bld_house', color: '#9ad6ff',
      blurb: 'Quiet streets, tidy lawns, and a SUPERMARKET at the end of the road.',
      landmark: 'supermarket', landmarkName: 'SUPERMARKET',
      streets: true, gen: genSuburb, exitZ: 1240, garageZ: 620,
      fog: [0.38, 0.26, 0.28], fogDensity: 0.0042, ground: 0,
      reward: { food: 1.6, meds: 1.3, scrap: 1.0, steel: 0.8 },
      unlockRank: 1,
    },
    {
      id: 'mall', name: 'CRESTVIEW MALL', icon: 'bld_storage', color: '#ffd23a',
      blurb: 'Acres of car park, then a dead shopping centre stuffed with salvage.',
      landmark: 'mall', landmarkName: 'MALL ATRIUM',
      streets: true, gen: genMall, exitZ: 1420, garageZ: 700,
      fog: [0.30, 0.26, 0.34], fogDensity: 0.0038, ground: 1,
      reward: { scrap: 1.7, steel: 1.5, meds: 1.2, food: 0.8 },
      unlockRank: 2,
    },
    {
      id: 'forest', name: 'BLACKPINE WOODS', icon: 'bld_garden', color: '#7fffd4',
      blurb: 'Tight tree lines and blind corners. A ranger station sits at the top.',
      landmark: 'ranger', landmarkName: 'RANGER STATION',
      streets: false, gen: genForest, exitZ: 1120, garageZ: 560,
      fog: [0.16, 0.22, 0.20], fogDensity: 0.0060, ground: 2,
      reward: { food: 2.0, fuel: 1.3, scrap: 0.9, steel: 0.6 },
      unlockRank: 3,
    },
    {
      id: 'waste', name: 'THE OUTER WASTE', icon: 'bld_tower', color: '#e0a06a',
      blurb: 'Open ground, big ramps, nothing to hide behind. The old hunting run.',
      landmark: 'depot', landmarkName: 'FUEL DEPOT',
      streets: false, gen: genWaste, exitZ: 1240, garageZ: 620,
      fog: [0.40, 0.22, 0.19], fogDensity: 0.0040, ground: 3,
      reward: { fuel: 1.8, scrap: 1.2, steel: 1.0, meds: 0.6 },
      unlockRank: 1,
    },
  ];

  const byId = {};
  for (const s of STAGES) byId[s.id] = s;

  BA.stages = { STAGES, byId, BLOCK, ROAD_W, onRoad };
})();
