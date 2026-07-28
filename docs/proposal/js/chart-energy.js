// ═══ §4 · Energy allocation + runtime (200 W draw) · hot-swap plug-in animation ═══
// The runtime panel animates ONLY when scrolled into view (IO-gated), and can be replayed:
// pack 1 drains in → the swap socket appears → the spare pack slams in with an elastic dock
// and a contact flash → the total jumps past the 8 h shift line.
(function () {
  const host = document.getElementById("energy-chart");
  if (!host) return;
  const Pw = window.RPT.power;
  const body = U.frame(host, {
    title: "Battery capacity and estimated runtime",
    sub: "TOP = PACK ENERGY ALLOCATION AT A 200 W AVERAGE DRAW · BOTTOM = RUNTIME, ONE PACK THEN A HOT-SWAPPED SPARE · CLICK TO DRILL",
    src: "Energy model · RoboMop New Era engineering baseline, July 2026",
  });

  const W = 880, H = 430, mL = 150, mR = 90;
  const svg = d3.select(body).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%").style("height", "auto").style("display", "block");
  const P = U.PAL;
  const RED = window.REDUCE;

  // ── Panel 1: Wh allocation per full discharge at 200 W ──
  const xw = d3.scaleLinear().domain([0, Pw.packWh]).range([mL, W - mR]);
  const segs = [
    { k: "Compute electronics", v: Pw.computeWh, col: P.red, note: `${Pw.sbcW} W main computer + ${Pw.idleW} W control electronics — about ${Pw.computeSharePct}% of the draw` },
    { k: "Traction + cleaning", v: Pw.tractionWh, col: P.ink, note: `${Pw.tractionW} W average for drive motors and the cleaning head — the real workload` },
    { k: "Unused margin", v: Pw.marginWh, col: "#7d9bff", note: `+${Pw.marginWh} Wh headroom above the ${Pw.acceptH} h acceptance bar — a ${Pw.marginPct}% safety margin` },
  ];
  const barY = 56, barH = 44;
  svg.append("text").attr("x", 40).attr("y", 34).attr("font-size", 10).attr("letter-spacing", "0.14em")
    .attr("fill", P.inkLo).text(`PACK ALLOCATION · ${Pw.packSpec} · ${Pw.packWh} Wh · AT ${Pw.avgW} W AVERAGE`);
  const segEls = [];
  let cx0 = xw(0);
  segs.forEach((s, i) => {
    const w = xw(s.v) - xw(0);
    const r = svg.append("rect").attr("x", cx0).attr("y", barY).attr("height", barH)
      .attr("width", RED ? w : 0).attr("fill", s.col).attr("rx", i === 0 ? 3 : 0)
      .style("cursor", "pointer").attr("data-drill-keep", "");
    r.on("click", e => U.showDrill({ title: s.k.toUpperCase(), value: s.v + " Wh", sub: s.note, source: "RoboMop New Era · energy model, July 2026", x: e.clientX, y: e.clientY }));
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
    .attr("font-size", 10).attr("fill", P.inkLo).text(`${Pw.packWh} Wh total`);

  // ── Panel 2: runtime — pack 1, hot swap, pack 2 ──
  const xh = d3.scaleLinear().domain([0, 10]).range([mL, W - mR]);
  const rY = 240, rH = 44;
  const x1 = xh(Pw.runtimeH), x2 = xh(Pw.runtime2H), gap = 6;
  const w1 = x1 - xh(0) - gap, w2 = x2 - x1 - gap;
  svg.append("text").attr("x", 40).attr("y", 216).attr("font-size", 10).attr("letter-spacing", "0.14em")
    .attr("fill", P.inkLo).text("ESTIMATED RUNTIME AT 200 W AVERAGE · HOURS");
  svg.append("g").selectAll("line").data([0, 2, 4, 6, 8, 10]).join("line")
    .attr("x1", d => xh(d)).attr("x2", d => xh(d)).attr("y1", rY - 10).attr("y2", rY + rH + 10)
    .attr("stroke", "#eef1f6");
  svg.append("g").selectAll("text").data([0, 2, 4, 6, 8, 10]).join("text")
    .attr("x", d => xh(d)).attr("y", rY + rH + 28).attr("text-anchor", "middle")
    .attr("font-size", 10).attr("fill", P.inkLo).text(d => d + " h");

  // ghost slot — the empty socket waiting for the spare (dashed)
  const ghost = svg.append("rect").attr("x", x1 + gap).attr("y", rY).attr("width", w2).attr("height", rH)
    .attr("fill", "none").attr("stroke", "#7d9bff").attr("stroke-width", 1.4)
    .attr("stroke-dasharray", "4 4").attr("rx", 3).attr("opacity", 0);

  // pack 1 bar
  const rb1 = svg.append("rect").attr("x", xh(0)).attr("y", rY).attr("height", rH)
    .attr("width", RED ? w1 : 0).attr("fill", P.red).attr("rx", 3)
    .style("cursor", "pointer").attr("data-drill-keep", "");
  rb1.on("click", e => U.showDrill({ title: "PACK 1 · ESTIMATED RUNTIME", value: Pw.runtimeH + " h", sub: `${Pw.avgW} W average draw on the ${Pw.packWh} Wh pack — clears the ${Pw.acceptH} h acceptance bar with a ${Pw.marginPct}% margin`, source: "RoboMop New Era · energy model, July 2026", x: e.clientX, y: e.clientY }));
  const rl1 = svg.append("text").attr("x", x1 - gap - 8).attr("y", rY + rH / 2 + 4)
    .attr("text-anchor", "end").attr("font-size", 12).attr("font-weight", 700).attr("fill", "#fff")
    .attr("opacity", RED ? 1 : 0).text("Pack 1 · " + Pw.runtimeH + " h");

  // pack 2 (the spare) — inside a group so it can slide in from the right and dock
  const p2g = svg.append("g").attr("transform", RED ? "translate(0,0)" : "translate(90,0)");
  const rb2 = p2g.append("rect").attr("x", x1 + gap).attr("y", rY).attr("height", rH)
    .attr("width", w2).attr("fill", "#7d9bff").attr("rx", 3)
    .attr("opacity", RED ? 1 : 0)
    .style("cursor", "pointer").attr("data-drill-keep", "");
  rb2.on("click", e => U.showDrill({ title: "PACK 2 · HOT-SWAPPED SPARE", value: "+" + Pw.runtimeH + " h", sub: `A charged spare takes the shift estimate to ${Pw.runtime2H} h. The delivery baseline includes one pack — a second pack is flagged as an option in §2.`, source: "RoboMop New Era · energy model, July 2026", x: e.clientX, y: e.clientY }));
  const rl2 = svg.append("text").attr("x", x2 - 8).attr("y", rY + rH / 2 + 4)
    .attr("text-anchor", "end").attr("font-size", 12).attr("font-weight", 700).attr("fill", "#fff")
    .attr("opacity", RED ? 1 : 0).text("Pack 2 · +" + Pw.runtimeH + " h");

  // contact flash ring at the junction (created hidden, fired mid-slam)
  const flash = svg.append("circle").attr("cx", x1).attr("cy", rY + rH / 2)
    .attr("r", 6).attr("fill", "none").attr("stroke", P.red).attr("stroke-width", 3.5)
    .attr("opacity", 0);

  // hot-swap connector badge between the two bars
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
    .text(`≤${Pw.swapMin} min swap`);
  sg.on("click", e => U.showDrill({ title: "HOT SWAP", value: `≤${Pw.swapMin} min`, sub: "The old pack slides out and the spare slides in while the controls stay awake on the backup rail — no reboot, no re-mapping.", source: "RoboMop New Era · engineering baseline, July 2026", x: e.clientX, y: e.clientY }));

  // total label above the end of pack 2
  const rtot = svg.append("text").attr("x", x2 + 4).attr("y", rY - 34).attr("text-anchor", "end")
    .attr("font-size", 12).attr("font-weight", 700).attr("fill", P.redHi)
    .attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4)
    .attr("opacity", RED ? 1 : 0)
    .text(Pw.runtime2H + " h with one swap");

  // threshold: 4 h acceptance — PASS
  const t1 = svg.append("g").style("cursor", "pointer").attr("data-drill-keep", "");
  t1.append("line").attr("x1", xh(Pw.acceptH)).attr("x2", xh(Pw.acceptH)).attr("y1", rY - 26).attr("y2", rY + rH + 10)
    .attr("stroke", P.redHi).attr("stroke-width", 1.6).attr("stroke-dasharray", "6 4");
  t1.append("text").attr("x", xh(Pw.acceptH)).attr("y", rY - 34).attr("text-anchor", "middle")
    .attr("font-size", 10.5).attr("font-weight", 700).attr("fill", P.redHi)
    .attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4)
    .text(`≥${Pw.acceptH} h acceptance @200 W · PASS`);
  t1.on("click", e => U.showDrill({ title: "ACCEPTANCE CRITERION", value: `≥${Pw.acceptH} h @200 W · PASS`, sub: Pw.charterAcceptance + " — the estimate clears it with a " + Pw.marginPct + "% margin.", source: "RoboMop New Era · acceptance baseline, July 2026", x: e.clientX, y: e.clientY }));

  // marker: 8 h shift — covered by the swap
  const t2 = svg.append("g").style("cursor", "pointer").attr("data-drill-keep", "");
  t2.append("line").attr("x1", xh(8)).attr("x2", xh(8)).attr("y1", rY - 8).attr("y2", rY + rH + 10)
    .attr("stroke", P.inkMd).attr("stroke-width", 1.4).attr("stroke-dasharray", "2 3");
  const t2lab = t2.append("text").attr("x", xh(8)).attr("y", rY - 14).attr("text-anchor", "middle")
    .attr("font-size", 10).attr("fill", P.inkMd)
    .attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4)
    .attr("opacity", RED ? 1 : 0)
    .text("8 h shift · covered with one swap");
  t2.on("click", e => U.showDrill({ title: "FULL-SHIFT COVERAGE", value: Pw.runtime2H + " h est.", sub: "One pack covers the worst-case acceptance run; a charged spare takes the estimate past a full eight-hour shift — controls stay awake during the change.", source: "RoboMop New Era · engineering baseline, July 2026", x: e.clientX, y: e.clientY }));

  svg.append("text").attr("x", mL).attr("y", H - 52)
    .attr("font-size", 10).attr("fill", P.inkLo)
    .text("The 200 W figure is a sustained worst-case average — drive motors plus cleaning head at full load,");
  svg.append("text").attr("x", mL).attr("y", H - 34)
    .attr("font-size", 10).attr("fill", P.inkLo)
    .text("not an optimistic mix. Pack: LFP 8S2P 25.6 V · 40 Ah (1.024 kWh nominal, ≈847.9 Wh usable).");
  svg.append("text").attr("x", mL).attr("y", H - 16)
    .attr("font-size", 10).attr("fill", P.inkLo)
    .text("The delivery baseline includes one pack; the 9.6 h figure assumes one charged spare on the shelf.");

  // ── animation engine (IO-gated, replayable) ──
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
    // pack 1 drains in
    rb1.transition().delay(950).duration(750).ease(d3.easeCubicOut).attr("width", w1);
    rl1.transition().delay(1550).duration(250).attr("opacity", 1);
    // socket + ghost slot appear
    badge.transition().delay(1650).duration(380).ease(d3.easeBackOut.overshoot(3)).attr("r", 10);
    arrows.transition().delay(1800).duration(250).attr("opacity", 1);
    scap.transition().delay(1850).duration(250).attr("opacity", 1);
    ghost.attr("stroke-dashoffset", 0)
      .transition().delay(1750).duration(350).attr("opacity", 0.9);
    // the spare materializes off-dock…
    rb2.transition().delay(2200).duration(220).attr("opacity", 1);
    // …then plugs in with an elastic slam
    p2g.transition().delay(2450).duration(950)
      .ease(d3.easeElasticOut.amplitude(1.3).period(0.38))
      .attr("transform", "translate(0,0)");
    // contact flash at the junction, mid-slam
    flash.transition().delay(2900).duration(0).attr("r", 6).attr("opacity", 0.85)
      .transition().duration(560).ease(d3.easeCubicOut)
      .attr("r", 52).attr("opacity", 0);
    // socket swallows the ghost, badge clicks, readouts pop
    ghost.transition().delay(2950).duration(300).attr("opacity", 0);
    badge.transition().delay(3050).duration(160).attr("stroke-width", 4)
      .transition().duration(260).attr("stroke-width", 1.6);
    rl2.transition().delay(3150).duration(250).attr("opacity", 1);
    rtot.transition().delay(3300).duration(320).ease(d3.easeBackOut.overshoot(2))
      .attr("opacity", 1).attr("y", rY - 34);
    t2lab.transition().delay(3550).duration(300).attr("opacity", 1);
  }

  if (RED) {
    // static completed frame
    ghost.attr("opacity", 0);
  } else {
    // replay control (top-right of the runtime panel)
    const rp = svg.append("g").style("cursor", "pointer");
    rp.append("polygon").attr("points", `${W - 158},210 ${W - 158},220 ${W - 149},215`).attr("fill", U.PAL.inkLo);
    rp.append("text").attr("x", W - 144).attr("y", 219).attr("font-size", 9.5)
      .attr("letter-spacing", "0.14em").attr("fill", U.PAL.inkLo).text("REPLAY THE SWAP");
    rp.on("click", play);
    rp.on("mouseenter", () => rp.select("text").attr("fill", U.PAL.red));
    rp.on("mouseleave", () => rp.select("text").attr("fill", U.PAL.inkLo));
    // run when the chart scrolls into view (once)
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) { play(); io.disconnect(); }
    }), { threshold: 0.35 });
    io.observe(host);
  }
})();
