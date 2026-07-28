// ═══ §7 · Risk ladder (P13) ═══
(function () {
  const host = document.getElementById("risk-chart");
  if (!host) return;
  const body = U.frame(host, {
    title: "Twelve priority risks, ranked",
    sub: "TEN-CELL SCORE = THREAT TO SCHEDULE AND ACCEPTANCE · CLICK A ROW FOR THE FULL REGISTER ENTRY",
    src: "Risk register · RoboMop New Era, July 2026",
  });

  const wrap = document.createElement("div");
  wrap.className = "risk-ladder";
  const head = document.createElement("div");
  head.className = "risk-row risk-head";
  head.innerHTML = `<span></span><span class="rh-id">ID</span><span>RISK · RESPONSE</span><span>THREAT SCORE</span><span>TRIGGER</span>`;
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
      title: r.id + " · PRIORITY RISK", value: r.lvl + "/10",
      sub: r.risk + " — response: " + r.response + " · trigger: " + r.trigger,
      source: "RoboMop New Era · engineering baseline, July 2026", x: e.clientX, y: e.clientY
    }));
    wrap.appendChild(row);
  });
  body.appendChild(wrap);

  const note = document.createElement("p");
  note.className = "chart-src";
  note.textContent = "Red risks (score ≥6) are reviewed weekly; R12 uncontrolled motion — any single event is a stop-work order.";
  body.appendChild(note);
})();
