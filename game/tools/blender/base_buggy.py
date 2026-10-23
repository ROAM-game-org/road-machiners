"""The buggy base: a Meyers Manx dune buggy, the orange "Pre-Tag" car in the Prototyp museum, Hamburg.

Built from two Wikimedia Commons photos by Ad Meskens (CC BY-SA 4.0), "Hamburg Prototyp Meyers Manx Pre-Tag Dune Buggy
01.jpg" and "03.jpg", read from the factory's media folder and never copied into the repo. Both are perspective photos
from the front quarters, so sizes come from the published Manx figures (about 122 in long on an 80 in wheelbase, a
60 in body) at 1.25 scale, and heights from the photos in tire diameters.
Size: 3.9 m long, the grid's length, 1.86 m across the fenders, the top 1.76 m over the ground. Ground at z -1.1.
Levels over the ground: nose face 0.47 to 0.76, front deck 0.86 to 1.05, front fender crown 1.18, waist 0.92, rear fender
crown 1.16, rear deck 0.93, top 1.64 to 1.76, black lower tub 0.48 to 0.66.
One painted shell is lofted at 18 stations: a blunt rounded nose over a dark plate recess, a front deck falling to it
between two fender humps with a soft center ridge, the side line scooped down to a low waist beside the seats and up
again into the rear fender humps, and a short rounded tail. Round arches are cut through it over all four tires, and
the black lower tub shows under it between the wheels. Two chrome bug-eye lamps stand on stalks on the deck
shoulders, with amber indicators on the nose face and a chrome nerf bar under it. The engine shows in a hole in the
front deck, framed by deck on every side, over a bay floor at PHYSICS.bodies.buggy.engine. A near-upright windshield in a
trim frame with round mirrors carries the Manx's own flat top, a trim slab with a thick rounded edge on two chrome
rear posts. Round parts take their sides from round_sides(), arches ROUND_ARCH_SEGMENTS.
Deviations from the car: the photo's open sides and rear hold dark glass, so the cab is closed; the top takes the trim
color for the photo's white; the engine shows in the front deck, where the grid's engine cells lie, not bare at the
tail; the tires follow the tire rule at 0.5 m, so heights follow the photos in tire diameters and the car stands a
little taller than 1.25 scale; the top runs to x -1.08 so the rear fender crowns stay clear of it.
Inferred, since no photo shows them: the tail (a short closed panel with round taillights, a dark grille and a tube
bumper), the top view and plan width, the underside and the rear posts' exact place.
Grid: 4 columns by 6 rows over 3.9 m by 1.94 m, stretched by the projection. Half height 0.35 m, from PHYSICS.bodies.buggy.
Wheels sit at x +-1.27 (the Manx wheelbase, 0.651 of the length), radius 0.5 m, half width 0.22 m, 0.726 m off the center
line, mount 0.2 m below the center. Sockets arch_front, arch_rear and arch_front_top mark the arches for wheelArches.test.ts.
Run: blender --background --python tools/blender/base_buggy.py -- public/models/base_buggy.glb [tmp/base_buggy.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args, round_sides  # noqa: E402
from parts_common_base import ARCH_CLEARANCE, BASE_COLORS, ROUND_ARCH_SEGMENTS, SUSPENSION_REST, Grid, arch_cut, check_base, cut_boxes, hull_mesh, level_sockets, surface_z  # noqa: E402
from shapes import loft, prism, strut  # noqa: E402

SEED = 302
COLORS = {
    **BASE_COLORS,
    "chrome": 0xC4C9CC,  # PAL.semi.chrome
    "amber": 0xF2A22C,  # PAL.semi.amber
}
G = Grid(rows=6, cols=4, half_height=0.35)
WHEEL_R = 0.5  # PHYSICS.bodies.buggy.wheelRadius
WHEEL_HALF_W = 0.22  # PHYSICS.bodies.buggy.wheelHalfWidth
WHEEL_Z = 0.726  # PHYSICS.bodies.buggy.wheelZ
HUB_Z = -0.2 - SUSPENSION_REST  # PHYSICS.bodies.buggy.wheelY
WHEEL_X = 1.27  # PHYSICS.bodies.buggy.wheelX: the published 80 in wheelbase at 1.25 scale
ARCH_R = WHEEL_R + ARCH_CLEARANCE
GROUND = HUB_Z - WHEEL_R

LENGTH = 3.9
FRONT = LENGTH / 2
BACK = -FRONT
GAME_ROWS = 8  # the buggy's layout rows with its armor ring, as body.ts stretches them over the length
DECK_ROWS = (3, 4)  # the layout rows of its D cells
WALL_Y = 0.44  # the inner wall of every wheel well, 0.07 m inside the tire's inner face

ENGINE_X = 1.1  # PHYSICS.bodies.buggy.engine.x
ENGINE_HALF = (0.49, 0.39)  # the drawn engine footprint over the E cells, along and across
HOLE = (ENGINE_X - ENGINE_HALF[0] - 0.02, ENGINE_X + ENGINE_HALF[0] + 0.04, ENGINE_HALF[1] + 0.04)  # back, front, half width
FLOOR = -0.35  # PHYSICS.bodies.buggy.engine.y: the bay floor

COWL = 0.5  # the windshield's foot, photo 2
SCREEN_TOP_X = 0.44  # the windshield leans back about 6 degrees, photo 2
TOP_FRONT = 0.545  # the top overhangs the frame a little, photo 1
TOP_BACK = -1.08
TOP_HALF = 0.85  # the top is about as wide as the body at the waist, photo 2
POST_X = -1.0  # the chrome rear posts, photo 1
GLASS_Y = 0.8  # the glass at the waist, inside the shell's side
LEAN = 0.18  # the glass leans in 0.13 m up to the top, inferred from the frame posts in photo 2


def up(h: float) -> float:
    """Model z of a height h over the ground."""
    return GROUND + h


TOP_LOW = up(1.64)
TOP_HIGH = up(1.76)
EDGE = 0.05  # the round of the top's thick edge

# Shell stations, nose to tail, as heights over the ground and half widths: photos 1 and 2 in tire diameters, inferred behind.
# x, deck center, side crown, half width, bottom
STATIONS = [
    (FRONT, 0.76, 0.76, 0.52, 0.47),
    (1.93, 0.84, 0.86, 0.64, 0.45),
    (1.86, 0.86, 0.95, 0.76, 0.44),
    (1.62, 0.93, 1.11, 0.9, 0.44),
    (1.27, 0.99, 1.18, 0.93, 0.44),
    (0.95, 1.03, 1.15, 0.93, 0.44),
    (0.7, 1.05, 1.07, 0.91, 0.5),
    (COWL, 1.04, 1.0, 0.89, 0.6),
    (0.25, 0.92, 0.93, 0.87, 0.62),
    (-0.3, 0.92, 0.92, 0.87, 0.62),
    (-0.62, 0.93, 0.99, 0.89, 0.55),
    (-0.88, 0.93, 1.09, 0.92, 0.44),
    (-1.27, 0.93, 1.16, 0.93, 0.44),
    (-1.55, 0.93, 1.12, 0.92, 0.44),
    (-1.76, 0.91, 1.0, 0.88, 0.46),
    (-1.88, 0.86, 0.88, 0.8, 0.5),
    (-1.93, 0.78, 0.78, 0.72, 0.52),
    (BACK, 0.62, 0.62, 0.6, 0.55),
]


def crown_at(x: float) -> float:
    """Model z of the shell's side crown at x, between stations."""
    for (x0, _, c0, _, _), (x1, _, c1, _, _) in zip(STATIONS, STATIONS[1:]):
        if x1 <= x <= x0:
            return up(c0 + (c1 - c0) * (x0 - x) / (x0 - x1))
    raise ValueError(f"x {x} is off the shell")


def ring(x: float, center: float, crown: float, half: float, bottom: float) -> list[tuple[float, float, float]]:
    """One shell cross-section: a rounded bottom, upright sides, a rolled crown, the fender hump falling to the deck and a soft center ridge."""
    roll = min(0.07, (crown - bottom) / 3)
    hump_in = min(half - roll, 0.62)
    deck_side = center + 0.35 * (crown - center)
    right = [
        (half - 0.08, up(bottom)),
        (half, up(bottom) + roll),
        (half, up(crown) - roll),
        (half - roll, up(crown)),
        (hump_in, up(crown) - 0.02),
        (0.46, up(deck_side)),
        (0.16, up(center)),
    ]
    left = [(-y, z) for y, z in reversed(right)]
    return [(x, y, z) for y, z in [(0.0, up(bottom))] + right + [(0.0, up(center) + 0.015)] + left]


def shell(kit: Kit) -> bpy.types.Object:
    """The painted shell, its four round wheel wells and its engine hole."""
    loft(kit, "shell", [ring(*s) for s in STATIONS], "paint")
    body = kit._parts[-1]
    arch_cut(body, [WHEEL_X, -WHEEL_X], HUB_Z, WHEEL_R, WALL_Y, up(0.3), ROUND_ARCH_SEGMENTS)
    back, front, half = HOLE
    cut_boxes(body, [((back, -half, FLOOR), (front, half, up(2.0)))])
    kit.box("bay_floor", (front - back, 2 * half, 0.04), ((front + back) / 2, 0, FLOOR - 0.02), "under")
    return body


def lower_tub(kit: Kit) -> None:
    """The black VW pan and tub sides that show under the thin shell between the wheels, photo 1."""
    kit.box("lower_tub", (1.5, 1.7, up(0.68) - up(0.42)), (0, 0, (up(0.68) + up(0.42)) / 2), "under")
    kit.box("spine", (LENGTH - 0.5, 2 * WALL_Y - 0.04, up(0.6) - up(0.45)), (0, 0, (up(0.6) + up(0.45)) / 2), "under")


def round_part(kit: Kit, name: str, radius: float, depth: float, loc: tuple[float, float, float], mat: str, rot: tuple[float, float, float] = (0, 0, 0)) -> bpy.types.Object:
    return kit.cylinder(name, radius, depth, loc, mat, rot=rot, vertices=round_sides(radius))


def tube(kit: Kit, name: str, a: tuple[float, float, float], b: tuple[float, float, float], thick: float = 0.06) -> None:
    strut(kit, name, a, b, thick, "chrome", sides=round_sides(thick / 2))


def lamps(kit: Kit) -> None:
    """Chrome bug-eye bowls with glass faces on short stalks on the deck shoulders, and amber indicators on the nose, photo 2."""
    lamp_r = 0.165  # a face 0.33 of a tire diameter across, photo 2
    x = 1.5  # a third of the way back from the nose to the cowl
    y = 0.64
    z = crown_at(x) + 0.09
    along = (0, math.pi / 2, 0)
    for s, sy in (("l", 1), ("r", -1)):
        bowl = round_part(kit, f"lamp_bowl_{s}", lamp_r, 0.18, (x, sy * y, z), "chrome", along)
        for v in bowl.data.vertices:
            if v.co.z < 0:
                v.co.x *= 0.7
                v.co.y *= 0.7
        round_part(kit, f"lamp_{s}", lamp_r - 0.02, 0.02, (x + 0.09, sy * y, z), "light", along)
        kit.box(f"lamp_stalk_{s}", (0.06, 0.06, 0.1), (x - 0.03, sy * y, z - lamp_r - 0.02), "chrome")
        round_part(kit, f"indicator_{s}", 0.045, 0.06, (FRONT - 0.035, sy * 0.48, up(0.74)), "amber", along)
        round_part(kit, f"taillight_{s}", 0.07, 0.06, (BACK + 0.035, sy * 0.48, up(0.72)), "red", along)


def nose(kit: Kit) -> None:
    """The dark plate recess low on the nose face, and the chrome nerf bar under it, photo 2."""
    kit.box("plate_recess", (0.04, 0.56, up(0.62) - up(0.48)), (FRONT - 0.025, 0, (up(0.62) + up(0.48)) / 2), "under")
    bar_x = FRONT - 0.04
    bar_z = up(0.36)
    tube(kit, "nerf_bar", (bar_x, 0.58, bar_z), (bar_x, -0.58, bar_z))
    for s, sy in (("l", 1), ("r", -1)):
        tube(kit, f"nerf_end_{s}", (bar_x, sy * 0.58, bar_z), (FRONT - 0.3, sy * 0.66, up(0.47)))
        tube(kit, f"nerf_stay_{s}", (bar_x - 0.02, sy * 0.3, bar_z), (FRONT - 0.32, sy * 0.3, up(0.5)))


def tail(kit: Kit) -> None:
    """Inferred: a dark grille in the short rear panel, and a low tube bumper."""
    for i in range(3):
        kit.box(f"tail_grille_{i}", (0.03, 0.5, 0.04), (BACK + 0.02, 0, up(0.74) - 0.08 * i), "soot")
    bar_x = BACK + 0.04
    bar_z = up(0.42)
    tube(kit, "bumper_rear", (bar_x, 0.66, bar_z), (bar_x, -0.66, bar_z))
    for s, sy in (("l", 1), ("r", -1)):
        tube(kit, f"bumper_stay_{s}", (bar_x + 0.02, sy * 0.36, bar_z), (BACK + 0.3, sy * 0.36, up(0.52)))


def glass_y(z: float) -> float:
    """The half width of the closed cab's glass at height z: it leans in from the waist, so the top's edge overhangs it."""
    return GLASS_Y - LEAN * (z - up(0.92))


def windshield(kit: Kit) -> None:
    """The near-upright windshield in a chrome frame on the cowl, with round chrome mirrors on stalks, photo 2."""
    foot = crown_at(COWL) - 0.03
    frame = 0.05
    for s, sy in (("l", 1), ("r", -1)):
        strut(kit, f"screen_post_{s}", (COWL, sy * glass_y(foot), foot), (SCREEN_TOP_X, sy * glass_y(TOP_LOW), TOP_LOW + 0.01), frame, "chrome", sides=round_sides(frame / 2))
        stalk_top = (COWL - 0.02, sy * 0.9, up(1.24))
        tube(kit, f"mirror_stalk_{s}", (COWL, sy * (glass_y(up(1.06)) + 0.01), up(1.06)), stalk_top, 0.03)
        round_part(kit, f"mirror_{s}", 0.065, 0.03, (stalk_top[0], stalk_top[1], stalk_top[2] + 0.05), "chrome", (0, math.pi / 2, 0))
    kit.box("screen_sill", (frame, 2 * glass_y(foot) + frame, frame), (COWL + 0.005, 0, foot + frame / 2), "chrome")
    kit.box("screen_header", (frame, 2 * glass_y(TOP_LOW), frame), (SCREEN_TOP_X, 0, TOP_LOW - frame / 2 + 0.01), "chrome")
    points = [(x + dx, sy * glass_y(z), z) for x, z in ((COWL - 0.03, foot), (SCREEN_TOP_X - 0.03, TOP_LOW)) for dx in (0.0, 0.02) for sy in (1, -1)]
    kit._add(hull_mesh("windshield", points), "windshield", "glass", 0.0)


def top(kit: Kit) -> None:
    """The Manx's own top: a flat trim slab, round at the corners, whose thick rounded edge hangs over the frame, on two chrome rear posts, photo 1."""

    def section(x: float, w: float, drop: float) -> list[tuple[float, float, float]]:
        lo, hi = TOP_LOW + drop, TOP_HIGH - drop
        right = [(w - 0.1, lo + 0.03), (w - 0.02, lo), (w, lo + 0.04), (w, hi - 0.05), (w - 0.04, hi - 0.01), (w - 0.12, hi)]
        left = [(-y, z) for y, z in reversed(right)]
        return [(x, y, z) for y, z in right + left]

    corner = 0.3
    steps = [math.pi / 2 * k / 5 for k in range(6)]
    front = [(TOP_FRONT - corner + corner * math.sin(a), TOP_HALF - corner + corner * math.cos(a), 0.05 * math.sin(a) ** 3) for a in reversed(steps)]
    back = [(TOP_BACK + corner - corner * math.sin(a), TOP_HALF - corner + corner * math.cos(a), 0.07 * math.sin(a) ** 3) for a in steps]
    loft(kit, "top", [section(x, w, drop) for x, w, drop in front + back], "trim")
    for s, sy in (("l", 1), ("r", -1)):
        foot = crown_at(POST_X) - 0.05
        tube(kit, f"rear_post_{s}", (POST_X, sy * glass_y(foot), foot), (POST_X, sy * glass_y(TOP_LOW), TOP_LOW + 0.01), 0.05)


def glass(kit: Kit) -> None:
    """Dark glass in the photo's open sides and rear, from the waist up to the top, so the cockpit is closed."""
    xs = [COWL, 0.25, -0.3, -0.62, -0.88, POST_X]
    side = [(SCREEN_TOP_X - 0.02, TOP_LOW), *[(x, crown_at(x) - 0.04) for x in xs], (POST_X, TOP_LOW)]
    at_zero = glass_y(0.0)
    prism(kit, "side_glass_l", side, at_zero - 0.015, at_zero + 0.015, "glass", lean=LEAN)
    prism(kit, "side_glass_r", side, -at_zero - 0.015, -at_zero + 0.015, "glass", lean=-LEAN)
    sill = crown_at(POST_X) - 0.2
    rear = [(POST_X + dx, sy * glass_y(z), z) for dx in (-0.015, 0.015) for z in (sill, TOP_LOW) for sy in (1, -1)]
    kit._add(hull_mesh("rear_glass", rear), "rear_glass", "glass", 0.0)


def deck_x() -> tuple[float, float]:
    """The span along the truck of the D rows, as body.ts projects the layout over the length."""
    step = LENGTH / GAME_ROWS
    return FRONT - (DECK_ROWS[1] + 1) * step, FRONT - DECK_ROWS[0] * step


def check_buggy(body: bpy.types.Object) -> None:
    """Raises when a tire comes within its arch clearance of the shell, the deck does not frame the engine hole, or the top misses a deck row."""
    back, front, half = HOLE
    if back <= COWL + 0.03 or front >= FRONT - 0.3 or half >= 0.62 - 0.1:
        raise RuntimeError(f"engine hole x {back:.2f}..{front:.2f} half {half:.2f} is not framed by the deck")
    x0, x1 = deck_x()
    if TOP_BACK + EDGE > x0 or TOP_FRONT - EDGE < x1:
        raise RuntimeError(f"the top's flat face {TOP_BACK + EDGE:.2f}..{TOP_FRONT - EDGE:.2f} does not cover the deck rows {x0:.2f}..{x1:.2f}")
    bpy.context.view_layer.update()
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    near = []
    for wx in (WHEEL_X, -WHEEL_X):
        for sy in (1, -1):
            for y in (WHEEL_Z - WHEEL_HALF_W, WHEEL_Z, WHEEL_Z + WHEEL_HALF_W):
                for k in range(48):
                    a = math.tau * k / 48
                    p = Vector((wx + WHEEL_R * math.cos(a), sy * y, HUB_Z + WHEEL_R * math.sin(a)))
                    hit = tree.find_nearest(p)
                    if hit[0] is not None and hit[3] < ARCH_CLEARANCE - 0.015:
                        near.append(f"{p.x:.2f},{p.y:.2f},{p.z:.2f}: {hit[3]:.3f}")
    if near:
        raise RuntimeError(f"tires come within the arch clearance of the shell at {near[:6]}")


def arch_sockets(kit: Kit) -> None:
    kit.socket("arch_front", (WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (-WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEEL_X, WHEEL_Z, HUB_Z + ARCH_R))


def main() -> None:
    args = parse_args()
    kit = Kit(COLORS, SEED)
    body = shell(kit)
    check_buggy(body)
    lower_tub(kit)
    lamps(kit)
    nose(kit)
    tail(kit)
    windshield(kit)
    top(kit)
    glass(kit)
    arch_sockets(kit)
    bay = {(x, y): FLOOR for x in (1, 2) for y in (1, 2)}
    sides = {(x, y): surface_z(G, x, y) for x in (0, 3) for y in range(G.rows)}
    level_sockets(kit, G, "row", [crown_at(G.row_x(y)) for y in range(G.rows)], cells=bay | sides)
    level_sockets(kit, G, "floor", [FLOOR] * 2 + [up(0.92)] * 4)
    check_base(kit, "base_buggy", G)
    kit.export("base_buggy", args, view_size=5.0)


if __name__ == "__main__":
    main()
