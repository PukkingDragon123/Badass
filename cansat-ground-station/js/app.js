/* ============================================================
   app.js — wires the simulation engine to the dashboard UI.
   ONE requestAnimationFrame loop drives everything; simulation
   speed is a dt multiplier, so timers can never stack.
   ============================================================ */
"use strict";

document.addEventListener("DOMContentLoaded", () => {

  const $ = id => document.getElementById(id);

  /* ---------------- modules ---------------- */
  const sim = new CanSatSim();
  const viz2d = new FlightViz($("viz2d"));
  const gps = new GpsMap($("gpsmap"));
  const viz3d = new CanSat3D($("viz3d"), $("viz3d-wrap"));
  if (!viz3d.ok) $("viz3d-fallback").hidden = false;

  const charts = {
    alt:   new StripChart($("chart-alt"),   { label: "Altitude vs Time",       unit: "m",   color: "#22d3ee" }),
    temp:  new StripChart($("chart-temp"),  { label: "Temperature vs Time",    unit: "°C",  color: "#fb923c" }),
    press: new StripChart($("chart-press"), { label: "Pressure vs Time",       unit: "hPa", color: "#a78bfa" }),
    vs:    new StripChart($("chart-vs"),    { label: "Vertical Speed vs Time", unit: "m/s", color: "#34d399",
                                              threshold: { value: -12, label: "SAFE LIMIT −12 m/s", color: "#f87171" } }),
  };

  Imagery.load($("imagery-strip"));

  /* ---------------- event log ---------------- */
  const logEl = $("event-log");
  let lastLogMsg = "";
  function log(msg, sev) {
    if (msg === lastLogMsg) return;           // never spam the same line
    lastLogMsg = msg;
    const li = document.createElement("li");
    li.className = "ev-" + (sev || "info");
    const t = document.createElement("span");
    t.className = "lt";
    t.textContent = fmtTime(sim.t);
    const m = document.createElement("span");
    m.className = "lm";
    m.textContent = msg;
    li.append(t, m);
    logEl.prepend(li);                         // newest on top
    while (logEl.children.length > 250) logEl.lastChild.remove();
  }

  function fmtTime(s) {
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(Math.floor(s % 60)).padStart(2, "0");
    return `T+${mm}:${ss}`;
  }

  /* ---------------- header / status ---------------- */
  const pill = $("conn-status");
  const STATUS_CLASS = {
    "SIMULATION READY":   "st-ready",
    "SIMULATION RUNNING": "st-running",
    "PAUSED":             "st-paused",
    "SIGNAL LOST":        "st-lost",
    "MISSION COMPLETED":  "st-complete",
  };
  function setStatus(s) {
    $("conn-status-text").textContent = s;
    pill.className = "conn-pill " + (STATUS_CLASS[s] || "st-ready");
    $("static-overlay").hidden = s !== "SIGNAL LOST";
  }

  const PHASE_CLASS = {
    "READY": "ph-ready", "ASCENDING": "ph-asc", "APOGEE": "ph-apogee",
    "PARACHUTE DEPLOYED": "ph-chute", "DESCENDING": "ph-desc", "LANDED": "ph-landed",
  };
  function setPhase(p) {
    const el = $("hdr-phase");
    el.textContent = p;
    el.className = "phase-chip " + (PHASE_CLASS[p] || "ph-ready");
  }

  /* ---------------- warning banner ---------------- */
  function setWarning(text) {
    const b = $("warn-banner");
    if (text) {
      $("warn-banner-text").textContent = text;
      b.hidden = false;
    } else {
      b.hidden = true;
    }
  }

  /* ---------------- telemetry cards ---------------- */
  const cardDefs = [
    { key: "alt",   card: "card-alt",   out: "tv-alt",   bar: "tb-alt",   fmt: v => v.toFixed(1),  pct: v => v / 500,
      cls: () => "" },
    { key: "temp",  card: "card-temp",  out: "tv-temp",  bar: "tb-temp",  fmt: v => v.toFixed(1),  pct: v => (v - 25) / 10,
      cls: () => "" },
    { key: "pressure", card: "card-press", out: "tv-press", bar: "tb-press", fmt: v => v.toFixed(1), pct: v => (v - 950) / 65,
      cls: () => "" },
    { key: "vs",    card: "card-vs",    out: "tv-vs",    bar: "tb-vs",    fmt: v => (v > 0 ? "+" : "") + v.toFixed(1), pct: v => Math.abs(v) / 25,
      cls: v => v < -12 ? "crit" : v < -9 ? "warn" : "" },
    { key: "batt",  card: "card-batt",  out: "tv-batt",  bar: "tb-batt",  fmt: v => v.toFixed(2),  pct: v => (v - 3.4) / 0.8,
      cls: v => v < 3.8 ? "crit" : v < 3.95 ? "warn" : "good" },
    { key: "rssi",  card: "card-rssi",  out: "tv-rssi",  bar: "tb-rssi",  fmt: v => v.toFixed(0),  pct: v => (v + 110) / 70,
      cls: v => v < -100 ? "crit" : v < -85 ? "warn" : "good" },
    { key: "sats",  card: "card-sats",  out: "tv-sats",  bar: "tb-sats",  fmt: v => String(v),     pct: v => v / 12,
      cls: v => v < 4 ? "crit" : v < 6 ? "warn" : "good" },
  ];

  function updateCards(pkt, silent) {
    for (const d of cardDefs) {
      const v = pkt[d.key];
      const out = $(d.out);
      const txt = d.fmt(v);
      const card = $(d.card);
      if (out.textContent !== txt) {
        out.textContent = txt;
        if (!silent) {
          card.classList.remove("bump");
          void card.offsetWidth;               // restart the animation
          card.classList.add("bump");
        }
      }
      $(d.bar).style.width = (Math.max(0, Math.min(1, d.pct(v))) * 100).toFixed(1) + "%";
      card.classList.remove("warn", "crit", "good");
      const c = d.cls(v);
      if (c) card.classList.add(c);
    }
    $("tv-lat").textContent = pkt.lat.toFixed(6) + "°";
    $("tv-lon").textContent = pkt.lon.toFixed(6) + "°";
    $("gps-lat").textContent = pkt.lat.toFixed(6);
    $("gps-lon").textContent = pkt.lon.toFixed(6);
    $("gps-dist").textContent = Math.hypot(pkt.x, pkt.y).toFixed(0);
    $("hdr-packet").textContent = "#" + String(pkt.packet).padStart(4, "0");
  }

  /* ---------------- sim callbacks ---------------- */
  sim.onEvent = (msg, sev) => {
    log(msg, sev);
    if (/liftoff/i.test(msg)) Sfx.launch();
    else if (/^APOGEE/.test(msg)) Sfx.apogee();
    else if (/^PARACHUTE/.test(msg)) Sfx.chute();
    else if (/HIGH DESCENT/.test(msg)) Sfx.warn();
    else if (/^SIGNAL LOST/.test(msg)) Sfx.lost();
    else if (/^Signal restored/.test(msg)) Sfx.restored();
    else if (/^Mission completed/.test(msg)) Sfx.landed();
  };
  sim.onPhase = setPhase;
  sim.onStatus = setStatus;
  sim.onWarning = setWarning;
  sim.onPacket = pkt => {
    updateCards(pkt);
    charts.alt.push(pkt.t, pkt.alt);
    charts.temp.push(pkt.t, pkt.temp);
    charts.press.push(pkt.t, pkt.pressure);
    charts.vs.push(pkt.t, pkt.vs);
    Sfx.packet();
    refreshButtons();
  };
  sim.onComplete = showSummary;

  /* ---------------- summary modal ---------------- */
  function showSummary(s) {
    $("sum-result").textContent = s.result;
    $("sum-result").className = "sum-result " + s.cls;
    $("sum-scenario").textContent = s.scenario;
    $("sum-maxalt").textContent = s.maxAlt.toFixed(1) + " m";
    $("sum-duration").textContent = fmtTime(s.duration) + " (" + s.duration.toFixed(1) + " s)";
    $("sum-maxdesc").textContent = s.maxDesc.toFixed(1) + " m/s";
    $("sum-packets").textContent = String(s.rxPackets);
    $("sum-lost").textContent = String(s.lostPackets);
    $("sum-dist").textContent = s.landingDist.toFixed(0) + " m";
    $("sum-landvs").textContent = s.landingVs.toFixed(1) + " m/s";
    const w = $("sum-warnings");
    w.innerHTML = "";
    for (const t of s.warnings) {
      const div = document.createElement("div");
      div.className = "sw";
      div.textContent = "⚠ " + t;
      w.appendChild(div);
    }
    $("summary-modal").hidden = false;
    refreshButtons();
  }
  $("btn-sum-close").addEventListener("click", () => { $("summary-modal").hidden = true; });
  $("btn-sum-reset").addEventListener("click", () => { $("summary-modal").hidden = true; doReset(); });

  /* ---------------- scenario selection ---------------- */
  const scenarioNames = { normal: "Normal Mission", fast: "Fast Descent", signal: "Signal Loss" };
  document.querySelectorAll(".scenario-card").forEach(btn => {
    btn.addEventListener("click", () => {
      if (sim.started && !sim.landed) return;
      if (!sim.selectScenario(btn.dataset.scenario)) return;
      document.querySelectorAll(".scenario-card").forEach(b => b.classList.toggle("selected", b === btn));
      $("hdr-scenario").textContent = scenarioNames[btn.dataset.scenario];
      log("Demo scenario selected: " + scenarioNames[btn.dataset.scenario], "info");
      Sfx.click();
      refreshButtons();
    });
  });

  /* ---------------- control buttons ---------------- */
  function refreshButtons() {
    $("btn-start").disabled = !(sim.scenario && !sim.started);
    $("btn-pause").disabled = !(sim.started && sim.running && !sim.landed);
    $("btn-resume").disabled = !(sim.started && !sim.running && !sim.landed);
    $("btn-export").disabled = sim.history.length === 0;
    document.querySelectorAll(".scenario-card").forEach(b => {
      b.disabled = sim.started && !sim.landed;
    });
  }

  $("btn-start").addEventListener("click", () => { if (sim.start()) { Sfx.click(); refreshButtons(); } });
  $("btn-pause").addEventListener("click", () => { if (sim.pause()) { Sfx.click(); refreshButtons(); } });
  $("btn-resume").addEventListener("click", () => { if (sim.resume()) { Sfx.click(); refreshButtons(); } });
  $("btn-reset").addEventListener("click", doReset);

  function doReset() {
    const keepScenario = sim.scenario;
    sim.reset();
    sim.scenario = keepScenario;
    for (const c of Object.values(charts)) c.reset();
    viz2d.reset();
    gps.reset();
    viz3d.reset();
    disp = null;
    setStatus("SIMULATION READY");
    setPhase("READY");
    setWarning(null);
    $("summary-modal").hidden = true;
    $("hdr-time").textContent = "T+00:00";
    updateCards(sim._makePacket(), true);
    $("hdr-packet").textContent = "#0000";
    lastLogMsg = "";
    log("Mission reset — all systems nominal", "info");
    Sfx.click();
    refreshButtons();
  }

  /* speed — a dt multiplier on the single loop, never a new timer */
  document.querySelectorAll(".spd").forEach(btn => {
    btn.addEventListener("click", () => {
      const n = Number(btn.dataset.speed);
      sim.setSpeed(n);
      document.querySelectorAll(".spd").forEach(b => b.classList.toggle("active", b === btn));
      log("Simulation speed set to x" + n, "info");
      Sfx.click();
    });
  });

  /* ---------------- CSV export ---------------- */
  $("btn-export").addEventListener("click", () => {
    const head = ["packet", "mission_time_s", "phase", "altitude_m", "vertical_speed_ms",
      "temperature_c", "pressure_hpa", "latitude", "longitude",
      "gps_satellites", "battery_v", "rssi_dbm"];
    const rows = sim.history.map(p => [
      p.packet, p.t.toFixed(2), p.phase, p.alt.toFixed(2), p.vs.toFixed(2),
      p.temp.toFixed(2), p.pressure.toFixed(2), p.lat.toFixed(6), p.lon.toFixed(6),
      p.sats, p.batt.toFixed(3), p.rssi.toFixed(1),
    ].join(","));
    const csv = "\uFEFF" + head.join(",") + "\r\n" + rows.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
    a.download = `cansat_telemetry_${sim.scenario || "demo"}_${stamp}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    log("Telemetry exported to CSV (" + sim.history.length + " packets)", "success");
    Sfx.click();
  });

  /* ---------------- GPS center + sound toggle ---------------- */
  $("btn-center").addEventListener("click", () => { gps.center(); Sfx.click(); });
  $("btn-sound").addEventListener("click", () => {
    Sfx.enabled = !Sfx.enabled;
    $("btn-sound").textContent = Sfx.enabled ? "🔊" : "🔇";
    $("btn-sound").classList.toggle("muted", !Sfx.enabled);
    if (Sfx.enabled) Sfx.click();
  });

  /* ---------------- keyboard shortcuts ---------------- */
  document.addEventListener("keydown", e => {
    if (e.target.matches("input, textarea")) return;
    if (e.code === "Space") {
      e.preventDefault();
      if (!sim.started) { if (sim.start()) refreshButtons(); }
      else if (sim.running) { sim.pause(); refreshButtons(); }
      else if (!sim.landed) { sim.resume(); refreshButtons(); }
    } else if (e.key === "r" || e.key === "R") {
      doReset();
    } else if (["1", "2", "5"].includes(e.key)) {
      const btn = document.querySelector(`.spd[data-speed="${e.key}"]`);
      if (btn) btn.click();
    }
  });

  /* ---------------- render loop ---------------- */
  /* `disp` is what the GROUND STATION knows — it eases toward the
     last RECEIVED packet, so during a signal blackout everything
     visibly freezes at the last known data. */
  let disp = null;
  let lastTs = performance.now();
  let clock = 0;

  function frame(ts) {
    const dtReal = Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    clock += dtReal;

    sim.tick(dtReal);

    const rx = sim.rx;
    if (!disp) disp = { alt: rx.alt, vs: rx.vs, x: rx.x, y: rx.y };
    const k = 1 - Math.exp(-dtReal * 3.2);
    disp.alt += (rx.alt - disp.alt) * k;
    disp.vs += (rx.vs - disp.vs) * k;
    disp.x += (rx.x - disp.x) * k;
    disp.y += (rx.y - disp.y) * k;

    /* header clock (ground-side, keeps counting during blackout) */
    if (sim.started && !sim.landed) $("hdr-time").textContent = fmtTime(sim.t);
    else if (sim.landed) $("hdr-time").textContent = fmtTime(sim.t);

    /* HUD */
    $("hud-alt").textContent = disp.alt.toFixed(1);
    $("hud-vs").textContent = (disp.vs > 0 ? "+" : "") + disp.vs.toFixed(1);

    const paused = sim.started && !sim.running && !sim.landed;
    const state = {
      alt: disp.alt, vs: disp.vs, x: disp.x, y: disp.y,
      lat: rx.lat, lon: rx.lon,
      phase: sim.landed ? "LANDED" : rx.phase,
      chute: rx.chute,
      fast: sim.scenario === "fast",
      signalLost: sim.signal === "lost",
      maxAlt: sim.maxAlt,
      paused,
    };

    if (!paused) {
      viz2d.draw(state, clock);
      gps.draw(state, clock);
    }
    viz3d.update(state, dtReal, clock);

    requestAnimationFrame(frame);
  }

  /* ---------------- boot ---------------- */
  log("Simulator initialized — software-only demo, no hardware attached", "info");
  updateCards(sim._makePacket(), true);
  setStatus("SIMULATION READY");
  setPhase("READY");
  refreshButtons();
  requestAnimationFrame(frame);
});
