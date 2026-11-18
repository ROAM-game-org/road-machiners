"""Ship module: a pale hull pod with a red band, hatch and rivet rows on a rust skid, for relicShipModule.

Footprint 2x2: 1.3 m along (X) by 0.968 m across (Y). About 0.85 m tall. Origin at the footprint center on the deck top.
Run: blender --background --python tools/blender/relic_ship_module.py -- public/models/relic_ship_module.glb [tmp/relic_ship_module.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_cargo import run  # noqa: E402
from shapes import taper  # noqa: E402

SEED = 414
SKY_BLUE = "cloth_teal"


def build(kit: Kit) -> None:
    kit.box("skid", (1.24, 0.92, 0.06), (0, 0, 0.03), "rust_side")
    for x in (-0.45, 0.45):
        kit.box(f"rail{x}", (0.08, 0.92, 0.06), (x, 0, 0.09), "metal")
    hull = kit.box("hull", (1.1, 0.8, 0.5), (0, 0, 0.4), "white", dent_by=0.012)
    taper(hull, top=0.85)
    kit.box("band", (1.12, 0.82, 0.09), (0, 0, 0.32), "red")
    kit.box("deck", (0.9, 0.62, 0.05), (0, 0, 0.67), "metal_light")
    kit.box("hatch", (0.34, 0.3, 0.06), (0.15, 0.0, 0.72), "metal")
    kit.box("hatch_ring", (0.4, 0.36, 0.03), (0.15, 0.0, 0.69), SKY_BLUE)
    for y in (-0.405, 0.405):
        for x in (-0.35, -0.12, 0.12, 0.35):
            kit.box(f"port{x}{y}", (0.12, 0.02, 0.1), (x, y, 0.45), "screen")
    kit.box("nozzle", (0.12, 0.5, 0.3), (-0.58, 0.0, 0.4), "battery")
    kit.box("antenna", (0.03, 0.03, 0.2), (-0.3, 0.2, 0.8), "metal_light")
    kit.box("scorch", (0.3, 0.3, 0.03), (0.4, 0.0, 0.66), "rust_dark")


def main() -> None:
    run("relic_ship_module", build, SEED, view_size=2.4, w=2, h=2, max_h=1.0)


if __name__ == "__main__":
    main()
