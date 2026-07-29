#!/usr/bin/env python3
"""RoboMop v2 — Layout v3 bounding-box diagram (all units mm).
Generates cad/robomop_layout_v3.png — approval artifact.
Per cad/LAYOUT_v3.md: single Z60 metal pan floor, recessed LiDARs + IR strip,
battery-tower occlusion fans + flank blind triangles, ~3.4L rear tank.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle, FancyBboxPatch, Patch, Polygon
import os

C_BATT = "#ff9f1c"; C_DRIVE = "#8d99ae"; C_WATER = "#3a86ff"; C_ELEC = "#38b000"
C_SENS = "#9d4edd"; C_SAFE = "#e63946"; C_BODY = "#ced4da"; C_PHAN = "#6c757d"
C_IR = "#c77dff"; C_BLIND = "#ff0a0a"; C_METAL = "#b08968"

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "robomop_layout_v3.png")
# CLEAN=1 → grounding variant for image generation: no LiDAR occlusion fans/triangles
CLEAN = os.environ.get("CLEAN") == "1"
if CLEAN:
    OUT = OUT.replace("_v3.png", "_v3_clean.png")


def box(ax, x0, y0, w, h, fc, label=None, ec="k", lw=1.0, alpha=0.55, ls="-",
        fs=6.5, tc="k", z=2, rot=0):
    r = Rectangle((x0, y0), w, h, facecolor=fc, edgecolor=ec, lw=lw,
                  alpha=alpha, linestyle=ls, zorder=z)
    ax.add_patch(r)
    if label:
        ax.text(x0 + w / 2, y0 + h / 2, label, ha="center", va="center",
                fontsize=fs, color=tc, zorder=z + 1, rotation=rot)
    return r


def dim_h(ax, x0, x1, y, label, fs=7, color="k", above=True):
    ax.annotate("", xy=(x0, y), xytext=(x1, y),
                arrowprops=dict(arrowstyle="<->", lw=0.9, color=color), zorder=5)
    ax.text((x0 + x1) / 2, y + (4 if above else -4), label, ha="center",
            va="bottom" if above else "top", fontsize=fs, color=color, zorder=5)


def dim_v(ax, y0, y1, x, label, fs=7, color="k"):
    ax.annotate("", xy=(x, y0), xytext=(x, y1),
                arrowprops=dict(arrowstyle="<->", lw=0.9, color=color), zorder=5)
    ax.text(x + 4, (y0 + y1) / 2, label, ha="left", va="center", fontsize=fs,
            color=color, rotation=90, zorder=5)


fig = plt.figure(figsize=(20, 8.8))
ax1 = fig.add_subplot(131)  # plan
ax2 = fig.add_subplot(132)  # side
ax3 = fig.add_subplot(133)  # front

# ════════════════════ PANEL 1 — PLAN VIEW (top) ════════════════════
ax = ax1
ax.set_xlim(-330, 330); ax.set_ylim(-420, 420); ax.set_aspect("equal")
ax.set_title("PLAN (top view)" + ("" if CLEAN else " — LiDAR occlusion fans + blind Δ"),
             fontsize=10, weight="bold")

# envelope + body
ax.add_patch(Rectangle((-250, -250), 500, 500, fill=False, ec=C_SAFE,
                       ls=(0, (6, 4)), lw=1.5, zorder=1))
ax.text(0, 254, "500×500 ENVELOPE", ha="center", fontsize=7.5, color=C_SAFE)
ax.add_patch(FancyBboxPatch((-240, -225), 480, 450,
                            boxstyle="round,pad=0,rounding_size=40",
                            fc=C_BODY, ec="k", lw=1.2, alpha=0.35, zorder=1))
ax.text(-238, 231, "body 480×450 · single Z60 Al-pan floor", fontsize=6.5, color="k")

# LiDAR occlusion fans + blind triangles (suppressed in CLEAN grounding variant)
if not CLEAN:
    # F(0,+185) fan past tower corners (±174,+91), extending south
    ax.add_patch(Polygon([(0, 185), (-1150, -420), (1150, -420)], closed=True,
                         fc=C_BLIND, ec="none", alpha=0.05, zorder=1))
    # R(0,-185) fan past (±174,-21), extending north
    ax.add_patch(Polygon([(0, -185), (-660, 420), (660, 420)], closed=True,
                         fc=C_BLIND, ec="none", alpha=0.05, zorder=1))
    # tangent rays
    for (x0, y0, x1, y1) in [(0, 185, -1150, -420), (0, 185, 1150, -420),
                             (0, -185, -660, 420), (0, -185, 660, 420)]:
        ax.plot([x0, x1], [y0, y1], color=C_BLIND, lw=0.6, ls=":", alpha=0.7, zorder=1)
    # double-blind triangles (verified: apex (±249.5, +50.2))
    for s in (1, -1):
        tri = Polygon([(s * 174, -21), (s * 174, 91), (s * 249.5, 50.2)], closed=True,
                      fc=C_BLIND, ec="k", lw=0.8, alpha=0.45, hatch="///", zorder=4)
        ax.add_patch(tri)
    ax.annotate("BLIND Δ (neither LiDAR)\n≈112 base × 75 deep\napex ~10mm past wall",
                xy=(249.5, 50), xytext=(262, 130), fontsize=6, color=C_BLIND,
                arrowprops=dict(arrowstyle="->", lw=0.7, color=C_BLIND))

# battery bay (the only occluder above scan plane)
box(ax, -174, -21, 348, 112, C_BATT, "BATTERY TOWER 348×112\ntray Z88 · pack top Z263\n= ONLY occluder @ scan Z225",
    fs=7, z=3)
# wheels + motors
for s in (1, -1):
    box(ax, s * 196 if s > 0 else s * 234, -15, 38, 100, C_DRIVE, None, z=3)
    box(ax, s * 15 if s > 0 else s * 215, 5, 200, 60, C_DRIVE, None, z=2)
    box(ax, s * 15 if s > 0 else s * 40, 5, 25, 60, "#5c677d", None, z=3)
ax.text(120, 35, "MOTOR R Ø60×~200", fontsize=6, ha="center", zorder=4)
ax.text(-120, 35, "MOTOR L Ø60×~200", fontsize=6, ha="center", zorder=4)
ax.axhline(35, color=C_DRIVE, lw=0.7, ls=":", zorder=1)
ax.text(241, 40, "axle Y+35", fontsize=6, color=C_DRIVE)
# extrusion rails at axle
for y in (20, 50):
    ax.plot([-215, 215], [y, y], color=C_METAL, lw=2.5, zorder=2)
ax.text(-213, 12, "2× 20×20 Al rails", fontsize=5.5, color=C_METAL)

# PCB deck
box(ax, -135, 115, 130, 90, C_ELEC, "PCB1 power\n130×100", fs=6.5, z=3)
box(ax, 5, 115, 130, 90, C_ELEC, "PCB2 carrier\n130×100", fs=6.5, z=3)
box(ax, 20, 122, 100, 76, "#70e000", "Jetson", fs=6, z=4)
ax.text(0, 214, "PCB deck @ Z145 (vented)", fontsize=6, ha="center", zorder=4)
box(ax, -225, 115, 80, 60, C_ELEC, "backup\npack", fs=6, z=3)
box(ax, 150, 115, 65, 55, C_ELEC, "DC-DC", fs=6, z=3)

# tank (fills rear zone) + caster tower notch + pump
box(ax, -180, -225, 360, 130, C_WATER, "WATER TANK ~3.4L net\n360×130×85 · baffled · fills rear zone",
    fs=7, z=2)
box(ax, -33, -225, 66, 66, "#ffffff", ec="k", lw=1.0, z=3)
ax.text(0, -192, "caster\ntower", fontsize=5.5, ha="center", zorder=4)
box(ax, 105, -90, 90, 66, C_WATER, "PUMP KK300-D", fs=6, z=3)
ax.add_patch(Circle((0, -195), 25, fc=C_DRIVE, ec="k", alpha=0.6, zorder=4))

# recessed LiDARs
ax.add_patch(Circle((0, 185), 38.5, fc=C_SENS, ec="k", alpha=0.55, zorder=4))
ax.text(0, 185, "S2", fontsize=7, ha="center", va="center", zorder=5, weight="bold")
ax.text(52, 152, "S2 FRONT Ø77 · recessed\nshelf Z200 · scan ~225", fontsize=6, ha="left", zorder=5, color=C_SENS)
ax.add_patch(Circle((0, -185), 38.5, fc=C_SENS, ec="k", alpha=0.55, zorder=4))
ax.text(0, -185, "S2", fontsize=7, ha="center", va="center", zorder=5, weight="bold")
ax.text(52, -140, "S2 REAR Ø77 · recessed", fontsize=6, ha="left", zorder=5, color=C_SENS)
# IR strip (perimeter band on body edge, plan = thin band at walls)
ax.add_patch(FancyBboxPatch((-240, -225), 480, 450,
                            boxstyle="round,pad=0,rounding_size=40",
                            fc="none", ec=C_IR, lw=3.5, alpha=0.8, zorder=2))
ax.text(-236, -256, "IR-pass strip 360° perimeter @ Z205–240", fontsize=6.5, color=C_IR)

# camera, e-stop, charge port
box(ax, -45, 225, 90, 13, C_SENS, None, z=4)
ax.text(0, 243, "D435 depth cam (own window, Z~100)", fontsize=6, ha="center")
ax.plot(200, -200, marker="o", ms=9, mfc=C_SAFE, mec="k", zorder=5)
ax.annotate("E-STOP on top cover Z255\n(above scan plane)", xy=(200, -200),
            xytext=(70, -262), fontsize=6, color=C_SAFE,
            arrowprops=dict(arrowstyle="->", lw=0.7, color=C_SAFE))
ax.plot(-240, -150, marker="s", ms=8, mfc=C_BATT, mec="k", zorder=5)
ax.annotate("SB50 charge port left face Z120", xy=(-240, -150), xytext=(-328, -255),
            fontsize=6, color="#b26a00", arrowprops=dict(arrowstyle="->", lw=0.7, color="#b26a00"))

# phantom mop set
box(ax, -200, 280, 400, 100, "none", ec=C_PHAN, ls="--", lw=1.2, z=2)
ax.text(0, 330, "FRONT MOP PAD (phantom, external) 400×120", fontsize=6.5,
        ha="center", color=C_PHAN)
box(ax, -200, -380, 400, 100, "none", ec=C_PHAN, ls="--", lw=1.2, z=2)
ax.text(0, -330, "REAR MOP PAD (phantom, external) 400×120", fontsize=6.5,
        ha="center", color=C_PHAN)
for s in (1, -1):
    ax.plot([s * 150, s * 165], [240, 300], ls="--", lw=1.2, color=C_PHAN, zorder=2)
    ax.plot([s * 150, s * 165], [-240, -300], ls="--", lw=1.2, color=C_PHAN, zorder=2)

# plan dimensions
dim_h(ax, -240, 240, -268, "480")
dim_h(ax, -250, 250, -400, "500 ENVELOPE", color=C_SAFE)
dim_v(ax, -225, 225, -278, "450")
dim_v(ax, -250, 250, -298, "500", color=C_SAFE)
dim_h(ax, -215, 215, -52, "track 430", fs=6.5)
dim_h(ax, -174, 174, 99, "tower 348", fs=6.5)
ax.text(0, -415, "origin at body center · front = +Y (up) · all dims mm", fontsize=6.5,
        ha="center", style="italic")
ax.axis("off")

# ════════════════════ PANEL 2 — SIDE ELEVATION ════════════════════
ax = ax2
ax.set_xlim(-420, 420); ax.set_ylim(-30, 340); ax.set_aspect("equal")
ax.set_title("SIDE ELEVATION (from right) — Y depth / Z height", fontsize=10, weight="bold")
ax.axhline(0, color="k", lw=1.2)
for gx in range(-400, 401, 25):
    ax.plot([gx, gx + 8], [0, -6], color="k", lw=0.6)
ax.axhline(300, color=C_SAFE, lw=1.2, ls=(0, (6, 4)))
ax.text(415, 300, "300 LIMIT", fontsize=7, color=C_SAFE, ha="right", va="bottom")

# chassis silhouette: single floor Z60 → cover Z255
ax.add_patch(Rectangle((-225, 60), 450, 195, fc=C_BODY, ec="k", lw=1.2, alpha=0.30, zorder=1))
ax.plot([-225, 225], [60, 60], color=C_METAL, lw=3, zorder=2)
ax.text(-222, 52, "3mm 5052 Al pan (single floor Z60)", fontsize=6, color=C_METAL)
# IR strip on front/rear faces
ax.add_patch(Rectangle((221, 205), 8, 35, fc=C_IR, ec="none", alpha=0.7, zorder=2))
ax.add_patch(Rectangle((-229, 205), 8, 35, fc=C_IR, ec="none", alpha=0.7, zorder=2))
ax.text(233, 222, "IR\nstrip", fontsize=5.5, color=C_IR, ha="left", zorder=4)
# battery tower + hatch
box(ax, -21, 88, 112, 175, C_BATT, "PACK\n175\n(top-load ↑)", fs=7, z=3)
box(ax, -21, 263, 112, 5, "#6c757d", None, z=3)
ax.text(35, 274, "hatch hump 268 = max height", fontsize=6, ha="center", zorder=4)
# wheel + motor (through pan well)
ax.add_patch(Circle((35, 50), 50, fc=C_DRIVE, ec="k", alpha=0.6, zorder=3))
ax.add_patch(Circle((35, 50), 30, fc="none", ec="k", lw=1.0, ls="--", zorder=3))
ax.text(35, 112, "Ø100 wheel / Ø60 motor\n(through pan well)", fontsize=6, ha="center")
# caster in pocket
ax.add_patch(Circle((-195, 25), 25, fc=C_DRIVE, ec="k", alpha=0.6, zorder=3))
ax.plot([-195, -195], [50, 60], color="k", lw=2, zorder=3)
ax.text(-195, 112, "caster Ø50\n(9mm pocket)", fontsize=6, ha="center")
# tank + pump
box(ax, -225, 60, 130, 85, C_WATER, "TANK ~3.4L\n(360×130×85)", fs=6.5, z=3)
box(ax, -90, 60, 66, 65, C_WATER, "PUMP", fs=6, z=3)
# PCB deck + Jetson + backup
box(ax, 110, 145, 100, 14, C_ELEC, "PCB deck Z145", fs=6, z=3)
box(ax, 118, 163, 79, 21, "#70e000", "Jetson", fs=6, z=3)
box(ax, 115, 60, 60, 60, C_ELEC, "backup", fs=6, z=3)
# recessed LiDARs on shelves
box(ax, 146.5, 200, 77, 38.85, C_SENS, "S2 F", fs=6.5, z=3)
box(ax, -223.5, 200, 77, 38.85, C_SENS, "S2 R", fs=6.5, z=3)
ax.plot([130, 240], [200, 200], color="k", lw=1.5, zorder=3)
ax.plot([-240, -130], [200, 200], color="k", lw=1.5, zorder=3)
ax.axhline(225, color=C_SENS, lw=0.9, ls=":")
ax.text(0, 231, "scan plane ~225 — below pack top 263 → tower = only occluder",
        fontsize=6, color=C_SENS, ha="center")
# camera
box(ax, 225, 90, 13, 25, C_SENS, None, z=3)
ax.text(231, 122, "D435", fontsize=6, ha="center")
# e-stop on cover
ax.plot(-200, 255, marker="o", ms=9, mfc=C_SAFE, mec="k", zorder=5)
ax.annotate("E-STOP on cover Z255", xy=(-200, 255), xytext=(-140, 305), fontsize=6,
            color=C_SAFE, arrowprops=dict(arrowstyle="->", lw=0.7, color=C_SAFE))
# phantom mop pads
box(ax, 280, 0, 100, 13, "none", ec=C_PHAN, ls="--", lw=1.2, z=2)
ax.plot([225, 300], [60, 13], ls="--", lw=1.2, color=C_PHAN)
ax.text(330, 22, "front mop\n(phantom)", fontsize=6, color=C_PHAN, ha="center")
box(ax, -380, 0, 100, 13, "none", ec=C_PHAN, ls="--", lw=1.2, z=2)
ax.plot([-225, -300], [60, 13], ls="--", lw=1.2, color=C_PHAN)
ax.text(-330, 22, "rear mop\n(phantom)", fontsize=6, color=C_PHAN, ha="center")
# dimensions
dim_h(ax, -225, 225, 322, "450")
dim_v(ax, 0, 60, -250, "floor 60", fs=6.5)
dim_v(ax, 0, 88, -290, "tray 88", fs=6.5)
dim_v(ax, 0, 268, -330, "268 max ✓", fs=6.5)
dim_v(ax, 0, 225, 260, "scan 225", fs=6.5)
ax.text(0, -28, "front = +Y (right) · all dims mm", fontsize=6.5, ha="center", style="italic")
ax.axis("off")

# ════════════════════ PANEL 3 — FRONT ELEVATION ════════════════════
ax = ax3
ax.set_xlim(-295, 295); ax.set_ylim(-30, 340); ax.set_aspect("equal")
ax.set_title("FRONT ELEVATION (from +Y) — X width / Z height", fontsize=10, weight="bold")
ax.axhline(0, color="k", lw=1.2)
for gx in range(-275, 276, 25):
    ax.plot([gx, gx + 8], [0, -6], color="k", lw=0.6)
ax.axhline(300, color=C_SAFE, lw=1.2, ls=(0, (6, 4)))
ax.text(288, 300, "300 LIMIT", fontsize=7, color=C_SAFE, ha="right", va="bottom")
# body silhouette
ax.add_patch(Rectangle((-240, 60), 480, 195, fc=C_BODY, ec="k", lw=1.2, alpha=0.30, zorder=1))
ax.plot([-240, 240], [60, 60], color=C_METAL, lw=3, zorder=2)
# IR strip full width
ax.add_patch(Rectangle((-240, 205), 480, 35, fc=C_IR, ec="none", alpha=0.35, zorder=2))
ax.text(0, 246, "IR-pass strip (full 360° perimeter) Z205–240", fontsize=6, color=C_IR,
        ha="center", zorder=4)
# motors (rects, ends 30mm apart)
box(ax, 15, 20, 200, 60, C_DRIVE, "MOTOR R", fs=6, z=3)
box(ax, -215, 20, 200, 60, C_DRIVE, "MOTOR L", fs=6, z=3)
# WHEELS AS RECTANGLES (N1 fix)
box(ax, 196, 0, 38, 100, "#5c677d", "wheel\n38×100", fs=5.5, z=4)
box(ax, -234, 0, 38, 100, "#5c677d", "wheel\n38×100", fs=5.5, z=4)
# battery tower above motors
box(ax, -174, 88, 348, 175, C_BATT, "BATTERY TOWER 348 × 175\n(tray Z88 on rails · motors pass below)",
    fs=7, z=3)
box(ax, -174, 263, 348, 5, "#6c757d", None, z=3)
ax.text(0, 274, "hatch hump 268", fontsize=6, ha="center", zorder=4)
# S2 front LiDAR AS RECTANGLE (N1 fix), in front of tower
box(ax, -38.5, 200, 77, 38.85, C_SENS, "S2\n77×38.85", fs=6, z=4)
ax.text(60, 258, "front S2 recessed (rear S2 behind)", fontsize=6, color=C_SENS, zorder=4)
# e-stop on cover (right corner)
ax.plot(200, 255, marker="o", ms=9, mfc=C_SAFE, mec="k", zorder=5)
ax.annotate("E-STOP", xy=(200, 255), xytext=(230, 285), fontsize=6, color=C_SAFE,
            arrowprops=dict(arrowstyle="->", lw=0.7, color=C_SAFE))
# caster (behind, dashed)
ax.add_patch(Circle((0, 25), 25, fc="none", ec=C_PHAN, lw=1.0, ls="--", zorder=2))
ax.text(0, 25, "caster\n(behind)", fontsize=5, ha="center", va="center", color=C_PHAN, zorder=3)
# front mop pad phantom
box(ax, -200, 0, 400, 13, "none", ec=C_PHAN, ls="--", lw=1.2, z=2)
for s in (1, -1):
    ax.plot([s * 150, s * 150], [13, 60], ls="--", lw=1.2, color=C_PHAN)
ax.text(-200, 20, "front mop pad (phantom, ahead of robot)", fontsize=6, color=C_PHAN, ha="left")
# dimensions
dim_h(ax, -215, 215, -18, "track 430", fs=6.5)
dim_h(ax, -174, 174, 250, "tower 348", fs=6.5)
dim_h(ax, -240, 240, 322, "480")
dim_v(ax, 0, 268, 252, "268 max ✓", fs=6.5)
dim_v(ax, 0, 60, -252, "floor 60", fs=6.5)
ax.text(0, -28, "front = toward viewer · all dims mm", fontsize=6.5, ha="center", style="italic")
ax.axis("off")

# ════════════════════ title / legend / footer ════════════════════
fig.suptitle("RoboMop v2 — Layout v3 · dimensioned bounding boxes · FOR APPROVAL · 2026-07-24",
             fontsize=13, weight="bold")
legend = [Patch(fc=C_BATT, ec="k", label="battery tower"),
          Patch(fc=C_DRIVE, ec="k", label="drivetrain"),
          Patch(fc=C_WATER, ec="k", label="water system"),
          Patch(fc=C_ELEC, ec="k", label="electronics"),
          Patch(fc=C_SENS, ec="k", label="sensors"),
          Patch(fc=C_IR, ec="k", label="IR-pass strip"),
          Patch(fc=C_METAL, ec="k", label="metal structure"),
          Patch(fc="none", ec=C_PHAN, ls="--", label="external mop set")]
if not CLEAN:
    legend.insert(6, Patch(fc=C_BLIND, ec="k", label="blind zone (neither LiDAR)"))
fig.legend(handles=legend, loc="lower center", ncol=9, fontsize=7.5, frameon=False)
fig.text(0.5, 0.012,
         "Core robot 480×450×268 ≤ 500×500×300 · single Z60 3mm-Al pan + 2× 20×20 rails + 6mm motor bulkheads (printed = shell only) · "
         "recessed S2s, scan Z225, blind = 2 flank Δ (~112×75) · tank ~3.4L · ~24 kg wet · CG≈(0,−5,125) · ~75/25 wheel/caster split",
         ha="center", fontsize=7.5, style="italic")
fig.tight_layout(rect=(0, 0.05, 1, 0.96))
fig.savefig(OUT, dpi=150)
print("saved:", OUT)

# sanity checks
t = 370 / 258
apex_x, apex_y = 174 * t, 185 - 94 * t
checks = {
    "blind-Δ apex at (±249.5, +50.2)": (round(apex_x, 1) == 249.5 and round(apex_y, 1) == 50.2),
    "max height 268 < 300": 268 < 300,
    "tower 348 + 2 walls <= 480": 348 + 16 <= 480,
    "scan 225 below pack top 263": 225 < 263,
    "motor ends 30mm apart (215-200=15 each side)": (215 - 200) == 15,
    "track 430 + wheel 38 = faces at ±234 < 240": 215 + 19 <= 240,
}
for k, v in checks.items():
    print(("OK  " if v else "FAIL"), k)
