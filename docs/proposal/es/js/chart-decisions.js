// ═══ §2 · Lista de materiales estimada (tabla única en MXN) + costo a volumen + financiamiento ═══
(function () {
  const SRC = "RoboMop New Era · base de ingeniería, julio 2026";
  const mxn = v => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const stES = { DEFINED: "DEFINIDA", ESTIMATE: "ESTIMADO" };

  // ── 1 · La lista de materiales estimada — una sola tabla ──
  const bh = document.getElementById("bom-chart");
  if (bh) {
    const body = U.frame(bh, {
      title: "Lista de materiales estimada",
      sub: "TODOS LOS PRECIOS EN MXN · DEFINIDA = PARTE EXACTA FIJADA CON PRECIO · ESTIMADO = GRUPO PRESUPUESTADO, PARTES CONGELADAS EN LA REVISIÓN DE DISEÑO DE LA SEMANA 2 · CLIC EN UNA FILA PARA DETALLE",
      src: SRC,
    });

    const tbl = document.createElement("table");
    tbl.className = "dt";
    tbl.innerHTML = `<thead><tr><th style="width:19%">Artículo</th><th>Especificación · qué le da</th><th style="width:7%; text-align:right">Cant.</th><th style="width:12%; text-align:right">Precio (MXN)</th><th style="width:10%">Estado</th></tr></thead>`;
    const tb = document.createElement("tbody");
    window.RPT.bomTable.forEach(d => {
      const tr = document.createElement("tr");
      if (d.status === "DEFINED") tr.className = "hl";
      tr.setAttribute("data-drill-keep", "");
      tr.innerHTML = `<td style="color:var(--ink-md)">${d.item}</td>
        <td><b>${d.spec}</b>${d.gives ? `<br><span style="color:var(--ink-md)">${d.gives}</span>` : ""}</td>
        <td class="num" style="text-align:right">${d.qty}</td>
        <td class="num" style="text-align:right"><b>${mxn(d.mxn)}</b></td>
        <td><span class="verdict ${d.status === "DEFINED" ? "v-rec" : "v-est"}">${stES[d.status]}</span></td>`;
      tr.addEventListener("click", e => U.showDrill({
        title: d.item.toUpperCase(), value: "MXN " + mxn(d.mxn),
        sub: (d.unit ? d.unit + " · " : "") + (d.gives || d.spec) + " · " + (d.mxn / window.RPT.ask.base * 100).toFixed(1) + "% de la estimación base de MXN " + mxn(window.RPT.ask.base) + ".",
        source: SRC, x: e.clientX, y: e.clientY
      }));
      tb.appendChild(tr);
    });
    const tot = document.createElement("tr");
    tot.className = "hl";
    tot.innerHTML = `<td><b>Estimación base · total</b></td>
      <td style="color:var(--ink-md)">${window.RPT.fxNote}</td>
      <td></td><td class="num" style="text-align:right"><b>${mxn(window.RPT.ask.base)}</b></td><td></td>`;
    tot.setAttribute("data-drill-keep", "");
    tot.addEventListener("click", e => U.showDrill({ title: "ESTIMACIÓN BASE", value: "MXN " + mxn(window.RPT.ask.base), sub: "Más una contingencia del 15% controlada por el Patrocinador: MXN $54,162.53 todo incluido, techo de MXN $55,000. 84.08% comprometible en las Semanas 1–2.", source: SRC, x: e.clientX, y: e.clientY }));
    tb.appendChild(tot);
    tbl.appendChild(tb);
    body.appendChild(tbl);
  }

  // ── 2 · Costo de electrónica a volumen + pasos de financiamiento ──
  const ch = document.getElementById("cost-chart");
  if (!ch) return;
  const body = U.frame(ch, {
    title: "Costo de la electrónica de cómputo por robot a tres volúmenes — y cómo se construye el financiamiento",
    sub: "BARRAS = ELECTRÓNICA DE CÓMPUTO POR ROBOT, MXN · EXCLUYE MOTORES, PAQUETE, LIDAR, CHASIS · LOS BLOQUES ABAJO CONSTRUYEN LA AUTORIZACIÓN",
    src: "Estimaciones de planeación a la tasa de MXN $18/USD · " + SRC,
  });

  const W = 880, H = 240, mL = 150, mR = 110, mT = 26, mB = 40;
  const svg = d3.select(body).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%").style("height", "auto").style("display", "block");
  const vols = [
    { k: "u1", label: "Unidad 1 · este robot", v: window.RPT.bomVolTotals.u1, note: "Construido sobre el kit de desarrollo — el camino más rápido a firmware real y resultados de mapeo en las primeras semanas" },
    { k: "u10", label: "10 unidades", v: window.RPT.bomVolTotals.u10, note: "Módulo de producción sobre el juego de dos tarjetas a la medida — la fase posterior que esta propuesta prepara" },
    { k: "u100", label: "100 unidades", v: window.RPT.bomVolTotals.u100, note: "Tarjetas panelizadas y precios de componentes por volumen — hacia donde ya apunta el diseño" },
  ];
  const x = d3.scaleLinear().domain([0, 13500]).range([mL, W - mR]);
  const bw = 34;
  const mxn0 = v => "$" + v.toLocaleString("en-US");
  svg.append("g").selectAll("line").data([0, 4000, 8000, 12000]).join("line")
    .attr("x1", d => x(d)).attr("x2", d => x(d)).attr("y1", mT - 8).attr("y2", H - mB)
    .attr("stroke", "#eef1f6");
  svg.append("g").selectAll("text").data([0, 4000, 8000, 12000]).join("text")
    .attr("x", d => x(d)).attr("y", H - mB + 18).attr("text-anchor", "middle")
    .attr("font-size", 10).attr("fill", "#8595a6").text(d => "$" + (d / 1000) + "k");
  vols.forEach((d, i) => {
    const y = mT + i * ((H - mT - mB) / 3) + 12;
    const w = x(d.v) - x(0);
    const bar = svg.append("rect")
      .attr("x", x(0)).attr("y", y).attr("height", bw)
      .attr("width", window.REDUCE ? w : 0)
      .attr("fill", i === 0 ? "#051c2c" : i === 1 ? "#2251ff" : "#7d9bff")
      .attr("rx", 2).style("cursor", "pointer").attr("data-drill-keep", "");
    if (!window.REDUCE) bar.transition().delay(200 + i * 130).duration(700).attr("width", w);
    bar.on("click", e => U.showDrill({ title: "COSTO DE ELECTRÓNICA · " + d.label.toUpperCase(), value: "MXN " + mxn(d.v), sub: d.note, source: "Estimación de planeación · RoboMop New Era, julio 2026", x: e.clientX, y: e.clientY }));
    svg.append("text").attr("x", mL - 12).attr("y", y + bw / 2 + 4).attr("text-anchor", "end")
      .attr("font-size", 11.5).attr("fill", "#42566a").text(d.label);
    const lab = svg.append("text").attr("y", y + bw / 2 + 4).attr("font-size", 12.5).attr("font-weight", 700)
      .attr("fill", i === 0 ? "#051c2c" : "#1233b8").attr("opacity", window.REDUCE ? 1 : 0)
      .text("MXN " + mxn0(d.v));
    lab.attr("x", x(d.v) + 8);
    if (!window.REDUCE) lab.transition().delay(750 + i * 130).duration(300).attr("opacity", 1);
  });

  // tabla de partidas (detalle de la electrónica de cómputo)
  const tbl = document.createElement("table");
  tbl.className = "dt"; tbl.style.marginTop = "18px";
  tbl.innerHTML = `<thead><tr><th>Partida</th><th>Base</th><th style="text-align:right">Unidad 1</th><th style="text-align:right">@10u</th><th style="text-align:right">@100u</th></tr></thead>`;
  const tb = document.createElement("tbody");
  window.RPT.bomVol.forEach(it => {
    const tr = document.createElement("tr");
    tr.setAttribute("data-drill-keep", "");
    tr.innerHTML = `<td>${it.item}</td><td style="color:var(--ink-md)">${it.basis}</td>
      <td class="num" style="text-align:right">${mxn0(it.u1)}</td><td class="num" style="text-align:right">${mxn0(it.u10)}</td><td class="num" style="text-align:right">${mxn0(it.u100)}</td>`;
    tr.addEventListener("click", e => U.showDrill({ title: it.item.toUpperCase(), value: "MXN " + mxn0(it.u1) + " @1u", sub: it.basis + ` · MXN ${mxn0(it.u10)} @10u · MXN ${mxn0(it.u100)} @100u · tasa de planeación MXN $18/USD`, source: "Estimación de planeación · RoboMop New Era, julio 2026", x: e.clientX, y: e.clientY }));
    tb.appendChild(tr);
  });
  const tot2 = document.createElement("tr");
  tot2.className = "hl";
  tot2.innerHTML = `<td><b>Total por robot</b></td><td></td><td class="num" style="text-align:right"><b>${mxn0(window.RPT.bomVolTotals.u1)}</b></td><td class="num" style="text-align:right"><b>${mxn0(window.RPT.bomVolTotals.u10)}</b></td><td class="num" style="text-align:right"><b>${mxn0(window.RPT.bomVolTotals.u100)}</b></td>`;
  tb.appendChild(tot2);
  tbl.appendChild(tb);
  body.appendChild(tbl);

  // bloques de pasos de financiamiento
  const A = window.RPT.ask;
  const steps = document.createElement("div");
  steps.className = "fund-steps";
  const S = [
    { t: "ESTIMACIÓN BASE", v: "MXN " + mxn(A.base), n: "Diecisiete líneas de BOM; 84.08% comprometible en las Semanas 1–2" },
    { t: "+ CONTINGENCIA 15%", v: "MXN " + mxn(A.contingency), n: "Controlada por el Patrocinador; financia solo riesgos materializados, nunca alcance opcional" },
    { t: "BAC · REQUERIMIENTO DE FINANCIAMIENTO", v: "MXN " + mxn(A.bac), n: "Base más contingencia — el monto que esta propuesta pide autorizar" },
    { t: "TECHO DE AUTORIZACIÓN", v: "MXN " + mxn(A.cap), n: "Techo firme; un EAC semanal por encima escala al Patrocinador" },
  ];
  S.forEach((s, i) => {
    const d = document.createElement("div");
    d.className = "fund-step" + (i === 2 ? " hot" : "");
    d.setAttribute("data-drill-keep", "");
    d.innerHTML = `<div class="fs-t">${s.t}</div><div class="fs-v">${s.v}</div><div class="fs-n">${s.n}</div>`;
    d.addEventListener("click", e => U.showDrill({ title: s.t, value: s.v, sub: s.n, source: SRC, x: e.clientX, y: e.clientY }));
    steps.appendChild(d);
    if (i < S.length - 1) {
      const ar = document.createElement("div");
      ar.className = "fund-arrow"; ar.textContent = "→";
      steps.appendChild(ar);
    }
  });
  body.appendChild(steps);
})();
