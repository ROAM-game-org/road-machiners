"""Two tied grain sacks piled on a back board for the sacks accessory, loaded.

The sacks hang on the truck's edge like armor, so the model faces +X: its back board stands at -X against the body and its
depth runs out to +X. Width 0.484 m across (Y), about 0.7 m tall. Origin at the board's footing on the ground line.
Run: blender --background --python tools/blender/cargo_sacks_loaded.py -- public/models/cargo_sacks_loaded.glb [tmp/cargo_sacks_loaded.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cargo_loads import sack  # noqa: E402
from cargo_sacks import BACK, MAX_H, SEED, board  # noqa: E402
from kit import Kit  # noqa: E402
from parts_common_cargo import run  # noqa: E402


def build(kit: Kit) -> None:
    board(kit)
    sack(kit, "sack_low", (0.26, 0.4, 0.3), (BACK + 0.15, 0, 0.05))
    sack(kit, "sack_high", (0.24, 0.38, 0.27), (BACK + 0.14, 0, 0.36), "grain_dark")


def main() -> None:
    run("cargo_sacks_loaded", build, SEED, view_size=1.2, w=1, h=1, max_h=MAX_H)


if __name__ == "__main__":
    main()
