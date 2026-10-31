"""Leg that holds a corner of a weapon mount plate over a lower surface, or braces it to the side wall below.

Authored 1 m long along Z on a small foot pad, with the origin at the foot. The view stretches its length from the
surface under the plate corner to the plate and turns it to lean for a brace.
Run: blender --background --python tools/blender/wmount_leg.py -- public/models/wmount_leg.glb [tmp/wmount_leg.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_weapon import run  # noqa: E402

SEED = 64
LENGTH = 1.0
TUBE = 0.05  # square tube side, thin beside the riser column but still a line at the default zoom
PAD = 0.09


def build(kit: Kit) -> None:
    kit.box("pad", (PAD, PAD, 0.02), (0, 0, 0.01), "dark")
    kit.box("tube", (TUBE, TUBE, LENGTH - 0.02), (0, 0, 0.02 + (LENGTH - 0.02) / 2), "metal")
    kit.socket("top", (0, 0, LENGTH))
    # A corner of the foot pad: the view stands the leg on the highest surface under the pad.
    kit.socket("pad", (PAD / 2, PAD / 2, 0))


if __name__ == "__main__":
    run("wmount_leg", build, SEED, preview_m=1.2)
