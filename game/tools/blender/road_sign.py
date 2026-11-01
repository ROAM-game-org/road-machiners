"""Leaning old warning sign for the 'roadSign' landmark: a rusted steel post with a faded diamond plate.

Built at its in-game size, drawn at scale 1: the post is 2.6 m long, leans 14 degrees toward +Y and stands in a
cracked concrete footing. The plate is a 0.7 m diamond turned face to +X, so the game turns +X toward the road.
Its footprint radius is 1 m, the reach of the leaning plate.
Run: blender --background --python tools/blender/road_sign.py -- public/models/road_sign.glb [tmp/road_sign.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402
from shapes import strut  # noqa: E402

COLORS = {
    "post": 0x5E3420,  # PAL.rust.side
    "rust": 0x8A4A2A,  # PAL.rust.top
    "plate": 0xB89A74,  # PAL.wall.top, paint faded to bare tan
    "mark": 0x3A2418,  # PAL.rust.dark, the dark warning mark
    "footing": 0x8E887C,  # PAL.hull.grey
}
SEED = 53
LEAN = math.radians(14)
HEIGHT = 2.6


def build(kit: Kit) -> None:
    kit.cylinder("footing", 0.28, 0.22, (0, 0, 0.08), "footing", vertices=6, dent_by=0.03)
    top = (math.sin(LEAN) * HEIGHT, 0.0, math.cos(LEAN) * HEIGHT)
    strut(kit, "post", (0, 0, 0.1), top, 0.1, "post", sides=5, dent_by=0.01)
    centre = (top[0] - 0.05, 0.0, top[2] - 0.38)
    kit.box("plate", (0.05, 0.7, 0.7), centre, "plate", rot=(math.radians(45), 0, 0), dent_by=0.02)
    kit.box("plate_rim", (0.04, 0.78, 0.78), (centre[0] - 0.015, 0.0, centre[2]), "rust", rot=(math.radians(45), 0, 0))
    kit.box("mark_a", (0.03, 0.08, 0.34), (centre[0] + 0.03, 0.0, centre[2] + 0.04), "mark", rot=(0, 0, 0))
    kit.box("mark_b", (0.03, 0.08, 0.08), (centre[0] + 0.03, 0.0, centre[2] - 0.2), "mark")
    for i, dz in enumerate((-0.16, 0.16)):
        kit.cylinder(f"bolt{i}", 0.03, 0.07, (centre[0] + 0.0, 0.0, top[2] + dz - 0.38), "rust", rot=(0, math.pi / 2, 0), vertices=5)


def main() -> None:
    args = parse_args()
    kit = Kit(COLORS, SEED)
    build(kit)
    kit.export("road_sign", args, view_size=6)


if __name__ == "__main__":
    main()
