"""Pressure tank for the 'pneumobolter' weapon.

Origin at the receiver's top front edge. One big painted tank, 0.5 m long, lies on top of the receiver and reaches
back from there. Two dark straps hold it and a short dark pipe leads forward.
Run: blender --background --python tools/blender/wext_air_tank.py -- public/models/wext_air_tank.glb [tmp/wext_air_tank.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_weapon import run, tube  # noqa: E402
from shapes import taper  # noqa: E402

SEED = 120
RADIUS = 0.11
FRONT_X = -0.02
BACK_X = -0.52
CENTER_Z = 0.1  # The tank bottom sits just under the receiver top.


def build(kit: Kit) -> None:
    tank = tube(kit, "tank", RADIUS, BACK_X, FRONT_X, "paint", z=CENTER_Z, sides=10, dent_by=0.003)
    taper(tank, top=0.85, bottom=1.0)
    for x in (-0.15, -0.38):
        kit.box(f"strap{x:.2f}", (0.05, 0.24, 0.24), (x, 0, CENTER_Z), "dark")
    tube(kit, "pipe", 0.03, FRONT_X, 0.1, "dark", z=CENTER_Z, sides=6)
    kit.box("valve", (0.07, 0.08, 0.06), (-0.02, 0, CENTER_Z + RADIUS - 0.01), "dark")


if __name__ == "__main__":
    run("wext_air_tank", build, SEED, preview_m=1.0)
