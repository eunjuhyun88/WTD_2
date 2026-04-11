"""Universe definitions — named coin-sets that challenges can target.

Public API:
    load_universe(name: str) -> list[str]

Phase D ships one universe: "binance_30" (tier-balanced 10 large + 10 mid
+ 10 small cap Binance spot pairs). Phase F adds "binance_top100",
"coinalyze_filtered", and user-provided manual lists.
"""
from universe.loader import load_universe

__all__ = ["load_universe"]
