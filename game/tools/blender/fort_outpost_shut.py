from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fort_outpost_kit import run  # noqa: E402

if __name__ == "__main__":
    run("shut")
