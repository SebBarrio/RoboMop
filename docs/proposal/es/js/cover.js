// ═══ Cover A · The fleet recursion ═══
// The robot itself recurses: the atom shrinks into one cell of a larger
// array of its kind — every robot one cell of the ten-unit fleet.
window.COVER_A = (() => {
  const canvas = document.getElementById("cover-canvas");
  if (!canvas) return { setActive() { } };
  const P = U.PAL;
  let bc = U.bindCanvas(canvas), view = null, raf = 0, active = false, t0 = null;
  const T = 6.5; // seconds per recursion cycle

  // ── robot top-view mask: body, LiDAR turret, two wheels, mop pad, cameras ──
  function drawRobot(ctx, x, y, s, alpha, flash) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const r = s * 0.5;
    if (s < 15) { // LOD: body + turret only
      ctx.fillStyle = "#dbe2ea"; ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, U.TAU); ctx.fill();
      ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, U.TAU); ctx.fill();
      ctx.fillStyle = P.red; ctx.beginPath(); ctx.arc(x, y, r * 0.2, 0, U.TAU); ctx.fill();
      ctx.restore(); return;
    }
    const bw = s * 0.62, bh = s * 0.62, rad = s * 0.12;
    // wheels (hub motors, side blocks)
    ctx.fillStyle = P.ink;
    const ww = s * 0.10, wh = s * 0.30;
    ctx.beginPath(); ctx.roundRect(x - bw / 2 - ww * 0.55, y - wh / 2, ww, wh, ww * 0.4); ctx.fill();
    ctx.beginPath(); ctx.roundRect(x + bw / 2 - ww * 0.45, y - wh / 2, ww, wh, ww * 0.4); ctx.fill();
    // mop pad (rear, light blue)
    ctx.fillStyle = "#7d9bff";
    ctx.beginPath(); ctx.roundRect(x - bw * 0.42, y + bh / 2 - s * 0.045, bw * 0.84, s * 0.09, s * 0.03); ctx.fill();
    // body
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = P.ink; ctx.lineWidth = Math.max(1, s * 0.028);
    ctx.beginPath(); ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, rad); ctx.fill(); ctx.stroke();
    // LiDAR turret
    ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(x, y - bh * 0.05, s * 0.15, 0, U.TAU); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y - bh * 0.05, s * 0.075, 0, U.TAU); ctx.fill();
    ctx.fillStyle = P.red; ctx.beginPath(); ctx.arc(x, y - bh * 0.05, s * 0.028, 0, U.TAU); ctx.fill();
    // front cameras (two dots)
    ctx.fillStyle = P.red;
    ctx.beginPath(); ctx.arc(x - bw * 0.18, y - bh / 2 + s * 0.05, s * 0.022, 0, U.TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + bw * 0.18, y - bh / 2 + s * 0.05, s * 0.022, 0, U.TAU); ctx.fill();
    if (flash > 0) { // birth flash: blue veil
      ctx.globalAlpha = flash * 0.55; ctx.fillStyle = P.red;
      ctx.beginPath(); ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, rad); ctx.fill();
    }
    ctx.restore();
  }

  // ── recursive 3×3 grid; center cell holds the next level ──
  const MAXD = 3;
  function drawGrid(ctx, cx, cy, S, depth, zoom, R, S0) {
    const cell = S / 3;
    for (let gy = -1; gy <= 1; gy++) for (let gx = -1; gx <= 1; gx++) {
      const x = cx + gx * cell, y = cy + gy * cell;
      if (Math.abs(x - view.w / 2) > view.w / 2 + cell || Math.abs(y - view.h / 2) > view.h / 2 + cell) continue;
      if (x + cell * 0.5 < view.w * 0.55) continue; // keep the text column clear
      if (gx === 0 && gy === 0 && depth > 0) { drawGrid(ctx, x, y, cell, depth - 1, zoom, R, S0); continue; }
      // birth: outermost-level cells fade in (with a blue flash) as the shrinking
      // field carries them across the viewport radius R
      let alpha = 1, flash = 0;
      if (depth === MAXD && (gx || gy)) {
        // cell center sits at hypot(gx,gy)·S0·3^(−z) at cycle progress z →
        // enters R when z > zE = log3(hypot·S0/R)
        const zE = U.clamp(Math.log(Math.hypot(gx, gy) * S0 / R) / Math.log(3), 0, 1);
        const a = U.clamp((zoom - zE) / 0.14, 0, 1);
        alpha = a; flash = a > 0 && a < 1 ? 1 - a : 0;
      }
      drawRobot(ctx, x, y, cell, alpha, flash);
    }
  }

  function draw(ts) {
    if (!active) return;
    if (t0 == null) t0 = ts;
    const t = (ts - t0) / 1000;
    const zoom = window.REDUCE ? 0.42 : (t / T) % 1;
    const ctx = bc.ctx;
    ctx.clearRect(0, 0, view.w, view.h);

    // anchor the field to the right side, clearing the left text column
    const cx = view.w * 0.76, cy = view.h * 0.52;
    const S0 = Math.min(view.w, view.h) * 0.52;
    const S = S0 * Math.pow(3, 1 - zoom); // field shrinks: atom zooms out into the fleet
    const R = Math.hypot(view.w, view.h) * 0.62;

    drawGrid(ctx, cx, cy, S, 3, zoom, R, S0);

    // viewfinder around the current atom (center cell of the outermost grid)
    const cs = S / 3, vf = cs * 0.72;
    ctx.strokeStyle = P.red; ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.75 * (1 - zoom * 0.6);
    const L = vf * 0.24;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(cx + sx * vf - sx * 0 + (sx > 0 ? 0 : L), cy + sy * vf);
      ctx.lineTo(cx + sx * vf, cy + sy * vf);
      ctx.lineTo(cx + sx * vf, cy + sy * vf + (sy > 0 ? -L : L));
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // left wash for title legibility
    const grad = ctx.createLinearGradient(0, 0, view.w * 0.7, 0);
    grad.addColorStop(0, "rgba(255,255,255,.97)");
    grad.addColorStop(0.62, "rgba(255,255,255,.92)");
    grad.addColorStop(0.86, "rgba(255,255,255,.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, view.w * 0.7, view.h);

    // caption
    ctx.font = "10.5px Menlo, Consolas, monospace";
    ctx.fillStyle = P.inkLo; ctx.textAlign = "right";
    ctx.fillText("UN ROBOT HOY — CADA ROBOT UNA CELDA DE LA FLOTA DE DIEZ UNIDADES QUE ESTA FASE HABILITA", view.w - 28, view.h - 26);

    if (!window.REDUCE) raf = requestAnimationFrame(draw);
  }

  function setActive(on) {
    active = on;
    cancelAnimationFrame(raf);
    if (on) {
      view = bc.fit();
      t0 = null;
      if (window.REDUCE) { requestAnimationFrame(() => { view = bc.fit(); draw(performance.now()); }); }
      else raf = requestAnimationFrame(draw);
    }
  }
  return { setActive };
})();
