// ═══ Panel del programa en el riel derecho (P14) ═══
(function () {
  const rail = document.getElementById("dash-rail");
  const canvas = document.getElementById("dash-canvas");
  if (!rail || !canvas) return;
  const P = U.PAL;
  const A = window.RPT.ask;
  const SRC = "RoboMop New Era · base de ingeniería, julio 2026";

  const WINS = {
    ask: { no: "§0", t: "La decisión solicitada", stats: [["PRESUPUESTO BASE", "MXN $47,097.85"], ["BAC", "MXN $54,162.53"], ["TECHO", "MXN $55,000"], ["DURACIÓN", "16 semanas"]] },
    case: { no: "§1", t: "El caso para reconstruir", stats: [["AUTONOMÍA 2025", "25–30 min"], ["CLASES DE FALLA", "6 → 6 correcciones"], ["MODELO DE AUTONOMÍA 2026", "4.8 h est."], ["LÍNEA BASE", "2025 retirada"]] },
    decisions: { no: "§2", t: "Lista de materiales", stats: [["PARTES DEFINIDAS", "6 fijadas"], ["GRUPOS PRESUPUESTADOS", "11 grupos"], ["BASE", "MXN $47,097.85"], ["BAC", "MXN $54,162.53"]] },
    arch: { no: "§3", t: "Arquitectura de dos niveles", stats: [["ENLACE", "micro-ROS UART"], ["SEGURIDAD", "watchdog HW"], ["BASE DE TIEMPO", "monotónica MCU"], ["TRONCAL", "CAN 2.0 reservada"]] },
    energy: { no: "§4", t: "Energía y autonomía", stats: [["PAQUETE", "960 Wh"], ["CONSUMO PROM.", "200 W"], ["UN PAQUETE", "4.8 h est."], ["DOS PAQUETES", "9.6 h est."]] },
    plan: { no: "§5", t: "Plan de 16 semanas", stats: [["FASES", "8 + congelación"], ["COMPUERTAS", "G0–G6"], ["CIERRE DE DISEÑO", "S2"], ["CONG. DE FUNCIONES", "S12"]] },
    risk: { no: "§6", t: "Riesgos prioritarios", stats: [["REGISTRO", "12 riesgos"], ["TOPE", "R01 calendario"], ["REVISIÓN ROJOS", "semanal"], ["PARO DE TRABAJO", "1 evento de movimiento"]] },
    accept: { no: "§7", t: "Calidad y aceptación", stats: [["OBJETIVOS", "10"], ["NIVELES", "5"], ["P0 AL LIBERAR", "0 abiertos"], ["CONG. REQUISITOS", "S1"]] },
    gov: { no: "§8", t: "Gobernanza y control", stats: [["ROLES", "3"], ["CLASES DE CAMBIO", "3"], ["CADENCIA", "semanal"], ["KPIS", "9"]] },
  };
  const SUBSYS = [
    ["CÓMPUTO · ORIN NANO", "FIJADO"], ["CONTROL · ESP32-S3", "FIJADO"], ["JUEGO PCB ×2", "DISEÑO · S2"],
    ["MODELO ENERGÉTICO", "PASA"], ["TREN MOTRIZ ×2", "LÍNEA BASE"], ["PERCEPCIÓN", "COMPROMETIDA"],
    ["IRRIGACIÓN", "INTEGRADA"], ["CONECTIVIDAD", "REQUERIDA"],
  ];

  let bc = U.bindCanvas(canvas), view = bc.fit();
  let cur = "ask";
  const hits = [];

  function draw() {
    view = bc.fit();
    const ctx = bc.ctx, w = view.w, h = view.h;
    hits.length = 0;
    ctx.clearRect(0, 0, w, h);
    const W = WINS[cur];
    const mono = (s, x, y, o = {}) => {
      ctx.font = `${o.b ? "700 " : ""}${o.sz || 10}px Menlo, Consolas, monospace`;
      ctx.fillStyle = o.c || P.inkLo; ctx.textAlign = o.al || "left";
      ctx.fillText(s, x, y);
    };
    let y = 54;

    // insignia de ventana + título
    ctx.strokeStyle = P.red; ctx.lineWidth = 1.5;
    ctx.strokeRect(28, y - 16, 44, 24);
    mono(W.no, 50, y + 1, { b: true, c: P.red, al: "center", sz: 11 });
    ctx.font = "700 21px 'et-book', Palatino, Georgia, serif";
    ctx.fillStyle = P.ink; ctx.textAlign = "left";
    ctx.fillText(W.t, 86, y + 2);
    y += 22;
    ctx.strokeStyle = P.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(28, y); ctx.lineTo(w - 28, y); ctx.stroke();
    y += 34;

    // mini barra de programa de 16 semanas
    mono("PROGRAMA · SEMANAS 1–16", 28, y, { sz: 9 }); y += 12;
    const bx = 28, bw = w - 56, bh = 20;
    const segs = [[0, 1], [1, 2], [2, 4], [4, 8], [8, 12], [12, 14], [14, 15], [15, 16]];
    const cols = ["#42566a", "#5b7186", "#74869a", "#42566a", "#2251ff", "#1233b8", "#2251ff", "#051c2c"];
    segs.forEach((s, i) => {
      const x0 = bx + (s[0] / 16) * bw, x1 = bx + (s[1] / 16) * bw;
      ctx.fillStyle = cols[i]; ctx.globalAlpha = 0.92;
      ctx.fillRect(x0 + 1, y, x1 - x0 - 2, bh);
      ctx.globalAlpha = 1;
    });
    // compuertas
    [0, 1, 2, 8, 12, 14, 16].forEach((g, i) => {
      const gx = bx + (g / 16) * bw;
      ctx.strokeStyle = i === 6 ? P.red : P.ink; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(gx, y - 4); ctx.lineTo(gx, y + bh + 4); ctx.stroke();
      mono("G" + i, gx, y + bh + 16, { sz: 8.5, al: "center", c: i === 6 ? P.red : P.inkMd, b: i === 6 });
    });
    // marcador de congelación
    const fx = bx + (12 / 16) * bw;
    ctx.setLineDash([4, 3]); ctx.strokeStyle = P.red;
    ctx.beginPath(); ctx.moveTo(fx, y - 6); ctx.lineTo(fx, y + bh + 6); ctx.stroke();
    ctx.setLineDash([]);
    y += bh + 34;

    // placa de estadísticas (2×2)
    mono("LECTURA · " + W.no, 28, y, { sz: 9 }); y += 10;
    W.stats.forEach((s, i) => {
      const col = i % 2, row = (i / 2) | 0;
      const sx = 28 + col * ((w - 56) / 2), sy = y + row * 64;
      ctx.strokeStyle = P.lineLo; ctx.lineWidth = 1;
      ctx.strokeRect(sx, sy, (w - 56) / 2 - 8, 56);
      mono(s[0], sx + 10, sy + 18, { sz: 8.5 });
      ctx.font = "700 15px Menlo, Consolas, monospace"; ctx.fillStyle = P.red;
      ctx.fillText(s[1], sx + 10, sy + 42);
      hits.push({ x: sx, y: sy, w: (w - 56) / 2 - 8, h: 56, d: { title: s[0], value: s[1], sub: W.t, source: SRC, } });
    });
    y += 2 * 64 + 22;

    // barra de financiamiento: base → BAC → techo
    mono("FINANCIAMIENTO · MXN", 28, y, { sz: 9 }); y += 12;
    const fx0 = 28, fw = w - 56;
    const scale = v => fx0 + (v / A.cap) * fw;
    ctx.fillStyle = P.lineLo; ctx.fillRect(fx0, y, fw, 14);
    ctx.fillStyle = "#42566a"; ctx.fillRect(fx0, y, scale(A.base) - fx0, 14);
    ctx.fillStyle = P.red; ctx.fillRect(scale(A.base), y, scale(A.bac) - scale(A.base), 14);
    ctx.strokeStyle = P.neg; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(scale(A.cap), y - 4); ctx.lineTo(scale(A.cap), y + 18); ctx.stroke();
    mono("BASE " + (A.base / 1000).toFixed(1) + "K", fx0, y + 30, { sz: 8.5, c: P.inkMd });
    mono("BAC " + (A.bac / 1000).toFixed(1) + "K", scale(A.bac) - 4, y - 8, { sz: 8.5, c: P.red, al: "right", b: true });
    mono("TECHO 55.0K", scale(A.cap), y + 30, { sz: 8.5, c: P.neg, al: "right", b: true });
    hits.push({ x: fx0, y: y - 6, w: fw, h: 40, d: { title: "ESCALERA DE FINANCIAMIENTO", value: "BAC MXN $54,162.53", sub: "Base $47,097.85 + contingencia del 15% controlada por el Patrocinador; techo $55,000.", source: SRC } });
    y += 52;

    // celdas de estado de subsistemas
    mono("ESTADO DE SUBSISTEMAS · DECISIONES FIJADAS", 28, y, { sz: 9 }); y += 10;
    SUBSYS.forEach((s, i) => {
      const col = i % 2, row = (i / 2) | 0;
      const sx = 28 + col * ((w - 56) / 2), sy = y + row * 40;
      ctx.strokeStyle = P.lineLo; ctx.lineWidth = 1;
      ctx.strokeRect(sx, sy, (w - 56) / 2 - 8, 34);
      ctx.fillStyle = s[1] === "FIJADO" ? P.red : s[1] === "PASA" ? P.redHi : P.inkLo;
      ctx.beginPath(); ctx.arc(sx + 12, sy + 17, 3.4, 0, U.TAU); ctx.fill();
      mono(s[0], sx + 24, sy + 15, { sz: 8, c: P.inkMd });
      mono(s[1], sx + 24, sy + 28, { sz: 8.5, b: true, c: s[1] === "FIJADO" ? P.red : P.ink });
    });
    y += 4 * 40 + 18;

    mono("CLIC EN CUALQUIER PANEL PARA VER EL DETALLE", 28, Math.min(y + 8, h - 18), { sz: 8, c: P.inkLo });
  }

  // clic → detalle
  canvas.addEventListener("click", e => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const hit = hits.find(z => mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h);
    if (hit) U.showDrill({ ...hit.d, x: e.clientX, y: e.clientY });
  });

  // seguimiento de secciones
  const secIO = new IntersectionObserver(es => es.forEach(en => {
    if (en.isIntersecting) { cur = en.target.dataset.win; draw(); }
  }), { rootMargin: "-40% 0px -55% 0px", threshold: 0 });
  document.querySelectorAll("[data-win]").forEach(s => secIO.observe(s));

  // visibilidad del riel después de la portada
  const coverIO = new IntersectionObserver(es => es.forEach(en => {
    rail.classList.toggle("on", !en.isIntersecting);
  }), { threshold: 0.25 });
  const cover = document.getElementById("cover");
  if (cover) coverIO.observe(cover);

  window.addEventListener("resize", () => draw());
  draw();
})();
