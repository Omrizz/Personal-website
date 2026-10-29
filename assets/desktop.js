/* ===================================================================
   Desktop extras: right-click menu and Display Properties themes.
   =================================================================== */

(function () {
  "use strict";

  var desktop = document.getElementById("desktop");
  var menu = document.getElementById("context-menu");
  var root = document.documentElement;
  if (!desktop || !menu) return;

  /* ---------------- Themes ---------------- */

  var THEMES = ["day", "sunset", "night"];

  function applyTheme(name) {
    if (name === "day") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", name);
    try { window.localStorage.setItem("omrios.theme", name); } catch (e) { /* ignore */ }
    var radio = document.querySelector('#theme-list input[value="' + name + '"]');
    if (radio) radio.checked = true;
  }

  document.getElementById("theme-list").addEventListener("change", function (e) {
    if (e.target.name === "theme" && THEMES.indexOf(e.target.value) !== -1) applyTheme(e.target.value);
  });
  document.getElementById("display-ok").addEventListener("click", function () {
    document.querySelector("#win-display .tb-close").click();
  });
  (function restore() {
    var saved = null;
    try { saved = window.localStorage.getItem("omrios.theme"); } catch (e) { /* ignore */ }
    if (THEMES.indexOf(saved) !== -1) applyTheme(saved);
  })();

  /* ---------------- Right-click menu ---------------- */

  function hideMenu() { menu.hidden = true; }

  desktop.addEventListener("contextmenu", function (e) {
    // only the bare desktop; windows and icons keep the default behaviour
    if (e.target.closest(".window, .desktop-icon")) return;
    e.preventDefault();
    menu.hidden = false;
    var rect = desktop.getBoundingClientRect();
    var x = Math.min(e.clientX - rect.left, desktop.clientWidth - menu.offsetWidth - 4);
    var y = Math.min(e.clientY - rect.top, desktop.clientHeight - menu.offsetHeight - 4);
    menu.style.left = Math.max(0, x) + "px";
    menu.style.top = Math.max(0, y) + "px";
    if (menu.parentNode !== desktop) desktop.appendChild(menu);
  });

  menu.addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    if (btn.id === "ctx-refresh") {
      var icons = document.getElementById("desktop-icons");
      icons.style.visibility = "hidden";
      setTimeout(function () { icons.style.visibility = ""; }, 120);
    }
    hideMenu();
  });
  document.addEventListener("mousedown", function (e) {
    if (!menu.hidden && !menu.contains(e.target)) hideMenu();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hideMenu();
  });
  window.addEventListener("blur", hideMenu);
})();
