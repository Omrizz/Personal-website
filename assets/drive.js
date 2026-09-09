/* ===================================================================
   Sunset Drive -- an original top-down arcade driving mini-game.

   A small procedurally generated city block, an arcade car (accel,
   brake, steer, friction, wall bumps), wandering pedestrians that
   scatter when you get close, two looping traffic cars, and star
   collectibles. Everything here -- name, art, mechanics -- is built
   from scratch; no borrowed assets, logos, or branding.
   =================================================================== */

(function () {
  "use strict";

  var canvas = document.getElementById("drive-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var W = canvas.width, H = canvas.height;

  var starsEl = document.getElementById("drive-stars");
  var starTotalEl = document.getElementById("drive-star-total");
  var lapsEl = document.getElementById("drive-laps");
  var resetBtn = document.getElementById("drive-reset");
  var winDrive = document.getElementById("win-drive");

  var GRID = 8;
  var BLOCK = 200;
  var ROAD = 50;
  var WORLD = GRID * BLOCK;
  var STAR_COUNT = 8;
  var PED_COUNT = 6;
  var COLLECT_RADIUS = 26;

  var MAX_SPEED = 5;
  var ACCEL = 0.15;
  var FRICTION = 0.965;
  var TURN_RATE = 0.045;

  var BUILDING_COLORS = ["#ff6ec7", "#7b5cff", "#41e8d1", "#ff9d5c", "#5c7bff"];

  var grid, stars, pedestrians, traffic, car, laps, collected, time;

  function rand(min, max) { return min + Math.random() * (max - min); }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
  function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function buildGrid() {
    var g = [];
    for (var y = 0; y < GRID; y++) {
      var row = [];
      for (var x = 0; x < GRID; x++) {
        var isPark = Math.random() < 0.15;
        row.push({
          type: isPark ? "park" : "building",
          color: isPark ? "#2f8f5b" : BUILDING_COLORS[randInt(0, BUILDING_COLORS.length - 1)]
        });
      }
      g.push(row);
    }
    return g;
  }

  function isSolid(x, y) {
    var cx = Math.floor(x / BLOCK), cy = Math.floor(y / BLOCK);
    if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return true;
    var cell = grid[cy][cx];
    if (cell.type !== "building") return false;
    var bx0 = cx * BLOCK + ROAD / 2, bx1 = (cx + 1) * BLOCK - ROAD / 2;
    var by0 = cy * BLOCK + ROAD / 2, by1 = (cy + 1) * BLOCK - ROAD / 2;
    return x > bx0 && x < bx1 && y > by0 && y < by1;
  }

  function randomIntersection() {
    return { x: randInt(0, GRID) * BLOCK, y: randInt(0, GRID) * BLOCK };
  }

  function scatterStars(count) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var p = randomIntersection();
      out.push({ x: p.x, y: p.y, active: true });
    }
    return out;
  }

  function spawnPedestrians() {
    var out = [];
    for (var i = 0; i < PED_COUNT; i++) {
      out.push({
        x: rand(0, WORLD), y: rand(0, WORLD),
        vx: 0, vy: 0, mode: "wander", modeTimer: rand(1, 3)
      });
    }
    return out;
  }

  function spawnTraffic() {
    return [
      { x: 0, y: 3 * BLOCK, axis: "x", dir: 1, speed: 1.6, color: "#3fd0ff" },
      { x: 6 * BLOCK, y: 0, axis: "y", dir: 1, speed: 1.3, color: "#ffb63f" }
    ];
  }

  function newGame() {
    grid = buildGrid();
    var startCell = Math.floor(GRID / 2);
    car = { x: startCell * BLOCK, y: startCell * BLOCK, angle: 0, speed: 0 };
    stars = scatterStars(STAR_COUNT);
    pedestrians = spawnPedestrians();
    traffic = spawnTraffic();
    laps = 0;
    collected = 0;
    time = 0;
    starsEl.textContent = "0";
    starTotalEl.textContent = String(STAR_COUNT);
    lapsEl.textContent = "0";
  }

  /* ---------------- Input ---------------- */

  var keys = { up: false, down: false, left: false, right: false };

  function driveWindowActive() {
    return winDrive.classList.contains("open") && !winDrive.classList.contains("minimized");
  }

  function mapKey(code) {
    switch (code) {
      case "ArrowUp": case "KeyW": return "up";
      case "ArrowDown": case "KeyS": return "down";
      case "ArrowLeft": case "KeyA": return "left";
      case "ArrowRight": case "KeyD": return "right";
      default: return null;
    }
  }

  window.addEventListener("keydown", function (e) {
    if (!driveWindowActive()) return;
    var k = mapKey(e.code);
    if (!k) return;
    keys[k] = true;
    e.preventDefault();
  });
  window.addEventListener("keyup", function (e) {
    var k = mapKey(e.code);
    if (!k) return;
    keys[k] = false;
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

  resetBtn.addEventListener("click", newGame);

  /* ---------------- Simulation ---------------- */

  function updateCar() {
    if (keys.up) car.speed += ACCEL;
    if (keys.down) car.speed -= ACCEL;
    car.speed *= FRICTION;
    car.speed = clamp(car.speed, -MAX_SPEED * 0.5, MAX_SPEED);

    if (Math.abs(car.speed) > 0.2) {
      var turnFactor = clamp(Math.abs(car.speed) / MAX_SPEED, 0.3, 1);
      if (keys.left) car.angle -= TURN_RATE * turnFactor;
      if (keys.right) car.angle += TURN_RATE * turnFactor;
    }

    var nx = car.x + Math.cos(car.angle) * car.speed;
    var ny = car.y + Math.sin(car.angle) * car.speed;
    var hitX = isSolid(nx, car.y);
    var hitY = isSolid(car.x, ny);
    if (!hitX) car.x = nx;
    if (!hitY) car.y = ny;
    if (hitX || hitY) car.speed *= 0.5;

    car.x = clamp(car.x, 0, WORLD);
    car.y = clamp(car.y, 0, WORLD);
  }

  function updatePedestrians(dt) {
    pedestrians.forEach(function (p) {
      var d = dist(p.x, p.y, car.x, car.y);
      if (d < 70 && p.mode !== "flee") {
        p.mode = "flee";
        p.modeTimer = 1;
        var ang = Math.atan2(p.y - car.y, p.x - car.x);
        p.vx = Math.cos(ang) * 2.4;
        p.vy = Math.sin(ang) * 2.4;
      }
      p.modeTimer -= dt;
      if (p.modeTimer <= 0) {
        if (p.mode === "flee") {
          p.mode = "wander";
          p.modeTimer = rand(1, 3);
          p.vx = 0; p.vy = 0;
        } else {
          p.modeTimer = rand(1, 3);
          var a = rand(0, Math.PI * 2);
          p.vx = Math.cos(a) * 0.4;
          p.vy = Math.sin(a) * 0.4;
        }
      }
      p.x = clamp(p.x + p.vx, 0, WORLD);
      p.y = clamp(p.y + p.vy, 0, WORLD);
    });
  }

  function updateTraffic() {
    traffic.forEach(function (t) {
      if (t.axis === "x") {
        t.x += t.speed * t.dir;
        if (t.x < 0 || t.x > WORLD) t.dir *= -1;
      } else {
        t.y += t.speed * t.dir;
        if (t.y < 0 || t.y > WORLD) t.dir *= -1;
      }
      var d = dist(car.x, car.y, t.x, t.y);
      if (d < 22) {
        var ang = Math.atan2(car.y - t.y, car.x - t.x);
        car.x = clamp(car.x + Math.cos(ang) * 6, 0, WORLD);
        car.y = clamp(car.y + Math.sin(ang) * 6, 0, WORLD);
        car.speed *= 0.4;
      }
    });
  }

  function updateStars() {
    var allGone = true;
    stars.forEach(function (s) {
      if (!s.active) return;
      allGone = false;
      if (dist(s.x, s.y, car.x, car.y) < COLLECT_RADIUS) {
        s.active = false;
        collected++;
        starsEl.textContent = String(collected);
      }
    });
    if (allGone) {
      laps++;
      lapsEl.textContent = String(laps);
      collected = 0;
      starsEl.textContent = "0";
      var count = Math.min(STAR_COUNT + laps, 16);
      starTotalEl.textContent = String(count);
      stars = scatterStars(count);
    }
  }

  /* ---------------- Rendering ---------------- */

  function drawCarShape(x, y, angle, bodyColor, glassColor) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fillRect(-10, -6, 22, 13);
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-11, -7, 22, 13);
    ctx.fillStyle = glassColor || "#dff3ff";
    ctx.fillRect(2, -5, 6, 9);
    ctx.restore();
  }

  function drawStar(x, y, r) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var rad = i % 2 === 0 ? r : r * 0.45;
      var a = (Math.PI / 5) * i - Math.PI / 2;
      var px = x + Math.cos(a) * rad;
      var py = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "#ffe066";
    ctx.fill();
    ctx.strokeStyle = "#b8860b";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function render() {
    var camX = clamp(car.x - W / 2, 0, Math.max(0, WORLD - W));
    var camY = clamp(car.y - H / 2, 0, Math.max(0, WORLD - H));

    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#2a1750");
    bg.addColorStop(1, "#ff7a45");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    var cx0 = Math.max(0, Math.floor(camX / BLOCK) - 1);
    var cx1 = Math.min(GRID - 1, Math.ceil((camX + W) / BLOCK));
    var cy0 = Math.max(0, Math.floor(camY / BLOCK) - 1);
    var cy1 = Math.min(GRID - 1, Math.ceil((camY + H) / BLOCK));

    for (var gy = cy0; gy <= cy1; gy++) {
      for (var gx = cx0; gx <= cx1; gx++) {
        var cell = grid[gy][gx];
        var bx0 = gx * BLOCK + ROAD / 2, by0 = gy * BLOCK + ROAD / 2;
        var size = BLOCK - ROAD;
        var sx = bx0 - camX, sy = by0 - camY;
        ctx.fillStyle = cell.color;
        ctx.fillRect(sx, sy, size, size);
        if (cell.type === "building") {
          ctx.fillStyle = "rgba(255,255,255,.18)";
          ctx.fillRect(sx + 6, sy + 6, size - 12, size * 0.35);
        }
      }
    }

    stars.forEach(function (s) {
      if (!s.active) return;
      var pulse = 5 + Math.sin(time * 4 + s.x) * 1;
      drawStar(s.x - camX, s.y - camY, pulse);
    });

    pedestrians.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(p.x - camX, p.y - camY, 4, 0, Math.PI * 2);
      ctx.fillStyle = p.mode === "flee" ? "#ffd1d1" : "#ffe6c8";
      ctx.fill();
    });

    traffic.forEach(function (t) {
      var ang = t.axis === "x" ? (t.dir > 0 ? 0 : Math.PI) : (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      drawCarShape(t.x - camX, t.y - camY, ang, t.color, "#0b1a0b");
    });

    drawCarShape(car.x - camX, car.y - camY, car.angle, "#ff5d8f", "#8fd9ff");
  }

  function loop() {
    time += 1 / 60;
    if (driveWindowActive()) {
      updateCar();
      updatePedestrians(1 / 60);
      updateTraffic();
      updateStars();
      render();
    }
    requestAnimationFrame(loop);
  }

  newGame();
  requestAnimationFrame(loop);
})();
