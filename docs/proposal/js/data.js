// ═══ RoboMop New Era · Propuesta de proyecto — capa de datos (ES) ═══
// Documento independiente para el cliente · julio 2026.
// La bandera REDUCE debe existir antes de que se ejecute cualquier módulo (main.js la redefine después).
window.REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
window.RPT = {

  meta: {
    title: "RoboMop New Era",
    version: "Propuesta de proyecto v1.1 · para aprobación provisional",
    issued: "2026-08-03",
    compiled: "2026-08-03",
    sponsor: "Luis Vazquez",
    pm: "Germán Velázquez",
    senior: "Sebastian Barrio",
  },

  ask: {
    weeks: 16,
    base: 49739.85,
    contingency: 7460.98,
    bac: 57200.83,
    cap: 58000,
    pmServices: 160000,
    seniorServices: 160000,
    services: 320000,
    projectBudget: 377200.83,
    projectCap: 378000,
    minDelivery: "1 robot + 1 acumulador LFP",
    startRule: "W1 inicia el primer día hábil posterior a la firma provisional del Charter y el NTP/luz verde escrita del Sponsor",
    hardwarePayment: "El Sponsor paga compras autorizadas directamente o reembolsa contra factura, CFDI, recibo o ticket y evidencia de recepción; no existe anticipo global de hardware",
    taxRule: "IVA, impuestos, retenciones, importación, aranceles, brokerage, envío y variación cambiaria de compras autorizadas son absorbidos por el Sponsor",
  },

  // Decisiones de electrónica fijadas (componentes finales)
  decisions: {
    sbc: {
      pick: "Jetson Orin Nano 8GB", vendor: "NVIDIA",
      cost: "kit de desarrollo $249 · módulo $249 @1KU",
      power: "7–15 W (25 W MAXN Super)", tops: "67 TOPS · 1024 CUDA + 32 Tensor",
      mem: "8 GB LPDDR5 · 102 GB/s", supply: "clase ~5 años (NVIDIA FAQ)",
      verdict: "RECOMENDADO",
    },
    mcu: {
      pick: "ESP32-S3-WROOM-1", vendor: "Espressif",
      cost: "$6.76 @1 · $5.11 @100 · $3.90 @650",
      encoder: "Contadores de pulsos PCNT por hardware", bus: "TWAI (CAN 2.0) integrado",
      radio: "WiFi + BT, precertificado", verdict: "RECOMENDADO",
    },
    pcbs: [
      { id: "PCB 1", role: "Tarjeta de potencia / tren motriz, ensamblada", cost1: 160 },
      { id: "PCB 2", role: "Tarjeta portadora Jetson a la medida, ensamblada", cost1: 180 },
    ],
    mechanisms: [
      { id: "M1", name: "Lazo de control de tiempo real estricto", fix: "La MCU es dueña del lazo de motores en FreeRTOS + watchdog de hardware + corte de PWM por entrada de falla MCPWM", retires: "INCIDENCIA A (2025) · disparo de motores y sobrecalentamiento del puente H" },
      { id: "M2", name: "Captura de encoders por hardware", fix: "Los periféricos PCNT del ESP32-S3 cuentan los flancos de cuadratura en silicio, con cero carga de CPU", retires: "INCIDENCIA B (2025) · datos de encoder perdidos tras la integración de la PCB" },
      { id: "M3", name: "Base de tiempo monotónica unificada", fix: "La MCU marca temporalmente odometría/IMU al capturar, reloj sincronizado con el Jetson; robot_localization fusiona contra un solo reloj", retires: "INCIDENCIA C (2025) · desincronización LiDAR/odometría/IMU y deriva del mapa" },
      { id: "M4", name: "División de cómputo en dos niveles", fix: "Percepción, SLAM, Nav2 y conectividad en el SBC; control determinista en la MCU", retires: "INCIDENCIA D (2025) · contención entre alto nivel y tiempo real en un solo SoC" },
      { id: "M5", name: "Dimensionamiento energético primero", fix: "La autonomía se calcula a partir de consumos medidos contra la meta de turno antes de fabricar", retires: "INCIDENCIA E (2025) · aproximadamente 25–30 min de autonomía" },
      { id: "M6", name: "Irrigación como nodo de primera clase", fix: "Bomba, válvula, nivel de agua y flujo cableados a la MCU desde el día uno; troncal CAN reservada para nodos futuros", retires: "INCIDENCIA F (2025) · irrigación nunca integrada" },
    ],
    link: "UART · micro-ROS · con trama + CRC + sellos de tiempo",
  },

  // ── Lista de materiales estimada · una sola tabla, todos los precios en MXN ──
  // Partes de origen USD convertidas a una tasa de planeación de MXN $18 por USD (spot ≈ $17.4, julio 2026).
  // DEFINED = parte exacta fijada con precio · ESTIMATE = grupo presupuestado, partes congeladas en la revisión de diseño de la Semana 2.
  fxNote: "Partes de origen USD convertidas a una tasa de planeación de MXN $18 por USD (spot ≈ MXN $17.4, julio 2026); los remanentes de las cuentas absorben las diferencias finales puestas en destino.",
  bomTable: [
    { item: "Computadora principal", spec: "NVIDIA Jetson Orin Nano 8GB Super Dev Kit", gives: "Mapea el edificio, planea rutas, corre la percepción de cámaras y la app — 67 TOPS a 7–15 W", qty: "1", mxn: 4482, unit: "MXN $4,482 ($249)", status: "DEFINED" },
    { item: "Almacenamiento de estado sólido", spec: "SSD NVMe 256 GB", gives: "Obligatorio en la portadora Orin — el módulo no tiene eMMC", qty: "1", mxn: 756, unit: "MXN $756 ($42)", status: "DEFINED" },
    { item: "Controlador de tiempo real", spec: "ESP32-S3-WROOM-1 N16R8", gives: "Corre el lazo de motores y seguridad mil veces por segundo y cuenta encoders por hardware; radio precertificado", qty: "1", mxn: 122, unit: "MXN $122 ($6.76)", status: "DEFINED" },
    { item: "Motorreductores de tracción", spec: "60GP-60ZYT24X0SZ-B · 24 V · 100 W · 1:18 · 270 rpm · encoder 500 ppr", gives: "Dos unidades de tracción dimensionadas para la carga de limpieza completa, encoders de cuadratura contados por hardware", qty: "2", mxn: 1800, unit: "MXN $900 cada uno ($50 · estimación del listado de AliExpress)", status: "DEFINED" },
    { item: "Celdas de batería", spec: "LiFePO4 40135 · 3.2 V · 20 Ah — 16 celdas en 8S2P (25.6 V · 40 Ah)", gives: "La base de 960 Wh del modelo de autonomía; química LFP segura y de larga vida útil", qty: "16", mxn: 7200, unit: "MXN $450 cada una ($25 · estimación del listado de AliExpress)", status: "DEFINED" },
    { item: "Escáneres LiDAR", spec: "RPLIDAR S2 · 360° · frontal y trasero", gives: "Escaneo láser en ambas direcciones para mapeo y detección de obstáculos", qty: "2", mxn: 5500, unit: "MXN $5,500 el par — precio real de compra", status: "DEFINED" },
    { item: "Costos en destino del cómputo", spec: "Envío, importación e impuestos del kit Jetson y el SSD", qty: "—", mxn: 3262, status: "ESTIMATE" },
    { item: "Ensamble del paquete + BMS", spec: "BMS, barras colectoras, carcasa y ensamble del acumulador 8S2P", qty: "—", mxn: 2800, status: "ESTIMATE" },
    { item: "Mecánica del tren motriz", spec: "Monturas, acoplamientos y mecánica de transmisión alrededor de los motorreductores", qty: "—", mxn: 5199.85, status: "ESTIMATE" },
    { item: "PCBs a la medida", spec: "PCB 1 de potencia/tren motriz y PCB 2 portadora Jetson, ensambladas — USD $160 + USD $180 a MXN $18/USD", qty: "2 tarjetas", mxn: 6120, status: "ESTIMATE" },
    { item: "Cámaras", spec: "Dos cámaras de percepción para detección de suciedad y obstáculos bajos", qty: "2", mxn: 2198, status: "ESTIMATE" },
    { item: "IMU + sensores auxiliares", spec: "Saldo de la cuenta de sensores después de la compra de los LiDAR", qty: "—", mxn: 2800, status: "ESTIMATE" },
    { item: "Irrigación", spec: "Bomba, válvula, tanque, sensores de nivel de agua y flujo", qty: "—", mxn: 1200, status: "ESTIMATE" },
    { item: "Chasis 3D + mecánica", spec: "Estructura impresa, ruedas, rueditas locas y herrajes mecánicos", qty: "—", mxn: 1000, status: "ESTIMATE" },
    { item: "Arneses, conectores, seguridad", spec: "Conectores con seguro clasificados, cadena de paro de emergencia, cableado", qty: "—", mxn: 1500, status: "ESTIMATE" },
    { item: "Pruebas, logística, consumibles", spec: "Campañas de prueba, envíos y consumibles de banco", qty: "—", mxn: 1800, status: "ESTIMATE" },
    { item: "Cargador, respaldo, cambio en caliente", spec: "Cargador compatible con LFP, riel de respaldo de controles y el mecanismo de cambio", qty: "—", mxn: 2000, status: "ESTIMATE" },
  ],

  // Costo de la electrónica de cómputo por robot a tres volúmenes (MXN, a la tasa de planeación de $18/USD)
  bomVol: [
    { item: "Jetson Orin Nano 8GB", basis: "Super Dev Kit @1u · módulo de producción @10/100u", u1: 4482, u10: 4482, u100: 4482 },
    { item: "SSD NVMe 256 GB", basis: "obligatorio en la portadora Orin (sin eMMC)", u1: 756, u10: 756, u100: 684 },
    { item: "PCB portadora a la medida (PCB 2), ensamblada", basis: "corrida prototipo → panelizada", u1: 3240, u10: 2160, u100: 1404 },
    { item: "ESP32-S3-WROOM-1 N16R8", basis: "precios por nivel del distribuidor", u1: 122, u10: 100, u100: 92 },
    { item: "PCB de potencia / tren motriz (PCB 1), ensamblada", basis: "corrida prototipo → panelizada", u1: 2880, u10: 1890, u100: 1188 },
    { item: "Transceptor CAN + conectores con seguro", basis: "clase TJA1051, clasificados para corriente", u1: 252, u10: 198, u100: 144 },
    { item: "Reguladores, conmutación de cambio en caliente, pasivos", basis: "riel de respaldo para la electrónica de control", u1: 630, u10: 504, u100: 378 },
  ],
  bomVolTotals: { u1: 12362, u10: 10090, u100: 8372 },

  // Modelo de potencia: presupuesto de 960 Wh sobre un paquete nominal de 25.6 V · 40 Ah (1,024 Wh).
  power: {
    packWh: 960, packSpec: "25.6 V nominales · 40 Ah LFP",
    sbcW: 10, idleW: 5, tractionW: 185,
    avgW: 200, acceptH: 4.0,
    computeWh: 60, tractionWh: 740, marginWh: 160,
    runtimeH: 4.8, marginPct: 20,
    swapMin: 5,
    computeSharePct: 7.5,
    charterAcceptance: "≥4.0 h desde 100% bajo el perfil de aceptación de peor caso de 200 W",
  },

  // Plan integrado de 16 semanas
  phases: [
    { name: "Autorización y requisitos", w0: 1, w1: 1, out: "Alcance, requisitos y pruebas de aceptación acordados y congelados" },
    { name: "Aprobación del diseño y compras", w0: 2, w1: 2, out: "Diseño aprobado por usted; partes de entrega larga ordenadas" },
    { name: "Diseño concurrente y simulación", w0: 3, w1: 4, out: "CAD del robot, diseño del cambio de batería, tarjetas, gemelo digital" },
    { name: "Construcción y pruebas de banco", w0: 5, w1: 8, out: "Batería, tren motriz, irrigación, control y sensores probados en banco" },
    { name: "Integración incremental", w0: 8, w1: 12, out: "El robot conduce, mapea, irriga y conecta — paso a paso" },
    { name: "Congelación de funciones", w0: 12, w1: 12, out: "Sin alcance nuevo; sistema completo configurado" },
    { name: "Campañas de verificación", w0: 13, w1: 14, out: "Campañas de energía, seguridad, autonomía, limpieza y conectividad" },
    { name: "Corrección y regresión", w0: 15, w1: 15, out: "Todo bloqueante de aceptación cerrado; candidato de liberación listo" },
    { name: "Aceptación y entrega", w0: 16, w1: 16, out: "Prueba final presenciada, documentación, entrega, firma" },
  ],
  gates: [
    { id: "G0", week: 0, name: "Inicio", crit: "Charter provisional firmado y NTP/luz verde escrita del Sponsor" },
    { id: "G1 · REQ", week: 1, name: "Revisión de requisitos", crit: "Requisitos y pruebas de aceptación congelados con usted" },
    { id: "G2 · DSN", week: 2, name: "Revisión de diseño", crit: "Diseño, interfaces y compras de entrega larga aprobados por usted" },
    { id: "G3", week: 8, name: "Subsistemas listos", crit: "Evidencia cuantitativa de cada subsistema aprobada contra su matriz" },
    { id: "G4", week: 12, name: "Funciones completas", crit: "Robot completamente integrado; congelación de funciones" },
    { id: "G5", week: 14, name: "Verificación completa", crit: "100% de pruebas obligatorias ejecutadas; P0 = 0; plan cerrado para P1" },
    { id: "G6", week: 16, name: "Aceptación final", crit: "Requisitos no dispensables aprobados, entrega aceptada y riesgos no críticos documentados" },
  ],

  // Objetivos medibles
  objectives: [
    { id: "OBJ-01", obj: "Entregar el producto final en 16 semanas", crit: "Prueba de Aceptación Final y entrega en la Semana 16" },
    { id: "OBJ-02", obj: "Controlar el costo del proyecto", crit: "Hardware base MXN $49,739.85 · forecast con contingencia MXN $57,200.83 · servicios profesionales MXN $160,000" },
    { id: "OBJ-03", obj: "Demostrar la autonomía energética", crit: "≥4.0 h desde 100% bajo el perfil de aceptación de peor caso de 200 W" },
    { id: "OBJ-04", obj: "Demostrar el cambio de acumulador", crit: "Cambio ≤5 min, sin reinicio de controles; meta de diseño de respaldo ≥10 min, confirmada con usted en la Semana 1" },
    { id: "OBJ-05", obj: "Demostrar movimiento seguro", crit: "Paro de emergencia, watchdog, tiempo límite de comandos, inhibición de motores, respuesta controlada a fallas" },
    { id: "OBJ-06", obj: "Demostrar autonomía", crit: "Mapeo, localización, navegación, replaneación, cobertura contra la matriz congelada de la Semana 1" },
    { id: "OBJ-07", obj: "Integrar percepción", crit: "Dos cámaras, LiDAR, IMU y sensores auxiliares calibrados y con sello de tiempo" },
    { id: "OBJ-08", obj: "Integrar irrigación", crit: "Control de flujo/nivel, comportamiento ante fugas, operación conjunta con la misión" },
    { id: "OBJ-09", obj: "Integrar conectividad", crit: "Servicios de backend y frontend, telemetría, comandos, recuperación de red y bitácora" },
    { id: "OBJ-10", obj: "Generar evidencia con intención de producción", crit: "BOM, revisiones, serialización, fixtures, pruebas repetibles para una fase posterior de hasta 10 unidades" },
  ],

  // Riesgos prioritarios
  risks: [
    { id: "R01", risk: "Calendario comprimido de 16 semanas", lvl: 10, response: "Congelar en las semanas 2 y 12, trabajo en paralelo y trabajo en curso limitado", trigger: "Retraso de la ruta crítica > 3 días" },
    { id: "R02", risk: "Equipo de dos personas", lvl: 10, response: "Prioridad para la ruta crítica, automatización y reserva del 20 % de capacidad para retrabajo", trigger: "Dos sprints perdidos" },
    { id: "R03", risk: "PCBs o componentes tardíos", lvl: 9, response: "Pedido anticipado, seguimiento y módulo de desarrollo de respaldo", trigger: "Amenaza a G3" },
    { id: "R04", risk: "Datos de celda o masa incorrectos", lvl: 9, response: "Hoja de datos, número de parte y muestra física en la Semana 1", trigger: "Cualquier discrepancia" },
    { id: "R05", risk: "Consumo promedio > 200 W", lvl: 8, response: "Instrumentación temprana y modelo energético correlacionado", trigger: "Pronóstico > 212 W" },
    { id: "R06", risk: "Inestabilidad de cambio en caliente, conector o respaldo", lvl: 8, response: "Conector con seguro, pruebas de inrush/térmicas/ciclos", trigger: "Reinicio, arco o calentamiento" },
    { id: "R07", risk: "Errores en sellos de tiempo o tramas", lvl: 8, response: "Base de tiempo única, sellos de tiempo en origen, reproducción y calibración", trigger: "Desplazamiento visible del mapa" },
    { id: "R08", risk: "Simulación no correlacionada", lvl: 7, response: "Compuertas de procedencia y correlación", trigger: "Error fuera de tolerancia" },
    { id: "R09", risk: "Fuga de irrigación hacia la electrónica", lvl: 7, response: "Segregación, rutas de goteo, sensor, prueba de fuga en banco", trigger: "Cualquier fuga" },
    { id: "R10", risk: "El alcance de software excede la capacidad", lvl: 7, response: "Clases y contratos de congelación; priorizar la ruta de aceptación de la Semana 10", trigger: "Integración incompleta" },
    { id: "R11", risk: "Forecast de hardware excede la autorización", lvl: 6, response: "Cotizaciones en destino, ledger semanal, contingencia controlada", trigger: "Forecast > MXN $58,000" },
    { id: "R12", risk: "Movimiento no controlado", lvl: 10, response: "Inhibición por hardware, paro de emergencia, watchdog, revisión técnica y pruebas por etapas", trigger: "Un evento: detener todo el trabajo y abrir P0" },
  ],

  // Semáforos de KPI
  kpis: [
    { kpi: "Desviación de hitos críticos", green: "≤2 días", yellow: "3–5 días", red: ">5 días" },
    { kpi: "Forecast de hardware", green: "≤ MXN $49,739.85", yellow: "MXN $49,739.86–$58,000", red: "> MXN $58,000" },
    { kpi: "Reserva antes de la Semana 12", green: "≥50%", yellow: "25–49%", red: "<25%" },
    { kpi: "Componentes críticos a tiempo", green: "≥95%", yellow: "85–94%", red: "<85%" },
    { kpi: "Pruebas obligatorias aprobadas al cierre de la Semana 14", green: "100%", yellow: "95–99% con cierre", red: "<95%" },
    { kpi: "P0 abiertos en cualquier liberación", green: "0", yellow: "No aplica", red: "≥1" },
    { kpi: "P1 abiertos en la liberación", green: "0", yellow: "1 con disposición conjunta", red: ">1" },
    { kpi: "Autonomía a 200 W", green: "≥4.0 h", yellow: "3.8–3.99 h", red: "<3.8 h" },
    { kpi: "Cambio de batería", green: "≤5 min", yellow: "5–6 min", red: ">6 min" },
    { kpi: "Movimiento no controlado", green: "0", yellow: "No aplica", red: "Cualquier evento" },
  ],

  changeClasses: [
    { cls: "Clase 1", cond: "Sin costo externo y sin impacto en la ruta crítica, las interfaces o la seguridad", appr: "Gerente de Proyecto" },
    { cls: "Clase 2", cond: "Costo ≤ MXN $1,000 e impacto ≤ 2 días, sin reducción de seguridad, sin uso de contingencia y sin activar Clase 3", appr: "Gerente de Proyecto + Lead Robotics & Systems Engineer" },
    { cls: "Clase 3", cond: "Costo > MXN $1,000, uso de reserva o impacto en arquitectura, interfaces, seguridad o hitos", appr: "Patrocinador" },
  ],

  freeze: [
    "Números de parte finales de BMS, IMU, cámaras y auxiliares; Jetson, ESP32-S3, celdas, motorreductores y dos RPLIDAR S2 se adoptan de esta propuesta",
    "Responsabilidad exacta del diseño de PCBs y contenido de la cotización en destino",
    "Confirmación de la meta de respaldo de controles de 10 minutos",
    "Ratificación o cambio Clase 3 de los valores provisionales de localización, cobertura, limpieza, percepción y conectividad",
    "Tiempo/distancia de frenado, límites ambientales, superficie y circuito de la Prueba de Aceptación Final",
    "Masa máxima aceptada del ensamble completo del acumulador",
    "Plan de respaldo ante retraso o falla de la primera revisión de PCB",
  ],

  scopeOut: [
    "Homologación regulatoria en esta fase",
    "Herramentales definitivos, moldes, chasis metálico o carcasa de producción",
    "Expansión de manufactura más allá de esta fase (evaluada después, hasta 10 unidades)",
    "Flota comercial completa, operación 24/7 o infraestructura de nube a escala",
    "Segundas o posteriores iteraciones completas de PCB de producción",
    "Garantía de desempeño fuera de los entornos y perfiles que congelemos juntos en la Semana 1",
    "Servicios u obligaciones posteriores a las 16 semanas, salvo pacto en el contrato futuro",
  ],

  acceptanceMatrix: [
    { id: "ACC-01", req: "Entrega integrada", target: "1 robot + 1 acumulador LFP + 1 cargador + software + paquete técnico", evidence: "Inspección y acta", rep: "1", waiver: "No" },
    { id: "ACC-02", req: "Autonomía", target: "≥4.0 h @200 W; modelo 960 Wh / 200 W = 4.8 h y 20% sobre 800 Wh", evidence: "Logs de energía/SoC/temperatura + FAT", rep: "Validación interna + 1 FAT", waiver: "No" },
    { id: "ACC-03", req: "Cambio de acumulador", target: "≤5 min, controles activos, sin arco/reinicio/pérdida de estado", evidence: "Cronómetro, video y logs", rep: "3", waiver: "No si inseguro" },
    { id: "ACC-04", req: "Paro e inhibición", target: "Estado seguro, sin rearranque automático; tiempo/distancia congelados en SRR", evidence: "Osciloscopio, video y fault injection", rep: "Cada modo/falla", waiver: "No" },
    { id: "ACC-05", req: "Movimiento no controlado", target: "0 eventos", evidence: "Hazard/defect log", rep: "Matriz completa", waiver: "No" },
    { id: "ACC-06", req: "Navegación y cobertura", target: "≥95% área alcanzable, 0 colisiones, ≥9/10 misiones", evidence: "Ground truth, mapa y rosbag", rep: "10", waiver: "Clase 3; nunca colisión insegura" },
    { id: "ACC-07", req: "Localización", target: "RMS ≤0.20 m; relocalización ≤30 s", evidence: "Ground truth + rosbag", rep: "3", waiver: "Clase 3 antes de FAT" },
    { id: "ACC-08", req: "Limpieza e irrigación", target: "≥90% remoción; flujo ±15%; 0 fugas a electrónica", evidence: "Before/after, flujo y leak test", rep: "3 zonas", waiver: "No para fuga" },
    { id: "ACC-09", req: "Percepción", target: "≥90% recall y ≤10% falsos positivos para clases congeladas", evidence: "Dataset versionado, replay y prueba física", rep: "Dataset + 3 corridas", waiver: "Clase 3 antes de FAT" },
    { id: "ACC-10", req: "Conectividad", target: "Recuperación ≤60 s; ≥99% telemetría esperada", evidence: "Logs robot/backend", rep: "3 ciclos", waiver: "Clase 3 antes de FAT" },
    { id: "ACC-11", req: "Seguridad eléctrica/térmica", target: "0 trips inesperados, celdas fuera de límite, sobre-rating o agua en electrónica", evidence: "Logs, inspección y fault/leak tests", rep: "Matriz completa", waiver: "No" },
    { id: "ACC-12", req: "Documentación", target: "100% del paquete técnico versionado", evidence: "Checklist de release", rep: "1", waiver: "P2 editorial" },
  ],

  defectClasses: [
    { cls: "P0", meaning: "Crítico / release blocker", rule: "Stop-work, causa raíz, corrección, regresión y cierre técnico; no admite waiver comercial" },
    { cls: "P1", meaning: "Mayor, sin hazard crítico", rule: "Cierre antes de FAT; excepción Sponsor + Senior Engineer con corrección ≤10 días hábiles" },
    { cls: "P2", meaning: "Menor/cosmético/editorial", rule: "Punch list permitido con corrección ≤20 días hábiles" },
  ],

  team: [
    { role: "Patrocinador", name: "Luis Vazquez", resp: "Aprueba la propuesta, el presupuesto, el uso de la contingencia y los cambios mayores; resuelve excepciones de alcance, costo y calendario; participa en cada compuerta y en la aceptación final." },
    { role: "Gerente de Proyecto", name: "Germán Velázquez", resp: "Responsable del alcance, calendario, costo, partes, compras, riesgos, cambios y documentación; es su único punto de contacto y coordina la línea de trabajo de software." },
    { role: "Lead Robotics & Systems Engineer", name: "Sebastian Barrio", resp: "Responsable de la arquitectura del robot y de las decisiones técnicas: mecánica, electrónica, batería, tarjetas, firmware, autonomía, percepción y evidencia de pruebas para cada afirmación." },
  ],
};
