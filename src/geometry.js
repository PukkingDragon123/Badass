/* BADASS APOCALYPSE - procedural meshes (no external assets, ever) */
(function () {
  'use strict';
  const { TAU } = BA;

  function emptyGeo() {
    return { pos: [], nrm: [], idx: [] };
  }

  function pushTri(g, a, b, c) {
    g.idx.push(a, b, c);
  }

  /* unit cube, centred, flat normals */
  function box() {
    const g = emptyGeo();
    const faces = [
      [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
      [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
      [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
      [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
      [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
      [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
    ];
    for (const [n, verts] of faces) {
      const b = g.pos.length / 3;
      for (const v of verts) {
        g.pos.push(v[0] * 0.5, v[1] * 0.5, v[2] * 0.5);
        g.nrm.push(n[0], n[1], n[2]);
      }
      pushTri(g, b, b + 1, b + 2);
      pushTri(g, b, b + 2, b + 3);
    }
    return g;
  }

  /* uv sphere, radius .5 */
  function sphere(seg = 14, rings = 10) {
    const g = emptyGeo();
    for (let y = 0; y <= rings; y++) {
      const v = y / rings, phi = v * Math.PI;
      for (let x = 0; x <= seg; x++) {
        const u = x / seg, th = u * TAU;
        const nx = Math.sin(phi) * Math.cos(th);
        const ny = Math.cos(phi);
        const nz = Math.sin(phi) * Math.sin(th);
        g.pos.push(nx * 0.5, ny * 0.5, nz * 0.5);
        g.nrm.push(nx, ny, nz);
      }
    }
    for (let y = 0; y < rings; y++) {
      for (let x = 0; x < seg; x++) {
        const a = y * (seg + 1) + x, b = a + seg + 1;
        pushTri(g, a, b, a + 1);
        pushTri(g, a + 1, b, b + 1);
      }
    }
    return g;
  }

  /* cylinder along an axis, diameter 1, length 1, with caps */
  function cylinder(seg = 16, axis = 'y', taper = 1) {
    const g = emptyGeo();
    const put = (a, b, c) => {
      // a = along-axis, (b,c) = the two perpendicular components
      if (axis === 'y') return [b, a, c];
      if (axis === 'x') return [a, b, c];
      return [b, c, a];
    };
    // side
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * TAU;
      const cx = Math.cos(t), cz = Math.sin(t);
      const nrm = put(0, cx, cz);
      const n2 = put(taper < 1 ? 0.4 : 0, cx, cz);
      const nl = Math.hypot(n2[0], n2[1], n2[2]) || 1;
      for (let k = 0; k < 2; k++) {
        const a = k ? 0.5 : -0.5;
        const r = (k ? taper : 1) * 0.5;
        const p = put(a, cx * r, cz * r);
        g.pos.push(p[0], p[1], p[2]);
        g.nrm.push(n2[0] / nl, n2[1] / nl, n2[2] / nl);
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2;
      pushTri(g, a, a + 1, a + 2);
      pushTri(g, a + 1, a + 3, a + 2);
    }
    // caps
    for (let k = 0; k < 2; k++) {
      const a = k ? 0.5 : -0.5;
      const r = (k ? taper : 1) * 0.5;
      if (r <= 0.0001) continue;
      const n = put(k ? 1 : -1, 0, 0);
      const base = g.pos.length / 3;
      const c = put(a, 0, 0);
      g.pos.push(c[0], c[1], c[2]);
      g.nrm.push(n[0], n[1], n[2]);
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * TAU;
        const p = put(a, Math.cos(t) * r, Math.sin(t) * r);
        g.pos.push(p[0], p[1], p[2]);
        g.nrm.push(n[0], n[1], n[2]);
      }
      for (let i = 0; i < seg; i++) {
        if (k) pushTri(g, base, base + 1 + i, base + 2 + i);
        else pushTri(g, base, base + 2 + i, base + 1 + i);
      }
    }
    return g;
  }

  /* cone pointing +Y, base diameter 1, height 1, origin at base centre */
  function cone(seg = 12) {
    const g = emptyGeo();
    for (let i = 0; i < seg; i++) {
      const t0 = (i / seg) * TAU, t1 = ((i + 1) / seg) * TAU, tm = (t0 + t1) * 0.5;
      const p0 = [Math.cos(t0) * 0.5, 0, Math.sin(t0) * 0.5];
      const p1 = [Math.cos(t1) * 0.5, 0, Math.sin(t1) * 0.5];
      const ap = [0, 1, 0];
      const nx = Math.cos(tm) * 0.9, nz = Math.sin(tm) * 0.9;
      const nl = Math.hypot(nx, 0.45, nz);
      const b = g.pos.length / 3;
      for (const p of [p0, p1, ap]) {
        g.pos.push(p[0], p[1], p[2]);
        g.nrm.push(nx / nl, 0.45 / nl, nz / nl);
      }
      pushTri(g, b, b + 1, b + 2);
      // base
      const bb = g.pos.length / 3;
      for (const p of [[0, 0, 0], p1, p0]) {
        g.pos.push(p[0], p[1], p[2]);
        g.nrm.push(0, -1, 0);
      }
      pushTri(g, bb, bb + 1, bb + 2);
    }
    return g;
  }

  /* flat disc in XZ plane, diameter 1, facing +Y */
  function disc(seg = 24) {
    const g = emptyGeo();
    g.pos.push(0, 0, 0);
    g.nrm.push(0, 1, 0);
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * TAU;
      g.pos.push(Math.cos(t) * 0.5, 0, Math.sin(t) * 0.5);
      g.nrm.push(0, 1, 0);
    }
    for (let i = 0; i < seg; i++) pushTri(g, 0, i + 2, i + 1);
    return g;
  }

  /* open-ended ring/tube in XZ plane, for shockwaves */
  function ring(seg = 40, inner = 0.72) {
    const g = emptyGeo();
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * TAU;
      const c = Math.cos(t), s = Math.sin(t);
      g.pos.push(c * inner * 0.5, 0, s * inner * 0.5);
      g.nrm.push(0, 1, 0);
      g.pos.push(c * 0.5, 0.06, s * 0.5);
      g.nrm.push(0, 1, 0);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2;
      pushTri(g, a, a + 2, a + 1);
      pushTri(g, a + 1, a + 2, a + 3);
    }
    return g;
  }

  /* unit quad in XZ, facing +Y */
  function plane(size = 1) {
    const g = emptyGeo();
    const h = size * 0.5;
    g.pos.push(-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h);
    for (let i = 0; i < 4; i++) g.nrm.push(0, 1, 0);
    pushTri(g, 0, 2, 1);
    pushTri(g, 0, 3, 2);
    return g;
  }

  /* saw blade: thin toothed disc in the XY plane, facing +Z, so a `roll`
     rotation spins it around its own axle */
  function saw(teeth = 8) {
    const g = emptyGeo();
    const th = 0.06;
    for (let k = 0; k < 2; k++) {
      const z = k ? th : -th;
      const base = g.pos.length / 3;
      g.pos.push(0, 0, z);
      g.nrm.push(0, 0, k ? 1 : -1);
      const steps = teeth * 4;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * TAU;
        const saw_ = (i % 4) < 2 ? 0.5 : 0.34;
        g.pos.push(Math.cos(t) * saw_, Math.sin(t) * saw_, z);
        g.nrm.push(0, 0, k ? 1 : -1);
      }
      for (let i = 0; i < steps; i++) {
        if (k) pushTri(g, base, base + i + 1, base + i + 2);
        else pushTri(g, base, base + i + 2, base + i + 1);
      }
    }
    return g;
  }

  BA.geo = { box, sphere, cylinder, cone, disc, ring, plane, saw };
})();
