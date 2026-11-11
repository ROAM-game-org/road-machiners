"""Grenade launcher barrel for the 'grenade' weapon.

0.8 m long. A short fat tube with a thick front ring and a rear collar. Origin at the rear end, centered in Y and Z,
running along +X.
Run: blender --background --python tools/blender/wbar_grenade.py -- public/models/wbar_grenade.glb [tmp/wbar_grenade.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_weapon import run, tube  # noqa: E402

SEED = 122


def build(kit: Kit) -> None:
    tube(kit, "collar", 0.105, 0.0, 0.1, "metal_light")
    tube(kit, "barrel", 0.085, 0.1, 0.68, "metal")
    tube(kit, "front_ring", 0.105, 0.68, 0.8, "metal_light")
    kit.socket("tip", (0.8, 0, 0))


if __name__ == "__main__":
    run("wbar_grenade", build, SEED, preview_m=2.0)
