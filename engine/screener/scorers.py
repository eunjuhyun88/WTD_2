"""Sprint 1 screener criterion scorers."""
from __future__ import annotations


def score_market_cap(min_mc_usd: float | None) -> float | None:
    if min_mc_usd is None:
        return None
    if min_mc_usd <= 5_000_000:
        return 100.0
    if min_mc_usd <= 30_000_000:
        return 85.0
    if min_mc_usd <= 100_000_000:
        return 50.0
    return 0.0


def is_market_cap_hard_filtered(min_mc_usd: float | None) -> bool:
    return min_mc_usd is not None and min_mc_usd > 100_000_000


def score_drawdown(drawdown_ratio: float | None) -> float | None:
    if drawdown_ratio is None:
        return None
    if drawdown_ratio <= 0.90:
        return 100.0
    if drawdown_ratio <= 0.95:
        return 40.0
    return 0.0


def is_drawdown_hard_filtered(drawdown_ratio: float | None) -> bool:
    return drawdown_ratio is not None and drawdown_ratio > 0.95


def score_history(max_recovery_multiple: float | None) -> float | None:
    if max_recovery_multiple is None:
        return None
    if max_recovery_multiple >= 20:
        return 20.0
    if max_recovery_multiple >= 10:
        return 40.0
    if max_recovery_multiple >= 5:
        return 70.0
    return 100.0


def score_supply(adjusted_top10_pct: float | None) -> float | None:
    if adjusted_top10_pct is None:
        return None
    if adjusted_top10_pct > 80:
        return 20.0
    if adjusted_top10_pct > 50:
        return 80.0
    if adjusted_top10_pct > 30:
        return 60.0
    return 30.0


def score_pattern(pattern_phase: str | None, *, price_change_30d: float | None = None) -> float | None:
    if pattern_phase is None:
        base = 40.0
    else:
        base = {
            "FAKE_DUMP": 60.0,
            "ARCH_ZONE": 70.0,
            "REAL_DUMP": 80.0,
            "ACCUMULATION": 100.0,
            "BREAKOUT": 20.0,
        }.get(pattern_phase.upper(), 40.0)
    if price_change_30d is not None and price_change_30d > 0.5:
        base -= 30.0
    return max(0.0, base)


def score_onchain(
    *,
    funding_rate: float | None,
    oi_change_24h: float | None,
    long_short_ratio: float | None,
) -> float | None:
    if funding_rate is None and oi_change_24h is None and long_short_ratio is None:
        return None
    score = 50.0

    if funding_rate is not None:
        if funding_rate < -0.01:
            score += 20.0
        if funding_rate > 0.05:
            score -= 20.0

    if oi_change_24h is not None:
        if 0 < oi_change_24h < 0.05:
            score += 15.0
        if oi_change_24h > 0.15:
            score -= 10.0

    if long_short_ratio is not None and long_short_ratio < 0.9:
        score += 15.0

    return max(0.0, min(100.0, score))
