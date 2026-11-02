"""Fallen highway board for the 'routeSign' landmark: a faded green board on two posts, one post bent.

Built at its in-game size, drawn at scale 1: the board is 3.8 m wide and 1.5 m tall on posts 3.4 m tall, and it
hangs askew because the right post is bent. The face looks toward +X, so the game turns +X toward the road.
The board is lowered onto the posts, so nothing hangs above 3.6 m. Its footprint radius is 2.2 m.
Run: blender --background --python tools/blender/route_sign.py -- public/models/route_sign.glb [tmp/route_sign.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402
from shapes import strut  # noqa: E402

COLORS = {
    "post": 0x5A5A58,  # PAL.metal
    "rust": 0x8A4A2A,  # PAL.rust.top
    "board": 0x5E6A5A,  # PAL.roof[1], faded green
    "border": 0xC4BAA6,  # PAL.hull.light, the pale border
    "mark": 0xF0E0B8,  # PAL.plan, the washed-out lettering blocks
    "footing": 0x8E887C,  # PAL.hull.grey
}
SEED = 59
TILT = math.radians(9)


def build(kit: Kit) -> None:
    for i, y in enumerate((-1.5, 1.5)):
        kit.cylinder(f"footing{i}", 0.26, 0.2, (0, y, 0.07), "footing", vertices=6, dent_by=0.03)
    strut(kit, "post_left", (0, -1.5, 0.1), (0, -1.5, 3.4), 0.12, "post", sides=5, dent_by=0.01)
    strut(kit, "post_right_low", (0, 1.5, 0.1), (0, 1.5, 1.6), 0.12, "post", sides=5, dent_by=0.01)
    strut(kit, "post_right_bent", (0, 1.5, 1.6), (0.55, 1.75, 2.9), 0.12, "rust", sides=5, dent_by=0.01)
    centre = (0.08, 0.0, 2.5)
    kit.box("board", (0.06, 3.8, 1.5), centre, "board", rot=(TILT, 0, 0), dent_by=0.03)
    kit.box("border", (0.05, 3.9, 1.6), (centre[0] - 0.02, 0.0, centre[2]), "border", rot=(TILT, 0, 0))
    for i, (y, w) in enumerate(((-0.9, 1.1), (0.4, 1.4))):
        kit.box(f"mark{i}", (0.04, w, 0.22), (centre[0] + 0.04, y, centre[2] + 0.1), "mark", rot=(TILT, 0, 0))


def main() -> None:
    args = parse_args()
    kit = Kit(COLORS, SEED)
    build(kit)
    kit.export("route_sign", args, view_size=9)


if __name__ == "__main__":
    main()
