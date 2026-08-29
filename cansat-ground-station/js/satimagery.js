/* ============================================================
   SatImagery — real satellite imagery of Kennedy Space Center
   (Launch Complex 39A), loaded from the public Esri World
   Imagery tile service (no API key). Shared by the 3D terrain
   and the GPS tracking map. Falls back to a procedurally
   painted coastal scene when offline.
   ============================================================ */
"use strict";

const SatImagery = {
  /* Launch Complex 39A, Kennedy Space Center, Florida */
  LAT: 28.60839,
  LON: -80.60433,
  ZOOM: 15,
  GRID: 4,                      // 4x4 tiles = ~4.3 km square
  TILE_URL: (z, y, x) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,

  canvas: null,                 // 1024x1024 stitched imagery
  loaded: false,                // true once at least one real tile landed
  failed: false,
  padU: 0.5, padV: 0.5,         // launch-pad position within the canvas (0..1)
  metersPerPixel: 4.19,
  widthMeters: 4294,
  onUpdate: null,               // callback(SatImagery) whenever pixels change

  init() {
    const n = Math.pow(2, this.ZOOM);
    const xf = (this.LON + 180) / 360 * n;
    const latR = this.LAT * Math.PI / 180;
    const yf = (1 - Math.asinh(Math.tan(latR)) / Math.PI) / 2 * n;
    const x0 = Math.round(xf) - this.GRID / 2;
    const y0 = Math.round(yf) - this.GRID / 2;
    this.padU = (xf - x0) / this.GRID;
    this.padV = (yf - y0) / this.GRID;
    const tileMeters = 40075016.7 * Math.cos(latR) / n;
    this.metersPerPixel = tileMeters / 256;
    this.widthMeters = tileMeters * this.GRID;

    const c = document.createElement("canvas");
    c.width = c.height = this.GRID * 256;
    this.canvas = c;
    const g = c.getContext("2d");
    this._paintFallback(g, c.width);

    /* fetch real tiles; each one that arrives is composited in */
    let ok = 0, done = 0, total = this.GRID * this.GRID;
    for (let ty = 0; ty < this.GRID; ty++) {
      for (let tx = 0; tx < this.GRID; tx++) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          g.drawImage(img, tx * 256, ty * 256, 256, 256);
          ok++; done++;
          this.loaded = true;
          if (this.onUpdate) this.onUpdate(this);
        };
        img.onerror = () => { done++; if (done === total && !ok) this.failed = true; };
        img.src = this.TILE_URL(this.ZOOM, y0 + ty, x0 + tx);
      }
    }
    return this;
  },

  /* Painted stand-in: Florida coast — marsh, beach, Atlantic, pad, crawlerway */
  _paintFallback(g, w) {
    /* scrubland */
    g.fillStyle = "#43502e"; g.fillRect(0, 0, w, w);
    const rnd = (i, s) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
    for (let i = 0; i < 260; i++) {
      const shades = ["#4a5834", "#3c4929", "#525f38", "#465231", "#3f4c2c"];
      g.fillStyle = shades[i % 5];
      g.beginPath();
      g.ellipse(rnd(i, 1) * w, rnd(i, 2) * w, 14 + rnd(i, 3) * 60, 10 + rnd(i, 4) * 44, rnd(i, 5) * 3, 0, Math.PI * 2);
      g.fill();
    }
    /* marsh ponds */
    for (let i = 0; i < 40; i++) {
      g.fillStyle = "rgba(38,58,66,.85)";
      g.beginPath();
      g.ellipse(rnd(i, 6) * w * 0.7, rnd(i, 7) * w, 8 + rnd(i, 8) * 34, 6 + rnd(i, 9) * 22, rnd(i, 10) * 3, 0, Math.PI * 2);
      g.fill();
    }
    /* Atlantic ocean on the east side */
    const coast = w * 0.78;
    g.fillStyle = "#123246";
    g.beginPath();
    g.moveTo(coast, 0);
    for (let y = 0; y <= w; y += 32) g.lineTo(coast + Math.sin(y * 0.012) * 26, y);
    g.lineTo(w, w); g.lineTo(w, 0); g.closePath(); g.fill();
    /* beach line */
    g.strokeStyle = "#cfc39b"; g.lineWidth = 9;
    g.beginPath();
    for (let y = 0; y <= w; y += 32) {
      const x = coast + Math.sin(y * 0.012) * 26;
      y === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
    /* crawlerway */
    const px = this.padU * w, py = this.padV * w;
    g.strokeStyle = "#8b8574"; g.lineWidth = 14;
    g.beginPath(); g.moveTo(px, py); g.lineTo(px - w * 0.4, py + w * 0.18); g.stroke();
    /* pad apron */
    g.fillStyle = "#7d7f7b";
    g.beginPath(); g.arc(px, py, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#5b5d59";
    g.beginPath(); g.arc(px, py, 18, 0, Math.PI * 2); g.fill();
  },
};
