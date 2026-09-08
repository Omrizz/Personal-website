/* ===================================================================
   Winamp-style mini player.

   Track 1 is a procedurally generated chiptune loop via the Web
   Audio API (no external audio files). Real songs can't be bundled
   as audio files here for licensing reasons, so later tracks embed
   the official YouTube video (visually hidden, audio only) and are
   controlled from this same UI -- the same approach the site that
   inspired this one uses for its own "90s rock" playlist.
   =================================================================== */

(function () {
  "use strict";

  var playBtn = document.getElementById("winamp-play");
  var pauseBtn = document.getElementById("winamp-pause");
  var stopBtn = document.getElementById("winamp-stop");
  var prevBtn = document.getElementById("winamp-prev");
  var nextBtn = document.getElementById("winamp-next");
  var shuffleBtn = document.getElementById("winamp-shuffle");
  var repeatBtn = document.getElementById("winamp-repeat");
  var plBtn = document.getElementById("winamp-pl");
  var volumeSlider = document.getElementById("winamp-volume");
  var timeEl = document.getElementById("winamp-time");
  var trackEl = document.getElementById("winamp-track");
  var specsEl = document.getElementById("winamp-specs");
  var playlistEl = document.getElementById("winamp-playlist");
  var canvas = document.getElementById("winamp-viz");
  if (!playBtn || !canvas) return;
  var ctx2d = canvas.getContext("2d");

  var PLAYLIST = [
    { title: "Untitled Loop.chip", artist: "Omri Vainkranz", type: "chiptune" },
    { title: "In the End", artist: "Linkin Park", type: "youtube", videoId: "eVTXPUF4Oz4" }
  ];
  var currentIndex = 0;

  var LEAD_STEP = 0.16; // seconds per lead step
  var BASE_PATTERN = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880.0, 698.46]; // C major-ish arpeggio
  var BASS_NOTES = [130.81, 146.83, 164.81, 196.0]; // root notes, one per 4 lead steps

  var audioCtx = null;
  var analyser = null;
  var masterGain = null;
  var pattern = BASE_PATTERN.slice();
  var stepIndex = 0;
  var chiptuneTimeoutId = null;

  var ytPlayer = null;
  var ytReadyCallbacks = [];
  var ytScriptRequested = false;

  var playing = false;
  var repeatOn = true;
  var shuffleOn = false;
  var playStartedAt = 0;
  var elapsedBeforePause = 0;
  var timeIntervalId = null;
  var vizPhase = 0;

  function currentTrack() { return PLAYLIST[currentIndex]; }

  function ytSafe(fn) {
    try { return fn(); } catch (err) { return undefined; }
  }

  /* ---------------- Chiptune backend ---------------- */

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

  function scheduleChiptuneStep() {
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
        chiptuneTimeoutId = setTimeout(function () { advanceOrStop(); }, LEAD_STEP * 1000);
        return;
      }
      if (shuffleOn) pattern = shuffleArray(BASE_PATTERN);
    }

    chiptuneTimeoutId = setTimeout(scheduleChiptuneStep, LEAD_STEP * 1000);
  }

  /* ---------------- YouTube backend ---------------- */

  function ensureYouTubeApi(callback) {
    if (window.YT && window.YT.Player) { callback(); return; }
    ytReadyCallbacks.push(callback);
    if (ytScriptRequested) return;
    ytScriptRequested = true;
    window.onYouTubeIframeAPIReady = function () {
      ytReadyCallbacks.forEach(function (cb) { cb(); });
      ytReadyCallbacks = [];
    };
    var tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.onerror = function () {
      ytScriptRequested = false;
      ytReadyCallbacks = [];
    };
    document.body.appendChild(tag);
  }

  function withYtPlayer(videoId, onReady) {
    ensureYouTubeApi(function () {
      try {
        if (ytPlayer) {
          ytPlayer.loadVideoById(videoId);
          onReady(ytPlayer);
          return;
        }
        ytPlayer = new window.YT.Player("yt-audio-host", {
          videoId: videoId,
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1 },
          events: {
            onReady: function () { onReady(ytPlayer); },
            onStateChange: handleYtStateChange
          }
        });
      } catch (err) { /* YouTube unreachable -- leave the track silent rather than crash the page */ }
    });
  }

  function handleYtStateChange(e) {
    if (e.data === window.YT.PlayerState.ENDED) {
      if (repeatOn) {
        e.target.seekTo(0);
        e.target.playVideo();
      } else {
        advanceOrStop();
      }
    }
  }

  /* ---------------- Shared transport ---------------- */

  function advanceOrStop() {
    if (currentIndex < PLAYLIST.length - 1) {
      loadTrack(currentIndex + 1, true);
    } else {
      stopPlayback();
    }
  }

  function play() {
    var track = currentTrack();
    playing = true;
    playStartedAt = Date.now();
    if (!timeIntervalId) timeIntervalId = setInterval(updateTimeDisplay, 500);
    playBtn.classList.add("active");

    if (track.type === "chiptune") {
      ensureAudio();
      if (audioCtx.state === "suspended") audioCtx.resume();
      scheduleChiptuneStep();
    } else if (track.type === "youtube") {
      withYtPlayer(track.videoId, function (p) {
        ytSafe(function () { p.setVolume(Number(volumeSlider.value)); });
        ytSafe(function () { p.playVideo(); });
      });
    }
  }

  function pause() {
    if (!playing) return;
    playing = false;
    elapsedBeforePause += (Date.now() - playStartedAt) / 1000;
    playBtn.classList.remove("active");

    var track = currentTrack();
    if (track.type === "chiptune") {
      clearTimeout(chiptuneTimeoutId);
    } else if (track.type === "youtube" && ytPlayer && ytPlayer.pauseVideo) {
      ytSafe(function () { ytPlayer.pauseVideo(); });
    }
  }

  function stopPlayback() {
    playing = false;
    elapsedBeforePause = 0;
    playBtn.classList.remove("active");

    var track = currentTrack();
    if (track.type === "chiptune") {
      clearTimeout(chiptuneTimeoutId);
      stepIndex = 0;
    } else if (track.type === "youtube" && ytPlayer && ytPlayer.stopVideo) {
      ytSafe(function () { ytPlayer.stopVideo(); });
    }
    updateTimeDisplay();
  }

  function loadTrack(index, autoplay) {
    var wasPlaying = playing;
    if (wasPlaying) pause();
    if (currentTrack().type === "chiptune") { clearTimeout(chiptuneTimeoutId); stepIndex = 0; }
    else if (ytPlayer && ytPlayer.stopVideo) { ytSafe(function () { ytPlayer.stopVideo(); }); }

    currentIndex = (index + PLAYLIST.length) % PLAYLIST.length;
    elapsedBeforePause = 0;
    updateTimeDisplay();
    renderTrackInfo();
    renderPlaylistActiveRow();

    if (autoplay || wasPlaying) play();
  }

  function updateTimeDisplay() {
    var track = currentTrack();
    var elapsed;
    if (track.type === "youtube" && ytPlayer && ytPlayer.getCurrentTime) {
      elapsed = ytSafe(function () { return ytPlayer.getCurrentTime(); }) || 0;
    } else {
      elapsed = elapsedBeforePause + (playing ? (Date.now() - playStartedAt) / 1000 : 0);
    }
    var m = Math.min(99, Math.floor(elapsed / 60));
    var s = Math.floor(elapsed % 60);
    var digits = (m < 10 ? "0" + m : "" + m) + (s < 10 ? "0" + s : "" + s);
    var digitEls = timeEl.querySelectorAll("[data-d]");
    digitEls.forEach(function (el, i) { el.textContent = digits[i]; });
  }

  function renderTrackInfo() {
    var track = currentTrack();
    var label = track.artist + " -- " + track.title;
    var sep = "    ";
    trackEl.textContent = label + sep + label + sep;
    specsEl.textContent = track.type === "youtube" ? "streamed / youtube / stereo" : "128kbps / 44kHz / stereo";
  }

  /* ---------------- Visualizer ---------------- */

  function drawViz() {
    var w = canvas.width, h = canvas.height;
    ctx2d.clearRect(0, 0, w, h);
    var track = currentTrack();
    var barCount = 42;
    var barW = w / barCount;

    if (track.type === "chiptune" && analyser) {
      var data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      for (var i = 0; i < data.length; i++) {
        var barH = (data[i] / 255) * h;
        ctx2d.fillStyle = i % 3 === 0 ? "#7cff7c" : "#4fce4f";
        ctx2d.fillRect(i * (w / data.length), h - barH, (w / data.length) - 1, barH);
      }
    } else {
      // No cross-origin access to the YouTube audio graph, so this is a
      // decorative stand-in that still reacts to play/pause state.
      vizPhase += playing ? 0.12 : 0;
      for (var b = 0; b < barCount; b++) {
        var amp = playing ? (Math.sin(vizPhase + b * 0.45) * 0.35 + 0.45) * (0.7 + 0.3 * Math.sin(b * 1.7 + vizPhase * 1.3)) : 0.04;
        var bh = Math.max(2, amp * h);
        ctx2d.fillStyle = b % 3 === 0 ? "#7cff7c" : "#4fce4f";
        ctx2d.fillRect(b * barW, h - bh, barW - 1, bh);
      }
    }
    requestAnimationFrame(drawViz);
  }
  requestAnimationFrame(drawViz);

  /* ---------------- Playlist panel ---------------- */

  function buildPlaylistUI() {
    playlistEl.innerHTML = "";
    PLAYLIST.forEach(function (track, i) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "winamp-track-row";
      row.innerHTML = '<span class="t-num"></span><span class="t-name"></span>';
      row.querySelector(".t-num").textContent = (i + 1 < 10 ? "0" : "") + (i + 1) + ".";
      row.querySelector(".t-name").textContent = track.artist + " - " + track.title;
      row.addEventListener("click", function () { loadTrack(i, true); });
      playlistEl.appendChild(row);
    });
    renderPlaylistActiveRow();
  }

  function renderPlaylistActiveRow() {
    var rows = playlistEl.querySelectorAll(".winamp-track-row");
    rows.forEach(function (row, i) { row.classList.toggle("active", i === currentIndex); });
  }

  plBtn.addEventListener("click", function () {
    playlistEl.hidden = !playlistEl.hidden;
    plBtn.classList.toggle("active", !playlistEl.hidden);
  });

  /* ---------------- Controls wiring ---------------- */

  playBtn.addEventListener("click", play);
  pauseBtn.addEventListener("click", pause);
  stopBtn.addEventListener("click", stopPlayback);
  prevBtn.addEventListener("click", function () { loadTrack(currentIndex - 1, true); });
  nextBtn.addEventListener("click", function () { loadTrack(currentIndex + 1, true); });

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
    var v = Number(volumeSlider.value);
    if (masterGain) masterGain.gain.value = v / 100;
    if (ytPlayer && ytPlayer.setVolume) ytSafe(function () { ytPlayer.setVolume(v); });
  });

  function stop() {
    stopPlayback();
  }

  buildPlaylistUI();
  renderTrackInfo();

  window.winamp = { stop: stop };
})();
