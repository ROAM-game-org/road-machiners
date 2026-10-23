"""The wagon base: a stylized GAZ-66 gun truck, the Soviet cab-over 4x4 army truck ("Shishiga") with an open flatbed.

Scaled per axis against the scout, which is the real HiLux times 1.077: the real GAZ-66 is 5.66 m long, 2.32 m wide and 2.44 m tall,
and here it is 6.1 m long, 2.8 m wide across the bed sides and fenders and 2.6 m tall on its tires. The extra width gives the deck
seven columns, and the tires follow the tire rule at the stock 0.6 m.
Grid: 7 columns by 9 rows, stretched over the model by the projection: a row is 0.678 m along and a column 0.4 m across.
Half height 0.55 m, from PHYSICS.bodies.wagon. The ground is 1.4 m below the center.
Cab: columns 3 to 5, rows 1 and 2, drawn the full width of the truck as on the real cab-over. A flat front stands over the front
axle, 1.6 m long, a quarter of the truck. Levels: roof 1.2, beltline 0.42, cab bottom -0.1, with a tall upright windshield in two panes,
a vertical-slat grille between the front fenders, round headlights on the fenders and a low bumper.
Front fenders are round-arched blocks at the cab's lower corners, ringed by a dark flare.
Bed: a long flat flatbed behind the cab, 4.25 m, its floor at 0.05 is the gun deck. Low ribbed drop sides stand 0.4 m above it.
The rear axle sits at 0.78 of the length, with a short overhang behind it. Fuel tanks hang under the bed front and tail lights sit at the rear corners.
A spare wheel stands upright behind the cab on the left, in the gap between the doghouse and the left side.
The doghouse is a low box at the front of the bed, behind the cab, over the engine cells (columns 3 and 4, rows 3 and 4).
Its hole shows the engine on the bed floor, centered on PHYSICS.bodies.wagon.engine.
Transmission (columns 4 and 5, rows 5 and 6) and fuel tank (column 2, rows 3 and 4) stand on the bed floor.
Wheels sit on rows 1 and 7 in the outer columns, radius 0.6 m, half width 0.25 m, mount 0.4 m below the center, 1.12 m off the center line.
Deviations from the real truck: the wheels stay symmetric, and the cab and bed run wider than the 2.32 m of the original.
The gun on the original is left to the gun parts on the deck cells.
Run: blender --background --python tools/blender/base_wagon.py -- public/models/base_wagon.glb [tmp/base_wagon.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args, round_sides  # noqa: E402
from parts_common_base import ARCH_CLEARANCE, BASE_COLORS, SUSPENSION_REST, Grid, check_base, cut_boxes, flare_profile, level_sockets, round_arch  # noqa: E402
from shapes import prism  # noqa: E402
from wheel_look import TIRE_R, TIRE_W, drawn_wheel  # noqa: E402

SEED = 304
LENGTH = 6.1
WIDTH = 2.8
ROWS = 9
COLS = 7


class Frame(Grid):
    """The chassis grid stretched over the model, the way singleCellRect() in body.ts projects it."""

    def __init__(self, half_height: float) -> None:
        super().__init__(ROWS, COLS, half_height)
        self.half_x = LENGTH / 2
        self.half_y = WIDTH / 2
        self.row_step = LENGTH / ROWS
        self.col_step = WIDTH / COLS

    def row_x(self, y: float) -> float:
        return self.half_x - self.row_step * (y + 0.5)

    def col_y(self, x: float) -> float:
        return self.half_y - self.col_step * (x + 0.5)


G = Frame(half_height=0.55)
WHEEL_R = 0.6
WHEEL_HALF_W = 0.25
WHEEL_Z = 1.12
HUB_Z = -0.4 - SUSPENSION_REST
WHEEL_X = 1.8
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03
ARCH_R = WHEEL_R + ARCH_CLEARANCE

HALF_X = G.half_x
HALF_Y = G.half_y
SIDE = HALF_Y - 0.02
FRAME_BOTTOM = -0.62
FLOOR = 0.05
FLOOR_BOTTOM = -0.07
SIDE_TOP = 0.45
WALL = 0.08

CAB_FRONT = 2.85
CAB_BACK = 1.25
CAB_BOTTOM = -0.1
BELT = 0.42
ROOF = 1.2
ROOF_T = 0.1
CAB_SIDE = 1.3
FENDER_FRONT = 2.9
FENDER_TOP = 0.1

DOG_TOP = 0.4
DOG_WALL = 0.05
HOLE_MARGIN = 0.02
HOLE = ((G.row_x(4.5) - HOLE_MARGIN, G.col_y(3.5) - HOLE_MARGIN), (G.row_x(2.5) + HOLE_MARGIN, G.col_y(1.5) + HOLE_MARGIN))
DOG_FRONT = HOLE[1][0] + DOG_WALL
BAY_FLOOR = FLOOR

SPARE_R = 0.45
SPARE_T = 0.2


def mirrored(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def clip_x(profile: list[tuple[float, float]], x0: float, x1: float) -> list[tuple[float, float]]:
    """The part of a closed XZ profile between x0 and x1, cut straight across at both ends."""
    out = profile
    for keep, edge in ((lambda x: x >= x0, x0), (lambda x: x <= x1, x1)):
        pts, out = out, []
        for i, p in enumerate(pts):
            q = pts[(i + 1) % len(pts)]
            if keep(p[0]):
                out.append(p)
            if keep(p[0]) != keep(q[0]):
                t = (edge - p[0]) / (q[0] - p[0])
                out.append((edge, p[1] + t * (q[1] - p[1])))
    return out


def underbody(kit: Kit) -> None:
    """The dark frame between the wells, both axles with their differentials, the fuel tanks and the bumpers."""
    kit.box("core", (2 * HALF_X - 0.2, 0.9, FLOOR_BOTTOM - FRAME_BOTTOM), (0, 0, (FLOOR_BOTTOM + FRAME_BOTTOM) / 2), "under")
    for i, wx in enumerate((WHEEL_X, -WHEEL_X)):
        kit.box(f"axle{i}", (0.16, 2 * WELL_Y, 0.4), (wx, 0, HUB_Z + 0.08), "under")
        kit.box(f"diff{i}", (0.4, 0.4, 0.4), (wx, 0.12, HUB_Z + 0.08), "under")
    for s, y in (("l", 0.68), ("r", -0.68)):
        kit.cylinder(f"tank_{s}", 0.2, 0.9, (0.5, y, -0.33), "metal", rot=(0, math.pi / 2, 0), vertices=round_sides(0.2))
    kit.box("front_bumper", (0.14, 2 * CAB_SIDE, 0.18), (HALF_X - 0.07, 0, -0.54), "under")
    kit.box("rear_bumper", (0.12, 2 * CAB_SIDE - 0.2, 0.15), (-HALF_X + 0.06, 0, -0.47), "under")
    kit.box("rear_beam", (0.1, 2 * CAB_SIDE, FLOOR_BOTTOM + 0.4), (-HALF_X + 0.15, 0, FLOOR_BOTTOM - 0.16), "under")
    mirrored(kit, "mud_flap", (0.04, 0.5, 0.45), -WHEEL_X - ARCH_R - 0.06, WHEEL_Z, -0.32, "under")


def flares(kit: Kit) -> None:
    """A dark ring on the outer face over each tire, cut off at the cab back for the front pair."""
    for i, wx in enumerate((WHEEL_X, -WHEEL_X)):
        x_min, x_max = (CAB_BACK, FENDER_FRONT) if wx > 0 else (-HALF_X, HALF_X)
        ring = flare_profile(wx, HUB_Z, WHEEL_R, FRAME_BOTTOM, x_min, x_max)
        prism(kit, f"flare{i}_l", ring, HALF_Y - 0.02, HALF_Y, "under")
        prism(kit, f"flare{i}_r", ring, -HALF_Y, -HALF_Y + 0.02, "under")


def front_end(kit: Kit) -> None:
    """Round-arched fenders at the cab's lower corners with round headlights, a vertical-slat grille and a plain cab underside."""
    far_back = WHEEL_X - ARCH_R - 0.4
    arch = round_arch(WHEEL_X, HUB_Z, ARCH_R, FRAME_BOTTOM)
    outline = [(far_back, FRAME_BOTTOM), *arch, (FENDER_FRONT, FRAME_BOTTOM), (FENDER_FRONT, FENDER_TOP - 0.12), (FENDER_FRONT - 0.12, FENDER_TOP), (far_back, FENDER_TOP)]
    piece = clip_x(outline, CAB_BACK, FENDER_FRONT)
    prism(kit, "fender_l", piece, WELL_Y, HALF_Y - 0.02, "paint")
    prism(kit, "fender_r", piece, -HALF_Y + 0.02, -WELL_Y, "paint")
    for s, y in (("l", 1.1), ("r", -1.1)):
        kit.cylinder(f"lamp_{s}", 0.13, 0.05, (FENDER_FRONT + 0.02, y, -0.08), "light", rot=(0, math.pi / 2, 0), vertices=round_sides(0.13))
    face = (CAB_FRONT + FENDER_FRONT) / 2
    kit.box("grille", (0.06, 2 * WELL_Y, BELT + 0.45), (face, 0, (BELT - 0.45) / 2), "under")
    slats = 9
    for i in range(slats):
        y = (i - (slats - 1) / 2) * (2 * WELL_Y - 0.16) / (slats - 1)
        kit.box(f"slat{i}", (0.03, 0.04, BELT + 0.35), (FENDER_FRONT + 0.005, y, (BELT - 0.35) / 2), "metal")


def cab(kit: Kit) -> None:
    """A flat-fronted cab-over: painted doors to the beltline, tall glass in two upright panes under a trim roof, and mirror posts."""
    length = CAB_FRONT - CAB_BACK
    mid = (CAB_FRONT + CAB_BACK) / 2
    kit.box("doors", (length, 2 * CAB_SIDE, BELT - CAB_BOTTOM), (mid, 0, (BELT + CAB_BOTTOM) / 2), "paint")
    glass_h = ROOF - ROOF_T - BELT
    kit.box("glass", (length - 0.1, 2 * CAB_SIDE - 0.1, glass_h), (mid - 0.05, 0, BELT + glass_h / 2), "glass")
    post = 0.09
    for sx, x in ((1, CAB_FRONT - post / 2 + 0.01), (-1, CAB_BACK + post / 2)):
        mirrored(kit, f"post{sx}", (post, post, glass_h), x, CAB_SIDE - post / 2, BELT + glass_h / 2, "paint")
    kit.box("mullion", (0.1, 0.1, glass_h), (CAB_FRONT + 0.01, 0, BELT + glass_h / 2), "paint")
    mirrored(kit, "door_post", (post, post, glass_h), mid, CAB_SIDE - post / 2, BELT + glass_h / 2, "paint")
    kit.box("back_wall", (0.08, 2 * CAB_SIDE, glass_h), (CAB_BACK + 0.04, 0, BELT + glass_h / 2), "paint")
    kit.box("roof", (length + 0.08, 2 * CAB_SIDE + 0.06, ROOF_T), (mid + 0.04, 0, ROOF - ROOF_T / 2), "trim")
    mirrored(kit, "mirror", (0.05, 0.08, 0.34), CAB_FRONT - 0.15, HALF_Y - 0.04, BELT + 0.3, "metal")


def doghouse(kit: Kit) -> None:
    """A low box over the engine cells at the front of the bed, with a hole down to the bed floor."""
    (x0, y0), (x1, y1) = HOLE
    front, back = DOG_FRONT, x0 - DOG_WALL
    box = kit.box("doghouse", (front - back, y1 - y0 + 2 * DOG_WALL, DOG_TOP - FLOOR), ((front + back) / 2, (y0 + y1) / 2, (DOG_TOP + FLOOR) / 2), "paint")
    cut_boxes(box, [((x0, y0, FLOOR - 0.01), (x1, y1, DOG_TOP + 0.1))])
    box.data.materials.clear()
    box.data.materials.append(kit._materials["paint"])
    for i in range(3):
        kit.box(f"louver{i}", (0.5, 0.02, 0.05), ((front + back) / 2, y1 + DOG_WALL + 0.01, FLOOR + 0.1 + 0.08 * i), "under")


def bed(kit: Kit) -> None:
    """A long flat bed: a plank floor, low drop sides with horizontal ribs and posts, a tailgate and red tail lights."""
    back = -HALF_X + 0.05
    length = CAB_BACK - back
    mid = (CAB_BACK + back) / 2
    kit.box("floor", (length, 2 * SIDE, FLOOR - FLOOR_BOTTOM), (mid, 0, (FLOOR + FLOOR_BOTTOM) / 2), "metal_dark")
    h = SIDE_TOP - FLOOR
    mirrored(kit, "side", (length, WALL, h), mid, SIDE - WALL / 2, FLOOR + h / 2, "paint")
    for i, z in enumerate((0.14, 0.26, 0.38)):
        mirrored(kit, f"rib{i}", (length - 0.1, 0.02, 0.05), mid, HALF_Y - 0.01, z, "trim")
    for i, x in enumerate((-2.4, -1.0, 0.4)):
        mirrored(kit, f"stake{i}", (0.1, 0.03, h), x, HALF_Y - 0.015, FLOOR + h / 2, "under")
    kit.box("tailgate", (WALL, 2 * (SIDE - WALL), h), (back + WALL / 2, 0, FLOOR + h / 2), "paint")
    for i, z in enumerate((0.14, 0.26, 0.38)):
        kit.box(f"gate_rib{i}", (0.02, 2 * (SIDE - WALL) - 0.1, 0.05), (back - 0.01, 0, z), "trim")
    mirrored(kit, "taillight", (0.05, 0.14, 0.2), -HALF_X + 0.025, SIDE - 0.14, 0.2, "red")


def spare(kit: Kit) -> None:
    """A spare wheel standing upright behind the cab on the left, in the look of the mounted wheels."""
    x = CAB_BACK - SPARE_T / 2 - 0.01
    y = HALF_Y - SPARE_R - 0.02
    z = FLOOR + SPARE_R
    drawn_wheel(kit, "spare", (x, y, z), SPARE_R / TIRE_R, SPARE_T / TIRE_W, lugs=False, rot=(0, math.pi / 2, 0))


def bounds(kit: Kit) -> tuple[Vector, Vector]:
    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in kit._parts:
        for v in obj.data.vertices:
            p = obj.matrix_world @ v.co
            lo = Vector((min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)))
            hi = Vector((max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)))
    return lo, hi


def check_size(kit: Kit) -> None:
    lo, hi = bounds(kit)
    if abs(hi.x - lo.x - LENGTH) > 0.01 or abs(hi.y - lo.y - WIDTH) > 0.01:
        raise RuntimeError(f"base_wagon is {hi.x - lo.x:.3f} x {hi.y - lo.y:.3f} m, not {LENGTH} x {WIDTH} m")


def main() -> None:
    args = parse_args()
    kit = Kit(BASE_COLORS, SEED)
    underbody(kit)
    flares(kit)
    front_end(kit)
    cab(kit)
    doghouse(kit)
    bed(kit)
    spare(kit)
    fenders = {(x, y): FENDER_TOP for x in (0, 6) for y in (1, 2)}
    level_sockets(kit, G, "row", [ROOF] * 3 + [FLOOR] * 6, cells=fenders)
    level_sockets(kit, G, "floor", [BELT] * 3 + [BAY_FLOOR] * 6)
    check_size(kit)
    check_base(kit, "base_wagon", G)
    kit.export("base_wagon", args, view_size=8.0)


if __name__ == "__main__":
    main()
