from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit import Kit  # noqa: E402
from parts_common_cargo import GOOD_MAX_H, run  # noqa: E402

SEED = 211
L, W, H = 0.42, 0.32, 0.22
TWINE = 0.018
PROUD = 0.008


def twine(kit: Kit) -> None:
    kit.box("twine_along_top", (L + 2 * PROUD, TWINE, PROUD), (0, 0, H + PROUD / 2), "rust_dark")
    kit.box("twine_across_top", (TWINE, W + 2 * PROUD, PROUD), (0, 0, H + PROUD / 2), "rust_dark")
    for x in (-L / 2 - PROUD / 2, L / 2 + PROUD / 2):
        kit.box("twine_end", (PROUD, TWINE, H), (x, 0, H / 2), "rust_dark")
    for y in (-W / 2 - PROUD / 2, W / 2 + PROUD / 2):
        kit.box("twine_side", (TWINE, PROUD, H), (0, y, H / 2), "rust_dark")
    kit.box("knot", (0.05, 0.05, 0.03), (0, 0, H + PROUD + 0.012), "rust_dark", dent_by=0.004)
    kit.box("bow_left", (0.07, 0.02, 0.012), (-0.04, 0.02, H + PROUD + 0.01), "rust_dark", rot=(0, 0, 0.5))
    kit.box("bow_right", (0.07, 0.02, 0.012), (0.04, -0.02, H + PROUD + 0.01), "rust_dark", rot=(0, 0, 0.5))


def build(kit: Kit) -> None:
    kit.box("wrap", (L, W, H), (0, 0, H / 2), "grain", dent_by=0.008)
    kit.box("fold", (L * 0.98, W * 0.5, 0.004), (0, W * 0.2, H + 0.002), "grain_dark")
    kit.box("label", (0.12, 0.08, PROUD), (L * 0.24, -W * 0.24, H + PROUD / 2), "white")
    twine(kit)


def main() -> None:
    run("parcel", build, SEED, view_size=0.9, w=1, h=1, max_h=GOOD_MAX_H)


if __name__ == "__main__":
    main()
