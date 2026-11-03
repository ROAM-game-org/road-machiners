from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from wreck import COLORS, SEED, wheel  # noqa: E402


def build(kit: Kit) -> None:
    kit.box("underbody", (3.3, 0.1, 1.45), (0.0, 0.62, 0.78), "rust_dark", dent_by=0.04)
    kit.box("engine", (0.9, 0.5, 0.65), (-1.15, 0.3, 0.75), "soot", dent_by=0.03)
    kit.box("axle_front", (0.08, 0.3, 1.3), (1.05, 0.5, 0.78), "metal")
    kit.box("axle_rear", (0.08, 0.3, 1.3), (-1.0, 0.5, 0.78), "metal")
    kit.box("roof", (1.7, 0.08, 1.35), (-0.1, -0.64, 0.78), "rust_side", rot=(math.radians(-4), 0, 0), dent_by=0.05)
    kit.box("pillar_a", (0.1, 0.1, 1.38), (0.8, -0.7, 0.78), "rust", dent_by=0.02)
    kit.box("pillar_b", (0.1, 0.1, 1.38), (-0.2, -0.7, 0.78), "rust", dent_by=0.02)
    kit.box("pillar_c", (0.1, 0.1, 1.38), (-0.95, -0.7, 0.78), "rust", dent_by=0.02)
    kit.box("window_front", (0.62, 0.05, 1.1), (0.3, -0.7, 0.78), "soot")
    kit.box("window_rear", (0.55, 0.05, 1.1), (-0.58, -0.7, 0.78), "soot")
    kit.box("flank_top", (3.3, 1.3, 0.07), (0.0, 0.0, 1.5), "rust", dent_by=0.05)
    kit.box("flank_ground", (3.0, 1.2, 0.07), (0.0, 0.0, 0.1), "rust_dark", dent_by=0.03)
    kit.box("door_gap", (0.06, 0.7, 0.04), (0.7, 0.0, 1.545), "soot")
    kit.box("front_panel", (0.08, 1.25, 1.3), (1.62, 0.0, 0.75), "rust", dent_by=0.04)
    kit.box("rear_panel", (0.08, 1.25, 1.3), (-1.62, 0.0, 0.75), "rust_side", dent_by=0.04)

    wheel(kit, "wheel_front", (1.05, 0.3, 1.66), (0, 0, 0), radius=0.3, width=0.2)
    wheel(kit, "wheel_rear", (-1.0, 0.3, 1.66), (0, 0, 0), radius=0.3, width=0.2, flat=0.4)

    kit.box("door_loose", (1.0, 0.6, 0.05), (1.2, -1.4, 0.04), "rust_side", rot=(0, 0, math.radians(20)), dent_by=0.03)
    kit.box("bumper_loose", (0.12, 1.2, 0.14), (-1.9, -1.2, 0.07), "metal", rot=(0, 0, math.radians(35)), dent_by=0.02)
    for i, (x, y, spin) in enumerate([(-0.4, -1.55, 0.3), (0.5, 1.5, -0.5), (2.0, -0.6, 0.9), (-2.1, 0.2, -0.2), (-0.4, 1.9, 0.7)]):
        kit.box(f"scrap{i}", (0.55, 0.32, 0.04), (x, y, 0.03), "rust_dark", rot=(0, 0, spin), dent_by=0.02)


def main() -> None:
    from kit import parse_args

    args = parse_args()
    kit = Kit(COLORS, SEED)
    build(kit)
    kit.export("wreck_compact", args, view_size=7)


if __name__ == "__main__":
    main()
