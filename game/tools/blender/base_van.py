"""The van base: a 1983-91 Chevrolet G20 Chevy Van, 125 in wheelbase, regular body, in a Starcraft style conversion.

Sized from the published G20 dimensions at the scout's 1.077 scale, so the van compares with the scout as the real vans do:
length 202.2 in (5.14 m) gives 5.53 m with the bumpers, body width 79.5 in (2.02 m) gives 2.17 m across the flares,
the 125 in (3.18 m) wheelbase gives 3.42 m, and the 79 in (2.01 m) roof gives 2.17 m. The trim cap of the conversion's raised top and the tire rule's lifted tires take it to 2.3 m.
Levels over the ground, 1.25 m below the center: rocker 0.53, bumpers 0.53 to 0.75, nose top 1.23, hood break 1.45, cowl and windshield base 1.5,
window bottoms 1.51, window tops 2.03, body top 2.09, cap top 2.3. Along X from the nose: bumper 0.1, a short hood that rolls up steeply from the
squared nose to a break 0.57 m back and rises gently to the cowl 1.33 m back (0.24 of the length), a windshield raked back to the body top 1.8 m back (0.32) under a cap whose top starts 1.92 m back (0.35),
front doors to x 0.32, then the long flat-roofed box to the tail. The hood, roof front and window levels are inferred from the
G20's side view, since the reference photos could not be fetched when the van was built.
What the model shows: a wide dark grille in a bright bezel between rectangular headlamps over a bright bumper, front doors with
glass that follows the rake, two conversion windows behind them on each side, a trim stripe along the box side, the trim roof cap
for the conversion's raised top, rear barn doors with a center seam and two windows, tall taillights at the rear corners over a
bright bumper, and round arches with slim dark flares.
Deviations from the G20: the wheels stay symmetric, 1.71 m from the center, so the rear overhang is shorter; the tires follow the
tire rule, 0.5 m radius and 0.195 m half width, 0.9 m off the center line so they stand about flush with the flares; the body is symmetric left
to right, and only seams mark the right side cargo door.
The engine shows through a hole in the hood over the engine cells, on the dark core top at FLOOR, centered on PHYSICS.bodies.van.engine.
Grid: 5 columns by 9 rows, stretched over the model by the projection. Half height 0.5 m, from PHYSICS.bodies.van.
The flat roof is the row surface for the box rows, so weapons and cargo stand on it like on a roof rack.
Sockets arch_front, arch_rear and arch_front_top mark the arches for wheelArches.test.ts.
Run: blender --background --python tools/blender/base_van.py -- public/models/base_van.glb [tmp/base_van.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402
from parts_common_base import (  # noqa: E402
    ARCH_CLEARANCE,
    BASE_COLORS,
    ROUND_ARCH_SEGMENTS,
    SUSPENSION_REST,
    Grid,
    check_base,
    check_door_gap,
    cut_boxes,
    door_sill,
    flare,
    hull_layers,
    level_sockets,
    round_arch,
)
from parts_common_core import ROUND_SEGMENTS, check_round  # noqa: E402
from shapes import prism  # noqa: E402

SEED = 302
LENGTH = 5.53
WIDTH = 2.17
G = Grid(rows=9, cols=5, half_height=0.5)
WHEEL_R = 0.5  # PHYSICS.bodies.van.wheelRadius
WHEEL_HALF_W = 0.195  # PHYSICS.bodies.van.wheelHalfWidth
WHEEL_Z = 0.9  # PHYSICS.bodies.van.wheelZ
WHEEL_X = 1.71  # PHYSICS.bodies.van.wheelX
HUB_Z = -0.35 - SUSPENSION_REST  # PHYSICS.bodies.van.wheelY
WHEELS_X = [WHEEL_X, -WHEEL_X]
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03
ARCH_R = WHEEL_R + ARCH_CLEARANCE
ARCH_SEGMENTS = ROUND_ARCH_SEGMENTS  # edges per half circle; a whole arch circle keeps the shared ROUND_SEGMENTS

FLARE_OUT = 0.025
SIDE = WIDTH / 2 - FLARE_OUT
BUMPER = 0.1
NOSE = LENGTH / 2 - BUMPER
TAIL = -NOSE
BOTTOM = G.bottom
FLOOR = -0.25
NOSE_TOP = -0.02
HOOD_BREAK_X = 2.2  # the hood rises gently from the cowl to here, then rolls down steeply to the nose
HOOD_BREAK = 0.2
NOSE_CHAMFER = 0.08
COWL_X = 1.435
COWL = 0.25
ROOF_FRONT = 0.97
ROOF = 1.05
ROOF_T = 0.21
UNDER_ROOF = ROOF - ROOF_T
ROOF_CHAMFER = 0.06
CAP_SLOPE = 0.12  # the cap's front leans back this far from its foot to its top
CAP_INSET = 0.07
BELT = 0.26
WINDOW_TOP = 0.78
B_PILLAR = 0.32
CARGO_DOOR_BACK = -0.95
CONVERSION_WINDOWS = ((0.18, -0.85), (-1.05, -2.3))
WINDOW_LOW = 0.3
WINDOW_HIGH = 0.76
STRIPE = (-0.04, 0.07)
SEAM = 0.035
PROUD = 0.012

ENGINE_X = 1.827  # PHYSICS.bodies.van.engine.x
ENGINE_Y = 0.218  # -PHYSICS.bodies.van.engine.z
ENGINE_HALF = (0.327, 0.436)  # the drawn engine: restOn() of the engine cells, on the core top
HOLE_MARGIN = 0.02
HOLE = ((ENGINE_X - ENGINE_HALF[0] - HOLE_MARGIN, ENGINE_Y - ENGINE_HALF[1] - HOLE_MARGIN), (ENGINE_X + ENGINE_HALF[0] + HOLE_MARGIN, ENGINE_Y + ENGINE_HALF[1] + HOLE_MARGIN))


def hood_z(x: float) -> float:
    """The hood top at X: a steep roll from the nose chamfer up to the break, then a gentle rise to the cowl."""
    x0 = NOSE - NOSE_CHAMFER
    if x >= HOOD_BREAK_X:
        return NOSE_TOP + (HOOD_BREAK - NOSE_TOP) * (x0 - x) / (x0 - HOOD_BREAK_X)
    return HOOD_BREAK + (COWL - HOOD_BREAK) * (HOOD_BREAK_X - x) / (HOOD_BREAK_X - COWL_X)


def rake_x(z: float) -> float:
    """The windshield's X at height z."""
    return COWL_X + (ROOF_FRONT - COWL_X) * (z - COWL) / (UNDER_ROOF - COWL)


def mirrored(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def side_panel(kit: Kit, name: str, profile: list[tuple[float, float]], mat: str, sides: tuple[int, ...] = (1, -1)) -> None:
    """A flat XZ shape laid PROUD on the body side, on the left side for 1 and the right side for -1."""
    for s in sides:
        y0, y1 = (SIDE, SIDE + PROUD) if s > 0 else (-SIDE - PROUD, -SIDE)
        prism(kit, f"{name}_{'l' if s > 0 else 'r'}", profile, y0, y1, mat)


def rect(x0: float, x1: float, z0: float, z1: float) -> list[tuple[float, float]]:
    return [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]


def nose_line() -> list[tuple[float, float]]:
    """The top line from the nose up the hood, the raked windshield and back along the roof, from front to back."""
    return [(NOSE, NOSE_TOP - NOSE_CHAMFER), (NOSE - NOSE_CHAMFER, NOSE_TOP), (HOOD_BREAK_X, HOOD_BREAK), (COWL_X, COWL), (ROOF_FRONT, UNDER_ROOF), (TAIL, UNDER_ROOF)]


def body(kit: Kit) -> None:
    """Painted side walls with round arches, a center slab over the dark core with the engine hole cut in its hood, and the flares."""
    check_round("van arches", 2 * ARCH_SEGMENTS, ROUND_SEGMENTS)
    wall = [(TAIL, BOTTOM)]
    for wx in sorted(WHEELS_X):
        wall += round_arch(wx, HUB_Z, ARCH_R, BOTTOM, ARCH_SEGMENTS)
    wall += [(NOSE, BOTTOM), *nose_line()]
    prism(kit, "wall_l", wall, WELL_Y, SIDE, "paint")
    prism(kit, "wall_r", wall, -SIDE, -WELL_Y, "paint")
    slab = prism(kit, "slab", [(TAIL, FLOOR), (NOSE, FLOOR), *nose_line()], -WELL_Y, WELL_Y, "paint")
    (x0, y0), (x1, y1) = HOLE
    cut_boxes(slab, [((x0, y0, FLOOR - 0.01), (x1, y1, COWL + 0.1))])
    slab.data.materials.clear()
    slab.data.materials.append(kit._materials["paint"])
    kit.box("core", (NOSE - TAIL - 0.08, 2 * WELL_Y, FLOOR - BOTTOM), (0, 0, (FLOOR + BOTTOM) / 2), "under")
    for x, name in ((NOSE - 0.02, "valance"), (TAIL + 0.02, "rear_panel")):
        kit.box(name, (0.04, 2 * WELL_Y, FLOOR - BOTTOM), (x, 0, (FLOOR + BOTTOM) / 2), "paint")
    for i, wx in enumerate(WHEELS_X):
        flare(kit, f"flare{i}_l", G, wx, HUB_Z, WHEEL_R, SIDE, SIDE + FLARE_OUT, segments=ARCH_SEGMENTS)
        flare(kit, f"flare{i}_r", G, wx, HUB_Z, WHEEL_R, -SIDE - FLARE_OUT, -SIDE, segments=ARCH_SEGMENTS)


def nose(kit: Kit) -> None:
    """A bright bezel across the face holding a wide dark grille between rectangular headlamps, over a bright bumper."""
    face = NOSE + PROUD / 2
    kit.box("bezel", (PROUD, 2 * (SIDE - 0.06), 0.42), (face, 0, -0.27), "metal_light")
    kit.box("grille", (PROUD + 0.01, 1.16, 0.34), (face, 0, -0.27), "under")
    for i, z in enumerate((-0.33, -0.21)):
        kit.box(f"grille_bar{i}", (PROUD + 0.02, 1.08, 0.04), (face, 0, z), "metal_light")
    mirrored(kit, "lamp", (PROUD + 0.01, 0.34, 0.2), face, 0.8, -0.27, "light")
    kit.box("bumper", (BUMPER, 2 * (SIDE - 0.02), 0.22), (NOSE + BUMPER / 2, 0, BOTTOM + 0.11), "metal_light")


def glass(kit: Kit) -> None:
    """The raked windshield with painted pillars at its sides, the front door glass following the rake, and the conversion windows."""
    lo, hi = COWL + 0.04, UNDER_ROOF - 0.04
    shield = [(rake_x(lo), lo), (rake_x(lo) + 0.02, lo), (rake_x(hi) + 0.02, hi), (rake_x(hi), hi)]
    prism(kit, "windshield", shield, -SIDE + 0.1, SIDE - 0.1, "glass")
    door = [(B_PILLAR + 0.06, BELT), (rake_x(BELT) - 0.1, BELT), (rake_x(WINDOW_TOP) - 0.1, WINDOW_TOP), (B_PILLAR + 0.06, WINDOW_TOP)]
    check_door_gap("door_window", B_PILLAR + 0.06, rake_x(BELT) - 0.1, BELT, WHEELS_X, HUB_Z, ARCH_R)
    side_panel(kit, "door_window", door, "glass")
    for i, (x0, x1) in enumerate(CONVERSION_WINDOWS):
        side_panel(kit, f"window{i}", rect(x1, x0, WINDOW_LOW, WINDOW_HIGH), "glass")


def sides(kit: Kit) -> None:
    """The trim stripe along the box side, the front door seams on both sides and the cargo door seam on the right side."""
    side_panel(kit, "stripe", rect(TAIL + 0.02, COWL_X - 0.02, *STRIPE), "trim")
    top = UNDER_ROOF - 0.05
    sill = max(STRIPE[1], door_sill(B_PILLAR, COWL_X, STRIPE[1], WHEELS_X, HUB_Z, ARCH_R))
    check_door_gap("front_door", B_PILLAR, COWL_X, sill, WHEELS_X, HUB_Z, ARCH_R)
    side_panel(kit, "door_back", rect(B_PILLAR - SEAM / 2, B_PILLAR + SEAM / 2, sill, top), "under")
    side_panel(kit, "door_front", rect(COWL_X - 0.08 - SEAM, COWL_X - 0.08, sill, COWL), "under")
    cargo_sill = door_sill(CARGO_DOOR_BACK, B_PILLAR, BOTTOM + 0.1, WHEELS_X, HUB_Z, ARCH_R)
    check_door_gap("cargo_door", CARGO_DOOR_BACK, B_PILLAR, cargo_sill, WHEELS_X, HUB_Z, ARCH_R)
    for name, x in (("cargo_door_back", CARGO_DOOR_BACK), ("cargo_door_front", B_PILLAR)):
        side_panel(kit, name, rect(x - SEAM / 2, x + SEAM / 2, cargo_sill, top), "under", sides=(-1,))
    side_panel(kit, "cargo_door_sill", rect(CARGO_DOOR_BACK, B_PILLAR, cargo_sill, cargo_sill + SEAM), "under", sides=(-1,))


def roof(kit: Kit) -> None:
    """The trim roof cap, standing in for the conversion's raised fiberglass top: inset from the sides, with upright side faces, a front that leans back over the windshield and chamfered top edges."""
    half = SIDE - CAP_INSET
    layers = [
        (UNDER_ROOF, ROOF_FRONT, TAIL, half, 0.02),
        (ROOF - ROOF_CHAMFER, ROOF_FRONT - CAP_SLOPE * (1 - ROOF_CHAMFER / ROOF_T), TAIL, half, 0.02),
        (ROOF, ROOF_FRONT - CAP_SLOPE, TAIL + ROOF_CHAMFER, half - ROOF_CHAMFER, 0.02),
    ]
    kit._add(hull_layers("roof", layers), "roof", "trim", 0.0)


def tail(kit: Kit) -> None:
    """Rear barn doors with a center seam and two windows, tall taillights at the corners and a bright bumper."""
    face = TAIL - PROUD / 2
    kit.box("barn_seam", (PROUD, SEAM, UNDER_ROOF - 0.05 - (BOTTOM + 0.24)), (face, 0, (UNDER_ROOF - 0.05 + BOTTOM + 0.24) / 2), "under")
    mirrored(kit, "rear_window", (PROUD, 0.62, WINDOW_HIGH - WINDOW_LOW), face, 0.4, (WINDOW_LOW + WINDOW_HIGH) / 2, "glass")
    mirrored(kit, "taillight", (PROUD + 0.01, 0.12, 0.72), face, SIDE - 0.08, -0.15, "red")
    kit.box("rear_bumper", (BUMPER, 2 * (SIDE - 0.04), 0.22), (TAIL - BUMPER / 2, 0, BOTTOM + 0.11), "metal_light")


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
        raise RuntimeError(f"base_van is {hi.x - lo.x:.3f} x {hi.y - lo.y:.3f} m, not {LENGTH} x {WIDTH} m")


def check_hood() -> None:
    """Raises when the hood hole leaves the hood between the cowl and the nose chamfer, or the center slab."""
    (x0, y0), (x1, y1) = HOLE
    if x0 <= COWL_X or x1 >= NOSE - NOSE_CHAMFER or y0 <= -WELL_Y or y1 >= WELL_Y:
        raise RuntimeError(f"hood hole x {x0:.3f}..{x1:.3f} y {y0:.3f}..{y1:.3f} leaves the hood")


def main() -> None:
    args = parse_args()
    check_hood()
    kit = Kit(BASE_COLORS, SEED)
    body(kit)
    nose(kit)
    glass(kit)
    sides(kit)
    roof(kit)
    tail(kit)
    kit.socket("arch_front", (WHEELS_X[0], WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (WHEELS_X[1], WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEELS_X[0], WHEEL_Z, HUB_Z + ARCH_R))
    hood_rows = [round(hood_z(max(COWL_X, min(NOSE, G.row_x(y)))), 3) for y in range(3)]
    bay = {(x, y): FLOOR for x in (1, 2) for y in (1, 2)}
    level_sockets(kit, G, "row", hood_rows + [ROOF] * 6, fronts={3: ROOF_FRONT - CAP_SLOPE}, cells=bay)
    level_sockets(kit, G, "floor", [FLOOR] * 9)
    check_size(kit)
    check_base(kit, "base_van", G)
    kit.export("base_van", args, view_size=6.5)


if __name__ == "__main__":
    main()
