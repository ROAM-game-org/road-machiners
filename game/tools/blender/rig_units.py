"""Shared steps for the units of a rig: each unit is laid out in the straight rig frame, checked, then moved onto its own origin.

A rig is a front unit and a rear unit on a pivot. Its scripts build every shape in one straight rig frame, so the units
meet where the photo or the brief puts them, then each unit is moved so its origin is its own collider center.
"""

from __future__ import annotations

import bpy
from mathutils import Vector

from kit import Kit, parse_args


def bounds(kit: Kit) -> tuple[Vector, Vector]:
    bpy.context.view_layer.update()
    pts = [obj.matrix_world @ v.co for obj in kit._parts for v in obj.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def check_unit(kit: Kit, name: str, front: float, back: float, width: float, ground: float) -> None:
    """Raises when the unit leaves its stretch of the straight rig frame, its width, or does not stand on the ground."""
    lo, hi = bounds(kit)
    print(f"{name} bounds x {lo.x:.3f}..{hi.x:.3f} y {lo.y:.3f}..{hi.y:.3f} z {lo.z:.3f}..{hi.z:.3f}")
    if abs(hi.x - front) > 0.01 or abs(lo.x - back) > 0.01 or abs(hi.y - lo.y - width) > 0.01 or abs(lo.z - ground) > 0.01:
        raise RuntimeError(f"{name} spans x {lo.x:.3f}..{hi.x:.3f}, {hi.y - lo.y:.3f} m across from z {lo.z:.3f}, not {back}..{front}, {width} m from {ground}")


def unit_wheels(name: str, wheels: int, expected: int, rig_total: int) -> None:
    if wheels != expected:
        raise RuntimeError(f"{name} draws {wheels} wheels, not {expected}: with the game's wheels the rig must show {rig_total}")


def move_to_origin(kit: Kit, origin: float) -> None:
    """Moves every part so the straight rig frame's x origin lands at -origin, the unit's own collider center."""
    for obj in kit._parts:
        obj.location.x -= origin


def export_unit(kit: Kit, name: str, origin: float, sockets: dict[str, tuple[float, float, float]]) -> None:
    """Moves the unit onto its own origin, adds its sockets given in the straight rig frame and writes it."""
    move_to_origin(kit, origin)
    for socket, (x, y, z) in sockets.items():
        kit.socket(socket, (x - origin, y, z))
    kit.export(name, parse_args(), view_size=20.0)
