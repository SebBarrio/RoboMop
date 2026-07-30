// ═══ §7 objetivos · §8 equipo, clases de cambio, KPIs ═══
(function () {
  const SRC = "RoboMop New Era · base de ingeniería, julio 2026";
  // ── Tabla de objetivos ──
  const oh = document.getElementById("objectives-chart");
  if (oh) {
    const body = U.frame(oh, {
      title: "Diez objetivos de entrega",
      sub: "LAS TOLERANCIAS NUMÉRICAS SE CONGELAN CON USTED EN LA SEMANA 1 · CLIC EN UNA FILA PARA EL CRITERIO",
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

  // ── Equipo (tres columnas term-mag) ──
  const th = document.getElementById("team-chart");
  if (th) {
    const body = U.frame(th, {
      title: "Roles del proyecto",
      sub: "PASE EL CURSOR PARA EL MANDATO COMPLETO",
      src: "El equipo · RoboMop New Era, julio 2026",
    });
    const mag = document.createElement("div");
    mag.className = "term-mag";
    const abbr = { "Patrocinador": "SP", "Gerente de Proyecto": "PM", "Ingeniero Senior": "SE" };
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
      tr.addEventListener("click", e => U.showDrill({ title: "CONTROL DE CAMBIOS · " + c.cls.toUpperCase(), value: c.appr, sub: c.cond + ". Los cambios de arquitectura después de S2 y las funciones nuevas después de S12 son automáticamente Clase 3.", source: SRC, x: e.clientX, y: e.clientY }));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    body.appendChild(tbl);
  }

  // ── Tabla de KPIs ──
  const kh = document.getElementById("kpi-chart");
  if (kh) {
    const body = U.frame(kh, {
      title: "KPIs reportados semanalmente",
      sub: "PAQUETE DE ESTADO CADA VIERNES · UN EAC SOBRE EL TECHO ES UNA LÍNEA ROJA",
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
