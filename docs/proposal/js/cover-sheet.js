// ═══ Cover sheet — orthographic plate: lerped mouse parallax ═══
// The plate itself (three views, projection axes, tag) is pure HTML/CSS and
// visible without JS; this file only adds pointer-driven depth. Skipped for
// reduced-motion users and coarse pointers (touch).
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  if (reduce || coarse) return;
  var cover = document.getElementById("cover");
  var sheet = cover && cover.querySelector(".cover-sheet");
  if (!sheet) return;
  var tx = 0, ty = 0, px = 0, py = 0, raf = 0;
  function tick() {
    px += (tx - px) * 0.08;
    py += (ty - py) * 0.08;
    sheet.style.setProperty("--px", px.toFixed(4));
    sheet.style.setProperty("--py", py.toFixed(4));
    if (Math.abs(tx - px) > 0.0005 || Math.abs(ty - py) > 0.0005) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = 0;
    }
  }
  function kick() { if (!raf) raf = requestAnimationFrame(tick); }
  cover.addEventListener("mousemove", function (e) {
    var r = cover.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    kick();
  });
  cover.addEventListener("mouseleave", function () {
    tx = 0; ty = 0; kick();
  });
})();
