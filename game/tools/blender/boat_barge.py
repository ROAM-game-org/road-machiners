"""Rusted flat river barge for the 'riverBarge' landmark.

Sized for its 1.9-tile obstacle radius, 7.6 m: a boxy hull 14 m long and 4.6 m across with raked ends and a
low stern house, rolled 7 degrees and sunk about 0.6 m in the sand. The top stands about 3.2 m above the ground.
Run: blender --background --python tools/blender/boat_barge.py -- public/models/boat_barge.glb [tmp/boat_barge.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402
from shapes import prism  # noqa: E402

COLORS = {
    "hull": 0x8E887C,  # PAL.hull.grey, faded barge paint
    "hull_dark": 0x6E6A62,  # PAL.hull.dark
    "rust": 0x8A4A2A,  # PAL.rust.top
    "rust_side": 0x5E3420,  # PAL.rust.side
    "rust_dark": 0x3A2418,  # PAL.rust.dark
    "metal": 0x5A5A58,  # PAL.metal
}
SEED = 62
LENGTH = 14.0
WIDTH = 4.6
HEEL = math.radians(7)
PITCH = math.radians(3)
SINK = 0.6


def build(kit: Kit) -> None:
    half = LENGTH / 2
    side = [(-half, 0.9), (-half + 0.9, 0.0), (half - 1.6, 0.0), (half, 0.9), (half, 1.7), (-half, 1.7)]
    prism(kit, "hull", side, -WIDTH / 2, WIDTH / 2, "hull")
    kit.box("hold", (LENGTH - 4.6, WIDTH - 0.7, 0.1), (-1.0, 0, 1.68), "rust_dark", dent_by=0.05)
    for s in (-1, 1):
        kit.box(f"coaming{s}", (LENGTH - 3.4, 0.14, 0.5), (-0.5, s * (WIDTH / 2 - 0.2), 1.95), "rust_side", dent_by=0.05)
    kit.box("coaming_bow", (0.14, WIDTH - 0.5, 0.5), (half - 1.7, 0, 1.95), "rust_side", dent_by=0.05)
    kit.box("house", (3.0, 3.2, 1.5), (-half + 2.3, 0, 2.4), "hull_dark", dent_by=0.06)
    kit.box("house_roof", (3.4, 3.6, 0.12), (-half + 2.3, 0, 3.2), "rust_side", dent_by=0.06)
    for s in (-1, 1):
        kit.box(f"window{s}", (1.6, 0.05, 0.5), (-half + 2.3, s * 1.62, 2.55), "rust_dark")
    for i in range(3):
        x = -2.0 + i * 2.6 + kit.rng.uniform(-0.2, 0.2)
        kit.box(f"cover{i}", (1.9, WIDTH - 1.2, 0.1), (x, 0, 2.05), "rust", rot=(0, 0, 0), dent_by=0.05)
    for i, (x, s) in enumerate(((half - 0.8, -1), (half - 0.8, 1), (-half + 0.9, -1), (-half + 0.9, 1))):
        kit.cylinder(f"bollard{i}", 0.17, 0.5, (x, s * (WIDTH / 2 - 0.35), 1.95), "metal", vertices=6)
    for i in range(5):
        x = kit.rng.uniform(-half + 0.8, half - 0.8)
        s = kit.rng.choice((-1, 1))
        kit.box(f"stain{i}", (kit.rng.uniform(0.8, 2.0), 0.05, kit.rng.uniform(0.3, 0.7)), (x, s * (WIDTH / 2 + 0.01), 1.1), kit.rng.choice(("rust", "rust_dark")), dent_by=0.03)
    kit.settle((HEEL, PITCH, 0), SINK)


def main() -> None:
    args = parse_args()
    kit = Kit(COLORS, SEED)
    build(kit)
    kit.export("boat_barge", args, view_size=16)


if __name__ == "__main__":
    main()
