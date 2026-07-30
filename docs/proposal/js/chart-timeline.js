// ═══ §5 · Plan integrado de 16 semanas: bandas de fases, línea de congelación, placas de compuertas ═══
(function () {
  const host = document.getElementById("timeline-chart");
  if (!host) return;
  const SRC = "RoboMop New Era · base de ingeniería, julio 2026";
  const body = U.frame(host, {
    title: "Fases y compuertas de revisión a lo largo de 16 semanas",
    sub: "BANDAS = FASES (P1–P8) · PLACAS = COMPUERTAS G0–G6 · PUNTEADO = CONGELACIÓN DE FUNCIONES · CLIC EN CUALQUIER ELEMENTO PARA DETALLE",
    src: SRC,
  });
  body.classList.add("chart-viewport");

  const W = 880, H = 330, mL = 60, mR = 40;
  const svg = d3.select(body).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%").style("height", "auto").style("display", "block");
  const P = U.PAL;
  const x = d3.scaleLinear().domain([0, 16]).range([mL, W - mR]);

  // color de fase: temprano = escala tinta, verificación/aceptación = familia azul
  const bandCol = i => i < 4 ? ["#42566a", "#5b7186", "#74869a", "#42566a"][i % 4] : ["#2251ff", "#1233b8", "#2251ff", "#051c2c"][i % 4];
  const phases = window.RPT.phases.filter(p => p.name !== "Congelación de funciones");
  const bandY = 150, bandH = 56;

  // retícula de semanas
  svg.append("g").selectAll("line").data(d3.range(0, 17)).join("line")
    .attr("x1", d => x(d)).attr("x2", d => x(d)).attr("y1", 96).attr("y2", bandY + bandH + 8)
    .attr("stroke", "#eef1f6");
  svg.append("g").selectAll("text").data(d3.range(0, 17)).join("text")
    .attr("x", d => x(d)).attr("y", bandY + bandH + 26).attr("text-anchor", "middle")
    .attr("font-size", 9).attr("fill", P.inkLo).text(d => "S" + d);

  // bandas de fases
  phases.forEach((p, i) => {
    const x0 = x(p.w0 - 1 < 0 ? 0 : p.w0 - 1), x1 = x(p.w1);
    const w = Math.max(x1 - x0, 6);
    const r = svg.append("rect").attr("x", x0).attr("y", bandY).attr("height", bandH)
      .attr("width", window.REDUCE ? w : 0).attr("fill", bandCol(i)).attr("rx", 3)
      .attr("opacity", 0.92).style("cursor", "pointer").attr("data-drill-keep", "");
    if (!window.REDUCE) r.transition().delay(250 + i * 100).duration(500).attr("width", w);
    r.on("click", e => U.showDrill({
      title: `P${i + 1} · ${p.name.toUpperCase()}`, value: p.w0 === p.w1 ? `Semana ${p.w0}` : `Semanas ${p.w0}–${p.w1}`,
      sub: "Resultado de salida: " + p.out, source: SRC, x: e.clientX, y: e.clientY
    }));
    const lab = svg.append("text").attr("x", x0 + w / 2).attr("y", bandY + bandH / 2 + 4)
      .attr("text-anchor", "middle").attr("font-size", 11).attr("font-weight", 700).attr("fill", "#fff")
      .attr("opacity", window.REDUCE ? 1 : 0).text("P" + (i + 1));
    if (!window.REDUCE) lab.transition().delay(600 + i * 100).duration(250).attr("opacity", 1);
  });

  // línea de congelación de funciones en S12
  const fz = svg.append("g").style("cursor", "pointer").attr("data-drill-keep", "");
  fz.append("line").attr("x1", x(12)).attr("x2", x(12)).attr("y1", bandY - 34).attr("y2", bandY + bandH + 8)
    .attr("stroke", P.red).attr("stroke-width", 1.8).attr("stroke-dasharray", "7 4");
  fz.append("text").attr("x", x(12)).attr("y", bandY - 42).attr("text-anchor", "middle")
    .attr("font-size", 10).attr("font-weight", 700).attr("fill", P.red)
    .attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4)
    .text("CONGELACIÓN DE FUNCIONES · S12");
  fz.on("click", e => U.showDrill({ title: "CONGELACIÓN DE FUNCIONES", value: "Fin de la Semana 12", sub: "Sin alcance nuevo después de esta línea; toda función nueva es automáticamente un cambio Clase 3 (Patrocinador).", source: SRC, x: e.clientX, y: e.clientY }));

  // placas de compuertas (escalonadas)
  const gates = window.RPT.gates;
  const gy = [30, 58, 30, 58, 30, 58, 30];
  gates.forEach((g, i) => {
    const gx = x(g.week);
    const y = gy[i % gy.length];
    const gg = svg.append("g").style("cursor", "pointer").attr("data-drill-keep", "")
      .attr("opacity", window.REDUCE ? 1 : 0);
    gg.append("line").attr("x1", gx).attr("x2", gx).attr("y1", y + 16).attr("y2", bandY - 6)
      .attr("stroke", P.inkLo).attr("stroke-width", 1);
    gg.append("circle").attr("cx", gx).attr("cy", bandY - 6).attr("r", 2.6).attr("fill", P.ink);
    const label = g.id;
    const wTxt = label.length * 6.3 + 14;
    gg.append("rect").attr("x", gx - wTxt / 2).attr("y", y - 8).attr("width", wTxt).attr("height", 24)
      .attr("rx", 3).attr("fill", "#fff").attr("stroke", i === 6 ? P.red : P.ink).attr("stroke-width", 1.2);
    gg.append("text").attr("x", gx).attr("y", y + 8).attr("text-anchor", "middle")
      .attr("font-size", 10).attr("font-weight", 700).attr("fill", i === 6 ? P.red : P.ink).text(label);
    gg.on("click", e => U.showDrill({ title: "COMPUERTA " + g.id, value: g.week === 0 ? "Inicio del programa" : "Fin de la Semana " + g.week, sub: g.name + " — criterio: " + g.crit, source: SRC, x: e.clientX, y: e.clientY }));
    if (!window.REDUCE) gg.transition().delay(400 + i * 90).duration(350).attr("opacity", 1);
  });

  svg.append("text").attr("x", mL).attr("y", H - 34).attr("font-size", 10).attr("fill", P.inkLo)
    .text("Ruta crítica: aprobación → requisitos → diseño → tarjetas y entregas largas → arranque → potencia y tracción seguras →");
  svg.append("text").attr("x", mL).attr("y", H - 16).attr("font-size", 10).attr("fill", P.inkLo)
    .text("localización → integración → verificación → regresión → FAT. Un desliz >3 días dispara un plan de recuperación.");

  // tabla leyenda (misma numeración de bandas que la gráfica: P1–P8, congelación como fila marcador)
  const tbl = document.createElement("table");
  tbl.className = "dt"; tbl.style.marginTop = "14px";
  tbl.innerHTML = `<thead><tr><th style="width:8%">Banda</th><th style="width:34%">Fase</th><th style="width:12%">Semanas</th><th>Resultado de salida</th></tr></thead>`;
  const tb = document.createElement("tbody");
  phases.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="num">P${i + 1}</td><td>${p.name}</td>
      <td class="num">${p.w0 === p.w1 ? "S" + p.w0 : "S" + p.w0 + "–S" + p.w1}</td><td style="color:var(--ink-md)">${p.out}</td>`;
    tb.appendChild(tr);
    if (p.name === "Integración incremental") {
      const fz = document.createElement("tr");
      fz.className = "hl";
      fz.innerHTML = `<td class="num">—</td><td>Congelación de funciones (marcador)</td><td class="num">S12</td><td style="color:var(--ink-md)">Sin alcance nuevo; sistema completo configurado</td>`;
      tb.appendChild(fz);
    }
  });
  tbl.appendChild(tb);
  body.appendChild(tbl);
})();
