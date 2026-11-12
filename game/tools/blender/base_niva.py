"""The niva base: a stylized Lada Niva 2121 4x4, the short upright two-box Soviet off-roader, built from the committee's two references.

References: reference 1 is a render of a red wasteland Niva in the game's flat-panel ink look, seen from the front right at about the game camera's
elevation. It gives the upright flat face, the dark lower band, the rounded roof edges and the cabin-to-hood balance. Reference 2 is a photograph of an
olive early VAZ-2121 from in front of its left side. It gives the features: a black framed grille between round headlamps, an amber lamp on each wing face
and side, a thin bumper with end caps, a character line, big round arches, one long door with a vent pane, a B-pillar, a quarter window about as long as the
door glass, a narrow C-pillar with slot vents, a flat roof with drip rails and a black sill strip. The photo is a perspective view, so it sets shapes and not lengths.
Size is the published 2121 (3.72 m by 1.68 m by 1.64 m on a 2.2 m wheelbase) at the jeep's 1.217 scale, which the fixed footprint already matches.
Grid: 4 columns by 7 rows, 1.94 m across by 4.55 m along. Half height 0.4 m, from PHYSICS.bodies.niva.
The ground is 1.10 m below the center, so the flat roof at 0.89 m stands 2.0 m tall and the hood at 0.09 m is 60 % of that.
A flat hood with a cutout that is the engine bay of the chassis.ts layout, rows 2 to 4 and columns 2 and 3, 1.35 m long and 0.9 m wide.
Behind it a tall upright cabin with a windshield raked about 27 degrees from upright, under a flat roof that runs back from the windshield top.
Each side has a vent pane and a main pane on the door, a B-pillar, a long quarter window and three slot vents in the C-pillar. The tail is near vertical
with a framed rear window and an upright red-over-amber taillight cluster at each corner.
The nose is an upright face: a black grille panel 0.7 of the body width with a round headlamp at each end, a clear-over-amber lamp on each wing face, a thin bumper
with dark end caps and a dark valance under it. The hood rounds down over its front edge.
Wheels sit on rows 1 and 5 in the outer columns, radius 0.45 m, half width 0.18 m, mount 0.25 m below the center. Round arches are cut on them.
The sockets arch_front, arch_rear (the left arch center at the hub) and arch_front_top (its crown) let wheelArches.test.ts check them against physics.
The sill hangs 0.21 m below the collider bottom as skin only.
Deviations from the references: the hood is 0.40 of the length where the photo car has about 0.34, since the engine bay rows end 40 % behind the nose and
moving them would change the grid and saved loadouts; the wheels stay on the physics wheelbase of 2.6 m; the body is 1.94 m wide where the real car at scale is 2.04 m;
the arch lips are the dark flare band; and the spare wheel, plate, badges, wipers and mud flaps are left out, as are reference 1's gun, armor tiles, antenna and hood gear, which are parts.
Inferred: the right side by symmetry and the tail, which neither image shows.
Run: blender --background --python tools/blender/base_niva.py -- public/models/base_niva.glb [tmp/base_niva.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

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
    check_clean_shell,
    check_door_gap,
    check_no_stacking,
    cut_boxes,
    flare,
    hull_layers,
    level_sockets,
)
from parts_common_core import PROUD, ROUND_SIDES  # noqa: E402
from shapes import prism  # noqa: E402

SEED = 313
COLORS = {
    **BASE_COLORS,
    "amber": 0xFFB45A,  # PAL.semi.amber, as the longbed and van use
}
WIDTH = 2.14  # committee patch: the real 2121 at the jeep scale is 2.04 m wide and the first build read too narrow
G = Grid(rows=7, cols=4, half_height=0.4, width=WIDTH)
WHEEL_X = 1.3  # PHYSICS.bodies.niva.wheelX
WHEEL_Y = -0.25  # PHYSICS.bodies.niva.wheelY
WHEEL_R = 0.45  # PHYSICS.bodies.niva.wheelRadius
WHEEL_HALF_W = 0.18  # PHYSICS.bodies.niva.wheelHalfWidth
HUB_Z = WHEEL_Y - SUSPENSION_REST
WHEELS_X = [WHEEL_X, -WHEEL_X]
WHEEL_Y_OUT = 0.726  # PHYSICS.bodies.niva.wheelZ
WELL_Y = WHEEL_Y_OUT - WHEEL_HALF_W - 0.03  # the wheel wells' inner wall

SIDE = G.half_y - INSET  # body side outer face
FRONT = G.half_x - INSET  # nose face
BACK = -G.half_x + INSET  # tail face
SILL = -0.83  # skin only, below the collider bottom
HOOD = 0.09  # the flat hood top and the beltline
ROOF = 0.89  # the flat roof: every cabin row's surface
LINE = -0.2  # reference 2: the character line, a shallow step in the lower body at about headlamp height
SILL_HALF = 0.7  # reference 2: the black sill strip runs between the arches
GRILLE_HALF = 0.72  # reference 2: the grille panel is about 0.7 of the body width
LAMP_R = 0.11  # reference 2: round headlamps about 0.3 of a tire diameter across
VENT_FRONT = 0.43  # reference 2: the door starts just behind the front arch with a vent pane under the A-pillar
VENT_TOP_FRONT = 0.1  # the vent pane's top front corner, behind the A-pillar
VENT_BACK = 0.05
MAIN_FRONT = 0.0  # the thin post between the vent pane and the main pane
MAIN_BACK = -0.6
QUARTER_FRONT = -0.74  # reference 2: the B-pillar is about 0.14 m, then a quarter window about as long as the door glass
QUARTER_BACK = -1.7
SLOTS = (-1.84, -1.94, -2.04)  # reference 2: three slot vents in the C-pillar, each 0.04 m wide so it survives game zoom
SLOT_W = 0.04
DETAIL_TWIST = 20.0  # dark glass and vents show no shard, so they may fold more than paint
ROOF_FRONT = 0.05  # reference 1: the windshield top, raked about 38 degrees from upright over the shorter hood
GAME = Grid(rows=9, cols=4, half_height=0.4, length=4.05, width=1.8)  # chassis.ts layout inside its border cells, 0.45 m rows centred on the collider
BAY_FRONT = GAME.row_x(-0.5)  # the engine bay is layout rows 1 to 3, columns 2 and 3
BAY_BACK = GAME.row_x(2.5)
COWL = BAY_BACK  # the windshield base, against the bay back edge
NOSE_AHEAD = 0.2  # the hood lip, lamps and grille need this much body ahead of the bay
BAY_LEFT = GAME.col_y(0.5)
BAY_RIGHT = GAME.col_y(2.5)
BAY_FLOOR = -0.3  # a 0.5 m engine pokes 0.2 m out of the cutout


def mirrored(kit: Kit, name: str, size: tuple[float, float, float], x: float, y: float, z: float, mat: str) -> None:
    """A box on the left side at +y and its twin on the right side."""
    kit.box(f"{name}_l", size, (x, y, z), mat)
    kit.box(f"{name}_r", size, (x, -y, z), mat)


def lower_body(kit: Kit) -> None:
    """The hood-high body with a character line, round arches cut on the wheels, the engine cutout, a rounded hood edge, flares and a skid."""
    low = hull_layers(
        "lower",
        [
            (SILL, FRONT - 2 * PROUD, BACK, SIDE, 0.12),
            (LINE - 0.04, FRONT - 2 * PROUD, BACK, SIDE, 0.12),
            (LINE, FRONT - 2 * PROUD, BACK, SIDE - 0.035, 0.12),
            (HOOD - 0.1, FRONT - 2 * PROUD, BACK, SIDE - 0.035, 0.12),
            (HOOD, FRONT - 0.09, BACK + 0.02, SIDE - 0.07, 0.12),
        ],
    )
    arch_cut(low, WHEELS_X, HUB_Z, WHEEL_R, WELL_Y, SILL, ROUND_ARCH_SEGMENTS)
    cut_boxes(low, [((BAY_BACK, BAY_RIGHT, BAY_FLOOR), (BAY_FRONT, BAY_LEFT, HOOD + 0.2))])
    low.data.materials.clear()  # the booleans leave an empty slot, which would take the faces off the paint
    kit._add(low, "lower", "paint", 0.0)
    for i, wx in enumerate(WHEELS_X):
        flare(kit, f"flare{i}_l", G, wx, HUB_Z, WHEEL_R, SIDE, G.half_y, SILL, segments=ROUND_ARCH_SEGMENTS)
        flare(kit, f"flare{i}_r", G, wx, HUB_Z, WHEEL_R, -G.half_y, -SIDE, SILL, segments=ROUND_ARCH_SEGMENTS)
    mirrored(kit, "sill_strip", (2 * SILL_HALF, 0.05, 0.12), 0.0, SIDE - 0.005, SILL + 0.12, "under")


def cabin(kit: Kit) -> None:
    """A tall upright cabin under a flat roof: a raked windshield, a vent pane and main pane on the door, a B-pillar, a quarter window and slot vents."""
    layers = [
        (HOOD - 0.02, COWL, BACK + 0.02, SIDE - 0.04, 0.05),
        (ROOF - 0.08, ROOF_FRONT + 0.03, BACK + 0.05, SIDE - 0.1, 0.08),
        (ROOF, ROOF_FRONT, BACK + 0.08, SIDE - 0.14, 0.12),
    ]
    kit._add(hull_layers("cabin", layers), "cabin", "paint", 0.0)
    rise = ROOF - HOOD
    run = COWL - ROOF_FRONT
    tilt = math.atan2(run, rise)
    length = math.hypot(run, rise) - 0.2
    kit.box(
        "windshield",
        (0.03, 2 * (SIDE - 0.2), length),
        ((COWL + ROOF_FRONT) / 2 + 0.012, 0, (HOOD + ROOF) / 2 + 0.007),
        "glass",
        rot=(0, -tilt, 0),
    )
    lo, hi = HOOD + 0.12, ROOF - 0.13
    side_y = SIDE - 0.1
    vent = [(VENT_FRONT, lo), (VENT_BACK, lo), (VENT_BACK, hi), (VENT_TOP_FRONT, hi)]
    main = [(MAIN_FRONT, lo), (MAIN_BACK, lo), (MAIN_BACK, hi), (MAIN_FRONT, hi)]
    quarter = [(QUARTER_FRONT, lo + 0.05), (QUARTER_BACK, lo + 0.05), (QUARTER_BACK, hi), (QUARTER_FRONT, hi)]
    check_door_gap("door_glass", VENT_FRONT, MAIN_BACK, lo, WHEELS_X, HUB_Z, WHEEL_R + ARCH_CLEARANCE)
    for name, prof in (("vent_glass", vent), ("door_glass", main), ("quarter_glass", quarter)):
        prism(kit, f"{name}_l", prof, side_y + 0.015, side_y + 0.045, "glass")
        prism(kit, f"{name}_r", prof, -side_y - 0.045, -side_y - 0.015, "glass")
    for k, x in enumerate(SLOTS):
        mirrored(kit, f"slot{k}", (SLOT_W, 0.03, hi - lo - 0.25), x, side_y + 0.03, (lo + hi) / 2 - 0.02, "under")
    for s, sy in (("l", 1), ("r", -1)):
        kit.box(f"mirror_{s}", (0.1, 0.08, 0.14), (COWL - 0.2, sy * (SIDE - 0.03), HOOD + 0.15), "under")
        kit.box(f"rail_{s}", (ROOF_FRONT - BACK - 0.25, 0.05, 0.05), ((ROOF_FRONT + BACK) / 2 - 0.02, sy * (SIDE - 0.12), ROOF - 0.06), "under")


def rear(kit: Kit) -> None:
    """A near-vertical tailgate with a framed rear window, upright red-over-amber taillight clusters and a thin bumper with end caps."""
    tail_tilt = math.atan2(0.06, ROOF - HOOD)
    kit.box("rear_glass", (0.03, 2 * (SIDE - 0.4), 0.42), (BACK + 0.035, 0, 0.43), "glass", rot=(0, tail_tilt, 0))
    mirrored(kit, "taillight", (INSET, 0.16, 0.22), BACK - INSET / 2 + 0.01, SIDE - 0.14, -0.05, "red")
    mirrored(kit, "taillight_amber", (INSET, 0.16, 0.12), BACK - INSET / 2 + 0.01, SIDE - 0.14, -0.27, "amber")
    kit.box("rear_bumper", (0.08, 2 * SIDE, 0.12), (BACK + 0.03, 0, -0.52), "under")
    mirrored(kit, "rear_cap", (0.12, 0.12, 0.2), BACK + 0.04, SIDE - 0.04, -0.52, "under")


def nose(kit: Kit) -> None:
    """An upright face: a grille panel with a round headlamp at each end, amber wing lamps, a thin bumper with end caps and a dark valance."""
    kit.box("grille", (0.06, 2 * GRILLE_HALF, 0.35), (FRONT - 0.03, 0, -0.175), "under")
    for s, sy in (("l", 1), ("r", -1)):
        kit.cylinder(f"lamp_{s}", LAMP_R, 0.06, (FRONT - 0.03 + PROUD, sy * (GRILLE_HALF - 0.16), -0.15), "light", rot=(0, math.pi / 2, 0), vertices=ROUND_SIDES)
        kit.box(f"wing_lamp_{s}", (0.06, 0.24, 0.1), (FRONT - 0.04, sy * (SIDE - 0.2), HOOD - 0.08), "amber")
        kit.box(f"side_lamp_{s}", (0.14, 0.03, 0.07), (FRONT - 0.5, sy * (SIDE - 0.03), -0.05), "amber")
        kit.box(f"bumper_cap_{s}", (0.14, 0.12, 0.2), (FRONT - 0.06, sy * (SIDE - 0.04), -0.43), "under")
    kit.box("bumper", (0.1, 2 * SIDE, 0.14), (FRONT - 0.05, 0, -0.43), "under")
    kit.box("valance", (0.06, 2 * (SIDE - 0.1), 0.22), (FRONT - 0.03, 0, -0.62), "under")


def check_niva(kit: Kit) -> None:
    """Raises unless the model has its round headlamps, amber and tail lamps, a door seam, glass on each side and a body inside the fixed box."""
    by_name = {obj.name: obj for obj in kit._parts}
    for s in ("l", "r"):
        for need in (f"lamp_{s}", f"wing_lamp_{s}", f"taillight_{s}", f"vent_glass_{s}", f"door_glass_{s}", f"quarter_glass_{s}", f"rail_{s}"):
            if need not in by_name:
                raise RuntimeError(f"niva lacks {need}")
        if len(by_name[f"lamp_{s}"].data.vertices) < 2 * ROUND_SIDES:
            raise RuntimeError(f"niva headlamp {s} has fewer than {ROUND_SIDES} sides")
    if len(SLOTS) != 3 or SLOT_W < 0.04:
        raise RuntimeError("niva needs three C-pillar slots at least 0.04 m wide")
    xs = [c[0] for c in by_name["lower"].data.vertices[0:0]] or [(by_name["lower"].matrix_world @ v.co) for v in by_name["lower"].data.vertices]
    for edge in (BAY_FRONT, BAY_BACK):
        if not any(abs(p.x - edge) < 1e-3 and abs(p.z - HOOD) < 1e-3 for p in xs):
            raise RuntimeError(f"niva hood hole misses the bay edge at x {edge:.3f}")
    if FRONT - BAY_FRONT < NOSE_AHEAD:
        raise RuntimeError(f"niva nose at x {FRONT:.3f} is under {NOSE_AHEAD} m ahead of the bay front at {BAY_FRONT:.3f}")
    zs = [(obj.matrix_world @ v.co).z for obj in kit._parts for v in obj.data.vertices]
    if min(zs) < SILL - 0.02 or max(zs) > ROOF + 0.02:
        raise RuntimeError(f"niva height {min(zs):.3f}..{max(zs):.3f} leaves the fixed box")


def main() -> None:
    args = parse_args()
    kit = Kit(COLORS, SEED)
    lower_body(kit)
    cabin(kit)
    nose(kit)
    rear(kit)
    kit.socket("arch_front", (WHEEL_X, WHEEL_Y_OUT, HUB_Z))
    kit.socket("arch_rear", (-WHEEL_X, WHEEL_Y_OUT, HUB_Z))
    kit.socket("arch_front_top", (WHEEL_X, WHEEL_Y_OUT, HUB_Z + WHEEL_R + ARCH_CLEARANCE))
    bay = {(x, y): BAY_FLOOR for x in (1, 2) for y in (0, 1)}
    level_sockets(kit, G, "row", [HOOD] * 2 + [ROOF] * 5, fronts={2: ROOF_FRONT}, cells=bay)
    level_sockets(kit, G, "floor", [G.top] * G.rows, cells=bay)
    check_niva(kit)
    check_base(kit, "base_niva", G)
    shell = [o.name for o in kit._parts if o.name in ("lower", "cabin", "windshield", "vent_glass_l", "vent_glass_r", "door_glass_l", "door_glass_r", "quarter_glass_l", "quarter_glass_r", "rear_glass")]
    check_no_stacking("base_niva", kit.parts([n for n in shell if n.endswith("_glass") or "glass_" in n]))
    check_clean_shell("base_niva", kit.parts(shell), slivers=False, max_twist=DETAIL_TWIST)
    kit.export("base_niva", args, view_size=6.0)


if __name__ == "__main__":
    main()
