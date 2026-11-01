"""The semi's front unit: the orange long-nose tractor, from its chrome bumper to the frame's rear cross member.

semi_common.py lays out the rig and its photo proportions. The tractor is 9.025 m long, from x 10.25 to 1.225 of the straight
rig frame, and its origin is its center there, 5.7375 m ahead of the rig's center, halfway between the steer axle and the
rear drive axle. So the physics wheels sit 3.2125 m either way of it, PHYSICS.bodies.semi.wheelX, and the engine hole at
PHYSICS.bodies.semi.engine. The game draws the steer pair and the rear drive axle's outer duals; the model draws the
other 6 wheels of the drive tandem. The pivot socket marks the fifth wheel's king pin, 2.7375 m behind the origin, where
the trailer swivels. The arch sockets let wheelArches.test.ts check the wheels against physics.
Run: blender --background --python tools/blender/base_semi.py -- public/models/base_semi.glb [tmp/base_semi.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_base import ARCH_CLEARANCE  # noqa: E402
from semi_common import COLORS, FRONT, HUB_Z, PIVOT_X, REAR_DRIVE_X, SEED, STEER_X, TRACTOR_ORIGIN, TRACTOR_REAR, TRAILER_FLOOR, WHEEL_R, WHEEL_Z, build_tractor, check_unit, export_unit, unit_wheels  # noqa: E402

WIDTH = 3.06


def main() -> None:
    kit = Kit(COLORS, SEED)
    unit_wheels("base_semi", build_tractor(kit))
    check_unit(kit, "base_semi", FRONT, TRACTOR_REAR, WIDTH)
    export_unit(kit, "base_semi", TRACTOR_ORIGIN, {
        "arch_front": (STEER_X, WHEEL_Z, HUB_Z),
        "arch_rear": (REAR_DRIVE_X, WHEEL_Z, HUB_Z),
        "arch_front_top": (STEER_X, WHEEL_Z, HUB_Z + WHEEL_R + ARCH_CLEARANCE),
        "pivot": (PIVOT_X, 0, TRAILER_FLOOR),
    })


if __name__ == "__main__":
    main()
