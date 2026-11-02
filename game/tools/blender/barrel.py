"""One dented 200-litre drum lying on its side, with a faded colour band and a loose bung, for the 'barrel' landmark.

Built at its in-game size, drawn at scale 1: 0.58 m across and 0.88 m long, 0.58 m tall. It lies along +X.
Its footprint radius is 0.6 m.
Run: blender --background --python tools/blender/barrel.py -- public/models/barrel.glb [tmp/barrel.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402

COLORS = {
    "rust": 0x8A4A2A,  # PAL.rust.top
    "rust_dark": 0x3A2418,  # PAL.rust.dark, the rolling hoops
    "band": 0x5E6038,  # PAL.nose.top, the faded colour band
    "metal": 0x5A5A58,  # PAL.metal, the lid
}
SEED = 61
RADIUS = 0.29
LENGTH = 0.88
SIDES = 10
ON_SIDE = (0, math.pi / 2, 0)


def build(kit: Kit) -> None:
    kit.cylinder("drum", RADIUS, LENGTH, (0, 0, RADIUS), "rust", rot=ON_SIDE, vertices=SIDES, dent_by=0.02)
    kit.cylinder("band", RADIUS + 0.008, 0.18, (0.05, 0, RADIUS), "band", rot=ON_SIDE, vertices=SIDES)
    for i, x in enumerate((-LENGTH / 3, LENGTH / 3)):
        kit.cylinder(f"hoop{i}", RADIUS + 0.02, 0.04, (x, 0, RADIUS), "rust_dark", rot=ON_SIDE, vertices=SIDES)
    kit.cylinder("lid", 0.1, 0.03, (LENGTH / 2 + 0.015, 0, RADIUS), "metal", rot=ON_SIDE, vertices=6)


def main() -> None:
    args = parse_args()
    kit = Kit(COLORS, SEED)
    build(kit)
    kit.export("barrel", args, view_size=2)


if __name__ == "__main__":
    main()
