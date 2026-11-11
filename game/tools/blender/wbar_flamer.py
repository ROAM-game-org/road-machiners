"""Flamethrower nozzle barrel for the 'flamer' weapon.

0.6 m long. A short tube ending in a big flared nozzle cone, with a dark pilot light box under the front.
Origin at the rear end, centered in Y and Z, running along +X.
Run: blender --background --python tools/blender/wbar_flamer.py -- public/models/wbar_flamer.glb [tmp/wbar_flamer.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_core import PROUD  # noqa: E402
from parts_common_weapon import run, tube  # noqa: E402
from shapes import taper  # noqa: E402

SEED = 118
NOZZLE_START = 0.3
LENGTH = 0.6


def build(kit: Kit) -> None:
    tube(kit, "pipe", 0.04, 0.0, NOZZLE_START + 0.02, "metal", dent_by=0.002)
    nozzle = tube(kit, "nozzle", 0.09, NOZZLE_START, LENGTH, "metal_light", sides=8)
    taper(nozzle, top=1.0, bottom=0.45)
    tube(kit, "nozzle_mouth", 0.07, LENGTH - 0.03, LENGTH + PROUD, "dark", sides=8)
    kit.box("pilot", (0.12, 0.1, 0.1), (0.5, 0, -0.09), "dark", dent_by=0.003)
    kit.box("pilot_arm", (0.05, 0.05, 0.08), (0.42, 0, -0.04), "dark")
    kit.socket("tip", (LENGTH, 0, 0))


if __name__ == "__main__":
    run("wbar_flamer", build, SEED, preview_m=0.9)
