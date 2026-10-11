"""The semi base: a stylized long-nose tractor and box trailer, drawn as one rigid body with 18 wheels on 5 axles.

Grid: 5 columns by 20 rows, 2.42 m across by 13 m along. Half height 0.9 m, from PHYSICS.bodies.semi.
Rows 0 to 4 are the long hood with the engine on top, rows 5 and 6 the cab, rows 7 to 19 the box trailer with a flat roof.
The game draws the steering wheels on row 2 and the trailer wheels on row 17, radius 0.7 m, half width 0.3 m, mount 0.6 m below the center.
The model draws the other axles: two tractor drive axles under the fifth wheel and a second trailer axle, all with dual wheels,
and the inner wheel of the trailer axle the game draws. That makes 18 wheels on 5 axles.
Run: blender --background --python tools/blender/base_semi.py -- public/models/base_semi.glb [tmp/base_semi.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402
from parts_common_base import BASE_COLORS, INSET, Grid, check_base, level_sockets  # noqa: E402

SEED = 321
G = Grid(rows=20, cols=5, half_height=0.9)
SIDE = G.half_y - INSET
FRONT = G.half_x - INSET
BACK = -G.half_x + INSET
WHEEL_X = 4.2  # PHYSICS.bodies.semi.wheelX
REAR_AXLES = [-WHEEL_X, -5.2]
DRIVE_AXLES = [0.9, -0.1]
EXTRA_WHEEL_R = 0.7
HUB_Z = -1.0

HOOD_TOP = 0.3
CAB_BACK = G.row_x(6.5)
CAB_FRONT = G.row_x(4.5)
CAB_ROOF = 0.95
TRAILER_FRONT = G.row_x(6.5)
TRAILER_ROOF = 0.9
BODY_BOTTOM = -0.25
FRAME_Y = 0.62


def wheel(kit: Kit, name: str, x: float, y: float, half_w: float) -> None:
    kit.cylinder(name, EXTRA_WHEEL_R, 2 * half_w, (x, y, HUB_Z), "wheel", rot=(math.pi / 2, 0, 0), vertices=10)


def chassis(kit: Kit) -> None:
    kit.box("frame", (BACK - FRONT, 2 * FRAME_Y, 0.3), ((FRONT + BACK) / 2, 0, BODY_BOTTOM - 0.15), "under")
    for x in DRIVE_AXLES + [REAR_AXLES[1]]:
        for s in (1, -1):
            for k, y in enumerate((0.82, 1.04)):
                wheel(kit, f"dual_{x}_{s}_{k}", x, s * y, 0.1)
    for s in (1, -1):
        wheel(kit, f"inner_{s}", REAR_AXLES[0], s * 0.74, 0.1)


def tractor(kit: Kit) -> None:
    hood_front = FRONT - 0.1
    hood_back = CAB_FRONT
    kit.box("hood", (hood_front - hood_back, 2 * (SIDE - 0.1), HOOD_TOP - BODY_BOTTOM), ((hood_front + hood_back) / 2, 0, (HOOD_TOP + BODY_BOTTOM) / 2), "paint")
    kit.box("grille", (0.06, 1.6, 0.8), (FRONT - 0.03, 0, 0.0), "under")
    kit.box("bumper", (0.2, 2 * SIDE, 0.22), (FRONT - 0.1, 0, BODY_BOTTOM - 0.05), "metal_light")
    for s in (1, -1):
        kit.box(f"lamp_{s}", (0.05, 0.28, 0.16), (FRONT - 0.02, s * 0.8, 0.2), "light")
        kit.box(f"fender_{s}", (1.5, 0.3, 0.12), (WHEEL_X, s * (SIDE - 0.2), HOOD_TOP - 0.05), "under")
    kit.box("cab", (CAB_FRONT - CAB_BACK, 2 * SIDE - 0.1, CAB_ROOF - BODY_BOTTOM), ((CAB_FRONT + CAB_BACK) / 2, 0, (CAB_ROOF + BODY_BOTTOM) / 2), "paint")
    kit.box("windshield", (0.04, 2 * SIDE - 0.4, 0.5), (CAB_FRONT + 0.0, 0, CAB_ROOF - 0.38), "glass")
    for s in (1, -1):
        kit.box(f"door_glass_{s}", (0.6, 0.04, 0.4), (CAB_FRONT - 0.5, s * (SIDE - 0.02), CAB_ROOF - 0.38), "glass")
        kit.cylinder(f"stack_{s}", 0.07, 1.6, (CAB_BACK + 0.12, s * (SIDE - 0.15), CAB_ROOF - 0.3), "metal_light", vertices=8)
    kit.box("roof_trim", (CAB_FRONT - CAB_BACK + 0.05, 2 * SIDE - 0.05, 0.06), ((CAB_FRONT + CAB_BACK) / 2, 0, CAB_ROOF + 0.02), "trim")
    kit.box("fifth_wheel", (1.0, 1.4, 0.1), (TRAILER_FRONT - 0.6, 0, BODY_BOTTOM + 0.02), "metal")


def trailer(kit: Kit) -> None:
    length = TRAILER_FRONT - BACK
    mid = (TRAILER_FRONT + BACK) / 2
    kit.box("trailer", (length, 2 * SIDE, TRAILER_ROOF - BODY_BOTTOM), (mid, 0, (TRAILER_ROOF + BODY_BOTTOM) / 2), "metal_light")
    kit.box("trailer_roof", (length, 2 * SIDE - 0.08, 0.06), (mid, 0, TRAILER_ROOF + 0.02), "trim")
    for i in range(7):
        x = TRAILER_FRONT - 0.5 - i * (length - 1.0) / 6
        for s in (1, -1):
            kit.box(f"rib_{i}_{s}", (0.1, 0.04, TRAILER_ROOF - BODY_BOTTOM - 0.1), (x, s * (SIDE - 0.02), (TRAILER_ROOF + BODY_BOTTOM) / 2), "metal")
    kit.box("door_seam", (0.04, 2 * SIDE - 0.2, TRAILER_ROOF - BODY_BOTTOM - 0.1), (BACK + 0.0, 0, (TRAILER_ROOF + BODY_BOTTOM) / 2), "metal")
    kit.box("bumper_rear", (0.2, 2 * SIDE - 0.3, 0.2), (BACK + 0.1, 0, BODY_BOTTOM - 0.1), "metal_dark")
    for s in (1, -1):
        kit.box(f"taillight_{s}", (0.04, 0.2, 0.2), (BACK - 0.0, s * (SIDE - 0.3), BODY_BOTTOM + 0.2), "red")
        kit.box(f"flap_{s}", (0.04, 0.6, 0.5), (REAR_AXLES[1] - 0.8, s * 0.9, HUB_Z + 0.3), "wheel")


def main() -> None:
    args = parse_args()
    kit = Kit(BASE_COLORS, SEED)
    chassis(kit)
    tractor(kit)
    trailer(kit)
    heights = [HOOD_TOP] * 5 + [CAB_ROOF] * 2 + [TRAILER_ROOF] * 13
    level_sockets(kit, G, "row", heights)
    level_sockets(kit, G, "floor", [HOOD_TOP - 0.1] * 5 + [CAB_ROOF - 0.5] * 2 + [TRAILER_ROOF - 0.5] * 13)
    check_base(kit, "base_semi", G)
    kit.export("base_semi", args, view_size=16.0)


if __name__ == "__main__":
    main()
