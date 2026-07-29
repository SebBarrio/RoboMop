# RoboMop v2 — Solidified BOM v1 (CAD-ready)

2026-07-24 · Basis: proposal v1.0 pinned parts + verified dimensions from 3-source research (files: `~/robomop_v2_bom_dimensions.md`, `~/robomop_v2_drivetrain_dims.md`, `~/robomop_research/RoboMop_v2_CAD_dimensions.md`).
Status legend: **DEFINED** = pinned in proposal · **FROZEN** = part class + dims selected, SKU freeze at W2 gate · **ALLOC** = volume reserved, part designed around it · **UNVER** = dims estimated, physical confirmation required.

## A. Pinned (proposal) — dims verified

| # | Part | Spec | Qty | Dims (mm) | Mass | Status |
|---|---|---|---|---|---|---|
| A1 | NVIDIA Jetson Orin Nano 8GB Super Dev Kit | 67 TOPS, 7–15W | 1 | 100 × 79 × 21 | 174 g | DEFINED ✓ |
| A2 | NVMe SSD 256GB, M.2 2280 | mandatory on carrier | 1 | 80 × 22 × ≤3.6 | ~7 g | DEFINED ✓ |
| A3 | ESP32-S3-WROOM-1 N16R8 | FreeRTOS MCU, on PCB1 | 1 | 18.0 × 25.5 × 3.1 | ~3 g | DEFINED ✓ |
| A4 | 60GP-60ZYT24X0SZ-B gearmotor 24V 100W 1:18 270rpm 500ppr | traction | 2 | Ø60 × **200** L w/ encoder (bound); shaft Ø12×28; 4×M5 face | ~1.8 kg ea | DEFINED part · **UNVER dims** (4-source family consensus; seller drawing + W1 sample req'd) |
| A5 | EVE C40 (IFR40135) 20Ah LFP cell | 8S2P = 25.6V 40Ah 960Wh | 16 | Ø40.86 max × 135.5 (140 w/ M6 hardware) | 364 g ea | DEFINED ✓ (EVE spec RD-C40-S01-LF rev.C) |
| A6 | RPLIDAR S2 | 360°, front+rear | 2 | Ø77 × 38.85 (80.6 w/ conn.); 4×M3 on 41.7² pattern, depth ≤4mm | 185 g ea | DEFINED ✓ (official 2D drawing) |

## B. Frozen choices (former budget groups)

| # | Part | Choice / class | Qty | Dims (mm) | Mass | Status |
|---|---|---|---|---|---|---|
| B1 | Drive wheel | AstraRoll 100mm alu-hub solid rubber, bore machined Ø12 keyed | 2 | Ø100 × 38 | 0.3 kg ea | FROZEN (270rpm → 5.09 km/h ✓) |
| B2 | Rear caster | Tente 2470 50mm plate swivel class | 1 | overall H 69, plate 60×60, Ø50 wheel | 0.3 kg | FROZEN (50 kg rating vs ~10 kg load) |
| B3 | BMS (in-pack) | DALY 8S 24V 40A class, 20A charge | 1 | 82 × 60 × 8.5 | 87 g | FROZEN |
| B4 | 24V→12V buck | WEHO WH-C241220 sealed 20A | 1 | 74 × 74 × 32 | 300 g | FROZEN |
| B5 | 24V→5V buck | WEHO WH-C12240510 sealed 10A | 1 | 66 × 58 × 23 | 110 g | FROZEN |
| B6 | E-stop | 22mm latching, twist-reset (RAFI LUMOTAST class) | 1 | Ø22.3 hole, ≤60 behind panel | ~30 g | FROZEN (top-cover mount, rear-right, above scan plane) |
| B7 | Hot-swap connector | Anderson SB50 (pack whip + chassis) | 2 | 48 × 35.1 × 15.9 housing | — | FROZEN |
| B8 | Charge port | SB50 panel, left flank | 1 | as B7 | — | FROZEN |
| B9 | Backup pack (controls ride-through ≥10 min) | custom 8S1P 26650-class ~8–10Wh | 1 | ~120 × 60 × 60 alloc | ~0.5 kg | ALLOC (fallback: 24V 3Ah LFP 155×50×72, 800g — oversized) |
| B10 | Front depth camera | RealSense D435-class volume | 1 | 90 × 25 × 25 | 72 g | ALLOC — **budget conflict open** (see LAYOUT_v2 open items) |
| B11 | Rear camera | small RGB module | 1 | ~30 × 25 × 20 alloc | ~20 g | ALLOC |
| B12 | Pump | Kamoer KK300-D-24V peristaltic (14–290 ml/min) | 1 | ~90 × 66 × 67 | 320 g | FROZEN (NKP-DA-S06B 38–59 ml/min rejected — below target) |
| B13 | Water tank | custom baffled slab filling rear zone, wraps caster tower, through-wall level sensing | 1 | ~360 × 130 × 85 ext (~3.4L net) | ~0.5 kg | ALLOC (shaped per LAYOUT_v3) |
| B14 | Level sensor | XKC-Y25-V capacitive, non-contact | 1 | 28 × 28 × ~15 + cable | 35 g | FROZEN (power from 5–12V rail, not raw pack) |
| B15 | IMU | on PCB1 (ICM-20948-class) | 1 | on-board | — | ALLOC |
| B16 | PCB1 power/drivetrain | custom, carries A3 + motor drivers + B15 | 1 | 130 × 100 alloc | ~0.4 kg | ALLOC |
| B17 | PCB2 carrier/interface | custom, hosts dev kit | 1 | 130 × 100 alloc | ~0.4 kg | ALLOC |
| B18 | IR-pass perimeter strip | 905nm-pass optical-grade PC/PMMA band, full 360° | 1 | Z205–240 band, ~3mm × 35mm × ~1.45m | ~0.2 kg | ALLOC (range derate ~15–20%/pass — test W8) |

## C. Structure (allocated)

| # | Item | Dims / note | Status |
|---|---|---|---|
| C1 | Base frame: 3mm 5052 Al pan + 2× 20×20 extrusion rails @ axle + 6mm 6061 motor bulkheads | 480 × 450 pan, single Z60 datum; wheel/motor wells cut in pan; caster in 9mm pocket | ALLOC — primary structure, printed parts carry no drivetrain/battery loads |
| C2 | Battery tray (elevated, top-load) | 348 × 112 × 175 pack space; tray Z88 on rails; hatch hump to Z268; SB50 whip stow in lid | ALLOC |
| C3 | LiDAR recess: 2 shelves @ Z200 + 360° IR-pass strip | scan plane ~225 (below pack top 263 → tower = only occluder); strip Z205–240, 905nm-pass optical grade; blind = 2 flank Δ (112×75) | ALLOC |
| C4 | PCB deck (front-center) | Z145, 20mm standoffs, 280×100 plate, intake/exhaust vents | ALLOC |
| C5 | Body shell + top cover | 480 × 450 rounded-square, R40 corners; cover Z255, max 268 (hatch); e-stop on cover | ALLOC |

## D. External mop set (outside 500×500×300 envelope, per D2)

| # | Item | Dims (mm) | Status |
|---|---|---|---|
| D1 | Front mop pad (Unger SmartColor 40cm class) | ~400 × 120 × 10 | FROZEN class |
| D2 | Rear mop pad | as D1 | FROZEN class |
| D3 | Mop plates | 3mm 5052 aluminum, 450 span, <1mm deflection @ 50N | ALLOC |
| D4 | Swing arms + torsion springs | pivots on front/rear faces at (±150, Z70); ~5 kg downforce per pad | ALLOC |
| D5 | Drip manifolds | fed from B12 pump; front primary, rear secondary | ALLOC |

## Mass roll-up

| Group | kg |
|---|---|
| Battery pack (16×364g cells + BMS + tray) | ~6.5 |
| Drivetrain (2 motors, 2 wheels, caster) | ~4.5 |
| Water system (tank, pump, 3.4L water) | ~4.2 |
| Electronics (A1–A3, B4–B18, PCBs) | ~2.4 |
| Structure (Al pan + rails + bulkheads + printed shell) | ~5.0 |
| Harness, connectors, misc | ~1.7 |
| **Total (wet)** | **~24.3 kg** |

CG ≈ (0, −5, ~125mm) · lateral static tip ≈ 60° · load split ≈ 75% drive wheels / 25% caster · max height 268 < 300 ✓

## Open items → W2 design review

1. Gearmotor exact dims (UNVER) — seller 外形尺寸图 + W1 physical sample before machining mounts.
2. Camera budget: MXN 2,198 vs D435 ~$349 — decide 1×D435+RGB vs 2×RGB now.
3. S2 window elevation (+15..34 est.) — confirm on physical unit.
4. Mop arm spring rate — after pad downforce rig test.
