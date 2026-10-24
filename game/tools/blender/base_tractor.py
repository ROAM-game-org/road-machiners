"""The tractor base: a Kenworth W900L 4x2 day cab, the long-hood American semi tractor, with a gun deck behind its cab.

Built from published W900L day cab numbers (tmp/models/base_tractor/asset-brief.md), scaled by S = 6.40 / 6.30 on every axis:
6.40 m long, 2.63 m across the fenders and tanks, the cab roof 3.05 m and the stacks 4.10 m over the ground.
The ground is 1.62 m below the center. Heights below are given over the ground and turned into Z by up().
The long square hood runs from the grille, 0.26 m behind the bumper face, to the cowl 2.20 m back, 1.28 m wide with rounded
shoulders, its top at 1.95 m. Swept painted fenders rise from the bumper over the steer wheels and fall behind them to the cowl,
with round twin lamps on their fronts and round chrome air cleaners standing on their tails. The upright day cab, 2.08 m wide,
stands from the cowl to 3.42 m behind the bumper: painted doors to the 2.15 m beltline, a split windshield under a sun visor,
and a trim roof with rounded edges. Round chrome saddle tanks and steps hang under the doors, and twin round stacks stand
behind the cab. The flat deck behind it is full width ahead of the drive wheels and narrower over them, with a round
fifth-wheel plate, dark round quarter fenders and mud flaps.
Deviations from the W900 numbers, forced by the game: the tires follow the tire rule at 0.77 m, not 0.54 m, so the fenders
and the deck rise to clear them; the wheels stay symmetric at 2.10 m from the center, a 4.20 m wheelbase, so the bigger tire
keeps off the bumper; the track is 1.94 m so the tire stays under the fender; the hood is 1.28 m wide to hold the engine hole;
the deck top stands 1.74 m up, over the tires, where the real frame is 1.05 m.
The engine shows through a hole in the hood over the engine cells, on a dark bay floor at 1.70 m: restOn() of the engine
cells, centered on PHYSICS.bodies.tractor.engine.
Grid: 7 columns by 9 rows, stretched over the model by the projection. Half height 0.65 m, from PHYSICS.bodies.tractor.
Wheels sit on rows 1 and 6, radius 0.77 m, half width 0.325 m, mount 0.45 m below the center, 0.97 m off the center line.
Sockets arch_front, arch_rear and arch_front_top (the arch crown) mark the arches for wheelArches.test.ts.
Every round part uses ROUND_SEGMENTS or SMALL_ROUND_SEGMENTS, and the build checks the counts.
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
CAB_HALF = 1.04
HOOD_HALF = 0.64
HOOD_ROUND = 0.16
LOWER_HALF = WELL_Y - 0.02


def up(h: float) -> float:
    """Z of a height over the ground."""
    return GROUND + h


BUMPER = (up(0.56), up(0.86))
HOOD_TOP = up(1.95)
HOOD_FOOT = up(1.62)
FENDER_CROWN = up(1.78)
SILL = up(1.15)
BELT = up(2.15)
UNDER_ROOF = up(2.95)
SINK = 0.03  # how far the glass runs into the belt and the roof, so no glass face shares a plane with a pillar
ROOF = up(3.05)
RAKE = 0.14
ROOF_FRONT = COWL_X - RAKE - 0.04
DECK = up(1.74)
DECK_T = 0.12
DECK_HALF = 0.94
WIDE_DECK_END = -WHEEL_X + ARCH_R + 0.04
FRAME_BOTTOM = up(0.75)
RAIL_TOP = up(1.1)
STACK_TOP = up(4.10)
STACK_R = 0.09
STACK_X = CAB_BACK - 0.12
STACK_Y = 0.80
TANK_R = 0.31
TANK_Z = up(0.85)
TANK_X = (COWL_X - 0.03, CAB_BACK + 0.12)
CLEANER_R = 0.23
CLEANER_X = COWL_X + 0.30
CLEANER_Y = HOOD_HALF + CLEANER_R + 0.05
CLEANER = (up(1.40), up(2.02))
LAMP_R = 0.11
FIFTH_WHEEL_R = 0.45

ENGINE_X = 1.783  # PHYSICS.bodies.tractor.engine.x
ENGINE_Y = 0.189  # -PHYSICS.bodies.tractor.engine.z
ENGINE_HALF = (0.714, 0.378)  # the drawn engine: restOn() of the engine cells, over the bay floor
BAY_FLOOR = up(1.70)  # PHYSICS.bodies.tractor.engine.y
HOLE_MARGIN = 0.02
HOLE = ((ENGINE_X - ENGINE_HALF[0] - HOLE_MARGIN, ENGINE_Y - ENGINE_HALF[1] - HOLE_MARGIN), (ENGINE_X + ENGINE_HALF[0] + HOLE_MARGIN, ENGINE_Y + ENGINE_HALF[1] + HOLE_MARGIN))


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


def hood_section(half: float, bottom: float, top: float) -> list[tuple[float, float]]:
    """A YZ outline from bottom to top, half wide, its top corners rounded."""
    right = arc(half - HOOD_ROUND, top - HOOD_ROUND, HOOD_ROUND, 0.0, math.pi / 2, 4)
    left = arc(-half + HOOD_ROUND, top - HOOD_ROUND, HOOD_ROUND, math.pi / 2, math.pi, 4)
    return [(-half, bottom), (half, bottom), *right, *left]


def hood(kit: Kit) -> None:
    """A long square hood with rounded shoulders over a narrow lower body between the wheels, open over the engine cells."""
    upper = prism_across(kit, "hood", hood_section(HOOD_HALF, HOOD_FOOT, HOOD_TOP), COWL_X, GRILLE_X, "paint")
    (x0, y0), (x1, y1) = HOLE
    cut_boxes(upper, [((x0, y0, BAY_FLOOR - 0.02), (x1, y1, HOOD_TOP + 0.1))])
    upper.data.materials.clear()
    upper.data.materials.append(kit._materials["paint"])
    kit.box("bay_floor", (x1 - x0, y1 - y0, 0.02), ((x0 + x1) / 2, (y0 + y1) / 2, BAY_FLOOR - 0.01), "metal")
    kit.box("hood_lower", (GRILLE_X - COWL_X, 2 * LOWER_HALF, HOOD_FOOT - BUMPER[1]), ((GRILLE_X + COWL_X) / 2, 0, (HOOD_FOOT + BUMPER[1]) / 2), "paint")


def grille(kit: Kit) -> None:
    """A tall chrome grille frame around a dark core with chrome bars, and a wide chrome bumper under it."""
    half = HOOD_HALF - 0.07
    bottom, top = BUMPER[1] + 0.02, HOOD_TOP - 0.06
    mid = (bottom + top) / 2
    kit.box("grille_frame", (0.04, 2 * half, top - bottom), (GRILLE_X + 0.02, 0, mid), "metal_light")
    kit.box("grille_core", (0.03, 2 * half - 0.2, top - bottom - 0.24), (GRILLE_X + 0.035, 0, mid - 0.02), "under")
    bars = 5
    for i in range(1, bars):
        z = bottom + 0.1 + (top - bottom - 0.34) * i / bars
        kit.box(f"grille_bar{i}", (0.03, 2 * half - 0.2, 0.06), (GRILLE_X + 0.045, 0, z), "metal_light")
    kit.box("grille_badge", (0.03, 2 * half - 0.2, 0.1), (GRILLE_X + 0.045, 0, top - 0.12), "metal_light")
    kit.box("bumper", (FRONT - BUMPER_BACK, 2 * (SIDE - 0.08), BUMPER[1] - BUMPER[0]), ((FRONT + BUMPER_BACK) / 2, 0, (BUMPER[0] + BUMPER[1]) / 2), "metal_light")


def fender_outline() -> list[tuple[float, float]]:
    """The XZ outline of a front fender: rising from over the bumper to a crown over the wheel and sweeping down to the cowl."""
    front = GRILLE_X - 0.02
    face_top = up(1.2)
    crown_x = WHEEL_X - 0.2
    rise = [(crown_x + (front - crown_x) * math.cos(math.pi / 2 * k / 12), face_top + (FENDER_CROWN - face_top) * math.sin(math.pi / 2 * k / 12)) for k in range(13)]
    crown_back = crown_x - 0.3
    tail_x, tail_z = COWL_X + 0.12, up(1.15)
    sweep = [(crown_back - (crown_back - tail_x) * (1 - math.cos(math.pi * k / 10)) / 2, FENDER_CROWN - (FENDER_CROWN - tail_z) * (1 - math.cos(math.pi * k / 10)) / 2) for k in range(1, 11)]
    top = [(front, BUMPER[1])] + rise + sweep
    arch = [p for p in wheel_arch(WHEEL_X, ARCH_R, tail_x, front) if p[0] > tail_x and p[0] < front]
    return top + [(tail_x, HUB_Z)] + arch + [(front, HUB_Z)]


def fenders(kit: Kit) -> None:
    """Painted swept fenders from the hood side out to the body side, with round twin lamps in chrome bezels on their fronts."""
    outline = fender_outline()
    prism(kit, "fender_l", outline, HOOD_HALF - 0.04, SIDE, "paint")
    prism(kit, "fender_r", outline, -SIDE, -HOOD_HALF + 0.04, "paint")
    front = GRILLE_X - 0.02
    lamp_z = up(1.04)
    for s, sign in (("l", 1), ("r", -1)):
        for i, y in enumerate((0.88, 1.12)):
            round_part(kit, f"lamp_bezel_{s}{i}", LAMP_R + 0.025, 0.04, (front + 0.02, sign * y, lamp_z), "metal_light", SMALL_ROUND_SEGMENTS, SMALL_ROUND_SEGMENTS, rot=ALONG_X)
            round_part(kit, f"lamp_{s}{i}", LAMP_R, 0.04, (front + 0.035, sign * y, lamp_z), "light", SMALL_ROUND_SEGMENTS, SMALL_ROUND_SEGMENTS, rot=ALONG_X)


def air_cleaners(kit: Kit) -> None:
    """Round chrome air cleaners standing on the fender tails by the cowl, with dark bands and caps."""
    lo, hi = CLEANER
    for s, sign in (("l", 1), ("r", -1)):
        y = sign * CLEANER_Y
        round_part(kit, f"air_cleaner_{s}", CLEANER_R, hi - lo, (CLEANER_X, y, (lo + hi) / 2), "metal_light", ROUND_SEGMENTS, ROUND_SEGMENTS)
        round_part(kit, f"air_cleaner_band_{s}", CLEANER_R + 0.012, 0.08, (CLEANER_X, y, lo + 0.18), "metal", ROUND_SEGMENTS, ROUND_SEGMENTS)
        kit.box(f"air_cleaner_bracket_{s}", (0.24, 0.16, lo - up(1.12)), (CLEANER_X - 0.1, y, (lo + up(1.12)) / 2), "metal")
        round_part(kit, f"air_cleaner_cap_{s}", CLEANER_R + 0.02, 0.06, (CLEANER_X, y, hi), "metal", ROUND_SEGMENTS, ROUND_SEGMENTS)


def cab(kit: Kit) -> None:
    """An upright day cab: painted doors, a split windshield, side windows, a sun visor and a trim roof with rounded edges."""
    kit.box("doors", (COWL_X - CAB_BACK, 2 * CAB_HALF, BELT - SILL), ((COWL_X + CAB_BACK) / 2, 0, (BELT + SILL) / 2), "paint")
    rake_top = COWL_X - RAKE
    inner = CAB_HALF - 0.04
    prism(kit, "glass", [(CAB_BACK + 0.04, BELT - SINK), (COWL_X - 0.02, BELT - SINK), (rake_top, UNDER_ROOF + SINK), (CAB_BACK + 0.04, UNDER_ROOF + SINK)], -inner, inner, "glass")
    for s, (y0, y1) in (("l", (CAB_HALF - 0.06, CAB_HALF)), ("r", (-CAB_HALF, -CAB_HALF + 0.06))):
        prism(kit, f"a_pillar_{s}", [(COWL_X - 0.12, BELT), (COWL_X, BELT), (rake_top, UNDER_ROOF), (rake_top - 0.12, UNDER_ROOF)], y0, y1, "paint")
        kit.box(f"door_post_{s}", (0.14, y1 - y0, UNDER_ROOF - BELT), (CAB_BACK + 0.62, (y0 + y1) / 2, (BELT + UNDER_ROOF) / 2), "paint")
        kit.box(f"back_pillar_{s}", (0.2, y1 - y0, UNDER_ROOF - BELT), (CAB_BACK + 0.1, (y0 + y1) / 2, (BELT + UNDER_ROOF) / 2), "paint")
    prism(kit, "split_bar", [(COWL_X - 0.1, BELT), (COWL_X, BELT), (rake_top + 0.02, UNDER_ROOF), (rake_top - 0.08, UNDER_ROOF)], -0.05, 0.05, "paint")
    kit.box("back_wall", (0.06, 2 * CAB_HALF, UNDER_ROOF - SILL), (CAB_BACK + 0.03, 0, (SILL + UNDER_ROOF) / 2), "paint")
    kit.box("back_glass", (0.02, 0.9, 0.42), (CAB_BACK - 0.005, 0, BELT + 0.36), "glass")
    layers = [(UNDER_ROOF, rake_top + 0.02, CAB_BACK, CAB_HALF, 0.0), (ROOF - 0.04, ROOF_FRONT, CAB_BACK, CAB_HALF, 0.04), (ROOF, ROOF_FRONT - 0.04, CAB_BACK + 0.04, CAB_HALF - 0.05, 0.08)]
    pts = []
    for z, xf, xb, hy, c in layers:
        for y in (hy, -hy):
            pts += [(xf - c, y, z), (xb + c, y, z)]
        for x in (xf, xb):
            pts += [(x, hy - c, z), (x, -hy + c, z)]
    kit._add(hull_mesh("roof", list(dict.fromkeys(pts))), "roof", "trim", 0.0)
    prism(kit, "visor", [(rake_top - 0.02, UNDER_ROOF - 0.04), (rake_top + 0.24, UNDER_ROOF - 0.14), (rake_top + 0.24, UNDER_ROOF - 0.1), (rake_top, UNDER_ROOF + 0.02)], -CAB_HALF + 0.02, CAB_HALF - 0.02, "trim")
    kit.box("core_cab", (COWL_X - CAB_BACK, 2 * (SIDE - 2 * TANK_R), SILL - FRAME_BOTTOM), ((COWL_X + CAB_BACK) / 2, 0, (SILL + FRAME_BOTTOM) / 2), "under")


def tanks(kit: Kit) -> None:
    """Round chrome saddle tanks under the doors with dark straps, and dark steps behind them."""
    x0, x1 = TANK_X
    length = x0 - x1
    mid = (x0 + x1) / 2
    for s, sign in (("l", 1), ("r", -1)):
        y = sign * (SIDE - TANK_R - 0.012)
        round_part(kit, f"tank_{s}", TANK_R, length, (mid, y, TANK_Z), "metal_light", ROUND_SEGMENTS, ROUND_SEGMENTS, rot=ALONG_X)
        for i, x in enumerate((x0 - 0.2, x1 + 0.2)):
            round_part(kit, f"tank_strap_{s}{i}", TANK_R + 0.012, 0.08, (x, y, TANK_Z), "under", ROUND_SEGMENTS, ROUND_SEGMENTS, rot=ALONG_X)
    step_x = (x1 + CAB_BACK - 0.08) / 2
    mirrored(kit, "step", (x1 - CAB_BACK + 0.08, 0.36, SILL - TANK_Z + TANK_R), step_x, SIDE - 0.2, (SILL + TANK_Z - TANK_R) / 2, "under")


def chassis(kit: Kit) -> None:
    """The dark frame rails from the bumper to the tail, the steer and drive axles, and the dark core over the front axle."""
    mirrored(kit, "rail", (FRONT - BACK - 0.34, 0.14, RAIL_TOP - FRAME_BOTTOM), (BUMPER_BACK + BACK + 0.06) / 2, 0.42, (RAIL_TOP + FRAME_BOTTOM) / 2, "under")
    for i, wx in enumerate(WHEELS_X):
        kit.box(f"axle{i}", (0.16, 2 * WELL_Y, 0.16), (wx, 0, HUB_Z), "under")


def deck(kit: Kit) -> None:
    """The flat deck: full width from the cab to the drive wheels, narrower over them, with a round fifth-wheel plate."""
    wide = CAB_BACK - WIDE_DECK_END
    kit.box("deck_wide", (wide, 2 * SIDE, DECK_T), ((CAB_BACK + WIDE_DECK_END) / 2, 0, DECK - DECK_T / 2), "metal_light")
    narrow = WIDE_DECK_END - BACK
    kit.box("deck_narrow", (narrow + 0.01, 2 * DECK_HALF, DECK_T), ((WIDE_DECK_END + BACK) / 2 + 0.005, 0, DECK - DECK_T / 2), "metal_light")
    mirrored(kit, "deck_rail", (wide, 0.02, DECK_T), (CAB_BACK + WIDE_DECK_END) / 2, SIDE - 0.01, DECK - DECK_T / 2, "paint")
    mirrored(kit, "deck_rail_rear", (narrow, 0.02, DECK_T), (WIDE_DECK_END + BACK) / 2, DECK_HALF - 0.01, DECK - DECK_T / 2, "paint")
    kit.box("deck_core", (CAB_BACK - BACK - 0.06, 0.7, DECK - DECK_T - RAIL_TOP), ((CAB_BACK + BACK) / 2, 0, (DECK - DECK_T + RAIL_TOP) / 2), "metal_dark")
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
    """Twin round chrome stacks behind the cab, from the deck to 4.1 m, with heat shields."""
    for s, sign in (("l", 1), ("r", -1)):
        y = sign * STACK_Y
        round_part(kit, f"stack_{s}", STACK_R, STACK_TOP - DECK, (STACK_X, y, (STACK_TOP + DECK) / 2), "metal_light", SMALL_ROUND_SEGMENTS, SMALL_ROUND_SEGMENTS)
        round_part(kit, f"stack_shield_{s}", STACK_R + 0.035, 0.9, (STACK_X, y, up(2.75)), "metal", SMALL_ROUND_SEGMENTS, SMALL_ROUND_SEGMENTS)
        kit.box(f"stack_bracket_{s}", (0.12, 0.06, 0.06), (CAB_BACK - 0.06, y, up(2.4)), "metal")


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


def check_hood() -> None:
    """Raises when the hood hole does not hold the drawn engine with its margin, or leaves the hood."""
    (x0, y0), (x1, y1) = HOLE
    if x0 <= COWL_X or x1 >= GRILLE_X or abs(y0) >= HOOD_HALF or abs(y1) >= HOOD_HALF:
        raise RuntimeError(f"hood hole x {x0:.3f}..{x1:.3f} y {y0:.3f}..{y1:.3f} leaves the hood")


def check_tires() -> None:
    """Raises when a tire at its physics mount reaches the bumper, the deck or past the body side."""
    bumper_reach = WHEEL_X + math.sqrt(max(0.0, WHEEL_R**2 - (BUMPER[1] - HUB_Z) ** 2))
    if bumper_reach > BUMPER_BACK - 0.02:
        raise RuntimeError(f"the steer tire reaches x {bumper_reach:.3f}, into the bumper at {BUMPER_BACK:.3f}")
    if HUB_Z + WHEEL_R + ARCH_CLEARANCE > DECK - DECK_T:
        raise RuntimeError("the drive tire reaches the deck")
    if WHEEL_Z + WHEEL_HALF_W > SIDE:
        raise RuntimeError("the tires stand out past the body side")


def main() -> None:
    args = parse_args()
    check_hood()
    check_tires()
    kit = Kit(BASE_COLORS, SEED)
    hood(kit)
    grille(kit)
    fenders(kit)
    air_cleaners(kit)
    cab(kit)
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
    level_sockets(kit, G, "row", [HOOD_TOP] * 3 + [ROOF] * 2 + [DECK] * 4, fronts={3: ROOF_FRONT}, cells=fender_cells | bay)
    level_sockets(kit, G, "floor", [HOOD_TOP] + [BAY_FLOOR] * 2 + [BELT] * 2 + [DECK] * 4)
    check_size(kit)
    kit.export("base_tractor", args, view_size=8.0)


if __name__ == "__main__":
    main()
