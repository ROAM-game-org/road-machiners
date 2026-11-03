"""Rusted skiff for the 'skiff' landmark.

Sized for its 0.7-tile obstacle radius, 2.8 m: an open boat 5 m long and 1.9 m across with its nose up on the
sand, rolled 12 degrees and sunk about 0.25 m. The top stands about 1.2 m above the ground.
Run: blender --background --python tools/blender/boat_skiff.py -- public/models/boat_skiff.glb [tmp/boat_skiff.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402
from shapes import prism, strut  # noqa: E402

COLORS = {
    "paint": 0xC4BAA6,  # PAL.hull.light, bleached hull paint
    "rust": 0x8A4A2A,  # PAL.rust.top
    "rust_side": 0x5E3420,  # PAL.rust.side
    "rust_dark": 0x3A2418,  # PAL.rust.dark
    "wood": 0x6A4A2A,  # PAL.trunk
}
SEED = 63
LENGTH = 5.0
BEAM = 1.9
HEEL = math.radians(12)
PITCH = math.radians(-14)
SINK = 0.25


def build(kit: Kit) -> None:
    half = LENGTH / 2
    side = [(-half, 0.55), (-half + 0.3, 0.0), (half - 1.0, 0.0), (half, 0.55), (half, 0.9), (-half, 0.8)]
    shell = prism(kit, "shell", side, -BEAM / 2, BEAM / 2, "paint")
    for v in shell.data.vertices:
        t = min(max((v.co.x - (half - 2.0)) / 2.0, 0.0), 1.0)
        v.co.y *= 1 - 0.85 * t * t
    kit.box("floor", (LENGTH - 1.8, BEAM - 0.5, 0.06), (-0.6, 0, 0.8), "rust_dark", dent_by=0.03)
    for i, x in enumerate((-1.6, -0.2, 1.0)):
        kit.box(f"thwart{i}", (0.3, BEAM - 0.3, 0.07), (x, 0, 0.78 + 0.03), "wood", dent_by=0.02)
    kit.box("transom", (0.1, BEAM - 0.1, 0.5), (-half + 0.05, 0, 0.7), "rust_side", dent_by=0.03)
    strut(kit, "oar", (-1.4, 0.2, 0.9), (0.9, 1.2, 0.8), 0.07, "wood", sides=5)
    for i in range(3):
        kit.box(f"patch{i}", (kit.rng.uniform(0.4, 0.8), 0.04, kit.rng.uniform(0.2, 0.35)), (kit.rng.uniform(-1.8, 1.0), (BEAM / 2 + 0.01) * kit.rng.choice((-1, 1)), 0.5), kit.rng.choice(("rust", "rust_dark")))
    kit.settle((HEEL, PITCH, 0), SINK)


def main() -> None:
    args = parse_args()
    kit = Kit(COLORS, SEED)
    build(kit)
    kit.export("boat_skiff", args, view_size=8)


if __name__ == "__main__":
    main()
