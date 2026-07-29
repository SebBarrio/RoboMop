# RoboMop v2 — Concept Layout v3 (dimension chain spec)

Status: for approval · 2026-07-24 · Supersedes LAYOUT_v2 (v3 = v2 + 4 user notes).
Envelope: **core robot ≤ 500 × 500 × 300 mm**; external mop arms excluded (D2). Max height now **268mm**.

**Visual direction (locked, Concept D3):** "A low, rounded-square industrial autonomous mop (480×450×268mm) in a rugged matte-black professional-tool aesthetic: a full-perimeter dark IR-transparent band conceals two recessed LiDARs under a smooth top cover with a cobalt-blue top-load battery hatch and matching corner guards, a red crown e-stop, side-mounted differential drive wheels with a rear caster, and external sprung-arm microfiber mop pads riding ahead of and behind the body." — render: `concepts/concept_D3_black_blue.png`

## v2 → v3 changes (user review notes)

| # | Note | v3 resolution |
|---|---|---|
| N1 | Front-view wheels/LiDARs are rectangles, not circles | Fixed in diagram (wheels 38×100 rects, S2 77×38.85 rect in elevations) |
| N2 | Base strength + single floor | **Single Z60 floor = 3mm 5052 Al pan** + 2× 20×20 extrusion rails at axle + 6mm 6061 motor bulkheads; printed parts = shell/decks only; caster in 9mm recessed pocket (or shim, TBD with SKU) |
| N3 | Tank fills empty space | Tank expanded to rear zone: ~360×130×85 gross ≈ **3.4L net**, wraps caster tower; CG shift ≈5mm rearward, negligible |
| N4 | Recessed LiDARs + IR strip | S2s on internal shelves at Z200, window band ~215–234, scan plane ~225 **below pack top 263** → battery tower = only occluder; 360° IR-pass strip Z205–240; blind zones = 2 flank triangles (verified, below); e-stop moves to top cover (above scan plane, non-occluding) |

## Blind-spot verification (N4)

Scan plane Z≈225. Everything interior except the battery tower (Z88–263) is below it.
LiDARs at F(0,+185), R(0,−185); tower footprint X±174, Y−21..+91.
Tangent fans: F past (±174,+91); R past (±174,−21). Double-blind = fan intersection =
**two triangles, vertices (±174,−21) / (±174,+91) / apex (±249.5, +50.2)** — ≈112mm base × 75mm deep,
apex ~10mm past the body wall. All other azimuths covered by ≥1 LiDAR.
Secondary occlusions to mask in software: 4 shelf-post wedges (~4° each, place in cross-covered azimuths),
fixed near-field return of the IR strip (~40mm at front/rear faces).

## Z stack (v3)

| Z (mm) | Layer |
|---|---|
| 0 | wheel/caster contact · mop pads (external) |
| 20–80 | gearmotors (Ø60 @ axle 50) through pan wells; 20mm clearance under motor bodies |
| 60 | **single floor — 3mm 5052 Al pan** (+ extrusion rails at axle) |
| 60–145 | tank (rear) · backup pack / DC-DC (front floor) |
| 88 | battery tray floor (8mm above motor tops, on rails) |
| 88–263 | pack (175) · hatch lid hump to 268 |
| 145–186 | PCB deck + Jetson |
| 200 | LiDAR shelves (front/rear) |
| 205–240 | **IR-pass strip**, full 360° perimeter |
| ~225 | **scan plane** (below pack top 263 → tower = only occluder) |
| 255 | top cover · e-stop on cover (above scan, non-occluding) |
| **268** | hatch hump = max height ✓ <300 |

## Structure & load path

Pack (6.5kg) → tray → 2× 20×20 rails → 6mm motor bulkheads → 3mm pan → axle plates → wheels.
No drivetrain/battery/swap-shock loads through printed parts. Printed: shell, cover, decks, tank, fairings (PA-CF/PETG-CF, heat-set inserts).

## Plan view (X ±240, Y ±225, front = +Y)

| Zone | Item | Position | Notes |
|---|---|---|---|
| Drive | Axle Y=+35; wheels Ø100×38 at X=±215 (faces flush ±235); track 430 | motors Ø60×~200 from ±215 inward, ends ±15 (30mm gap), through pan wells |
| Center | Battery bay 348×112 | X 0, Y −21..+91 | top-load, tray Z88, hatch hump 268 |
| Front | PCB1+PCB2 (130×100 each) | X ±70, Y 115..205, Z145 | side-by-side, vented; Jetson on PCB2 |
| Front | Backup pack + DC-DC | X −225..−145 / +150..+215, Y 115..175, floor | — |
| Front | S2 front | (0,+185), shelf Z200 | recessed; window 215–234 |
| Front | D435 | (0, front face), Z~100 | own optical window below strip |
| Rear | Tank ~3.4L | X ±180, Y −95..−225, Z60–145 | wraps caster tower (sealed notch), baffled |
| Rear | Pump KK300-D | X +105..+195, Y −90..−24, floor | — |
| Rear | Caster Ø50 (H69) | (0,−195), plate in 9mm pan pocket | single rear caster |
| Rear | S2 rear | (0,−185), shelf Z200 | recessed |
| Cover | E-stop 22mm | cover rear-right (~(+200,−200), Z255) | above scan plane |
| Side | SB50 charge port | left face (X−240, Y−150, Z120) | below strip |
| Phantom | Mop arms + pads 400×120 | pivots (±150, ±240 face), Z70 | external, excluded from envelope |

## Mass & stability (v3)

Pack 6.5 · drivetrain 4.5 · water system ~4.2 (3.4L) · electronics ~2.2 · structure ~5.0 (metal pan/rails + printed shell) · misc 1.7 → **≈ 24 kg wet**.
CG ≈ (0, −5, ~125) · lateral static tip ≈ 60° · split ≈ 75% wheels / 25% caster.

## Open items (W2)

1. Gearmotor exact dims (UNVER family bound 200mm) — seller drawing + W1 sample.
2. Camera budget (D435 vs 2×RGB).
3. S2 window elevation + min-range vs 40mm strip gap — measure on physical units; size strip band accordingly.
4. IR strip material selection (905nm pass, optical grade) + range derate test (~15–20%/pass budgeted).
5. Caster SKU → pocket depth (9mm vs shim).
