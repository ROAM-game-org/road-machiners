"""Solid axle beam between the two wheel hubs of one axle.

Authored for a 1 m wheel radius and 1 m long along Z, with the origin at its center.
The view stretches it between the inner wheel faces each frame and tilts it as one wheel rises.
It scales the thickness by the chassis wheel radius, and each piece takes round_sides() of its authored radius. The differential faces +X.
Run: blender --background --python tools/blender/axle.py -- public/models/axle.glb [tmp/axle.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args, round_sides  # noqa: E402
from kit import round_sides  # noqa: E402

SEED = 104
ALONG_X = (0, math.radians(90), 0)


def build(kit: Kit) -> None:
    kit.cylinder("tube", 0.12, 1.0, (0, 0, 0), "metal_dark", vertices=round_sides(0.12), dent_by=0.01)
    kit.cylinder("diff", 0.3, 0.36, (0, 0, 0), "rust_dark", vertices=round_sides(0.3), dent_by=0.02)
    kit.cylinder("diff_cover", 0.22, 0.16, (0.12, 0, 0), "metal", rot=ALONG_X, vertices=round_sides(0.22))
    kit.cylinder("pinion", 0.1, 0.3, (0.3, 0, 0), "metal_dark", rot=ALONG_X, vertices=round_sides(0.1))


def main() -> None:
    args = parse_args()
    kit = Kit(COLORS, SEED)
    build(kit)
    kit.export("axle", args, view_size=1.5)


if __name__ == "__main__":
    main()
