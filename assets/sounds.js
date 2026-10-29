/* ===================================================================
   System sounds, synthesised with Web Audio (original little chimes,
   nothing sampled). A speaker in the tray toggles them; the choice is
   remembered. Sounds only ever play after a user gesture.
   =================================================================== */

(function () {
  "use strict";

  var KEY = "omrios.sounds";
  var btn = document.getElementById("tray-sound");
  var ac = null;
  var enabled = true;

  try { enabled = window.localStorage.getItem(KEY) !== "off"; } catch (e) { /* default on */ }

  function context() {
    if (!ac) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }

  function tone(freq, start, dur, type, vol) {
    var c = ac, t0 = c.currentTime + start;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  var SOUNDS = {
    startup: function () {
      [392, 523.25, 659.25, 783.99].forEach(function (f, i) {
        tone(f, i * 0.16, 1.4, "sine", 0.07);
        tone(f * 2, i * 0.16, 0.9, "triangle", 0.02);
      });
      tone(1046.5, 0.7, 1.6, "sine", 0.04);
    },
    shutdown: function () {
      [783.99, 659.25, 523.25, 392].forEach(function (f, i) {
        tone(f, i * 0.18, 1.1, "sine", 0.07);
      });
    },
    error: function () {
      tone(330, 0, 0.16, "square", 0.05);
      tone(247, 0.14, 0.24, "square", 0.05);
    }
  };

  function render() {
    if (!btn) return;
    btn.textContent = enabled ? "\u{1F50A}" : "\u{1F507}";
    btn.setAttribute("aria-pressed", enabled ? "true" : "false");
    btn.title = enabled ? "System sounds: on" : "System sounds: off";
  }

  window.uiSound = {
    play: function (name) {
      if (!enabled || !SOUNDS[name]) return;
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches && name !== "error") return;
      if (!context()) return;
      SOUNDS[name]();
    }
  };

  if (btn) {
    btn.addEventListener("click", function () {
      enabled = !enabled;
      try { window.localStorage.setItem(KEY, enabled ? "on" : "off"); } catch (e) { /* ignore */ }
      render();
      if (enabled) window.uiSound.play("error");
    });
  }
  render();
})();
