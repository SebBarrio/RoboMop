// ═══ Robot geometry engine (ROBO_ENGINE) — renders the blueprint cover ═══
(function () {
  const P = U.PAL;

  // ── layer model (bottom → top): the five thesis layers of the rebuild ──
  const LAYERS = [
    { key: "chassis", w: 30, d: 21, h: 4.2, col: "#0d2c44", side: "#071e30", hi: "#16405f",
      head: "CHASIS · DOS MOTORES EN RUEDA", sub: "impreso en 3D funcional · plataforma de trapeador atrás", col2: P.ink },
    { key: "pack", w: 24, d: 16, h: 5.2, col: "#3e5c76", side: "#2c4457", hi: "#527b9d",
      head: "PAQUETE LFP · 960 WH", sub: "25.6 V nominales · 40 Ah · 4.8 h est. · cambio ≤5 min", col2: P.redHi },
    { key: "pcb1", w: 26, d: 18, h: 1.7, col: "#155233", side: "#0d3a23", hi: "#1d7048",
      head: "PCB 1 · POTENCIA / TREN MOTRIZ", sub: "ESP32-S3 tiempo real · watchdog · corte PWM", col2: P.red },
    { key: "pcb2", w: 24, d: 16, h: 1.7, col: "#1d7048", side: "#155233", hi: "#2a8f5f",
      head: "PCB 2 · PORTADORA JETSON", sub: "Orin Nano 8GB + NVMe · kit dev $249", col2: P.red },
    { key: "deck", w: 28, d: 19, h: 2.6, col: "#c9d2da", side: "#9fabbb", hi: "#e8edf2",
      head: "CUBIERTA DE SENSORES · PERCEPCIÓN", sub: "LiDAR 2D + dos cámaras, con sello de tiempo", col2: P.ink },
  ];
  const SEP = 10.5; // exploded lift between layers

  function projectFactory(u, yaw, cx, cy) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return (x, y, z) => {
      const rx = x * c - y * s, ry = x * s + y * c;
      return { x: cx + rx * u, y: cy + ry * u * 0.5 - z * u };
    };
  }

  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }

  // box at base z0 with per-layer lift; mode "solid" | "wire"
  function drawBox(ctx, pt, L, z0, mode) {
    const w = L.w / 2, d = L.d / 2, h = L.h;
    const c000 = pt(-w, -d, z0), c100 = pt(w, -d, z0), c110 = pt(w, d, z0), c010 = pt(-w, d, z0);
    const c001 = pt(-w, -d, z0 + h), c101 = pt(w, -d, z0 + h), c111 = pt(w, d, z0 + h), c011 = pt(-w, d, z0 + h);
    if (mode === "wire") {
      // X-ray wireframe: bottom faint, sides mid, top heaviest
      poly(ctx, [c000, c100, c110, c010], null, hexA(L.col2, 0.22), 0.8);
      poly(ctx, [c100, c110, c111, c101], null, hexA(L.col2, 0.5), 0.9);
      poly(ctx, [c010, c110, c111, c011], null, hexA(L.col2, 0.5), 0.9);
      poly(ctx, [c000, c100, c101, c001], null, hexA(L.col2, 0.34), 0.8);
      poly(ctx, [c000, c010, c011, c001], null, hexA(L.col2, 0.34), 0.8);
      // top veil then outline
      poly(ctx, [c001, c101, c111, c011], "rgba(255,255,255,.62)", null);
      poly(ctx, [c001, c101, c111, c011], null, hexA(L.col2, 0.88), 1.3);
      // vertical edges
      [[c000, c001], [c100, c101], [c110, c111], [c010, c011]].forEach(([a, b]) => {
        ctx.strokeStyle = hexA(L.col2, 0.3); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      });
      return { top: [c001, c101, c111, c011] };
    }
    // solid: sides then top (painter: right side, left side, top)
    poly(ctx, [c100, c110, c111, c101], L.side);
    poly(ctx, [c010, c110, c111, c011], shade(L.side, 1.18));
    const top = [c001, c101, c111, c011];
    const g = ctx.createLinearGradient(c001.x, c001.y, c110.x, c110.y);
    g.addColorStop(0, L.hi); g.addColorStop(1, L.col);
    poly(ctx, top, g);
    // top-edge bevel
    ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(c001.x, c001.y); ctx.lineTo(c101.x, c101.y); ctx.stroke();
    return { top };
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = U.clamp(((n >> 16) & 255) * f, 0, 255) | 0, g = U.clamp(((n >> 8) & 255) * f, 0, 255) | 0, b = U.clamp((n & 255) * f, 0, 255) | 0;
    return `rgb(${r},${g},${b})`;
  }
  function hexA(hex, a) {
    if (hex.startsWith("rgb")) return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function ellipse(ctx, p, rx, ry, fill, stroke, lw) {
    ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.abs(rx), Math.abs(ry), 0, 0, U.TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }

  // identity details per layer
  function drawDetails(ctx, pt, L, z1, u, mode) {
    const wire = mode === "wire";
    const ink = wire ? hexA(L.col2, 0.75) : null;
    if (L.key === "chassis") {
      // two hub wheels: vertical screen ellipses at ±x sides
      [-1, 1].forEach(sx => {
        const p = pt(sx * (L.w / 2 + 1.6), 0, z1 + 2.2);
        const rw = 2.6 * u * 0.5, rh = 4.4 * u;
        if (wire) { ellipse(ctx, p, rw, rh, null, ink, 1); }
        else {
          const g = ctx.createLinearGradient(p.x - rw, p.y, p.x + rw, p.y);
          g.addColorStop(0, "#020d16"); g.addColorStop(0.5, "#1a3a57"); g.addColorStop(1, "#020d16");
          ellipse(ctx, p, rw, rh, g);
          ellipse(ctx, p, rw * 0.4, rh * 0.4, "#0d2c44");
        }
      });
      // mop pad aft
      const m = [pt(-9, L.d / 2 - 1.2, z1 + 0.4), pt(9, L.d / 2 - 1.2, z1 + 0.4), pt(9, L.d / 2 + 0.6, z1 + 0.4), pt(-9, L.d / 2 + 0.6, z1 + 0.4)];
      if (wire) poly(ctx, m, null, ink, 0.9); else poly(ctx, m, "#7d9bff");
    }
    if (L.key === "pack") {
      // 8S2P cells: 2 rows × 8 small cylinders
      for (let r = 0; r < 2; r++) for (let i = 0; i < 8; i++) {
        const p = pt(-10.5 + i * 3, -3.4 + r * 6.8, z1 + 1.1);
        if (wire) ellipse(ctx, p, 1.15 * u * 0.5, 1.15 * u * 0.25, null, ink, 0.7);
        else {
          ellipse(ctx, p, 1.15 * u * 0.5, 1.15 * u * 0.25, "#d8c46a");
          ellipse(ctx, p, 1.15 * u * 0.5, 1.15 * u * 0.25, null, "rgba(5,28,44,.35)", 0.6);
        }
      }
    }
    if (L.key === "pcb1") {
      // ESP32 chip + two driver blocks + gold connectors
      const chip = [pt(-3.4, -2.6, z1), pt(3.4, -2.6, z1), pt(3.4, 2.6, z1), pt(-3.4, 2.6, z1)];
      if (wire) poly(ctx, chip, null, ink, 1); else { poly(ctx, chip, "#0b1c2c"); poly(ctx, chip, null, "rgba(255,255,255,.25)", 0.7); }
      [-1, 1].forEach(sx => {
        const b = [pt(sx * 11 - 2.2, -6.4, z1), pt(sx * 11 + 2.2, -6.4, z1), pt(sx * 11 + 2.2, -2.4, z1), pt(sx * 11 - 2.2, -2.4, z1)];
        if (wire) poly(ctx, b, null, ink, 0.9); else poly(ctx, b, "#10324f");
        const cn = [pt(sx * 11 - 2.6, 4.4, z1), pt(sx * 11 + 2.6, 4.4, z1), pt(sx * 11 + 2.6, 7.6, z1), pt(sx * 11 - 2.6, 7.6, z1)];
        if (wire) poly(ctx, cn, null, ink, 0.9); else poly(ctx, cn, "#d8c46a");
      });
    }
    if (L.key === "pcb2") {
      // Jetson module with fins + SSD
      const jm = [pt(-6.4, -5, z1), pt(6.4, -5, z1), pt(6.4, 5, z1), pt(-6.4, 5, z1)];
      if (wire) poly(ctx, jm, null, ink, 1.1);
      else {
        poly(ctx, jm, "#0b1c2c");
        for (let i = -5; i <= 5; i++) {
          const a = pt(i, -4.4, z1 + 0.02), b = pt(i, 4.4, z1 + 0.02);
          ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      const ssd = [pt(8.4, -5, z1), pt(11, -5, z1), pt(11, 2, z1), pt(8.4, 2, z1)];
      if (wire) poly(ctx, ssd, null, ink, 0.9); else poly(ctx, ssd, "#274b6d");
    }
    if (L.key === "deck") {
      // LiDAR turret: squat vertical cylinder (z-axis → screen-vertical)
      const rxT = 3.6 * u * 0.62, ryT = 3.6 * u * 0.31;
      const bot = pt(0, -2.5, z1 + 1.2), top = pt(0, -2.5, z1 + 3.1);
      if (wire) {
        ellipse(ctx, bot, rxT, ryT, null, ink, 0.9);
        ellipse(ctx, top, rxT, ryT, null, ink, 1);
        ctx.strokeStyle = ink; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(bot.x - rxT, bot.y); ctx.lineTo(top.x - rxT, top.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bot.x + rxT, bot.y); ctx.lineTo(top.x + rxT, top.y); ctx.stroke();
      } else {
        ctx.fillStyle = "#0d2c44";
        ctx.fillRect(top.x - rxT, top.y, rxT * 2, bot.y - top.y);
        ctx.beginPath(); ctx.ellipse(bot.x, bot.y, rxT, ryT, 0, 0, Math.PI); ctx.fill();
        ellipse(ctx, top, rxT, ryT, "#16405f");
        ellipse(ctx, { x: top.x, y: top.y + (bot.y - top.y) * 0.45 }, rxT, ryT, null, P.red, 1.4);
      }
      [-1, 1].forEach(sx => {
        const cp = pt(sx * 7, -L.d / 2 + 1.2, z1 + 1.2);
        if (wire) ellipse(ctx, cp, 0.9 * u * 0.5, 0.9 * u * 0.3, null, ink, 0.8);
        else ellipse(ctx, cp, 0.9 * u * 0.5, 0.9 * u * 0.3, P.red);
      });
    }
  }

  // ── full frame renderer (shared by B solid and C wire) ──
  function drawFrame(ctx, view, st) {
    const { t, k, yaw, mode } = st;
    const W = view.w, H = view.h;
    const leftBound = 0.62 * W, right = W - 320;
    let u = Math.min((right - leftBound) / 44, H * 0.0132);
    let labelCol = true;
    if (u < 5.6) { labelCol = false; u = Math.min((W - 40 - leftBound) / 44, H * 0.0132); }
    const cx = (leftBound + right) / 2, cy = 0.56 * H;
    const pt = projectFactory(u, yaw, cx, cy);

    // per-layer z with explosion + breathing
    let zCursor = 0;
    const placed = LAYERS.map((L, i) => {
      // i = 0 is the bottom layer (chassis); the top layer lifts first and most
      const lay = U.clamp(k * 1.55 - (LAYERS.length - 1 - i) * 0.17, 0, 1);
      const lift = lay * i * SEP + (window.REDUCE ? 0 : Math.sin(t * 0.9 + i * 1.3) * 0.55 * lay);
      const z0 = zCursor + lift;
      zCursor += L.h;
      return { L, z0, lay };
    });

    // ground shadow
    if (mode !== "wire") {
      const gs = pt(0, 0, 0);
      const grd = ctx.createRadialGradient(gs.x, gs.y + 4, 4, gs.x, gs.y + 4, 30 * u * 0.62);
      grd.addColorStop(0, "rgba(5,28,44,.16)"); grd.addColorStop(1, "rgba(5,28,44,0)");
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.ellipse(gs.x, gs.y + 4, 30 * u * 0.62, 30 * u * 0.30, 0, 0, U.TAU); ctx.fill();
    } else {
      // drafting cross grid
      ctx.strokeStyle = "rgba(133,149,166,.16)"; ctx.lineWidth = 0.6;
      for (let gx = 0; gx < W; gx += 52) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
      for (let gy = 0; gy < H; gy += 52) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
    }

    // draw layers bottom → top
    const anchors = [];
    placed.forEach(({ L, z0, lay }, i) => {
      if (mode !== "wire") { // inter-layer soft shadow
        const sp = pt(0, 0, z0);
        ctx.fillStyle = `rgba(5,28,44,${U.clamp(0.16 - (i * 0.02), 0.04, 0.16)})`;
        ctx.beginPath(); ctx.ellipse(sp.x, sp.y + 2, L.w * u * 0.52, L.w * u * 0.25, 0, 0, U.TAU); ctx.fill();
      }
      const { top } = drawBox(ctx, pt, L, z0, mode);
      drawDetails(ctx, pt, L, z0 + L.h, u, mode);
      // anchor = rightmost top corner
      let a = top[0]; top.forEach(p => { if (p.x > a.x) a = p; });
      anchors.push({ L, a, z0 });
    });

    // labels (right column)
    if (labelCol) {
      const la = U.clamp((k - 0.45) * 2.4, 0, 1);
      if (la > 0.02) {
        const lx = W - 312;
        ctx.save(); ctx.globalAlpha = la;
        let ly = Math.min(...anchors.map(x => x.a.y)) - 6;
        anchors.slice().reverse().forEach(({ L, a }) => {
          ly = Math.max(ly, a.y - 8);
          // leader
          ctx.strokeStyle = hexA(L.col2, 0.55); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x + 4, a.y); ctx.lineTo(lx - 12, ly + 4); ctx.stroke();
          ctx.fillStyle = L.col2;
          if (mode === "wire") { ctx.beginPath(); ctx.arc(lx - 8, ly + 4, 2.6, 0, U.TAU); ctx.stroke(); }
          else { ctx.beginPath(); ctx.arc(lx - 8, ly + 4, 2.6, 0, U.TAU); ctx.fill(); }
          ctx.font = "700 10.5px 'JetBrains Mono', Menlo, Consolas, monospace";
          ctx.fillStyle = L.col2; ctx.textAlign = "left";
          ctx.fillText(L.head, lx, ly + 2);
          ctx.font = "10px 'JetBrains Mono', Menlo, Consolas, monospace";
          ctx.fillStyle = P.inkLo;
          ctx.fillText(L.sub, lx, ly + 17);
          ly += 40;
        });
        ctx.restore();
      }
    }

    // drafting registration marks (wire only)
    if (mode === "wire") {
      ctx.strokeStyle = P.red; ctx.lineWidth = 1.2;
      [[26, 26], [W - 26, 26], [26, H - 26], [W - 26, H - 26]].forEach(([mx, my]) => {
        ctx.beginPath(); ctx.moveTo(mx - 8, my); ctx.lineTo(mx + 8, my); ctx.moveTo(mx, my - 8); ctx.lineTo(mx, my + 8); ctx.stroke();
      });
      ctx.font = "10px 'JetBrains Mono', Menlo, Consolas, monospace"; ctx.fillStyle = P.inkLo; ctx.textAlign = "left";
      ctx.fillText("FIG. 1 · ROBOMOP NEW ERA · CINCO CAPAS · ESCALA NTS · " + (k > 0.5 ? "CLIC PARA ARMAR" : "CLIC PARA EXPLOTAR"), 28, H - 14);
    }
    return { u, cx, cy };
  }

  window.ROBO_ENGINE = { LAYERS, drawFrame, projectFactory, hexA };
})();
