"""Universe definitions — named coin-sets that challenges can target.

Public API:
    load_universe(name: str) -> list[str]

Phase D shipped one static universe: "binance_30". The live scanner now
defaults to "binance_dynamic" while keeping the static list as a fallback
and a narrower refinement set.
"""
from universe.loader import load_universe

__all__ = ["load_universe"]
