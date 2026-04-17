"""Coin Screener listing pipeline for canonical Sprint 1 inputs."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from screener.engine import build_listing
from screener.scorers import (
    is_drawdown_hard_filtered,
    is_market_cap_hard_filtered,
    score_drawdown,
    score_history,
    score_market_cap,
    score_onchain,
    score_pattern,
    score_supply,
)
from screener.store import ScreenerStore
from screener.types import ScreenerListing, ScreenerOverride, ScreenerRun

STRUCTURAL_WEIGHTS: dict[str, float] = {
    "market_cap": 20 / 60,
    "drawdown": 15 / 60,
    "supply": 15 / 60,
    "history": 10 / 60,
}

TIMING_WEIGHTS: dict[str, float] = {
    "pattern": 0.7,
    "onchain": 0.3,
}


@dataclass(frozen=True)
class ScreenerInputRecord:
    symbol: str
    min_mc_usd: float | None = None
    drawdown_ratio: float | None = None
    max_recovery_multiple: float | None = None
    adjusted_top10_pct: float | None = None
    pattern_phase: str | None = None
    price_change_30d: float | None = None
    funding_rate: float | None = None
    oi_change_24h: float | None = None
    long_short_ratio: float | None = None
    base_updated_at: str | None = None
    live_updated_at: str | None = None
    meta: dict[str, object] = field(default_factory=dict)


def _criterion_scores(record: ScreenerInputRecord) -> dict[str, float | None]:
    return {
        "market_cap": score_market_cap(record.min_mc_usd),
        "drawdown": score_drawdown(record.drawdown_ratio),
        "history": score_history(record.max_recovery_multiple),
        "supply": score_supply(record.adjusted_top10_pct),
        "pattern": score_pattern(record.pattern_phase, price_change_30d=record.price_change_30d),
        "onchain": score_onchain(
            funding_rate=record.funding_rate,
            oi_change_24h=record.oi_change_24h,
            long_short_ratio=record.long_short_ratio,
        ),
    }


def _weighted_score(
    scores: dict[str, float | None],
    weights: dict[str, float],
) -> tuple[float, float, list[str]]:
    weighted_sum = 0.0
    available_weight = 0.0
    missing: list[str] = []
    for name, weight in weights.items():
        value = scores.get(name)
        if value is None:
            missing.append(name)
            continue
        weighted_sum += float(value) * weight
        available_weight += weight
    score = weighted_sum / available_weight if available_weight > 0 else 0.0
    return round(score, 3), round(available_weight, 4), missing


def _override_flags(symbol: str, overrides: Iterable[ScreenerOverride]) -> tuple[bool, list[str]]:
    hard_filtered = False
    flags: list[str] = []
    symbol_upper = symbol.upper()
    for override in overrides:
        if override.scope == "symbol_blacklist" and override.target.upper() == symbol_upper and override.action == "exclude":
            hard_filtered = True
            flags.append("override_blacklist_exclude")
    return hard_filtered, flags


def build_listing_from_input(
    record: ScreenerInputRecord,
    *,
    run_id: str,
    previous_listing: ScreenerListing | None = None,
    overrides: Iterable[ScreenerOverride] = (),
) -> ScreenerListing:
    scores = _criterion_scores(record)
    structural_score, available_weight, missing_structural = _weighted_score(scores, STRUCTURAL_WEIGHTS)
    timing_score, _timing_weight, missing_timing = _weighted_score(scores, TIMING_WEIGHTS)

    hard_filtered = is_market_cap_hard_filtered(record.min_mc_usd) or is_drawdown_hard_filtered(record.drawdown_ratio)
    override_filtered, override_flags = _override_flags(record.symbol, overrides)
    hard_filtered = hard_filtered or override_filtered

    flags = list(override_flags)
    if record.pattern_phase:
        flags.append(f"phase_{record.pattern_phase.lower()}")
    if record.adjusted_top10_pct is not None and 50 < record.adjusted_top10_pct <= 80:
        flags.append("supply_concentrated_ok")

    meta = dict(record.meta)
    meta["criterion_scores"] = scores

    return build_listing(
        symbol=record.symbol,
        run_id=run_id,
        structural_score=structural_score,
        timing_score=timing_score,
        pattern_phase=record.pattern_phase,
        previous_grade=previous_listing.structural_grade if previous_listing else None,
        available_weight=available_weight,
        missing_criteria=missing_structural + missing_timing,
        hard_filtered=hard_filtered,
        grade_flags=flags,
        base_updated_at=record.base_updated_at,
        live_updated_at=record.live_updated_at,
        meta=meta,
    )


def run_screener(
    records: Iterable[ScreenerInputRecord],
    *,
    store: ScreenerStore,
    mode: str,
    started_at: str,
    completed_at: str,
) -> tuple[ScreenerRun, list[ScreenerListing]]:
    run = store.create_run(mode=mode, started_at=started_at)
    overrides = store.list_active_overrides(now_iso=started_at)
    listings: list[ScreenerListing] = []
    grade_counts: dict[str, int] = {"A": 0, "B": 0, "C": 0, "excluded": 0}
    symbols_considered = 0
    symbols_filtered_hard = 0

    for record in records:
        symbols_considered += 1
        previous = store.get_latest_listing(record.symbol)
        listing = build_listing_from_input(
            record,
            run_id=run.run_id,
            previous_listing=previous,
            overrides=overrides,
        )
        listings.append(listing)
        grade_counts[listing.structural_grade] = grade_counts.get(listing.structural_grade, 0) + 1
        if listing.hard_filtered:
            symbols_filtered_hard += 1

    store.replace_latest_listings(run.run_id, listings)
    completed = store.complete_run(
        run.run_id,
        completed_at=completed_at,
        symbols_considered=symbols_considered,
        symbols_scored=len(listings),
        symbols_filtered_hard=symbols_filtered_hard,
        grade_counts=grade_counts,
    )
    return completed, listings
