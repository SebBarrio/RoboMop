// ═══ §7 objetivos · §8 equipo, clases de cambio, KPIs ═══
(function () {
  const SRC = "RoboMop New Era · base de ingeniería, julio 2026";
  // ── Tabla de objetivos ──
  const oh = document.getElementById("objectives-chart");
  if (oh) {
    const body = U.frame(oh, {
      title: "Diez objetivos verificables de la entrega",
      sub: "LA MATRIZ INICIAL SE RATIFICA EN SEMANA 1 · CAMBIOS MATERIALES REQUIEREN CLASE 3",
      src: "Compromisos de aceptación · RoboMop New Era, julio 2026",
    });
    const tbl = document.createElement("table");
    tbl.className = "dt";
    tbl.innerHTML = `<thead><tr><th style="width:10%">ID</th><th style="width:38%">Objetivo</th><th>Criterio de éxito</th></tr></thead>`;
    const tb = document.createElement("tbody");
    window.RPT.objectives.forEach(o => {
      const tr = document.createElement("tr");
      tr.setAttribute("data-drill-keep", "");
      tr.innerHTML = `<td class="num"><b>${o.id}</b></td><td>${o.obj}</td><td style="color:var(--ink-md)">${o.crit}</td>`;
      tr.addEventListener("click", e => U.showDrill({ title: o.id, value: o.obj, sub: "Criterio de éxito: " + o.crit, source: SRC, x: e.clientX, y: e.clientY }));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    body.appendChild(tbl);
  }

  // ── Matriz provisional de aceptación ──
  const ah = document.getElementById("acceptance-chart");
  if (ah) {
    const body = U.frame(ah, {
      title: "Matriz inicial de aceptación y evidencia",
      sub: "VALORES PROPUESTOS PARA RATIFICACIÓN EN SRR · TODO CAMBIO MATERIAL ES CLASE 3",
      src: "Charter v1.1 · RoboMop New Era, agosto 2026",
    });
    const viewport = document.createElement("div");
    viewport.className = "table-scroll";
    const tbl = document.createElement("table");
    tbl.className = "dt acceptance-table";
    tbl.innerHTML = `<thead><tr><th>ID</th><th>Requisito</th><th>Umbral</th><th>Evidencia</th><th>Repetición</th><th>Waiver</th></tr></thead>`;
    const tb = document.createElement("tbody");
    window.RPT.acceptanceMatrix.forEach(a => {
      const tr = document.createElement("tr");
      tr.setAttribute("data-drill-keep", "");
      tr.innerHTML = `<td class="num"><b>${a.id}</b></td><td>${a.req}</td><td>${a.target}</td><td>${a.evidence}</td><td class="num">${a.rep}</td><td>${a.waiver}</td>`;
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); viewport.appendChild(tbl); body.appendChild(viewport);
  }

  // ── Severidad y reglas de liberación ──
  const dh = document.getElementById("defect-chart");
  if (dh) {
    const body = U.frame(dh, {
      title: "Defectos, waiver y liberación",
      sub: "LA ACEPTACIÓN COMERCIAL NO DISPENSA SEGURIDAD",
      src: "Charter v1.1 · RoboMop New Era, agosto 2026",
    });
    const tbl = document.createElement("table");
    tbl.className = "dt";
    tbl.innerHTML = `<thead><tr><th>Clase</th><th>Significado</th><th>Regla</th></tr></thead>`;
    const tb = document.createElement("tbody");
    window.RPT.defectClasses.forEach(d => {
      const tr = document.createElement("tr");
      if (d.cls === "P0") tr.className = "hl";
      tr.innerHTML = `<td class="num"><b>${d.cls}</b></td><td>${d.meaning}</td><td>${d.rule}</td>`;
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); body.appendChild(tbl);
  }

  // ── Equipo (tres columnas term-mag) ──
  const th = document.getElementById("team-chart");
  if (th) {
    const body = U.frame(th, {
      title: "Responsabilidades del equipo",
      sub: "MANDATOS Y RESPONSABILIDADES DEL EQUIPO",
      src: "El equipo · RoboMop New Era, julio 2026",
    });
    const mag = document.createElement("div");
    mag.className = "term-mag";
    const abbr = { "Patrocinador": "SP", "Project Manager": "PM", "Lead Robotics & Systems Engineer": "LRSE" };
    window.RPT.team.forEach(t => {
      const a = document.createElement("article");
      a.className = "term"; a.tabIndex = 0;
      const gist = t.resp.split(";")[0].replace(/\.+$/, "") + ".";
      a.innerHTML = `<h3 class="t-abbr">${t.name}</h3>
        <p class="t-full">${t.role} · ${abbr[t.role]}</p>
        <p class="t-gist">${gist}</p>
        <div class="t-more"><p>${t.resp}</p></div>
        <p class="t-hint">Pase el cursor para el mandato completo</p>`;
      mag.appendChild(a);
    });
    body.appendChild(mag);

    // clases de cambio
    const tbl = document.createElement("table");
    tbl.className = "dt"; tbl.style.marginTop = "26px";
    tbl.innerHTML = `<thead><tr><th style="width:14%">Clase</th><th>Condición</th><th style="width:22%">Aprobación</th></tr></thead>`;
    const tb = document.createElement("tbody");
    window.RPT.changeClasses.forEach(c => {
      const tr = document.createElement("tr");
      if (c.cls === "Clase 3") tr.className = "hl";
      tr.setAttribute("data-drill-keep", "");
      tr.innerHTML = `<td><b>${c.cls}</b></td><td style="color:var(--ink-md)">${c.cond}</td><td>${c.appr}</td>`;
      tr.addEventListener("click", e => U.showDrill({ title: "CONTROL DE CAMBIOS · " + c.cls.toUpperCase(), value: c.appr, sub: c.cond + ". Siempre aplica la clase más alta activada; arquitectura después de S2 y funciones nuevas después de S12 son Clase 3.", source: SRC, x: e.clientX, y: e.clientY }));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    body.appendChild(tbl);
  }

  // ── Tabla de KPIs ──
  const kh = document.getElementById("kpi-chart");
  if (kh) {
    const body = U.frame(kh, {
      title: "Indicadores clave reportados semanalmente",
      sub: "INFORME DE ESTADO CADA VIERNES · UN EAC POR ENCIMA DEL TECHO ACTIVA UNA ALERTA ROJA",
      src: "Métricas de reporte semanal · RoboMop New Era, julio 2026",
    });
    const tbl = document.createElement("table");
    tbl.className = "dt kpi";
    tbl.innerHTML = `<thead><tr><th>KPI</th><th>Verde</th><th>Amarillo</th><th>Rojo</th></tr></thead>`;
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
