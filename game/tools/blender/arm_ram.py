"""Ram bar with prongs for the 'ram' armor.

A front-edge row of 3 cells: 1.45 m across, 0.65 m deep, outer face at +X. A heavy bar sits flush on the row's outer
face, held by three short brackets inside its depth, and four spikes stick out to X = 0.72 m. The bar takes the faction paint.
Run: blender --background --python tools/blender/arm_ram.py -- public/models/arm_ram.glb [tmp/arm_ram.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_armor import OUTER_X, half_span, run, spread  # noqa: E402
from shapes import taper  # noqa: E402

N = 3
SEED = 33
BAR_X = OUTER_X + 0.09
BAR_Z = 0.42
TIP_X = 0.72
BRACKET_H = 0.5


def build(kit: Kit) -> None:
    half = half_span(N)
    for i, y in enumerate(spread(3, half - 0.1)):
        kit.box(f"bracket{i}", (0.1, 0.12, BRACKET_H), (OUTER_X - 0.04, y, BRACKET_H / 2), "metal", dent_by=0.005)
    kit.box("bar", (0.16, half * 2 - 0.02, 0.22), (BAR_X, 0, BAR_Z), "paint", dent_by=0.008)
    kit.box("bar_low", (0.1, half * 2 - 0.1, 0.08), (BAR_X - 0.02, 0, BAR_Z - 0.22), "metal_light", dent_by=0.006)
    spike_len = TIP_X - (BAR_X + 0.08)
    for i, y in enumerate(spread(4, half - 0.15)):
        spike = kit.cylinder(f"spike{i}", 0.06, spike_len, (BAR_X + 0.08 + spike_len / 2, y, BAR_Z), "metal_light", rot=(0, math.radians(90), 0), vertices=4)
        taper(spike, 0.08)
    for i, y in enumerate(spread(4, half - 0.15)):
        kit.box(f"bolt{i}", (0.03, 0.05, 0.05), (BAR_X + 0.09, y, BAR_Z + 0.08), "dark")


if __name__ == "__main__":
    run("arm_ram", build, SEED, N, reach=TIP_X)
