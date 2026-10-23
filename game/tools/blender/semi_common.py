"""Shared shapes of the semi rig: an orange long-nose tractor and a tall white box trailer that swivel on the fifth wheel.

Built from the committee's photo of a Peterbilt 379 type tractor with a container trailer, scaled to the game's trucks:
the scout is a pickup. A real rig is about 3.7 times a pickup's length, 1.3 times its width and 2.1 times its height,
so next to the 5.2 m long, 2.44 m wide, 2.4 m tall scout the rig is 20.5 m long, 3.1 m wide and 5.2 m tall, 5.35 m on its lifted tires.
Every shape is laid out in the straight rig frame: 20.5 m along X from -10.25 to 10.25. Body heights stand over DATUM, 1.8 m below
the origin at the collider center, and the ground lies under it by the tire radius gained over 0.65 m, so the body rides lifted on its tires.
From the front: a 0.3 m chrome bumper, a 2.6 m hood 1.76 m wide between fenders that flare to 2.88 m, a 2.05 m day cab
with its roof 3.55 m up, a 0.55 m open gap over the frame and the fifth wheel, then a 15.0 m box trailer from 1.6 m to 5.2 m up,
so its roof stands 1.46 times the cab roof. Twin stacks reach 4.55 m.
Axles: steer 1.3 m behind the bumper front, the drive tandem about 1 m and 2.8 m behind the cab, the trailer tandem 1.3 m and
3.05 m from the doors. Tandem axles stand TANDEM apart, so their tires keep TIRE_GAP between them. Wheel radius 0.8 m. The tractor ends at x 1.225 and the trailer starts at x 4.75, so the trailer's nose rides
over the tractor's frame. The pivot, the king pin on the fifth wheel, is at x 3.0, over the drive tandem.
base_semi.py writes the tractor and base_semi_rear.py the trailer, each moved so its origin is its own collider center.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_base import ARCH_CLEARANCE, BASE_COLORS, SUSPENSION_REST, cut_boxes, hull_mesh  # noqa: E402
from parts_common_core import TIRE_SHARE, drawn_wheel  # noqa: E402
from rig_units import check_unit as check_rig_unit, export_unit, unit_wheels as count_wheels  # noqa: E402
from shapes import prism  # noqa: E402

SEED = 321
LENGTH = 20.5
WIDTH = 3.1
DATUM = -1.8

WHEEL_R = 0.8  # PHYSICS.bodies.semi.wheelRadius
TIRE_GAP = 0.15
TANDEM = 2 * WHEEL_R + TIRE_GAP
DRIVE_MID = 3.4
STEER_X = 8.95  # the steer axle in the straight rig frame
REAR_DRIVE_X = DRIVE_MID - TANDEM / 2  # the drive tandem's last axle; with the steer axle it sets PHYSICS.bodies.semi.wheelX about the tractor's center
LAST_TRAILER_X = -8.95  # PHYSICS.couplings.semi.rear.wheelX behind the trailer's center
WHEEL_Y = -0.75  # PHYSICS.bodies.semi.wheelY
WHEEL_Z = 1.24  # PHYSICS.bodies.semi.wheelZ: the steer wheels and the outer duals
WHEEL_HALF_W = 0.21  # PHYSICS.bodies.semi.wheelHalfWidth
ENGINE = (8.35, -0.15, 0.0)  # PHYSICS.bodies.semi.engine plus the tractor's center, as Blender x, z and -y
HUB_Z = WHEEL_Y - SUSPENSION_REST
TIRE_R = WHEEL_R * TIRE_SHARE  # the wheel model's tire body; its lugs reach the ground
DUAL_STEP = 2 * WHEEL_HALF_W + 0.02
DRIVE_AXLES = (DRIVE_MID + TANDEM / 2, REAR_DRIVE_X)
TRAILER_AXLES = (LAST_TRAILER_X + TANDEM, LAST_TRAILER_X)
TANDEM_COVER = TANDEM + 1.3
UNIT_MODEL_WHEELS = 6
PIVOT_X = 3.0  # PHYSICS.couplings.semi pivotFront and pivotRear, in the straight rig frame

FRONT = LENGTH / 2
BACK = -LENGTH / 2
GRILLE_X = FRONT - 0.3
CAB_FRONT = GRILLE_X - 2.6
CAB_BACK = CAB_FRONT - 2.05
TRAILER_FRONT = CAB_BACK - 0.55
TRAILER_HALF = WIDTH / 2
CAB_HALF = 1.44
HOOD_HALF = 0.88
GRILLE_HALF = 0.7
APRON_HALF = 1.0
FENDER_HALF = 1.44


def up(height: float) -> float:
    """Blender Z of a height above the body datum."""
    return DATUM + height


FRAME_BOTTOM = up(0.9)
FRAME_TOP = up(1.2)
HOOD_SHELF = up(1.65)
HOOD_FRONT_TOP = up(2.03)
HOOD_BACK_TOP = up(2.15)
CAB_BOTTOM = up(1.06)
CAB_ROOF = up(3.55)
TRAILER_FLOOR = up(1.6)
TRAILER_ROOF = up(5.2)
STACK_TOP = up(4.55)
BAY_FRONT = ENGINE[0] + 0.55
BAY_BACK = ENGINE[0] - 0.55
BAY_HALF = HOOD_HALF - 0.12
LEGS_X = DRIVE_AXLES[1] - WHEEL_R - 0.75
TRACTOR_REAR = 1.225
TRACTOR_ORIGIN = (FRONT + TRACTOR_REAR) / 2
TRAILER_ORIGIN = (TRAILER_FRONT + BACK) / 2
COLORS = {
    **BASE_COLORS,
    "orange": 0xD9701C,  # PAL.semi.orange
    "stripe": 0x1E1C1A,  # PAL.semi.stripe
    "chrome": 0xC4C9CC,  # PAL.semi.chrome
    "amber": 0xF2A22C,  # PAL.semi.amber
    "white": 0xE6E4DA,  # PAL.semi.white
    "rib": 0xB9B8B0,  # PAL.semi.rib
}


def mirrored(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    """A box on the left side at +y and its twin on the right side."""
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def hull(kit: Kit, name: str, points: list[tuple[float, float, float]], mat: str) -> None:
    kit._add(hull_mesh(name, points), name, mat, 0.0)


def box_points(x0: float, x1: float, half_y: float, z0: float, z1: float) -> list[tuple[float, float, float]]:
    return [(x, y, z) for x in (x0, x1) for y in (half_y, -half_y) for z in (z0, z1)]


def wheel(kit: Kit, name: str, x: float, y: float) -> None:
    """One wheel in the look of the game's wheel model, from drawn_wheel()."""
    drawn_wheel(kit, name, (x, y, HUB_Z), WHEEL_R, 2 * WHEEL_HALF_W)


def duals(kit: Kit, x: float, sides: tuple[int, ...] = (0, 1)) -> int:
    """Dual wheels on both ends of the axle at x: k 0 is the outer wheel, k 1 the inner. Returns the wheel count."""
    count = 0
    for s in (1, -1):
        for k in sides:
            wheel(kit, f"dual_{x}_{s}_{k}", x, s * (WHEEL_Z - k * DUAL_STEP))
            count += 1
    return count


def axle(kit: Kit, x: float) -> None:
    kit.box(f"axle_{x}", (0.14, 2 * (WHEEL_Z - DUAL_STEP), 0.14), (x, 0, HUB_Z), "under")


def check_tandems() -> None:
    """Raises when two tires of a tandem stand closer than TIRE_GAP."""
    for name, (a, b) in (("drive", DRIVE_AXLES), ("trailer", TRAILER_AXLES)):
        gap = abs(a - b) - 2 * WHEEL_R
        if gap < TIRE_GAP - 1e-9:
            raise RuntimeError(f"base_semi {name} tandem tires stand {gap:.3f} m apart, under {TIRE_GAP} m")


def tractor_gear(kit: Kit) -> int:
    """The frame rails to the rear cross member, the front drive axle's duals and the rear drive axle's inner duals.

    The game draws the steer pair and the outer wheels of the rear drive axle. Returns the wheel count.
    """
    check_tandems()
    count = duals(kit, DRIVE_AXLES[0]) + duals(kit, DRIVE_AXLES[1], (1,))
    mirrored(kit, "rail", (GRILLE_X - 0.1 - TRACTOR_REAR, 0.14, FRAME_TOP - FRAME_BOTTOM), (GRILLE_X - 0.1 + TRACTOR_REAR) / 2, 0.45, (FRAME_TOP + FRAME_BOTTOM) / 2, "under")
    kit.box("frame_end", (0.15, 1.2, FRAME_TOP - FRAME_BOTTOM), (TRACTOR_REAR + 0.075, 0, (FRAME_TOP + FRAME_BOTTOM) / 2), "metal_dark")
    for x in DRIVE_AXLES:
        axle(kit, x)
    return count


def trailer_gear(kit: Kit) -> int:
    """The first trailer axle's duals and the last axle's inner duals. The game draws the last axle's outer wheels."""
    count = duals(kit, TRAILER_AXLES[0]) + duals(kit, TRAILER_AXLES[1], (1,))
    for x in TRAILER_AXLES:
        axle(kit, x)
    return count


def hood(kit: Kit) -> None:
    """The long hood: a 1.7 m apron up to the shelf, a 1.5 m hood above it rising toward the windshield, with the engine hole."""
    hull(kit, "apron", box_points(GRILLE_X - 0.02, CAB_FRONT, APRON_HALF, FRAME_BOTTOM, HOOD_SHELF), "orange")
    top = [(GRILLE_X - 0.05, y, HOOD_FRONT_TOP) for y in (HOOD_HALF - 0.14, -HOOD_HALF + 0.14)]
    top += [(CAB_FRONT, y, HOOD_BACK_TOP) for y in (HOOD_HALF - 0.14, -HOOD_HALF + 0.14)]
    shoulder = [(GRILLE_X - 0.05, y, HOOD_FRONT_TOP - 0.12) for y in (HOOD_HALF, -HOOD_HALF)]
    shoulder += [(CAB_FRONT, y, HOOD_BACK_TOP - 0.12) for y in (HOOD_HALF, -HOOD_HALF)]
    base = [(x, y, HOOD_SHELF - 0.05) for x in (GRILLE_X - 0.05, CAB_FRONT) for y in (HOOD_HALF, -HOOD_HALF)]
    body = hull_mesh("hood", top + shoulder + base)
    cut_boxes(body, [((BAY_BACK, -BAY_HALF, ENGINE[1]), (BAY_FRONT, BAY_HALF, HOOD_BACK_TOP + 0.2))])
    body.data.materials.clear()
    kit._add(body, "hood", "orange", 0.0)
    kit.box("bay_floor", (BAY_FRONT - BAY_BACK, 2 * BAY_HALF, 0.04), ((BAY_FRONT + BAY_BACK) / 2, 0, ENGINE[1] - 0.02), "under")
    for s, name in ((1, "l"), (-1, "r")):
        stripe = [(GRILLE_X - 0.1, HOOD_SHELF + 0.02), (CAB_FRONT, HOOD_SHELF + 0.16), (CAB_FRONT, HOOD_SHELF + 0.28), (GRILLE_X - 0.1, HOOD_SHELF + 0.1)]
        y0, y1 = sorted((s * (HOOD_HALF - 0.01), s * (HOOD_HALF + 0.02)))
        prism(kit, f"hood_stripe_{name}", stripe, y0, y1, "stripe")


def grille(kit: Kit) -> None:
    """The tall chrome grille in a chrome frame, the heavy full-width bumper and square headlamp pods on the fenders."""
    low, high = up(0.75), HOOD_FRONT_TOP - 0.02
    kit.box("grille_frame", (0.1, 2 * GRILLE_HALF, high - low), (GRILLE_X, 0, (high + low) / 2), "chrome")
    kit.box("grille_slots", (0.04, 2 * GRILLE_HALF - 0.2, high - low - 0.2), (GRILLE_X + 0.04, 0, (high + low) / 2), "under")
    for i in range(4):
        kit.box(f"grille_bar_{i}", (0.05, 0.05, high - low - 0.2), (GRILLE_X + 0.05, (i - 1.5) * 0.24, (high + low) / 2), "chrome")
    kit.box("bumper", (FRONT - GRILLE_X, 2 * FENDER_HALF, 0.45), ((FRONT + GRILLE_X) / 2, 0, up(0.55)), "chrome")
    for s, name in ((1, "l"), (-1, "r")):
        kit.box(f"lamp_pod_{name}", (0.18, 0.3, 0.24), (GRILLE_X - 0.12, s * (HOOD_HALF + 0.22), up(1.28)), "chrome")
        kit.box(f"lamp_{name}", (0.04, 0.22, 0.16), (GRILLE_X - 0.02, s * (HOOD_HALF + 0.22), up(1.28)), "light")


def fenders(kit: Kit) -> None:
    """Flared steer fenders arching over the front wheels and sweeping down behind them to the cab step."""
    inner = WHEEL_R + ARCH_CLEARANCE
    outer = inner + 0.14
    arc = [(STEER_X + outer * math.cos(math.pi * k / 8), HUB_Z + outer * math.sin(math.pi * k / 8)) for k in range(1, 8)]
    under = [(STEER_X + inner * math.cos(math.pi * k / 8), HUB_Z + inner * math.sin(math.pi * k / 8)) for k in range(7, 0, -1)]
    outline = [(GRILLE_X - 0.08, up(0.95)), (GRILLE_X - 0.08, HUB_Z + outer * 0.55), *arc, (CAB_FRONT + 0.3, up(1.05)), (CAB_FRONT + 0.3, up(0.9)), (STEER_X - inner, up(0.9)), *under, (STEER_X + inner, up(0.95))]
    for s, name in ((1, "l"), (-1, "r")):
        y0, y1 = sorted((s * APRON_HALF, s * FENDER_HALF))
        prism(kit, f"fender_{name}", outline, y0, y1, "orange")


def cab(kit: Kit) -> None:
    """The day cab: wider than the hood, a split raked windshield, door glass, a roof visor with amber markers, and mirrors."""
    rake = 0.25
    glass_low, glass_high = HOOD_BACK_TOP + 0.12, CAB_ROOF - 0.18
    points = box_points(CAB_FRONT, CAB_BACK, CAB_HALF, CAB_BOTTOM, HOOD_BACK_TOP)
    points += [(x, y, CAB_ROOF) for x in (CAB_FRONT - rake, CAB_BACK) for y in (CAB_HALF - 0.06, -CAB_HALF + 0.06)]
    hull(kit, "cab", points, "orange")

    def front_x(z: float) -> float:
        return CAB_FRONT - rake * (z - HOOD_BACK_TOP) / (CAB_ROOF - HOOD_BACK_TOP)

    for s, name in ((1, "l"), (-1, "r")):
        pane = [(front_x(z) + d, s * y, z) for z in (glass_low, glass_high) for y in (0.06, CAB_HALF - 0.16) for d in (0.0, 0.02)]
        hull(kit, f"windshield_{name}", pane, "glass")
        door = [(CAB_FRONT - 0.35, glass_low), (CAB_BACK + 0.25, glass_low), (CAB_BACK + 0.25, glass_high), (front_x(glass_high) - 0.2, glass_high)]
        y0, y1 = sorted((s * (CAB_HALF - 0.03), s * (CAB_HALF + 0.005)))
        prism(kit, f"door_glass_{name}", door, y0, y1, "glass")
        sweep = [(CAB_FRONT, HOOD_SHELF + 0.16), (CAB_BACK, HOOD_SHELF + 0.45), (CAB_BACK, HOOD_SHELF + 0.57), (CAB_FRONT, HOOD_SHELF + 0.28)]
        y0, y1 = sorted((s * (CAB_HALF - 0.02), s * (CAB_HALF + 0.01)))
        prism(kit, f"door_stripe_{name}", sweep, y0, y1, "stripe")
        kit.box(f"mirror_arm_{name}", (0.05, 0.12, 0.05), (CAB_FRONT - 0.15, s * (CAB_HALF + 0.03), glass_low + 0.1), "chrome")
        kit.box(f"mirror_{name}", (0.06, 0.08, 0.5), (CAB_FRONT - 0.15, s * (CAB_HALF + 0.05), glass_low + 0.35), "chrome")
    kit.box("visor", (0.35, 2 * CAB_HALF - 0.1, 0.06), (front_x(CAB_ROOF) + 0.1, 0, CAB_ROOF - 0.02), "orange")
    for i in range(5):
        kit.box(f"marker_{i}", (0.08, 0.12, 0.08), (front_x(CAB_ROOF) + 0.05, (i - 2) * 0.4, CAB_ROOF + 0.05), "amber")


def tanks_and_steps(kit: Kit) -> None:
    """Chrome fuel tanks and dark steps under the doors, the frame between them hidden."""
    for s, name in ((1, "l"), (-1, "r")):
        kit.cylinder(f"tank_{name}", 0.3, 1.1, (CAB_BACK + 0.6, s * (CAB_HALF - 0.3), up(0.62)), "chrome", rot=(0, math.pi / 2, 0), vertices=round_sides(0.3))
        kit.box(f"step_{name}", (0.45, 0.32, 0.08), (CAB_FRONT - 0.15, s * (CAB_HALF - 0.16), up(0.62)), "under")
        kit.box(f"step_box_{name}", (0.5, 0.3, 0.45), (CAB_FRONT - 0.15, s * (CAB_HALF - 0.17), up(0.82)), "metal_dark")


def stacks(kit: Kit) -> None:
    """Twin tall chrome stacks behind the cab doors, with a wider heat shield on their lower half."""
    for s, name in ((1, "l"), (-1, "r")):
        y = s * (CAB_HALF - 0.12)
        kit.cylinder(f"stack_{name}", 0.08, STACK_TOP - CAB_BOTTOM, (CAB_BACK - 0.12, y, (STACK_TOP + CAB_BOTTOM) / 2), "chrome", vertices=round_sides(0.08))
        kit.cylinder(f"stack_shield_{name}", 0.12, 1.1, (CAB_BACK - 0.12, y, CAB_ROOF - 0.7), "chrome", vertices=round_sides(0.12))


def coupling(kit: Kit) -> None:
    """The fifth wheel plate on the pivot over the drive tandem, deck plates behind the cab, and the drive tandem's mud flaps."""
    mid = (DRIVE_AXLES[0] + DRIVE_AXLES[1]) / 2
    kit.box("fifth_wheel", (0.9, 1.2, 0.12), (PIVOT_X, 0, TRAILER_FLOOR - 0.14), "metal_dark")
    kit.box("deck_plate", (CAB_BACK - TRAILER_FRONT + 0.3, 1.2, 0.06), (CAB_BACK - 0.3, 0, FRAME_TOP + 0.03), "metal_dark")
    for s, name in ((1, "l"), (-1, "r")):
        kit.box(f"drive_flap_{name}", (0.04, 0.62, 0.6), (DRIVE_AXLES[1] - WHEEL_R - 0.2, s * (WHEEL_Z - DUAL_STEP / 2), up(0.55)), "stripe")
        kit.box(f"drive_fender_{name}", (TANDEM_COVER, 0.62, 0.05), (mid, s * (WHEEL_Z - DUAL_STEP / 2), HUB_Z + WHEEL_R + 0.12), "under")


def trailer(kit: Kit) -> None:
    """The white box trailer, ribbed on its sides and roof, with rear doors, lamps, an underride bar, landing legs and flaps."""
    hull(kit, "trailer", box_points(TRAILER_FRONT, BACK + 0.05, TRAILER_HALF - 0.03, TRAILER_FLOOR, TRAILER_ROOF), "white")
    length = TRAILER_FRONT - BACK
    height = TRAILER_ROOF - TRAILER_FLOOR
    mid_z = (TRAILER_ROOF + TRAILER_FLOOR) / 2
    mid_x = (TRAILER_FRONT + BACK) / 2
    mirrored(kit, "bottom_rail", (length, 0.06, 0.16), mid_x, TRAILER_HALF - 0.03, TRAILER_FLOOR + 0.08, "rib")
    mirrored(kit, "top_rail", (length, 0.06, 0.1), mid_x, TRAILER_HALF - 0.03, TRAILER_ROOF - 0.06, "rib")
    ribs = 16
    for i in range(ribs + 1):
        x = TRAILER_FRONT - 0.15 - i * (length - 0.3) / ribs
        kit.box(f"rib_{i}", (0.08, WIDTH, height - 0.2), (x, 0, mid_z), "rib")
    for i in range(8):
        x = TRAILER_FRONT - 0.6 - i * (length - 1.2) / 7
        kit.box(f"roof_rib_{i}", (0.1, WIDTH - 0.1, 0.03), (x, 0, TRAILER_ROOF + 0.01), "rib")
    kit.box("doors", (0.06, WIDTH - 0.16, height - 0.2), (BACK + 0.03, 0, mid_z), "white")
    kit.box("door_seam", (0.07, 0.04, height - 0.2), (BACK + 0.03, 0, mid_z), "rib")
    for s, name in ((1, "l"), (-1, "r")):
        for k, y in enumerate((0.3, 1.0)):
            kit.box(f"lock_bar_{name}{k}", (0.08, 0.04, height - 0.35), (BACK + 0.04, s * y, mid_z), "chrome")
        kit.box(f"tail_lamp_{name}", (0.06, 0.22, 0.12), (BACK + 0.03, s * (TRAILER_HALF - 0.25), TRAILER_FLOOR + 0.05), "red")
        kit.box(f"leg_{name}", (0.12, 0.12, TRAILER_FLOOR - up(0.3)), (LEGS_X, s * 0.85, (TRAILER_FLOOR + up(0.3)) / 2), "metal_dark")
        kit.box(f"foot_{name}", (0.3, 0.3, 0.06), (LEGS_X, s * 0.85, up(0.3)), "metal_dark")
        kit.box(f"trailer_flap_{name}", (0.04, 0.62, 0.6), (LAST_TRAILER_X - WHEEL_R - 0.2, s * (WHEEL_Z - DUAL_STEP / 2), up(0.55)), "stripe")
    kit.box("leg_brace", (0.08, 1.7, 0.08), (LEGS_X, 0, up(0.8)), "metal_dark")
    kit.box("underride", (0.12, WIDTH - 0.4, 0.16), (BACK + 0.25, 0, up(0.5)), "metal_dark")
    kit.box("bogie", (TANDEM_COVER, 1.2, TRAILER_FLOOR - HUB_Z - 0.2), ((TRAILER_AXLES[0] + TRAILER_AXLES[1]) / 2, 0, (TRAILER_FLOOR + HUB_Z + 0.2) / 2), "under")
    kit.box("trailer_frame", (length - 0.4, 1.0, 0.16), ((TRAILER_FRONT + BACK) / 2, 0, TRAILER_FLOOR - 0.08), "under")
    kit.cylinder("king_pin", 0.08, 0.2, (PIVOT_X, 0, TRAILER_FLOOR - 0.16), "metal_dark", vertices=round_sides(0.08))


def build_tractor(kit: Kit) -> int:
    """Every tractor shape in the straight rig frame. Returns the wheels the model draws."""
    wheels = tractor_gear(kit)
    hood(kit)
    grille(kit)
    fenders(kit)
    cab(kit)
    tanks_and_steps(kit)
    stacks(kit)
    coupling(kit)
    return wheels


def build_trailer(kit: Kit) -> int:
    """Every trailer shape in the straight rig frame. Returns the wheels the model draws."""
    wheels = trailer_gear(kit)
    trailer(kit)
    return wheels


def check_unit(kit: Kit, name: str, front: float, back: float, width: float) -> None:
    """Raises when the unit leaves its stretch of the straight rig frame or does not fill it."""
    check_rig_unit(kit, name, front, back, width, HUB_Z - TIRE_R)


def unit_wheels(name: str, wheels: int) -> None:
    count_wheels(name, wheels, UNIT_MODEL_WHEELS, 18)
