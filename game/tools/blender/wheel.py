"""Chunky off-road wheel for every truck.

Authored at 1 m radius and 1 m wide, with the axle along Blender Y and the origin at the hub center.
The view scales it by the chassis wheel radius and half-width. Chevron tread lugs show the wheel turning.
Its look, shared with every wheel a base draws itself, lives in wheel_look.py.
Run: blender --background --python tools/blender/wheel.py -- public/models/wheel.glb [tmp/wheel.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402
from parts_common_core import COLORS  # noqa: E402
from wheel_look import drawn_wheel  # noqa: E402

SEED = 102


def build(kit: Kit) -> None:
    drawn_wheel(kit, "wheel", (0, 0, 0), 1.0, 1.0)


def main() -> None:
    args = parse_args()
    kit = Kit(COLORS, SEED)
    build(kit)
    kit.export("wheel", args, view_size=3.0)


if __name__ == "__main__":
    main()
