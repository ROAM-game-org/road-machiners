from __future__ import annotations

import sys
from collections.abc import Callable
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fort_kit import SKIRT, extrude, rect  # noqa: E402
from kit import Kit, parse_args  # noqa: E402
from shapes import strut  # noqa: E402

WALL_LENGTH = 8.0
WALL_HALF_DEPTH = 1.0
WALL_HEIGHT = 12.0
COURSES = 6
TOWER_HALF = 2.4
TOWER_BASE_HALF = 2.9
BASE_TOP = 4.0
DECK_Z = 13.0
TOWER_HEIGHT = 16.0
GATE_WIDTH = 24.0
GATE_DEPTH = 3.0
GATE_HEIGHT = 16.0
OPENING_HALF = 10.0
PIER_DEPTH = 1.2
PIER_TOP = 11.5
LINTEL_TOP = 15.5
RAIL_BOTTOM = 10.6
LEAF_WIDTH = 10.3
LEAF_THICK = 0.56
LEAF_TOP = 10.5
LEAF_X = -1.6

COLORS = {
    "steel": 0x9A9A94,
    "steel_b": 0x7E7E78,
    "steel_c": 0x62625E,
    "dark": 0x2A2420,
    "rust": 0x5E3420,
    "rust_dark": 0x3A2418,
    "concrete": 0xB8B8B0,
    "concrete_b": 0x9A8A78,
    "hazard": 0xF2A22C,
    "stripe": 0x1E1C1A,
    "glow": 0xFFF2C8,
}

SEEDS = {"wall": 801, "tower": 802, "gate": 803, "leaf": 804, "shut": 805}


def solid(kit: Kit, name: str, x0: float, x1: float, y0: float, y1: float, z0: float, z1: float, mat: str) -> None:
    extrude(kit, name, rect(x0, x1, y0, y1), rect(x0, x1, y0, y1), z0, z1, mat)


def wall(kit: Kit) -> None:
    h, d = WALL_LENGTH / 2, WALL_HALF_DEPTH
    solid(kit, "wall_core", -h, h, -d, d, -SKIRT, WALL_HEIGHT - 0.3, "steel_c")
    course = (WALL_HEIGHT - 0.6) / COURSES
    for sign in (-1, 1):
        face = sign * d
        y0, y1 = sorted((face, face + sign * 0.1))
        for i in range(COURSES):
            z0 = 0.3 + i * course
            mat = ("steel", "steel_b", "steel")[i % 3]
            solid(kit, f"wall_plate{sign}_{i}", -h, h, y0, y1, z0 + 0.04, z0 + course - 0.04, mat)
        for k in range(-1, 2):
            x = k * 2.7
            solid(kit, f"wall_weld{sign}_{k}", x - 0.07, x + 0.07, *sorted((face, face + sign * 0.16)), 0.2, WALL_HEIGHT - 0.4, "rust")
        for k in range(8):
            x0 = -h + k * 1.0
            mat = "hazard" if k % 2 == 0 else "stripe"
            solid(kit, f"wall_hazard{sign}_{k}", x0, x0 + 1.0, *sorted((face + sign * 0.1, face + sign * 0.14)), 8.6, 9.3, mat)
        low = rect(-h, h, *sorted((face, face + sign * 0.55)))
        top = rect(-h, h, *sorted((face, face + sign * 0.1)))
        extrude(kit, f"wall_foot{sign}", low, top, -SKIRT, 1.1, "concrete_b")
    solid(kit, "wall_cap", -h, h, -d - 0.1, d + 0.1, WALL_HEIGHT - 0.3, WALL_HEIGHT, "dark")
    for k in range(5):
        x = -h + 0.5 + k * 1.75
        solid(kit, f"wall_post{k}", x - 0.07, x + 0.07, -0.07, 0.07, WALL_HEIGHT, WALL_HEIGHT + 1.1, "steel_b")
    solid(kit, "wall_rail_top", -h, h, -0.05, 0.05, WALL_HEIGHT + 1.0, WALL_HEIGHT + 1.1, "steel_b")
    solid(kit, "wall_rail_mid", -h, h, -0.05, 0.05, WALL_HEIGHT + 0.5, WALL_HEIGHT + 0.58, "steel_b")


def tower(kit: Kit) -> None:
    b, s = TOWER_BASE_HALF, TOWER_HALF
    extrude(kit, "tower_base", rect(-b, b, -b, b), rect(-s - 0.15, s + 0.15, -s - 0.15, s + 0.15), -SKIRT, BASE_TOP, "concrete_b")
    solid(kit, "tower_shaft", -s, s, -s, s, BASE_TOP - 0.2, DECK_Z, "steel_c")
    course = (DECK_Z - BASE_TOP - 0.4) / 4
    for face, (ax, sign) in enumerate((("x", 1), ("y", 1), ("x", -1), ("y", -1))):
        n = sign * s
        for i in range(4):
            z0 = BASE_TOP + 0.1 + i * course
            mat = ("steel", "steel_b")[(i + face) % 2]
            a, c = sorted((n, n + sign * 0.1))
            if ax == "x":
                solid(kit, f"tower_plate{face}_{i}", a, c, -s + 0.1, s - 0.1, z0 + 0.04, z0 + course - 0.04, mat)
            else:
                solid(kit, f"tower_plate{face}_{i}", -s + 0.1, s - 0.1, a, c, z0 + 0.04, z0 + course - 0.04, mat)
        slit = (n + sign * 0.02, n + sign * 0.12)
        a, c = sorted(slit)
        if ax == "x":
            solid(kit, f"tower_slit{face}", a, c, -0.8, 0.8, 9.6, 10.2, "stripe")
        else:
            solid(kit, f"tower_slit{face}", -0.8, 0.8, a, c, 9.6, 10.2, "stripe")
    for px in (-1, 1):
        for py in (-1, 1):
            solid(kit, f"tower_post{px}{py}", *sorted((px * (s - 0.2), px * (s + 0.2))), *sorted((py * (s - 0.2), py * (s + 0.2))), BASE_TOP, DECK_Z, "rust")
    for k, z in enumerate((5.2, 6.0)):
        for face, (ax, sign) in enumerate((("x", 1), ("x", -1), ("y", 1), ("y", -1))):
            mat = "hazard" if k == 0 else "stripe"
            n = sign * (s + 0.1)
            a, c = sorted((n, n + sign * 0.06))
            if ax == "x":
                solid(kit, f"tower_band{k}_{face}", a, c, -s, s, z, z + 0.4, mat)
            else:
                solid(kit, f"tower_band{k}_{face}", -s, s, a, c, z, z + 0.4, mat)
    solid(kit, "tower_deck", -s - 0.4, s + 0.4, -s - 0.4, s + 0.4, DECK_Z, DECK_Z + 0.4, "dark")
    r = s + 0.3
    for px in (-1, 0, 1):
        for py in (-1, 0, 1):
            if px or py:
                solid(kit, f"tower_rail_post{px}{py}", px * r - 0.05, px * r + 0.05, py * r - 0.05, py * r + 0.05, DECK_Z + 0.4, DECK_Z + 1.4, "steel_b")
    for k, (x0, x1, y0, y1) in enumerate(((-r, r, r - 0.04, r + 0.04), (-r, r, -r - 0.04, -r + 0.04), (r - 0.04, r + 0.04, -r, r), (-r - 0.04, -r + 0.04, -r, r))):
        solid(kit, f"tower_rail{k}", x0, x1, y0, y1, DECK_Z + 1.3, DECK_Z + 1.4, "steel_b")
    solid(kit, "tower_lamp_house", -1.1, 0.5, -0.8, 0.8, DECK_Z + 0.4, TOWER_HEIGHT - 0.8, "steel_b")
    solid(kit, "tower_lamp", 0.5, 0.75, -0.6, 0.6, DECK_Z + 1.0, DECK_Z + 2.0, "glow")
    strut(kit, "tower_mast", (-0.8, 1.2, DECK_Z + 0.4), (-0.8, 1.2, TOWER_HEIGHT + 2.4), 0.1, "steel_b", sides=5)


def pier(kit: Kit, sign: int) -> None:
    y0, y1 = sorted((sign * OPENING_HALF, sign * GATE_WIDTH / 2))
    solid(kit, f"gate_pier{sign}", -PIER_DEPTH, -0.05, y0, y1, -SKIRT, PIER_TOP, "steel_c")
    for i in range(5):
        z0 = 0.3 + i * 2.2
        solid(kit, f"gate_pier_plate{sign}_{i}", -0.05, 0.0, y0 + 0.1, y1 - 0.1, z0 + 0.04, z0 + 2.1, ("steel", "steel_b")[i % 2])
    for k in range(4):
        z0 = 0.4 + k * 0.7
        mat = "hazard" if k % 2 == 0 else "stripe"
        solid(kit, f"gate_pier_stripe{sign}_{k}", -PIER_DEPTH, -PIER_DEPTH + 0.06, y0, y0 + 0.4, z0, z0 + 0.35, mat)
    solid(kit, f"gate_pier_foot{sign}", -PIER_DEPTH, 0.0, *sorted((sign * (OPENING_HALF - 0.15), sign * OPENING_HALF)), -SKIRT, 1.0, "concrete_b")


def gate(kit: Kit) -> None:
    for sign in (-1, 1):
        pier(kit, sign)
    hw = GATE_WIDTH / 2
    solid(kit, "gate_lintel", -GATE_DEPTH, 0.0, -hw, hw, PIER_TOP, LINTEL_TOP, "steel_c")
    n = 12
    width = GATE_WIDTH / n
    for i in range(n):
        y0 = -hw + i * width
        mat = "hazard" if i % 2 == 0 else "stripe"
        solid(kit, f"gate_lintel_stripe{i}", -0.06, 0.0, y0, y0 + width, PIER_TOP + 0.3, PIER_TOP + 1.2, mat)
    for i in range(4):
        y0 = -hw + 0.5 + i * (GATE_WIDTH - 1.0) / 4
        solid(kit, f"gate_lintel_plate{i}", -0.06, 0.0, y0 + 0.05, y0 + (GATE_WIDTH - 1.0) / 4 - 0.05, PIER_TOP + 1.4, LINTEL_TOP - 0.3, ("steel", "steel_b")[i % 2])
    solid(kit, "gate_cap", -GATE_DEPTH, 0.0, -hw, hw, LINTEL_TOP, LINTEL_TOP + 0.2, "dark")
    for k in range(7):
        y = -hw + 0.4 + k * (GATE_WIDTH - 0.8) / 6
        solid(kit, f"gate_post{k}", -0.12, 0.0, y - 0.06, y + 0.06, LINTEL_TOP + 0.2, GATE_HEIGHT - 0.1, "steel_b")
    solid(kit, "gate_rail_top", -0.12, 0.0, -hw, hw, GATE_HEIGHT - 0.1, GATE_HEIGHT, "steel_b")
    solid(kit, "gate_slide_rail", LEAF_X - LEAF_THICK / 2 - 0.1, LEAF_X + LEAF_THICK / 2 + 0.1, -hw, hw, RAIL_BOTTOM, PIER_TOP, "steel_b")
    solid(kit, "gate_slide_web", LEAF_X - 0.15, LEAF_X + 0.15, -hw, hw, PIER_TOP, PIER_TOP + 0.5, "dark")


def leaf_at(kit: Kit, name: str, sign: int, x: float) -> None:
    t = LEAF_THICK / 2

    def span(u0: float, u1: float) -> tuple[float, float]:
        return tuple(sorted((sign * u0, sign * u1)))

    y0, y1 = span(0.0, LEAF_WIDTH)
    solid(kit, f"{name}_core", x - t, x + t, y0, y1, 0.15, LEAF_TOP, "steel_c")
    plates = 3
    pw = LEAF_WIDTH / plates
    for face in (-1, 1):
        fx = x + face * t
        a, c = sorted((fx, fx + face * 0.08))
        for i in range(plates):
            p0, p1 = span(i * pw + 0.05, (i + 1) * pw - 0.05)
            solid(kit, f"{name}_plate{face}_{i}", a, c, p0, p1, 0.25, LEAF_TOP - 0.1, ("steel", "steel_b", "steel")[i % 3])
        for k, z in enumerate((2.0, LEAF_TOP / 2 + 0.5, LEAF_TOP - 2.0)):
            b0, b1 = span(0.2, LEAF_WIDTH - 0.2)
            solid(kit, f"{name}_bar{face}_{k}", *sorted((fx, fx + face * 0.16)), b0, b1, z - 0.12, z + 0.12, "rust")
        for k in range(10):
            s0, s1 = span(k * LEAF_WIDTH / 10, (k + 1) * LEAF_WIDTH / 10)
            solid(kit, f"{name}_hazard{face}_{k}", *sorted((fx, fx + face * 0.1)), s0, s1, LEAF_TOP - 1.0, LEAF_TOP - 0.45, "hazard" if k % 2 == 0 else "stripe")
    e0, e1 = span(LEAF_WIDTH - 0.3, LEAF_WIDTH)
    solid(kit, f"{name}_edge", x - t - 0.12, x + t + 0.12, e0, e1, 0.15, LEAF_TOP, "rust_dark")
    for k, u in enumerate((1.2, LEAF_WIDTH - 1.2)):
        t0, t1 = span(u - 0.5, u + 0.5)
        solid(kit, f"{name}_trolley{k}", x - 0.2, x + 0.2, t0, t1, LEAF_TOP - 0.1, LEAF_TOP + 0.3, "steel_b")
    g0, g1 = span(0.0, LEAF_WIDTH)
    solid(kit, f"{name}_shoe", x - 0.12, x + 0.12, g0, g1, 0.0, 0.22, "dark")


def leaf(kit: Kit) -> None:
    leaf_at(kit, "leaf", 1, 0.0)


def shut(kit: Kit) -> None:
    for sign in (-1, 1):
        leaf_at(kit, f"shut{sign}", sign, LEAF_X)


PIECES: dict[str, tuple[Callable[[Kit], None], float]] = {
    "wall": (wall, 14),
    "tower": (tower, 32),
    "gate": (gate, 40),
    "leaf": (leaf, 24),
    "shut": (shut, 40),
}


def run(piece: str) -> None:
    if piece not in PIECES:
        raise KeyError(f"unknown outpost piece {piece!r}. Known: {sorted(PIECES)}")
    args = parse_args()
    kit = Kit(COLORS, SEEDS[piece])
    build, view = PIECES[piece]
    build(kit)
    kit.export(f"fort_outpost_{piece}", args, view_size=view)
