/* ===================================================================
   Run dialog: type a name, get the matching window (or link).
   =================================================================== */

(function () {
  "use strict";

  var form = document.getElementById("run-form");
  if (!form) return;

  var input = document.getElementById("run-input");
  var errorEl = document.getElementById("run-error");
  var list = document.getElementById("run-commands");
  var winRun = document.getElementById("win-run");

  var WINDOWS = {
    about: "win-about", notepad: "win-about", "about me": "win-about",
    resume: "win-resume", cv: "win-resume",
    projects: "win-project", project: "win-project", code: "win-project",
    skills: "win-programs", control: "win-programs", "control panel": "win-programs", appwiz: "win-programs",
    computer: "win-computer", "my computer": "win-computer", sysdm: "win-computer", winver: "win-computer",
    recycle: "win-recycle", "recycle bin": "win-recycle",
    games: "win-games",
    minesweeper: "win-minesweeper", winmine: "win-minesweeper", mines: "win-minesweeper",
    circuit: "win-drive", race: "win-drive", racing: "win-drive", drive: "win-drive", "sunset circuit": "win-drive",
    winamp: "win-winamp", music: "win-winamp", player: "win-winamp"
  };
  var LINKS = {
    github: "https://github.com/omrizz",
    email: "mailto:omrivainz@gmail.com", mail: "mailto:omrivainz@gmail.com", contact: "mailto:omrivainz@gmail.com"
  };
  var SUGGEST = ["about", "resume", "projects", "skills", "games", "circuit", "minesweeper", "winamp", "computer", "recycle", "github", "email", "help"];

  SUGGEST.forEach(function (name) {
    var o = document.createElement("option");
    o.value = name;
    list.appendChild(o);
  });

  function close() {
    // the window manager owns taskbar buttons, so close through its own control
    winRun.querySelector(".tb-close").click();
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var cmd = input.value.trim().toLowerCase().replace(/\.(exe|txt|lnk)$/, "");
    if (!cmd) return;
    if (cmd === "help" || cmd === "?") {
      showError("Try: " + SUGGEST.filter(function (n) { return n !== "help"; }).join(", ") + ".");
      return;
    }
    if (WINDOWS[cmd]) {
      close();
      window.openWindow(WINDOWS[cmd]);
    } else if (LINKS[cmd]) {
      close();
      window.open(LINKS[cmd], LINKS[cmd].indexOf("mailto:") === 0 ? "_self" : "_blank", "noopener");
    } else {
      showError("Cannot find '" + input.value.trim() + "'. Make sure you typed the name correctly, and then try again.");
    }
  });

  document.getElementById("run-cancel").addEventListener("click", close);
  winRun.addEventListener("keydown", function (e) {
    if (e.key === "Escape") close();
  });

  document.addEventListener("window:open", function (e) {
    if (e.detail !== "win-run") return;
    errorEl.hidden = true;
    input.value = "";
    setTimeout(function () { input.focus(); }, 0);
  });
})();
