"""The bus base: a LAZ-695N city bus, from its published size and layout.

The real bus is 9.19 m long, 2.5 m wide and 2.95 m tall on a 4.19 m wheelbase, with long overhangs, a rear engine,
a narrow front door ahead of the front axle and a second door ahead of the rear axle, both on the right.
The model is cut to the grid: 8.5 m long, 2.6 m wide across its mouldings and 2.94 m to the flat roof on its tires,
3.04 m over the rear roof air intake, on a 3.9 m wheelbase with even 2.3 m overhangs.
The ground is 1.67 m below the center. Levels: intake top 1.37, flat roof 1.27, roof edge from 0.86 to 1.27, window band from
the sill at 0 to its top at 0.86, painted lower body down to -1.03.
One long closed body in three color blocks: the painted lower body with a trim moulding at the sill, a dark window band of seven
windows a side that runs the whole length, and a trim roof with rounded edges and front dome. The front is rounded in plan with a
two-piece raked windshield under a dark route sign, round headlamps and a grille bar over the bumper. The closed engine end has a
rear window over a louvered engine lid, tall taillights and side intakes behind the rear arches.
The flat roof is the row surface of every deck row. The rear roof intake stands behind the last deck row, over the back ring.
The engine hatch is a cutout over the engine cells, rows 8 and 9 of columns 3 and 4, round PHYSICS.bodies.bus.engine, over a bay floor at 1.02.
Wheels sit 1.95 m ahead of and behind the center, 1.0 m off the center line, radius 0.72 m, half width 0.27 m,
mount 0.55 m below the center. Round arches, flares and lamps take their sides from round_sides().
Sockets arch_front, arch_rear and arch_front_top (the arch crown) mark the arches for wheelArches.test.ts.
Deviations from the real bus: 7.5% short for the grid's cell cap, even overhangs since a body has one wheelX, tire rule tires
with the window sill raised to clear their arches, single rear tires and no mirrors on stalks, which would leave the width.
Run: blender --background --python tools/blender/base_bus.py -- public/models/base_bus.glb [tmp/base_bus.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, Vec3, parse_args, round_sides  # noqa: E402
from parts_common_base import (  # noqa: E402
    ARCH_CLEARANCE,
    BASE_COLORS,
    DOOR_GAP,
    FLARE,
    SUSPENSION_REST,
    Grid,
    check_base,
    check_door_gap,
    cut_boxes,
    cut_hulls,
    flare,
    hull_mesh,
    level_sockets,
)
from shapes import prism  # noqa: E402

SEED = 306
LENGTH = 8.5
WIDTH = 2.6
ROWS = 12
COLS = 9
ROOF_HEIGHT = (2.92, 2.98)  # ground to flat roof, the band truck-shapes.test.ts pins


class Frame(Grid):
    """The chassis grid stretched over the model, the way singleCellRect() in body.ts projects it."""

    def __init__(self, half_height: float) -> None:
        super().__init__(ROWS, COLS, half_height)
        self.half_x = LENGTH / 2
        self.half_y = WIDTH / 2
        self.row_step = LENGTH / ROWS
        self.col_step = WIDTH / (COLS - 2)

    def row_x(self, y: float) -> float:
        return self.half_x - self.row_step * (y + 0.5)

    def col_y(self, x: float) -> float:
        return max(-self.half_y, min(self.half_y, self.half_y - self.col_step * (x - 0.5)))


G = Frame(half_height=0.8)
WHEEL_R = 0.72  # PHYSICS.bodies.bus.wheelRadius
WHEEL_HALF_W = 0.27  # PHYSICS.bodies.bus.wheelHalfWidth
WHEEL_Z = 1.0  # PHYSICS.bodies.bus.wheelZ
WHEEL_X = 1.95  # PHYSICS.bodies.bus.wheelX
HUB_Z = -0.55 - SUSPENSION_REST  # PHYSICS.bodies.bus.wheelY
GROUND = HUB_Z - WHEEL_R
WHEELS_X = [WHEEL_X, -WHEEL_X]
ARCH_R = WHEEL_R + ARCH_CLEARANCE
ARCH_SIDES = round_sides(ARCH_R) // 2
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03

HALF_Y = WIDTH / 2
SIDE = HALF_Y - 0.03  # body side face; the mouldings and flares stand out to the full width
FRONT = LENGTH / 2 - 0.04  # nose face; the bumper reaches the full length
BACK = -FRONT
CORNER = 0.35  # the rounded body corners, cut this far in plan
BODY_BOTTOM = -1.03
SILL = 0.0  # the window band's bottom edge
WIN_TOP = 0.86
EAVE = 1.08
ROOF = 1.27
ROOF_IN = 0.17  # the flat roof stops this far inside the side
ROOF_FRONT = FRONT - 0.46
ROOF_BACK = BACK + 0.4
INTAKE_FRONT = -3.56
INTAKE_TOP = 1.37
INTAKE_HALF = 0.95

ENGINE_X = -2.125  # PHYSICS.bodies.bus.engine.x, the middle of rows 8 and 9
ENGINE_Y = 0.186  # -PHYSICS.bodies.bus.engine.z, the middle of columns 3 and 4
BAY_FLOOR = ROOF - 0.25  # PHYSICS.bodies.bus.engine.y
ENGINE_HALF = (G.row_step, G.col_step)  # the two by two engine cells
HATCH = ((ENGINE_X - ENGINE_HALF[0] - 0.01, ENGINE_Y - ENGINE_HALF[1] - 0.02), (ENGINE_X + ENGINE_HALF[0] + 0.01, ENGINE_Y + ENGINE_HALF[1] + 0.02))

FLARE_REACH = ARCH_R + FLARE + DOOR_GAP + 0.01
FRONT_DOOR = (FRONT - CORNER - 0.01, WHEEL_X + FLARE_REACH)  # x front, x back
REAR_DOOR = (-WHEEL_X + FLARE_REACH + 1.2, -WHEEL_X + FLARE_REACH)
DOOR_BOTTOM = BODY_BOTTOM + 0.06
PILLAR_W = 0.1
SINK = 0.02  # how far a glass or trim piece that meets another face runs into it, so no two faces share a plane
WINDOWS = 7
LAMP_Z = -0.6
LAMP_R = 0.12
LAMP_Y = SIDE - CORNER - 0.02

LOWER = [(BODY_BOTTOM, FRONT, BACK, SIDE), (SILL, FRONT, BACK, SIDE)]
BAND = [(SILL, FRONT, BACK, SIDE), (WIN_TOP, FRONT - 0.13, BACK + 0.05, SIDE)]
UPPER = [
    (WIN_TOP, FRONT - 0.13, BACK + 0.05, SIDE),
    (WIN_TOP + 0.1, FRONT - 0.17, BACK + 0.08, SIDE - 0.005),
    (EAVE, FRONT - 0.28, BACK + 0.2, SIDE - 0.04),
    (ROOF - 0.06, FRONT - 0.39, BACK + 0.31, SIDE - 0.1),
    (ROOF, ROOF_FRONT, ROOF_BACK, SIDE - ROOF_IN),
]


def add_hull(kit: Kit, name: str, points: list[Vec3], mat: str, cutters: list[list[Vec3]] | None = None) -> bpy.types.Object:
    obj = hull_mesh(name, points)
    if cutters:
        cut_hulls(obj, cutters)
        obj.data.materials.clear()
    return kit._add(obj, name, mat, 0.0)


def ring(z: float, front: float, back: float, half: float) -> list[Vec3]:
    """A body outline at height z: a rectangle with its four corners cut by CORNER."""
    pts: list[Vec3] = []
    for s in (1, -1):
        pts += [(front, s * (half - CORNER), z), (front - CORNER, s * half, z), (back, s * (half - CORNER), z), (back + CORNER, s * half, z)]
    return pts


def arch_cutter(wx: float, y0: float, y1: float) -> list[Vec3]:
    """A round half disc over a wheel with a box below it, from y0 to y1."""
    pts: list[Vec3] = []
    for y in (y0, y1):
        for k in range(ARCH_SIDES + 1):
            a = math.pi * k / ARCH_SIDES
            pts.append((wx + ARCH_R * math.cos(a), y, HUB_Z + ARCH_R * math.sin(a)))
        pts += [(wx - ARCH_R, y, BODY_BOTTOM - 0.1), (wx + ARCH_R, y, BODY_BOTTOM - 0.1)]
    return pts


def mirrored(kit: Kit, name: str, size: Vec3, x: float, y: float, z: float, mat: str) -> None:
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def side_box(kit: Kit, name: str, x0: float, x1: float, z0: float, z1: float, s: int, mat: str, out: float = 0.015, sink: float = 0.0) -> None:
    """A thin panel on the body side s (1 left, -1 right) from x0 to x1 and z0 up to z1, standing out by out and sunk into the body by sink."""
    lo, hi = min(x0, x1), max(x0, x1)
    kit.box(name, (hi - lo, out + sink, z1 - z0), ((lo + hi) / 2, s * (SIDE + (out - sink) / 2), (z0 + z1) / 2), mat)


def outside_arches(x0: float, x1: float) -> list[tuple[float, float]]:
    """The spans of x0..x1 that keep clear of both flares."""
    reach = ARCH_R + FLARE + 0.02
    spans = [(min(x0, x1), max(x0, x1))]
    for wx in WHEELS_X:
        spans = [piece for lo, hi in spans for piece in ((lo, min(hi, wx - reach)), (max(lo, wx + reach), hi)) if piece[1] - piece[0] > 0.05]
    return spans


def body(kit: Kit) -> None:
    """The painted lower body with round arches, the window band, the trim roof with the hatch and the rear roof intake."""
    lower = [p for z, f, b, h in LOWER for p in ring(z, f, b, h)]
    arches = [arch_cutter(wx, s * WELL_Y, s * (HALF_Y + 0.1)) for wx in WHEELS_X for s in (1, -1)]
    add_hull(kit, "lower", lower, "paint", arches)
    for i, wx in enumerate(WHEELS_X):
        flare(kit, f"flare{i}_l", G, wx, HUB_Z, WHEEL_R, SIDE - 0.02, HALF_Y, bottom=BODY_BOTTOM, segments=ARCH_SIDES)
        flare(kit, f"flare{i}_r", G, wx, HUB_Z, WHEEL_R, -HALF_Y, -SIDE + 0.02, bottom=BODY_BOTTOM, segments=ARCH_SIDES)
    add_hull(kit, "band", [p for z, f, b, h in BAND for p in ring(z, f, b, h)], "glass")
    roof = add_hull(kit, "roof", [p for z, f, b, h in UPPER for p in ring(z, f, b, h)], "trim")
    (x0, y0), (x1, y1) = HATCH
    cut_boxes(roof, [((x0, y0, WIN_TOP - 0.01), (x1, y1, ROOF + 0.1))])
    roof.data.materials.clear()
    roof.data.materials.append(kit._materials["trim"])
    kit.box("bay", (x1 - x0, y1 - y0, BAY_FLOOR - WIN_TOP), ((x0 + x1) / 2, (y0 + y1) / 2, (BAY_FLOOR + WIN_TOP) / 2), "metal")
    intake = [(x, s * y, z) for s in (1, -1) for x, y, z in (
        (INTAKE_FRONT, INTAKE_HALF, ROOF - 0.02), (INTAKE_FRONT - 0.05, INTAKE_HALF - 0.05, INTAKE_TOP), (BACK + 0.24, INTAKE_HALF - 0.05, INTAKE_TOP), (BACK + 0.08, INTAKE_HALF, ROOF - 0.12))]
    add_hull(kit, "intake", intake, "trim")
    kit.box("intake_grille", (0.02, 2 * INTAKE_HALF - 0.3, INTAKE_TOP - ROOF - 0.03), (INTAKE_FRONT - 0.035, 0, (ROOF + INTAKE_TOP) / 2), "under")


def windows(kit: Kit) -> None:
    """Trim pillars that split the band into seven windows a side, with the first and last at the rounded corners."""
    first, last = FRONT - CORNER, BACK + CORNER
    for s, tag in ((1, "l"), (-1, "r")):
        for i in range(WINDOWS + 1):
            x = first - (first - last) * i / WINDOWS
            side_box(kit, f"pillar{i}_{tag}", x - PILLAR_W / 2, x + PILLAR_W / 2, SILL - SINK, WIN_TOP + SINK, s, "trim")


def sides(kit: Kit) -> None:
    """The trim moulding under the sill and the dark rub strip over the skirt, broken by the arches and the doors, the doors and the engine intakes."""
    x_front, x_back = FRONT - CORNER, BACK + CORNER
    doors = [FRONT_DOOR, REAR_DOOR]
    for s, tag in ((1, "l"), (-1, "r")):
        spans = [(x_back, x_front)] if s == 1 else [(x_back, REAR_DOOR[1]), (REAR_DOOR[0], FRONT_DOOR[1])]
        for i, (a, b) in enumerate(spans):
            side_box(kit, f"moulding{i}_{tag}", a, b, SILL - 0.06, SILL + 0.03, s, "trim", out=0.03)
            for j, (lo, hi) in enumerate(outside_arches(a, b)):
                side_box(kit, f"rub{i}_{j}_{tag}", lo, hi, BODY_BOTTOM + 0.06, BODY_BOTTOM + 0.16, s, "under", out=0.03)
        for i in range(4):
            z = -0.62 + 0.11 * i
            side_box(kit, f"intake{i}_{tag}", x_back + 0.05, -WHEEL_X - ARCH_R - FLARE - 0.15, z, z + 0.05, s, "under", out=0.02)
    for name, (x1, x0) in zip(("front_door", "rear_door"), doors):
        check_door_gap(name, x0, x1, DOOR_BOTTOM, WHEELS_X, HUB_Z, ARCH_R)
        side_box(kit, name, x0, x1, DOOR_BOTTOM, WIN_TOP, -1, "under", out=0.025)
        mid = (x0 + x1) / 2
        for leaf, (a, b) in (("a", (x0 + 0.05, mid - 0.025)), ("b", (mid + 0.025, x1 - 0.05))):
            side_box(kit, f"{name}_{leaf}", a, b, DOOR_BOTTOM + 0.3, WIN_TOP - 0.06, -1, "glass", out=0.03, sink=SINK)
            side_box(kit, f"{name}_{leaf}_low", a, b, DOOR_BOTTOM + 0.06, DOOR_BOTTOM + 0.24, -1, "glass", out=0.03, sink=SINK)


def front(kit: Kit) -> None:
    """A center pillar splitting the raked windshield, a dark route sign in the roof dome, round headlamps and indicators, a grille bar and the bumper."""
    rake = [(FRONT - 0.02, SILL - SINK), (FRONT + 0.015, SILL - SINK), (FRONT - 0.115, WIN_TOP + SINK), (FRONT - 0.15, WIN_TOP + SINK)]
    prism(kit, "pillar_mid", rake, -0.05, 0.05, "trim")
    sign = [(FRONT - 0.15, WIN_TOP + 0.03), (FRONT - 0.13, WIN_TOP + 0.03), (FRONT - 0.255, EAVE + 0.03), (FRONT - 0.275, EAVE + 0.03)]
    prism(kit, "route_sign", sign, -0.8, 0.8, "under")
    kit.box("sill_band", (0.03, 2 * (SIDE - CORNER), 0.09), (FRONT + 0.01, 0, SILL - 0.015), "trim")
    face = (0, math.pi / 2, 0)
    for s in (1, -1):
        kit.cylinder(f"lamp_{s}", LAMP_R, 0.04, (FRONT + 0.015, s * LAMP_Y, LAMP_Z), "light", rot=face, vertices=round_sides(LAMP_R))
        kit.cylinder(f"indicator_{s}", 0.05, 0.04, (FRONT + 0.02, s * (LAMP_Y - 0.24), LAMP_Z), "light", rot=face, vertices=round_sides(0.05))
    kit.box("grille", (0.03, 2 * (LAMP_Y - 0.36), 0.16), (FRONT + 0.015, 0, LAMP_Z), "under")
    kit.box("bumper", (0.12, 2 * (SIDE - 0.1), 0.2), (LENGTH / 2 - 0.06, 0, BODY_BOTTOM + 0.14), "under")


def rear(kit: Kit) -> None:
    """A split rear window over the engine end, the louvered engine lid, tall taillights and the bumper."""
    lo, hi = SILL + 0.1, WIN_TOP - 0.05
    kit.box("rear_window", (0.02, 2 * (SIDE - CORNER) - 0.1, hi - lo), (BACK - 0.005, 0, (lo + hi) / 2), "glass")
    kit.box("rear_pillar", (0.05, 0.1, hi - lo + 0.04), (BACK, 0, (lo + hi) / 2), "trim")
    kit.box("engine_lid", (0.03, 2 * (SIDE - CORNER) - 0.2, 0.62), (BACK - 0.01, 0, -0.5), "paint")
    for i in range(4):
        kit.box(f"louver{i}", (0.02, 2 * (SIDE - CORNER) - 0.4, 0.05), (BACK - 0.03, 0, -0.72 + 0.12 * i), "under")
    mirrored(kit, "taillight", (0.03, 0.14, 0.42), BACK - 0.015, SIDE - CORNER + 0.02, -0.42, "red")
    kit.box("rear_bumper", (0.12, 2 * (SIDE - 0.1), 0.2), (-LENGTH / 2 + 0.06, 0, BODY_BOTTOM + 0.14), "under")


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
    """Raises when the built bus leaves the LAZ size it is cut to."""
    lo, hi = bounds(kit)
    roof = ROOF - GROUND
    if abs(hi.x - lo.x - LENGTH) > 0.01 or abs(hi.y - lo.y - WIDTH) > 0.01 or not ROOF_HEIGHT[0] <= roof <= ROOF_HEIGHT[1]:
        raise RuntimeError(f"base_bus is {hi.x - lo.x:.3f} x {hi.y - lo.y:.3f} m with its roof {roof:.3f} m up, not {LENGTH} x {WIDTH} m and {ROOF_HEIGHT}")
    if INTAKE_FRONT > G.row_x(10.5) - 0.01:
        raise RuntimeError(f"the roof intake at {INTAKE_FRONT} reaches over the last deck row")


def check_hatch() -> None:
    """Raises when the hatch leaves the flat roof or misses the engine rows."""
    (x0, y0), (x1, y1) = HATCH
    if x0 > G.row_x(9.5) or x1 < G.row_x(7.5) or y1 >= SIDE - ROOF_IN or x0 < ROOF_BACK:
        raise RuntimeError(f"hatch x {x0:.3f}..{x1:.3f} y {y0:.3f}..{y1:.3f} misses rows 8 and 9 or leaves the roof")


def main() -> None:
    args = parse_args()
    check_hatch()
    kit = Kit(BASE_COLORS, SEED)
    body(kit)
    windows(kit)
    sides(kit)
    front(kit)
    rear(kit)
    kit.socket("arch_front", (WHEELS_X[0], WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (WHEELS_X[1], WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEELS_X[0], WHEEL_Z, HUB_Z + ARCH_R))
    bay = {(x, y): BAY_FLOOR for x in (3, 4) for y in (8, 9)}
    level_sockets(kit, G, "row", [ROOF] * G.rows, fronts={0: ROOF_FRONT}, cells=bay)
    level_sockets(kit, G, "floor", [SILL] * G.rows, cells=bay)
    check_size(kit)
    check_base(kit, "base_bus", G)
    kit.export("base_bus", args, view_size=11.0)


if __name__ == "__main__":
    main()
