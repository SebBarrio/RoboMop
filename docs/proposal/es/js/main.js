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

  // §0 tira de métricas
  const ms = document.getElementById("ask-metrics");
  if (ms) {
    const A = window.RPT.ask, P = window.RPT.power;
    const items = [
      { v: A.weeks + " semanas", k: "Entrega en dieciséis semanas, cerrando con una prueba de aceptación presenciada", t: "ENTREGA", val: "16 semanas", s: "RoboMop New Era · julio 2026" },
      { v: "MXN $" + A.bac.toLocaleString("en-US", { minimumFractionDigits: 2 }), k: "Precio total: estimación base más su contingencia controlada del 15%", t: "PRECIO TOTAL", val: "MXN $54,162.53", s: "RoboMop New Era · julio 2026" },
      { v: "MXN $" + A.cap.toLocaleString("en-US"), k: "Techo de gasto — nunca se cruza sin su aprobación explícita", t: "TECHO DE GASTO", val: "MXN $55,000", s: "RoboMop New Era · julio 2026" },
      { v: "≥4.0 h @200 W", k: "Autonomía de aceptación garantizada; el modelo energético estima 4.8 h a 200 W", t: "AUTONOMÍA DE ACEPTACIÓN", val: "≥4.0 h", s: "RoboMop New Era · julio 2026" },
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
  document.querySelectorAll(".chart-frame, .quote-card, .term-mag").forEach(el => {
    if (REDUCE) { el.classList.add("in"); return; }
    el.classList.add("pre-in"); io.observe(el);
  });
})();
