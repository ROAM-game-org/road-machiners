"""The convertible base: a stylized 1964 Chevrolet Corvair Monza convertible with its soft top up.

Built from the published specs scaled by 1.278, so it keeps its 5.84 m game length: 2.17 m wide across the crease,
a 3.5 m wheelbase, a 1.8 m track and 1.73 m to the top of the soft top on its tires. The ground is 1.06 m below the center.
Levels: top crown 0.67, flat lids 0.10, the crease ridge 0.02, body bottom -0.76, 0.30 m over the ground.
One long low slab: a sharp crease wraps the nose, both sides and the tail at the lid edge, and the body tucks in under it.
The flat front lid has no grille and falls a little to the nose, where one round headlamp sits in each corner under the
crease, with a thin trim bar between them. The raked windshield runs from the cowl at x 1.05 up to the header at x 0.62.
The soft top in the faction's second color has a flat crown from x 0.6 to -0.6, where items on the cab cells stand, side
windows, and a steep rear drop with a small rear window to the flat rear lid at x -1.0. The rear lid has the engine
cutout over rows 6 and 7, columns 1 and 2, a dark louvered grille behind it and two round taillights a side.
Slab doors from x 0.85 to -0.55 keep DOOR_GAP from the flares, and a chrome rocker runs between the arches.
Round arches of 32 edges sit close over the tires, whose outer faces stand flush with the sides.
Deviations from the car: the wheels stay symmetric, the body rides 0.30 m up instead of 0.24, the tires follow the tire
rule, and the top spans the grid's cab rows 3 to 5, so its crown starts a little ahead of the car's and the rear lid is longer.
Grid: 5 columns by 9 rows, stretched over the model by the projection. Half height 0.35 m, from PHYSICS.bodies.convertible.
Wheels sit at x -+1.75 and y -+0.9, radius 0.46 m, half width 0.18 m, mount 0.2 m below the center.
Sockets arch_front, arch_rear and arch_front_top mark the arches for wheelArches.test.ts.
Run: blender --background --python tools/blender/base_convertible.py -- public/models/base_convertible.glb [tmp/base_convertible.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, Vec3, parse_args  # noqa: E402
from parts_common_base import (  # noqa: E402
    ARCH_CLEARANCE,
    BASE_COLORS,
    INSET,
    SUSPENSION_REST,
    Grid,
    arch_cut,
    check_base,
    check_door_gap,
    cut_boxes,
    hull_mesh,
    level_sockets,
)
from parts_common_core import ROUND_LARGE, ROUND_SMALL  # noqa: E402
from shapes import strut  # noqa: E402

SEED = 305
G = Grid(rows=9, cols=5, half_height=0.35)
WHEEL_R = 0.46  # PHYSICS.bodies.convertible.wheelRadius
WHEEL_HALF_W = 0.18  # PHYSICS.bodies.convertible.wheelHalfWidth
WHEEL_X = 1.75  # PHYSICS.bodies.convertible.wheelX: half the 2.74 m wheelbase times 1.278
WHEEL_Z = 0.9  # PHYSICS.bodies.convertible.wheelZ: half the 1.42 m mean track times 1.278
HUB_Z = -0.2 - SUSPENSION_REST  # PHYSICS.bodies.convertible.wheelY
WHEELS_X = [WHEEL_X, -WHEEL_X]
ARCH_R = WHEEL_R + ARCH_CLEARANCE
ARCH_EDGES = ROUND_LARGE // 2
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03

HALF_W = 1.085  # half the 1.70 m width times 1.278, at the crease ridge
SIDE = HALF_W - 0.055  # the body side under the ridge
TUCK = 0.1  # the body bottom stands this far inside the sides
END_TUCK = 0.12  # and this far inside the nose and the tail
NOSE = G.half_x - INSET
RIDGE_END = G.half_x - 0.005
CORNER = 0.28  # the rounded corners of the plan, cut at the crease
DECK = 0.10  # the flat lids, 1.16 m over the ground
RIDGE = DECK - 0.08
CREASE_LOW = DECK - 0.14
BOTTOM = -0.76  # 0.30 m over the ground
FLOOR = DECK - 0.38  # the engine bay floor: a 0.5 m engine block pokes 0.12 m out of the cutout
COWL = 1.05
HEADER_X = 0.62
SCREEN_Z = 0.61
ROOF_TOP = 0.67  # 1.73 m over the ground: 1.30 m times 1.278 plus the raised ride
CROWN_FRONT = 0.6
CROWN_BACK = -0.6
TOP_FOOT = -1.0
TOP_HALF = 0.95
COL = 2 * HALF_W / G.cols
BAY_FRONT = TOP_FOOT
BAY_BACK = G.row_x(7.5)
BAY_LEFT = HALF_W - COL
BAY_RIGHT = HALF_W - 3 * COL
DOOR_FRONT = 0.85
DOOR_BACK = -0.55
LAMP_Z = DECK - 0.25
HEADLAMP_Y = 0.74
TAIL_Y = (0.82, 0.58)


def add_hull(kit: Kit, name: str, points: list[Vec3], mat: str) -> object:
    obj = hull_mesh(name, points)
    kit._add(obj, name, mat, 0.0)
    return obj


def mirror(points: list[tuple[float, float, float]]) -> list[Vec3]:
    return [p for x, y, z in points for p in ((x, y, z), (x, -y, z))]


def side_y(z: float) -> float:
    """The body side at height z: SIDE at the crease, tucked TUCK in at the bottom."""
    return SIDE - TUCK * (CREASE_LOW - z) / (CREASE_LOW - BOTTOM)


def end_x(z: float) -> float:
    """The nose face at height z: NOSE at the crease, tucked END_TUCK back at the bottom. The tail mirrors it."""
    return NOSE - END_TUCK * (CREASE_LOW - z) / (CREASE_LOW - BOTTOM)


def bay_box() -> tuple[Vec3, Vec3]:
    return ((BAY_BACK, BAY_RIGHT, FLOOR), (BAY_FRONT, BAY_LEFT, DECK + 0.1))


def lower_body(kit: Kit) -> None:
    """The slab under the crease, tucked in toward the bottom, with round arches over the wheels and the engine bay cut out."""
    layers = [(BOTTOM, NOSE - END_TUCK, SIDE - TUCK, CORNER - 0.06), (CREASE_LOW, NOSE, SIDE, CORNER - 0.03)]
    points: list[tuple[float, float, float]] = []
    for z, end, half, corner in layers:
        for sx in (1, -1):
            points += [(sx * end, half - corner, z), (sx * (end - corner), half, z)]
    body = add_hull(kit, "body", mirror(points), "paint")
    arch_cut(body, WHEELS_X, HUB_Z, WHEEL_R, WELL_Y, BOTTOM, ARCH_EDGES)
    cut_boxes(body, [bay_box()])


def crease_station(x: float, inset: float, top: float) -> list[tuple[float, float, float]]:
    return [(x, SIDE - inset, CREASE_LOW), (x, HALF_W - inset, RIDGE), (x, SIDE - 0.03 - inset, top)]


def lids(kit: Kit) -> None:
    """The crease band and the flat lids over it: the front lid falling a little to the nose, the long rear lid with the engine cutout."""
    front = crease_station(COWL, 0, DECK) + crease_station(RIDGE_END - CORNER, 0, DECK - 0.03) + crease_station(RIDGE_END, CORNER, DECK - 0.05)
    add_hull(kit, "front_lid", mirror(front), "paint")
    rear = crease_station(COWL, 0, DECK) + crease_station(-RIDGE_END + CORNER, 0, DECK) + crease_station(-RIDGE_END, CORNER, DECK - 0.04)
    cut_boxes(add_hull(kit, "rear_lid", mirror(rear), "paint"), [bay_box()])
    kit.box("bay_floor", (BAY_FRONT - BAY_BACK, BAY_LEFT - BAY_RIGHT, 0.02), ((BAY_FRONT + BAY_BACK) / 2, (BAY_LEFT + BAY_RIGHT) / 2, FLOOR + 0.01), "under")
    grille_front, grille_back = BAY_BACK - 0.08, -RIDGE_END + CORNER
    count = 5
    pitch = (grille_front - grille_back) / count
    for i in range(count):
        kit.box(f"louver{i}", (pitch * 0.55, 2 * (SIDE - CORNER), 0.02), (grille_front - pitch * (i + 0.5), 0, DECK + 0.005), "under")


def front(kit: Kit) -> None:
    """One round headlamp in each nose corner under the crease, with a thin trim bar between them."""
    face = end_x(LAMP_Z)
    for s, sy in (("l", 1), ("r", -1)):
        kit.cylinder(f"lamp_bezel_{s}", 0.14, 0.03, (face + 0.01, sy * HEADLAMP_Y, LAMP_Z), "metal_light", rot=(0, math.pi / 2, 0), vertices=ROUND_SMALL)
        kit.cylinder(f"lamp_{s}", 0.11, 0.03, (face + 0.025, sy * HEADLAMP_Y, LAMP_Z), "light", rot=(0, math.pi / 2, 0), vertices=ROUND_SMALL)
    bar = 2 * (HEADLAMP_Y - 0.16)
    kit.box("nose_bar", (0.03, bar, 0.05), (face + 0.01, 0, LAMP_Z), "metal_light")


def rear(kit: Kit) -> None:
    """Two round taillights a side on the tail under the crease, with a trim bar between them."""
    face = -end_x(LAMP_Z)
    for s, sy in (("l", 1), ("r", -1)):
        for i, y in enumerate(TAIL_Y):
            kit.cylinder(f"tail_bezel{i}_{s}", 0.1, 0.03, (face - 0.01, sy * y, LAMP_Z), "metal_light", rot=(0, math.pi / 2, 0), vertices=ROUND_SMALL)
            kit.cylinder(f"taillight{i}_{s}", 0.08, 0.03, (face - 0.025, sy * y, LAMP_Z), "red", rot=(0, math.pi / 2, 0), vertices=ROUND_SMALL)
    bar = 2 * (TAIL_Y[1] - 0.12)
    kit.box("tail_bar", (0.03, bar, 0.05), (face - 0.01, 0, LAMP_Z), "metal_light")


def sides(kit: Kit) -> None:
    """Door seams on the slab sides, clear of the flares, and a chrome rocker between the arches."""
    low = BOTTOM + 0.1
    check_door_gap("door", DOOR_FRONT, DOOR_BACK, low, WHEELS_X, HUB_Z, ARCH_R)
    top = CREASE_LOW - 0.03
    for s, sy in (("l", 1), ("r", -1)):
        for i, x in enumerate((DOOR_FRONT, DOOR_BACK)):
            strut(kit, f"door_seam{i}_{s}", (x, sy * (side_y(low) + 0.004), low), (x, sy * (side_y(top) + 0.004), top), 0.025, "under")
        rocker_z = BOTTOM + 0.06
        length = 2 * (WHEEL_X - ARCH_R - 0.06)
        kit.box(f"rocker_{s}", (length, 0.03, 0.06), (0, sy * side_y(rocker_z), rocker_z), "metal_light")


def windshield(kit: Kit) -> None:
    """The raked windshield, a little wrapped at the A-pillars, in a chrome frame, with a quarter glass behind each pillar."""
    glass = [(COWL, TOP_HALF, DECK), (COWL - 0.04, TOP_HALF, DECK), (HEADER_X, TOP_HALF - 0.05, SCREEN_Z), (HEADER_X - 0.04, TOP_HALF - 0.05, SCREEN_Z)]
    add_hull(kit, "windshield", mirror(glass), "glass")
    for s, sy in (("l", 1), ("r", -1)):
        strut(kit, f"a_pillar_{s}", (COWL - 0.02, sy * TOP_HALF, DECK), (HEADER_X - 0.02, sy * (TOP_HALF - 0.05), SCREEN_Z), 0.05, "metal_light")
        quarter = [(COWL - 0.04, sy * (TOP_HALF - 0.01), DECK), (HEADER_X, sy * (TOP_HALF - 0.05), SCREEN_Z), (HEADER_X, sy * (TOP_HALF - 0.01), DECK)]
        add_hull(kit, f"quarter_glass_{s}", quarter + [(x, y - sy * 0.03, z) for x, y, z in quarter], "glass")
    strut(kit, "header", (HEADER_X - 0.02, TOP_HALF - 0.03, SCREEN_Z), (HEADER_X - 0.02, -TOP_HALF + 0.03, SCREEN_Z), 0.05, "metal_light")


def soft_top(kit: Kit) -> None:
    """The soft top up: upright sides with windows, a flat crown where cab items stand, and a steep rear drop with a small window."""
    shoulder = ROOF_TOP - 0.05
    points = [
        (HEADER_X + 0.01, TOP_HALF, DECK),
        (TOP_FOOT, TOP_HALF, DECK),
        (HEADER_X + 0.01, TOP_HALF, shoulder),
        (CROWN_BACK - 0.04, TOP_HALF, shoulder),
        (CROWN_FRONT, TOP_HALF - 0.06, ROOF_TOP),
        (CROWN_BACK, TOP_HALF - 0.06, ROOF_TOP),
    ]
    add_hull(kit, "soft_top", mirror(points), "trim")
    for s, sy in (("l", 1), ("r", -1)):
        for i, (x0, x1) in enumerate(((0.56, 0.04), (-0.02, -0.42))):
            back_top = x1 - (0.1 if i == 1 else 0)
            pane = [(x0, DECK + 0.08), (x1, DECK + 0.08), (back_top, shoulder - 0.06), (x0, shoulder - 0.06)]
            add_hull(kit, f"side_glass{i}_{s}", [(x, sy * y, z) for x, z in pane for y in (TOP_HALF - 0.01, TOP_HALF + 0.012)], "glass")
    run, rise = TOP_FOOT - (CROWN_BACK - 0.04), DECK - shoulder
    norm = math.hypot(run, rise)
    nx, nz = -rise / norm, run / norm
    if nx > 0:
        nx, nz = -nx, -nz
    window: list[tuple[float, float, float]] = []
    for t, half in ((0.15, 0.48), (0.7, 0.42)):
        x = CROWN_BACK - 0.04 + run * t
        z = shoulder + rise * t
        for out in (-0.01, 0.012):
            window += [(x + nx * out, half, z + nz * out)]
    add_hull(kit, "rear_glass", mirror(window), "glass")


def main() -> None:
    args = parse_args()
    kit = Kit(BASE_COLORS, SEED)
    lower_body(kit)
    lids(kit)
    front(kit)
    rear(kit)
    sides(kit)
    windshield(kit)
    soft_top(kit)
    bay = {(x, y): FLOOR for x in (1, 2) for y in (6, 7)}
    level_sockets(kit, G, "row", [DECK] * 3 + [ROOF_TOP] * 3 + [DECK] * 3, fronts={3: CROWN_FRONT}, cells=bay)
    level_sockets(kit, G, "floor", [DECK - 0.5] * 3 + [FLOOR] * 5 + [DECK])
    kit.socket("arch_front", (WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (-WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEEL_X, WHEEL_Z, HUB_Z + ARCH_R))
    check_base(kit, "base_convertible", G)
    kit.export("base_convertible", args, view_size=7.0)


if __name__ == "__main__":
    main()
