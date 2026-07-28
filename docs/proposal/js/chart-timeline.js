// ═══ §6 · 16-week integrated plan: phase bands, freeze line, gate plaques ═══
(function () {
  const host = document.getElementById("timeline-chart");
  if (!host) return;
  const body = U.frame(host, {
    title: "Phases and review gates over 16 weeks",
    sub: "BANDS = PHASES (P1–P8) · PLAQUES = GATES G0–G6 · DASHED = FEATURE FREEZE · CLICK ANY ELEMENT TO DRILL",
    src: "Delivery plan · RoboMop New Era, July 2026",
  });

  const W = 880, H = 330, mL = 60, mR = 40;
  const svg = d3.select(body).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%").style("height", "auto").style("display", "block");
  const P = U.PAL;
  const x = d3.scaleLinear().domain([0, 16]).range([mL, W - mR]);

  // phase color: early = ink scale, verification/acceptance = blue family
  const bandCol = i => i < 4 ? ["#42566a", "#5b7186", "#74869a", "#42566a"][i % 4] : ["#2251ff", "#1233b8", "#2251ff", "#051c2c"][i % 4];
  const phases = window.RPT.phases.filter(p => p.name !== "Feature freeze");
  const bandY = 150, bandH = 56;

  // week grid
  svg.append("g").selectAll("line").data(d3.range(0, 17)).join("line")
    .attr("x1", d => x(d)).attr("x2", d => x(d)).attr("y1", 96).attr("y2", bandY + bandH + 8)
    .attr("stroke", "#eef1f6");
  svg.append("g").selectAll("text").data(d3.range(0, 17)).join("text")
    .attr("x", d => x(d)).attr("y", bandY + bandH + 26).attr("text-anchor", "middle")
    .attr("font-size", 9).attr("fill", P.inkLo).text(d => "W" + d);

  // phase bands
  phases.forEach((p, i) => {
    const x0 = x(p.w0 - 1 < 0 ? 0 : p.w0 - 1), x1 = x(p.w1);
    const w = Math.max(x1 - x0, 6);
    const r = svg.append("rect").attr("x", x0).attr("y", bandY).attr("height", bandH)
      .attr("width", window.REDUCE ? w : 0).attr("fill", bandCol(i)).attr("rx", 3)
      .attr("opacity", 0.92).style("cursor", "pointer").attr("data-drill-keep", "");
    if (!window.REDUCE) r.transition().delay(250 + i * 100).duration(500).attr("width", w);
    r.on("click", e => U.showDrill({
      title: `P${i + 1} · ${p.name.toUpperCase()}`, value: p.w0 === p.w1 ? `Week ${p.w0}` : `Weeks ${p.w0}–${p.w1}`,
      sub: "Exit result: " + p.out, source: "RoboMop New Era · engineering baseline, July 2026", x: e.clientX, y: e.clientY
    }));
    const lab = svg.append("text").attr("x", x0 + w / 2).attr("y", bandY + bandH / 2 + 4)
      .attr("text-anchor", "middle").attr("font-size", 11).attr("font-weight", 700).attr("fill", "#fff")
      .attr("opacity", window.REDUCE ? 1 : 0).text("P" + (i + 1));
    if (!window.REDUCE) lab.transition().delay(600 + i * 100).duration(250).attr("opacity", 1);
  });

  // feature freeze line at W12
  const fz = svg.append("g").style("cursor", "pointer").attr("data-drill-keep", "");
  fz.append("line").attr("x1", x(12)).attr("x2", x(12)).attr("y1", bandY - 34).attr("y2", bandY + bandH + 8)
    .attr("stroke", P.red).attr("stroke-width", 1.8).attr("stroke-dasharray", "7 4");
  fz.append("text").attr("x", x(12)).attr("y", bandY - 42).attr("text-anchor", "middle")
    .attr("font-size", 10).attr("font-weight", 700).attr("fill", P.red)
    .attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4)
    .text("FEATURE FREEZE · W12");
  fz.on("click", e => U.showDrill({ title: "FEATURE FREEZE", value: "End of Week 12", sub: "No new scope after this line; every new feature is automatically a Class 3 change (Sponsor).", source: "RoboMop New Era · engineering baseline, July 2026", x: e.clientX, y: e.clientY }));

  // gate plaques (staggered)
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
    gg.on("click", e => U.showDrill({ title: "GATE " + g.id, value: g.week === 0 ? "Program start" : "End of Week " + g.week, sub: g.name + " — criterion: " + g.crit, source: "RoboMop New Era · engineering baseline, July 2026", x: e.clientX, y: e.clientY }));
    if (!window.REDUCE) gg.transition().delay(400 + i * 90).duration(350).attr("opacity", 1);
  });

  svg.append("text").attr("x", mL).attr("y", H - 34).attr("font-size", 10).attr("fill", P.inkLo)
    .text("Critical path: approval → requirements → design → boards & long-leads → bring-up → safe power & drivetrain →");
  svg.append("text").attr("x", mL).attr("y", H - 16).attr("font-size", 10).attr("fill", P.inkLo)
    .text("localization → integration → verification → regression → FAT. Slip >3 days triggers a recovery plan.");

  // legend table (same band numbering as the chart: P1–P8, freeze shown as a marker row)
  const tbl = document.createElement("table");
  tbl.className = "dt"; tbl.style.marginTop = "14px";
  tbl.innerHTML = `<thead><tr><th style="width:8%">Band</th><th style="width:34%">Phase</th><th style="width:12%">Weeks</th><th>Exit result</th></tr></thead>`;
  const tb = document.createElement("tbody");
  phases.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="num">P${i + 1}</td><td>${p.name}</td>
      <td class="num">${p.w0 === p.w1 ? "W" + p.w0 : "W" + p.w0 + "–W" + p.w1}</td><td style="color:var(--ink-md)">${p.out}</td>`;
    tb.appendChild(tr);
    if (p.name === "Incremental integration") {
      const fz = document.createElement("tr");
      fz.className = "hl";
      fz.innerHTML = `<td class="num">—</td><td>Feature freeze (marker)</td><td class="num">W12</td><td style="color:var(--ink-md)">No new scope; complete system configured</td>`;
      tb.appendChild(fz);
    }
  });
  tbl.appendChild(tb);
  body.appendChild(tbl);
})();
