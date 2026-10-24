"""The longbed base: a ZIL-130, the Soviet hooded medium truck, in the stylized style of the scout.

Built from two photographs of one ZIL-130 (Matti Blume, Wikimedia Commons, kept out of the repo) through the blender-image-to-3d
brief and compare gates, with the published figures for what a perspective photo cannot measure: 6.675 m long, 2.5 m wide,
2.4 m to the cab roof, a 3.8 m wheelbase and 9.00-20 tires. Lengths scale by 1.071 to the 7.15 m grid, widths and heights by the
scout's 1.077, and every height is measured from the hub, so the rule tire lifts the body as on the scout. That makes it 7.15 m
long, 2.69 m wide and 2.65 m tall on its tires. Real levels read in the photos against the 1.0 m front tire: hood nose 1.45 rising
to the beltline 1.68 at the cowl, headlight centre 1.05, top slot 1.23 to 1.30, slotted band 1.06 to 1.10, radiator 0.90 to 1.01,
face bottom 0.80, wing crown 1.27, bumper 0.5 to 0.7.
The front is one closed face between rounded wings that drop to the bumper: a dark slot under the hood nose, a band of short slots
standing proud and a radiator split by a post with bright louvers, all set into the face. Headlights sit in round pods on the
wing fronts with an amber lamp under each, one on each wing side and one on each wing top. The broad hood has a raised flat centre
and louvers by the cowl. The cab has rounded roof edges, a visor lip, a two-pane windshield that wraps round its corners, vent
panes, three amber roof markers and mirrors on wire arms. The bed has grey ribbed steel sides and tailgate under a wooden board.
Deviations from the photos: the wheels stay symmetric at 2.05 m off the center, the cowl sits 0.3 m back so the front wheel stays
under the rear of the hood, the bed is a 3.95 m flatbed with low sides instead of the photo's tall grain body, the yellow corner
marks are left out, and the tires are the tire rule's 0.61 m. The base draws the inner rear duals under a closed hood.
Grid: 7 columns by 11 rows, stretched over the model by the projection. Half height 0.55 m, from PHYSICS.bodies.longbed.
Wheels sit on rows 1 and 9, radius 0.61 m, half width 0.255 m, mount 0.35 m below the center, 1.08 m off the center line.
Sockets arch_front, arch_rear and arch_front_top mark the arches for wheelArches.test.ts.
Run: blender --background --python tools/blender/base_longbed.py -- public/models/base_longbed.glb [tmp/base_longbed.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args, round_sides  # noqa: E402
from parts_common_base import (  # noqa: E402
    ARCH_CLEARANCE,
    BASE_COLORS,
    SUSPENSION_REST,
    Grid,
    check_base,
    check_door_gap,
    door_sill,
    flare,
    hull_layers,
    hull_mesh,
    level_sockets,
    round_arch,
)
from parts_common_core import drawn_wheel  # noqa: E402

SEED = 303
COLORS = {**BASE_COLORS, "amber": 0xF2A22C, "chrome": 0xC4C9CC}  # PAL.semi.amber and PAL.semi.chrome
LENGTH = 7.15
WIDTH = 2.69
HALF_W = WIDTH / 2
HEIGHT_SCALE = 1.077
REAL_HUB = 0.51
G = Grid(rows=11, cols=7, half_height=0.55)
WHEEL_R = 0.61  # PHYSICS.bodies.longbed.wheelRadius
WHEEL_HALF_W = 0.255  # PHYSICS.bodies.longbed.wheelHalfWidth
WHEEL_Z = 1.08  # PHYSICS.bodies.longbed.wheelZ
HUB_Z = -0.35 - SUSPENSION_REST  # PHYSICS.bodies.longbed.wheelY
WHEELS_X = [2.05, -2.05]
DUAL_GAP = 0.05
DUAL_Z = WHEEL_Z - 2 * WHEEL_HALF_W - DUAL_GAP
ARCH_R = WHEEL_R + ARCH_CLEARANCE
ARCH_SIDES = round_sides(ARCH_R)


def up(real: float) -> float:
    """Base Z of a real ZIL-130 height over the ground, measured from the hub."""
    return HUB_Z + (real - REAL_HUB) * HEIGHT_SCALE


ROOF = up(2.40)
ROOF_CAP = 0.05
BELT = up(1.70)
CAB_BOTTOM = up(0.92)
DECK = up(1.45)
DECK_BOTTOM = DECK - 0.12
SILL_H = 0.14
SIDE_TOP = DECK + 0.62
HEADBOARD_TOP = SIDE_TOP + 0.04
BOARD_H = 0.16
HOOD_COWL = up(1.68)
HOOD_MID = up(1.58)
HOOD_NOSE = up(1.45)
HOOD_RAISE = 0.02
WING_CROWN = up(1.27)
WING_LOW = -0.5
LAMP_Z = up(1.05)
AMBER_LOW_Z = up(0.84)
POD = (up(0.78), up(1.26))
FACE_BOTTOM = up(0.80)
TOP_SLOT = (up(1.23), up(1.30))
BAND_SLOTS = (up(1.06), up(1.10))
RADIATOR = (up(0.90), up(1.01))
LIP_BOTTOM = up(1.36)
BUMPER = (up(0.5), up(0.7))
FLOOR = 0.0
FRAME = (up(0.75), up(0.95))

FRONT = LENGTH / 2
BACK = -LENGTH / 2
BUMPER_BACK = FRONT - 0.16
WING_FRONT = FRONT - 0.105
GRILLE_X = WING_FRONT - 0.03
FACE_X = GRILLE_X - 0.05
COWL_X = 1.85
CAB_BACK = 0.55
BED_FRONT = 0.45
WALL = 0.06
POST = 0.02

HOOD_HALF = 0.8
HOOD_LOW = WING_CROWN - 0.01
WING_IN = 0.78
WING_OUT = HALF_W - 0.015
WING_ROUND = 0.22
WING_CORNER = 0.15
WING_X0 = 0.95
WING_SWEEP = 1.75
CAB_HALF = 1.2
LAMP_Y = 0.99
POD_HALF_Y = 0.18
POD_FRONT = WING_FRONT + 0.06
FACE_HALF = WING_IN + 0.01
LAMP_R = 0.105
TAIL_R = 0.075
MIRROR_Y = HALF_W - 0.1


def mirrored(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def hull(kit: Kit, name: str, mat: str, points: list[tuple[float, float, float]]) -> bpy.types.Object:
    return kit._add(hull_mesh(name, points), name, mat, 0.0)


def layers(kit: Kit, name: str, mat: str, stack: list[tuple[float, float, float, float, float]]) -> bpy.types.Object:
    return kit._add(hull_layers(name, stack), name, mat, 0.0)


def rod(kit: Kit, name: str, a: tuple[float, float, float], b: tuple[float, float, float], mat: str, radius: float = 0.012) -> None:
    """A thin rod from a to b, like a mirror arm."""
    d = Vector(b) - Vector(a)
    mid = (Vector(a) + Vector(b)) / 2
    rot = d.to_track_quat("Z", "Y").to_euler()
    kit.cylinder(name, radius, d.length, tuple(mid), mat, rot=tuple(rot), vertices=4)


def loft_x(kit: Kit, name: str, sections: list[tuple[float, list[tuple[float, float]]]], mat: str) -> bpy.types.Object:
    """Joins YZ profiles of equal length at increasing X into one closed mesh, capped at both ends."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = [[bm.verts.new((x, y, z)) for y, z in profile] for x, profile in sections]
    if len({len(r) for r in rings}) != 1:
        raise ValueError(f"{name}: loft profiles differ in length")
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return kit._add(obj, name, mat, 0.0)


def round_x(kit: Kit, name: str, radius: float, depth: float, x: float, y: float, z: float, mat: str) -> None:
    """A round piece facing along X, like a lamp lens, with round_sides() of its radius."""
    kit.cylinder(name, radius, depth, (x, y, z), mat, rot=(0, math.pi / 2, 0), vertices=round_sides(radius))


def round_y(kit: Kit, name: str, radius: float, depth: float, x: float, y: float, z: float, mat: str) -> None:
    """A round piece facing along Y, like a side marker lamp."""
    kit.cylinder(name, radius, depth, (x, y, z), mat, rot=(math.pi / 2, 0, 0), vertices=round_sides(radius))


def hood_top(x: float) -> float:
    """The hood's centre line at X: rising from the nose to the beltline at the cowl, as both photos show it."""
    stations = [(GRILLE_X - 0.12, HOOD_NOSE), (2.6, HOOD_MID), (COWL_X, HOOD_COWL)]
    if x >= stations[0][0]:
        return HOOD_NOSE
    for (x1, z1), (x0, z0) in zip(stations, stations[1:]):
        if x0 <= x <= x1:
            return z0 + (z1 - z0) * (x - x0) / (x1 - x0)
    return HOOD_COWL


def hood_profile(top: float, panel: float, low: float) -> list[tuple[float, float]]:
    """The hood's convex YZ outline: sides down to the wings, rounded shoulders rising to a raised flat centre panel wide on each side."""
    shoulder = [(HOOD_HALF, top - 0.13), (HOOD_HALF - 0.03, top - 0.07), (HOOD_HALF - 0.1, top - 0.025)]
    side = [(HOOD_HALF, low), *[(y, max(z, low + 0.01)) for y, z in shoulder], (panel, top + HOOD_RAISE)]
    return side + [(-y, z) for y, z in reversed(side)]


def hood(kit: Kit) -> None:
    """A broad hood from the beltline at the cowl to the nose, closed over the engine cells, with a raised centre panel narrowing forward,
    an overhanging nose lip over the top slot, four louver slots on each side by the cowl and the dark bay block under it."""
    stations = [COWL_X, 2.2, 2.6, 3.0, FACE_X - 0.06]
    panel = [0.42 - 0.12 * (COWL_X - x) / (COWL_X - FACE_X) for x in stations]
    loft_x(kit, "hood", [(x, hood_profile(hood_top(x), p, HOOD_LOW)) for x, p in zip(stations, panel)], "paint")
    lip = [(FACE_X - 0.08, HOOD_NOSE), (GRILLE_X - 0.06, HOOD_NOSE - 0.01), (GRILLE_X, HOOD_NOSE - 0.07)]
    loft_x(kit, "hood_nose", [(x, hood_profile(top, 0.3, LIP_BOTTOM)) for x, top in lip], "paint")
    for i in range(4):
        z = hood_top(2.1) - 0.13 - 0.045 * i
        mirrored(kit, f"hood_louver{i}", (0.3, 0.01, 0.018), 2.12, HOOD_HALF, z, "under")
    kit.box("engine_bay", (FACE_X - 0.08 - 1.0, 1.24, FLOOR + 0.6), ((FACE_X - 0.08 + 1.0) / 2, 0, (FLOOR - 0.6) / 2), "under")


def wing_top(x: float) -> float:
    """The front wing's top line: a near-flat crown with a small round corner at the face, sweeping down behind the arch to the step."""
    corner = WING_FRONT - WING_CORNER
    if x > corner:
        return WING_CROWN - WING_CORNER + math.sqrt(max(0.0, WING_CORNER**2 - (x - corner) ** 2))
    if x < WING_SWEEP:
        t = (WING_SWEEP - x) / (WING_SWEEP - WING_X0)
        return WING_LOW + (WING_CROWN - WING_LOW) * math.sqrt(max(0.0, 1 - t * t))
    return WING_CROWN


def wing_bottom(x: float) -> float:
    """The wing's lower edge: the round arch over the front wheel, the body bottom elsewhere."""
    dx = x - WHEELS_X[0]
    if abs(dx) >= ARCH_R:
        return WING_LOW
    return max(WING_LOW, HUB_Z + math.sqrt(ARCH_R**2 - dx * dx))


def wing_tuck(x: float) -> float:
    """How far the wing's outer side tucks in at X, rounding its front corner in plan so the front wraps into the side."""
    corner = WING_FRONT - WING_CORNER
    if x <= corner:
        return 0.0
    return WING_CORNER - math.sqrt(max(0.0, WING_CORNER**2 - (x - corner) ** 2))


def wing_section(x: float, inner: float, outer: float) -> list[tuple[float, float]]:
    """The wing's YZ section at X, positive Y: a flat top that rounds down into the outer side."""
    bottom = wing_bottom(x)
    top = max(wing_top(x), bottom + 0.04)
    rz = min(WING_ROUND, 0.8 * (top - bottom))
    arc = [(outer - WING_ROUND + WING_ROUND * math.sin(a), top - rz + rz * math.cos(a)) for a in (math.pi * k / 12 for k in range(7))]
    return [(inner, bottom), (inner, top), *arc, (outer, bottom)]


def wing_stations() -> list[float]:
    arch = [x for x, _ in round_arch(WHEELS_X[0], HUB_Z, ARCH_R, WING_LOW, ARCH_SIDES)]
    corner = [WING_FRONT - WING_CORNER * (1 - math.cos(math.pi * k / 8)) for k in range(5)]
    sweep = [WING_SWEEP - (WING_SWEEP - WING_X0) * k / 8 for k in range(9)]
    return sorted({round(x, 4) for x in arch + corner + sweep + [WING_FRONT]}, reverse=True)


def wings(kit: Kit) -> None:
    """Rounded front wings whose fronts drop to the bumper, crowned over round arches and sweeping down to the steps."""
    xs = list(reversed(wing_stations()))
    for sign, s in ((1, "l"), (-1, "r")):
        sections = [(x, [(sign * y, z) for y, z in wing_section(x, WING_IN, WING_OUT - wing_tuck(x))]) for x in xs]
        loft_x(kit, f"wing_{s}", sections, "paint")
    mirrored(kit, "step", (0.38, 0.22, 0.06), (WING_X0 + CAB_BACK) / 2 + 0.03, CAB_HALF - 0.08, WING_LOW + 0.03, "under")


def face_strips(holes: list[tuple[float, float, float, float]], y0: float, y1: float, z0: float, z1: float) -> list[tuple[float, float, float, float]]:
    """The panel left between holes (y0, y1, z0, z1): one strip per gap in each band between hole edges."""
    cuts = sorted({z0, z1, *[h[2] for h in holes], *[h[3] for h in holes]})
    strips = []
    for lo, hi in zip(cuts, cuts[1:]):
        mid = (lo + hi) / 2
        spans = sorted((h[0], h[1]) for h in holes if h[2] < mid < h[3])
        y = y0
        for a, b in spans + [(y1, y1)]:
            if a > y + 1e-6:
                strips.append((y, a, lo, hi))
            y = max(y, b)
    return strips


def face_holes() -> tuple[list[tuple[float, float, float, float]], list[tuple[float, float, float, float]]]:
    """The face openings, positive Y and mirrored: the top slot, four short band slots a side and the radiator halves beside the post."""
    slots = [(0.06 + 0.17 * i, 0.2 + 0.17 * i) for i in range(4)]
    plain = [(-0.66, 0.66, *TOP_SLOT)] + [(sign * a, sign * b) + BAND_SLOTS for a, b in slots for sign in (1, -1)]
    radiator = [(0.04, 0.66, *RADIATOR), (-0.66, -0.04, *RADIATOR)]
    return [(min(a, b), max(a, b), z0, z1) for a, b, z0, z1 in plain], radiator


def face_step(z: float) -> float:
    """How far the face stands out at height z: the slotted band stands proud, the strip over the top slot leans back under the nose."""
    if z > TOP_SLOT[1]:
        return -0.02
    if RADIATOR[1] < z < TOP_SLOT[0]:
        return 0.03
    return 0.0


def face(kit: Kit) -> None:
    """One closed body-colour face between the wings, under the hood nose: the dark top slot, a band of short slots
    and the split radiator with bright louvers, all set back into the face, stepped in depth so it reads sculpted."""
    plain, radiator = face_holes()
    depth = 0.05
    for i, (y0, y1, z0, z1) in enumerate(face_strips(plain + radiator, -FACE_HALF, FACE_HALF, FACE_BOTTOM, LIP_BOTTOM + 0.01)):
        front = FACE_X + face_step((z0 + z1) / 2)
        kit.box(f"face{i}", (depth, y1 - y0, z1 - z0), (front - depth / 2, (y0 + y1) / 2, (z0 + z1) / 2), "paint")
    for i, (y0, y1, z0, z1) in enumerate(plain + radiator):
        kit.box(f"face_hole{i}", (0.03, y1 - y0, z1 - z0), (FACE_X - 0.045, (y0 + y1) / 2, (z0 + z1) / 2), "under")
    for i, (y0, y1, z0, z1) in enumerate(radiator):
        for k in range(3):
            z = z0 + (z1 - z0) * (k + 0.5) / 3
            kit.box(f"louver{i}_{k}", (0.02, y1 - y0 - 0.02, 0.025), (FACE_X - 0.015, (y0 + y1) / 2, z), "chrome")


def pod_points(x: float, y: float, half_y: float, z0: float, z1: float) -> list[tuple[float, float, float]]:
    """A round-cornered pod outline in the YZ plane at X: a squircle of 16 points."""
    zc, half_z = (z0 + z1) / 2, (z1 - z0) / 2
    points = []
    for k in range(16):
        a = 2 * math.pi * k / 16
        c, s = math.cos(a), math.sin(a)
        points.append((x, y + half_y * math.copysign(abs(c) ** 0.6, c), zc + half_z * math.copysign(abs(s) ** 0.6, s)))
    return points


def lamps(kit: Kit) -> None:
    """Headlights in round-cornered pods on the wing fronts, an amber lamp under each, one on each wing side and one on each wing top."""
    for sign, s in ((1, "l"), (-1, "r")):
        y = sign * LAMP_Y
        back = pod_points(WING_FRONT - 0.01, y, POD_HALF_Y, POD[0], POD[1])
        front = pod_points(POD_FRONT, y, POD_HALF_Y - 0.03, POD[0] + 0.03, POD[1] - 0.03)
        hull(kit, f"pod_{s}", "paint", back + front)
        round_x(kit, f"lamp_rim_{s}", LAMP_R + 0.04, 0.03, POD_FRONT + 0.005, y, LAMP_Z, "under")
        round_x(kit, f"lamp_{s}", LAMP_R, 0.03, POD_FRONT + 0.01, y, LAMP_Z, "light")
        round_x(kit, f"amber_low_{s}", 0.06, 0.04, POD_FRONT, y, AMBER_LOW_Z, "amber")
        round_y(kit, f"amber_side_{s}", 0.045, 0.03, WING_FRONT - 0.4, sign * WING_OUT, up(1.12), "amber")
        round_x(kit, f"amber_top_{s}", 0.055, 0.05, 2.55, sign * (WING_IN + 0.1), WING_CROWN + 0.06, "amber")
        kit.box(f"amber_top_stem_{s}", (0.04, 0.04, 0.05), (2.53, sign * (WING_IN + 0.1), WING_CROWN + 0.01), "under")


def bumper(kit: Kit) -> None:
    """The heavy dark channel bumper across the full width, with two tow hooks standing on it under the face."""
    kit.box("bumper", (FRONT - BUMPER_BACK, 2 * (HALF_W - 0.1), BUMPER[1] - BUMPER[0]), ((FRONT + BUMPER_BACK) / 2, 0, (BUMPER[0] + BUMPER[1]) / 2), "under")
    kit.box("bumper_lip", (0.03, 2 * (HALF_W - 0.12), 0.04), (FRONT - 0.015, 0, BUMPER[1] - 0.03), "metal")
    for sign, s in ((1, "l"), (-1, "r")):
        y = sign * 0.45
        kit.box(f"hook_back_{s}", (0.05, 0.06, 0.2), (FRONT - 0.13, y, BUMPER[1] + 0.09), "metal")
        kit.box(f"hook_top_{s}", (0.12, 0.06, 0.05), (FRONT - 0.085, y, BUMPER[1] + 0.165), "metal")
        kit.box(f"hook_tip_{s}", (0.045, 0.06, 0.11), (FRONT - 0.045, y, BUMPER[1] + 0.11), "metal")


def underbody(kit: Kit) -> None:
    """The frame rails from bumper to tail, the bed's sills on spacers over them and the mudguards over the rear duals."""
    mirrored(kit, "rail", (BUMPER_BACK - BACK - 0.1, 0.12, FRAME[1] - FRAME[0]), (BUMPER_BACK + BACK) / 2, 0.18, (FRAME[0] + FRAME[1]) / 2, "under")
    sill = DECK_BOTTOM - SILL_H
    mirrored(kit, "sill", (BED_FRONT - BACK - 0.1, 0.16, SILL_H), (BED_FRONT + BACK) / 2, 0.18, (DECK_BOTTOM + sill) / 2, "under")
    for i, x in enumerate((BED_FRONT - 0.2, -1.0, -3.2)):
        mirrored(kit, f"spacer{i}", (0.2, 0.12, sill - FRAME[1]), x, 0.18, (sill + FRAME[1]) / 2, "under")
    kit.box("cab_floor", (COWL_X - CAB_BACK, 2 * (CAB_HALF - 0.1), CAB_BOTTOM - FRAME[0]), ((COWL_X + CAB_BACK) / 2, 0, (CAB_BOTTOM + FRAME[0]) / 2), "under")
    for sign, s in ((1, "l"), (-1, "r")):
        ys = sorted((sign * (DUAL_Z - WHEEL_HALF_W - 0.02), sign * (HALF_W - 0.02)))
        flare(kit, f"mudguard_{s}", G, WHEELS_X[1], HUB_Z, WHEEL_R, ys[0], ys[1], bottom=-0.45, segments=ARCH_SIDES)
    kit.box("tail_beam", (0.1, 2 * (HALF_W - 0.2), 0.2), (BACK + 0.09, 0, -0.15), "under")
    for sign, s in ((1, "l"), (-1, "r")):
        round_x(kit, f"taillight_{s}", TAIL_R, 0.04, BACK + 0.02, sign * (HALF_W - 0.3), -0.15, "red")


def rear_duals(kit: Kit) -> None:
    """The inner tires of the rear duals, beside the outer tire the game draws at the physics mount."""
    for sign, s in ((1, "l"), (-1, "r")):
        drawn_wheel(kit, f"dual_{s}", (WHEELS_X[1], sign * DUAL_Z, HUB_Z), WHEEL_R, 2 * WHEEL_HALF_W)


HOUSE = [(BELT, COWL_X, CAB_BACK, CAB_HALF - 0.04, 0.28), (ROOF - 0.17, 1.62, CAB_BACK + 0.03, CAB_HALF - 0.14, 0.3)]


def house_at(z: float) -> tuple[float, float, float]:
    """The glasshouse's front X, half width and corner chamfer at height z, between its two lower layers."""
    (z0, f0, _, h0, c0), (z1, f1, _, h1, c1) = HOUSE
    t = (z - z0) / (z1 - z0)
    return f0 + (f1 - f0) * t, h0 + (h1 - h0) * t, c0 + (c1 - c0) * t


def windshield(kit: Kit, lo: float, hi: float) -> None:
    """Two flat front panes and a corner pane each side, so the glass wraps round the front corners."""
    out = 0.02
    for sign, s in ((1, "l"), (-1, "r")):
        pane = []
        corner = []
        for z in (lo, hi):
            xf, hy, c = house_at(z)
            pane += [(xf + d, sign * y, z) for y in (0.06, hy - c - 0.03) for d in (0.0, out)]
            for t in (0.12, 0.85):
                x, y = xf - c * t, hy - c * (1 - t)
                corner += [(x + d * 0.7, sign * (y + d * 0.7), z) for d in (0.0, out)]
        hull(kit, f"windshield_{s}", "glass", pane)
        hull(kit, f"windshield_corner_{s}", "glass", corner)


def side_windows(kit: Kit, lo: float, hi: float) -> None:
    """Door glass with a vent pane at its front, and the small rear window."""
    for sign, s in ((1, "l"), (-1, "r")):
        rear = CAB_BACK + 0.2
        window = []
        for z in (lo, hi):
            xf, hy, c = house_at(z)
            window += [(x, sign * (hy + d), z) for x in (rear, xf - c - 0.04) for d in (0.0, 0.015)]
        hull(kit, f"window_{s}", "glass", window)
        xf, hy, c = house_at(lo)
        kit.box(f"vent_post_{s}", (0.035, 0.03, hi - lo), (xf - c - 0.3, sign * (hy + 0.01), (lo + hi) / 2), "paint")
    kit.box("rear_window", (0.02, 0.9, 0.2), (CAB_BACK + 0.015, 0, HEADBOARD_TOP + 0.16), "glass")


def mirrors(kit: Kit) -> None:
    """Big rectangular mirrors on two wire arms from the cowl, inside the body width."""
    xf, hy, _ = house_at(BELT)
    for sign, s in ((1, "l"), (-1, "r")):
        y = sign * MIRROR_Y
        kit.box(f"mirror_{s}", (0.04, 0.17, 0.4), (xf - 0.05, y, BELT + 0.36), "under")
        rod(kit, f"mirror_arm_low_{s}", (xf + 0.12, sign * (hy - 0.02), BELT - 0.06), (xf - 0.05, y, BELT + 0.18), "metal_light")
        rod(kit, f"mirror_arm_high_{s}", (xf + 0.02, sign * (hy - 0.02), BELT + 0.02), (xf - 0.05, y, BELT + 0.54), "metal_light")


def cab(kit: Kit) -> None:
    """The ZIL cab: doors to the beltline, a glasshouse with rounded roof edges and a visor lip, a wrapped two-pane windshield,
    door glass with vent panes, three amber roof markers and arm mirrors."""
    layers(kit, "cab_lower", "paint", [(CAB_BOTTOM, COWL_X, CAB_BACK, CAB_HALF, 0.12), (BELT, COWL_X, CAB_BACK, CAB_HALF, 0.12)])
    top = (ROOF - ROOF_CAP, 1.57, CAB_BACK + 0.05, CAB_HALF - 0.22, 0.3)
    layers(kit, "cab_house", "paint", HOUSE + [top])
    layers(kit, "cab_roof", "trim", [top, (ROOF - 0.015, 1.54, CAB_BACK + 0.08, CAB_HALF - 0.3, 0.28), (ROOF, 1.48, CAB_BACK + 0.12, CAB_HALF - 0.4, 0.24)])
    layers(kit, "cab_visor", "paint", [(ROOF - 0.1, 1.69, 1.0, CAB_HALF - 0.18, 0.31), (ROOF - 0.06, 1.66, 1.0, CAB_HALF - 0.21, 0.31)])
    for i, y in enumerate((-0.4, 0.0, 0.4)):
        kit.box(f"roof_marker{i}", (0.08, 0.1, 0.05), (1.6, y, ROOF - 0.035), "amber")
    lo, hi = BELT + 0.05, ROOF - 0.21
    windshield(kit, lo, hi)
    side_windows(kit, lo, hi)
    mirrors(kit)
    for name, x in (("seam_front", COWL_X - 0.12), ("seam_back", CAB_BACK + 0.12)):
        sill = door_sill(x - 0.01, x + 0.01, CAB_BOTTOM + 0.05, WHEELS_X, HUB_Z, ARCH_R)
        check_door_gap(name, x - 0.01, x + 0.01, sill, WHEELS_X, HUB_Z, ARCH_R)
        mirrored(kit, name, (0.025, 0.01, BELT - sill), x, CAB_HALF + 0.005, (BELT + sill) / 2, "under")


def bed(kit: Kit) -> None:
    """The long low bed: a wooden deck, grey steel sides and tailgate with upright ribs and a top rail under a wooden board,
    and a trim headboard behind the cab."""
    steel_top = SIDE_TOP - BOARD_H
    steel_h = steel_top - DECK_BOTTOM
    side_y = HALF_W - POST - WALL / 2
    mid_z = (steel_top + DECK_BOTTOM) / 2
    board_z = (SIDE_TOP + steel_top) / 2
    length = BED_FRONT - BACK
    kit.box("deck", (length - 2 * WALL, 2 * (side_y - WALL / 2), DECK - DECK_BOTTOM), ((BED_FRONT + BACK) / 2, 0, (DECK + DECK_BOTTOM) / 2), "leather")
    mirrored(kit, "side_steel", (length, WALL, steel_h), (BED_FRONT + BACK) / 2, side_y, mid_z, "metal_light")
    mirrored(kit, "side_board", (length, WALL, BOARD_H), (BED_FRONT + BACK) / 2, side_y, board_z, "leather")
    mirrored(kit, "side_rail", (length, WALL + POST, 0.035), (BED_FRONT + BACK) / 2, side_y + POST / 2, steel_top, "metal")
    kit.box("tail_steel", (WALL, 2 * side_y - WALL, steel_h), (BACK + POST + WALL / 2, 0, mid_z), "metal_light")
    kit.box("tail_board", (WALL, 2 * side_y - WALL, BOARD_H), (BACK + POST + WALL / 2, 0, board_z), "leather")
    kit.box("tail_rail", (WALL + POST, 2 * side_y - WALL, 0.035), (BACK + (WALL + POST) / 2, 0, steel_top), "metal")
    kit.box("headboard", (WALL, 2 * side_y + WALL, HEADBOARD_TOP - DECK_BOTTOM), (BED_FRONT - WALL / 2, 0, (HEADBOARD_TOP + DECK_BOTTOM) / 2), "trim")
    ribs = 8
    for i in range(ribs + 1):
        x = BED_FRONT - 0.05 - (length - 0.1) * i / ribs
        mirrored(kit, f"rib{i}", (0.06, POST, steel_h), x, HALF_W - POST / 2, mid_z, "metal")
    for i, y in enumerate((-0.8, -0.27, 0.27, 0.8)):
        kit.box(f"tail_rib{i}", (POST, 0.06, steel_h), (BACK + POST / 2, y, mid_z), "metal")


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
        raise RuntimeError(f"base_longbed is {hi.x - lo.x:.3f} x {hi.y - lo.y:.3f} m, not {LENGTH} x {WIDTH} m")


def check_wheels() -> None:
    """Raises when a tire leaves the body width or the inner dual comes closer than DUAL_GAP to the outer one."""
    if WHEEL_Z + WHEEL_HALF_W > HALF_W:
        raise RuntimeError(f"the outer tire reaches {WHEEL_Z + WHEEL_HALF_W:.3f} m, past the body side at {HALF_W:.3f}")
    gap = WHEEL_Z - DUAL_Z - 2 * WHEEL_HALF_W
    if gap < DUAL_GAP - 1e-6:
        raise RuntimeError(f"the rear duals stand {gap:.3f} m apart, under {DUAL_GAP}")


def main() -> None:
    args = parse_args()
    check_wheels()
    kit = Kit(COLORS, SEED)
    wings(kit)
    hood(kit)
    face(kit)
    lamps(kit)
    bumper(kit)
    underbody(kit)
    rear_duals(kit)
    cab(kit)
    bed(kit)
    kit.socket("arch_front", (WHEELS_X[0], WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (WHEELS_X[1], WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEELS_X[0], WHEEL_Z, HUB_Z + ARCH_R))
    bay = {(x, y): FLOOR for x in (2, 3) for y in (1, 2)}
    level_sockets(kit, G, "row", [HOOD_NOSE, hood_top(G.row_x(1)), hood_top(G.row_x(2))] + [ROOF] * 2 + [DECK] * 6, fronts={3: 1.62, 5: BED_FRONT - WALL}, cells=bay)
    level_sockets(kit, G, "floor", [FLOOR] * 3 + [BELT] * 2 + [DECK] * 6)
    check_size(kit)
    check_base(kit, "base_longbed", G)
    kit.export("base_longbed", args, view_size=9.0)


if __name__ == "__main__":
    main()
