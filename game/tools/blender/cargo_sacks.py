"""A limp sack hung on a back board for the sacks accessory, empty.

The sacks hang on the truck's edge like armor, so the model faces +X: its back board stands at -X against the body and its
depth runs out to +X. Width 0.484 m across (Y), about 0.7 m tall. Origin at the board's footing on the ground line.
The cargo_sacks_loaded model fills the same board.
Run: blender --background --python tools/blender/cargo_sacks.py -- public/models/cargo_sacks.glb [tmp/cargo_sacks.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import CELL_ACROSS, Kit  # noqa: E402
from parts_common_cargo import run  # noqa: E402

SEED = 109
MAX_H = 0.75
BACK = -0.13
HEIGHT = 0.7


def board(kit: Kit) -> None:
    kit.box("back", (0.03, CELL_ACROSS - 0.04, HEIGHT), (BACK, 0, HEIGHT / 2), "metal")
    kit.box("rail", (0.06, CELL_ACROSS - 0.02, 0.04), (BACK + 0.02, 0, HEIGHT - 0.02), "metal_light")
    kit.box("foot", (0.26, CELL_ACROSS - 0.04, 0.04), (BACK + 0.115, 0, 0.02), "metal")
    for y in (-0.17, 0.17):
        kit.box(f"hook{y}", (0.07, 0.04, 0.05), (BACK + 0.05, y, HEIGHT - 0.07), "metal_light")


def build(kit: Kit) -> None:
    board(kit)
    kit.box("limp", (0.03, 0.34, 0.5), (BACK + 0.05, 0, 0.4), "tarp", dent_by=0.008)
    kit.box("fold", (0.16, 0.3, 0.1), (BACK + 0.11, 0, 0.09), "tarp", dent_by=0.008)
    kit.box("tie", (0.06, 0.1, 0.03), (BACK + 0.06, 0, 0.62), "wood")


def main() -> None:
    run("cargo_sacks", build, SEED, view_size=1.2, w=1, h=1, max_h=MAX_H)


if __name__ == "__main__":
    main()
