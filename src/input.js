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
      this.nitro = false;
      this.anyPress = false;
      this.touchSeen = false;

      // written by the on-screen controls (src/mobile.js)
      this.virtual = { steer: 0, throttle: 0, brake: 0, drift: false, jump: false, nitro: false, active: false };

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

      window.addEventListener('pointerdown', (e) => {
        this.anyPress = true;
        if (e.pointerType === 'touch') this.touchSeen = true;
      }, true);
      window.addEventListener('contextmenu', (e) => {
        if (e.target && e.target.closest && e.target.closest('#touch')) e.preventDefault();
      });
    }

    consume(code) {
      if (this.pressed[code]) { this.pressed[code] = false; return true; }
      return false;
    }

    down(code) { return !!this.keys[code]; }

    /* let the on-screen pads drive the same key names as the keyboard */
    setKey(code, on) {
      if (on && !this.keys[code]) this.pressed[code] = true;
      this.keys[code] = !!on;
      if (on) this.anyPress = true;
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
      let nitro = !!(k.KeyX || k.ControlLeft || k.ControlRight);

      /* ---- gamepad ---- */
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (!p) continue;
        const ax = p.axes[0] || 0;
        if (Math.abs(ax) > 0.14) steer += ax;
        thr += p.buttons[7] ? p.buttons[7].value : 0;
        brake += p.buttons[6] ? p.buttons[6].value : 0;
        if (p.buttons[0] && p.buttons[0].pressed) jump = true;
        if ((p.buttons[1] && p.buttons[1].pressed) || (p.buttons[5] && p.buttons[5].pressed)) hb = true;
        if ((p.buttons[2] && p.buttons[2].pressed) || (p.buttons[4] && p.buttons[4].pressed)) nitro = true;
        if (p.buttons.some((b) => b && b.pressed)) this.anyPress = true;
        break;
      }

      /* ---- on-screen controls ---- */
      const v = this.virtual;
      if (v.active) {
        steer += v.steer;
        thr += v.throttle;
        brake += v.brake;
        if (v.drift) hb = true;
        if (v.jump) jump = true;
        if (v.nitro) nitro = true;
      }

      const prevJump = this.jump;
      this.steer = clamp(steer, -1, 1);
      this.throttle = clamp(thr, 0, 1);
      this.brake = clamp(brake, 0, 1);
      this.handbrake = hb;
      this.jump = jump;
      this.jumpPressed = jump && !prevJump;
      this.nitro = nitro;
    }
  }

  BA.Input = Input;
})();
