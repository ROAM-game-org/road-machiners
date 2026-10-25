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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, Vec3, parse_args, round_sides  # noqa: E402
from parts_common_base import ARCH_CLEARANCE, BASE_COLORS, SUSPENSION_REST, Grid, check_base, cut_boxes, level_sockets, surface_z  # noqa: E402
from parts_common_core import PROUD  # noqa: E402
from shapes import loft, prism, strut, taper  # noqa: E402

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
ENGINE_HALF = (0.314, 0.372)  # the drawn engine: restOn() of the engine cells on the roof crest, measured with the model built
HOLE_MARGIN = 0.02
HOLE = ((ENGINE_X - ENGINE_HALF[0] - HOLE_MARGIN, ENGINE_Y - ENGINE_HALF[1] - HOLE_MARGIN), (ENGINE_X + ENGINE_HALF[0] + HOLE_MARGIN, ENGINE_Y + ENGINE_HALF[1] + HOLE_MARGIN))
BAY = (0.84, 1.62)  # the bay floor reaches under the lid round the hole, so an engine edge over the rim rests on it
BAY_HALF = 0.43
LID = [(0.62, 0.17, 0.62), (0.8, 0.175, 0.6), (1.0, 0.165, 0.57), (1.2, 0.14, 0.53), (1.4, 0.1, 0.49), (1.58, 0.04, 0.45), (1.72, -0.04, 0.41), (1.84, -0.14, 0.37), (1.92, -0.26, 0.33), (1.96, -0.38, 0.3)]


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


def section(top: float, top_half: float, base_half: float, base: float) -> list[tuple[float, float]]:
    """A rounded cross-section as Y and Z: up from base at base_half, leaning in to the shoulder, over a low dome to top."""
    h = top - base
    right = [(base_half, base), (base_half - 0.55 * (base_half - top_half), base + 0.8 * h), (top_half, max(base + 0.004, top - 0.03)), (0.5 * top_half, max(base + 0.004, top - 0.008))]
    return right + [(0.0, top)] + [(-y, z) for y, z in reversed(right)]


def side_y(outline: list[tuple[float, float]], z: float) -> float:
    """The Y of a section's right side at height z."""
    right = outline[:5]
    for (y0, z0), (y1, z1) in zip(right, right[1:]):
        if z0 <= z <= z1:
            return y0 + (y1 - y0) * (z - z0) / (z1 - z0)
    raise ValueError(f"z {z} is off the section side")


def dome_drop(outline: list[tuple[float, float]], y: float) -> float:
    """How far a section's top falls below its center at y."""
    top = outline[4][1]
    right = list(reversed(outline[2:5]))
    for (y0, z0), (y1, z1) in zip(right, right[1:]):
        if y0 <= abs(y) <= y1:
            return top - (z0 + (z1 - z0) * (abs(y) - y0) / (y1 - y0))
    raise ValueError(f"y {y} is off the section top")


def cabin_section(x: float) -> list[tuple[float, float]]:
    return section(roof_z(x), CREST_HALF, GLASS_BASE, BELT)


def back_section(x: float) -> list[tuple[float, float]]:
    top = roof_z(x) if x >= DECK_BACK else along([(DECK_BACK, roof_z(DECK_BACK)), (-1.64, 0.04), (LID_CUT_X, LID_CUT_Z)], x)
    blend = min(1.0, max(0.0, (SLOPE_X - x) / 0.14))
    base = min(SHELF, top - 0.25) if x >= DECK_BACK else top - LID_LIP
    return section(top, CREST_HALF + blend * (BACK_HALF - CREST_HALF), GLASS_BASE, base)


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


def pane(kit: Kit, name: str, outer: list[Vec3], inner: list[Vec3], mat: str) -> None:
    """A thin slab between two outlines of the same points, like a window laid on a curved panel."""
    loft(kit, name, [outer, inner], mat)


def tub(kit: Kit) -> None:
    """The dark core from the nose to the tail and the wide painted doors between the fenders, rolled in at the belt and the sill."""
    prism(kit, "core_front", [(0.86, PAN), (1.9, PAN), (1.9, SHELF), (0.86, SHELF)], -0.34, 0.34, "under")
    prism(kit, "core_mid", [(-0.86, PAN), (0.86, PAN), (0.86, BELT - PROUD), (-0.86, BELT - PROUD)], -0.54, 0.54, "under")
    prism(kit, "core_back", [(-1.66, PAN + 0.05), (-0.86, PAN), (-0.86, SHELF), (-1.66, SHELF)], -0.54, 0.54, "under")

    def door(half: float) -> list[tuple[float, float]]:
        right = [(half - 0.04, PAN), (half, PAN + 0.12), (half, BELT - 0.06), (half - 0.05, BELT)]
        return right + [(-y, z) for y, z in reversed(right)]

    stations = [(0.86, 0.62), (0.76, DOOR), (-0.76, DOOR), (-0.86, 0.62)]
    loft(kit, "doors", [at_x(x, door(half)) for x, half in stations], "paint")
    mirrored(kit, "board", (1.44, BOARD_OUT - FENDER_IN, 0.04), 0.0, (BOARD_OUT + FENDER_IN) / 2, BOARD_TOP - 0.02, "under")
    prism(kit, "apron", [(1.78, PAN), (1.94, PAN), (1.96, -0.38), (1.9, SHELF + PROUD), (1.78, SHELF + PROUD)], -0.33, 0.33, "paint")


def front_lid(kit: Kit) -> None:
    """The domed front lid from the cowl to the rounded nose, with the engine hole over a dark bay floor and a center ridge ahead of it."""

    def lid_section(top: float, half: float) -> list[tuple[float, float]]:
        bottom = min(SHELF, top - 0.12)
        right = [(half, bottom), (half, top - 0.11), (0.85 * half, top - 0.06), (0.55 * half, top - 0.02)]
        return right + [(0.0, top)] + [(-y, z) for y, z in reversed(right)]

    lid = loft_obj(kit, "lid", [at_x(x, lid_section(z, w)) for x, z, w in LID], "paint")
    (x0, y0), (x1, y1) = HOLE
    cut_boxes(lid, [((x0, y0, FLOOR - 0.03), (x1, y1, 1.0))])
    lid.data.materials.clear()
    lid.data.materials.append(kit._materials["paint"])
    kit.box("bay_floor", (BAY[1] - BAY[0], 2 * BAY_HALF, 0.03), ((BAY[0] + BAY[1]) / 2, 0.0, FLOOR - 0.015), "under")
    ridge_x = [x1 + 0.04] + [x for x, _, _ in LID if x > x1 + 0.1]
    ridge_x[-1] -= PROUD
    loft(kit, "ridge", [[(x, 0.03, lid_z(x) - 0.01), (x, 0.0, lid_z(x) + 0.022), (x, -0.03, lid_z(x) - 0.01)] for x in ridge_x], "paint")
    kit.box("handle", (0.05, 0.1, 0.06), (1.86, 0.0, lid_z(1.86)), "chrome")


def loft_obj(kit: Kit, name: str, sections: list[list[Vec3]], mat: str) -> bpy.types.Object:
    loft(kit, name, sections, mat)
    return kit._parts[-1]


def greenhouse(kit: Kit) -> None:
    """The cabin leaning in over the belt, the back shell down the clean slope to the lid cut, and the trim roof panel over the dome."""
    cabin_x = [COWL_X, 0.55, SCREEN_TOP, 0.33, 0.15, -0.1, -0.3, SLOPE_X]
    loft(kit, "cabin", [at_x(x, cabin_section(x)) for x in cabin_x], "paint")
    back_x = [SLOPE_X, -0.54, -0.6, -0.66, -0.72, -0.9, -1.2, -1.4, DECK_BACK, -1.64, LID_CUT_X]
    loft(kit, "back", [at_x(x, back_section(x)) for x in back_x], "paint")

    def panel(x: float, lift: float) -> list[Vec3]:
        return [(x, y, z + lift) for y, z in cabin_section(x)[2:7]]

    roof_x = [0.39, 0.33, 0.15, -0.1, -0.3, ROOF_BACK]
    rings = [panel(x, 0.018) + list(reversed(panel(x, -0.004))) for x in roof_x]
    loft(kit, "roof", rings, "trim")


def windows(kit: Kit) -> None:
    """The flat windshield, a door window and a quarter window on each side, the oval rear window, the louvers and the lid vent."""
    rise, run = roof_z(SCREEN_TOP) - roof_z(COWL_X), COWL_X - SCREEN_TOP
    bx, bz = COWL_X - run * 0.07, roof_z(COWL_X) + rise * 0.07
    tx, tz = COWL_X - run * 0.92, roof_z(COWL_X) + rise * 0.92
    screen = [(bx, 0.53, bz), (bx, -0.53, bz), (tx, -0.42, tz), (tx, 0.42, tz)]
    normal = (rise / math.hypot(rise, run), 0.0, run / math.hypot(rise, run))
    out = [(x + 0.012 * normal[0], y, z + 0.012 * normal[2]) for x, y, z in screen]
    inside = [(x - 0.01 * normal[0], y, z - 0.01 * normal[2]) for x, y, z in screen]
    pane(kit, "windshield", out, inside, "glass")
    door = rounded([(0.53, 0.25), (-0.14, 0.25), (-0.14, 0.58), (0.26, 0.6), (0.4, 0.54)], 0.07)
    quarter = rounded([(-0.22, 0.25), (-0.44, 0.25), (-0.56, 0.36), (-0.5, 0.56), (-0.22, 0.6)], 0.07)
    for name, outline in (("door", door), ("quarter", quarter)):
        for s, sy in (("l", 1), ("r", -1)):
            outer = [(x, sy * (side_y(cabin_section(x), z) + 0.02), z) for x, z in outline]
            inner = [(x, sy * (side_y(cabin_section(x), z) - 0.01), z) for x, z in outline]
            pane(kit, f"{name}_glass_{s}", outer, inner, "glass")
    louver = [(-0.6, 0.3), (-0.64, 0.3), (-0.66, 0.5), (-0.62, 0.5)]
    for s, sy in (("l", 1), ("r", -1)):
        outer = [(x, sy * (side_y(back_section(x), z) + 0.02), z) for x, z in louver]
        inner = [(x, sy * (side_y(back_section(x), z) - 0.01), z) for x, z in louver]
        pane(kit, f"louver_{s}", outer, inner, "under")
    rear = []
    for k in range(16):
        a = math.tau * k / 16
        x, y = REAR_GLASS_X + REAR_GLASS[0] * math.cos(a), REAR_GLASS[1] * math.sin(a)
        rear.append((x, y, roof_z(x) - min(dome_drop(back_section(x), y), dome_drop(cabin_section(x), y))))
    pane(kit, "rear_glass", [(x, y, z + 0.012) for x, y, z in rear], [(x, y, z - 0.01) for x, y, z in rear], "glass")
    vent = [(-1.04, 0.24), (-1.04, -0.24), (-1.16, -0.24), (-1.16, 0.24)]
    pane(kit, "lid_vent", [(x, y, roof_z(x) - dome_drop(back_section(x), y) + 0.008) for x, y in vent], [(x, y, roof_z(x) - dome_drop(back_section(x), y) - 0.01) for x, y in vent], "under")


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
    check_base(kit, "base_courier", G)
    kit.export("base_courier", args, view_size=5.0)


if __name__ == "__main__":
    main()
