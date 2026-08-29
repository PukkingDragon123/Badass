/* ============================================================
   app.js — wires the simulation engine to the console UI.
   ONE requestAnimationFrame loop drives everything; simulation
   speed is a dt multiplier, so timers can never stack.
   ============================================================ */
"use strict";

document.addEventListener("DOMContentLoaded", () => {

  const $ = id => document.getElementById(id);

  /* ---------------- modules ---------------- */
  SatImagery.init();
  const sim = new CanSatSim();
  const viz2d = new FlightViz($("viz2d"));
  const gps = new GpsMap($("gpsmap"));
  const viz3d = new CanSat3D($("viz3d"), $("viz3d-wrap"));
  if (!viz3d.ok) $("viz3d-fallback").hidden = false;

  /* reveal the imagery credit once real tiles have landed */
  {
    const prev = SatImagery.onUpdate;
    SatImagery.onUpdate = s => { if (prev) prev(s); $("map-credit").hidden = false; };
  }

  const charts = {
    alt:   new StripChart($("chart-alt"),   { label: "Altitude vs Time",       unit: "m",   color: "#6ea8dc" }),
    temp:  new StripChart($("chart-temp"),  { label: "Temperature vs Time",    unit: "°C",  color: "#cf9352" }),
    press: new StripChart($("chart-press"), { label: "Pressure vs Time",       unit: "hPa", color: "#9b8fc0" }),
    vs:    new StripChart($("chart-vs"),    { label: "Vertical Speed vs Time", unit: "m/s", color: "#7fb98a",
                                              threshold: { value: -12, label: "SAFE LIMIT −12 m/s", color: "#c94c3f" } }),
  };

  const gauges = {
    alt:   new AnalogGauge($("g-alt"),   { label: "Altitude", unit: "m", min: 0, max: 600, ticks: 12, fmt: v => v.toFixed(0) }),
    vs:    new AnalogGauge($("g-vs"),    { label: "Vert Speed", unit: "m/s", min: -30, max: 40, ticks: 14, redLow: -12,
                                           fmt: v => (v > 0 ? "+" : "") + v.toFixed(1) }),
    temp:  new AnalogGauge($("g-temp"),  { label: "Temp", unit: "°C", min: 20, max: 40, ticks: 10, fmt: v => v.toFixed(1) }),
    press: new AnalogGauge($("g-press"), { label: "Pressure", unit: "hPa", min: 940, max: 1020, ticks: 8, fmt: v => v.toFixed(0) }),
    batt:  new AnalogGauge($("g-batt"),  { label: "Battery", unit: "V", min: 3.4, max: 4.3, ticks: 9, redLow: 3.8, amberLow: 3.95,
                                           fmt: v => v.toFixed(2) }),
    rssi:  new AnalogGauge($("g-rssi"),  { label: "RSSI", unit: "dBm", min: -120, max: -40, ticks: 8, redLow: -100, amberLow: -85,
                                           fmt: v => v.toFixed(0) }),
    sats:  new AnalogGauge($("g-sats"),  { label: "GPS Sats", unit: "count", min: 0, max: 14, ticks: 14, redLow: 4, amberLow: 6,
                                           fmt: v => String(Math.round(v)) }),
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

  function setWarning(text) {
    const b = $("warn-banner");
    if (text) { $("warn-banner-text").textContent = text; b.hidden = false; }
    else b.hidden = true;
  }

  /* ---------------- instruments ---------------- */
  function updateInstruments(pkt) {
    gauges.alt.set(pkt.alt);
    gauges.vs.set(pkt.vs);
    gauges.temp.set(pkt.temp);
    gauges.press.set(pkt.pressure);
    gauges.batt.set(pkt.batt);
    gauges.rssi.set(pkt.rssi);
    gauges.sats.set(pkt.sats);
    $("tv-lat").textContent = pkt.lat.toFixed(6) + "°";
    $("tv-lon").textContent = pkt.lon.toFixed(6) + "°";
    $("tv-range").textContent = Math.hypot(pkt.x, pkt.y).toFixed(0);
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
    updateInstruments(pkt);
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
      div.textContent = "CAUTION — " + t;
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
    updateInstruments(sim._makePacket());
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
      log("Simulation rate set to x" + n, "info");
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

    if (sim.started) $("hdr-time").textContent = fmtTime(sim.t);

    $("hud-alt").textContent = disp.alt.toFixed(1);
    $("hud-vs").textContent = (disp.vs > 0 ? "+" : "") + disp.vs.toFixed(1);

    for (const g of Object.values(gauges)) g.tick(dtReal);

    const paused = sim.started && !sim.running && !sim.landed;
    const state = {
      alt: disp.alt, vs: disp.vs, x: disp.x, y: disp.y,
      lat: rx.lat, lon: rx.lon,
      phase: sim.landed ? "LANDED" : rx.phase,
      chute: rx.chute,
      fast: sim.scenario === "fast",
      signalLost: sim.signal === "lost",
      burn: sim.started && !sim.landed && sim.phase === "ASCENDING" && sim.t < sim.ascentTime * 0.35,
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
  log("Simulator initialized — software-only demo, no flight hardware attached", "info");
  updateInstruments(sim._makePacket());
  setStatus("SIMULATION READY");
  setPhase("READY");
  refreshButtons();
  requestAnimationFrame(frame);
});
