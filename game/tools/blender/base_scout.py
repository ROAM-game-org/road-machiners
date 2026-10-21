"""The scout base: a lifted 1997 Toyota HiLux Mk IV 4WD regular-cab long-bed pickup, from the the-blueprints.com sheet.

Measured from the sheet and scaled by 1.077: 5.2 m long, 2.2 m wide across the flares, 2.09 m tall on its tires, a 3.25 m wheelbase.
The ground is 1.16 m below the center. Levels: roof 0.93, beltline and bed rail 0.37, painted body bottom -0.34, frame and steps
down to -0.45, axles down to -0.63. The closed hood falls from 0.39 at the cowl (x 0.96) to 0.21 at the nose. The windshield rakes
back to the roof front at x 0.36, the painted roof is narrower than the body and ends at the cab back, x -0.45, and a 0.05 m gap
parts the cab from the long bed. The arches are squared like the sheet's: straight sides 0.56 m from the hub, a flat chamfered crown
at 0.08, and a dark flare band over them to 0.17. A trim body line runs along each side, broken by the arches.
The nose is a dark grille band between square lamps over a dark bumper. Tall taillights stand at the bed corners over a step bumper.
Deviations from the sheet: the wheels stay symmetric, the cowl sits 0.05 of the length back so the engine bay fits under the hood,
and the tires keep the tire rule's 0.46 m radius.
The engine shows through a hole in the hood, x 1.0 to 1.95, over a dark bay floor at 0.05: the part of the engine cells that
restOn() rests on the floor, centered on PHYSICS.bodies.pickup.engine.
Grid: 5 columns by 8 rows, stretched over the model by the projection. Half height 0.45 m, from PHYSICS.bodies.pickup.
Wheels sit on rows 1 and 6, radius 0.46 m, half width 0.185 m, mount 0.3 m below the center, 1.0 m off the center line.
Sockets arch_front, arch_rear and arch_front_top (the painted crown) mark the arches for wheelArches.test.ts.
Run: blender --background --python tools/blender/base_scout.py -- public/models/base_scout.glb [tmp/base_scout.png]
"""

from __future__ import annotations

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
    SUSPENSION_REST,
    Grid,
    arch_profile,
    check_base,
    cut_boxes,
    flare,
    hull_mesh,
    level_sockets,
)
from shapes import prism  # noqa: E402

SEED = 301
LENGTH = 5.2
WIDTH = 2.2
G = Grid(rows=8, cols=5, half_height=0.45)
WHEEL_R = 0.46  # PHYSICS.bodies.pickup.wheelRadius
WHEEL_HALF_W = 0.185  # PHYSICS.bodies.pickup.wheelHalfWidth
WHEEL_Z = 1.0  # PHYSICS.bodies.pickup.wheelZ
HUB_Z = -0.3 - SUSPENSION_REST  # PHYSICS.bodies.pickup.wheelY
WHEELS_X = [G.row_x(1), G.row_x(6)]
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03
FLARE_OUT = 0.075

ARCH_R = 0.5  # with ARCH_CLEARANCE, the arch sides stand 0.56 m from the hub
ARCH_CROWN_Z = 0.08
ARCH_CROWN = ARCH_CROWN_Z - HUB_Z
ARCH_CHAMFER = 0.25

ROOF = 0.93
ROOF_T = 0.07
UNDER_ROOF = ROOF - ROOF_T
BELT = 0.37
BODY_BOTTOM = -0.34
FRAME_BOTTOM = -0.45
AXLE_BOTTOM = -0.63
FLOOR = 0.05
SIDE = WIDTH / 2 - FLARE_OUT
FRONT = LENGTH / 2 - 0.05
BACK = -FRONT
NOSE_TOP = 0.21
COWL_X = 0.96
COWL_TOP = 0.39
ROOF_FRONT = 0.36
CAB_BACK = -0.45
BED_FRONT = -0.50
BED_WALL = 0.08
LAMP_Y = 0.62
STRIPE_Z = -0.09
STRIPE_H = 0.1

ENGINE_X = 1.475  # PHYSICS.bodies.pickup.engine.x
ENGINE_Y = 0.242  # -PHYSICS.bodies.pickup.engine.z
ENGINE_HALF = (0.475, 0.396)  # the drawn engine: restOn() of the engine cells, over the bay floor
HOLE_MARGIN = 0.02
HOLE = ((ENGINE_X - ENGINE_HALF[0] - HOLE_MARGIN, ENGINE_Y - ENGINE_HALF[1] - HOLE_MARGIN), (ENGINE_X + ENGINE_HALF[0] + HOLE_MARGIN, ENGINE_Y + ENGINE_HALF[1] + HOLE_MARGIN))


def hood_top(x: float) -> float:
    return NOSE_TOP + (COWL_TOP - NOSE_TOP) * (FRONT - x) / (FRONT - COWL_X)


def mirrored(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def hull(kit: Kit, name: str, mat: str, points: list[tuple[float, float, float]]) -> bpy.types.Object:
    return kit._add(hull_mesh(name, points), name, mat, 0.0)


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


def side_skins(kit: Kit) -> None:
    """Painted sides from the body bottom to the beltline and the falling hood line, squared arches, and the cab to bed gap."""
    profile = arch_profile(G, WHEELS_X, HUB_Z, ARCH_R, BELT, bottom=BODY_BOTTOM, nose_top=NOSE_TOP, cowl_x=COWL_X, crown=ARCH_CROWN, chamfer=ARCH_CHAMFER)
    for part, (x0, x1) in (("front", (CAB_BACK, FRONT + 1)), ("bed", (-FRONT - 1, BED_FRONT))):
        piece = clip_x(profile, x0, x1)
        prism(kit, f"skin_{part}_l", piece, WELL_Y, SIDE, "paint")
        prism(kit, f"skin_{part}_r", piece, -SIDE, -WELL_Y, "paint")


def flares(kit: Kit) -> None:
    for i, wx in enumerate(WHEELS_X):
        flare(kit, f"flare{i}_l", G, wx, HUB_Z, ARCH_R, SIDE, SIDE + FLARE_OUT, bottom=BODY_BOTTOM, crown=ARCH_CROWN, chamfer=ARCH_CHAMFER)
        flare(kit, f"flare{i}_r", G, wx, HUB_Z, ARCH_R, -SIDE - FLARE_OUT, -SIDE, bottom=BODY_BOTTOM, crown=ARCH_CROWN, chamfer=ARCH_CHAMFER)


def underbody(kit: Kit) -> None:
    """The dark core between the wells, the frame rails, the axles with their differentials and the rocker steps, showing under the lifted body."""
    kit.box("core", (FRONT - BACK - 0.08, 2 * WELL_Y, FLOOR - FRAME_BOTTOM), (0, 0, (FLOOR + FRAME_BOTTOM) / 2), "under")
    mirrored(kit, "rail", (LENGTH - 0.5, 0.12, 0.12), 0, 0.46, FRAME_BOTTOM - 0.02, "under")
    for i, wx in enumerate(WHEELS_X):
        kit.box(f"axle{i}", (0.14, 2 * WELL_Y, 0.12), (wx, 0, AXLE_BOTTOM + 0.06), "under")
        kit.box(f"diff{i}", (0.34, 0.34, FRAME_BOTTOM - AXLE_BOTTOM), (wx, 0.12, (AXLE_BOTTOM + FRAME_BOTTOM) / 2), "under")
    mirrored(kit, "step", (1.5, 0.16, 0.08), (COWL_X + CAB_BACK) / 2 - 0.15, SIDE - 0.06, BODY_BOTTOM - 0.08, "under")


def stripe(kit: Kit) -> None:
    """The trim body line along each side, from the nose to the tail, broken by the flares and the cab to bed gap."""
    reach = ARCH_R + ARCH_CLEARANCE + FLARE
    front, rear = WHEELS_X
    spans = [(front + reach, FRONT), (BED_FRONT, rear + reach), (rear - reach, BACK)]
    spans.insert(1, (CAB_BACK, front - reach))
    for i, (a, b) in enumerate(spans):
        lo, hi = min(a, b), max(a, b)
        mirrored(kit, f"stripe{i}", (hi - lo, 0.012, STRIPE_H), (lo + hi) / 2, SIDE + 0.006, STRIPE_Z, "trim")


def hood(kit: Kit) -> None:
    """A closed hood from the cowl falling to the nose, with a hole for the engine over a dark bay floor."""
    slab = [(COWL_X, FLOOR), (FRONT, FLOOR), (FRONT, NOSE_TOP), (COWL_X, COWL_TOP)]
    lid = prism(kit, "hood", slab, -SIDE + 0.01, SIDE - 0.01, "paint")
    (x0, y0), (x1, y1) = HOLE
    cut_boxes(lid, [((x0, y0, FLOOR - 0.01), (x1, y1, COWL_TOP + 0.1))])
    lid.data.materials.clear()
    lid.data.materials.append(kit._materials["paint"])


def nose(kit: Kit) -> None:
    """A dark grille band between square lamps under the hood edge, a painted valance and a dark bumper."""
    face_x = FRONT + 0.02
    kit.box("valance", (0.04, 2 * SIDE - 0.02, NOSE_TOP - BODY_BOTTOM), (FRONT, 0, (NOSE_TOP + BODY_BOTTOM) / 2), "paint")
    kit.box("grille", (0.04, 2 * (LAMP_Y - 0.15), 0.2), (face_x, 0, 0.06), "under")
    mirrored(kit, "lamp", (0.04, 0.26, 0.18), face_x, LAMP_Y, 0.06, "light")
    mirrored(kit, "indicator", (0.04, 0.12, 0.08), face_x, SIDE - 0.08, -0.1, "light")
    kit.box("bumper", (0.18, 2 * SIDE - 0.02, 0.26), (LENGTH / 2 - 0.09, 0, BODY_BOTTOM + 0.1), "under")


def cab(kit: Kit) -> None:
    """A regular cab: painted doors to the beltline, a leaning glasshouse under a narrower painted roof, raked windshield, pillars and a rear window."""
    kit.box("doors", (COWL_X - CAB_BACK, 2 * SIDE, BELT - FLOOR), ((COWL_X + CAB_BACK) / 2, 0, (BELT + FLOOR) / 2), "paint")
    low, high = SIDE - 0.045, SIDE - 0.14
    glass = [(x, s * y, z) for x, y, z in ((COWL_X, low, COWL_TOP), (CAB_BACK, low, BELT), (ROOF_FRONT, high, UNDER_ROOF), (CAB_BACK, high, UNDER_ROOF)) for s in (1, -1)]
    hull(kit, "glass", "glass", glass)
    for sign, name in ((1, "l"), (-1, "r")):
        a = [(COWL_X, low, COWL_TOP), (COWL_X - 0.08, low, BELT), (ROOF_FRONT, high, UNDER_ROOF), (ROOF_FRONT + 0.08, high, UNDER_ROOF)]
        hull(kit, f"a_pillar_{name}", "paint", [(x, sign * (y + 0.025), z) for x, y, z in a] + [(x, sign * (y - 0.06), z) for x, y, z in a])
        c = [(CAB_BACK, low, BELT), (CAB_BACK + 0.26, low, BELT), (CAB_BACK + 0.2, high, UNDER_ROOF), (CAB_BACK, high, UNDER_ROOF)]
        hull(kit, f"c_pillar_{name}", "paint", [(x, sign * (y + 0.025), z) for x, y, z in c] + [(x, sign * (y - 0.06), z) for x, y, z in c])
    kit.box("back_wall", (0.06, 2 * (low + 0.025), UNDER_ROOF - BELT), (CAB_BACK + 0.03, 0, (BELT + UNDER_ROOF) / 2), "paint")
    kit.box("back_glass", (0.02, 2 * (high - 0.12), UNDER_ROOF - BELT - 0.16), (CAB_BACK - 0.005, 0, (BELT + UNDER_ROOF) / 2 + 0.02), "glass")
    roof_half = high + 0.025
    layers = [(UNDER_ROOF, ROOF_FRONT + 0.03, CAB_BACK, roof_half + 0.03), (ROOF, ROOF_FRONT, CAB_BACK, roof_half)]
    hull(kit, "roof", "paint", [(x, s * y, z) for z, xf, xb, y in layers for x in (xf, xb) for s in (1, -1)])


def bed(kit: Kit) -> None:
    """A long separate bed: thin painted walls to the beltline, a front wall, a tailgate, tall corner taillights and a step bumper."""
    length = BED_FRONT - BACK
    mid = (BED_FRONT + BACK) / 2
    h = BELT - FLOOR
    mirrored(kit, "bed_side", (length, BED_WALL, h), mid, SIDE - BED_WALL / 2, FLOOR + h / 2, "paint")
    kit.box("bed_front", (BED_WALL, 2 * (SIDE - BED_WALL), h), (BED_FRONT - BED_WALL / 2, 0, FLOOR + h / 2), "paint")
    kit.box("tailgate", (BED_WALL, 2 * (SIDE - BED_WALL), h), (BACK + BED_WALL / 2, 0, FLOOR + h / 2), "paint")
    kit.box("rear_panel", (0.04, 2 * SIDE, FLOOR - BODY_BOTTOM), (BACK + 0.02, 0, (FLOOR + BODY_BOTTOM) / 2), "paint")
    mirrored(kit, "taillight", (0.04, 0.14, 0.42), BACK - 0.02, SIDE - 0.08, BELT - 0.25, "red")
    kit.box("rear_bumper", (0.18, 2 * SIDE - 0.1, 0.18), (-LENGTH / 2 + 0.09, 0, BODY_BOTTOM - 0.05), "under")


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
        raise RuntimeError(f"base_scout is {hi.x - lo.x:.3f} x {hi.y - lo.y:.3f} m, not {LENGTH} x {WIDTH} m")


def check_hood() -> None:
    """Raises when the hood hole does not hold the drawn engine with its margin, or leaves the hood."""
    (x0, y0), (x1, y1) = HOLE
    ex0, ex1 = ENGINE_X - ENGINE_HALF[0], ENGINE_X + ENGINE_HALF[0]
    ey0, ey1 = ENGINE_Y - ENGINE_HALF[1], ENGINE_Y + ENGINE_HALF[1]
    if min(ex0 - x0, x1 - ex1, ey0 - y0, y1 - ey1) < HOLE_MARGIN - 1e-6 or max(ex0 - x0, x1 - ex1, ey0 - y0, y1 - ey1) > HOLE_MARGIN + 1e-6:
        raise RuntimeError(f"hood hole x {x0:.3f}..{x1:.3f} y {y0:.3f}..{y1:.3f} is not the engine x {ex0:.3f}..{ex1:.3f} y {ey0:.3f}..{ey1:.3f} plus {HOLE_MARGIN}")
    if x0 <= COWL_X or x1 >= FRONT or abs(y0) >= SIDE or abs(y1) >= SIDE:
        raise RuntimeError(f"hood hole x {x0:.3f}..{x1:.3f} y {y0:.3f}..{y1:.3f} leaves the hood")


def check_tires() -> None:
    """Raises when a tire at its physics mount reaches into the squared arch cut."""
    side = ARCH_R + ARCH_CLEARANCE
    top = ARCH_CROWN
    corner = side + top - ARCH_CHAMFER
    clear = min(side, top, corner / 2**0.5) - WHEEL_R
    if clear < ARCH_CLEARANCE:
        raise RuntimeError(f"the tire keeps {clear:.3f} m from its arch, under {ARCH_CLEARANCE}")


def main() -> None:
    args = parse_args()
    check_hood()
    check_tires()
    kit = Kit(BASE_COLORS, SEED)
    side_skins(kit)
    flares(kit)
    underbody(kit)
    stripe(kit)
    hood(kit)
    nose(kit)
    cab(kit)
    bed(kit)
    kit.socket("arch_front", (WHEELS_X[0], WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (WHEELS_X[1], WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEELS_X[0], WHEEL_Z, ARCH_CROWN_Z))
    bay = {(x, y): FLOOR for x in (1, 2) for y in (1, 2)}
    hood_levels = [hood_top(min(FRONT, G.row_x(y))) for y in range(3)]
    level_sockets(kit, G, "row", hood_levels + [ROOF] * 2 + [FLOOR] * 3, fronts={3: ROOF_FRONT}, cells=bay)
    level_sockets(kit, G, "floor", [FLOOR] * 3 + [BELT] * 2 + [FLOOR] * 3)
    check_size(kit)
    check_base(kit, "base_scout", G)
    kit.export("base_scout", args, view_size=6.5)


if __name__ == "__main__":
    main()
