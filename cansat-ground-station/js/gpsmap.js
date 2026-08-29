/* ============================================================
   GpsMap — a real slippy map on a raw <canvas>.

   Streams live Web-Mercator map tiles from keyless public
   services (Esri World Imagery / World Topo, OpenStreetMap),
   with drag-to-pan, scroll-to-zoom, follow mode, a breadcrumb
   trail in true lat/lon, launch marker, live position and a
   scale bar computed from the actual ground resolution.

   No API keys, no Leaflet, no Google Maps — just the standard
   {z}/{x}/{y} tile scheme and a 2D context. When the tiles
   cannot be reached it falls back to the painted terrain from
   satimagery.js, georeferenced to the same coordinates, so the
   view degrades instead of breaking.
   ============================================================ */
"use strict";

const TILE_SIZE = 256;

/* Keyless tile sources. Esri puts the row before the column in its REST
   path ({z}/{y}/{x}); OSM uses the usual {z}/{x}/{y}. */
const MAP_LAYERS = {
  sat: {
    label: "SATELLITE",
    maxZoom: 19,
    credit: "Imagery © Esri — Maxar, Earthstar Geographics",
    url: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  },
  street: {
    label: "STREET",
    maxZoom: 19,
    credit: "© OpenStreetMap contributors",
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  },
  topo: {
    label: "TOPO",
    maxZoom: 19,
    credit: "Topo © Esri — USGS, NOAA, HERE",
    url: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${x}`,
  },
};

/* ---------------- Web Mercator ---------------- */
const lonToWorldX = (lon, z) => (lon + 180) / 360 * Math.pow(2, z) * TILE_SIZE;
const latToWorldY = (lat, z) => {
  const s = Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * Math.pow(2, z) * TILE_SIZE;
};
const worldXToLon = (x, z) => x / (Math.pow(2, z) * TILE_SIZE) * 360 - 180;
const worldYToLat = (y, z) => {
  const n = Math.PI - 2 * Math.PI * y / (Math.pow(2, z) * TILE_SIZE);
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

/* ---------------- tile cache ---------------- */
const TileCache = {
  imgs: new Map(),          // key -> {img, ok, failed}
  order: [],
  max: 500,
  hits: 0,
  errors: 0,
  onTile: null,

  get(layerId, z, x, y) {
    const n = Math.pow(2, z);
    if (y < 0 || y >= n) return null;                 // above the pole
    x = ((x % n) + n) % n;                            // wrap the date line
    const key = `${layerId}/${z}/${x}/${y}`;
    let e = this.imgs.get(key);
    if (e) return e.ok ? e.img : null;

    e = { img: new Image(), ok: false, failed: false };
    e.img.crossOrigin = "anonymous";
    e.img.onload = () => {
      e.ok = true;
      this.hits++;
      if (this.onTile) this.onTile();
    };
    e.img.onerror = () => { e.failed = true; this.errors++; };
    e.img.src = MAP_LAYERS[layerId].url(z, x, y);

    this.imgs.set(key, e);
    this.order.push(key);
    while (this.order.length > this.max) {
      const old = this.order.shift();
      this.imgs.delete(old);
    }
    return null;
  },
};

class GpsMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    const site = (typeof SatImagery !== "undefined" && SatImagery.LAT != null)
      ? SatImagery : { LAT: 0, LON: 0 };
    this.siteLat = site.LAT;
    this.siteLon = site.LON;
    this.mPerDegLat = 111320;
    this.mPerDegLon = 111320 * Math.cos(this.siteLat * Math.PI / 180);

    this.layerId = "sat";
    this.zoom = 16;                 // fractional; tiles come from Math.round
    this.minZoom = 3;
    this.centerLat = this.siteLat;
    this.centerLon = this.siteLon;
    this.follow = true;
    this.trail = [];                // {lat, lon}
    this.frameN = 0;

    this._resize();
    if (window.ResizeObserver) new ResizeObserver(() => this._resize()).observe(canvas);
    this._bindInput();
    TileCache.onTile = () => { this.dirty = true; };
  }

  get layer() { return MAP_LAYERS[this.layerId]; }
  get maxZoom() { return this.layer.maxZoom; }

  /* metres of ground per screen pixel at the current centre */
  get metersPerPixel() {
    return 156543.03392 * Math.cos(this.centerLat * Math.PI / 180) / Math.pow(2, this.zoom);
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(Math.max(100, r.width) * dpr);
    this.canvas.height = Math.round(Math.max(100, r.height) * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width; this.h = r.height;
  }

  _bindInput() {
    let drag = null;
    this.canvas.addEventListener("pointerdown", e => {
      drag = { x: e.clientX, y: e.clientY, lat: this.centerLat, lon: this.centerLon, moved: false };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; this.follow = false; }
      const z = this.zi, scale = this.scaleAt(z);
      const cx = lonToWorldX(drag.lon, z) - dx / scale;
      const cy = latToWorldY(drag.lat, z) - dy / scale;
      this.centerLon = worldXToLon(cx, z);
      this.centerLat = worldYToLat(cy, z);
    });
    const end = () => { drag = null; };
    this.canvas.addEventListener("pointerup", end);
    this.canvas.addEventListener("pointercancel", end);

    this.canvas.addEventListener("wheel", e => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      this.zoomBy(e.deltaY < 0 ? 0.5 : -0.5, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    this.canvas.addEventListener("dblclick", e => {
      const r = this.canvas.getBoundingClientRect();
      this.zoomBy(1, e.clientX - r.left, e.clientY - r.top);
    });
  }

  /* zoom keeping the ground point under (sx, sy) fixed */
  zoomBy(dz, sx, sy) {
    const nz = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom + dz));
    if (nz === this.zoom) return;
    if (sx == null) { this.zoom = nz; return; }

    const before = this.screenToLatLon(sx, sy);
    this.zoom = nz;
    const after = this.screenToLatLon(sx, sy);
    this.centerLat += before.lat - after.lat;
    this.centerLon += before.lon - after.lon;
    this.follow = false;
  }

  get zi() { return Math.max(0, Math.min(this.maxZoom, Math.round(this.zoom))); }
  scaleAt(z) { return Math.pow(2, this.zoom - z); }

  screenToLatLon(sx, sy) {
    const z = this.zi, scale = this.scaleAt(z);
    const cx = lonToWorldX(this.centerLon, z), cy = latToWorldY(this.centerLat, z);
    return {
      lat: worldYToLat(cy + (sy - this.h / 2) / scale, z),
      lon: worldXToLon(cx + (sx - this.w / 2) / scale, z),
    };
  }

  /* metres east/north of the pad -> true lat/lon */
  offsetToLatLon(x, y) {
    return {
      lat: this.siteLat + (y || 0) / this.mPerDegLat,
      lon: this.siteLon + (x || 0) / this.mPerDegLon,
    };
  }

  setLayer(id) {
    if (!MAP_LAYERS[id]) return;
    this.layerId = id;
    this.zoom = Math.min(this.zoom, this.maxZoom);
  }

  center() { this.follow = true; }

  reset() {
    this.trail.length = 0;
    this.centerLat = this.siteLat;
    this.centerLon = this.siteLon;
    this.zoom = 16;
    this.follow = true;
  }

  /* ---------------- tile painting ---------------- */
  _drawTiles(ctx) {
    const z = this.zi, scale = this.scaleAt(z);
    const size = TILE_SIZE * scale;
    const cx = lonToWorldX(this.centerLon, z), cy = latToWorldY(this.centerLat, z);
    const left = cx - this.w / 2 / scale;
    const top = cy - this.h / 2 / scale;

    const x0 = Math.floor(left / TILE_SIZE), x1 = Math.floor((left + this.w / scale) / TILE_SIZE);
    const y0 = Math.floor(top / TILE_SIZE), y1 = Math.floor((top + this.h / scale) / TILE_SIZE);

    let drawn = 0, wanted = 0;
    ctx.imageSmoothingEnabled = true;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        wanted++;
        const dx = (tx * TILE_SIZE - left) * scale;
        const dy = (ty * TILE_SIZE - top) * scale;
        const img = TileCache.get(this.layerId, z, tx, ty);
        if (img) {
          ctx.drawImage(img, dx, dy, size + 0.5, size + 0.5);
          drawn++;
          continue;
        }
        /* nothing at this zoom yet - blow up an ancestor tile so the map
           still reads while the sharp one is in flight */
        for (let up = 1; up <= 4; up++) {
          const pz = z - up;
          if (pz < 0) break;
          const f = Math.pow(2, up);
          const px = Math.floor(tx / f), py = Math.floor(ty / f);
          const parent = TileCache.get(this.layerId, pz, px, py);
          if (!parent) continue;
          const sub = TILE_SIZE / f;
          ctx.drawImage(parent,
            (tx - px * f) * sub, (ty - py * f) * sub, sub, sub,
            dx, dy, size + 0.5, size + 0.5);
          drawn++;
          break;
        }
      }
    }
    return { drawn, wanted };
  }

  /* Painted stand-in from satimagery.js, georeferenced to the same ground
     square, so an offline map still shows the right shape in the right place */
  _drawFallback(ctx) {
    if (typeof SatImagery === "undefined" || !SatImagery.canvas) return false;
    const half = SatImagery.widthMeters / 2;
    const nw = this.offsetToLatLon(-half + (0.5 - SatImagery.padU) * SatImagery.widthMeters,
      half - (0.5 - SatImagery.padV) * SatImagery.widthMeters);
    const se = this.offsetToLatLon(half + (0.5 - SatImagery.padU) * SatImagery.widthMeters,
      -half - (0.5 - SatImagery.padV) * SatImagery.widthMeters);
    const a = this.latLonToScreen(nw.lat, nw.lon);
    const b = this.latLonToScreen(se.lat, se.lon);
    ctx.drawImage(SatImagery.canvas, a.x, a.y, b.x - a.x, b.y - a.y);
    return true;
  }

  latLonToScreen(lat, lon) {
    const z = this.zi, scale = this.scaleAt(z);
    const cx = lonToWorldX(this.centerLon, z), cy = latToWorldY(this.centerLat, z);
    return {
      x: this.w / 2 + (lonToWorldX(lon, z) - cx) * scale,
      y: this.h / 2 + (latToWorldY(lat, z) - cy) * scale,
    };
  }

  /* state: {x, y, lat, lon, phase, signalLost} — x east, y north (metres) */
  draw(state, time) {
    const { ctx, w, h } = this;
    if (!w) return;
    this.frameN++;

    const here = this.offsetToLatLon(state.x, state.y);
    if (this.follow) {
      this.centerLat += (here.lat - this.centerLat) * 0.10;
      this.centerLon += (here.lon - this.centerLon) * 0.10;
    }

    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, w, h);

    const { drawn, wanted } = this._drawTiles(ctx);
    const offline = drawn === 0 && TileCache.errors > 0;
    if (offline) this._drawFallback(ctx);
    this.tilesOk = drawn > 0;

    /* graticule: whole arc-minutes, so it means something */
    this._drawGraticule(ctx);

    /* ---- breadcrumb trail ---- */
    if (state.phase !== "READY" && this.frameN % 3 === 0) {
      const last = this.trail[this.trail.length - 1];
      const far = !last || Math.hypot(
        (here.lat - last.lat) * this.mPerDegLat,
        (here.lon - last.lon) * this.mPerDegLon) > 1.2;
      if (far) {
        this.trail.push(here);
        if (this.trail.length > 1200) this.trail.shift();
      }
    }
    if (this.trail.length > 1) {
      ctx.save();
      ctx.lineWidth = 3;
      ctx.lineJoin = ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(0,0,0,.45)";
      ctx.beginPath();
      for (let i = 0; i < this.trail.length; i++) {
        const p = this.latLonToScreen(this.trail[i].lat, this.trail[i].lon);
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.lineWidth = 2;
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.latLonToScreen(this.trail[i - 1].lat, this.trail[i - 1].lon);
        const b = this.latLonToScreen(this.trail[i].lat, this.trail[i].lon);
        ctx.strokeStyle = `rgba(255,210,63,${0.25 + 0.75 * (i / this.trail.length)})`;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.restore();
    }

    /* ---- launch marker ---- */
    const L = this.latLonToScreen(this.siteLat, this.siteLon);
    ctx.save();
    ctx.strokeStyle = "#7fd08a";
    ctx.fillStyle = "rgba(127,208,138,.22)";
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(L.x, L.y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(L.x - 5, L.y); ctx.lineTo(L.x + 5, L.y);
    ctx.moveTo(L.x, L.y - 5); ctx.lineTo(L.x, L.y + 5);
    ctx.stroke();
    this._label(ctx, "LAUNCH", L.x, L.y + 21, "#c9ecd2");
    ctx.restore();

    /* ---- live position ---- */
    const P = this.latLonToScreen(here.lat, here.lon);
    /* positive modulo: JS % keeps the sign of the dividend, and a negative
       pulse here would ask for a negative arc radius */
    const pulse = (((time % 1.6) + 1.6) % 1.6) / 1.6;
    ctx.save();
    if (state.signalLost) {
      ctx.strokeStyle = "rgba(224,104,92,.95)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(P.x, P.y, 10 + pulse * 8, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      this._label(ctx, "LAST KNOWN", P.x, P.y - 17, "#e0685c");
    } else {
      ctx.strokeStyle = `rgba(255,220,90,${1 - pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(P.x, P.y, 6 + pulse * 18, 0, Math.PI * 2); ctx.stroke();
    }
    /* heading tick, from the last bit of trail */
    const prev = this.trail[this.trail.length - 6] || this.trail[0];
    if (prev && !state.signalLost) {
      const q = this.latLonToScreen(prev.lat, prev.lon);
      const a = Math.atan2(P.y - q.y, P.x - q.x);
      if (Math.hypot(P.x - q.x, P.y - q.y) > 4) {
        ctx.strokeStyle = "rgba(255,210,63,.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(P.x, P.y);
        ctx.lineTo(P.x + Math.cos(a) * 17, P.y + Math.sin(a) * 17);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.beginPath(); ctx.arc(P.x, P.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = state.signalLost ? "#e0685c" : "#ffd23f";
    ctx.beginPath(); ctx.arc(P.x, P.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#04121a";
    ctx.beginPath(); ctx.arc(P.x, P.y, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    this._drawChrome(ctx, offline, drawn, wanted);
  }

  _label(ctx, text, x, y, colour) {
    ctx.font = "600 10px 'Barlow Condensed', sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,.75)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y);
  }

  /* lat/lon graticule on a round arc-minute step that suits the zoom */
  _drawGraticule(ctx) {
    const { w, h } = this;
    const steps = [1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 0.0005, 0.0002];
    const nw = this.screenToLatLon(0, 0), se = this.screenToLatLon(w, h);
    const spanLon = Math.abs(se.lon - nw.lon);
    let step = steps[steps.length - 1];
    for (const s of steps) { if (spanLon / s >= 3) { step = s; break; } }

    ctx.save();
    ctx.strokeStyle = "rgba(140,190,245,.16)";
    ctx.lineWidth = 1;
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "rgba(190,220,255,.45)";
    ctx.textAlign = "left";
    for (let lon = Math.ceil(nw.lon / step) * step; lon < se.lon; lon += step) {
      const x = this.latLonToScreen(nw.lat, lon).x;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.fillText(lon.toFixed(4) + "°", x + 3, h - 42);   // clear of the readout and scale bar
    }
    for (let lat = Math.floor(se.lat / step) * step; lat < nw.lat; lat += step) {
      const y = this.latLonToScreen(lat, nw.lon).y;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.fillText(lat.toFixed(4) + "°", 4, y - 3);
    }
    ctx.restore();
  }

  /* compass, scale bar, zoom readout, tile status */
  _drawChrome(ctx, offline, drawn, wanted) {
    const { w, h } = this;

    ctx.save();
    ctx.translate(w - 26, 26);
    ctx.fillStyle = "rgba(16,19,24,.72)";
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(180,210,250,.7)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#e0685c";
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-4, 2); ctx.lineTo(4, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(210,230,255,.9)";
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("N", 0, 11);
    ctx.restore();

    /* scale bar: pick a round distance that lands near 110 px */
    const mpp = this.metersPerPixel;
    const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
    let barM = nice[nice.length - 1];
    for (const n of nice) { if (n / mpp > 60) { barM = n; break; } }
    const barPx = barM / mpp;
    const bx = w - 16, by = h - 16;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,.6)";
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      ctx.moveTo(bx - barPx, by); ctx.lineTo(bx, by);
      ctx.moveTo(bx - barPx, by - 4); ctx.lineTo(bx - barPx, by + 4);
      ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 4);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(225,240,255,.95)";
    }
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.textAlign = "right";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,.7)";
    const barLabel = barM >= 1000 ? (barM / 1000) + " km" : barM + " m";
    ctx.strokeText(barLabel, bx, by - 8);
    ctx.fillStyle = "rgba(225,240,255,.95)";
    ctx.fillText(barLabel, bx, by - 8);
    ctx.restore();

    /* status chip: zoom, layer, and whether real tiles are up */
    const chip = offline
      ? "OFFLINE — PAINTED TERRAIN"
      : `Z${this.zoom.toFixed(1)} · ${this.layer.label}` + (drawn < wanted ? " · LOADING" : "");
    ctx.save();
    ctx.font = "10px 'IBM Plex Mono', monospace";
    const tw = ctx.measureText(chip).width;
    ctx.fillStyle = "rgba(16,19,24,.8)";
    ctx.fillRect(8, 8, tw + 14, 19);
    ctx.strokeStyle = offline ? "rgba(224,104,92,.7)" : "rgba(120,160,210,.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(8.5, 8.5, tw + 13, 18);
    ctx.fillStyle = offline ? "#e0685c" : "rgba(200,224,255,.9)";
    ctx.textAlign = "left";
    ctx.fillText(chip, 15, 21);
    ctx.restore();

    if (!this.follow) {
      ctx.save();
      ctx.font = "600 10px 'Barlow Condensed', sans-serif";
      ctx.fillStyle = "rgba(255,210,63,.85)";
      ctx.textAlign = "center";
      ctx.fillText("FREE PAN — CENTER POSITION TO RE-LOCK", w / 2, 20);
      ctx.restore();
    }
  }
}
