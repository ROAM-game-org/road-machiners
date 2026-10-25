"""The bus base: a LAZ-695 city bus, built from two photos of its front right corner.

The photos (Wikimedia Commons, Novoklimov, CC0, kept out of the repo) show the nose, the right side and the roof line.
Heights come from photo 2's near front corner, 2.93 m to the roof edge at 3.9 mm a pixel, ground up: bumper 0.12 to 0.43,
skirt top and rub strip 0.80, headlamp center 0.95, side stripe 1.32 to 1.46, belt stripe 1.76 to 1.91, window sill 1.91,
window top and visor lip 2.70, roof edge 2.93. Lengths come from the grid and the wheels, since both photos are perspective.
The model is cut to the grid: 8.5 m long, 2.6 m wide across its rub strips and flares and 2.94 m to the flat roof on its tires,
3.04 m over the rear roof air intake, on a 3.9 m wheelbase with even 2.3 m overhangs.
The ground is 1.67 m below the center. Levels over the center: intake top 1.37, flat roof 1.27, window top 1.01, sill 0.24,
belt stripe 0.10 to 0.24, side stripe -0.40 to -0.20, headlamps -0.54, skirt top -0.72, body bottom -1.03.
The body is stacked hulls on one rounded plan: the nose and tail bow 0.16 m ahead of their corners, which round off at 0.32 m.
A trim skirt and front apron, a paint lower body and front face, a trim belt stripe that crosses the front under the windshield,
a glass window band whose sides lean in 0.06 m and whose front rakes back 0.26 m into a two-pane windshield that wraps round
the corners, and a paint cant and roof whose domed front cap ends in a visor lip 0.26 m ahead of the windshield top, hanging to 2.59 m.
Round headlamps sit in bulges faired into the front face, over parking lamps in the apron, a moulding bar and a split bumper.
The right side has one front door of two leaves behind the nose rounding, then six window bays with transom bars; the left side
has seven bays. A strip of roof-curve glass runs over the bays in the cant. A two-line trim side stripe and a dark rub strip
run along each side, broken by the flares.
The flat roof, 1.10 m either side of the center line, is the row surface of every deck row. The cant and its glass lie outside it.
The rear roof intake stands behind the last deck row, over the back ring.
The engine hatch is a cutout over the engine cells, rows 8 and 9 of columns 3 and 4, round PHYSICS.bodies.bus.engine, over a bay floor at 1.02.
Wheels sit 1.95 m ahead of and behind the center, 1.0 m off the center line, radius 0.72 m, half width 0.27 m,
mount 0.55 m below the center. Round arches, flares and lamps take their sides from round_sides().
Sockets arch_front, arch_rear and arch_front_top (the arch crown) mark the arches for wheelArches.test.ts.
Inferred, since neither photo shows them: the left side, the closed engine end with its rear window, louvered lid, tall
taillights and bumper, the flat roof center and the rear roof intake.
Deviations from the photos: 7.5% short for the grid's cell cap; even overhangs, since a body has one wheelX; tire rule tires,
whose arches break the side stripe and rub strip; the body bottom stays 0.64 m up so the collision height keeps the tire rule's
0.72 m, which lifts the skirt top to 0.95 m and the headlamps to 1.13 m, and thins the bumper; the nose corners round at 0.32 m, not
0.5 m, so the front door keeps 0.65 m clear of the flare; the side stripe is 0.2 m deep, against the photo's 0.14 m, to read
at the game camera; the roof-curve glass is narrower, since the flat roof the deck rows stand on takes the photo's curved roof; faction paint and trim in place of white and red; no lettering, curtains, plate,
badge, horn or mirrors on stalks, which would leave the width; no second door, which the photos do not show.
Run: blender --background --python tools/blender/base_bus.py -- public/models/base_bus.glb [tmp/base_bus.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, Vec3, parse_args, round_sides  # noqa: E402
from parts_common_base import (  # noqa: E402
    ARCH_CLEARANCE,
    BASE_COLORS,
    DOOR_GAP,
    FLARE,
    SUSPENSION_REST,
    Grid,
    check_base,
    check_door_gap,
    cut_boxes,
    cut_hulls,
    flare,
    hull_mesh,
    level_sockets,
)
from parts_common_core import PROUD  # noqa: E402
from shapes import prism  # noqa: E402

SEED = 306
LENGTH = 8.5
WIDTH = 2.6
ROWS = 12
COLS = 9
ROOF_HEIGHT = (2.92, 2.98)  # ground to flat roof, the band truck-shapes.test.ts pins
PHOTO_SILL_SHARE = 0.65  # photo 2: the window sill over the ground as a share of the roof edge
MIN_ROOF_FLAT = 1.10  # the flat roof's half width the deck columns stand on


class Frame(Grid):
    """The chassis grid stretched over the model, the way singleCellRect() in body.ts projects it."""

    def __init__(self, half_height: float) -> None:
        super().__init__(ROWS, COLS, half_height)
        self.half_x = LENGTH / 2
        self.half_y = WIDTH / 2
        self.row_step = LENGTH / ROWS
        self.col_step = WIDTH / (COLS - 2)

    def row_x(self, y: float) -> float:
        return self.half_x - self.row_step * (y + 0.5)

    def col_y(self, x: float) -> float:
        return max(-self.half_y, min(self.half_y, self.half_y - self.col_step * (x - 0.5)))


G = Frame(half_height=0.8)
WHEEL_R = 0.72  # PHYSICS.bodies.bus.wheelRadius
WHEEL_HALF_W = 0.27  # PHYSICS.bodies.bus.wheelHalfWidth
WHEEL_Z = 1.0  # PHYSICS.bodies.bus.wheelZ
WHEEL_X = 1.95  # PHYSICS.bodies.bus.wheelX
HUB_Z = -0.55 - SUSPENSION_REST  # PHYSICS.bodies.bus.wheelY
GROUND = HUB_Z - WHEEL_R
WHEELS_X = [WHEEL_X, -WHEEL_X]
ARCH_R = WHEEL_R + ARCH_CLEARANCE
ARCH_SIDES = round_sides(ARCH_R) // 2
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03

HALF_Y = WIDTH / 2
SIDE = HALF_Y - 0.03  # body side face; the rub strips and flares stand out to the full width
FRONT = LENGTH / 2 - 0.04  # nose face; the bumper reaches the full length
BACK = -FRONT
BULGE = 0.16  # photo 1: the nose bows this far ahead of its corners
CORNER = 0.32  # photo 1: the nose corner radius in plan, cut so the front door keeps its width
NOSE_END = FRONT - BULGE - CORNER  # where the nose rounding meets the flat side
TAIL_END = -NOSE_END

BODY_BOTTOM = -1.03
SKIRT_TOP = -0.72  # photo 2: 0.80 m, lifted with the body bottom
RUB = (-0.74, -0.69)
BELT = 0.1  # photo 2: 1.76 m, so the belt stripe is 0.14 m deep
SILL = 0.24  # photo 2: 1.91 m, 0.65 of the roof edge
WIN_TOP = 1.01  # photo 2: 2.70 m
TUMBLE = 0.06  # photo 1: the window band leans in this far at its top
SIDE_STRIPE = (-0.4, -0.27)  # photo 2: 1.32 to 1.42 m, widened to read at the game camera
SIDE_LINE = (-0.24, -0.2)  # photo 2: the thin upper line, to 1.46 m
ROOF = 1.27
ROOF_FLAT = MIN_ROOF_FLAT
ROOF_FRONT = FRONT - 0.46  # where the visor dome reaches the roof, ahead of deck row 1
ROOF_BACK = BACK + 0.4
INTAKE_FRONT = -3.56
INTAKE_TOP = 1.37
INTAKE_HALF = 0.95
FLOOR = 0.0

SIDE_PROFILE = [(BODY_BOTTOM, SIDE), (SILL, SIDE), (WIN_TOP, SIDE - TUMBLE), (1.07, 1.205), (1.15, 1.18), (1.22, 1.14), (1.255, 1.115), (ROOF, ROOF_FLAT)]
WINDSHIELD_RAKE = 0.26  # photo 1: the windshield top stands this far behind its foot
VISOR_LIP = 0.26  # photo 1: the visor lip overhangs the windshield top by this much
VISOR_FOOT = 0.92  # photo 1: the visor lip hangs a little under the side window tops
# (z, nose, tail, half, bulge, corner) of the cant and roof hull, from the visor lip up the dome to the flat roof
CANT = [
    (WIN_TOP, FRONT - WINDSHIELD_RAKE - 0.02 + VISOR_LIP, BACK + 0.04, SIDE - TUMBLE, 0.07, 0.37),
    (1.07, FRONT - 0.03, BACK + 0.06, 1.205, 0.07, 0.37),
    (1.15, FRONT - 0.09, BACK + 0.17, 1.18, 0.06, 0.36),
    (1.22, FRONT - 0.2, BACK + 0.3, 1.14, 0.04, 0.33),
    (1.255, FRONT - 0.33, BACK + 0.36, 1.115, 0.02, 0.29),
    (ROOF, ROOF_FRONT, ROOF_BACK, ROOF_FLAT, 0.0, 0.25),
]

ENGINE_X = -2.125  # PHYSICS.bodies.bus.engine.x, the middle of rows 8 and 9
ENGINE_Y = 0.186  # -PHYSICS.bodies.bus.engine.z, the middle of columns 3 and 4
BAY_FLOOR = ROOF - 0.25  # PHYSICS.bodies.bus.engine.y
ENGINE_HALF = (G.row_step, G.col_step)  # the two by two engine cells
HATCH = ((ENGINE_X - ENGINE_HALF[0] - 0.01, ENGINE_Y - ENGINE_HALF[1] - 0.02), (ENGINE_X + ENGINE_HALF[0] + 0.01, ENGINE_Y + ENGINE_HALF[1] + 0.02))

FLARE_REACH = ARCH_R + FLARE + DOOR_GAP + 0.01
FRONT_DOOR = (NOSE_END, WHEEL_X + FLARE_REACH)  # x front, x back
DOOR_BOTTOM = RUB[1]
PILLAR_W = 0.15
BAYS = 6  # photo 1: window bays behind the door
TRANSOM = 0.82  # photo 1: the transom bar sits at 0.77 of the window height
ROOF_GLASS = (1.085, 1.25)
LAMP_Y = 0.8  # photo 1: the headlamps sit just inside the nose corners
LAMP_Z = -0.54  # photo 2: 0.95 m, lifted with the skirt
LAMP_R = 0.13
BUMPER_TOP = -0.94
LAMP_BULGE = 0.27  # photo 1: the faired bulge round each headlamp


def add_hull(kit: Kit, name: str, points: list[Vec3], mat: str, cutters: list[list[Vec3]] | None = None) -> bpy.types.Object:
    obj = hull_mesh(name, list({tuple(round(c, 5) for c in p): p for p in points}.values()))
    if cutters:
        cut_hulls(obj, cutters)
        obj.data.materials.clear()
    return kit._add(obj, name, mat, 0.0)


def arc(cx: float, cy: float, r: float, a0: float, a1: float) -> list[tuple[float, float]]:
    steps = max(2, round_sides(r) * abs(a1 - a0) / (2 * math.pi))
    n = math.ceil(steps)
    return [(cx + r * math.cos(a0 + (a1 - a0) * k / n), cy + r * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]


def corner_points(face_x: float, flat: float, corner: float, sign: int) -> list[tuple[float, float]]:
    """The two round corners of one end in plan: quarter circles from the end face round to the sides."""
    cx = face_x - sign * corner
    pts: list[tuple[float, float]] = []
    for x, y in arc(0.0, 0.0, corner, 0.0, math.pi / 2):
        pts += [(cx + sign * x, flat + y), (cx + sign * x, -flat - y)]
    return pts


def plan_ring(z: float, nose: float, tail: float, half: float, bulge: float, corner: float, out: float = 0.0) -> list[Vec3]:
    """A body outline at height z: a bowed nose and tail, each bulge ahead of its round corners, and straight sides, grown by out."""
    flat = half - corner
    pts: list[tuple[float, float]] = []
    for tip, sign in ((nose, 1), (tail, -1)):
        pts += [(tip - sign * bulge * (k / 4) ** 2 + sign * out, flat * k / 4) for k in range(-4, 5)]
        pts += corner_points(tip - sign * bulge, flat, corner + out, sign)
    return [(x, y, z) for x, y in pts]


def half_at(z: float) -> float:
    """The half width of the body side at height z, read off SIDE_PROFILE."""
    for (z0, h0), (z1, h1) in zip(SIDE_PROFILE, SIDE_PROFILE[1:]):
        if z0 <= z <= z1:
            return h0 + (h1 - h0) * (z - z0) / (z1 - z0)
    raise ValueError(f"z {z} lies off the bus side, {SIDE_PROFILE[0][0]} to {SIDE_PROFILE[-1][0]}")


def skin(kit: Kit, name: str, x0: float, x1: float, z0: float, z1: float, s: int, mat: str, out: float = 0.015, slant: float = 0.0) -> None:
    """A panel on the body side s (1 left, -1 right) from x0 to x1 and z0 up to z1 that follows its lean, standing out by out.

    slant pulls the front end back by that much at z1, for a raked end.
    """
    stations = [z0] + [z for z, _ in SIDE_PROFILE if z0 < z < z1] + [z1]
    pts: list[Vec3] = []
    for z in stations:
        t = (z - z0) / (z1 - z0)
        for x in (min(x0, x1), max(x0, x1) - slant * t):
            pts += [(x, s * (half_at(z) + out), z), (x, s * (half_at(z) - 0.02), z)]
    add_hull(kit, name, pts, mat)


def end_band(kit: Kit, name: str, z0: float, z1: float, out: float, y_max: float, mat: str, sign: int, wrap: float = 0.0, inset: float = 0.0) -> None:
    """A band over the nose (sign 1) or tail (-1) from z0 to z1 that follows its bow and stands out by out.

    y_max limits it across; wrap carries it this far round the corners onto the sides; inset pulls its two ends in.
    """
    pts: list[Vec3] = []
    for z in (z0, z1):
        for grow in (out, -0.02):
            ring = plan_ring(z, FRONT, BACK, SIDE, BULGE, CORNER, grow)
            pts += [p for p in ring if sign * p[0] > 0 and abs(p[1]) <= y_max + 1e-6 and sign * p[0] >= NOSE_END - wrap]
    if inset:
        reach = max(abs(p[1]) for p in pts)
        pts = [(x, y - math.copysign(inset, y) if abs(y) > reach - 1e-6 else y, z) for x, y, z in pts]
    add_hull(kit, name, pts, mat)


def arch_cutter(wx: float, y0: float, y1: float) -> list[Vec3]:
    """A round half disc over a wheel with a box below it, from y0 to y1."""
    pts: list[Vec3] = []
    for y in (y0, y1):
        for k in range(ARCH_SIDES + 1):
            a = math.pi * k / ARCH_SIDES
            pts.append((wx + ARCH_R * math.cos(a), y, HUB_Z + ARCH_R * math.sin(a)))
        pts += [(wx - ARCH_R, y, BODY_BOTTOM - 0.1), (wx + ARCH_R, y, BODY_BOTTOM - 0.1)]
    return pts


def outside_arches(x0: float, x1: float) -> list[tuple[float, float]]:
    """The spans of x0..x1 that keep clear of both flares."""
    reach = ARCH_R + FLARE + 0.02
    spans = [(min(x0, x1), max(x0, x1))]
    for wx in WHEELS_X:
        spans = [piece for lo, hi in spans for piece in ((lo, min(hi, wx - reach)), (max(lo, wx + reach), hi)) if piece[1] - piece[0] > 0.05]
    return spans


def stacked(z0: float, z1: float) -> list[Vec3]:
    return [p for z in (z0, z1) for p in plan_ring(z, FRONT, BACK, SIDE, BULGE, CORNER)]


def body(kit: Kit) -> None:
    """The trim skirt and paint lower body with round arches, the trim belt, the glass window band, the paint cant and roof with the hatch, and the rear roof intake."""
    arches = [arch_cutter(wx, s * WELL_Y, s * (HALF_Y + 0.1)) for wx in WHEELS_X for s in (1, -1)]
    add_hull(kit, "skirt", stacked(BODY_BOTTOM, SKIRT_TOP), "trim", arches)
    add_hull(kit, "lower", stacked(SKIRT_TOP, BELT), "paint", arches)
    add_hull(kit, "belt", stacked(BELT, SILL), "trim")
    for i, wx in enumerate(WHEELS_X):
        flare(kit, f"flare{i}_l", G, wx, HUB_Z, WHEEL_R, SIDE - 0.02, HALF_Y, bottom=BODY_BOTTOM, segments=ARCH_SIDES)
        flare(kit, f"flare{i}_r", G, wx, HUB_Z, WHEEL_R, -HALF_Y, -SIDE + 0.02, bottom=BODY_BOTTOM, segments=ARCH_SIDES)
    top_tip = FRONT - WINDSHIELD_RAKE - 0.02
    band = plan_ring(SILL, FRONT, BACK, SIDE, BULGE, CORNER) + plan_ring(WIN_TOP + PROUD, top_tip, BACK + 0.04, SIDE - TUMBLE, 0.08, top_tip - 0.08 - NOSE_END)
    add_hull(kit, "band", band, "glass")
    lip = [p for z in (VISOR_FOOT, WIN_TOP + 0.04) for p in plan_ring(z, CANT[0][1], BACK, SIDE - TUMBLE, CANT[0][4], CANT[0][5]) if p[0] > NOSE_END - 0.05]
    add_hull(kit, "visor_lip", lip, "paint")
    roof = add_hull(kit, "roof", [p for station in CANT for p in plan_ring(*station)], "paint")
    (x0, y0), (x1, y1) = HATCH
    cut_boxes(roof, [((x0, y0, WIN_TOP - 0.01), (x1, y1, ROOF + 0.1))])
    roof.data.materials.clear()
    roof.data.materials.append(kit._materials["paint"])
    kit.box("bay", (x1 - x0, y1 - y0, BAY_FLOOR - WIN_TOP + 0.06), ((x0 + x1) / 2, (y0 + y1) / 2, (BAY_FLOOR + WIN_TOP - 0.06) / 2), "metal")
    intake = [(x, s * y, z) for s in (1, -1) for x, y, z in (
        (INTAKE_FRONT, INTAKE_HALF, ROOF - 0.02), (INTAKE_FRONT - 0.05, INTAKE_HALF - 0.05, INTAKE_TOP), (BACK + 0.24, INTAKE_HALF - 0.05, INTAKE_TOP), (BACK + 0.08, INTAKE_HALF, ROOF - 0.12))]
    add_hull(kit, "intake", intake, "trim")
    kit.box("intake_grille", (0.02, 2 * INTAKE_HALF - 0.3, INTAKE_TOP - ROOF - 0.03), (INTAKE_FRONT - 0.035, 0, (ROOF + INTAKE_TOP) / 2), "under")


def bays(s: int) -> list[tuple[float, float]]:
    """The window bays on side s from the front, each (x front, x back): six behind the door, and on the left one more over the door's place."""
    door_back = FRONT_DOOR[1]
    step = (door_back - TAIL_END) / BAYS
    rear = [(door_back - step * i, door_back - step * (i + 1)) for i in range(BAYS)]
    return ([(NOSE_END, door_back)] if s == 1 else []) + rear


def windows(kit: Kit) -> None:
    """Paint pillars and transom bars over the glass band, and roof-curve glass over each bay behind the door."""
    for s, tag in ((1, "l"), (-1, "r")):
        edges = sorted({x for bay in bays(s) for x in bay} | {NOSE_END})
        for i, x in enumerate(edges):
            lo, hi = (x - PILLAR_W, x) if x >= NOSE_END - 1e-6 else (x - PILLAR_W / 2, x + PILLAR_W / 2)
            lo, hi = (lo, hi) if x > TAIL_END + 1e-6 else (x, x + PILLAR_W)
            skin(kit, f"pillar{i}_{tag}", lo, hi, SILL - 0.02, WIN_TOP + 0.02, s, "paint")
        for i, (a, b) in enumerate(bays(s)):
            lo, hi = min(a, b), max(a, b)
            lo += PROUD * (abs(lo - TAIL_END) < 1e-6)
            hi -= PROUD * (abs(hi - NOSE_END) < 1e-6)
            skin(kit, f"transom{i}_{tag}", lo, hi, TRANSOM, TRANSOM + 0.045, s, "paint", out=0.012)
            if a <= FRONT_DOOR[1] + 1e-6:
                skin(kit, f"roof_glass{i}_{tag}", b + 0.06, a - 0.06, ROOF_GLASS[0], ROOF_GLASS[1], s, "glass", out=0.012)


def front_door(kit: Kit) -> None:
    """The right front door: two leaves split by a pillar in the glass band, and dark seams down the panel to the rub strip."""
    x1, x0 = FRONT_DOOR
    check_door_gap("front_door", x0, x1, DOOR_BOTTOM, WHEELS_X, HUB_Z, ARCH_R)
    mid = (x0 + x1) / 2
    skin(kit, "door_split", mid - 0.025, mid + 0.025, SILL - 0.02, WIN_TOP + 0.02, -1, "paint")
    for name, x in (("door_seam_front", x1 - 0.14), ("door_seam_mid", mid), ("door_seam_back", x0 + 0.01)):
        skin(kit, name, x - 0.012, x + 0.012, DOOR_BOTTOM, BELT, -1, "under", out=0.02)


def sides(kit: Kit) -> None:
    """The two-line trim side stripe and the dark rub strip along each side, broken by the flares."""
    for s, tag in ((1, "l"), (-1, "r")):
        for j, (lo, hi) in enumerate(outside_arches(TAIL_END, NOSE_END)):
            front = hi >= NOSE_END - 1e-6
            skin(kit, f"stripe{j}_{tag}", lo, hi, SIDE_STRIPE[0], SIDE_STRIPE[1], s, "trim", out=0.022, slant=0.12 if front else 0.0)
            if not front:
                skin(kit, f"line{j}_{tag}", lo, hi, SIDE_LINE[0], SIDE_LINE[1], s, "trim", out=0.022)
            skin(kit, f"rub{j}_{tag}", lo, hi, RUB[0], RUB[1], s, "under", out=0.03)


def front(kit: Kit) -> None:
    """The windshield's center pillar, the visor's route sign and roof lamp, faired headlamps, parking lamps, the moulding bar and the split bumper."""
    foot, top = FRONT - 0.02, FRONT - WINDSHIELD_RAKE - 0.02
    rake = [(foot - 0.03, SILL - 0.02), (foot + 0.012, SILL - 0.02), (top + 0.012, WIN_TOP + 0.02), (top - 0.03, WIN_TOP + 0.02)]
    prism(kit, "pillar_mid", rake, -0.035, 0.035, "paint")
    lip = CANT[1][1]
    dome = CANT[3][1]
    nx, nz = CANT[3][0] - CANT[1][0], lip - dome
    norm = math.hypot(nx, nz)
    nx, nz = nx / norm, nz / norm
    a, b = (lip - 0.03, CANT[1][0] + 0.03), (dome + 0.03, CANT[3][0] - 0.02)
    sign = [(a[0] - 0.02 * nx, a[1] - 0.02 * nz), (b[0] - 0.02 * nx, b[1] - 0.02 * nz), (b[0] + 0.05 * nx, b[1] + 0.05 * nz), (a[0] + 0.05 * nx, a[1] + 0.05 * nz)]
    prism(kit, "route_sign", sign, 0.28, 0.86, "under")
    prism(kit, "route_plate", sign, -0.72, -0.2, "under")
    face = (0, math.pi / 2, 0)
    roof_lamp_r = 0.08
    kit.cylinder("roof_lamp", roof_lamp_r, 0.16, ((lip + dome) / 2 + 0.02, 0.04, (CANT[1][0] + CANT[3][0]) / 2 + 0.03), "light", rot=face, vertices=round_sides(roof_lamp_r))
    for s in (1, -1):
        y = s * LAMP_Y
        face_x = FRONT - BULGE * (LAMP_Y / (SIDE - CORNER)) ** 2
        sides_n = round_sides(LAMP_BULGE)
        ring = [(math.cos(2 * math.pi * k / sides_n), math.sin(2 * math.pi * k / sides_n)) for k in range(sides_n)]
        bulge = [(face_x - 0.06, y + LAMP_BULGE * c, LAMP_Z + LAMP_BULGE * d) for c, d in ring]
        bulge += [(face_x + 0.08, y + (LAMP_R + 0.03) * c, LAMP_Z + (LAMP_R + 0.03) * d) for c, d in ring]
        add_hull(kit, f"lamp_bulge_{s}", bulge, "paint")
        kit.cylinder(f"lamp_{s}", LAMP_R, 0.03, (face_x + 0.085, y, LAMP_Z), "light", rot=face, vertices=round_sides(LAMP_R))
        kit.cylinder(f"parking_{s}", 0.04, 0.03, (face_x + 0.005, s * (LAMP_Y - 0.02), (BUMPER_TOP + SKIRT_TOP) / 2), "light", rot=face, vertices=round_sides(0.04))
    end_band(kit, "moulding", LAMP_Z - 0.115, LAMP_Z - 0.09, 0.015, LAMP_Y - 0.25, "metal", 1)
    for s in (1, -1):
        pts: list[Vec3] = []
        for z in (BODY_BOTTOM, BUMPER_TOP):
            for grow in (0.04, -0.02):
                pts += [(x, math.copysign(min(abs(y), HALF_Y), y), z) for x, y, z in plan_ring(z, FRONT, BACK, SIDE, BULGE, CORNER, grow) if x > NOSE_END - 0.12 and s * y >= -1e-6]
        add_hull(kit, f"bumper_{s}", pts, "paint")
    kit.box("bumper_split", (0.06, 0.03, BUMPER_TOP - BODY_BOTTOM - 0.02), (FRONT + 0.0, -0.12, (BUMPER_TOP + BODY_BOTTOM) / 2), "under")


def rear(kit: Kit) -> None:
    """The rear window's pillar over the closed engine end, the louvered engine lid, tall taillights and the split bumper."""
    prism(kit, "rear_pillar", [(BACK - 0.03, SILL - 0.02), (BACK + 0.04, SILL - 0.02), (BACK + 0.06, WIN_TOP + 0.02), (BACK + 0.0, WIN_TOP + 0.02)], -0.04, 0.04, "paint")
    end_band(kit, "engine_lid", -0.66, -0.06, 0.012, 0.66, "paint", -1)
    for i in range(4):
        z = -0.56 + 0.12 * i
        end_band(kit, f"louver{i}", z, z + 0.05, 0.024, 0.56, "under", -1, inset=PROUD)
    for s in (1, -1):
        y = s * 0.88
        x = BACK + BULGE * (0.88 / (SIDE - CORNER)) ** 2
        kit.box(f"taillight_{s}", (0.06, 0.12, 0.42), (x - 0.01, y, -0.42), "red")
        pts: list[Vec3] = []
        for z in (BODY_BOTTOM, BUMPER_TOP):
            for grow in (0.04, -0.02):
                pts += [(x, math.copysign(min(abs(y), HALF_Y), y), z) for x, y, z in plan_ring(z, FRONT, BACK, SIDE, BULGE, CORNER, grow) if x < TAIL_END + 0.12 and s * y >= -1e-6]
        add_hull(kit, f"rear_bumper_{s}", pts, "paint")


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
    """Raises when the built bus leaves the LAZ size it is cut to."""
    lo, hi = bounds(kit)
    roof = ROOF - GROUND
    if abs(hi.x - lo.x - LENGTH) > 0.01 or abs(hi.y - lo.y - WIDTH) > 0.01 or not ROOF_HEIGHT[0] <= roof <= ROOF_HEIGHT[1]:
        raise RuntimeError(f"base_bus is {hi.x - lo.x:.3f} x {hi.y - lo.y:.3f} m with its roof {roof:.3f} m up, not {LENGTH} x {WIDTH} m and {ROOF_HEIGHT}")
    if lo.z < BODY_BOTTOM - 1e-6:
        raise RuntimeError(f"base_bus reaches {lo.z:.3f} under its body bottom {BODY_BOTTOM}, which would change its collision height and tire")
    sill_share = (SILL - GROUND) / (ROOF - GROUND)
    if abs(sill_share - PHOTO_SILL_SHARE) > 0.02:
        raise RuntimeError(f"the window sill sits at {sill_share:.3f} of the roof height, not photo 2's {PHOTO_SILL_SHARE}")
    if INTAKE_FRONT > G.row_x(10.5) - 0.01:
        raise RuntimeError(f"the roof intake at {INTAKE_FRONT} reaches over the last deck row")


def check_roof_flat() -> None:
    """Raises when the flat roof is narrower than the deck columns need or stops short of the first or last deck row."""
    if ROOF_FLAT < MIN_ROOF_FLAT or ROOF_FRONT < G.row_x(0.5) or ROOF_BACK > G.row_x(10.5):
        raise RuntimeError(f"the flat roof, {ROOF_FLAT} m either side from x {ROOF_BACK:.3f} to {ROOF_FRONT:.3f}, misses deck rows 1 to 10 or is under {MIN_ROOF_FLAT} m")


def check_hatch() -> None:
    """Raises when the hatch leaves the flat roof or misses the engine rows."""
    (x0, y0), (x1, y1) = HATCH
    if x0 > G.row_x(9.5) or x1 < G.row_x(7.5) or y1 >= ROOF_FLAT or x0 < ROOF_BACK:
        raise RuntimeError(f"hatch x {x0:.3f}..{x1:.3f} y {y0:.3f}..{y1:.3f} misses rows 8 and 9 or leaves the roof")


def main() -> None:
    args = parse_args()
    check_hatch()
    check_roof_flat()
    kit = Kit(BASE_COLORS, SEED)
    body(kit)
    windows(kit)
    front_door(kit)
    sides(kit)
    front(kit)
    rear(kit)
    kit.socket("arch_front", (WHEELS_X[0], WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (WHEELS_X[1], WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEELS_X[0], WHEEL_Z, HUB_Z + ARCH_R))
    bay = {(x, y): BAY_FLOOR for x in (3, 4) for y in (8, 9)}
    level_sockets(kit, G, "row", [ROOF] * G.rows, fronts={0: ROOF_FRONT}, cells=bay)
    level_sockets(kit, G, "floor", [FLOOR] * G.rows, cells=bay)
    check_size(kit)
    check_base(kit, "base_bus", G)
    kit.export("base_bus", args, view_size=11.0)


if __name__ == "__main__":
    main()
