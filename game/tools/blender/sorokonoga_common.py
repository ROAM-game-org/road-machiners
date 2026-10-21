"""Shared shapes of the sorokonoga: a cab-over tractor and a compact closed module that swivel on a fifth wheel.

The silhouette follows the committee's concept sheet, drawn in the house style of the longbed and the heavy tractor: big flat
panels, a paint body, a trim roof, dark flares over the arches, a framed grille and round lamps. Every shape is laid out in the
straight rig frame, 11.2 m along X from 8.4 to -2.8 and 2.9 m across Y, the ground 1.35 m below the origin. The grid's 16 rows
stretch over it at 0.7 m a row, 7 on the tractor and 9 on the module, and its 9 columns at 0.41 m.
From the front: a 0.15 m bumper, a 2.65 m flat-faced cab 2.8 m wide over the steer axle with its trim roof 2.98 m up, a 1.4 m
low engine house with the engine hole over the grid's engine cells, then the frame, the drive axle and the fifth wheel with its
coupling disc. The tractor ends at x 3.5, where the module's nose begins. The module is one closed box 2.5 m wide with a flat
trim roof 2.35 m up, on two axles, and its deck rows rest on that roof. The flares reach the full 2.9 m. Wheel radius 0.55 m.
base_sorokonoga.py writes the tractor and base_sorokonoga_rear.py the module, each moved so its origin is its own collider center.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_base import ARCH_CLEARANCE, BASE_COLORS, FLARE, SUSPENSION_REST, arch_cut, cut_boxes, flare_profile, hull_mesh  # noqa: E402
from rig_units import check_unit as check_rig_unit, unit_wheels as count_wheels  # noqa: E402
from shapes import prism  # noqa: E402

SEED = 640
FRONT = 8.4
BACK = -2.8
LENGTH = FRONT - BACK
WIDTH = 2.9
GROUND = -1.35
HALF_W = WIDTH / 2

WHEEL_Y = -0.4  # PHYSICS.bodies.sorokonoga.wheelY
WHEEL_Z = 1.15  # PHYSICS.bodies.sorokonoga.wheelZ: the steer wheels and the outer duals
WHEEL_R = 0.55  # PHYSICS.bodies.sorokonoga.wheelRadius
WHEEL_HALF_W = 0.2  # PHYSICS.bodies.sorokonoga.wheelHalfWidth
HUB_Z = WHEEL_Y - SUSPENSION_REST
TIRE_R = WHEEL_R * 0.935  # the wheel model's tire body; its lugs reach the ground
DUAL_STEP = 2 * WHEEL_HALF_W + 0.02
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03  # the wheel wells' inner wall
DUAL_WELL_Y = WHEEL_Z - DUAL_STEP - WHEEL_HALF_W - 0.03  # inside the drive axle's inner duals
ARCH_FOOT = HUB_Z - WHEEL_R  # arch cuts run down past the hub, below every body bottom

TRACTOR_REAR = 3.5
TRACTOR_ORIGIN = (FRONT + TRACTOR_REAR) / 2
STEER_X = 7.85  # PHYSICS.bodies.sorokonoga.wheelX ahead of the tractor's center
DRIVE_X = 4.05  # PHYSICS.bodies.sorokonoga.wheelX behind the tractor's center
PIVOT_X = 3.8  # PHYSICS.couplings.sorokonoga pivotFront and pivotRear, in the straight rig frame
MODULE_FRONT = TRACTOR_REAR
MODULE_ORIGIN = (MODULE_FRONT + BACK) / 2
MODULE_AXLES = (-0.4, -2.0)  # the last one is PHYSICS.couplings.sorokonoga.rear.wheelX behind the module's center
UNIT_MODEL_WHEELS = (2, 2)

ROW = 0.7
COL = WIDTH / 7
ENGINE = (FRONT - 5 * ROW, -0.4, 2 * COL - HALF_W)  # PHYSICS.bodies.sorokonoga.engine plus the tractor's center, as Blender x, z and -y
BAY_FRONT = FRONT - 4 * ROW
BAY_BACK = FRONT - 6 * ROW
BAY_LEFT = HALF_W - COL
BAY_RIGHT = HALF_W - 3 * COL

COLORS = BASE_COLORS


def up(height: float) -> float:
    """Blender Z of a height above the ground."""
    return GROUND + height


FRAME_BOTTOM = up(0.45)
FRAME_TOP = up(0.75)
CAB_FRONT = FRONT - 0.15
CAB_BACK = BAY_FRONT  # the cab covers its grid rows, so what the game stands on its last row stands on the roof
CAB_BOTTOM = FRAME_TOP
CAB_ROOF = up(2.9)
CAB_HALF = HALF_W - 0.05
NOSE_TOP = up(1.9)  # the flat face ends here and the hood slopes back to the screen
SCREEN_FOOT = (CAB_FRONT - 0.55, up(2.45))
SCREEN_TOP_X = CAB_FRONT - 0.95
ROOF_T = 0.08
HOUSE_BACK = 4.2
HOUSE_TOP = up(1.65)
HOUSE_HALF = CAB_HALF

MODULE_BOTTOM = FRAME_TOP
MODULE_HALF = 1.25
MODULE_ROOF = up(2.35)
MODULE_CHAMFER = 0.25  # the module's top front edge, along and down
SKIN = 0.04  # the depth of grilles and lamps on a face
FLARE_SEGMENTS = 4  # half the arch cut's edges, to keep eight flares inside the triangle budget of one longbed
GRILLE_REACH = SKIN / 2 + 0.01  # a grille's bars stand this far out of its center


def mirrored(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    """A box on the left side at +y and its twin on the right side."""
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def hull(kit: Kit, name: str, points: list[tuple[float, float, float]], mat: str, arches: tuple[list[float], float] | None = None) -> None:
    """A convex hull of points, with a low-poly arch cut outside the well wall around each wheel when arches gives (wheels x, well y)."""
    body = hull_mesh(name, points)
    if arches:
        wheels_x, wall_y = arches
        arch_cut(body, wheels_x, HUB_Z, WHEEL_R, wall_y, ARCH_FOOT)
    body.data.materials.clear()
    kit._add(body, name, mat, 0.0)


def rig_flare(kit: Kit, name: str, wx: float, x_min: float, x_max: float, y0: float, y1: float, low: float) -> None:
    """The dark low-poly flare over one arch of the rig on both sides, from y0 out to y1, clamped to the unit's x stretch."""
    profile = flare_profile(wx, HUB_Z, WHEEL_R, low, x_min, x_max, FLARE_SEGMENTS)
    prism(kit, f"{name}_l", profile, y0, y1, "under")
    prism(kit, f"{name}_r", profile, -y1, -y0, "under")


def tandem_flare(kit: Kit, name: str, front: float, rear: float, y0: float, y1: float, low: float) -> None:
    """One dark fender over two close axles on both sides: a ring over each arch, joined by a flat top and the strip between the arches."""
    r0 = WHEEL_R + ARCH_CLEARANCE
    r1 = r0 + FLARE

    def arc(wx: float, r: float, start: int, end: int) -> list[tuple[float, float]]:
        return [(wx + r * math.cos(math.pi * k / FLARE_SEGMENTS), max(low, HUB_Z + r * math.sin(math.pi * k / FLARE_SEGMENTS))) for k in range(start, end + 1)]

    half = FLARE_SEGMENTS // 2
    outer = arc(front, r1, 0, half) + arc(rear, r1, half, FLARE_SEGMENTS)
    inner = arc(front, r0, 0, FLARE_SEGMENTS) + arc(rear, r0, 0, FLARE_SEGMENTS)
    profile = outer + list(reversed(inner))
    prism(kit, f"{name}_l", profile, y0, y1, "under")
    prism(kit, f"{name}_r", profile, -y1, -y0, "under")


def wheel(kit: Kit, name: str, x: float, y: float) -> None:
    """One wheel in the look of the game's wheel model: a 24-sided tire, an 8-sided light rim and a 6-sided hub."""
    width = 2 * WHEEL_HALF_W
    axle = (math.pi / 2, 0, 0)
    kit.cylinder(f"{name}_tire", TIRE_R, width * 0.94, (x, y, HUB_Z), "wheel", rot=axle, vertices=24)
    kit.cylinder(f"{name}_rim", WHEEL_R * 0.55, width * 0.98, (x, y, HUB_Z), "metal_light", rot=axle, vertices=8)
    kit.cylinder(f"{name}_hub", WHEEL_R * 0.22, width, (x, y, HUB_Z), "rust", rot=axle, vertices=6)


def model_wheels(kit: Kit, x: float, y: float) -> int:
    """The pair of wheels the model draws itself at x, y either side. Returns the wheel count."""
    for s in (1, -1):
        wheel(kit, f"wheel_{x}_{s}", x, s * y)
    return 2


def axle(kit: Kit, x: float, half: float) -> None:
    kit.box(f"axle_{x}", (0.14, 2 * half, 0.14), (x, 0, HUB_Z), "under")


def grille(kit: Kit, name: str, center: tuple[float, float, float], size: tuple[float, float], facing: str, framed: bool) -> None:
    """A grille of three bright bars on a dark backing, framed when framed, flat on a face that looks along +x, -x or out to the sides (facing x or y)."""
    x, y, z = center
    width, height = size
    frame = (SKIN, width, height) if facing == "x" else (width, SKIN, height)
    backing = (SKIN + 0.01, width - 0.12, height - 0.12) if facing == "x" else (width - 0.12, SKIN + 0.01, height - 0.12)
    if framed:
        kit.box(f"{name}_frame", frame, (x, y, z), "metal_light")
    kit.box(f"{name}_backing", backing, (x, y, z), "under")
    pitch = (height - 0.12) / 3
    for i in range(3):
        bar = (SKIN + 0.02, width - 0.2, 0.07) if facing == "x" else (width - 0.2, SKIN + 0.02, 0.07)
        kit.box(f"{name}_bar{i}", bar, (x, y, z - (height - 0.12) / 2 + pitch * (i + 0.5)), "metal_light")


def round_lamp(kit: Kit, name: str, x: float, y: float, z: float, radius: float) -> None:
    kit.cylinder(name, radius, SKIN, (x, y, z), "light", rot=(0, math.pi / 2, 0), vertices=6)


def cab(kit: Kit) -> None:
    """The cab over the steer axle: a flat face, a short sloped hood and screen, a trim roof, a framed grille, round lamps and a plain bumper."""
    points = [(x, y, z) for x in (CAB_FRONT, CAB_BACK) for y in (CAB_HALF, -CAB_HALF) for z in (CAB_BOTTOM, NOSE_TOP)]
    points += [(x, y, CAB_ROOF) for x in (SCREEN_TOP_X, CAB_BACK) for y in (CAB_HALF - 0.1, -CAB_HALF + 0.1)]
    points += [(SCREEN_FOOT[0], y, SCREEN_FOOT[1]) for y in (CAB_HALF - 0.02, -CAB_HALF + 0.02)]
    hull(kit, "cab", points, "paint", ([STEER_X], WELL_Y))
    roof = [(x, y, z) for x in (SCREEN_TOP_X - 0.04, CAB_BACK) for y in (CAB_HALF - 0.08, -CAB_HALF + 0.08) for z in (CAB_ROOF - 0.01, CAB_ROOF + ROOF_T)]
    hull(kit, "cab_roof", roof, "trim")
    foot_x, foot_z = SCREEN_FOOT
    for s, name in ((1, "l"), (-1, "r")):
        lo, hi = foot_z + 0.06, CAB_ROOF - 0.12
        screen = [(foot_x - (foot_x - SCREEN_TOP_X) * (z - foot_z) / (CAB_ROOF - foot_z) + d, s * y, z) for z in (lo, hi) for y in (0.06, CAB_HALF - 0.16) for d in (0.0, 0.02)]
        hull(kit, f"windshield_{name}", screen, "glass")
        kit.box(f"door_glass_{name}", (1.2, 0.03, 0.5), ((SCREEN_TOP_X + CAB_BACK) / 2, s * (CAB_HALF + 0.005), up(2.45)), "glass")
        round_lamp(kit, f"lamp_{name}", CAB_FRONT + SKIN / 2, s * (CAB_HALF - 0.28), up(1.45), 0.13)
    grille(kit, "grille", (CAB_FRONT + GRILLE_REACH - SKIN, 0, up(1.45)), (1.5, 0.62), "x", True)
    kit.box("bumper", (FRONT - CAB_FRONT, 2 * (HALF_W - 0.15), 0.4), ((FRONT + CAB_FRONT) / 2, 0, up(0.7)), "metal_dark")


def engine_house(kit: Kit) -> None:
    """The low engine house behind the cab, open over the engine cells, with the bay floor the engine stands on and an arch over the drive axle."""
    points = [(x, y, z) for x in (CAB_BACK, HOUSE_BACK) for y in (HOUSE_HALF, -HOUSE_HALF) for z in (FRAME_TOP, HOUSE_TOP)]
    body = hull_mesh("engine_house", points)
    cut_boxes(body, [((BAY_BACK, BAY_RIGHT, ENGINE[1]), (BAY_FRONT, BAY_LEFT, HOUSE_TOP + 0.2))])
    arch_cut(body, [DRIVE_X], HUB_Z, WHEEL_R, DUAL_WELL_Y, ARCH_FOOT)
    body.data.materials.clear()
    kit._add(body, "engine_house", "paint", 0.0)
    kit.box("bay_floor", (BAY_FRONT - BAY_BACK, BAY_LEFT - BAY_RIGHT, 0.04), ((BAY_FRONT + BAY_BACK) / 2, (BAY_LEFT + BAY_RIGHT) / 2, ENGINE[1] - 0.02), "under")


def tractor_frame(kit: Kit) -> int:
    """Frame rails, the drive axle and its inner duals, the flares over both axles and the fifth wheel on the pivot.

    The game draws the steer pair and the drive axle's outer duals. Returns the wheels the model draws.
    """
    mirrored(kit, "rail", (CAB_FRONT - 0.2 - TRACTOR_REAR, 0.14, FRAME_TOP - FRAME_BOTTOM), (CAB_FRONT - 0.2 + TRACTOR_REAR) / 2, 0.45, (FRAME_TOP + FRAME_BOTTOM) / 2, "under")
    kit.box("frame_end", (0.15, 1.2, FRAME_TOP - FRAME_BOTTOM), (TRACTOR_REAR + 0.075, 0, (FRAME_TOP + FRAME_BOTTOM) / 2), "metal_dark")
    wheels = model_wheels(kit, DRIVE_X, WHEEL_Z - DUAL_STEP)
    axle(kit, DRIVE_X, WHEEL_Z - DUAL_STEP)
    rig_flare(kit, "flare_steer", STEER_X, TRACTOR_REAR, FRONT, CAB_HALF - 0.05, HALF_W, CAB_BOTTOM)
    rig_flare(kit, "flare_drive", DRIVE_X, TRACTOR_REAR, FRONT, DUAL_WELL_Y, HALF_W, FRAME_TOP)
    kit.box("fifth_wheel", (0.6, 1.1, 0.12), (PIVOT_X, 0, up(1.11)), "metal_light")
    kit.cylinder("coupling_disc", 0.3, 0.14, (PIVOT_X, 0, up(1.24)), "rust", vertices=8)
    return wheels


def module(kit: Kit) -> int:
    """The rear unit: one closed box with a chamfered top front edge and a flat trim roof, on two axles, hitched to the fifth wheel just behind the tractor.

    The game draws the single wheels of the last axle. The model draws the single wheels of the axle before it. Returns the wheels the model draws.
    """
    back = BACK + SKIN
    roof_z = MODULE_ROOF - ROOF_T
    nose = MODULE_FRONT - MODULE_CHAMFER
    points = [(x, y, MODULE_BOTTOM) for x in (MODULE_FRONT, back) for y in (MODULE_HALF, -MODULE_HALF)]
    points += [(MODULE_FRONT, y, roof_z - MODULE_CHAMFER) for y in (MODULE_HALF, -MODULE_HALF)]
    points += [(x, y, roof_z) for x in (nose, back) for y in (MODULE_HALF, -MODULE_HALF)]
    hull(kit, "module", points, "paint", (list(MODULE_AXLES), WELL_Y))
    roof = [(x, y, z) for x in (nose - 0.02, back) for y in (MODULE_HALF, -MODULE_HALF) for z in (roof_z - 0.01, MODULE_ROOF)]
    hull(kit, "module_roof", roof, "trim")
    side_x = (MODULE_FRONT - 0.3 + MODULE_AXLES[0] + WHEEL_R + 0.3) / 2
    for s, name in ((1, "l"), (-1, "r")):
        grille(kit, f"side_grille_{name}", (side_x, s * (MODULE_HALF + GRILLE_REACH - SKIN), up(1.7)), (1.8, 0.7), "y", False)
        kit.box(f"tail_lamp_{name}", (SKIN, 0.24, 0.14), (BACK + SKIN / 2, s * (MODULE_HALF - 0.25), up(1.1)), "red")
    grille(kit, "rear_grille", (BACK + GRILLE_REACH, 0, up(1.75)), (1.6, 0.7), "x", False)
    kit.box("underride", (0.12, WIDTH - 0.6, 0.14), (BACK + 0.06, 0, MODULE_BOTTOM - 0.05), "metal_dark")
    wheels = model_wheels(kit, MODULE_AXLES[0], WHEEL_Z)
    for x in MODULE_AXLES:
        axle(kit, x, WHEEL_Z - 0.2)
    tandem_flare(kit, "flare", *MODULE_AXLES, MODULE_HALF - 0.05, HALF_W, MODULE_BOTTOM)
    return wheels


def build_tractor(kit: Kit) -> int:
    wheels = tractor_frame(kit)
    cab(kit)
    engine_house(kit)
    return wheels


def check_unit(kit: Kit, name: str, front: float, back: float) -> None:
    check_rig_unit(kit, name, front, back, WIDTH, HUB_Z - TIRE_R)


def unit_wheels(name: str, wheels: int, unit: int) -> None:
    count_wheels(name, wheels, UNIT_MODEL_WHEELS[unit], 10)
