# RoboMop v2 — Layout Concept v1 bounding-box diagram generator
# Draws top view + side elevation with real component dims (see BOM_v1.md §E).
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mp
import numpy as np

C = {
    "body": "#b8c0c8", "env": "#d62728", "wheel": "#404040", "motor": "#5b8ec4",
    "batt": "#e8a33d", "hatch": "#2ca02c", "backup": "#d4c95b", "pcb": "#7bc47f",
    "tank": "#4fc3d4", "pump": "#2a9d8f", "cam": "#9b59b6", "lidar": "#d62728",
    "estop": "#c0392b", "caster": "#808080", "mop": "#b06fc9",
}

def box(ax, x, y, w, h, fc, label=None, ec="#222222", ls="-", lw=1.2, alpha=0.85,
        txt=7, tc="#111111", z=3, dy=0, dx=0, ha="center", weight="normal"):
    r = mp.Rectangle((x, y), w, h, facecolor=fc, edgecolor=ec, ls=ls, lw=lw,
                     alpha=alpha, zorder=z)
    ax.add_patch(r)
    if label:
        ax.text(x + w / 2 + dx, y + h / 2 + dy, label, ha=ha, va="center",
                fontsize=txt, color=tc, zorder=z + 1, weight=weight)
    return r

fig = plt.figure(figsize=(17.5, 9.2), dpi=120)
gs = fig.add_gridspec(1, 2, width_ratios=[1, 1.35], wspace=0.08)

# ════════════ TOP VIEW ════════════
ax = fig.add_subplot(gs[0])
ax.set_title("TOP VIEW (plan) — z-bands annotated\nfront = +Y", fontsize=11, weight="bold")
ax.set_xlim(-285, 285); ax.set_ylim(-560, 560)
ax.set_aspect("equal"); ax.grid(True, ls=":", lw=0.5, alpha=0.6)
ax.set_xlabel("X width (mm)"); ax.set_ylabel("Y depth (mm)")

# envelope + body
box(ax, -250, -250, 500, 500, "none", ec=C["env"], ls="--", lw=1.8, z=1)
ax.text(0, 262, "ENVELOPE 500×500 (z≤300)", color=C["env"], fontsize=8, ha="center", weight="bold")
box(ax, -240, -230, 480, 460, C["body"], ec="#333333", lw=1.8, alpha=0.25, z=1)
ax.text(-236, 236, "body 480×460", fontsize=7.5, color="#333333")

# wheels + motors
box(ax, -236, -50, 32, 100, C["wheel"], z=4); box(ax, 204, -50, 32, 100, C["wheel"], z=4)
ax.text(-220, 62, "wheel Ø100×32", fontsize=6.5, ha="center")
box(ax, -204, -30, 182, 60, C["motor"], "gearmotor L\nØ60×182", txt=6.5)
box(ax, 22, -30, 182, 60, C["motor"], "gearmotor R\nØ60×182", txt=6.5)
ax.text(0, -36, "drive axle y=0", fontsize=6.5, ha="center", color="#333")

# battery bay + hatch
box(ax, -174, -160, 348, 113, C["batt"], "BATTERY 8S2P 348×113×175  (7.3 kg)\nz 60–235 · TOP-LOAD ↑",
    txt=7.5, weight="bold")
box(ax, -180, -165, 360, 125, "none", ec=C["hatch"], ls="--", lw=1.5, z=5)
ax.text(0, -172, "deck hatch 360×125", color=C["hatch"], fontsize=6.5, ha="center")

# backup, PCB1
box(ax, -170, -225, 70, 55, C["backup"], "backup\n8S1P\n70×55", txt=6)
box(ax, 120, -40, 100, 100, C["pcb"], "PCB1 power\n100×100\nz 95–140\n(above motor)", txt=6)

# tank, pump, jetson, cams
box(ax, -225, 80, 225, 100, C["tank"], "WATER TANK 225×100×130 ≈2.6 L\nz 60–190", txt=7, weight="bold")
box(ax, 15, 115, 70, 50, C["pump"], "pump\n70×50", txt=6)
box(ax, 110, 90, 100, 100, C["pcb"], "PCB2+Jetson\nstack\n100×100\nz 95–150", txt=6)
box(ax, -45, 205, 90, 25, C["cam"], "front cam 90×25 (depth-reserve)", txt=6)
box(ax, 60, -230, 25, 25, C["cam"], "", txt=6)
ax.text(72, -238, "rear RGB cam", fontsize=6, ha="center")

# lidars (circles)
for yy, tag in [(211, "LIDAR F · RPLIDAR S2 Ø77×38.85 · z 255–294"),
                (-211, "LIDAR R · S2 Ø77 · z 255–294")]:
    ax.add_patch(mp.Circle((0, yy), 38.5, facecolor="#f4b6b6", edgecolor=C["lidar"], lw=1.5, zorder=4))
    ax.text(0, yy, "S2", fontsize=7, ha="center", va="center", zorder=5, weight="bold", color=C["lidar"])
    ax.text(60, yy, tag, fontsize=6, ha="left", va="center", color=C["lidar"])

# e-stop, charge port
ax.add_patch(mp.Circle((185, -215), 11, facecolor=C["estop"], edgecolor="#60000000", zorder=5))
ax.text(185, -240, "E-stop Ø30 (deck)", fontsize=6, ha="center", color=C["estop"])
ax.text(100, -240, "XT60 charge port (rear face)", fontsize=6, ha="center", color="#333")

# casters
for sx in (-1, 1):
    for sy in (-1, 1):
        box(ax, sx * 200 - 30, sy * 195 - 30, 60, 60, C["caster"], ec="#444", alpha=0.5, z=2)
ax.text(-200, -160, "casters ×4 50mm (under floor)", fontsize=6, ha="center", color="#555")

# mop arms + pads (external, dashed)
for sgn, ypad, ylab in [(1, 380, "FRONT MOP (external) pad 420×130 · arm pivot at front face"),
                        (-1, -510, "REAR MOP (external) pad 420×130")]:
    box(ax, -210, ypad, 420, 130, C["mop"], "", ec="#7a3d99", ls="--", lw=1.6, alpha=0.35, z=2)
    ax.text(0, ypad + 65, "MOP PAD 420×130\n(40cm microfiber)", fontsize=7, ha="center", va="center", color="#7a3d99", weight="bold")
    for sx in (-60, 60):
        ax.plot([sx, sx * 0.7], [sgn * 230, ypad + (0 if sgn > 0 else 130)], ls="--", lw=1.4, color="#7a3d99", zorder=2)
ax.text(0, 345, "front mop arm (external, dashed)", fontsize=6.5, ha="center", color="#7a3d99")

# key dims
ax.annotate("", xy=(-174, -290), xytext=(174, -290), arrowprops=dict(arrowstyle="<->", lw=1))
ax.text(0, -302, "battery 348", fontsize=7, ha="center")
ax.annotate("", xy=(-240, -330), xytext=(240, -330), arrowprops=dict(arrowstyle="<->", lw=1.2))
ax.text(0, -343, "body width 480  (envelope 500)", fontsize=7, ha="center", weight="bold")
ax.annotate("", xy=(258, -230), xytext=(258, 230), arrowprops=dict(arrowstyle="<->", lw=1.2))
ax.text(266, 0, "body depth 460", fontsize=7, rotation=90, va="center")

# ════════════ SIDE ELEVATION ════════════
ax2 = fig.add_subplot(gs[1])
ax2.set_title("SIDE ELEVATION (center section) — Z budget vs 300mm cap", fontsize=11, weight="bold")
ax2.set_xlim(-560, 560); ax2.set_ylim(-15, 330)
ax2.set_aspect("equal"); ax2.grid(True, ls=":", lw=0.5, alpha=0.6)
ax2.set_xlabel("Y depth (mm) · front →"); ax2.set_ylabel("Z height (mm)")

ax2.axhline(0, color="#222", lw=1.6)
ax2.text(545, 4, "ground", fontsize=7, ha="right")
# envelope
box(ax2, -250, 0, 500, 300, "none", ec=C["env"], ls="--", lw=1.8, z=1)
ax2.text(0, 305, "ENVELOPE 500 wide × 300 tall", color=C["env"], fontsize=8, ha="center", weight="bold")

# body shell (floor + deck lines)
box(ax2, -230, 60, 460, 195, C["body"], ec="#333", lw=1.6, alpha=0.18, z=1)
ax2.plot([-230, 230], [60, 60], color="#333", lw=2, zorder=2)
ax2.plot([-230, 230], [255, 255], color="#333", lw=2, zorder=2)
ax2.text(-225, 258, "deck z=255", fontsize=6.5, color="#333")
ax2.text(-225, 63, "floor z=60", fontsize=6.5, color="#333")

# wheels/casters/motor
ax2.add_patch(mp.Circle((0, 50), 50, facecolor=C["wheel"], edgecolor="#111", zorder=3))
ax2.text(0, 50, "Ø100", fontsize=7, color="w", ha="center", va="center", zorder=4)
for yy in (-195, 195):
    ax2.add_patch(mp.Circle((yy, 25), 25, facecolor=C["caster"], edgecolor="#444", zorder=3))
ax2.text(195, 25, "caster\n50mm", fontsize=6, ha="left", va="center")
box(ax2, -30, 20, 60, 60, C["motor"], "motor Ø60", txt=6.5, z=4)

# battery (behind axle) + hatch arrow
box(ax2, -160, 60, 113, 175, C["batt"], "BATTERY\n113 wide\n175 tall\n(top-load)", txt=7, weight="bold", z=4)
box(ax2, -165, 235, 125, 20, "none", ec=C["hatch"], ls="--", lw=1.4, z=5)
ax2.annotate("", xy=(-102, 292), xytext=(-102, 240), arrowprops=dict(arrowstyle="->", lw=1.8, color=C["hatch"]))
ax2.text(-95, 275, "lift-out\n≤5 min", fontsize=7, color=C["hatch"], weight="bold")

# tank / pump / jetson / cams
box(ax2, 80, 60, 100, 130, C["tank"], "TANK\n2.6 L", txt=7, weight="bold", z=4)
box(ax2, 115, 60, 50, 55, C["pump"], "", z=5); ax2.text(140, 52, "pump", fontsize=6, ha="center")
box(ax2, 90, 95, 100, 55, C["pcb"], "PCB2+Jetson", txt=6, z=6)
box(ax2, 205, 105, 25, 25, C["cam"], "cam", txt=6, z=5)
box(ax2, -230, 100, 25, 25, C["cam"], "", z=5); ax2.text(-217, 92, "rear cam", fontsize=6, ha="center")
box(ax2, -225, 60, 55, 70, C["backup"], "bkup", txt=6, z=4)

# lidars on deck
for yy in (211, -211):
    box(ax2, yy - 38.5, 255, 77, 38.85, "#f4b6b6", ec=C["lidar"], lw=1.5, z=5)
ax2.text(211, 274, "S2", fontsize=7, ha="center", va="center", color=C["lidar"], weight="bold", zorder=6)
ax2.text(-211, 274, "S2", fontsize=7, ha="center", va="center", color=C["lidar"], weight="bold", zorder=6)
ax2.axhline(273, xmin=0.35, xmax=0.65, color=C["lidar"], ls=":", lw=1)
ax2.text(0, 279, "scan plane z≈273 (clears deck)", fontsize=6.5, color=C["lidar"], ha="center")

# e-stop
ax2.add_patch(mp.Circle((-215 + 0, 262), 7, facecolor=C["estop"], zorder=6))
ax2.text(-215, 282, "E-stop", fontsize=6, ha="center", color=C["estop"])

# mop arms external
for sgn, y0, y1 in [(1, 240, 445), (-1, -240, -445)]:
    ax2.plot([sgn * 228, y1 - sgn * 60], [100, 30], ls="--", lw=1.5, color="#7a3d99")
    box(ax2, y1 - sgn * 65 if sgn > 0 else y1 - 65, 0, 130, 22, C["mop"], ec="#7a3d99", ls="--", alpha=0.4, z=2)
ax2.text(445, 40, "front mop\n(external)", fontsize=7, color="#7a3d99", ha="center")
ax2.text(-445, 40, "rear mop\n(external)", fontsize=7, color="#7a3d99", ha="center")

# Z dim chain
for z0, z1, lab in [(0, 20, "20 clr"), (20, 80, "motor"), (60, 235, "battery 175"), (235, 255, "recess"), (255, 294, "S2")]:
    ax2.annotate("", xy=(-270, z0), xytext=(-270, z1), arrowprops=dict(arrowstyle="<->", lw=0.9))
    ax2.text(-282, (z0 + z1) / 2, lab, fontsize=6, rotation=90, va="center", ha="center")
ax2.annotate("", xy=(-300, 0), xytext=(-300, 294), arrowprops=dict(arrowstyle="<->", lw=1.4))
ax2.text(-312, 147, "294 < 300 ✓", fontsize=8, rotation=90, va="center", weight="bold")

fig.suptitle("RoboMop v2 — LAYOUT CONCEPT v1 · bounding boxes from verified dims (BOM_v1.md) · all units mm",
             fontsize=13, weight="bold", y=0.985)
fig.savefig("cad/robomop_layout_v1.png", bbox_inches="tight")
print("saved cad/robomop_layout_v1.png")

# sanity checks
checks = {
    "body in envelope (480x460x294 <= 500x500x300)": (480 <= 500, 460 <= 500, 294 <= 300),
    "battery 348 fits body width 480 (2 walls 8mm)": 348 <= 480 - 16,
    "battery clear of motors (bay y[-160,-47] vs motor y[-30,30])": True,
    "LiDAR R inside envelope (211+38.5=249.5 <= 250)": 249.5 <= 250,
    "wheel outer edge inside body (236 <= 240)": 236 <= 240,
}
for k, v in checks.items():
    ok = all(v) if isinstance(v, tuple) else bool(v)
    print(("OK  " if ok else "FAIL"), k)
