"""The tractor base: a Kenworth W900L 4x2 with a mid-roof sleeper, the long-hood American semi tractor, with a gun deck behind the sleeper.

Built from two committee photos of the W900 (tmp/models/base_tractor/asset-brief.md): photo 1, a red W900L seen from the
front right, and photo 2, a black 1997 W900 with a mid-roof sleeper seen from the front left. Lengths come from published
W900L numbers, scaled by S = 6.40 / 6.30 on every axis: 6.40 m long, 2.63 m across the fenders and tanks, the cab and
sleeper roofs 3.05 m and the stacks 4.10 m over the ground.
The ground is 1.62 m below the center. Heights below are given over the ground and turned into Z by up().
A tall chrome grille, 1.00 m wide and 1.12 m tall with nine vertical bars over a dark core and a red badge on its crown,
stands on a deep full-width chrome bumper from 0.48 to 0.90 m. The long hood tapers in plan from 1.48 m wide at the cowl to
1.20 m at the grille, with rounded shoulders, its top at 1.95 m. Swept painted fenders with rounded outer shoulders rise from the bumper over the steer
wheels and fall behind them to the cowl, with a chrome pod of two rectangular lamps on each fender front, centered 1.07 m up.
Tall round chrome air cleaners stand at the cowl. The upright cab, 2.08 m wide, stands from the cowl to 3.42 m behind the bumper:
painted doors to the 2.04 m beltline, a split windshield under a chrome visor with amber markers, tall mirrors on struts and
a trim roof with rounded edges. A painted sleeper box as wide as the cab stands behind it to the back edge of grid row 5,
level with the cab roof under its own trim roof, with a dark seam at the cab joint, a door with a window and a high window on each side. Two
straight round chrome stacks stand at the cab-sleeper seam, outboard of the cab sides. Under the door, tread steps follow
the fender tail, then long round chrome tanks run back under the sleeper. The narrow deck behind the sleeper carries a
round fifth-wheel plate over the drive wheels, between dark round quarter fenders and mud flaps.
Deviations from the photos, forced by the game: it stays a 4x2, since a tandem with the tire rule's tires does not fit the
6.4 m grid; the sleeper is one grid row long, 0.85 m, so rows 6 to 8 keep the deck; the tires follow the tire rule at
0.77 m, not 0.52 m, so the fenders and the deck at 1.74 m rise to clear them; the wheels stay symmetric at 2.10 m from the
center, a 4.20 m wheelbase; the track is 1.94 m so the tire stays under the fender; the hood stays wide enough to hold the
engine hole; the roofs keep the trim faction color; no trailer, roof wing, raised roof or bent stack tops.
The engine shows through a hole in the hood over the engine cells, on a dark bay floor at 1.70 m: restOn() of the engine
cells, centered on PHYSICS.bodies.tractor.engine.
Grid: 7 columns by 9 rows, stretched over the model by the projection. Rows 0 to 2 stand on the hood, rows 3 and 4 on the
cab roof, row 5 on the sleeper roof and rows 6 to 8 on the deck. Half height 0.65 m, from PHYSICS.bodies.tractor.
Wheels sit on rows 1 and 6, radius 0.77 m, half width 0.325 m, mount 0.45 m below the center, 0.97 m off the center line.
Sockets arch_front, arch_rear and arch_front_top (the arch crown) mark the arches for wheelArches.test.ts.
Every round part uses ROUND_SEGMENTS or SMALL_ROUND_SEGMENTS, and the build checks the counts. The build also checks the
size, the hood hole in the tapered hood, the tire clearance, the sleeper's back edge and the tanks' clearance.
Run: blender --background --python tools/blender/base_tractor.py -- public/models/base_tractor.glb [tmp/base_tractor.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402
from parts_common_base import ARCH_CLEARANCE, BASE_COLORS, FLARE, SUSPENSION_REST, Grid, cut_boxes, hull_mesh, level_sockets  # noqa: E402
from parts_common_core import ALONG_X, ROUND_SEGMENTS, SMALL_ROUND_SEGMENTS, check_round  # noqa: E402
from shapes import prism  # noqa: E402

SEED = 303
S = 6.40 / 6.30
LENGTH = 6.40
WIDTH = 2.63
G = Grid(rows=9, cols=7, half_height=0.65)
ROW_ALONG = LENGTH / G.rows  # body.ts stretches the 9 rows over the model's length
WHEEL_R = 0.77  # PHYSICS.bodies.tractor.wheelRadius
WHEEL_HALF_W = 0.325  # PHYSICS.bodies.tractor.wheelHalfWidth
WHEEL_X = 2.10  # PHYSICS.bodies.tractor.wheelX
WHEEL_Z = 0.97  # PHYSICS.bodies.tractor.wheelZ
HUB_Z = -0.45 - SUSPENSION_REST  # PHYSICS.bodies.tractor.wheelY
GROUND = HUB_Z - WHEEL_R
WHEELS_X = [WHEEL_X, -WHEEL_X]
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03
ARCH_R = WHEEL_R + ARCH_CLEARANCE

SIDE = WIDTH / 2
FRONT = LENGTH / 2
BACK = -FRONT
BUMPER_BACK = FRONT - 0.28
GRILLE_X = FRONT - 0.24
COWL_X = FRONT - 2.20
CAB_BACK = FRONT - 3.42
SLEEPER_BACK = FRONT - 6 * ROW_ALONG  # the back edge of grid row 5
CAB_HALF = 1.04
HOOD_HALF_COWL = 0.74  # photo 1 and 2: the hood narrows toward the grille
HOOD_HALF_GRILLE = 0.60
HOOD_ROUND = 0.16
GRILLE_HALF = 0.50  # photo 2: the grille is taller than wide, about 0.85 to 0.9 after foreshortening
LOWER_HALF = WELL_Y - 0.02


def up(h: float) -> float:
    """Z of a height over the ground."""
    return GROUND + h


BUMPER = (up(0.48), up(0.90))  # photo 2: a deep chrome bumper, about 0.2 to 0.76 m, raised over the bigger tire; its bottom keeps the tire rule's body height
HOOD_TOP = up(1.95)
GRILLE_CROWN = up(2.02)  # photo 1 and 2: the grille's crowned top stands just over the hood
HOOD_FOOT = up(1.62)
FENDER_SHOULDER = (0.025, 0.07)  # photo 1 and 2: the fenders round over toward the body side
FENDER_CROWN = up(1.70)  # photo 1 and 2: the hood stands over the fenders; the tire rule holds the arch top at 1.60 m
SILL = up(1.15)
BELT = up(2.04)  # photo 1 and 2: the windshield starts just over the hood
UNDER_ROOF = up(2.95)
ROOF = up(3.05)
RAKE = 0.14
ROOF_FRONT = COWL_X - RAKE - 0.04
DECK = up(1.74)
DECK_T = 0.12
DECK_HALF = 0.94
FRAME_BOTTOM = up(0.75)
RAIL_TOP = up(1.1)
STACK_TOP = up(4.10)  # photo 1: the stack tops stand about 1.3 times the cab roof
STACK_R = 0.09
STACK_X = CAB_BACK - 0.10  # photo 1 and 2: at the cab-sleeper seam, beside the sleeper front
STACK_Y = CAB_HALF + STACK_R + 0.01  # just outboard of the cab side
TANK_R = 0.31
TANK_Z = up(0.85)
STEP_X = (COWL_X + 0.10, 0.22)  # photo 1 and 2: tread steps right behind the fender tail, under the door
TANK_X = (STEP_X[1] - 0.02, -WHEEL_X + WHEEL_R + 0.25)  # photo 1 and 2: long round tanks behind the steps, under the sleeper
CLEANER_R = 0.23
CLEANER_X = COWL_X + 0.30
CLEANER = (up(1.35), up(2.45))  # photo 1 and 2: tall cans beside the cowl, their tops at about mid windshield
LAMP_Z = up(1.07)  # photo 2: lamp centers about 1.05 m up
LAMP_POD = (0.50, up(0.92), up(1.22))  # photo 2: a chrome pod across the fender front, from the bumper top over the twin lamps
MIRROR_X = COWL_X - 0.12  # photo 1 and 2: tall West Coast mirrors at the door fronts
MIRROR_Y = 1.20
FIFTH_WHEEL_R = 0.45

ENGINE_X = 1.783  # PHYSICS.bodies.tractor.engine.x
ENGINE_Y = 0.189  # -PHYSICS.bodies.tractor.engine.z
ENGINE_HALF = (0.714, 0.378)  # the drawn engine: restOn() of the engine cells, over the bay floor
BAY_FLOOR = up(1.70)  # PHYSICS.bodies.tractor.engine.y
HOLE_MARGIN = 0.02
HOLE = ((ENGINE_X - ENGINE_HALF[0] - HOLE_MARGIN, ENGINE_Y - ENGINE_HALF[1] - HOLE_MARGIN), (ENGINE_X + ENGINE_HALF[0] + HOLE_MARGIN, ENGINE_Y + ENGINE_HALF[1] + HOLE_MARGIN))
SLEEPER_ARCH_GAP = 0.15
TANK_TIRE_GAP = 0.2


def hood_half(x: float) -> float:
    """The hood's half width at x, tapering from the cowl to the grille."""
    t = (x - COWL_X) / (GRILLE_X - COWL_X)
    return HOOD_HALF_COWL + (HOOD_HALF_GRILLE - HOOD_HALF_COWL) * t


CLEANER_Y = hood_half(CLEANER_X) + CLEANER_R + 0.05


def mirrored(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def round_part(kit: Kit, name: str, radius: float, depth: float, loc: tuple[float, float, float], mat: str, sides: int, minimum: int, rot: tuple[float, float, float] = (0, 0, 0)) -> None:
    """A cylinder meant to read round, its side count checked against the shared count."""
    check_round(name, sides, minimum)
    kit.cylinder(name, radius, depth, loc, mat, rot=rot, vertices=sides)


def prism_across(kit: Kit, name: str, profile: list[tuple[float, float]], x0: float, x1: float, mat: str) -> bpy.types.Object:
    """Extrudes a closed YZ profile from Blender X x0 to x1 as one mesh, for shapes shaped across the truck."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    near = [bm.verts.new((x0, y, z)) for y, z in profile]
    far = [bm.verts.new((x1, y, z)) for y, z in profile]
    bm.faces.new(near)
    bm.faces.new(list(reversed(far)))
    n = len(profile)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((near[i], near[j], far[j], far[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return kit._add(obj, name, mat, 0.0)


def arc(cx: float, cz: float, r: float, a0: float, a1: float, steps: int) -> list[tuple[float, float]]:
    return [(cx + r * math.cos(a0 + (a1 - a0) * k / steps), cz + r * math.sin(a0 + (a1 - a0) * k / steps)) for k in range(steps + 1)]


def wheel_arch(wx: float, r: float, x_min: float, x_max: float) -> list[tuple[float, float]]:
    """The round arch over the wheel at wx from back to front, cut off at x_min and x_max."""
    pts = arc(wx, HUB_Z, r, math.pi, 0.0, ROUND_SEGMENTS)
    return [(min(x_max, max(x_min, x)), z if x_min <= x <= x_max else HUB_Z) for x, z in pts]


def hood_section(half: float, bottom: float, top: float, rounding: float = HOOD_ROUND) -> list[tuple[float, float]]:
    """A YZ outline from bottom to top, half wide, its top corners rounded."""
    right = arc(half - rounding, top - rounding, rounding, 0.0, math.pi / 2, 4)
    left = arc(-half + rounding, top - rounding, rounding, math.pi / 2, math.pi, 4)
    return [(-half, bottom), (half, bottom), *right, *left]


def hood(kit: Kit) -> None:
    """A long hood with rounded shoulders, tapering from the cowl to the grille, open over the engine cells."""
    points = [(x, y, z) for x in (COWL_X, GRILLE_X) for y, z in hood_section(hood_half(x), HOOD_FOOT, HOOD_TOP)]
    upper = kit._add(hull_mesh("hood", points), "hood", "paint", 0.0)
    (x0, y0), (x1, y1) = HOLE
    cut_boxes(upper, [((x0, y0, BAY_FLOOR - 0.02), (x1, y1, HOOD_TOP + 0.1))])
    upper.data.materials.clear()
    upper.data.materials.append(kit._materials["paint"])
    kit.box("bay_floor", (x1 - x0, y1 - y0, 0.02), ((x0 + x1) / 2, (y0 + y1) / 2, BAY_FLOOR - 0.01), "metal")
    kit.box("hood_lower", (GRILLE_X - COWL_X, 2 * LOWER_HALF, HOOD_FOOT - BUMPER[1]), ((GRILLE_X + COWL_X) / 2, 0, (HOOD_FOOT + BUMPER[1]) / 2), "paint")


def grille(kit: Kit) -> None:
    """A tall chrome grille with a crowned top: a dark core behind nine vertical chrome bars and a red badge on the crown, over a deep chrome bumper."""
    bottom = BUMPER[1]
    face = GRILLE_X + 0.02
    prism_across(kit, "grille_frame", hood_section(GRILLE_HALF, bottom, GRILLE_CROWN, 0.12), GRILLE_X - 0.04, face + 0.04, "metal_light")
    core_half = GRILLE_HALF - 0.10
    core = (bottom + 0.07, HOOD_TOP - 0.10)
    kit.box("grille_core", (0.02, 2 * core_half, core[1] - core[0]), (face + 0.045, 0, (core[0] + core[1]) / 2), "under")
    bars = 9
    for i in range(bars):
        y = -core_half + 0.05 + (2 * core_half - 0.1) * i / (bars - 1)
        kit.box(f"grille_bar{i}", (0.04, 0.04, core[1] - core[0] - 0.04), (face + 0.06, y, (core[0] + core[1]) / 2), "metal_light")
    kit.box("grille_badge", (0.03, 0.12, 0.16), (face + 0.055, 0, GRILLE_CROWN - 0.10), "red")
    kit.box("bumper", (FRONT - BUMPER_BACK, 2 * (SIDE - 0.02), BUMPER[1] - BUMPER[0]), ((FRONT + BUMPER_BACK) / 2, 0, (BUMPER[0] + BUMPER[1]) / 2), "metal_light")


def fender_outline(drop: float = 0.0) -> list[tuple[float, float]]:
    """The XZ outline of a front fender: rising from over the bumper to a crown over the wheel and sweeping down to the cowl.

    drop lowers the crown, fading to nothing at the tail height, for the rounded outer shoulder.
    """
    front = GRILLE_X - 0.02
    face_top = LAMP_POD[2] + 0.02
    crown_x = WHEEL_X - 0.2
    rise = [(crown_x + (front - crown_x) * math.cos(math.pi / 2 * k / 12), face_top + (FENDER_CROWN - face_top) * math.sin(math.pi / 2 * k / 12)) for k in range(13)]
    crown_back = crown_x - 0.3
    tail_x, tail_z = COWL_X + 0.12, up(1.15)
    sweep = [(crown_back - (crown_back - tail_x) * (1 - math.cos(math.pi * k / 10)) / 2, FENDER_CROWN - (FENDER_CROWN - tail_z) * (1 - math.cos(math.pi * k / 10)) / 2) for k in range(1, 11)]
    def lowered(p: tuple[float, float]) -> tuple[float, float]:
        share = min(1.0, max(0.0, (p[1] - tail_z) / (FENDER_CROWN - tail_z)))
        return (p[0], p[1] - drop * share)

    top = [(front, BUMPER[1])] + [lowered(p) for p in rise + sweep]
    arch = [p for p in wheel_arch(WHEEL_X, ARCH_R, tail_x, front) if p[0] > tail_x and p[0] < front]
    return top + [(tail_x, HUB_Z)] + arch + [(front, HUB_Z)]


def fenders(kit: Kit) -> None:
    """Painted swept fenders from beside the grille out to the body side, their outer shoulder rounded down in steps, with a lamp pod on each front."""
    inner = HOOD_HALF_GRILLE - 0.04
    bands = [(inner, SIDE - 0.24, 0.0), (SIDE - 0.24, SIDE - 0.12, FENDER_SHOULDER[0]), (SIDE - 0.12, SIDE, FENDER_SHOULDER[1])]
    for i, (y0, y1, drop) in enumerate(bands):
        outline = fender_outline(drop)
        prism(kit, f"fender_l{i}", outline, y0, y1, "paint")
        prism(kit, f"fender_r{i}", outline, -y1, -y0, "paint")
    lamp_pods(kit, GRILLE_X - 0.02)


def lamp_pods(kit: Kit, front: float) -> None:
    """A chrome pod across each fender front with two rectangular lamps side by side."""
    width, lo, hi = LAMP_POD
    pod_y = (GRILLE_HALF + SIDE) / 2 + 0.02
    mirrored(kit, "lamp_pod", (0.06, width, hi - lo), front + 0.02, pod_y, (lo + hi) / 2, "metal_light")
    lamp = (0.03, 0.19, 0.13)
    for i, dy in enumerate((-0.11, 0.11)):
        mirrored(kit, f"lamp_bezel{i}", (0.03, lamp[1] + 0.04, lamp[2] + 0.04), front + 0.06, pod_y + dy, LAMP_Z, "metal")
        mirrored(kit, f"lamp{i}", lamp, front + 0.07, pod_y + dy, LAMP_Z, "light")


def air_cleaners(kit: Kit) -> None:
    """Round chrome air cleaners standing on the fender tails by the cowl, with dark bands and caps."""
    lo, hi = CLEANER
    for s, sign in (("l", 1), ("r", -1)):
        y = sign * CLEANER_Y
        round_part(kit, f"air_cleaner_{s}", CLEANER_R, hi - lo, (CLEANER_X, y, (lo + hi) / 2), "metal_light", ROUND_SEGMENTS, ROUND_SEGMENTS)
        round_part(kit, f"air_cleaner_band_{s}", CLEANER_R + 0.012, 0.08, (CLEANER_X, y, lo + 0.18), "metal", ROUND_SEGMENTS, ROUND_SEGMENTS)
        kit.box(f"air_cleaner_bracket_{s}", (0.24, 0.16, lo - up(1.12)), (CLEANER_X - 0.1, y, (lo + up(1.12)) / 2), "metal")
        round_part(kit, f"air_cleaner_cap_{s}", CLEANER_R + 0.02, 0.06, (CLEANER_X, y, hi), "metal", ROUND_SEGMENTS, ROUND_SEGMENTS)


def trim_roof(kit: Kit, name: str, front: float, back: float) -> None:
    """A trim roof with rounded edges over the box from front to back, its top at ROOF."""
    layers = [(UNDER_ROOF, front, back, CAB_HALF, 0.0), (ROOF - 0.04, front, back, CAB_HALF, 0.04), (ROOF, front - 0.04, back + 0.04, CAB_HALF - 0.05, 0.08)]
    pts = []
    for z, xf, xb, hy, c in layers:
        for y in (hy, -hy):
            pts += [(xf - c, y, z), (xb + c, y, z)]
        for x in (xf, xb):
            pts += [(x, hy - c, z), (x, -hy + c, z)]
    kit._add(hull_mesh(name, list(dict.fromkeys(pts))), name, "trim", 0.0)


def cab(kit: Kit) -> None:
    """An upright cab: painted doors, a split windshield, side windows, a chrome visor with amber markers and a trim roof."""
    kit.box("doors", (COWL_X - CAB_BACK, 2 * CAB_HALF, BELT - SILL), ((COWL_X + CAB_BACK) / 2, 0, (BELT + SILL) / 2), "paint")
    rake_top = COWL_X - RAKE
    inner = CAB_HALF - 0.04
    prism(kit, "glass", [(CAB_BACK + 0.04, BELT), (COWL_X - 0.02, BELT), (rake_top, UNDER_ROOF), (CAB_BACK + 0.04, UNDER_ROOF)], -inner, inner, "glass")
    for s, (y0, y1) in (("l", (CAB_HALF - 0.06, CAB_HALF)), ("r", (-CAB_HALF, -CAB_HALF + 0.06))):
        prism(kit, f"a_pillar_{s}", [(COWL_X - 0.12, BELT), (COWL_X, BELT), (rake_top, UNDER_ROOF), (rake_top - 0.12, UNDER_ROOF)], y0, y1, "paint")
        kit.box(f"door_post_{s}", (0.14, y1 - y0, UNDER_ROOF - BELT), (CAB_BACK + 0.62, (y0 + y1) / 2, (BELT + UNDER_ROOF) / 2), "paint")
        kit.box(f"back_pillar_{s}", (0.2, y1 - y0, UNDER_ROOF - BELT), (CAB_BACK + 0.1, (y0 + y1) / 2, (BELT + UNDER_ROOF) / 2), "paint")
    prism(kit, "split_bar", [(COWL_X - 0.1, BELT), (COWL_X, BELT), (rake_top + 0.02, UNDER_ROOF), (rake_top - 0.08, UNDER_ROOF)], -0.05, 0.05, "paint")
    kit.box("back_wall", (0.06, 2 * CAB_HALF, UNDER_ROOF - SILL), (CAB_BACK + 0.03, 0, (SILL + UNDER_ROOF) / 2), "paint")
    trim_roof(kit, "roof", rake_top + 0.02, CAB_BACK)
    prism(kit, "visor", [(rake_top - 0.02, UNDER_ROOF - 0.04), (rake_top + 0.24, UNDER_ROOF - 0.14), (rake_top + 0.24, UNDER_ROOF - 0.1), (rake_top, UNDER_ROOF + 0.02)], -CAB_HALF + 0.02, CAB_HALF - 0.02, "metal_light")
    for i in range(5):
        kit.box(f"marker_{i}", (0.08, 0.12, 0.07), (ROOF_FRONT - 0.06, (i - 2) * 0.36, ROOF - 0.01), "amber")
    kit.box("core_cab", (COWL_X - SLEEPER_BACK, 2 * (SIDE - 2 * TANK_R), SILL - FRAME_BOTTOM), ((COWL_X + SLEEPER_BACK) / 2, 0, (SILL + FRAME_BOTTOM) / 2), "under")
    mirrors(kit)


def mirrors(kit: Kit) -> None:
    """Tall chrome West Coast mirrors on struts out from the door fronts, inside the body width."""
    head = (0.05, 0.05, 0.46)
    z = BELT + 0.36
    mirrored(kit, "mirror", head, MIRROR_X, MIRROR_Y, z, "metal_light")
    for i, dz in enumerate((-0.2, 0.2)):
        mirrored(kit, f"mirror_strut{i}", (0.03, MIRROR_Y - CAB_HALF, 0.03), MIRROR_X, (MIRROR_Y + CAB_HALF) / 2, z + dz, "metal")


def sleeper(kit: Kit) -> None:
    """A painted sleeper box behind the cab, level with its roof under its own trim roof, with a dark seam at the joint and a door on each side."""
    length = CAB_BACK - SLEEPER_BACK
    mid = (CAB_BACK + SLEEPER_BACK) / 2
    kit.box("sleeper", (length, 2 * CAB_HALF, UNDER_ROOF - SILL), (mid, 0, (SILL + UNDER_ROOF) / 2), "paint")
    trim_roof(kit, "sleeper_roof", CAB_BACK, SLEEPER_BACK)
    mirrored(kit, "sleeper_seam", (0.04, 0.012, UNDER_ROOF - SILL), CAB_BACK, CAB_HALF + 0.004, (SILL + UNDER_ROOF) / 2, "under")
    door_x = mid + 0.02
    door_lo, door_hi = SILL + 0.12, UNDER_ROOF - 0.36
    mirrored(kit, "sleeper_door_seam", (0.5, 0.01, door_hi - door_lo), door_x, CAB_HALF + 0.004, (door_lo + door_hi) / 2, "under")
    mirrored(kit, "sleeper_door", (0.44, 0.014, door_hi - door_lo - 0.06), door_x, CAB_HALF + 0.006, (door_lo + door_hi) / 2, "paint")
    mirrored(kit, "sleeper_window", (0.22, 0.018, 0.4), door_x, CAB_HALF + 0.007, door_hi - 0.32, "glass")
    mirrored(kit, "sleeper_top_window", (0.6, 0.012, 0.16), mid, CAB_HALF + 0.004, UNDER_ROOF - 0.19, "glass")


def tanks(kit: Kit) -> None:
    """Chrome tread steps under the door behind the fender tail, then long round chrome tanks with dark straps under the sleeper."""
    s0, s1 = STEP_X
    outer = SIDE - 0.03
    stair = [(0.70, up(0.48)), (outer, up(0.48)), (outer, up(0.56)), (outer - 0.14, up(0.56)), (outer - 0.14, up(0.82)), (outer - 0.26, up(0.82)), (outer - 0.26, SILL), (0.70, SILL)]
    prism_across(kit, "step_l", stair, s1, s0, "metal_light")
    prism_across(kit, "step_r", [(-y, z) for y, z in stair], s1, s0, "metal_light")
    for i, (z, y) in enumerate(((up(0.56), outer - 0.07), (up(0.82), outer - 0.20))):
        mirrored(kit, f"step_tread{i}", (s0 - s1 - 0.06, 0.1, 0.012), (s0 + s1) / 2, y, z + 0.006, "metal")
    x0, x1 = TANK_X
    length = x0 - x1
    mid = (x0 + x1) / 2
    for s, sign in (("l", 1), ("r", -1)):
        y = sign * (SIDE - TANK_R - 0.012)
        round_part(kit, f"tank_{s}", TANK_R, length, (mid, y, TANK_Z), "metal_light", ROUND_SEGMENTS, ROUND_SEGMENTS, rot=ALONG_X)
        for i, x in enumerate((x0 - 0.16, x1 + 0.16)):
            round_part(kit, f"tank_strap_{s}{i}", TANK_R + 0.012, 0.07, (x, y, TANK_Z), "under", ROUND_SEGMENTS, ROUND_SEGMENTS, rot=ALONG_X)


def chassis(kit: Kit) -> None:
    """The dark frame rails from the bumper to the tail and the steer and drive axles."""
    mirrored(kit, "rail", (FRONT - BACK - 0.34, 0.14, RAIL_TOP - FRAME_BOTTOM), (BUMPER_BACK + BACK + 0.06) / 2, 0.42, (RAIL_TOP + FRAME_BOTTOM) / 2, "under")
    for i, wx in enumerate(WHEELS_X):
        kit.box(f"axle{i}", (0.16, 2 * WELL_Y, 0.16), (wx, 0, HUB_Z), "under")


def deck(kit: Kit) -> None:
    """The narrow flat deck from the sleeper to the tail over the drive wheels, with a round fifth-wheel plate."""
    length = SLEEPER_BACK - BACK
    mid = (SLEEPER_BACK + BACK) / 2
    kit.box("deck", (length, 2 * DECK_HALF, DECK_T), (mid, 0, DECK - DECK_T / 2), "metal_dark")
    mirrored(kit, "deck_rail", (length, 0.02, DECK_T), mid, DECK_HALF - 0.01, DECK - DECK_T / 2, "paint")
    kit.box("deck_core", (length - 0.06, 0.7, DECK - DECK_T - RAIL_TOP), (mid - 0.03, 0, (DECK - DECK_T + RAIL_TOP) / 2), "metal_dark")
    plate_x = -WHEEL_X + 0.2
    round_part(kit, "fifth_wheel", FIFTH_WHEEL_R, 0.03, (plate_x, 0, DECK + 0.015), "under", ROUND_SEGMENTS, ROUND_SEGMENTS)
    kit.box("fifth_wheel_slot", (FIFTH_WHEEL_R, 0.16, 0.03), (plate_x - FIFTH_WHEEL_R / 2, 0, DECK + 0.02), "metal")
    kit.box("rear_panel", (0.06, 2 * DECK_HALF, 0.3), (BACK + 0.05, 0, DECK - 0.15), "paint")
    mirrored(kit, "taillight", (0.04, 0.24, 0.14), BACK + 0.02, DECK_HALF - 0.2, DECK - 0.15, "red")


def quarter_fenders(kit: Kit) -> None:
    """Dark round half rings over the drive wheels, outside the narrow deck, and dark mud flaps behind them."""
    r0, r1 = ARCH_R, ARCH_R + FLARE
    check_round("quarter_fender", ROUND_SEGMENTS, ROUND_SEGMENTS)
    inner = arc(-WHEEL_X, HUB_Z, r0, 0.0, math.pi, ROUND_SEGMENTS)
    outer = arc(-WHEEL_X, HUB_Z, r1, 0.0, math.pi, ROUND_SEGMENTS)
    ring = [(max(BACK, x), z) for x, z in outer + list(reversed(inner))]
    prism(kit, "quarter_fender_l", ring, WELL_Y, SIDE - 0.03, "under")
    prism(kit, "quarter_fender_r", ring, -SIDE + 0.03, -WELL_Y, "under")
    flap_top = HUB_Z + 0.3
    mirrored(kit, "mud_flap", (0.04, SIDE - 0.03 - WELL_Y, flap_top - up(0.56)), BACK + 0.12, (SIDE - 0.03 + WELL_Y) / 2, (flap_top + up(0.56)) / 2, "under")
    mirrored(kit, "flap_hanger", (0.06, 0.1, DECK - DECK_T - flap_top), BACK + 0.12, DECK_HALF - 0.08, (DECK - DECK_T + flap_top) / 2, "under")


def stacks(kit: Kit) -> None:
    """Twin straight round chrome stacks at the cab-sleeper seam, outboard of the cab sides, from the sill to 4.1 m, with heat shields."""
    for s, sign in (("l", 1), ("r", -1)):
        y = sign * STACK_Y
        round_part(kit, f"stack_{s}", STACK_R, STACK_TOP - SILL, (STACK_X, y, (STACK_TOP + SILL) / 2), "metal_light", SMALL_ROUND_SEGMENTS, SMALL_ROUND_SEGMENTS)
        round_part(kit, f"stack_shield_{s}", STACK_R + 0.035, 0.9, (STACK_X, y, up(2.2)), "metal", SMALL_ROUND_SEGMENTS, SMALL_ROUND_SEGMENTS)
        for i, z in enumerate((up(1.55), up(2.85))):
            kit.box(f"stack_bracket_{s}{i}", (0.06, STACK_Y - CAB_HALF, 0.06), (STACK_X, sign * (STACK_Y + CAB_HALF) / 2, z), "metal")


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
    print(f"base_tractor bounds x {lo.x:.3f}..{hi.x:.3f} y {lo.y:.3f}..{hi.y:.3f} z {lo.z:.3f}..{hi.z:.3f}")
    if abs(hi.x - lo.x - LENGTH) > 0.01 or abs(hi.y - lo.y - WIDTH) > 0.01:
        raise RuntimeError(f"base_tractor is {hi.x - lo.x:.3f} x {hi.y - lo.y:.3f} m, not {LENGTH} x {WIDTH} m")
    if abs(hi.z - STACK_TOP) > 0.01:
        raise RuntimeError(f"base_tractor tops out at {hi.z - GROUND:.3f} m, not at the stack tops")


def check_hood() -> None:
    """Raises when the hood hole does not hold the drawn engine with its margin, or leaves the tapered hood."""
    (x0, y0), (x1, y1) = HOLE
    if x0 <= COWL_X or x1 >= GRILLE_X:
        raise RuntimeError(f"hood hole x {x0:.3f}..{x1:.3f} leaves the hood")
    narrowest = min(hood_half(x0), hood_half(x1))
    if max(abs(y0), abs(y1)) >= narrowest:
        raise RuntimeError(f"hood hole y {y0:.3f}..{y1:.3f} leaves the hood, {narrowest:.3f} half wide at the hole's end")


def check_tires() -> None:
    """Raises when a tire at its physics mount reaches the bumper, the deck or past the body side."""
    bumper_reach = WHEEL_X + math.sqrt(max(0.0, WHEEL_R**2 - (BUMPER[1] - HUB_Z) ** 2))
    if bumper_reach > BUMPER_BACK - 0.02:
        raise RuntimeError(f"the steer tire reaches x {bumper_reach:.3f}, into the bumper at {BUMPER_BACK:.3f}")
    if HUB_Z + WHEEL_R + ARCH_CLEARANCE > DECK - DECK_T:
        raise RuntimeError("the drive tire reaches the deck")
    if WHEEL_Z + WHEEL_HALF_W > SIDE:
        raise RuntimeError("the tires stand out past the body side")


def arch_front_at(z: float) -> float:
    """X of the front edge of the drive wheel's quarter fender at height z."""
    r = ARCH_R + FLARE
    dz = z - HUB_Z
    return -WHEEL_X + math.sqrt(max(0.0, r**2 - dz**2))


def check_sleeper() -> None:
    """Raises when the sleeper does not end on the back edge of grid row 5, or comes near the drive wheel's fender."""
    row_back = FRONT - 6 * LENGTH / G.rows
    if abs(SLEEPER_BACK - row_back) > 1e-6:
        raise RuntimeError(f"the sleeper ends at x {SLEEPER_BACK:.3f}, not on the back edge of row 5 at {row_back:.3f}")
    gap = SLEEPER_BACK - arch_front_at(SILL)
    if gap < SLEEPER_ARCH_GAP:
        raise RuntimeError(f"the sleeper's back is {gap:.3f} m from the drive fender, under {SLEEPER_ARCH_GAP} m")


def check_tanks() -> None:
    """Raises when the steps run into the tanks, or the tanks come near the drive tire or its fender."""
    if STEP_X[1] <= TANK_X[0]:
        raise RuntimeError(f"the steps end at x {STEP_X[1]:.3f}, behind the tank front at {TANK_X[0]:.3f}")
    tire_front = -WHEEL_X + WHEEL_R
    if TANK_X[1] - tire_front < TANK_TIRE_GAP:
        raise RuntimeError(f"the tanks end {TANK_X[1] - tire_front:.3f} m ahead of the drive tire, under {TANK_TIRE_GAP} m")
    if TANK_X[1] <= arch_front_at(TANK_Z + TANK_R):
        raise RuntimeError("the tanks reach the drive wheel's fender")


def main() -> None:
    args = parse_args()
    check_hood()
    check_tires()
    check_sleeper()
    check_tanks()
    kit = Kit({**BASE_COLORS, "amber": 0xF2A22C}, SEED)  # amber: PAL.semi.amber
    hood(kit)
    grille(kit)
    fenders(kit)
    air_cleaners(kit)
    cab(kit)
    sleeper(kit)
    tanks(kit)
    chassis(kit)
    deck(kit)
    quarter_fenders(kit)
    stacks(kit)
    kit.socket("arch_front", (WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (-WHEEL_X, WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEEL_X, WHEEL_Z, HUB_Z + ARCH_R))
    fender_cells = {(x, y): FENDER_CROWN for x in (0, 6) for y in (0, 1, 2)}
    bay = {(x, y): BAY_FLOOR for x in (2, 3) for y in (1, 2)}
    level_sockets(kit, G, "row", [HOOD_TOP] * 3 + [ROOF] * 3 + [DECK] * 3, fronts={3: ROOF_FRONT}, cells=fender_cells | bay)
    level_sockets(kit, G, "floor", [HOOD_TOP] + [BAY_FLOOR] * 2 + [BELT] * 3 + [DECK] * 3)
    check_size(kit)
    kit.export("base_tractor", args, view_size=8.0)


if __name__ == "__main__":
    main()
