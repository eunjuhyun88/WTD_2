from __future__ import annotations

import pandas as pd
import pytest

from building_blocks.triggers.post_accumulation_range_breakout import (
    post_accumulation_range_breakout,
)
from patterns.library import TRADOOR_OI_REVERSAL
from patterns.replay import replay_pattern_frames
from patterns.state_machine import PatternStateMachine
from research.pattern_search import (
    BenchmarkCase,
    BenchmarkPackStore,
    build_search_variants,
    evaluate_variant_on_case,
)


@pytest.fixture(autouse=True)
def _no_supabase_record_store(monkeypatch: pytest.MonkeyPatch) -> None:
    """Prevent build_search_variants from hitting Supabase via LEDGER_RECORD_STORE."""
    from ledger.store import LedgerRecordStore
    monkeypatch.setattr("research.pattern_search.LEDGER_RECORD_STORE", LedgerRecordStore())


def test_post_accumulation_range_breakout_uses_local_prior_range(make_ctx) -> None:
    close = [100, 96, 95, 95.5, 96, 96.3, 96.6, 96.8, 97.0, 97.1, 99.0]
    ctx = make_ctx(
        close=close,
        overrides={
            "high": close,
            "low": [value * 0.997 for value in close],
        },
    )

    mask = post_accumulation_range_breakout(
        ctx,
        range_bars=6,
        min_range_bars=4,
        min_break_pct=0.01,
        max_range_pct=0.05,
    )

    assert bool(mask.iloc[-1])
    assert not bool(mask.iloc[-2])


def test_replay_requests_only_pattern_referenced_blocks(monkeypatch) -> None:
    idx = pd.date_range("2026-04-01", periods=3, freq="1h", tz="UTC")
    klines = pd.DataFrame(
        {
            "open": [10.0, 10.0, 10.0],
            "high": [10.0, 10.0, 10.0],
            "low": [9.0, 9.0, 9.0],
            "close": [10.0, 10.0, 10.0],
            "volume": [1000.0, 1000.0, 1000.0],
            "taker_buy_base_volume": [500.0, 500.0, 500.0],
        },
        index=idx,
    )
    features = pd.DataFrame({"funding_rate": [0.0, 0.0, 0.0]}, index=idx)
    requested: set[str] | None = None

    def fake_evaluate_block_masks(_features, _klines, _symbol, *, block_names=None, **kw):
        nonlocal requested
        requested = block_names
        return {
            "recent_decline": pd.Series([True, False, False], index=idx),
            "funding_extreme": pd.Series([True, False, False], index=idx),
        }

    monkeypatch.setattr("patterns.replay.evaluate_block_masks", fake_evaluate_block_masks)

    replay_pattern_frames(
        PatternStateMachine(TRADOOR_OI_REVERSAL),
        "PTBUSDT",
        features_df=features,
        klines_df=klines,
        lookback_bars=3,
    )

    assert requested is not None
    assert "breakout_after_accumulation" in requested
    assert "cot_large_spec_short" not in requested


def test_tradoor_breakout_uses_post_accumulation_trigger() -> None:
    breakout_phase = next(phase for phase in TRADOOR_OI_REVERSAL.phases if phase.phase_id == "BREAKOUT")
    assert "breakout_after_accumulation" in breakout_phase.required_blocks
    assert "breakout_from_pullback_range" not in breakout_phase.required_blocks


def test_default_benchmark_pack_includes_15m(tmp_path) -> None:
    pack = BenchmarkPackStore(tmp_path).ensure_default_pack("tradoor-oi-reversal-v1")
    assert pack.candidate_timeframes == ["15m", "1h", "4h"]


def test_search_variants_include_15m_and_breakout_axis() -> None:
    variants = build_search_variants(
        "tradoor-oi-reversal-v1",
        candidate_timeframes=["15m", "1h", "4h"],
    )
    slugs = {variant.variant_slug for variant in variants}

    assert any("__tf-15m" in slug for slug in slugs)
    assert "tradoor-oi-reversal-v1__breakout-range-soft" in slugs


def test_benchmark_case_missing_cache_is_scored_not_crashed() -> None:
    case = BenchmarkCase(
        symbol="NO_CACHE_USDT",
        timeframe="1h",
        start_at=pd.Timestamp("2026-04-01T00:00:00Z").to_pydatetime(),
        end_at=pd.Timestamp("2026-04-02T00:00:00Z").to_pydatetime(),
        expected_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP"],
    )

    result = evaluate_variant_on_case(TRADOOR_OI_REVERSAL, case, timeframe="1h")

    assert result.current_phase == "DATA_MISSING"
    assert result.score == 0.0
    assert result.failed_reason_counts
