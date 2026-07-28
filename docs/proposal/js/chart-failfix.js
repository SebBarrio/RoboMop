// ═══ §1 · 2025 weakness → RoboMop New Era feature ═══
(function () {
  const host = document.getElementById("failfix-chart");
  if (!host) return;
  const body = U.frame(host, {
    title: "2025 prototype vs. RoboMop New Era",
    sub: "CLICK A ROW FOR THE ENGINEERING BEHIND EACH IMPROVEMENT",
    src: "RoboMop New Era engineering baseline, July 2026",
  });

  const rows = [
    {
      was: "Motors could run away and overheat the drive electronics",
      is: "A hardware safety loop that cuts motor power even if every computer on board crashes",
      how: "The motor loop runs on a dedicated real-time controller with a hardware watchdog; fault inputs kill drive power in silicon — no software path can override the stop."
    },
    {
      was: "Lost wheel-sensor ticks, so position estimates wandered",
      is: "Odometry that cannot drop a tick, at any workload",
      how: "Quadrature pulses are counted by dedicated PCNT hardware peripherals — silicon, not software — so SLAM load spikes can't cost a single encoder edge."
    },
    {
      was: "Sensors disagreed about the time; every map slowly drifted",
      is: "One clock for every sensor — maps that stay put, shift after shift",
      how: "The controller timestamps odometry and IMU data at the instant of capture and syncs its clock to the main computer, so sensor fusion runs against a single timebase."
    },
    {
      was: "One overloaded computer ran everything — and starved the motors",
      is: "Two dedicated brains: one thinks, one drives — neither can starve the other",
      how: "Mapping, planning and networking live on the AI computer; motor control lives on the real-time controller. Heavy AI workloads can no longer touch loop timing."
    },
    {
      was: "About 25–30 minutes of cleaning per charge",
      is: "≈4.8 hours at a 200-watt draw — and a five-minute swap for all-day work",
      how: "The pack is sized by an energy model at a sustained 200-watt average draw; the 4-hour acceptance bar passes with a 20% margin before a single cell is ordered."
    },
    {
      was: "Irrigation was promised but never actually integrated",
      is: "Water delivery wired in from day one — dosing, level and leak sensing",
      how: "Pump, valve, water-level and flow sensors are first-class nodes on the supervised controller, with a CAN bus reserved for future accessories."
    },
  ];

  const tbl = document.createElement("table");
  tbl.className = "dt failfix";
  tbl.innerHTML = `<thead><tr><th style="width:38%">The 2025 prototype</th><th>RoboMop New Era</th></tr></thead>`;
  const tb = document.createElement("tbody");
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.setAttribute("data-drill-keep", "");
    tr.innerHTML = `<td style="color:var(--ink-md)"><span class="bug-dot"></span>${r.was}</td><td><b>${r.is}</b></td>`;
    tr.addEventListener("click", e => {
      U.showDrill({ title: "HOW IT WORKS", value: r.is, sub: r.how, source: "RoboMop New Era · engineering baseline, July 2026", x: e.clientX, y: e.clientY });
    });
    tb.appendChild(tr);
  });
  tbl.appendChild(tb);
  body.appendChild(tbl);
})();
