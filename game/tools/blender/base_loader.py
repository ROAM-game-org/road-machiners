from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, Vec3, parse_args, round_sides  # noqa: E402
from parts_common_base import cut_boxes, hull_mesh, ARCH_CLEARANCE, BASE_COLORS, SUSPENSION_REST, Grid, check_base, level_sockets, surface_z  # noqa: E402
from shapes import prism  # noqa: E402

SEED = 307
LENGTH = 6.3
WIDTH = 2.95
G = Grid(rows=9, cols=7, half_height=0.65, length=LENGTH)
WHEEL_R = 0.8
WHEEL_HALF_W = 0.32
WHEEL_X = 1.475
WHEEL_Z = 1.06
HUB_Z = -0.45 - SUSPENSION_REST
GROUND = HUB_Z - WHEEL_R
TIRE_IN = WHEEL_Z - WHEEL_HALF_W - 0.03
TIRE_OUT = WHEEL_Z + WHEEL_HALF_W + 0.05
FENDER_R = WHEEL_R + ARCH_CLEARANCE
FENDER_T = 0.1
BUCKET_CLEARANCE = 0.05
FENDER_NOSE = 2.38
FENDER_LIP = 0.22
FENDER_DROP = -0.38
FRONT_DECK_BACK = 1.02

FRONT = LENGTH / 2 - 0.02
BACK = -LENGTH / 2
BUCKET_HALF = WIDTH / 2
BUCKET = [(FRONT, GROUND + 0.34), (2.72, GROUND + 0.3), (2.5, GROUND + 0.34), (2.38, GROUND + 0.5), (2.36, GROUND + 0.77), (2.38, GROUND + 1.05), (2.44, GROUND + 1.36), (2.56, GROUND + 1.64)]
BUCKET_T = 0.06
B_PIN = (2.3, GROUND + 0.6)
TILT_PIN = (2.33, GROUND + 1.2)

FRAME_BOTTOM = GROUND + 0.46
FRAME_TOP = -0.5
FRAME_Y = 0.42
HINGE_GAP = 0.12
ARM_Y = 0.6
ARM_T = 0.14
A_PIN = (0.68, 0.45)
ELBOW = (1.95, 0.08)
CROSS = (0.9, 0.38)
CRANK_TOP = (0.82, 0.66)
CRANK_LOW = (0.92, -0.42)
TILT_BASE = (0.5, 0.42)
FRONT_DECK_TOP = -0.25
TOWER_Y = 0.51
TOWER_T = 0.14

PLATFORM_FRONT = 0.5
PLATFORM_BACK = -1.2
PLATFORM_TOP = 0.13
PLATFORM_HALF = TIRE_OUT
POD_FRONT = -0.14
POD_BACK = -0.62

CAB_FRONT = 0.38
CAB_BACK = -1.07
CAB_HALF = 0.78
BELT = PLATFORM_TOP + 0.16
ROOF = GROUND + 3.46
ROOF_T = 0.15
UNDER_ROOF = ROOF - ROOF_T
ROOF_OVER = 0.08
PILLAR = 0.1

HOOD_FRONT = CAB_BACK
HOOD_Y = 0.68
HOOD_TOP = GROUND + 2.67
HOOD_TAIL = GROUND + 2.45
HOOD_BOTTOM = FRAME_TOP
SHOULDER_R = 0.2
BAY_FRONT = -1.55
BAY_BACK = -2.99
BAY_Y = 0.45
BAY_FLOOR = 0.5
BAY_T = 0.05
HOOD_BACK = BAY_BACK - 0.02
HOUSING_FRONT = HOOD_BACK + 0.24
LOUVERS = 6
LOUVER_HALF = HOOD_Y - 0.12
VENT_FRONT = HOUSING_FRONT + 0.8
VENT_BACK = HOUSING_FRONT + 0.25
VENT_BOTTOM = GROUND + 1.45
VENT_TOP = GROUND + 2.25
STACK_X = CAB_BACK - 0.24
STACK_Y = 0.42
STACK_R = 0.12
EXHAUST_TOP = ROOF - 0.06
ELBOW_LEN = 0.26
ELBOW_TILT = math.radians(50)
DOME_R = 0.23
BEACON_X = CAB_BACK + 0.3
BEACON_Y = 0.7
BEACON_R = 0.08

COUNTER_FRONT = -2.55
COUNTER_TOP = FRAME_TOP
COUNTER_BOTTOM = GROUND + 0.55
COUNTER_HALF = 1.1
COUNTER_CORNER = 0.25
COUNTER_CHAMFER = 0.18
LAMP_Y = 0.9


def mirrored(kit: Kit, name: str, size: Vec3, x: float, y: float, z: float, mat: str) -> None:
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def beam(kit: Kit, name: str, p0: tuple[float, float], p1: tuple[float, float], y: float, width: float, height: float, mat: str) -> None:
    dx, dz = p1[0] - p0[0], p1[1] - p0[1]
    kit.box(name, (math.hypot(dx, dz), width, height), ((p0[0] + p1[0]) / 2, y, (p0[1] + p1[1]) / 2), mat, rot=(0, math.atan2(-dz, dx), 0))


def rod(kit: Kit, name: str, p0: tuple[float, float], p1: tuple[float, float], y: float, radius: float, mat: str) -> None:
    dx, dz = p1[0] - p0[0], p1[1] - p0[1]
    kit.cylinder(name, radius, math.hypot(dx, dz), ((p0[0] + p1[0]) / 2, y, (p0[1] + p1[1]) / 2), mat, rot=(0, math.atan2(dx, dz), 0), vertices=round_sides(radius))


def ram(kit: Kit, name: str, p0: tuple[float, float], p1: tuple[float, float], y: float, radius: float) -> None:
    mid = (p0[0] + (p1[0] - p0[0]) * 0.55, p0[1] + (p1[1] - p0[1]) * 0.55)
    rod(kit, f"{name}_barrel", p0, mid, y, radius, "under")
    rod(kit, f"{name}_rod", mid, p1, y, radius * 0.55, "metal_light")


def pin(kit: Kit, name: str, at: tuple[float, float], y: float, width: float, radius: float = 0.06) -> None:
    kit.cylinder(name, radius, width, (at[0], y, at[1]), "metal_light", rot=(math.pi / 2, 0, 0), vertices=round_sides(radius))


def lerp(p0: tuple[float, float], p1: tuple[float, float], t: float) -> tuple[float, float]:
    return (p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t)


def side_normals(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    out = []
    for i, p in enumerate(points):
        a = points[max(i - 1, 0)]
        b = points[min(i + 1, len(points) - 1)]
        dx, dz = b[0] - a[0], b[1] - a[1]
        n = math.hypot(dx, dz)
        out.append((dz / n, -dx / n))
    return out


def shell(points: list[tuple[float, float]], thickness: float) -> list[tuple[float, float]]:
    inner = [(p[0] + n[0] * thickness, p[1] + n[1] * thickness) for p, n in zip(points, side_normals(points))]
    return points + list(reversed(inner))


def band(points: list[tuple[float, float]], halves: list[float]) -> list[tuple[float, float]]:
    normals = side_normals(points)
    top = [(p[0] - n[0] * h, p[1] - n[1] * h) for p, n, h in zip(points, normals, halves)]
    low = [(p[0] + n[0] * h, p[1] + n[1] * h) for p, n, h in zip(points, normals, halves)]
    return top + list(reversed(low))


def arc_steps(sweep: float, radius: float = FENDER_R) -> int:
    return max(4, round(round_sides(radius) * abs(sweep) / math.tau))


def fender(kit: Kit, name: str, wx: float, a0: float, a1: float, y0: float, y1: float) -> None:
    inner, outer = [], []
    steps = arc_steps(a1 - a0)
    for k in range(steps + 1):
        a = a0 + (a1 - a0) * k / steps
        inner.append((wx + FENDER_R * math.cos(a), HUB_Z + FENDER_R * math.sin(a)))
        outer.append((wx + (FENDER_R + FENDER_T) * math.cos(a), HUB_Z + (FENDER_R + FENDER_T) * math.sin(a)))
    prism(kit, name, outer + list(reversed(inner)), y0, y1, "paint")


def front_fender(kit: Kit, name: str, y0: float, y1: float) -> None:
    inner, outer = [], []
    steps = arc_steps(math.radians(75))
    for k in range(steps + 1):
        a = math.radians(165) - math.radians(75) * k / steps
        inner.append((WHEEL_X + FENDER_R * math.cos(a), HUB_Z + FENDER_R * math.sin(a)))
        outer.append((WHEEL_X + (FENDER_R + FENDER_T) * math.cos(a), HUB_Z + (FENDER_R + FENDER_T) * math.sin(a)))
    top_in, top_out = HUB_Z + FENDER_R, HUB_Z + FENDER_R + FENDER_T
    lip_steps = arc_steps(math.pi / 2, FENDER_LIP)
    for k in range(1, lip_steps + 1):
        a = math.pi / 2 * k / lip_steps
        inner.append((FENDER_NOSE - FENDER_LIP + (FENDER_LIP - FENDER_T) * math.sin(a), top_in - FENDER_LIP + FENDER_T + (FENDER_LIP - FENDER_T) * math.cos(a)))
        outer.append((FENDER_NOSE - FENDER_LIP + FENDER_LIP * math.sin(a), top_out - FENDER_LIP + FENDER_LIP * math.cos(a)))
    inner.append((FENDER_NOSE - FENDER_T, FENDER_DROP))
    outer.append((FENDER_NOSE, FENDER_DROP))
    prism(kit, name, outer + list(reversed(inner)), y0, y1, "paint")


def check_bucket_clear() -> None:
    for a, b in zip(BUCKET, BUCKET[1:]):
        for k in range(11):
            x, z = lerp(a, b, k / 10)
            gap = math.hypot(x - WHEEL_X, z - HUB_Z) - WHEEL_R
            if gap < BUCKET_CLEARANCE:
                raise RuntimeError(f"The bucket at x {x:.3f} z {z:.3f} keeps {gap:.3f} m from the front tire, under {BUCKET_CLEARANCE}")


def bucket(kit: Kit) -> None:
    check_bucket_clear()
    prism(kit, "scoop", shell(BUCKET, BUCKET_T), -BUCKET_HALF + 0.05, BUCKET_HALF - 0.05, "metal_light")
    top = BUCKET[-1]
    plate = [*BUCKET, (top[0] + 0.3, top[1] - 0.1), (FRONT - 0.08, BUCKET[0][1] + 0.62), (FRONT, BUCKET[0][1] + 0.4)]
    prism(kit, "side_plate_l", plate, BUCKET_HALF - 0.05, BUCKET_HALF, "metal_light")
    prism(kit, "side_plate_r", plate, -BUCKET_HALF, -BUCKET_HALF + 0.05, "metal_light")
    guard = [(top[0], top[1] - 0.02), (top[0] - 0.1, top[1] + 0.22), (top[0] - 0.05, top[1] + 0.22), (top[0] + 0.05, top[1])]
    prism(kit, "spill_guard", guard, -BUCKET_HALF + 0.05, BUCKET_HALF - 0.05, "metal_light")
    beam(kit, "cutting_edge", BUCKET[0], lerp(BUCKET[0], BUCKET[1], 0.35), 0, 2 * BUCKET_HALF - 0.1, 0.05, "metal")
    beam(kit, "wear_strip", lerp(BUCKET[3], BUCKET[4], 0.2), lerp(BUCKET[5], BUCKET[6], 0.5), 0, 2 * BUCKET_HALF - 0.2, 0.12, "under")
    for s, y in (("l", ARM_Y), ("r", -ARM_Y)):
        kit.box(f"bucket_ear_{s}", (0.16, 0.18, 0.34), (B_PIN[0] + 0.04, y, B_PIN[1] + 0.06), "under")
    kit.box("tilt_ear", (0.14, 0.2, 0.3), (TILT_PIN[0] + 0.04, 0, TILT_PIN[1]), "under")


def lift_arms(kit: Kit) -> None:
    arm = band([A_PIN, ELBOW, B_PIN], [0.17, 0.16, 0.1])
    for s, y in (("l", ARM_Y), ("r", -ARM_Y)):
        prism(kit, f"arm_{s}", arm, y - ARM_T / 2, y + ARM_T / 2, "paint")
        pin(kit, f"a_pin_{s}", A_PIN, y, ARM_T + 0.08)
        pin(kit, f"b_pin_{s}", B_PIN, y, ARM_T + 0.08)
        ram(kit, f"lift_{s}", (0.42, FRAME_TOP - 0.35), lerp(A_PIN, ELBOW, 0.62), y * 0.87, 0.08)
        tower = [(0.2, FRAME_TOP), (1.2, FRAME_TOP), (0.9, 0.4), (0.68, 0.57), (0.48, 0.45), (0.4, 0.15)]
        prism(kit, f"tower_{s}", tower, y * TOWER_Y / ARM_Y - TOWER_T / 2, y * TOWER_Y / ARM_Y + TOWER_T / 2, "paint")
        kit.cylinder(f"lamp_{s}", 0.08, 0.06, (1.03, y * TOWER_Y / ARM_Y, -0.05), "light", rot=(0, math.pi / 2, 0), vertices=round_sides(0.08))
    kit.box("tilt_mount", (0.2, 0.3, TILT_BASE[1] - FRAME_TOP), (TILT_BASE[0], 0, (TILT_BASE[1] + FRAME_TOP) / 2), "paint")
    kit.cylinder("cross_tube", 0.08, 2 * ARM_Y, (CROSS[0], 0, CROSS[1]), "paint", rot=(math.pi / 2, 0, 0), vertices=round_sides(0.08))
    for s, y in (("l", 0.13), ("r", -0.13)):
        beam(kit, f"bellcrank_{s}", CRANK_LOW, CRANK_TOP, y, 0.1, 0.2, "paint")
    pin(kit, "crank_pin", CROSS, 0, 0.3, 0.07)
    ram(kit, "tilt", TILT_BASE, CRANK_TOP, 0, 0.1)
    for s, y in (("l", 0.07), ("r", -0.07)):
        beam(kit, f"tilt_link_{s}", CRANK_LOW, TILT_PIN, y, 0.07, 0.16, "paint")
    pin(kit, "tilt_pin", TILT_PIN, 0, 0.24, 0.05)


def frames(kit: Kit) -> None:
    nose = [(HINGE_GAP, FRAME_BOTTOM), (2.2, FRAME_BOTTOM), (2.2, FRAME_BOTTOM + 0.34), (1.2, FRAME_TOP), (HINGE_GAP, FRAME_TOP)]
    prism(kit, "front_frame", nose, -FRAME_Y, FRAME_Y, "under")
    kit.box("front_deck", (FENDER_NOSE - 0.08 - FRONT_DECK_BACK, 2 * TIRE_IN, FRONT_DECK_TOP - FRAME_TOP), ((FENDER_NOSE - 0.08 + FRONT_DECK_BACK) / 2, 0, (FRONT_DECK_TOP + FRAME_TOP) / 2), "paint")
    kit.box("rear_frame", (-HINGE_GAP - COUNTER_FRONT, 2 * FRAME_Y, FRAME_TOP - FRAME_BOTTOM), ((COUNTER_FRONT - HINGE_GAP) / 2, 0, (FRAME_TOP + FRAME_BOTTOM) / 2), "under")
    kit.box("hinge_block", (0.34, 0.5, 0.5), (0, 0, -0.9), "metal")
    for i, z in enumerate((-0.6, -1.12)):
        kit.box(f"hinge_plate{i}", (0.7, 0.56, 0.08), (0, 0, z), "under")
        kit.cylinder(f"hinge_pin{i}", 0.14, 0.18, (0, 0, z), "metal_light", vertices=round_sides(0.14))
    for s, (y0, y1) in (("l", (TIRE_IN, TIRE_OUT)), ("r", (-TIRE_OUT, -TIRE_IN))):
        front_fender(kit, f"front_fender_{s}", y0, y1)
        fender(kit, f"rear_fender_{s}", -WHEEL_X, math.radians(20), math.radians(172), y0, y1)


def platform(kit: Kit) -> None:
    pod_y = (FRAME_Y + PLATFORM_HALF - 0.12) / 2
    mirrored(kit, "pod", (POD_FRONT - POD_BACK, PLATFORM_HALF - 0.12 - FRAME_Y, PLATFORM_TOP - 0.1 + 0.85), (POD_FRONT + POD_BACK) / 2, pod_y, (PLATFORM_TOP - 0.1 - 0.85) / 2, "paint")
    kit.box("platform", (PLATFORM_FRONT - PLATFORM_BACK, 2 * PLATFORM_HALF, 0.1), ((PLATFORM_FRONT + PLATFORM_BACK) / 2, 0, PLATFORM_TOP - 0.05), "paint")
    ladder_y = PLATFORM_HALF - 0.08
    for x in (-0.2, -0.56):
        kit.box(f"ladder_rail{x:.2f}", (0.04, 0.04, PLATFORM_TOP + 0.6 - FRAME_BOTTOM), (x, ladder_y + 0.02, (PLATFORM_TOP + 0.6 + FRAME_BOTTOM) / 2), "under")
    for i in range(4):
        kit.box(f"rung{i}", (0.36, 0.05, 0.03), (-0.38, ladder_y + 0.02, FRAME_BOTTOM + 0.1 + 0.3 * i), "metal_light")
    rail_y = PLATFORM_HALF - 0.03
    for s, y in (("l", rail_y), ("r", -rail_y)):
        kit.box(f"rail_{s}", (PLATFORM_FRONT - PLATFORM_BACK - 0.1, 0.04, 0.04), ((PLATFORM_FRONT + PLATFORM_BACK) / 2, y, PLATFORM_TOP + 0.7), "under")
        for x in (PLATFORM_FRONT - 0.07, -0.35, PLATFORM_BACK + 0.07):
            kit.box(f"rail_post_{s}{x:.2f}", (0.04, 0.04, 0.7), (x, y, PLATFORM_TOP + 0.35), "under")


def cab(kit: Kit) -> None:
    mid = (CAB_FRONT + CAB_BACK) / 2
    length = CAB_FRONT - CAB_BACK
    h = UNDER_ROOF - BELT
    kit.box("cab_base", (length, 2 * CAB_HALF, BELT - PLATFORM_TOP), (mid, 0, (BELT + PLATFORM_TOP) / 2), "paint")
    kit.box("glass", (length - 0.04, 2 * CAB_HALF - 0.04, h), (mid, 0, (BELT + UNDER_ROOF) / 2), "glass")
    for x in (CAB_FRONT - PILLAR / 2, CAB_BACK + PILLAR / 2):
        mirrored(kit, f"pillar{x:.2f}", (PILLAR, PILLAR, h), x, CAB_HALF - PILLAR / 2, (BELT + UNDER_ROOF) / 2, "trim")
    mirrored(kit, "door_post", (0.07, 0.03, h), mid - 0.15, CAB_HALF, (BELT + UNDER_ROOF) / 2, "trim")
    kit.box("roof", (length + 2 * ROOF_OVER, 2 * (CAB_HALF + ROOF_OVER), ROOF_T), (mid, 0, ROOF - ROOF_T / 2), "paint")
    kit.box("roof_band", (length + 2 * ROOF_OVER + 0.02, 2 * (CAB_HALF + ROOF_OVER) + 0.02, 0.05), (mid, 0, UNDER_ROOF + 0.025), "trim")
    for x, face in ((CAB_FRONT + ROOF_OVER + 0.01, 1), (CAB_BACK - ROOF_OVER - 0.01, -1)):
        for s, y in (("l", CAB_HALF - 0.05), ("r", -CAB_HALF + 0.05)):
            kit.cylinder(f"work_lamp_{s}{face}", 0.05, 0.05, (x, y, UNDER_ROOF - 0.08), "light", rot=(0, math.pi / 2, 0), vertices=round_sides(0.05))
    kit.cylinder("beacon_base", BEACON_R + 0.02, 0.04, (BEACON_X, BEACON_Y, ROOF + 0.02), "under", vertices=round_sides(BEACON_R + 0.02))
    kit.cylinder("beacon", BEACON_R, 0.16, (BEACON_X, BEACON_Y, ROOF + 0.12), "red", vertices=round_sides(BEACON_R))


def hood_top(x: float) -> float:
    return HOOD_TOP + (HOOD_TAIL - HOOD_TOP) * (HOOD_FRONT - x) / (HOOD_FRONT - HOOD_BACK)


def shoulder_section(x: float) -> list[Vec3]:
    top = hood_top(x)
    steps = arc_steps(math.pi / 2, SHOULDER_R)
    pts: list[Vec3] = []
    for s in (1, -1):
        pts.append((x, s * HOOD_Y, HOOD_BOTTOM))
        for k in range(steps + 1):
            a = math.pi / 2 * k / steps
            pts.append((x, s * (HOOD_Y - SHOULDER_R + SHOULDER_R * math.cos(a)), top - SHOULDER_R + SHOULDER_R * math.sin(a)))
    return pts


def check_grille_clear() -> None:
    if HOOD_BACK >= BAY_BACK:
        raise RuntimeError(f"The grille face at x {HOOD_BACK:.3f} cuts into the engine hole, which ends at x {BAY_BACK:.3f}")


def hood_shell(kit: Kit, name: str, x0: float, x1: float, mat: str) -> None:
    obj = hull_mesh(name, shoulder_section(x0) + shoulder_section(x1))
    cut_boxes(obj, [((BAY_BACK, -BAY_Y, BAY_FLOOR - BAY_T), (BAY_FRONT, BAY_Y, HOOD_TOP + 0.1))])
    obj.data.materials.clear()
    kit._add(obj, name, mat, 0.0)


def grille(kit: Kit) -> None:
    low, high = FRAME_TOP + 0.12, HOOD_TAIL - SHOULDER_R - 0.08
    for i in range(LOUVERS):
        z = low + (high - low) * i / (LOUVERS - 1)
        kit.box(f"louver{i}", (0.04, 2 * LOUVER_HALF, 0.08), (HOOD_BACK - 0.02, 0, z), "metal")
    for s, y in (("l", LOUVER_HALF + 0.03), ("r", -LOUVER_HALF - 0.03)):
        kit.box(f"louver_post_{s}", (0.05, 0.04, high - low + 0.12), (HOOD_BACK - 0.02, y, (low + high) / 2), "metal_dark")


def side_vents(kit: Kit) -> None:
    length = VENT_FRONT - VENT_BACK
    mid = (VENT_FRONT + VENT_BACK) / 2
    mirrored(kit, "vent", (length, 0.02, VENT_TOP - VENT_BOTTOM), mid, HOOD_Y + 0.005, (VENT_TOP + VENT_BOTTOM) / 2, "soot")
    for i in range(4):
        z = VENT_BOTTOM + (VENT_TOP - VENT_BOTTOM) * (i + 1) / 5
        mirrored(kit, f"vent_bar{i}", (length - 0.04, 0.02, 0.03), mid, HOOD_Y + 0.015, z, "metal_dark")


def exhaust(kit: Kit) -> None:
    low = hood_top(STACK_X) - 0.1
    axis = (-math.sin(ELBOW_TILT), math.cos(ELBOW_TILT))
    elbow_low = EXHAUST_TOP - ELBOW_LEN * axis[1] - (STACK_R + 0.01) * math.sin(ELBOW_TILT) - 0.01 * axis[1]
    stack_top = elbow_low + STACK_R * math.sin(ELBOW_TILT)
    kit.cylinder("exhaust", STACK_R, stack_top - low, (STACK_X, -STACK_Y, (stack_top + low) / 2), "soot", vertices=round_sides(STACK_R))
    kit.cylinder("exhaust_band", STACK_R + 0.015, 0.05, (STACK_X, -STACK_Y, low + 0.14), "metal_light", vertices=round_sides(STACK_R + 0.015))
    elbow_mid = (STACK_X + axis[0] * ELBOW_LEN / 2, elbow_low + axis[1] * ELBOW_LEN / 2)
    kit.cylinder("exhaust_elbow", STACK_R, ELBOW_LEN, (elbow_mid[0], -STACK_Y, elbow_mid[1]), "soot", rot=(0, -ELBOW_TILT, 0), vertices=round_sides(STACK_R))
    cap = (STACK_X + axis[0] * ELBOW_LEN, elbow_low + axis[1] * ELBOW_LEN)
    kit.cylinder("exhaust_cap", STACK_R + 0.01, 0.02, (cap[0], -STACK_Y, cap[1]), "metal_dark", rot=(0, -ELBOW_TILT, 0), vertices=round_sides(STACK_R + 0.01))


def precleaner(kit: Kit) -> None:
    low = hood_top(STACK_X) - 0.02
    kit.cylinder("precleaner_neck", 0.07, 0.12, (STACK_X, STACK_Y, low + 0.06), "soot", vertices=round_sides(0.07))
    kit.cylinder("precleaner", DOME_R, 0.07, (STACK_X, STACK_Y, low + 0.155), "soot", vertices=round_sides(DOME_R))
    kit.cylinder("precleaner_top", DOME_R * 0.7, 0.05, (STACK_X, STACK_Y, low + 0.215), "soot", vertices=round_sides(DOME_R * 0.7))


def hood(kit: Kit) -> None:
    check_grille_clear()
    hood_shell(kit, "hood", HOOD_FRONT, HOUSING_FRONT, "paint")
    hood_shell(kit, "grille_housing", HOUSING_FRONT, HOOD_BACK, "under")
    kit.box("bay", (BAY_FRONT - BAY_BACK, 2 * BAY_Y, BAY_T), ((BAY_FRONT + BAY_BACK) / 2, 0, BAY_FLOOR - BAY_T / 2), "metal")
    grille(kit)
    side_vents(kit)
    exhaust(kit)
    precleaner(kit)


def counterweight(kit: Kit) -> None:
    pts: list[Vec3] = []
    for s in (1, -1):
        pts += [(COUNTER_FRONT, s * (COUNTER_HALF - COUNTER_CHAMFER), COUNTER_BOTTOM), (COUNTER_FRONT, s * COUNTER_HALF, COUNTER_BOTTOM + COUNTER_CHAMFER), (COUNTER_FRONT, s * COUNTER_HALF, COUNTER_TOP)]
        pts += [(BACK + COUNTER_CORNER, s * (COUNTER_HALF - COUNTER_CHAMFER), COUNTER_BOTTOM), (BACK + COUNTER_CORNER, s * COUNTER_HALF, COUNTER_BOTTOM + COUNTER_CHAMFER), (BACK + COUNTER_CORNER, s * COUNTER_HALF, COUNTER_TOP)]
        pts += [(BACK + 0.03, s * (COUNTER_HALF - COUNTER_CORNER), COUNTER_BOTTOM + 0.1), (BACK + 0.03, s * (COUNTER_HALF - COUNTER_CORNER), COUNTER_TOP)]
    obj = hull_mesh("counterweight", pts)
    obj.data.materials.clear()
    kit._add(obj, "counterweight", "paint", 0.0)
    for s, y in (("l", LAMP_Y), ("r", -LAMP_Y)):
        kit.box(f"lamp_box_{s}", (0.14, 0.22, 0.2), (BACK + 0.12, y, COUNTER_TOP + 0.1), "paint")
        kit.box(f"taillight_{s}", (0.03, 0.16, 0.14), (BACK + 0.045, y, COUNTER_TOP + 0.1), "red")
    kit.box("hitch", (0.1, 0.36, 0.22), (BACK + 0.05, 0, (COUNTER_BOTTOM + COUNTER_TOP) / 2), "under")


def check_size(kit: Kit) -> None:
    bpy.context.view_layer.update()
    xs, ys = [], []
    for obj in kit._parts:
        for v in obj.data.vertices:
            p = obj.matrix_world @ v.co
            xs.append(p.x)
            ys.append(p.y)
    length, width = max(xs) - min(xs), max(ys) - min(ys)
    if abs(length - LENGTH) > 0.03 or abs(width - WIDTH) > 0.01:
        raise RuntimeError(f"base_loader is {length:.3f} x {width:.3f} m, not {LENGTH} x {WIDTH} m")


def main() -> None:
    args = parse_args()
    kit = Kit(BASE_COLORS, SEED)
    bucket(kit)
    lift_arms(kit)
    frames(kit)
    platform(kit)
    cab(kit)
    hood(kit)
    counterweight(kit)
    kit.socket("arch_front", (WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (-WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEEL_X, WHEEL_Z, HUB_Z + FENDER_R))
    levels = [surface_z(G, 3, y) for y in range(G.rows)]
    level_sockets(kit, G, "row", levels)
    level_sockets(kit, G, "floor", levels)
    check_size(kit)
    check_base(kit, "base_loader", G)
    kit.export("base_loader", args, view_size=8.0)


if __name__ == "__main__":
    main()
