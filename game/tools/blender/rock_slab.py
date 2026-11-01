"""Layered sandstone slab, the low boulder shape for the 'rock' obstacle.

Sized for a unit reference radius like rock.py: the footprint radius is 1 m and the height is about 0.6 m.
Three flat plates stack off-centre and a broken plate leans on the side. The game scales it by the obstacle radius,
turns it at random and tints the three rock materials.
Run: blender --background --python tools/blender/rock_slab.py -- public/models/rock_slab.glb [tmp/rock_slab.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402
from rock import COLORS, stone  # noqa: E402

SEED = 23


def build(kit: Kit) -> None:
    stone(kit, "base", 0.78, 0.24, (0.02, 0.0, 0.12), sides=8, taper=0.9, rot=(0, 0, 0.2), dent_by=0.04)
    stone(kit, "middle", 0.62, 0.2, (-0.1, 0.06, 0.34), sides=7, taper=0.86, rot=(math.radians(3), math.radians(-4), 0.9), dent_by=0.035)
    stone(kit, "top", 0.46, 0.14, (0.08, -0.08, 0.5), sides=6, taper=0.8, rot=(math.radians(-5), math.radians(6), 1.6), dent_by=0.03)
    stone(kit, "leaner", 0.3, 0.46, (0.48, 0.44, 0.2), sides=5, taper=0.7, rot=(math.radians(26), math.radians(-14), 0.3), dent_by=0.03)
    stone(kit, "scrap_a", 0.16, 0.12, (-0.56, -0.46, 0.05), sides=5, taper=0.6, rot=(0, 0, 0.7), dent_by=0.02)
    stone(kit, "scrap_b", 0.12, 0.1, (0.62, -0.36, 0.04), sides=5, taper=0.6, rot=(0, 0, 1.4), dent_by=0.015)


def main() -> None:
    args = parse_args()
    kit = Kit(COLORS, SEED)
    build(kit)
    kit.export("rock_slab", args, view_size=2.8)


if __name__ == "__main__":
    main()
