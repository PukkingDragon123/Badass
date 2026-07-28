/* BADASS APOCALYPSE - articulated humanoid rig
   Bones are placed in the actor's own frame - (forward, up, side) - and aimed
   into world space, so the same skeleton works for the driver in the cab, the
   crew walking the bunker, and the horde. Nothing here is an asset: every limb
   is a primitive from src/geometry.js. */
(function () {
  'use strict';
  const { clamp, clamp01, lerp, TAU } = BA;

  /* An actor's local basis. `fwd` is where it faces, `side` is its right. */
  function frame(x, y, z, yaw, scale) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    return { x, y, z, fx: s, fz: c, rx: c, rz: -s, k: scale === undefined ? 1 : scale };
  }

  /* local [forward, up, side] -> world [x,y,z] */
  function toWorld(F, p, out) {
    const f = p[0] * F.k, u = p[1] * F.k, s = p[2] * F.k;
    out[0] = F.x + F.fx * f + F.rx * s;
    out[1] = F.y + u;
    out[2] = F.z + F.fz * f + F.rz * s;
    return out;
  }

  const _a = [0, 0, 0], _b = [0, 0, 0];

  /* Place `mesh` spanning local points a..b. Meshes are unit-length along +Y,
     so we aim +Y down the bone and scale by its length. */
  function bone(R, mesh, layer, F, a, b, thick, col, em, thick2) {
    toWorld(F, a, _a); toWorld(F, b, _b);
    const dx = _b[0] - _a[0], dy = _b[1] - _a[1], dz = _b[2] - _a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-5) return;
    const flat = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.atan2(flat, dy);
    R.push(mesh, layer, (_a[0] + _b[0]) * 0.5, (_a[1] + _b[1]) * 0.5, (_a[2] + _b[2]) * 0.5,
      yaw, pitch, 0, thick, len, thick2 === undefined ? thick : thick2,
      col[0], col[1], col[2], em || 0);
  }

  /* A box sitting at a local point, aligned to the actor (no aiming). `tilt`
     leans it in the sagittal plane, which is all most body parts need. */
  function part(R, mesh, layer, F, p, sx, sy, sz, tilt, col, em) {
    toWorld(F, p, _a);
    const yaw = Math.atan2(F.fx, F.fz);
    R.push(mesh, layer, _a[0], _a[1], _a[2], yaw, 0, tilt || 0,
      sx * F.k, sy * F.k, sz * F.k, col[0], col[1], col[2], em || 0);
  }

  /* ---------------------------------------------------------------- poses */
  /* A pose is joint angles in the sagittal plane, radians, 0 = straight down
     for limbs. Positive swings forward. */
  function newPose() {
    return {
      hip: 0.92, lean: 0, sway: 0, twist: 0, headYaw: 0, headPitch: 0, crouch: 0,
      // shoulder, elbow, hip, knee for left/right
      shL: 0, elL: 0.25, shR: 0, elR: 0.25,
      hpL: 0, knL: 0.05, hpR: 0, knR: 0.05,
      armSpreadL: 0, armSpreadR: 0, seated: 0,
    };
  }

  function idle(p, t, seed) {
    const b = Math.sin(t * 1.7 + seed) * 0.5 + 0.5;
    p.hip = 0.92 - b * 0.012;
    p.lean = 0.03 + b * 0.015;
    p.shL = -0.06 + Math.sin(t * 1.7 + seed) * 0.05;
    p.shR = -0.06 + Math.sin(t * 1.7 + seed + 0.4) * 0.05;
    p.elL = 0.30; p.elR = 0.30;
    p.hpL = 0.02; p.hpR = -0.02;
    p.knL = 0.06; p.knR = 0.06;
    p.headPitch = -0.04 + Math.sin(t * 0.8 + seed) * 0.05;
    p.headYaw = Math.sin(t * 0.53 + seed * 2) * 0.28;
    return p;
  }

  /* `spd` is stride rate; `gait` 0..1 blends walk -> run */
  function walk(p, t, spd, gait) {
    const w = t * spd;
    const s = Math.sin(w), c = Math.cos(w);
    const amp = lerp(0.55, 0.95, gait);
    p.hip = 0.92 - Math.abs(c) * 0.05 - gait * 0.06;
    p.lean = 0.06 + gait * 0.30;
    p.sway = s * 0.03;
    p.twist = -s * (0.10 + gait * 0.12);
    // legs: thigh swings, knee only bends on the back half of the stride
    p.hpL = s * amp;
    p.hpR = -s * amp;
    p.knL = Math.max(0.05, -s * 0.55 + 0.35) * (0.6 + gait * 0.7);
    p.knR = Math.max(0.05, s * 0.55 + 0.35) * (0.6 + gait * 0.7);
    // arms counter-swing
    p.shL = -s * amp * 0.72;
    p.shR = s * amp * 0.72;
    p.elL = 0.35 + gait * 0.6 + Math.max(0, -s) * 0.35;
    p.elR = 0.35 + gait * 0.6 + Math.max(0, s) * 0.35;
    p.headPitch = -0.05 - gait * 0.1;
    p.headYaw = 0;
    return p;
  }

  /* hauling yourself up a ladder / stair rail */
  function climb(p, t, spd) {
    const w = t * spd;
    const s = Math.sin(w);
    p.hip = 0.88;
    p.lean = 0.22;
    p.shL = -2.35 - s * 0.55;      // reaching overhead
    p.shR = -2.35 + s * 0.55;
    p.elL = 0.55 + Math.max(0, s) * 0.6;
    p.elR = 0.55 + Math.max(0, -s) * 0.6;
    p.hpL = 0.75 + s * 0.5;
    p.hpR = 0.75 - s * 0.5;
    p.knL = 1.05 - s * 0.4;
    p.knR = 1.05 + s * 0.4;
    p.headPitch = -0.35;
    return p;
  }

  /* crouched at the truck, cranking a spanner. `phase` 0..1 across one turn */
  function wrench(p, t) {
    const w = t * 7.0;
    const s = Math.sin(w), c = Math.cos(w);
    p.hip = 0.60;
    p.crouch = 1;
    p.lean = 0.62;
    p.hpL = 1.5; p.knL = 1.85;
    p.hpR = 1.15; p.knR = 1.6;
    // right arm cranks a circle, left braces on the chassis
    p.shR = 1.15 + s * 0.42;
    p.elR = 0.65 + c * 0.45;
    p.shL = 0.95;
    p.elL = 0.9;
    p.headPitch = 0.45;
    p.headYaw = 0;
    return p;
  }

  /* kneeling with a torch - the arm holds steady, sparks come from the caller */
  function weld(p, t) {
    const j = Math.sin(t * 34) * 0.03 + Math.sin(t * 11) * 0.02;
    p.hip = 0.52;
    p.crouch = 1;
    p.lean = 0.75;
    p.hpL = 1.65; p.knL = 2.1;
    p.hpR = 1.35; p.knR = 1.9;
    p.shR = 1.42 + j;
    p.elR = 0.72 - j;
    p.shL = 1.1;
    p.elL = 1.0;
    p.headPitch = 0.55;
    return p;
  }

  /* reaching up into an engine bay, both hands in the machine */
  function reachUp(p, t) {
    const j = Math.sin(t * 5.5) * 0.16, k = Math.cos(t * 5.5) * 0.1;
    p.hip = 0.88;
    p.lean = 0.30;
    p.shL = -1.55 + j; p.elL = 0.85 + k;
    p.shR = -1.62 - j; p.elR = 0.9 - k;
    p.hpL = 0.12; p.hpR = -0.08;
    p.knL = 0.3; p.knR = 0.22;
    p.headPitch = -0.42;
    return p;
  }

  /* behind the wheel */
  function drive(p, shake, steer) {
    p.hip = 0.62;
    p.seated = 1;
    p.lean = 0.16 + shake * 0.1;
    p.hpL = 1.48; p.hpR = 1.48;
    p.knL = 1.42; p.knR = 1.38;
    p.shL = 1.15 - steer * 0.34;
    p.shR = 1.15 + steer * 0.34;
    p.elL = 0.95 + steer * 0.2;
    p.elR = 0.95 - steer * 0.2;
    p.headPitch = -0.08 + shake * 0.12;
    p.headYaw = steer * 0.22;
    p.twist = steer * 0.12;
    return p;
  }

  /* ---------------------------------------------------------------- draw */
  /* Limb chain solved in the sagittal plane. `ang` swings the whole limb,
     `bend` folds the second segment backwards (knees) or forwards (elbows). */
  function chain(root, ang, bend, l1, l2, backwards) {
    const d1 = [root[0] + Math.sin(ang) * l1, root[1] - Math.cos(ang) * l1, root[2]];
    const a2 = ang + (backwards ? -bend : bend);
    const d2 = [d1[0] + Math.sin(a2) * l2, d1[1] - Math.cos(a2) * l2, d1[2]];
    return [d1, d2];
  }

  const DEF = {
    skin: [0.78, 0.58, 0.44], shirt: [0.30, 0.42, 0.52], pants: [0.22, 0.24, 0.30],
    boots: [0.14, 0.13, 0.15], hair: [0.16, 0.12, 0.09], gear: [0.42, 0.40, 0.38],
  };

  /* opt: { x,y,z,yaw,scale,pose,skin,shirt,pants,boots,hair,gear,
            helmet, pack, glow, shadow } */
  function draw(R, opt) {
    const p = opt.pose;
    const C = opt;
    const skin = C.skin || DEF.skin, shirt = C.shirt || DEF.shirt;
    const pants = C.pants || DEF.pants, boots = C.boots || DEF.boots;
    const hair = C.hair || DEF.hair, gear = C.gear || DEF.gear;
    const em = C.glow || 0;
    const F = frame(C.x, C.y, C.z, C.yaw || 0, C.scale === undefined ? 1 : C.scale);
    // callers that need to hang a tool or a rifle off a hand pass an `out` bag
    const out = C.out || null;

    const hipY = p.hip;
    const lean = p.lean;
    const side = 0.115;                       // half the hip width
    const shoulderY = hipY + 0.50;
    // the spine leans forward, so the shoulders ride ahead of the hips
    const spineF = Math.sin(lean) * 0.50;
    const chestF = Math.sin(lean) * 0.30;
    const sway = p.sway || 0;

    /* ---- legs ---- */
    const thigh = 0.44, shin = 0.44;
    for (const L of [-1, 1]) {
      const hipA = L < 0 ? p.hpL : p.hpR;
      const knA = L < 0 ? p.knL : p.knR;
      const root = [0, hipY, L * side + sway];
      const [knee, ankle] = chain(root, hipA, knA, thigh, shin, true);
      bone(R, 'cyl', 'opaque', F, root, knee, 0.20, pants, em);
      bone(R, 'cyl', 'opaque', F, knee, ankle, 0.165, pants, em);
      part(R, 'sphere', 'opaque', F, knee, 0.19, 0.19, 0.19, 0, pants, em);
      // the boot sits flat under the ankle and points the way the actor faces
      const toe = [ankle[0] + 0.17, ankle[1] - 0.05, ankle[2]];
      bone(R, 'box', 'opaque', F, ankle, toe, 0.2, boots, em, 0.22);
      if (out) out[L < 0 ? 'footL' : 'footR'] = toWorld(F, ankle, [0, 0, 0]);
    }

    /* ---- pelvis + torso ---- */
    part(R, 'box', 'opaque', F, [Math.sin(lean) * 0.10, hipY + 0.06, sway],
      0.24, 0.20, 0.34, -lean * 0.5, pants, em);
    // abdomen and chest as two leaning slabs, chest broader at the shoulders
    part(R, 'box', 'opaque', F, [spineF * 0.45, hipY + 0.24, sway * 0.6],
      0.26, 0.30, 0.36, -lean * 0.8, shirt, em);
    part(R, 'box', 'opaque', F, [chestF + spineF * 0.55, hipY + 0.44, 0],
      0.30, 0.32, 0.44, -lean, shirt, em);
    if (C.pack) {
      part(R, 'box', 'opaque', F, [chestF + spineF * 0.55 - 0.24, hipY + 0.42, 0],
        0.20, 0.34, 0.36, -lean, gear, em);
    }

    const shF = spineF + chestF * 0.6;
    const shoulder = (L) => [shF, shoulderY, L * 0.205];

    /* ---- arms ---- */
    const upper = 0.34, fore = 0.32;
    for (const L of [-1, 1]) {
      const shA = (L < 0 ? p.shL : p.shR) + lean * 0.25;
      const elA = L < 0 ? p.elL : p.elR;
      const root = shoulder(L);
      const [elbow, hand] = chain(root, shA, elA, upper, fore, false);
      part(R, 'sphere', 'opaque', F, root, 0.24, 0.24, 0.24, 0, shirt, em);
      bone(R, 'cyl', 'opaque', F, root, elbow, 0.175, shirt, em);
      bone(R, 'cyl', 'opaque', F, elbow, hand, 0.145, skin, em);
      part(R, 'box', 'opaque', F, hand, 0.13, 0.15, 0.12, 0, C.gloves ? gear : skin, em);
      if (out) out[L < 0 ? 'handL' : 'handR'] = toWorld(F, hand, [0, 0, 0]);
    }

    /* ---- head ---- */
    const neck = [shF + 0.02, shoulderY + 0.06, 0];
    const headY = shoulderY + 0.20;
    const headF = shF + 0.03 + Math.sin(p.headPitch) * 0.04;
    part(R, 'cyl', 'opaque', F, neck, 0.15, 0.14, 0.15, 0, skin, em);
    const hp = p.headPitch, hy = p.headYaw || 0;
    // skull + jaw give a face that reads at a distance without a texture
    toWorld(F, [headF, headY, 0], _a);
    const wYaw = Math.atan2(F.fx, F.fz) + hy;
    R.push('box', 'opaque', _a[0], _a[1], _a[2], wYaw, 0, -hp,
      0.27 * F.k, 0.30 * F.k, 0.30 * F.k, skin[0], skin[1], skin[2], em);
    const fwdN = [Math.sin(wYaw), 0, Math.cos(wYaw)];
    const jx = _a[0] + fwdN[0] * 0.055 * F.k, jz = _a[2] + fwdN[2] * 0.055 * F.k;
    R.push('box', 'opaque', jx, _a[1] - 0.10 * F.k, jz, wYaw, 0, -hp,
      0.22 * F.k, 0.13 * F.k, 0.26 * F.k, skin[0] * 0.94, skin[1] * 0.9, skin[2] * 0.88, em);
    // eyes
    for (const L of [-1, 1]) {
      const ex = _a[0] + fwdN[0] * 0.13 * F.k - Math.sin(wYaw - Math.PI / 2) * L * 0.075 * F.k;
      const ez = _a[2] + fwdN[2] * 0.13 * F.k - Math.cos(wYaw - Math.PI / 2) * L * 0.075 * F.k;
      R.push('box', 'opaque', ex, _a[1] + 0.03 * F.k, ez, wYaw, 0, 0,
        0.06 * F.k, 0.05 * F.k, 0.05 * F.k, 0.05, 0.05, 0.06, C.eyeGlow || 0);
    }
    if (C.helmet) {
      R.push('sphere', 'opaque', _a[0], _a[1] + 0.09 * F.k, _a[2], wYaw, 0, -hp,
        0.34 * F.k, 0.30 * F.k, 0.34 * F.k, gear[0], gear[1], gear[2], em);
      R.push('box', 'opaque', _a[0] + fwdN[0] * 0.17 * F.k, _a[1] + 0.04 * F.k,
        _a[2] + fwdN[2] * 0.17 * F.k, wYaw, 0, -hp,
        0.14 * F.k, 0.05 * F.k, 0.34 * F.k, gear[0], gear[1], gear[2], em);
    } else if (!C.bald) {
      R.push('box', 'opaque', _a[0], _a[1] + 0.13 * F.k, _a[2], wYaw, 0, -hp,
        0.29 * F.k, 0.10 * F.k, 0.32 * F.k, hair[0], hair[1], hair[2], em);
    }
    if (C.shadow !== false) R.shadow(F.x, F.z, 0.5 * F.k, 0.4, C.shadowY);
  }

  BA.actor = {
    frame, toWorld, bone, part, chain, draw, newPose,
    idle, walk, climb, wrench, weld, reachUp, drive, DEF,
  };
})();
