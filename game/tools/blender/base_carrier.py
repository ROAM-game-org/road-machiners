"""The carrier base: a stylized Cadillac Gage V-100 Commando, the 4x4 armored car, without its turret.

Built against two photos of real V-100s (issue 932: a 1968 USAF photo at Tuy Hoa and a museum car at Hue), with the sizes from
the V-100's published figures, scaled by 1.028 along and up: the real car is 5.69 m long on a 2.67 m wheelbase, 1.98 m to the hull
top and 2.26 m wide. Here it is 5.85 m long on a 2.74 m wheelbase and 2.05 m to the flat roof on its tires, and 2.904 m wide,
the game's widening of trucks past the real ratio. The ground is 1.45 m below the center.
The welded boat hull is three convex pieces, so the flat front deck can lie ahead of the steeper driver's plate.
Levels: keel -0.78, bow and stern plate feet -0.58, chine -0.05 (1.40 m up, 0.69 of the height as measured on the Tuy Hoa photo),
deck 0.15, roof 0.60. The sharp chine is the widest line and the forwardmost and rearmost edge, running nearly straight across
the bow and stern with its corners cut 0.15 m. Under it the bow plate rakes back to its foot 0.2 m behind the tip, then the lower
glacis runs to the keel ahead of the front arch; the stern mirrors it. Above the chine the front deck rises gently to x 2.2,
where the driver's plate climbs steeply between angled cheeks to the roof front at x 2.0. The upper sides lean in straight from
the chine to the 1.8 m roof (tumblehome), and the stern plate falls from the roof back at x -2.15 to the chine at the tail.
The four big tires sit under the chine, bunched near the middle under round arches cut into the lower sides, with dark liners.
Details from the photos: a headlight in an open cage of thin bars on each side of the front deck, a round mirror on a stalk at
each front corner, two vision blocks on the driver's plate and one on each cheek, a split side door at the chine with a vision
block, a vision block and a round firing port ahead of and behind each door, a tow box with its shackle on the bow plate and a
thin trim strip along the chine. Inferred, since neither photo shows the stern: taillights set into open guards, a rear door on
the right of the stern plate and a round exhaust silencer across its left. A round hatch sits on the rear roof.
Every round piece takes its side count from round_sides().
Approach and departure: every hull point ahead of the front tire and behind the rear tire lies above the line tangent to that
tire at the steepest drivable grade, TERRAIN.drive.maxSlope 0.6 (31 degrees), plus 5 degrees. check_overhangs() throws otherwise,
and check_prow() throws unless the hull's forwardmost and rearmost points lie on the chine.
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
CHINE = -0.05
CHINE_CUT = 0.15
BOW_FOOT = -0.58
BOW_FOOT_X = FRONT - 0.2
BOW_FOOT_HALF = 0.8 * SIDE
DECK_X = 2.2
DECK_Z = 0.15
DRIVER_HALF = 0.75
CHEEK_BACK = 0.45
ROOF = 0.6
ROOF_HALF = 0.9
ROOF_FRONT = 2.0
ROOF_BACK = -2.15
ROOF_CHEEK = 0.2
HULLS = ("hull", "hull_upper", "hull_super")

MAX_GRADE = 0.6  # TERRAIN.drive.maxSlope
CLIMB = math.atan(MAX_GRADE) + math.radians(5)

ENGINE = ((G.row_x(4.5), G.col_y(2.5)), (G.row_x(2.5), G.col_y(0.5)))  # the engine cells (columns 2 and 3, rows 3 and 4) in plan
BAY_FLOOR = 0.3  # PHYSICS.bodies.carrier.engine.y: a 0.45 m engine stands 0.15 m out of the cutout
BAY_T = 0.05

DOOR_X = (-0.36, 0.36)
DOOR_LOW = -0.46
DOOR_HIGH = 0.42
LAMP_Y = 0.8
LAMP_X = 2.56
MIRROR_X = 2.8
MIRROR_Y = 1.2


def mirrored(kit: Kit, name: str, size: Vec3, x: float, y: float, z: float, mat: str, rot: Vec3 = (0, 0, 0)) -> None:
    """A box on the left side at +y and its twin on the right side, with the roll mirrored."""
    kit.box(f"{name}_l", size, (x, y, z), mat, rot=rot)
    kit.box(f"{name}_r", size, (x, -y, z), mat, rot=(-rot[0], rot[1], -rot[2]))


def hull(kit: Kit, name: str, mat: str, points: list[Vec3]) -> bpy.types.Object:
    return kit._add(hull_mesh(name, points), name, mat, 0.0)


def side_y(z: float) -> float:
    """The half width of the hull's sides between the arches at height z: the lower side below the chine, the tumblehome above."""
    if z <= CHINE:
        return KEEL_HALF + (SIDE - KEEL_HALF) * (z - KEEL) / (CHINE - KEEL)
    return SIDE - (SIDE - ROOF_HALF) * (z - CHINE) / (ROOF - CHINE)


DECK_HALF = side_y(DECK_Z)


def stern_x(z: float) -> float:
    """The X of the upper stern plate at height z, between the chine at the tail and the roof back."""
    return BACK + (ROOF_BACK - BACK) * (z - CHINE) / (ROOF - CHINE)


def stern_cut(z: float) -> float:
    """How far the stern corners are cut back at height z, from the chine's cut to the roof's."""
    return CHINE_CUT + (ROOF_CHEEK - CHINE_CUT) * (z - CHINE) / (ROOF - CHINE)


def deck_z(x: float) -> float:
    """The height of the front deck at x, rising gently from the chine at the bow tip to the foot of the driver's plate."""
    return CHINE + (FRONT - x) * (DECK_Z - CHINE) / (FRONT - DECK_X)


def stern_ring(z: float) -> list[Vec3]:
    x, half, cut = stern_x(z), side_y(z), stern_cut(z)
    return [p for s in (1, -1) for p in ((x, s * (half - cut), z), (x + cut, s * half, z))]


def chine_ring() -> list[Vec3]:
    bow = [p for s in (1, -1) for p in ((FRONT, s * (SIDE - CHINE_CUT), CHINE), (FRONT - CHINE_CUT, s * SIDE, CHINE))]
    return bow + stern_ring(CHINE)


def lower_hull_points() -> list[Vec3]:
    """The boat bottom: from the keel up the raked bow and stern plates and the lower sides to the chine, the widest line."""
    pts = chine_ring()
    for s in (1, -1):
        pts += [(KEEL_END, s * KEEL_HALF, KEEL), (-KEEL_END, s * KEEL_HALF, KEEL)]
        pts += [(BOW_FOOT_X, s * BOW_FOOT_HALF, BOW_FOOT), (-BOW_FOOT_X, s * BOW_FOOT_HALF, BOW_FOOT)]
    return pts


def upper_hull_points() -> list[Vec3]:
    """From the chine to the deck level: the front deck at the bow, the tumblehome sides and the foot of the stern plate."""
    return chine_ring() + [(DECK_X, s * DECK_HALF, DECK_Z) for s in (1, -1)] + stern_ring(DECK_Z)


def superstructure_points() -> list[Vec3]:
    """From the deck to the roof: the steep driver's plate between angled cheeks, the tumblehome sides and the stern plate."""
    pts = stern_ring(DECK_Z) + stern_ring(ROOF)
    for s in (1, -1):
        pts += [(DECK_X, s * DRIVER_HALF, DECK_Z), (DECK_X - CHEEK_BACK, s * DECK_HALF, DECK_Z)]
        pts += [(ROOF_FRONT, s * (ROOF_HALF - ROOF_CHEEK), ROOF), (ROOF_FRONT - ROOF_CHEEK, s * ROOF_HALF, ROOF)]
    return pts


def body(kit: Kit) -> None:
    """The welded hull in three convex pieces, so the flat front deck can lie ahead of the steeper driver's plate.

    The round arches are cut into the lower hull and the engine cutout into the superstructure.
    """
    lower = hull_mesh("hull", lower_hull_points())
    arch_cut(lower, WHEELS_X, HUB_Z, WHEEL_R, WELL_Y, KEEL, segments=ARCH_SIDES)
    lower.data.materials.clear()
    kit._add(lower, "hull", "paint", 0.0)
    hull(kit, "hull_upper", "paint", upper_hull_points())
    upper = hull_mesh("hull_super", superstructure_points())
    (x0, y0), (x1, y1) = ENGINE
    cut_boxes(upper, [((x0, y0, BAY_FLOOR - BAY_T), (x1, y1, ROOF + 0.1))])
    upper.data.materials.clear()
    kit._add(upper, "hull_super", "paint", 0.0)
    kit.box("bay", (x1 - x0, y1 - y0, BAY_T), ((x0 + x1) / 2, (y0 + y1) / 2, BAY_FLOOR - BAY_T / 2), "metal")


def wells(kit: Kit) -> None:
    """A dark liner on the inner wall of each arch, and the axles with their differentials under the keel."""
    for i, wx in enumerate(WHEELS_X):
        liner = round_arch(wx, HUB_Z, ARCH_R, HUB_Z, ARCH_SIDES)
        prism(kit, f"liner{i}_l", liner, WELL_Y, WELL_Y + 0.015, "under")
        prism(kit, f"liner{i}_r", liner, -WELL_Y - 0.015, -WELL_Y, "under")
        kit.box(f"axle{i}", (0.16, 2 * WELL_Y, 0.16), (wx, 0, HUB_Z), "under")
        kit.box(f"diff{i}", (0.42, 0.42, 0.3), (wx, 0.1, HUB_Z - 0.04), "under")


def chine_strip(kit: Kit) -> None:
    """A thin trim strip along the sharp chine, standing out to the footprint's sides."""
    x0, x1 = BACK + CHINE_CUT, FRONT - CHINE_CUT
    mirrored(kit, "chine", (x1 - x0, G.half_y - SIDE + 0.02, 0.04), (x0 + x1) / 2, (SIDE + G.half_y) / 2 - 0.01, CHINE, "trim")


def plate(kit: Kit, name: str, mat: str, outline: list[tuple[float, float]], surface, thick: float = 0.025) -> None:
    """A thin plate lying on a hull face: outline holds (along, z) points, and surface(along, z) gives the face point and its outward offset."""
    pts: list[Vec3] = []
    for a, z in outline:
        (x, y, zz), (ox, oy, oz) = surface(a, z)
        pts += [(x - ox * 0.005, y - oy * 0.005, zz - oz * 0.005), (x + ox * thick, y + oy * thick, zz + oz * thick)]
    hull(kit, name, mat, pts)


def rect(a0: float, a1: float, z0: float, z1: float) -> list[tuple[float, float]]:
    return [(a0, z0), (a1, z0), (a0, z1), (a1, z1)]


def on_side(sign: int):
    """The side face between the arches: along is X, the face leans in above and below the chine."""

    def at(x: float, z: float) -> tuple[Vec3, Vec3]:
        if z <= CHINE:
            n = Vector((0, CHINE - KEEL, -(SIDE - KEEL_HALF))).normalized()
        else:
            n = Vector((0, ROOF - CHINE, SIDE - ROOF_HALF)).normalized()
        return (x, sign * side_y(z), z), (0, sign * n.y, n.z)

    return at


def on_stern(y: float, z: float) -> tuple[Vec3, Vec3]:
    n = Vector((-(ROOF - CHINE), 0, -(ROOF_BACK - BACK))).normalized()
    return (stern_x(z), y, z), (n.x, 0, n.z)


def on_driver(y: float, z: float) -> tuple[Vec3, Vec3]:
    """The driver's plate, climbing steeply from the front deck to the roof front."""
    n = Vector((ROOF - DECK_Z, 0, DECK_X - ROOF_FRONT)).normalized()
    return (DECK_X - (DECK_X - ROOF_FRONT) * (z - DECK_Z) / (ROOF - DECK_Z), y, z), (n.x, 0, n.z)


def on_bow(y: float, z: float) -> tuple[Vec3, Vec3]:
    """The bow plate, raking back and down from the chine at the bow tip to its foot."""
    n = Vector((CHINE - BOW_FOOT, 0, -(FRONT - BOW_FOOT_X))).normalized()
    return (FRONT - (FRONT - BOW_FOOT_X) * (CHINE - z) / (CHINE - BOW_FOOT), y, z), (n.x, 0, n.z)


def on_cheek(sign: int):
    """The angled cheek beside the driver's plate: along runs from its front edge (0) to its side edge (1), z from deck to roof."""
    foot = (Vector((DECK_X, DRIVER_HALF, DECK_Z)), Vector((DECK_X - CHEEK_BACK, DECK_HALF, DECK_Z)))
    top = (Vector((ROOF_FRONT, ROOF_HALF - ROOF_CHEEK, ROOF)), Vector((ROOF_FRONT - ROOF_CHEEK, ROOF_HALF, ROOF)))
    n = (foot[1] - foot[0]).cross(top[0] - foot[0]).normalized()
    if n.x < 0:
        n = -n

    def at(a: float, z: float) -> tuple[Vec3, Vec3]:
        v = (z - DECK_Z) / (ROOF - DECK_Z)
        p = foot[0].lerp(foot[1], a).lerp(top[0].lerp(top[1], a), v)
        return (p.x, sign * p.y, p.z), (n.x, sign * n.y, n.z)

    return at


def doors(kit: Kit) -> None:
    """One door per side between the arches, split at the chine like the real two-leaf door, with a vision block in its upper leaf.

    Ahead of and behind the door the upper side carries a round firing port and a vision block.
    """
    x0, x1 = DOOR_X
    for sign, tag in ((1, "l"), (-1, "r")):
        face = on_side(sign)
        plate(kit, f"door_low_{tag}", "trim", rect(x0, x1, DOOR_LOW, CHINE - 0.04), face)
        plate(kit, f"door_high_{tag}", "trim", rect(x0, x1, CHINE + 0.04, DOOR_HIGH), face)
        plate(kit, f"door_block_{tag}", "glass", rect(-0.14, 0.14, 0.22, 0.3), face, thick=0.04)
        for end, ex in (("front", 1), ("back", -1)):
            plate(kit, f"block_{end}_{tag}", "glass", rect(ex * 1.0, ex * 1.32, 0.28, 0.36), face, thick=0.04)
            port(kit, f"port_{end}_{tag}", face, ex * 0.66, 0.2)


def port(kit: Kit, name: str, face, x: float, z: float) -> None:
    """A round firing port plug standing out of a side face, with its dark center."""
    (px, py, pz), (ox, oy, oz) = face(x, z)
    tilt = -math.atan2(oy, oz)
    r = 0.075
    kit.cylinder(name, r, 0.05, (px + ox * 0.01, py + oy * 0.01, pz + oz * 0.01), "trim", rot=(tilt, 0, 0), vertices=round_sides(r))
    kit.cylinder(f"{name}_hole", 0.035, 0.02, (px + ox * 0.04, py + oy * 0.04, pz + oz * 0.04), "under", rot=(tilt, 0, 0), vertices=round_sides(0.035))


def headlight(kit: Kit, tag: str, y: float) -> None:
    """A round headlight on a stand inside an open cage of thin trim bars on the front deck, looking forward."""
    r = 0.085
    z = deck_z(LAMP_X) + 0.15
    kit.box(f"lamp_stand_{tag}", (0.06, 0.06, 0.15), (LAMP_X - 0.02, y, deck_z(LAMP_X) + 0.06), "under")
    kit.cylinder(f"lamp_bucket_{tag}", r + 0.015, 0.12, (LAMP_X, y, z), "trim", rot=(0, math.pi / 2, 0), vertices=round_sides(r + 0.015))
    kit.cylinder(f"lamp_{tag}", r, 0.02, (LAMP_X + 0.065, y, z), "light", rot=(0, math.pi / 2, 0), vertices=round_sides(r))
    cage_x = (LAMP_X - 0.12, LAMP_X + 0.15)
    half = 0.16
    top = deck_z(cage_x[0]) + 0.33
    bar = 0.022
    for cx in cage_x:
        for cy in (y - half, y + half):
            low = deck_z(cx) - 0.02
            kit.box(f"cage_post_{tag}_{cx:.2f}_{cy:.2f}", (bar, bar, top - low), (cx, cy, (top + low) / 2), "trim")
    depth = cage_x[1] - cage_x[0]
    mid_x = (cage_x[0] + cage_x[1]) / 2
    for cy in (y - half, y + half):
        kit.box(f"cage_top_side_{tag}_{cy:.2f}", (depth, bar, bar), (mid_x, cy, top), "trim")
        kit.box(f"cage_mid_side_{tag}_{cy:.2f}", (depth, bar, bar), (mid_x, cy, z), "trim")
    for cx in cage_x:
        kit.box(f"cage_top_cross_{tag}_{cx:.2f}", (bar, 2 * half, bar), (cx, y, top), "trim")
    front = cage_x[1]
    low = deck_z(front) - 0.02
    for i in range(1, 4):
        kit.box(f"cage_mesh_{tag}_{i}", (0.012, 0.012, top - low), (front, y - half + i * half / 2, (top + low) / 2), "trim")
    for i, mz in enumerate((low + (top - low) / 3, low + 2 * (top - low) / 3)):
        kit.box(f"cage_band_{tag}_{i}", (0.012, 2 * half, 0.012), (front, y, mz), "trim")


def mirror(kit: Kit, tag: str, y: float) -> None:
    """A round mirror on a thin stalk at a front corner of the deck."""
    low = deck_z(MIRROR_X) - 0.02
    top = low + 0.42
    kit.box(f"mirror_stalk_{tag}", (0.025, 0.025, top - low), (MIRROR_X, y, (top + low) / 2), "trim")
    r = 0.09
    kit.cylinder(f"mirror_{tag}", r, 0.03, (MIRROR_X, y, top + r - 0.02), "trim", rot=(0, math.pi / 2, 0), vertices=round_sides(r))


def bow(kit: Kit) -> None:
    """The caged headlights and mirrors on the front deck, the vision blocks on the driver's plate and cheeks, and the tow box with its shackle on the bow plate."""
    for sign, tag in ((1, "l"), (-1, "r")):
        headlight(kit, tag, sign * LAMP_Y)
        mirror(kit, tag, sign * MIRROR_Y)
        plate(kit, f"block_driver_{tag}", "glass", rect(sign * 0.14, sign * 0.46, 0.36, 0.46), on_driver, thick=0.04)
        plate(kit, f"block_cheek_{tag}", "glass", rect(0.3, 0.7, 0.36, 0.45), on_cheek(sign), thick=0.05)
    plate(kit, "tow_box", "under", rect(-0.32, 0.32, -0.38, -0.14), on_bow, thick=0.02)
    (x, _, z), (ox, _, oz) = on_bow(0, -0.47)
    for i, sy in enumerate((-0.06, 0.06)):
        kit.box(f"shackle_side{i}", (0.06, 0.025, 0.12), (x + ox * 0.03, sy, z + oz * 0.03 + 0.02), "trim")
    kit.box("shackle_pin", (0.06, 0.15, 0.03), (x + ox * 0.03, 0, z + oz * 0.03 - 0.04), "trim")


def stern(kit: Kit) -> None:
    """Round taillights set into open guards on the stern plate, the rear door on the right and the exhaust silencer lying across the left."""
    lamp_z = 0.08
    for sign, tag in ((1, "l"), (-1, "r")):
        y = sign * 1.0
        x = stern_x(lamp_z - 0.06) - 0.025
        kit.cylinder(f"taillight_{tag}", 0.06, 0.05, (x, y, lamp_z), "red", rot=(0, math.pi / 2, 0), vertices=round_sides(0.06))
        for i, gy in enumerate((y - 0.09, y + 0.09)):
            kit.box(f"tail_guard_{tag}{i}", (0.1, 0.025, 0.17), (x + 0.01, gy, lamp_z), "trim")
        kit.box(f"tail_hood_{tag}", (0.1, 0.205, 0.025), (x + 0.01, y, lamp_z + 0.085), "trim")
    plate(kit, "rear_door", "trim", rect(-0.9, -0.25, CHINE + 0.12, ROOF - 0.12), on_stern)
    mid_z = (CHINE + ROOF) / 2
    (x, _, z), (ox, _, oz) = on_stern(0, mid_z)
    r = 0.13
    kit.cylinder("silencer", r, 0.75, (x + ox * (r + 0.02), 0.65, z + oz * (r + 0.02)), "under", rot=(math.pi / 2, 0, 0), vertices=round_sides(r))
    for i, y in enumerate((0.38, 0.92)):
        plate(kit, f"silencer_strap{i}", "trim", rect(y - 0.03, y + 0.03, mid_z - 0.2, mid_z + 0.2), on_stern, thick=0.04)


def roof(kit: Kit) -> None:
    """The round hatch over the rear rows and dark louvers on the engine deck beside the cutout."""
    kit.cylinder("hatch", 0.32, 0.03, (G.row_x(6), 0, ROOF + 0.015), "trim", vertices=round_sides(0.32))
    (x0, _), (x1, _) = ENGINE
    count = 5
    pitch = (x1 - x0) / count
    for i in range(count):
        kit.box(f"louver{i}", (0.12, 0.7, 0.03), (x0 + pitch * (i + 0.5), -0.45, ROOF + 0.015), "under")


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


def check_prow(kit: Kit) -> None:
    """Raises unless the hull's forwardmost and rearmost points lie on the chine, so the bow and stern keep their boat prow."""
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ v.co for obj in kit._parts if obj.name in HULLS for v in obj.data.vertices]
    for end, pick in (("bow", max), ("stern", min)):
        tip = pick(p.x for p in points)
        for p in points:
            if abs(p.x - tip) < 0.01 and abs(p.z - CHINE) > 0.05:
                raise RuntimeError(f"base_carrier's {end} tip at x {tip:.3f} has a point at z {p.z:.3f}, off the chine at {CHINE}")


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
    chine_strip(kit)
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
    check_prow(kit)
    check_tires(kit)
    check_base(kit, "base_carrier", G)
    kit.export("base_carrier", args, view_size=7.0)


if __name__ == "__main__":
    main()
