from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_core import PROUD  # noqa: E402
from parts_common_cargo import GOOD_MAX_H, run  # noqa: E402

SEED = 212
L, W, H = 0.56, 0.38, 0.24
WALL = 0.025
TIN_R, TIN_H = 0.051, 0.1


def build(kit: Kit) -> None:
    kit.box("floor", (L - 2 * PROUD, W - 2 * PROUD, WALL), (0, 0, WALL / 2), "olive")
    for y in (-W / 2 + WALL / 2, W / 2 - WALL / 2):
        kit.box("side", (L, WALL, H), (0, y, H / 2), "olive", dent_by=0.004)
    for x in (-L / 2 + WALL / 2, L / 2 - WALL / 2):
        kit.box("end", (WALL, W - 2 * WALL, H), (x, 0, H / 2), "olive", dent_by=0.004)
    for y in (-W / 2 - 0.004, W / 2 + 0.004):
        kit.box("stencil", (0.3, 0.008, 0.05), (0, y, H * 0.55), "yellow")
    cols, rows = 4, 3
    for i in range(cols):
        for j in range(rows):
            x = -L / 2 + WALL + TIN_R + 0.01 + i * (L - 2 * WALL - 2 * TIN_R - 0.02) / (cols - 1)
            y = -W / 2 + WALL + TIN_R + 0.005 + j * (W - 2 * WALL - 2 * TIN_R - 0.01) / (rows - 1)
            kit.cylinder(f"tin{i}{j}", TIN_R, TIN_H, (x, y, H - 0.04 + TIN_H / 2), "white", vertices=8)
            kit.cylinder(f"lid{i}{j}", TIN_R * 0.85, 0.012, (x, y, H - 0.04 + TIN_H + 0.006), "metal_light", vertices=8)


def main() -> None:
    run("good_rations", build, SEED, view_size=1.2, w=1, h=1, max_h=GOOD_MAX_H)


if __name__ == "__main__":
    main()
