"""The carrier base: a stylized Cadillac Gage V-100 Commando, the 4x4 armored car, without its turret.

Built from the V-100's published figures, scaled by 1.028 along and up: the real car is 5.69 m long on a 2.67 m wheelbase,
1.98 m to the hull top and 2.26 m wide. Here it is 5.85 m long on a 2.74 m wheelbase and 2.05 m to the flat roof on its tires,
and 2.904 m wide, the game's widening of trucks past the real ratio. The ground is 1.45 m below the center.
One boat-shaped armored hull, convex like the real welded monocoque. Levels: keel -0.78, nose ridge -0.40, tail ridge -0.35,
waist (the widest line, with the rub rail) -0.05, roof 0.60. The lower glacis rises from the keel ahead of the front arch to the
nose ridge across the bow, and the upper glacis climbs from the ridge to the roof front at x 1.95. The stern is the same wedge,
with the roof ending at x -2.15. In plan the bow and stern are blunt wedges, their corners cut back to a 1.9 m nose and tail.
The upper sides slope in from the waist to the 2.0 m roof, and the lower sides slope in from the waist to the 1.1 m keel.
The four big tires sit at the waist, bunched near the middle under round arches cut into the lower sides, with dark liners.
One side door per side between the arches, a split trim panel across the waist with a vision block. Headlights stand in dark
guard boxes on the front corners, a winch housing sits low on the bow, taillights stand in guards on the stern corners, a rear
door on the right of the stern plate and a round exhaust silencer lies across its left. A round hatch sits on the rear roof.
Every round piece takes its side count from round_sides().
Approach and departure: every hull point ahead of the front tire and behind the rear tire lies above the line tangent to that
tire at the steepest drivable grade, TERRAIN.drive.maxSlope 0.6 (31 degrees), plus 5 degrees. check_overhangs() throws otherwise.
Deviations from the real car: the wheels stay symmetric about the center, the engine shows mid-roof through a cutout over the
engine cells (the real engine is in the rear), the turret is left to the gun parts on the roof, and the hull is widened.
The engine cutout and its dark bay floor lie over the engine cells (columns 2 and 3, rows 3 and 4) at PHYSICS.bodies.carrier.engine.
Grid: 7 inner columns by 9 rows with the armor rows, stretched over the model by the projection. Half height 0.6 m.
Wheels: radius 0.65 m, half width 0.28 m, mount 0.4 m below the center, 1.37 m along and 1.21 m off the center line.
Sockets arch_front, arch_rear and arch_front_top (the arch crown) mark the arches for wheelArches.test.ts.
Run: blender --background --python tools/blender/base_carrier.py -- public/models/base_carrier.glb [tmp/base_carrier.png]
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
    ROUND_ARCH_SEGMENTS,
    SUSPENSION_REST,
    Grid,
    arch_cut,
    check_base,
    check_door_gap,
    cut_boxes,
    hull_mesh,
    level_sockets,
    round_arch,
)
from shapes import prism  # noqa: E402

SEED = 303
LENGTH = 5.85
WIDTH = 2.904
G = Grid(rows=9, cols=7, half_height=0.6, length=LENGTH, width=WIDTH)
WHEEL_R = 0.65  # PHYSICS.bodies.carrier.wheelRadius
WHEEL_HALF_W = 0.28  # PHYSICS.bodies.carrier.wheelHalfWidth
WHEEL_Z = 1.21  # PHYSICS.bodies.carrier.wheelZ
WHEEL_X = 1.37  # PHYSICS.bodies.carrier.wheelX
HUB_Z = -0.4 - SUSPENSION_REST  # PHYSICS.bodies.carrier.wheelY
WHEELS_X = [WHEEL_X, -WHEEL_X]
GROUND = HUB_Z - WHEEL_R
ARCH_R = WHEEL_R + ARCH_CLEARANCE
ARCH_SIDES = ROUND_ARCH_SEGMENTS
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03

FRONT = G.half_x
BACK = -G.half_x
SIDE = G.half_y - 0.04
KEEL = -0.78
KEEL_HALF = 0.98
KEEL_END = WHEEL_X + 0.85
NOSE = -0.40
TAIL = -0.35
NOSE_HALF = 0.95
CORNER_CUT = 0.45
WAIST = -0.05
ROOF = 0.6
ROOF_HALF = 1.0
ROOF_FRONT = 1.95
ROOF_BACK = -2.15
ROOF_CHEEK = 0.2

MAX_GRADE = 0.6  # TERRAIN.drive.maxSlope
CLIMB = math.atan(MAX_GRADE) + math.radians(5)

ENGINE = ((G.row_x(4.5), G.col_y(2.5)), (G.row_x(2.5), G.col_y(0.5)))  # the engine cells (columns 2 and 3, rows 3 and 4) in plan
BAY_FLOOR = 0.3  # PHYSICS.bodies.carrier.engine.y: a 0.45 m engine stands 0.15 m out of the cutout
BAY_T = 0.05

DOOR_X = (-0.36, 0.36)
DOOR_LOW = -0.46
DOOR_HIGH = 0.42


def mirrored(kit: Kit, name: str, size: Vec3, x: float, y: float, z: float, mat: str, rot: Vec3 = (0, 0, 0)) -> None:
    """A box on the left side at +y and its twin on the right side, with the roll mirrored."""
    kit.box(f"{name}_l", size, (x, y, z), mat, rot=rot)
    kit.box(f"{name}_r", size, (x, -y, z), mat, rot=(-rot[0], rot[1], -rot[2]))


def hull(kit: Kit, name: str, mat: str, points: list[Vec3]) -> bpy.types.Object:
    return kit._add(hull_mesh(name, points), name, mat, 0.0)


def side_y(z: float) -> float:
    """The half width of the hull's sides between the arches at height z: the lower side below the waist, the upper above."""
    if z <= WAIST:
        return KEEL_HALF + (SIDE - KEEL_HALF) * (z - KEEL) / (WAIST - KEEL)
    return SIDE - (SIDE - ROOF_HALF) * (z - WAIST) / (ROOF - WAIST)


def glacis_x(z: float) -> float:
    """The X of the upper glacis at height z, between the nose ridge and the roof front."""
    return FRONT - (FRONT - ROOF_FRONT) * (z - NOSE) / (ROOF - NOSE)


def stern_x(z: float) -> float:
    """The X of the upper stern plate at height z, between the tail ridge and the roof back."""
    return BACK + (ROOF_BACK - BACK) * (z - TAIL) / (ROOF - TAIL)


def hull_points() -> list[Vec3]:
    pts: list[Vec3] = []
    for s in (1, -1):
        pts += [(KEEL_END, s * KEEL_HALF, KEEL), (-KEEL_END, s * KEEL_HALF, KEEL)]
        pts += [(FRONT, s * NOSE_HALF, NOSE), (BACK, s * NOSE_HALF, TAIL)]
        pts += [(FRONT - CORNER_CUT, s * SIDE, WAIST), (BACK + CORNER_CUT, s * SIDE, WAIST)]
        pts += [(ROOF_FRONT, s * (ROOF_HALF - ROOF_CHEEK), ROOF), (ROOF_FRONT - ROOF_CHEEK, s * ROOF_HALF, ROOF)]
        pts += [(ROOF_BACK, s * (ROOF_HALF - ROOF_CHEEK), ROOF), (ROOF_BACK + ROOF_CHEEK, s * ROOF_HALF, ROOF)]
    return pts


def body(kit: Kit) -> None:
    """The welded hull: one convex boat shape, with the round arches cut into its lower sides and the engine cutout in its roof."""
    obj = hull_mesh("hull", hull_points())
    arch_cut(obj, WHEELS_X, HUB_Z, WHEEL_R, WELL_Y, KEEL, segments=ARCH_SIDES)
    (x0, y0), (x1, y1) = ENGINE
    cut_boxes(obj, [((x0, y0, BAY_FLOOR - BAY_T), (x1, y1, ROOF + 0.1))])
    obj.data.materials.clear()
    kit._add(obj, "hull", "paint", 0.0)
    kit.box("bay", (x1 - x0, y1 - y0, BAY_T), ((x0 + x1) / 2, (y0 + y1) / 2, BAY_FLOOR - BAY_T / 2), "metal")


def wells(kit: Kit) -> None:
    """A dark liner on the inner wall of each arch, and the axles with their differentials under the keel."""
    for i, wx in enumerate(WHEELS_X):
        liner = round_arch(wx, HUB_Z, ARCH_R, HUB_Z, ARCH_SIDES)
        prism(kit, f"liner{i}_l", liner, WELL_Y, WELL_Y + 0.015, "under")
        prism(kit, f"liner{i}_r", liner, -WELL_Y - 0.015, -WELL_Y, "under")
        kit.box(f"axle{i}", (0.16, 2 * WELL_Y, 0.16), (wx, 0, HUB_Z), "under")
        kit.box(f"diff{i}", (0.42, 0.42, 0.3), (wx, 0.1, HUB_Z - 0.04), "under")


def rail(kit: Kit) -> None:
    """The rub rail in trim along the waist, from corner to corner, standing out to the footprint's sides."""
    x0, x1 = BACK + CORNER_CUT, FRONT - CORNER_CUT
    mirrored(kit, "rail", (x1 - x0, G.half_y - SIDE + 0.02, 0.1), (x0 + x1) / 2, (SIDE + G.half_y) / 2 - 0.01, WAIST - 0.04 + 0.05, "trim")


def plate(kit: Kit, name: str, mat: str, outline: list[tuple[float, float]], surface, thick: float = 0.025, sink: float = 0.005) -> None:
    """A thin plate lying on a hull face: outline holds (along, z) points, and surface(along, z) gives the face point and its outward offset. It runs sink into the hull."""
    pts: list[Vec3] = []
    for a, z in outline:
        (x, y, zz), (ox, oy, oz) = surface(a, z)
        pts += [(x - ox * sink, y - oy * sink, zz - oz * sink), (x + ox * thick, y + oy * thick, zz + oz * thick)]
    hull(kit, name, mat, pts)


def on_side(sign: int):
    """The side face between the arches: along is X, the face leans in above and below the waist."""

    def at(x: float, z: float) -> tuple[Vec3, Vec3]:
        if z <= WAIST:
            n = Vector((0, WAIST - KEEL, -(SIDE - KEEL_HALF))).normalized()
        else:
            n = Vector((0, ROOF - WAIST, SIDE - ROOF_HALF)).normalized()
        return (x, sign * side_y(z), z), (0, sign * n.y, n.z)

    return at


def on_stern(y: float, z: float) -> tuple[Vec3, Vec3]:
    n = Vector((-(ROOF - TAIL), 0, -(ROOF_BACK - BACK))).normalized()
    return (stern_x(z), y, z), (n.x, 0, n.z)


def on_glacis(y: float, z: float) -> tuple[Vec3, Vec3]:
    n = Vector((ROOF - NOSE, 0, FRONT - ROOF_FRONT)).normalized()
    return (glacis_x(z), y, z), (n.x, 0, n.z)


def doors(kit: Kit) -> None:
    """One door per side between the arches, split at the rub rail like the real two-leaf door, with a vision block in its upper leaf."""
    x0, x1 = DOOR_X
    for sign, tag in ((1, "l"), (-1, "r")):
        face = on_side(sign)
        plate(kit, f"door_low_{tag}", "trim", [(x0, DOOR_LOW), (x1, DOOR_LOW), (x0, WAIST - 0.05), (x1, WAIST - 0.05)], face)
        plate(kit, f"door_high_{tag}", "trim", [(x0, WAIST + 0.06), (x1, WAIST + 0.06), (x0, DOOR_HIGH), (x1, DOOR_HIGH)], face)
        plate(kit, f"door_block_{tag}", "glass", [(-0.14, 0.2), (0.14, 0.2), (-0.14, 0.3), (0.14, 0.3)], face, thick=0.04, sink=0.02)


def bow(kit: Kit) -> None:
    """Headlights with round lenses in guard boxes on the front corners, vision slits on the upper glacis and the winch housing over the nose."""
    for sign, tag in ((1, "l"), (-1, "r")):
        kit.box(f"lamp_guard_{tag}", (0.34, 0.3, 0.26), (2.5, sign * 1.1, 0.02), "trim")
        kit.cylinder(f"lamp_{tag}", 0.085, 0.04, (2.68, sign * 1.1, 0.03), "light", rot=(0, math.pi / 2, 0), vertices=round_sides(0.085))
        plate(kit, f"slit_front_{tag}", "glass", [(sign * 0.2, 0.2), (sign * 0.6, 0.2), (sign * 0.2, 0.3), (sign * 0.6, 0.3)], on_glacis, thick=0.03)
        plate(kit, f"slit_side_{tag}", "glass", [(1.0, 0.25), (1.45, 0.25), (1.0, 0.33), (1.45, 0.33)], on_side(sign), thick=0.03)
    plate(kit, "winch", "under", [(-0.35, NOSE + 0.1), (0.35, NOSE + 0.1), (-0.35, NOSE + 0.28), (0.35, NOSE + 0.28)], on_glacis, thick=0.1)


def stern(kit: Kit) -> None:
    """Round taillights in guards on the stern corners, the rear door on the right and the exhaust silencer lying across the left."""
    for sign, tag in ((1, "l"), (-1, "r")):
        kit.box(f"tail_guard_{tag}", (0.26, 0.24, 0.2), (-2.55, sign * 1.12, 0.0), "trim")
        kit.cylinder(f"taillight_{tag}", 0.06, 0.04, (-2.69, sign * 1.12, 0.0), "red", rot=(0, math.pi / 2, 0), vertices=round_sides(0.06))
    plate(kit, "rear_door", "trim", [(-0.9, TAIL + 0.12), (-0.25, TAIL + 0.12), (-0.9, ROOF - 0.12), (-0.25, ROOF - 0.12)], on_stern)
    mid_z = (TAIL + ROOF) / 2
    (x, _, z), (ox, _, oz) = on_stern(0, mid_z)
    r = 0.13
    kit.cylinder("silencer", r, 0.75, (x + ox * (r + 0.02), 0.65, z + oz * (r + 0.02)), "under", rot=(math.pi / 2, 0, 0), vertices=round_sides(r))
    for i, y in enumerate((0.38, 0.92)):
        plate(kit, f"silencer_strap{i}", "trim", [(y - 0.03, mid_z - 0.2), (y + 0.03, mid_z - 0.2), (y - 0.03, mid_z + 0.2), (y + 0.03, mid_z + 0.2)], on_stern, thick=0.04)


def roof(kit: Kit) -> None:
    """The round hatch over the rear rows and dark louvers on the engine deck beside the cutout."""
    kit.cylinder("hatch", 0.32, 0.03, (G.row_x(6), 0, ROOF + 0.015), "trim", vertices=round_sides(0.32))
    (x0, _), (x1, _) = ENGINE
    count = 5
    pitch = (x1 - x0) / count
    for i in range(count):
        kit.box(f"louver{i}", (0.12, 0.8, 0.03), (x0 + pitch * (i + 0.5), -0.5, ROOF + 0.015), "under")


def check_size(kit: Kit) -> None:
    lo, hi = bounds(kit)
    if abs(hi.x - lo.x - LENGTH) > 0.01 or abs(hi.y - lo.y - WIDTH) > 0.01:
        raise RuntimeError(f"base_carrier is {hi.x - lo.x:.3f} x {hi.y - lo.y:.3f} m, not {LENGTH} x {WIDTH} m")


def bounds(kit: Kit) -> tuple[Vector, Vector]:
    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for p in vertices(kit):
        lo = Vector((min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)))
        hi = Vector((max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)))
    return lo, hi


def vertices(kit: Kit) -> list[Vector]:
    bpy.context.view_layer.update()
    return [obj.matrix_world @ v.co for obj in kit._parts for v in obj.data.vertices]


def climb_floor(x: float) -> float:
    """The lowest height a hull point at x may have: the line tangent to the nearer tire at the CLIMB angle, past that tire."""
    wx = WHEEL_X if x > 0 else -WHEEL_X
    k = math.tan(CLIMB)
    return HUB_Z + k * abs(x - wx) - WHEEL_R * math.sqrt(1 + k * k)


def check_overhangs(kit: Kit) -> None:
    """Raises when a point of the base past a tire hangs below the line that tire climbs, so the bow or stern would dig in."""
    for p in vertices(kit):
        if abs(p.x) > WHEEL_X and p.z < climb_floor(p.x) - 1e-6:
            raise RuntimeError(f"base_carrier hangs at x {p.x:.3f} z {p.z:.3f}, under the {math.degrees(CLIMB):.0f} degree climb line at {climb_floor(p.x):.3f}")


def check_tires(kit: Kit) -> None:
    """Raises when a base vertex lies inside a tire at its physics mount, grown by half the arch clearance."""
    reach = WHEEL_R + ARCH_CLEARANCE / 2
    inner, outer = WHEEL_Z - WHEEL_HALF_W - 0.03, WHEEL_Z + WHEEL_HALF_W + 0.03
    for p in vertices(kit):
        for wx in WHEELS_X:
            if inner < abs(p.y) < outer and math.hypot(p.x - wx, p.z - HUB_Z) < reach:
                raise RuntimeError(f"base_carrier reaches into the tire at x {wx}: vertex {p.x:.3f}, {p.y:.3f}, {p.z:.3f}")


def main() -> None:
    args = parse_args()
    check_door_gap("side door", DOOR_X[0], DOOR_X[1], DOOR_LOW, WHEELS_X, HUB_Z, ARCH_R)
    kit = Kit(BASE_COLORS, SEED)
    body(kit)
    wells(kit)
    rail(kit)
    doors(kit)
    bow(kit)
    stern(kit)
    roof(kit)
    kit.socket("arch_front", (WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (-WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEEL_X, WHEEL_Z, HUB_Z + ARCH_R))
    engine = {(x, y): BAY_FLOOR for x in (1, 2) for y in (3, 4)}
    level_sockets(kit, G, "row", [ROOF] * G.rows, cells=engine)
    level_sockets(kit, G, "floor", [ROOF] * 3 + [BAY_FLOOR] * 2 + [ROOF] * 4)
    check_size(kit)
    check_overhangs(kit)
    check_tires(kit)
    check_base(kit, "base_carrier", G)
    kit.export("base_carrier", args, view_size=7.0)


if __name__ == "__main__":
    main()
