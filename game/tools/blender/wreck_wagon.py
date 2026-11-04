from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from wreck import COLORS, SEED, wheel  # noqa: E402


def build(kit: Kit) -> None:
    for i, (x, y) in enumerate([(1.4, -0.6), (1.4, 0.6), (-1.4, -0.6), (-1.4, 0.6)]):
        kit.box(f"block{i}", (0.4, 0.3, 0.3), (x, y, 0.15), "metal", dent_by=0.02)

    kit.box("body_low", (4.3, 1.66, 0.6), (0.0, 0.0, 0.6), "rust_dark", dent_by=0.04)
    kit.box("body_trim", (4.3, 1.7, 0.1), (0.0, 0.0, 0.92), "rust_side", dent_by=0.03)
    kit.box("cabin", (3.0, 1.58, 0.58), (-0.55, 0.0, 1.22), "rust", dent_by=0.04)
    kit.box("roof", (3.1, 1.62, 0.06), (-0.55, 0.0, 1.54), "rust_side", rot=(math.radians(-1.5), 0, 0), dent_by=0.04)
    kit.box("windshield_hole", (0.05, 1.3, 0.38), (0.97, 0.0, 1.22), "soot", rot=(0, math.radians(-20), 0))
    kit.box("rear_glass_hole", (0.05, 1.3, 0.4), (-2.07, 0.0, 1.22), "soot")
    kit.box("side_window_left", (2.5, 0.05, 0.34), (-0.55, -0.8, 1.26), "soot")
    kit.box("side_window_right", (2.5, 0.05, 0.34), (-0.55, 0.8, 1.26), "soot")

    kit.box("engine", (0.9, 0.9, 0.4), (1.6, 0.0, 0.95), "soot", dent_by=0.03)
    kit.box("hood", (1.2, 1.6, 0.06), (1.46, 0.0, 1.34), "rust", rot=(0, math.radians(-40), 0), dent_by=0.04)
    kit.box("grille", (0.07, 1.4, 0.3), (2.17, 0.0, 0.7), "rust_dark", dent_by=0.03)
    kit.box("bumper_front", (0.14, 1.75, 0.16), (2.28, 0.0, 0.5), "metal", dent_by=0.02)
    kit.box("bumper_rear", (0.14, 1.7, 0.16), (-2.25, 0.0, 0.5), "metal", rot=(0, 0, math.radians(6)), dent_by=0.02)
    kit.box("axle_front", (0.1, 1.5, 0.1), (1.4, 0.0, 0.38), "metal")
    kit.box("axle_rear", (0.1, 1.5, 0.1), (-1.4, 0.0, 0.38), "metal")

    wheel(kit, "wheel_stack_low", (0.3, -1.5, 0.15), (0, 0, 0), radius=0.4, width=0.3)
    wheel(kit, "wheel_stack_high", (0.35, -1.52, 0.45), (0, 0, math.radians(20)), radius=0.4, width=0.3, flat=0.5)
    kit.box("scrap0", (0.5, 0.3, 0.04), (-1.8, 1.45, 0.03), "rust_dark", rot=(0, 0, 0.5), dent_by=0.02)
    kit.box("scrap1", (0.45, 0.3, 0.04), (-0.6, 1.7, 0.03), "rust_dark", rot=(0, 0, -0.3), dent_by=0.02)


def main() -> None:
    from kit import parse_args

    args = parse_args()
    kit = Kit(COLORS, SEED)
    build(kit)
    kit.export("wreck_wagon", args, view_size=7)


if __name__ == "__main__":
    main()
