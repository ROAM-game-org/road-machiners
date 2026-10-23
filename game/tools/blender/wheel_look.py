"""The one wheel look every truck draws: a dark tire, a light rim and a rust hub, each a round cylinder on the axle.

The wheel model draws it at 1 m radius and the view scales it, and the semi and sorokonoga draw their duals with it.
Vertex counts come from round_vertices() at WHEEL_MAX_R, the largest drawn wheel, so no wheel reads as a polygon.
"""

from __future__ import annotations

import math

from kit import Kit, Vec3, round_vertices

WHEEL_MAX_R = 0.8  # PHYSICS.bodies.semi.wheelRadius and .loader.wheelRadius
TIRE_SHARE = 0.935  # the tire body; the wheel model's lugs reach the full radius
RIM_SHARE = 0.55
HUB_SHARE = 0.22
AXLE = (math.pi / 2, 0, 0)


def wheel_counts(max_radius: float = WHEEL_MAX_R) -> tuple[int, int, int]:
    """The tire, rim and hub vertex counts of a wheel drawn at up to max_radius."""
    return tuple(round_vertices(share * max_radius) for share in (TIRE_SHARE, RIM_SHARE, HUB_SHARE))


def wheel_parts(kit: Kit, name: str, loc: Vec3, radius: float, width: float, max_radius: float = WHEEL_MAX_R) -> None:
    """A tire, rim and hub at loc with the axle along Blender Y, for a wheel of this radius and full width."""
    tire, rim, hub = wheel_counts(max_radius)
    kit.cylinder(f"{name}_tire", radius * TIRE_SHARE, width * 0.94, loc, "wheel", rot=AXLE, vertices=tire)
    kit.cylinder(f"{name}_rim", radius * RIM_SHARE, width * 0.98, loc, "metal_light", rot=AXLE, vertices=rim)
    kit.cylinder(f"{name}_hub", radius * HUB_SHARE, width, loc, "rust", rot=AXLE, vertices=hub)
