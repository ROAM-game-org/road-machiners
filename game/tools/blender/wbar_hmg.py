"""Heavy machine gun barrel for the 'hmg' weapon.

1.0 m long. A thick cooling jacket with dark slot bands, a thin barrel stub and a muzzle ring. Origin at the rear
end, centered in Y and Z, running along +X.
Run: blender --background --python tools/blender/wbar_hmg.py -- public/models/wbar_hmg.glb [tmp/wbar_hmg.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_core import PROUD  # noqa: E402
from parts_common_weapon import run, tube  # noqa: E402

SEED = 118


def build(kit: Kit) -> None:
    tube(kit, "collar", 0.08, 0.0, 0.06, "metal_light")
    tube(kit, "jacket", 0.065, 0.06, 0.86, "metal")
    for i, x in enumerate((0.19, 0.32, 0.45, 0.58, 0.71)):
        tube(kit, f"slot_band{i}", 0.07, x, x + 0.05, "dark")
    tube(kit, "barrel", 0.025, 0.86, 1.0, "metal_light", sides=6)
    tube(kit, "muzzle_ring", 0.045, 0.95, 1.0 - PROUD, "dark")
    kit.socket("tip", (1.0, 0, 0))


if __name__ == "__main__":
    run("wbar_hmg", build, SEED, preview_m=2.6)
