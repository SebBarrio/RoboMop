// ═══ RoboMop New Era · Project Proposal — data layer ═══
// RoboMop New Era · standalone client proposal data · July 2026.
// REDUCE flag must exist before any chart module executes (main.js re-sets it later).
window.REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
window.RPT = {

  meta: {
    title: "RoboMop New Era",
    version: "Project Proposal v1.0 · for approval",
    issued: "2026-07-16",
    compiled: "2026-07-21",
    sponsor: "Luis Vazquez",
    pm: "Germán Velázquez",
    senior: "Sebastian Barrio",
  },

  ask: {
    weeks: 16,
    base: 47097.85,
    contingency: 7064.68,
    bac: 54162.53,
    cap: 55000,
    minDelivery: "1 robot + 1 LFP accumulator",
    committedEarly: 0.8408, // share of base committable in weeks 1–2
  },

  // Locked electronics decisions (final component choices)
  decisions: {
    sbc: {
      pick: "Jetson Orin Nano 8GB", vendor: "NVIDIA",
      cost: "$249 dev kit · module $249 @1KU (street $300–380)",
      power: "7–15 W (25 W MAXN Super)", tops: "67 TOPS · 1024 CUDA + 32 Tensor",
      mem: "8 GB LPDDR5 · 102 GB/s", supply: "~5-yr class (NVIDIA FAQ)",
      verdict: "RECOMMENDED",
    },
    mcu: {
      pick: "ESP32-S3-WROOM-1", vendor: "Espressif",
      cost: "$6.76 @1 · $5.11 @100 · $3.90 @650",
      encoder: "Hardware PCNT pulse counters", bus: "TWAI (CAN 2.0) built-in",
      radio: "WiFi + BT, pre-certified", verdict: "RECOMMENDED",
    },
    pcbs: [
      { id: "PCB 1", role: "Power / drivetrain board, assembled", cost1: 160 },
      { id: "PCB 2", role: "Custom Jetson carrier board, assembled", cost1: 180 },
    ],
    mechanisms: [
      { id: "M1", name: "Hard real-time control loop", fix: "MCU owns the motor loop in FreeRTOS + hardware watchdog + MCPWM fault-input PWM kill", retires: "2025 BUG A · motor-control runaway, H-bridge overheating" },
      { id: "M2", name: "Hardware encoder capture", fix: "ESP32-S3 PCNT peripherals count quadrature edges in silicon, zero CPU load", retires: "2025 BUG B · encoder data lost after PCB integration" },
      { id: "M3", name: "Unified monotonic timebase", fix: "MCU timestamps odometry/IMU at capture, clock synced to the Jetson; robot_localization fuses against one clock", retires: "2025 BUG C · LiDAR/odometry/IMU desync, map drift" },
      { id: "M4", name: "Two-tier compute split", fix: "Perception, SLAM, Nav2 and connectivity on the SBC; deterministic control on the MCU", retires: "2025 BUG D · high-level vs real-time contention on one SoC" },
      { id: "M5", name: "Energy sizing first", fix: "Runtime computed from measured draws against the shift target before fabrication", retires: "2025 BUG E · ~25–30 min battery runtime" },
      { id: "M6", name: "Irrigation as first-class node", fix: "Pump, valve, water-level and flow wired to the MCU from day one; CAN trunk reserved for future nodes", retires: "2025 BUG F · irrigation never integrated" },
    ],
    link: "UART · micro-ROS · framed + CRC + timestamps",
  },

  // ── Estimated bill of materials · one table, all prices MXN ──
  // USD-sourced parts converted at a planning rate of MXN $18 per USD (spot ≈ $17.4, July 2026).
  // DEFINED = exact part pinned with a price · ESTIMATE = budgeted group, parts frozen at the Week-2 design review.
  fxNote: "USD-sourced parts converted at a planning rate of MXN $18 per USD (spot ≈ MXN $17.4, July 2026); account remainders absorb final landed differences.",
  bomTable: [
    { item: "Main computer", spec: "NVIDIA Jetson Orin Nano 8GB Super Dev Kit", gives: "Maps the building, plans routes, runs camera perception and the app — 67 TOPS at 7–15 W", qty: "1", mxn: 4482, unit: "MXN $4,482 ($249)", status: "DEFINED" },
    { item: "Solid-state storage", spec: "NVMe SSD 256 GB", gives: "Mandatory on the Orin carrier — the module has no eMMC", qty: "1", mxn: 756, unit: "MXN $756 ($42)", status: "DEFINED" },
    { item: "Real-time controller", spec: "ESP32-S3-WROOM-1 N16R8", gives: "Runs the motor and safety loop a thousand times a second and counts encoders in hardware; pre-certified radio", qty: "1", mxn: 122, unit: "MXN $122 ($6.76)", status: "DEFINED" },
    { item: "Drive gearmotors", spec: "60GP-60ZYT24X0SZ-B · 24 V · 100 W · 1:18 · 270 rpm · 500 ppr encoder", gives: "Two traction units sized for the full cleaning load, quadrature encoders counted in hardware", qty: "2", mxn: 1800, unit: "MXN $900 each ($50 · AliExpress listing estimate)", status: "DEFINED" },
    { item: "Battery cells", spec: "LiFePO4 40135 · 3.2 V · 20 Ah — 16 cells in 8S2P (25.6 V · 40 Ah)", gives: "The 960 Wh basis of the runtime model; safe, long-cycle-life LFP chemistry", qty: "16", mxn: 7200, unit: "MXN $450 each ($25 · AliExpress listing estimate)", status: "DEFINED" },
    { item: "LiDAR scanners", spec: "RPLIDAR S2 · 360° · front and rear", gives: "Laser scanning both directions for mapping and obstacle detection", qty: "2", mxn: 5500, unit: "MXN $5,500 the pair — actual purchase price", status: "DEFINED" },
    { item: "Compute landed costs", spec: "Shipping, import and taxes on the Jetson kit and SSD", qty: "—", mxn: 3262, status: "ESTIMATE" },
    { item: "Pack assembly + BMS", spec: "BMS, busbars, enclosure and assembly of the 8S2P accumulator", qty: "—", mxn: 2800, status: "ESTIMATE" },
    { item: "Drivetrain mechanics", spec: "Mounts, couplings and drive mechanics around the gearmotors", qty: "—", mxn: 5199.85, status: "ESTIMATE" },
    { item: "Custom PCBs", spec: "PCB 1 power/drivetrain (motor drivers + DC-DC rails) and PCB 2 Jetson carrier — fabrication, components, assembly, provisional tax", qty: "2 boards", mxn: 3478, status: "ESTIMATE" },
    { item: "Cameras", spec: "Two perception cameras for dirt and low-obstacle detection", qty: "2", mxn: 2198, status: "ESTIMATE" },
    { item: "IMU + auxiliary sensors", spec: "Balance of the sensor account after the LiDAR purchase", qty: "—", mxn: 2800, status: "ESTIMATE" },
    { item: "Irrigation", spec: "Pump, valve, tank, water-level and flow sensing", qty: "—", mxn: 1200, status: "ESTIMATE" },
    { item: "3D chassis + mechanical", spec: "Printed structure, wheels, casters and mechanical hardware", qty: "—", mxn: 1000, status: "ESTIMATE" },
    { item: "Harnesses, connectors, safety", spec: "Rated locking connectors, E-stop chain, cabling", qty: "—", mxn: 1500, status: "ESTIMATE" },
    { item: "Testing, logistics, consumables", spec: "Test campaigns, shipping and bench consumables", qty: "—", mxn: 1800, status: "ESTIMATE" },
    { item: "Charger, backup, hot swap", spec: "LFP-compatible charger, control-backup rail and the swap mechanism", qty: "—", mxn: 2000, status: "ESTIMATE" },
  ],

  // Compute-electronics cost per robot at three volumes (MXN, at the $18/USD planning rate)
  bomVol: [
    { item: "Jetson Orin Nano 8GB", basis: "Super Dev Kit @1u · production module @10/100u", u1: 4482, u10: 4482, u100: 4482 },
    { item: "NVMe SSD 256 GB", basis: "mandatory on Orin carrier (no eMMC)", u1: 756, u10: 756, u100: 684 },
    { item: "Custom carrier PCB (PCB 2), assembled", basis: "prototype run → panelized", u1: 3240, u10: 2160, u100: 1404 },
    { item: "ESP32-S3-WROOM-1 N16R8", basis: "distributor tier pricing", u1: 122, u10: 100, u100: 92 },
    { item: "Power / drivetrain PCB (PCB 1), assembled", basis: "prototype run → panelized", u1: 2880, u10: 1890, u100: 1188 },
    { item: "CAN transceiver + locking connectors", basis: "TJA1051-class, rated for current", u1: 252, u10: 198, u100: 144 },
    { item: "Regulators, hot-swap switchover, passives", basis: "backup rail for control electronics", u1: 630, u10: 504, u100: 378 },
  ],
  bomVolTotals: { u1: 12362, u10: 10090, u100: 8372 },

  // Power model (defaults on a 960 Wh pack, 24 V · 40 Ah)
  power: {
    packWh: 960, packSpec: "24 V · 40 Ah LFP",
    sbcW: 10, idleW: 5, tractionW: 185,
    avgW: 200, acceptH: 4.0,
    computeWh: 60, tractionWh: 740, marginWh: 160,
    runtimeH: 4.8, marginPct: 20,
    swapMin: 5, runtime2H: 9.6,
    computeSharePct: 7.5,
    charterAcceptance: "≥4.0 h from 100% under the 200 W worst-case acceptance profile",
  },

  // Program budget (charter §9, MXN)
  budget: [
    { account: "Jetson + SSD", base: 8500.00 },
    { account: "Accumulator + BMS", base: 10000.00 },
    { account: "Two motors / drivetrain", base: 6999.85 },
    { account: "PCBs China, components, assembly, provisional tax", base: 3600.00 },
    { account: "Two cameras", base: 2198.00 },
    { account: "LiDAR, IMU and new auxiliary sensors", base: 8300.00 },
    { account: "Irrigation", base: 1200.00 },
    { account: "3D chassis and mechanical consumables", base: 1000.00 },
    { account: "Harnesses, connectors and safety", base: 1500.00 },
    { account: "Testing, logistics and consumables", base: 1800.00 },
    { account: "Charger, backup and hot swap", base: 2000.00 },
  ],

  // 16-week integrated plan (charter §8)
  phases: [
    { name: "Authorization & requirements", w0: 1, w1: 1, out: "Scope, requirements and acceptance tests agreed and frozen" },
    { name: "Design approval & purchasing", w0: 2, w1: 2, out: "Design approved by you; long-lead parts ordered" },
    { name: "Concurrent design & simulation", w0: 3, w1: 4, out: "Robot CAD, battery-swap design, circuit boards, digital twin" },
    { name: "Subsystem build & bench tests", w0: 5, w1: 8, out: "Battery, drivetrain, irrigation, control and sensors proven on the bench" },
    { name: "Incremental integration", w0: 8, w1: 12, out: "The robot drives, maps, irrigates and connects — step by step" },
    { name: "Feature freeze", w0: 12, w1: 12, out: "No new scope; complete system configured" },
    { name: "Verification campaigns", w0: 13, w1: 14, out: "Energy, safety, autonomy, cleaning and connectivity test campaigns" },
    { name: "Correction & regression", w0: 15, w1: 15, out: "Every acceptance blocker closed; release candidate ready" },
    { name: "Acceptance & delivery", w0: 16, w1: 16, out: "Witnessed final test, documentation, handover, signature" },
  ],
  gates: [
    { id: "G0", week: 0, name: "Start", crit: "Proposal and funding approved" },
    { id: "G1 · REQ", week: 1, name: "Requirements review", crit: "Requirements and acceptance tests frozen with you" },
    { id: "G2 · DSN", week: 2, name: "Design review", crit: "Design, interfaces and long-lead purchases approved by you" },
    { id: "G3", week: 8, name: "Subsystem readiness", crit: "Every subsystem demonstrated independently" },
    { id: "G4", week: 12, name: "Feature complete", crit: "Robot fully integrated; feature freeze" },
    { id: "G5", week: 14, name: "Verification complete", crit: "Full test matrix executed" },
    { id: "G6", week: 16, name: "Final acceptance", crit: "You accept the delivery and any residual risks" },
  ],

  // Measurable objectives (charter §3)
  objectives: [
    { id: "OBJ-01", obj: "Deliver the final product in 16 weeks", crit: "Final Acceptance Test and handoff in Week 16" },
    { id: "OBJ-02", obj: "Control project cost", crit: "Base MXN $47,097.85 · BAC MXN $54,162.53 · cap MXN $55,000" },
    { id: "OBJ-03", obj: "Demonstrate energy autonomy", crit: "≥4.0 h from 100% under the 200 W worst-case acceptance profile" },
    { id: "OBJ-04", obj: "Demonstrate accumulator swap", crit: "Swap ≤5 min, no control reboot; backup design target ≥10 min, confirmed with you in Week 1" },
    { id: "OBJ-05", obj: "Demonstrate safe motion", crit: "E-stop, watchdog, command timeout, motor inhibit, controlled fault response" },
    { id: "OBJ-06", obj: "Demonstrate autonomy", crit: "Mapping, localization, navigation, replanning, coverage against the Week-1 frozen test matrix" },
    { id: "OBJ-07", obj: "Integrate perception", crit: "Two cameras, LiDAR, IMU and auxiliary sensors calibrated and timestamped" },
    { id: "OBJ-08", obj: "Integrate irrigation", crit: "Flow/level control, leak behavior, joint operation with the mission" },
    { id: "OBJ-09", obj: "Integrate connectivity", crit: "Backend/frontend, telemetry, commands, network recovery, logging" },
    { id: "OBJ-10", obj: "Generate production-intent evidence", crit: "BoM, revisions, serialization, fixtures, repeatable tests for a later phase of up to 10 units" },
  ],

  // Priority risks (charter §10)
  risks: [
    { id: "R01", risk: "Compressed 16-week schedule", lvl: 10, response: "Freeze W2/W12, parallel work, limited WIP", trigger: "Critical slip >3 days" },
    { id: "R02", risk: "Two-person team", lvl: 10, response: "Critical-path priority, automation, 20% rework capacity", trigger: "Two sprints missed" },
    { id: "R03", risk: "Late PCBs / components", lvl: 9, response: "Early order, tracking, dev-module fallback", trigger: "Threat to G3" },
    { id: "R04", risk: "Wrong cell or mass data", lvl: 9, response: "Datasheet, part number and physical sample in W1", trigger: "Any discrepancy" },
    { id: "R05", risk: "Average draw >200 W", lvl: 8, response: "Early instrumentation, correlated energy model", trigger: "Forecast >212 W" },
    { id: "R06", risk: "Hot swap, connector or backup instability", lvl: 8, response: "Locking connector, inrush/thermal/cycle tests", trigger: "Reset, arc or heating" },
    { id: "R07", risk: "Timestamp / frame errors", lvl: 8, response: "Single timebase, source timestamps, replay/calibration", trigger: "Visible map offset" },
    { id: "R08", risk: "Uncorrelated simulation", lvl: 7, response: "Provenance and correlation gates", trigger: "Error out of tolerance" },
    { id: "R09", risk: "Irrigation leak toward electronics", lvl: 7, response: "Segregation, drip paths, sensor, bench leak test", trigger: "Any leak" },
    { id: "R10", risk: "Scope/software exceeds capacity", lvl: 7, response: "Freeze classes/contracts, prioritize acceptance path W10", trigger: "Incomplete integration" },
    { id: "R11", risk: "EAC exceeds authorization", lvl: 6, response: "Landed quotes, weekly EAC, controlled contingency", trigger: "EAC >$55,000" },
    { id: "R12", risk: "Uncontrolled motion", lvl: 6, response: "Hardware inhibit, E-stop, watchdog, staged tests", trigger: "One event: stop-work" },
  ],

  // KPI traffic lights (charter §12)
  kpis: [
    { kpi: "Critical milestone variance", green: "≤2 days", yellow: "3–5 days", red: ">5 days" },
    { kpi: "EAC", green: "≤$47,097.85", yellow: "$47,097.86–$54,162.53", red: ">$55,000" },
    { kpi: "Reserve before W12", green: "≥50%", yellow: "25–49%", red: "<25%" },
    { kpi: "Critical parts on time", green: "≥95%", yellow: "85–94%", red: "<85%" },
    { kpi: "Mandatory tests passed W14", green: "≥95%", yellow: "80–94%", red: "<80%" },
    { kpi: "Open P0/P1 at release", green: "0", yellow: "1 with disposition", red: ">1" },
    { kpi: "Runtime at 200 W", green: "≥4.0 h", yellow: "3.8–3.99 h", red: "<3.8 h" },
    { kpi: "Swap", green: "≤5 min", yellow: "5–6 min", red: ">6 min" },
    { kpi: "Uncontrolled motion", green: "0", yellow: "N/A", red: "Any event" },
  ],

  changeClasses: [
    { cls: "Class 1", cond: "No external cost, no critical path, interface or safety impact", appr: "PM" },
    { cls: "Class 2", cond: "Cost ≤MXN $1,000 or ≤2 days impact, no safety reduction", appr: "PM + Senior Engineer" },
    { cls: "Class 3", cond: "Cost >MXN $1,000, reserve use, architecture, interface, safety or milestone", appr: "Sponsor" },
  ],

  freeze: [
    "Final part numbers: cells, BMS, LiDAR, IMU, controller, PCBs",
    "Exact PCB design responsibility and landed-quote content",
    "Confirmation of the 10-minute control-backup target",
    "Localization, coverage, cleaning, perception and braking metrics",
    "Environmental limits and surfaces of the Final Acceptance Test",
    "Accepted maximum mass of the complete accumulator assembly",
    "Fallback for delay or failure of the first PCB revision",
  ],

  scopeOut: [
    "Regulatory homologation in this phase",
    "Definitive tooling, molds, metal chassis or production enclosure",
    "Manufacturing expansion beyond this phase (evaluated later, up to 10 units)",
    "Full commercial fleet, 24/7 operation or cloud infrastructure at scale",
    "Second or further full production-PCB iterations",
    "Performance guarantee outside the environments and profiles we freeze together in Week 1",
    "Labor inside the materials budget",
  ],

  team: [
    { role: "Sponsor", name: "Luis Vazquez", resp: "Approves the proposal, budget, contingency use and major changes; resolves scope, cost and schedule exceptions; present at every gate and at final acceptance." },
    { role: "Project Manager", name: "Germán Velázquez", resp: "Owns scope, schedule, cost, parts, procurement, risks, changes and documentation; your single point of contact; coordinates the software workstream." },
    { role: "Senior Engineer", name: "Sebastian Barrio", resp: "Owns the robot's architecture and technical decisions: mechanics, electronics, battery, boards, firmware, autonomy, perception and the test evidence behind every claim." },
  ],
};
