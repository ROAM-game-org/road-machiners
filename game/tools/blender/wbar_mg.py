"""Machine gun barrel for the 'mg' weapon.

1.0 m long. A slotted cooling jacket, a bare barrel and a flash hider. Origin at the rear end, centered in Y and
Z, running along +X.
Run: blender --background --python tools/blender/wbar_mg.py -- public/models/wbar_mg.glb [tmp/wbar_mg.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_weapon import run, tube  # noqa: E402
from shapes import taper  # noqa: E402

SEED = 81


def build(kit: Kit) -> None:
    tube(kit, "collar", 0.042, 0.0, 0.05, "metal_light", sides=6)
    tube(kit, "jacket", 0.036, 0.05, 0.6, "dark", dent_by=0.002)
    for i, x in enumerate((0.14, 0.26, 0.38, 0.5)):
        tube(kit, f"slot_band{i}", 0.04, x, x + 0.025, "metal", sides=6)
    tube(kit, "barrel", 0.02, 0.6, 0.94, "metal", sides=6)
    hider = tube(kit, "flash_hider", 0.03, 0.94, 1.0, "dark", sides=6)
    taper(hider, 1.2)
    kit.socket("tip", (1.0, 0, 0))


if __name__ == "__main__":
    run("wbar_mg", build, SEED, preview_m=1.0)
