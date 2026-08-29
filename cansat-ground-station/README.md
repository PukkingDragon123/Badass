# 🛰️ CanSat Ground Station Simulator

A **software-only** web application that simulates a CanSat ground station —
no hardware, no ESP32, no sensors, no server, no API keys, no database.
Everything runs locally in the browser.

![demo mode](https://img.shields.io/badge/DEMO-MODE-orange) ![offline](https://img.shields.io/badge/runs-100%25%20offline-green)

## Run it

Just open the file — no build step, no dependencies to install:

```bash
# option 1: double-click
cansat-ground-station/index.html

# option 2: serve it (nicer URL, from the repo root)
npx http-server -p 8080 .
# → http://localhost:8080/cansat-ground-station/
```

Three.js is vendored in `js/vendor/`, so the 3D view works offline too.
The only thing that needs internet is the optional "Real CanSat Imagery"
panel, which pulls real photos live from the Wikimedia Commons public API
(CORS, no key) — when offline it simply shows a note.

## Mission scenarios

Pick one **before** launch:

| Scenario | What happens |
| --- | --- |
| 🪂 **Normal Mission** | Nominal ascent → apogee (400–500 m) → parachute → −5…−8 m/s descent → safe landing |
| 🔥 **Fast Descent** | Partial chute failure after apogee → −15…−25 m/s → **HIGH DESCENT SPEED** alert + warning in the mission summary |
| 📡 **Signal Loss** | RSSI degrades mid-flight → **SIGNAL LOST** → telemetry freezes for 3–5 s (last-known data, static overlay, lost packets) → link auto-recovers |

## Flight phases

`READY → ASCENDING → APOGEE → PARACHUTE DEPLOYED → DESCENDING → LANDED`

- Apogee is detected and logged with the recorded maximum altitude.
- On landing the clock stops, a mission summary pops up, and **Start stays
  locked until Reset**.

## Dashboard

- **Mission header** — DEMO MODE badge, selected scenario, mission time,
  packet number, flight phase, and an animated status pill:
  `SIMULATION READY / SIMULATION RUNNING / PAUSED / SIGNAL LOST / MISSION COMPLETED`
- **Telemetry cards** — Altitude, Temperature, Pressure, Vertical Speed,
  Battery, RSSI, GPS Satellites (+ GPS position). Icons, units, status
  colors and a bump animation on every update.
- **Real-time charts** — Altitude / Temperature / Pressure / Vertical-Speed
  vs time, drawn on **raw HTML canvas (no Chart.js)**: latest ~50 points,
  grid, autoscale, glow line, safe-limit threshold on the V/S chart,
  no errors when empty, fully cleared on reset.
- **Live 3D launch range** — real satellite terrain of Kennedy Space Center
  LC-39A (public Esri World Imagery tiles, no API key, painted fallback when
  offline), an uploaded rocket model (CC-BY "ROCKET" by Ret.ouchs) that
  carries the CanSat up with engine fire, smoke and pad dust, camera shake
  at liftoff, separation at apogee with the spent booster tumbling back
  under gravity, elastic parachute deploy with pendulum sway (fluttering
  partial chute in Fast Descent), a ground crew of astronauts (CC-BY
  "USA NASA Astronaut" by Chenzoss) who track the flight and walk out to
  recover the payload, plus swaying instanced trees, a mountain range and
  drifting clouds that part around the vehicle. **Drag to orbit, scroll to zoom.**
- **Analog flight instruments** — seven aircraft-style gauges (canvas-drawn
  needles, tick marks, red/amber arcs, digital readouts).
- **2D flight profile** — sky/ground scene with an altitude ruler, trail,
  max-altitude marker, motion arrow, thrust flame, parachute and phase label.
- **GPS tracking** — procedural map (no Google Maps, no API key) with launch
  marker, breadcrumb trail, pulsing live position, north compass, scale bar,
  drag-to-pan and a **⌖ Center Position** button. The position drifts
  continuously with the wind during the whole mission.
- **Mission event log** — timestamped, newest on top, color-coded severity,
  and consecutive duplicates are never re-logged.
- **Control panel** — Start Demo · Pause · Resume · Reset Mission ·
  Speed x1/x2/x5 · Export CSV. One `requestAnimationFrame` loop drives the
  whole simulation with the speed as a *dt multiplier*, so changing speed
  can never stack timers. Start is disabled mid-mission and after landing
  until Reset; Resume continues exactly where Pause left off.
- **Export CSV** — full received-packet history (packet, time, phase,
  altitude, v-speed, temperature, pressure, lat/lon, sats, battery, RSSI).
- **Sound effects** — WebAudio cues for launch, apogee, chute, warnings,
  signal loss/restore and touchdown (toggle with 🔊 in the header).

### Keyboard shortcuts

`SPACE` start / pause / resume · `R` reset · `1` `2` `5` sim speed

## Files

```
cansat-ground-station/
├── index.html          dashboard layout
├── css/style.css       mission-control theme
└── js/
    ├── sim.js          mission simulation engine (phases, scenarios, telemetry)
    ├── charts.js       raw-canvas real-time strip charts
    ├── flightviz.js    2D flight profile view
    ├── gpsmap.js       procedural GPS tracking map
    ├── cansat3d.js     Three.js 3D launch range (rocket, crew, terrain, particles)
    ├── gauges.js       analog flight instruments
    ├── satimagery.js   KSC satellite tiles (Esri, keyless) + fallback
    ├── sfx.js          WebAudio sound effects
    ├── imagery.js      live real-photo panel (Wikimedia Commons API)
    ├── app.js          UI glue: controls, log, cards, CSV export
    ├── vendor/  three.min.js + GLTFLoader.js
└── assets/  rocket.glb, astronaut.glb (CC-BY-4.0, credits in footer)
```
