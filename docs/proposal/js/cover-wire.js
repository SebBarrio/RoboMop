// ═══ Cover C · The blueprint (wireframe) + three-way mode switcher ═══
(function () {
  const canvas = document.getElementById("cover-canvas-w");
  let bc = canvas ? U.bindCanvas(canvas) : null, view = null, raf = 0, active = false;
  let k = 1, kT = 1, t0 = null, mouseX = 0, tLast = 0;

  function draw(ts) {
    if (!active) return;
    if (t0 == null) { t0 = ts; tLast = ts; }
    const t = (ts - t0) / 1000, dt = Math.min((ts - tLast) / 1000, 0.05);
    tLast = ts;
    k = U.ease(k, kT, dt, 0.28);
    const yaw = Math.PI / 4 + 0.25 * Math.sin(t * 0.11) + mouseX * 0.11;
    const ctx = bc.ctx;
    ctx.clearRect(0, 0, view.w, view.h);
    window.ROBO_ENGINE.drawFrame(ctx, view, { t, k: window.REDUCE ? 1 : k, yaw: window.REDUCE ? Math.PI / 4 : yaw, mode: "wire" });
    // left wash for title legibility
    const grad = ctx.createLinearGradient(0, 0, view.w * 0.6, 0);
    grad.addColorStop(0, "rgba(255,255,255,.94)"); grad.addColorStop(0.8, "rgba(255,255,255,.5)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, view.w * 0.6, view.h);
    if (!window.REDUCE) raf = requestAnimationFrame(draw);
  }

  if (canvas) canvas.addEventListener("click", e => { if (e.target === canvas) kT = kT > 0.5 ? 0 : 1; });
  window.addEventListener("mousemove", e => { mouseX = (e.clientX / window.innerWidth - 0.5) * 2; });

  window.COVER_W = {
    setActive(on) {
      active = on; cancelAnimationFrame(raf);
      if (on) {
        t0 = null;
        if (window.REDUCE) requestAnimationFrame(() => { view = bc.fit(); draw(performance.now()); });
        else { view = bc.fit(); raf = requestAnimationFrame(draw); }
      }
    }
  };

  // ── mode switcher (loads after all covers) ──
  const MODES = {
    rec: { cv: document.getElementById("cover-canvas"), api: window.COVER_A },
    x: { cv: document.getElementById("cover-canvas-x"), api: window.COVER_X },
    w: { cv: document.getElementById("cover-canvas-w"), api: window.COVER_W },
  };
  function setMode(m) {
    if (!MODES[m]) m = "rec";
    Object.entries(MODES).forEach(([key, M]) => {
      if (!M.cv) return;
      const on = key === m;
      M.cv.style.display = on ? "" : "none";
      if (M.api && M.api.setActive) M.api.setActive(on);
    });
    document.querySelectorAll("#cover-mode button").forEach(b => b.classList.toggle("on", b.dataset.mode === m));
    try { localStorage.setItem("robomop-cover", m); } catch (e) { }
  }
  document.querySelectorAll("#cover-mode button").forEach(b => {
    b.addEventListener("click", ev => { ev.stopPropagation(); setMode(b.dataset.mode); });
  });
  const urlMode = new URLSearchParams(location.search).get("cover");
  let initial = "rec";
  if (urlMode === "x" || urlMode === "w" || urlMode === "rec") initial = urlMode;
  else { try { initial = localStorage.getItem("robomop-cover") || "rec"; } catch (e) { } }
  // activate after layout settles (hidden canvases measure 0×0)
  requestAnimationFrame(() => setMode(initial));
})();
