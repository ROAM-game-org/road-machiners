"""The semi's rear unit: the tall white box trailer on its tandem, with its king pin and landing legs.

semi_common.py lays out the rig and its photo proportions. The trailer is 15.0 m long and 3.1 m wide, from x 4.75 to
-10.25 of the straight rig frame, and its origin is its center there, 2.75 m behind the rig's center. The king pin, the
pivot socket, is 5.75 m ahead of the origin, PHYSICS.couplings.semi.pivotRear. The game draws the outer wheels of the last
axle, 6.2 m behind the origin at PHYSICS.couplings.semi.rear.wheelX; the model draws the other 6 wheels of the tandem.
Cargo on the trailer's bay cells is inside the box, so the game does not draw it.
Run: blender --background --python tools/blender/base_semi_rear.py -- public/models/base_semi_rear.glb [tmp/base_semi_rear.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from semi_common import BACK, COLORS, HUB_Z, LAST_TRAILER_X, PIVOT_X, SEED, TRAILER_FLOOR, TRAILER_FRONT, TRAILER_ORIGIN, WHEEL_Z, WIDTH, build_trailer, check_unit, export_unit, unit_wheels  # noqa: E402


def main() -> None:
    kit = Kit(COLORS, SEED)
    unit_wheels("base_semi_rear", build_trailer(kit))
    check_unit(kit, "base_semi_rear", TRAILER_FRONT, BACK, WIDTH)
    export_unit(kit, "base_semi_rear", TRAILER_ORIGIN, {
        "arch_rear": (LAST_TRAILER_X, WHEEL_Z, HUB_Z),
        "pivot": (PIVOT_X, 0, TRAILER_FLOOR),
    })


if __name__ == "__main__":
    main()
