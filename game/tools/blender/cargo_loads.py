"""Shared load pieces for the loaded cargo models: crates, grain sacks and a tarp, in the cargo colors.

Every piece sits on a given base height inside the cargo part it fills.
"""

from __future__ import annotations

from kit import Kit
from shapes import taper


def crate(kit: Kit, name: str, size: tuple[float, float, float], at: tuple[float, float, float], mat: str = "crate") -> None:
    x, y, z = at
    kit.box(name, size, (x, y, z + size[2] / 2), mat, dent_by=0.006)
    kit.box(f"{name}_band", (size[0] + 0.01, size[1] * 0.18, size[2] + 0.01), (x, y, z + size[2] / 2), "wood")


def sack(kit: Kit, name: str, size: tuple[float, float, float], at: tuple[float, float, float], mat: str = "grain") -> None:
    x, y, z = at
    body = kit.box(name, size, (x, y, z + size[2] / 2), mat, dent_by=0.012)
    taper(body, top=0.7)
    kit.box(f"{name}_tie", (size[0] * 0.3, size[1] * 0.3, 0.04), (x, y, z + size[2] + 0.01), "grain_dark")


def tarp(kit: Kit, name: str, size: tuple[float, float], at: tuple[float, float, float]) -> None:
    x, y, z = at
    kit.box(name, (size[0], size[1], 0.03), (x, y, z), "tarp", dent_by=0.01)
