"""The hauler base: a GAZ-66, the Soviet cab-over 4x4 army truck with an open plank bed.

Built through the blender-image-to-3d brief and gates from the GAZ-66's published dimensions: 5.655 m long, 2.322 m wide,
2.44 m to the cab roof, a 3.3 m wheelbase and a 1.8 m track. Along and up it copies them at the scout's 1.077, across it takes
the scout's widening of 1.17: 6.09 m long, 2.92 m across the wings and the bed, 2.64 m to the hatch rim on its tires,
a 3.55 m wheelbase and a 2.26 m track, the track's real share of the width.
The ground is 1.4 m below the center, so a height h over the ground is Blender Z up(h). Levels over the ground: cab roof 2.60,
beltline and windshield foot 1.85, wing crown and bed floor 1.40, cab bottom 0.92, frame rails 0.78 to 1.02.
From the front: a dark bumper, a near-vertical cab face 0.13 m behind it with a two-pane windshield over a dark grille of
painted vertical slats, separate rounded wings proud of the cab sides with round lamps in their fronts, the cab back over the
front axle's rear, a 0.15 m gap over the frame with the fuel tanks and steps, a 3.7 m open bed with low plank walls on the frame,
dark mudguards over the rear wheels, taillights under the bed corners and a rear bumper beam.
Deviations from the truck: the wheels stay symmetric (its front overhang is 1.11 m and its rear 1.25 m), the width follows the
widening rule, the bed walls stay low so deck items show, the roof hatch over the engine cells stays where the engine shows, and
the tires keep the tire rule's 0.6 m radius.
Grid: 7 columns by 9 rows, stretched over the 6.09 by 2.92 m model. Half height 0.6 m, from PHYSICS.bodies.hauler.
Rows 0 to 2 are the cab, with the hatch over the engine cells, rows 1 and 2, columns 2 and 3. Rows 3 to 8 are the bed.
Wheels 1.775 m either side of the center and 1.13 m off the center line, radius 0.6 m, half width 0.25 m, mount 0.4 m below the center.
Sockets arch_front, arch_rear and arch_front_top (the arch crown) mark the arches for wheelArches.test.ts.
Run: blender --background --python tools/blender/base_hauler.py -- public/models/base_hauler.glb [tmp/base_hauler.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402
from parts_common_base import (  # noqa: E402
    ARCH_CLEARANCE,
    BASE_COLORS,
    FLARE,
    ROUND_ARCH_SEGMENTS,
    SUSPENSION_REST,
    Grid,
    check_base,
    check_door_gap,
    flare,
    level_sockets,
    round_arch,
)
from parts_common_core import ALONG_X, ROUND_SIDES  # noqa: E402
from shapes import prism  # noqa: E402

SEED = 302
LENGTH = 6.09  # 5.655 m x 1.077
WIDTH = 2.92  # 2.322 m x 1.077 x 1.17, the scout's widening
G = Grid(rows=9, cols=7, half_height=0.6, length=LENGTH, width=WIDTH)
WHEEL_R = 0.6  # PHYSICS.bodies.hauler.wheelRadius
WHEEL_HALF_W = 0.25  # PHYSICS.bodies.hauler.wheelHalfWidth
WHEEL_X = 1.775  # PHYSICS.bodies.hauler.wheelX: half the 3.3 m x 1.077 wheelbase
WHEEL_Z = 1.13  # PHYSICS.bodies.hauler.wheelZ: half of 0.775 of the width, the real track share
HUB_Z = -0.4 - SUSPENSION_REST  # PHYSICS.bodies.hauler.wheelY
GROUND = HUB_Z - WHEEL_R
WHEELS_X = [WHEEL_X, -WHEEL_X]
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03
ARCH_R = WHEEL_R + ARCH_CLEARANCE


def up(height: float) -> float:
    """Blender Z of a height over the ground."""
    return GROUND + height


HALF = WIDTH / 2
CAB_HALF = 1.26  # the real cab is about 2.0 m of the 2.32 m width
FRONT = LENGTH / 2
FACE = FRONT - 0.13  # the cab face stands behind the bumper  # inferred
SINK = 0.03  # how far the glass runs into the belt and the roof, so no glass face shares a plane with a pillar
CAB_BOTTOM = up(0.92)  # inferred
BELT = up(1.85)  # the windshield foot  # inferred
ROOF = up(2.60)
ROOF_T = 0.12  # the engine in the hatch stands on the roof's underside
UNDER_ROOF = ROOF - ROOF_T
COAMING = 0.04  # the hatch rim; with it the cab stands 2.64 m
RAKE = 0.08  # the windshield leans back this far  # inferred
GLASS_TOP_X = FACE - 0.02 - RAKE
ROOF_FRONT = GLASS_TOP_X - 0.06
HATCH_FRONT = G.row_x(0.5)  # the hatch covers rows 1 and 2, columns 2 and 3
HATCH_BACK = G.row_x(2.5)
HATCH_LEFT = G.col_y(1.5)
HATCH_RIGHT = G.col_y(3.5)
CAB_BACK = HATCH_BACK - 0.11

WING_IN = 1.06  # the wing's inner face; it stands 0.2 m proud of the cab side
WING_R = 0.8  # the wing crown 1.4 m over the ground
WING_FRONT = FACE + 0.04  # the wings stand a little ahead of the cab face
WING_OUT = HALF - 0.02  # the dark lip round the arch stands proud of it to the full width
WING_NOSE = 0.25  # the rounded top front corner of the wing
WING_LOW = up(0.85)  # the wing's lower edge, front and back  # inferred
LAMP_R = 0.12  # inferred
LAMP_Z = WING_LOW + 0.17

GAP = 0.15  # between the cab and the bed  # inferred
BED_FRONT = CAB_BACK - GAP
BED_BACK = -FRONT + 0.09
BED_BOTTOM = up(1.3)
BED_FLOOR = up(1.4)  # inferred, UK2
WALL_TOP = up(1.72)  # low on purpose so deck items show; the real side boards stand 0.89 m
HEAD_TOP = up(1.9)
WALL_T = 0.08
CAP_T = 0.05
FRAME_BOTTOM = up(0.78)  # inferred
FRAME_TOP = up(1.02)
RAIL_Y = 0.5
AXLE_BOTTOM = up(0.34)  # the 0.315 m clearance under the differentials, x 1.077
TANK_R = 0.2
TANK_Y = 1.06
TANK_X = (0.25, 0.88)


def mirrored(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    """A box on the left side at +y and its twin on the right side."""
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def arc(cx: float, cz: float, r: float, a0: float, a1: float, steps: int) -> list[tuple[float, float]]:
    """Points on a circle round (cx, cz) from angle a0 to a1, in degrees from +X toward +Z."""
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / steps)), cz + r * math.sin(math.radians(a0 + (a1 - a0) * k / steps))) for k in range(steps + 1)]


def half_ring(kit: Kit, name: str, wx: float, r0: float, r1: float, y0: float, y1: float) -> None:
    """A dark round ring over the top of a wheel, down to the frame bottom. The bed's rear mudguard."""
    low = FRAME_BOTTOM + 0.05 - HUB_Z
    a0, a1 = math.degrees(math.asin(low / r1)), math.degrees(math.asin(low / r0))
    outer = arc(wx, HUB_Z, r1, a0, 180 - a0, ROUND_ARCH_SEGMENTS)
    inner = arc(wx, HUB_Z, r0, 180 - a1, a1, ROUND_ARCH_SEGMENTS)
    prism(kit, name, outer + inner, y0, y1, "under")


def wing_profile() -> list[tuple[float, float]]:
    """The front wing's XZ outline: round over the wheel, a flat crown running to a rounded nose and a flat front for the lamp."""
    back = math.degrees(math.asin((WING_LOW - HUB_Z) / WING_R))
    inner = math.degrees(math.asin((WING_LOW - HUB_Z) / ARCH_R))
    outer = arc(WHEEL_X, HUB_Z, WING_R, 180 - back, 90, ROUND_ARCH_SEGMENTS // 2)
    nose = arc(WING_FRONT - WING_NOSE, HUB_Z + WING_R - WING_NOSE, WING_NOSE, 90, 0, 4)
    front = [(WING_FRONT, WING_LOW)]
    hole = arc(WHEEL_X, HUB_Z, ARCH_R, inner, 180 - inner, ROUND_ARCH_SEGMENTS)
    return [*outer, *nose, *front, *hole]


def wing_edge() -> list[tuple[float, float]]:
    """A thin band along the wing's crown and nose, so the wing reads apart from the cab side behind it."""
    back = 180 - math.degrees(math.asin((WING_LOW - HUB_Z) / WING_R))
    t = 0.05
    outer = arc(WHEEL_X, HUB_Z, WING_R, back, 90, ROUND_ARCH_SEGMENTS // 2) + arc(WING_FRONT - WING_NOSE, HUB_Z + WING_R - WING_NOSE, WING_NOSE, 90, 0, 4)
    inner = arc(WHEEL_X, HUB_Z, WING_R - t, back, 90, ROUND_ARCH_SEGMENTS // 2) + arc(WING_FRONT - WING_NOSE, HUB_Z + WING_R - WING_NOSE, WING_NOSE - t, 90, 0, 4)
    return outer + list(reversed(inner))


def wings(kit: Kit) -> None:
    """Separate rounded front wings standing proud of the cab sides, with a dark lip round the arch and a round lamp in front."""
    profile = wing_profile()
    prism(kit, "wing_l", profile, WING_IN, WING_OUT, "paint")
    prism(kit, "wing_r", profile, -WING_OUT, -WING_IN, "paint")
    edge = wing_edge()
    prism(kit, "wing_edge_l", edge, WING_OUT - 0.03, WING_OUT + 0.01, "under")
    prism(kit, "wing_edge_r", edge, -WING_OUT - 0.01, -WING_OUT + 0.03, "under")
    flare(kit, "wing_lip_l", G, WHEEL_X, HUB_Z, WHEEL_R, WING_OUT - 0.04, HALF, bottom=WING_LOW, segments=ROUND_ARCH_SEGMENTS)
    flare(kit, "wing_lip_r", G, WHEEL_X, HUB_Z, WHEEL_R, -HALF, -WING_OUT + 0.04, bottom=WING_LOW, segments=ROUND_ARCH_SEGMENTS)
    lamp_y = (WING_IN + WING_OUT) / 2
    for s, y in (("l", lamp_y), ("r", -lamp_y)):
        kit.cylinder(f"lamp_rim_{s}", LAMP_R + 0.03, 0.04, (WING_FRONT + 0.01, y, LAMP_Z), "under", rot=ALONG_X, vertices=ROUND_SIDES)
        kit.cylinder(f"lamp_{s}", LAMP_R, 0.04, (WING_FRONT + 0.03, y, LAMP_Z), "light", rot=ALONG_X, vertices=ROUND_SIDES)


def cab_lower(kit: Kit) -> None:
    """The cab below the beltline: sides with the front wheel wells, a solid core, a dark grille of painted slats and the bumper."""
    arch = round_arch(WHEEL_X, HUB_Z, ARCH_R, CAB_BOTTOM, ROUND_ARCH_SEGMENTS)
    side = [(CAB_BACK, CAB_BOTTOM), *arch, (FACE, CAB_BOTTOM), (FACE, BELT), (CAB_BACK, BELT)]
    prism(kit, "cab_side_l", side, WELL_Y, CAB_HALF, "paint")
    prism(kit, "cab_side_r", side, -CAB_HALF, -WELL_Y, "paint")
    kit.box("cab_core", (FACE - CAB_BACK, 2 * WELL_Y, BELT - CAB_BOTTOM), ((FACE + CAB_BACK) / 2, 0, (BELT + CAB_BOTTOM) / 2), "paint")
    grille_half, grille_bottom, grille_top = 0.8, up(1.05), up(1.75)
    kit.box("grille", (0.03, 2 * grille_half, grille_top - grille_bottom), (FACE + 0.005, 0, (grille_top + grille_bottom) / 2), "under")
    slats = 9
    for i in range(slats):
        y = -grille_half + 2 * grille_half * (i + 0.5) / slats
        kit.box(f"slat{i}", (0.04, 0.07, grille_top - grille_bottom - 0.08), (FACE + 0.02, y, (grille_top + grille_bottom) / 2), "paint")
    kit.box("bumper", (FRONT - FACE, 2 * 1.3, up(0.88) - up(0.62)), ((FRONT + FACE) / 2, 0, (up(0.88) + up(0.62)) / 2), "under")


def cab_upper(kit: Kit) -> None:
    """The glass house: a two-pane flat windshield with a split bar, door windows, painted pillars and a back wall."""
    glass_half = CAB_HALF - 0.04
    house = [(CAB_BACK + 0.04, BELT - SINK), (FACE - 0.02, BELT - SINK), (GLASS_TOP_X, UNDER_ROOF + SINK), (CAB_BACK + 0.04, UNDER_ROOF + SINK)]
    prism(kit, "glass", house, -glass_half, glass_half, "glass")
    check_door_gap("door window", CAB_BACK, FACE, BELT, WHEELS_X, HUB_Z, ARCH_R)
    a_pillar = [(FACE - 0.12, BELT), (FACE, BELT), (GLASS_TOP_X + 0.02, UNDER_ROOF), (GLASS_TOP_X - 0.1, UNDER_ROOF)]
    door_x = (CAB_BACK + FACE) / 2 - 0.12
    for s, (y0, y1) in (("l", (CAB_HALF - 0.06, CAB_HALF)), ("r", (-CAB_HALF, -CAB_HALF + 0.06))):
        prism(kit, f"a_pillar_{s}", a_pillar, y0, y1, "paint")
        kit.box(f"door_pillar_{s}", (0.1, y1 - y0, UNDER_ROOF - BELT), (door_x, (y0 + y1) / 2, (BELT + UNDER_ROOF) / 2), "paint")
        kit.box(f"back_pillar_{s}", (0.22, y1 - y0, UNDER_ROOF - BELT), (CAB_BACK + 0.11, (y0 + y1) / 2, (BELT + UNDER_ROOF) / 2), "paint")
        kit.box(f"belt_{s}", (FACE - CAB_BACK, y1 - y0 + 0.02, 0.05), ((FACE + CAB_BACK) / 2, (y0 + y1) / 2, BELT + 0.025), "paint")
    prism(kit, "split_bar", [(FACE - 0.1, BELT), (FACE, BELT), (GLASS_TOP_X + 0.02, UNDER_ROOF), (GLASS_TOP_X - 0.08, UNDER_ROOF)], -0.05, 0.05, "paint")
    kit.box("back_wall", (0.06, 2 * CAB_HALF, UNDER_ROOF - BELT), (CAB_BACK + 0.03, 0, (BELT + UNDER_ROOF) / 2), "paint")


def roof(kit: Kit) -> None:
    """A painted roof with a rounded front edge, framing the hatch over the engine cells, with a low rim round the hatch."""
    prism(kit, "roof_front", [(HATCH_FRONT, UNDER_ROOF), (GLASS_TOP_X + 0.02, UNDER_ROOF), (ROOF_FRONT, ROOF), (HATCH_FRONT, ROOF)], -CAB_HALF, CAB_HALF, "paint")
    kit.box("roof_back", (HATCH_BACK - CAB_BACK, 2 * CAB_HALF, ROOF_T), ((HATCH_BACK + CAB_BACK) / 2, 0, UNDER_ROOF + ROOF_T / 2), "paint")
    length = HATCH_FRONT - HATCH_BACK
    mid = (HATCH_FRONT + HATCH_BACK) / 2
    kit.box("roof_l", (length, CAB_HALF - HATCH_LEFT, ROOF_T), (mid, (CAB_HALF + HATCH_LEFT) / 2, UNDER_ROOF + ROOF_T / 2), "paint")
    kit.box("roof_r", (length, HATCH_RIGHT + CAB_HALF, ROOF_T), (mid, (HATCH_RIGHT - CAB_HALF) / 2, UNDER_ROOF + ROOF_T / 2), "paint")
    rim, z = 0.06, ROOF + COAMING / 2
    across = HATCH_LEFT - HATCH_RIGHT + 2 * rim
    kit.box("coaming_front", (rim, across, COAMING), (HATCH_FRONT + rim / 2, (HATCH_LEFT + HATCH_RIGHT) / 2, z), "trim")
    kit.box("coaming_back", (rim, across, COAMING), (HATCH_BACK - rim / 2, (HATCH_LEFT + HATCH_RIGHT) / 2, z), "trim")
    kit.box("coaming_l", (length, rim, COAMING), (mid, HATCH_LEFT + rim / 2, z), "trim")
    kit.box("coaming_r", (length, rim, COAMING), (mid, HATCH_RIGHT - rim / 2, z), "trim")


def chassis(kit: Kit) -> None:
    """The dark ladder frame, both axles with their differentials high off the ground, the fuel tanks and steps, and the rear bumper."""
    mirrored(kit, "rail", (FACE - 0.1 - BED_BACK, 0.14, FRAME_TOP - FRAME_BOTTOM), (FACE - 0.1 + BED_BACK) / 2, RAIL_Y, (FRAME_TOP + FRAME_BOTTOM) / 2, "under")
    for i, wx in enumerate(WHEELS_X):
        kit.box(f"axle{i}", (0.14, 2 * WELL_Y, 0.14), (wx, 0, HUB_Z), "under")
        kit.box(f"diff{i}", (0.4, 0.4, FRAME_BOTTOM - AXLE_BOTTOM), (wx, 0.1, (FRAME_BOTTOM + AXLE_BOTTOM) / 2), "under")
    tank_len = TANK_X[1] - TANK_X[0]
    tank_z = FRAME_BOTTOM + 0.04
    for s, y in (("l", TANK_Y), ("r", -TANK_Y)):
        kit.cylinder(f"tank_{s}", TANK_R, tank_len, (sum(TANK_X) / 2, y, tank_z), "metal", rot=ALONG_X, vertices=ROUND_SIDES)
        kit.box(f"tank_bracket_{s}", (tank_len - 0.2, abs(y) - RAIL_Y, 0.06), (sum(TANK_X) / 2, math.copysign((abs(y) + RAIL_Y) / 2, y), tank_z + TANK_R - 0.03), "under")
    step_x = (TANK_X[1] + 0.02, WHEEL_X - WHEEL_R - 0.05)
    mirrored(kit, "step", (step_x[1] - step_x[0], 0.32, 0.06), sum(step_x) / 2, CAB_HALF - 0.1, FRAME_BOTTOM - 0.02, "under")
    kit.box("rear_bumper", (FRONT + BED_BACK + 0.06, 2 * 1.1, 0.18), ((-FRONT + BED_BACK + 0.06) / 2, 0, FRAME_BOTTOM + 0.05), "under")


def bed(kit: Kit) -> None:
    """An open bed on two long bearers over the frame: a floor, low plank walls with dark rub rails and straps, trim caps, a headboard, mudguards and taillights."""
    length = BED_FRONT - BED_BACK
    mid = (BED_FRONT + BED_BACK) / 2
    mirrored(kit, "bearer", (length, 0.14, BED_BOTTOM - FRAME_TOP + 0.02), mid, WELL_Y - 0.12, (BED_BOTTOM + FRAME_TOP) / 2, "under")
    kit.box("floor", (length, 2 * HALF - 0.02, BED_FLOOR - BED_BOTTOM), (mid, 0, (BED_FLOOR + BED_BOTTOM) / 2), "metal")
    wall_h = WALL_TOP - BED_BOTTOM
    side_y = HALF - 0.02 - WALL_T / 2
    mirrored(kit, "wall", (length, WALL_T, wall_h), mid, side_y, BED_BOTTOM + wall_h / 2, "paint")
    inner = 2 * (side_y - WALL_T / 2)
    kit.box("tailgate", (WALL_T, inner, wall_h), (BED_BACK + WALL_T / 2, 0, BED_BOTTOM + wall_h / 2), "paint")
    head_h = HEAD_TOP - BED_BOTTOM
    kit.box("headboard", (WALL_T, inner + 2 * WALL_T, head_h), (BED_FRONT - WALL_T / 2, 0, BED_BOTTOM + head_h / 2), "paint")
    mirrored(kit, "cap", (length, WALL_T + 0.03, CAP_T), mid, side_y, WALL_TOP - CAP_T / 2, "trim")
    kit.box("cap_tail", (WALL_T + 0.03, inner, CAP_T), (BED_BACK + WALL_T / 2, 0, WALL_TOP - CAP_T / 2), "trim")
    kit.box("cap_head", (WALL_T + 0.03, inner + 2 * WALL_T, CAP_T), (BED_FRONT - WALL_T / 2, 0, HEAD_TOP - CAP_T / 2), "trim")
    for i, z in enumerate((BED_FLOOR - 0.02, (BED_FLOOR + WALL_TOP) / 2 + 0.02)):
        mirrored(kit, f"rub_rail{i}", (length, 0.02, 0.05), mid, HALF - 0.01, z, "under")
        kit.box(f"tail_rail{i}", (0.02, inner + 2 * WALL_T, 0.05), (BED_BACK - 0.01, 0, z), "under")
    for i in range(4):
        x = BED_FRONT - 0.4 - (length - 0.8) * i / 3
        mirrored(kit, f"strap{i}", (0.07, 0.01, wall_h), x, HALF - 0.015, BED_BOTTOM + wall_h / 2, "under")
    for s, (y0, y1) in (("l", (WELL_Y, HALF - 0.04)), ("r", (-HALF + 0.04, -WELL_Y))):
        half_ring(kit, f"mudguard_{s}", -WHEEL_X, ARCH_R, ARCH_R + FLARE, y0, y1)
    mirrored(kit, "taillight", (0.05, 0.22, 0.14), BED_BACK - 0.025, HALF - 0.24, BED_BOTTOM - 0.07, "red")


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
        raise RuntimeError(f"base_hauler is {hi.x - lo.x:.3f} x {hi.y - lo.y:.3f} m, not {LENGTH} x {WIDTH} m")


def check_tires() -> None:
    """Raises when a tire at its physics mount reaches a tank, a step or the bed."""
    tire_back = WHEEL_X - WHEEL_R
    if TANK_X[1] + 0.02 > tire_back - 0.05:
        raise RuntimeError(f"the fuel tanks end at x {TANK_X[1]:.3f}, into the front tire from x {tire_back:.3f}")
    if BED_BOTTOM - (HUB_Z + WHEEL_R) < ARCH_CLEARANCE:
        raise RuntimeError(f"the bed bottom at z {BED_BOTTOM:.3f} keeps under {ARCH_CLEARANCE} m over the rear tires")


def main() -> None:
    args = parse_args()
    check_tires()
    kit = Kit(BASE_COLORS, SEED)
    cab_lower(kit)
    wings(kit)
    cab_upper(kit)
    roof(kit)
    chassis(kit)
    bed(kit)
    kit.socket("arch_front", (WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (-WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEEL_X, WHEEL_Z, HUB_Z + ARCH_R))
    hatch = {(x, y): UNDER_ROOF for x in (2, 3) for y in (1, 2)}
    level_sockets(kit, G, "row", [ROOF] * 3 + [BED_FLOOR] * 6, fronts={0: ROOF_FRONT, 3: BED_FRONT}, cells=hatch)
    level_sockets(kit, G, "floor", [BELT] + [UNDER_ROOF] * 2 + [BED_FLOOR] * 6)
    check_size(kit)
    check_base(kit, "base_hauler", G)
    kit.export("base_hauler", args, view_size=7.5)


if __name__ == "__main__":
    main()
