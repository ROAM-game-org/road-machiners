"""The one builder of every drawn wheel: the wheel model, the rig duals the base models draw and the wagon's spare.

A wheel is a tire, a light rim and a rusty hub on one axle, in the same shares of the radius on every truck.
The tire takes TIRE_SIDES, a multiple of the wheel model's 12 lugs, and the rim and hub take ROUND_SIDES, so none reads as a polygon.
"""

from __future__ import annotations

from kit import Kit, Vec3
from parts_common_core import ROUND_SIDES

TIRE_SIDES = 48
TIRE_SHARE = 0.935  # tire body radius. The wheel model's lugs reach the full radius.
RIM_SHARE = 0.55
HUB_SHARE = 0.22


def wheel_disc(kit: Kit, name: str, center: Vec3, radius: float, width: float, rot: Vec3) -> None:
    """Adds the tire, rim and hub of one wheel of this radius and width, its axle along local Z turned by rot."""
    prefix = f"{name}_" if name else ""
    kit.cylinder(f"{prefix}tire", radius * TIRE_SHARE, width * 0.94, center, "wheel", rot=rot, vertices=TIRE_SIDES)
    kit.cylinder(f"{prefix}rim", radius * RIM_SHARE, width * 0.98, center, "metal_light", rot=rot, vertices=ROUND_SIDES)
    kit.cylinder(f"{prefix}hub", radius * HUB_SHARE, width, center, "rust", rot=rot, vertices=ROUND_SIDES)
