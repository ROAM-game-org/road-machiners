"""The convertible base: a stylized 1964 Chevrolet Corvair Monza convertible with its top up, rebuilt as a steel hardtop.

Measured from two photographs of a red 1964 Monza convertible (front left and rear left, MercurySable99, CC BY-SA 4.0,
Wikimedia Commons) and sized from the published specs at 1.278 scale, so it keeps its 5.84 m game length: 2.17 m
across the lid lip, a 3.5 m wheelbase, 1.60 m to the windshield header and 1.66 m to the crown on its tires. The ground
is 1.05 m below the center. The body is one loft of plan rings from the rocker to the lids, squared off at the ends
with 0.32 m plan corners. One lid lip wraps the nose, the sides and the tail 1.06-1.10 m over the ground, with a
shadow line under it, and the flat lids lie 1.12 m up, rolling down 8 cm at the nose and the tail. Under the lip the
side stands nearly upright and rolls under to the rocker.
The nose face holds two round headlamps a side in a horizontal chrome bezel sunk into the face, a full-width chrome
strip with a winged badge between the bezels, an amber parking lamp under each bezel and a chrome wrap bumper.
The raked windshield in a thin chrome frame runs from the cowl at x 0.95 to the header at x 0.45, with a vent window
frame at the front of each door. Behind it the closed cabin keeps the photo's raised top: one loft from the windshield
over a low crown 1.66 m up, flat back to x -0.55, with sides that lean in from a foot 0.79 m off the center line on the
belt to a rain rail 0.73 m off it and round over in two facets, then a long fall that flares onto the rear lid at
x -1.10. A dark side opening a side runs from the vent post to x -0.62 with a thin seam between the door and quarter
glass and no B-pillar, a wide blind quarter runs down into the fall, and a small dark rear window sits in the fall. The
cabin is riveted steel in the faction's second color: two seam ribs cross the crown, one crosses the fall, welded bars
lie level across the side glass and upright over the rear window, a bare patch plate is riveted to the left rear
quarter, and a chrome strip runs along the cabin's foot. A round lookout hatch stands on the crown over the driver's
cab cells, its lid lying open on the crown behind it, clear of the antenna's spot. The door tops are flat shoulders at
lid level. The flat rear lid carries two louver banks: the left one is the engine hole, cut to the engine bay of the chassis.ts layout, rows 10 to 12 and columns 2 and 3, 1.35 m long and 0.9 m wide, over a slatted floor
0.12 m under the lid, and the right one is slats on the lid.
The tail holds two round taillights a side in chrome rings, a dark plate panel in a chrome frame, a chrome wrap bumper
and a dark mesh outlet in two halves under it. One long door a side keeps DOOR_GAP from the arches. Round arches
of 32 edges with chrome lips are cut under the lip, and a chrome strip runs along the rocker.
Deviations from the photos: the top is riveted steel in the faction's second color with seam ribs, a patch plate,
window bars and a lookout hatch, not black fabric; the wheels stay symmetric on the tire rule's tire at the game's
ride; the door tops are thick so the outer deck columns rest flat; the left louver bank is the engine hole over the
grid's engine cells, so a fitted engine stands out of the lid; no mirror, script badges or plate numbers; the fall's
foot is at x -1.10, about 0.26 m ahead of the photo's, so the engine hole keeps the lid behind it; the lid's two small
vents are left off; the
windshield header narrows to 0.74 m a side to meet the cabin's rain rail.
Grid: 5 columns by 9 rows, stretched over the model by the projection. Rows 0 to 2 and 6 to 8 rest on the lids,
the engine cells on the bay floor, columns 0 and 4 of rows 3 to 5 on the door tops, and columns 1 to 3 of rows 3 to 5
on the crown.
Half height 0.35 m, from PHYSICS.bodies.convertible.
Wheels sit at x -+1.75 and y -+0.84, radius 0.45 m, half width 0.18 m, mount 0.2 m below the center.
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
WHEEL_R = 0.45  # PHYSICS.bodies.convertible.wheelRadius
WHEEL_HALF_W = 0.18  # PHYSICS.bodies.convertible.wheelHalfWidth
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
SHIELD_HALF = (0.93, 0.74)  # the windshield's half width at the foot and at the header: it reaches nearly to the sides at
# its foot, as in the photo, and wraps in to meet the cabin's rain rail at the header (brief C4)
VENT_POST_X = 0.50
VENT_TOP = up(1.40)

CABIN_FLOOR = up(0.40)
CROWN = 1.66  # brief C2: the published 1.30 m top-up height times 1.278
FOOT_HALF = 0.79  # brief C4, DV3: the cabin's foot off the center line on the belt, leaving 0.27 m door tops
RAIL = (0.73, 1.56)  # brief C4: the rain rail's half width and height, the sides leaning in 9 deg from the belt
EDGE = (0.67, 0.03)  # brief C4: the first facet of the rounded edge, its half width and drop under the crown
CROWN_HALF = 0.60  # brief C4: the flat crown's half width, the second facet's top
DOME = 0.012  # brief C2: the crown falls this far from the center line to its edge
FULL_FROM = 1.62  # a station whose crown stands this high keeps the full section; lower ones squash toward the lid
CABIN_STATIONS = [  # (x, crown over the ground) from the header back down the fall onto the rear lid
    (None, 1.625),  # brief C1: the front station lies on the windshield plane, its crown just behind the header
    (0.36, 1.645),
    (0.25, 1.655),
    (0.0, 1.66),
    (-0.30, 1.66),
    (-0.55, 1.655),  # brief C3: the flat crown's back end
    (-0.62, 1.635),  # brief C3, C7: the crown's rear corner over the side opening's back end
    (-0.672, 1.60),
    (-0.737, 1.55),  # brief C7: the fall, steep at first
    (-0.795, 1.48),
    (-0.854, 1.40),
    (-0.905, 1.32),
    (-0.957, 1.24),  # brief C7: flaring toward its foot
    (-1.009, 1.18),
    (-1.055, 1.145),
    (-1.10, 1.125),  # brief C7, DV6: the foot on the rear lid, just ahead of the engine hole
]
FOOT_X = CABIN_STATIONS[-1][0]
SIDE_OPENING = [(0.49, 0.04), (0.49, 1.52), (-0.40, 1.52), (-0.50, 1.48), (-0.58, 1.38), (-0.62, 0.04)]  # brief C5:
# the side opening's outline as (x, height over the ground, or over the lid when under 0.1), from the vent post back
GLASS_SEAM_X = -0.30  # brief C5: the thin seam between the door glass and the quarter glass, no B-pillar
REAR_WINDOW = (0.42, 1.52, 1.34)  # brief C8, inferred: half width, top and bottom crown height of the rear window
DRIP_RAIL = (0.36, -0.66)  # brief C4: the chrome drip rail along each rain rail, from behind the header to the quarter,
# so the roof's edge reads from above
FALL_SEAM = 1.24  # inferred: the crown height of the seam across the fall
SIDE_BARS = (1.28, 1.40)  # DV1: the heights of the welded bars across each side opening, level so they read as
# bars and never as a B-pillar
REAR_BARS_Y = (0.14, -0.14)  # DV1: the welded bars over the rear window
PATCH = (-0.66, -0.90, 0.06, 1.42)  # DV1: the bare patch plate on the left rear quarter, x front, x back, bottom over
# the lid, top over the ground
HATCH = (0.25, 0.28, 0.21, 0.165)  # DV1: the lookout hatch over the driver's cab cells, x, y, ring and opening radius
HATCH_LID_BACK = 0.43  # the open lid lies on the crown this far behind the hatch, clear of the antenna's spot

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

GAME = Grid(rows=13, cols=5, half_height=0.35, length=5.85, width=2.25)  # chassis.ts layout inside its border cells
HOLE = ((GAME.row_x(11.5), min(GAME.col_y(0.5), GAME.col_y(2.5))), (GAME.row_x(8.5), max(GAME.col_y(0.5), GAME.col_y(2.5))))  # the engine bay: layout rows 10 to 12, columns 2 and 3
FLOOR = LID - 0.12  # PHYSICS.bodies.convertible.engine.y: the slat tops of the bay, under the lid's roll at the tail
MAX_BAY_DEPTH = 0.2
SLAT_PITCH = 0.11
RIGHT_BANK = (-0.30, -0.84)


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


def bay_box() -> tuple[Vec3, Vec3]:
    (x0, y0), (x1, y1) = HOLE
    return ((x0, y0, FLOOR - 0.03), (x1, y1, LID + 0.2))


def body(kit: Kit) -> None:
    """The lofted body from the rocker to the lids, with the arches, the lamp bezels and the engine hole cut in."""
    obj = body_loft(kit, [plan_ring(side, end, up(height)) for height, side, end in SECTION])
    check_round("arch", ROUND_SEGMENTS, ROUND_SEGMENTS)
    arch_cut(obj, WHEELS_X, HUB_Z, WHEEL_R, WELL_Y, BOTTOM, ROUND_SEGMENTS)
    cut_hulls(obj, bezel_cutters())
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
            kit.box(f"lamp_bar{k}_{s}", (0.01, 0.008, 2 * HEADLAMP_R * 0.9), (face + 0.049, mid + k * 0.012, HEADLAMP_Z), "metal_light")
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
        strut(kit, f"vent_top_{s}", post_top, tuple(top), 0.03, "metal_light")
        pane = [tuple(windshield_point(0.03, sy)), (top.x, top.y, top.z - 0.012), (VENT_POST_X - 0.008, top.y, VENT_TOP - 0.012), (VENT_POST_X - 0.008, top.y, LID - 0.01)]
        add_hull(kit, f"vent_glass_{s}", [p for x, y, z in pane for p in ((x, y - sy * 0.004, z), (x, y + sy * 0.004, z))], "glass")
    strut(kit, "header", tuple(windshield_point(1, 1)), tuple(windshield_point(1, -1)), 0.04, "metal_light")
    strut(kit, "cowl", (COWL_X + 0.02, SHIELD_HALF[0], LID + 0.012), (COWL_X + 0.02, -SHIELD_HALF[0], LID + 0.012), 0.03, "metal_light")


def windshield_x(z: float) -> float:
    """The x of the windshield plane at height z, 1.5 cm behind the glass."""
    return COWL_X + (HEADER_X - COWL_X) * (z - LID) / (HEADER_Z - LID) - 0.015


def cabin_section(crown: float) -> list[tuple[float, float]]:
    """The left half of the cabin's section as (y, z) from the foot on the belt over to the center line. A station
    lower than FULL_FROM is the full section squashed toward the lid, so the fall flares onto it."""
    base = LID - 0.01
    full = [(FOOT_HALF, base), (RAIL[0], up(RAIL[1])), (EDGE[0], up(CROWN - EDGE[1])), (CROWN_HALF, up(CROWN - DOME)), (0.0, up(CROWN))]
    if crown >= FULL_FROM:
        lift = up(crown) - up(CROWN)
        return [full[0], full[1]] + [(y, z + lift) for y, z in full[2:]]
    share = (up(crown) - base) / (up(CROWN) - base)
    return [(y, base + (z - base) * share) for y, z in full]


def shield_half(z: float) -> float:
    """The windshield's half width at height z."""
    t = min(1.0, max(0.0, (z - LID) / (HEADER_Z - LID)))
    return SHIELD_HALF[0] + (SHIELD_HALF[1] - SHIELD_HALF[0]) * t


def cabin_ring(x: float | None, crown: float) -> list[Vec3]:
    """One closed ring of the cabin at station x, left foot over the crown to the right foot. The front station has
    no x: each point lies on the windshield plane and reaches out to its edge, so the cabin backs the whole glass."""
    half = cabin_section(crown)
    if x is None:
        half = [(max(y, shield_half(z) - 0.02) if y > 0 else y, z) for y, z in half]
    points = half + [(-y, z) for y, z in reversed(half[:-1])]
    return [(windshield_x(z) if x is None else x, y, z) for y, z in points]


def rail_z(x: float) -> float:
    """The rain rail's height at x along the cabin."""
    for (x0, c0), (x1, c1) in zip(CABIN_STATIONS[1:], CABIN_STATIONS[2:]):
        if x1 <= x <= x0:
            t = (x0 - x) / (x0 - x1)
            return cabin_section(c0 + (c1 - c0) * t)[1][1]
    return cabin_section(CABIN_STATIONS[1][1])[1][1]


def crown_at(x: float) -> float:
    """The crown's height over the ground at x along the cabin."""
    for (x0, c0), (x1, c1) in zip(CABIN_STATIONS[1:], CABIN_STATIONS[2:]):
        if x1 <= x <= x0:
            return c0 + (c1 - c0) * (x0 - x) / (x0 - x1)
    return CABIN_STATIONS[1][1]


def side_point(x: float, z: float, out: float) -> Vec3:
    """A point on the cabin's left side at x and height z, standing out from it by out."""
    base = LID - 0.01
    top = rail_z(x)
    t = (z - base) / (top - base)
    y = FOOT_HALF + (RAIL[0] - FOOT_HALF) * t
    lean = math.atan2(FOOT_HALF - RAIL[0], top - base)
    return (x, y + out * math.cos(lean), z + out * math.sin(lean))


def mirrored(points: list[Vec3], sy: float) -> list[Vec3]:
    return [(x, sy * y, z) for x, y, z in points]


def cabin(kit: Kit) -> None:
    """The closed cabin: one loft from the windshield back over the low crown and down the long fall onto the rear lid,
    in the trim color, as the riveted steel hardtop that stands in for the soft top."""
    loft(kit, "cabin", [cabin_ring(x, crown) for x, crown in CABIN_STATIONS], "trim")


def opening_height(h: float) -> float:
    return LID + h if h < 0.1 else up(h)


def opening_back(z: float) -> float:
    """The x of the side opening's back edge at height z."""
    back = [(x, opening_height(h)) for x, h in SIDE_OPENING[1:]]
    for (x0, z0), (x1, z1) in zip(back, back[1:]):
        if z1 <= z <= z0:
            return x0 + (x1 - x0) * (z0 - z) / (z0 - z1)
    raise ValueError(f"height {z} lies off the side opening")


def cabin_glass(kit: Kit) -> list[str]:
    """The dark side glass a side, from the vent post back to the blind quarter in one opening with a thin seam and no
    B-pillar, and the small rear window in the fall.

    Returns the side glass names, for check_features().
    """
    names: list[str] = []
    outline = [(x, opening_height(h)) for x, h in SIDE_OPENING]
    for s, sy in (("l", 1), ("r", -1)):
        pane = [side_point(x, z, out) for x, z in outline for out in (0.003, 0.009)]
        add_hull(kit, f"side_glass_{s}", mirrored(pane, sy), "glass")
        names.append(f"side_glass_{s}")
        lo, hi = outline[0][1], outline[1][1]
        strut(kit, f"glass_seam_{s}", mirrored([side_point(GLASS_SEAM_X, lo, 0.008)], sy)[0], mirrored([side_point(GLASS_SEAM_X, hi, 0.008)], sy)[0], 0.014, "trim")
    half, top, bottom = REAR_WINDOW
    corners = [fall_point(y, crown, out) for crown in (top, bottom) for y in (half, -half) for out in (0.004, 0.012)]
    add_hull(kit, "rear_window", corners, "glass")
    return names


def fall_x(crown: float) -> float:
    """The x on the fall where the crown stands at a height."""
    for (x0, c0), (x1, c1) in zip(CABIN_STATIONS[1:], CABIN_STATIONS[2:]):
        if c1 <= crown <= c0 and c1 < c0 and x0 < -0.5:
            return x0 + (x1 - x0) * (c0 - crown) / (c0 - c1)
    raise ValueError(f"crown height {crown} lies off the fall")


def fall_point(y: float, crown: float, out: float) -> Vec3:
    """A point on the fall at y and the crown height of its station, standing out from it by out."""
    x = fall_x(crown)
    dx = fall_x(crown - 0.02) - fall_x(crown + 0.02)
    normal = Vector((-0.04, 0, -dx)).normalized()
    if normal.z < 0:
        normal = -normal
    z = cabin_z(x, y)
    return (x + normal.x * out, y, z + normal.z * out)


def cabin_z(x: float, y: float) -> float:
    """The cabin's top at x and y, inside the crown's facets."""
    pts = sorted(cabin_section(crown_at(x)), key=lambda p: p[0])
    a = abs(y)
    for (y0, z0), (y1, z1) in zip(pts, pts[1:]):
        if y0 <= a <= y1:
            return z0 + (z1 - z0) * (a - y0) / (y1 - y0)
    raise ValueError(f"y {y} lies off the cabin")


def over_cabin(x: float, out: float) -> list[Vec3]:
    """The points across the cabin's crown at x from edge to edge, standing out from it by out."""
    section = cabin_section(crown_at(x))[2:]
    half = section + [(-y, z) for y, z in reversed(section[:-1])]
    return [(x, y * (1 + out), z + out) for y, z in half]


def cabin_finish(kit: Kit) -> None:
    """The wasteland finish on the hardtop: a chrome drip rail along each roof edge, a seam across the fall, welded bars
    over the side and rear glass, a bare patch plate on the left rear quarter, and the chrome strip along the cabin's
    foot."""
    front, back = DRIP_RAIL
    for s, sy in (("l", 1), ("r", -1)):
        pts = [(x, sy * (RAIL[0] + 0.006), rail_z(x) + 0.006) for x in (front, 0.0, -0.40, back)]
        for k, (a, b) in enumerate(zip(pts, pts[1:])):
            strut(kit, f"drip_rail{k}_{s}", a, b, 0.02, "metal_light")
    pts = over_cabin(fall_x(FALL_SEAM), 0.008)
    for k, (a, b) in enumerate(zip(pts, pts[1:])):
        strut(kit, f"fall_seam_{k}", a, b, 0.02, "trim")
    for s, sy in (("l", 1), ("r", -1)):
        for i, h in enumerate(SIDE_BARS):
            a, b = mirrored([side_point(SIDE_OPENING[0][0] - 0.02, up(h), 0.010), side_point(opening_back(up(h)) + 0.03, up(h), 0.010)], sy)
            strut(kit, f"side_bar{i}_{s}", a, b, 0.024, "metal_light")
    half, top, bottom = REAR_WINDOW
    for i, y in enumerate(REAR_BARS_Y):
        strut(kit, f"rear_bar{i}", fall_point(y, top + 0.02, 0.02), fall_point(y, bottom - 0.02, 0.02), 0.026, "metal_light")
    front, back, bottom_h, top_h = PATCH
    plate = [side_point(x, z, out) for x in (front, back) for z in (LID + bottom_h, min(up(top_h), rail_z(x) - 0.03)) for out in (0.003, 0.010)]
    add_hull(kit, "patch_plate", plate, "metal")
    for i, (x, z) in enumerate((x, z) for x in (front + 0.03, back - 0.03) for z in (LID + bottom_h + 0.03, min(up(top_h), rail_z(x) - 0.03) - 0.03)):
        kit.box(f"patch_rivet{i}", (0.016, 0.016, 0.016), side_point(x, z, 0.012), "metal_light")
    for s, sy in (("l", 1), ("r", -1)):
        strut(kit, f"belt_strip_{s}", (VENT_POST_X, sy * (FOOT_HALF + 0.008), LID + 0.008), (FOOT_X, sy * (FOOT_HALF + 0.008), LID + 0.008), 0.016, "metal_light")
    strut(kit, "belt_strip_back", (FOOT_X - 0.012, FOOT_HALF, LID + 0.008), (FOOT_X - 0.012, -FOOT_HALF, LID + 0.008), 0.016, "metal_light")


def hatch(kit: Kit) -> list[str]:
    """The round lookout hatch on the crown over the driver's cab cells: a steel ring round a dark opening, its lid
    lying open on the crown behind it. It shows the chassis's open-top ability on a closed car.

    Returns the hatch's round part names, for check_features().
    """
    x, y, ring_r, open_r = HATCH
    z = cabin_z(x, y)
    check_round("hatch_ring", ROUND_SEGMENTS, ROUND_SEGMENTS)
    kit.cylinder("hatch_ring", ring_r, 0.05, (x, y, z), "metal", vertices=ROUND_SEGMENTS)
    check_round("hatch_opening", ROUND_SEGMENTS, ROUND_SEGMENTS)
    kit.cylinder("hatch_opening", open_r, 0.01, (x, y, z + 0.022), "under", vertices=ROUND_SEGMENTS)
    lid_x = x - HATCH_LID_BACK
    lid_z = cabin_z(lid_x, y)
    check_round("hatch_lid", ROUND_SEGMENTS, ROUND_SEGMENTS)
    kit.cylinder("hatch_lid", ring_r - 0.01, 0.03, (lid_x, y, lid_z + 0.005), "metal", vertices=ROUND_SEGMENTS)
    kit.box("hatch_hinge", (0.05, 0.16, 0.025), (x - ring_r - 0.015, y, max(z, lid_z) + 0.012), "metal_light")
    return ["hatch_ring", "hatch_opening", "hatch_lid"]


def check_hole() -> None:
    """Raises when the engine hole is not the engine bay's 3 cells by 2, sits too deep, or leaves the rear lid."""
    (x0, y0), (x1, y1) = HOLE
    if abs((x1 - x0) - 3 * GAME.along) > 1e-6 or abs((y1 - y0) - 2 * GAME.across) > 1e-6:
        raise RuntimeError(f"engine hole x {x0:.3f}..{x1:.3f} y {y0:.3f}..{y1:.3f} is not 3 cells long and 2 across")
    if x1 >= FOOT_X - 0.01 or x0 - 0.2 <= -NOSE_X or max(abs(y0), abs(y1)) >= side_y(1.12) - 0.2:
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


def check_features(headlamps: list[str], taillights: list[str], side_glass: list[str], hatch_parts: list[str]) -> None:
    """Raises when the photo's features drift: two headlamps and two taillights a side, door tops at least 0.25 m wide,
    one side opening a side with no B-pillar, and a closed cabin no taller or wider than the photo's top, over the
    whole cab rows from the header to the fall, with no opening into the body but the hatch."""
    for name, lamps in (("headlamps", headlamps), ("taillights", taillights), ("side glass", side_glass)):
        for s in ("l", "r"):
            count = sum(1 for lamp in lamps if lamp.endswith(f"_{s}"))
            want = 1 if name == "side glass" else 2
            if count != want:
                raise RuntimeError(f"{count} {name} on side {s}, the photos show {want}")
    shoulder = side_y(1.12) - FOOT_HALF
    if shoulder < 0.25 - 1e-6:
        raise RuntimeError(f"door tops {shoulder:.3f} m wide, under 0.25")
    xs = [x for x, _ in CABIN_STATIONS[1:]]
    if xs != sorted(xs, reverse=True) or windshield_x(up(CABIN_STATIONS[0][1])) < HEADER_X - 0.08 or FOOT_X > G.row_x(5.5):
        raise RuntimeError(f"the cabin does not cover the cab rows from the header at {HEADER_X} to row 5's back edge at {G.row_x(5.5):.2f}")
    if max(c for _, c in CABIN_STATIONS) > 1.70 or CROWN > 1.70:
        raise RuntimeError("the cabin's crown stands over 1.70 m, taller than the photo's top")
    if EDGE[0] > 0.72 or FOOT_HALF > 0.82:
        raise RuntimeError(f"the cabin is {EDGE[0]} m off the center line at the crown and {FOOT_HALF} at the foot, wider than the photo's top")
    if not SIDE_OPENING[0][0] > GLASS_SEAM_X > SIDE_OPENING[-1][0]:
        raise RuntimeError("the side opening needs one thin seam inside it and no B-pillar")
    if hatch_parts != ["hatch_ring", "hatch_opening", "hatch_lid"] or HATCH[1] - HATCH[2] < G.col_y(3) + G.across / 2:
        raise RuntimeError("the hatch must stand over the driver's cab cells, off column 3")


def louvers(kit: Kit) -> None:
    """The two louver banks on the rear lid: the engine hole's slatted floor on the left and slats on the lid on the right."""
    check_hole()
    (x0, y0), (x1, y1) = HOLE
    kit.box("bay_floor", (x1 - x0, y1 - y0, 0.02), ((x0 + x1) / 2, (y0 + y1) / 2, FLOOR - 0.025), "under")
    count = int((x1 - x0 - 0.02) / SLAT_PITCH)
    for i in range(count):
        x = x1 - 0.01 - SLAT_PITCH * (i + 0.5)
        kit.box(f"bay_slat{i}", (SLAT_PITCH * 0.55, y1 - y0 - 0.004, 0.02), (x, (y0 + y1) / 2, FLOOR - 0.01), "paint")
        kit.box(f"lid_slat{i}", (SLAT_PITCH * 0.5, RIGHT_BANK[0] - RIGHT_BANK[1], 0.014), (x, sum(RIGHT_BANK) / 2, LID + 0.007), "paint")


def main() -> None:
    args = parse_args()
    kit = Kit(COLORS, SEED)
    check_tires()
    body(kit)
    arch_lips(kit)
    rocker(kit)
    doors(kit)
    headlamps = nose(kit)
    taillights = tail(kit)
    bumper(kit, "front_bumper", *FRONT_BUMPER, 1)
    bumper(kit, "rear_bumper", *REAR_BUMPER, -1)
    mesh_outlet(kit)
    windshield(kit)
    cabin(kit)
    side_glass = cabin_glass(kit)
    cabin_finish(kit)
    hatch_parts = hatch(kit)
    louvers(kit)
    check_features(headlamps, taillights, side_glass, hatch_parts)
    bay = {(x, y): FLOOR for x in (1, 2) for y in (6, 7)}
    shoulders = {(x, y): LID for x in (0, 4) for y in (3, 4, 5)}
    level_sockets(kit, G, "row", [LID] * 3 + [up(CROWN)] * 3 + [LID] * 3, fronts={3: COWL_X}, cells={**bay, **shoulders})
    level_sockets(kit, G, "floor", [LID - 0.5] * 3 + [CABIN_FLOOR] * 3 + [FLOOR] * 2 + [LID])
    kit.socket("arch_front", (WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (-WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEEL_X, WHEEL_Z, HUB_Z + ARCH_R))
    check_base(kit, "base_convertible", G)
    kit.export("base_convertible", args, view_size=7.0)


if __name__ == "__main__":
    main()
