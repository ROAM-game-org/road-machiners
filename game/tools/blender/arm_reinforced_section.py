"""One section of reinforced cage for the reinforced cage armor.

A front-edge row of 1 cell: 0.484 m across, 0.65 m deep, outer face at +X. A flat grille of heavy box-section bars with cross-bracing, 0.9 m tall, stands past the outer edge on brackets. It is the one-cell cut of arm_reinforced_cage.py and shares its build.
Run: blender --background --python tools/blender/arm_reinforced_section.py -- public/models/arm_reinforced_section.glb [tmp/arm_reinforced_section.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arm_reinforced_cage import build_row, GRILLE_X  # noqa: E402
from kit import Kit  # noqa: E402
from parts_common_armor import run  # noqa: E402

N = 1
SEED = 41


def build(kit: Kit) -> None:
    build_row(kit, N)


if __name__ == "__main__":
    run("arm_reinforced_section", build, SEED, N, reach=GRILLE_X + 0.06)
