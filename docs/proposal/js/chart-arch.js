// ═══ §3 · Topología de arquitectura de dos niveles (nodos inspeccionables) ═══
(function () {
  const host = document.getElementById("arch-chart");
  if (!host) return;
  const SRC = "RoboMop New Era · base de ingeniería, julio 2026";
  const body = U.frame(host, {
    title: "Diagrama del sistema",
    sub: "CLIC EN CUALQUIER BLOQUE PARA VER SU ROL, INTERFAZ Y EL ERROR DE 2025 QUE RETIRA · PUNTEADO = TRONCAL CAN RESERVADA",
    src: SRC,
  });
  body.classList.add("chart-viewport");

  const W = 880, H = 640;
  const svg = d3.select(body).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`).style("width", "100%").style("height", "auto").style("display", "block");

  const P = U.PAL;
  const nodes = {
    jetson: { x: 440, y: 120, w: 230, h: 84, t: "Jetson Orin Nano 8GB", s: "ROS 2 · SLAM · Nav2 · fusión", d: "67 TOPS · 7–15 W · SBC fijado", tier: "sbc", bug: "Incidencia D (2025): el SLAM puede saturar el Jetson sin afectar la temporización del lazo, porque el lazo ya no se ejecuta ahí.", src: SRC },
    lidar: { x: 120, y: 78, w: 168, h: 56, t: "LiDAR 2D", s: "360° · 10–25 Hz", d: "USB", tier: "sbc", bug: "Alimenta el mapeo en el nivel SBC; sellos de tiempo reconciliados contra el reloj monotónico de la MCU (M3).", src: SRC },
    cams: { x: 120, y: 178, w: 168, h: 56, t: "Dos cámaras", s: "ruta de percepción", d: "USB 3", tier: "sbc", bug: "La detección de suciedad y la clasificación de obstáculos bajos corren de forma nativa en el GPU fijado.", src: SRC },
    fleet: { x: 762, y: 120, w: 170, h: 62, t: "App / servidor de flota", s: "mapas · horarios · OTA", d: "WiFi 6 / BT", tier: "sbc", bug: "La conectividad vive en el nivel SBC; perder la red degrada la planeación, nunca la seguridad de los motores.", src: SRC },
    esp: { x: 440, y: 470, w: 230, h: 84, t: "ESP32-S3-WROOM-1", s: "FreeRTOS · watchdog · seguridad", d: "$5.11 @100u · 0.3 W · MCU fijada", tier: "mcu", bug: "Incidencias A–D (2025): el ESP32 es dueño del lazo de control en FreeRTOS; el watchdog y las entradas de falla MCPWM cortan la potencia si el SBC se bloquea.", src: SRC },
    drivers: { x: 120, y: 416, w: 176, h: 58, t: "Drivers de motores ×2", s: "cmd de velocidad / retro", d: "PWM / UART", tier: "mcu", bug: "Incidencia A (2025): el corte de PWM por entrada de falla es una ruta de hardware; ningún software puede anular el paro.", src: SRC },
    enc: { x: 120, y: 524, w: 176, h: 58, t: "Encoders de rueda", s: "cuadratura", d: "hardware PCNT", tier: "mcu", bug: "Incidencia B (2025): los periféricos PCNT cuentan flancos en silicio; los picos de carga de CPU no pueden perder pulsos.", src: SRC },
    imu: { x: 330, y: 596, w: 150, h: 52, t: "IMU", s: "marca de tiempo en origen", d: "I²C / SPI", tier: "mcu", bug: "Incidencia C (2025): cada medición se marca al capturar contra la base de tiempo monotónica de la MCU; un solo reloj para la fusión.", src: SRC },
    pump: { x: 600, y: 596, w: 160, h: 52, t: "Bomba + válvula", s: "dosificación de riego", d: "GPIO / ADC", tier: "mcu", bug: "Incidencia F (2025): la irrigación es un nodo de primera clase de la MCU desde el día uno, no una función pendiente de integración.", src: SRC },
    water: { x: 762, y: 524, w: 170, h: 58, t: "Nivel de agua + flujo", s: "sensores del tanque", d: "ADC / GPIO", tier: "mcu", bug: "Incidencia F (2025): nivel, flujo y comportamiento ante fugas reportan por el mismo bus supervisado.", src: SRC },
    bms: { x: 762, y: 416, w: 170, h: 58, t: "BMS + cambio en caliente", s: "conmutación de alimentación de respaldo", d: "UART / GPIO", tier: "mcu", bug: "Cambio ≤5 min con controles despiertos; meta de alimentación de respaldo ≥10 min, confirmada con usted en la Semana 1.", src: SRC },
    estop: { x: 330, y: 330, w: 220, h: 52, t: "Paro de emergencia + cadena de golpe", s: "hardware, supervisado por la MCU", d: "GPIO · fail-safe", tier: "mcu", bug: "Incidencia A (2025): la cadena de seguridad está por debajo de todo el software; un evento de movimiento no controlado ordena detener el trabajo.", src: SRC },
  };

  const edges = [
    ["lidar", "jetson", "USB"], ["cams", "jetson", "USB 3"], ["jetson", "fleet", "WiFi 6 / BT"],
    ["jetson", "esp", "UART · micro-ROS · trama + CRC + sellos"],
    ["esp", "drivers", "PWM / UART"], ["enc", "esp", "PCNT"], ["imu", "esp", "I²C/SPI"],
    ["pump", "esp", "GPIO/ADC"], ["water", "esp", "ADC/GPIO"], ["bms", "esp", "UART/GPIO"], ["estop", "esp", "GPIO"],
  ];

  // marcos de nivel
  const tiers = [
    { x: 40, y: 30, w: 800, h: 190, label: "NIVEL SUPERIOR · PERCEPCIÓN, PLANEACIÓN, CONECTIVIDAD (SBC)", col: P.red },
    { x: 40, y: 300, w: 800, h: 322, label: "NIVEL DE TIEMPO REAL · CONTROL DETERMINISTA Y SEGURIDAD (MCU)", col: P.ink },
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

  // troncal CAN reservada (punteada)
  const can = edgeG.append("path")
    .attr("d", `M ${nodes.esp.x + nodes.esp.w / 2} ${nodes.esp.y + 10} C 700 380, 700 340, 640 322`)
    .attr("fill", "none").attr("stroke", P.red).attr("stroke-width", 1.2).attr("stroke-dasharray", "5 4").attr("opacity", 0.75);
  labG.append("text").attr("x", 868).attr("y", 330).attr("font-size", 9).attr("fill", P.red)
    .attr("text-anchor", "end")
    .attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4)
    .text("CAN 2.0 (TWAI) · reservada: irrigación, batería, nodos de seguridad");

  Object.values(nodes).forEach(n => {
    const g = nodeG.append("g").style("cursor", "pointer").attr("data-drill-keep", "");
    const main = n.tier === "sbc" && n.t.startsWith("Jetson") || n.t.startsWith("ESP32");
    const col = n.tier === "sbc" ? P.red : P.ink;
    g.append("rect").attr("x", n.x - n.w / 2).attr("y", n.y - n.h / 2).attr("width", n.w).attr("height", n.h)
      .attr("rx", 4).attr("fill", main ? col : "#fff")
      .attr("stroke", col).attr("stroke-width", main ? 0 : 1.4);
    g.append("text").attr("x", n.x).attr("y", n.y - (n.s ? 8 : -4)).attr("text-anchor", "middle")
      .attr("font-size", 12).attr("font-weight", 700).attr("font-family", "'Space Grotesk', 'Inter', system-ui, sans-serif")
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
