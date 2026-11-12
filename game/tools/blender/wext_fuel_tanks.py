"""Fuel tanks for the 'flamer' weapon.

Origin at the receiver's top front edge. Two painted tank cylinders 0.45 m long lie side by side on top of the
receiver and reach back to x = -0.55. Dark straps hold them and one dark hose runs forward.
Run: blender --background --python tools/blender/wext_fuel_tanks.py -- public/models/wext_fuel_tanks.glb [tmp/wext_fuel_tanks.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_weapon import run, tube  # noqa: E402

SEED = 119
RADIUS = 0.09
FRONT_X = -0.1
BACK_X = -0.55
CENTER_Z = 0.07  # The tank bottoms sit just under the receiver top.
SIDE = 0.1  # Tank axis offset from the centerline.


def build(kit: Kit) -> None:
    for y in (-SIDE, SIDE):
        tube(kit, f"tank{y:.2f}", RADIUS, BACK_X, FRONT_X, "paint", y=y, z=CENTER_Z, sides=10, dent_by=0.003)
        tube(kit, f"cap{y:.2f}", RADIUS * 0.7, FRONT_X, FRONT_X + 0.03, "metal", y=y, z=CENTER_Z, sides=8)
    for x in (-0.22, -0.43):
        kit.box(f"strap{x:.2f}", (0.05, 0.4, 0.2), (x, 0, CENTER_Z + 0.01), "dark")
    tube(kit, "hose", 0.025, FRONT_X, 0.03, "dark", z=CENTER_Z + RADIUS + 0.01, sides=6)
    kit.box("hose_joint", (0.06, 0.07, 0.06), (-0.12, 0, CENTER_Z + RADIUS), "dark")


if __name__ == "__main__":
    run("wext_fuel_tanks", build, SEED, preview_m=1.0)
