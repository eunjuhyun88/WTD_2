"""Universe defaults used by live scans and challenge flows."""
from __future__ import annotations

import os

DEFAULT_SCAN_UNIVERSE = os.environ.get("SCAN_UNIVERSE", "binance_dynamic")

# Keep refinement narrower by default so Save Setup stays responsive.
DEFAULT_CHALLENGE_FIT_UNIVERSE = os.environ.get(
    "CHALLENGE_FIT_UNIVERSE",
    "binance_30",
)

# Challenge search should mirror the live scanner unless overridden.
DEFAULT_CHALLENGE_SCAN_UNIVERSE = os.environ.get(
    "CHALLENGE_SCAN_UNIVERSE",
    DEFAULT_SCAN_UNIVERSE,
)
