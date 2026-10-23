"""The one look of every drawn wheel: the wheel model and the wheels a base draws itself, like the semi's duals.

Proportions are those of the 1 m wheel model: a tire body of TIRE_R under chevron lugs that reach 1, a light rim of RIM_R
and a rust hub of HUB_R, the rim and hub standing out of the tire's sides. Each chevron is two half-bars mirrored across
the mid-plane, so the top-down and front silhouettes have matching halves and the wheel reads as one tire from every side (#201).
The tire has LUGS * 2 sides, the rim ROUND_SIDES and the hub SMALL_ROUND_SIDES, so every wheel reads round, not as a hexagon.
"""

from __future__ import annotations

import math

from mathutils import Euler, Matrix

from kit import ROUND_SIDES, SMALL_ROUND_SIDES, Kit, Vec3

AXLE = (math.radians(90), 0, 0)
LUGS = 12
TIRE_R = 0.935  # tire body radius. Lug tips reach 1.
LUG_H = 0.065
SWEEP = math.radians(28)  # each half-bar leans back from the centre line
BAR = (0.16, 0.3)  # half-bar size, tangential then axial
BAR_Y = 0.17  # half-bar center off the mid-plane
TIRE_W = 0.94
RIM_R = 0.55
RIM_W = 0.98
HUB_R = 0.22
HUB_W = 1.0

Lug = tuple[str, tuple[float, float, float], tuple[float, float, float]]


def lug_layout() -> list[Lug]:
    """Name, location and rotation of every half-bar of the 1 m wheel. Blender Y is the axle."""
    out: list[Lug] = []
    r = TIRE_R + LUG_H / 2 - 0.02
    for i in range(LUGS):
        a = math.tau * i / LUGS
        radial = (math.cos(a), 0.0, math.sin(a))
        base = Euler((0, -a + math.pi / 2, 0)).to_matrix()
        for tag, side in (("l", -1), ("r", 1)):
            m = Matrix.Rotation(side * SWEEP, 3, radial) @ base
            out.append((f"lug{i}{tag}", (radial[0] * r, side * BAR_Y, radial[2] * r), tuple(m.to_euler())))
    return out


def check_mirrored(layout: list[Lug]) -> None:
    """Fails when a half-bar has no twin across the mid-plane, which would bring back the two-wheel look."""
    for name, loc, rot in layout:
        mirrored = next((t for t in layout if abs(t[1][0] - loc[0]) < 1e-6 and abs(t[1][2] - loc[2]) < 1e-6 and abs(t[1][1] + loc[1]) < 1e-6), None)
        if mirrored is None:
            raise ValueError(f"{name} has no mirrored twin across the mid-plane")
        a, b = Matrix(Euler(rot).to_matrix()), Matrix(Euler(mirrored[2]).to_matrix())
        flip = Matrix.Diagonal((1, -1, 1))
        if max(abs(x - y) for ra, rb in zip(a, flip @ b @ flip) for x, y in zip(ra, rb)) > 1e-5:
            raise ValueError(f"{name} is not the mirror of {mirrored[0]}")


def drawn_wheel(kit: Kit, name: str, at: Vec3, radius: float, width: float, lugs: bool = True, rot: Vec3 = AXLE) -> None:
    """One wheel of outer radius `radius` and width `width` centered at `at`, its axle along Blender Y unless rot turns it.

    Lugs stand only on a wheel with its axle along Blender Y. Without lugs the tire keeps the model's tire body radius.
    """
    kit.cylinder(f"{name}_tire", TIRE_R * radius, TIRE_W * width, at, "wheel", rot=rot, vertices=LUGS * 2)
    kit.cylinder(f"{name}_rim", RIM_R * radius, RIM_W * width, at, "metal_light", rot=rot, vertices=ROUND_SIDES)
    kit.cylinder(f"{name}_hub", HUB_R * radius, HUB_W * width, at, "rust", rot=rot, vertices=SMALL_ROUND_SIDES)
    if not lugs:
        return
    if rot != AXLE:
        raise ValueError(f"{name} has lugs on an axle turned by {rot}; lugs need the axle along Blender Y")
    layout = lug_layout()
    check_mirrored(layout)
    for lug, (x, y, z), lug_rot in layout:
        size = (BAR[0] * radius, BAR[1] * width, (LUG_H + 0.04) * radius)
        kit.box(f"{name}_{lug}", size, (at[0] + x * radius, at[1] + y * width, at[2] + z * radius), "wheel", rot=lug_rot)
