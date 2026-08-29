/* ============================================================
   Imagery — loads REAL CanSat / rocketry photos live from the
   Wikimedia Commons public API (CORS-enabled, no API key).
   Falls back gracefully when offline: the panel just shows a
   note and the rest of the simulator keeps working.
   ============================================================ */
"use strict";

const Imagery = {
  QUERIES: ["cansat", "sounding rocket launch", "model rocket parachute"],
  MAX_TILES: 4,

  async load(container) {
    try {
      const tiles = [];
      for (const q of this.QUERIES) {
        if (tiles.length >= this.MAX_TILES) break;
        const found = await this._search(q, this.MAX_TILES - tiles.length + 2);
        for (const f of found) {
          if (tiles.length >= this.MAX_TILES) break;
          if (!tiles.some(t => t.url === f.url)) tiles.push(f);
        }
      }
      if (!tiles.length) throw new Error("no results");
      container.innerHTML = "";
      for (const t of tiles) {
        const a = document.createElement("a");
        a.className = "img-tile";
        a.href = t.pageUrl;
        a.target = "_blank";
        a.rel = "noopener";
        a.title = t.title + (t.artist ? " — " + t.artist : "");
        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = t.title;
        img.src = t.url;
        img.onerror = () => a.remove();
        const cap = document.createElement("div");
        cap.className = "img-cap";
        cap.textContent = t.title;
        a.append(img, cap);
        container.appendChild(a);
      }
    } catch (err) {
      container.innerHTML =
        '<div class="imagery-offline">📡 Offline — live imagery unavailable.<br>' +
        "The simulator itself runs fully offline.</div>";
    }
  },

  async _search(query, limit) {
    const api = "https://commons.wikimedia.org/w/api.php" +
      "?action=query&generator=search" +
      "&gsrsearch=" + encodeURIComponent(query) +
      "&gsrnamespace=6&gsrlimit=" + (limit + 6) +
      "&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=480" +
      "&format=json&origin=*";
    const res = await fetch(api, { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
    if (!res.ok) throw new Error("http " + res.status);
    const data = await res.json();
    const pages = Object.values((data.query || {}).pages || {});
    pages.sort((a, b) => (a.index || 0) - (b.index || 0));
    const out = [];
    for (const p of pages) {
      const ii = (p.imageinfo || [])[0];
      if (!ii || !/^image\/(jpe?g|png)/.test(ii.mime || "")) continue;
      const meta = ii.extmetadata || {};
      out.push({
        title: p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, ""),
        url: ii.thumburl || ii.url,
        pageUrl: ii.descriptionurl || "https://commons.wikimedia.org",
        artist: meta.Artist ? String(meta.Artist.value).replace(/<[^>]+>/g, "").slice(0, 60) : "",
      });
      if (out.length >= limit) break;
    }
    return out;
  },
};
