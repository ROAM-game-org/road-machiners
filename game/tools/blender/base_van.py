"""The van base: a 1980s Chevrolet G20 full-size van, the 125 in. wheelbase body, in the stylized style of the scout.

Built from the committee's three photos of a blue G20 Starcraft conversion: the right side, the front three-quarter and the
rear three-quarter. The real van is 5.14 m long and 2.0 m tall on a 0.367 m tire. Lengths scale by 1.14 to the 5.85 m grid, and
heights by the scout's 1.077, measured from the hub, so the rule tire lifts the body as on the scout. That makes it 5.85 m long,
2.42 m across the flares and 2.27 m tall on its tires. Levels: roof 1.009, windows 0.387 to 0.83, beltline and cowl 0.427, hood nose 0.2,
nose face top 0.115, waist band 0.222 to 0.33, rocker -0.564, bumpers -0.7 to -0.5. The windshield base sits at X 2.27 and its top
at X 1.7, so the roof runs flat from there to the tail. The roof edges round on a 0.3 by 0.17 m ellipse, the sides lean in 0.05 m
from the beltline to the roof, and the rear vertical corners round on 0.12 m in plan.
A short closed hood falls from the cowl to a rounded nose. The front face carries a pale bezel each side with two stacked lamps set
into it, a dark grille with chrome bars between the bezels, amber lamps under the bezels and a chrome bumper. The right side has the
front door window and two cargo door windows, the left side the front door window only. The rear has two doors with large windows,
tall red over white tail lamps at the outer lower corners and a chrome bumper. One trim band runs along the waist and across the doors.
Deviations from the photos: the wheels stay symmetric at 1.87 m off the center, the body is widened like the scout's, the tires are
the tire rule's 0.51 m, the mirrors, badges and roof rack are left out, one trim band stands for the pinstripes, and the engine shows
in a roof hatch cut over the engine bay of the chassis.ts layout, rows 4 to 6 and columns 3 and 4, 1.35 m long and 0.9 m wide, on a
dark floor 0.45 m under the center, PHYSICS.bodies.van.engineY.
Grid: 5 columns by 9 rows, 2.42 m across by 5.85 m along. Half height 0.5 m, from PHYSICS.bodies.van.
Wheels sit at X +-1.87, radius 0.51 m, half width 0.2 m, mount 0.35 m below the center, 0.968 m off the center line.
Sockets arch_front, arch_rear and arch_front_top mark the arches for wheelArches.test.ts.
Run: blender --background --python tools/blender/base_van.py -- public/models/base_van.glb [tmp/base_van.png]
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
from parts_common_base import (  # noqa: E402
    ARCH_CLEARANCE,
    BASE_COLORS,
    INSET,
    ROUND_ARCH_SEGMENTS,
    SUSPENSION_REST,
    Grid,
    arch_cut,
    check_base,
    check_door_gap,
    cut_boxes,
    door_sill,
    flare,
    hull_mesh,
    level_sockets,
)
from parts_common_core import PROUD  # noqa: E402
from shapes import prism  # noqa: E402

SEED = 302
COLORS = {
    **BASE_COLORS,
    "chrome": 0xC4C9CC,
    "amber": 0xF2A22C,
    "white": 0xE6E4DA,
}
LENGTH = 5.85
WIDTH = 2.42
HEIGHT_SCALE = 1.077
REAL_HUB = 0.367
G = Grid(rows=9, cols=5, half_height=0.5)
WHEEL_R = 0.51
WHEEL_HALF_W = 0.2
WHEEL_Z = 0.968
HUB_Z = -0.35 - SUSPENSION_REST
WHEELS_X = [1.87, -1.87]
ARCH_R = WHEEL_R + ARCH_CLEARANCE
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03


def up(real: float) -> float:
    """Base Z of a real G20 height over the ground, measured from the hub."""
    return HUB_Z + (real - REAL_HUB) * HEIGHT_SCALE


ROOF = up(2.0)
BELT = up(1.46)
HOOD_NOSE = up(1.25)
NOSE_TOP = up(1.17)
ROCKER = up(0.54)
BAND = (up(1.27), up(1.37))
BUMPER = (-0.7, -0.5)
ENGINE_Y = -0.45
GAME = Grid(rows=13, cols=5, half_height=0.5, length=5.85, width=2.25)  # chassis.ts layout inside its border cells
HATCH_FRONT = GAME.row_x(2.5)  # the roof hatch is the engine bay: layout rows 4 to 6, columns 3 and 4
HATCH_BACK = GAME.row_x(5.5)
HATCH_LEFT = GAME.col_y(1.5)
HATCH_RIGHT = GAME.col_y(3.5)
COAMING = 0.04
COAMING_RIM = 0.06

FRONT = G.half_x - INSET
BACK = -G.half_x + INSET
SIDE = G.half_y - INSET
COWL_X = 2.27
RAKE_TOP = 1.7
HOOD_END = FRONT - 0.1
TAIL_R = 0.12
SHOULDER = 0.06
UPPER_BOTTOM = BELT - 0.06
ROOF_W = 0.3
ROOF_H = 0.17
TUMBLE = 0.05
WINDOW = (BELT - 0.04, ROOF - ROOF_H - 0.01)
PILLAR = 0.14

FRONT_SEAM = 2.025
B_SEAM = 0.831
CARGO_SEAM = -0.162
REAR_SEAM = -0.808
FRONT_WINDOW_BACK = 0.946
CARGO_WINDOWS = ((0.765, -0.101), (-0.219, -0.692))

BEZEL_Y = (0.7, 1.06)
BEZEL_Z = (-0.42, 0.05)
LAMP_W = 0.26
LAMP_H = 0.16
RIM = 0.05
LAMP_GAP = 0.018


def hood_z(x: float) -> float:
    """The hood top at X, a straight fall from the cowl to the nose."""
    return BELT + (HOOD_NOSE - BELT) * (x - COWL_X) / (HOOD_END - COWL_X)


def rake_z(x: float) -> float:
    """The windshield's height on the center line at X."""
    return ROOF + (BELT - ROOF) * (x - RAKE_TOP) / (COWL_X - RAKE_TOP)


def rake_x(z: float) -> float:
    """The windshield's X on the center line at height z."""
    return RAKE_TOP + (COWL_X - RAKE_TOP) * (ROOF - z) / (ROOF - BELT)


def side_y(z: float) -> float:
    """The leaning upper side's Y at height z, between the beltline and the roof edge."""
    return SIDE - TUMBLE * (z - UPPER_BOTTOM) / (ROOF - ROOF_H - UPPER_BOTTOM)


def mirrored_side(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """A closed YZ outline from one side's points, bottom up, and their mirror, top down."""
    return points + [(-y, z) for y, z in reversed(points)]


def lower_profile(top: float, half: float) -> list[tuple[float, float]]:
    """The lower body's YZ outline: flat sides from the rocker, rounded shoulders and a flat top."""
    arc = [(half - SHOULDER + SHOULDER * math.cos(a), top - SHOULDER + SHOULDER * math.sin(a)) for a in (math.pi / 2 * k / 3 for k in range(4))]
    return mirrored_side([(half, ROCKER), *arc])


def upper_profile(top: float, half: float) -> list[tuple[float, float]]:
    """The upper body's YZ outline: sides leaning in from the beltline to an elliptic roof edge and a flat roof."""
    edge_h = min(ROOF_H, 0.5 * (top - UPPER_BOTTOM))
    edge_z = top - edge_h
    edge_y = half - TUMBLE * (edge_z - UPPER_BOTTOM) / (ROOF - ROOF_H - UPPER_BOTTOM)
    arc = [(edge_y - ROOF_W + ROOF_W * math.cos(a), edge_z + edge_h * math.sin(a)) for a in (math.pi / 2 * k / 6 for k in range(7))]
    return mirrored_side([(half, UPPER_BOTTOM), *arc])


def tail_sections() -> list[tuple[float, float]]:
    """The X and half width of each section round the rear vertical corners, from the tail face forward."""
    return [(BACK + TAIL_R - TAIL_R * math.cos(a), SIDE - TAIL_R + TAIL_R * math.sin(a)) for a in (math.pi / 2 * k / 3 for k in range(4))]


def loft_x(kit: Kit, name: str, sections: list[tuple[float, list[tuple[float, float]]]], mat: str) -> bpy.types.Object:
    """Joins YZ profiles of equal length at increasing X into one closed mesh, capped at both ends."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = [[bm.verts.new((x, y, z)) for y, z in profile] for x, profile in sections]
    if len({len(r) for r in rings}) != 1:
        raise ValueError(f"{name}: loft profiles differ in length")
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return kit._add(obj, name, mat, 0.0)


def slab(kit: Kit, name: str, x: tuple[float, float], y: tuple[float, float], z: tuple[float, float], mat: str) -> None:
    """A box between two corners, given as (low, high) per axis."""
    kit.box(name, (x[1] - x[0], y[1] - y[0], z[1] - z[0]), ((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2), mat)


def both_sides(kit: Kit, name: str, x: tuple[float, float], y: tuple[float, float], z: tuple[float, float], mat: str) -> None:
    """A slab on the left side at +Y and its twin on the right side."""
    slab(kit, f"{name}_l", x, y, z, mat)
    slab(kit, f"{name}_r", x, (-y[1], -y[0]), z, mat)


def hull(kit: Kit, name: str, mat: str, points: list[tuple[float, float, float]]) -> None:
    kit._add(hull_mesh(name, points), name, mat, 0.0)


def cut_hatch(body: bpy.types.Object) -> None:
    """Opens the engine bay through a body, from the engine floor up past the roof."""
    cut_boxes(body, [((HATCH_BACK, HATCH_RIGHT, ENGINE_Y - 0.02), (HATCH_FRONT, HATCH_LEFT, ROOF + 0.1))])


def coaming(kit: Kit) -> None:
    """A low rim round the roof hatch."""
    slab(kit, "coaming_front", (HATCH_FRONT, HATCH_FRONT + COAMING_RIM), (HATCH_RIGHT - COAMING_RIM, HATCH_LEFT + COAMING_RIM), (ROOF - 0.01, ROOF + COAMING), "under")
    slab(kit, "coaming_back", (HATCH_BACK - COAMING_RIM, HATCH_BACK), (HATCH_RIGHT - COAMING_RIM, HATCH_LEFT + COAMING_RIM), (ROOF - 0.01, ROOF + COAMING), "under")
    slab(kit, "coaming_l", (HATCH_BACK, HATCH_FRONT), (HATCH_LEFT, HATCH_LEFT + COAMING_RIM), (ROOF - 0.01, ROOF + COAMING), "under")
    slab(kit, "coaming_r", (HATCH_BACK, HATCH_FRONT), (HATCH_RIGHT - COAMING_RIM, HATCH_RIGHT), (ROOF - 0.01, ROOF + COAMING), "under")


def lower_body(kit: Kit) -> None:
    """The body below the beltline from the tail to the rounded nose, with the closed hood and round arches cut over the wheels."""
    sections = [(x, lower_profile(BELT, half)) for x, half in tail_sections()]
    sections += [(COWL_X, lower_profile(BELT, SIDE)), ((COWL_X + HOOD_END) / 2, lower_profile(hood_z((COWL_X + HOOD_END) / 2), SIDE))]
    sections += [(HOOD_END, lower_profile(HOOD_NOSE, SIDE - 0.01)), (FRONT - 0.035, lower_profile(HOOD_NOSE - 0.035, SIDE - 0.035)), (FRONT, lower_profile(NOSE_TOP, SIDE - 0.1))]
    body = loft_x(kit, "lower_body", sections, "paint")
    cut_hatch(body)
    arch_cut(body, WHEELS_X, HUB_Z, WHEEL_R, WELL_Y, G.bottom, segments=ROUND_ARCH_SEGMENTS)
    for i, wx in enumerate(WHEELS_X):
        flare(kit, f"flare{i}_l", G, wx, HUB_Z, WHEEL_R, SIDE, G.half_y, bottom=ROCKER, segments=ROUND_ARCH_SEGMENTS)
        flare(kit, f"flare{i}_r", G, wx, HUB_Z, WHEEL_R, -G.half_y, -SIDE, bottom=ROCKER, segments=ROUND_ARCH_SEGMENTS)
    step = WHEELS_X[0] - ARCH_R - 0.09
    both_sides(kit, "running_board", (-step, step), (SIDE - 0.12, G.half_y - 0.01), (BUMPER[0], ROCKER + 0.01), "under")
    slab(kit, "engine_floor", (-2.6, 2.6), (-WELL_Y, WELL_Y), (G.bottom, ENGINE_Y), "under")
    vent = [(x, y, hood_z(x) + d) for x in (COWL_X + 0.03, COWL_X + 0.15) for y in (-0.9, 0.9) for d in (-0.01, 0.012)]
    hull(kit, "cowl_vent", "under", vent)


def upper_body(kit: Kit) -> None:
    """The glasshouse from the raked windshield to the tail: leaning sides, round roof edges and a flat roof."""
    sections = [(x + PROUD * (k == 0), upper_profile(ROOF, half)) for k, (x, half) in enumerate(tail_sections())]
    sections += [(x, upper_profile(rake_z(x), SIDE)) for x in (RAKE_TOP + (COWL_X - RAKE_TOP) * s for s in (0.0, 0.25, 0.5, 0.75))]
    sections += [(COWL_X, upper_profile(BELT, SIDE))]
    cut_hatch(loft_x(kit, "upper_body", sections, "paint"))
    coaming(kit)
    normal = Vector((ROOF - BELT, 0.0, COWL_X - RAKE_TOP)).normalized()
    shield = []
    for z, half in ((BELT + 0.025, 1.0), (ROOF - 0.07, 0.86)):
        for d in (0.0, 0.015):
            for y in (-half, half):
                shield.append((rake_x(z) + normal.x * d, y, z + normal.z * d))
    hull(kit, "windshield", "glass", shield)


def side_window(kit: Kit, name: str, sign: int, back: float, front: float | None) -> None:
    """A pane on the leaning side from back to front, or to the windshield pillar when front is None."""
    points = []
    for z in WINDOW:
        nose = rake_x(z) - PILLAR if front is None else front
        check_door_gap(name, back, nose, WINDOW[0], WHEELS_X, HUB_Z, ARCH_R)
        for x in (back, nose):
            for d in (0.002, 0.014):
                points.append((x, sign * (side_y(z) + d), z))
    hull(kit, name, "glass", points)


def seam(kit: Kit, name: str, sign: int, x: float) -> None:
    """A dark door line on the lower side, from the lowest end that keeps DOOR_GAP to the beltline."""
    sill = door_sill(x - 0.01, x + 0.01, ROCKER + 0.04, WHEELS_X, HUB_Z, ARCH_R)
    check_door_gap(name, x - 0.01, x + 0.01, sill, WHEELS_X, HUB_Z, ARCH_R)
    y = sorted((sign * SIDE, sign * (SIDE + 0.006)))
    slab(kit, name, (x - 0.0125, x + 0.0125), (y[0], y[1]), (sill, BELT - 0.04), "under")


def sides(kit: Kit) -> None:
    """Door windows and lines: front door on both sides, two cargo doors on the right, and the waist band and side markers."""
    for sign, s in ((1, "l"), (-1, "r")):
        side_window(kit, f"door_window_{s}", sign, FRONT_WINDOW_BACK, None)
        seam(kit, f"front_seam_{s}", sign, FRONT_SEAM)
        seam(kit, f"b_seam_{s}", sign, B_SEAM)
    for i, (front, back) in enumerate(CARGO_WINDOWS):
        side_window(kit, f"cargo_window{i}", -1, back, front)
    seam(kit, "cargo_seam", -1, CARGO_SEAM)
    seam(kit, "cargo_back_seam", -1, REAR_SEAM)
    lo, hi = BAND
    nose = FRONT - 0.08
    drop = hi - (hood_z(nose) - 0.04)
    band = [(BACK + TAIL_R, lo), (COWL_X, lo), (nose, lo - drop), (nose, hi - drop), (COWL_X, hi), (BACK + TAIL_R, hi)]
    prism(kit, "band_l", band, SIDE, SIDE + 0.012, "trim")
    prism(kit, "band_r", band, -SIDE - 0.012, -SIDE, "trim")
    both_sides(kit, "front_marker", (2.62, 2.8), (SIDE, SIDE + 0.012), (-0.25, -0.14), "amber")
    both_sides(kit, "rear_marker", (-2.62, -2.46), (SIDE, SIDE + 0.012), (-0.25, -0.14), "amber")


def nose(kit: Kit) -> None:
    """The front face: a pale bezel each side with two stacked lamps set into it, the barred grille, amber lamps and the bumper."""
    face = FRONT - 0.005
    rim = (face, FRONT + 0.03)
    for sign, s in ((1, "l"), (-1, "r")):
        ys = sorted((sign * BEZEL_Y[0], sign * BEZEL_Y[1]))
        inset = (ys[0] + PROUD, ys[1] - PROUD)
        slab(kit, f"bezel_back_{s}", (face, FRONT + 0.005), inset, (BEZEL_Z[0] + PROUD, BEZEL_Z[1] - PROUD), "under")
        lamp_y = (BEZEL_Y[0] + BEZEL_Y[1]) / 2
        for i in range(2):
            z0 = BEZEL_Z[0] + RIM + i * (LAMP_H + RIM)
            lens = sorted((sign * (lamp_y - LAMP_W / 2 + LAMP_GAP), sign * (lamp_y + LAMP_W / 2 - LAMP_GAP)))
            slab(kit, f"lamp{i}_{s}", (FRONT, FRONT + 0.008), lens, (z0 + LAMP_GAP, z0 + LAMP_H - LAMP_GAP), "light")
        lamp_top = BEZEL_Z[0] + 2 * (LAMP_H + RIM)
        rims = [(z, z + RIM if i < 2 else BEZEL_Z[1]) for i, z in enumerate((BEZEL_Z[0], BEZEL_Z[0] + LAMP_H + RIM, lamp_top))]
        for i, z in enumerate(rims):
            slab(kit, f"bezel_rim{i}_{s}", rim, (ys[0], ys[1]), z, "chrome")
        width = (BEZEL_Y[1] - BEZEL_Y[0] - LAMP_W) / 2
        for i, (below, above) in enumerate(zip(rims, rims[1:])):
            for j, y in enumerate((BEZEL_Y[0], BEZEL_Y[1] - width)):
                slab(kit, f"bezel_post{i}{j}_{s}", rim, sorted((sign * y, sign * (y + width))), (below[1], above[0]), "chrome")
        slab(kit, f"turn_lamp_{s}", (face, FRONT + 0.02), sorted((sign * (BEZEL_Y[0] + 0.06), sign * (BEZEL_Y[1] - 0.06))), (BUMPER[1], BEZEL_Z[0]), "amber")
    grille_y = BEZEL_Y[0] - 0.02
    slab(kit, "grille", (face, FRONT + 0.005), (-grille_y + PROUD, grille_y - PROUD), (BEZEL_Z[0] + PROUD, BEZEL_Z[1] - PROUD), "under")
    bar = 0.04
    for i in range(4):
        z = BEZEL_Z[0] + (BEZEL_Z[1] - BEZEL_Z[0] - bar) * i / 3
        slab(kit, f"grille_bar{i}", (face, FRONT + 0.025), (-grille_y, grille_y), (z, z + bar), "chrome")
    for i, y in enumerate((-0.35, 0.0, 0.35)):
        slab(kit, f"grille_post{i}", (face, FRONT + 0.02), (y - bar / 2, y + bar / 2), (BEZEL_Z[0] + bar, BEZEL_Z[1] - bar), "chrome")
    slab(kit, "bumper", (FRONT - 0.04, G.half_x), (-SIDE + 0.06, SIDE - 0.06), BUMPER, "chrome")


def tail(kit: Kit) -> None:
    """The rear: two doors with a center line and large windows, tall tail lamps at the outer lower corners, the band and the bumper."""
    flat = SIDE - TAIL_R
    out = (BACK - 0.012, BACK)
    slab(kit, "rear_door_line", (BACK - 0.006, BACK), (-0.0125, 0.0125), (ROCKER + 0.04, ROOF - 0.08), "under")
    both_sides(kit, "rear_window", out, (0.12, flat - 0.16), (0.4, ROOF - 0.12), "glass")
    slab(kit, "rear_band", out, (-flat, flat), BAND, "trim")
    both_sides(kit, "tail_lamp", (BACK - 0.02, BACK), (flat - 0.24, flat - 0.02), (-0.08, 0.16), "red")
    both_sides(kit, "reverse_lamp", (BACK - 0.02, BACK), (flat - 0.24, flat - 0.02), (-0.22, -0.08), "white")
    slab(kit, "rear_bumper", (-G.half_x, BACK + 0.04), (-SIDE + 0.06, SIDE - 0.06), BUMPER, "chrome")


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
        raise RuntimeError(f"base_van is {hi.x - lo.x:.3f} x {hi.y - lo.y:.3f} m, not {LENGTH} x {WIDTH} m")


def check_wheels() -> None:
    """Raises when a tire leaves the body side or rubs the well wall."""
    if WHEEL_Z + WHEEL_HALF_W > SIDE:
        raise RuntimeError(f"the tire reaches {WHEEL_Z + WHEEL_HALF_W:.3f} m, past the body side at {SIDE:.3f}")


def check_hatch() -> None:
    """Raises when the roof hatch and its rim leave the flat roof."""
    if HATCH_FRONT + COAMING_RIM > RAKE_TOP:
        raise RuntimeError(f"the hatch rim reaches x {HATCH_FRONT + COAMING_RIM:.3f}, past the flat roof's front at {RAKE_TOP:.3f}")


def main() -> None:
    args = parse_args()
    check_wheels()
    kit = Kit(COLORS, SEED)
    lower_body(kit)
    upper_body(kit)
    sides(kit)
    nose(kit)
    tail(kit)
    kit.socket("arch_front", (WHEELS_X[0], WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (WHEELS_X[1], WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEELS_X[0], WHEEL_Z, HUB_Z + ARCH_R))
    level_sockets(kit, G, "row", [round(hood_z(G.row_x(0)), 3), round(rake_z(G.row_x(1)), 3)] + [ROOF] * 7)
    level_sockets(kit, G, "floor", [ENGINE_Y] * G.rows)
    check_size(kit)
    check_hatch()
    check_base(kit, "base_van", G)
    kit.export("base_van", args, view_size=7.2)


if __name__ == "__main__":
    main()
