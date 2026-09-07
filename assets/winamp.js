/* ===================================================================
   Winamp-style mini player -- plays a small procedurally generated
   chiptune loop via the Web Audio API (no external audio files),
   with a canvas visualizer, shuffle and repeat.
   =================================================================== */

(function () {
  "use strict";

  var playBtn = document.getElementById("winamp-play");
  var pauseBtn = document.getElementById("winamp-pause");
  var stopBtn = document.getElementById("winamp-stop");
  var shuffleBtn = document.getElementById("winamp-shuffle");
  var repeatBtn = document.getElementById("winamp-repeat");
  var volumeSlider = document.getElementById("winamp-volume");
  var timeEl = document.getElementById("winamp-time");
  var canvas = document.getElementById("winamp-viz");
  if (!playBtn || !canvas) return;
  var ctx2d = canvas.getContext("2d");

  var LEAD_STEP = 0.16; // seconds per lead step
  var BASE_PATTERN = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880.0, 698.46]; // C major-ish arpeggio
  var BASS_NOTES = [130.81, 146.83, 164.81, 196.0]; // root notes, one per 2 lead steps... simplified below

  var audioCtx = null;
  var analyser = null;
  var masterGain = null;
  var pattern = BASE_PATTERN.slice();
  var stepIndex = 0;
  var timeoutId = null;
  var playing = false;
  var repeatOn = true;
  var shuffleOn = false;
  var playStartedAt = 0;
  var elapsedBeforePause = 0;
  var timeIntervalId = null;

  function ensureAudio() {
    if (audioCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    masterGain = audioCtx.createGain();
    masterGain.gain.value = Number(volumeSlider.value) / 100;
    analyser.connect(masterGain);
    masterGain.connect(audioCtx.destination);
  }

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function playNote(freq, startTime, duration, type, gainPeak) {
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainPeak, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain);
    gain.connect(analyser);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  function scheduleStep() {
    var now = audioCtx.currentTime;
    var freq = pattern[stepIndex % pattern.length];
    playNote(freq, now, LEAD_STEP * 0.9, "square", 0.09);

    if (stepIndex % 4 === 0) {
      var bass = BASS_NOTES[(Math.floor(stepIndex / 4)) % BASS_NOTES.length];
      playNote(bass, now, LEAD_STEP * 3.6, "triangle", 0.08);
    }

    stepIndex++;

    if (stepIndex % pattern.length === 0) {
      if (!repeatOn) {
        timeoutId = setTimeout(stopPlayback, LEAD_STEP * 1000);
        return;
      }
      if (shuffleOn) pattern = shuffleArray(BASE_PATTERN);
    }

    timeoutId = setTimeout(scheduleStep, LEAD_STEP * 1000);
  }

  function updateTimeDisplay() {
    var elapsed = elapsedBeforePause + (playing ? (Date.now() - playStartedAt) / 1000 : 0);
    var m = Math.floor(elapsed / 60);
    var s = Math.floor(elapsed % 60);
    timeEl.textContent = m + ":" + (s < 10 ? "0" + s : s);
  }

  function drawViz() {
    if (!analyser) {
      requestAnimationFrame(drawViz);
      return;
    }
    var data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    var w = canvas.width, h = canvas.height;
    ctx2d.clearRect(0, 0, w, h);
    var barW = w / data.length;
    for (var i = 0; i < data.length; i++) {
      var barH = (data[i] / 255) * h;
      ctx2d.fillStyle = i % 3 === 0 ? "#7cff7c" : "#4fce4f";
      ctx2d.fillRect(i * barW, h - barH, barW - 1, barH);
    }
    requestAnimationFrame(drawViz);
  }
  requestAnimationFrame(drawViz);

  function play() {
    ensureAudio();
    if (audioCtx.state === "suspended") audioCtx.resume();
    if (playing) return;
    playing = true;
    playStartedAt = Date.now();
    if (!timeIntervalId) timeIntervalId = setInterval(updateTimeDisplay, 500);
    scheduleStep();
    playBtn.classList.add("active");
  }

  function pause() {
    if (!playing) return;
    playing = false;
    elapsedBeforePause += (Date.now() - playStartedAt) / 1000;
    clearTimeout(timeoutId);
    playBtn.classList.remove("active");
  }

  function stopPlayback() {
    playing = false;
    clearTimeout(timeoutId);
    stepIndex = 0;
    elapsedBeforePause = 0;
    updateTimeDisplay();
    playBtn.classList.remove("active");
  }

  playBtn.addEventListener("click", play);
  pauseBtn.addEventListener("click", pause);
  stopBtn.addEventListener("click", stopPlayback);

  shuffleBtn.addEventListener("click", function () {
    shuffleOn = !shuffleOn;
    shuffleBtn.classList.toggle("active", shuffleOn);
    if (shuffleOn) pattern = shuffleArray(BASE_PATTERN);
    else pattern = BASE_PATTERN.slice();
  });

  repeatBtn.addEventListener("click", function () {
    repeatOn = !repeatOn;
    repeatBtn.classList.toggle("active", repeatOn);
  });

  volumeSlider.addEventListener("input", function () {
    if (masterGain) masterGain.gain.value = Number(volumeSlider.value) / 100;
  });

  window.winamp = { stop: stopPlayback };
})();
