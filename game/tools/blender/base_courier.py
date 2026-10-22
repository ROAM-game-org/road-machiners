"""The courier base: a lifted 1976 VW Type 1 "Baja Bug", the Beetle with cut fiberglass fenders and tube bumpers.

Sized from the Type 1's published figures at the scout's 1.077 scale, since the reference photos could not be fetched: 4.1 m
long, 1.86 m across the fenders and 1.75 m tall on its tires, on a 2.6 m wheelbase. The ground is 1.0 m below the center.
Levels: roof crest 0.75, beltline and cowl 0.15, fender tops and the engine deck 0.0, running boards -0.42, body bottom -0.4.
One arched roof line runs from the raked windshield (cowl x 0.62, top x 0.3) over a crest to x -0.47 and rounds down
to the deck at x -0.88. Four separate rounded fenders are cut high over the wheels with dark flares, and dark running
boards join them along the narrow painted tub, whose top edges are rolled. Upright round headlights stand in the front
fender tops. The short front lid frames the engine hole, x 0.62 to 1.86, over a bay floor at 0.0, centered on
PHYSICS.bodies.courier.engine. Behind the body the tail is open, Baja style: a dark engine block under a tube cage, a
grille between upright taillights, and tube bumpers front and back. Round lamps and tubes take their sides from round_sides().
Deviations from the car: 1.86 m wide instead of 1.66, since the track and tires set it; the body bottom stays 0.6 m over
the ground for the courier's clearance; the engine shows in the front bay, where the grid's engine cells lie, instead of
the tail; the crest runs long and the back rounds down tighter than a Beetle's, so the cab cells hold the antenna's flat
spot and the deck cells rest flat; and the engine deck is flat for cargo, with the cage rails outside the deck cells.
Grid: 4 columns by 7 rows, stretched over the model by the projection. Half height 0.3 m, from PHYSICS.bodies.courier.
Wheels sit at x +-1.3, radius 0.4 m, half width 0.16 m, mount 0.2 m below the center, 0.726 m off the center line.
Sockets arch_front, arch_rear and arch_front_top (the inner arch crown) mark the arches for wheelArches.test.ts.
Run: blender --background --python tools/blender/base_courier.py -- public/models/base_courier.glb [tmp/base_courier.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args, round_sides  # noqa: E402
from parts_common_base import ARCH_CLEARANCE, BASE_COLORS, FLARE, SUSPENSION_REST, Grid, check_base, level_sockets, surface_z  # noqa: E402
from shapes import loft, prism, strut  # noqa: E402

SEED = 303
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
SIDE = 0.905
FLARE_OUT = 0.025
BODY = 0.54
FENDER_IN = 0.42
ROLL = 0.07

PAN = -0.4
BOARD = -0.42
BELT = 0.15
DECK = 0.0
FLOOR = 0.0
NOSE_TOP = -0.02
BAY_FRONT = 1.86
COWL = 0.62
BAY_HALF = 0.38
DECK_FRONT = -0.88

FENDER_R = 0.6
FENDER_CUT = 0.35
SHOULDER = 0.07
ROOF_LINE = [(COWL, BELT), (0.3, 0.64), (0.15, 0.715), (0.0, 0.745), (-0.15, 0.75), (-0.3, 0.74), (-0.47, 0.705), (-0.58, 0.645), (-0.68, 0.545), (-0.76, 0.42), (-0.82, 0.28), (-0.86, 0.15), (DECK_FRONT, DECK)]
CAP = 0.05
SCREEN_TOP = 0.3
GLASS_BACK = -0.58
BACK_FRONT = -0.47

LAMP_R = 0.09
TUBE = 0.06
CAGE_Y = 0.66
CAGE_TOP = DECK + 0.2
BUMPER_Z = -0.3


def roof_z(x: float) -> float:
    """The arched roof line's height at x, from the cowl over the crest down to the deck."""
    pts = ROOF_LINE
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        if x1 <= x <= x0:
            return z0 + (z1 - z0) * (x0 - x) / (x0 - x1)
    raise ValueError(f"x {x} is off the roof line")


def tub_top(x: float) -> float:
    """The painted tub's top at x behind the cowl: the beltline, falling to the deck where the back slope ends."""
    fall = DECK_FRONT + 0.2
    if x >= fall:
        return BELT
    return BELT + (DECK - BELT) * min(1.0, (fall - x) / (fall - DECK_FRONT))


def section(h: float, base_half: float, top_half: float, base: float = BELT) -> list[tuple[float, float]]:
    """A rounded greenhouse cross-section, as Y and Z, from the beltline up h meters, narrowing to top_half at the top."""
    mid = base_half - 0.04
    shoulder = top_half + 0.6 * (base_half - top_half)
    right = [(base_half, base), (mid, base + 0.45 * h), (shoulder, base + 0.8 * h), (top_half, base + h)]
    return right + [(-y, z) for y, z in reversed(right)]


def at_x(x: float, outline: list[tuple[float, float]]) -> list[tuple[float, float, float]]:
    return [(x, y, z) for y, z in outline]


def mirrored_box(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def body(kit: Kit) -> None:
    """The narrow painted tub from the nose to the back slope, the short lid round the engine bay, and the open engine tail."""
    profile = [
        (DECK_FRONT, PAN), (FRONT - 0.2, PAN), (FRONT, PAN + 0.18), (FRONT, NOSE_TOP - 0.06), (FRONT - 0.07, NOSE_TOP),
        (BAY_FRONT, NOSE_TOP + 0.04), (BAY_FRONT, FLOOR), (COWL, FLOOR), (COWL, BELT), (DECK_FRONT + 0.2, BELT), (DECK_FRONT, DECK),
    ]
    rolled = [(x, z - ROLL if z > PAN + 0.25 else z) for x, z in profile]
    rings = [rolled, profile, profile, rolled]
    loft(kit, "body", [[(x, y, z) for x, z in ring] for ring, y in zip(rings, (-BODY, ROLL - BODY, BODY - ROLL, BODY))], "paint")
    lid = [(BAY_FRONT, FLOOR), (COWL, FLOOR), (COWL, BELT), (BAY_FRONT, NOSE_TOP + 0.04)]
    prism(kit, "lid_l", lid, BAY_HALF, BODY, "paint")
    prism(kit, "lid_r", lid, -BODY, -BAY_HALF, "paint")
    kit.box("skid", (LENGTH - 0.7, 2 * BODY - 0.2, 0.1), (0, 0, PAN - 0.04), "under")
    kit.box("bay_floor", (BAY_FRONT - COWL - 0.02, 2 * BAY_HALF, 0.02), ((BAY_FRONT + COWL) / 2, 0, FLOOR - 0.005), "under")
    engine = [(BACK + 0.1, PAN + 0.06), (DECK_FRONT + 0.01, PAN + 0.06), (DECK_FRONT + 0.01, DECK), (BACK + 0.04, DECK), (BACK + 0.04, PAN + 0.2)]
    prism(kit, "engine_block", engine, -BODY + 0.04, BODY - 0.04, "metal_dark")


def fender_ring(wx: float, r_out: float, r_in: float, a0: float, a1: float, n: int) -> list[tuple[float, float]]:
    """One band outline in XZ round a hub: the outer arc from angle a0 to a1 (0 ahead of the hub), then the inner arc back, held over the boards."""

    def arc(r: float, a: float, b: float) -> list[tuple[float, float]]:
        return [(wx + r * math.cos(a + (b - a) * k / n), max(BOARD, HUB_Z + r * math.sin(a + (b - a) * k / n))) for k in range(n + 1)]

    return arc(r_out, a0, a1) + arc(r_in, a1, a0)


def fender(kit: Kit, name: str, wx: float, a0: float, a1: float, inner: float) -> None:
    """A rounded fender over one wheel on both sides: full depth over the inner face, its outer shoulder rolled down."""
    n = max(4, round(round_sides(FENDER_R) * abs(a1 - a0) / math.tau))
    for s, sy in (("l", 1), ("r", -1)):
        ys = [inner, SIDE - SHOULDER, SIDE]
        radii = [FENDER_R, FENDER_R, FENDER_R - SHOULDER]
        rings = [[(x, sy * y, z) for x, z in fender_ring(wx, r, ARCH_R, a0, a1, n)] for y, r in zip(ys, radii)]
        loft(kit, f"{name}_{s}", rings, "paint")
        flare = fender_ring(wx, ARCH_R + 0.6 * FLARE, ARCH_R - 0.005, a0, a1, n)
        y0, y1 = sorted((sy * (SIDE - 0.05), sy * (SIDE + FLARE_OUT)))
        prism(kit, f"{name}_flare_{s}", flare, y0, y1, "under")


def fenders(kit: Kit) -> None:
    """Four separate fenders cut high over the wheels, dark running boards between them, and the upright headlights."""
    front_x, rear_x = WHEELS_X
    fender(kit, "fender_f", front_x, FENDER_CUT, math.pi, FENDER_IN)
    fender(kit, "fender_b", rear_x, 0.0, math.pi - FENDER_CUT, BODY - 0.02)
    board_front = front_x - FENDER_R + 0.05
    board_back = rear_x + FENDER_R - 0.05
    mirrored_box(kit, "board", (board_front - board_back, SIDE - BODY + 0.02, 0.08), (board_front + board_back) / 2, (SIDE + BODY) / 2, BOARD + 0.04, "under")
    a = 0.42 * math.pi
    x = front_x + (FENDER_R - 0.03) * math.cos(a)
    z = HUB_Z + (FENDER_R - 0.03) * math.sin(a) + LAMP_R
    y = SIDE - SHOULDER - LAMP_R - 0.01
    for s, sy in (("l", 1), ("r", -1)):
        kit.cylinder(f"lamp_pod_{s}", LAMP_R + 0.02, 0.14, (x, sy * y, z), "under", rot=(0, math.pi / 2, 0), vertices=round_sides(LAMP_R + 0.02))
        kit.cylinder(f"lamp_{s}", LAMP_R, 0.03, (x + 0.08, sy * y, z), "light", rot=(0, math.pi / 2, 0), vertices=round_sides(LAMP_R))
        kit.box(f"lamp_stem_{s}", (0.06, 0.06, 0.12), (x - 0.02, sy * y, z - LAMP_R - 0.03), "under")


def cabin(kit: Kit) -> None:
    """The greenhouse under one arched roof line: dark glass, a trim roof cap over the crest, and a painted round back."""
    base_half, top_half = BODY - 0.02, 0.27
    glass_x = [COWL, 0.45, SCREEN_TOP, 0.15, 0.0, -0.15, -0.3, BACK_FRONT, GLASS_BACK]
    loft(kit, "glass", [at_x(x, section(max(0.04, roof_z(x) - CAP - BELT), base_half, top_half + (0.12 if x == COWL else 0))) for x in glass_x], "glass")

    def cap(x: float) -> list[tuple[float, float]]:
        h = roof_z(x) - CAP - BELT
        outline = section(h + CAP, base_half + 0.015, top_half + 0.01)
        return outline[2:6]

    cap_x = [SCREEN_TOP, 0.15, 0.0, -0.15, -0.3, BACK_FRONT]
    loft(kit, "roof", [at_x(x, cap(x)) for x in cap_x], "trim")

    back_x = [BACK_FRONT, -0.53, GLASS_BACK, -0.63, -0.68, -0.72, -0.76, -0.79, -0.82, -0.84, -0.86, DECK_FRONT + 0.01]
    loft(kit, "round_back", [at_x(x, section(max(0.03, roof_z(x) - tub_top(x) + 0.025), base_half + 0.01, top_half + 0.02 + 0.15 * (BACK_FRONT - x), tub_top(x) - 0.02)) for x in back_x], "paint")
    for s, sy in (("l", 1), ("r", -1)):
        strut(kit, f"a_pillar_{s}", (COWL, sy * (base_half - 0.01), BELT + 0.02), (SCREEN_TOP, sy * (top_half + 0.6 * (base_half - top_half) + 0.01), BELT + 0.8 * (roof_z(SCREEN_TOP) - CAP - BELT)), 0.07, "paint")
        strut(kit, f"b_pillar_{s}", (-0.12, sy * (base_half - 0.01), BELT), (-0.14, sy * (top_half + 0.6 * (base_half - top_half) + 0.01), BELT + 0.8 * (roof_z(-0.14) - CAP - BELT)), 0.09, "paint")


def tube(kit: Kit, name: str, a: tuple[float, float, float], b: tuple[float, float, float]) -> None:
    strut(kit, name, a, b, TUBE, "metal", sides=round_sides(TUBE / 2))


def tubes(kit: Kit) -> None:
    """The tube bumpers, the tail cage over the deck sides, the dark engine grille and the upright taillights."""
    nose = FRONT - TUBE / 2
    tube(kit, "bumper_front", (nose, 0.62, BUMPER_Z), (nose, -0.62, BUMPER_Z))
    tail = BACK + TUBE / 2
    tube(kit, "bumper_rear", (tail, CAGE_Y + 0.04, BUMPER_Z), (tail, -CAGE_Y - 0.04, BUMPER_Z))
    for s, sy in (("l", 1), ("r", -1)):
        tube(kit, f"bumper_front_post_{s}", (nose - 0.02, sy * 0.4, BUMPER_Z), (FRONT - 0.12, sy * 0.4, NOSE_TOP - 0.06))
        tube(kit, f"cage_rail_{s}", (DECK_FRONT + 0.12, sy * CAGE_Y, CAGE_TOP), (tail, sy * CAGE_Y, CAGE_TOP))
        tube(kit, f"cage_post_{s}", (tail, sy * CAGE_Y, CAGE_TOP), (tail, sy * CAGE_Y, BUMPER_Z))
        tube(kit, f"cage_stay_{s}", (DECK_FRONT + 0.12, sy * CAGE_Y, CAGE_TOP), (DECK_FRONT + 0.02, sy * CAGE_Y, DECK))
        tube(kit, f"cage_brace_{s}", ((DECK_FRONT + BACK) / 2, sy * CAGE_Y, CAGE_TOP), ((DECK_FRONT + BACK) / 2 - 0.1, sy * CAGE_Y, DECK))
    tube(kit, "cage_hoop", (tail, CAGE_Y, CAGE_TOP), (tail, -CAGE_Y, CAGE_TOP))
    for i in range(3):
        kit.box(f"tail_grille_{i}", (0.04, 0.62, 0.05), (BACK + 0.04, 0, DECK - 0.1 - 0.1 * i), "soot")
    _, rear_x = WHEELS_X
    a = math.pi - 0.62
    tx = rear_x + (FENDER_R - 0.04) * math.cos(a)
    tz = HUB_Z + (FENDER_R - 0.04) * math.sin(a)
    for s, sy in (("l", 1), ("r", -1)):
        kit.cylinder(f"taillight_{s}", 0.06, 0.2, (tx, sy * (SIDE - SHOULDER - 0.08), tz + 0.1), "red", vertices=round_sides(0.06))


def arch_sockets(kit: Kit) -> None:
    front_x, rear_x = WHEELS_X
    kit.socket("arch_front", (front_x, WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (rear_x, WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (front_x, WHEEL_Z, HUB_Z + ARCH_R))


def main() -> None:
    args = parse_args()
    kit = Kit(BASE_COLORS, SEED)
    body(kit)
    fenders(kit)
    cabin(kit)
    tubes(kit)
    arch_sockets(kit)
    bay = {(x, y): FLOOR for x in (1, 2) for y in (1, 2)}
    sides = {(x, y): surface_z(G, x, y) for x in (0, 3) for y in range(G.rows) if abs(G.row_x(y)) < FRONT - 0.1}
    level_sockets(kit, G, "row", [NOSE_TOP, BELT, BELT, roof_z(0.0), roof_z(-0.65), DECK, DECK], cells=bay | sides)
    level_sockets(kit, G, "floor", [FLOOR] * 3 + [BELT] * 2 + [DECK] * 2)
    check_base(kit, "base_courier", G)
    kit.export("base_courier", args, view_size=5.0)


if __name__ == "__main__":
    main()
