"""Shared shapes of the sorokonoga: a short Old World cab-over tractor and a long low stake bed that swivel on a fifth wheel.

There is no reference image. The brief: about 17 m long and 2.9 m wide, the tractor short so it turns tight, the bed low and long
on four close axles of dual wheels, so its many wheels give it its name. Every shape is laid out in the straight rig frame,
16.8 m along X from -8.4 to 8.4 and 2.9 m across Y, the ground 1.35 m below the origin. The 9 by 24 grid stretches over it at
0.7 m a row and 0.41 m a column, inside what body.test.ts allows.
From the front: a 0.15 m bumper, a 2.2 m flat-faced cab 2.5 m wide standing over the steer axle with its roof 3.2 m up, a 2 m
engine house with the engine hole over the grid's engine cells, then the frame, the drive axle and the fifth wheel. The tractor
ends at x 2.6. The bed starts at x 4.4, so its nose rides over the fifth wheel, and runs back to x -8.4 at 1.35 m deck height,
with a headboard, stakes along both sides and four axles 1.2 m apart near its tail. Wheel radius 0.55 m.
base_sorokonoga.py writes the tractor and base_sorokonoga_rear.py the bed, each moved so its origin is its own collider center.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_base import BASE_COLORS, SUSPENSION_REST, cut_boxes, hull_mesh  # noqa: E402
from rig_units import check_unit as check_rig_unit, unit_wheels as count_wheels  # noqa: E402

SEED = 640
LENGTH = 16.8
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

FRONT = LENGTH / 2
BACK = -LENGTH / 2
TRACTOR_REAR = 2.6
TRACTOR_ORIGIN = (FRONT + TRACTOR_REAR) / 2
STEER_X = 7.4  # PHYSICS.bodies.sorokonoga.wheelX ahead of the tractor's center
DRIVE_X = 3.6  # PHYSICS.bodies.sorokonoga.wheelX behind the tractor's center
PIVOT_X = 3.9  # PHYSICS.couplings.sorokonoga pivotFront and pivotRear, in the straight rig frame
BED_FRONT = 4.4
BED_ORIGIN = (BED_FRONT + BACK) / 2
MODULE_BACK = 0.9
BED_AXLES = (-3.6, -4.8, -6.0, -7.2)  # the last one is PHYSICS.couplings.sorokonoga.rear.wheelX behind the bed's center
UNIT_MODEL_WHEELS = (2, 14)

ROW = LENGTH / 24
COL = WIDTH / 7
ENGINE = (FRONT - 5 * ROW, -0.4, 2 * COL - HALF_W)  # PHYSICS.bodies.sorokonoga.engine plus the tractor's center, as Blender x, z and -y
BAY_FRONT = FRONT - 4 * ROW
BAY_BACK = FRONT - 6 * ROW
BAY_LEFT = HALF_W - COL
BAY_RIGHT = HALF_W - 3 * COL

COLORS = {
    **BASE_COLORS,
    "wood": 0x6A4A2A,  # PAL.trunk
    "stake": 0x4A4744,  # the wreck's metal
}


def up(height: float) -> float:
    """Blender Z of a height above the ground."""
    return GROUND + height


FRAME_BOTTOM = up(0.45)
FRAME_TOP = up(0.75)
CAB_FRONT = FRONT - 0.15
CAB_BACK = 6.2
CAB_BOTTOM = up(1.2)
CAB_ROOF = up(2.9)
CAB_HALF = 1.25
HOUSE_BACK = 4.2
HOUSE_TOP = up(1.65)
HOUSE_HALF = 1.2
FENDER_TOP = up(1.25)
DECK_TOP = 0.0
DECK_BOTTOM = DECK_TOP - 0.15
STAKE_H = 0.9


def mirrored(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    """A box on the left side at +y and its twin on the right side."""
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def hull(kit: Kit, name: str, points: list[tuple[float, float, float]], mat: str) -> None:
    kit._add(hull_mesh(name, points), name, mat, 0.0)


def wheel(kit: Kit, name: str, x: float, y: float) -> None:
    """One wheel in the look of the game's wheel model: a 24-sided tire, an 8-sided light rim and a 6-sided hub."""
    width = 2 * WHEEL_HALF_W
    axle = (math.pi / 2, 0, 0)
    kit.cylinder(f"{name}_tire", TIRE_R, width * 0.94, (x, y, HUB_Z), "wheel", rot=axle, vertices=24)
    kit.cylinder(f"{name}_rim", WHEEL_R * 0.55, width * 0.98, (x, y, HUB_Z), "metal_light", rot=axle, vertices=8)
    kit.cylinder(f"{name}_hub", WHEEL_R * 0.22, width, (x, y, HUB_Z), "rust", rot=axle, vertices=6)


def duals(kit: Kit, x: float, sides: tuple[int, ...] = (0, 1)) -> int:
    """Dual wheels on both ends of the axle at x: k 0 is the outer wheel, k 1 the inner. Returns the wheel count."""
    for s in (1, -1):
        for k in sides:
            wheel(kit, f"dual_{x}_{s}_{k}", x, s * (WHEEL_Z - k * DUAL_STEP))
    kit.box(f"axle_{x}", (0.14, 2 * (WHEEL_Z - DUAL_STEP), 0.14), (x, 0, HUB_Z), "under")
    return 2 * len(sides)


def cab(kit: Kit) -> None:
    """The armored cab over the steer axle: a sloped hood and screen behind a slatted guard, a barred side window, a bull bar and a roof gun mount."""
    top = up(2.0)
    points = [(x, y, z) for x in (CAB_FRONT, CAB_BACK) for y in (CAB_HALF, -CAB_HALF) for z in (CAB_BOTTOM - 0.2, up(1.9))]
    points += [(x, y, CAB_ROOF) for x in (CAB_FRONT - 0.95, CAB_BACK) for y in (CAB_HALF - 0.1, -CAB_HALF + 0.1)]
    points += [(CAB_FRONT - 0.55, y, up(2.45)) for y in (CAB_HALF - 0.02, -CAB_HALF + 0.02)]
    hull(kit, "cab", points, "paint")
    for s, name in ((1, "l"), (-1, "r")):
        screen = [(CAB_FRONT - 0.55 - 0.4 * (z - up(2.0)) / (CAB_ROOF - up(2.0)) + d, s * y, z) for z in (up(2.05), CAB_ROOF - 0.15) for y in (0.06, CAB_HALF - 0.15) for d in (0.0, 0.02)]
        hull(kit, f"windshield_{name}", screen, "glass")
        kit.box(f"door_glass_{name}", (1.05, 0.03, 0.5), (CAB_FRONT - 1.05, s * (CAB_HALF + 0.005), up(2.45)), "glass")
        for i in range(3):
            kit.box(f"window_bar_{name}_{i}", (0.05, 0.05, 0.55), (CAB_FRONT - 0.7 - i * 0.3, s * (CAB_HALF + 0.03), up(2.45)), "metal_dark")
        kit.box(f"side_plate_{name}", (CAB_FRONT - CAB_BACK - 0.3, 0.06, 0.8), ((CAB_FRONT + CAB_BACK) / 2 - 0.1, s * (CAB_HALF + 0.03), up(1.55)), "metal_dark")
        kit.box(f"lamp_{name}", (0.08, 0.3, 0.22), (CAB_FRONT + 0.02, s * (CAB_HALF - 0.35), up(1.6)), "light")
        kit.box(f"lamp_cage_{name}", (0.1, 0.38, 0.05), (CAB_FRONT + 0.03, s * (CAB_HALF - 0.35), up(1.76)), "metal_dark")
        kit.box(f"mirror_{name}", (0.06, 0.08, 0.4), (CAB_FRONT - 0.5, s * (HALF_W - 0.05), up(2.3)), "metal_light")
        kit.box(f"mirror_arm_{name}", (0.05, HALF_W - CAB_HALF - 0.05, 0.05), (CAB_FRONT - 0.5, s * (CAB_HALF + (HALF_W - CAB_HALF) / 2 - 0.02), up(2.45)), "metal_light")
        kit.box(f"step_{name}", (0.5, 0.25, 0.08), (CAB_BACK + 0.4, s * (CAB_HALF - 0.12), up(0.95)), "under")
        kit.box(f"crate_{name}", (1.2, 0.2, 0.6), (CAB_BACK - 0.2, s * (CAB_HALF + 0.08), up(1.8)), "rust")
        kit.box(f"crate_strap_{name}", (0.1, 0.22, 0.62), (CAB_BACK - 0.2, s * (CAB_HALF + 0.08), up(1.8)), "metal_dark")
        kit.box(f"bar_post_{name}", (0.08, 0.08, 0.5), (CAB_FRONT - 0.15, s * (HALF_W - 0.4), up(0.95)), "metal_dark")
    kit.box("grille", (0.05, 1.7, 0.7), (CAB_FRONT + 0.02, 0, up(1.5)), "under")
    for i in range(5):
        kit.box(f"grille_bar_{i}", (0.07, 1.6, 0.05), (CAB_FRONT + 0.05, 0, up(1.22 + 0.14 * i)), "metal_light")
    for i in range(3):
        kit.box(f"hood_vent_{i}", (0.5, 1.5, 0.04), (CAB_FRONT - 0.4 - i * 0.1, 0, up(1.95) + 0.12 * i), "metal_dark")
    kit.box("visor", (0.3, 2 * CAB_HALF - 0.1, 0.08), (CAB_FRONT - 0.9, 0, CAB_ROOF - 0.02), "metal_dark")
    kit.box("bumper", (FRONT - CAB_FRONT, 2 * (HALF_W - 0.15), 0.5), ((FRONT + CAB_FRONT) / 2, 0, up(0.7)), "metal_dark")
    kit.box("ram_plate", (0.1, 2 * (HALF_W - 0.15) - 0.3, 0.7), (FRONT - 0.05, 0, up(0.95)), "rust")
    kit.cylinder("tow_ring", 0.1, 0.06, (FRONT - 0.03, 0, up(0.55)), "metal_light", rot=(0, math.pi / 2, 0), vertices=8)
    turret(kit)


def turret(kit: Kit) -> None:
    """The roof gun mount: a ring, a boxy housing, a shield and a long barrel, with an antenna behind it. It is looks only."""
    x = CAB_BACK + 0.9
    kit.box("turret_ring", (1.0, 1.0, 0.16), (x, 0, CAB_ROOF + 0.08), "metal_dark")
    kit.box("turret_body", (0.8, 0.8, 0.45), (x, 0, CAB_ROOF + 0.4), "paint")
    kit.box("turret_shield", (0.12, 1.0, 0.65), (x + 0.5, 0, CAB_ROOF + 0.5), "rust")
    kit.box("turret_box", (0.5, 0.25, 0.3), (x - 0.15, 0.55, CAB_ROOF + 0.35), "metal_dark")
    kit.cylinder("barrel", 0.06, 1.3, (x + 0.55, 0, CAB_ROOF + 0.5), "metal_dark", rot=(0, math.pi / 2, 0), vertices=8)
    kit.cylinder("barrel_jacket", 0.1, 0.7, (x + 0.3, 0, CAB_ROOF + 0.5), "metal_light", rot=(0, math.pi / 2, 0), vertices=8)
    kit.cylinder("antenna", 0.025, 1.4, (CAB_BACK - 0.15, CAB_HALF - 0.2, CAB_ROOF + 0.7), "metal_dark", vertices=6)
    for i in range(2):
        kit.box(f"roof_rail_{i}", (1.6, 0.05, 0.05), (CAB_BACK + 0.8 - i * 0.0, (1 - 2 * i) * (CAB_HALF - 0.1), CAB_ROOF + 0.15), "metal_dark")


def engine_house(kit: Kit) -> None:
    """The low engine house behind the cab, open over the engine cells, with the bay floor the engine stands on."""
    body = hull_mesh("engine_house", [(x, y, z) for x in (CAB_BACK, HOUSE_BACK) for y in (HOUSE_HALF, -HOUSE_HALF) for z in (FRAME_TOP, HOUSE_TOP)])
    cut_boxes(body, [((BAY_BACK, BAY_RIGHT, ENGINE[1]), (BAY_FRONT, BAY_LEFT, HOUSE_TOP + 0.2))])
    body.data.materials.clear()
    kit._add(body, "engine_house", "paint", 0.0)
    kit.box("bay_floor", (BAY_FRONT - BAY_BACK, BAY_LEFT - BAY_RIGHT, 0.04), ((BAY_FRONT + BAY_BACK) / 2, (BAY_LEFT + BAY_RIGHT) / 2, ENGINE[1] - 0.02), "under")
    kit.cylinder("fuel_tank", 0.3, 1.2, ((CAB_BACK + HOUSE_BACK) / 2, -(HOUSE_HALF - 0.25), up(0.55)), "metal_light", rot=(0, math.pi / 2, 0), vertices=10)
    kit.box("battery_box", (0.6, 0.4, 0.4), ((CAB_BACK + HOUSE_BACK) / 2, HOUSE_HALF - 0.25, up(0.55)), "metal_dark")
    kit.cylinder("stack", 0.07, CAB_ROOF + 0.3 - HOUSE_TOP, (CAB_BACK - 0.15, -(CAB_HALF - 0.2), (CAB_ROOF + 0.3 + HOUSE_TOP) / 2), "metal_light", vertices=8)


def tractor_frame(kit: Kit) -> int:
    """Frame rails, the drive axle's inner duals, its fenders and flaps, the deck plate and the fifth wheel on the pivot.

    The game draws the steer pair and the drive axle's outer duals. Returns the wheels the model draws.
    """
    mirrored(kit, "rail", (CAB_FRONT - 0.2 - TRACTOR_REAR, 0.14, FRAME_TOP - FRAME_BOTTOM), (CAB_FRONT - 0.2 + TRACTOR_REAR) / 2, 0.45, (FRAME_TOP + FRAME_BOTTOM) / 2, "under")
    kit.box("frame_end", (0.15, 1.2, FRAME_TOP - FRAME_BOTTOM), (TRACTOR_REAR + 0.075, 0, (FRAME_TOP + FRAME_BOTTOM) / 2), "metal_dark")
    wheels = duals(kit, DRIVE_X, (1,))
    kit.box("steer_axle", (0.14, 2 * (WHEEL_Z - 0.3), 0.14), (STEER_X, 0, HUB_Z), "under")
    mirrored(kit, "fender", (HOUSE_BACK + 0.05 - TRACTOR_REAR, HALF_W - 0.95, 0.06), (HOUSE_BACK + 0.05 + TRACTOR_REAR) / 2, (HALF_W + 0.95) / 2, FENDER_TOP - 0.03, "metal_dark")
    mirrored(kit, "flap", (0.04, 0.5, 0.55), TRACTOR_REAR + 0.2, WHEEL_Z - DUAL_STEP / 2, up(0.5), "under")
    kit.box("deck_plate", (HOUSE_BACK - TRACTOR_REAR, 1.9, 0.05), ((HOUSE_BACK + TRACTOR_REAR) / 2, 0, FRAME_TOP + 0.025), "metal_dark")
    kit.box("fifth_wheel", (0.9, 1.1, 0.12), (PIVOT_X, 0, up(1.11)), "metal_dark")
    return wheels


def bed(kit: Kit) -> int:
    """The machinery rear unit: an armored engine module on its nose with a grille, tanks and an exhaust stack, then an open deck with low armored sides.

    Four axles of duals sit under armored fender skirts. The game draws the outer wheels of the last axle. Returns the wheels the model draws.
    """
    length = BED_FRONT - BACK
    mid = (BED_FRONT + BACK) / 2
    kit.box("deck", (length, WIDTH, DECK_TOP - DECK_BOTTOM), (mid, 0, (DECK_TOP + DECK_BOTTOM) / 2), "metal_dark")
    for i in range(10):
        kit.box(f"deck_rib_{i}", (0.08, WIDTH - 0.4, 0.03), (MODULE_BACK - 0.6 - i * 0.9, 0, DECK_TOP + 0.015), "metal")
    mirrored(kit, "side_beam", (length, 0.12, 0.28), mid, HALF_W - 0.06, DECK_BOTTOM - 0.14, "paint")
    mirrored(kit, "bed_rail", (length - 0.3, 0.16, 0.4), mid - 0.15, 0.5, DECK_BOTTOM - 0.2, "under")
    wall_len = MODULE_BACK - BACK
    mirrored(kit, "wall", (wall_len, 0.1, 0.5), (MODULE_BACK + BACK) / 2, HALF_W - 0.05, DECK_TOP + 0.25, "paint")
    mirrored(kit, "wall_cap", (wall_len, 0.12, 0.08), (MODULE_BACK + BACK) / 2, HALF_W - 0.07, DECK_TOP + 0.54, "metal_dark")
    for i in range(7):
        x = MODULE_BACK - 0.5 - i * (wall_len - 1.0) / 6
        mirrored(kit, f"post_{i}", (0.14, 0.14, 0.7), x, HALF_W - 0.08, DECK_TOP + 0.35, "metal_dark")
    module(kit)
    wheels = sum(duals(kit, x) for x in BED_AXLES[:-1]) + duals(kit, BED_AXLES[-1], (1,))
    skirt_len = BED_AXLES[0] - BED_AXLES[-1] + 2 * WHEEL_R + 0.3
    mirrored(kit, "skirt", (skirt_len, 0.06, DECK_BOTTOM - HUB_Z + 0.1), (BED_AXLES[0] + BED_AXLES[-1]) / 2, HALF_W - 0.03, (DECK_BOTTOM + HUB_Z - 0.1) / 2, "metal_dark")
    mirrored(kit, "skirt_top", (skirt_len, 0.08, 0.12), (BED_AXLES[0] + BED_AXLES[-1]) / 2, HALF_W - 0.04, DECK_BOTTOM - 0.06, "paint")
    kit.box("bogie", (BED_AXLES[0] - BED_AXLES[-1] + 0.8, 1.2, DECK_BOTTOM - 0.4 - HUB_Z), ((BED_AXLES[0] + BED_AXLES[-1]) / 2, 0, (DECK_BOTTOM - 0.4 + HUB_Z) / 2), "under")
    mirrored(kit, "tail_flap", (0.04, 0.5, 0.5), BED_AXLES[-1] - WHEEL_R - 0.15, WHEEL_Z - DUAL_STEP / 2, up(0.5), "under")
    mirrored(kit, "tail_lamp", (0.06, 0.25, 0.12), BACK + 0.03, HALF_W - 0.3, DECK_BOTTOM - 0.1, "red")
    kit.box("tail_plate", (0.12, WIDTH - 0.3, 0.55), (BACK + 0.06, 0, DECK_TOP + 0.25), "rust")
    kit.box("underride", (0.12, WIDTH - 0.5, 0.16), (BACK + 0.4, 0, up(0.5)), "metal_dark")
    mirrored(kit, "leg", (0.12, 0.12, DECK_BOTTOM - up(0.3)), 2.4, 0.8, (DECK_BOTTOM + up(0.3)) / 2, "metal_dark")
    mirrored(kit, "foot", (0.3, 0.3, 0.06), 2.4, 0.8, up(0.3), "metal_dark")
    kit.cylinder("king_pin", 0.08, 0.2, (PIVOT_X, 0, DECK_BOTTOM - 0.1), "metal_dark", vertices=8)
    return wheels


def module(kit: Kit) -> None:
    """The engine module on the bed's nose: an armored block with a radiator grille on each side, a tank, pipes and a tall exhaust stack."""
    top = DECK_TOP + 1.6
    points = [(x, y, z) for x in (BED_FRONT, MODULE_BACK) for y in (1.2, -1.2) for z in (DECK_TOP, DECK_TOP + 1.2)]
    points += [(x, y, top) for x in (BED_FRONT - 0.5, MODULE_BACK + 0.3) for y in (0.95, -0.95)]
    hull(kit, "module", points, "paint")
    mid = (BED_FRONT + MODULE_BACK) / 2
    kit.box("module_cap", (BED_FRONT - MODULE_BACK - 1.2, 1.6, 0.1), (mid, 0, top + 0.05), "metal_dark")
    kit.box("headboard", (0.15, WIDTH, 0.9), (BED_FRONT - 0.075, 0, DECK_TOP + 0.45), "metal_dark")
    for s in (1, -1):
        kit.box(f"grille_frame_{s}", (1.8, 0.06, 0.95), (mid - 0.2, s * 1.22, DECK_TOP + 0.75), "metal_dark")
        for i in range(6):
            kit.box(f"grille_slat_{s}_{i}", (1.7, 0.08, 0.06), (mid - 0.2, s * 1.25, DECK_TOP + 0.4 + 0.15 * i), "under")
        kit.box(f"armor_panel_{s}", (1.2, 0.06, 0.9), (MODULE_BACK + 0.8, s * 1.22, DECK_TOP + 0.55), "rust")
        kit.cylinder(f"pipe_{s}", 0.08, MODULE_BACK - BED_FRONT + 4.2, (mid - 0.1, s * 0.55, top + 0.3), "rust", rot=(0, math.pi / 2, 0), vertices=8)
    kit.cylinder("tank", 0.42, 1.8, (mid - 0.6, 0, top + 0.5), "rust_side", rot=(0, math.pi / 2, 0), vertices=10)
    for i in range(3):
        kit.cylinder(f"tank_band_{i}", 0.44, 0.08, (mid - 1.2 + i * 0.6, 0, top + 0.5), "metal_dark", rot=(0, math.pi / 2, 0), vertices=10)
    stack_x = MODULE_BACK + 0.6
    kit.cylinder("exhaust", 0.2, 1.4, (stack_x, -0.7, top + 0.7), "metal_light", vertices=8)
    kit.cylinder("exhaust_cap", 0.26, 0.14, (stack_x, -0.7, top + 1.45), "metal_dark", vertices=8)
    kit.cylinder("exhaust_elbow", 0.16, 0.6, (stack_x + 0.1, -0.7, top + 1.75), "metal_light", rot=(0, math.pi / 3, 0), vertices=8)
    kit.box("tool_box", (0.9, 0.5, 0.45), (MODULE_BACK - 0.55, 0.6, DECK_TOP + 0.225), "rust")


def build_tractor(kit: Kit) -> int:
    wheels = tractor_frame(kit)
    cab(kit)
    engine_house(kit)
    return wheels


def check_unit(kit: Kit, name: str, front: float, back: float) -> None:
    check_rig_unit(kit, name, front, back, WIDTH, HUB_Z - TIRE_R)


def unit_wheels(name: str, wheels: int, unit: int) -> None:
    count_wheels(name, wheels, UNIT_MODEL_WHEELS[unit], 22)
