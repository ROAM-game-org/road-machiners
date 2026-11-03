from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from wreck import AXLE, COLORS, SEED, crush_top  # noqa: E402


def rim(kit: Kit, name: str, x: float, y: float) -> None:
    kit.cylinder(name + "_tire", 0.33, 0.12, (x, y, 0.3), "wheel", rot=AXLE)
    kit.cylinder(name + "_rim", 0.28, 0.22, (x, y, 0.3), "metal", rot=AXLE)


def build(kit: Kit) -> None:
    kit.box("tub", (4.6, 1.8, 0.5), (0.0, 0.0, 0.5), "rust_dark", dent_by=0.04)
    kit.box("sill_left", (3.0, 0.1, 0.18), (-0.1, -0.93, 0.42), "rust_side", dent_by=0.03)
    kit.box("sill_right", (3.0, 0.1, 0.18), (-0.1, 0.93, 0.42), "rust_side", dent_by=0.03)

    kit.box("hood", (1.55, 1.74, 0.07), (1.75, 0.0, 0.8), "rust", rot=(0, math.radians(3), math.radians(2)), dent_by=0.04)
    kit.box("engine", (0.9, 1.0, 0.3), (1.65, 0.0, 0.7), "soot", dent_by=0.03)
    kit.box("fender_left", (1.4, 0.1, 0.3), (1.75, -0.92, 0.62), "rust_side", dent_by=0.04)
    kit.box("fender_right", (1.3, 0.1, 0.26), (1.8, 0.92, 0.58), "rust_dark", dent_by=0.04)
    kit.box("trunk", (1.2, 1.74, 0.07), (-1.85, 0.0, 0.82), "rust", rot=(0, math.radians(-4), 0), dent_by=0.04)
    kit.box("trunk_back", (0.07, 1.74, 0.4), (-2.3, 0.0, 0.58), "rust_side", dent_by=0.03)

    cabin = kit.box("cabin", (2.1, 1.62, 0.6), (-0.15, 0.0, 1.07), "rust_side", dent_by=0.04)
    crush_top(cabin, lambda x, y: 0.3 - max(0.0, y) * 0.25 - max(0.0, x + 0.4) * 0.12)
    kit.box("roof_cave", (1.0, 1.1, 0.05), (-0.25, 0.1, 1.28), "rust_dark", rot=(math.radians(8), math.radians(-4), 0), dent_by=0.03)
    kit.box("windshield_hole", (0.05, 1.36, 0.34), (0.96, 0.0, 1.07), "soot", rot=(0, math.radians(-30), 0))
    kit.box("rear_glass_hole", (0.05, 1.3, 0.28), (-1.2, 0.0, 1.07), "soot", rot=(0, math.radians(32), 0))
    kit.box("side_window_left", (1.5, 0.05, 0.3), (-0.15, -0.83, 1.1), "soot")
    kit.box("side_window_right", (1.5, 0.05, 0.3), (-0.15, 0.83, 1.1), "soot")

    kit.box("bumper_front", (0.14, 1.85, 0.16), (2.5, 0.0, 0.5), "metal", rot=(0, 0, math.radians(-5)), dent_by=0.02)
    kit.box("bumper_rear", (0.14, 1.8, 0.16), (-2.52, 0.0, 0.46), "metal", dent_by=0.02)

    rim(kit, "rim_fl", 1.5, -0.88)
    rim(kit, "rim_fr", 1.5, 0.88)
    rim(kit, "rim_rl", -1.45, -0.88)
    rim(kit, "rim_rr", -1.45, 0.88)

    kit.box("door_scrap", (0.8, 0.05, 0.5), (0.5, -1.35, 0.04), "rust_side", rot=(0, 0, math.radians(18)), dent_by=0.02)
    kit.box("soot_patch", (1.4, 1.2, 0.02), (0.2, 0.0, 0.01), "soot")


def main() -> None:
    from kit import parse_args

    args = parse_args()
    kit = Kit(COLORS, SEED)
    build(kit)
    kit.export("wreck_sedan", args, view_size=7)


if __name__ == "__main__":
    main()
