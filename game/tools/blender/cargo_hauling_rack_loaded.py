"""Chunky girder hauling rack for the haulingRack cargo part, loaded.

Footprint 2x2: 1.3 m along (X) by 0.968 m across (Y). About 1.05 m tall. Origin at the footprint center on the deck top.
The same frame as cargo_hauling_rack, packed with crates, grain sacks and a lashed tarp.
Run: blender --background --python tools/blender/cargo_hauling_rack_loaded.py -- public/models/cargo_hauling_rack_loaded.glb [tmp/cargo_hauling_rack_loaded.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cargo_hauling_rack import BEAM, SEED, frame  # noqa: E402
from cargo_loads import crate, sack, tarp  # noqa: E402
from kit import Kit  # noqa: E402
from parts_common_cargo import CARGO_MAX_H, run  # noqa: E402


def build(kit: Kit) -> None:
    frame(kit)
    z = BEAM + 0.02
    for x in (-0.3, 0.3):
        for y in (-0.22, 0.22):
            crate(kit, f"crate{x}{y}", (0.5, 0.4, 0.38), (x, y, z))
    crate(kit, "crate_top_a", (0.5, 0.38, 0.3), (-0.3, -0.22, z + 0.38), "wood")
    sack(kit, "sack_top_a", (0.4, 0.34, 0.26), (0.3, 0.22, z + 0.38))
    sack(kit, "sack_top_b", (0.36, 0.3, 0.24), (0.3, -0.22, z + 0.38))
    tarp(kit, "tarp", (0.52, 0.4), (-0.3, 0.22, z + 0.4))
    kit.box("lash", (0.04, 0.9, 0.04), (0.0, 0, z + 0.7), "wood")


def main() -> None:
    run("cargo_hauling_rack_loaded", build, SEED, view_size=2.4, w=2, h=2, max_h=CARGO_MAX_H)


if __name__ == "__main__":
    main()
