"""The convertible base: a stylized 1964 Chevrolet Corvair Monza convertible with its soft top up.

Built from the published specs scaled by 1.278, so it keeps its 5.84 m game length: 2.17 m across the crease,
a 3.5 m wheelbase and 1.73 m to the top of the soft top on its tires. The ground is 1.06 m below the center.
The body is one loft of plan rings stacked from the rocker to the lids. In plan the ends are rounded: 0.55 m corners,
and the middle of the nose and the tail bows 0.08 m out. One sharp crease wraps the whole body 1.11 m over the ground.
Above it the shoulder rolls in to the flat lids at 1.15-1.17 m. Right under it the side steps in 4.5 cm, so a shadow
line runs all round, then stands nearly upright to the hubs and rolls under to the rocker 0.88 m off the center line.
The long flat front lid has no grille. The nose under the crease holds one round headlamp a side, sunk 2 cm into the
face in a chrome bezel, with a chrome bar and a round badge between them. The raked windshield runs from the cowl at
x 1.08 up to the header at x 0.58. The narrow soft top in the faction's second color stands inboard: 0.86 m off the
center line at the lid and 0.70 m at the crown, so the lid shows 0.22 m beside it. Its crown runs from x 0.52 to -0.58,
1.73 m up, where items on the cab cells stand. It has one door window a side, a blind quarter and a rear fall in three
facets down to the rear lid at x -0.97, with a small rear window and a dark welt at its foot. The flat rear lid is
closed round the engine: the hole fits the drawn engine plus HOLE_MARGIN, framed by a dark lip, over a dark bay floor
with the round fan housing, and a short louver band lies behind it. Two round taillights a side sit on the tail.
One long door a side keeps DOOR_GAP from the flares, and a chrome strip runs along the rocker between the arches.
Round arches of 32 edges are cut under the crease, which runs unbroken over them, and the tires' outer faces stand
flush with the side at hub height.
Deviations from the car: the wheels stay symmetric, the body rides 0.30 m up instead of 0.24, the tires follow the tire
rule, so the track is 1.68 m to keep them flush with the rolled-under side, the top spans the grid's cab rows 3 to 5,
and the engine shows through the rear lid over the grid's engine cells, left of the center line where the grid puts them.
Grid: 5 columns by 9 rows, stretched over the model by the projection. Rows 3 to 5 rest on the crown for columns 1 to 3
and on the lid shoulders for columns 0 and 4. Half height 0.35 m, from PHYSICS.bodies.convertible.
Wheels sit at x -+1.75 and y -+0.84, radius 0.46 m, half width 0.18 m, mount 0.2 m below the center.
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
    hull_mesh,
    level_sockets,
)
from parts_common_core import ROUND_SEGMENTS, SMALL_ROUND_SEGMENTS, check_round  # noqa: E402
from shapes import loft, prism, strut  # noqa: E402

SEED = 305
G = Grid(rows=9, cols=5, half_height=0.35)
GROUND = -1.06  # the ground under the tires, from PHYSICS.bodies.convertible
WHEEL_R = 0.46  # PHYSICS.bodies.convertible.wheelRadius
WHEEL_HALF_W = 0.18  # PHYSICS.bodies.convertible.wheelHalfWidth
WHEEL_X = 1.75  # PHYSICS.bodies.convertible.wheelX: half the 2.74 m wheelbase times 1.278
WHEEL_Z = 0.83  # PHYSICS.bodies.convertible.wheelZ: the tire's outer face flush with the side at hub height
HUB_Z = -0.2 - SUSPENSION_REST  # PHYSICS.bodies.convertible.wheelY
WHEELS_X = [WHEEL_X, -WHEEL_X]
ARCH_R = WHEEL_R + ARCH_CLEARANCE
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03


def up(height: float) -> float:
    """Model z of a height over the ground."""
    return GROUND + height


NOSE_X = 2.92  # half the 4.57 m length times 1.278, at the middle of the nose bow
HALF_W = 1.085  # half the 1.70 m width times 1.278, at the crease ridge
CORNER_R = 0.55  # inferred: the rounded plan corners
BOW = 0.08  # inferred: the middle of the nose and the tail bows out past the corners
CORNER_X = NOSE_X - BOW
ARC_STEPS = 4
BOW_STEPS = 2

# The section as (height over the ground, side inset, end inset) from the crease ridge, rocker to lid.
SECTION = [
    (0.30, 0.225, 0.21),  # the rocker, 0.86 m off the center line
    (0.38, 0.12, 0.13),
    (0.46, 0.075, 0.095),  # hub height: the tire's outer face stands here
    (1.05, 0.045, 0.04),  # under the lip: the 4.5 cm shadow line
    (1.11, 0.0, 0.0),  # the crease ridge
    (1.15, 0.095, 0.095),  # the lid edge
    (1.17, 0.30, 0.30),  # the lid crown, its ring concentric with the crease so the shoulder faces stay flat
]
LID = up(1.17)
LID_EDGE = up(1.15)
BOTTOM = up(0.30)
RIDGE = up(1.11)
LIP = up(1.05)

COWL_X = 1.08  # the windshield foot
HEADER_X = 0.58  # the windshield header
HEADER_Z = up(1.70)
CROWN_FRONT = 0.52
CROWN_BACK = -0.58
ROOF_TOP = up(1.725)  # 1.30 m times 1.278 plus the raised ride, kept under the tire rule's next step
DOME = 0.007  # the crown's faint dome, kept low so the tire rule keeps the 0.46 m tire
FALL = [(-0.80, up(1.60)), (-1.05, up(1.38)), (-1.30, up(1.19))]  # the rear fall in three facets
TOP_FOOT_X = FALL[-1][0]
FALL_TUCK = (0.98, 0.94, 0.9)  # inferred: the top's rear quarters draw in toward its foot
TOP_FOOT_Z = up(1.14)  # the top's foot, sunk a little into the lid
TOP_LID_HALF = 0.81  # the top's side at the lid, narrowed from 0.86 so the outer columns rest on the shoulders (UK1)
TOP_CROWN_HALF = 0.68  # and at the crown, so the side leans in about 12 degrees
TOP_MAX_CROWN_HALF = 0.72
TOP_MAX_LID_HALF = 0.88
CROWN_EDGE = (0.12, 0.06)  # the crown edge rolls over in two facets, across and down
WINDOW_BACK = -0.15
BOWS = (0.0, -0.42)  # inferred: the top's bows show as seams across the crown
WINDOW_LOW = up(1.23)
WINDOW_HIGH = up(1.62)
REAR_WINDOW = (0.375, 0.09)  # half width and half height on the middle facet

DOOR_FRONT = 0.88
DOOR_BACK = -0.45
HEADLAMP_Y = 0.40
HEADLAMP_Z = up(0.88)
HEADLAMP_R = 0.115  # a 7-inch lamp times 1.278
BEZEL = 0.03
SOCKET = 0.025  # the dark ring round each headlamp bezel, so the lamp reads set into the nose
TAIL_Y = (0.42, 0.66)
TAIL_Z = up(0.92)
TAIL_R = 0.075

ENGINE_X = -1.8356  # PHYSICS.bodies.convertible.engine.x
ENGINE_Y = 0.2  # -PHYSICS.bodies.convertible.engine.z
ENGINE_HALF = (0.4356, 0.3)  # the drawn engine: restOn() of the engine cells, over the bay floor
HOLE_MARGIN = 0.02
HOLE = ((ENGINE_X - ENGINE_HALF[0] - HOLE_MARGIN, ENGINE_Y - ENGINE_HALF[1] - HOLE_MARGIN), (ENGINE_X + ENGINE_HALF[0] + HOLE_MARGIN, ENGINE_Y + ENGINE_HALF[1] + HOLE_MARGIN))
FLOOR = up(1.17) - 0.39  # PHYSICS.bodies.convertible.engine.y: a 0.5 m engine block pokes out of the hole
HOLE_LIP = (0.035, 0.03)  # the dark lip round the hole, wide and tall
FAN_R = 0.26
FAN_RISE = 0.03  # the fan housing stands this far proud of the bay floor, inside the rest's CLIP_TOLERANCE
LOUVERS = (-2.36, -2.6)


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


def quarter(side: float, end: float) -> list[tuple[float, float]]:
    """The front left quarter of a plan ring, from the middle of the nose round to the start of the straight side."""
    cx, half, r = corner_of(side, end)
    flat = half - r
    pts = [(cx + BOW * (1 - (k / BOW_STEPS) ** 2), flat * k / BOW_STEPS) for k in range(BOW_STEPS + 1)]
    pts += [(cx - r + r * math.cos(math.pi / 2 * k / ARC_STEPS), flat + r * math.sin(math.pi / 2 * k / ARC_STEPS)) for k in range(1, ARC_STEPS + 1)]
    return pts


def plan_ring(side: float, end: float, z: float) -> list[Vec3]:
    """One closed plan ring round the body at height z, nose first, going left."""
    q = quarter(side, end)
    left = q + [(-x, y) for x, y in reversed(q)]
    right = [(-x, -y) for x, y in q[1:]] + [(x, -y) for x, y in reversed(q[1:])]
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


def add_hull(kit: Kit, name: str, points: list[Vec3], mat: str) -> object:
    obj = hull_mesh(name, points)
    kit._add(obj, name, mat, 0.0)
    return obj


def mirrored(points: list[Vec3]) -> list[Vec3]:
    return [p for x, y, z in points for p in ((x, y, z), (x, -y, z))]


def disc_points(center: Vector, normal: Vector, radius: float, sides: int) -> list[Vec3]:
    rot = Vector((0, 0, 1)).rotation_difference(normal)
    return [tuple(center + rot @ Vector((radius * math.cos(2 * math.pi * k / sides), radius * math.sin(2 * math.pi * k / sides), 0))) for k in range(sides)]


def round_lamp(kit: Kit, name: str, at: Vector, normal: Vector, radius: float, mat: str, sides: int) -> None:
    """A round lamp in a chrome bezel, its face along normal, standing out from at."""
    check_round(name, sides, SMALL_ROUND_SEGMENTS)
    rot = tuple(Vector((0, 0, 1)).rotation_difference(normal).to_euler())
    kit.cylinder(f"{name}_bezel", radius + BEZEL, 0.03, tuple(at + normal * 0.005), "metal_light", rot=rot, vertices=sides)
    kit.cylinder(name, radius, 0.03, tuple(at + normal * 0.013), mat, rot=rot, vertices=sides)


def bay_box() -> tuple[Vec3, Vec3]:
    (x0, y0), (x1, y1) = HOLE
    return ((x0, y0, FLOOR), (x1, y1, LID + 0.2))


def headlamp_spots() -> list[tuple[Vector, Vector]]:
    return [(Vector((end_x(sy * HEADLAMP_Y, HEADLAMP_Z - GROUND), sy * HEADLAMP_Y, HEADLAMP_Z)), nose_normal(sy * HEADLAMP_Y, HEADLAMP_Z - GROUND)) for sy in (1, -1)]


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
    """Joins the plan rings into one closed body, capped top and bottom by strips across it."""
    mesh = bpy.data.meshes.new("body")
    bm = bmesh.new()
    loops = [[bm.verts.new(p) for p in ring] for ring in rings]
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


def body(kit: Kit) -> None:
    """The lofted body from the rocker to the lids, with the arches, the engine hole and the headlamp recesses cut in."""
    obj = body_loft(kit, [plan_ring(side, end, up(height)) for height, side, end in SECTION])
    check_round("arch", ROUND_SEGMENTS, ROUND_SEGMENTS)
    arch_cut(obj, WHEELS_X, HUB_Z, WHEEL_R, WELL_Y, BOTTOM, ROUND_SEGMENTS)
    cut_boxes(obj, [bay_box()])
    for i, wx in enumerate(WHEELS_X):
        r0 = ARCH_R
        outer = [(wx + r0 * math.cos(math.pi * k / ROUND_SEGMENTS), HUB_Z + r0 * math.sin(math.pi * k / ROUND_SEGMENTS)) for k in range(ROUND_SEGMENTS + 1)]
        inner = [(wx + (r0 - 0.025) * math.cos(math.pi * k / ROUND_SEGMENTS), HUB_Z + (r0 - 0.025) * math.sin(math.pi * k / ROUND_SEGMENTS)) for k in range(ROUND_SEGMENTS + 1)]
        for s, sy in (("l", 1), ("r", -1)):
            y0, y1 = sy * WELL_Y, sy * (side_y(0.8) - 0.01)
            prism(kit, f"well{i}_{s}", outer + list(reversed(inner)), min(y0, y1), max(y0, y1), "under")


def rocker(kit: Kit) -> None:
    """A thin chrome strip along the rocker roll between the arches."""
    height = 0.37
    half = WHEEL_X - ARCH_R - 0.08
    for s, sy in (("l", 1), ("r", -1)):
        kit.box(f"rocker_{s}", (2 * half, 0.02, 0.03), (0, sy * (side_y(height) + 0.004), up(height)), "metal_light")


def doors(kit: Kit) -> None:
    """One long door a side: seams on the side from the roll-under to the lip, and a chrome handle under the crease."""
    low = up(0.40)
    check_door_gap("door", DOOR_FRONT, DOOR_BACK, low, WHEELS_X, HUB_Z, ARCH_R)
    heights = [0.40, 0.46, 0.80, 1.04]
    for s, sy in (("l", 1), ("r", -1)):
        for i, x in enumerate((DOOR_FRONT, DOOR_BACK)):
            pts = [(x, sy * (side_y(h) + 0.003), up(h)) for h in heights]
            for k, (a, b) in enumerate(zip(pts, pts[1:])):
                strut(kit, f"door_seam{i}_{k}_{s}", a, b, 0.018, "under")
        kit.box(f"handle_{s}", (0.14, 0.025, 0.03), (DOOR_BACK + 0.16, sy * (side_y(0.98) + 0.01), up(0.98)), "metal_light")


def nose(kit: Kit) -> None:
    """One round headlamp a side sunk into the nose face, and a chrome bar with a round badge between them."""
    for (at, normal), s in zip(headlamp_spots(), ("l", "r")):
        rot = tuple(Vector((0, 0, 1)).rotation_difference(normal).to_euler())
        kit.cylinder(f"headlamp_socket_{s}", HEADLAMP_R + BEZEL + SOCKET, 0.02, tuple(at), "under", rot=rot, vertices=ROUND_SEGMENTS)
        round_lamp(kit, f"headlamp_{s}", at + normal * 0.004, normal, HEADLAMP_R, "light", ROUND_SEGMENTS)
    reach = HEADLAMP_Y - HEADLAMP_R - BEZEL - 0.02
    height = HEADLAMP_Z - GROUND
    ys = [reach * k / 3 for k in range(-3, 4)]
    pts = [(end_x(y, height) + 0.012, y, HEADLAMP_Z) for y in ys]
    for k, (a, b) in enumerate(zip(pts, pts[1:])):
        strut(kit, f"nose_bar{k}", a, b, 0.035, "metal_light")
    badge = Vector((end_x(0, height) + 0.02, 0, HEADLAMP_Z))
    check_round("badge", SMALL_ROUND_SEGMENTS, SMALL_ROUND_SEGMENTS)
    kit.cylinder("badge", 0.05, 0.02, tuple(badge), "metal_light", rot=(0, math.pi / 2, 0), vertices=SMALL_ROUND_SEGMENTS)
    kit.cylinder("badge_core", 0.032, 0.02, tuple(badge + Vector((0.006, 0, 0))), "red", rot=(0, math.pi / 2, 0), vertices=SMALL_ROUND_SEGMENTS)


def tail(kit: Kit) -> None:
    """Two round taillights a side in chrome bezels on the tail face, and a chrome bar across between them."""
    height = TAIL_Z - GROUND
    for s, sy in (("l", 1), ("r", -1)):
        for i, y in enumerate(TAIL_Y):
            n = nose_normal(sy * y, height)
            at = Vector((-end_x(sy * y, height), sy * y, TAIL_Z))
            round_lamp(kit, f"taillight{i}_{s}", at, Vector((-n.x, n.y, n.z)), TAIL_R, "red", SMALL_ROUND_SEGMENTS)
    reach = TAIL_Y[0] - TAIL_R - BEZEL - 0.02
    ys = [reach * k / 3 for k in range(-3, 4)]
    pts = [(-end_x(y, height) - 0.01, y, TAIL_Z) for y in ys]
    for k, (a, b) in enumerate(zip(pts, pts[1:])):
        strut(kit, f"tail_bar{k}", a, b, 0.035, "metal_light")


def top_side(z: float) -> float:
    """The half width of the soft top's side at z: TOP_LID_HALF at its foot, leaning in to TOP_CROWN_HALF under the crown edge."""
    low, high = TOP_FOOT_Z, ROOF_TOP - CROWN_EDGE[1]
    return TOP_LID_HALF + (TOP_CROWN_HALF - TOP_LID_HALF) * (z - low) / (high - low)


def windshield_z(x: float) -> float:
    return LID + (COWL_X - x) * (HEADER_Z - LID) / (COWL_X - HEADER_X)


def top_ring(x: float, crown: float, dome: float, tuck: float = 1.0) -> list[Vec3]:
    """A section of the greenhouse at x with its top at crown: the leaning sides, the crown chamfer and the dome."""
    drop = min(CROWN_EDGE[1], (crown - TOP_FOOT_Z) / 2)
    edge = top_side(crown - drop)
    inset = CROWN_EDGE[0] * drop / CROWN_EDGE[1]
    half = [(TOP_LID_HALF, TOP_FOOT_Z), (edge, crown - drop), (edge - 0.4 * inset, crown - 0.3 * drop), (edge - inset, crown)]
    pts = half + [(0.0, crown + dome)] + [(-y, z) for y, z in reversed(half)]
    return [(x, y * tuck, z) for y, z in pts]


def check_top() -> None:
    """Raises when the soft top grows back toward a box: wider than IV1 at the crown or at the lid."""
    crown = top_side(ROOF_TOP - CROWN_EDGE[1])
    if crown > TOP_MAX_CROWN_HALF + 1e-6 or TOP_LID_HALF > TOP_MAX_LID_HALF + 1e-6:
        raise RuntimeError(f"soft top half width {crown:.3f} at the crown and {TOP_LID_HALF:.3f} at the lid, over {TOP_MAX_CROWN_HALF} and {TOP_MAX_LID_HALF}")


def soft_top(kit: Kit) -> None:
    """The greenhouse: the raked windshield part, the crown and the faceted rear fall, all in the trim color."""
    check_top()
    stations = [(COWL_X - 0.005, windshield_z(COWL_X - 0.005) + 0.015, 0.0), (0.83, windshield_z(0.83), 0.0), (HEADER_X, HEADER_Z, 0.0)]
    stations += [(CROWN_FRONT, ROOF_TOP, DOME), (CROWN_BACK, ROOF_TOP, DOME)]
    stations += [(x, z, 0.0) for x, z in FALL]
    tucks = [1.0] * (len(stations) - len(FALL)) + list(FALL_TUCK)
    loft(kit, "soft_top", [top_ring(x, z, d, t) for (x, z, d), t in zip(stations, tucks)], "trim")
    kit.box("welt", (0.04, 2 * TOP_LID_HALF * FALL_TUCK[-1] + 0.02, 0.035), (TOP_FOOT_X - 0.01, 0, LID_EDGE + 0.01), "under")
    for i, x in enumerate(BOWS):
        ring = top_ring(x, ROOF_TOP, DOME)[1:-1]
        seam = [(px, py * 1.01, pz - 0.002) for px, py, pz in ring]
        for k, (a, b) in enumerate(zip(seam, seam[1:])):
            strut(kit, f"bow{i}_{k}", a, b, 0.014, "under")


def windshield(kit: Kit) -> None:
    """The raked windshield in a chrome frame: thin A-pillars that lean in with the top, a header and a cowl strip."""
    along = Vector((HEADER_X - COWL_X, 0, HEADER_Z - LID)).normalized()
    normal = Vector((-along.z, 0, along.x))
    if normal.x < 0:
        normal = -normal
    corners: list[Vec3] = []
    for x in (COWL_X - 0.04, HEADER_X + 0.03):
        z = windshield_z(x)
        half = top_side(z) - CROWN_EDGE[0] - 0.01
        for out in (0.004, 0.014):
            p = Vector((x, half, z)) + normal * out
            corners += [tuple(p), (p.x, -p.y, p.z)]
    add_hull(kit, "windshield", corners, "glass")
    for s, sy in (("l", 1), ("r", -1)):
        foot = (COWL_X, sy * (top_side(LID) - CROWN_EDGE[0] / 2), LID + 0.01)
        head = (HEADER_X, sy * (top_side(HEADER_Z - CROWN_EDGE[1]) - CROWN_EDGE[0] / 2), HEADER_Z - 0.02)
        strut(kit, f"a_pillar_{s}", foot, head, 0.045, "metal_light")
    header_half = top_side(HEADER_Z - CROWN_EDGE[1]) - CROWN_EDGE[0]
    strut(kit, "header", (HEADER_X + 0.01, header_half, HEADER_Z + 0.005), (HEADER_X + 0.01, -header_half, HEADER_Z + 0.005), 0.04, "metal_light")
    cowl_half = top_side(LID) - 0.03
    strut(kit, "cowl", (COWL_X + 0.02, cowl_half, LID + 0.012), (COWL_X + 0.02, -cowl_half, LID + 0.012), 0.035, "metal_light")


def windows(kit: Kit) -> None:
    """One door window a side from the A-pillar back to WINDOW_BACK, a blind quarter behind it, and a small rear window."""
    for s, sy in (("l", 1), ("r", -1)):
        pane: list[Vec3] = []
        for z in (WINDOW_LOW, WINDOW_HIGH):
            front = COWL_X - (z - LID) * (COWL_X - HEADER_X) / (HEADER_Z - LID) - 0.08
            for x in (front, WINDOW_BACK):
                for out in (-0.004, 0.008):
                    pane.append((x, sy * (top_side(z) + out), z))
        add_hull(kit, f"door_window_{s}", pane, "glass")
    (xa, za), (xb, zb) = FALL[0], FALL[1]
    along = Vector((xb - xa, 0, zb - za)).normalized()
    normal = Vector((along.z, 0, -along.x))
    if normal.x > 0:
        normal = -normal
    mid = Vector(((xa + xb) / 2, 0, (za + zb) / 2))
    glass: list[Vec3] = []
    for t in (-REAR_WINDOW[1], REAR_WINDOW[1]):
        for out in (0.003, 0.012):
            p = mid + along * t + normal * out
            glass += [(p.x, REAR_WINDOW[0], p.z), (p.x, -REAR_WINDOW[0], p.z)]
    add_hull(kit, "rear_window", glass, "glass")


def check_hole() -> None:
    """Raises when the engine hole does not hold the drawn engine with its margin, or leaves the rear lid behind the top."""
    (x0, y0), (x1, y1) = HOLE
    ex0, ex1 = ENGINE_X - ENGINE_HALF[0], ENGINE_X + ENGINE_HALF[0]
    ey0, ey1 = ENGINE_Y - ENGINE_HALF[1], ENGINE_Y + ENGINE_HALF[1]
    if min(ex0 - x0, x1 - ex1, ey0 - y0, y1 - ey1) < HOLE_MARGIN - 1e-6 or max(ex0 - x0, x1 - ex1, ey0 - y0, y1 - ey1) > HOLE_MARGIN + 1e-6:
        raise RuntimeError(f"engine hole x {x0:.3f}..{x1:.3f} y {y0:.3f}..{y1:.3f} is not the engine x {ex0:.3f}..{ex1:.3f} y {ey0:.3f}..{ey1:.3f} plus {HOLE_MARGIN}")
    if x1 >= TOP_FOOT_X - 0.02 or x0 <= LOUVERS[0] or max(abs(y0), abs(y1)) >= side_y(1.15) - 0.2:
        raise RuntimeError(f"engine hole x {x0:.3f}..{x1:.3f} y {y0:.3f}..{y1:.3f} leaves the rear lid")


def check_tires() -> None:
    """Raises when a tire's outer face is not flush with the side at hub height, or reaches the solid body inside the well."""
    side = side_y(HUB_Z - GROUND)
    if abs(WHEEL_Z + WHEEL_HALF_W - side) > 0.02:
        raise RuntimeError(f"tire face at y {WHEEL_Z + WHEEL_HALF_W:.3f} is not flush with the side at {side:.3f}")
    if WHEEL_Z - WHEEL_HALF_W <= WELL_Y:
        raise RuntimeError(f"tire inner face at y {WHEEL_Z - WHEEL_HALF_W:.3f} reaches the well wall at {WELL_Y:.3f}")


def engine_lid(kit: Kit) -> None:
    """The rear lid round the engine: a dark lip framing the hole, dark bay walls, the floor with the fan housing, and the louvers."""
    check_hole()
    (x0, y0), (x1, y1) = HOLE
    w, h = HOLE_LIP
    lip_z = LID + h / 2 - 0.01
    kit.box("lip_front", (w, y1 - y0 + 2 * w, h + 0.02), (x1 + w / 2, (y0 + y1) / 2, lip_z), "metal")
    kit.box("lip_back", (w, y1 - y0 + 2 * w, h + 0.02), (x0 - w / 2, (y0 + y1) / 2, lip_z), "metal")
    kit.box("lip_left", (x1 - x0, w, h + 0.02), ((x0 + x1) / 2, y1 + w / 2, lip_z), "metal")
    kit.box("lip_right", (x1 - x0, w, h + 0.02), ((x0 + x1) / 2, y0 - w / 2, lip_z), "metal")
    depth = LID - FLOOR
    wall_z = FLOOR + depth / 2
    kit.box("bay_wall_front", (0.006, y1 - y0, depth), (x1 - 0.004, (y0 + y1) / 2, wall_z), "metal")
    kit.box("bay_wall_back", (0.006, y1 - y0, depth), (x0 + 0.004, (y0 + y1) / 2, wall_z), "metal")
    kit.box("bay_wall_left", (x1 - x0, 0.006, depth), ((x0 + x1) / 2, y1 - 0.004, wall_z), "metal")
    kit.box("bay_wall_right", (x1 - x0, 0.006, depth), ((x0 + x1) / 2, y0 + 0.004, wall_z), "metal")
    kit.box("bay_floor", (x1 - x0, y1 - y0, 0.02), ((x0 + x1) / 2, (y0 + y1) / 2, FLOOR - 0.01), "metal")
    check_round("fan", ROUND_SEGMENTS, ROUND_SEGMENTS)
    kit.cylinder("fan_ring", FAN_R, 2 * FAN_RISE, (ENGINE_X, ENGINE_Y, FLOOR), "metal_light", vertices=ROUND_SEGMENTS)
    kit.cylinder("fan_hub", FAN_R - 0.05, 2 * FAN_RISE + 0.004, (ENGINE_X, ENGINE_Y, FLOOR), "metal", vertices=ROUND_SEGMENTS)
    count = 4
    pitch = (LOUVERS[0] - LOUVERS[1]) / count
    for i in range(count):
        kit.box(f"louver{i}", (pitch * 0.5, 1.0, 0.02), (LOUVERS[0] - pitch * (i + 0.5), 0, LID + 0.004), "under")


def main() -> None:
    args = parse_args()
    kit = Kit(BASE_COLORS, SEED)
    check_tires()
    body(kit)
    rocker(kit)
    doors(kit)
    nose(kit)
    tail(kit)
    soft_top(kit)
    windshield(kit)
    windows(kit)
    engine_lid(kit)
    bay = {(x, y): FLOOR for x in (1, 2) for y in (6, 7)}
    shoulders = {(x, y): LID for x in (0, 4) for y in (3, 4, 5)}
    level_sockets(kit, G, "row", [LID] * 3 + [ROOF_TOP] * 3 + [LID] * 3, fronts={3: CROWN_FRONT}, cells={**bay, **shoulders})
    level_sockets(kit, G, "floor", [LID - 0.5] * 3 + [FLOOR] * 5 + [LID])
    kit.socket("arch_front", (WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (-WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEEL_X, WHEEL_Z, HUB_Z + ARCH_R))
    check_base(kit, "base_convertible", G)
    kit.export("base_convertible", args, view_size=7.0)


if __name__ == "__main__":
    main()
