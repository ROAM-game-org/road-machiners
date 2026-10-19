"""Cracked boulder, the split boulder shape for the 'rock' obstacle.

Sized for a unit reference radius like rock.py: the footprint radius is 1 m and the height is about 1.2 m.
Two tall halves lean apart over a dark crack with rubble in it. The game scales it by the obstacle radius,
turns it at random and tints the three rock materials.
Run: blender --background --python tools/blender/rock_split.py -- public/models/rock_split.glb [tmp/rock_split.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402
from rock import COLORS, stone  # noqa: E402

SEED = 29


def build(kit: Kit) -> None:
    stone(kit, "half_left", 0.46, 1.0, (-0.34, 0.0, 0.5), sides=6, taper=0.7, rot=(math.radians(-4), math.radians(-9), 0.4), dent_by=0.07)
    stone(kit, "half_right", 0.42, 0.86, (0.36, 0.04, 0.43), sides=6, taper=0.66, rot=(math.radians(3), math.radians(11), 1.2), dent_by=0.06)
    stone(kit, "wedge", 0.2, 0.34, (0.0, 0.0, 0.1), sides=4, taper=0.5, rot=(0, 0, 0.8), dent_by=0.02)
    stone(kit, "foot_left", 0.3, 0.3, (-0.5, -0.38, 0.12), sides=5, taper=0.7, rot=(0, math.radians(6), 0.9), dent_by=0.04)
    stone(kit, "foot_right", 0.26, 0.26, (0.5, 0.4, 0.1), sides=5, taper=0.68, rot=(math.radians(8), 0, 0.2), dent_by=0.03)
    stone(kit, "scrap", 0.14, 0.12, (0.1, -0.62, 0.05), sides=5, taper=0.6, rot=(0, 0, 0.5), dent_by=0.02)


def main() -> None:
    args = parse_args()
    kit = Kit(COLORS, SEED)
    build(kit)
    kit.export("rock_split", args, view_size=2.8)


if __name__ == "__main__":
    main()
