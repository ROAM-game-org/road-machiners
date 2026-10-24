"""The buggy base: a tan tube-frame patrol buggy, closed up for the wasteland.

Built from the issue author's photo of a tan military patrol buggy, read from the factory's media folder and never
copied into the repo. The photo looks at the car's front left quarter, about 28 degrees off the side, so heights come
from it in tire diameters (D) at the depth of the nearest wheel, and lengths as shares of the car's length.
The photo car is about 5.5 D long and the model 3.9 D, so a height read in D alone stands the cab too tall over a short
car, and one scaled with the length alone sinks the body into the stock tires. photo() takes the mean of the two for
everything above the fenders; the fenders keep their crowns in D, since they follow the tires.
Size: 3.9 m long, the grid's length, 1.9 m across the fenders, the roof 1.76 m over the ground. Ground at z -1.1.
Levels over the ground: cage top 1.72, deck at the cowl 1.27, bull bar top 1.04, lamp centers 0.89, lower rail 0.76,
lower nose 0.53, sill frame 0.47 to 0.84, front fender crown 1.22, rear fender crown 1.28, rack top 1.58.
The wheelbase is the photo's 0.557 of the length.
Parts, nose to tail: a trim tube bull bar with two round lamps in chrome rims and amber indicators set into it, over a
slim pointed lower nose; a spare wheel standing behind the bar; a sloped deck plate rising to the cowl, with the engine
in a hole framed by deck on every side over a bay floor at PHYSICS.bodies.buggy.engine; plain plate fenders arched over
the front tires, each on one tube brace; the straight trim tube cage, its front posts leaning forward like the photo's
front bow, closed by a flat roof plate on its top, side panels with one dark slit window each, a dark windshield and a
rear panel, every tube standing clear of the panels, with a diagonal door bar under each slit; a rectangular mirror on each front post; a low
tube sill frame between the wheels with a flat mesh panel and one diagonal brace; deep rounded rear fenders; one round
shock body at each wheel; and behind the cab a rack with flat mesh sides in tube frames, a flat top for the cargo cells,
a tube rim for a grab hoop and a round extinguisher on its left side. Round parts take round_sides() and arches
ROUND_ARCH_SEGMENTS. Tubes keep a radius of at least TUBE_MIN.
Deviations from the photo: the cab is closed (the committee's closed cabin); the engine shows in the deck, where the
grid's engine cells lie, not at the tail; the wheels stay symmetric, so both overhangs are 0.86 m where the photo has a
long nose and a short tail; the model is about 3.9 D long where the photo car is about 5.5 D, since heights follow the
stock tire; the roof plate stops at the cowl, so the photo's cage top that runs on over the deck is cut back and the
engine hole stays open; the rack and its rim stand under the roof, where the photo's stand over the cage; the spare is
0.6 m across and stands steep so it stays ahead of the engine hole; there is no whip antenna, diagonal rod or
registration plate; mesh and chequer plate are flat panels; the fenders are plain plates.
Inferred, since the photo does not show them: the right side (the left mirrored), the windshield and cab panels, the
rack's rear face, the tail, the top view and plan widths, and the underside.
Grid: 4 columns by 6 rows over 3.9 m by 1.94 m, stretched by the projection. Half height 0.35 m, from PHYSICS.bodies.buggy.
Wheels sit at x +-1.09, radius 0.5 m, half width 0.22 m, 0.726 m off the center line, mount 0.2 m below the center.
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
from parts_common_base import ARCH_CLEARANCE, BASE_COLORS, ROUND_ARCH_SEGMENTS, SUSPENSION_REST, Grid, check_base, cut_boxes, hull_mesh, level_sockets, surface_z  # noqa: E402
from parts_common_core import drawn_wheel  # noqa: E402
from shapes import prism, strut  # noqa: E402

SEED = 302
COLORS = {
    **BASE_COLORS,
    "chrome": 0xC4C9CC,  # PAL.semi.chrome
    "amber": 0xF2A22C,  # PAL.semi.amber
}
G = Grid(rows=6, cols=4, half_height=0.35)
WHEEL_R = 0.5  # PHYSICS.bodies.buggy.wheelRadius
WHEEL_HALF_W = 0.22  # PHYSICS.bodies.buggy.wheelHalfWidth
WHEEL_Z = 0.726  # PHYSICS.bodies.buggy.wheelZ
HUB_Z = -0.2 - SUSPENSION_REST  # PHYSICS.bodies.buggy.wheelY
WHEEL_X = 1.09  # PHYSICS.bodies.buggy.wheelX: the photo's wheelbase, 0.557 of the length
ARCH_R = WHEEL_R + ARCH_CLEARANCE
GROUND = HUB_Z - WHEEL_R

LENGTH = 3.9
FRONT = LENGTH / 2
BACK = -FRONT
GAME_ROWS = 8  # the buggy's layout rows with its armor ring, as body.ts stretches them over the length
DECK_ROWS = (3, 4)  # the layout rows of its D cells
TUBE = 0.045  # the radius of every cage, bar, sill and rack tube
TUBE_MIN = 0.04  # thinner tubes draw noisy outlines at game zoom
TIRE_INNER = WHEEL_Z - WHEEL_HALF_W  # the inner face of every tire
SIDES = (("l", 1), ("r", -1))

ENGINE_X = 1.0  # PHYSICS.bodies.buggy.engine.x, over the E cells
ENGINE_HALF = (0.49, 0.39)  # the drawn engine footprint over the E cells, along and across
HOLE = (ENGINE_X - ENGINE_HALF[0] - 0.02, ENGINE_X + ENGINE_HALF[0] + 0.03, ENGINE_HALF[1] + 0.02)  # back, front, half width
FLOOR = -0.35  # PHYSICS.bodies.buggy.engine.y: the bay floor
LIP = 0.04  # the least deck left round the engine hole, and between the hole and the spare


def up(h: float) -> float:
    """Model z of a height h over the ground."""
    return GROUND + h


def photo(d: float) -> float:
    """Model z of a photo height of d tire diameters above the fenders: the mean of d on the stock 1.0 m tire and of d
    scaled with the length, 3.9 m of the photo car's 4.4 m on its 0.8 m tire, lifted by the radius the stock tire gains."""
    return up((d + 0.5 + (0.8 * d - 0.4) * 0.89) / 2)


BAR_X = FRONT - TUBE - 0.005  # the bull bar's tubes at the nose
BAR_HALF = 0.74  # the bar's ends, inside the front tires' outer faces, photo
BAR_TOP = photo(1.13) - TUBE  # photo P6
BAR_LOW = photo(0.80)  # photo P6
LAMP_Z = photo(0.96)  # photo P6
LAMP_Y = 0.45
LAMP_R = 0.12  # the photo's lamps anchor the nose; drawn a little larger than its 0.17 D so they read at game zoom
NOSE_LOW = photo(0.54)  # photo P7
SPARE_R = 0.3
SPARE_FOOT = photo(1.31) - 2 * SPARE_R  # the spare's top, photo P9

COWL = 0.4  # the deck's back edge and the windshield's foot, 0.32 of the wheelbase behind the front axle, photo P11
COWL_Z = photo(1.40)  # photo P5
DECK_FRONT = 1.6  # the deck's front edge behind the spare, inferred
DECK_FRONT_Z = photo(1.16)
DECK_HALF = 0.56
DECK_THICK = 0.05

CAGE_Y = 0.79  # the cage and sill tubes' center line, over the sill
CAGE_TOP = photo(1.92) - TUBE  # photo P1: the cage top
ROOF_FRONT = 0.55  # the front cross tube; the posts lean forward from the cowl like the photo's front bow
REAR_POST = -0.5  # the rear posts, just behind the deck rows
ROOF_THICK = 0.04
ROOF_TOP = CAGE_TOP + TUBE + ROOF_THICK
SILL_TOP = photo(0.90)  # photo P8
SILL_LOW = photo(0.47) + TUBE  # photo P8
SILL_X = 0.42  # the sill frame's ends, clear of the tires
PANEL = 0.05  # the cab panels' thickness; their outer face stands a tube radius inside the tubes' center line, so every tube stands clear
SLIT = (CAGE_TOP - 0.3, CAGE_TOP - 0.18)  # the slit window's bottom and top, inferred
SLIT_X = (0.33, -0.38)

FRONT_FENDER = (WHEEL_R + 0.16, WHEEL_R + 0.22)  # inner and outer radius: photo P4, the crown 1.22 D up
REAR_FENDER = (WHEEL_R + 0.12, WHEEL_R + 0.28)  # photo P3, the crown 1.28 D up, deep
FENDER_Y = (DECK_HALF + 0.06, 0.95)

RACK_X = (REAR_POST - 0.12, BACK + TUBE + 0.005)  # the rack runs from behind the cab to the tail, photo P12
RACK_HALF = 0.52
RACK_LOW = up(1.12)
RACK_TOP = ROOF_TOP - 0.18  # under the roof, so guns on the roof keep short posts; the photo's rack stands higher


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


def bull_bar(kit: Kit) -> None:
    """The tube bull bar across the nose, with two round lamps in chrome rims set into it and amber indicators outboard, photo."""
    for name, z in (("bar_top", BAR_TOP), ("bar_low", BAR_LOW)):
        tube(kit, name, (BAR_X, BAR_HALF, z), (BAR_X, -BAR_HALF, z))
    along = (0, math.pi / 2, 0)
    for s, sy in SIDES:
        tube(kit, f"bar_end_{s}", (BAR_X, sy * BAR_HALF, BAR_LOW), (BAR_X, sy * BAR_HALF, BAR_TOP))
        tube(kit, f"bar_post_{s}", (BAR_X, sy * 0.2, BAR_LOW), (BAR_X, sy * 0.2, BAR_TOP))
        tube(kit, f"bar_return_{s}", (BAR_X, sy * BAR_HALF, BAR_TOP), (DECK_FRONT + 0.02, sy * (DECK_HALF - 0.06), DECK_FRONT_Z - 0.03))
        round_part(kit, f"lamp_body_{s}", LAMP_R - 0.01, 0.16, (BAR_X - 0.05, sy * LAMP_Y, LAMP_Z), "metal", along)
        round_part(kit, f"lamp_rim_{s}", LAMP_R, 0.04, (BAR_X + 0.03, sy * LAMP_Y, LAMP_Z), "chrome", along)
        round_part(kit, f"lamp_{s}", LAMP_R - 0.025, 0.02, (BAR_X + 0.035, sy * LAMP_Y, LAMP_Z), "glass", along)
        round_part(kit, f"indicator_{s}", 0.045, 0.06, (BAR_X + 0.01, sy * 0.64, BAR_TOP - 0.1), "amber", along)


def nose(kit: Kit) -> None:
    """The slim pointed lower nose under the bar, narrowing to the front, photo."""
    points = []
    for x, half, z0, z1 in ((BAR_X - 0.02, 0.16, photo(0.62), BAR_LOW + 0.02), (1.45, 0.34, NOSE_LOW, SPARE_FOOT - 0.04)):
        points += [(x, sy * half, z) for sy in (1, -1) for z in (z0, z1)]
    kit._add(hull_mesh("lower_nose", points), "lower_nose", "paint", 0.0)


def spare(kit: Kit) -> bpy.types.Object:
    """The spare wheel standing behind the bar, its face tipped up and back a little, wholly ahead of the engine hole."""
    radius, width, lean = SPARE_R, 0.18, math.radians(10)
    x = BAR_X - TUBE - radius * math.sin(lean) - width / 2 * math.cos(lean) - 0.005
    z = SPARE_FOOT + radius * math.cos(lean)
    tire = drawn_wheel(kit, "spare", (x, 0, z), radius, width, rot=(0, math.pi / 2 - lean, 0))
    kit.box("spare_tray", (0.3, 0.3, 0.04), (x, 0, SPARE_FOOT - 0.02), "under")
    return tire


def deck_z(x: float) -> float:
    """Model z of the deck's top face at x."""
    return DECK_FRONT_Z + (COWL_Z - DECK_FRONT_Z) * (DECK_FRONT - x) / (DECK_FRONT - COWL)


def cheek_outline() -> list[tuple[float, float]]:
    """The XZ outline of the deck's side panel: from under the deck down to the bay floor, arched clear over the front tire, photo."""
    r = ARCH_R + 0.03
    xs = [DECK_FRONT - (DECK_FRONT - COWL) * k / 16 for k in range(17)]
    top = [(x, deck_z(x) - DECK_THICK) for x in xs]
    low = [(x, max(FLOOR, HUB_Z + math.sqrt(max(0.0, r * r - (x - WHEEL_X) ** 2)) if abs(x - WHEEL_X) < r else FLOOR)) for x in reversed(xs)]
    return top + low


def deck(kit: Kit) -> None:
    """The sloped deck plate from behind the spare up to the cowl, with the engine hole, and the dark bay under it."""
    profile = [(DECK_FRONT, DECK_FRONT_Z), (COWL, COWL_Z), (COWL, COWL_Z - DECK_THICK), (DECK_FRONT, DECK_FRONT_Z - DECK_THICK)]
    plate = prism(kit, "deck", profile, -DECK_HALF, DECK_HALF, "paint")
    back, front, half = HOLE
    cut_boxes(plate, [((back, -half, FLOOR), (front, half, up(2.0)))])
    wall = 0.03
    kit.box("bay_floor", (front - back + 2 * wall, 2 * half + 2 * wall, 0.04), ((front + back) / 2, 0, FLOOR - 0.02), "metal")
    for s, sy in SIDES:
        top = [(x, deck_z(x) - DECK_THICK) for x in (front, back)]
        prism(kit, f"bay_wall_{s}", [(front, FLOOR), (back, FLOOR), *reversed(top)], sy * half, sy * (half + wall), "metal_dark")
    for s, sy in SIDES:
        prism(kit, f"deck_cheek_{s}", cheek_outline(), sy * (DECK_HALF - DECK_THICK), sy * DECK_HALF, "paint")
    for name, x in (("bay_front", front + wall / 2), ("bay_back", back - wall / 2)):
        z = deck_z(x) - DECK_THICK
        kit.box(name, (wall, 2 * half + 2 * wall, z - FLOOR), (x, 0, (z + FLOOR) / 2), "metal_dark")


def front_fenders(kit: Kit) -> None:
    """A plain paint plate arched over each front tire, held by one tube brace, photo."""
    r0, r1 = FRONT_FENDER
    outline = band(WHEEL_X, r0, r1, HUB_Z + 0.3, SILL_X + 0.12, BAR_X - 0.1)
    for s, sy in SIDES:
        prism(kit, f"fender_front_{s}", outline, sy * FENDER_Y[0], sy * FENDER_Y[1], "paint")
        tube(kit, f"fender_brace_{s}", (WHEEL_X - 0.3, sy * (FENDER_Y[0] + 0.06), HUB_Z + r0 * 0.95 - TUBE), (SILL_X + 0.06, sy * (DECK_HALF - 0.1), up(0.62)))


def rear_fenders(kit: Kit) -> None:
    """A deep rounded paint plate over each rear tire, from behind the cab to the tail, photo."""
    r0, r1 = REAR_FENDER
    outline = band(-WHEEL_X, r0, r1, HUB_Z - 0.08, BACK + 0.06, REAR_POST - TUBE - 0.06)
    for s, sy in SIDES:
        prism(kit, f"fender_rear_{s}", outline, sy * FENDER_Y[0], sy * FENDER_Y[1], "paint")


def cage(kit: Kit) -> None:
    """The straight tube cage: the top rails and cross tubes under the roof, forward-leaning front posts and upright rear posts."""
    for s, sy in SIDES:
        tube(kit, f"cage_rail_{s}", (ROOF_FRONT, sy * CAGE_Y, CAGE_TOP), (REAR_POST, sy * CAGE_Y, CAGE_TOP))
        tube(kit, f"cage_front_{s}", (SILL_X, sy * CAGE_Y, SILL_TOP), (ROOF_FRONT, sy * CAGE_Y, CAGE_TOP))
        tube(kit, f"cage_rear_{s}", (REAR_POST, sy * CAGE_Y, SILL_TOP), (REAR_POST, sy * CAGE_Y, CAGE_TOP))
        tube(kit, f"cage_stay_{s}", (REAR_POST, sy * CAGE_Y, CAGE_TOP), (RACK_X[0], sy * RACK_HALF, RACK_LOW))
    for name, x in (("cage_cross_front", ROOF_FRONT), ("cage_cross_rear", REAR_POST)):
        tube(kit, name, (x, CAGE_Y, CAGE_TOP), (x, -CAGE_Y, CAGE_TOP))


def post_x(z: float) -> float:
    """The front post's x at height z, as it leans forward from the sill to the roof."""
    return SILL_X + (ROOF_FRONT - SILL_X) * (z - SILL_TOP) / (CAGE_TOP - SILL_TOP)


def cab(kit: Kit) -> None:
    """The closed cab: a flat roof plate on the cage, side panels with one slit window each, a rear panel, a windshield and a floor."""
    kit.box("roof", (ROOF_FRONT - REAR_POST + 2 * TUBE, 2 * (CAGE_Y + TUBE), ROOF_THICK), ((ROOF_FRONT + REAR_POST) / 2, 0, ROOF_TOP - ROOF_THICK / 2), "paint")
    lo, hi = SLIT
    front_x, back_x = SLIT_X
    pieces = {
        "low": [(post_x(lo), lo), (REAR_POST, lo), (REAR_POST, SILL_TOP), (SILL_X, SILL_TOP)],
        "high": [(post_x(CAGE_TOP), CAGE_TOP), (REAR_POST, CAGE_TOP), (REAR_POST, hi), (post_x(hi), hi)],
        "front": [(post_x(hi), hi), (front_x, hi), (front_x, lo), (post_x(lo), lo)],
        "back": [(back_x, hi), (REAR_POST, hi), (REAR_POST, lo), (back_x, lo)],
    }
    for s, sy in SIDES:
        outer = sy * (CAGE_Y - TUBE)
        inner = sy * (CAGE_Y - TUBE - PANEL)
        for part, outline in pieces.items():
            prism(kit, f"panel_{part}_{s}", outline, min(inner, outer), max(inner, outer), "paint")
        glass_y = sy * (CAGE_Y - TUBE - 0.03)
        tube(kit, f"door_bar_{s}", (post_x(SILL_TOP) - 0.02, sy * CAGE_Y, SILL_TOP), (REAR_POST, sy * CAGE_Y, lo - 0.06))
        kit.box(f"slit_{s}", (front_x - back_x, 0.02, hi - lo), ((front_x + back_x) / 2, glass_y, (hi + lo) / 2), "glass")
    kit.box("rear_panel", (PANEL, 2 * (CAGE_Y - TUBE), CAGE_TOP - SILL_LOW), (REAR_POST + PANEL / 2, 0, (CAGE_TOP + SILL_LOW) / 2), "paint")
    kit.box("firewall", (PANEL, 2 * (CAGE_Y - TUBE - PANEL), COWL_Z - SILL_LOW), (COWL - PANEL / 2, 0, (COWL_Z + SILL_LOW) / 2), "paint")
    glass_half = CAGE_Y - TUBE - PANEL
    points = [(x + dx, sy * glass_half, z) for x, z in ((COWL, COWL_Z), (ROOF_FRONT, CAGE_TOP)) for dx in (-0.03, 0.0) for sy in (1, -1)]
    kit._add(hull_mesh("windshield", points), "windshield", "glass", 0.0)
    kit.box("floor", (COWL - REAR_POST, 2 * (CAGE_Y - TUBE - PANEL), 0.12), ((COWL + REAR_POST) / 2, 0, SILL_LOW - TUBE + 0.06), "under")


def mirrors(kit: Kit) -> None:
    """A rectangular mirror on an arm out from each front post, photo."""
    z = sum(SLIT) / 2
    x = post_x(z)
    for s, sy in SIDES:
        kit.box(f"mirror_arm_{s}", (0.05, 0.08, 0.05), (x, sy * (CAGE_Y + TUBE + 0.03), z), "trim")
        kit.box(f"mirror_{s}", (0.04, 0.12, 0.2), (x - 0.01, sy * (CAGE_Y + TUBE + 0.07), z + 0.02), "metal_light")


def sill(kit: Kit) -> None:
    """The low tube sill frame between the wheels, with a flat mesh panel set flush inside it and one diagonal brace, photo."""
    for s, sy in SIDES:
        y = sy * CAGE_Y
        tube(kit, f"sill_top_{s}", (SILL_X, y, SILL_TOP), (REAR_POST, y, SILL_TOP))
        tube(kit, f"sill_low_{s}", (SILL_X, y, SILL_LOW), (-SILL_X, y, SILL_LOW))
        tube(kit, f"sill_front_{s}", (SILL_X, y, SILL_LOW), (SILL_X, y, SILL_TOP))
        tube(kit, f"sill_back_{s}", (-SILL_X, y, SILL_LOW), (-SILL_X, y, SILL_TOP))
        tube(kit, f"sill_brace_{s}", (SILL_X, y, SILL_LOW), (-SILL_X, y, SILL_TOP))
        kit.box(f"sill_mesh_{s}", (2 * SILL_X, 0.02, SILL_TOP - SILL_LOW), (0, sy * (CAGE_Y - 0.01), (SILL_TOP + SILL_LOW) / 2), "metal")


def shocks(kit: Kit) -> None:
    """One round shock body per wheel, inboard of the tire, from the hub up to the body, photo; no spring coils."""
    y = TIRE_INNER - ARCH_CLEARANCE - 0.06
    for wx, name, top in ((WHEEL_X, "front", up(1.0)), (-WHEEL_X, "rear", RACK_LOW)):
        out = math.copysign(1, wx)
        for s, sy in SIDES:
            tube(kit, f"shock_{name}_{s}", (wx + 0.18 * out, sy * y, HUB_Z + 0.05), (wx + 0.05 * out, sy * y, top), 0.05, "metal")


def rack(kit: Kit) -> None:
    """The cargo rack behind the cab: flat mesh sides and back in tube frames, a flat paint top, a tube rim and an extinguisher, photo."""
    x0, x1 = RACK_X
    y = RACK_HALF
    kit.box("rack_top", (x0 - x1, 2 * y, 0.04), ((x0 + x1) / 2, 0, RACK_TOP - 0.02), "paint")
    kit.box("rack_floor", (x0 - x1, 2 * y, 0.04), ((x0 + x1) / 2, 0, RACK_LOW + 0.02), "under")
    corners = [(x, sy * y) for x in (x0, x1) for sy in (1, -1)]
    for i, (x, cy) in enumerate(corners):
        tube(kit, f"rack_post_{i}", (x, cy, RACK_LOW), (x, cy, RACK_TOP))
    for i, (a, b) in enumerate(((corners[0], corners[2]), (corners[1], corners[3]), (corners[0], corners[1]), (corners[2], corners[3]))):
        tube(kit, f"rack_rim_{i}", (a[0], a[1], RACK_TOP), (b[0], b[1], RACK_TOP))
        tube(kit, f"rack_base_{i}", (a[0], a[1], RACK_LOW), (b[0], b[1], RACK_LOW))
    tall = RACK_TOP - RACK_LOW
    mid = (RACK_TOP + RACK_LOW) / 2
    for s, sy in SIDES:
        tube(kit, f"rack_mid_{s}", ((x0 + x1) / 2, sy * y, RACK_LOW), ((x0 + x1) / 2, sy * y, RACK_TOP))
        kit.box(f"rack_mesh_{s}", (x0 - x1, 0.02, tall), ((x0 + x1) / 2, sy * (y - TUBE), mid), "metal_light")
    kit.box("rack_mesh_back", (0.02, 2 * y, tall), (x1 + TUBE, 0, mid), "metal_light")
    kit.box("rack_mesh_front", (0.02, 2 * y, tall), (x0 - TUBE, 0, mid), "metal_light")
    r = 0.075
    ex_x = (x0 + x1) / 2 - 0.15
    ex_z = RACK_TOP - 0.18
    round_part(kit, "extinguisher", r, 0.34, (ex_x, y + TUBE + r, ex_z), "metal")
    for z in (ex_z - 0.1, ex_z + 0.1):
        kit.box(f"extinguisher_strap_{z:.2f}", (0.06, TUBE + 0.02, 0.04), (ex_x, y + TUBE / 2 + 0.01, z), "trim")


def tail(kit: Kit) -> None:
    """Inferred: the painted rear tub under the rack between the rear tires, its taillights, and the dark spine under the cab."""
    low = up(0.55)
    half = TIRE_INNER - ARCH_CLEARANCE - 0.02
    kit.box("rear_tub", (RACK_X[0] - RACK_X[1] - 0.1, 2 * half, RACK_LOW - low), ((RACK_X[0] + RACK_X[1]) / 2, 0, (RACK_LOW + low) / 2), "paint")
    kit.box("spine", (1.6, 0.6, 0.12), (0.3, 0, up(0.55) + 0.06), "under")
    for s, sy in SIDES:
        round_part(kit, f"taillight_{s}", 0.05, 0.04, (RACK_X[1] + 0.03, sy * 0.3, up(0.95)), "red", (0, math.pi / 2, 0))


def deck_x() -> tuple[float, float]:
    """The span along the truck of the D rows, as body.ts projects the layout over the length."""
    step = LENGTH / GAME_ROWS
    return FRONT - (DECK_ROWS[1] + 1) * step, FRONT - DECK_ROWS[0] * step


def vertices(objs: list[bpy.types.Object]) -> list[Vector]:
    bpy.context.view_layer.update()
    return [o.matrix_world @ v.co for o in objs for v in o.data.vertices]


def check_buggy(kit: Kit, spare_tire: bpy.types.Object) -> None:
    """Raises when the roof misses a deck row, anything behind the deck rows stands over the roof, the deck does not frame
    the engine hole, the spare reaches over the hole, or a tire comes within its arch clearance of the body."""
    x0, x1 = deck_x()
    if REAR_POST - TUBE > x0 or ROOF_FRONT + TUBE < x1:
        raise RuntimeError(f"the roof {REAR_POST - TUBE:.2f}..{ROOF_FRONT + TUBE:.2f} does not cover the deck rows {x0:.2f}..{x1:.2f}")
    behind = max(p.z for p in vertices(kit._parts) if p.x < x0)
    if behind > ROOF_TOP + 1e-4:
        raise RuntimeError(f"a part behind the deck rows stands at z {behind:.3f}, over the roof's {ROOF_TOP:.3f}")
    back, front, half = HOLE
    if back < COWL + LIP or front > DECK_FRONT - LIP or half > DECK_HALF - LIP:
        raise RuntimeError(f"engine hole x {back:.2f}..{front:.2f} half {half:.2f} is not framed by the deck")
    spare_back = min(p.x for p in vertices([spare_tire]))
    if spare_back < front + LIP:
        raise RuntimeError(f"the spare reaches back to x {spare_back:.3f}, over the engine hole that ends at {front:.3f}")
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
    kit.socket("arch_front_top", (WHEEL_X, WHEEL_Z, HUB_Z + ARCH_R))


def main() -> None:
    args = parse_args()
    kit = Kit(COLORS, SEED)
    bull_bar(kit)
    nose(kit)
    spare_tire = spare(kit)
    deck(kit)
    front_fenders(kit)
    rear_fenders(kit)
    cage(kit)
    cab(kit)
    mirrors(kit)
    sill(kit)
    shocks(kit)
    rack(kit)
    tail(kit)
    check_buggy(kit, spare_tire)
    arch_sockets(kit)
    bay = {(x, y): FLOOR for x in (1, 2) for y in (0, 1)}
    level_sockets(kit, G, "row", [surface_z(G, 0, y) for y in range(G.rows)], cells=bay)
    level_sockets(kit, G, "floor", [FLOOR] * 2 + [SILL_LOW] * 4)
    check_base(kit, "base_buggy", G)
    kit.export("base_buggy", args, view_size=5.0)


if __name__ == "__main__":
    main()
