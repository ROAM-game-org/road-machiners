"""Spike strip, a light accessory that bolts over armor plates.

A front-edge row of 2 cells: 0.97 m across, 0.65 m deep, outer face at +X. Two rails and three straps bolt onto the
armor's outer face. Welded sharpened steel points stand on the upper rail and rebar points on the lower rail,
all pointing out to X = 0.62 m. The straps take the faction paint.
Run: blender --background --python tools/blender/arm_spike_strip.py -- public/models/arm_spike_strip.glb [tmp/arm_spike_strip.png]
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_armor import CELL_ACROSS, OUTER_X, half_span, run, spread  # noqa: E402
from shapes import taper  # noqa: E402

N = 2
SEED = 42
TIP_X = 0.62
RAIL_X = OUTER_X + 0.03
UPPER_Z = 0.62
LOWER_Z = 0.3


def add_spike(kit: Kit, name: str, base_x: float, y: float, z: float, tip_x: float, radius: float, mat: str) -> None:
    length = tip_x - base_x
    spike = kit.cylinder(name, radius, length, (base_x + length / 2, y, z), mat, rot=(0, math.radians(90), 0), vertices=4)
    taper(spike, 0.08)
    kit.cylinder(f"{name}_weld", radius * 1.5, 0.04, (base_x + 0.02, y, z), "dark", rot=(0, math.radians(90), 0), vertices=6)


def build(kit: Kit) -> None:
    half = half_span(N)
    edge = half - 0.04
    for z, mat in ((UPPER_Z, "metal"), (LOWER_Z, "rust_side")):
        kit.box(f"rail{z}", (0.06, edge * 2, 0.07), (RAIL_X, 0, z), mat, dent_by=0.004)
    for y in spread(N + 1, edge - 0.03):
        kit.box(f"strap{y:.2f}", (0.04, 0.06, UPPER_Z - LOWER_Z + 0.2), (OUTER_X + 0.02, y, (UPPER_Z + LOWER_Z) / 2), "paint")
        kit.box(f"bolt{y:.2f}", (0.03, 0.04, 0.04), (OUTER_X + 0.05, y, LOWER_Z - 0.07), "dark")
    count = 4 * N
    for i, y in enumerate(spread(count, edge - 0.05)):
        tip = TIP_X - kit.rng.uniform(0.0, 0.05)
        add_spike(kit, f"point{i}", RAIL_X + 0.03, y, UPPER_Z, tip, 0.032, "metal_light")
    for i, y in enumerate(spread(count - 1, edge - 0.05)):
        tip = TIP_X - 0.08 - kit.rng.uniform(0.0, 0.05)
        add_spike(kit, f"rebar{i}", RAIL_X + 0.03, y, LOWER_Z, tip, 0.022, "rust")


if __name__ == "__main__":
    run("arm_spike_strip", build, SEED, N, reach=TIP_X)
