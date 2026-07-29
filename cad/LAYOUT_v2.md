# RoboMop v2 — Concept Layout v2 (dimension chain spec)

Status: for approval · 2026-07-24 · Basis: verified component dims (see `research` dumps), user decisions D1–D5.
Envelope: **core robot ≤ 500 × 500 × 300 mm**; external mop arms excluded (D2).

## User decisions folded into v2

| # | Decision | Consequence |
|---|---|---|
| D1 | Two external mop pads on sprung arms, front + rear | Arms/pads drawn as phantom, outside envelope; pivots on front/rear faces at Z=70 |
| D2 | 50×50×30cm = core robot only | Body sized 480 × 450 × ~289 mm (LiDAR pod tops) |
| D3 | Top-load battery, vertical wide drawer (Option B 2×8 upright slab) | Bay 348×113 transverse over axle, hatch at top, SB50 whip at pack top terminals |
| D4 | 2 drive wheels + 1 rear caster, wheels forward | Axle Y=+35, caster at (0,−195); ~75–80% mass on driven wheels; statically determinate 3-pt support |
| D5 | PCBs ≥100×100 OK, centered, far from water, airflow | Front-center elevated deck, 2× 130×100 side-by-side, standoffs, chimney to deck vents |

## Verified component dims used (sources in research dumps)

| Part | Dims (mm) | Mass | Note |
|---|---|---|---|
| Gearmotor 60GP-60ZYT24X0SZ-B (family bound) | Ø60 × **200** L w/ encoder; shaft Ø12×28; 4×M5 face | ~1.8 kg | **UNVERIFIED exact SKU** — request seller 外形尺寸图 before machining (risk R04, sample W1) |
| Drive wheel (AstraRoll class) | Ø100 × 38, bore Ø12 keyed | 0.3 kg | 270 rpm → 5.09 km/h ✓ |
| Rear caster (Tente 50mm class) | overall H 69, plate 60×60 | 0.3 kg | 50 kg dyn rating vs ~10 kg actual |
| Battery pack 8S2P EVE C40, upright 2×8 + BMS bay | **348 × 113 × 175** (user sim + verified: cell Ø40.86×135.5, 140 w/ M6 hardware) | ~6.5 kg | 960 Wh; +30mm terminal/lid zone included in 175 |
| RPLIDAR S2 ×2 | Ø77 × 38.85 (80.6 w/ conn); 4×M3 on 41.7² pattern, depth ≤4mm | 185 g | window band est. +15..34 above base — keep +10..36 clear |
| Jetson Orin Nano Super Dev Kit | 100 × 79 × 21 | 174 g | on PCB2 deck |
| ESP32-S3-WROOM-1 | 18 × 25.5 × 3.1 (on PCB1) | ~3 g | — |
| PCB1 power/drivetrain | 130 × 100 (allocated) | ~0.4 kg | carries motor drivers, DC-DC bricks under deck |
| PCB2 carrier/interface | 130 × 100 (allocated) | ~0.4 kg | dev kit above on standoffs |
| 24V→12V 20A buck | 74 × 74 × 32 | 0.3 kg | under PCB deck, front floor |
| 24V→5V 10A buck | 66 × 58 × 23 | 0.11 kg | same |
| Backup pack (custom 8S1P 26650 class) | ~120 × 60 × 60 alloc | ~0.5 kg | ≥10 min controls ride-through |
| RealSense D435 (front depth cam) | 90 × 25 × 25 | 72 g | **budget conflict — see open items** |
| Peristaltic pump (Kamoer KK300-D-24V class) | ~90 × 66 × 67 | 0.32 kg | 14–290 ml/min ✓ (NKP-DA-S06B too slow, rejected) |
| Water tank, custom baffled slab | ~360 × 120 × 80 ext | ~0.4 + 3.0 kg water | ~3L net; XKC-Y25 through-wall level; rear-face fill port |
| E-stop 22mm latching | Ø22.3 hole, ≤60 behind panel | 30 g | right side face, below scan plane |
| SB50 hot-swap/charge | 48 × 35 × 16 housing | — | pack whip + left-flank charge port |

## Plan view (X ±240, Y ±225, front = +Y, origin at body center)

| Zone | Item | Position (X, Y) | Notes |
|---|---|---|---|
| Drive | Axle line | Y = +35 | wheels Ø100 at X = ±215, outer faces flush at ±235; track 430 |
| Drive | Gearmotors | from ±215 inward → ends at ±15 | 30mm gap between end caps, Z 20–80, **pass under battery bay** |
| Center | Battery bay 348×113 | X 0, Y −21.5…+91.5 | centroid on axle ✓; elevated floor Z=90; hatch hump to Z=268 |
| Front | PCB1 + PCB2 deck | X ±70, Y +120…+200, Z 145 | side-by-side, 20mm standoffs, Jetson above PCB2 |
| Front | Front LiDAR pod | (0, +185), base Z 250 | top 288.85 < 300 ✓; scan plane ~274.5 clears hatch hump (268) ✓ |
| Front | Depth camera | (0, front face), Z ~100 | tilt ~30° down, floor-dirt + low-obstacle view |
| Front | Backup pack + DC-DC bricks | (±150, +130), front floor | under PCB deck |
| Rear | Water tank | X ±180, Y −95…−215, Z 70–150 | over caster; baffled; fill port rear face Z 160 |
| Rear | Pump | (+150, −100), rear floor | short hose run to tank outlet |
| Rear | Caster | (0, −195), plate at Z 70 | rear floor stepped to 70 (caster H 69) |
| Rear | Rear LiDAR pod | (0, −185), base Z 250 | on removable rear service deck |
| Side | E-stop | right face (X +240), Y −150, Z 230 | below scan plane |
| Side | Charge port SB50 | left face (X −240), Y −150, Z 120 | panel mount |
| Phantom | Front mop arm | pivots (±150, +240 face), Z 70 | pad 400×120 (Unger 40cm class), 3mm 5052 plate, ~5 kg downforce |
| Phantom | Rear mop arm | pivots (±150, −240 face), Z 70 | same |

## Z stack

| Z (mm) | Layer |
|---|---|
| 0 | wheel/caster contact · mop pads (external) |
| 20–80 | gearmotors (Ø60 @ axle 50) — 20mm clearance under motor bodies |
| 30 | front floor plate |
| 70 | rear floor step (caster plate at 69) |
| 90 | **battery bay floor** (10mm above motor tops) |
| 90–265 | pack (175) · hatch hump to 268 |
| 145 | PCB deck |
| 250 | main top deck (front/rear) · LiDAR pod bases |
| 274.5 | LiDAR scan plane (clears hump by 6.5mm) |
| **288.85** | LiDAR pod tops — max robot height < 300 ✓ |

## Mass & stability budget

Pack 6.5 · motors 3.6 · wheels 0.6 · tank+water 3.4 · chassis/decks ~4 · electronics ~1.6 · misc ~2 → **≈ 22–24 kg**.
CG ≈ (X 0, Y ~+10, Z ~129). Static tip angle ≈ 59° lateral (half-track 215 / CGz 129) — very stable; CG inside support triangle ✓. Load split ≈ 78% wheels / 22% caster ✓ (D4 goal).

## Open items (freeze at W2 review)

1. **Gearmotor exact dims** — UNVERIFIED SKU; CAD bound = 200mm. Get seller drawing + W1 physical sample before machining mounts.
2. **Camera budget** — BOM allows MXN 2,198 for two cameras; D435 alone is ~$349. Options: (a) 1× D435 front + cheap RGB rear, (b) 2× RGB modules now, depth as phase-2 upgrade. Volume is reserved for D435-class either way.
3. **S2 window elevation** — est. +15..34 above base; confirm on physical unit; keep +10..36 band clear until then.
4. Tank baffle count + fill-port fitting — during tank CAD.
5. Mop arm pivot spring rate — after pad + downforce test rig.
