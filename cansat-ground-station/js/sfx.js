/* ============================================================
   Sfx — tiny WebAudio sound effects, no audio files needed.
   Context is created lazily on the first user gesture.
   ============================================================ */
"use strict";

const Sfx = {
  enabled: true,
  ctx: null,

  _ac() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },

  tone(freq, dur, type, vol, delay) {
    if (!this.enabled) return;
    const ac = this._ac(); if (!ac) return;
    const t0 = ac.currentTime + (delay || 0);
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol || 0.08, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },

  sweep(f0, f1, dur, vol) {
    if (!this.enabled) return;
    const ac = this._ac(); if (!ac) return;
    const t0 = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(vol || 0.09, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },

  noise(dur, vol) {
    if (!this.enabled) return;
    const ac = this._ac(); if (!ac) return;
    const n = ac.sampleRate * dur;
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.value = vol || 0.12;
    const f = ac.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 900;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
  },

  /* named cues */
  click()     { this.tone(1400, 0.05, "square", 0.03); },
  launch()    { this.sweep(160, 720, 0.9, 0.1); this.noise(0.7, 0.06); },
  apogee()    { this.tone(880, 0.12, "sine", 0.09); this.tone(1320, 0.16, "sine", 0.09, 0.13); },
  chute()     { this.noise(0.35, 0.14); this.sweep(500, 260, 0.4, 0.07); },
  warn()      { for (let i = 0; i < 3; i++) { this.tone(980, 0.14, "square", 0.07, i * 0.24); this.tone(620, 0.14, "square", 0.07, i * 0.24 + 0.12); } },
  lost()      { this.sweep(700, 140, 0.7, 0.09); },
  restored()  { this.sweep(240, 900, 0.5, 0.08); },
  landed()    { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, "sine", 0.08, i * 0.13)); },
  packet()    { this.tone(2200, 0.02, "sine", 0.008); },
};
