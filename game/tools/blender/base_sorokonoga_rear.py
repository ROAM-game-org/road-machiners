"""The sorokonoga's rear unit: the long low stake bed on four close axles of dual wheels, with its king pin and landing legs.

sorokonoga_common.py lays out the rig. The bed is 12.8 m long and 2.9 m wide, from x 4.4 to -8.4 of the straight rig frame,
and its origin is its center there, 2 m behind the rig's center. The king pin, the pivot socket, is 5.9 m ahead of the origin,
PHYSICS.couplings.sorokonoga.pivotRear. The game draws the outer wheels of the last axle, 5.2 m behind the origin at
PHYSICS.couplings.sorokonoga.rear.wheelX; the model draws the other 14 wheels. Cargo on the bed shows on its open deck.
Run: blender --background --python tools/blender/base_sorokonoga_rear.py -- public/models/base_sorokonoga_rear.glb [tmp/base_sorokonoga_rear.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from rig_units import export_unit  # noqa: E402
from sorokonoga_common import BACK, BED_AXLES, BED_FRONT, BED_ORIGIN, COLORS, HUB_Z, PIVOT_X, SEED, WHEEL_Z, bed, check_unit, unit_wheels, up  # noqa: E402


def main() -> None:
    kit = Kit(COLORS, SEED)
    unit_wheels("base_sorokonoga_rear", bed(kit), 1)
    check_unit(kit, "base_sorokonoga_rear", BED_FRONT, BACK)
    export_unit(kit, "base_sorokonoga_rear", BED_ORIGIN, {
        "arch_rear": (BED_AXLES[-1], WHEEL_Z, HUB_Z),
        "pivot": (PIVOT_X, 0, up(1.17)),
    })


if __name__ == "__main__":
    main()
