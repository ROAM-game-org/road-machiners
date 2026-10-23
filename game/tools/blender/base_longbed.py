"""The longbed base: a ZIL-130 flatbed, the Soviet hooded medium truck, in the stylized style of the scout.

Built from the published ZIL-130 flatbed figures: 6.675 m long, 2.5 m wide, 2.4 m to the cab roof, a 3.8 m wheelbase, 9.00-20 tires,
a 3.75 m bed with 0.575 m drop sides. Lengths scale by 1.071 to the 7.15 m grid, widths and heights by the scout's 1.077, and every
height is measured from the hub, so the rule tire lifts the body as on the scout. That makes it 7.15 m long, 2.69 m wide and 2.65 m
tall on its tires. Levels: roof 1.29, beltline 0.53, crested hood 0.42 at the cowl falling to 0.26 at the nose, wing crown 0.07,
deck 0.26, drop sides to 0.88, bumper -0.76 to -0.55. Rounded front wings sweep over round arches, a wide barred grille stands
between round lamps over a heavy bumper, and the cab has rounded roof edges, a split windshield, doors and a small rear window.
The long flat bed has plank drop sides on posts, a trim headboard and round taillights, and hangs out behind the rear duals.
Deviations from the figures: the wheels stay symmetric at 2.05 m off the center, the cowl sits 0.3 m back so the front wheel stays
under the rear of the hood, the bed is 3.95 m outside, and the tires are the tire rule's 0.61 m. The base draws the inner rear duals under a closed hood.
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
from kit import Kit, parse_args  # noqa: E402
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
from round_parts import round_sides, wheel_disc  # noqa: E402
from shapes import prism  # noqa: E402

SEED = 303
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
HOOD_CREST = up(1.60)
HOOD_NOSE = up(1.45)
WING_CROWN = up(1.27)
WING_LOW = -0.5
LAMP_Z = up(1.0)
BUMPER = (up(0.5), up(0.7))
FLOOR = 0.0
FRAME = (up(0.75), up(0.95))

FRONT = LENGTH / 2
BACK = -LENGTH / 2
BUMPER_BACK = FRONT - 0.16
WING_FRONT = FRONT - 0.105
GRILLE_X = WING_FRONT - 0.03
COWL_X = 1.85
CAB_BACK = 0.55
BED_FRONT = 0.45
WALL = 0.06
POST = 0.02

HOOD_HALF = 0.66
WING_IN = 0.64
WING_OUT = HALF_W - 0.015
WING_EDGE = 0.08
WING_X0 = 0.95
WING_XC = 2.25
WING_A = WING_FRONT - WING_XC + 0.1
WING_POWER = 5
CAB_HALF = 1.2
LAMP_Y = 0.99
GRILLE_HALF = 0.84
GRILLE_WING_TOP = -0.08
GRILLE_TOP = HOOD_NOSE - 0.1
LAMP_R = 0.12
TAIL_R = 0.075


def mirrored(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def hull(kit: Kit, name: str, mat: str, points: list[tuple[float, float, float]]) -> bpy.types.Object:
    return kit._add(hull_mesh(name, points), name, mat, 0.0)


def layers(kit: Kit, name: str, mat: str, stack: list[tuple[float, float, float, float, float]]) -> bpy.types.Object:
    return kit._add(hull_layers(name, stack), name, mat, 0.0)


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


def hood_profile(top: float) -> list[tuple[float, float]]:
    """The hood's YZ outline: flat sides down to the wings, rounded shoulders and a low crest along the middle."""
    low = -0.05
    side = [(HOOD_HALF, low), (HOOD_HALF, top - 0.13), (HOOD_HALF - 0.07, top - 0.05), (HOOD_HALF - 0.25, top - 0.05)]
    return side + [(0.0, top)] + [(-y, z) for y, z in reversed(side)]


def wing_top(x: float) -> float:
    """The front wing's top line: a squared ellipse over the front wheel, falling to the grille ahead and the step behind."""
    u = min(1.0, abs(x - WING_XC) / WING_A)
    return HUB_Z + (WING_CROWN - HUB_Z) * (1 - u**WING_POWER) ** (1 / WING_POWER)


def wing_profile(drop: float) -> list[tuple[float, float]]:
    """The front wing's XZ outline round its arch, lowered by drop for the rounded outer edge."""
    steps = 24
    top = [(WING_FRONT - (WING_FRONT - WING_X0) * k / steps, 0.0) for k in range(steps + 1)]
    top = [(x, wing_top(x) - drop) for x, _ in top]
    arch = round_arch(WHEELS_X[0], HUB_Z, ARCH_R, WING_LOW, ARCH_SIDES)
    return [(WING_FRONT, WING_LOW), *top, (WING_X0, WING_LOW), *arch]


def wings(kit: Kit) -> None:
    """Rounded front wings over round arches: a full wing and a lower outer strip that rounds its edge."""
    for sign, s in ((1, "l"), (-1, "r")):
        ys = sorted((sign * WING_IN, sign * (WING_OUT - WING_EDGE)))
        prism(kit, f"wing_{s}", wing_profile(0.0), ys[0], ys[1], "paint")
        ys = sorted((sign * (WING_OUT - WING_EDGE), sign * WING_OUT))
        prism(kit, f"wing_edge_{s}", wing_profile(0.05), ys[0], ys[1], "paint")
    mirrored(kit, "step", (0.38, 0.22, 0.06), (WING_X0 + CAB_BACK) / 2 + 0.03, CAB_HALF - 0.08, WING_LOW + 0.03, "under")


def hood(kit: Kit) -> None:
    """A crested hood from the cowl, rounding down to the grille, closed over the engine cells, with the dark bay block under it."""
    sections = [(COWL_X, HOOD_CREST), (3.0, HOOD_CREST - 0.1), (GRILLE_X - 0.12, HOOD_NOSE), (GRILLE_X, HOOD_NOSE - 0.08)]
    loft_x(kit, "hood", [(x, hood_profile(top)) for x, top in sections], "paint")
    kit.box("engine_bay", (GRILLE_X - 0.04 - 1.0, 2 * (HOOD_HALF - 0.04), FLOOR + 0.6), ((GRILLE_X - 0.04 + 1.0) / 2, 0, (FLOOR - 0.6) / 2), "under")


def nose(kit: Kit) -> None:
    """The wide grille of horizontal bars between the wings, a round lamp in each wing front and the heavy bumper."""
    outline = [(GRILLE_HALF, WING_LOW), (GRILLE_HALF, GRILLE_WING_TOP), (WING_IN, GRILLE_WING_TOP), (WING_IN, GRILLE_TOP)]
    outline += [(-y, z) for y, z in reversed(outline)]
    loft_x(kit, "grille", [(WING_FRONT - 0.01, outline), (WING_FRONT + 0.01, outline)], "under")
    for i, z in enumerate((-0.4, -0.27, -0.14)):
        kit.box(f"grille_bar{i}", (0.03, 2 * (GRILLE_HALF - 0.04), 0.07), (WING_FRONT + 0.02, 0, z), "metal_light")
    for i, z in enumerate((-0.01, 0.12)):
        kit.box(f"grille_top_bar{i}", (0.03, 2 * (WING_IN - 0.05), 0.07), (WING_FRONT + 0.02, 0, z), "metal_light")
    for sign, s in ((1, "l"), (-1, "r")):
        round_x(kit, f"lamp_rim_{s}", LAMP_R + 0.035, 0.03, WING_FRONT + 0.02, sign * LAMP_Y, LAMP_Z, "metal_light")
        round_x(kit, f"lamp_{s}", LAMP_R, 0.03, WING_FRONT + 0.035, sign * LAMP_Y, LAMP_Z, "light")
    kit.box("bumper", (FRONT - BUMPER_BACK, 2 * (HALF_W - 0.1), BUMPER[1] - BUMPER[0]), ((FRONT + BUMPER_BACK) / 2, 0, (BUMPER[0] + BUMPER[1]) / 2), "under")


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
        wheel_disc(kit, f"dual_{s}_", WHEEL_R, WHEEL_HALF_W, (WHEELS_X[1], sign * DUAL_Z, HUB_Z))


def cab(kit: Kit) -> None:
    """The ZIL cab: doors to the beltline, a glasshouse with rounded roof edges, a split windshield, side and rear windows."""
    layers(kit, "cab_lower", "paint", [(CAB_BOTTOM, COWL_X, CAB_BACK, CAB_HALF, 0.12), (BELT, COWL_X, CAB_BACK, CAB_HALF, 0.12)])
    house = [(BELT, COWL_X, CAB_BACK, CAB_HALF - 0.04, 0.2), (ROOF - 0.17, 1.62, CAB_BACK + 0.03, CAB_HALF - 0.1, 0.24), (ROOF - ROOF_CAP, 1.57, CAB_BACK + 0.05, CAB_HALF - 0.17, 0.26)]
    layers(kit, "cab_house", "paint", house)
    layers(kit, "cab_roof", "trim", [house[-1], (ROOF, 1.5, CAB_BACK + 0.1, CAB_HALF - 0.3, 0.26)])

    def front_x(z: float) -> float:
        return COWL_X + (1.62 - COWL_X) * (z - BELT) / (ROOF - 0.17 - BELT)

    def side_y(z: float) -> float:
        return CAB_HALF - 0.04 - 0.06 * (z - BELT) / (ROOF - 0.17 - BELT)

    lo, hi = BELT + 0.05, ROOF - 0.21
    for sign, s in ((1, "l"), (-1, "r")):
        pane = [(front_x(z) + d, sign * y, z) for z in (lo, hi) for y in (0.06, 0.9) for d in (0.0, 0.02)]
        hull(kit, f"windshield_{s}", "glass", pane)
        window = [(x, sign * (side_y(z) + d), z) for z in (lo, hi) for x in (CAB_BACK + 0.2, front_x(z) - 0.12) for d in (0.0, 0.015)]
        hull(kit, f"window_{s}", "glass", window)
    kit.box("rear_window", (0.02, 0.9, 0.2), (CAB_BACK + 0.015, 0, HEADBOARD_TOP + 0.16), "glass")
    for name, x in (("seam_front", COWL_X - 0.12), ("seam_back", CAB_BACK + 0.12)):
        sill = door_sill(x - 0.01, x + 0.01, CAB_BOTTOM + 0.05, WHEELS_X, HUB_Z, ARCH_R)
        check_door_gap(name, x - 0.01, x + 0.01, sill, WHEELS_X, HUB_Z, ARCH_R)
        mirrored(kit, name, (0.025, 0.01, BELT - sill), x, CAB_HALF + 0.005, (BELT + sill) / 2, "under")


def bed(kit: Kit) -> None:
    """The long flat bed: a wooden deck, plank drop sides and tailgate on metal posts, and a trim headboard behind the cab."""
    side_h = SIDE_TOP - DECK_BOTTOM
    side_y = HALF_W - POST - WALL / 2
    kit.box("deck", (BED_FRONT - BACK - 2 * WALL, 2 * (side_y - WALL / 2), DECK - DECK_BOTTOM), ((BED_FRONT + BACK) / 2, 0, (DECK + DECK_BOTTOM) / 2), "leather")
    mirrored(kit, "drop_side", (BED_FRONT - BACK, WALL, side_h), (BED_FRONT + BACK) / 2, side_y, (SIDE_TOP + DECK_BOTTOM) / 2, "leather")
    kit.box("tailgate", (WALL, 2 * side_y - WALL, side_h), (BACK + WALL / 2, 0, (SIDE_TOP + DECK_BOTTOM) / 2), "leather")
    kit.box("headboard", (WALL, 2 * side_y + WALL, HEADBOARD_TOP - DECK_BOTTOM), (BED_FRONT - WALL / 2, 0, (HEADBOARD_TOP + DECK_BOTTOM) / 2), "trim")
    for i, z in enumerate((DECK + 0.2, DECK + 0.4)):
        mirrored(kit, f"plank{i}", (BED_FRONT - BACK - 0.02, 0.012, 0.035), (BED_FRONT + BACK) / 2, side_y + WALL / 2 + 0.006, z, "under")
        kit.box(f"tail_plank{i}", (0.012, 2 * side_y - WALL, 0.035), (BACK - 0.006 + 0.012, 0, z), "under")
    for i, x in enumerate((BED_FRONT - 0.1, -0.95, -2.25, BACK + 0.1)):
        mirrored(kit, f"post{i}", (0.1, POST, side_h), x, HALF_W - POST / 2, (SIDE_TOP + DECK_BOTTOM) / 2, "metal")


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
    kit = Kit(BASE_COLORS, SEED)
    wings(kit)
    hood(kit)
    nose(kit)
    underbody(kit)
    rear_duals(kit)
    cab(kit)
    bed(kit)
    kit.socket("arch_front", (WHEELS_X[0], WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (WHEELS_X[1], WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEELS_X[0], WHEEL_Z, HUB_Z + ARCH_R))
    bay = {(x, y): FLOOR for x in (2, 3) for y in (1, 2)}
    level_sockets(kit, G, "row", [HOOD_NOSE, HOOD_CREST - 0.1, HOOD_CREST] + [ROOF] * 2 + [DECK] * 6, fronts={3: 1.62, 5: BED_FRONT - WALL}, cells=bay)
    level_sockets(kit, G, "floor", [FLOOR] * 3 + [BELT] * 2 + [DECK] * 6)
    check_size(kit)
    check_base(kit, "base_longbed", G)
    kit.export("base_longbed", args, view_size=9.0)


if __name__ == "__main__":
    main()
