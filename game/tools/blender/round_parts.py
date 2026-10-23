"""How round a truck's round pieces are, and the one wheel look every truck wheel is drawn with.

The game shades flat, so a cylinder's outline is its polygon: the side count grows with the drawn radius.
"""

from __future__ import annotations

import math

from kit import Kit, Vec3

TIRE_SIDES = 48
RIM_SIDES = 32
HUB_SIDES = 16
TIRE_SHARE = 0.935
RIM_SHARE = 0.55
HUB_SHARE = 0.22
TIRE_WIDTH_SHARE = 0.94
RIM_WIDTH_SHARE = 0.98
AXLE_ALONG_Y = (math.pi / 2, 0, 0)


def round_sides(radius: float) -> int:
    """Side count of a round truck piece of this drawn radius in meters: 8 under 5 cm, 16 under 25 cm, else 32."""
    if radius <= 0:
        raise ValueError(f"a round piece needs a positive radius, got {radius}")
    if radius < 0.05:
        return 8
    if radius < 0.25:
        return 16
    return 32


def wheel_disc(kit: Kit, prefix: str, radius: float, half_width: float, loc: Vec3) -> None:
    """The tire, rim and hub of one wheel on an axle along Blender Y. radius is the wheel's radius to its tread tips."""
    if radius <= 0 or half_width <= 0:
        raise ValueError(f"wheel {prefix!r} needs a positive radius and half width, got {radius} and {half_width}")
    width = 2 * half_width
    kit.cylinder(f"{prefix}tire", radius * TIRE_SHARE, width * TIRE_WIDTH_SHARE, loc, "wheel", rot=AXLE_ALONG_Y, vertices=TIRE_SIDES)
    kit.cylinder(f"{prefix}rim", radius * RIM_SHARE, width * RIM_WIDTH_SHARE, loc, "metal_light", rot=AXLE_ALONG_Y, vertices=RIM_SIDES)
    kit.cylinder(f"{prefix}hub", radius * HUB_SHARE, width, loc, "rust", rot=AXLE_ALONG_Y, vertices=HUB_SIDES)
