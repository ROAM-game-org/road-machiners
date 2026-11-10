"""Gatling barrel cluster for the 'gatling' weapon.

0.9 m long. Six barrels round a hub, a big rear drum, a middle clamp ring, a front clamp disc and a paint ammo box
on the -Y side with a dark feed chute. Origin at the rear end, centered in Y and Z, running along +X.
Run: blender --background --python tools/blender/wbar_gatling.py -- public/models/wbar_gatling.glb [tmp/wbar_gatling.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_weapon import run, tube  # noqa: E402

SEED = 119

BARREL_RING = 0.07


def build(kit: Kit) -> None:
    tube(kit, "drum", 0.12, 0.0, 0.18, "metal_light")
    tube(kit, "hub", 0.04, 0.18, 0.86, "dark")
    for i in range(6):
        a = math.tau * i / 6
        tube(kit, f"barrel{i}", 0.025, 0.18, 0.9, "metal", y=BARREL_RING * math.cos(a), z=BARREL_RING * math.sin(a), sides=6)
    tube(kit, "mid_clamp", 0.1, 0.45, 0.52, "metal_light")
    tube(kit, "front_disc", 0.1, 0.8, 0.86, "metal_light")
    kit.box("ammo_box", (0.3, 0.2, 0.2), (0.15, -0.22, 0.0), "paint", dent_by=0.004)
    kit.box("feed_chute", (0.12, 0.08, 0.1), (0.15, -0.12, 0.0), "dark")
    kit.socket("tip", (0.9, 0, 0))


if __name__ == "__main__":
    run("wbar_gatling", build, SEED, preview_m=2.6)
