// ═══ §4 · Asignación de energía + autonomía (200 W) · animación de cambio en caliente ═══
// El panel de autonomía se anima SOLO al entrar en vista (IO) y se puede repetir:
// el paquete 1 entra → aparece el socket → el repuesto se conecta con un acoplamiento
// elástico y un destello de contacto → el total salta más allá de la línea de turno de 8 h.
(function () {
  const host = document.getElementById("energy-chart");
  if (!host) return;
  const Pw = window.RPT.power;
  const SRC = "RoboMop New Era · modelo energético, julio 2026";
  const body = U.frame(host, {
    title: "Capacidad de batería y autonomía estimada",
    sub: "ARRIBA = ASIGNACIÓN DE ENERGÍA DEL PAQUETE A UN CONSUMO PROMEDIO DE 200 W · ABAJO = AUTONOMÍA, UN PAQUETE Y LUEGO EL REPUESTO EN CALIENTE · CLIC PARA DETALLE",
    src: SRC,
  });
  body.classList.add("chart-viewport");

  const W = 880, H = 430, mL = 150, mR = 90;
  const svg = d3.select(body).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%").style("height", "auto").style("display", "block");
  const P = U.PAL;
  const RED = window.REDUCE;

  // ── Panel 1: asignación de Wh por descarga completa a 200 W ──
  const xw = d3.scaleLinear().domain([0, Pw.packWh]).range([mL, W - mR]);
  const segs = [
    { k: "Electrónica de cómputo", v: Pw.computeWh, col: P.red, note: `${Pw.sbcW} W de computadora principal + ${Pw.idleW} W de electrónica de control — cerca del ${Pw.computeSharePct}% del consumo` },
    { k: "Tracción + limpieza", v: Pw.tractionWh, col: P.ink, note: `${Pw.tractionW} W promedio para motores de tracción y el cabezal de limpieza — la carga de trabajo real` },
    { k: "Margen sin usar", v: Pw.marginWh, col: "#7d9bff", note: `+${Pw.marginWh} Wh de colchón sobre la barra de aceptación de ${Pw.acceptH} h — un margen de seguridad del ${Pw.marginPct}%` },
  ];
  const barY = 56, barH = 44;
  svg.append("text").attr("x", 40).attr("y", 34).attr("font-size", 10).attr("letter-spacing", "0.14em")
    .attr("fill", P.inkLo).text(`ASIGNACIÓN DEL PAQUETE · ${Pw.packSpec} · ${Pw.packWh} Wh · A ${Pw.avgW} W PROMEDIO`);
  const segEls = [];
  let cx0 = xw(0);
  segs.forEach((s, i) => {
    const w = xw(s.v) - xw(0);
    const r = svg.append("rect").attr("x", cx0).attr("y", barY).attr("height", barH)
      .attr("width", RED ? w : 0).attr("fill", s.col).attr("rx", i === 0 ? 3 : 0)
      .style("cursor", "pointer").attr("data-drill-keep", "");
    r.on("click", e => U.showDrill({ title: s.k.toUpperCase(), value: s.v + " Wh", sub: s.note, source: SRC, x: e.clientX, y: e.clientY }));
    const lab = svg.append("text").attr("x", cx0 + w / 2).attr("y", barY + barH + 20)
      .attr("text-anchor", "middle").attr("font-size", 11)
      .attr("fill", P.inkMd).attr("opacity", RED ? 1 : 0)
      .text(`${s.k} · ${s.v} Wh`);
    const pct = svg.append("text").attr("x", cx0 + w / 2).attr("y", barY + barH / 2 + 4).attr("text-anchor", "middle")
      .attr("font-size", 12).attr("font-weight", 700).attr("fill", "#fff")
      .attr("opacity", RED ? 1 : 0)
      .text(((s.v / Pw.packWh) * 100).toFixed(1).replace(/\.0$/, "") + "%");
    segEls.push({ r, w, lab, pct, i });
    cx0 += w;
  });
  svg.append("line").attr("x1", xw(0)).attr("x2", xw(Pw.packWh)).attr("y1", barY - 8).attr("y2", barY - 8)
    .attr("stroke", P.line);
  svg.append("text").attr("x", xw(Pw.packWh)).attr("y", barY - 14).attr("text-anchor", "end")
    .attr("font-size", 10).attr("fill", P.inkLo).text(`${Pw.packWh} Wh en total`);

  // ── Panel 2: autonomía — paquete 1, cambio en caliente, paquete 2 ──
  const xh = d3.scaleLinear().domain([0, 10]).range([mL, W - mR]);
  const rY = 240, rH = 44;
  const x1 = xh(Pw.runtimeH), x2 = xh(Pw.runtime2H), gap = 6;
  const w1 = x1 - xh(0) - gap, w2 = x2 - x1 - gap;
  svg.append("text").attr("x", 40).attr("y", 216).attr("font-size", 10).attr("letter-spacing", "0.14em")
    .attr("fill", P.inkLo).text("AUTONOMÍA ESTIMADA A 200 W PROMEDIO · HORAS");
  svg.append("g").selectAll("line").data([0, 2, 4, 6, 8, 10]).join("line")
    .attr("x1", d => xh(d)).attr("x2", d => xh(d)).attr("y1", rY - 10).attr("y2", rY + rH + 10)
    .attr("stroke", "#eef1f6");
  svg.append("g").selectAll("text").data([0, 2, 4, 6, 8, 10]).join("text")
    .attr("x", d => xh(d)).attr("y", rY + rH + 28).attr("text-anchor", "middle")
    .attr("font-size", 10).attr("fill", P.inkLo).text(d => d + " h");

  // ranura fantasma — el socket vacío esperando al repuesto (punteado)
  const ghost = svg.append("rect").attr("x", x1 + gap).attr("y", rY).attr("width", w2).attr("height", rH)
    .attr("fill", "none").attr("stroke", "#7d9bff").attr("stroke-width", 1.4)
    .attr("stroke-dasharray", "4 4").attr("rx", 3).attr("opacity", 0);

  // barra del paquete 1
  const rb1 = svg.append("rect").attr("x", xh(0)).attr("y", rY).attr("height", rH)
    .attr("width", RED ? w1 : 0).attr("fill", P.red).attr("rx", 3)
    .style("cursor", "pointer").attr("data-drill-keep", "");
  rb1.on("click", e => U.showDrill({ title: "PAQUETE 1 · AUTONOMÍA ESTIMADA", value: Pw.runtimeH + " h", sub: `Consumo promedio de ${Pw.avgW} W sobre el paquete de ${Pw.packWh} Wh — supera la barra de aceptación de ${Pw.acceptH} h con un margen del ${Pw.marginPct}%`, source: SRC, x: e.clientX, y: e.clientY }));
  const rl1 = svg.append("text").attr("x", x1 - gap - 8).attr("y", rY + rH / 2 + 4)
    .attr("text-anchor", "end").attr("font-size", 12).attr("font-weight", 700).attr("fill", "#fff")
    .attr("opacity", RED ? 1 : 0).text("Paquete 1 · " + Pw.runtimeH + " h");

  // paquete 2 (el repuesto) — dentro de un grupo para deslizarse desde la derecha y acoplarse
  const p2g = svg.append("g").attr("transform", RED ? "translate(0,0)" : "translate(90,0)");
  const rb2 = p2g.append("rect").attr("x", x1 + gap).attr("y", rY).attr("height", rH)
    .attr("width", w2).attr("fill", "#7d9bff").attr("rx", 3)
    .attr("opacity", RED ? 1 : 0)
    .style("cursor", "pointer").attr("data-drill-keep", "");
  rb2.on("click", e => U.showDrill({ title: "PAQUETE 2 · REPUESTO EN CALIENTE", value: "+" + Pw.runtimeH + " h", sub: `Un repuesto cargado lleva la estimación del turno a ${Pw.runtime2H} h. La entrega base incluye un paquete — un segundo paquete está señalado como opción en §2.`, source: SRC, x: e.clientX, y: e.clientY }));
  const rl2 = svg.append("text").attr("x", x2 - 8).attr("y", rY + rH / 2 + 4)
    .attr("text-anchor", "end").attr("font-size", 12).attr("font-weight", 700).attr("fill", "#fff")
    .attr("opacity", RED ? 1 : 0).text("Paquete 2 · +" + Pw.runtimeH + " h");

  // destello de contacto en la unión (creado oculto, se dispara a media conexión)
  const flash = svg.append("circle").attr("cx", x1).attr("cy", rY + rH / 2)
    .attr("r", 6).attr("fill", "none").attr("stroke", P.red).attr("stroke-width", 3.5)
    .attr("opacity", 0);

  // insignia del conector de cambio en caliente entre las dos barras
  const sg = svg.append("g").style("cursor", "pointer").attr("data-drill-keep", "");
  const badge = sg.append("circle").attr("cx", x1).attr("cy", rY + rH / 2)
    .attr("r", RED ? 10 : 0)
    .attr("fill", "#fff").attr("stroke", P.ink).attr("stroke-width", 1.6);
  const arrows = sg.append("g")
    .attr("opacity", RED ? 1 : 0)
    .attr("stroke", P.ink).attr("stroke-width", 1.4).attr("fill", P.ink);
  arrows.append("line").attr("x1", x1 - 6).attr("x2", x1 + 4).attr("y1", rY + rH / 2 - 3.5).attr("y2", rY + rH / 2 - 3.5);
  arrows.append("path").attr("d", `M ${x1 + 4} ${rY + rH / 2 - 6.2} L ${x1 + 7.5} ${rY + rH / 2 - 3.5} L ${x1 + 4} ${rY + rH / 2 - 0.8} Z`).attr("stroke", "none");
  arrows.append("line").attr("x1", x1 + 6).attr("x2", x1 - 4).attr("y1", rY + rH / 2 + 3.5).attr("y2", rY + rH / 2 + 3.5);
  arrows.append("path").attr("d", `M ${x1 - 4} ${rY + rH / 2 + 0.8} L ${x1 - 7.5} ${rY + rH / 2 + 3.5} L ${x1 - 4} ${rY + rH / 2 + 6.2} Z`).attr("stroke", "none");
  const scap = sg.append("text").attr("x", x1).attr("y", rY - 14).attr("text-anchor", "middle")
    .attr("font-size", 10).attr("fill", P.inkMd)
    .attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4)
    .attr("opacity", RED ? 1 : 0)
    .text(`cambio ≤${Pw.swapMin} min`);
  sg.on("click", e => U.showDrill({ title: "CAMBIO EN CALIENTE", value: `≤${Pw.swapMin} min`, sub: "El paquete agotado se desliza fuera y el repuesto entra mientras los controles siguen despiertos en el riel de respaldo — sin reinicio, sin remapeo.", source: "RoboMop New Era · base de ingeniería, julio 2026", x: e.clientX, y: e.clientY }));

  // etiqueta del total sobre el final del paquete 2
  const rtot = svg.append("text").attr("x", x2 + 4).attr("y", rY - 34).attr("text-anchor", "end")
    .attr("font-size", 12).attr("font-weight", 700).attr("fill", P.redHi)
    .attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4)
    .attr("opacity", RED ? 1 : 0)
    .text(Pw.runtime2H + " h con un cambio");

  // umbral: aceptación de 4 h — PASA
  const t1 = svg.append("g").style("cursor", "pointer").attr("data-drill-keep", "");
  t1.append("line").attr("x1", xh(Pw.acceptH)).attr("x2", xh(Pw.acceptH)).attr("y1", rY - 26).attr("y2", rY + rH + 10)
    .attr("stroke", P.redHi).attr("stroke-width", 1.6).attr("stroke-dasharray", "6 4");
  t1.append("text").attr("x", xh(Pw.acceptH)).attr("y", rY - 34).attr("text-anchor", "middle")
    .attr("font-size", 10.5).attr("font-weight", 700).attr("fill", P.redHi)
    .attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4)
    .text(`aceptación ≥${Pw.acceptH} h @200 W · PASA`);
  t1.on("click", e => U.showDrill({ title: "CRITERIO DE ACEPTACIÓN", value: `≥${Pw.acceptH} h @200 W · PASA`, sub: Pw.charterAcceptance + " — la estimación lo supera con un margen del " + Pw.marginPct + "%.", source: "RoboMop New Era · base de aceptación, julio 2026", x: e.clientX, y: e.clientY }));

  // marcador: turno de 8 h — cubierto por el cambio
  const t2 = svg.append("g").style("cursor", "pointer").attr("data-drill-keep", "");
  t2.append("line").attr("x1", xh(8)).attr("x2", xh(8)).attr("y1", rY - 8).attr("y2", rY + rH + 10)
    .attr("stroke", P.inkMd).attr("stroke-width", 1.4).attr("stroke-dasharray", "2 3");
  const t2lab = t2.append("text").attr("x", xh(8)).attr("y", rY - 14).attr("text-anchor", "middle")
    .attr("font-size", 10).attr("fill", P.inkMd)
    .attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4)
    .attr("opacity", RED ? 1 : 0)
    .text("turno de 8 h · cubierto con un cambio");
  t2.on("click", e => U.showDrill({ title: "COBERTURA DE TURNO COMPLETO", value: Pw.runtime2H + " h est.", sub: "Un paquete cubre la corrida de aceptación de peor caso; un repuesto cargado lleva la estimación más allá de un turno completo de ocho horas — los controles siguen despiertos durante el cambio.", source: "RoboMop New Era · base de ingeniería, julio 2026", x: e.clientX, y: e.clientY }));

  svg.append("text").attr("x", mL).attr("y", H - 52)
    .attr("font-size", 10).attr("fill", P.inkLo)
    .text("La cifra de 200 W es un promedio sostenido de peor caso: motores de tracción y cabezal de limpieza a plena carga,");
  svg.append("text").attr("x", mL).attr("y", H - 34)
    .attr("font-size", 10).attr("fill", P.inkLo)
    .text("no una mezcla optimista. Paquete LFP 8S2P: 25.6 V · 40 Ah (1.024 kWh nominales; 960 Wh para el modelo).");
  svg.append("text").attr("x", mL).attr("y", H - 16)
    .attr("font-size", 10).attr("fill", P.inkLo)
    .text("La entrega base incluye un paquete; la cifra de 9.6 h supone un repuesto cargado en el estante.");

  // ── motor de animación (disparado por IO, repetible) ──
  function reset() {
    svg.selectAll("*").interrupt();
    segEls.forEach(s => { s.r.attr("width", 0); s.lab.attr("opacity", 0); s.pct.attr("opacity", 0); });
    rb1.attr("width", 0); rl1.attr("opacity", 0);
    ghost.attr("opacity", 0);
    p2g.attr("transform", "translate(90,0)"); rb2.attr("opacity", 0); rl2.attr("opacity", 0);
    badge.attr("r", 0).attr("stroke-width", 1.6); arrows.attr("opacity", 0); scap.attr("opacity", 0);
    flash.attr("r", 6).attr("opacity", 0);
    rtot.attr("opacity", 0).attr("y", rY - 46);
    t2lab.attr("opacity", 0);
  }

  function play() {
    reset();
    // panel 1
    segEls.forEach(s => {
      s.r.transition().delay(150 + s.i * 160).duration(650).attr("width", s.w);
      s.lab.transition().delay(650 + s.i * 160).duration(300).attr("opacity", 1);
      s.pct.transition().delay(650 + s.i * 160).duration(300).attr("opacity", 1);
    });
    // el paquete 1 entra
    rb1.transition().delay(950).duration(750).ease(d3.easeCubicOut).attr("width", w1);
    rl1.transition().delay(1550).duration(250).attr("opacity", 1);
    // aparecen el socket y la ranura fantasma
    badge.transition().delay(1650).duration(380).ease(d3.easeBackOut.overshoot(3)).attr("r", 10);
    arrows.transition().delay(1800).duration(250).attr("opacity", 1);
    scap.transition().delay(1850).duration(250).attr("opacity", 1);
    ghost.transition().delay(1750).duration(350).attr("opacity", 0.9);
    // el repuesto se materializa fuera del socket…
    rb2.transition().delay(2200).duration(220).attr("opacity", 1);
    // …y se conecta con un golpe elástico
    p2g.transition().delay(2450).duration(950)
      .ease(d3.easeElasticOut.amplitude(1.3).period(0.38))
      .attr("transform", "translate(0,0)");
    // destello de contacto en la unión, a media conexión
    flash.transition().delay(2900).duration(0).attr("r", 6).attr("opacity", 0.85)
      .transition().duration(560).ease(d3.easeCubicOut)
      .attr("r", 52).attr("opacity", 0);
    // el socket traga la ranura, la insignia hace clic, las lecturas aparecen
    ghost.transition().delay(2950).duration(300).attr("opacity", 0);
    badge.transition().delay(3050).duration(160).attr("stroke-width", 4)
      .transition().duration(260).attr("stroke-width", 1.6);
    rl2.transition().delay(3150).duration(250).attr("opacity", 1);
    rtot.transition().delay(3300).duration(320).ease(d3.easeBackOut.overshoot(2))
      .attr("opacity", 1).attr("y", rY - 34);
    t2lab.transition().delay(3550).duration(300).attr("opacity", 1);
  }

  if (RED) {
    // marco final estático
    ghost.attr("opacity", 0);
  } else {
    // control de repetición (arriba a la derecha del panel de autonomía)
    const rp = svg.append("g").style("cursor", "pointer");
    rp.append("polygon").attr("points", `${W - 188},210 ${W - 188},220 ${W - 179},215`).attr("fill", U.PAL.inkLo);
    rp.append("text").attr("x", W - 174).attr("y", 219).attr("font-size", 9.5)
      .attr("letter-spacing", "0.14em").attr("fill", U.PAL.inkLo).text("REPETIR EL CAMBIO");
    rp.on("click", play);
    rp.on("mouseenter", () => rp.select("text").attr("fill", U.PAL.red));
    rp.on("mouseleave", () => rp.select("text").attr("fill", U.PAL.inkLo));
    // se ejecuta cuando la gráfica entra en vista (una vez)
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) { play(); io.disconnect(); }
    }), { threshold: 0.35 });
    io.observe(host);
  }
})();
