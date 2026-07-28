// ═══ main.js · scroll engine, chips, metric strip, lists, entrances ═══
(function () {
  const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.REDUCE = REDUCE;

  // Cover chips → smooth scroll
  document.querySelectorAll("[data-goto]").forEach(b => {
    b.addEventListener("click", () => {
      const t = document.querySelector(b.dataset.goto);
      if (t) t.scrollIntoView({ behavior: REDUCE ? "auto" : "smooth" });
    });
  });

  // §0 metric strip
  const ms = document.getElementById("ask-metrics");
  if (ms) {
    const A = window.RPT.ask, P = window.RPT.power;
    const items = [
      { v: A.weeks + " weeks", k: "Delivery in sixteen weeks, ending in a witnessed acceptance test", t: "DELIVERY", val: "16 weeks", s: "RoboMop New Era · July 2026" },
      { v: "MXN $" + A.bac.toLocaleString("en-US", { minimumFractionDigits: 2 }), k: "All-in price: base estimate plus your 15% controlled contingency", t: "ALL-IN PRICE", val: "MXN $54,162.53", s: "RoboMop New Era · July 2026" },
      { v: "MXN $" + A.cap.toLocaleString("en-US"), k: "Spending ceiling — never crossed without your explicit approval", t: "SPENDING CEILING", val: "MXN $55,000", s: "RoboMop New Era · July 2026" },
      { v: "≥4.0 h @200 W", k: "Guaranteed acceptance runtime; the energy model estimates 4.8 h at 200 W", t: "ACCEPTANCE RUNTIME", val: "≥4.0 h", s: "RoboMop New Era · July 2026" },
    ];
    items.forEach(it => {
      const d = document.createElement("div");
      d.className = "m"; d.setAttribute("data-drill-keep", "");
      d.innerHTML = `<div class="v">${it.v}</div><div class="k">${it.k}</div>`;
      d.addEventListener("click", e => U.showDrill({ title: it.t, value: it.val, sub: it.k, source: it.s, x: e.clientX, y: e.clientY }));
      ms.appendChild(d);
    });
  }

  // Freeze + scope-out lists
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

  // Entrance animations for chart frames + prose blocks
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll(".chart-frame, .quote-card, .term-mag").forEach(el => {
    if (REDUCE) { el.classList.add("in"); return; }
    el.classList.add("pre-in"); io.observe(el);
  });
})();
