#!/usr/bin/env python3
"""RoboMop v2 — Layout v2 bounding-box diagram (all units mm).
Generates cad/robomop_layout_v2.png — approval artifact.
Layout per cad/LAYOUT_v2.md. Bounding boxes only; phantom = external mop set.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle, FancyBboxPatch, Patch
import os

C_BATT = "#ff9f1c"; C_DRIVE = "#8d99ae"; C_WATER = "#3a86ff"; C_ELEC = "#38b000"
C_SENS = "#9d4edd"; C_SAFE = "#e63946"; C_BODY = "#ced4da"; C_PHAN = "#6c757d"

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "robomop_layout_v2.png")


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


fig = plt.figure(figsize=(20, 8.6))
ax1 = fig.add_subplot(131)  # plan
ax2 = fig.add_subplot(132)  # side
ax3 = fig.add_subplot(133)  # front

# ════════════════════ PANEL 1 — PLAN VIEW (top) ════════════════════
ax = ax1
ax.set_xlim(-305, 305); ax.set_ylim(-415, 415); ax.set_aspect("equal")
ax.set_title("PLAN (top view) — X width / Y depth", fontsize=10, weight="bold")

# envelope + body
ax.add_patch(Rectangle((-250, -250), 500, 500, fill=False, ec=C_SAFE,
                       ls=(0, (6, 4)), lw=1.5, zorder=1))
ax.text(0, 252, "500×500 ENVELOPE", ha="center", fontsize=7.5, color=C_SAFE)
ax.add_patch(FancyBboxPatch((-240, -225), 480, 450,
                            boxstyle="round,pad=0,rounding_size=40",
                            fc=C_BODY, ec="k", lw=1.2, alpha=0.35, zorder=1))
ax.text(-236, 232, "body 480×450, R40", fontsize=6.5, color="k")

# battery bay (center, over axle)
box(ax, -174, -21, 348, 112, C_BATT, "BATTERY BAY (top-load)\n8S2P slab 348×113×175\nZ90–265, hatch above",
    fs=7, z=3)
# wheels + motors (axle Y=35)
for s in (1, -1):
    box(ax, s * 196 if s > 0 else s * 234, -15, 38, 100, C_DRIVE, None, z=3)
    box(ax, s * 15 if s > 0 else s * 215, 5, 200, 60, C_DRIVE, None, z=2)
    box(ax, s * 15 if s > 0 else s * 40, 5, 25, 60, "#5c677d", None, z=3)  # encoder end
ax.text(120, 35, "MOTOR R Ø60×~200 +enc", fontsize=6, rotation=0, ha="center", zorder=4)
ax.text(-120, 35, "MOTOR L Ø60×~200 +enc", fontsize=6, ha="center", zorder=4)
ax.text(215, 35, "Ø100×38\nwheel", fontsize=5.5, ha="center", zorder=4)
ax.text(-215, 35, "Ø100×38\nwheel", fontsize=5.5, ha="center", zorder=4)
ax.axhline(35, color=C_DRIVE, lw=0.7, ls=":", zorder=1)
ax.text(241, 40, "axle Y+35", fontsize=6, color=C_DRIVE)

# PCB deck (front-center, elevated Z145 — drawn as plan footprint)
box(ax, -140, 110, 280, 100, "#bde0fe", None, alpha=0.4, z=2)
box(ax, -135, 115, 130, 90, C_ELEC, "PCB1 power\n130×100", fs=6.5, z=3)
box(ax, 5, 115, 130, 90, C_ELEC, "PCB2 carrier\n130×100", fs=6.5, z=3)
box(ax, 20, 122, 100, 76, "#70e000", "Jetson\n100×79×21", fs=6, z=4)
ax.text(0, 214, "PCB deck @ Z145 (elevated, vented)", fontsize=6, ha="center", zorder=4)
# backup + DC-DC on front floor
box(ax, -225, 115, 80, 60, C_ELEC, "backup\npack", fs=6, z=3)
box(ax, 150, 115, 65, 55, C_ELEC, "DC-DC\n12V/5V", fs=6, z=3)

# water tank + pump (rear)
box(ax, -180, -215, 360, 120, C_WATER, "WATER TANK ~3L baffled slab\n360×120×85 (Z70–155) · over caster",
    fs=7, z=2)
box(ax, 105, -90, 90, 66, C_WATER, "PUMP KK300-D\n14–290 ml/min", fs=6, z=3)
# caster
ax.add_patch(Circle((0, -195), 25, fc=C_DRIVE, ec="k", alpha=0.6, zorder=3))
box(ax, -30, -225, 60, 60, "none", ec="k", lw=0.8, ls=":", z=3)
ax.text(0, -160, "caster Ø50 (H69)", fontsize=6, ha="center", zorder=4)

# LiDAR pods (on deck Z250, shown as plan circles)
ax.add_patch(Circle((0, 185), 38.5, fc=C_SENS, ec="k", alpha=0.55, zorder=4))
ax.text(0, 143, "S2 FRONT Ø77 (deck pod, top Z289)", fontsize=6, ha="center", zorder=4)
ax.add_patch(Circle((0, -185), 38.5, fc=C_SENS, ec="k", alpha=0.55, zorder=4))
ax.text(-2, -148, "S2 REAR Ø77 (deck pod)", fontsize=6, ha="center", zorder=4)

# front camera, e-stop, charge port
box(ax, -45, 225, 90, 13, C_SENS, None, z=4)
ax.text(0, 243, "D435 depth cam 90×25 (on front face)", fontsize=6, ha="center")
ax.plot(240, -150, marker="o", ms=9, mfc=C_SAFE, mec="k", zorder=5)
ax.annotate("E-STOP right face Z230", xy=(240, -150), xytext=(92, -245),
            fontsize=6, color=C_SAFE, arrowprops=dict(arrowstyle="->", lw=0.7, color=C_SAFE))
ax.plot(-240, -150, marker="s", ms=8, mfc=C_BATT, mec="k", zorder=5)
ax.annotate("SB50 charge port left face", xy=(-240, -150), xytext=(-296, -245),
            fontsize=6, color="#b26a00", arrowprops=dict(arrowstyle="->", lw=0.7, color="#b26a00"))

# phantom mop set (outside envelope, D2)
box(ax, -200, 280, 400, 100, "none", ec=C_PHAN, ls="--", lw=1.2, z=2)
ax.text(0, 330, "FRONT MOP PAD (phantom, external) 400×120 · sprung arm", fontsize=6.5,
        ha="center", color=C_PHAN)
box(ax, -200, -380, 400, 100, "none", ec=C_PHAN, ls="--", lw=1.2, z=2)
ax.text(0, -330, "REAR MOP PAD (phantom, external) 400×120 · sprung arm", fontsize=6.5,
        ha="center", color=C_PHAN)
for s in (1, -1):
    ax.plot([s * 150, s * 165], [240, 300], ls="--", lw=1.2, color=C_PHAN, zorder=2)
    ax.plot([s * 150, s * 165], [-240, -300], ls="--", lw=1.2, color=C_PHAN, zorder=2)

# plan dimensions
dim_h(ax, -240, 240, -262, "480")
dim_h(ax, -250, 250, -397, "500 ENVELOPE", color=C_SAFE)
dim_v(ax, -225, 225, -272, "450")
dim_v(ax, -250, 250, -292, "500", color=C_SAFE)
dim_h(ax, -215, 215, -46, "track 430", fs=6.5)
dim_h(ax, -174, 174, -60, "bay 348", fs=6.5)
ax.text(0, -405, "origin at body center · front = +Y (up) · all dims mm", fontsize=6.5,
        ha="center", style="italic")
ax.axis("off")

# ════════════════════ PANEL 2 — SIDE ELEVATION ════════════════════
ax = ax2
ax.set_xlim(-415, 415); ax.set_ylim(-30, 340); ax.set_aspect("equal")
ax.set_title("SIDE ELEVATION (from right) — Y depth / Z height", fontsize=10, weight="bold")
ax.axhline(0, color="k", lw=1.2)
for gx in range(-400, 401, 25):
    ax.plot([gx, gx + 8], [0, -6], color="k", lw=0.6)
ax.axhline(300, color=C_SAFE, lw=1.2, ls=(0, (6, 4)))
ax.text(405, 300, "300 LIMIT", fontsize=7, color=C_SAFE, ha="right", va="bottom")

# chassis silhouette: main body z70..250 + front/center floor z30..70 (y>=-21)
ax.add_patch(Rectangle((-225, 70), 450, 180, fc=C_BODY, ec="k", lw=1.2, alpha=0.35, zorder=1))
ax.add_patch(Rectangle((-21, 30), 246, 40, fc=C_BODY, ec="k", lw=1.2, alpha=0.35, zorder=1))
# battery bay + hatch hump
box(ax, -21, 90, 112, 175, C_BATT, "PACK\n175\n(top-load ↑)", fs=7, z=3)
box(ax, -21, 265, 112, 5, "#6c757d", None, z=3)
ax.text(35, 276, "hatch hump 268", fontsize=6, ha="center", zorder=4)
# wheel + motor (coaxial at Y35)
ax.add_patch(Circle((35, 50), 50, fc=C_DRIVE, ec="k", alpha=0.6, zorder=3))
ax.add_patch(Circle((35, 50), 30, fc="none", ec="k", lw=1.0, ls="--", zorder=3))
ax.text(35, 108, "Ø100 wheel / Ø60 motor", fontsize=6, ha="center")
# caster
ax.add_patch(Circle((-195, 25), 25, fc=C_DRIVE, ec="k", alpha=0.6, zorder=3))
ax.plot([-195, -195], [50, 70], color="k", lw=2, zorder=3)
ax.text(-195, 108, "caster Ø50", fontsize=6, ha="center")
# tank + pump
box(ax, -215, 70, 120, 85, C_WATER, "TANK ~3L\n(360×120×85)", fs=6.5, z=3)
box(ax, -90, 70, 66, 65, C_WATER, "PUMP", fs=6, z=3)
# PCB deck + Jetson + backup
box(ax, 110, 145, 100, 14, C_ELEC, "PCB deck Z145", fs=6, z=3)
box(ax, 118, 163, 79, 21, "#70e000", "Jetson", fs=6, z=3)
box(ax, 115, 30, 60, 60, C_ELEC, "backup", fs=6, z=3)
# LiDAR pods + scan plane
box(ax, 146.5, 250, 77, 38.85, C_SENS, "S2 F", fs=6.5, z=3)
box(ax, -223.5, 250, 77, 38.85, C_SENS, "S2 R", fs=6.5, z=3)
ax.axhline(274.5, color=C_SENS, lw=0.9, ls=":")
ax.text(120, 278, "scan plane ~274.5", fontsize=6, color=C_SENS, ha="center")
# camera on front face
box(ax, 225, 90, 13, 25, C_SENS, None, z=3)
ax.text(231, 122, "D435", fontsize=6, ha="center")
# e-stop (right face visible in this view)
ax.plot(-150, 230, marker="o", ms=9, mfc=C_SAFE, mec="k", zorder=5)
ax.annotate("E-STOP Z230", xy=(-150, 230), xytext=(-120, 300), fontsize=6,
            color=C_SAFE, arrowprops=dict(arrowstyle="->", lw=0.7, color=C_SAFE))
# phantom mop pads + arms
box(ax, 280, 0, 100, 13, "none", ec=C_PHAN, ls="--", lw=1.2, z=2)
ax.plot([225, 300], [70, 13], ls="--", lw=1.2, color=C_PHAN)
ax.text(330, 20, "front mop\n(phantom)", fontsize=6, color=C_PHAN, ha="center")
box(ax, -380, 0, 100, 13, "none", ec=C_PHAN, ls="--", lw=1.2, z=2)
ax.plot([-225, -300], [70, 13], ls="--", lw=1.2, color=C_PHAN)
ax.text(-330, 20, "rear mop\n(phantom)", fontsize=6, color=C_PHAN, ha="center")
# dimensions
dim_h(ax, -225, 225, 322, "450")
dim_v(ax, 0, 90, -250, "bay floor 90", fs=6.5)
dim_v(ax, 0, 250, -290, "deck 250", fs=6.5)
dim_v(ax, 0, 288.85, -330, "pods 289 max", fs=6.5)
dim_v(ax, 0, 30, 250, "clr 30", fs=6.5)
dim_v(ax, 0, 70, -140, "rear floor 70", fs=6.5)
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
ax.add_patch(Rectangle((-240, 30), 480, 220, fc=C_BODY, ec="k", lw=1.2, alpha=0.35, zorder=1))
# motors (both sides, ends 30mm apart at center)
box(ax, 15, 20, 200, 60, C_DRIVE, "MOTOR R (passes under bay)", fs=6, z=3)
box(ax, -215, 20, 200, 60, C_DRIVE, "MOTOR L", fs=6, z=3)
ax.annotate("30mm gap", xy=(0, 50), xytext=(0, 12), fontsize=6, ha="center",
            arrowprops=dict(arrowstyle="->", lw=0.6))
# wheels
for s in (1, -1):
    ax.add_patch(Circle((s * 215, 50), 50, fc="none", ec="k", lw=1.2, zorder=3))
ax.text(215, 108, "Ø100", fontsize=6, ha="center"); ax.text(-215, 108, "Ø100", fontsize=6, ha="center")
# battery bay above motors
box(ax, -174, 90, 348, 175, C_BATT, "BATTERY BAY 348 wide × 175 tall\n(under-floor tunnel Z80–90 for motors)",
    fs=7, z=3)
box(ax, -174, 265, 348, 5, "#6c757d", None, z=3)
ax.text(0, 276, "hatch hump 268", fontsize=6, ha="center", zorder=4)
# deck + LiDAR pod (front; rear shown dashed behind)
ax.plot([-240, 240], [250, 250], color="k", lw=0.8, zorder=2)
ax.add_patch(Circle((0, 269.4), 38.5, fc=C_SENS, ec="k", alpha=0.55, zorder=3))
ax.text(0, 269, "S2", fontsize=7, ha="center", va="center", zorder=4)
ax.text(60, 296, "pod tops 289 < 300", fontsize=6, color=C_SENS)
# e-stop on right face
ax.plot(240, 230, marker="o", ms=9, mfc=C_SAFE, mec="k", zorder=5)
ax.annotate("E-STOP", xy=(240, 230), xytext=(252, 260), fontsize=6, color=C_SAFE,
            arrowprops=dict(arrowstyle="->", lw=0.7, color=C_SAFE))
# front mop pad phantom (in front of robot, at floor)
box(ax, -200, 0, 400, 13, "none", ec=C_PHAN, ls="--", lw=1.2, z=2)
for s in (1, -1):
    ax.plot([s * 150, s * 150], [13, 70], ls="--", lw=1.2, color=C_PHAN)
ax.text(-200, 20, "front mop pad (phantom, ahead of robot)", fontsize=6, color=C_PHAN, ha="left")
# dimensions
dim_h(ax, -215, 215, -18, "track 430", fs=6.5)
dim_h(ax, -174, 174, 255, "bay 348", fs=6.5)
dim_h(ax, -240, 240, 322, "480")
dim_v(ax, 0, 288.85, 252, "289", fs=6.5)
dim_v(ax, 0, 30, -252, "clr 30", fs=6.5)
ax.text(0, -28, "front = toward viewer · all dims mm", fontsize=6.5, ha="center", style="italic")
ax.axis("off")

# ════════════════════ title / legend / footer ════════════════════
fig.suptitle("RoboMop v2 — Layout v2 · dimensioned bounding boxes · FOR APPROVAL · 2026-07-24",
             fontsize=13, weight="bold")
legend = [Patch(fc=C_BATT, ec="k", label="battery"),
          Patch(fc=C_DRIVE, ec="k", label="drivetrain"),
          Patch(fc=C_WATER, ec="k", label="water system"),
          Patch(fc=C_ELEC, ec="k", label="electronics"),
          Patch(fc=C_SENS, ec="k", label="sensors"),
          Patch(fc=C_SAFE, ec="k", label="safety / envelope"),
          Patch(fc="none", ec=C_PHAN, ls="--", label="external mop set (excl. from envelope)")]
fig.legend(handles=legend, loc="lower center", ncol=7, fontsize=8, frameon=False)
fig.text(0.5, 0.012,
         "Core robot 480×450×289 ≤ 500×500×300 · mops external (D2) · top-load pack over axle · "
         "2 wheels + 1 rear caster (~78/22 load split) · CG≈(0,+10,129) · ~22.6 kg wet · "
         "gear motor dims = family bound pending seller drawing",
         ha="center", fontsize=7.5, style="italic")
fig.tight_layout(rect=(0, 0.045, 1, 0.96))
fig.savefig(OUT, dpi=150)
print("saved:", OUT)
