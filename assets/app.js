/* ===================================================================
   Window manager for the retro desktop: dragging, focus/z-order,
   minimize/maximize/close, taskbar sync, start menu, clock, shutdown.
   =================================================================== */

(function () {
  "use strict";

  var desktop = document.getElementById("desktop");
  var taskbarWindows = document.getElementById("taskbar-windows");
  var startButton = document.getElementById("start-button");
  var startMenu = document.getElementById("start-menu");

  var windows = Array.prototype.slice.call(document.querySelectorAll(".window"));
  var zTop = 10;
  var taskbarButtons = {}; // id -> button element
  var restoreRects = {}; // id -> {top,left,width,height} before maximize

  function byId(id) { return document.getElementById(id); }

  function bringToFront(win) {
    zTop += 1;
    win.style.zIndex = zTop;
    windows.forEach(function (w) { w.classList.remove("active-window"); });
    win.classList.add("active-window");
    setActiveTaskbarButton(win.id);
  }

  function ensureTaskbarButton(win) {
    if (taskbarButtons[win.id]) return taskbarButtons[win.id];
    var iconId = win.getAttribute("data-icon") || "icon-computer";
    var label = win.querySelector(".title-bar-text").textContent;
    var btn = document.createElement("button");
    btn.className = "taskbar-item";
    btn.innerHTML = '<svg><use href="#' + iconId + '"/></svg><span></span>';
    btn.querySelector("span").textContent = label;
    btn.addEventListener("click", function () {
      if (win.classList.contains("minimized") || win.classList.contains("active-window") === false) {
        openWindow(win.id);
      } else {
        minimizeWindow(win.id);
      }
    });
    taskbarWindows.appendChild(btn);
    taskbarButtons[win.id] = btn;
    return btn;
  }

  function setActiveTaskbarButton(activeId) {
    Object.keys(taskbarButtons).forEach(function (id) {
      taskbarButtons[id].classList.toggle("active", id === activeId);
    });
  }

  function clampIntoView(win) {
    if (win.classList.contains("maximized")) return;
    var rect = win.getBoundingClientRect();
    var maxLeft = Math.max(0, desktop.clientWidth - Math.min(rect.width, desktop.clientWidth));
    var maxTop = Math.max(0, desktop.clientHeight - 40);
    var left = Math.min(Math.max(rect.left, 0), maxLeft);
    var top = Math.min(Math.max(rect.top, 0), maxTop);
    win.style.left = left + "px";
    win.style.top = top + "px";
  }

  function openWindow(id) {
    var win = byId(id);
    if (!win) return;
    win.classList.add("open");
    win.classList.remove("minimized");
    ensureTaskbarButton(win);
    bringToFront(win);
    clampIntoView(win);
    closeStartMenu();
  }
  window.openWindow = openWindow;

  window.addEventListener("resize", function () {
    windows.forEach(function (win) {
      if (win.classList.contains("open") && !win.classList.contains("minimized")) {
        clampIntoView(win);
      }
    });
  });

  function closeWindow(id) {
    var win = byId(id);
    if (!win) return;
    win.classList.remove("open");
    win.classList.remove("active-window");
    if (taskbarButtons[id]) {
      taskbarButtons[id].remove();
      delete taskbarButtons[id];
    }
  }

  function minimizeWindow(id) {
    var win = byId(id);
    if (!win) return;
    win.classList.add("minimized");
    win.classList.remove("active-window");
    if (taskbarButtons[id]) taskbarButtons[id].classList.remove("active");
  }

  function toggleMaximize(win) {
    if (win.classList.contains("maximized")) {
      win.classList.remove("maximized");
      var r = restoreRects[win.id];
      if (r) {
        win.style.top = r.top;
        win.style.left = r.left;
        win.style.width = r.width;
      }
    } else {
      restoreRects[win.id] = {
        top: win.style.top,
        left: win.style.left,
        width: win.style.width
      };
      win.classList.add("maximized");
    }
  }

  /* ---------------- Window chrome wiring ---------------- */

  windows.forEach(function (win) {
    var titleBar = win.querySelector(".title-bar");

    win.addEventListener("mousedown", function () { bringToFront(win); });
    win.addEventListener("touchstart", function () { bringToFront(win); }, { passive: true });

    var minBtn = win.querySelector(".tb-min");
    var maxBtn = win.querySelector(".tb-max");
    var closeBtn = win.querySelector(".tb-close");
    if (minBtn) minBtn.addEventListener("click", function (e) { e.stopPropagation(); minimizeWindow(win.id); });
    if (maxBtn) maxBtn.addEventListener("click", function (e) { e.stopPropagation(); toggleMaximize(win); });
    if (closeBtn) closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      closeWindow(win.id);
      if (win.id === "win-winamp" && window.winamp) window.winamp.stop();
    });
    if (titleBar) titleBar.addEventListener("dblclick", function () { toggleMaximize(win); });

    makeDraggable(win, titleBar);
  });

  function makeDraggable(win, handle) {
    if (!handle) return;
    var dragging = false;
    var startX, startY, startLeft, startTop;

    function pointerDown(clientX, clientY) {
      if (win.classList.contains("maximized")) return;
      dragging = true;
      var rect = win.getBoundingClientRect();
      startX = clientX;
      startY = clientY;
      startLeft = rect.left;
      startTop = rect.top;
      bringToFront(win);
    }

    function pointerMove(clientX, clientY) {
      if (!dragging) return;
      var dx = clientX - startX;
      var dy = clientY - startY;
      var maxLeft = desktop.clientWidth - 60;
      var maxTop = desktop.clientHeight - 40;
      var newLeft = Math.min(Math.max(startLeft + dx, -win.offsetWidth + 80), maxLeft);
      var newTop = Math.min(Math.max(startTop + dy, 0), maxTop);
      win.style.left = newLeft + "px";
      win.style.top = newTop + "px";
    }

    function pointerUp() { dragging = false; }

    handle.addEventListener("mousedown", function (e) {
      if (e.target.closest(".tb-btn")) return;
      pointerDown(e.clientX, e.clientY);
      e.preventDefault();
    });
    window.addEventListener("mousemove", function (e) { pointerMove(e.clientX, e.clientY); });
    window.addEventListener("mouseup", pointerUp);

    handle.addEventListener("touchstart", function (e) {
      if (e.target.closest(".tb-btn")) return;
      var t = e.touches[0];
      pointerDown(t.clientX, t.clientY);
    }, { passive: true });
    window.addEventListener("touchmove", function (e) {
      if (!dragging) return;
      var t = e.touches[0];
      pointerMove(t.clientX, t.clientY);
    }, { passive: true });
    window.addEventListener("touchend", pointerUp);
  }

  /* ---------------- Desktop icons ---------------- */

  document.querySelectorAll(".desktop-icon").forEach(function (icon) {
    icon.addEventListener("click", function () {
      var winId = icon.getAttribute("data-window");
      var link = icon.getAttribute("data-link");
      if (winId) openWindow(winId);
      else if (link) window.open(link, link.indexOf("mailto:") === 0 ? "_self" : "_blank");
    });
  });

  document.querySelectorAll(".start-item[data-window], .start-item[data-link]").forEach(function (item) {
    item.addEventListener("click", function () {
      var winId = item.getAttribute("data-window");
      var link = item.getAttribute("data-link");
      if (winId) openWindow(winId);
      else if (link) window.open(link, link.indexOf("mailto:") === 0 ? "_self" : "_blank");
      closeStartMenu();
    });
  });

  /* ---------------- Start menu ---------------- */

  function openStartMenu() {
    startMenu.hidden = false;
    startButton.classList.add("active");
  }
  function closeStartMenu() {
    startMenu.hidden = true;
    startButton.classList.remove("active");
  }
  startButton.addEventListener("click", function (e) {
    e.stopPropagation();
    if (startMenu.hidden) openStartMenu(); else closeStartMenu();
  });
  document.addEventListener("click", function (e) {
    if (!startMenu.hidden && !startMenu.contains(e.target) && e.target !== startButton) {
      closeStartMenu();
    }
  });

  /* ---------------- Quicklaunch: Winamp toggle ---------------- */

  var qlWinamp = document.getElementById("ql-winamp");
  qlWinamp.addEventListener("click", function () {
    var win = byId("win-winamp");
    if (win.classList.contains("open") && !win.classList.contains("minimized")) {
      minimizeWindow("win-winamp");
    } else {
      openWindow("win-winamp");
    }
  });

  /* ---------------- Quicklaunch: Show Desktop ---------------- */

  var qlDesktop = document.getElementById("ql-desktop");
  var desktopShown = false;
  var hiddenByShowDesktop = [];
  qlDesktop.addEventListener("click", function () {
    if (!desktopShown) {
      hiddenByShowDesktop = windows.filter(function (w) {
        return w.classList.contains("open") && !w.classList.contains("minimized");
      });
      hiddenByShowDesktop.forEach(function (w) { minimizeWindow(w.id); });
      desktopShown = true;
      qlDesktop.classList.add("active");
    } else {
      hiddenByShowDesktop.forEach(function (w) { openWindow(w.id); });
      desktopShown = false;
      qlDesktop.classList.remove("active");
    }
  });

  /* ---------------- Clock ---------------- */

  var trayClock = document.getElementById("tray-clock");
  function updateClock() {
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    var ampm = h >= 12 ? "PM" : "AM";
    h = h % 12; if (h === 0) h = 12;
    var mm = m < 10 ? "0" + m : "" + m;
    trayClock.textContent = h + ":" + mm + " " + ampm;
  }
  updateClock();
  setInterval(updateClock, 5000);

  /* ---------------- Uptime (My Computer window) ---------------- */

  var uptimeEl = document.getElementById("uptime");
  var startedAt = Date.now();
  function updateUptime() {
    var secs = Math.floor((Date.now() - startedAt) / 1000);
    var m = Math.floor(secs / 60);
    var s = secs % 60;
    uptimeEl.textContent = (m > 0 ? m + "m " : "") + s + "s";
  }
  setInterval(updateUptime, 1000);

  /* ---------------- Shutdown sequence ---------------- */

  var shutdownButton = document.getElementById("shutdown-button");
  var shutdownOverlay = document.getElementById("shutdown-overlay");
  var shutdownScreen = document.getElementById("shutdown-screen");

  shutdownButton.addEventListener("click", function () {
    closeStartMenu();
    shutdownOverlay.hidden = false;
  });

  shutdownOverlay.addEventListener("click", function (e) {
    var action = e.target.closest("[data-action]");
    if (!action) return;
    var type = action.getAttribute("data-action");
    if (type === "cancel") {
      shutdownOverlay.hidden = true;
    } else if (type === "off") {
      shutdownOverlay.hidden = true;
      shutdownScreen.hidden = false;
      if (window.winamp) window.winamp.stop();
    } else if (type === "restart") {
      shutdownOverlay.hidden = true;
      window.location.reload();
    }
  });

  document.getElementById("reboot-btn").addEventListener("click", function () {
    window.location.reload();
  });

  /* ---------------- Log off ---------------- */

  var logoffButton = document.getElementById("logoff-button");
  logoffButton.addEventListener("click", function () {
    closeStartMenu();
    windows.forEach(function (win) { closeWindow(win.id); });
    if (window.winamp) window.winamp.stop();
    bootScreen.classList.remove("fade");
  });

  /* ---------------- Boot screen ---------------- */

  var bootScreen = document.getElementById("boot");
  function dismissBoot() {
    bootScreen.classList.add("fade");
    var anyOpen = windows.some(function (w) { return w.classList.contains("open"); });
    if (!anyOpen) openWindow("win-about");
  }
  bootScreen.addEventListener("click", dismissBoot);
  window.addEventListener("keydown", function () {
    if (!bootScreen.classList.contains("fade")) dismissBoot();
  });

  /* ---------------- Open About Me by default ---------------- */
  openWindow("win-about");
})();
