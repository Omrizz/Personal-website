/* ===================================================================
   Contact window: a mail composer that hands off to the visitor's own
   mail app via mailto: -- nothing is stored or sent from the page.
   =================================================================== */

(function () {
  "use strict";

  var form = document.getElementById("contact-form");
  if (!form) return;

  var ADDRESS = "omrivainz@gmail.com";
  var from = document.getElementById("contact-from");
  var subject = document.getElementById("contact-subject");
  var body = document.getElementById("contact-body");
  var status = document.getElementById("contact-status");
  var copyBtn = document.getElementById("contact-copy");

  function say(msg) { status.textContent = msg; }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = body.value.trim();
    if (!text) {
      say("Write a message first.");
      body.focus();
      return;
    }
    var signed = from.value.trim() ? text + "\n\n-- " + from.value.trim() : text;
    window.location.href = "mailto:" + ADDRESS +
      "?subject=" + encodeURIComponent(subject.value.trim() || "Hello") +
      "&body=" + encodeURIComponent(signed);
    say("Opening your mail app… if nothing happens, use Copy address.");
  });

  copyBtn.addEventListener("click", function () {
    var done = function () { say("Copied " + ADDRESS + " to the clipboard."); };
    var fail = function () { say("Copy failed — the address is " + ADDRESS + "."); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ADDRESS).then(done, fail);
    } else {
      fail();
    }
  });

  document.addEventListener("window:open", function (e) {
    if (e.detail === "win-contact") setTimeout(function () { body.focus(); }, 0);
  });
})();
