"""The buggy base: a stylized Meyers Manx dune buggy, the fibreglass tub on a shortened Beetle pan, closed up with a hardtop.

Measured from the Manx's published dimensions (tmp/models/base_buggy/asset-brief.md; the Commons photos could not be fetched):
an 80 in wheelbase on a body about 122.7 in long, 50 to 53 in tall. Kept at the 3.9 m grid length, about 1.25 times a real Manx,
1.94 m across with the tires as the widest point, and 1.64 m tall to the roof. The wheelbase is 0.652 of the length,
2.54 m, so the wheels sit near the corners on short equal overhangs. The ground is 1.1 m below the center.
Levels: front fender crown 0.05 (1.15 tire diameters over the ground), waist sill -0.2 (0.9 m), roof top 0.54 and bottom 0.47,
side windows 0.1 to 0.42, front deck -0.25 falling to the rounded nose at -0.47, rear deck -0.21, cockpit and engine bay floor -0.5,
pan -0.62. The roof runs from a short brim over the windshield top back to the hoop, 0.27 of the length.
Tall front fenders sweep down ahead of the front wheels to the nose and back to the sill, with round bug-eye lamps on them.
No wasteland driver rides with the seats open, so the cab is closed as the jeep's Kubelwagen is: a raked windshield from the
cowl to a flat trim roof welded on the roll hoop, cab sides from the sill to the roof with one small dark window each and no
door seam, and a rear wall in the hoop plane with a small dark window. The hoop stays as the trim rear pillars, braced back to
the rear deck. The cab sides lean in 0.1 m from the sill to the roof and the rear wall leans forward 0.12 m, under a roof plate with a small lip and softened edges, so the greenhouse tapers into the swept fenders. Items on the D cells stand on the roof behind the windshield. The rear wheels stand bare under small dark guards
beside a narrow tail, which ends in a dark rear panel with round taillights. A trim racing band runs along each side at the waist.
Deviations from the Manx: the wheels stay symmetric, the tires follow the tire rule's stock 0.5 m, and the engine sits at the front,
where the grid's engine cells are. It shows through a hole in the front deck over the bay floor, centered on PHYSICS.bodies.buggy.engine.
Grid: 4 columns by 6 rows, stretched over the model by the projection. Half height 0.35 m, from PHYSICS.bodies.buggy.
Wheels: radius 0.5 m, half width 0.22 m, mount 0.2 m below the center, 0.726 m off the center line, 1.27 m ahead and behind.
Sockets arch_front, arch_rear and arch_front_top (the fender arch crown) mark the arches for wheelArches.test.ts.
Run: blender --background --python tools/blender/base_buggy.py -- public/models/base_buggy.glb [tmp/base_buggy.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402
from parts_common_base import ARCH_CLEARANCE, BASE_COLORS, INSET, SUSPENSION_REST, Grid, check_base, check_door_gap, cut_boxes, hull_mesh, level_sockets  # noqa: E402
from parts_common_core import PROUD, ROUND_SIDES  # noqa: E402
from shapes import prism, strut  # noqa: E402

SEED = 302
LENGTH = 3.9
G = Grid(rows=6, cols=4, half_height=0.35)
WHEEL_R = 0.5  # PHYSICS.bodies.buggy.wheelRadius
WHEEL_HALF_W = 0.22  # PHYSICS.bodies.buggy.wheelHalfWidth
WHEEL_Z = 0.726  # PHYSICS.bodies.buggy.wheelZ
HUB_Z = -0.2 - SUSPENSION_REST  # PHYSICS.bodies.buggy.wheelY
WHEELS_X = [1.27, -1.27]  # PHYSICS.bodies.buggy.wheelX
ARCH_R = WHEEL_R + ARCH_CLEARANCE
ARCH_SIDES = ROUND_SIDES // 2  # straight edges around each half arch

FRONT = LENGTH / 2 - 0.005
BACK = -FRONT
SIDE = G.half_y - INSET  # the outer face of the fenders and tub sides
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03  # the fenders' inner face and the narrow body between the wheels
WALL = 0.08  # the cockpit side wall
EDGE = 0.08  # the stepped strips along each fender top edge
EDGE_DROP = 0.05
FLUSH_NOSE_DEG = 40

PAN = -0.62
FLOOR = -0.5  # cockpit, passenger and engine bay floor
DECK = -0.25  # front deck between the fenders
NOSE_TOP = -0.47
SILL = -0.2
REAR_DECK = -0.21
CROWN = 0.05
ROOF_TOP = 0.54  # the hardtop's flat top, where items on the D cells stand
ROOF_BOTTOM = ROOF_TOP - 0.07
SCREEN_TOP = ROOF_BOTTOM
COWL_TOP = -0.05
TUBE = 0.09
SIDE_GLASS = (0.1, ROOF_BOTTOM - 0.05)  # the side windows' bottom and top
REAR_GLASS = (0.12, ROOF_BOTTOM - 0.07)

COWL_X = 0.46  # the dash's front face, just behind the engine hole
SCREEN_BASE_X = 0.42
SCREEN_TOP_X = 0.3
ROOF_FRONT = SCREEN_TOP_X + 0.06  # a short brim over the windshield top
SILL_FRONT = 0.35  # where the fender's back slope meets the cockpit sill
SIDE_BACK = WHEELS_X[1] + ARCH_R + 0.01  # the tub side ends just ahead of the bare rear wheel
HOOP_X = SIDE_BACK + 0.05
CAB_BACK = HOOP_X - TUBE / 2  # the hoop's back face: the roof's back edge and the rear wall
INNER = SIDE - WALL  # the cowl's and dash's inner face
TUMBLE = 0.1  # how far the cab sides lean in from the sill to the roof, so the cab narrows like a Manx greenhouse
BACK_LEAN = 0.12  # how far the rear wall leans forward from the sill to the roof
LIP = 0.08  # the roof plate's overhang past the leaning sides
LAMP_X = 1.62
LAMP_R = 0.11

ENGINE_X = 0.975  # PHYSICS.bodies.buggy.engine.x
ENGINE_HALF = (0.4875, 0.38)  # the drawn engine: restOn() of the engine cells, over the bay floor
HOLE_MARGIN = 0.02
HOLE = ((ENGINE_X - ENGINE_HALF[0] - HOLE_MARGIN, -ENGINE_HALF[1] - HOLE_MARGIN), (ENGINE_X + ENGINE_HALF[0] + HOLE_MARGIN, ENGINE_HALF[1] + HOLE_MARGIN))


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


def arch(wx: float, r: float, a0: float, a1: float) -> list[tuple[float, float]]:
    """Points around a wheel hub at radius r from angle a0 to a1, 0 at the front, in ARCH_SIDES steps per half turn."""
    n = max(2, round(ARCH_SIDES * abs(a1 - a0) / math.pi))
    return [(wx + r * math.cos(a0 + (a1 - a0) * k / n), HUB_Z + r * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]


def fender_top(drop: float) -> list[tuple[float, float]]:
    """The Manx fender line from the nose up over the front wheel to its crown, then down the long back slope to the sill.

    drop lowers the crown for the stepped edges that round the fender across.
    """
    wx = WHEELS_X[0]
    reach = FRONT - wx
    crown = CROWN - drop
    rise = crown - HUB_Z
    swoop = [(wx + reach * math.cos(a), HUB_Z + (rise if d >= FLUSH_NOSE_DEG else CROWN - HUB_Z) * math.sin(a) ** 1.5) for d, a in ((d, math.radians(d)) for d in range(16, 90, 8))]
    back = [(wx - (wx - SILL_FRONT) * math.sin(t), SILL + (crown - SILL) * math.cos(t)) for t in (math.radians(d) for d in range(0, 91, 10))]
    return [(FRONT, NOSE_TOP - 0.08)] + swoop + back


def side_profile(drop: float = 0.0) -> list[tuple[float, float]]:
    """The tub side from the bare rear wheel to the nose: a level sill, the front arch and the swept fender."""
    return (
        [(SIDE_BACK, PAN), (WHEELS_X[0] - ARCH_R, PAN)]
        + arch(WHEELS_X[0], ARCH_R, math.pi, 0)
        + [(FRONT, HUB_Z)]
        + fender_top(drop)
        + [(SILL_FRONT - 0.01, SILL), (SIDE_BACK + 0.12, SILL), (SIDE_BACK, SILL + 0.1)]
    )


def body(kit: Kit) -> None:
    """The narrow core between the wheels: the rounded nose, the front deck over the engine bay, the cockpit floor and the rear deck."""
    profile = [
        (BACK + 0.1, PAN), (FRONT - 0.12, PAN), (FRONT, PAN + 0.1), (FRONT, NOSE_TOP), (FRONT - 0.06, NOSE_TOP + 0.08),
        (FRONT - 0.2, DECK - 0.07), (FRONT - 0.4, DECK - 0.01), (FRONT - 0.55, DECK), (COWL_X, DECK), (COWL_X, FLOOR),
        (SIDE_BACK + 0.06, FLOOR), (SIDE_BACK - 0.04, REAR_DECK), (BACK + 0.12, REAR_DECK), (BACK + 0.03, REAR_DECK - 0.1), (BACK + 0.03, PAN + 0.12),
    ]
    core = prism(kit, "core", profile, -WELL_Y, WELL_Y, "paint")
    (x0, y0), (x1, y1) = HOLE
    cut_boxes(core, [((x0, y0, FLOOR - 0.02), (x1, y1, DECK + 0.2))])
    core.data.materials.clear()
    core.data.materials.append(kit._materials["paint"])
    kit.box("skid", (FRONT - BACK - 0.5, 2 * WELL_Y - 0.2, 0.08), (0, 0, PAN - 0.03), "under")
    kit.box("bay_floor", (x1 - x0, y1 - y0, 0.02), ((x0 + x1) / 2, 0, FLOOR - 0.01), "under")


def sides(kit: Kit) -> None:
    """Full-width sides: solid swept fenders over the front wheels and thin cockpit walls behind them, with a trim racing band."""
    profile = side_profile()
    fender = clip_x(profile, COWL_X, FRONT + 1)
    shoulder = clip_x(side_profile(EDGE_DROP), COWL_X, FRONT + 1)
    wall = clip_x(profile, SIDE_BACK - 1, COWL_X)
    for s, sy in (("l", 1), ("r", -1)):
        crest = sorted((sy * (WELL_Y + EDGE), sy * (SIDE - EDGE)))
        prism(kit, f"fender_{s}", fender, crest[0], crest[1], "paint")
        for i, (y0, y1) in enumerate(((WELL_Y, WELL_Y + EDGE), (SIDE - EDGE, SIDE))):
            lo, hi = sorted((sy * y0, sy * y1))
            prism(kit, f"fender_edge{i}_{s}", shoulder, lo, hi, "paint")
    prism(kit, "wall_l", wall, SIDE - WALL, SIDE, "paint")
    prism(kit, "wall_r", wall, -SIDE, -SIDE + WALL, "paint")
    front = SCREEN_BASE_X - 0.02
    shell = [(x, s * cab_half(z), z) for z, xs in ((SILL, (cab_back(SILL), front)), (ROOF_BOTTOM, (cab_back(ROOF_BOTTOM), SCREEN_TOP_X - 0.02))) for x in xs for s in (1, -1)]
    kit._add(hull_mesh("cab_shell", shell), "cab_shell", "paint", 0.0)
    cowl = [(x, s * cab_half(z), z) for z, xs in ((SILL, (front, COWL_X)), (COWL_TOP, (front, COWL_X))) for x in xs for s in (1, -1)]
    kit._add(hull_mesh("cowl_sides", cowl), "cowl_sides", "paint", 0.0)
    kit.box("cockpit_floor", (COWL_X - SIDE_BACK, 2 * SIDE - 0.02, FLOOR - PAN), ((COWL_X + SIDE_BACK) / 2, 0, (FLOOR + PAN) / 2), "paint")
    band = [(SIDE_BACK + 0.03, -0.37), (WHEELS_X[0] - ARCH_R - 0.08, -0.37), (WHEELS_X[0] - ARCH_R - 0.02, -0.29), (SIDE_BACK + 0.03, -0.29)]
    prism(kit, "band_l", band, SIDE, SIDE + 0.015, "trim")
    prism(kit, "band_r", band, -SIDE - 0.015, -SIDE, "trim")


def lamps(kit: Kit) -> None:
    """Round bug-eye headlamps standing on the fender swoops, each a dark pod with a lens facing ahead."""
    wx = WHEELS_X[0]
    a = math.acos((LAMP_X - wx) / (FRONT - wx))
    z = HUB_Z + (CROWN - HUB_Z) * math.sin(a) ** 1.5 + LAMP_R - 0.03
    for s, y in (("l", 1), ("r", -1)):
        kit.cylinder(f"lamp_pod_{s}", LAMP_R, 0.14, (LAMP_X, y * 0.71, z), "under", rot=(0, math.pi / 2, 0), vertices=ROUND_SIDES)
        kit.cylinder(f"lamp_{s}", LAMP_R - 0.02, 0.03, (LAMP_X + 0.075, y * 0.71, z), "light", rot=(0, math.pi / 2, 0), vertices=ROUND_SIDES)


def cab_half(z: float) -> float:
    """Half the cab's width at height z: the sides lean in from the sill to the roof."""
    return SIDE - TUMBLE * (z - SILL) / (ROOF_BOTTOM - SILL)


def cab_back(z: float) -> float:
    """The cab's rear face X at height z: it leans forward from the sill to the roof."""
    return CAB_BACK + BACK_LEAN * (z - SILL) / (ROOF_BOTTOM - SILL)


def screen_x(z: float) -> float:
    """The windshield rake: its X at height z, from the cowl to the roof."""
    return SCREEN_BASE_X + (SCREEN_TOP_X - SCREEN_BASE_X) * (z - COWL_TOP) / (SCREEN_TOP - COWL_TOP)


def windshield(kit: Kit) -> None:
    """The dash on the cowl and a raked windshield in a dark frame, from the cowl to the roof, across the cab."""
    dash_length = COWL_X - SCREEN_BASE_X + 0.08 - PROUD
    dash_top = COWL_TOP - PROUD
    kit.box("dash", (dash_length, 2 * INNER, dash_top - FLOOR), (COWL_X - PROUD - dash_length / 2, 0, (dash_top + FLOOR) / 2), "under")
    for s, sy in (("l", 1), ("r", -1)):
        strut(kit, f"screen_post_{s}", (SCREEN_BASE_X, sy * (cab_half(COWL_TOP) - 0.04), COWL_TOP), (SCREEN_TOP_X, sy * (cab_half(SCREEN_TOP) - 0.04), SCREEN_TOP), 0.06, "under")
    glass = [(x + dx, s * (cab_half(z) - 0.07), z) for x, z in ((SCREEN_BASE_X, COWL_TOP), (SCREEN_TOP_X, SCREEN_TOP)) for s in (1, -1) for dx in (0, -0.02)]
    kit._add(hull_mesh("windshield", glass), "windshield", "glass", 0.0)


def hardtop(kit: Kit) -> None:
    """A flat trim roof welded on the roll cage over both seats, with a short brim over the windshield."""
    wide = cab_half(ROOF_BOTTOM) + LIP
    back = cab_back(ROOF_BOTTOM) - LIP
    rim = 0.03
    points = [(x, s * y, z) for x, y, z in (
        (ROOF_FRONT, wide, ROOF_BOTTOM), (back, wide, ROOF_BOTTOM),
        (ROOF_FRONT, wide - rim, ROOF_TOP - 0.04), (ROOF_FRONT - 0.06, wide - 2 * rim, ROOF_TOP),
        (back + rim, wide - rim, ROOF_TOP - 0.02), (back + 2 * rim, wide - 2 * rim, ROOF_TOP),
    ) for s in (1, -1)]
    kit._add(hull_mesh("roof", points), "roof", "trim", 0.0)


def windows(kit: Kit) -> None:
    """One small dark window in each cab side, its front edge on the windshield rake, and the rear wall with its window."""
    z0, z1 = SIDE_GLASS
    check_door_gap("side_window", cab_back(z0) + 0.14, screen_x(z0) - 0.08, z0, WHEELS_X, HUB_Z, ARCH_R)
    corners = [(cab_back(z) + 0.14, z) for z in (z0, z1)] + [(screen_x(z) - 0.08, z) for z in (z0, z1)]
    for s in (1, -1):
        pane = [(x, s * (cab_half(z) + d), z) for x, z in corners for d in (-0.02, 0.01)]
        kit._add(hull_mesh("side_glass_l" if s > 0 else "side_glass_r", pane), "side_glass", "glass", 0.0)
    r0, r1 = REAR_GLASS
    pane = [(cab_back(z) + d, s * (cab_half(z) - 0.25), z) for z in (r0, r1) for s in (1, -1) for d in (-0.01, 0.02)]
    kit._add(hull_mesh("rear_glass", pane), "rear_glass", "glass", 0.0)


def hoop(kit: Kit) -> None:
    """The roll hoop in the trim color as the cab's rear pillars under the roof's back edge, braced back to the rear deck."""
    for s, sy in (("l", 1), ("r", -1)):
        strut(kit, f"hoop_leg_{s}", (cab_back(SILL), sy * (cab_half(SILL) - TUBE / 2), SILL), (cab_back(ROOF_BOTTOM), sy * (cab_half(ROOF_BOTTOM) - TUBE / 2), ROOF_BOTTOM), TUBE, "trim")
        strut(kit, f"brace_{s}", (cab_back(SILL + 0.15), sy * 0.4, SILL + 0.15), (BACK + 0.45, sy * 0.3, REAR_DECK), TUBE * 0.8, "trim")


def rear(kit: Kit) -> None:
    """Small dark guards over the bare rear wheels, and the tail: a dark rear panel with round taillights."""
    rx = WHEELS_X[1]
    guard = arch(rx, ARCH_R + 0.1, 0.4, math.pi - 0.15) + list(reversed(arch(rx, ARCH_R, 0.4, math.pi - 0.15)))
    prism(kit, "guard_l", guard, WELL_Y, G.half_y - 0.01, "under")
    prism(kit, "guard_r", guard, -G.half_y + 0.01, -WELL_Y, "under")
    kit.box("rear_panel", (0.02, 2 * WELL_Y - 0.12, REAR_DECK - 0.12 - PAN - 0.08), (BACK + 0.02, 0, (REAR_DECK - 0.12 + PAN + 0.08) / 2), "under")
    for s, y in (("l", 1), ("r", -1)):
        kit.cylinder(f"taillight_{s}", 0.065, 0.02, (BACK + 0.01, y * (WELL_Y - 0.13), REAR_DECK - 0.2), "red", rot=(0, math.pi / 2, 0), vertices=ROUND_SIDES)


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
    if abs(hi.x - lo.x - LENGTH) > 0.02:
        raise RuntimeError(f"base_buggy is {hi.x - lo.x:.3f} m long, not {LENGTH} m")


def check_hole() -> None:
    """Raises when the engine hole leaves the front deck between the fenders, or reaches the dash."""
    (x0, y0), (x1, y1) = HOLE
    if x0 <= COWL_X or x1 >= FRONT - 0.3 or y1 >= WELL_Y or y0 <= -WELL_Y:
        raise RuntimeError(f"engine hole x {x0:.3f}..{x1:.3f} y {y0:.3f}..{y1:.3f} leaves the front deck")


def main() -> None:
    args = parse_args()
    check_hole()
    kit = Kit(BASE_COLORS, SEED)
    body(kit)
    sides(kit)
    lamps(kit)
    windshield(kit)
    hardtop(kit)
    windows(kit)
    hoop(kit)
    rear(kit)
    kit.socket("arch_front", (WHEELS_X[0], WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (WHEELS_X[1], WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEELS_X[0], WHEEL_Z, HUB_Z + ARCH_R))
    bay = {(x, y): FLOOR for x in (1, 2) for y in (0, 1)}
    level_sockets(kit, G, "row", [NOSE_TOP, DECK, ROOF_TOP, ROOF_TOP, REAR_DECK, REAR_DECK], fronts={2: ROOF_FRONT - 0.06}, cells=bay)
    level_sockets(kit, G, "floor", [FLOOR] * 4 + [REAR_DECK] * 2)
    check_size(kit)
    check_base(kit, "base_buggy", G)
    kit.export("base_buggy", args, view_size=5.0)


if __name__ == "__main__":
    main()
