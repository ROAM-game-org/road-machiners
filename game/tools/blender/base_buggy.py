"""The buggy base: a tan tube-frame patrol buggy, closed up for the wasteland.

Built from the issue author's photo of a tan military patrol buggy (plate A11 BUG), read from the factory's media folder
and never copied into the repo. The photo looks at the car's front left quarter, about 35 degrees off its side, through a
long lens. Every height is read in tire diameters (D) at the depth of the nearest feature and drawn at one scale, the
0.8 m tire: no other scale and no averaging. Lengths along the car come from the side line with its perspective taken
out, also in D.
Size: 3.9 m long, the grid's length, which is 4.9 D where the photo car is about 4.95 D; 1.94 m across; the roof 1.52 m
over the ground. Ground at z -1.1.
Levels over the ground, in D: cage top 1.9, deck at the cowl 1.37, bull bar top 1.18, lamp centers 0.90, lower rail
0.74, lower nose 0.50, sill frame 0.48 to 0.85, front fender crown 1.25, rear fender crown 1.21, spare top 1.28.
The wheelbase is the photo's 0.667 of the length, so the wheels sit near the corners.
Parts, nose to tail: a trim tube bull bar with a round lamp in a chrome rim and an amber indicator set into it each
side, over a slim pointed lower nose; a full-size spare lying on the nose, tipped down toward the bar; a closed deck
plate that holds the spare low and rises to the cowl; slim plate fenders over the front tires, each on one tube brace;
the trim tube cage, its top rails running from the main hoop forward past the windshield over the deck, where raked
downtubes take them down to the nose; the closed cab inside the cage, glass panes inset behind the tubes over thin
paint door panels, a windshield, a roof plate and a paint bulkhead behind the seats, with a B post and a diagonal
each side; a rectangular mirror on each windshield post; a low tube sill frame between the wheels with a flat mesh
panel and one diagonal brace; deep rounded rear fenders; one round shock body at each wheel; and behind the cab an
open rack as wide as the cab, a tube frame with flat mesh sides and back and a flat paint top for the cargo cells,
standing clear over the rear fenders, with a round extinguisher on its left side. Round parts take round_sides() and
arches ROUND_ARCH_SEGMENTS. Every tube keeps a radius of TUBE_MIN or more, and the cage has at most CAGE_RUNS tubes.
Deviations from the photo: the cab is closed (the committee's closed cabin); the engine is not drawn, since the
game's engines stand 0.44 to 1.6 m tall where the grid's engine cells lie under the spare and the deck, so no deck at
the photo's height covers them and no hole behind a full-size spare holds one (chassis showsEngine is false); the
wheels stay symmetric, so both overhangs are 0.65 m where the photo has 0.76 m in front and 0.58 m behind; the cowl
stands 0.3 m further back than the photo's, so the full-size spare lies flat ahead of it; the rack stands under the
roof where the photo's stands over the cage, so guns on the roof keep short posts; there is no whip antenna, diagonal
rod, registration plate, seat, steering wheel, second lamp pair or slotted rim; mesh and chequer plate are flat panels.
Inferred, since the photo does not show them: the right side (the left mirrored), every cab pane and panel, the rack's
rear face, the tail, the top view and plan widths, and the underside.
Grid: 4 columns by 6 rows over 3.9 m by 1.94 m, stretched by the projection. Half height 0.35 m, from PHYSICS.bodies.buggy.
Wheels sit at x +-1.3, radius 0.4 m, half width 0.145 m, 0.726 m off the center line, mount 0.3 m below the center.
Sockets arch_front, arch_rear and arch_front_top mark the arches for wheelArches.test.ts.
Run: blender --background --python tools/blender/base_buggy.py -- public/models/base_buggy.glb [tmp/base_buggy.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args, round_sides  # noqa: E402
from parts_common_base import ARCH_CLEARANCE, BASE_COLORS, ROUND_ARCH_SEGMENTS, SUSPENSION_REST, Grid, check_base, hull_mesh, level_sockets, surface_z  # noqa: E402
from parts_common_core import drawn_wheel  # noqa: E402
from shapes import prism, strut  # noqa: E402

SEED = 302
COLORS = {
    **BASE_COLORS,
    "chrome": 0xC4C9CC,  # PAL.semi.chrome
    "amber": 0xF2A22C,  # PAL.semi.amber
}
G = Grid(rows=6, cols=4, half_height=0.35)
WHEEL_R = 0.4  # PHYSICS.bodies.buggy.wheelRadius: the tire rule's floor, so the car is 4.9 tire diameters long
WHEEL_HALF_W = 0.145  # PHYSICS.bodies.buggy.wheelHalfWidth: the photo's tire is 0.36 D wide
WHEEL_Z = 0.726  # PHYSICS.bodies.buggy.wheelZ
HUB_Z = -0.3 - SUSPENSION_REST  # PHYSICS.bodies.buggy.wheelY
WHEEL_X = 1.3  # PHYSICS.bodies.buggy.wheelX: the photo's wheelbase, 3.3 D of its 4.95 D
GROUND = HUB_Z - WHEEL_R
D = 2 * WHEEL_R

LENGTH = 3.9
FRONT = LENGTH / 2
BACK = -FRONT
GAME_ROWS = 8  # the buggy's layout rows with its armor ring, as body.ts stretches them over the length
DECK_ROWS = (3, 4)  # the layout rows of its D cells
TUBE = 0.05  # the radius of every cage, bar, sill and rack tube
TUBE_MIN = 0.05  # thinner tubes draw noisy outlines at game zoom
CAGE_RUNS = 22  # the most straight tubes the cage may have before it reads as noise
TIRE_INNER = WHEEL_Z - WHEEL_HALF_W
SIDES = (("l", 1), ("r", -1))


def up(d: float) -> float:
    """Model z of a photo height of d tire diameters over the ground."""
    return GROUND + d * D


BAR_X = FRONT - TUBE - 0.045  # the bull bar's tubes, with room ahead for the lamp rims and indicators
BAR_HALF = 0.74  # the bar's ends, inside the front tires' outer faces
BAR_TOP = up(1.1) - TUBE
BAR_LOW = up(0.74)
BAR_POST = 0.22  # the bar's inner uprights, either side of the plate
LAMP_Z = up(0.90)
LAMP_Y = 0.46
LAMP_R = 0.09  # the photo's lamps are 0.22 D across
NOSE_LOW = up(0.40)

SPARE_TILT = math.radians(15)  # the spare lies tipped down toward the bar, photo
SPARE_HALF_W = 0.16  # a little fuller than the road tire, so it reads as a whole wheel from the side
SPARE_FRONT = BAR_X - TUBE - 0.012  # the spare's front edge leans on the bar
DECK_NOSE = 1.86  # the deck's front edge, behind the bar
DECK_NOSE_Z = up(0.63)  # the deck under the spare, so the spare's top stands 1.3 D up
DECK_BREAK = 0.96  # where the deck turns up from under the spare to the cowl
COWL = 0.66  # the deck's back edge and the windshield's foot
WAIST = up(1.37)  # the deck at the cowl and the top of the door panels
DECK_HALF = 0.52
DECK_THICK = 0.04

CAGE_Y = 0.80  # the cage and sill tubes' center line
CAGE_TOP = up(1.9) - TUBE  # the top rails' center
RAIL_FRONT = 1.12  # the top rails run forward over the deck to here, ahead of the front axle's arch
ROOF_FRONT = 0.58  # the windshield's top
ROOF_BACK = -0.56  # the main hoop's top, just behind the deck rows
HOOP_FOOT = -0.74  # the main hoop's legs rake back to here, photo
B_POST = -0.12  # at the seat backs
ROOF_THICK = 0.04
ROOF_TOP = CAGE_TOP + TUBE - 0.03  # the rails stand proud of the roof
CAB_LOW_HALF = CAGE_Y - TUBE - 0.02  # the glass's half width at the sill
CAB_TOP_HALF = 0.6  # and under the roof, so the glass leans in clear of the tubes; the roof spans the rails for the guns
PANEL = 0.035  # the door panels' and bulkhead's thickness
SILL_TOP = up(0.85)
SILL_LOW = up(0.48) + TUBE
SILL_FRONT = WHEEL_X - WHEEL_R - ARCH_CLEARANCE - TUBE - 0.02
SILL_BACK = -SILL_FRONT

FRONT_FENDER = (0.56, 0.6)  # inner and outer radius: the crown 1.25 D up, a slim plate
REAR_FENDER = (0.47, 0.57)  # the crown 1.21 D up, deep
FENDER_Y = (TIRE_INNER - 0.02, WHEEL_Z + WHEEL_HALF_W + 0.02)

RACK_X = (ROOF_BACK - 0.09, BACK + TUBE + 0.005)  # the rack runs from behind the bulkhead to the tail
RACK_HALF = CAGE_Y - 0.06
RACK_LOW = up(1.36)  # the photo's rack floor, clear over the rear fenders
RACK_TOP = ROOF_TOP - 0.12  # under the roof, so guns on the roof keep short posts; the photo's stands higher


def round_part(kit: Kit, name: str, radius: float, depth: float, loc: tuple[float, float, float], mat: str, rot: tuple[float, float, float] = (0, 0, 0)) -> bpy.types.Object:
    return kit.cylinder(name, radius, depth, loc, mat, rot=rot, vertices=round_sides(radius))


def tube(kit: Kit, name: str, a: tuple[float, float, float], b: tuple[float, float, float], radius: float = TUBE, mat: str = "trim") -> None:
    if radius < TUBE_MIN:
        raise RuntimeError(f"tube {name} has radius {radius:.3f}, under the {TUBE_MIN} that draws clean at game zoom")
    strut(kit, name, a, b, 2 * radius, mat, sides=round_sides(radius))


def band(wx: float, r0: float, r1: float, low: float, x_min: float, x_max: float) -> list[tuple[float, float]]:
    """The XZ outline of a plate arched over one tire between radii r0 and r1, held at or above low and between x_min and x_max."""
    inner, outer = [], []
    for k in range(ROUND_ARCH_SEGMENTS + 1):
        a = math.pi * k / ROUND_ARCH_SEGMENTS
        for r, into in ((r0, inner), (r1, outer)):
            x, z = wx + r * math.cos(a), HUB_Z + r * math.sin(a)
            if x_min <= x <= x_max and z >= low:
                into.append((x, z))
    return outer + list(reversed(inner))


def deck_z(x: float) -> float:
    """Model z of the deck's top face at x: flat under the spare at the spare's tilt, then up to the cowl."""
    if x >= DECK_BREAK:
        return DECK_NOSE_Z + (DECK_NOSE - x) * math.tan(SPARE_TILT)
    low = deck_z(DECK_BREAK)
    return low + (WAIST - low) * (DECK_BREAK - x) / (DECK_BREAK - COWL)


def bull_bar(kit: Kit) -> None:
    """The tube bull bar across the nose: a low rail, end and inner uprights and returns to the deck, open on top so the spare shows, photo."""
    tube(kit, "bar_low", (BAR_X, BAR_HALF, BAR_LOW), (BAR_X, -BAR_HALF, BAR_LOW))
    for s, sy in SIDES:
        tube(kit, f"bar_end_{s}", (BAR_X, sy * BAR_HALF, BAR_LOW), (BAR_X, sy * BAR_HALF, BAR_TOP))
        tube(kit, f"bar_post_{s}", (BAR_X, sy * BAR_POST, BAR_LOW), (BAR_X, sy * BAR_POST, BAR_TOP))
        tube(kit, f"bar_return_{s}", (BAR_X, sy * BAR_HALF, BAR_TOP), (DECK_NOSE - 0.12, sy * (DECK_HALF - TUBE), deck_z(DECK_NOSE - 0.12) + TUBE))


def lamps(kit: Kit) -> None:
    """A round lamp in a chrome rim set into the bar each side, with an amber indicator outboard, photo."""
    along = (0, math.pi / 2, 0)
    for s, sy in SIDES:
        round_part(kit, f"lamp_body_{s}", LAMP_R - 0.01, 0.14, (BAR_X - 0.05, sy * LAMP_Y, LAMP_Z), "metal", along)
        round_part(kit, f"lamp_rim_{s}", LAMP_R, 0.04, (BAR_X + 0.025, sy * LAMP_Y, LAMP_Z), "chrome", along)
        round_part(kit, f"lamp_{s}", LAMP_R - 0.022, 0.02, (BAR_X + 0.025 + 0.01 + 0.01, sy * LAMP_Y, LAMP_Z), "glass", along)
        round_part(kit, f"indicator_{s}", 0.04, 0.05, (BAR_X + TUBE + 0.02, sy * BAR_HALF, BAR_TOP - 0.08), "amber", along)


def nose(kit: Kit) -> None:
    """The slim pointed lower nose under the bar, narrowing to the front, photo."""
    points = []
    for x, half, z0, z1 in ((BAR_X - 0.02, 0.1, NOSE_LOW + 0.08, BAR_LOW - 0.02), (1.55, 0.26, NOSE_LOW, BAR_LOW + 0.04)):
        points += [(x, sy * half, z) for sy in (1, -1) for z in (z0, z1)]
    kit._add(hull_mesh("lower_nose", points), "lower_nose", "paint", 0.0)


def spare_center() -> tuple[float, float]:
    """The spare's center in XZ: its front edge on the bar, its lower face lying on the deck."""
    x = SPARE_FRONT - WHEEL_R * math.cos(SPARE_TILT) - SPARE_HALF_W * math.sin(SPARE_TILT)
    return x, deck_z(x) + SPARE_HALF_W / math.cos(SPARE_TILT) + 0.005


def spare(kit: Kit) -> bpy.types.Object:
    """The road-size spare lying on the nose deck, tipped down toward the bar at the deck's tilt, photo."""
    x, z = spare_center()
    return drawn_wheel(kit, "spare", (x, 0, z), WHEEL_R, 2 * SPARE_HALF_W, rot=(0, SPARE_TILT, 0))


def cheek_outline() -> list[tuple[float, float]]:
    """The XZ outline of the deck's side panel: from under the deck down to the lower nose line, arched clear of the front tire."""
    r = WHEEL_R + ARCH_CLEARANCE + 0.04
    xs = [DECK_NOSE - (DECK_NOSE - COWL) * k / 20 for k in range(21)]
    top = [(x, deck_z(x) - DECK_THICK) for x in xs]
    floor = BAR_LOW

    def low(x: float) -> float:
        dx = x - WHEEL_X
        return max(floor, HUB_Z + math.sqrt(r * r - dx * dx)) if abs(dx) < r else floor

    return top + [(x, min(low(x), deck_z(x) - DECK_THICK - 0.04)) for x in reversed(xs)]


def deck(kit: Kit) -> None:
    """The closed deck: a plate under the spare at its tilt that turns up to the cowl, and its side panels."""
    xs = [DECK_NOSE, DECK_BREAK, COWL]
    for i, (a, b) in enumerate(zip(xs, xs[1:])):
        profile = [(a, deck_z(a)), (b, deck_z(b)), (b, deck_z(b) - DECK_THICK), (a, deck_z(a) - DECK_THICK)]
        prism(kit, f"deck_{i}", profile, -DECK_HALF, DECK_HALF, "paint")
    for s, sy in SIDES:
        prism(kit, f"deck_cheek_{s}", cheek_outline(), sy * (DECK_HALF - DECK_THICK), sy * DECK_HALF, "paint")
    kit.box("deck_front", (DECK_THICK, 2 * DECK_HALF, DECK_NOSE_Z - BAR_LOW), (DECK_NOSE - DECK_THICK / 2, 0, (DECK_NOSE_Z + BAR_LOW) / 2 - 0.01), "paint")


def front_fenders(kit: Kit) -> None:
    """A slim paint plate arched over the top front of each front tire, held by one tube brace, photo."""
    r0, r1 = FRONT_FENDER
    outline = band(WHEEL_X, r0, r1, HUB_Z + 0.32, COWL + 0.1, WHEEL_X + 0.3)
    y0, y1 = TIRE_INNER + 0.01, WHEEL_Z + WHEEL_HALF_W + 0.01
    for s, sy in SIDES:
        prism(kit, f"fender_front_{s}", outline, min(sy * y0, sy * y1), max(sy * y0, sy * y1), "paint")


def fender_braces(kit: Kit) -> None:
    """One tube from under each front fender's back end in to the deck side, photo."""
    r0 = FRONT_FENDER[0]
    a = math.radians(125)
    for s, sy in SIDES:
        tube(kit, f"fender_brace_{s}", (WHEEL_X + r0 * math.cos(a), sy * (FENDER_Y[0] + 0.08), HUB_Z + r0 * math.sin(a) - TUBE), (COWL + 0.12, sy * (DECK_HALF - 0.02), WAIST - 0.3))


def rear_fenders(kit: Kit) -> None:
    """A deep rounded paint plate over each rear tire, down to the hub at both ends, photo."""
    r0, r1 = REAR_FENDER
    outline = band(-WHEEL_X, r0, r1, HUB_Z - 0.02, BACK + 0.04, HOOP_FOOT - TUBE - 0.03)
    for s, sy in SIDES:
        prism(kit, f"fender_rear_{s}", outline, min(sy * FENDER_Y[0], sy * FENDER_Y[1]), max(sy * FENDER_Y[0], sy * FENDER_Y[1]), "paint")


def cage(kit: Kit) -> int:
    """The straight tube cage. Returns its number of runs."""
    runs = 0
    for s, sy in SIDES:
        y = sy * CAGE_Y
        tube(kit, f"cage_rail_{s}", (RAIL_FRONT, y, CAGE_TOP), (ROOF_BACK, y, CAGE_TOP))
        tube(kit, f"cage_down_{s}", (RAIL_FRONT, y, CAGE_TOP), (DECK_NOSE - 0.2, sy * (DECK_HALF - TUBE), deck_z(DECK_NOSE - 0.2) + TUBE))
        tube(kit, f"cage_post_{s}", (COWL + 0.02, y, SILL_TOP), (ROOF_FRONT, y, CAGE_TOP))
        tube(kit, f"cage_hoop_{s}", (HOOP_FOOT, y, SILL_TOP), (ROOF_BACK, y, CAGE_TOP))
        tube(kit, f"cage_b_{s}", (B_POST, y, SILL_TOP), (B_POST, y, CAGE_TOP))
        tube(kit, f"cage_diagonal_{s}", (COWL + 0.02 + (ROOF_FRONT - COWL - 0.02) * (WAIST - SILL_TOP) / (CAGE_TOP - SILL_TOP), y, WAIST), (B_POST, y, CAGE_TOP))
        runs += 6
    for name, x in (("cage_cross_front", RAIL_FRONT), ("cage_cross_roof", ROOF_FRONT), ("cage_cross_rear", ROOF_BACK)):
        tube(kit, name, (x, CAGE_Y, CAGE_TOP), (x, -CAGE_Y, CAGE_TOP))
        runs += 1
    return runs


def post_x(z: float) -> float:
    """The windshield post's x at height z, as it leans back from the sill to the roof."""
    x0 = COWL + 0.02
    return x0 + (ROOF_FRONT - x0) * (z - SILL_TOP) / (CAGE_TOP - SILL_TOP)


def cab_half(z: float) -> float:
    """The cab glass's outer half width at height z: just inside the tubes at the sill, leaning in to the roof plate."""
    low, top = SILL_TOP, ROOF_TOP
    return CAB_LOW_HALF + (CAB_TOP_HALF - CAB_LOW_HALF) * (z - low) / (top - low)


def cab(kit: Kit) -> None:
    """The closed cab inside the cage: glass panes that lean in from the sill to a roof plate set under the rails, a
    windshield, a bulkhead at the seat backs and a floor, so the cage tubes stand clear outside the glass all round.
    Behind the seats the roof runs on to the main hoop over open sides, where the photo's car carries its kit."""
    kit.box("roof", (ROOF_FRONT - ROOF_BACK, 2 * (CAGE_Y - TUBE), ROOF_THICK), ((ROOF_FRONT + ROOF_BACK) / 2, 0, ROOF_TOP - ROOF_THICK / 2), "paint")
    top = ROOF_TOP - ROOF_THICK / 2
    low = SILL_TOP + TUBE / 2
    lean = (cab_half(low) - cab_half(top)) / (top - low)
    for s, sy in SIDES:
        pane = [(post_x(top), top), (B_POST, top), (B_POST, low), (post_x(low), low)]
        outer = cab_half(0.0)
        prism(kit, f"pane_{s}", pane, min(sy * outer, sy * (outer - 0.02)), max(sy * outer, sy * (outer - 0.02)), "glass", lean=sy * lean)
    bulk_top = ROOF_TOP - ROOF_THICK
    bulk = [(B_POST + dx, sy * (cab_half(z) - 0.01), z) for z in (bulk_top, SILL_LOW) for dx in (PANEL / 2, -PANEL / 2) for sy in (1, -1)]
    kit._add(hull_mesh("bulkhead", bulk), "bulkhead", "paint", 0.0)
    points = [(post_x(z) - 0.03 + dx, sy * (cab_half(z) - 0.03), z) for z in (WAIST - 0.02, top) for dx in (0.0, 0.025) for sy in (1, -1)]
    kit._add(hull_mesh("windshield", points), "windshield", "glass", 0.0)
    kit.box("firewall", (PANEL, 2 * cab_half(WAIST), WAIST - SILL_LOW), (COWL + 0.02 - PANEL / 2, 0, (WAIST + SILL_LOW) / 2 - 0.005), "paint")
    kit.box("floor", (COWL - HOOP_FOOT, 2 * (CAGE_Y - TUBE), 0.06), ((COWL + HOOP_FOOT) / 2, 0, SILL_LOW - TUBE + 0.03), "under")


def mirrors(kit: Kit) -> None:
    """A rectangular mirror on an arm out from each windshield post, photo."""
    z = WAIST + 0.12
    x = post_x(z)
    for s, sy in SIDES:
        kit.box(f"mirror_arm_{s}", (0.05, 0.06, 0.05), (x, sy * (CAGE_Y + TUBE + 0.02), z), "trim")
        kit.box(f"mirror_{s}", (0.04, 0.1, 0.17), (x - 0.01, sy * (CAGE_Y + TUBE + 0.05), z + 0.03), "metal_light")


def sill(kit: Kit) -> None:
    """The low tube sill frame between the wheels."""
    for s, sy in SIDES:
        y = sy * CAGE_Y
        tube(kit, f"sill_top_{s}", (SILL_FRONT, y, SILL_TOP), (SILL_BACK, y, SILL_TOP))
        tube(kit, f"sill_low_{s}", (SILL_FRONT, y, SILL_LOW), (SILL_BACK, y, SILL_LOW))
        tube(kit, f"sill_front_{s}", (SILL_FRONT, y, SILL_LOW), (SILL_FRONT, y, SILL_TOP))
        tube(kit, f"sill_back_{s}", (SILL_BACK, y, SILL_LOW), (SILL_BACK, y, SILL_TOP))


def sill_mesh(kit: Kit) -> None:
    """A flat mesh panel set inside each sill frame and one diagonal brace across it, photo."""
    for s, sy in SIDES:
        y = sy * CAGE_Y
        tube(kit, f"sill_brace_{s}", (SILL_FRONT, y, SILL_LOW), (B_POST, y, SILL_TOP))
        kit.box(f"sill_mesh_{s}", (SILL_FRONT - SILL_BACK, 0.02, SILL_TOP - SILL_LOW), (0, sy * (CAGE_Y - 0.02), (SILL_TOP + SILL_LOW) / 2), "metal_light")


def shocks(kit: Kit) -> None:
    """One round shock body per wheel, inboard of the tire, from the hub up to the body, photo."""
    y = TIRE_INNER - ARCH_CLEARANCE - 0.06
    for wx, name, top in ((WHEEL_X, "front", deck_z(WHEEL_X) - DECK_THICK), (-WHEEL_X, "rear", RACK_LOW)):
        out = math.copysign(1, wx)
        for s, sy in SIDES:
            tube(kit, f"shock_{name}_{s}", (wx + 0.14 * out, sy * y, HUB_Z + 0.05), (wx + 0.02 * out, sy * y, top), 0.05, "metal")


def rack(kit: Kit) -> None:
    """The open rack behind the cab: a tube frame as wide as the cab, a flat mesh top and an under floor, clear over the rear fenders."""
    x0, x1 = RACK_X
    y = RACK_HALF
    kit.box("rack_top", (x0 - x1, 2 * (y - TUBE), 0.04), ((x0 + x1) / 2, 0, RACK_TOP - 0.02), "metal_light")
    kit.box("rack_floor", (x0 - x1, 2 * (y - TUBE), 0.04), ((x0 + x1) / 2, 0, RACK_LOW + 0.02), "under")
    corners = [(x, sy * y) for x in (x0, x1) for sy in (1, -1)]
    for i, (x, cy) in enumerate(corners):
        tube(kit, f"rack_post_{i}", (x, cy, RACK_LOW), (x, cy, RACK_TOP))
    for i, (a, b) in enumerate(((corners[0], corners[2]), (corners[1], corners[3]), (corners[0], corners[1]), (corners[2], corners[3]))):
        tube(kit, f"rack_rim_{i}", (a[0], a[1], RACK_TOP), (b[0], b[1], RACK_TOP))
        tube(kit, f"rack_base_{i}", (a[0], a[1], RACK_LOW), (b[0], b[1], RACK_LOW))
    for s, sy in SIDES:
        tube(kit, f"rack_leg_{s}", (x1 + 0.25, sy * (TIRE_INNER - ARCH_CLEARANCE - 0.08), up(0.62)), (x1 + 0.25, sy * (TIRE_INNER - ARCH_CLEARANCE - 0.08), RACK_LOW))


def rack_mesh(kit: Kit) -> None:
    """Flat mesh sides and back inside the rack frame, and a round extinguisher on its left side, photo."""
    x0, x1 = RACK_X
    y = RACK_HALF
    tall = RACK_TOP - RACK_LOW - 2 * TUBE
    mid = (RACK_TOP + RACK_LOW) / 2
    for s, sy in SIDES:
        tube(kit, f"rack_mid_{s}", ((x0 + x1) / 2, sy * y, RACK_LOW), ((x0 + x1) / 2, sy * y, RACK_TOP))
        kit.box(f"rack_mesh_{s}", (x0 - x1, 0.02, tall), ((x0 + x1) / 2, sy * (y - 0.02), mid), "metal_light")
    kit.box("rack_mesh_back", (0.02, 2 * y, tall), (x1 + 0.02, 0, mid), "metal_light")
    r = 0.065
    ex_x = (x0 + x1) / 2 - 0.25
    round_part(kit, "extinguisher", r, RACK_TOP - RACK_LOW - 0.08, (ex_x, y + TUBE + r, mid), "metal")
    kit.box("extinguisher_strap", (0.05, TUBE + 0.02, 0.04), (ex_x, y + TUBE / 2 + 0.01, mid), "trim")


def tail(kit: Kit) -> None:
    """Inferred: the dark tub under the rack between the rear tires with its taillights, and the spine under the cab."""
    low = up(0.62)
    half = TIRE_INNER - ARCH_CLEARANCE - 0.02
    x0, x1 = HOOP_FOOT - 0.06, RACK_X[1] + 0.02
    kit.box("rear_tub", (x0 - x1, 2 * half, RACK_LOW - low), ((x0 + x1) / 2, 0, (RACK_LOW + low) / 2), "under")
    for s, sy in SIDES:
        round_part(kit, f"taillight_{s}", 0.045, 0.04, (x1 - 0.01, sy * 0.36, RACK_LOW - 0.12), "red", (0, math.pi / 2, 0))


def deck_x() -> tuple[float, float]:
    """The span along the truck of the D rows, as body.ts projects the layout over the length."""
    step = LENGTH / GAME_ROWS
    return FRONT - (DECK_ROWS[1] + 1) * step, FRONT - DECK_ROWS[0] * step


def vertices(objs: list[bpy.types.Object]) -> list[Vector]:
    bpy.context.view_layer.update()
    return [o.matrix_world @ v.co for o in objs for v in o.data.vertices]


def check_buggy(kit: Kit, runs: int) -> None:
    """Raises when the cage has too many runs, the roof misses a deck row, anything stands over the roof, the spare
    is not road size or not lying on the nose ahead of the cowl, the car is not near the photo's length in tire
    diameters, or a tire comes within the arch clearance of the body."""
    if runs > CAGE_RUNS:
        raise RuntimeError(f"the cage has {runs} runs, over the {CAGE_RUNS} that read clean at game zoom")
    x0, x1 = deck_x()
    if ROOF_BACK > x0 or ROOF_FRONT < x1:
        raise RuntimeError(f"the roof {ROOF_BACK:.2f}..{ROOF_FRONT:.2f} does not cover the deck rows {x0:.2f}..{x1:.2f}")
    top = max(p.z for p in vertices(kit._parts) if p.x < x0 or p.x > x1)
    if top > CAGE_TOP + TUBE + 1e-4:
        raise RuntimeError(f"a part off the deck rows stands at z {top:.3f}, over the roof rails at {CAGE_TOP + TUBE:.3f}")
    spare_pts = vertices([o for o in kit._parts if o.name.startswith("spare")])
    span = max(p.x for p in spare_pts) - min(p.x for p in spare_pts)
    if span < 2 * WHEEL_R * math.cos(SPARE_TILT) or min(p.x for p in spare_pts) < COWL:
        raise RuntimeError(f"the spare spans {span:.2f} m from x {min(p.x for p in spare_pts):.2f}: not a road wheel lying ahead of the cowl")
    if abs(LENGTH / D / 4.95 - 1) > 0.08:
        raise RuntimeError(f"the car is {LENGTH / D:.2f} tire diameters long, over 8% off the photo's 4.95")
    body = [o for o in kit._parts if not o.name.startswith("spare")]
    near = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    trees = [(o.name, BVHTree.FromObject(o, depsgraph)) for o in body]
    for wx in (WHEEL_X, -WHEEL_X):
        for sy in (1, -1):
            for y in (TIRE_INNER, WHEEL_Z, WHEEL_Z + WHEEL_HALF_W):
                for k in range(48):
                    a = math.tau * k / 48
                    p = Vector((wx + WHEEL_R * math.cos(a), sy * y, HUB_Z + WHEEL_R * math.sin(a)))
                    for name, tree in trees:
                        hit = tree.find_nearest(p)
                        if hit[0] is not None and hit[3] < ARCH_CLEARANCE - 0.015:
                            near.append(f"{name} {p.x:.2f},{p.y:.2f},{p.z:.2f}: {hit[3]:.3f}")
    if near:
        raise RuntimeError(f"tires come within the arch clearance of the body at {near[:6]}")


def arch_sockets(kit: Kit) -> None:
    kit.socket("arch_front", (WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (-WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEEL_X, WHEEL_Z, HUB_Z + WHEEL_R + ARCH_CLEARANCE))


def blockout(kit: Kit) -> int:
    """The primary masses the photo's silhouette reads by: bar, nose, spare, deck, fenders, cage, cab, sill, rack and tail."""
    bull_bar(kit)
    nose(kit)
    spare(kit)
    deck(kit)
    front_fenders(kit)
    rear_fenders(kit)
    runs = cage(kit)
    cab(kit)
    sill(kit)
    rack(kit)
    tail(kit)
    return runs


def details(kit: Kit) -> None:
    """The parts that go on once the silhouette matches: lamps, braces, mirrors, mesh, shocks and the extinguisher."""
    lamps(kit)
    fender_braces(kit)
    mirrors(kit)
    sill_mesh(kit)
    shocks(kit)
    rack_mesh(kit)


ENGINE_FLOOR = -0.6  # PHYSICS.bodies.buggy.engine.y, under the closed deck; the view does not draw the engine


def main() -> None:
    args = parse_args()
    kit = Kit(COLORS, SEED)
    runs = blockout(kit)
    details(kit)
    check_buggy(kit, runs)
    arch_sockets(kit)
    bay = {(x, y): ENGINE_FLOOR for x in (1, 2) for y in (0, 1)}
    level_sockets(kit, G, "row", [surface_z(G, 1, y) for y in range(G.rows)], cells=bay)
    level_sockets(kit, G, "floor", [ENGINE_FLOOR] * 2 + [SILL_LOW] * 4)
    check_base(kit, "base_buggy", G)
    kit.export("base_buggy", args, view_size=5.0)


if __name__ == "__main__":
    main()
