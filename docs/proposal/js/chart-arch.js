// ═══ §3 · Arquitectura de dos niveles por carriles funcionales ═══
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

  const W = 880;
  const H = 640;
  const svg = d3.select(body).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img")
    .attr("aria-label", "Arquitectura de dos niveles de RoboMop organizada por seguridad, tracción, estado, energía e irrigación")
    .style("width", "100%")
    .style("height", "auto")
    .style("display", "block");

  const P = U.PAL;
  const nodes = {
    lidar: {
      x: 126, y: 78, w: 166, h: 56,
      t: "Dos LiDAR 2D", s: "frontal y trasero · 360° · 10–25 Hz", d: "USB", kind: "sbc",
      bug: "Alimenta el mapeo en el nivel SBC; sellos de tiempo reconciliados contra el reloj monotónico de la MCU (M3).",
    },
    cams: {
      x: 126, y: 145, w: 166, h: 56,
      t: "Dos cámaras", s: "ruta de percepción", d: "USB 3", kind: "sbc",
      bug: "La detección de suciedad y la clasificación de obstáculos bajos corren de forma nativa en el GPU fijado.",
    },
    jetson: {
      x: 440, y: 111, w: 232, h: 88,
      t: "Jetson Orin Nano 8GB", s: "ROS 2 · SLAM · Nav2 · fusión", d: "Super Dev Kit · 67 TOPS · 7–15 W · SBC fijado", kind: "primary-sbc",
      bug: "Incidencia D (2025): el SLAM puede saturar el Jetson sin afectar la temporización del lazo, porque el lazo ya no se ejecuta ahí.",
    },
    fleet: {
      x: 754, y: 111, w: 176, h: 64,
      t: "App / servidor de flota", s: "mapas · horarios · OTA", d: "WiFi 6 / BT", kind: "sbc",
      bug: "La conectividad vive en el nivel SBC; perder la red degrada la planeación, nunca la seguridad de los motores.",
    },
    esp: {
      x: 440, y: 318, w: 796, h: 72,
      t: "ESP32-S3-WROOM-1", s: "FreeRTOS · watchdog · seguridad", d: "N16R8 · $5.11 @100u · 0.3 W · MCU fijada", kind: "primary-mcu",
      bug: "Incidencias A–D (2025): el ESP32 es dueño del lazo de control en FreeRTOS; el watchdog y las entradas de falla MCPWM cortan la potencia si el SBC se bloquea.",
    },
    estop: {
      x: 129, y: 476, w: 132, h: 76,
      t: "Paro de emergencia", t2: "+ cadena de golpe", s: "hardware, supervisado", d: "GPIO · fail-safe", kind: "mcu",
      bug: "Incidencia A (2025): la cadena de seguridad está por debajo de todo el software; un evento de movimiento no controlado ordena detener el trabajo.",
    },
    drivers: {
      x: 344, y: 445, w: 136, h: 54,
      t: "Drivers de motores ×2", s: "cmd de velocidad / retro", d: "PWM / UART", kind: "mcu",
      bug: "Incidencia A (2025): el corte de PWM por entrada de falla es una ruta de hardware; ningún software puede anular el paro.",
    },
    enc: {
      x: 344, y: 520, w: 136, h: 54,
      t: "Encoders de rueda", s: "cuadratura", d: "hardware PCNT", kind: "mcu",
      bug: "Incidencia B (2025): los periféricos PCNT cuentan flancos en silicio; los picos de carga de CPU no pueden perder pulsos.",
    },
    imu: {
      x: 516, y: 476, w: 128, h: 58,
      t: "IMU", s: "marca de tiempo en origen", d: "I²C / SPI", kind: "mcu",
      bug: "Incidencia C (2025): cada medición se marca al capturar contra la base de tiempo monotónica de la MCU; un solo reloj para la fusión.",
    },
    bms: {
      x: 752, y: 438, w: 148, h: 46,
      t: "BMS + cambio en caliente", s: "alimentación de respaldo", d: "UART / GPIO", kind: "mcu", compact: true,
      bug: "Cambio ≤5 min con controles despiertos; meta de alimentación de respaldo ≥10 min, confirmada con usted en la Semana 1.",
    },
    water: {
      x: 752, y: 493, w: 148, h: 46,
      t: "Nivel de agua + flujo", s: "sensores del tanque", d: "ADC / GPIO", kind: "mcu", compact: true,
      bug: "Incidencia F (2025): nivel, flujo y comportamiento ante fugas reportan por el mismo bus supervisado.",
    },
    pump: {
      x: 752, y: 548, w: 148, h: 46,
      t: "Bomba + válvula", s: "dosificación de riego", d: "GPIO / ADC", kind: "mcu", compact: true,
      bug: "Incidencia F (2025): la irrigación es un nodo de primera clase de la MCU desde el día uno, no una función pendiente de integración.",
    },
  };

  const tierG = svg.append("g");
  const laneG = svg.append("g");
  const edgeG = svg.append("g");
  const nodeG = svg.append("g");
  const labelG = svg.append("g");
  const busG = svg.append("g");

  const tierFrames = [
    {
      x: 28, y: 26, w: 824, h: 158,
      label: "NIVEL SUPERIOR · PERCEPCIÓN, PLANEACIÓN, CONECTIVIDAD (SBC)",
      labelY: 16,
    },
    {
      x: 28, y: 270, w: 824, h: 306,
      label: "NIVEL DE TIEMPO REAL · CONTROL DETERMINISTA Y SEGURIDAD (MCU)",
      labelY: 260,
    },
  ];

  tierFrames.forEach(tier => {
    tierG.append("rect")
      .attr("x", tier.x)
      .attr("y", tier.y)
      .attr("width", tier.w)
      .attr("height", tier.h)
      .attr("fill", "none")
      .attr("stroke", P.red)
      .attr("stroke-opacity", 0.58)
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3 4");

    tierG.append("text")
      .attr("x", W / 2)
      .attr("y", tier.labelY)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("font-weight", 700)
      .attr("letter-spacing", "0.11em")
      .attr("fill", P.red)
      .attr("paint-order", "stroke")
      .attr("stroke", "#fff")
      .attr("stroke-width", 5)
      .attr("stroke-linejoin", "round")
      .text(tier.label);
  });

  const lanes = [
    { id: "safety", x: 45, y: 386, w: 168, h: 184, title: "SEGURIDAD", tapX: 129 },
    { id: "traction", x: 230, y: 386, w: 188, h: 184, title: "TRACCIÓN", tapX: 325 },
    { id: "state", x: 436, y: 386, w: 160, h: 184, title: "ESTADO", tapX: 516 },
    { id: "energy", x: 614, y: 386, w: 220, h: 184, title: "ENERGÍA E IRRIGACIÓN", tapX: 724 },
  ];

  lanes.forEach(lane => {
    laneG.append("rect")
      .attr("x", lane.x)
      .attr("y", lane.y)
      .attr("width", lane.w)
      .attr("height", lane.h)
      .attr("rx", 3)
      .attr("fill", "#fff")
      .attr("stroke", P.inkLo)
      .attr("stroke-opacity", 0.58)
      .attr("stroke-width", 1);

    laneG.append("text")
      .attr("x", lane.x + lane.w / 2)
      .attr("y", lane.y + 23)
      .attr("text-anchor", "middle")
      .attr("font-size", lane.id === "energy" ? 9.5 : 10.5)
      .attr("font-weight", 700)
      .attr("letter-spacing", "0.055em")
      .attr("fill", P.red)
      .text(lane.title);
  });

  function drawPath(points, options = {}) {
    const line = d3.line().x(p => p[0]).y(p => p[1]);
    return edgeG.append("path")
      .attr("d", line(points))
      .attr("fill", "none")
      .attr("stroke", options.stroke || P.inkLo)
      .attr("stroke-width", options.width || 1.15)
      .attr("stroke-linecap", "square")
      .attr("stroke-linejoin", "miter");
  }

  function edgeLabel(text, x, y, options = {}) {
    return labelG.append("text")
      .attr("x", x)
      .attr("y", y)
      .attr("text-anchor", options.anchor || "middle")
      .attr("font-size", options.size || 9)
      .attr("font-weight", options.weight || 400)
      .attr("fill", options.fill || P.inkLo)
      .attr("paint-order", "stroke")
      .attr("stroke", "#fff")
      .attr("stroke-width", options.halo || 4)
      .attr("stroke-linejoin", "round")
      .text(text);
  }

  // Nivel superior: sensores → Jetson → flota.
  drawPath([[nodes.lidar.x + nodes.lidar.w / 2, nodes.lidar.y], [nodes.jetson.x - nodes.jetson.w / 2, nodes.lidar.y]]);
  drawPath([[nodes.cams.x + nodes.cams.w / 2, nodes.cams.y], [nodes.jetson.x - nodes.jetson.w / 2, nodes.cams.y]]);
  drawPath([[nodes.jetson.x + nodes.jetson.w / 2, nodes.jetson.y], [nodes.fleet.x - nodes.fleet.w / 2, nodes.fleet.y]]);
  edgeLabel("USB", 283, nodes.lidar.y - 6);
  edgeLabel("USB 3", 283, nodes.cams.y - 6);
  edgeLabel("WiFi 6 / BT", 598, nodes.jetson.y - 6);

  // Puente determinista entre los dos cerebros.
  drawPath(
    [[nodes.jetson.x, nodes.jetson.y + nodes.jetson.h / 2], [nodes.jetson.x, nodes.esp.y - nodes.esp.h / 2]],
    { stroke: P.red, width: 2.2 },
  );
  edgeLabel("UART · micro-ROS · trama + CRC + sellos", W / 2, 224, {
    fill: P.red,
    size: 10,
    weight: 700,
    halo: 5,
  });

  // Carriles desde el backplane de la MCU.
  const espBottom = nodes.esp.y + nodes.esp.h / 2;
  const laneDrops = [
    { x: 129, y2: nodes.estop.y - nodes.estop.h / 2, label: "GPIO · FAIL-SAFE" },
    { x: 248, y2: nodes.enc.y, label: "" },
    { x: 516, y2: nodes.imu.y - nodes.imu.h / 2, label: "I²C / SPI" },
    { x: 632, y2: nodes.pump.y, label: "" },
  ];

  laneDrops.forEach(drop => {
    drawPath([[drop.x, espBottom], [drop.x, drop.y2]], { stroke: P.red, width: 1.55 });
    if (drop.label) {
      edgeLabel(drop.label, drop.x + 6, 374, {
        anchor: "start",
        size: 8.5,
      });
    }
  });

  // Tracción: una troncal visual con derivaciones separadas para mando y retroalimentación.
  drawPath([[248, nodes.drivers.y], [nodes.drivers.x - nodes.drivers.w / 2, nodes.drivers.y]]);
  drawPath([[248, nodes.enc.y], [nodes.enc.x - nodes.enc.w / 2, nodes.enc.y]]);
  edgeLabel("PWM / UART", 251, nodes.drivers.y - 7, { anchor: "start", size: 7.2, halo: 3 });
  edgeLabel("PCNT", 251, nodes.enc.y - 7, { anchor: "start", size: 7.2, halo: 3 });

  // Energía e irrigación: una troncal ordenada con interfaces individuales.
  drawPath([[632, nodes.bms.y], [nodes.bms.x - nodes.bms.w / 2, nodes.bms.y]]);
  drawPath([[632, nodes.water.y], [nodes.water.x - nodes.water.w / 2, nodes.water.y]]);
  drawPath([[632, nodes.pump.y], [nodes.pump.x - nodes.pump.w / 2, nodes.pump.y]]);
  edgeLabel("UART / GPIO", 635, nodes.bms.y - 7, { anchor: "start", size: 6.8, halo: 3 });
  edgeLabel("ADC / GPIO", 635, nodes.water.y - 7, { anchor: "start", size: 6.8, halo: 3 });
  edgeLabel("GPIO / ADC", 635, nodes.pump.y - 7, { anchor: "start", size: 6.8, halo: 3 });

  // Troncal CAN reservada: infraestructura futura, nunca confundida con una señal activa.
  const busY = 613;
  busG.append("path")
    .attr("d", `M 54 ${busY} H 826`)
    .attr("fill", "none")
    .attr("stroke", P.red)
    .attr("stroke-width", 1.2)
    .attr("stroke-dasharray", "6 5")
    .attr("opacity", 0.82);

  [lanes[0].tapX, lanes[1].tapX, lanes[3].tapX].forEach(x => {
    busG.append("path")
      .attr("d", `M ${x} ${lanes[0].y + lanes[0].h} V ${busY}`)
      .attr("fill", "none")
      .attr("stroke", P.red)
      .attr("stroke-width", 1.1)
      .attr("stroke-dasharray", "5 4")
      .attr("opacity", 0.82);

    busG.append("rect")
      .attr("x", x - 3)
      .attr("y", busY - 3)
      .attr("width", 6)
      .attr("height", 6)
      .attr("fill", "#fff")
      .attr("stroke", P.red)
      .attr("stroke-width", 1);
  });

  busG.append("text")
    .attr("x", W / 2)
    .attr("y", 631)
    .attr("text-anchor", "middle")
    .attr("font-size", 10)
    .attr("font-weight", 700)
    .attr("letter-spacing", "0.07em")
    .attr("fill", P.red)
    .attr("paint-order", "stroke")
    .attr("stroke", "#fff")
    .attr("stroke-width", 5)
    .text("CAN 2.0 (TWAI) · TRONCAL RESERVADA");

  function showNodeDetail(event, node) {
    const target = event.currentTarget;
    const bounds = target && target.getBoundingClientRect ? target.getBoundingClientRect() : null;
    const x = event.clientX || (bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2);
    const y = event.clientY || (bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2);
    U.showDrill({
      title: node.t.toUpperCase() + (node.t2 ? ` ${node.t2.toUpperCase()}` : ""),
      value: node.d,
      sub: `${node.s} — ${node.bug}`,
      source: SRC,
      x,
      y,
    });
  }

  function renderNode(node) {
    const primary = node.kind.startsWith("primary");
    const col = node.kind.includes("sbc") ? P.red : P.ink;
    const g = nodeG.append("g")
      .attr("data-drill-keep", "")
      .attr("role", "button")
      .attr("tabindex", 0)
      .attr("aria-label", `${node.t}. ${node.s}. ${node.d}`)
      .style("cursor", "pointer");

    const rect = g.append("rect")
      .attr("x", node.x - node.w / 2)
      .attr("y", node.y - node.h / 2)
      .attr("width", node.w)
      .attr("height", node.h)
      .attr("rx", primary ? 4 : 3)
      .attr("fill", primary ? col : "#fff")
      .attr("stroke", col)
      .attr("stroke-width", primary ? 0 : 1.2);

    const titleY = node.t2 ? node.y - 13 : node.y - (node.s ? 8 : 0);
    g.append("text")
      .attr("x", node.x)
      .attr("y", titleY)
      .attr("text-anchor", "middle")
      .attr("font-size", primary ? 12.5 : 11.2)
      .attr("font-weight", 700)
      .attr("font-family", "'Space Grotesk', 'Inter', system-ui, sans-serif")
      .attr("fill", primary ? "#fff" : P.ink)
      .text(node.t);

    if (node.t2) {
      g.append("text")
        .attr("x", node.x)
        .attr("y", node.y + 2)
        .attr("text-anchor", "middle")
        .attr("font-size", 10.5)
        .attr("font-weight", 700)
        .attr("font-family", "'Space Grotesk', 'Inter', system-ui, sans-serif")
        .attr("fill", P.ink)
        .text(node.t2);
    }

    const subY = node.t2 ? node.y + 20 : node.y + (node.compact ? 7 : 10);
    g.append("text")
      .attr("x", node.x)
      .attr("y", subY)
      .attr("text-anchor", "middle")
      .attr("font-size", primary ? 9.6 : 8.8)
      .attr("fill", primary ? "rgba(255,255,255,.85)" : P.inkLo)
      .text(node.s);

    g.append("text")
      .attr("x", node.x)
      .attr("y", node.t2 ? node.y + 35 : node.y + (node.compact ? 19 : 25))
      .attr("text-anchor", "middle")
      .attr("font-size", primary ? 9 : 8.2)
      .attr("fill", primary ? "rgba(255,255,255,.68)" : P.inkLo)
      .text(node.d);

    g.on("click", event => showNodeDetail(event, node))
      .on("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showNodeDetail(event, node);
        }
      })
      .on("mouseenter", () => {
        if (!primary) rect.attr("fill", P.hi);
      })
      .on("mouseleave", () => {
        if (!primary) rect.attr("fill", "#fff");
      })
      .on("focus", () => rect.attr("stroke-width", primary ? 2 : 2.2))
      .on("blur", () => rect.attr("stroke-width", primary ? 0 : 1.2));
  }

  Object.values(nodes).forEach(renderNode);

  if (!window.REDUCE) {
    edgeG.attr("opacity", 0);
    laneG.attr("opacity", 0);
    nodeG.attr("opacity", 0);
    labelG.attr("opacity", 0);
    busG.attr("opacity", 0);

    tierG.attr("opacity", 0).transition().duration(350).attr("opacity", 1);
    edgeG.transition().delay(120).duration(450).attr("opacity", 1);
    laneG.transition().delay(260).duration(420).attr("opacity", 1);
    nodeG.transition().delay(380).duration(450).attr("opacity", 1);
    labelG.transition().delay(560).duration(350).attr("opacity", 1);
    busG.transition().delay(680).duration(350).attr("opacity", 1);
  }
})();
