// ═══ §8 objectives · §9 team, change classes, KPIs ═══
(function () {
  // ── Objectives table ──
  const oh = document.getElementById("objectives-chart");
  if (oh) {
    const body = U.frame(oh, {
      title: "Ten delivery objectives",
      sub: "NUMERIC TOLERANCES FREEZE WITH YOU IN WEEK 1 · CLICK A ROW FOR THE CRITERION",
      src: "Acceptance commitments · RoboMop New Era, July 2026",
    });
    const tbl = document.createElement("table");
    tbl.className = "dt";
    tbl.innerHTML = `<thead><tr><th style="width:10%">ID</th><th style="width:38%">Objective</th><th>Success criterion</th></tr></thead>`;
    const tb = document.createElement("tbody");
    window.RPT.objectives.forEach(o => {
      const tr = document.createElement("tr");
      tr.setAttribute("data-drill-keep", "");
      tr.innerHTML = `<td class="num"><b>${o.id}</b></td><td>${o.obj}</td><td style="color:var(--ink-md)">${o.crit}</td>`;
      tr.addEventListener("click", e => U.showDrill({ title: o.id, value: o.obj, sub: "Success criterion: " + o.crit, source: "RoboMop New Era · engineering baseline, July 2026", x: e.clientX, y: e.clientY }));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    body.appendChild(tbl);
  }

  // ── Team (term-mag three columns) ──
  const th = document.getElementById("team-chart");
  if (th) {
    const body = U.frame(th, {
      title: "Project roles",
      sub: "HOVER FOR THE FULL MANDATE",
      src: "The team · RoboMop New Era, July 2026",
    });
    const mag = document.createElement("div");
    mag.className = "term-mag";
    const abbr = { "Sponsor": "SP", "Project Manager": "PM", "Senior Engineer": "SE" };
    window.RPT.team.forEach(t => {
      const a = document.createElement("article");
      a.className = "term"; a.tabIndex = 0;
      const gist = t.resp.split(";")[0].replace(/\.+$/, "") + ".";
      a.innerHTML = `<h3 class="t-abbr">${t.name}</h3>
        <p class="t-full">${t.role} · ${abbr[t.role]}</p>
        <p class="t-gist">${gist}</p>
        <div class="t-more"><p>${t.resp}</p></div>
        <p class="t-hint">Hover for the full mandate</p>`;
      mag.appendChild(a);
    });
    body.appendChild(mag);

    // change classes
    const tbl = document.createElement("table");
    tbl.className = "dt"; tbl.style.marginTop = "26px";
    tbl.innerHTML = `<thead><tr><th style="width:14%">Class</th><th>Condition</th><th style="width:22%">Approval</th></tr></thead>`;
    const tb = document.createElement("tbody");
    window.RPT.changeClasses.forEach(c => {
      const tr = document.createElement("tr");
      if (c.cls === "Class 3") tr.className = "hl";
      tr.setAttribute("data-drill-keep", "");
      tr.innerHTML = `<td><b>${c.cls}</b></td><td style="color:var(--ink-md)">${c.cond}</td><td>${c.appr}</td>`;
      tr.addEventListener("click", e => U.showDrill({ title: "CHANGE CONTROL · " + c.cls.toUpperCase(), value: c.appr, sub: c.cond + ". Architecture changes after W2 and new features after W12 are automatically Class 3.", source: "RoboMop New Era · engineering baseline, July 2026", x: e.clientX, y: e.clientY }));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    body.appendChild(tbl);
  }

  // ── KPI table ──
  const kh = document.getElementById("kpi-chart");
  if (kh) {
    const body = U.frame(kh, {
      title: "Weekly reported KPIs",
      sub: "STATUS PACKAGE EVERY FRIDAY · EAC ABOVE THE CEILING IS A RED LINE",
      src: "Weekly reporting metrics · RoboMop New Era, July 2026",
    });
    const tbl = document.createElement("table");
    tbl.className = "dt kpi";
    tbl.innerHTML = `<thead><tr><th>KPI</th><th>Green</th><th>Yellow</th><th>Red</th></tr></thead>`;
    const tb = document.createElement("tbody");
    window.RPT.kpis.forEach(k => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><b>${k.kpi}</b></td>
        <td class="num"><span class="dot dg"></span>${k.green}</td>
        <td class="num"><span class="dot dy"></span>${k.yellow}</td>
        <td class="num"><span class="dot dr"></span>${k.red}</td>`;
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    body.appendChild(tbl);
  }
})();
