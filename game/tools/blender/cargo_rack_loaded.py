"""Open roof rack for the rack cargo part, loaded.

Footprint 1x2: 1.3 m along (X) by 0.484 m across (Y). About 0.85 m tall. Origin at the footprint center on the deck top.
The same frame as cargo_rack, with three crates and a tarp bundle stacked in it.
Run: blender --background --python tools/blender/cargo_rack_loaded.py -- public/models/cargo_rack_loaded.glb [tmp/cargo_rack_loaded.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cargo_loads import crate, sack  # noqa: E402
from cargo_rack import SEED, frame  # noqa: E402
from kit import Kit  # noqa: E402
from parts_common_cargo import CARGO_MAX_H, run  # noqa: E402


def build(kit: Kit) -> None:
    length, width = frame(kit)
    w = width - 0.12
    crate(kit, "crate_a", (0.4, w, 0.34), (-0.4, 0, 0.05))
    crate(kit, "crate_b", (0.4, w, 0.34), (0.1, 0, 0.05))
    crate(kit, "crate_c", (0.34, w * 0.9, 0.3), (-0.3, 0, 0.39), "wood")
    sack(kit, "sack", (0.34, w * 0.9, 0.3), (0.42, 0, 0.05))
    sack(kit, "sack_top", (0.3, w * 0.8, 0.22), (0.12, 0, 0.39))


def main() -> None:
    run("cargo_rack_loaded", build, SEED, view_size=2.0, w=1, h=2, max_h=CARGO_MAX_H)


if __name__ == "__main__":
    main()
