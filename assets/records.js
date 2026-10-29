/* ===================================================================
   Personal records shown in the Games folder. Reads what the games
   saved to localStorage; nothing is sent anywhere.
   =================================================================== */

(function () {
  "use strict";

  var el = document.getElementById("games-records");
  if (!el) return;

  function fmt(t) {
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2);
  }

  function esc(str) {
    return String(str).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function read(key) {
    try { return JSON.parse(window.localStorage.getItem(key)); } catch (e) { return null; }
  }

  function render() {
    var rows = [];
    var circuit = read("sunsetCircuit.v1");
    var best = circuit && circuit.best ? circuit.best : {};
    Object.keys(best).sort().forEach(function (k) {
      var r = best[k];
      if (!r || typeof r !== "object") return;
      var label = esc(r.track || "Circuit") + " \u00b7 " + (r.mode === "trial" ? "Time Trial" : "Race");
      rows.push(
        "<tr><td>Sunset Circuit</td><td>" + label + "</td>" +
        '<td class="num">' + (isFinite(r.lap) ? fmt(r.lap) : "--") + "</td>" +
        '<td class="num">' + (isFinite(r.total) ? fmt(r.total) : "--") + "</td></tr>"
      );
    });

    var ms = 0;
    try { ms = parseInt(window.localStorage.getItem("omrios.minesweeper.best"), 10); } catch (e) { ms = 0; }
    if (ms > 0) {
      rows.push("<tr><td>Minesweeper</td><td>Beginner</td><td class=\"num\">--</td><td class=\"num\">" + ms + "s</td></tr>");
    }

    if (!rows.length) {
      el.innerHTML = '<p class="empty">Nothing here yet \u2014 finish a race or clear a minefield and it shows up.</p>';
      return;
    }
    el.innerHTML =
      "<table><thead><tr><th>Game</th><th>Setup</th><th>Best lap</th><th>Best total</th></tr></thead><tbody>" +
      rows.join("") + "</tbody></table>";
  }

  document.addEventListener("window:open", function (e) {
    if (e.detail === "win-games") render();
  });
  window.addEventListener("storage", render);
  render();
})();
