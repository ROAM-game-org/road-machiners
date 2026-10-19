"""The sorokonoga's front unit: a short Old World cab-over tractor with an engine house, a fifth wheel and two axles.

sorokonoga_common.py lays out the rig. The tractor is 5.8 m long, from x 8.4 to 2.6 of the straight rig frame, and its origin
is its center there, halfway between the steer axle and the drive axle. So the physics wheels sit 1.9 m either way of it,
PHYSICS.bodies.sorokonoga.wheelX, and the engine hole at PHYSICS.bodies.sorokonoga.engine. The game draws the steer pair and
the drive axle's outer duals; the model draws the inner duals. The pivot socket marks the fifth wheel's king pin, 1.6 m behind
the origin, where the bed swivels. The arch sockets let wheelArches.test.ts check the wheels against physics.
Run: blender --background --python tools/blender/base_sorokonoga.py -- public/models/base_sorokonoga.glb [tmp/base_sorokonoga.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_base import ARCH_CLEARANCE  # noqa: E402
from rig_units import export_unit  # noqa: E402
from sorokonoga_common import COLORS, DRIVE_X, FRONT, HUB_Z, PIVOT_X, SEED, STEER_X, TRACTOR_ORIGIN, TRACTOR_REAR, WHEEL_R, WHEEL_Z, build_tractor, check_unit, unit_wheels, up  # noqa: E402


def main() -> None:
    kit = Kit(COLORS, SEED)
    unit_wheels("base_sorokonoga", build_tractor(kit), 0)
    check_unit(kit, "base_sorokonoga", FRONT, TRACTOR_REAR)
    export_unit(kit, "base_sorokonoga", TRACTOR_ORIGIN, {
        "arch_front": (STEER_X, WHEEL_Z, HUB_Z),
        "arch_rear": (DRIVE_X, WHEEL_Z, HUB_Z),
        "arch_front_top": (STEER_X, WHEEL_Z, HUB_Z + WHEEL_R + ARCH_CLEARANCE),
        "pivot": (PIVOT_X, 0, up(1.17)),
    })


if __name__ == "__main__":
    main()
