"""Spare tire: a road tire stood on edge in a low cradle, for spareTire.

Footprint 1x2: 1.3 m along (X) by 0.484 m across (Y). About 0.8 m tall. Origin at the footprint center on the deck top.
The tire stands along the truck on a two-leg cradle, held by a strap, with a pale rim face showing.
Run: blender --background --python tools/blender/spare_tire.py -- public/models/spare_tire.glb [tmp/spare_tire.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_cargo import run  # noqa: E402

SEED = 412
SIDEWAYS = (1.5707963267948966, 0, 0)
RADIUS = 0.38
WIDTH = 0.26


def build(kit: Kit) -> None:
    kit.box("cradle", (1.1, 0.4, 0.04), (0, 0, 0.02), "metal")
    for x in (-0.3, 0.3):
        kit.box(f"chock{x}", (0.08, 0.34, 0.1), (x, 0, 0.09), "battery", rot=(0, 0.5 if x < 0 else -0.5, 0))
    centre = 0.04 + RADIUS - 0.04
    kit.cylinder("tire", RADIUS, WIDTH, (0, 0, centre), "wheel", rot=SIDEWAYS, vertices=14, dent_by=0.006)
    kit.cylinder("tread", RADIUS * 1.0, WIDTH * 0.5, (0, 0, centre), "battery", rot=SIDEWAYS, vertices=14)
    for y in (-WIDTH / 2 - 0.004, WIDTH / 2 + 0.004):
        kit.cylinder(f"rim{y}", RADIUS * 0.62, 0.012, (0, y, centre), "metal_light", rot=SIDEWAYS, vertices=12)
        kit.cylinder(f"hub{y}", RADIUS * 0.2, 0.02, (0, y * 1.04, centre), "metal", rot=SIDEWAYS, vertices=8)
    kit.box("strap", (0.05, 0.34, 0.03), (0, 0, centre + RADIUS + 0.005), "paint")
    kit.box("buckle", (0.06, 0.04, 0.05), (0, -0.16, centre + RADIUS + 0.01), "metal_light")


def main() -> None:
    run("spare_tire", build, SEED, view_size=1.8, w=1, h=2, max_h=0.85)


if __name__ == "__main__":
    main()
