"""The wagon base: a short-nosed army gun truck, built from a Unimog 404 S, a Dodge WC-52 and a Vietnam M54 gun truck.

Built through the blender-image-to-3d brief from photographs on Wikimedia Commons, none kept in the repo: "Unimog 404 Seite" by
Jojhnjoy (CC BY-SA 3.0) and "Unimog 404 pic1" by Alf van Beem (CC0) for the proportions, a short square hood ahead of a cab over
the front axle and a long flat deck behind it, "Dodge WC-52" by joost j. bakker (CC BY 2.0) and "Dodge WC 52 Weapons Carrier" by
Dasch01 (CC BY-SA 4.0) for the face, a vertical-bar grille between separate flat-topped wings with the lamps on the wing fronts,
a heavy bumper and the spare standing upright behind the cab, and "Eve of Destruction Exterior" by Yellowute (public domain),
an M54 gun truck, for the armor: bolted plates over the cab doors, a narrow armored windshield and a plated rim round the deck.
A concept image drawn from those photos, front-left three-quarter, bare, set the silhouette and the detail.
Scaled like the other bases: 6.1 m long, 2.8 m wide across the wings and the plated rim and 2.45 m tall on its tires, so the roof
stands under the hauler's 2.64 m. The ground is 1.4 m below the center. Levels over the center: roof 1.05, hood 0.32, wing tops 0.0.
Grid: 7 columns by 9 rows over the 6.1 by 2.8 m model, a row 0.678 m and a column 0.4 m. Half height 0.55 m, from PHYSICS.bodies.wagon.
Row 0 is the nose: a low square hood between flat-topped wings, a vertical-bar grille on the face, lamps on the wing fronts and a heavy
bumper with tow hooks. Rows 1 and 2 are the closed cab over the front axle, a raked narrow windshield with two panes, plates over the
doors and a flat full-width roof where the deck cells stand. Rows 3 to 8 are the deck, its floor at 0.05, with a low plated rim.
The engine stands in an open plated tub behind the cab on its bay floor (columns 2 and 3, rows 3 and 4, PHYSICS.bodies.wagon.engine);
the transmission (columns 4 and 5, rows 5 and 6) and the fuel tank (column 2, rows 3 and 4) stand on the deck. The spare stands upright
behind the cab, the fuel tanks hang under the deck and the taillights sit at the tail.
Wheels sit on rows 1 and 7 in the outer columns, radius 0.6 m, half width 0.25 m, mount 0.4 m below the center, 1.12 m off the center line.
Sockets arch_front, arch_rear and arch_front_top (the arch crown) mark the arches for wheelArches.test.ts.
Deviations from the photos: the wheels stay symmetric, the body is wider than the real trucks to give the deck seven columns, the
engine stands in a tub behind the cab where the Unimog has it under the hood (the grid puts it there, a junk-built gun truck), the
plates are big panels with no bolts, and the gun box and the gunners of the M54 are left out, so the deck is a flat surface for the gun parts.
Run: blender --background --python tools/blender/base_wagon.py -- public/models/base_wagon.glb [tmp/base_wagon.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402
from parts_common_base import ARCH_CLEARANCE, BASE_COLORS, ROUND_ARCH_SEGMENTS, SUSPENSION_REST, Grid, check_base, cut_boxes, flare_profile, level_sockets, round_arch  # noqa: E402
from parts_common_core import ALONG_X, PROUD, ROUND_SIDES, TIRE_SHARE, drawn_wheel  # noqa: E402
from shapes import prism  # noqa: E402

SEED = 304
LENGTH = 6.1
WIDTH = 2.8
ROWS = 9
COLS = 7


class Frame(Grid):
    """The chassis grid stretched over the model, the way singleCellRect() in body.ts projects it."""

    def __init__(self, half_height: float) -> None:
        super().__init__(ROWS, COLS, half_height)
        self.half_x = LENGTH / 2
        self.half_y = WIDTH / 2
        self.row_step = LENGTH / ROWS
        self.col_step = WIDTH / COLS

    def row_x(self, y: float) -> float:
        return self.half_x - self.row_step * (y + 0.5)

    def col_y(self, x: float) -> float:
        return self.half_y - self.col_step * (x + 0.5)


G = Frame(half_height=0.55)
WHEEL_R = 0.6
WHEEL_HALF_W = 0.25
WHEEL_Z = 1.12
HUB_Z = -0.4 - SUSPENSION_REST
WHEEL_X = 1.8
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03
ARCH_R = WHEEL_R + ARCH_CLEARANCE
TIRE_TOP = HUB_Z + WHEEL_R

HALF_X = G.half_x
HALF_Y = G.half_y
SIDE = HALF_Y - 0.02
FRAME_BOTTOM = -0.62
FLOOR = 0.05
FLOOR_BOTTOM = -0.07
RIM_TOP = 0.4
WALL = 0.08

NOSE_FACE = 2.97
FENDER_FRONT = 3.0
FENDER_TOP = 0.0
HOOD_TOP = 0.32
HOOD_HALF = 0.62
HOOD_BOTTOM = -0.3
BUMPER_FRONT = HALF_X
BUMPER_DEPTH = 0.2
BUMPER_HALF = 1.35
BUMPER_BOTTOM = -0.68
BUMPER_TOP = -0.4

CAB_FRONT = 2.37
CAB_BACK = G.row_x(2.5) + 0.01
CAB_BOTTOM = -0.1
CAB_SIDE = 1.3
SCREEN_FOOT = 0.35
ROOF = 1.05
ROOF_T = 0.1
ROOF_FRONT = 2.2
BELOW_ROOF = ROOF - ROOF_T
SLOPE = (ROOF_FRONT - CAB_FRONT) / (BELOW_ROOF - SCREEN_FOOT)

HOLE_MARGIN = 0.02
HOLE = ((G.row_x(4.5) - HOLE_MARGIN, G.col_y(3.5) - HOLE_MARGIN), (G.row_x(2.5) + HOLE_MARGIN, G.col_y(1.5) + HOLE_MARGIN))
TUB_WALL = 0.05
TUB_TOP = 0.3
BAY_FLOOR = FLOOR

SPARE_R = 0.45
SPARE_T = 0.2


def mirrored(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def clip_x(profile: list[tuple[float, float]], x0: float, x1: float) -> list[tuple[float, float]]:
    """The part of a closed XZ profile between x0 and x1, cut straight across at both ends."""
    out = profile
    for keep, edge in ((lambda x: x >= x0, x0), (lambda x: x <= x1, x1)):
        pts, out = out, []
        for i, p in enumerate(pts):
            q = pts[(i + 1) % len(pts)]
            if keep(p[0]):
                out.append(p)
            if keep(p[0]) != keep(q[0]):
                t = (edge - p[0]) / (q[0] - p[0])
                out.append((edge, p[1] + t * (q[1] - p[1])))
    return out


def screen_x(z: float) -> float:
    """The windshield's front plane at height z, from the foot on the cab face up to the roof's front edge."""
    return CAB_FRONT + SLOPE * (z - SCREEN_FOOT)


def underbody(kit: Kit) -> None:
    """The dark frame between the wells, both axles with their differentials, the fuel tanks and the rear bumper."""
    kit.box("core", (2 * HALF_X - 0.2, 0.9, FLOOR_BOTTOM - FRAME_BOTTOM), (0, 0, (FLOOR_BOTTOM + FRAME_BOTTOM) / 2), "under")
    for i, wx in enumerate((WHEEL_X, -WHEEL_X)):
        kit.box(f"axle{i}", (0.16, 2 * WELL_Y, 0.4), (wx, 0, HUB_Z + 0.08), "under")
        kit.box(f"diff{i}", (0.4, 0.4, 0.4), (wx, 0.12, HUB_Z + 0.08), "under")
    for s, y in (("l", 0.68), ("r", -0.68)):
        kit.cylinder(f"tank_{s}", 0.2, 0.9, (0.5, y, -0.33), "metal", rot=(0, math.pi / 2, 0), vertices=ROUND_SIDES)
    kit.box("rear_bumper", (0.12, 2 * CAB_SIDE - 0.2, 0.15), (-HALF_X + 0.06, 0, -0.47), "under")
    kit.box("rear_beam", (0.1 - PROUD, 2 * CAB_SIDE, FLOOR_BOTTOM + 0.4), (-HALF_X + 0.15 + PROUD / 2, 0, FLOOR_BOTTOM - 0.16), "under")
    mirrored(kit, "mud_flap", (0.04, 0.5, 0.45), -WHEEL_X - ARCH_R - 0.06, WHEEL_Z, -0.32, "under")


def wings(kit: Kit) -> None:
    """Flat-topped wings with a round arch over each front wheel, a dark flare round it, and a solid strip beside the hood."""
    far_back = WHEEL_X - ARCH_R - 0.4
    arch = round_arch(WHEEL_X, HUB_Z, ARCH_R, FRAME_BOTTOM, ROUND_ARCH_SEGMENTS)
    outline = [(far_back, FRAME_BOTTOM), *arch, (FENDER_FRONT, FRAME_BOTTOM), (FENDER_FRONT, FENDER_TOP - 0.1), (FENDER_FRONT - 0.1, FENDER_TOP), (far_back, FENDER_TOP)]
    piece = clip_x(outline, CAB_BACK, FENDER_FRONT)
    prism(kit, "wing_l", piece, WELL_Y, SIDE, "paint")
    prism(kit, "wing_r", piece, -SIDE, -WELL_Y, "paint")
    strip = (FENDER_FRONT - CAB_FRONT - 0.03, WELL_Y - HOOD_HALF, FENDER_TOP - FRAME_BOTTOM)
    mirrored(kit, "wing_inner", strip, (FENDER_FRONT + CAB_FRONT + 0.03) / 2, (WELL_Y + HOOD_HALF) / 2, (FENDER_TOP + FRAME_BOTTOM) / 2, "paint")
    for i, wx in enumerate((WHEEL_X, -WHEEL_X)):
        x_min, x_max = (CAB_BACK, FENDER_FRONT) if wx > 0 else (-HALF_X, HALF_X)
        ring = flare_profile(wx, HUB_Z, WHEEL_R, FRAME_BOTTOM, x_min, x_max, ROUND_ARCH_SEGMENTS)
        prism(kit, f"flare{i}_l", ring, HALF_Y - 0.02, HALF_Y, "under")
        prism(kit, f"flare{i}_r", ring, -HALF_Y, -HALF_Y + 0.02, "under")


def hood(kit: Kit) -> None:
    """The short square hood over row 0, with a vertical-bar grille on the face, round lamps on the wing fronts and a heavy bumper."""
    length = NOSE_FACE - CAB_FRONT
    kit.box("hood", (length, 2 * HOOD_HALF, HOOD_TOP - HOOD_BOTTOM), ((NOSE_FACE + CAB_FRONT) / 2, 0, (HOOD_TOP + HOOD_BOTTOM) / 2), "paint")
    kit.box("hood_lid", (length - 0.1, 2 * HOOD_HALF - 0.12, 0.03), ((NOSE_FACE + CAB_FRONT) / 2 - 0.02, 0, HOOD_TOP + 0.015), "trim")
    grille_half, grille_top, grille_bottom = 0.46, 0.26, -0.36
    kit.box("grille", (0.06, 2 * grille_half, grille_top - grille_bottom), (NOSE_FACE + 0.02, 0, (grille_top + grille_bottom) / 2), "under")
    bars = 9
    for i in range(bars):
        y = (i - (bars - 1) / 2) * (2 * grille_half - 0.1) / (bars - 1)
        kit.box(f"bar{i}", (0.03, 0.05, grille_top - grille_bottom - 0.08), (NOSE_FACE + 0.06, y, (grille_top + grille_bottom) / 2), "metal")
    for s, y in (("l", 0.82), ("r", -0.82)):
        kit.cylinder(f"lamp_ring_{s}", 0.17, 0.04, (FENDER_FRONT + 0.0, y, -0.2), "metal", rot=(0, math.pi / 2, 0), vertices=ROUND_SIDES)
        kit.cylinder(f"lamp_{s}", 0.13, 0.04, (FENDER_FRONT + 0.02, y, -0.2), "light", rot=(0, math.pi / 2, 0), vertices=ROUND_SIDES)
    kit.box("bumper", (BUMPER_DEPTH, 2 * BUMPER_HALF, BUMPER_TOP - BUMPER_BOTTOM), (BUMPER_FRONT - BUMPER_DEPTH / 2, 0, (BUMPER_TOP + BUMPER_BOTTOM) / 2), "under")
    for s, y in (("l", 0.7), ("r", -0.7)):
        kit.cylinder(f"hook_{s}", 0.05, 0.06, (BUMPER_FRONT - 0.08, y, (BUMPER_TOP + BUMPER_BOTTOM) / 2), "trim", rot=(0, math.pi / 2, 0), vertices=ROUND_SIDES)


def cab(kit: Kit) -> None:
    """A closed full-width cab over the front axle: a raked windshield, flat sides, a back wall and a flat roof one level over the hood."""
    profile = [(CAB_BACK, CAB_BOTTOM), (CAB_FRONT, CAB_BOTTOM), (CAB_FRONT, SCREEN_FOOT), (ROOF_FRONT, BELOW_ROOF), (CAB_BACK, BELOW_ROOF)]
    prism(kit, "cab", profile, -CAB_SIDE, CAB_SIDE, "paint")
    kit.box("roof", (ROOF_FRONT - CAB_BACK, 2 * CAB_SIDE + 0.04, ROOF_T), ((ROOF_FRONT + CAB_BACK) / 2, 0, ROOF - ROOF_T / 2), "trim")
    mirrored(kit, "mirror", (0.05, 0.08, 0.34), ROOF_FRONT - 0.14, HALF_Y - 0.06, 0.55, "metal")


def cab_plates(kit: Kit) -> None:
    """Armor over the closed cab: a plate on each door, a small side window, and a two-pane narrow windshield in a plate frame."""
    z0, z1 = 0.58, 0.9
    frame = 0.07
    for s, sign in (("l", 1), ("r", -1)):
        y_plate = sign * (CAB_SIDE + PROUD * 1.5)
        kit.box(f"door_plate_{s}", (1.05, PROUD * 3, 0.5), (1.6, y_plate, 0.2), "trim")
        kit.box(f"door_glass_{s}", (0.5, PROUD * 3, z1 - z0), (1.62, sign * (CAB_SIDE + PROUD * 2.5), (z0 + z1) / 2), "glass")
        kit.box(f"door_frame_{s}", (0.58, PROUD * 3, z1 - z0 + frame), (1.62, y_plate, (z0 + z1) / 2), "trim")
    lo, hi = SCREEN_FOOT + 0.14, BELOW_ROOF - 0.06
    near = lambda z: screen_x(z)  # noqa: E731
    for name, y0, y1, mat, lift in (("brow", -CAB_SIDE, CAB_SIDE, "trim", PROUD), ("pane_l", 0.07, 1.14, "glass", PROUD * 2), ("pane_r", -1.14, -0.07, "glass", PROUD * 2)):
        a, b = (lo - 0.05, hi + 0.04) if name == "brow" else (lo, hi)
        prism(kit, name, [(near(a) - 0.0, a), (near(a) + lift, a), (near(b) + lift, b), (near(b), b)], y0, y1, mat)
    kit.box("post", (0.08, 0.14, hi - lo + 0.02), (near((lo + hi) / 2) + PROUD * 2, 0, (lo + hi) / 2), "trim")


def engine_tub(kit: Kit) -> None:
    """An open plated tub behind the cab over the engine cells, with a hole down to the bay floor."""
    (x0, y0), (x1, y1) = HOLE
    front, back = x1 + TUB_WALL, x0 - TUB_WALL
    box = kit.box("tub", (front - back, y1 - y0 + 2 * TUB_WALL, TUB_TOP - FLOOR), ((front + back) / 2, (y0 + y1) / 2, (TUB_TOP + FLOOR) / 2), "paint")
    cut_boxes(box, [((x0, y0, FLOOR - 0.01), (x1, y1, TUB_TOP + 0.1))])
    box.data.materials.clear()
    box.data.materials.append(kit._materials["paint"])
    for s, y in (("l", y1 + TUB_WALL + PROUD), ("r", y0 - TUB_WALL - PROUD)):
        kit.box(f"tub_plate_{s}", (front - back - 0.2, PROUD * 2, TUB_TOP - FLOOR - 0.06), ((front + back) / 2, y, (TUB_TOP + FLOOR) / 2), "trim")


def deck(kit: Kit) -> None:
    """A long flat deck: a plank floor, low drop sides capped by a plated rim, a tailgate and red tail lights."""
    back = -HALF_X + 0.05
    length = CAB_BACK - back
    mid = (CAB_BACK + back) / 2
    kit.box("floor", (length, 2 * SIDE, FLOOR - FLOOR_BOTTOM), (mid, 0, (FLOOR + FLOOR_BOTTOM) / 2), "metal_dark")
    h = RIM_TOP - FLOOR
    mirrored(kit, "side", (length, WALL, h), mid, SIDE - WALL / 2, FLOOR + h / 2, "paint")
    mirrored(kit, "rail", (length - 0.03, WALL + 0.03, 0.06), mid - 0.015, SIDE - WALL / 2, RIM_TOP, "trim")
    for i, z in enumerate((0.15, 0.27)):
        mirrored(kit, f"rib{i}", (length - 0.1, 0.02, 0.05), mid, HALF_Y - 0.01, z, "trim")
    for i, x in enumerate((-2.4, -1.0, 0.4)):
        mirrored(kit, f"stake{i}", (0.1, 0.03, h - PROUD), x, HALF_Y - 0.015 - PROUD, FLOOR + (h - PROUD) / 2, "under")
    kit.box("tailgate", (WALL, 2 * (SIDE - WALL), h), (back + WALL / 2, 0, FLOOR + h / 2), "paint")
    kit.box("tail_rail", (WALL + 0.04, 2 * SIDE, 0.08), (back + WALL / 2, 0, RIM_TOP + 0.01), "trim")
    mirrored(kit, "taillight", (0.05, 0.14, 0.2), -HALF_X + 0.025, SIDE - 0.14, 0.2, "red")


def spare(kit: Kit) -> None:
    """A spare wheel standing upright behind the cab on the left, in the round look of the game's wheel."""
    x = CAB_BACK - SPARE_T / 2 - 0.01
    y = HALF_Y - SPARE_R - 0.02
    z = FLOOR + SPARE_R
    drawn_wheel(kit, "spare", (x, y, z), SPARE_R / TIRE_SHARE, SPARE_T / 0.94, ALONG_X)


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
        raise RuntimeError(f"base_wagon is {hi.x - lo.x:.3f} x {hi.y - lo.y:.3f} m, not {LENGTH} x {WIDTH} m")


def check_tires() -> None:
    """Raises when a tire at its physics mount reaches a tank, the wing top or the deck."""
    tire_back = WHEEL_X - WHEEL_R
    if 0.5 + 0.45 > tire_back - 0.05:
        raise RuntimeError(f"the tanks run into the front tire inside x {tire_back:.3f}")
    if FENDER_TOP - (HUB_Z + ARCH_R) < 0.1:
        raise RuntimeError(f"the wing top at z {FENDER_TOP:.3f} leaves under 0.1 m over the arch crown at z {HUB_Z + ARCH_R:.3f}")
    if FLOOR_BOTTOM - TIRE_TOP < ARCH_CLEARANCE:
        raise RuntimeError(f"the deck bottom at z {FLOOR_BOTTOM:.3f} keeps under {ARCH_CLEARANCE} m over the rear tires")


def check_hood() -> None:
    """Raises when the hood is not a step under the roof, or the roof leaves the cab rows."""
    if ROOF - HOOD_TOP < 0.6:
        raise RuntimeError(f"the hood top at z {HOOD_TOP:.3f} is within 0.6 m of the roof at z {ROOF:.3f}")
    if ROOF_FRONT < G.row_x(0.5) - G.row_step / 2 - 0.25 or CAB_BACK > G.row_x(2.5) + 0.02:
        raise RuntimeError(f"the roof runs x {CAB_BACK:.3f}..{ROOF_FRONT:.3f}, not over rows 1 and 2")
    if HOOD_HALF >= WELL_Y:
        raise RuntimeError("the hood is as wide as the wells")


def main() -> None:
    args = parse_args()
    check_tires()
    check_hood()
    kit = Kit(BASE_COLORS, SEED)
    underbody(kit)
    wings(kit)
    hood(kit)
    cab(kit)
    cab_plates(kit)
    engine_tub(kit)
    deck(kit)
    spare(kit)
    kit.socket("arch_front", (WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (-WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEEL_X, WHEEL_Z, HUB_Z + ARCH_R))
    wing_cells = {(x, y): FENDER_TOP for x in (0, 1, 5, 6) for y in (0,)}
    wing_cells.update({(x, y): FENDER_TOP for x in (0, 6) for y in (1, 2)})
    level_sockets(kit, G, "row", [HOOD_TOP] + [ROOF] * 2 + [FLOOR] * 6, fronts={1: ROOF_FRONT}, cells=wing_cells)
    level_sockets(kit, G, "floor", [HOOD_TOP] + [CAB_BOTTOM] * 2 + [BAY_FLOOR] * 6)
    check_size(kit)
    check_base(kit, "base_wagon", G)
    kit.export("base_wagon", args, view_size=8.0)


if __name__ == "__main__":
    main()
