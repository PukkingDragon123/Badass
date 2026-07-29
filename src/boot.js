/* BADASS APOCALYPSE - boot */
(function () {
  'use strict';
  function fatal(msg) {
    const el = document.getElementById('fatal');
    el.style.display = 'grid';
    el.innerHTML = '<div><div style="font-size:26px;color:#ff5b45;margin-bottom:14px">ENGINE STALLED</div>' +
      '<div style="max-width:560px;color:#d8cccd">' + msg + '</div></div>';
  }

  // Every script writes its export onto BA. A CDN that caches each file
  // separately can hand back a mix of old and new ones after a push, which
  // otherwise surfaces as a baffling "undefined is not a constructor".
  const REQUIRED = ['Renderer', 'Audio', 'FX', 'Input', 'World', 'Horde', 'Car',
    'Weapons', 'Ragdolls', 'TouchControls', 'Bunker', 'Garage', 'Hud', 'Game',
    'actor', 'meta', 'icons', 'stages', 'Allies'];

  function missingParts() {
    return REQUIRED.filter((k) => !BA[k]);
  }

  window.addEventListener('DOMContentLoaded', () => {
    try {
      const missing = missingParts();
      if (missing.length) {
        throw new Error('STALE OR MISSING FILES: ' + missing.join(', ') +
          '.<br><br>This is almost always a cached copy of an older build. ' +
          'Hard-refresh the page, or open the single-file version of the game, ' +
          'which cannot get out of step with itself.');
      }
      const hud = new BA.Hud();
      // decorate the title screen with a few of the pixel icons
      const strip = document.getElementById('iconStrip');
      if (strip) {
        strip.innerHTML = ['spikes', 'rocket', 'saw', 'flame', 'minigun', 'tesla', 'mine', 'slam', 'gas']
          .map((id) => BA.icons.img(id, 38)).join('');
      }
      const game = new BA.Game(document.getElementById('gl'), document.getElementById('ov'), hud);
      window.GAME = game;
      hud.setScreen('title');

      const kick = () => game.audio.resume();
      window.addEventListener('pointerdown', kick, { once: true });
      window.addEventListener('keydown', kick, { once: true });
      window.addEventListener('beforeunload', () => { game.meta.lastTick = Date.now(); game.meta.save(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) game.meta.save();
        if (document.hidden && game.state === 'playing') {
          game.state = 'paused';
          hud.setScreen('pause');
          game.audio.silenceEngine();
        }
      });
    } catch (err) {
      console.error(err);
      const msg = err && err.message ? err.message : String(err);
      // only blame WebGL when WebGL is plausibly the problem
      const stale = missingParts().length > 0;
      fatal(msg + (stale ? '' :
        '<br><br>This game needs WebGL2. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration on.'));
    }
  });
})();
