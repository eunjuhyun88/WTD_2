"""Universe definitions — named coin-sets that challenges can target.

Public API:
    load_universe(name: str) -> list[str]
    load_universe_async(name: str) -> list[str]

Phase D shipped one static universe: "binance_30". The live scanner now
defaults to "binance_dynamic" while keeping the static list as a fallback
and a narrower refinement set.
"""
from universe.loader import load_universe, load_universe_async

__all__ = ["load_universe", "load_universe_async"]
