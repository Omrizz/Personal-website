/* ===================================================================
   Classic Minesweeper -- beginner mode (9x9, 10 mines), rebuilt
   from scratch for this desktop.
   =================================================================== */

(function () {
  "use strict";

  var COLS = 9, ROWS = 9, MINES = 10;
  var grid = document.getElementById("ms-grid");
  var mineCountEl = document.getElementById("ms-mine-count");
  var timerEl = document.getElementById("ms-timer");
  var faceBtn = document.getElementById("ms-face");

  if (!grid) return;

  var cells = [];       // flat array of cell state objects
  var cellEls = [];     // flat array of DOM buttons
  var started = false;
  var over = false;
  var flagCount = 0;
  var revealedCount = 0;
  var timerId = null;
  var seconds = 0;

  function idx(r, c) { return r * COLS + c; }

  function neighbors(r, c) {
    var out = [];
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        var nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) out.push([nr, nc]);
      }
    }
    return out;
  }

  function buildGrid() {
    grid.innerHTML = "";
    grid.style.gridTemplateColumns = "repeat(" + COLS + ", 22px)";
    cells = [];
    cellEls = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        cells.push({ mine: false, revealed: false, flagged: false, count: 0 });
        var btn = document.createElement("button");
        btn.className = "ms-cell";
        btn.type = "button";
        btn.dataset.r = r;
        btn.dataset.c = c;
        grid.appendChild(btn);
        cellEls.push(btn);
      }
    }
  }

  function placeMines(avoidR, avoidC) {
    var avoid = {};
    neighbors(avoidR, avoidC).forEach(function (p) { avoid[idx(p[0], p[1])] = true; });
    avoid[idx(avoidR, avoidC)] = true;

    var placed = 0;
    while (placed < MINES) {
      var i = Math.floor(Math.random() * cells.length);
      if (cells[i].mine || avoid[i]) continue;
      cells[i].mine = true;
      placed++;
    }
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (cells[idx(r, c)].mine) continue;
        var n = 0;
        neighbors(r, c).forEach(function (p) { if (cells[idx(p[0], p[1])].mine) n++; });
        cells[idx(r, c)].count = n;
      }
    }
  }

  function startTimer() {
    if (timerId) return;
    timerId = setInterval(function () {
      seconds = Math.min(999, seconds + 1);
      timerEl.textContent = pad(seconds);
    }, 1000);
  }
  function stopTimer() { clearInterval(timerId); timerId = null; }

  function pad(n) {
    n = Math.max(0, Math.min(999, n));
    return String(n).padStart(3, "0");
  }

  function updateMineCounter() { mineCountEl.textContent = pad(MINES - flagCount); }

  function reveal(r, c) {
    var i = idx(r, c);
    var cell = cells[i];
    if (cell.revealed || cell.flagged) return;
    cell.revealed = true;
    revealedCount++;
    var el = cellEls[i];
    el.classList.add("revealed");

    if (cell.mine) {
      el.classList.add("mine-hit");
      el.textContent = "\u{1F4A3}";
      loseGame(i);
      return;
    }

    if (cell.count > 0) {
      el.textContent = cell.count;
      el.dataset.n = cell.count;
    } else {
      neighbors(r, c).forEach(function (p) { reveal(p[0], p[1]); });
    }
    checkWin();
  }

  function revealAllMines(hitIndex) {
    cells.forEach(function (cell, i) {
      if (cell.mine && !cell.flagged) {
        var el = cellEls[i];
        el.classList.add("revealed", "mine");
        if (i !== hitIndex) el.textContent = "\u{1F4A3}";
      }
      if (!cell.mine && cell.flagged) {
        cellEls[i].textContent = "❌";
      }
    });
  }

  function loseGame(hitIndex) {
    over = true;
    stopTimer();
    revealAllMines(hitIndex);
    faceBtn.textContent = "\u{1F635}";
  }

  function saveBestTime(secs) {
    try {
      var prev = parseInt(window.localStorage.getItem("omrios.minesweeper.best"), 10);
      if (!prev || secs < prev) window.localStorage.setItem("omrios.minesweeper.best", String(secs));
    } catch (e) { /* storage unavailable */ }
  }

  function checkWin() {
    if (over) return;
    if (revealedCount === ROWS * COLS - MINES) {
      over = true;
      stopTimer();
      faceBtn.textContent = "\u{1F60E}";
      saveBestTime(seconds);
      cells.forEach(function (cell, i) {
        if (cell.mine && !cell.flagged) {
          cell.flagged = true;
          cellEls[i].textContent = "\u{1F6A9}";
        }
      });
      flagCount = MINES;
      updateMineCounter();
    }
  }

  function toggleFlag(r, c) {
    if (over) return;
    var i = idx(r, c);
    var cell = cells[i];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    flagCount += cell.flagged ? 1 : -1;
    cellEls[i].textContent = cell.flagged ? "\u{1F6A9}" : "";
    updateMineCounter();
  }

  function handleReveal(r, c) {
    if (over) return;
    if (!started) {
      started = true;
      placeMines(r, c);
      startTimer();
    }
    reveal(r, c);
  }

  function newGame() {
    stopTimer();
    started = false;
    over = false;
    flagCount = 0;
    revealedCount = 0;
    seconds = 0;
    timerEl.textContent = "000";
    faceBtn.textContent = "\u{1F642}";
    buildGrid();
    updateMineCounter();
    wireCellEvents();
  }

  function wireCellEvents() {
    grid.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    cellEls.forEach(function (el) {
      var r = Number(el.dataset.r), c = Number(el.dataset.c);
      var pressTimer = null;
      var longPressed = false;

      el.addEventListener("click", function () { handleReveal(r, c); });
      el.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        toggleFlag(r, c);
      });

      el.addEventListener("touchstart", function () {
        longPressed = false;
        pressTimer = setTimeout(function () {
          longPressed = true;
          toggleFlag(r, c);
        }, 420);
      }, { passive: true });
      el.addEventListener("touchend", function (e) {
        clearTimeout(pressTimer);
        if (longPressed) e.preventDefault();
      });
    });
  }

  faceBtn.addEventListener("click", newGame);

  newGame();
})();
