"""Strapped side bags for the panniers cargo part, loaded.

Footprint 1x2: 1.3 m along (X) by 0.484 m across (Y). About 0.55 m tall. Origin at the footprint center on the deck top.
The same frame as cargo_panniers, with both bags full and strapped shut under painted lids.
Run: blender --background --python tools/blender/cargo_panniers_loaded.py -- public/models/cargo_panniers_loaded.glb [tmp/cargo_panniers_loaded.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cargo_loads import crate  # noqa: E402
from cargo_panniers import MAX_H, SEED, frame  # noqa: E402
from kit import Kit  # noqa: E402
from parts_common_cargo import run  # noqa: E402
from shapes import taper  # noqa: E402


def build(kit: Kit) -> None:
    length, width = frame(kit)
    bag_l = length / 2 - 0.06
    for i, x in enumerate((-length / 4, length / 4)):
        bag = kit.box(f"bag{i}", (bag_l, width - 0.04, 0.4), (x, 0, 0.27), "tarp", dent_by=0.015)
        taper(bag, top=0.88)
        kit.box(f"lid{i}", (bag_l * 0.92, width * 0.86, 0.06), (x, 0, 0.5), "paint", dent_by=0.008)
        kit.box(f"strap{i}", (0.035, width - 0.02, 0.44), (x, 0, 0.28), "wood")
        kit.box(f"buckle{i}", (0.05, 0.02, 0.05), (x, -width / 2 + 0.01, 0.4), "metal_light")
    crate(kit, "spill", (0.16, 0.14, 0.1), (0, 0, 0.48))


def main() -> None:
    run("cargo_panniers_loaded", build, SEED, view_size=1.8, w=1, h=2, max_h=MAX_H)


if __name__ == "__main__":
    main()
