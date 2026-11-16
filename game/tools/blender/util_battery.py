"""Gun battery: a heavy dark cell block with yellow terminals and a cable, for gunBattery.

Footprint 1x1: 0.65 m along (X) by 0.484 m across (Y). About 0.4 m tall. Origin at the footprint center on the deck top.
Run: blender --background --python tools/blender/util_battery.py -- public/models/util_battery.glb [tmp/util_battery.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_cargo import run  # noqa: E402
from shapes import strut  # noqa: E402

SEED = 410


def build(kit: Kit) -> None:
    kit.box("tray", (0.6, 0.44, 0.04), (0, 0, 0.02), "metal")
    for i, x in enumerate((-0.17, 0.0, 0.17)):
        kit.box(f"cell{i}", (0.15, 0.36, 0.26), (x, 0, 0.17), "battery", dent_by=0.006)
        kit.box(f"cap{i}", (0.1, 0.06, 0.03), (x, 0, 0.315), "metal_light")
    kit.box("label", (0.4, 0.01, 0.12), (0, -0.185, 0.18), "yellow")
    for y in (-0.1, 0.1):
        kit.cylinder(f"post{y}", 0.03, 0.06, (0.17, y, 0.34), "metal_light", vertices=6)
    kit.box("strap", (0.5, 0.03, 0.03), (0, 0.0, 0.31), "battery")
    strut(kit, "cable", (0.17, 0.1, 0.36), (0.3, 0.2, 0.1), 0.03, "red", sides=5)
    kit.box("clamp", (0.04, 0.04, 0.1), (-0.29, 0, 0.1), "metal_light")


def main() -> None:
    run("util_battery", build, SEED, view_size=1.2, w=1, h=1, max_h=0.5)


if __name__ == "__main__":
    main()
