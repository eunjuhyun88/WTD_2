from __future__ import annotations

from datetime import timezone

import pandas as pd

from research.market_retrieval import run_pattern_market_search
from research.pattern_search import BenchmarkCase, VariantCaseResult


def _make_frames(
    prices: list[float],
    *,
    vol_zscore: list[float] | None = None,
    funding_rate: list[float] | None = None,
    oi_change_1h: list[float] | None = None,
    oi_change_24h: list[float] | None = None,
    long_short_ratio: list[float] | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    index = pd.date_range("2026-04-01T00:00:00Z", periods=len(prices), freq="1h", tz="UTC")
    klines = pd.DataFrame(
        {
            "open": prices,
            "high": [price * 1.02 for price in prices],
            "low": [price * 0.98 for price in prices],
            "close": prices,
            "volume": [1000.0] * len(prices),
            "taker_buy_base_volume": [500.0] * len(prices),
        },
        index=index,
    )
    features = pd.DataFrame(
        {
            "vol_zscore": vol_zscore or [0.0] * len(prices),
            "rsi14": [40.0 + idx * 4.0 for idx in range(len(prices))],
            "bb_width": [0.1] * len(prices),
            "funding_rate": funding_rate or [0.0] * len(prices),
            "oi_change_1h": oi_change_1h or [0.0] * len(prices),
            "oi_change_24h": oi_change_24h or [0.0] * len(prices),
            "long_short_ratio": long_short_ratio or [1.0] * len(prices),
            "taker_buy_ratio_1h": [0.5] * len(prices),
        },
        index=index,
    )
    return klines, features


def test_market_search_prefers_similar_window_and_reranks_top_n(monkeypatch) -> None:
    reference_klines, reference_features = _make_frames(
        [100, 95, 90, 93, 97, 110],
        vol_zscore=[0.0, 0.5, 1.5, 0.8, 0.2, 1.0],
        funding_rate=[-0.002, -0.002, -0.003, -0.001, 0.0, 0.001],
        oi_change_1h=[0.0, 0.02, 0.08, 0.03, 0.01, 0.06],
        oi_change_24h=[0.0, 0.03, 0.09, 0.05, 0.02, 0.08],
        long_short_ratio=[0.95, 0.94, 0.92, 0.94, 0.97, 1.01],
    )
    similar_klines, similar_features = _make_frames(
        [50, 47, 44, 45, 48, 54],
        vol_zscore=[0.0, 0.4, 1.4, 0.7, 0.3, 1.1],
        funding_rate=[-0.002, -0.002, -0.0025, -0.001, 0.0, 0.001],
        oi_change_1h=[0.0, 0.02, 0.07, 0.02, 0.01, 0.05],
        oi_change_24h=[0.0, 0.02, 0.08, 0.04, 0.02, 0.07],
        long_short_ratio=[0.96, 0.95, 0.93, 0.95, 0.98, 1.0],
    )
    different_klines, different_features = _make_frames(
        [100, 103, 106, 109, 112, 115],
        vol_zscore=[0.0] * 6,
        funding_rate=[0.003] * 6,
        oi_change_1h=[0.0] * 6,
        oi_change_24h=[0.0] * 6,
        long_short_ratio=[1.1] * 6,
    )

    reference_case = BenchmarkCase(
        symbol="REFUSDT",
        timeframe="1h",
        start_at=reference_klines.index[0].to_pydatetime(),
        end_at=reference_klines.index[-1].to_pydatetime(),
        expected_phase_path=["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP", "ACCUMULATION"],
        role="reference",
    )

    frames = {
        "REFUSDT": (reference_klines, reference_features),
        "SIMUSDT": (similar_klines, similar_features),
        "DIFFUSDT": (different_klines, different_features),
    }

    from research import market_retrieval

    monkeypatch.setattr(market_retrieval, "_pick_reference_case", lambda pattern_slug, benchmark_pack_id=None: reference_case)
    monkeypatch.setattr(market_retrieval, "_load_symbol_frames", lambda symbol, timeframe: frames[symbol])
    monkeypatch.setattr(market_retrieval, "list_cached_symbols", lambda require_perp=False: ["REFUSDT", "SIMUSDT", "DIFFUSDT"])
    monkeypatch.setattr(market_retrieval, "resolve_live_variant_slug", lambda pattern_slug, variant_slug=None: "resolved-variant")
    monkeypatch.setattr(
        market_retrieval,
        "build_variant_pattern",
        lambda pattern_slug, variant: type("Pattern", (), {"phases": [], "entry_phase": "ACCUMULATION", "target_phase": "BREAKOUT"})(),
    )

    replay_calls: list[str] = []

    def fake_evaluate_variant_on_case(pattern, case, *, timeframe, warmup_bars=240):
        replay_calls.append(case.symbol)
        return VariantCaseResult(
            case_id=case.case_id,
            symbol=case.symbol,
            role=case.role,
            observed_phase_path=["ARCH_ZONE", "REAL_DUMP", "ACCUMULATION"] if case.symbol == "SIMUSDT" else ["ARCH_ZONE"],
            current_phase="ACCUMULATION" if case.symbol == "SIMUSDT" else "ARCH_ZONE",
            phase_fidelity=0.8 if case.symbol == "SIMUSDT" else 0.2,
            phase_depth_progress=0.8 if case.symbol == "SIMUSDT" else 0.2,
            entry_hit=case.symbol == "SIMUSDT",
            target_hit=False,
            lead_bars=None,
            score=0.9 if case.symbol == "SIMUSDT" else 0.1,
        )

    monkeypatch.setattr(market_retrieval, "evaluate_variant_on_case", fake_evaluate_variant_on_case)

    result = run_pattern_market_search(
        pattern_slug="tradoor-oi-reversal-v1",
        timeframe="1h",
        top_k=2,
        replay_top_k=1,
        history_bars=24,
        stride_bars=1,
    )

    assert result.variant_slug == "resolved-variant"
    assert [candidate.symbol for candidate in result.candidates] == ["SIMUSDT", "DIFFUSDT"]
    assert result.candidates[0].retrieval_rank == 1
    assert result.candidates[0].replay_score == 0.9
    assert result.candidates[0].entry_hit is True
    assert result.candidates[1].replay_score is None
    assert replay_calls == ["SIMUSDT"]


def test_market_search_rejects_non_1h_timeframe() -> None:
    try:
        run_pattern_market_search(pattern_slug="tradoor-oi-reversal-v1", timeframe="15m")
    except ValueError as exc:
        assert "timeframe='1h'" in str(exc)
    else:
        raise AssertionError("Expected ValueError for non-1h retrieval timeframe")
