"""The hauler base: a GAZ-66, the Soviet cab-over 4x4 army truck, as a flatbed with a headboard.

Built through the blender-image-to-3d brief and gates from two photographs by Dimitǎr Boevski on Wikimedia Commons
(CC BY-SA 4.0), "GAZ-66 truck in Vrachesh, Botevgrad municipality, Bulgaria" 01 (front three-quarter from the left, about
20 degrees off the nose, at eye height) and 04 (left rear three-quarter, about 40 degrees behind the side's normal, at eye height, where the headboard faces the camera). Neither photo
is kept in the repo. Every constant names the photo it was read in, or says inferred.
Size keeps the GAZ-66's published dimensions: along and up at the scout's 1.077, across at the scout's widening of 1.17, so
6.09 m long, 2.92 m across the cab face and the bed and 2.64 m to the hatch rim on its tires, on a 3.55 m wheelbase and a
2.26 m track. The ground is 1.4 m below the center, so a height h over the ground is Blender Z up(h).
Levels over the ground, read in photo 01 as shares of the 2.64 m height: bumper 0.74 to 1.0, headlight centers 1.23,
amber lamps 1.47, grille 1.17 to 1.69, the ledge at the windshield foot 1.85, glass 1.92 to 2.46, roof cap 2.48 to 2.60.
In photo 04 the cab bottom is 1.0 and the deck 1.4, 0.53 of the cab height. Lengths read in photo 04 are divided by the
cosine of its angle.
From the front: a deep black bumper with two tow hooks, one flat lower face from side to side with a framed grille of
painted slats, round headlights in chrome rings set inboard of the corners with amber lamps over them, louvres on the
sides behind the corners, a rounded top front corner and a round arch cut into each side over the front wheel. Over the
ledge the upper cab stands 0.28 m back (photo 04) and leans in from 0.9 to 0.82 of the face's width (photo 01), with a
two-pane windshield split by a thick post, one tall door window a side and a blank rear quarter behind the door seam.
A pale rounded roof cap with two small amber beacons frames the engine hatch. Behind the cab a tall headboard of weathered grey planks
under open slats stands on a flatbed with no walls: a pale edge beam on brackets over a high dark frame, a long round tank
between the axles, pale flap plates behind the rear wheels, dark mudflaps under the rear end, and taillights and a plate
under the rear edge.
Deviations from the photos: the wheels stay symmetric and keep the tire rule's 0.6 m radius, the width follows the
widening rule, the cab is 1.94 m deep from the face where photo 04 shows about 1.4 tire diameters, 1.65 m, once its angle is taken out, since the roof
hatch must cover the engine cells on rows 1 and 2, there are no side mirrors, no rear corner post, the bed's edge beam
rises only 0.04 m over the deck, and the headboard stops under the cab roof.
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
    ROUND_ARCH_SEGMENTS,
    SUSPENSION_REST,
    Grid,
    check_base,
    check_door_gap,
    cut_boxes,
    door_sill,
    hull_mesh,
    level_sockets,
    round_arch,
)
from parts_common_core import ALONG_X, ALONG_Y, PROUD, ROUND_SIDES  # noqa: E402
from shapes import prism  # noqa: E402

SEED = 302
COLORS = {**BASE_COLORS, "amber": 0xF2A22C}  # PAL.semi.amber
LENGTH = 6.09  # 5.655 m x 1.077
WIDTH = 2.92  # 2.322 m x 1.077 x 1.17, the scout's widening
G = Grid(rows=9, cols=7, half_height=0.6, length=LENGTH, width=WIDTH)
WHEEL_R = 0.61  # PHYSICS.bodies.hauler.wheelRadius
WHEEL_HALF_W = 0.255  # PHYSICS.bodies.hauler.wheelHalfWidth
WHEEL_X = 1.775  # PHYSICS.bodies.hauler.wheelX: half the 3.3 m x 1.077 wheelbase
WHEEL_Z = 1.13  # PHYSICS.bodies.hauler.wheelZ: half of 0.775 of the width, the real track share
HUB_Z = -0.4 - SUSPENSION_REST  # PHYSICS.bodies.hauler.wheelY
GROUND = HUB_Z - WHEEL_R
WHEELS_X = [WHEEL_X, -WHEEL_X]
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03
ARCH_R = WHEEL_R + ARCH_CLEARANCE
TIRE_TOP = HUB_Z + WHEEL_R


def up(height: float) -> float:
    """Blender Z of a height over the ground."""
    return GROUND + height


HALF = WIDTH / 2
FRONT = LENGTH / 2
SIDE = HALF - 0.02  # the lower cab's sides; the louvres and the bed's edge beam reach the full width
FACE = FRONT - 0.2  # photo 04: the bumper stands 0.3 m proud of the face; 0.2 here so the hatch fits under the roof
CAB_BOTTOM = up(1.0)  # photo 04
LEDGE = up(1.85)  # photo 01: the windshield foot, 0.70 of the height
CORNER = 0.15  # photo 04: the rounded top front corner of the face and the wings
ROOF = up(2.60)
ROOF_T = 0.12  # the engine in the hatch stands on the roof's underside
UNDER_ROOF = ROOF - ROOF_T
COAMING = 0.04  # the hatch rim; with it the cab stands 2.64 m
HATCH_FRONT = G.row_x(0.5)  # the hatch covers rows 1 and 2, columns 2 and 3
HATCH_BACK = G.row_x(2.5)
HATCH_LEFT = G.col_y(1.5)
HATCH_RIGHT = G.col_y(3.5)
CAB_BACK = HATCH_BACK - 0.11

SETBACK = 0.28  # photo 04 gives 0.36 m once its angle is taken out; 0.28 keeps the roof cap ahead of the hatch
RAKE = 0.03  # photo 04: the windshield stands nearly upright
UPPER_FRONT = FACE - SETBACK
UPPER_HALF_LOW = 1.30  # photo 01: 0.9 of the face's width at the ledge
UPPER_HALF_TOP = 1.18  # photo 01: 0.82 of the face's width under the roof cap
UPPER_CHAMFER = 0.08  # photo 01: the cab's rounded vertical corners
CAP_HALF = UPPER_HALF_TOP + 0.05  # photo 01: the roof cap overhangs the cab a little
CAP_FRONT = UPPER_FRONT - RAKE + 0.04
GLASS_BOTTOM = up(1.92)  # photo 01
GLASS_TOP = up(2.46)  # photo 01: the glass reaches up to the roof cap
POST_HALF = 0.05  # photo 01: the thick center post
PILLAR = 0.09  # photo 01: the frame round the windshield
DOOR_BACK = 1.74  # photo 04: the door's rear seam; a blank quarter panel stands behind it
DOOR_WINDOW = (1.82, 2.38)  # photo 04: one tall door window, 0.45 tire diameters wide once the view's angle is taken out
DOOR_FRONT = 2.40  # photo 04: the door's front edge under the A pillar

GRILLE_HALF = 0.46  # photo 01: 0.32 of the face's width
GRILLE_BOTTOM = up(1.17)  # photo 01
GRILLE_TOP = up(1.69)  # photo 01
SLATS = 12  # photo 01
LAMP_Y = 1.08  # photo 01: the headlight centers 0.74 of the face's width apart
LAMP_Z = up(1.23)  # photo 01
LAMP_R = 0.115  # photo 01: the glass inside a chrome ring
RING_R = 0.15
AMBER_Y = 1.12  # photo 01: a little outboard of the headlight
AMBER_Z = up(1.47)  # photo 01
AMBER_R = 0.07
BUMPER_BOTTOM = up(0.74)  # photo 01
BUMPER_TOP = CAB_BOTTOM  # photo 01: the bumper's top meets the face's bottom
BUMPER_HALF = 1.45  # photo 01: the bumper runs the face's full width
HOOK_Y = 0.62  # photo 01

GAP = 0.06  # photo 04: the headboard stands right behind the cab
BED_FRONT = CAB_BACK - GAP
BED_BACK = -FRONT
BED_FLOOR = up(1.4)  # photo 04: 0.53 of the cab height
DECK_T = 0.06  # inferred
LIP = 0.04  # the edge beam stands this far over the deck, so loose goods read as held in
BEAM_BOTTOM = up(1.29)  # photo 04: a deep edge beam, held over the rear tires
BEAM_T = 0.06  # inferred
HEAD_TOP = up(2.55)  # photo 04: up to the cab roof, here kept under the roof cap
PLANK_TOP = BED_FLOOR + 0.6 * (HEAD_TOP - BED_FLOOR)  # photo 04: planks in the lower 60 percent, open slats above
HEAD_T = 0.08  # inferred
BRACKET_DROP = 0.3  # photo 04: the brackets hang deepest at the edge beam and taper in to the frame
BRACKET_STEP = 0.7  # photo 04: one bracket about every 0.7 m
FRAME_BOTTOM = up(0.78)  # inferred
FRAME_TOP = up(1.02)  # photo 04: the frame rails high and open
RAIL_Y = 0.5
AXLE_BOTTOM = up(0.34)  # the 0.315 m clearance under the differentials, x 1.077
TANK_R = 0.2  # photo 04: one long round tank between the axles
TANK_Y = 1.0
TANK_X = (0.2, -0.8)  # photo 04: from 0.4 to 0.85 of the way from the front tire to the rear one
TANK_Z = up(0.82)  # photo 04
FLAP_DROP = up(0.25)  # photo 04: a pale plate hangs below the hub behind each rear wheel, a dark rubber flap under the rear end


def hull(kit: Kit, name: str, mat: str, points: list[tuple[float, float, float]]) -> bpy.types.Object:
    return kit._add(hull_mesh(name, points), name, mat, 0.0)


def mirrored(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    """A box on the left side at +y and its twin on the right side."""
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def arc(cx: float, cz: float, r: float, a0: float, a1: float, steps: int) -> list[tuple[float, float]]:
    """Points on a circle round (cx, cz) from angle a0 to a1, in degrees from +X toward +Z."""
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / steps)), cz + r * math.sin(math.radians(a0 + (a1 - a0) * k / steps))) for k in range(steps + 1)]


def upper_share(z: float) -> float:
    """How far up the upper cab z lies, 0 at the ledge and 1 under the roof cap."""
    return (z - LEDGE) / (UNDER_ROOF - LEDGE)


def upper_front(z: float) -> float:
    """The X of the raked windshield plane at height z."""
    return UPPER_FRONT - RAKE * upper_share(z)


def upper_half(z: float) -> float:
    """The half width of the leaning upper cab at height z."""
    return UPPER_HALF_LOW + (UPPER_HALF_TOP - UPPER_HALF_LOW) * upper_share(z)


def lower_profile(arch: bool) -> list[tuple[float, float]]:
    """The lower cab's XZ outline: flat back, a flat face with a rounded top front corner, and the front wheel's arch when asked."""
    corner = arc(FACE - CORNER, LEDGE - CORNER, CORNER, 0, 90, 4)
    bottom = round_arch(WHEEL_X, HUB_Z, ARCH_R, CAB_BOTTOM, ROUND_ARCH_SEGMENTS) if arch else []
    return [(CAB_BACK, CAB_BOTTOM), *bottom, (FACE, CAB_BOTTOM), *corner, (CAB_BACK, LEDGE)]


def cab_lower(kit: Kit) -> None:
    """One lower cab from side to side: the core between the wheel wells and both sides with a round arch cut over the front wheel."""
    prism(kit, "cab_core", lower_profile(False), -WELL_Y, WELL_Y, "paint")
    prism(kit, "cab_side_l", lower_profile(True), WELL_Y, SIDE, "paint")
    prism(kit, "cab_side_r", lower_profile(True), -SIDE, -WELL_Y, "paint")
    for s, sign in (("l", 1), ("r", -1)):
        for i in range(4):
            z = up(1.2) + 0.075 * i
            kit.box(f"louvre{i}_{s}", (0.3, 0.015, 0.025), (FACE - 0.24, sign * (SIDE + 0.0075), z), "under")


def face(kit: Kit) -> None:
    """The face's furniture: a framed grille of painted slats, set-in headlights in chrome rings, amber lamps and the bumper with hooks."""
    mid = (GRILLE_TOP + GRILLE_BOTTOM) / 2
    tall = GRILLE_TOP - GRILLE_BOTTOM
    kit.box("grille", (0.01, 2 * GRILLE_HALF, tall), (FACE + 0.005, 0, mid), "under")
    for i in range(SLATS):
        y = -GRILLE_HALF + 2 * GRILLE_HALF * (i + 0.5) / SLATS
        kit.box(f"slat{i}", (0.02, 0.035, tall - 0.04), (FACE + 0.01, y, mid), "paint")
    frame = 0.035
    kit.box("grille_top", (0.024, 2 * GRILLE_HALF + 2 * frame, frame), (FACE + 0.012, 0, GRILLE_TOP + frame / 2), "paint")
    kit.box("grille_bottom", (0.024, 2 * GRILLE_HALF + 2 * frame, frame), (FACE + 0.012, 0, GRILLE_BOTTOM - frame / 2), "paint")
    mirrored(kit, "grille_side", (0.024, frame, tall), FACE + 0.012, GRILLE_HALF + frame / 2, mid, "paint")
    for s, sign in (("l", 1), ("r", -1)):
        kit.cylinder(f"lamp_ring_{s}", RING_R, 0.03, (FACE + 0.005, sign * LAMP_Y, LAMP_Z), "metal_light", rot=ALONG_X, vertices=ROUND_SIDES)
        kit.cylinder(f"lamp_{s}", LAMP_R, 0.03, (FACE + 0.012, sign * LAMP_Y, LAMP_Z), "light", rot=ALONG_X, vertices=ROUND_SIDES)
        kit.cylinder(f"amber_{s}", AMBER_R, 0.025, (FACE + 0.005, sign * AMBER_Y, AMBER_Z), "amber", rot=ALONG_X, vertices=ROUND_SIDES)
    bumper_mid = (BUMPER_TOP + BUMPER_BOTTOM) / 2
    kit.box("bumper", (FRONT - FACE, 2 * BUMPER_HALF, BUMPER_TOP - BUMPER_BOTTOM), ((FRONT + FACE) / 2, 0, bumper_mid), "under")
    for s, sign in (("l", 1), ("r", -1)):
        for k, dy in enumerate((-0.05, 0.05)):
            kit.box(f"hook{k}_{s}", (0.1, 0.025, 0.09), (FRONT - 0.08, sign * HOOK_Y + dy, BUMPER_TOP + 0.045), "under")
        kit.box(f"hook_pin_{s}", (0.03, 0.13, 0.03), (FRONT - 0.06, sign * HOOK_Y, BUMPER_TOP + 0.07), "under")


def pane_outline(y0: float, y1: float, z0: float, z1: float, cut: float) -> list[tuple[float, float]]:
    """A windshield pane's YZ outline from the center post at y0 to the pillar at y1, with its two outer corners cut round."""
    return [(y0, z0), (y1 - cut, z0), (y1, z0 + cut), (y1, z1 - cut), (y1 - cut, z1), (y0, z1)]


def cab_upper(kit: Kit) -> None:
    """The upper cab leaning in over the ledge: the two-pane windshield, one tall door window a side and the door seam."""
    c = UPPER_CHAMFER
    pts = []
    for z in (LEDGE, UNDER_ROOF):
        xf, hy = upper_front(z), upper_half(z)
        for sign in (1, -1):
            pts += [(xf - c, sign * hy, z), (CAB_BACK, sign * hy, z), (xf, sign * (hy - c), z)]
    hull(kit, "cab_upper", "paint", pts)
    outer = UPPER_HALF_TOP - c - PILLAR
    for s, sign in (("l", 1), ("r", -1)):
        outline = pane_outline(POST_HALF, outer, GLASS_BOTTOM, GLASS_TOP, 0.06)
        pane = [(upper_front(z) + dx, sign * y, z) for y, z in outline for dx in (0.012, -0.03)]
        hull(kit, f"windshield_{s}", "glass", pane)
    w0, w1 = DOOR_WINDOW
    check_door_gap("door window", w0, w1, GLASS_BOTTOM, WHEELS_X, HUB_Z, ARCH_R)
    sill = door_sill(DOOR_BACK, DOOR_FRONT, CAB_BOTTOM, WHEELS_X, HUB_Z, ARCH_R)
    check_door_gap("door", DOOR_BACK, DOOR_FRONT, sill, WHEELS_X, HUB_Z, ARCH_R)
    for s, sign in (("l", 1), ("r", -1)):
        window = []
        for z in (GLASS_BOTTOM, GLASS_TOP):
            rake = RAKE * upper_share(z)
            for x in (w0, w1 - rake):
                for dy in (0.012, -0.03):
                    window.append((x, sign * (upper_half(z) + dy), z))
        hull(kit, f"door_window_{s}", "glass", window)
        seam = []
        for z in (LEDGE, UNDER_ROOF - 0.02):
            for x in (DOOR_BACK - 0.012, DOOR_BACK + 0.012):
                for dy in (0.008, -0.01):
                    seam.append((x, sign * (upper_half(z) + dy), z))
        hull(kit, f"door_seam_{s}", "under", seam)
        kit.box(f"door_seam_low_{s}", (0.024, 0.018, LEDGE - sill - PROUD), (DOOR_BACK, sign * SIDE, (LEDGE - PROUD + sill) / 2), "under")
        kit.box(f"door_seam_front_{s}", (0.024, 0.018, LEDGE - sill - PROUD), (DOOR_FRONT, sign * SIDE, (LEDGE - PROUD + sill) / 2), "under")
        kit.box(f"door_seam_bottom_{s}", (DOOR_FRONT - DOOR_BACK, 0.012, 0.024), ((DOOR_FRONT + DOOR_BACK) / 2, sign * SIDE, sill), "under")
        kit.box(f"handle_{s}", (0.14, 0.02, 0.035), (DOOR_BACK + 0.12, sign * (SIDE + 0.008), up(1.7)), "metal_light")


def roof(kit: Kit) -> None:
    """A pale rounded roof cap overhanging the cab, with shallow ribs on its front edge, two amber beacons and the hatch with its rim."""
    layers = [
        (UNDER_ROOF, CAP_FRONT, CAB_BACK - 0.02, CAP_HALF, 0.1),
        (ROOF - 0.04, CAP_FRONT, CAB_BACK - 0.02, CAP_HALF, 0.12),
        (ROOF, CAP_FRONT - 0.07, CAB_BACK + 0.04, CAP_HALF - 0.07, 0.16),
    ]
    pts = []
    for z, xf, xb, hy, c in layers:
        for y in (hy, -hy):
            pts += [(xf - c, y, z), (xb + c, y, z)]
        for x in (xf, xb):
            pts += [(x, hy - c, z), (x, -hy + c, z)]
    cap = hull(kit, "roof_cap", "trim", pts)
    cut_boxes(cap, [((HATCH_BACK, HATCH_RIGHT, UNDER_ROOF - 0.05), (HATCH_FRONT, HATCH_LEFT, ROOF + 0.05))])
    for i in range(6):
        y = -0.75 + 1.5 * i / 5
        kit.box(f"rib{i}", (0.06, 0.05, 0.03), (CAP_FRONT - 0.035, y, ROOF - 0.03), "trim")
    for s, y in (("l", 0.18), ("r", -0.18)):
        kit.cylinder(f"beacon_{s}", 0.05, 0.045, (CAP_FRONT - 0.13, y, ROOF + 0.0225), "amber", vertices=ROUND_SIDES)
    rim, z = 0.06, ROOF + COAMING / 2
    length = HATCH_FRONT - HATCH_BACK
    mid = (HATCH_FRONT + HATCH_BACK) / 2
    across = HATCH_LEFT - HATCH_RIGHT + 2 * rim
    kit.box("coaming_front", (rim, across, COAMING), (HATCH_FRONT + rim / 2, (HATCH_LEFT + HATCH_RIGHT) / 2, z), "under")
    kit.box("coaming_back", (rim, across, COAMING), (HATCH_BACK - rim / 2, (HATCH_LEFT + HATCH_RIGHT) / 2, z), "under")
    kit.box("coaming_l", (length, rim, COAMING), (mid, HATCH_LEFT + rim / 2, z), "under")
    kit.box("coaming_r", (length, rim, COAMING), (mid, HATCH_RIGHT - rim / 2, z), "under")


def chassis(kit: Kit) -> None:
    """The dark ladder frame, both axles high off the ground, the step box behind each front wheel, the long tanks, the exhaust stub, the flap plates and the rear mudflaps."""
    rail_front = FACE - 0.05
    mirrored(kit, "rail", (rail_front - BED_BACK - 0.1, 0.14, FRAME_TOP - FRAME_BOTTOM), (rail_front + BED_BACK + 0.1) / 2, RAIL_Y, (FRAME_TOP + FRAME_BOTTOM) / 2, "under")
    for i, wx in enumerate(WHEELS_X):
        kit.box(f"axle{i}", (0.14, 2 * WELL_Y, 0.14), (wx, 0, HUB_Z), "under")
        kit.box(f"diff{i}", (0.4, 0.4, FRAME_BOTTOM - AXLE_BOTTOM), (wx, 0.1, (FRAME_BOTTOM + AXLE_BOTTOM) / 2), "under")
    step_x = (CAB_BACK + 0.02, WHEEL_X - WHEEL_R - 0.08)
    step_len = step_x[1] - step_x[0]
    mirrored(kit, "step_box", (step_len, 0.36, CAB_BOTTOM - up(0.78)), sum(step_x) / 2, SIDE - 0.2, (CAB_BOTTOM + up(0.78)) / 2, "under")
    mirrored(kit, "step", (step_len, 0.3, 0.04), sum(step_x) / 2, SIDE - 0.15, up(0.72), "metal")
    tank_len = TANK_X[0] - TANK_X[1]
    tank_mid = sum(TANK_X) / 2
    for s, y in (("l", TANK_Y), ("r", -TANK_Y)):
        kit.cylinder(f"tank_{s}", TANK_R, tank_len, (tank_mid, y, TANK_Z), "metal_dark", rot=ALONG_X, vertices=ROUND_SIDES)
        for k, dx in enumerate((-0.3, 0.3)):
            kit.cylinder(f"tank_strap{k}_{s}", TANK_R + 0.012, 0.05, (tank_mid + dx, y, TANK_Z), "under", rot=ALONG_X, vertices=ROUND_SIDES)
        kit.box(f"tank_bracket_{s}", (tank_len - 0.3, abs(y) - RAIL_Y, 0.06), (tank_mid, math.copysign((abs(y) + RAIL_Y) / 2, y), TANK_Z + TANK_R - 0.03), "under")
    kit.cylinder("exhaust", 0.05, 0.3, (TANK_X[1] - 0.18, 0.95, up(0.72)), "rust", rot=ALONG_Y, vertices=ROUND_SIDES)
    top = BED_FLOOR - DECK_T
    mirrored(kit, "flap_plate", (0.03, 0.56, top - FLAP_DROP), -WHEEL_X - WHEEL_R - 0.1, WHEEL_Z, (top + FLAP_DROP) / 2, "trim")
    mirrored(kit, "mudflap", (0.02, 0.5, top - FLAP_DROP - 0.25), BED_BACK + 0.35, WHEEL_Z, (top + FLAP_DROP + 0.25) / 2, "under")


def bed(kit: Kit) -> None:
    """A flatbed with no walls: a dark deck on bearers over the frame, a pale edge beam on brackets, the headboard, the rear lamps and plate."""
    length = BED_FRONT - BED_BACK
    mid = (BED_FRONT + BED_BACK) / 2
    deck_bottom = BED_FLOOR - DECK_T
    bearer_back = BED_BACK + 2 * PROUD
    mirrored(kit, "bearer", (BED_FRONT - bearer_back, 0.14, deck_bottom - FRAME_TOP + 0.01), (BED_FRONT + bearer_back) / 2, RAIL_Y, (deck_bottom + FRAME_TOP) / 2, "under")
    kit.box("deck", (length - PROUD, 2 * (HALF - BEAM_T), DECK_T), (mid + PROUD / 2, 0, BED_FLOOR - DECK_T / 2), "metal")
    beam_mid = (BED_FLOOR + LIP + BEAM_BOTTOM) / 2
    beam_h = BED_FLOOR + LIP - BEAM_BOTTOM
    mirrored(kit, "edge_beam", (length - PROUD, BEAM_T, beam_h), mid + PROUD / 2, HALF - BEAM_T / 2, beam_mid, "trim")
    kit.box("tail_beam", (BEAM_T, 2 * (HALF - PROUD), beam_h + 0.05), (BED_BACK + BEAM_T / 2, 0, beam_mid - 0.015), "trim")
    n = round((length - 0.4) / BRACKET_STEP)
    for i in range(n + 1):
        x = BED_FRONT - 0.2 - (length - 0.4) * i / n
        if abs(x + WHEEL_X) < WHEEL_R + 0.12:
            continue
        for s, sign in (("l", 1), ("r", -1)):
            pts = []
            for dx in (-0.03, 0.03):
                pts += [
                    (x + dx, sign * (RAIL_Y + 0.07), deck_bottom),
                    (x + dx, sign * (HALF - BEAM_T), deck_bottom),
                    (x + dx, sign * (HALF - BEAM_T), deck_bottom - BRACKET_DROP),
                    (x + dx, sign * (RAIL_Y + 0.07), deck_bottom - 0.08),
                ]
            hull(kit, f"bracket{i}_{s}", "trim", pts)
    headboard(kit)
    kit.box("rear_member", (0.14, 2 * (RAIL_Y + 0.5), 0.16), (BED_BACK + 0.2, 0, FRAME_TOP + 0.04), "under")
    mirrored(kit, "taillight", (0.05, 0.22, 0.12), BED_BACK + 0.12, HALF - 0.32, BEAM_BOTTOM - 0.08, "red")
    kit.box("plate", (0.02, 0.4, 0.12), (BED_BACK + 0.1, -0.5, BEAM_BOTTOM - 0.08), "metal_light")


def headboard(kit: Kit) -> None:
    """The tall headboard right behind the cab: planks in its lower part, open slats above, a pale frame and braces to the deck."""
    x = BED_FRONT - HEAD_T / 2
    inner = HALF - BEAM_T
    plank_h = PLANK_TOP - BED_FLOOR
    kit.box("head_planks", (HEAD_T - 0.02, 2 * (inner - PROUD), plank_h), (x, 0, BED_FLOOR + plank_h / 2), "metal_light")
    for i in range(1, 4):
        z = BED_FLOOR + plank_h * i / 4
        kit.box(f"plank_seam{i}", (0.008, 2 * (inner - 2 * PROUD), 0.015), (x - HEAD_T / 2 + 0.006, 0, z), "metal")
    post = 0.08
    for k, y in enumerate((-inner + post / 2, -0.47, 0.47, inner - post / 2)):
        kit.box(f"head_post{k}", (HEAD_T, post, HEAD_TOP - BED_FLOOR), (x, y, (HEAD_TOP + BED_FLOOR) / 2), "trim")
    for name, z in (("head_rail_mid", PLANK_TOP), ("head_rail_top", HEAD_TOP - 0.04 - PROUD)):
        kit.box(name, (HEAD_T - 3 * PROUD, 2 * (inner - PROUD), 0.08), (x, 0, z), "trim")
    slat_h = HEAD_TOP - PLANK_TOP - 0.08
    slats = 8
    for i in range(slats):
        y = -inner + 2 * inner * (i + 0.5) / slats
        kit.box(f"head_slat{i}", (0.04, 0.05, slat_h), (x, y, PLANK_TOP + slat_h / 2), "trim")
    reach, rise = 0.55, 0.65
    angle = math.atan2(rise, reach)
    brace = math.hypot(reach, rise)
    for s, sign in (("l", 1), ("r", -1)):
        kit.box(f"head_brace_{s}", (brace, 0.05, 0.05), (BED_FRONT - HEAD_T - reach / 2, sign * (inner - 0.03), BED_FLOOR + rise / 2), "trim", rot=(0, angle, 0))


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
    if abs(hi.z - GROUND - 2.64) > 0.03:
        raise RuntimeError(f"base_hauler stands {hi.z - GROUND:.3f} m, not 2.64 m to the hatch rim")


def check_tires() -> None:
    """Raises when a tire at its physics mount reaches a tank, a step, a flap or the bed."""
    tire_back = WHEEL_X - WHEEL_R
    if TANK_X[0] > tire_back - 0.05 or TANK_X[1] < -tire_back + 0.05:
        raise RuntimeError(f"the tanks run x {TANK_X[1]:.3f}..{TANK_X[0]:.3f}, into a tire inside x {tire_back:.3f}")
    if CAB_BACK + 0.02 > tire_back - 0.08 - 0.1:
        raise RuntimeError(f"the step box from x {CAB_BACK:.3f} has no room behind the front tire at x {tire_back:.3f}")
    if BEAM_BOTTOM - TIRE_TOP < ARCH_CLEARANCE:
        raise RuntimeError(f"the edge beam bottom at z {BEAM_BOTTOM:.3f} keeps under {ARCH_CLEARANCE} m over the rear tires")


def main() -> None:
    args = parse_args()
    check_tires()
    kit = Kit(COLORS, SEED)
    cab_lower(kit)
    face(kit)
    cab_upper(kit)
    roof(kit)
    chassis(kit)
    bed(kit)
    kit.socket("arch_front", (WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (-WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEEL_X, WHEEL_Z, HUB_Z + ARCH_R))
    hatch = {(x, y): UNDER_ROOF for x in (2, 3) for y in (1, 2)}
    level_sockets(kit, G, "row", [ROOF] * 3 + [BED_FLOOR] * 6, fronts={0: CAP_FRONT - 0.07, 3: BED_FRONT}, cells=hatch)
    level_sockets(kit, G, "floor", [LEDGE] + [UNDER_ROOF] * 2 + [BED_FLOOR] * 6)
    check_size(kit)
    check_base(kit, "base_hauler", G)
    kit.export("base_hauler", args, view_size=7.5)


if __name__ == "__main__":
    main()
