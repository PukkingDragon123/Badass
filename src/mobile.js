/* BADASS APOCALYPSE - on-screen controls: steering wheel, pedals, buttons */
(function () {
  'use strict';
  const { clamp, clamp01, damp } = BA;

  const MAX_WHEEL_DEG = 135;   // lock-to-lock, each way
  const STEER_DEG = 95;        // wheel angle that equals full steering input
  const DEADZONE = 0.17;       // fraction of wheel width around the hub that cannot anchor a turn

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
        </div>
        <div id="tbunk">
          <div class="tpad">
            <button class="tkey" data-k="KeyA"><span>&#9664;</span></button>
            <button class="tkey" data-k="KeyD"><span>&#9654;</span></button>
          </div>
          <div class="tpad right">
            <button class="tkey" data-k="KeyW"><span>&#9650;</span></button>
            <button class="tkey" data-k="KeyS"><span>&#9660;</span></button>
            <button class="tkey use" data-k="KeyE"><span>USE</span></button>
          </div>
        </div>`;
      document.getElementById('ui').appendChild(root);
      this.root = root;
      this.wheel = root.querySelector('#twheel');
      this.hub = root.querySelector('#twheel .hub');

      this.bunkPad = root.querySelector('#tbunk');
      this.bindWheel();
      this.bindButtons();
      this.bindBunkerPad();

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
        return { a: Math.atan2(dy, dx) * 180 / Math.PI, d: Math.hypot(dx, dy), w: r.width };
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* capture is a nicety */ }
        const g = angleAt(e);
        // Near the middle the angle to the finger is ill-conditioned - a pixel of
        // jitter swings it wildly - so hold off on anchoring until the finger is
        // far enough out for the angle to mean something. The wheel turns with
        // your finger everywhere; there is no second scheme to fall into.
        const live = g.d > g.w * DEADZONE;
        this.grab = { id: e.pointerId, start: g.a, base: this.angle, anchored: live };
      });
      const move = (e) => {
        if (!this.grab || this.grab.id !== e.pointerId) return;
        e.preventDefault();
        const g = angleAt(e);
        if (!this.grab.anchored) {
          if (g.d <= g.w * DEADZONE) return;   // still too close to the hub to read
          this.grab.anchored = true;
          this.grab.start = g.a;               // re-anchor where it first became meaningful
          this.grab.base = this.angle;
        }
        let d = g.a - this.grab.start;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        this.angle = clamp(this.grab.base + d, -MAX_WHEEL_DEG, MAX_WHEEL_DEG);
      };
      el.addEventListener('pointermove', move);
      const release = (e) => { if (this.grab && this.grab.id === e.pointerId) this.grab = null; };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    }

    /* the bunker is a side-scroller, so it gets its own little pad that just
       forges the same key codes the keyboard sends */
    bindBunkerPad() {
      for (const btn of this.bunkPad.querySelectorAll('.tkey')) {
        const code = btn.dataset.k;
        const set = (on) => {
          this.input.setKey(code, on);
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
      const a = this.angle;
      this.wheel.style.transform = `rotate(${a.toFixed(1)}deg)`;
      // the boss cap stays level while the rim turns under it, the way a real
      // airbag hub does - otherwise the logo ends up upside down at full lock
      if (this.hub) this.hub.style.transform = `translate(-50%,-50%) rotate(${(-a).toFixed(1)}deg)`;
      this.input.virtual.steer = clamp(this.angle / STEER_DEG, -1, 1);

      // show the driving rig only while driving, and the walk pad only in the
      // bunker, so neither ever sits on top of a menu
      const playing = game.state === 'playing';
      const walking = game.state === 'bunker';
      this.root.classList.toggle('hide', !playing && !walking);
      this.root.classList.toggle('walk', walking);
      if (!walking) {
        for (const b of this.bunkPad.querySelectorAll('.tkey.down')) {
          b.classList.remove('down');
          this.input.setKey(b.dataset.k, false);
        }
      }
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
