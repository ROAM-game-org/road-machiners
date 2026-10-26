"""The jeep base: the VW Kübelwagen Type 82 field car with its soft top up, at 1.217 scale, built against the committee's two photos.

Grid: 4 columns by 7 rows, 1.94 m across by 4.55 m along, the real 3.74 by 1.60 m car times 1.217.
Half height 0.4 m, from PHYSICS.bodies.jeep. The ground lies at z -1.1.
Levels from the published figures at 1.217: beltline 1.25 m (z 0.15), windshield frame 1.80 m (z 0.70),
soft top crown 2.0 m (z 0.9), nose top about 1.0 m, tail top 0.85 m. Wheelbase 2.92 m (the real 2.40 m).
The photos (side three-quarter and front, both perspective) give silhouette, detail and same-depth ratios only:
the hood top at the nose is 0.55 of the wing span and the apron bottom 0.36, the lamps 0.12 across and inboard
of the wing middle, the front wing crown about 0.4 of the way from the tire top to the beltline, its lip ahead of
the tire at about 0.7 of the tire height, and the windshield raked about 12 degrees.
A flat narrow slab, 0.76 of the span, carries separate round wings that stand proud of it and form the widest part.
The front wings swell forward ahead of the tires and fall behind them to a dark step plate under the front door,
with round domed lamps under slit covers set into their crowns. Rows 0 and 1 are the hood, a trapezoid narrowing from the slab at the
cowl to the nose, with the spare lying in it and a plain steep apron under its front edge.
Rows 2 and 3 are the cab behind an upright framed windshield, under a soft top in trim with a flat crown, rounded edges,
side curtain windows and a rear window. The four flat doors carry dark seams and a handle, over a plain sill band. Rows 4 and 5 are the open rear deck with a cutout over the engine cells,
and row 6 a louvered lid sloping to a short rear face with round taillights and a round silencer under it.
Inferred, since neither photo shows them: the rear wings, long and flat-crowned over the rear wheels, the rear corners
that carry the lid slope out over them to the tail, the lid, taillights and silencer, the plan view, the left side
(mirrored) and the slab width (the photos put it at 0.74 to 0.85 of the span).
Deviations from the car: the tires follow the tire rule (radius 0.45 m, half width 0.18 m, not the real 0.34 m),
the wheels are symmetric, the engine stays on its grid cells over the rear axle, the top covers only the cab rows,
as if its rear part were folded, so rows 4 and 5 stay an open deck, and the shovel, axe, jerrycan, blackout lamp,
horn and plate are left off, too small to read at game zoom.
Run: blender --background --python tools/blender/base_jeep.py -- public/models/base_jeep.glb [tmp/base_jeep.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args, round_sides  # noqa: E402
from parts_common_base import ARCH_CLEARANCE, BASE_COLORS, INSET, ROUND_ARCH_SEGMENTS, SUSPENSION_REST, Grid, check_base, check_door_gap, door_sill, cut_hulls, hull_mesh, level_sockets, surface_z  # noqa: E402
from parts_common_core import PROUD  # noqa: E402
from shapes import loft, prism, strut  # noqa: E402

SEED = 304
G = Grid(rows=7, cols=4, half_height=0.4)
WHEEL_R = 0.45
WHEEL_HALF_W = 0.18
WHEEL_Y = -0.25
WHEEL_Z = 0.726
HUB_Z = WHEEL_Y - SUSPENSION_REST
WHEELS_X = [-1.46, 1.46]  # PHYSICS.bodies.jeep.wheelX
ARCH_R = WHEEL_R + ARCH_CLEARANCE
ARCH_SEGMENTS = round_sides(ARCH_R) // 2
WELL_Y = WHEEL_Z - WHEEL_HALF_W - 0.03  # the wheel wells' inner wall

SLAB = 0.73  # the flat body sides, 0.76 of the wing span, so the wings stand proud of them
WING_OUT = G.half_y  # the wings' outer face on the footprint edge, the widest part of the jeep
WING_IN = 0.4  # the wings' inner wall, buried in the hood and the apron so no edge shows beside the nose
WING_R = ARCH_R + 0.14  # the front wings' crown radius round the hub
REAR_WING_R = ARCH_R + 0.07  # the rear wings sit lower and thinner
WING_BULGE = 0.12  # the front wing swells forward ahead of the tire, as in the side photo
WING_SHOULDER = 0.12  # the wings' outer shoulder rolls down over this radius
WING_LIP_T = 0.02  # the rolled shoulder leaves this much wing at the outer face
WING_LIP = 0.25  # the front wing's lip ends this many radians ahead of the hub, at about 0.7 of the tire height
REAR_WING_FRONT = 0.35  # the rear wing starts this many radians ahead of the rear hub, above the sill
REAR_WING_BACK = math.pi - 0.3  # and ends this far round, at the tail
REAR_WING_FLAT = (0.4, 0.15)  # the rear wing's crown runs level this far ahead of and behind the hub, so deck items over it stand flat
QUARTER_OUT = WING_OUT - 0.04  # the rear corners carry the lid slope out over the rear wings, inferred from the Type 82's high rear wings
FRONT = G.half_x - INSET  # nose face
BACK = -G.half_x + INSET  # tail face
DOOR_T = 0.08  # the side walls around the open rear deck

BELT = 0.15  # the beltline: hood rear edge, door tops and rear deck
FLOOR = 0.0  # engine bay floor
BAY_T = 0.04  # the dark bay floor plate
NOSE_TOP = -0.12  # the hood's front edge
NOSE_LIP = -0.18  # the nose face's top edge, under the rounded hood edge
NOSE_LOW = -0.52  # the nose apron's bottom edge, over the angled under-nose
NOSE_SET = 0.06  # the steep apron leans back this far from its top edge to its bottom edge
UNDER_NOSE = FRONT - 0.24  # the under-nose meets the body bottom here
TAIL_Z = -0.25  # the lid slope ends at the rear face's top edge
TAIL_LOW = -0.55

COWL = G.row_x(1.5)  # the windshield base, behind the hood rows
TOP_BACK = G.row_x(3.5)  # the soft top ends at the rear deck
FIREWALL = 0.03  # half the wall between the cab and the engine bay
BAY_BACK = G.row_x(5.5)  # the engine cells run from row 4 to row 5, and the lid slope starts here
DOOR_LOW = -0.33  # the doors end on the sill band, which runs down to the body bottom
RIB_OUT = 0.015  # seams and handles stand this far proud of the slab, well inside the wings
STEP_BACK = 0.76  # the step plate runs from under the front wing's tail back to here, ahead of the front door
STEP_Z = -0.66  # just under the wing's tail, so the step and the wing share one collision box
STEP_OUT = WING_OUT - 0.06  # the step plate stands out nearly as far as the wing, as in the side photo
SEAMS = (0.72, 0.06, -0.62)  # the front door's front edge, the split between the doors, the rear door's back edge
RAKE = 0.12  # the windshield leans back about 12 degrees, from the side photo
SCREEN_TOP = 0.7
ROOF_TOP = 0.9  # the soft top's flat crown, where items on the cab cells stand
CROWN_FRONT = 0.7
CROWN_BACK = TOP_BACK + 0.15
HOOD_NOSE_HALF = 0.49  # the hood's half width at the nose, 0.55 of the span in the front photo
APRON_LOW_HALF = 0.35  # the nose apron narrows to 0.36 of the span at its bottom
APRON_BACK = 1.9  # the apron's narrowing starts behind the nose, ahead of the front arch
HOOD_SLOPE = math.atan2(BELT - NOSE_TOP, FRONT - 0.08 - COWL)
TAIL_SLOPE = math.atan2(BELT - TAIL_Z, BAY_BACK - BACK)
LAMP_ANGLE = 1.1  # the lamps stand on the wing crown this many radians ahead of the hub
LAMP_R = 0.115  # 0.12 of the span across, in the front photo
LAMP_Y = 0.75  # inboard of the wing's middle, in the front photo
LAMP_SINK = 0.04  # the lamp bodies sink this far into the wing crown
SPARE_X = 1.5  # the spare lies across nearly the whole hood, as in the front photo
SPARE_R = WHEEL_R - 0.01


def mirrored(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    """A box on the left side at +y and its twin on the right side."""
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def hull(kit: Kit, name: str, mat: str, points: list[tuple[float, float, float]]) -> bpy.types.Object:
    return kit._add(hull_mesh(name, points), name, mat, 0.0)


def hood_z(x: float) -> float:
    """The hood top's height at Blender X, on the slope from the windshield to the nose."""
    return BELT - (x - COWL) * math.tan(HOOD_SLOPE)


def arches() -> list[tuple[float, float]]:
    """The body's bottom edge from tail to nose, cut up in a round arch around both wheels."""
    pts = [(BACK + 0.2, G.bottom)]
    for wx in WHEELS_X:
        for k in range(ARCH_SEGMENTS + 1):
            a = math.pi * (1 - k / ARCH_SEGMENTS)
            pts.append((wx + ARCH_R * math.cos(a), max(G.bottom, HUB_Z + ARCH_R * math.sin(a))))
    if pts[-1][0] >= UNDER_NOSE:
        raise RuntimeError(f"the front arch ends at x {pts[-1][0]:.3f}, past the under-nose at {UNDER_NOSE:.3f}, so the side profile would cross itself")
    return pts + [(UNDER_NOSE, G.bottom)]


def outline(bottom: list[tuple[float, float]], deck: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """A side-view profile: the bottom from tail to nose, the nose and sloped hood, deck points from front to back, the sloped lid and tail."""
    front = [(FRONT - NOSE_SET, NOSE_LOW), (FRONT, NOSE_LIP), (FRONT - 0.08, NOSE_TOP), (COWL, BELT)]
    tail = [(BAY_BACK, BELT), (BACK, TAIL_Z), (BACK, TAIL_LOW)]
    return bottom + front + deck + tail


def body(kit: Kit) -> None:
    """Flat slab sides with round arches, side fillers inside them, and a core sunk at the engine bay, all narrowing to the nose."""
    skin = outline(arches(), [])
    parts = [prism(kit, name, skin, y0, y1, "paint") for name, y0, y1 in (("skin_l", SLAB - DOOR_T, SLAB), ("skin_r", -SLAB, -SLAB + DOOR_T), ("filler_l", WELL_Y, SLAB - DOOR_T), ("filler_r", -SLAB + DOOR_T, -WELL_Y))]
    bay_low = FLOOR - BAY_T
    core_deck = [(TOP_BACK - FIREWALL, BELT), (TOP_BACK - FIREWALL, bay_low), (BAY_BACK, bay_low)]
    parts.append(prism(kit, "core", outline([(BACK + 0.2, G.bottom), (UNDER_NOSE, G.bottom)], core_deck), -WELL_Y, WELL_Y, "paint"))
    for obj in parts:
        narrow_nose(obj)
    kit.box("bay_floor", (TOP_BACK - FIREWALL - BAY_BACK, 2 * WELL_Y, BAY_T), ((TOP_BACK - FIREWALL + BAY_BACK) / 2, 0, FLOOR - BAY_T / 2), "under")
    kit.box("skid", (FRONT - BACK - 0.6, 2 * WELL_Y - 0.1, 0.08), (0, 0, G.bottom - 0.03), "under")


def hood_half(x: float) -> float:
    """The hood's half width at Blender X, a trapezoid in plan from the slab at the cowl to the narrow nose."""
    return SLAB - (SLAB - HOOD_NOSE_HALF) * (x - COWL) / (FRONT - COWL)


def narrow_nose(obj: bpy.types.Object) -> None:
    """Cuts the body ahead of the cowl to the hood's trapezoid in plan, and the nose apron to its front face narrowing downward."""
    reach = 0.3
    lean = (HOOD_NOSE_HALF - APRON_LOW_HALF) / (NOSE_LIP - NOSE_LOW)
    face = [(HOOD_NOSE_HALF + lean * reach, NOSE_LIP + reach), (APRON_LOW_HALF, NOSE_LOW), (APRON_LOW_HALF, -2.0), (SLAB + 0.5, -2.0), (SLAB + 0.5, NOSE_LIP + reach)]
    plan = [(COWL, SLAB), (FRONT + reach, hood_half(FRONT + reach)), (FRONT + reach, SLAB + 0.5), (COWL, SLAB + 0.5)]
    cutters = []
    for sy in (1, -1):
        cutters.append([(x, sy * y, z) for x, y in plan for z in (-2.0, 2.0)])
        cutters.append([(x, sy * y, z) for x in (APRON_BACK, FRONT + reach) for y, z in face])
    cut_hulls(obj, cutters)


def wing_band(wx: float, r_out: float, bulge: float, flat: tuple[float, float], a0: float, a1: float, n: int) -> list[tuple[float, float]]:
    """A wing's side outline round the hub at wx: the outer curve from angle a0 to a1 (0 ahead of the hub), swelling by bulge toward the front
    and stretched by flat ahead of and behind the hub into a level crown, then the arch arc back."""

    def outer(t: float) -> tuple[float, float]:
        r = r_out + bulge * max(0.0, math.cos(t))
        return (wx + (flat[0] if t < math.pi / 2 else -flat[1]) + r * math.cos(t), HUB_Z + r * math.sin(t))

    def angles(a: float, b: float) -> list[float]:
        return [a + (b - a) * k / n for k in range(n + 1)]

    inner = [(wx + ARCH_R * math.cos(t), HUB_Z + ARCH_R * math.sin(t)) for t in angles(a1, a0)]
    return [outer(t) for t in angles(a0, a1)] + inner


def wing(kit: Kit, name: str, wx: float, r_out: float, bulge: float, flat: tuple[float, float], a0: float, a1: float) -> list[bpy.types.Object]:
    """A round wing over one wheel on both sides: full depth from its inner wall, its outer shoulder rolled down to a thin lip."""
    n = max(4, round(ROUND_ARCH_SEGMENTS * abs(a1 - a0) / math.pi))
    steps = 4
    roll = min(WING_SHOULDER, r_out - ARCH_R - WING_LIP_T)
    shoulder = [(WING_OUT - roll + roll * math.sin(math.pi / 2 * k / steps), r_out - roll + roll * math.cos(math.pi / 2 * k / steps)) for k in range(steps + 1)]
    made = []
    for s, sy in (("l", 1), ("r", -1)):
        rings = [[(x, sy * y, z) for x, z in wing_band(wx, r, bulge, flat, a0, a1, n)] for y, r in [(WING_IN, r_out)] + shoulder]
        made.append(loft(kit, f"{name}_{s}", rings, "paint"))
    return made


def wings(kit: Kit) -> list[bpy.types.Object]:
    """Round wings bolted on the slab sides: tall ones over the front wheels from a lip ahead of the tire to the sill behind it, long flat-crowned ones over the rear wheels to the tail."""
    rear_x, front_x = WHEELS_X
    return wing(kit, "wing_f", front_x, WING_R, WING_BULGE, (0.0, 0.0), WING_LIP, math.pi) + wing(kit, "wing_b", rear_x, REAR_WING_R, 0.0, REAR_WING_FLAT, REAR_WING_FRONT, REAR_WING_BACK)


def check_wings(objs: list[bpy.types.Object]) -> None:
    """Raises when a wing leaves the footprint or comes within ARCH_CLEARANCE of a tire at rest."""
    bpy.context.view_layer.update()
    for obj in objs:
        for v in obj.data.vertices:
            p = obj.matrix_world @ v.co
            if abs(p.x) > G.half_x or abs(p.y) > G.half_y:
                raise RuntimeError(f"{obj.name} leaves the footprint at {tuple(round(c, 3) for c in p)}")
            for wx in WHEELS_X:
                if abs(abs(p.y) - WHEEL_Z) > WHEEL_HALF_W:
                    continue
                gap = math.hypot(p.x - wx, p.z - HUB_Z) - WHEEL_R
                if gap < ARCH_CLEARANCE - 1e-6:
                    raise RuntimeError(f"{obj.name} comes {gap:.3f} m from the tire at x {wx}, under ARCH_CLEARANCE {ARCH_CLEARANCE}")


def ribs(kit: Kit) -> None:
    """Four flat doors with dark seams and a handle, over a plain sill band and a step plate behind each front wing."""
    face = SLAB + RIB_OUT / 2
    for i, x in enumerate(SEAMS):
        low = door_sill(x, x, DOOR_LOW, WHEELS_X, HUB_Z, ARCH_R)
        check_door_gap(f"seam{i}", x, x, low, WHEELS_X, HUB_Z, ARCH_R)
        mirrored(kit, f"seam{i}", (0.035, RIB_OUT, BELT - low), x, face, (BELT + low) / 2, "under")
    for d, back in enumerate(SEAMS[1:]):
        mirrored(kit, f"handle{d}", (0.12, RIB_OUT, 0.03), back + 0.12, face, BELT - 0.04, "metal")
    mirrored(kit, "sill_line", (SEAMS[0] - SEAMS[-1], RIB_OUT + PROUD, 0.025), (SEAMS[0] + SEAMS[-1]) / 2, face + PROUD / 2, DOOR_LOW, "under")
    step_front = WHEELS_X[1] - ARCH_R - 0.02
    mirrored(kit, "step", (step_front - STEP_BACK, STEP_OUT - SLAB, 0.03), (step_front + STEP_BACK) / 2, (STEP_OUT + SLAB) / 2, STEP_Z, "under")


def hood(kit: Kit) -> None:
    """The spare wheel lying in the hood, and round domed lamps set into the front wing crowns under their covers, each with a lit slit facing forward."""
    rot = (0, HOOD_SLOPE, 0)
    for name, r, depth, mat in (("spare", SPARE_R, 0.2, "wheel"), ("spare_rim", 0.26, 0.22, "metal"), ("spare_hub", 0.08, 0.24, "rust")):
        lift = (depth / 2 - 0.08) / math.cos(HOOD_SLOPE)
        kit.cylinder(name, r, depth, (SPARE_X, 0, hood_z(SPARE_X) + lift), mat, rot=rot, vertices=round_sides(r))
    lamp_x = WHEELS_X[1] + WING_R * math.cos(LAMP_ANGLE)
    lamp_z = HUB_Z + WING_R * math.sin(LAMP_ANGLE) + LAMP_R - LAMP_SINK
    sides = round_sides(LAMP_R)
    dome = [(-0.12, 0.05), (-0.09, 0.085), (-0.05, 0.108), (0.0, LAMP_R), (0.05, LAMP_R - 0.005), (0.09, 0.095), (0.12, 0.065), (0.135, 0.03)]
    for s, sy in (("l", 1), ("r", -1)):
        rings = [[(lamp_x + dx, sy * LAMP_Y + r * math.cos(math.tau * k / sides), lamp_z + r * math.sin(math.tau * k / sides)) for k in range(sides)] for dx, r in dome]
        loft(kit, f"lamp_cover_{s}", rings, "paint")
        kit.box(f"lamp_slit_{s}", (0.03, 0.11, 0.025), (lamp_x + 0.11, sy * LAMP_Y, lamp_z - 0.01), "light")


def windshield(kit: Kit) -> None:
    """An upright flat windshield in a trim frame on the hood's rear edge."""
    base_x = COWL - 0.03
    top_x = base_x - RAKE
    span = SLAB - 0.04
    for s, sy in (("l", 1), ("r", -1)):
        strut(kit, f"post_{s}", (base_x, sy * span, BELT), (top_x, sy * span, SCREEN_TOP), 0.07, "paint")
    strut(kit, "header", (top_x, SLAB + PROUD, SCREEN_TOP), (top_x, -SLAB - PROUD, SCREEN_TOP), 0.07, "paint")
    kit.box("sill", (0.08, 2 * (SLAB + PROUD), 0.06), (base_x, 0, BELT + 0.03), "paint")
    glass = [(base_x - 0.015, BELT + 0.05), (base_x + 0.015, BELT + 0.05), (top_x + 0.015, SCREEN_TOP - 0.03), (top_x - 0.015, SCREEN_TOP - 0.03)]
    prism(kit, "glass", glass, -span + 0.03, span - 0.03, "glass")


def soft_top(kit: Kit) -> None:
    """The soft top in trim: upright curtains on the door tops, a bowed front behind the header, rounded edges to a flat crown, side windows and a rear window."""
    wall = SLAB - 0.02
    behind_glass = COWL - 0.03 - 0.045
    rear = TOP_BACK - 0.035
    layers = [
        (BELT, behind_glass, rear, wall),
        (SCREEN_TOP - 0.02, behind_glass - RAKE, rear + 0.06, wall),
        (ROOF_TOP - 0.1, CROWN_FRONT + 0.1, CROWN_BACK - 0.1, wall - 0.03),
        (ROOF_TOP - 0.035, CROWN_FRONT + 0.035, CROWN_BACK - 0.035, wall - 0.1),
        (ROOF_TOP, CROWN_FRONT, CROWN_BACK, wall - 0.2),
    ]
    hull(kit, "soft_top", "trim", [(x, s * y, z) for z, xf, xb, y in layers for x in (xf, xb) for s in (1, -1)])
    mirrored(kit, "top_hem", (behind_glass - rear, 0.03, 0.04), (behind_glass + rear) / 2, wall + 0.005, BELT + 0.02, "under")
    low, high = BELT + 0.14, SCREEN_TOP - 0.06
    for i, (x0, x1) in enumerate(((behind_glass - 0.12, SEAMS[1] + 0.06), (SEAMS[1] - 0.06, TOP_BACK + 0.12))):
        mirrored(kit, f"side_window{i}", (x0 - x1, 0.02, high - low), (x0 + x1) / 2, wall + 0.005, (low + high) / 2, "glass")
    lean = 0.06 / (SCREEN_TOP - 0.02 - BELT)
    window_z = high - 0.16
    kit.box("rear_window", (0.02, 0.9, 0.22), (rear + lean * (window_z - BELT) - 0.005, 0, window_z), "glass", rot=(0, math.atan(lean), 0))


def tail_quarters(kit: Kit) -> None:
    """The rear corners: the lid slope carried out over the rear wings to the tail, so the wings run into a full-width tail."""
    crown = HUB_Z + REAR_WING_R
    back_x = WHEELS_X[0] - REAR_WING_FLAT[1]
    curve = [(back_x + REAR_WING_R * math.cos(a), HUB_Z + REAR_WING_R * math.sin(a)) for a in (math.pi / 2 + (REAR_WING_BACK - math.pi / 2) * k / 6 for k in range(7))]
    profile = [(BAY_BACK, BELT), (BAY_BACK, crown)] + curve + [(BACK, curve[-1][1]), (BACK, TAIL_Z)]
    for s, (y0, y1) in (("l", (SLAB, QUARTER_OUT)), ("r", (-QUARTER_OUT, -SLAB))):
        prism(kit, f"quarter_{s}", profile, y0, y1, "paint")


def tail(kit: Kit) -> None:
    """Dark louvers across the sloped engine lid, round taillights on the rear face, and a round silencer with its pipe under the tail."""
    run = BAY_BACK - BACK
    drop = BELT - TAIL_Z
    count = 5
    for i in range(count):
        t = (i + 0.5) / (count + 0.6)
        x = BAY_BACK - run * t - math.sin(TAIL_SLOPE) * 0.012
        z = BELT - drop * t + math.cos(TAIL_SLOPE) * 0.012
        kit.box(f"louver{i}", (0.07, 2 * WELL_Y - 0.2, 0.025), (x, 0, z), "under", rot=(0, -TAIL_SLOPE, 0))
    for s, sy in (("l", 1), ("r", -1)):
        kit.cylinder(f"taillight_{s}", 0.06, INSET, (BACK - INSET / 2, sy * (SLAB - 0.16), TAIL_Z - 0.1), "red", rot=(0, math.pi / 2, 0), vertices=round_sides(0.06))
    silencer_x = BACK + 0.2
    silencer_z = G.bottom - 0.04
    kit.cylinder("silencer", 0.09, 0.9, (silencer_x, 0, silencer_z), "metal", rot=(math.pi / 2, 0, 0), vertices=round_sides(0.09))
    strut(kit, "tailpipe", (silencer_x, -0.3, silencer_z), (BACK + 0.01, -0.3, silencer_z - 0.02), 0.06, "metal", sides=round_sides(0.03))


def main() -> None:
    args = parse_args()
    kit = Kit(BASE_COLORS, SEED)
    body(kit)
    check_wings(wings(kit))
    ribs(kit)
    hood(kit)
    windshield(kit)
    soft_top(kit)
    tail_quarters(kit)
    tail(kit)
    kit.socket("arch_front", (WHEELS_X[1], WHEEL_Z, HUB_Z))
    kit.socket("arch_rear", (WHEELS_X[0], WHEEL_Z, HUB_Z))
    kit.socket("arch_front_top", (WHEELS_X[1], WHEEL_Z, HUB_Z + ARCH_R))
    slopes = {(x, y): surface_z(G, x, y) for x in range(G.cols) for y in (0, 1, 6)}
    bay = {(x, y): FLOOR for x in (1, 2) for y in (4, 5)}
    level_sockets(kit, G, "row", [BELT] * 2 + [ROOF_TOP] * 2 + [BELT] * 3, fronts={2: CROWN_FRONT}, cells=slopes | bay)
    level_sockets(kit, G, "floor", [FLOOR] * G.rows)
    check_base(kit, "base_jeep", G)
    kit.export("base_jeep", args, view_size=5.5)


if __name__ == "__main__":
    main()
