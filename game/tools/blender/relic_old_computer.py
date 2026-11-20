"""Old computer: a boxy monitor on a beige case with a keyboard slab, for relicComputer.

Footprint 1x1: 0.65 m along (X) by 0.484 m across (Y). About 0.5 m tall. Origin at the footprint center on the deck top.
The monitor screen glows ship green and faces the nose.
Run: blender --background --python tools/blender/relic_old_computer.py -- public/models/relic_old_computer.glb [tmp/relic_old_computer.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_cargo import run  # noqa: E402

SEED = 415


def build(kit: Kit) -> None:
    kit.box("case", (0.4, 0.4, 0.12), (-0.08, 0, 0.06), "white", dent_by=0.006)
    kit.box("slot", (0.02, 0.24, 0.025), (0.125, 0, 0.07), "battery")
    kit.box("monitor", (0.34, 0.34, 0.3), (-0.08, 0, 0.27), "white", dent_by=0.008)
    kit.box("tube_back", (0.1, 0.24, 0.2), (-0.26, 0, 0.27), "white")
    kit.box("bezel", (0.02, 0.3, 0.24), (0.1, 0, 0.28), "battery")
    kit.box("screen", (0.02, 0.24, 0.18), (0.112, 0, 0.28), "screen")
    kit.box("keys", (0.16, 0.34, 0.03), (0.22, 0, 0.02), "metal_light", rot=(0, -0.1, 0))
    kit.box("keycaps", (0.12, 0.28, 0.02), (0.22, 0, 0.04), "battery", rot=(0, -0.1, 0))
    kit.box("cable", (0.04, 0.03, 0.2), (-0.27, 0.15, 0.1), "red", rot=(0.3, 0, 0))
    kit.box("crack", (0.02, 0.01, 0.12), (0.115, 0.05, 0.3), "battery", rot=(0, 0, 0.0))


def main() -> None:
    run("relic_old_computer", build, SEED, view_size=1.2, w=1, h=1, max_h=0.55)


if __name__ == "__main__":
    main()
