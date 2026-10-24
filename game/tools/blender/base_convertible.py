"""The convertible base: a stylized 1964 Chevrolet Corvair Monza convertible with its top folded down.

Measured from two photographs of a red 1964 Monza convertible (front left and rear left, MercurySable99, CC BY-SA 4.0,
Wikimedia Commons) and sized from the published specs at 1.278 scale, so it keeps its 5.84 m game length: 2.17 m
across the lid lip, a 3.5 m wheelbase and 1.60 m to the windshield header on its tires. The ground is 1.04 m below
the center. The body is one loft of plan rings from the rocker to the lids, squared off at the ends with 0.32 m plan
corners. One lid lip wraps the nose, the sides and the tail 1.06-1.10 m over the ground, with a shadow line under it,
and the flat lids lie 1.12 m up, rolling down 8 cm at the nose and the tail. Under the lip the side stands nearly
upright and rolls under to the rocker.
The nose face holds two round headlamps a side in a horizontal chrome bezel sunk into the face, a full-width chrome
strip with a winged badge between the bezels, an amber parking lamp under each bezel and a chrome wrap bumper.
The raked windshield in a thin chrome frame runs from the cowl at x 0.95 to the header at x 0.45, with a vent window
frame at the front of each door. The cockpit is open from the cowl back to x -0.29, 0.76 m off the center line a side,
so the door tops make flat shoulders at lid level. Inside: a dark floor, dash and thin round steering wheel, a leather
seat on the left, and on the right the dash runs back flush over the seat as one leather shelf level with its seat back.
The folded top lies on its boot over the rear seat, a low padded roll in the faction's second color 1.23 m up at its
crown from x -0.29 to -0.97, the highest flat spot over the cab cells, where the antenna stands. The flat rear lid
carries two louver banks either side of a faint spine: the left one is the engine hole, fitted to the drawn engine
plus HOLE_MARGIN over a shallow slatted floor 0.06 m under the lid, and the right one is slats on the lid.
The tail holds two round taillights a side in chrome rings, a dark plate panel in a chrome frame, a chrome wrap bumper
and a dark mesh outlet in two halves under it. One long door a side keeps DOOR_GAP from the arches. Round arches
of 32 edges with chrome lips are cut under the lip, and a chrome strip runs along the rocker.
Deviations from the photos: the top is down; the wheels stay symmetric on the tire rule's tire at the game's ride;
the door tops are thick so the outer deck columns rest flat; the left louver bank is the engine hole over the grid's
engine cells, so a fitted engine stands out of the lid; no mirror, script badges or plate numbers; the passenger's
seat is a flat shelf level with its seat back and the boot covers the rear seat, so the deck cells beside the cab
and behind it have one level to rest on; the boot ends at the cab rows' back edge, ahead of the rear axle.
Grid: 5 columns by 9 rows, stretched over the model by the projection. Rows 0 to 2 and 6 to 8 rest on the lids,
the engine cells on the bay floor, columns 0 and 4 of rows 3 to 5 on the door tops, and column 3 of rows 3 to 5 on
the passenger's shelf and the boot.
Half height 0.35 m, from PHYSICS.bodies.convertible.
Wheels sit at x -+1.75 and y -+0.84, radius 0.44 m, half width 0.175 m, mount 0.2 m below the center.
Sockets arch_front, arch_rear and arch_front_top mark the arches for wheelArches.test.ts.
Run: blender --background --python tools/blender/base_convertible.py -- public/models/base_convertible.glb [tmp/base_convertible.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, Vec3, parse_args  # noqa: E402
from parts_common_base import (  # noqa: E402
    ARCH_CLEARANCE,
    BASE_COLORS,
    SUSPENSION_REST,
    Grid,
    arch_cut,
    check_base,
    check_door_gap,
    cut_boxes,
    cut_hulls,
    hull_mesh,
    level_sockets,
)
from parts_common_core import ROUND_SEGMENTS, SMALL_ROUND_SEGMENTS, check_round  # noqa: E402
from shapes import loft, prism, strut  # noqa: E402

SEED = 305
COLORS = {**BASE_COLORS, "amber": 0xFFB45A}  # PAL.lamp.amber
G = Grid(rows=9, cols=5, half_height=0.35)
WHEEL_R = 0.44  # PHYSICS.bodies.convertible.wheelRadius
WHEEL_HALF_W = 0.175  # PHYSICS.bodies.convertible.wheelHalfWidth
WHEEL_X = 1.75  # PHYSICS.bodies.convertible.wheelX: half the 2.74 m wheelbase times 1.278
WHEEL_Z = 0.84  # PHYSICS.bodies.convertible.wheelZ: the tire's outer face flush with the side at hub height
HUB_Z = -0.2 - SUSPENSION_REST  # PHYSICS.bodies.convertible.wheelY
GROUND = HUB_Z - WHEEL_R
WHEELS_X = [WHEEL_X, -WHEEL_X]
ARCH_R = WHEEL_R + ARCH_CLEARANCE
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03


def up(height: float) -> float:
    """Model z of a height over the ground."""
    return GROUND + height


NOSE_X = 2.90  # the lip's front: half the 4.57 m length times 1.278, less the bumper standing 2 cm proud of it
HALF_W = 1.085  # half the 1.70 m width times 1.278, at the lip
CORNER_R = 0.32  # brief 13: the plan corners of the nose and the tail, about 0.25 m on the car
BOW = 0.03  # brief 13: the soft V at the middle of the nose and the tail
CORNER_X = NOSE_X - BOW
ARC_STEPS = 8
BOW_STEPS = 2
SIDE_STATIONS = (2.4, 2.1, 1.2, 0.0, -1.2, -2.1, -2.4)  # extra points along the straight sides, so the ends can roll down

# The section as (height over the ground, side inset, end inset) from the lip, rocker to lid.
SECTION = [
    (0.30, 0.20, 0.22),  # brief 9: the rocker roll, the body bottom at the game's ride
    (0.36, 0.11, 0.14),
    (0.46, 0.065, 0.09),  # just over hub height: the tire's outer face stands here
    (0.80, 0.035, 0.055),
    (1.045, 0.032, 0.045),  # under the lip: the shadow line
    (1.06, 0.0, 0.0),  # brief 1: the lip's lower edge
    (1.10, 0.0, 0.0),  # the lip's upper edge
    (1.12, 0.03, 0.03),  # brief 1: the flat lids
]
LID = up(1.12)
BOTTOM = up(0.30)
END_ROLL = (2.30, 0.08)  # brief 2: from this |x| the lids and the lip roll down to 8 cm lower at the ends
ROLL_FROM = up(0.85)

COWL_X = 0.95  # brief 10: the windshield foot over the door's front seam
HEADER_X = 0.45  # brief 11; at 0.38 no deck item beside the cab fits behind the glass on the view's 0.1 m shift steps
HEADER_Z = up(1.58)  # brief 11: the header strut's center, its top at 1.60 m
SHIELD_HALF = (0.93, 0.80)  # the photo's windshield reaches nearly to the sides at its foot and wraps in to the header  # the windshield's half width at the foot and at the header
VENT_POST_X = 0.50
VENT_TOP = up(1.40)

OPEN_HALF = 0.76  # DV3: the cockpit opening's half width, leaving 0.3 m door tops
OPEN_FRONT = 0.93
OPEN_BACK = -0.29
OPEN_CORNER = (0.06, 0.16)  # the opening's plan corner radius at the front and at the back
COCKPIT_FLOOR = up(0.40)
DASH = (0.70, up(0.78), up(1.09))  # back x, bottom and top of the dash under the windshield
SHELF = (-0.12, -0.12, up(1.13))  # DV6: the passenger side's dash runs back flush over the seat as one shelf, to the seat back,
# from y -0.12 out, level with the passenger's seat back, so the deck cells beside the cab have one level to rest on
WHEEL_CENTER = (0.55, 0.40, up(1.17))  # the steering wheel in front of the driver, on the left
STEER_R = 0.19
STEER_TILT = math.radians(55)  # the wheel's plane from level
FRONT_SEATS = ((0.32, -0.12), 0.38, 0.26, up(0.70), up(1.17))  # cushion x span, seat y, half width, cushion top, back top
SEAT_BACK = 0.12

BOOT = (-0.29, -0.97, up(1.23), 0.80)  # inferred: the folded top's boot, front x, back x, top and half width; it ends
# at the cab rows' back edge so the deck cells behind it rest flat on the lid, and covers the rear seat from row 5's front

DOOR_FRONT = 0.90
DOOR_BACK = -0.55
HEADLAMP_Z = up(0.79)  # brief 3
HEADLAMP_Y = (0.54, 0.755)  # brief 6: two lamps a side
HEADLAMP_R = 0.093  # brief 6: a 5 3/4 inch lamp times 1.278
BEZEL_R = 0.13
BEZEL_Y = (0.43, 0.86)
RECESS = 0.045  # the bezel plane stands this far behind the face at the bezel's inner end, so its outer end stays inside the corner
STRIP_Z = up(0.81)  # brief 4
FRONT_BUMPER = (up(0.53), 0.06)  # brief 5: center height and half height
TAIL_Z = up(0.76)  # brief 7, read again: the rear-left photo puts the lamps just under the lip, over the bumper
TAIL_Y = (0.46, 0.67)  # brief 7: two taillights a side
TAIL_R = 0.07
TAIL_RING = 0.02
REAR_BUMPER = (up(0.55), 0.055)  # brief 8, read again: the bumper's top stands right under the lamps
BUMPER_FRONT = 2.92  # the bumpers' middles stand 2 cm proud of the lip, as in both photos
BUMPER_WRAP = 0.035  # how far the wrapped ends stand off the sides
MESH = (up(0.36), up(0.45), 0.62)  # the mesh outlet's bottom, top and half width under the rear bumper

ENGINE_X = -1.8356  # PHYSICS.bodies.convertible.engine.x
ENGINE_Y = 0.2  # -PHYSICS.bodies.convertible.engine.z
ENGINE_HALF = (0.4356, 0.3)  # the drawn engine: restOn() of the engine cells, over the bay floor
HOLE_MARGIN = 0.02
HOLE = ((ENGINE_X - ENGINE_HALF[0] - HOLE_MARGIN, ENGINE_Y - ENGINE_HALF[1] - HOLE_MARGIN), (ENGINE_X + ENGINE_HALF[0] + HOLE_MARGIN, ENGINE_Y + ENGINE_HALF[1] + HOLE_MARGIN))
FLOOR = LID - 0.06  # PHYSICS.bodies.convertible.engine.y: the slat tops of the shallow bay
MAX_BAY_DEPTH = 0.2
SLAT_PITCH = 0.055
SPINE_Y = -0.16  # the rear lid's spine between the banks, right of the engine hole
RIGHT_BANK = (-0.20, -0.84)


def layer(height: float) -> tuple[float, float]:
    """The side and end insets of the section at a height over the ground, between its rows."""
    for (h0, s0, e0), (h1, s1, e1) in zip(SECTION, SECTION[1:]):
        if h0 <= height <= h1:
            t = (height - h0) / (h1 - h0)
            return s0 + (s1 - s0) * t, e0 + (e1 - e0) * t
    raise ValueError(f"height {height} lies outside the section")


def corner_of(side: float, end: float) -> tuple[float, float, float]:
    """The plan of a ring inset by side and end: its corner line x, half width and corner radius."""
    return CORNER_X - end, HALF_W - side, max(0.05, CORNER_R - min(side, end))


def half_outline(side: float, end: float) -> list[tuple[float, float]]:
    """The left half of a plan ring, from the middle of the nose round the left side to the middle of the tail."""
    cx, half, r = corner_of(side, end)
    flat = half - r
    nose = [(cx + BOW * (1 - (k / BOW_STEPS) ** 2), flat * k / BOW_STEPS) for k in range(BOW_STEPS + 1)]
    nose += [(cx - r + r * math.cos(math.pi / 2 * k / ARC_STEPS), flat + r * math.sin(math.pi / 2 * k / ARC_STEPS)) for k in range(1, ARC_STEPS + 1)]
    sides = [(x, half) for x in SIDE_STATIONS if -(cx - r) < x < cx - r]
    return nose + sides + [(-x, y) for x, y in reversed(nose)]


def plan_ring(side: float, end: float, z: float) -> list[Vec3]:
    """One closed plan ring round the body at height z: the left half from nose to tail, then the right half back."""
    left = half_outline(side, end)
    right = [(x, -y) for x, y in reversed(left[1:-1])]
    return [(x, y, z) for x, y in left + right]


def end_x(y: float, height: float) -> float:
    """The x of the nose face at y and a height over the ground. The tail is its mirror."""
    side, end = layer(height)
    cx, half, r = corner_of(side, end)
    flat = half - r
    a = abs(y)
    if a <= flat:
        return cx + BOW * (1 - (a / flat) ** 2)
    return cx - r + math.sqrt(max(0.0, r * r - (a - flat) ** 2))


def side_y(height: float) -> float:
    return HALF_W - layer(height)[0]


def nose_normal(y: float, height: float) -> Vector:
    dy, dh = 0.01, 0.02
    dxdy = (end_x(y + dy, height) - end_x(y - dy, height)) / (2 * dy)
    dxdz = (end_x(y, height + dh) - end_x(y, height - dh)) / (2 * dh)
    return Vector((1.0, -dxdy, -dxdz)).normalized()


def rolled(x: float, z: float) -> float:
    """z after the ends roll down: the lids and the lip drop toward the nose and the tail, the lower body stays."""
    t = (abs(x) - END_ROLL[0]) / (NOSE_X - END_ROLL[0])
    if t <= 0 or z <= ROLL_FROM:
        return z
    return z - END_ROLL[1] * min(1.0, t) ** 2 * min(1.0, (z - ROLL_FROM) / (LID - ROLL_FROM))


def add_hull(kit: Kit, name: str, points: list[Vec3], mat: str) -> bpy.types.Object:
    obj = hull_mesh(name, points)
    return kit._add(obj, name, mat, 0.0)


def facing(normal: Vector) -> tuple[float, float, float]:
    return tuple(Vector((0, 0, 1)).rotation_difference(normal).to_euler())


def strip_cap(bm: bmesh.types.BMesh, ring: list[bmesh.types.BMVert]) -> None:
    """Closes a plan ring with quads across the body, left point to its mirror on the right, so no face is a long sliver."""
    half = len(ring) // 2 + 1
    left = ring[:half]
    right = [ring[0]] + list(reversed(ring[half:])) + [ring[half - 1]]
    for k in range(half - 1):
        verts = [left[k], left[k + 1], right[k + 1], right[k]]
        unique = [v for i, v in enumerate(verts) if v not in verts[:i]]
        bm.faces.new(unique)


def body_loft(kit: Kit, rings: list[list[Vec3]]) -> bpy.types.Object:
    """Joins the plan rings into one closed body, capped top and bottom by strips across it, with the ends rolled down."""
    mesh = bpy.data.meshes.new("body")
    bm = bmesh.new()
    loops = [[bm.verts.new((x, y, rolled(x, z))) for x, y, z in ring] for ring in rings]
    n = len(loops[0])
    strip_cap(bm, loops[0])
    strip_cap(bm, loops[-1])
    for a, b in zip(loops, loops[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("body", mesh)
    bpy.context.scene.collection.objects.link(obj)
    return kit._add(obj, "body", "paint", 0.0)


def rounded_rect(x0: float, x1: float, half: float, front_r: float, back_r: float, steps: int = 6) -> list[tuple[float, float]]:
    """A plan outline from x0 (back) to x1 (front), half wide, with round corners of front_r and back_r."""
    pts: list[tuple[float, float]] = []
    for cx, r, a0 in ((x1 - front_r, front_r, 0.0), (x0 + back_r, back_r, math.pi / 2)):
        for k in range(steps + 1):
            a = a0 + math.pi / 2 * k / steps
            pts.append((cx + r * math.cos(a), half - r + r * math.sin(a)))
    return pts + [(x, -y) for x, y in reversed(pts)]


def opening_cutter() -> list[Vec3]:
    outline = rounded_rect(OPEN_BACK, OPEN_FRONT, OPEN_HALF, *OPEN_CORNER)
    return [(x, y, z) for x, y in outline for z in (COCKPIT_FLOOR, LID + 1.0)]


def bay_box() -> tuple[Vec3, Vec3]:
    (x0, y0), (x1, y1) = HOLE
    return ((x0, y0, FLOOR - 0.03), (x1, y1, LID + 0.2))


def body(kit: Kit) -> None:
    """The lofted body from the rocker to the lids, with the arches, the cockpit and the engine hole cut in."""
    obj = body_loft(kit, [plan_ring(side, end, up(height)) for height, side, end in SECTION])
    check_round("arch", ROUND_SEGMENTS, ROUND_SEGMENTS)
    arch_cut(obj, WHEELS_X, HUB_Z, WHEEL_R, WELL_Y, BOTTOM, ROUND_SEGMENTS)
    cut_hulls(obj, [opening_cutter()] + bezel_cutters())
    cut_boxes(obj, [bay_box()])
    for i, wx in enumerate(WHEELS_X):
        r0 = ARCH_R
        outer = [(wx + r0 * math.cos(math.pi * k / ROUND_SEGMENTS), HUB_Z + r0 * math.sin(math.pi * k / ROUND_SEGMENTS)) for k in range(ROUND_SEGMENTS + 1)]
        inner = [(wx + (r0 - 0.025) * math.cos(math.pi * k / ROUND_SEGMENTS), HUB_Z + (r0 - 0.025) * math.sin(math.pi * k / ROUND_SEGMENTS)) for k in range(ROUND_SEGMENTS + 1)]
        for s, sy in (("l", 1), ("r", -1)):
            y0, y1 = sy * WELL_Y, sy * (side_y(0.8) - 0.01)
            prism(kit, f"well{i}_{s}", outer + list(reversed(inner)), min(y0, y1), max(y0, y1), "under")


def arch_lips(kit: Kit) -> None:
    """A thin chrome lip round each arch on the side face."""
    check_round("arch_lip", ROUND_SEGMENTS, ROUND_SEGMENTS)
    r = ARCH_R + 0.012
    for i, wx in enumerate(WHEELS_X):
        for s, sy in (("l", 1), ("r", -1)):
            pts = []
            for k in range(ROUND_SEGMENTS + 1):
                a = math.pi * k / ROUND_SEGMENTS
                z = HUB_Z + r * math.sin(a)
                pts.append((wx + r * math.cos(a), sy * (side_y(z - GROUND) + 0.004), z))
            for k, (a, b) in enumerate(zip(pts, pts[1:])):
                strut(kit, f"arch_lip{i}_{k}_{s}", a, b, 0.024, "metal_light")


def lids(kit: Kit) -> None:
    """The faint spine down the rear lid between the louver banks. The front lid's spine is left off: at game zoom
    the crease shading drew it as a dark stripe."""
    (x0, _), (x1, _) = HOLE
    kit.box("rear_spine", (x1 - x0, 0.04, 0.012), ((x0 + x1) / 2, SPINE_Y, LID + 0.004), "paint")


def rocker(kit: Kit) -> None:
    """A thin chrome strip along the rocker roll between the arches."""
    height = 0.37
    half = WHEEL_X - ARCH_R - 0.08
    for s, sy in (("l", 1), ("r", -1)):
        kit.box(f"rocker_{s}", (2 * half, 0.02, 0.035), (0, sy * (side_y(height) + 0.004), up(height)), "metal_light")


def doors(kit: Kit) -> None:
    """One long door a side: seams on the side from the roll-under to the lip, and a chrome handle under the lip."""
    low = up(0.40)
    check_door_gap("door", DOOR_FRONT, DOOR_BACK, low, WHEELS_X, HUB_Z, ARCH_R)
    heights = [0.40, 0.46, 0.80, 1.04]
    for s, sy in (("l", 1), ("r", -1)):
        for i, x in enumerate((DOOR_FRONT, DOOR_BACK)):
            pts = [(x, sy * (side_y(h) + 0.003), up(h)) for h in heights]
            for k, (a, b) in enumerate(zip(pts, pts[1:])):
                strut(kit, f"door_seam{i}_{k}_{s}", a, b, 0.016, "under")
        kit.box(f"handle_{s}", (0.14, 0.025, 0.03), (DOOR_BACK + 0.17, sy * (side_y(0.97) + 0.01), up(0.97)), "metal_light")


def stadium(y0: float, y1: float, z: float, r: float, x: float, depth: float, sides: int) -> list[Vec3]:
    """The points of a horizontal pill from y0 to y1 at height z, r tall, standing depth deep behind x."""
    pts: list[Vec3] = []
    half = sides // 2
    for cy, a0 in ((y1 - r, -math.pi / 2), (y0 + r, math.pi / 2)):
        for k in range(half + 1):
            a = a0 + math.pi * k / half
            for px in (x, x - depth):
                pts.append((px, cy + r * math.cos(a), z + r * math.sin(a)))
    return pts


def bezel_plane() -> float:
    return end_x(BEZEL_Y[0], HEADLAMP_Z - GROUND) - RECESS


def bezel_cutters() -> list[list[Vec3]]:
    """The pill-shaped recesses in the nose face that the headlamp bezels sit in."""
    plane = bezel_plane()
    return [stadium(sy * BEZEL_Y[0] if sy > 0 else -BEZEL_Y[1], BEZEL_Y[1] if sy > 0 else -BEZEL_Y[0], HEADLAMP_Z, BEZEL_R + 0.01, NOSE_X + 0.2, NOSE_X + 0.2 - plane, ROUND_SEGMENTS) for sy in (1, -1)]


def nose(kit: Kit) -> list[str]:
    """The nose face: two lamps a side in a chrome bezel sunk into the face, the chrome strip and badge, the parking lamps.

    Returns the headlamp names, for check_features().
    """
    lamps: list[str] = []
    plane = bezel_plane()
    for s, sy in (("l", 1), ("r", -1)):
        lo, hi = sorted((sy * BEZEL_Y[0], sy * BEZEL_Y[1]))
        check_round("bezel", ROUND_SEGMENTS, SMALL_ROUND_SEGMENTS)
        add_hull(kit, f"bezel_{s}", stadium(lo, hi, HEADLAMP_Z, BEZEL_R, plane + 0.042, 0.042, ROUND_SEGMENTS), "metal_light")
        add_hull(kit, f"bezel_back_{s}", stadium(lo + 0.02, hi - 0.02, HEADLAMP_Z, BEZEL_R - 0.02, plane + 0.046, 0.01, ROUND_SEGMENTS), "under")
        for i, y in enumerate(HEADLAMP_Y):
            at = (plane + 0.05, sy * y, HEADLAMP_Z)
            name = f"headlamp{i}_{s}"
            check_round(name, ROUND_SEGMENTS, ROUND_SEGMENTS)
            kit.cylinder(f"{name}_ring", HEADLAMP_R + 0.01, 0.012, at, "metal_light", rot=(0, math.pi / 2, 0), vertices=ROUND_SEGMENTS)
            kit.cylinder(name, HEADLAMP_R, 0.012, (at[0] + 0.004, at[1], at[2]), "light", rot=(0, math.pi / 2, 0), vertices=ROUND_SEGMENTS)
            lamps.append(name)
        face = plane
        mid = sy * (HEADLAMP_Y[0] + HEADLAMP_Y[1]) / 2
        for k in (-1, 0, 1):
            kit.box(f"lamp_bar{k}_{s}", (0.012, 0.008, 2 * HEADLAMP_R * 0.9), (face + 0.05, mid + k * 0.012, HEADLAMP_Z), "metal_light")
        park_y = sy * (HEADLAMP_Y[0] + HEADLAMP_Y[1]) / 2
        park_h = 0.62
        kit.box(f"parking_{s}", (0.03, 0.17, 0.045), (end_x(park_y, park_h) + 0.005, park_y, up(park_h)), "amber")
    strip_h = STRIP_Z - GROUND
    reach = BEZEL_Y[0] + 0.01
    ys = [reach * k / 4 for k in range(-4, 5)]
    pts = [(end_x(y, strip_h) + 0.012, y, STRIP_Z) for y in ys]
    for k, (a, b) in enumerate(zip(pts, pts[1:])):
        strut(kit, f"nose_strip{k}", a, b, 0.03, "metal_light")
    front = end_x(0, strip_h) + 0.02
    for s, sy in (("l", 1), ("r", -1)):
        strut(kit, f"badge_wing_{s}", (front, sy * 0.13, STRIP_Z + 0.015), (front + 0.01, 0, STRIP_Z - 0.035), 0.03, "metal_light")
    check_round("emblem", SMALL_ROUND_SEGMENTS, SMALL_ROUND_SEGMENTS)
    emblem_h = 0.93
    kit.cylinder("emblem", 0.035, 0.02, (end_x(0, emblem_h) + 0.008, 0, up(emblem_h)), "metal_light", rot=(0, math.pi / 2, 0), vertices=SMALL_ROUND_SEGMENTS)
    return lamps


def tail(kit: Kit) -> list[str]:
    """The tail face: two round taillights a side in chrome rings and the plate panel in a chrome frame.

    Returns the taillight names, for check_features().
    """
    height = TAIL_Z - GROUND
    lamps: list[str] = []
    for s, sy in (("l", 1), ("r", -1)):
        for i, y in enumerate(TAIL_Y):
            n = nose_normal(sy * y, height)
            normal = Vector((-n.x, n.y, n.z))
            at = Vector((-end_x(sy * y, height), sy * y, TAIL_Z))
            name = f"taillight{i}_{s}"
            check_round(name, ROUND_SEGMENTS, ROUND_SEGMENTS)
            kit.cylinder(f"{name}_ring", TAIL_R + TAIL_RING, 0.04, tuple(at + normal * 0.004), "metal_light", rot=facing(normal), vertices=ROUND_SEGMENTS)
            kit.cylinder(name, TAIL_R, 0.04, tuple(at + normal * 0.012), "red", rot=facing(normal), vertices=ROUND_SEGMENTS)
            lamps.append(name)
    back = -end_x(0, height)
    kit.box("plate_frame", (0.03, 0.36, 0.2), (back - 0.006, 0, TAIL_Z), "metal_light")
    kit.box("plate", (0.03, 0.32, 0.16), (back - 0.012, 0, TAIL_Z), "under")
    return lamps


def bumper_path(height: float, reach: float, sign: float) -> list[tuple[Vector, Vector]]:
    """Points and outward normals of the face along the nose (sign 1) or the tail (sign -1) at a height, wrapping round
    the corners and back along the sides as far as reach behind the corners."""
    side, end = layer(height)
    cx, _, r = corner_of(side, end)
    left = [p for p in half_outline(side, end) if p[0] >= cx - r - reach]
    path = [(x, -y) for x, y in reversed(left[1:])] + left
    out: list[tuple[Vector, Vector]] = []
    for i, (x, y) in enumerate(path):
        ax, ay = path[max(0, i - 1)]
        bx, by = path[min(len(path) - 1, i + 1)]
        normal = Vector((by - ay, -(bx - ax), 0)).normalized()
        if normal.x < 0 or (abs(normal.x) < 1e-6 and normal.y * y < 0):
            normal = -normal
        out.append((Vector((sign * x, y, 0)), Vector((sign * normal.x, normal.y, 0))))
    return out


def bumper(kit: Kit, name: str, center: float, half_h: float, sign: float) -> None:
    """A chrome wrap bumper across the nose or the tail and round its corners, its middle at BUMPER_FRONT and its
    wrapped ends close to the sides."""
    height = center - GROUND
    path = bumper_path(height, 0.42, sign)
    proud = BUMPER_FRONT - end_x(0, height)
    rings: list[list[Vec3]] = []
    for p, n in path:
        reach = BUMPER_WRAP + (proud - BUMPER_WRAP) * max(0.0, abs(n.x)) ** 2
        ring = []
        for out, dz in ((0.0, half_h), (reach - 0.02, half_h * 0.7), (reach, 0.0), (reach - 0.02, -half_h * 0.7), (0.0, -half_h)):
            q = p + n * out
            ring.append((q.x, q.y, center + dz))
        rings.append(ring)
    loft(kit, name, rings, "metal_light")


def mesh_outlet(kit: Kit) -> None:
    """The dark mesh outlet in two halves under the rear bumper, in a chrome surround."""
    lo, hi, half = MESH
    height = (lo + hi) / 2 - GROUND
    back = -end_x(0, height)
    kit.box("mesh_frame", (0.03, 2 * half + 0.04, hi - lo + 0.03), (back - 0.01, 0, (lo + hi) / 2), "metal_light")
    for s, sy in (("l", 1), ("r", -1)):
        kit.box(f"mesh_{s}", (0.03, half - 0.04, hi - lo - 0.01), (back - 0.022, sy * (half / 2 + 0.01), (lo + hi) / 2), "under")


def windshield_point(t: float, y_share: float) -> Vector:
    """A point on the windshield plane: t 0 at the foot, 1 at the header; y_share of its half width there."""
    x = COWL_X + (HEADER_X - COWL_X) * t
    z = LID + (HEADER_Z - LID) * t
    half = SHIELD_HALF[0] + (SHIELD_HALF[1] - SHIELD_HALF[0]) * t
    return Vector((x, half * y_share, z))


def windshield(kit: Kit) -> None:
    """The raked windshield in a thin chrome frame: A-pillars, a header, a cowl strip and a vent window frame a side."""
    corners: list[Vec3] = []
    for t in (0.02, 0.97):
        for ys in (0.97, -0.97):
            p = windshield_point(t, ys)
            corners += [tuple(p), tuple(p + Vector((0.008, 0, 0.008)))]
    add_hull(kit, "windshield", corners, "glass")
    for s, sy in (("l", 1), ("r", -1)):
        strut(kit, f"a_pillar_{s}", tuple(windshield_point(0, sy) + Vector((0, 0, 0.01))), tuple(windshield_point(1, sy)), 0.04, "metal_light")
        pillar_t = (VENT_TOP - LID) / (HEADER_Z - LID)
        top = windshield_point(pillar_t, sy)
        post_foot = (VENT_POST_X, top.y, LID + 0.01)
        post_top = (VENT_POST_X, top.y, VENT_TOP)
        strut(kit, f"vent_post_{s}", post_foot, post_top, 0.035, "metal_light")
        strut(kit, f"vent_top_{s}", post_top, tuple(top), 0.035, "metal_light")
        pane = [tuple(windshield_point(0.03, sy)), tuple(top), post_top, post_foot]
        add_hull(kit, f"vent_glass_{s}", [p for x, y, z in pane for p in ((x, y - sy * 0.004, z), (x, y + sy * 0.004, z))], "glass")
    strut(kit, "header", tuple(windshield_point(1, 1)), tuple(windshield_point(1, -1)), 0.04, "metal_light")
    strut(kit, "cowl", (COWL_X + 0.02, SHIELD_HALF[0], LID + 0.012), (COWL_X + 0.02, -SHIELD_HALF[0], LID + 0.012), 0.03, "metal_light")


def tilted_box(kit: Kit, name: str, x_front: float, x_back: float, half: float, y: float, bottom: float, top: float, lean: float, mat: str) -> None:
    """A seat back: a slab from bottom to top whose top leans lean back in x."""
    pts = []
    for z, shift in ((bottom, 0.0), (top, lean)):
        for x in (x_front - shift, x_back - shift):
            for side in (-1, 1):
                pts.append((x, y + side * half, z))
    add_hull(kit, name, pts, mat)


def cockpit(kit: Kit) -> None:
    """The open cockpit: liners, floor, dash and steering wheel in the dark under color, and in leather the driver's seat,
    the passenger's shelf run flush with the dash over the seat and both seat backs, so the seats read in the dark."""
    length = OPEN_FRONT - OPEN_BACK
    kit.box("cockpit_floor", (length - 0.02, 2 * OPEN_HALF - 0.02, 0.02), ((OPEN_FRONT + OPEN_BACK) / 2, 0, COCKPIT_FLOOR + 0.01), "under")
    for s, sy in (("l", 1), ("r", -1)):
        kit.box(f"liner_{s}", (length - 0.2, 0.012, LID - COCKPIT_FLOOR - 0.012), ((OPEN_FRONT + OPEN_BACK) / 2, sy * (OPEN_HALF - 0.007), (LID + COCKPIT_FLOOR) / 2 - 0.006), "under")
        kit.box(f"belt_{s}", (length - 0.25, 0.022, 0.008), ((OPEN_FRONT + OPEN_BACK) / 2 - 0.02, sy * (OPEN_HALF + 0.012), LID + 0.003), "metal_light")
    kit.box("liner_back", (0.012, 2 * OPEN_HALF - 0.3, LID - COCKPIT_FLOOR - 0.012), (OPEN_BACK + 0.007, 0, (LID + COCKPIT_FLOOR) / 2 - 0.006), "under")
    dash_x, dash_low, dash_top = DASH
    kit.box("dash", (OPEN_FRONT - dash_x, 2 * OPEN_HALF - 0.02, dash_top - dash_low), ((OPEN_FRONT + dash_x) / 2, 0, (dash_top + dash_low) / 2), "under")
    shelf_x, shelf_y, shelf_top = SHELF
    shelf_w = OPEN_HALF - 0.01 + shelf_y
    kit.box("dash_shelf", (OPEN_FRONT - shelf_x, shelf_w, shelf_top - COCKPIT_FLOOR), ((OPEN_FRONT + shelf_x) / 2, shelf_y - shelf_w / 2, (shelf_top + COCKPIT_FLOOR) / 2), "leather")
    steering_wheel(kit)
    (cx0, cx1), seat_y, half, cushion, back_top = FRONT_SEATS
    for s, sy in (("l", 1), ("r", -1)):
        if sy > 0:
            kit.box(f"seat_{s}", (cx0 - cx1, 2 * half, cushion - COCKPIT_FLOOR), ((cx0 + cx1) / 2, sy * seat_y, (cushion + COCKPIT_FLOOR) / 2), "leather")
        top = back_top if sy > 0 else SHELF[2]
        tilted_box(kit, f"seat_back_{s}", cx1, cx1 - SEAT_BACK, half, sy * seat_y, cushion - 0.05, top, 0.0, "leather")


def steering_wheel(kit: Kit) -> None:
    """A large thin round steering wheel on a column from the dash, its plane tilted toward the driver."""
    check_round("steering_wheel", ROUND_SEGMENTS, ROUND_SEGMENTS)
    cx, cy, cz = WHEEL_CENTER
    center = Vector((cx, cy, cz))
    u = Vector((0, 1, 0))
    v = Vector((math.cos(STEER_TILT), 0, math.sin(STEER_TILT)))
    rim = [center + STEER_R * (math.cos(2 * math.pi * k / ROUND_SEGMENTS) * u + math.sin(2 * math.pi * k / ROUND_SEGMENTS) * v) for k in range(ROUND_SEGMENTS)]
    for k in range(ROUND_SEGMENTS):
        strut(kit, f"steer_rim{k}", tuple(rim[k]), tuple(rim[(k + 1) % ROUND_SEGMENTS]), 0.022, "under")
    for k, a in enumerate((0.0, math.pi)):
        strut(kit, f"steer_spoke{k}", tuple(center), tuple(center + STEER_R * (math.cos(a) * u + math.sin(a) * v)), 0.02, "under")
    axis = u.cross(v).normalized()
    if axis.x < 0:
        axis = -axis
    strut(kit, "steer_column", tuple(center), tuple(center + axis * 0.25), 0.04, "under")


def folded_top(kit: Kit) -> None:
    """The folded top on its boot over the rear seat: a low padded roll in the trim color, rounded at its ends."""
    front, back, top, half = BOOT
    profile = [(front, LID - 0.01), (front - 0.005, top - 0.045), (front - 0.02, top - 0.016), (front - 0.045, top - 0.004), (front - 0.08, top)]
    profile += [(front + back - x, z) for x, z in reversed(profile)]
    mid_x = (front + back) / 2

    def ring(y: float, shrink: float) -> list[Vec3]:
        crown = 1 - 0.25 * (y / half) ** 2
        return [(mid_x + (x - mid_x) * shrink, y, LID - 0.01 + (z - LID + 0.01) * shrink * crown) for x, z in profile]

    stations = [(-half, 0.45), (-half + 0.04, 0.8), (-half + 0.1, 1.0), (-half / 2, 1.0), (0.0, 1.0), (half / 2, 1.0), (half - 0.1, 1.0), (half - 0.04, 0.8), (half, 0.45)]
    loft(kit, "folded_top", [ring(y, k) for y, k in stations], "trim")
    for s, sy in (("l", 1), ("r", -1)):
        kit.box(f"vent_{s}", (0.04, 0.22, 0.03), (back - 0.035, sy * 0.36, LID + 0.012), "metal_light")
    kit.box("top_belt", (0.025, 2 * half, 0.01), (back - 0.005, 0, LID + 0.004), "metal_light")


def check_hole() -> None:
    """Raises when the engine hole does not hold the drawn engine with its margin, sits too deep, or leaves the rear lid."""
    (x0, y0), (x1, y1) = HOLE
    ex0, ex1 = ENGINE_X - ENGINE_HALF[0], ENGINE_X + ENGINE_HALF[0]
    ey0, ey1 = ENGINE_Y - ENGINE_HALF[1], ENGINE_Y + ENGINE_HALF[1]
    if min(ex0 - x0, x1 - ex1, ey0 - y0, y1 - ey1) < HOLE_MARGIN - 1e-6 or max(ex0 - x0, x1 - ex1, ey0 - y0, y1 - ey1) > HOLE_MARGIN + 1e-6:
        raise RuntimeError(f"engine hole x {x0:.3f}..{x1:.3f} y {y0:.3f}..{y1:.3f} is not the engine x {ex0:.3f}..{ex1:.3f} y {ey0:.3f}..{ey1:.3f} plus {HOLE_MARGIN}")
    if x1 >= BOOT[1] - 0.04 or x0 <= -END_ROLL[0] or max(abs(y0), abs(y1)) >= side_y(1.12) - 0.2:
        raise RuntimeError(f"engine hole x {x0:.3f}..{x1:.3f} y {y0:.3f}..{y1:.3f} leaves the rear lid")
    if LID - FLOOR > MAX_BAY_DEPTH + 1e-6:
        raise RuntimeError(f"engine bay floor {LID - FLOOR:.3f} m under the lid, deeper than {MAX_BAY_DEPTH}")


def check_tires() -> None:
    """Raises when a tire's outer face is not flush with the side at hub height, or reaches the solid body inside the well."""
    side = side_y(HUB_Z - GROUND)
    if abs(WHEEL_Z + WHEEL_HALF_W - side) > 0.02:
        raise RuntimeError(f"tire face at y {WHEEL_Z + WHEEL_HALF_W:.3f} is not flush with the side at {side:.3f}")
    if WHEEL_Z - WHEEL_HALF_W <= WELL_Y:
        raise RuntimeError(f"tire inner face at y {WHEEL_Z - WHEEL_HALF_W:.3f} reaches the well wall at {WELL_Y:.3f}")


def check_features(headlamps: list[str], taillights: list[str]) -> None:
    """Raises when the photo's features drift: two headlamps and two taillights a side, and door tops at least 0.25 m wide."""
    for name, lamps in (("headlamps", headlamps), ("taillights", taillights)):
        for s in ("l", "r"):
            count = sum(1 for lamp in lamps if lamp.endswith(f"_{s}"))
            if count != 2:
                raise RuntimeError(f"{count} {name} on side {s}, the photos show 2")
    shoulder = side_y(1.12) - OPEN_HALF
    if shoulder < 0.25 - 1e-6:
        raise RuntimeError(f"door tops {shoulder:.3f} m wide, under 0.25")


def louvers(kit: Kit) -> None:
    """The two louver banks on the rear lid: the engine hole's slatted floor on the left and slats on the lid on the right."""
    check_hole()
    (x0, y0), (x1, y1) = HOLE
    kit.box("bay_floor", (x1 - x0, y1 - y0, 0.02), ((x0 + x1) / 2, (y0 + y1) / 2, FLOOR - 0.025), "under")
    count = int((x1 - x0 - 0.02) / SLAT_PITCH)
    for i in range(count):
        x = x1 - 0.01 - SLAT_PITCH * (i + 0.5)
        kit.box(f"bay_slat{i}", (SLAT_PITCH * 0.55, y1 - y0 - 0.004, 0.02), (x, (y0 + y1) / 2, FLOOR - 0.01), "paint")
        kit.box(f"lid_slat{i}", (SLAT_PITCH * 0.5, RIGHT_BANK[0] - RIGHT_BANK[1], 0.006), (x, sum(RIGHT_BANK) / 2, LID + 0.003), "paint")
        kit.box(f"lid_gap{i}", (SLAT_PITCH * 0.3, RIGHT_BANK[0] - RIGHT_BANK[1] - 0.02, 0.002), (x - SLAT_PITCH * 0.45, sum(RIGHT_BANK) / 2, LID + 0.001), "under")


def main() -> None:
    args = parse_args()
    kit = Kit(COLORS, SEED)
    check_tires()
    body(kit)
    arch_lips(kit)
    lids(kit)
    rocker(kit)
    doors(kit)
    headlamps = nose(kit)
    taillights = tail(kit)
    bumper(kit, "front_bumper", *FRONT_BUMPER, 1)
    bumper(kit, "rear_bumper", *REAR_BUMPER, -1)
    mesh_outlet(kit)
    windshield(kit)
    cockpit(kit)
    folded_top(kit)
    louvers(kit)
    check_features(headlamps, taillights)
    bay = {(x, y): FLOOR for x in (1, 2) for y in (6, 7)}
    shoulders = {(x, y): LID for x in (0, 4) for y in (3, 4, 5)}
    seats = {(3, y): FRONT_SEATS[3] for y in (3, 4, 5)}
    level_sockets(kit, G, "row", [LID] * 3 + [BOOT[2]] * 3 + [LID] * 3, fronts={3: COWL_X}, cells={**bay, **shoulders, **seats})
    level_sockets(kit, G, "floor", [LID - 0.5] * 3 + [COCKPIT_FLOOR] * 3 + [FLOOR] * 2 + [LID])
    kit.socket("arch_front", (WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (-WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEEL_X, WHEEL_Z, HUB_Z + ARCH_R))
    check_base(kit, "base_convertible", G)
    kit.export("base_convertible", args, view_size=7.0)


if __name__ == "__main__":
    main()
