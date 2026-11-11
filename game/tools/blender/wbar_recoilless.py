"""Recoilless rifle barrel for the 'recoilless' weapon.

1.6 m long. One wide plain tube with a big flared horn at the rear and a small flare at the muzzle. Origin at the
rear end, centered in Y and Z, running along +X.
Run: blender --background --python tools/blender/wbar_recoilless.py -- public/models/wbar_recoilless.glb [tmp/wbar_recoilless.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_weapon import run, tube  # noqa: E402
from shapes import taper  # noqa: E402

SEED = 120


def build(kit: Kit) -> None:
    horn = tube(kit, "rear_horn", 0.075, 0.0, 0.25, "metal_light")
    taper(horn, 1.0, 2.0)
    tube(kit, "barrel", 0.075, 0.25, 1.5, "metal")
    flare = tube(kit, "muzzle_flare", 0.075, 1.5, 1.6, "metal_light")
    taper(flare, 1.4)
    kit.socket("tip", (1.6, 0, 0))


if __name__ == "__main__":
    run("wbar_recoilless", build, SEED, preview_m=3.6)
