"""One tile of spaced armor for the spaced armor.

A front-edge row of 1 cell: 0.484 m across, 0.65 m deep, outer face at +X. An inner steel wall and one outer panel stand 0.2 m apart on bolted standoffs, 0.9 m tall. It is the one-cell cut of arm_spaced.py and shares its build.
Run: blender --background --python tools/blender/arm_spaced_tile.py -- public/models/arm_spaced_tile.glb [tmp/arm_spaced_tile.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arm_spaced import build_row  # noqa: E402
from kit import Kit  # noqa: E402
from parts_common_armor import run  # noqa: E402

N = 1
SEED = 39


def build(kit: Kit) -> None:
    build_row(kit, N)


if __name__ == "__main__":
    run("arm_spaced_tile", build, SEED, N)
