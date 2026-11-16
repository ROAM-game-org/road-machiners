"""Strapped side bags for the panniers cargo part, empty.

Footprint 1x2: 1.3 m along (X) by 0.484 m across (Y). About 0.5 m tall. Origin at the footprint center on the deck top.
A low rail frame holds two canvas bags that hang slack and open. The cargo_panniers_loaded model fills the same frame.
Run: blender --background --python tools/blender/cargo_panniers.py -- public/models/cargo_panniers.glb [tmp/cargo_panniers.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_cargo import footprint, run  # noqa: E402

SEED = 103
MAX_H = 0.6
BAG_H = 0.3


def frame(kit: Kit) -> tuple[float, float]:
    length, width = footprint(1, 2)
    kit.box("base", (length, width, 0.05), (0, 0, 0.025), "metal")
    for x in (-length / 2 + 0.03, 0, length / 2 - 0.03):
        for y in (-width / 2 + 0.02, width / 2 - 0.02):
            kit.box("post", (0.04, 0.04, 0.32), (x, y, 0.21), "metal")
    for y in (-width / 2 + 0.02, width / 2 - 0.02):
        kit.box("rail", (length - 0.02, 0.035, 0.035), (0, y, 0.36), "metal_light")
    return length, width


def build(kit: Kit) -> None:
    length, width = frame(kit)
    bag_l = length / 2 - 0.06
    for i, x in enumerate((-length / 4, length / 4)):
        kit.box(f"floor{i}", (bag_l, width - 0.08, 0.02), (x, 0, 0.06), "tarp")
        for y in (-1, 1):
            flap = kit.box(f"flap{i}{y}", (bag_l, 0.03, BAG_H), (x, y * (width / 2 - 0.045), 0.05 + BAG_H / 2), "tarp", dent_by=0.012)
            flap.rotation_euler[0] = y * 0.18
        kit.box(f"strap{i}", (0.035, width - 0.04, 0.03), (x, 0, 0.065), "wood")
        kit.box(f"buckle{i}", (0.05, 0.02, 0.05), (x, -width / 2 + 0.02, 0.2), "metal_light")
    kit.box("tag", (0.18, 0.02, 0.1), (0, -width / 2 + 0.015, 0.1), "paint")


def main() -> None:
    run("cargo_panniers", build, SEED, view_size=1.8, w=1, h=2, max_h=MAX_H)


if __name__ == "__main__":
    main()
