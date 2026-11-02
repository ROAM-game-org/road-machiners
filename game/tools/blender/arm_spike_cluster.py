"""Spike cluster, a light accessory that bolts over an armor plate.

A front-edge row of 1 cell: 0.484 m across, 0.65 m deep, outer face at +X. A square bracket plate bolts onto the
armor's outer face. Five welded steel points of uneven length stand on it in two staggered rows and point out to
X = 0.62 m. The bracket takes the faction paint.
Run: blender --background --python tools/blender/arm_spike_cluster.py -- public/models/arm_spike_cluster.glb [tmp/arm_spike_cluster.png]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arm_spike_strip import TIP_X, add_spike  # noqa: E402
from kit import Kit  # noqa: E402
from parts_common_armor import OUTER_X, run  # noqa: E402

N = 1
SEED = 43
PLATE_X = OUTER_X + 0.02
UPPER_Z = 0.55
LOWER_Z = 0.33
UPPER_YS = (-0.14, 0.0, 0.14)
LOWER_YS = (-0.07, 0.07)


def build(kit: Kit) -> None:
    kit.box("bracket", (0.04, 0.4, 0.46), (PLATE_X, 0, 0.45), "paint", dent_by=0.006)
    kit.box("brace", (0.08, 0.4, 0.05), (OUTER_X + 0.04, 0, 0.2), "metal")
    for y in (-0.17, 0.17):
        for z in (0.26, 0.64):
            kit.box(f"bolt{y}_{z}", (0.03, 0.04, 0.04), (PLATE_X + 0.025, y, z), "dark")
    for i, y in enumerate(UPPER_YS):
        tip = TIP_X - kit.rng.uniform(0.0, 0.1)
        add_spike(kit, f"point{i}", PLATE_X + 0.02, y, UPPER_Z, tip, 0.035, "metal_light")
    for i, y in enumerate(LOWER_YS):
        tip = TIP_X - 0.1 - kit.rng.uniform(0.0, 0.1)
        add_spike(kit, f"rebar{i}", PLATE_X + 0.02, y, LOWER_Z, tip, 0.025, "rust")


if __name__ == "__main__":
    run("arm_spike_cluster", build, SEED, N, reach=TIP_X)
