"""Rusted fishing boat for the 'fishingBoat' landmark.

Sized for its 1.4-tile obstacle radius, 5.6 m: a hull 10 m long and 3.4 m across lying 25 degrees on its
side, sunk about half a meter in the sand, with a small wheelhouse. The top stands about 3.3 m above the ground.
Run: blender --background --python tools/blender/boat_fishing.py -- public/models/boat_fishing.glb [tmp/boat_fishing.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit, parse_args  # noqa: E402
from shapes import prism, strut  # noqa: E402

COLORS = {
    "paint": 0x6F8F88,  # PAL.glass.side, faded teal hull paint
    "paint_dark": 0x4C6460,  # PAL.glass.dark
    "rust": 0x8A4A2A,  # PAL.rust.top
    "rust_side": 0x5E3420,  # PAL.rust.side
    "rust_dark": 0x3A2418,  # PAL.rust.dark
    "wood": 0x6A4A2A,  # PAL.trunk
}
SEED = 61
LENGTH = 10.0
BEAM = 3.4
HEEL = math.radians(-25)
SINK = 0.55


def pinch_bow(obj, x_start: float, x_end: float) -> None:
    for v in obj.data.vertices:
        t = min(max((v.co.x - x_start) / (x_end - x_start), 0.0), 1.0)
        v.co.y *= 1 - 0.8 * t * t


def build(kit: Kit) -> None:
    half = LENGTH / 2
    keel = [(-half, 0.5), (-half + 0.6, 0.05), (half - 2.2, 0.05), (half, 1.1), (half, 1.9), (-half, 1.5)]
    pinch_bow(prism(kit, "keel", keel, -BEAM / 2 + 0.7, BEAM / 2 - 0.7, "paint_dark"), half - 4.0, half)
    for side in (-1, 1):
        planks = [(-half, 1.4), (half - 0.3, 1.8), (half - 0.3, 1.1), (-half, 0.6)]
        wall = prism(kit, f"wall{side}", planks, 0.0, 0.14, "paint")
        for v in wall.data.vertices:
            v.co.y += side * (BEAM / 2 - 0.14) if side > 0 else side * (BEAM / 2)
        pinch_bow(wall, half - 4.0, half)
    kit.box("deck", (LENGTH - 2.4, BEAM - 0.5, 0.1), (-0.8, 0, 1.15), "rust_dark", dent_by=0.04)
    kit.box("transom", (0.14, BEAM - 0.2, 1.3), (-half + 0.07, 0, 1.0), "rust_side", dent_by=0.05)
    for i in range(5):
        kit.box(f"rib{i}", (0.12, BEAM - 0.5, 0.9), (-half + 1.4 + i * 1.6, 0, 1.55), "rust_dark", dent_by=0.04)
    kit.box("house", (2.4, 2.2, 1.6), (-1.6, 0, 1.95), "paint", dent_by=0.06)
    kit.box("roof", (2.8, 2.6, 0.12), (-1.6, 0, 2.8), "rust_side", dent_by=0.05)
    for side in (-1, 1):
        kit.box(f"window{side}", (1.3, 0.05, 0.6), (-1.5, side * 1.12, 2.15), "rust_dark")
    kit.box("door", (0.05, 0.8, 1.2), (-0.38, 0.3, 1.8), "rust_dark")
    strut(kit, "mast", (0.9, 0.1, 1.2), (0.9, 0.1, 4.2), 0.18, "wood", sides=6)
    strut(kit, "boom", (0.9, 0.1, 3.6), (-2.8, 0.9, 2.4), 0.14, "rust_side", sides=5)
    for i in range(4):
        x = kit.rng.uniform(-half + 1.0, half - 3.0)
        side = kit.rng.choice((-1, 1))
        kit.box(f"patch{i}", (kit.rng.uniform(0.6, 1.4), 0.05, kit.rng.uniform(0.3, 0.6)), (x, side * (BEAM / 2 + 0.01), 1.1), kit.rng.choice(("rust", "rust_dark")), dent_by=0.03)
    kit.settle((HEEL, 0, 0), SINK)


def main() -> None:
    args = parse_args()
    kit = Kit(COLORS, SEED)
    build(kit)
    kit.export("boat_fishing", args, view_size=13)


if __name__ == "__main__":
    main()
