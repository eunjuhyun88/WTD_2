"""Screener-backed filtered universes."""
from __future__ import annotations

from screener.store import ScreenerStore
from universe.dynamic import load_dynamic_universe, load_dynamic_universe_async


def load_screened_universe(
    *,
    min_structural_grade: str = "B",
    max_symbols: int = 300,
    fallback: bool = True,
) -> list[str]:
    grades = ("A",) if min_structural_grade == "A" else ("A", "B")
    symbols = ScreenerStore().list_filtered_symbols(
        structural_grades=grades,
        max_symbols=max_symbols,
    )
    if symbols:
        return symbols
    if fallback:
        return load_dynamic_universe(max_symbols=max_symbols)
    return []


async def load_screened_universe_async(
    *,
    min_structural_grade: str = "B",
    max_symbols: int = 300,
    fallback: bool = True,
) -> list[str]:
    grades = ("A",) if min_structural_grade == "A" else ("A", "B")
    symbols = ScreenerStore().list_filtered_symbols(
        structural_grades=grades,
        max_symbols=max_symbols,
    )
    if symbols:
        return symbols
    if fallback:
        return await load_dynamic_universe_async(max_symbols=max_symbols)
    return []
