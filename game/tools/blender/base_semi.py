"""The semi base: an orange long-nose tractor pulling a tall white box trailer, one rigid body with 18 wheels on 5 axles.

Built from the committee's photo of a Peterbilt 379 type tractor with a container trailer, scaled to the game's trucks:
the scout is a pickup. A real rig is about 3.7 times a pickup's length, 1.3 times its width and 2.1 times its height,
so next to the 5.2 m long, 2.44 m wide, 2.4 m tall scout the rig is 20.5 m long, 3.1 m wide and 5.2 m tall.
The model owns the semi's body: 20.5 m along X, 3.1 m across Y. Body heights stand over DATUM, 1.8 m below the origin at the
collider center. The ground lies under it by the tire radius gained over 0.65 m, so the body rides lifted on its tires.
The 29 by 7 grid stretches over it at about 1.09 cells per cell along and 0.92 across, inside what body.test.ts allows.
From the front: a 0.3 m chrome bumper, a 2.6 m hood 1.76 m wide between fenders that flare to 2.88 m, a 2.05 m day cab
with its roof 3.55 m up, a 0.55 m open gap over the frame and the fifth wheel, then a 15.0 m box trailer from 1.6 m to 5.2 m up,
so its roof stands 1.46 times the cab roof. Twin stacks reach 4.55 m.
Axles: steer 1.3 m behind the bumper front, the drive tandem about 1 m and 2.8 m behind the cab, the trailer tandem 1.3 m and
3.05 m from the doors. Tandem axles stand TANDEM apart, so their tires keep TIRE_GAP between them. Wheel radius 0.8 m. The game draws the steer pair and the outer wheels of the last trailer axle from
PHYSICS.bodies.semi; the model draws the other 14 with the look of the game's wheel model, duals on the drive and trailer axles.
The sockets arch_front, arch_rear (the left wheel centers at the hub) and arch_front_top (the steer fender's crown) let
wheelArches.test.ts check them against physics. The engine stands in a hole in the hood at PHYSICS.bodies.semi.engine.
Cargo on the trailer's bay cells is inside the box, so the game does not draw it.
Run: blender --background --python tools/blender/base_semi.py -- public/models/base_semi.glb [tmp/base_semi.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402
from parts_common_base import ARCH_CLEARANCE, BASE_COLORS, SUSPENSION_REST, cut_boxes, hull_mesh  # noqa: E402
from shapes import prism  # noqa: E402

SEED = 321
LENGTH = 20.5
WIDTH = 3.1
DATUM = -1.8

WHEEL_X = 8.95  # PHYSICS.bodies.semi.wheelX: the steer axle and the last trailer axle
WHEEL_Y = -0.75  # PHYSICS.bodies.semi.wheelY
WHEEL_Z = 1.24  # PHYSICS.bodies.semi.wheelZ: the steer wheels and the outer duals
WHEEL_R = 0.8  # PHYSICS.bodies.semi.wheelRadius
WHEEL_HALF_W = 0.21  # PHYSICS.bodies.semi.wheelHalfWidth
ENGINE = (8.35, -0.15, 0.0)  # PHYSICS.bodies.semi.engine, as Blender x, z and -y
HUB_Z = WHEEL_Y - SUSPENSION_REST
TIRE_R = WHEEL_R * 0.935  # the wheel model's tire body; its lugs reach the ground
DUAL_STEP = 2 * WHEEL_HALF_W + 0.02
TIRE_GAP = 0.15
TANDEM = 2 * WHEEL_R + TIRE_GAP
DRIVE_MID = 3.4
DRIVE_AXLES = (DRIVE_MID + TANDEM / 2, DRIVE_MID - TANDEM / 2)
TRAILER_AXLES = (-WHEEL_X + TANDEM, -WHEEL_X)
TANDEM_COVER = TANDEM + 1.3
MODEL_WHEELS = 14

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


def mirrored(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    """A box on the left side at +y and its twin on the right side."""
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def hull(kit: Kit, name: str, points: list[tuple[float, float, float]], mat: str) -> None:
    kit._add(hull_mesh(name, points), name, mat, 0.0)


def box_points(x0: float, x1: float, half_y: float, z0: float, z1: float) -> list[tuple[float, float, float]]:
    return [(x, y, z) for x in (x0, x1) for y in (half_y, -half_y) for z in (z0, z1)]


def wheel(kit: Kit, name: str, x: float, y: float) -> None:
    """One wheel in the look of the game's wheel model: a 24-sided tire, an 8-sided light rim and a 6-sided hub."""
    width = 2 * WHEEL_HALF_W
    axle = (math.pi / 2, 0, 0)
    kit.cylinder(f"{name}_tire", TIRE_R, width * 0.94, (x, y, HUB_Z), "wheel", rot=axle, vertices=24)
    kit.cylinder(f"{name}_rim", WHEEL_R * 0.55, width * 0.98, (x, y, HUB_Z), "metal_light", rot=axle, vertices=8)
    kit.cylinder(f"{name}_hub", WHEEL_R * 0.22, width, (x, y, HUB_Z), "rust", rot=axle, vertices=6)


def check_tandems() -> None:
    """Raises when two tires of a tandem stand closer than TIRE_GAP."""
    for name, (a, b) in (("drive", DRIVE_AXLES), ("trailer", TRAILER_AXLES)):
        gap = abs(a - b) - 2 * WHEEL_R
        if gap < TIRE_GAP - 1e-9:
            raise RuntimeError(f"base_semi {name} tandem tires stand {gap:.3f} m apart, under {TIRE_GAP} m")


def running_gear(kit: Kit) -> int:
    """The frame rails and the 14 wheels the game does not draw. Returns the wheel count."""
    check_tandems()
    count = 0
    for x in DRIVE_AXLES + TRAILER_AXLES[:1]:
        for s in (1, -1):
            for k, y in enumerate((WHEEL_Z, WHEEL_Z - DUAL_STEP)):
                wheel(kit, f"dual_{x}_{s}_{k}", x, s * y)
                count += 1
    for s in (1, -1):
        wheel(kit, f"inner_{s}", -WHEEL_X, s * (WHEEL_Z - DUAL_STEP))
        count += 1
    tractor_end = DRIVE_AXLES[1] - WHEEL_R - 0.25
    mirrored(kit, "rail", (GRILLE_X - 0.1 - tractor_end, 0.14, FRAME_TOP - FRAME_BOTTOM), (GRILLE_X - 0.1 + tractor_end) / 2, 0.45, (FRAME_TOP + FRAME_BOTTOM) / 2, "under")
    for x in DRIVE_AXLES + TRAILER_AXLES:
        kit.box(f"axle_{x}", (0.14, 2 * (WHEEL_Z - DUAL_STEP), 0.14), (x, 0, HUB_Z), "under")
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
    arc = [(WHEEL_X + outer * math.cos(math.pi * k / 8), HUB_Z + outer * math.sin(math.pi * k / 8)) for k in range(1, 8)]
    under = [(WHEEL_X + inner * math.cos(math.pi * k / 8), HUB_Z + inner * math.sin(math.pi * k / 8)) for k in range(7, 0, -1)]
    outline = [(GRILLE_X - 0.08, up(0.95)), (GRILLE_X - 0.08, HUB_Z + outer * 0.55), *arc, (CAB_FRONT + 0.3, up(1.05)), (CAB_FRONT + 0.3, up(0.9)), (WHEEL_X - inner, up(0.9)), *under, (WHEEL_X + inner, up(0.95))]
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
        kit.cylinder(f"tank_{name}", 0.3, 1.1, (CAB_BACK + 0.6, s * (CAB_HALF - 0.3), up(0.62)), "chrome", rot=(0, math.pi / 2, 0), vertices=10)
        kit.box(f"step_{name}", (0.45, 0.32, 0.08), (CAB_FRONT - 0.15, s * (CAB_HALF - 0.16), up(0.62)), "under")
        kit.box(f"step_box_{name}", (0.5, 0.3, 0.45), (CAB_FRONT - 0.15, s * (CAB_HALF - 0.17), up(0.82)), "metal_dark")


def stacks(kit: Kit) -> None:
    """Twin tall chrome stacks behind the cab doors, with a wider heat shield on their lower half."""
    for s, name in ((1, "l"), (-1, "r")):
        y = s * (CAB_HALF - 0.12)
        kit.cylinder(f"stack_{name}", 0.08, STACK_TOP - CAB_BOTTOM, (CAB_BACK - 0.12, y, (STACK_TOP + CAB_BOTTOM) / 2), "chrome", vertices=8)
        kit.cylinder(f"stack_shield_{name}", 0.12, 1.1, (CAB_BACK - 0.12, y, CAB_ROOF - 0.7), "chrome", vertices=8)


def coupling(kit: Kit) -> None:
    """The fifth wheel plate over the drive tandem, deck plates behind the cab, and the drive tandem's mud flaps."""
    mid = (DRIVE_AXLES[0] + DRIVE_AXLES[1]) / 2
    kit.box("fifth_wheel", (0.9, 1.2, 0.12), (mid, 0, TRAILER_FLOOR - 0.14), "metal_dark")
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
        kit.box(f"trailer_flap_{name}", (0.04, 0.62, 0.6), (-WHEEL_X - WHEEL_R - 0.2, s * (WHEEL_Z - DUAL_STEP / 2), up(0.55)), "stripe")
    kit.box("leg_brace", (0.08, 1.7, 0.08), (LEGS_X, 0, up(0.8)), "metal_dark")
    kit.box("underride", (0.12, WIDTH - 0.4, 0.16), (BACK + 0.25, 0, up(0.5)), "metal_dark")
    kit.box("bogie", (TANDEM_COVER, 1.2, TRAILER_FLOOR - HUB_Z - 0.2), ((TRAILER_AXLES[0] + TRAILER_AXLES[1]) / 2, 0, (TRAILER_FLOOR + HUB_Z + 0.2) / 2), "under")
    kit.box("trailer_frame", (length - 0.4, 1.0, 0.16), ((TRAILER_FRONT + BACK) / 2, 0, TRAILER_FLOOR - 0.08), "under")


def check_size(kit: Kit) -> None:
    """Raises when the model leaves its LENGTH x WIDTH footprint or does not fill it."""
    bpy.context.view_layer.update()
    pts = [obj.matrix_world @ v.co for obj in kit._parts for v in obj.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    print(f"base_semi bounds x {lo.x:.3f}..{hi.x:.3f} y {lo.y:.3f}..{hi.y:.3f} z {lo.z:.3f}..{hi.z:.3f}")
    if abs(hi.x - lo.x - LENGTH) > 0.01 or abs(hi.y - lo.y - WIDTH) > 0.01 or abs(lo.z - (HUB_Z - TIRE_R)) > 0.01:
        raise RuntimeError(f"base_semi is {hi.x - lo.x:.3f} x {hi.y - lo.y:.3f} m from z {lo.z:.3f}, not {LENGTH} x {WIDTH} from the tire bottom")


def main() -> None:
    args = parse_args()
    colors = {
        **BASE_COLORS,
        "orange": 0xD9701C,  # PAL.semi.orange
        "stripe": 0x1E1C1A,  # PAL.semi.stripe
        "chrome": 0xC4C9CC,  # PAL.semi.chrome
        "amber": 0xF2A22C,  # PAL.semi.amber
        "white": 0xE6E4DA,  # PAL.semi.white
        "rib": 0xB9B8B0,  # PAL.semi.rib
    }
    kit = Kit(colors, SEED)
    wheels = running_gear(kit)
    if wheels != MODEL_WHEELS:
        raise RuntimeError(f"base_semi draws {wheels} wheels, not {MODEL_WHEELS}: with the game's 4 the hauler must show 18")
    hood(kit)
    grille(kit)
    fenders(kit)
    cab(kit)
    tanks_and_steps(kit)
    stacks(kit)
    coupling(kit)
    trailer(kit)
    kit.socket("arch_front", (WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (-WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEEL_X, WHEEL_Z, HUB_Z + WHEEL_R + ARCH_CLEARANCE))
    check_size(kit)
    kit.export("base_semi", args, view_size=20.0)


if __name__ == "__main__":
    main()
