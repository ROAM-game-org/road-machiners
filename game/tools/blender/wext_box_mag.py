"""Box magazine for the 'autocannon' weapon.

Origin at the receiver's top front edge. A big painted box, 0.28 m long, 0.18 m wide and 0.14 m tall, sits on top
of the receiver just behind the origin. A dark feed lip runs across its front.
Run: blender --background --python tools/blender/wext_box_mag.py -- public/models/wext_box_mag.glb [tmp/wext_box_mag.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_weapon import run  # noqa: E402

SEED = 121
LENGTH = 0.28
WIDTH = 0.18
HEIGHT = 0.14
GAP = 0.02  # Space between the origin and the box front, for the lip.


def build(kit: Kit) -> None:
    center_x = -GAP - LENGTH / 2
    kit.box("magazine", (LENGTH, WIDTH, HEIGHT), (center_x, 0, HEIGHT / 2 - 0.01), "paint", dent_by=0.004)
    kit.box("feed_lip", (0.05, WIDTH + 0.02, 0.06), (-GAP / 2, 0, 0.03), "dark")
    kit.box("top_band", (0.05, WIDTH + 0.01, 0.015), (center_x, 0, HEIGHT - 0.005), "dark")


if __name__ == "__main__":
    run("wext_box_mag", build, SEED, preview_m=0.8)
