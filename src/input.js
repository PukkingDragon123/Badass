/* BADASS APOCALYPSE - keyboard / gamepad / touch */
(function () {
  'use strict';
  const { clamp } = BA;

  class Input {
    constructor(el) {
      this.keys = Object.create(null);
      this.pressed = Object.create(null);
      this.steer = 0; this.throttle = 0; this.brake = 0;
      this.handbrake = false; this.jump = false; this.jumpPressed = false;
      this.touch = { active: false, steer: 0, throttle: 0, drift: false, jump: false };
      this.anyPress = false;

      const down = (e) => {
        const k = e.code;
        if (!this.keys[k]) this.pressed[k] = true;
        this.keys[k] = true;
        this.anyPress = true;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(k)) e.preventDefault();
      };
      const up = (e) => { this.keys[e.code] = false; };
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);
      window.addEventListener('blur', () => { this.keys = Object.create(null); });

      // ---- touch: left half steers, right half is gas; two-finger = drift
      const zone = el;
      const pointers = new Map();
      const onDown = (e) => {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
        this.anyPress = true;
        if (e.pointerType === 'touch') this.touch.active = true;
      };
      const onMove = (e) => {
        const p = pointers.get(e.pointerId);
        if (p) { p.x = e.clientX; p.y = e.clientY; }
      };
      const onUp = (e) => {
        const p = pointers.get(e.pointerId);
        if (p && e.pointerType === 'touch') {
          const dt = performance.now() - p.t;
          const moved = Math.hypot(p.x - p.sx, p.y - p.sy);
          if (dt < 260 && moved < 22 && p.sx > window.innerWidth * 0.5) this.touch.jump = true;
        }
        pointers.delete(e.pointerId);
      };
      zone.addEventListener('pointerdown', onDown);
      zone.addEventListener('pointermove', onMove);
      zone.addEventListener('pointerup', onUp);
      zone.addEventListener('pointercancel', onUp);
      this.pointers = pointers;
    }

    consume(code) {
      if (this.pressed[code]) { this.pressed[code] = false; return true; }
      return false;
    }

    update() {
      const k = this.keys;
      let steer = 0, thr = 0, brake = 0;
      if (k.KeyA || k.ArrowLeft) steer -= 1;
      if (k.KeyD || k.ArrowRight) steer += 1;
      if (k.KeyW || k.ArrowUp) thr += 1;
      if (k.KeyS || k.ArrowDown) brake += 1;
      let hb = !!(k.ShiftLeft || k.ShiftRight);
      let jump = !!k.Space;

      // ---- gamepad
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (!p) continue;
        const ax = p.axes[0] || 0;
        if (Math.abs(ax) > 0.14) steer += ax;
        const rt = p.buttons[7] ? p.buttons[7].value : 0;
        const lt = p.buttons[6] ? p.buttons[6].value : 0;
        thr += rt;
        brake += lt;
        if (p.buttons[0] && p.buttons[0].pressed) jump = true;
        if ((p.buttons[1] && p.buttons[1].pressed) || (p.buttons[5] && p.buttons[5].pressed)) hb = true;
        if (p.buttons.some((b) => b && b.pressed)) this.anyPress = true;
        break;
      }

      // ---- touch
      if (this.touch.active) {
        let steerTouch = 0, gas = 0, drift = false;
        let n = 0;
        for (const p of this.pointers.values()) {
          if (p.sx < window.innerWidth * 0.5) {
            steerTouch = clamp((p.x - p.sx) / 70, -1, 1);
          } else {
            gas = 1; n++;
          }
        }
        if (n >= 2) drift = true;
        steer += steerTouch;
        thr += gas;
        if (drift) hb = true;
        if (this.touch.jump) { jump = true; this.touch.jump = false; }
      }

      const prevJump = this.jump;
      this.steer = clamp(steer, -1, 1);
      this.throttle = clamp(thr, 0, 1);
      this.brake = clamp(brake, 0, 1);
      this.handbrake = hb;
      this.jump = jump;
      this.jumpPressed = jump && !prevJump;
    }
  }

  BA.Input = Input;
})();
