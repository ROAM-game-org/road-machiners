"""Ship relics crate with a pale hull-metal shard and a small lens for the relics good.

Footprint 1x1: 0.5 m along (X) by 0.34 m across (Y). About 0.4 m tall at the shard tip. Origin at the footprint center on the deck top.
Run: blender --background --python tools/blender/good_relics.py -- public/models/good_relics.glb [tmp/good_relics.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_cargo import GOOD_MAX_H, run  # noqa: E402
from shapes import taper  # noqa: E402

SEED = 214
L, W, H = 0.5, 0.34, 0.24


def build(kit: Kit) -> None:
    kit.box("crate", (L, W, H), (0, 0, H / 2), "olive", dent_by=0.005)
    for x in (-L / 2 + 0.02, L / 2 - 0.02):
        kit.box("corner", (0.03, W + 0.01, H + 0.01), (x, 0, H / 2), "metal")
    shard = kit.box("shard", (0.1, 0.05, 0.22), (-0.1, 0.03, H + 0.11), "metal_light", rot=(0.12, 0.2, 0.35))
    taper(shard, top=0.3, bottom=1.0)
    kit.box("plate", (0.16, 0.12, 0.02), (0.1, -0.02, H + 0.01), "metal_light", rot=(0, 0, 0.4))
    kit.cylinder("lens", 0.05, 0.03, (0.12, -0.02, H + 0.035), "screen", vertices=8)
    kit.box("slab", (0.12, 0.012, 0.1), (0.06, -W / 2 - 0.01, 0.07), "metal_light", rot=(0.25, 0, 0))


def main() -> None:
    run("good_relics", build, SEED, view_size=1.2, w=1, h=1, max_h=GOOD_MAX_H)


if __name__ == "__main__":
    main()
