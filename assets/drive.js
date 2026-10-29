/* ===================================================================
   Sunset Circuit -- an original top-down arcade racing game.

   Closed spline circuits, a drifty arcade car (velocity and heading are
   separate, so it slides), a fixed 60 Hz simulation, lap timing and a
   start / countdown / race / results flow. Everything here -- name,
   art, tracks, physics -- is built from scratch.
   =================================================================== */

(function () {
  "use strict";

  var canvas = document.getElementById("drive-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var W = canvas.width, H = canvas.height;

  var winDrive = document.getElementById("win-drive");
  var resetBtn = document.getElementById("drive-reset");
  var trackSel = document.getElementById("drive-track");
  var modeSel = document.getElementById("drive-mode");
  var muteBtn = document.getElementById("drive-mute");

  var TAU = Math.PI * 2;
  var STEP = 1 / 60;
  var WORLD_W = 1800, WORLD_H = 1200;
  var TRACK_W = 84;
  var SAMPLE = 8;
  var TOTAL_LAPS = 3;

  var MAX_SPEED = 5.4;
  var ACCEL = 0.15;
  var BRAKE = 0.22;
  var TURN = 0.058;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function fmtTime(t) {
    if (t == null || !isFinite(t)) return "--:--.--";
    var m = Math.floor(t / 60);
    var s = t - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2);
  }

  /* ---------------- Tracks ---------------- */

  var TRACK_DEFS = [
    {
      name: "Coastline Loop",
      seed: 11,
      points: [
        [900, 150], [1400, 200], [1650, 450], [1500, 750], [1150, 860],
        [1000, 650], [750, 600], [600, 860], [300, 960], [150, 650],
        [250, 350], [550, 250]
      ]
    },
    {
      name: "Neon Hairpin",
      seed: 29,
      points: [
        [350, 200], [700, 130], [1050, 230], [1400, 150], [1650, 350],
        [1600, 700], [1450, 1000], [1100, 1050], [850, 900], [900, 700],
        [650, 600], [350, 700], [250, 450]
      ]
    }
  ];

  function catmull(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
      y: 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
    };
  }

  function makeLayer() {
    var c = document.createElement("canvas");
    c.width = WORLD_W; c.height = WORLD_H;
    return c;
  }

  function buildTrack(def) {
    var pts = def.points, n = pts.length, dense = [], i, s;
    for (i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      for (s = 0; s < 24; s++) dense.push(catmull(p0, p1, p2, p3, s / 24));
    }

    var len = dense.length, seg = [], total = 0;
    for (i = 0; i < len; i++) {
      var a = dense[i], b = dense[(i + 1) % len];
      var l = Math.hypot(b.x - a.x, b.y - a.y);
      seg.push(l);
      total += l;
    }
    var N = Math.round(total / SAMPLE);
    var center = [], si = 0, acc = 0;
    for (i = 0; i < N; i++) {
      var d = i * total / N;
      while (acc + seg[si] < d) { acc += seg[si]; si++; }
      var t = (d - acc) / seg[si];
      var A = dense[si], B = dense[(si + 1) % len];
      center.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, ang: 0, nx: 0, ny: 0 });
    }
    for (i = 0; i < N; i++) {
      var nxt = center[(i + 1) % N], prv = center[(i - 1 + N) % N];
      var ang = Math.atan2(nxt.y - prv.y, nxt.x - prv.x);
      center[i].ang = ang;
      center[i].nx = -Math.sin(ang);
      center[i].ny = Math.cos(ang);
    }

    var track = { name: def.name, N: N, length: total, center: center, ground: makeLayer(), top: makeLayer() };
    paintTrack(track, def.seed);
    return track;
  }

  function distToTrack(track, x, y) {
    var best = Infinity, c = track.center;
    for (var i = 0; i < track.N; i += 2) {
      var dx = c[i].x - x, dy = c[i].y - y;
      var d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  function tracePath(g, track) {
    var c = track.center;
    g.beginPath();
    g.moveTo(c[0].x, c[0].y);
    for (var i = 1; i < track.N; i++) g.lineTo(c[i].x, c[i].y);
    g.closePath();
  }

  function paintTrack(track, seed) {
    var g = track.ground.getContext("2d"), top = track.top.getContext("2d"), rnd = mulberry32(seed);
    var i, x, y;

    // grass with soft mowing stripes
    g.fillStyle = "#2f8a5e";
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    for (i = 0; i < WORLD_W; i += 60) {
      g.fillStyle = (i / 60) % 2 ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.035)";
      g.fillRect(i, 0, 60, WORLD_H);
    }
    for (i = 0; i < 900; i++) {
      g.fillStyle = rnd() < 0.5 ? "rgba(20,70,45,.35)" : "rgba(120,200,120,.18)";
      g.fillRect(rnd() * WORLD_W, rnd() * WORLD_H, 2 + rnd() * 3, 2 + rnd() * 3);
    }

    // sand verge, curb, asphalt
    g.lineJoin = "round";
    g.lineCap = "round";
    tracePath(g, track);
    g.strokeStyle = "#e0b27a"; g.lineWidth = TRACK_W + 44; g.stroke();
    tracePath(g, track);
    g.strokeStyle = "#d8342f"; g.lineWidth = TRACK_W + 14; g.stroke();
    g.lineCap = "butt";
    g.setLineDash([16, 16]);
    g.strokeStyle = "#f5f5f5"; g.stroke();
    g.setLineDash([]);
    tracePath(g, track);
    g.strokeStyle = "#3a3a4a"; g.lineWidth = TRACK_W; g.stroke();
    g.setLineDash([18, 20]);
    g.strokeStyle = "rgba(240,230,200,.55)"; g.lineWidth = 2; g.stroke();
    g.setLineDash([]);

    // start / finish line
    var c0 = track.center[0];
    g.save();
    g.translate(c0.x, c0.y);
    g.rotate(c0.ang);
    var cells = Math.round(TRACK_W / 12);
    for (var r = 0; r < 2; r++) {
      for (var k = 0; k < cells; k++) {
        g.fillStyle = (r + k) % 2 ? "#fff" : "#111";
        g.fillRect(-12 + r * 12, -TRACK_W / 2 + k * 12, 12, 12);
      }
    }
    g.restore();

    // scenery: bushes + palms, kept clear of the road
    var palms = [];
    var tries = 0;
    while (palms.length < 150 && tries++ < 2000) {
      x = 30 + rnd() * (WORLD_W - 60);
      y = 30 + rnd() * (WORLD_H - 60);
      if (distToTrack(track, x, y) < TRACK_W / 2 + 60) continue;
      palms.push({ x: x, y: y, rot: rnd() * TAU, bush: rnd() < 0.35 });
    }
    palms.forEach(function (p) {
      if (p.bush) {
        g.fillStyle = "rgba(0,0,0,.22)";
        g.beginPath(); g.ellipse(p.x + 4, p.y + 5, 13, 8, 0, 0, TAU); g.fill();
        g.fillStyle = "#237a4d";
        g.beginPath(); g.arc(p.x, p.y, 10, 0, TAU); g.fill();
        g.fillStyle = "#2f9a62";
        g.beginPath(); g.arc(p.x - 3, p.y - 3, 6, 0, TAU); g.fill();
      } else {
        g.fillStyle = "rgba(0,0,0,.25)";
        g.beginPath(); g.ellipse(p.x + 9, p.y + 9, 17, 8, 0, 0, TAU); g.fill();
        top.save();
        top.translate(p.x, p.y);
        for (var f = 0; f < 7; f++) {
          top.save();
          top.rotate(p.rot + f * TAU / 7);
          top.fillStyle = f % 2 ? "#1c8a52" : "#27a862";
          top.beginPath(); top.ellipse(14, 0, 15, 5, 0, 0, TAU); top.fill();
          top.restore();
        }
        top.fillStyle = "#6b4a2b";
        top.beginPath(); top.arc(0, 0, 3.2, 0, TAU); top.fill();
        top.restore();
      }
    });

    // start gantry (drawn on the top layer so cars pass beneath it)
    top.save();
    top.translate(c0.x, c0.y);
    top.rotate(c0.ang);
    top.fillStyle = "#222";
    top.fillRect(-4, -TRACK_W / 2 - 10, 8, 10);
    top.fillRect(-4, TRACK_W / 2, 8, 10);
    var banner = Math.round(TRACK_W / 10);
    for (var b = 0; b < banner; b++) {
      top.fillStyle = b % 2 ? "#fff" : "#ff5d8f";
      top.fillRect(-5, -TRACK_W / 2 + b * 10, 10, 10);
    }
    top.restore();
  }

  /* ---------------- Cars & race state ---------------- */

  var tracks = [];
  var trackIndex = 0;
  var track = null;
  var cars, player, phase, countdown, tick, shake;

  var COLORS = ["#ff5d8f", "#3fd0ff", "#ffb63f", "#9be15d"];
  var RIVALS = [
    { name: "Rex", color: COLORS[1], skill: 0.93, lane: -14 },
    { name: "Nova", color: COLORS[2], skill: 0.96, lane: 10 },
    { name: "Pixel", color: COLORS[3], skill: 0.9, lane: -4 }
  ];
  var mode = "race";

  function makeCar(slot, color, isPlayer, name) {
    var c = track.center;
    var idx = (track.N - 7 - slot * 6 + track.N) % track.N;
    var off = (slot % 2 ? 1 : -1) * 17;
    var cp = c[idx];
    return {
      isPlayer: isPlayer,
      name: name,
      color: color,
      x: cp.x + cp.nx * off, y: cp.y + cp.ny * off,
      vx: 0, vy: 0, angle: cp.ang, steer: 0,
      idx: idx, prog: idx - track.N, off: Math.abs(off), lapsDone: 0, lapStart: 0,
      lapTimes: [], finished: false, finishTime: null,
      speed: 0, slip: 0, braking: false, onRoad: true,
      skill: 1, lane: 0, offTicks: 0, bump: 0
    };
  }

  function loadTrack(i) {
    trackIndex = i;
    if (!tracks[i]) tracks[i] = buildTrack(TRACK_DEFS[i]);
    track = tracks[i];
  }

  function newRace() {
    if (mode === "race") {
      // player starts 3rd on the grid so there's someone to chase and someone to hold off
      var order = [RIVALS[1], RIVALS[0], null, RIVALS[2]];
      cars = order.map(function (r, slot) {
        if (!r) return makeCar(slot, COLORS[0], true, "You");
        var car = makeCar(slot, r.color, false, r.name);
        car.skill = r.skill;
        car.lane = r.lane;
        return car;
      });
      player = cars[2];
    } else {
      cars = [makeCar(0, COLORS[0], true, "You")];
      player = cars[0];
    }
    phase = "menu";
    countdown = 0;
    tick = 0;
    shake = 0;
    cam.x = player.x; cam.y = player.y; cam.zoom = 1;
  }

  /* ---------------- Input ---------------- */

  var keys = { up: false, down: false, left: false, right: false, hand: false };

  function driveWindowOpen() {
    return winDrive.classList.contains("open") && !winDrive.classList.contains("minimized");
  }
  function driveWindowFocused() {
    return driveWindowOpen() && winDrive.classList.contains("active-window");
  }

  function mapKey(code) {
    switch (code) {
      case "ArrowUp": case "KeyW": return "up";
      case "ArrowDown": case "KeyS": return "down";
      case "ArrowLeft": case "KeyA": return "left";
      case "ArrowRight": case "KeyD": return "right";
      case "Space": return "hand";
      default: return null;
    }
  }

  window.addEventListener("keydown", function (e) {
    if (!driveWindowFocused()) return;
    ensureAudio();
    var k = mapKey(e.code);
    if (k) {
      keys[k] = true;
      e.preventDefault();
      return;
    }
    if (e.code === "Enter") {
      e.preventDefault();
      advance();
    } else if (e.code === "KeyR") {
      newRace();
    } else if (e.code === "KeyM") {
      setMuted(!save.muted);
    }
  });
  window.addEventListener("keyup", function (e) {
    var k = mapKey(e.code);
    if (k) keys[k] = false;
  });
  window.addEventListener("blur", function () {
    for (var k in keys) keys[k] = false;
  });

  document.querySelectorAll(".drive-btn").forEach(function (btn) {
    var k = btn.getAttribute("data-key");
    var press = function (e) { keys[k] = true; e.preventDefault(); };
    var release = function () { keys[k] = false; };
    btn.addEventListener("touchstart", press, { passive: false });
    btn.addEventListener("touchend", release);
    btn.addEventListener("touchcancel", release);
    btn.addEventListener("mousedown", press);
    btn.addEventListener("mouseup", release);
    btn.addEventListener("mouseleave", release);
  });

  canvas.addEventListener("click", advance);
  resetBtn.addEventListener("click", function () { newRace(); });
  trackSel.addEventListener("change", function () {
    loadTrack(parseInt(trackSel.value, 10));
    newRace();
  });
  modeSel.addEventListener("change", function () {
    mode = modeSel.value;
    newRace();
  });
  [trackSel, modeSel].forEach(function (sel) {
    sel.addEventListener("change", function () { canvas.focus(); });
  });

  function advance() {
    ensureAudio();
    if (phase === "menu") {
      phase = "countdown";
      countdown = 3.2;
    } else if (phase === "finished") {
      newRace();
      phase = "countdown";
      countdown = 3.2;
    }
  }

  /* ---------------- Saved data (mute + records) ---------------- */

  var SAVE_KEY = "sunsetCircuit.v1";
  var save = { muted: false, best: {} };
  try {
    var raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        save.muted = !!parsed.muted;
        if (parsed.best && typeof parsed.best === "object") save.best = parsed.best;
      }
    }
  } catch (e) { /* storage unavailable: the game still works, just without memory */ }
  function persist() {
    try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  }

  /* ---------------- Sound (Web Audio, all synthesised) ---------------- */

  var audio = null;

  function ensureAudio() {
    if (audio) {
      if (audio.ctx.state === "suspended") audio.ctx.resume();
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ac = new AC();
    var a = audio = { ctx: ac };
    a.master = ac.createGain();
    a.master.gain.value = save.muted ? 0 : 0.5;
    a.master.connect(ac.destination);

    a.o1 = ac.createOscillator(); a.o1.type = "sawtooth";
    a.o2 = ac.createOscillator(); a.o2.type = "square";
    a.lp = ac.createBiquadFilter(); a.lp.type = "lowpass"; a.lp.frequency.value = 400;
    a.eg = ac.createGain(); a.eg.gain.value = 0;
    var mix2 = ac.createGain(); mix2.gain.value = 0.5;
    a.o1.connect(a.lp); a.o2.connect(mix2); mix2.connect(a.lp);
    a.lp.connect(a.eg); a.eg.connect(a.master);
    a.o1.start(); a.o2.start();

    var buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    a.noise = buf;
    var ns = ac.createBufferSource(); ns.buffer = buf; ns.loop = true;
    a.bp = ac.createBiquadFilter(); a.bp.type = "bandpass"; a.bp.frequency.value = 1600; a.bp.Q.value = 1.2;
    a.sg = ac.createGain(); a.sg.gain.value = 0;
    ns.connect(a.bp); a.bp.connect(a.sg); a.sg.connect(a.master);
    ns.start();
  }

  function beep(freq, dur, type, vol, delay) {
    if (!audio || save.muted) return;
    var ac = audio.ctx, t0 = ac.currentTime + (delay || 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(audio.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function thump(intensity) {
    if (!audio || save.muted) return;
    var ac = audio.ctx, t0 = ac.currentTime;
    var src = ac.createBufferSource(); src.buffer = audio.noise;
    var lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500 + intensity * 900;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.1 + intensity * 0.35, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    src.connect(lp); lp.connect(g); g.connect(audio.master);
    src.start(t0, Math.random() * 0.5, 0.25);
  }

  var sfx = {
    tick: function () { beep(440, 0.14, "square", 0.18); },
    go: function () { beep(880, 0.45, "square", 0.22); },
    lap: function () { beep(660, 0.12, "triangle", 0.25); beep(990, 0.18, "triangle", 0.25, 0.1); },
    record: function () { [660, 880, 1100, 1320].forEach(function (f, i) { beep(f, 0.16, "triangle", 0.25, i * 0.09); }); },
    finish: function () { [523, 659, 784, 1047].forEach(function (f, i) { beep(f, 0.22, "square", 0.18, i * 0.12); }); },
    bump: thump
  };

  function audioFrame(active) {
    if (!audio) return;
    var a = audio, t = a.ctx.currentTime;
    var sp = clamp(Math.abs(player.speed) / MAX_SPEED, 0, 1);
    var gas = keys.up && (phase === "racing" || phase === "countdown");
    var freq = 52 + sp * 175 + (gas ? 14 : 0);
    a.o1.frequency.setTargetAtTime(freq, t, 0.05);
    a.o2.frequency.setTargetAtTime(freq * 0.5, t, 0.05);
    a.lp.frequency.setTargetAtTime(320 + sp * 900 + (gas ? 260 : 0), t, 0.06);
    a.eg.gain.setTargetAtTime(active ? 0.05 + sp * 0.05 + (gas ? 0.035 : 0) : 0, t, 0.08);

    var slide = clamp((Math.abs(player.slip) - 0.9) / 1.8, 0, 1);
    if (keys.hand && phase === "racing" && player.speed > 1.5) slide = Math.max(slide, 0.45);
    if (!player.onRoad) slide = Math.max(slide, sp * 0.35);
    a.sg.gain.setTargetAtTime(active ? slide * 0.16 : 0, t, 0.04);
    a.bp.frequency.setTargetAtTime(player.onRoad ? 1500 + sp * 700 : 700, t, 0.1);
  }

  function setMuted(m) {
    save.muted = m;
    muteBtn.textContent = m ? "\u{1F507}" : "\u{1F50A}";
    muteBtn.setAttribute("aria-pressed", m ? "true" : "false");
    muteBtn.title = (m ? "Unmute" : "Mute") + " (M)";
    if (audio) audio.master.gain.setTargetAtTime(m ? 0 : 0.5, audio.ctx.currentTime, 0.03);
    persist();
  }
  muteBtn.addEventListener("click", function () { ensureAudio(); setMuted(!save.muted); });
  setMuted(save.muted);

  /* ---------------- Simulation ---------------- */

  function trackSearch(car) {
    var c = track.center, N = track.N, best = Infinity, bi = car.idx;
    for (var d = -36; d <= 36; d++) {
      var i = (car.idx + d + N) % N;
      var dx = c[i].x - car.x, dy = c[i].y - car.y;
      var dd = dx * dx + dy * dy;
      if (dd < best) { best = dd; bi = i; }
    }
    var delta = bi - car.idx;
    if (delta > N / 2) delta -= N;
    if (delta < -N / 2) delta += N;
    if (Math.abs(delta) < 40) car.prog += delta;
    car.idx = bi;
    car.off = Math.sqrt(best);
    car.onRoad = car.off < TRACK_W / 2 + 6;
    if (!car.onRoad && phase === "racing") car.offTicks++;
  }

  function stepCar(car, ctl) {
    // steering changes heading; the velocity vector keeps its own course
    car.steer += (ctl.steer - car.steer) * 0.22;
    var fwdNow = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);
    var speedFac = clamp(Math.abs(fwdNow) / 2.2, 0, 1);
    var turn = car.steer * TURN * speedFac * (1 - 0.35 * clamp(Math.abs(fwdNow) / MAX_SPEED, 0, 1));
    if (ctl.hand) turn *= 1.35;
    car.angle += turn * (fwdNow >= 0 ? 1 : -1);

    var fx = Math.cos(car.angle), fy = Math.sin(car.angle);
    var rx = -fy, ry = fx;
    var vf = car.vx * fx + car.vy * fy;
    var vl = car.vx * rx + car.vy * ry;

    var maxV = MAX_SPEED * (car.topSpeed || 1) * (car.onRoad ? 1 : 0.45);
    car.braking = false;
    if (ctl.throttle) {
      vf += ACCEL * (1 - clamp(vf / maxV, 0, 1) * 0.6);
    }
    if (ctl.brake) {
      if (vf > 0.3) { vf -= BRAKE; car.braking = true; }
      else vf -= ACCEL * 0.55;
    }
    if (!ctl.throttle && !ctl.brake) vf *= 0.992;
    if (vf > maxV) vf -= (vf - maxV) * 0.08;
    if (!car.onRoad) vf *= 0.985;
    vf = Math.max(vf, -MAX_SPEED * 0.4);

    var grip = ctl.hand ? 0.965 : (car.onRoad ? 0.86 : 0.9);
    vl *= grip;
    if (ctl.hand) { vf *= 0.988; car.braking = true; }

    car.vx = fx * vf + rx * vl;
    car.vy = fy * vf + ry * vl;
    car.x += car.vx;
    car.y += car.vy;
    car.speed = vf;
    car.slip = vl;

    var pad = 24;
    if (car.x < pad) { car.x = pad; car.vx = Math.abs(car.vx) * 0.3; }
    if (car.x > WORLD_W - pad) { car.x = WORLD_W - pad; car.vx = -Math.abs(car.vx) * 0.3; }
    if (car.y < pad) { car.y = pad; car.vy = Math.abs(car.vy) * 0.3; }
    if (car.y > WORLD_H - pad) { car.y = WORLD_H - pad; car.vy = -Math.abs(car.vy) * 0.3; }

    var wasLaps = car.lapsDone;
    trackSearch(car);
    var laps = Math.max(0, Math.floor(car.prog / track.N));
    if (laps > wasLaps) {
      car.lapsDone = laps;
      var lapTime = (tick - car.lapStart) * STEP;
      car.lapStart = tick;
      car.lapTimes.push(lapTime);
      if (laps >= TOTAL_LAPS && !car.finished) {
        car.finished = true;
        car.finishTime = tick * STEP;
        if (car.isPlayer) sfx.finish();
      } else if (car.isPlayer) {
        sfx.lap();
      }
    }
  }

  function score(car) {
    return car.finished ? 1e7 - car.finishTime : car.prog;
  }

  function rankOf(car) {
    var r = 1, sc = score(car);
    cars.forEach(function (o) { if (o !== car && score(o) > sc) r++; });
    return r;
  }

  function aiControls(car) {
    var c = track.center, N = track.N;
    var look = Math.round(10 + Math.abs(car.speed) * 3.2);
    var t = c[(car.idx + look) % N];
    var tx = t.x + t.nx * car.lane, ty = t.y + t.ny * car.lane;
    var diff = wrapAngle(Math.atan2(ty - car.y, tx - car.x) - car.angle);
    var steer = clamp(diff * 2.2, -1, 1);

    var a0 = c[car.idx].ang;
    var sev = Math.max(
      Math.abs(wrapAngle(c[(car.idx + 22) % N].ang - a0)),
      Math.abs(wrapAngle(c[(car.idx + 40) % N].ang - a0)) * 0.7
    );
    // rubber band: nudge rivals up when they trail the player, down when well clear
    var gap = (player.prog - car.prog) / N;
    var skill = car.skill + clamp(gap * 0.5, -0.07, 0.06);
    if (car.finished) skill *= 0.55;
    var target = MAX_SPEED * skill * (1 - clamp(sev * 0.85, 0, 0.5));
    if (!car.onRoad) target *= 0.7;
    return {
      throttle: car.speed < target,
      brake: car.speed > target + 0.7,
      steer: steer,
      hand: false
    };
  }

  function collide(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    var R = 28;
    if (d >= R || d === 0) return;
    var nx = dx / d, ny = dy / d, overlap = (R - d) / 2;
    a.x -= nx * overlap; a.y -= ny * overlap;
    b.x += nx * overlap; b.y += ny * overlap;
    var rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv < 0) {
      var j = -(1 + 0.35) * rv / 2;
      a.vx -= j * nx; a.vy -= j * ny;
      b.vx += j * nx; b.vy += j * ny;
      var hit = Math.min(1, -rv / 3);
      a.bump = Math.max(a.bump || 0, hit);
      b.bump = Math.max(b.bump || 0, hit);
    }
  }

  var autopilot = false;

  function playerControls() {
    var racing = phase === "racing";
    if (autopilot && racing) return aiControls(player);
    return {
      throttle: racing && keys.up,
      brake: racing && keys.down,
      steer: (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
      hand: racing && keys.hand
    };
  }

  function update() {
    if (phase === "countdown") {
      var before = Math.ceil(countdown - 0.2);
      countdown -= STEP;
      var after = Math.ceil(countdown - 0.2);
      if (after !== before && after > 0) sfx.tick();
      if (before > 0 && after <= 0) sfx.go();
      if (countdown <= 0) {
        phase = "racing";
        tick = 0;
      }
    }
    if (phase === "racing" || phase === "finished" || phase === "countdown" || phase === "menu") {
      cars.forEach(function (car) {
        var ctl;
        if (car.isPlayer) {
          ctl = phase === "finished" ? { throttle: false, brake: true, steer: 0, hand: false } : playerControls();
        } else {
          ctl = phase === "racing" || phase === "finished" ? aiControls(car) : { throttle: false, brake: true, steer: 0, hand: false };
        }
        stepCar(car, ctl);
      });
      for (var i = 0; i < cars.length; i++) {
        for (var j = i + 1; j < cars.length; j++) collide(cars[i], cars[j]);
      }
      if (player.bump > 0.12) sfx.bump(player.bump);
      cars.forEach(function (c) { c.bump = 0; });
    }
    if (phase === "racing") {
      tick++;
      if (player.finished) phase = "finished";
    }
  }

  /* ---------------- Camera ---------------- */

  var cam = { x: 0, y: 0, zoom: 1 };

  function updateCamera() {
    var tx = player.x + player.vx * 14;
    var ty = player.y + player.vy * 14;
    cam.x = lerp(cam.x, tx, 0.1);
    cam.y = lerp(cam.y, ty, 0.1);
    var tz = 1 - 0.2 * clamp(Math.abs(player.speed) / MAX_SPEED, 0, 1);
    cam.zoom = lerp(cam.zoom, tz, 0.04);
  }

  /* ---------------- Rendering ---------------- */

  function drawCar(car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.scale(1.3, 1.3);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.fillRect(-11, -5, 24, 13);
    // wheels
    ctx.fillStyle = "#15151d";
    ctx.fillRect(-9, -8, 7, 3); ctx.fillRect(-9, 5, 7, 3);
    ctx.fillRect(5, -8, 7, 3); ctx.fillRect(5, 5, 7, 3);
    // body
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.moveTo(-12, -6); ctx.lineTo(8, -6); ctx.lineTo(13, -3);
    ctx.lineTo(13, 3); ctx.lineTo(8, 6); ctx.lineTo(-12, 6);
    ctx.closePath();
    ctx.fill();
    // stripe + cockpit
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fillRect(-12, -1, 22, 2);
    ctx.fillStyle = "#1c2a3f";
    ctx.fillRect(-3, -4, 8, 8);
    ctx.fillStyle = "#8fd9ff";
    ctx.fillRect(1, -3, 3, 6);
    // spoiler
    ctx.fillStyle = "#111";
    ctx.fillRect(-14, -6, 3, 12);
    // lights
    ctx.fillStyle = car.braking ? "#ff2a2a" : "#7a1818";
    ctx.fillRect(-12, -5, 2, 3); ctx.fillRect(-12, 2, 2, 3);
    ctx.fillStyle = "#fff6c4";
    ctx.fillRect(12, -4, 2, 2); ctx.fillRect(12, 2, 2, 2);
    ctx.restore();
  }

  function drawWorld() {
    var vw = W / cam.zoom, vh = H / cam.zoom;
    var cx = clamp(cam.x, vw / 2, WORLD_W - vw / 2);
    var cy = clamp(cam.y, vh / 2, WORLD_H - vh / 2);
    var sx = Math.floor(cx - vw / 2), sy = Math.floor(cy - vh / 2);
    var sw = Math.ceil(vw) + 1, sh = Math.ceil(vh) + 1;

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cx, -cy);

    ctx.drawImage(track.ground, sx, sy, sw, sh, sx, sy, sw, sh);
    cars.slice().sort(function (a, b) { return a.y - b.y; }).forEach(drawCar);
    ctx.drawImage(track.top, sx, sy, sw, sh, sx, sy, sw, sh);
    ctx.restore();
  }

  function text(str, x, y, size, color, align) {
    ctx.font = "bold " + size + "px Verdana, Tahoma, sans-serif";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillText(str, x + 1.5, y + 1.5);
    ctx.fillStyle = color || "#fff";
    ctx.fillText(str, x, y);
  }

  function drawHud() {
    if (phase === "menu") return;
    var lap = Math.min(TOTAL_LAPS, player.lapsDone + 1);
    text("LAP " + lap + "/" + TOTAL_LAPS, 10, 16, 14);
    text(fmtTime(phase === "racing" || phase === "finished" ? player.finished ? player.finishTime : tick * STEP : 0), 10, 36, 14, "#ffe066");
    if (cars.length > 1) text("POS " + rankOf(player) + "/" + cars.length, W - 10, 16, 14, "#fff", "right");
    text(Math.round(Math.abs(player.speed) * 38) + " km/h", 10, H - 14, 14);
  }

  function drawOverlay() {
    if (phase === "menu") {
      ctx.fillStyle = "rgba(20,10,50,.62)";
      ctx.fillRect(0, 0, W, H);
      text("SUNSET CIRCUIT", W / 2, H / 2 - 40, 28, "#ffe066", "center");
      text(track.name + " · " + TOTAL_LAPS + " laps", W / 2, H / 2 - 8, 14, "#fff", "center");
      text("Press ENTER or click to start", W / 2, H / 2 + 26, 13, "#cfe", "center");
    } else if (phase === "countdown") {
      var n = Math.ceil(countdown - 0.2);
      text(n > 0 ? String(n) : "GO!", W / 2, H / 2 - 30, 64, n > 0 ? "#fff" : "#7cff7c", "center");
    } else if (phase === "finished") {
      ctx.fillStyle = "rgba(20,10,50,.7)";
      ctx.fillRect(0, 0, W, H);
      text(cars.length > 1 ? "RESULTS" : "FINISH!", W / 2, 54, 28, "#ffe066", "center");
      var order = cars.slice().sort(function (a, b) { return score(b) - score(a); });
      order.forEach(function (car, i) {
        var y = 100 + i * 26;
        var col = car.isPlayer ? "#ffe066" : "#fff";
        text((i + 1) + ".", W / 2 - 110, y, 15, col, "left");
        text(car.name, W / 2 - 84, y, 15, col, "left");
        text(car.finished ? fmtTime(car.finishTime) : "racing\u2026", W / 2 + 110, y, 15, col, "right");
      });
      if (cars.length === 1) text("Time " + fmtTime(player.finishTime), W / 2, H / 2, 16, "#fff", "center");
      text("Press ENTER or click to race again", W / 2, H - 50, 13, "#cfe", "center");
    }
    if (phase !== "menu" && !driveWindowFocused()) {
      ctx.fillStyle = "rgba(0,0,0,.45)";
      ctx.fillRect(0, 0, W, H);
      text("PAUSED – click to resume", W / 2, H / 2, 16, "#fff", "center");
    }
  }

  function render() {
    updateCamera();
    drawWorld();
    drawHud();
    drawOverlay();
  }

  /* ---------------- Main loop ---------------- */

  var last = 0, acc = 0;

  function frame(ts) {
    requestAnimationFrame(frame);
    if (!driveWindowOpen()) { last = 0; audioFrame(false); return; }
    if (!last) last = ts;
    acc += Math.min(0.1, (ts - last) / 1000);
    last = ts;
    var running = driveWindowFocused() || phase === "menu";
    while (acc >= STEP) {
      if (running) update();
      acc -= STEP;
    }
    render();
    audioFrame(running && phase !== "menu");
  }

  TRACK_DEFS.forEach(function (def, i) {
    var o = document.createElement("option");
    o.value = String(i);
    o.textContent = def.name;
    trackSel.appendChild(o);
  });
  loadTrack(0);
  newRace();
  requestAnimationFrame(frame);

  // Test hook: lets automated checks advance the fixed-step simulation.
  window.sunsetCircuit = {
    step: function (n) { for (var i = 0; i < n; i++) update(); render(); },
    state: function () {
      return {
        phase: phase, tick: tick, laps: player.lapsDone, speed: player.speed, onRoad: player.onRoad, prog: player.prog,
        cars: cars.map(function (c) { return { name: c.name, laps: c.lapsDone, prog: c.prog, finished: c.finished, finishTime: c.finishTime, lapTimes: c.lapTimes, offRoadTicks: c.offTicks }; })
      };
    },
    start: advance,
    autopilot: function (on) { autopilot = on; },
    setMode: function (m) { mode = m; newRace(); },
    keys: keys,
    trackImage: function (i) { loadTrack(i); return tracks[i].ground.toDataURL(); }
  };
})();
