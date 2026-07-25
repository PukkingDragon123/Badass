/* BADASS APOCALYPSE - boot */
(function () {
  'use strict';
  function fatal(msg) {
    const el = document.getElementById('fatal');
    el.style.display = 'grid';
    el.innerHTML = '<div><div style="font-size:26px;color:#ff5b45;margin-bottom:14px">ENGINE STALLED</div>' +
      '<div style="max-width:560px;color:#d8cccd">' + msg + '</div></div>';
  }

  window.addEventListener('DOMContentLoaded', () => {
    try {
      const hud = new BA.Hud();
      const game = new BA.Game(document.getElementById('gl'), document.getElementById('ov'), hud);
      window.GAME = game;
      hud.setScreen('title');

      const kick = () => game.audio.resume();
      window.addEventListener('pointerdown', kick, { once: true });
      window.addEventListener('keydown', kick, { once: true });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && game.state === 'playing') {
          game.state = 'paused';
          hud.setScreen('pause');
          game.audio.silenceEngine();
        }
      });
    } catch (err) {
      console.error(err);
      fatal((err && err.message ? err.message : String(err)) +
        '<br><br>This game needs WebGL2. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration on.');
    }
  });
})();
