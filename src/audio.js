/* BADASS APOCALYPSE - procedural audio (WebAudio, zero samples) */
(function () {
  'use strict';
  const { clamp, lerp, rand, pick } = BA;

  class Audio {
    constructor() {
      this.ctx = null;
      this.ready = false;
      this.muted = false;
      this.engineOn = false;
      this.nextBeat = 0;
      this.beat = 0;
      this.intensity = 0;
    }

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.75;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 22;
      comp.ratio.value = 9;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      master.connect(comp).connect(ctx.destination);
      this.master = master;

      this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 1.0; this.sfxBus.connect(master);
      this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.42; this.musicBus.connect(master);

      // shared noise buffer
      const n = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;

      this.buildEngine();
      this.ready = true;
      this.nextBeat = ctx.currentTime + 0.1;
    }

    resume() {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    noise(dur, gain, type, f0, f1, q, dest) {
      const ctx = this.ctx, t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      src.playbackRate.value = rand(0.85, 1.2);
      const flt = ctx.createBiquadFilter();
      flt.type = type || 'lowpass';
      flt.frequency.setValueAtTime(f0, t);
      flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
      flt.Q.value = q || 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(flt).connect(g).connect(dest || this.sfxBus);
      src.start(t);
      src.stop(t + dur + 0.02);
      return g;
    }

    tone(freq, dur, gain, type, freqEnd, dest, delay) {
      const ctx = this.ctx, t = ctx.currentTime + (delay || 0);
      const o = ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(dest || this.sfxBus);
      o.start(t);
      o.stop(t + dur + 0.02);
      return o;
    }

    /* ------------------------------------------------------------ engine */
    buildEngine() {
      const ctx = this.ctx;
      const g = ctx.createGain(); g.gain.value = 0;
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass'; flt.frequency.value = 900; flt.Q.value = 3.2;
      const dist = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 512) - 1;
        curve[i] = Math.tanh(x * 2.6);
      }
      dist.curve = curve;

      this.eOsc = [];
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator();
        o.type = i === 2 ? 'square' : 'sawtooth';
        o.frequency.value = 60;
        const og = ctx.createGain();
        og.gain.value = i === 2 ? 0.18 : 0.4;
        o.connect(og).connect(dist);
        o.start();
        this.eOsc.push({ o, mul: [1, 0.503, 2.01][i] });
      }
      dist.connect(flt).connect(g).connect(this.master);
      this.engineGain = g;
      this.engineFilter = flt;

      // tyre skid
      const sN = ctx.createBufferSource();
      sN.buffer = this.noiseBuf; sN.loop = true;
      const sF = ctx.createBiquadFilter();
      sF.type = 'bandpass'; sF.frequency.value = 2400; sF.Q.value = 4;
      const sG = ctx.createGain(); sG.gain.value = 0;
      sN.connect(sF).connect(sG).connect(this.master);
      sN.start();
      this.skidGain = sG; this.skidFilter = sF;

      // wind
      const wN = ctx.createBufferSource();
      wN.buffer = this.noiseBuf; wN.loop = true;
      const wF = ctx.createBiquadFilter();
      wF.type = 'bandpass'; wF.frequency.value = 700; wF.Q.value = 0.7;
      const wG = ctx.createGain(); wG.gain.value = 0;
      wN.connect(wF).connect(wG).connect(this.master);
      wN.start();
      this.windGain = wG;
    }

    engine(rpm01, load, skid01, speed01, airborne) {
      if (!this.ready || this.muted) return;
      const t = this.ctx.currentTime;
      const base = lerp(46, 168, rpm01);
      for (const e of this.eOsc) e.o.frequency.setTargetAtTime(base * e.mul, t, 0.04);
      this.engineFilter.frequency.setTargetAtTime(lerp(420, 2600, rpm01 * 0.7 + load * 0.3), t, 0.06);
      this.engineGain.gain.setTargetAtTime(0.16 + load * 0.14 + (airborne ? 0.06 : 0), t, 0.07);
      this.skidGain.gain.setTargetAtTime(skid01 * 0.13, t, 0.05);
      this.skidFilter.frequency.setTargetAtTime(lerp(1400, 3400, skid01), t, 0.06);
      this.windGain.gain.setTargetAtTime(speed01 * speed01 * 0.055, t, 0.12);
    }

    silenceEngine() {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      this.engineGain.gain.setTargetAtTime(0, t, 0.1);
      this.skidGain.gain.setTargetAtTime(0, t, 0.1);
      this.windGain.gain.setTargetAtTime(0, t, 0.1);
    }

    /* --------------------------------------------------------------- sfx */
    hit(power) {
      if (!this.ready || this.muted) return;
      const p = clamp(power, 0, 1);
      this.noise(0.09 + p * 0.1, 0.30 + p * 0.4, 'lowpass', 900 + p * 2200, 120, 1.2);
      this.tone(rand(70, 120), 0.13, 0.28 + p * 0.25, 'square', 38);
    }
    squish() {
      if (!this.ready || this.muted) return;
      this.noise(0.14, 0.22, 'bandpass', rand(500, 900), 180, 2.4);
    }
    explode(size) {
      if (!this.ready || this.muted) return;
      const s = clamp(size, 0.4, 2);
      this.noise(0.5 * s, 0.55, 'lowpass', 1800, 60, 0.8);
      this.tone(rand(90, 130), 0.42 * s, 0.42, 'triangle', 28);
      this.noise(0.16, 0.3, 'highpass', 3000, 1200, 0.8);
    }
    shoot() {
      if (!this.ready || this.muted) return;
      this.noise(0.06, 0.13, 'highpass', 2400, 900, 1.0);
      this.tone(rand(320, 420), 0.06, 0.10, 'square', 140);
    }
    rocket() {
      if (!this.ready || this.muted) return;
      this.noise(0.28, 0.2, 'bandpass', 600, 2600, 1.6);
      this.tone(180, 0.2, 0.14, 'sawtooth', 620);
    }
    zap() {
      if (!this.ready || this.muted) return;
      this.noise(0.16, 0.24, 'highpass', 5200, 1400, 1.4);
      this.tone(1400, 0.12, 0.12, 'square', 300);
    }
    pickup(pitch) {
      if (!this.ready || this.muted) return;
      this.tone(520 * (1 + pitch * 0.5), 0.07, 0.07, 'triangle', 900 * (1 + pitch * 0.4));
    }
    boost() {
      if (!this.ready || this.muted) return;
      this.noise(0.45, 0.28, 'bandpass', 380, 3200, 2.2);
      this.tone(160, 0.35, 0.2, 'sawtooth', 720);
    }
    jump() {
      if (!this.ready || this.muted) return;
      this.tone(220, 0.16, 0.16, 'triangle', 640);
      this.noise(0.12, 0.1, 'bandpass', 900, 2000, 1.4);
    }
    land(p) {
      if (!this.ready || this.muted) return;
      this.noise(0.18, 0.22 + p * 0.3, 'lowpass', 700, 90, 1.0);
      this.tone(90, 0.2, 0.2 + p * 0.2, 'sine', 40);
    }
    hurt() {
      if (!this.ready || this.muted) return;
      this.tone(180, 0.3, 0.3, 'sawtooth', 60);
      this.noise(0.24, 0.24, 'lowpass', 700, 120, 1.0);
    }
    levelUp() {
      if (!this.ready || this.muted) return;
      [0, 4, 7, 12, 16].forEach((s, i) => {
        this.tone(330 * Math.pow(2, s / 12), 0.30, 0.13, 'triangle', null, this.sfxBus, i * 0.065);
      });
    }
    ui() {
      if (!this.ready || this.muted) return;
      this.tone(660, 0.05, 0.08, 'square', 880);
    }
    bigBad() {
      if (!this.ready || this.muted) return;
      this.tone(58, 1.1, 0.34, 'sawtooth', 34);
      this.noise(0.9, 0.3, 'lowpass', 500, 70, 1.0);
    }
    gameOver() {
      if (!this.ready || this.muted) return;
      [0, -3, -7, -12].forEach((s, i) => {
        this.tone(300 * Math.pow(2, s / 12), 0.7, 0.16, 'sawtooth', null, this.sfxBus, i * 0.19);
      });
    }

    /* ------------------------------------------------------------- music */
    updateMusic(dt, intensity, playing) {
      if (!this.ready || this.muted) return;
      this.intensity = lerp(this.intensity, playing ? clamp(intensity, 0, 1) : 0, 1 - Math.exp(-1.5 * dt));
      const ctx = this.ctx;
      this.musicBus.gain.setTargetAtTime(playing ? 0.40 : 0.10, ctx.currentTime, 0.4);
      const bpm = lerp(104, 150, this.intensity);
      const spb = 60 / bpm / 2; // eighth notes
      let guard = 0;
      while (this.nextBeat < ctx.currentTime + 0.25 && guard++ < 16) {
        this.step(this.nextBeat, this.beat);
        this.nextBeat += spb;
        this.beat++;
      }
    }

    step(t, i) {
      const ctx = this.ctx, bus = this.musicBus;
      const b = i % 16;
      const inten = this.intensity;
      const kick = (b % 4 === 0) || (b === 10 && inten > 0.35);
      if (kick) {
        const o = ctx.createOscillator(); o.type = 'sine';
        const g = ctx.createGain();
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
        g.gain.setValueAtTime(0.6, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        o.connect(g).connect(bus); o.start(t); o.stop(t + 0.26);
      }
      if (b % 8 === 4) {
        const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 1.1;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.30, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        s.connect(f).connect(g).connect(bus); s.start(t); s.stop(t + 0.18);
      }
      if (inten > 0.15 && b % 2 === 1) {
        const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.07 * inten, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        s.connect(f).connect(g).connect(bus); s.start(t); s.stop(t + 0.06);
      }
      // driving minor bassline
      const seq = [0, 0, 3, 0, 5, 0, 3, -2];
      const semi = seq[(i >> 1) % seq.length] - 12;
      if (b % 2 === 0 || inten > 0.5) {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        const f = ctx.createBiquadFilter(); f.type = 'lowpass';
        f.frequency.setValueAtTime(300 + 900 * inten, t);
        f.frequency.exponentialRampToValueAtTime(180, t + 0.2);
        f.Q.value = 6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16 + 0.1 * inten, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
        o.frequency.value = 110 * Math.pow(2, semi / 12);
        o.connect(f).connect(g).connect(bus); o.start(t); o.stop(t + 0.22);
      }
      if (inten > 0.55 && (b === 6 || b === 14)) {
        const o = ctx.createOscillator(); o.type = 'square';
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.055, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.frequency.value = 440 * Math.pow(2, (semi + 7) / 12);
        o.connect(g).connect(bus); o.start(t); o.stop(t + 0.32);
      }
    }
  }

  BA.Audio = Audio;
})();
