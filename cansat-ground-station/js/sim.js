/* ============================================================
   CanSat mission simulation engine — pure software, no I/O.
   Drives phases READY → ASCENDING → APOGEE → PARACHUTE DEPLOYED
   → DESCENDING → LANDED for three scenarios.
   ============================================================ */
"use strict";

const SCENARIOS = {
  normal: { name: "Normal Mission" },
  fast:   { name: "Fast Descent"   },
  signal: { name: "Signal Loss"    },
};

const PHASE = {
  READY:  "READY",
  ASC:    "ASCENDING",
  APOGEE: "APOGEE",
  CHUTE:  "PARACHUTE DEPLOYED",
  DESC:   "DESCENDING",
  LANDED: "LANDED",
};

const STATUS = {
  READY:    "SIMULATION READY",
  RUNNING:  "SIMULATION RUNNING",
  PAUSED:   "PAUSED",
  LOST:     "SIGNAL LOST",
  COMPLETE: "MISSION COMPLETED",
};

/* Launch site — owned by SatImagery so the map, the 3D terrain and the
   telemetry can never disagree about where the pad is. */
const LAUNCH_LAT = SatImagery.LAT;
const LAUNCH_LON = SatImagery.LON;
const M_PER_DEG_LAT = 111320;

function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

class CanSatSim {
  constructor() {
    /* callbacks wired by app.js */
    this.onPacket = null;   // (pkt)                — a telemetry packet was received
    this.onEvent = null;    // (msg, severity)      — mission event for the log
    this.onPhase = null;    // (phase)
    this.onStatus = null;   // (status)
    this.onComplete = null; // (summary)
    this.onWarning = null;  // (text|null)          — banner control
    this.reset(true);
  }

  reset(silent) {
    this.scenario = this.scenario || null;
    this.phase = PHASE.READY;
    this.status = STATUS.READY;
    this.running = false;
    this.started = false;
    this.landed = false;
    this.speed = this.speed || 1;

    this.t = 0;               // mission time, seconds
    this.txPackets = 0;       // packets the CanSat transmitted
    this.rxPackets = 0;       // packets the ground station received
    this.packetAcc = 0;       // 1 Hz packet accumulator
    this.history = [];        // received packets (for charts + CSV)

    /* true physical state of the CanSat */
    this.alt = 0;
    this.vs = 0;
    this.x = 0; this.y = 0;   // ground-plane offset from launch pad, metres
    this.maxAlt = 0;
    this.maxDesc = 0;         // most negative vertical speed observed
    this.chuteDeployed = false;
    this.chuteTime = -1;      // mission time when the chute opened
    this.apogeeTime = -1;

    /* flight plan for this run */
    this.apogeeTarget = rand(410, 495);
    this.ascentTime = rand(26, 33);
    this.v0 = 2 * this.apogeeTarget / this.ascentTime;
    this.windDir = rand(0, Math.PI * 2);
    this.gustSeed = rand(0, 100);

    /* radio-link state */
    this.signal = "ok";       // ok | degrading | lost | restored
    this.lossStart = -1;
    this.lossDuration = rand(3, 5);
    this.lossTriggerAlt = rand(0.55, 0.75); // fraction of apogee, on ascent
    this.lostDuringBlackout = 0;

    this.warnedHighDescent = false;
    this.apogeeLogged = false;
    this.degradeTimer = 0;
    this.landingVs = 0;
    this.coastTimer = 0;
    this.chuteHold = 0;

    /* last packet actually received by the ground station */
    this.rx = this._makePacket();
    if (!silent) this._setStatus(STATUS.READY);
  }

  selectScenario(id) {
    if (this.started && !this.landed) return false; // locked mid-mission
    this.scenario = id;
    return true;
  }

  start() {
    if (this.started || !this.scenario) return false;
    this.started = true;
    this.running = true;
    this._setPhase(PHASE.ASC);
    this._setStatus(STATUS.RUNNING);
    this._emit("Mission started — liftoff!", "success");
    this._emit("CanSat ascending", "info");
    return true;
  }

  pause() {
    if (!this.started || this.landed || !this.running) return false;
    this.running = false;
    this._setStatus(STATUS.PAUSED);
    this._emit("Simulation paused", "info");
    return true;
  }

  resume() {
    if (!this.started || this.landed || this.running) return false;
    this.running = true;
    this._setStatus(this.signal === "lost" ? STATUS.LOST : STATUS.RUNNING);
    this._emit("Simulation resumed", "info");
    return true;
  }

  setSpeed(n) { this.speed = n; }

  /* Advance mission time. Called from ONE rAF loop — the speed
     multiplier scales dt, so no timers are ever stacked. */
  tick(dtReal) {
    if (!this.running || this.landed) return;
    let dt = dtReal * this.speed;
    /* sub-step for stable integration at x5 */
    while (dt > 0) {
      const h = Math.min(dt, 0.05);
      this._step(h);
      dt -= h;
      if (this.landed) break;
    }
  }

  /* ---------------- internal ---------------- */

  _step(dt) {
    this.t += dt;
    const t = this.t;

    /* -------- vertical motion by phase -------- */
    switch (this.phase) {
      case PHASE.ASC: {
        const p = clamp(t / this.ascentTime, 0, 1);
        this.vs = this.v0 * (1 - p) + Math.sin(t * 2.1 + this.gustSeed) * 0.6;
        if (p >= 1 || (this.vs < 0.6 && this.alt > this.apogeeTarget * 0.93)) {
          this._setPhase(PHASE.APOGEE);
          this.apogeeTime = t;
          this.coastTimer = 0;
        }
        break;
      }
      case PHASE.APOGEE: {
        this.coastTimer += dt;
        this.vs = lerp(0.4, -1.2, clamp(this.coastTimer / 1.6, 0, 1));
        if (this.coastTimer > 0.35 && this.apogeeLogged !== true) {
          this.apogeeLogged = true;
          this._emit(`APOGEE DETECTED — max altitude ${this.maxAlt.toFixed(1)} m`, "success");
        }
        if (this.coastTimer >= 1.6) {
          this._setPhase(PHASE.CHUTE);
          this.chuteDeployed = true;
          this.chuteTime = t;
          this.chuteHold = 0;
          this._emit(this.scenario === "fast"
            ? "PARACHUTE DEPLOYED — partial inflation detected!"
            : "PARACHUTE DEPLOYED", this.scenario === "fast" ? "warning" : "success");
        }
        break;
      }
      case PHASE.CHUTE: {
        this.chuteHold += dt;
        const target = this._descentTarget(t);
        this.vs = lerp(this.vs, target, 1 - Math.exp(-dt * 2.2));
        if (this.chuteHold >= 1.5) {
          this._setPhase(PHASE.DESC);
          this._emit("CanSat descending", "info");
        }
        break;
      }
      case PHASE.DESC: {
        const target = this._descentTarget(t);
        this.vs = lerp(this.vs, target, 1 - Math.exp(-dt * 1.6));
        if (this.scenario === "fast" && this.vs < -12 && !this.warnedHighDescent) {
          this.warnedHighDescent = true;
          this._emit(`HIGH DESCENT SPEED warning — ${this.vs.toFixed(1)} m/s exceeds safe limit (−12 m/s)`, "danger");
          if (this.onWarning) this.onWarning("HIGH DESCENT SPEED — " + Math.abs(this.vs).toFixed(0) + " m/s");
        }
        break;
      }
    }

    this.alt += this.vs * dt;
    if (this.alt > this.maxAlt) this.maxAlt = this.alt;
    if (this.vs < this.maxDesc) this.maxDesc = this.vs;

    /* -------- lateral wind drift -------- */
    if (this.phase !== PHASE.READY && !this.landed) {
      const wind = 1.4 + this.alt / 160 + Math.sin(t * 0.5 + this.gustSeed) * 0.7;
      const dir = this.windDir + Math.sin(t * 0.23 + this.gustSeed) * 0.5;
      this.x += Math.cos(dir) * wind * dt + rand(-0.25, 0.25) * dt * 8;
      this.y += Math.sin(dir) * wind * dt + rand(-0.25, 0.25) * dt * 8;
    }

    /* -------- landing -------- */
    if ((this.phase === PHASE.DESC || this.phase === PHASE.CHUTE) && this.alt <= 0) {
      this.landingVs = this.vs;
      this.alt = 0;
      this.vs = 0;
      this.landed = true;
      this.running = false;
      this._setPhase(PHASE.LANDED);
      /* radio is always regained on the ground */
      if (this.signal === "lost") this._restoreSignal();
      this._emit("Landing detected — touchdown confirmed", "success");
      this._emit("Mission completed", "success");
      this._setStatus(STATUS.COMPLETE);
      if (this.onWarning) this.onWarning(null);
      this._emitPacket(true);
      if (this.onComplete) this.onComplete(this.getSummary());
      return;
    }

    /* -------- signal-loss scenario -------- */
    this._updateSignal(dt);

    /* -------- 1 Hz telemetry packets -------- */
    this.packetAcc += dt;
    while (this.packetAcc >= 1.0) {
      this.packetAcc -= 1.0;
      this.txPackets++;
      if (this.signal === "lost") {
        this.lostDuringBlackout++;
      } else {
        this._emitPacket();
      }
    }
  }

  _descentTarget(t) {
    if (this.scenario === "fast") {
      /* streamer descent, −15…−25 m/s */
      return -20 + Math.sin(t * 0.33 + this.gustSeed) * 4.2 + rand(-0.6, 0.6);
    }
    /* nominal chute, −5…−8 m/s */
    return -6.5 + Math.sin(t * 0.4 + this.gustSeed) * 1.3 + rand(-0.25, 0.25);
  }

  _updateSignal(dt) {
    if (this.scenario !== "signal" || this.landed) return;
    const frac = this.alt / this.apogeeTarget;
    if (this.signal === "ok" && this.phase === PHASE.ASC && frac >= this.lossTriggerAlt) {
      this.signal = "degrading";
      this.degradeTimer = 0;
      this._emit("Signal strength degrading — RSSI dropping fast", "warning");
    } else if (this.signal === "degrading") {
      this.degradeTimer += dt;
      if (this.degradeTimer >= 2.2) {
        this.signal = "lost";
        this.lossStart = this.t;
        this.lostDuringBlackout = 0;
        this._setStatus(STATUS.LOST);
        this._emit("SIGNAL LOST — telemetry link down", "danger");
        if (this.onWarning) this.onWarning("SIGNAL LOST — ATTEMPTING TO RE-ACQUIRE LINK");
      }
    } else if (this.signal === "lost") {
      if (this.t - this.lossStart >= this.lossDuration) this._restoreSignal();
    }
  }

  _restoreSignal() {
    this.signal = "restored";
    if (!this.landed) this._setStatus(this.running ? STATUS.RUNNING : STATUS.PAUSED);
    this._emit(`Signal restored — link re-acquired (${this.lostDuringBlackout} packets lost in blackout)`, "success");
    if (this.onWarning) this.onWarning(null);
  }

  /* Build a telemetry packet from the current true state. */
  _makePacket() {
    const alt = Math.max(0, this.alt);
    const pressure = 1013.25 * Math.pow(1 - 2.25577e-5 * alt, 5.25588) + rand(-0.25, 0.25);
    const temp = 32.5 - 0.0065 * alt + Math.sin(this.t * 0.15) * 0.4 + rand(-0.15, 0.15);
    const batt = clamp(4.2 - this.t * 0.0009 + rand(-0.006, 0.006), 3.4, 4.2);

    let rssi = -48 - 22 * Math.log10(1 + alt / 40) + rand(-1.6, 1.6);
    let sats = clamp(Math.round(9 + Math.sin(this.t * 0.1 + this.gustSeed) * 2 + rand(-1, 1)), 5, 12);
    if (this.signal === "degrading") {
      rssi = lerp(rssi, -108, clamp(this.degradeTimer / 2.2, 0, 1));
      sats = Math.max(3, sats - Math.round(this.degradeTimer * 2));
    }

    const lat = LAUNCH_LAT + this.y / M_PER_DEG_LAT;
    const lon = LAUNCH_LON + this.x / (M_PER_DEG_LAT * Math.cos(LAUNCH_LAT * Math.PI / 180));

    return {
      packet: this.txPackets,
      t: this.t,
      phase: this.phase,
      alt, vs: this.vs, temp, pressure,
      lat, lon, sats,
      batt, rssi,
      x: this.x, y: this.y,
      chute: this.chuteDeployed,
      status: this.status,
    };
  }

  _emitPacket(force) {
    const pkt = this._makePacket();
    if (force) pkt.packet = ++this.txPackets;
    this.rx = pkt;
    this.rxPackets++;
    this.history.push(pkt);
    if (this.onPacket) this.onPacket(pkt);
  }

  getSummary() {
    const dist = Math.hypot(this.x, this.y);
    const warnings = [];
    if (this.scenario === "fast" || this.maxDesc < -12) {
      warnings.push(`HIGH DESCENT SPEED: peak ${Math.abs(this.maxDesc).toFixed(1)} m/s (safe limit 12 m/s). ` +
        `Landing velocity ${Math.abs(this.landingVs || 0).toFixed(1)} m/s — payload may be damaged. Check parachute sizing.`);
    }
    if (this.scenario === "signal") {
      warnings.push(`Telemetry blackout of ${this.lossDuration.toFixed(1)} s during flight — ${this.lostDuringBlackout} packets lost, link auto-recovered.`);
    }
    let result, cls;
    if (this.scenario === "fast") { result = "⚠ LANDED — UNSAFE DESCENT SPEED"; cls = "bad"; }
    else if (warnings.length)     { result = "✔ MISSION SUCCESS — WITH WARNINGS"; cls = "warn"; }
    else                          { result = "✔ MISSION SUCCESS — SAFE LANDING"; cls = "ok"; }
    return {
      result, cls, warnings,
      scenario: SCENARIOS[this.scenario].name,
      maxAlt: this.maxAlt,
      duration: this.t,
      maxDesc: this.maxDesc,
      landingVs: this.landingVs || 0,
      rxPackets: this.rxPackets,
      lostPackets: Math.max(0, this.txPackets - this.rxPackets),
      landingDist: dist,
    };
  }

  _setPhase(p) { this.phase = p; if (this.onPhase) this.onPhase(p); }
  _setStatus(s) { this.status = s; if (this.onStatus) this.onStatus(s); }
  _emit(msg, sev) { if (this.onEvent) this.onEvent(msg, sev || "info"); }
}
