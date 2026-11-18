"""Periscope: a short mast with an offset eyepiece head and a lens, for periscope.

Footprint 1x1: 0.65 m along (X) by 0.484 m across (Y). About 0.7 m tall. Origin at the footprint center on the deck top.
Run: blender --background --python tools/blender/util_periscope.py -- public/models/util_periscope.glb [tmp/util_periscope.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_cargo import run  # noqa: E402

SEED = 411


def build(kit: Kit) -> None:
    kit.box("foot", (0.5, 0.4, 0.05), (0, 0, 0.025), "metal")
    kit.cylinder("sleeve", 0.07, 0.2, (-0.05, 0, 0.15), "battery", vertices=8)
    kit.cylinder("tube", 0.045, 0.62, (-0.05, 0, 0.36), "metal_light", vertices=8, dent_by=0.003)
    kit.cylinder("collar", 0.065, 0.04, (-0.05, 0, 0.5), "paint", vertices=8)
    kit.box("head", (0.26, 0.12, 0.12), (0.05, 0, 0.66), "metal", dent_by=0.004)
    kit.cylinder("lens", 0.05, 0.04, (0.2, 0, 0.66), "screen", rot=(0, 1.5707963267948966, 0), vertices=8)
    kit.box("hood", (0.1, 0.16, 0.03), (0.17, 0, 0.73), "battery")
    for y in (-0.15, 0.15):
        kit.box(f"brace{y}", (0.04, 0.03, 0.22), (-0.18, y, 0.15), "battery", rot=(0, 0.5, 0))


def main() -> None:
    run("util_periscope", build, SEED, view_size=1.2, w=1, h=1, max_h=0.8)


if __name__ == "__main__":
    main()
