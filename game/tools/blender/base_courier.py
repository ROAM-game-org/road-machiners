"""The courier base: a lifted 1976 VW Type 1 "Baja Bug", built from the committee's two photos of a yellow Baja Bug.

Photos: a front 3/4 from the front left and a rear 3/4 from the back right, both close perspective shots, so they set the shape and
detail and the Type 1's published figures at the scout's 1.077 scale set the size: 4.1 m long, 1.86 m across the fenders and 1.75 m
tall on its tires, on a 2.6 m wheelbase. The ground is 1.0 m below the center. The side and top views are inferred from the Type 1.
Levels: roof crest 0.75, beltline and door tops 0.15, lid cut 0.04, fender crowns 0.04, running boards -0.34, body bottom -0.4.
One roof line runs from the cowl (x 0.66) up a flat, upright windshield to x 0.38, over a long dome with its crest by the B-pillar,
and from x -0.64 down one clean back slope (rise 0.66 per meter) past an oval rear window and a lid vent to the Baja lid cut at
x -1.67. Below the cut the engine block, fan shroud and exhaust stand bare inside a low tube bumper at hub height.
The tub is wide, its doors 0.15 m inside the fenders, over thin dark running boards. The greenhouse leans in above the belt, with a
door window and a quarter window per side and a louver behind it, under a trim roof panel that follows the dome.
Four bulbous painted fenders crown 0.24 m over the tires. The front ones are cut back from the headlight, and each headlight
stands upright in a painted bucket on the fender front, behind a chrome ring, with an amber lamp on the fender side. The rear ones
wrap behind the tire to hub height and carry upright amber over red taillights on their tops. Two spot lamps stand on a low front
tube bumper under the domed front lid, which falls to a rounded nose with a center ridge and frames the engine hole.
The engine hole is the drawn engine plus HOLE_MARGIN, over a dark bay floor at 0.0, centered on PHYSICS.bodies.courier.engine.
Round lamps, tubes and fender arcs take their sides from round_sides().
Deviations from the photos: 1.86 m wide instead of 1.66, since the track and tires set it; the engine shows in the front lid, where
the grid's engine cells lie, and the tail shows a decor engine; the back slope is one clean plane so the deck cells lie on it like on
a raked hood, where the car's lid curves; the roof panel takes the cab paint where the car is one color; the tire gap stays
ARCH_CLEARANCE; the wheels are the game's own; and the antenna whip, mud flaps and plates are left out.
Grid: 4 columns by 7 rows, stretched over the model by the projection. Half height 0.3 m, from PHYSICS.bodies.courier.
Wheels sit at x +-1.3, radius 0.4 m, half width 0.16 m, mount 0.2 m below the center, 0.726 m off the center line.
Sockets arch_front, arch_rear and arch_front_top (the inner arch crown) mark the arches for wheelArches.test.ts.
Run: blender --background --python tools/blender/base_courier.py -- public/models/base_courier.glb [tmp/base_courier.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, Vec3, parse_args, round_sides  # noqa: E402
from parts_common_base import ARCH_CLEARANCE, BASE_COLORS, MAX_TWIST, SUSPENSION_REST, Grid, check_base, check_clean_shell, check_no_stacking, level_sockets, surface_z  # noqa: E402
from shapes import loft, mesh, open_loft, prism, prism_polygon, slab, strut, taper  # noqa: E402

SEED = 303
COLORS = {
    **BASE_COLORS,
    "chrome": 0xC4C9CC,  # PAL.semi.chrome
    "amber": 0xFFB45A,  # PAL.lamp.amber
}
G = Grid(rows=7, cols=4, half_height=0.3)
WHEEL_R = 0.4  # PHYSICS.bodies.courier.wheelRadius
WHEEL_HALF_W = 0.16  # PHYSICS.bodies.courier.wheelHalfWidth
WHEEL_Z = 0.726  # PHYSICS.bodies.courier.wheelZ
HUB_Z = -0.2 - SUSPENSION_REST  # PHYSICS.bodies.courier.wheelY
WHEELS_X = (1.3, -1.3)  # PHYSICS.bodies.courier.wheelX
ARCH_R = WHEEL_R + ARCH_CLEARANCE

LENGTH = 4.1
FRONT = LENGTH / 2
BACK = -FRONT
SIDE = 0.93  # half the 1.86 m across the fenders, set by the track and tires

PAN = -0.4
BELT = 0.15
FLOOR = 0.0  # PHYSICS.bodies.courier.engine.y
SHELF = -0.12  # the lid and back shell bottoms, over the arch crowns at -0.14
DOOR = 0.78  # photo 1: the fenders stand 0.15 m proud of the doors
GLASS_BASE = 0.70  # photo 1: the greenhouse leans in from the belt
CREST_HALF = 0.47
BACK_HALF = 0.62  # the back slope stays flat across the deck cells, Blender y -0.19..0.56
COWL_X = 0.66
SCREEN_TOP = 0.43  # photo 1: a flat windshield about 64 degrees from level
ROOF_LINE = [(COWL_X, 0.17), (0.55, 0.42), (SCREEN_TOP, 0.65), (0.33, 0.712), (0.15, 0.74), (-0.1, 0.75), (-0.3, 0.747), (-0.48, 0.735)]
SLOPE = 0.55  # photo 2: one long back line, under the 0.7 rise a resting part may lean on
SLOPE_X = -0.48  # the rear window lies ahead of the deck cells, x -0.683, since glass holds nothing up
DECK_BACK = -1.594  # the back edge of the deck cells, the end of the clean slope
LID_CUT_X = -1.67  # photo 2: the lid cut off at the rear fender crowns
LID_CUT_Z = -0.06
LID_LIP = 0.08  # photo 2: the cut lid is a thin lip over the bare engine
BOARD_TOP = -0.34
BOARD_OUT = 0.88
ROOF_BACK = -0.42
REAR_GLASS_X = -0.555
REAR_GLASS = (0.125, 0.46)  # photo 2: a wide oval, kept ahead of the deck cells at x -0.683

FENDER_R = 0.64  # photo 1: the crown 0.3 of a tire diameter over the tire
FENDER_IN = 0.55
FENDER_ROLL = [(FENDER_IN, 0.0), (0.72, 0.0), (0.8, 0.02), (0.86, 0.05), (0.9, 0.09), (SIDE, 0.15)]
FRONT_CUT = 0.62  # photo 1: the front fender cut back from the headlight
BOARD_A = math.asin((PAN - HUB_Z) / FENDER_R)

LAMP_X = 1.62
LAMP_Y = 0.73
LAMP_Z = -0.17  # photo 1: the headlight centers near tire top height
LAMP_R = 0.13  # photo 1: 0.3 of a tire diameter across
SPOT_R = 0.14  # photo 1: spot lamps as large as the headlights
BUCKET_R = 0.18  # the bucket's back, flowing out of the fender front
TAIL_R = 0.11  # photo 2: upright taillights 0.3 of a tire diameter tall
TUBE = 0.07
BUMPER_Z = HUB_Z + 0.02
ALONG_X = (0, math.pi / 2, 0)

ENGINE_X = 1.24  # PHYSICS.bodies.courier.engine.x
ENGINE_Y = 0.0  # -PHYSICS.bodies.courier.engine.z
ENGINE_HALF = (0.34, 0.40)  # the drawn engine: the whole 0.1 m height map cells of the bay floor inside the hole, about the anchor
HOLE_MARGIN = 0.03
HOLE = ((ENGINE_X - ENGINE_HALF[0] - HOLE_MARGIN, ENGINE_Y - ENGINE_HALF[1] - HOLE_MARGIN), (ENGINE_X + ENGINE_HALF[0] + HOLE_MARGIN, ENGINE_Y + ENGINE_HALF[1] + HOLE_MARGIN))
LID = [(COWL_X, 0.17, 0.62), (0.8, 0.175, 0.585), (1.0, 0.165, 0.54), (1.2, 0.14, 0.525), (1.4, 0.1, 0.5), (HOLE[1][0], 0.04, 0.5), (1.72, -0.04, 0.43), (1.84, -0.14, 0.37), (1.92, -0.26, 0.33), (1.96, -0.38, 0.3)]
SIDE_STEPS = (8, 3)
DETAIL_TWIST = 20.0  # a window or vent folds more than paint may, since dark glass shows no shard
DETAIL_LIFT = 0.008  # laid-on details stand this far off the surface they lie on, clear of the 4 mm coplanar band
PANEL = 0.014  # the thickness of a window, louver or vent over its lift
SILL_X = -0.69  # the doors end and the shell starts to drop to the shelf, behind the rear fender's front tip
SILL_BACK_X = -0.83
LID_COLUMNS = [0.09, 0.065, 0.03, 0.012, 0.0]  # how far the lid's top columns hang below its crest, from the side edge to the center
SHELL = [
    "lid", "ridge", "handle", "greenhouse", "doors", "roof", "windshield", "door_glass_l", "door_glass_r",
    "quarter_glass_l", "quarter_glass_r", "louver_l", "louver_r", "rear_glass", "lid_vent",
]
BODY = ["lid", "greenhouse", "doors"]


def along(points: list[tuple[float, float]], x: float) -> float:
    """The value of a polyline of (x, value) points at x."""
    for (x0, z0), (x1, z1) in zip(points, points[1:]):
        if min(x0, x1) <= x <= max(x0, x1):
            return z0 + (z1 - z0) * (x - x0) / (x1 - x0)
    raise ValueError(f"x {x} is off the line")


def roof_z(x: float) -> float:
    """The roof line's height at x: the windshield and dome, then the one clean back slope down to the deck cells' back edge."""
    if x >= SLOPE_X:
        return along(ROOF_LINE, x)
    return ROOF_LINE[-1][1] - SLOPE * (SLOPE_X - x)


def lid_z(x: float) -> float:
    return along([(x0, z) for x0, z, _ in LID], x)


def lid_half(x: float) -> float:
    return along([(x0, w) for x0, _, w in LID], x)


def lerp(a: tuple[float, float], b: tuple[float, float], t: float) -> tuple[float, float]:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def section(top: float, top_half: float, base_half: float, base: float) -> list[tuple[float, float]]:
    """A rounded cross-section as Y and Z: up from base at base_half, leaning in to the shoulder, over a low dome to top.

    The side is cut into SIDE_STEPS pieces, so where the roof rises faster than the belt the rings differ a little
    from piece to piece and no quad of the shell folds across its diagonal.
    """
    h = top - base
    shoulder = top - min(0.03, 0.375 * h)
    foot = (base_half, base)
    mid = (base_half - 0.55 * (base_half - top_half), min(base + 0.8 * h, shoulder - 0.1 * h))
    edge = (top_half, shoulder)
    lower = [lerp(foot, mid, k / SIDE_STEPS[0]) for k in range(SIDE_STEPS[0])]
    upper = [lerp(mid, edge, k / SIDE_STEPS[1]) for k in range(SIDE_STEPS[1])]
    right = lower + upper + [edge, (0.5 * top_half, top - min(0.008, 0.1 * h))]
    return right + [(0.0, top)] + [(-y, z) for y, z in reversed(right)]


def crown(ring: list[tuple[float, float]]) -> int:
    """The index of the ring's center point."""
    return len(ring) // 2


def shell_top(x: float) -> float:
    if x >= DECK_BACK:
        return roof_z(x)
    return along([(DECK_BACK, roof_z(DECK_BACK)), (-1.64, 0.04), (LID_CUT_X, LID_CUT_Z)], x)


def shell_base(x: float) -> float:
    if x >= SILL_X:
        return BELT
    if x >= SILL_BACK_X:
        return BELT + (SHELF - BELT) * (SILL_X - x) / (SILL_X - SILL_BACK_X)
    if x >= DECK_BACK:
        return SHELF
    return along([(DECK_BACK, SHELF), (-1.64, SHELF), (LID_CUT_X, LID_CUT_Z - LID_LIP)], x)


def shell_ring(x: float) -> list[tuple[float, float]]:
    blend = min(1.0, max(0.0, (SLOPE_X - x) / 0.14))
    return section(shell_top(x), CREST_HALF + blend * (BACK_HALF - CREST_HALF), GLASS_BASE, shell_base(x))


def side_y(outline: list[tuple[float, float]], z: float) -> float:
    """The Y of a section's right side at height z."""
    right = outline[: crown(outline) + 1]
    for (y0, z0), (y1, z1) in zip(right, right[1:]):
        if z0 <= z <= z1:
            return y0 + (y1 - y0) * (z - z0) / (z1 - z0)
    raise ValueError(f"z {z} is off the section side")


def surface_point(x: float, y: float) -> Vec3:
    """The point of the greenhouse surface at x and y, on the dome or on its leaning side."""
    ring = shell_ring(x)
    outward = ring[crown(ring) :: -1]
    reach = abs(y)
    for (y0, z0), (y1, z1) in zip(outward, outward[1:]):
        if y0 <= reach <= y1:
            return (x, y, z0 + (z1 - z0) * (reach - y0) / (y1 - y0))
    raise ValueError(f"y {y} is off the greenhouse at x {x}")


def surface_normal(x: float, y: float) -> Vec3:
    """The unit normal of the greenhouse surface at x and y, from points a centimeter round it, so it averages over a fold."""
    eps = 0.01
    reach = GLASS_BASE - eps
    ahead, behind = Vector(surface_point(min(COWL_X, x + eps), y)), Vector(surface_point(max(LID_CUT_X, x - eps), y))
    right, left = Vector(surface_point(x, min(reach, y + eps))), Vector(surface_point(x, max(-reach, y - eps)))
    n = (ahead - behind).cross(right - left).normalized()
    return (n.x, n.y, n.z)


def lifted(points: list[Vec3], normals: list[Vec3], lift: float) -> list[Vec3]:
    return [(p[0] + lift * n[0], p[1] + lift * n[1], p[2] + lift * n[2]) for p, n in zip(points, normals)]


def lay_on_grid(kit: Kit, name: str, rows: list[list[tuple[float, float]]], thickness: float, mat: str) -> None:
    """A slab over a grid of (x, y) points on the greenhouse: its inner face DETAIL_LIFT off the surface, thickness above it."""
    inner, outer = [], []
    for row in rows:
        points = [surface_point(x, y) for x, y in row]
        normals = [surface_normal(x, y) for x, y in row]
        inner.append(lifted(points, normals, DETAIL_LIFT))
        outer.append(lifted(points, normals, DETAIL_LIFT + thickness))
    slab(kit, name, inner, outer, mat)


def lay_on_plane(kit: Kit, name: str, outline: list[tuple[float, float]], thickness: float, mat: str) -> None:
    """A flat pane over an outline of (x, y) points on the greenhouse. The plane clears the highest point by DETAIL_LIFT."""
    points = [Vector(surface_point(x, y)) for x, y in outline]
    normal = sum((Vector(surface_normal(x, y)) for x, y in outline), Vector()).normalized()
    center = sum(points, Vector()) / len(points)
    height = max((p - center).dot(normal) for p in points) + DETAIL_LIFT
    inner = [p + normal * (height - (p - center).dot(normal)) for p in points]
    outer = [p + normal * thickness for p in inner]
    prism_polygon(kit, name, [tuple(p) for p in inner], [tuple(p) for p in outer], mat)


def at_x(x: float, outline: list[tuple[float, float]]) -> list[Vec3]:
    return [(x, y, z) for y, z in outline]


def rounded(points: list[tuple[float, float]], r: float) -> list[tuple[float, float]]:
    """A closed outline with each corner rounded by three points about r from it, or less on a short edge."""
    out = []
    for i, (vx, vz) in enumerate(points):
        corner = []
        for px, pz in (points[i - 1], points[(i + 1) % len(points)]):
            d = math.hypot(px - vx, pz - vz)
            corner.append(((px - vx) / d, (pz - vz) / d, d))
        reach = min(r, 0.4 * corner[0][2], 0.4 * corner[1][2])
        (ax, az, _), (bx, bz, _) = corner
        out += [(vx + reach * ax, vz + reach * az), (vx + 0.3 * reach * (ax + bx), vz + 0.3 * reach * (az + bz)), (vx + reach * bx, vz + reach * bz)]
    return out


def mirrored(kit: Kit, name: str, size: Vec3, x: float, y: float, z: float, mat: str) -> None:
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def twist(a: Vec3, b: Vec3, c: Vec3, d: Vec3) -> float:
    """The fold in degrees of the quad a b c d across its diagonal."""
    p, q, r, s = Vector(a), Vector(b), Vector(c), Vector(d)
    return math.degrees((q - p).cross(r - p).angle((r - p).cross(s - p), 0.0))


def refined(stations: list[float], ring_of) -> list[float]:
    """The stations with midpoints added until no quad between two rings folds more than half of MAX_TWIST."""
    xs = sorted(set(stations), reverse=True)
    for _ in range(300):
        worst = None
        for x0, x1 in zip(xs, xs[1:]):
            a, b = at_x(x0, ring_of(x0)), at_x(x1, ring_of(x1))
            fold = max(twist(a[i], a[i + 1], b[i + 1], b[i]) for i in range(len(a) - 1))
            if fold > MAX_TWIST / 2 and x0 - x1 > 0.026 and (worst is None or fold > worst[0]):
                worst = (fold, (x0 + x1) / 2)
        if worst is None:
            return xs
        xs = sorted(xs + [worst[1]], reverse=True)
    raise RuntimeError("the stations never settled")


def tub(kit: Kit) -> None:
    """The dark core from the nose to the tail and the wide painted doors between the fenders, rolled in at the belt and the sill."""
    prism(kit, "core_front", [(0.86, PAN), (1.9, PAN), (1.9, SHELF), (0.86, SHELF)], -0.34, 0.34, "under")
    prism(kit, "core_mid", [(-0.86, PAN), (0.86, PAN), (0.86, BELT), (-0.86, BELT)], -0.54, 0.54, "under")
    prism(kit, "core_back", [(-1.66, PAN + 0.05), (-0.86, PAN), (-0.86, SHELF), (-1.66, SHELF)], -0.54, 0.54, "under")

    def door(half: float) -> list[tuple[float, float]]:
        left = [(GLASS_BASE, BELT), (half, BELT - 0.06), (half, PAN + 0.12), (half - 0.04, PAN)]
        return left + [(-y, z) for y, z in reversed(left)]

    open_loft(kit, "doors", [at_x(x, door(DOOR)) for x in (COWL_X, SILL_X)], "paint")
    mirrored(kit, "board", (1.44, BOARD_OUT - FENDER_IN, 0.04), 0.0, (BOARD_OUT + FENDER_IN) / 2, BOARD_TOP - 0.02, "under")


def lid_columns(x: float) -> list[float]:
    """The side edge, three columns in from it and the center of the lid's top at x, as Y over the right half.

    The third column is the engine hole's side, at its own Y on every row up to the hole's front edge, then it narrows
    with the lid, so the hole has edges of whole quads and the nose has none torn.
    """
    half = lid_half(x)
    hole_side = min(HOLE[1][1], HOLE[1][1] / lid_half(HOLE[1][0]) * half)
    return [half, 0.5 * (half + hole_side), hole_side, min(0.3, 0.77 * hole_side), 0.0]


def lid_ring(x: float) -> list[tuple[float, float]]:
    right = lid_columns(x)
    ys = right + [-y for y in reversed(right[:-1])]
    drops = LID_COLUMNS + list(reversed(LID_COLUMNS[:-1]))
    return [(y, lid_z(x) - drop) for y, drop in zip(ys, drops)]


def lid_rows() -> list[float]:
    (x0, _), (x1, _) = HOLE
    return refined([x for x, _, _ in LID] + [x0, x1], lid_ring)[::-1]


def front_lid(kit: Kit) -> None:
    """The domed front lid from the cowl to the rounded nose, built round the engine hole with no cut, over a dark bay floor with a center ridge ahead."""
    (x0, hy0), (x1, hy1) = HOLE
    xs = lid_rows()
    verts: list[Vec3] = []
    top: dict[tuple[int, int], int] = {}
    bottom: dict[tuple[int, int], int] = {}
    for r, x in enumerate(xs):
        crest = lid_z(x)
        floor = min(SHELF, crest - 0.12)
        ring = lid_ring(x)
        for c, (y, z) in enumerate(ring):
            top[(r, c)] = len(verts)
            verts.append((x, y, z))
        for c, (y, _) in enumerate(ring):
            bottom[(r, c)] = len(verts)
            verts.append((x, y, floor))
    in_hole = lambda r: x0 - 1e-9 <= xs[r] <= x1 + 1e-9
    faces: list[tuple[int, ...]] = []
    for r in range(len(xs) - 1):
        for c in range(8):
            if not (in_hole(r) and in_hole(r + 1) and 2 <= c <= 5):
                faces.append((top[(r, c)], top[(r, c + 1)], top[(r + 1, c + 1)], top[(r + 1, c)]))
            faces.append((bottom[(r, c)], bottom[(r, c + 1)], bottom[(r + 1, c + 1)], bottom[(r + 1, c)]))
        for c in (0, 8):
            faces.append((top[(r, c)], top[(r + 1, c)], bottom[(r + 1, c)], bottom[(r, c)]))
    last = len(xs) - 1
    faces += [(top[(last, c)], top[(last, c + 1)], bottom[(last, c + 1)], bottom[(last, c)]) for c in range(8)]
    pit = {}
    for r in range(len(xs)):
        if in_hole(r):
            for c in range(2, 7):
                x, y, _ = verts[top[(r, c)]]
                pit[(r, c)] = len(verts)
                verts.append((x, y, FLOOR))
    hole_rows = [r for r in range(len(xs)) if in_hole(r)]
    for r in (hole_rows[0], hole_rows[-1]):
        faces += [(top[(r, c)], top[(r, c + 1)], pit[(r, c + 1)], pit[(r, c)]) for c in range(2, 6)]
    for a, b in zip(hole_rows, hole_rows[1:]):
        for c in (2, 6):
            faces.append((top[(a, c)], top[(b, c)], pit[(b, c)], pit[(a, c)]))
    faces.append((pit[(hole_rows[0], 2)], pit[(hole_rows[0], 6)], pit[(hole_rows[-1], 6)], pit[(hole_rows[-1], 2)]))
    lid = mesh(kit, "lid", verts, faces, "paint")
    lid.data.materials.append(kit._materials["under"])
    lid.data.polygons[len(faces) - 1].material_index = 1
    ridge_x = [x1 + 0.05] + [x for x in xs if x > x1 + 0.1]
    loft(kit, "ridge", [ridge_ring(x) for x in ridge_x], "paint")
    slope = lid_slope(1.86)
    tilt = math.atan(slope)
    normal = (-math.sin(tilt), math.cos(tilt))
    lift = 0.022 + DETAIL_LIFT + 0.03
    kit.box("handle", (0.05, 0.1, 0.06), (1.86 + normal[0] * lift, 0.0, lid_z(1.86) + normal[1] * lift), "chrome", rot=(0, -tilt, 0))


def lid_slope(x: float) -> float:
    """The fall of the lid's crest line at x, averaged over the lid segments that meet there."""
    pairs = list(zip(LID, LID[1:]))
    slopes = [(z1 - z0) / (x1 - x0) for (x0, z0, _), (x1, z1, _) in pairs if x0 - 1e-9 <= x <= x1 + 1e-9]
    return sum(slopes) / len(slopes)


def ridge_ring(x: float) -> list[Vec3]:
    """The ridge's three points at x: a base DETAIL_LIFT off the lid along its normal on both sides, and its crest above."""
    slope = lid_slope(x)
    along_x, along_z = -slope / math.hypot(1.0, slope), 1.0 / math.hypot(1.0, slope)
    crest = lid_z(x)
    base = lambda y, lift: (x + along_x * lift, y, crest - 0.002 + along_z * lift)
    return [base(0.03, DETAIL_LIFT), (x + along_x * (0.022 + DETAIL_LIFT), 0.0, crest + along_z * (0.022 + DETAIL_LIFT)), base(-0.03, DETAIL_LIFT)]


def windshield_half(x: float) -> float:
    return along([(COWL_X, 0.53), (WINDSHIELD_TOP, 0.42)], x)


WINDSHIELD_TOP = COWL_X - (COWL_X - SCREEN_TOP) * 0.92
ROOF_FRONT_X = 0.39
REAR_GLASS_ROWS = [-0.449, SLOPE_X, -0.51, REAR_GLASS_X, -0.6, -0.62, -0.661]
CLOSE = 0.012  # stations nearer than this merge, so no strip of the shell is a sliver


def shell_height(x: float) -> float:
    return shell_top(x) - shell_base(x)


def crossings(level: float) -> list[float]:
    """The x where the shell's height passes level: the stations the ring's rounding changes shape at."""
    found = []
    xs = [COWL_X - k * 0.002 for k in range(int((COWL_X - LID_CUT_X) / 0.002) + 1)]
    for x0, x1 in zip(xs, xs[1:]):
        a, b = shell_height(x0) - level, shell_height(x1) - level
        if a * b < 0:
            lo, hi = x1, x0
            for _ in range(50):
                mid = (lo + hi) / 2
                if (shell_height(mid) - level) * b > 0:
                    lo = mid
                else:
                    hi = mid
            found.append((lo + hi) / 2)
    return found


def shell_kinks() -> list[float]:
    required = [COWL_X, 0.55, WINDSHIELD_TOP, SCREEN_TOP, ROOF_FRONT_X, 0.33, 0.15, -0.1, -0.3, ROOF_BACK, SLOPE_X, -0.62, SILL_X, SILL_BACK_X, DECK_BACK, -1.64, LID_CUT_X]
    return required + [x for level in (0.08, 0.3) for x in crossings(level)]


def rear_glass_rows() -> list[float]:
    """The rear glass rows, each moved onto a kink of the shell that lies within CLOSE of it."""
    kinks = shell_kinks()
    return sorted({min(kinks + [x], key=lambda k: abs(k - x)) if any(abs(k - x) < CLOSE for k in kinks) else x for x in REAR_GLASS_ROWS}, reverse=True)


def greenhouse_stations() -> list[float]:
    return refined(shell_kinks() + rear_glass_rows(), shell_ring)


def greenhouse(kit: Kit) -> None:
    """One shell from the cowl to the lid cut: the windshield, the dome, the clean back slope and the lip over the bare engine."""
    rings = [at_x(x, shell_ring(x)) for x in greenhouse_stations()]
    verts = [p for ring in rings for p in ring]
    n = len(rings[0])
    faces: list[tuple[int, ...]] = []
    for r in range(len(rings) - 1):
        faces += [(r * n + i, r * n + i + 1, (r + 1) * n + i + 1, (r + 1) * n + i) for i in range(n - 1)]
    for r in (0, len(rings) - 1):
        base = len(verts)
        x, _, z = rings[r][0]
        verts += [(x, rings[r][i][1], rings[r][0][2]) for i in range(1, n - 1)]
        chord = [r * n] + [base + i - 1 for i in range(1, n - 1)] + [r * n + n - 1]
        faces += [tuple(dict.fromkeys((r * n + i, r * n + i + 1, chord[i + 1], chord[i]))) for i in range(n - 1)]
    floor_from = len(faces)
    corners = [r for r, ring in enumerate(rings) if any(abs(ring[0][0] - x) < 1e-9 for x in (SILL_X, SILL_BACK_X, DECK_BACK, -1.64, LID_CUT_X))]
    chords = {}
    for r in corners:
        foot = rings[r][0]
        chords[r] = [r * n] + [len(verts) + k for k in range(3)] + [r * n + n - 1]
        verts += [(foot[0], foot[1] * f, foot[2]) for f in (0.5, 0.0, -0.5)]
    for a, b in zip(corners, corners[1:]):
        faces += [(chords[a][k], chords[b][k], chords[b][k + 1], chords[a][k + 1]) for k in range(4)]
    mesh(kit, "greenhouse", verts, faces, "paint", down=range(floor_from, len(faces)))
    roof_rows = [x for x in greenhouse_stations() if ROOF_BACK - 1e-9 <= x <= ROOF_FRONT_X + 1e-9]
    lay_on_grid(kit, "roof", [[(x, y) for y, _ in shell_ring(x)[crown(shell_ring(x)) - 2 : crown(shell_ring(x)) + 3]] for x in roof_rows], PANEL - 0.004, "trim")


def windows(kit: Kit) -> None:
    """The flat windshield, a door window and a quarter window on each side, the oval rear window, the louvers and the lid vent."""
    rows = [COWL_X, 0.55, WINDSHIELD_TOP]
    lay_on_grid(kit, "windshield", [[(x, f * windshield_half(x)) for f in (-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1)] for x in rows], PANEL, "glass")
    door = rounded([(0.53, 0.25), (-0.14, 0.25), (-0.14, 0.58), (0.26, 0.6), (0.4, 0.54)], 0.07)
    quarter = rounded([(-0.22, 0.25), (-0.44, 0.25), (-0.56, 0.36), (-0.5, 0.56), (-0.22, 0.6)], 0.07)
    for name, outline in (("door_glass", door), ("quarter_glass", quarter)):
        for s, sy in (("l", 1), ("r", -1)):
            lay_on_plane(kit, f"{name}_{s}", [(x, sy * side_y(shell_ring(x), z)) for x, z in outline], PANEL, "glass")
    louver = [(-0.6, 0.3), (-0.64, 0.3), (-0.66, 0.5), (-0.62, 0.5)]
    for s, sy in (("l", 1), ("r", -1)):
        lay_on_plane(kit, f"louver_{s}", [(x, sy * side_y(shell_ring(x), z)) for x, z in louver], PANEL, "under")
    oval = []
    for x in rear_glass_rows():
        reach = REAR_GLASS[1] * math.sqrt(max(0.0, 1 - ((x - REAR_GLASS_X) / REAR_GLASS[0]) ** 2))
        kink = 0.5 * shell_ring(x)[crown(shell_ring(x)) - 2][0]
        fold_y = kink if kink < 0.99 * reach else 0.6 * reach
        oval.append([(x, y) for y in (-reach, -fold_y, 0.0, fold_y, reach)])
    lay_on_grid(kit, "rear_glass", oval, PANEL, "glass")
    vent = [(-1.04, 0.24), (-1.04, -0.24), (-1.16, -0.24), (-1.16, 0.24)]
    lay_on_plane(kit, "lid_vent", vent, PANEL, "under")


def fender_ring(wx: float, r_out: float, a0: float, a1: float, n: int) -> list[tuple[float, float]]:
    """One fender outline in XZ round a hub: the outer arc from angle a0 to a1 (0 ahead of the hub), then the arch back."""

    def arc(r: float, a: float, b: float) -> list[tuple[float, float]]:
        return [(wx + r * math.cos(a + (b - a) * k / n), HUB_Z + r * math.sin(a + (b - a) * k / n)) for k in range(n + 1)]

    return arc(r_out, a0, a1) + arc(ARCH_R, a1, a0)


def fender(kit: Kit, name: str, wx: float, a0: float, a1: float) -> None:
    """A bulbous painted fender over one wheel on both sides, its outer shoulder rolled down to the fender edge."""
    n = max(4, round(round_sides(FENDER_R) * abs(a1 - a0) / math.tau))
    for s, sy in (("l", 1), ("r", -1)):
        rings = [[(x, sy * y, z) for x, z in fender_ring(wx, FENDER_R - drop, a0, a1, n)] for y, drop in FENDER_ROLL]
        loft(kit, f"{name}_{s}", rings, "paint")


def fenders(kit: Kit) -> None:
    """Four fenders: the front ones cut back to the headlight buckets, the rear ones wrapped behind the tires to hub height."""
    front_x, rear_x = WHEELS_X
    fender(kit, "fender_f", front_x, FRONT_CUT, math.pi - BOARD_A)
    fender(kit, "fender_b", rear_x, BOARD_A, math.pi)
    for s, sy in (("l", 1), ("r", -1)):
        y = sy * LAMP_Y
        bucket = kit.cylinder(f"lamp_bucket_{s}", BUCKET_R, 0.15, (LAMP_X + 0.115, y, LAMP_Z), "paint", rot=ALONG_X, vertices=round_sides(BUCKET_R))
        taper(bucket, (LAMP_R + 0.02) / BUCKET_R)
        kit.cylinder(f"lamp_ring_{s}", LAMP_R + 0.012, 0.02, (LAMP_X + 0.19, y, LAMP_Z), "chrome", rot=ALONG_X, vertices=round_sides(LAMP_R + 0.012))
        kit.cylinder(f"lamp_{s}", LAMP_R, 0.02, (LAMP_X + 0.2, y, LAMP_Z), "light", rot=ALONG_X, vertices=round_sides(LAMP_R))
        kit.cylinder(f"side_lamp_{s}", 0.045, 0.05, (1.56, sy * 0.87, -0.11), "amber", rot=(math.pi / 2, 0, 0), vertices=round_sides(0.045))
        tx, ty = -1.8, sy * 0.74
        kit.cylinder(f"taillight_{s}", TAIL_R, 0.18, (tx, ty, -0.17), "red", vertices=round_sides(TAIL_R))
        kit.cylinder(f"taillight_amber_{s}", TAIL_R, 0.09, (tx, ty, -0.035), "amber", vertices=round_sides(TAIL_R))


def tube(kit: Kit, name: str, a: Vec3, b: Vec3) -> None:
    strut(kit, name, a, b, TUBE, "metal_light", sides=round_sides(TUBE / 2))


def bumpers(kit: Kit) -> None:
    """The low front tube with two spot lamps on it, and the rear tube wrapped round the bare tail."""
    nose = FRONT - 0.075
    tube(kit, "bumper_front", (nose, 0.62, BUMPER_Z), (nose, -0.62, BUMPER_Z))
    tail = BACK + TUBE / 2
    tube(kit, "bumper_rear", (tail, 0.64, BUMPER_Z), (tail, -0.64, BUMPER_Z))
    for s, sy in (("l", 1), ("r", -1)):
        tube(kit, f"bumper_front_post_{s}", (nose, sy * 0.28, BUMPER_Z), (1.86, sy * 0.28, PAN + 0.02))
        tube(kit, f"bumper_rear_wrap_{s}", (tail, sy * 0.64, BUMPER_Z), (-1.84, sy * 0.66, BUMPER_Z))
        tube(kit, f"bumper_rear_post_{s}", (tail + 0.02, sy * 0.36, BUMPER_Z), (-1.66, sy * 0.36, PAN + 0.06))
        y = sy * 0.2
        z = BUMPER_Z + 0.06 + SPOT_R
        kit.box(f"spot_stem_{s}", (0.05, 0.05, z - BUMPER_Z), (nose, y, (z + BUMPER_Z) / 2), "under")
        kit.cylinder(f"spot_{s}", SPOT_R, 0.12, (nose, y, z), "under", rot=ALONG_X, vertices=round_sides(SPOT_R))
        kit.cylinder(f"spot_lens_{s}", SPOT_R - 0.02, 0.02, (nose + 0.065, y, z), "light", rot=ALONG_X, vertices=round_sides(SPOT_R - 0.02))


def tail(kit: Kit) -> None:
    """The bare Baja tail under the lid cut: the engine block and heads, the round fan shroud and air filter, and the exhaust and silencer."""
    kit.box("engine_block", (0.36, 0.7, 0.36), (-1.78, 0.0, -0.29), "metal")
    mirrored(kit, "engine_head", (0.24, 0.12, 0.2), -1.8, 0.42, -0.33, "metal_light")
    kit.cylinder("fan_shroud", 0.15, 0.16, (-1.86, 0.0, -0.15), "metal_light", rot=ALONG_X, vertices=round_sides(0.15))
    kit.cylinder("fan_grille", 0.1, 0.02, (-1.945, 0.0, -0.15), "soot", rot=ALONG_X, vertices=round_sides(0.1))
    kit.cylinder("air_filter", 0.08, 0.1, (-1.74, -0.3, -0.07), "metal_light", vertices=round_sides(0.08))
    kit.cylinder("silencer", 0.08, 0.75, (-1.95, 0.0, -0.5), "rust", rot=(math.pi / 2, 0, 0), vertices=round_sides(0.08))
    for s, sy in (("l", 1), ("r", -1)):
        strut(kit, f"exhaust_{s}", (-1.7, sy * 0.4, -0.43), (-1.95, sy * 0.36, -0.5), 0.07, "rust", sides=round_sides(0.035))
        strut(kit, f"tailpipe_{s}", (-1.95, sy * 0.3, -0.5), (-2.01, sy * 0.3, -0.4), 0.06, "rust", sides=round_sides(0.03))


def arch_sockets(kit: Kit) -> None:
    front_x, rear_x = WHEELS_X
    kit.socket("arch_front", (front_x, WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (rear_x, WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (front_x, WHEEL_Z, HUB_Z + ARCH_R))


def check_hood() -> None:
    """Raises when the lid hole does not hold the drawn engine with its margin, or leaves the lid."""
    (x0, y0), (x1, y1) = HOLE
    ex0, ex1 = ENGINE_X - ENGINE_HALF[0], ENGINE_X + ENGINE_HALF[0]
    ey0, ey1 = ENGINE_Y - ENGINE_HALF[1], ENGINE_Y + ENGINE_HALF[1]
    margins = (ex0 - x0, x1 - ex1, ey0 - y0, y1 - ey1)
    if min(margins) < HOLE_MARGIN - 1e-6 or max(margins) > HOLE_MARGIN + 1e-6:
        raise RuntimeError(f"lid hole x {x0:.3f}..{x1:.3f} y {y0:.3f}..{y1:.3f} is not the engine x {ex0:.3f}..{ex1:.3f} y {ey0:.3f}..{ey1:.3f} plus {HOLE_MARGIN}")
    if x0 <= COWL_X or x1 >= LID[-1][0] or max(abs(y0), abs(y1)) >= min(lid_half(x0), lid_half(x1)) - 0.05:
        raise RuntimeError(f"lid hole x {x0:.3f}..{x1:.3f} y {y0:.3f}..{y1:.3f} leaves the lid")


def main() -> None:
    args = parse_args()
    check_hood()
    kit = Kit(COLORS, SEED)
    tub(kit)
    front_lid(kit)
    greenhouse(kit)
    windows(kit)
    fenders(kit)
    bumpers(kit)
    tail(kit)
    arch_sockets(kit)
    bay = {(x, y): FLOOR for x in (1, 2) for y in (1, 2)}
    sides = {(x, y): surface_z(G, x, y) for x in (0, 3) for y in range(G.rows) if abs(G.row_x(y)) < FRONT - 0.1}
    rows = [lid_z(min(LID[-1][0], G.row_x(y))) if G.row_x(y) > COWL_X else roof_z(G.row_x(y)) for y in range(G.rows)]
    level_sockets(kit, G, "row", rows, cells=bay | sides)
    level_sockets(kit, G, "floor", [FLOOR] * 3 + [BELT] * 2 + [roof_z(G.row_x(5)), roof_z(G.row_x(6))])
    check_no_stacking("base_courier", kit.parts(SHELL))
    check_clean_shell("base_courier", kit.parts(BODY))
    check_clean_shell("base_courier", kit.parts([n for n in SHELL if n not in BODY]), slivers=False, max_twist=DETAIL_TWIST)
    check_base(kit, "base_courier", G)
    kit.export("base_courier", args, view_size=5.0)


if __name__ == "__main__":
    main()
