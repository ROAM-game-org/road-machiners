"""The scout base: a lifted 1997 Toyota HiLux Mk IV 4WD regular-cab long-bed pickup, from the the-blueprints.com sheet.

Measured from the sheet and scaled by 1.07: 5.2 m long, 1.96 m wide across the flares, 2.08 m tall, a 3.25 m wheelbase.
The painted sides stand 1.81 m apart and the tires stand 0.09 m past the flares. The roof is narrower than the body, the windshield rakes,
a gap parts the cab from the long bed, and the hood falls to the nose. The body bottom sits at the collider bottom with the frame showing below it.
Grid: 5 columns by 8 rows, 2.42 m across by 5.2 m along, stretched over the model by the projection. Half height 0.45 m, from PHYSICS.bodies.pickup.
Rows 0 to 2 are the hood with a cutout over the engine cells, rows 3 and 4 the cab, rows 5 to 7 the bed.
Wheels sit on rows 1 and 6, radius 0.46 m, half width 0.185 m, mount 0.3 m below the center, 0.89 m off the center line.
Sockets arch_front, arch_rear and arch_front_top mark the arches for wheelArches.test.ts.
Run: blender --background --python tools/blender/base_scout.py -- public/models/base_scout.glb [tmp/base_scout.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402
from parts_common_base import BASE_COLORS, SUSPENSION_REST, Grid, arch_profile, check_base, flare, hull_mesh, level_sockets  # noqa: E402
from shapes import prism  # noqa: E402

SEED = 301
LENGTH = 5.2
WIDTH = 1.96
G = Grid(rows=8, cols=5, half_height=0.45)
WHEEL_R = 0.46
WHEEL_HALF_W = 0.185
WHEEL_Z = 0.89
HUB_Z = -0.3 - SUSPENSION_REST
WHEELS_X = [G.row_x(1), G.row_x(6)]
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03
ARCH_GAP = 0.21
FLARE_OUT = 0.075

BODY_BOTTOM = -G.top
BELT = G.top
FLOOR = 0.05
ROOF = 0.93
ROOF_T = 0.07
UNDER_ROOF = ROOF - ROOF_T
SIDE = WIDTH / 2 - FLARE_OUT
FRONT = LENGTH / 2 - 0.05
BACK = -FRONT
NOSE_TOP = BELT - 0.12
CAB_FRONT = G.row_x(2.5)
CAB_BACK = -0.546
BED_FRONT = CAB_BACK - 0.05
ROOF_FRONT = 0.234
BAY_FRONT = G.row_x(0.5)
BAY_RIGHT = G.col_y(2.5)
BED_WALL = 0.1
LAMP_Y = 0.62


def hood_top(x: float) -> float:
    return NOSE_TOP + (BELT - NOSE_TOP) * (FRONT - x) / (FRONT - CAB_FRONT)


def mirrored(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def hull(kit: Kit, name: str, mat: str, points: list[tuple[float, float, float]]) -> None:
    kit._add(hull_mesh(name, points), name, mat, 0.0)


def lower_body(kit: Kit) -> None:
    """Painted side panels with tall wheel arches and dark flares, a dark core between the wells, the frame and the side steps."""
    arch_radius = WHEEL_R + ARCH_GAP
    profile = arch_profile(G, WHEELS_X, HUB_Z, arch_radius, BELT, bottom=BODY_BOTTOM, nose_top=NOSE_TOP, cowl_x=CAB_FRONT)
    prism(kit, "skin_l", profile, WELL_Y, SIDE, "paint")
    prism(kit, "skin_r", profile, -SIDE, -WELL_Y, "paint")
    kit.box("core", (FRONT - BACK - 0.08, 2 * WELL_Y, FLOOR - BODY_BOTTOM), (0, 0, (FLOOR + BODY_BOTTOM) / 2), "under")
    for i, wx in enumerate(WHEELS_X):
        flare(kit, f"flare{i}_l", G, wx, HUB_Z, arch_radius, SIDE, SIDE + FLARE_OUT, bottom=BODY_BOTTOM)
        flare(kit, f"flare{i}_r", G, wx, HUB_Z, arch_radius, -SIDE - FLARE_OUT, -SIDE, bottom=BODY_BOTTOM)
    mirrored(kit, "rail", (LENGTH - 0.5, 0.12, 0.12), 0, 0.46, BODY_BOTTOM - 0.06, "under")
    mirrored(kit, "step", (1.6, 0.14, 0.1), 0, SIDE - 0.07, BODY_BOTTOM - 0.05, "under")


def hood(kit: Kit) -> None:
    """A hood that falls from the cowl to the nose, open over the engine cells, a dark grille band between two square lamps and a dark bumper."""
    nose_slab = [(BAY_FRONT, FLOOR), (FRONT, FLOOR), (FRONT, hood_top(FRONT)), (BAY_FRONT, hood_top(BAY_FRONT))]
    prism(kit, "hood_nose", nose_slab, -SIDE, SIDE, "paint")
    side_slab = [(CAB_FRONT, FLOOR), (BAY_FRONT, FLOOR), (BAY_FRONT, hood_top(BAY_FRONT)), (CAB_FRONT, hood_top(CAB_FRONT))]
    prism(kit, "hood_r", side_slab, -WELL_Y, BAY_RIGHT, "paint")
    kit.box("grille", (0.05, 2 * (LAMP_Y - 0.17), 0.2), (FRONT + 0.025, 0, 0.1), "under")
    mirrored(kit, "lamp", (0.05, 0.28, 0.16), FRONT + 0.025, LAMP_Y, 0.1, "light")
    kit.box("valance", (0.04, 2 * WELL_Y, FLOOR - BODY_BOTTOM), (FRONT - 0.02, 0, (FLOOR + BODY_BOTTOM) / 2), "paint")
    kit.box("bumper", (0.18, 1.9, 0.22), (LENGTH / 2 - 0.09, 0, BODY_BOTTOM - 0.07), "under")


def cab(kit: Kit) -> None:
    """A regular cab: painted doors to the beltline, a leaning glasshouse under a narrower trim roof, raked windshield and pillars."""
    kit.box("doors", (CAB_FRONT - CAB_BACK, 2 * SIDE, BELT - FLOOR), ((CAB_FRONT + CAB_BACK) / 2, 0, (BELT + FLOOR) / 2), "paint")
    low, high = SIDE - 0.045, SIDE - 0.14
    glass = [(x, s * y, z) for x, y, z in ((CAB_FRONT, low, BELT), (CAB_BACK, low, BELT), (ROOF_FRONT, high, UNDER_ROOF), (CAB_BACK, high, UNDER_ROOF)) for s in (1, -1)]
    hull(kit, "glass", "glass", glass)
    for sign, name in ((1, "l"), (-1, "r")):
        a = [(CAB_FRONT, low, BELT), (CAB_FRONT - 0.07, low, BELT), (ROOF_FRONT, high, UNDER_ROOF), (ROOF_FRONT + 0.07, high, UNDER_ROOF)]
        hull(kit, f"a_pillar_{name}", "paint", [(x, sign * (y + 0.025), z) for x, y, z in a] + [(x, sign * (y - 0.06), z) for x, y, z in a])
        c = [(CAB_BACK, low, BELT), (CAB_BACK + 0.2, low, BELT), (CAB_BACK + 0.14, high, UNDER_ROOF), (CAB_BACK, high, UNDER_ROOF)]
        hull(kit, f"c_pillar_{name}", "paint", [(x, sign * (y + 0.025), z) for x, y, z in c] + [(x, sign * (y - 0.06), z) for x, y, z in c])
    kit.box("back_wall", (0.06, 2 * (low + 0.025), UNDER_ROOF - BELT), (CAB_BACK + 0.03, 0, (BELT + UNDER_ROOF) / 2), "paint")
    roof_half = high + 0.025
    layers = [(UNDER_ROOF, ROOF_FRONT + 0.03, CAB_BACK, roof_half + 0.03), (ROOF, ROOF_FRONT, CAB_BACK, roof_half)]
    hull(kit, "roof", "trim", [(x, s * y, z) for z, xf, xb, y in layers for x in (xf, xb) for s in (1, -1)])


def bed(kit: Kit) -> None:
    """A long separate bed behind a gap: thin painted walls to the beltline, a front wall, a tailgate, tall corner taillights and a step bumper."""
    length = BED_FRONT - BACK
    mid = (BED_FRONT + BACK) / 2
    h = BELT - FLOOR
    mirrored(kit, "bed_side", (length, BED_WALL, h), mid, SIDE - BED_WALL / 2, FLOOR + h / 2, "paint")
    kit.box("bed_front", (BED_WALL, 2 * (SIDE - BED_WALL), h), (BED_FRONT - BED_WALL / 2, 0, FLOOR + h / 2), "paint")
    kit.box("tailgate", (BED_WALL, 2 * (SIDE - BED_WALL), h), (BACK + BED_WALL / 2, 0, FLOOR + h / 2), "paint")
    kit.box("rear_panel", (0.04, 2 * WELL_Y, FLOOR - BODY_BOTTOM), (BACK + 0.02, 0, (FLOOR + BODY_BOTTOM) / 2), "paint")
    mirrored(kit, "taillight", (0.05, 0.14, 0.38), BACK - 0.01, SIDE - 0.08, 0.2, "red")
    kit.box("rear_bumper", (0.18, 1.7, 0.2), (-LENGTH / 2 + 0.09, 0, BODY_BOTTOM - 0.05), "under")


def check_size(kit: Kit) -> None:
    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in kit._parts:
        for v in obj.data.vertices:
            p = obj.matrix_world @ v.co
            lo = Vector((min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)))
            hi = Vector((max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)))
    if abs(hi.x - lo.x - LENGTH) > 0.01 or abs(hi.y - lo.y - WIDTH) > 0.01:
        raise RuntimeError(f"base_scout is {hi.x - lo.x:.3f} x {hi.y - lo.y:.3f} m, not {LENGTH} x {WIDTH} m")


def main() -> None:
    args = parse_args()
    kit = Kit(BASE_COLORS, SEED)
    lower_body(kit)
    hood(kit)
    cab(kit)
    bed(kit)
    kit.socket("arch_front", (WHEELS_X[0], WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (WHEELS_X[1], WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEELS_X[0], WHEEL_Z, HUB_Z + WHEEL_R + ARCH_GAP + 0.06))
    bay = {(x, y): FLOOR for x in (1, 2) for y in (1, 2)}
    hood_levels = [hood_top(G.row_x(y)) for y in range(3)]
    level_sockets(kit, G, "row", hood_levels + [ROOF] * 2 + [FLOOR] * 3, fronts={3: ROOF_FRONT}, cells=bay)
    level_sockets(kit, G, "floor", [FLOOR] * 3 + [G.top] * 2 + [FLOOR] * 3)
    check_size(kit)
    check_base(kit, "base_scout", G)
    kit.export("base_scout", args, view_size=6.5)


if __name__ == "__main__":
    main()
