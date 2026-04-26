#!/usr/bin/env python3
"""Verify design contract invariants."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from invariants import main as invariants_main


if __name__ == "__main__":
    sys.argv.append("--section")
    sys.argv.append("contracts")
    raise SystemExit(invariants_main())
