// ═══ §3 · Two-tier architecture topology (inspectable nodes) ═══
(function () {
  const host = document.getElementById("arch-chart");
  if (!host) return;
  const body = U.frame(host, {
    title: "System diagram",
    sub: "CLICK ANY BLOCK FOR ROLE, INTERFACE AND THE 2025 BUG IT RETIRES · DASHED = RESERVED CAN TRUNK",
    src: "RoboMop New Era · architecture baseline, July 2026",
  });

  const W = 880, H = 640;
  const svg = d3.select(body).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%").style("height", "auto").style("display", "block");

  const P = U.PAL;
  const nodes = {
    jetson: { x: 440, y: 120, w: 230, h: 84, t: "Jetson Orin Nano 8GB", s: "ROS 2 · SLAM · Nav2 · fusion", d: "67 TOPS · 7–15 W · locked SBC", tier: "sbc", bug: "BUG D — compute contention: SLAM can saturate the Jetson without touching loop timing, because the loop no longer lives there.", src: "RoboMop New Era · engineering baseline, July 2026" },
    lidar: { x: 120, y: 78, w: 168, h: 56, t: "2D LiDAR", s: "360° · 10–25 Hz", d: "USB", tier: "sbc", bug: "Feeds mapping on the SBC tier; timestamps reconciled against the MCU monotonic clock (M3).", src: "RoboMop New Era · engineering baseline, July 2026" },
    cams: { x: 120, y: 178, w: 168, h: 56, t: "Two cameras", s: "perception roadmap", d: "USB 3", tier: "sbc", bug: "Dirt detection and below-LiDAR obstacle classification run natively on the locked GPU.", src: "RoboMop New Era · engineering baseline, July 2026" },
    fleet: { x: 762, y: 120, w: 170, h: 62, t: "Fleet app / server", s: "maps · schedules · OTA", d: "WiFi 6 / BT", tier: "sbc", bug: "Connectivity lives on the SBC tier; network loss degrades planning, never motor safety.", src: "RoboMop New Era · engineering baseline, July 2026" },
    esp: { x: 440, y: 470, w: 230, h: 84, t: "ESP32-S3-WROOM-1", s: "FreeRTOS · watchdog · safety", d: "$5.11 @100u · 0.3 W · locked MCU", tier: "mcu", bug: "BUGS A–D — owns the control loop in FreeRTOS; hardware watchdog + MCPWM fault inputs cut drive power in hardware if the SBC hangs.", src: "RoboMop New Era · engineering baseline, July 2026" },
    drivers: { x: 120, y: 416, w: 176, h: 58, t: "Hub motor drivers ×2", s: "velocity cmd / feedback", d: "PWM / UART", tier: "mcu", bug: "BUG A — fault-input PWM kill is a hardware path; no software can override the stop.", src: "RoboMop New Era · engineering baseline, July 2026" },
    enc: { x: 120, y: 524, w: 176, h: 58, t: "Wheel encoders", s: "quadrature", d: "PCNT hardware", tier: "mcu", bug: "BUG B — PCNT peripherals count edges in silicon; missed ticks become physically impossible at any CPU load.", src: "RoboMop New Era · engineering baseline, July 2026" },
    imu: { x: 330, y: 596, w: 150, h: 52, t: "IMU", s: "timestamped at capture", d: "I²C / SPI", tier: "mcu", bug: "BUG C — stamped at capture against the MCU monotonic timebase; one clock for fusion.", src: "RoboMop New Era · engineering baseline, July 2026" },
    pump: { x: 600, y: 596, w: 160, h: 52, t: "Pump + valve", s: "irrigation dosing", d: "GPIO / ADC", tier: "mcu", bug: "BUG F — irrigation is a first-class MCU node from day one, not a claim without hardware.", src: "RoboMop New Era · engineering baseline, July 2026" },
    water: { x: 762, y: 524, w: 170, h: 58, t: "Water-level + flow", s: "tank sensing", d: "ADC / GPIO", tier: "mcu", bug: "BUG F — level, flow and leak behavior report over the same supervised bus.", src: "RoboMop New Era · engineering baseline, July 2026" },
    bms: { x: 762, y: 416, w: 170, h: 58, t: "BMS + hot-swap", s: "backup rail switchover", d: "UART / GPIO", tier: "mcu", bug: "Swap ≤5 min with controls alive; backup-rail target ≥10 min, confirmed with you in Week 1.", src: "RoboMop New Era · engineering baseline, July 2026" },
    estop: { x: 330, y: 330, w: 220, h: 52, t: "E-stop + bump chain", s: "hardware, MCU-supervised", d: "GPIO · fail-safe", tier: "mcu", bug: "BUG A — the safety chain sits below all software; one uncontrolled-motion event is a stop-work order.", src: "RoboMop New Era · engineering baseline, July 2026" },
  };

  const edges = [
    ["lidar", "jetson", "USB"], ["cams", "jetson", "USB 3"], ["jetson", "fleet", "WiFi 6 / BT"],
    ["jetson", "esp", "UART · micro-ROS · framed + CRC + timestamps"],
    ["esp", "drivers", "PWM / UART"], ["enc", "esp", "PCNT"], ["imu", "esp", "I²C/SPI"],
    ["pump", "esp", "GPIO/ADC"], ["water", "esp", "ADC/GPIO"], ["bms", "esp", "UART/GPIO"], ["estop", "esp", "GPIO"],
  ];

  // tier frames
  const tiers = [
    { x: 40, y: 30, w: 800, h: 190, label: "HIGH-LEVEL TIER · PERCEPTION, PLANNING, CONNECTIVITY (SBC)", col: P.red },
    { x: 40, y: 300, w: 800, h: 322, label: "REAL-TIME TIER · DETERMINISTIC CONTROL AND SAFETY (MCU)", col: P.ink },
  ];
  tiers.forEach(t => {
    svg.append("rect").attr("x", t.x).attr("y", t.y).attr("width", t.w).attr("height", t.h)
      .attr("fill", "none").attr("stroke", t.col).attr("stroke-opacity", 0.28).attr("stroke-dasharray", "3 4");
    svg.append("text").attr("x", t.x + t.w - 10).attr("y", t.y + 18).attr("font-size", 9.5)
      .attr("text-anchor", "end")
      .attr("letter-spacing", "0.14em").attr("fill", t.col).attr("opacity", 0.85).text(t.label);
  });

  const edgeG = svg.append("g"), nodeG = svg.append("g"), labG = svg.append("g");

  edges.forEach(([a, b, lab]) => {
    const A = nodes[a], B = nodes[b];
    const x1 = A.x, y1 = A.y + (B.y > A.y ? A.h / 2 : -A.h / 2);
    const x2 = B.x, y2 = B.y + (B.y > A.y ? -B.h / 2 : B.h / 2);
    const main = (a === "jetson" && b === "esp");
    const path = `M ${x1} ${y1} L ${x2} ${y2}`;
    edgeG.append("path").attr("d", path).attr("fill", "none")
      .attr("stroke", main ? P.red : P.inkLo).attr("stroke-width", main ? 2 : 1.2)
      .attr("stroke-dasharray", main ? "none" : "1 0");
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    labG.append("text").attr("x", mx + (main ? 14 : 0)).attr("y", my - 5)
      .attr("text-anchor", "middle").attr("font-size", main ? 10 : 9)
      .attr("fill", main ? P.red : P.inkLo)
      .attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4)
      .text(lab);
  });

  // reserved CAN trunk (dashed)
  const can = edgeG.append("path")
    .attr("d", `M ${nodes.esp.x + nodes.esp.w / 2} ${nodes.esp.y + 10} C 700 380, 700 340, 640 322`)
    .attr("fill", "none").attr("stroke", P.red).attr("stroke-width", 1.2).attr("stroke-dasharray", "5 4").attr("opacity", 0.75);
  labG.append("text").attr("x", 868).attr("y", 330).attr("font-size", 9).attr("fill", P.red)
    .attr("text-anchor", "end")
    .attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4)
    .text("CAN 2.0 (TWAI) · reserved: irrigation, battery, safety nodes");

  Object.values(nodes).forEach(n => {
    const g = nodeG.append("g").style("cursor", "pointer").attr("data-drill-keep", "");
    const main = n.tier === "sbc" && n.t.startsWith("Jetson") || n.t.startsWith("ESP32");
    const col = n.tier === "sbc" ? P.red : P.ink;
    g.append("rect").attr("x", n.x - n.w / 2).attr("y", n.y - n.h / 2).attr("width", n.w).attr("height", n.h)
      .attr("rx", 4).attr("fill", main ? col : "#fff")
      .attr("stroke", col).attr("stroke-width", main ? 0 : 1.4);
    g.append("text").attr("x", n.x).attr("y", n.y - (n.s ? 8 : -4)).attr("text-anchor", "middle")
      .attr("font-size", 12).attr("font-weight", 700).attr("font-family", "'et-book', Palatino, Georgia, serif")
      .attr("fill", main ? "#fff" : P.ink).text(n.t);
    if (n.s) g.append("text").attr("x", n.x).attr("y", n.y + 9).attr("text-anchor", "middle")
      .attr("font-size", 9.5).attr("fill", main ? "rgba(255,255,255,.85)" : P.inkLo).text(n.s);
    if (n.d && !main) g.append("text").attr("x", n.x).attr("y", n.y + 23).attr("text-anchor", "middle")
      .attr("font-size", 8.5).attr("fill", P.inkLo).text(n.d);
    else if (n.d) g.append("text").attr("x", n.x).attr("y", n.y + 26).attr("text-anchor", "middle")
      .attr("font-size", 9).attr("fill", "rgba(255,255,255,.65)").text(n.d);
    g.on("click", e => U.showDrill({ title: n.t.toUpperCase(), value: n.d, sub: n.s + " — " + n.bug, source: n.src, x: e.clientX, y: e.clientY }));
  });

  if (!window.REDUCE) {
    nodeG.attr("opacity", 0); edgeG.attr("opacity", 0); labG.attr("opacity", 0);
    edgeG.transition().delay(150).duration(500).attr("opacity", 1);
    nodeG.transition().delay(400).duration(500).attr("opacity", 1);
    labG.transition().delay(700).duration(400).attr("opacity", 1);
  }
})();
