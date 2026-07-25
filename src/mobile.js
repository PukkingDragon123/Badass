/* BADASS APOCALYPSE - on-screen controls: steering wheel, pedals, buttons */
(function () {
  'use strict';
  const { clamp, clamp01, damp } = BA;

  const MAX_WHEEL_DEG = 135;   // lock-to-lock, each way
  const STEER_DEG = 95;        // wheel angle that equals full steering input

  class TouchControls {
    constructor(input, audio) {
      this.input = input;
      this.audio = audio;
      this.angle = 0;          // current wheel rotation, degrees
      this.grab = null;
      this.enabled = false;

      const root = document.createElement('div');
      root.id = 'touch';
      root.innerHTML = `
        <div id="twheel">
          <div class="rim"></div>
          <div class="spoke s1"></div>
          <div class="spoke s2"></div>
          <div class="spoke s3"></div>
          <div class="hub">BA</div>
          <div class="grip gl"></div>
          <div class="grip gr"></div>
        </div>
        <div id="tright">
          <div class="trow">
            <button class="tbtn small" data-act="drift"><span>DRIFT</span></button>
            <button class="tbtn small" data-act="jump"><span>JUMP</span></button>
          </div>
          <div class="trow">
            <button class="tbtn nitro" data-act="nitro"><span>NOS</span></button>
          </div>
          <div class="trow">
            <button class="tbtn brake" data-act="brake"><span>BRAKE</span></button>
            <button class="tbtn gas" data-act="gas"><span>GAS</span></button>
          </div>
        </div>`;
      document.getElementById('ui').appendChild(root);
      this.root = root;
      this.wheel = root.querySelector('#twheel');

      this.bindWheel();
      this.bindButtons();

      // auto-show for touch devices, and the moment a real touch happens
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (coarse || 'ontouchstart' in window) this.setEnabled(true);
      window.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch' && !this.enabled) this.setEnabled(true);
      }, true);
    }

    setEnabled(on) {
      this.enabled = on;
      this.root.classList.toggle('on', on);
      // let the rest of the HUD get out of the thumbs' way
      document.body.classList.toggle('touchmode', on);
      this.input.virtual.active = on;
      if (!on) {
        const v = this.input.virtual;
        v.steer = v.throttle = v.brake = 0;
        v.drift = v.jump = v.nitro = false;
      }
    }

    toggle() { this.setEnabled(!this.enabled); return this.enabled; }

    bindWheel() {
      const el = this.wheel;
      const angleAt = (e) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dx = e.clientX - cx, dy = e.clientY - cy;
        return { a: Math.atan2(dy, dx) * 180 / Math.PI, d: Math.hypot(dx, dy), cx, w: r.width };
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* capture is a nicety */ }
        const g = angleAt(e);
        // grabbing the middle of the wheel is ambiguous to rotate, so those
        // touches fall back to a straight left/right drag
        this.grab = { id: e.pointerId, start: g.a, base: this.angle, x: e.clientX, mode: g.d < g.w * 0.22 ? 'drag' : 'turn' };
      });
      const move = (e) => {
        if (!this.grab || this.grab.id !== e.pointerId) return;
        e.preventDefault();
        if (this.grab.mode === 'turn') {
          const g = angleAt(e);
          let d = g.a - this.grab.start;
          while (d > 180) d -= 360;
          while (d < -180) d += 360;
          this.angle = clamp(this.grab.base + d, -MAX_WHEEL_DEG, MAX_WHEEL_DEG);
        } else {
          this.angle = clamp(this.grab.base + (e.clientX - this.grab.x) * 0.85, -MAX_WHEEL_DEG, MAX_WHEEL_DEG);
        }
      };
      el.addEventListener('pointermove', move);
      const release = (e) => { if (this.grab && this.grab.id === e.pointerId) this.grab = null; };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    }

    bindButtons() {
      const map = { gas: 'throttle', brake: 'brake', drift: 'drift', jump: 'jump', nitro: 'nitro' };
      for (const btn of this.root.querySelectorAll('.tbtn')) {
        const act = btn.dataset.act;
        const field = map[act];
        const set = (on) => {
          const v = this.input.virtual;
          if (field === 'throttle' || field === 'brake') v[field] = on ? 1 : 0;
          else v[field] = on;
          btn.classList.toggle('down', on);
        };
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          try { btn.setPointerCapture(e.pointerId); } catch (_) { /* capture is a nicety */ }
          set(true);
          if (this.audio) this.audio.resume();
        });
        const off = (e) => { e.preventDefault(); set(false); };
        btn.addEventListener('pointerup', off);
        btn.addEventListener('pointercancel', off);
        btn.addEventListener('pointerleave', (e) => { if (e.buttons === 0) set(false); });
      }
    }

    update(dt, game) {
      if (!this.enabled) return;
      if (!this.grab) this.angle = damp(this.angle, 0, 9, dt);   // self-centring
      this.wheel.style.transform = `rotate(${this.angle.toFixed(1)}deg)`;
      this.input.virtual.steer = clamp(this.angle / STEER_DEG, -1, 1);

      // dim the pad on menus so it never covers a card
      const playing = game.state === 'playing';
      this.root.classList.toggle('hide', !playing);
      if (!playing) {
        const v = this.input.virtual;
        v.throttle = v.brake = 0;
        v.drift = v.jump = v.nitro = false;
        for (const b of this.root.querySelectorAll('.tbtn.down')) b.classList.remove('down');
      }
      const nos = this.root.querySelector('.tbtn.nitro');
      if (nos) nos.classList.toggle('empty', game.car.fuel < 1);
    }
  }

  BA.TouchControls = TouchControls;
})();
