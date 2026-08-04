// ═══ §4 · Asignación de energía + autonomía de un acumulador (200 W) ═══
(function () {
  const host = document.getElementById("energy-chart");
  if (!host) return;
  const Pw = window.RPT.power;
  const SRC = "RoboMop New Era · modelo energético aprobado para planeación, agosto 2026";
  const body = U.frame(host, {
    title: "Capacidad operativa y autonomía estimada — un acumulador",
    sub: "960 WH OPERATIVOS · 200 W PROMEDIO · 4.8 H ESTIMADAS · ACEPTACIÓN ≥4.0 H",
    src: SRC,
  });
  body.classList.add("chart-viewport");

  const W = 880, H = 390, mL = 150, mR = 90;
  const svg = d3.select(body).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%").style("height", "auto").style("display", "block");
  const P = U.PAL;
  const RED = window.REDUCE;

  // Panel 1: asignación del presupuesto operativo de energía.
  const xw = d3.scaleLinear().domain([0, Pw.packWh]).range([mL, W - mR]);
  const segs = [
    { k: "Cómputo y control", v: Pw.computeWh, col: P.red, note: `${Pw.computeWh} Wh asignados al presupuesto de cómputo y control` },
    { k: "Tracción + limpieza", v: Pw.tractionWh, col: P.ink, note: `${Pw.tractionWh} Wh asignados a tracción y limpieza` },
    { k: "Reserva del modelo", v: Pw.marginWh, col: "#7d9bff", note: `${Pw.marginWh} Wh sobre los 800 Wh requeridos para cuatro horas: ${Pw.marginPct}%` },
  ];
  const barY = 58, barH = 44;
  svg.append("text").attr("x", 40).attr("y", 34).attr("font-size", 10).attr("letter-spacing", "0.14em")
    .attr("fill", P.inkLo).text(`PRESUPUESTO OPERATIVO · ${Pw.packSpec} · ${Pw.packWh} WH`);
  let cx = xw(0);
  const animated = [];
  segs.forEach((s, i) => {
    const w = xw(s.v) - xw(0);
    const r = svg.append("rect").attr("x", cx).attr("y", barY).attr("height", barH)
      .attr("width", RED ? w : 0).attr("fill", s.col).attr("rx", i === 0 ? 3 : 0)
      .style("cursor", "pointer").attr("data-drill-keep", "");
    r.on("click", e => U.showDrill({ title: s.k.toUpperCase(), value: s.v + " Wh", sub: s.note, source: SRC, x: e.clientX, y: e.clientY }));
    const pct = svg.append("text").attr("x", cx + w / 2).attr("y", barY + 27)
      .attr("text-anchor", "middle").attr("font-size", 12).attr("font-weight", 700).attr("fill", "#fff")
      .attr("opacity", RED ? 1 : 0).text(((s.v / Pw.packWh) * 100).toFixed(1).replace(/\.0$/, "") + "%");
    const lab = svg.append("text").attr("x", cx + w / 2).attr("y", barY + barH + 20)
      .attr("text-anchor", "middle").attr("font-size", 10.5).attr("fill", P.inkMd)
      .attr("opacity", RED ? 1 : 0).text(`${s.k} · ${s.v} Wh`);
    animated.push({ r, pct, lab, w, i }); cx += w;
  });

  // Panel 2: autonomía de la única batería incluida.
  const xh = d3.scaleLinear().domain([0, 6]).range([mL, W - mR]);
  const rY = 225, rH = 46;
  svg.append("text").attr("x", 40).attr("y", 200).attr("font-size", 10).attr("letter-spacing", "0.14em")
    .attr("fill", P.inkLo).text("AUTONOMÍA ESTIMADA DE UN ACUMULADOR · HORAS A 200 W PROMEDIO");
  svg.append("g").selectAll("line").data([0,1,2,3,4,5,6]).join("line")
    .attr("x1", d => xh(d)).attr("x2", d => xh(d)).attr("y1", rY - 10).attr("y2", rY + rH + 10).attr("stroke", "#eef1f6");
  svg.append("g").selectAll("text").data([0,1,2,3,4,5,6]).join("text")
    .attr("x", d => xh(d)).attr("y", rY + rH + 28).attr("text-anchor", "middle")
    .attr("font-size", 10).attr("fill", P.inkLo).text(d => d + " h");

  const wRuntime = xh(Pw.runtimeH) - xh(0);
  const runtime = svg.append("rect").attr("x", xh(0)).attr("y", rY).attr("height", rH)
    .attr("width", RED ? wRuntime : 0).attr("fill", P.red).attr("rx", 3)
    .style("cursor", "pointer").attr("data-drill-keep", "");
  runtime.on("click", e => U.showDrill({ title: "AUTONOMÍA ESTIMADA", value: Pw.runtimeH + " h", sub: `960 Wh / 200 W. La aceptación obligatoria es ≥${Pw.acceptH} h y requiere correlación física.`, source: SRC, x: e.clientX, y: e.clientY }));
  const runtimeLabel = svg.append("text").attr("x", xh(Pw.runtimeH) - 10).attr("y", rY + 29)
    .attr("text-anchor", "end").attr("font-size", 12).attr("font-weight", 700).attr("fill", "#fff")
    .attr("opacity", RED ? 1 : 0).text(`1 acumulador · ${Pw.runtimeH} h estimadas`);

  const threshold = svg.append("g").style("cursor", "pointer").attr("data-drill-keep", "");
  threshold.append("line").attr("x1", xh(Pw.acceptH)).attr("x2", xh(Pw.acceptH)).attr("y1", rY - 28).attr("y2", rY + rH + 10)
    .attr("stroke", P.redHi).attr("stroke-width", 1.6).attr("stroke-dasharray", "6 4");
  threshold.append("text").attr("x", xh(Pw.acceptH)).attr("y", rY - 35).attr("text-anchor", "middle")
    .attr("font-size", 10.5).attr("font-weight", 700).attr("fill", P.redHi)
    .attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4)
    .text(`aceptación ≥${Pw.acceptH} h @200 W`);

  svg.append("text").attr("x", mL).attr("y", H - 58).attr("font-size", 10).attr("fill", P.inkLo)
    .text("Modelo aprobado para planeación: 1.024 kWh nominales; 960 Wh operativos; 800 Wh requeridos; 160 Wh de reserva (20%).");
  svg.append("text").attr("x", mL).attr("y", H - 38).attr("font-size", 10).attr("fill", P.inkLo)
    .text(`Entrega incluida: un acumulador y un cargador. Cambio objetivo ≤${Pw.swapMin} min con controles activos.`);
  svg.append("text").attr("x", mL).attr("y", H - 18).attr("font-size", 10).attr("fill", P.inkLo)
    .text("La estimación no sustituye la validación interna ni la corrida FAT instrumentada.");

  if (!RED) {
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (!en.isIntersecting) return;
      animated.forEach(a => {
        a.r.transition().delay(120 + a.i * 150).duration(650).attr("width", a.w);
        a.pct.transition().delay(520 + a.i * 150).duration(250).attr("opacity", 1);
        a.lab.transition().delay(520 + a.i * 150).duration(250).attr("opacity", 1);
      });
      runtime.transition().delay(900).duration(850).ease(d3.easeCubicOut).attr("width", wRuntime);
      runtimeLabel.transition().delay(1500).duration(250).attr("opacity", 1);
      io.disconnect();
    }), { threshold: 0.35 });
    io.observe(host);
  }
})();
