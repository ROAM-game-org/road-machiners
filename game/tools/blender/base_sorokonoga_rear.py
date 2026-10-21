"""The sorokonoga's rear unit: a closed box module with a flat roof on two axles, hitched at the tractor's fifth wheel.

sorokonoga_common.py lays out the rig. The unit is 6.3 m long and 2.9 m wide, from x 3.5 to -2.8 of the straight rig frame,
and its origin is its center there. The pivot socket, the tractor's coupling disc, is 3.45 m ahead of the origin, 0.3 m outside the nose,
at PHYSICS.couplings.sorokonoga.pivotRear. The game draws the single wheels of the last axle, 2.35 m behind the origin at
PHYSICS.couplings.sorokonoga.rear.wheelX; the model draws the two wheels of the axle before it. Its deck rows rest on the flat roof.
Run: blender --background --python tools/blender/base_sorokonoga_rear.py -- public/models/base_sorokonoga_rear.glb [tmp/base_sorokonoga_rear.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from rig_units import export_unit  # noqa: E402
from sorokonoga_common import BACK, COLORS, HUB_Z, MODULE_AXLES, MODULE_FRONT, MODULE_ORIGIN, PIVOT_X, SEED, WHEEL_Z, check_unit, module, unit_wheels, up  # noqa: E402


def main() -> None:
    kit = Kit(COLORS, SEED)
    unit_wheels("base_sorokonoga_rear", module(kit), 1)
    check_unit(kit, "base_sorokonoga_rear", MODULE_FRONT, BACK)
    export_unit(kit, "base_sorokonoga_rear", MODULE_ORIGIN, {
        "arch_rear": (MODULE_AXLES[-1], WHEEL_Z, HUB_Z),
        "pivot": (PIVOT_X, 0, up(1.17)),
    })


if __name__ == "__main__":
    main()
