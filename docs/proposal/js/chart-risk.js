// ═══ §6 · Escalera de riesgos (P13) ═══
(function () {
  const host = document.getElementById("risk-chart");
  if (!host) return;
  const body = U.frame(host, {
    title: "Doce riesgos prioritarios, ordenados por puntaje",
    sub: "PUNTAJE SOBRE 10: AMENAZA PARA EL CALENDARIO Y LA ACEPTACIÓN",
    src: "Registro de riesgos · RoboMop New Era, julio 2026",
  });

  const wrap = document.createElement("div");
  wrap.className = "risk-ladder";
  const head = document.createElement("div");
  head.className = "risk-row risk-head";
  head.innerHTML = `<span></span><span class="rh-id">ID</span><span>RIESGO · RESPUESTA</span><span>PUNTAJE DE AMENAZA</span><span>DISPARADOR</span>`;
  wrap.appendChild(head);

  const risks = window.RPT.risks.slice().sort((a, b) => b.lvl - a.lvl);
  risks.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "risk-row";
    row.setAttribute("data-drill-keep", "");
    const cells = Array.from({ length: 10 }, (_, c) =>
      `<span class="sc${c < r.lvl ? (r.lvl >= 9 ? " on hot" : " on") : ""}"></span>`).join("");
    row.innerHTML = `
      <span class="rk">${i + 1}</span>
      <span class="rid">${r.id}</span>
      <span class="rmain"><b>${r.risk}</b><em>${r.response}</em></span>
      <span class="rscore"><span class="sc-wrap">${cells}</span><b class="sc-num">${r.lvl}/10</b></span>
      <span class="rtrig">${r.trigger}</span>`;
    row.addEventListener("click", e => U.showDrill({
      title: r.id + " · RIESGO PRIORITARIO", value: r.lvl + "/10",
      sub: r.risk + " — respuesta: " + r.response + " · disparador: " + r.trigger,
      source: "RoboMop New Era · base de ingeniería, julio 2026", x: e.clientX, y: e.clientY
    }));
    wrap.appendChild(row);
  });
  body.appendChild(wrap);

  const note = document.createElement("p");
  note.className = "chart-src";
  note.textContent = "Los riesgos con puntaje ≥ 6 se revisan semanalmente; R12, movimiento no controlado: cualquier evento exige detener los trabajos.";
  body.appendChild(note);
})();
