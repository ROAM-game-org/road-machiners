"""Ship metal for the relics good: three pale hull plates leaning on a rust skid, one with a red stripe and a rivet row.

Footprint 1x1: 0.5 m along (X) by 0.34 m across (Y). About 0.4 m tall. Origin at the footprint center on the deck top.
Run: blender --background --python tools/blender/good_relics.py -- public/models/good_relics.glb [tmp/good_relics.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_cargo import GOOD_MAX_H, run  # noqa: E402

SEED = 214
LEAN = -0.38


def build(kit: Kit) -> None:
    kit.box("skid", (0.46, 0.32, 0.04), (0, 0, 0.02), "rust_side", dent_by=0.004)
    kit.box("rail_a", (0.04, 0.34, 0.05), (-0.18, 0, 0.05), "metal")
    kit.box("rail_b", (0.04, 0.34, 0.05), (0.18, 0, 0.05), "metal")
    plates = (("white", -0.1, 0.34), ("metal_light", 0.0, 0.36), ("white", 0.1, 0.3))
    for i, (mat, x, h) in enumerate(plates):
        kit.box(f"plate_{i}", (0.03, 0.3, h), (x, 0, 0.05 + h / 2), mat, rot=(0, LEAN * (1 - i * 0.2), 0), dent_by=0.008)
    kit.box("stripe", (0.034, 0.3, 0.05), (-0.1 - 0.05 * LEAN, 0, 0.26), "red", rot=(0, LEAN, 0))
    for j, y in enumerate((-0.1, 0.0, 0.1)):
        kit.box(f"rivet_{j}", (0.04, 0.025, 0.025), (0.1 - 0.06 * LEAN, y, 0.2), "metal", rot=(0, LEAN * 0.6, 0))
    kit.box("scrap_bit", (0.12, 0.08, 0.02), (0.1, 0.08, 0.05), "rust", rot=(0, 0, 0.5))


def main() -> None:
    run("good_relics", build, SEED, view_size=1.2, w=1, h=1, max_h=GOOD_MAX_H)


if __name__ == "__main__":
    main()
