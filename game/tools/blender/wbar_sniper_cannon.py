"""Heavy sniper cannon barrel for the 'sniperCannon' weapon.

2.2 m long. A thick tapered barrel with a thick rear collar and a large box muzzle brake with two fins. Origin at
the rear end, centered in Y and Z, running along +X.
Run: blender --background --python tools/blender/wbar_sniper_cannon.py -- public/models/wbar_sniper_cannon.glb [tmp/wbar_sniper_cannon.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_weapon import run, tube  # noqa: E402
from shapes import taper  # noqa: E402

SEED = 121


def build(kit: Kit) -> None:
    tube(kit, "collar", 0.095, 0.0, 0.14, "metal_light")
    barrel = tube(kit, "barrel", 0.06, 0.14, 1.96, "metal")
    taper(barrel, 0.75)
    kit.box("brake", (0.24, 0.13, 0.1), (2.08, 0, 0), "metal_light", dent_by=0.003)
    for x in (2.04, 2.15):
        kit.box(f"brake_fin{x:.2f}", (0.04, 0.2, 0.14), (x, 0, 0), "dark")
    kit.socket("tip", (2.2, 0, 0))


if __name__ == "__main__":
    run("wbar_sniper_cannon", build, SEED, preview_m=4.8)
