"""Sector aggregation helpers."""
from __future__ import annotations


def compute_sector_scores(symbol_scores: dict[str, float]) -> dict[str, float]:
    """Aggregate symbol scores by sector key.

    Args:
        symbol_scores: mapping like {"BTCUSDT": 25.0, "ETHUSDT": 15.0}

    Returns:
        dict like {"BTC": 25.0, "ETH": 15.0, "DEFI": 8.3}
    """
    from sector_map import get_sector

    acc: dict[str, list[float]] = {}
    for sym, score in symbol_scores.items():
        sector = get_sector(sym)
        acc.setdefault(sector, []).append(score)
    return {s: round(sum(v) / len(v), 1) for s, v in acc.items()}
