"""Ancient statue: a weathered robed figure on a ship-metal plinth, for relicStatue.

Footprint 2x1: 0.65 m along (X) by 0.968 m across (Y). About 0.95 m tall. Origin at the footprint center on the deck top.
The statue lies in pale stone with a red sash, a rust crate cradle and a cracked raised arm.
Run: blender --background --python tools/blender/relic_statue.py -- public/models/relic_statue.glb [tmp/relic_statue.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_cargo import run  # noqa: E402
from shapes import taper  # noqa: E402

SEED = 413


def build(kit: Kit) -> None:
    kit.box("skid", (0.6, 0.92, 0.05), (0, 0, 0.025), "rust_side")
    kit.box("plinth", (0.5, 0.6, 0.18), (0, 0, 0.14), "metal_light", dent_by=0.008)
    kit.box("plinth_band", (0.52, 0.62, 0.04), (0, 0, 0.1), "red")
    robe = kit.box("robe", (0.3, 0.34, 0.36), (0, 0, 0.41), "white", dent_by=0.012)
    taper(robe, top=0.6)
    kit.box("sash", (0.32, 0.12, 0.05), (0, 0, 0.45), "red", rot=(0.5, 0, 0))
    kit.box("chest", (0.18, 0.3, 0.2), (0, 0, 0.7), "white", dent_by=0.01)
    kit.box("head", (0.15, 0.15, 0.17), (0, 0, 0.88), "white", dent_by=0.01)
    kit.box("crown", (0.16, 0.16, 0.04), (0, 0, 0.98), "yellow")
    kit.box("arm_up", (0.08, 0.08, 0.28), (0.02, 0.2, 0.84), "white", rot=(0.3, 0, 0), dent_by=0.008)
    kit.box("arm_down", (0.08, 0.08, 0.26), (0.0, -0.2, 0.6), "white", rot=(-0.2, 0, 0), dent_by=0.008)
    kit.box("crack", (0.02, 0.12, 0.3), (0.16, 0.0, 0.7), "battery")
    kit.box("chip", (0.1, 0.08, 0.05), (0.24, 0.25, 0.06), "white", rot=(0, 0, 0.5))


def main() -> None:
    run("relic_statue", build, SEED, view_size=1.8, w=2, h=1, max_h=1.05)


if __name__ == "__main__":
    main()
