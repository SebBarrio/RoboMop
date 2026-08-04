// ═══ main.js · motor de desplazamiento, chips, tira de métricas, listas, entradas ═══
(function () {
  const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.REDUCE = REDUCE;

  // Chips de portada → desplazamiento suave
  document.querySelectorAll("[data-goto]").forEach(b => {
    b.addEventListener("click", () => {
      const t = document.querySelector(b.dataset.goto);
      if (t) t.scrollIntoView({ behavior: REDUCE ? "auto" : "smooth" });
    });
  });

  // Botón Exportar PDF → diálogo de impresión con hoja de estilo de documento
  const pdfBtn = document.querySelector(".pdf-btn");
  if (pdfBtn) {
    pdfBtn.addEventListener("click", () => {
      // Asegura que las entradas animadas ya son visibles antes de imprimir
      document.querySelectorAll(".pre-in").forEach(el => el.classList.add("in"));
      window.print();
    });
  }

  // Índice para impresión (sólo visible en @media print)
  const tocList = document.getElementById("print-toc-list");
  if (tocList) {
    document.querySelectorAll("main section.band").forEach(sec => {
      const h2 = sec.querySelector("h2");
      const secNo = sec.querySelector(".sec-no");
      if (!h2) return;
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#" + sec.id;
      const prefix = secNo ? secNo.textContent.replace(/\s+/g, " ").trim() + " · " : "";
      a.textContent = prefix + h2.textContent;
      li.appendChild(a);
      tocList.appendChild(li);
    });
  }

  // §0 tira de métricas
  const ms = document.getElementById("ask-metrics");
  if (ms) {
    const A = window.RPT.ask, P = window.RPT.power;
    const items = [
      { v: A.weeks + " semanas", k: "Desde la firma provisional y el NTP, cerrando con una aceptación presenciada", t: "ENTREGA", val: "16 semanas desde NTP", s: "RoboMop New Era · agosto 2026" },
      { v: "MXN $" + A.bac.toLocaleString("en-US", { minimumFractionDigits: 2 }), k: "Forecast de hardware: base más contingencia Sponsor del 15%", t: "HARDWARE", val: "MXN $57,200.83", s: "RoboMop New Era · agosto 2026" },
      { v: "MXN $" + A.pmServices.toLocaleString("en-US"), k: "Servicios profesionales del Project Manager por el desarrollo completo", t: "PROJECT MANAGER", val: "MXN $160,000", s: "RoboMop New Era · agosto 2026" },
      { v: "MXN $" + A.seniorServices.toLocaleString("en-US"), k: "Servicios profesionales del Senior Engineer por el desarrollo completo", t: "SENIOR ENGINEER", val: "MXN $160,000", s: "RoboMop New Era · agosto 2026" },
      { v: "MXN $" + A.services.toLocaleString("en-US"), k: "Servicios profesionales totales de ambos roles", t: "SERVICIOS PROFESIONALES", val: "MXN $320,000", s: "RoboMop New Era · agosto 2026" },
      { v: "MXN $" + A.projectBudget.toLocaleString("en-US", { minimumFractionDigits: 2 }), k: "Presupuesto total planeado: hardware con contingencia más servicios", t: "PRESUPUESTO DEL PROYECTO", val: "MXN $377,200.83", s: "RoboMop New Era · agosto 2026" },
      { v: "≥4.0 h @200 W", k: "Aceptación mínima; el modelo de 960 Wh estima 4.8 h y 20% sobre 800 Wh", t: "AUTONOMÍA DE ACEPTACIÓN", val: "≥4.0 h", s: "RoboMop New Era · agosto 2026" },
    ];
    items.forEach(it => {
      const d = document.createElement("div");
      d.className = "m"; d.setAttribute("data-drill-keep", "");
      d.innerHTML = `<div class="v">${it.v}</div><div class="k">${it.k}</div>`;
      d.addEventListener("click", e => U.showDrill({ title: it.t, value: it.val, sub: it.k, source: it.s, x: e.clientX, y: e.clientY }));
      ms.appendChild(d);
    });
  }

  // Listas de congelación + fuera de alcance
  const fl = document.getElementById("freeze-list");
  if (fl) window.RPT.freeze.forEach((f, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<b>${i + 1}.</b> ${f}`;
    fl.appendChild(li);
  });
  const so = document.getElementById("scopeout-list");
  if (so) window.RPT.scopeOut.forEach(f => {
    const li = document.createElement("li");
    li.textContent = f;
    so.appendChild(li);
  });

  // Animaciones de entrada para marcos de gráficas + bloques de prosa
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll(".chart-frame, .quote-card, .term-mag, .sidecar figure").forEach(el => {
    if (REDUCE) { el.classList.add("in"); return; }
    el.classList.add("pre-in"); io.observe(el);
  });
})();
