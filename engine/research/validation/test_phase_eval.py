"""Unit tests for V-02 (W-0218) phase-conditional forward return.

Covers W-0218 §5 Exit Criteria + W-0225 §6.1 C-1 cost double-counting fix
verification. Tests mock ``_measure_forward_peak_return`` and
``load_klines`` so they run without the offline cache.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest

from research.validation.phase_eval import (
    PhaseConditionalReturn,
    _compute_return_at_horizon,
    measure_phase_conditional_return,
    measure_random_baseline,
)


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------


def _make_klines(n_bars: int = 200, start_price: float = 100.0) -> pd.DataFrame:
    """Synthetic 1h klines: linear price = start_price + 1 per bar."""
    start = datetime(2024, 1, 1)
    index = pd.DatetimeIndex(
        [start + timedelta(hours=i) for i in range(n_bars)]
    )
    closes = np.array([start_price + i for i in range(n_bars)], dtype=float)
    opens = closes - 0.5
    return pd.DataFrame(
        {
            "open": opens,
            "high": closes + 0.25,
            "low": opens - 0.25,
            "close": closes,
            "volume": np.full(n_bars, 1000.0),
        },
        index=index,
    )


def _flat_klines(n_bars: int = 200, price: float = 100.0) -> pd.DataFrame:
    """Synthetic flat klines (return at any horizon == 0%)."""
    start = datetime(2024, 1, 1)
    index = pd.DatetimeIndex(
        [start + timedelta(hours=i) for i in range(n_bars)]
    )
    return pd.DataFrame(
        {
            "open": np.full(n_bars, price),
            "high": np.full(n_bars, price),
            "low": np.full(n_bars, price),
            "close": np.full(n_bars, price),
            "volume": np.full(n_bars, 1000.0),
        },
        index=index,
    )


# A canonical fake _measure_forward_peak_return factory: returns a fake
# bound to a specific synthetic klines DataFrame so the V-02
# _compute_return_at_horizon path (which sees the mocked load_klines)
# and the fake measure use the same data.
def _make_fake_measure(klines: pd.DataFrame):
    def _fake_measure_impl(
        *,
        symbol,
        timeframe,
        entry_ts,
        horizon_bars,
        entry_slippage_pct=0.0,
    ):
        # Slippage MUST be 0.0 when called from V-02 (W-0225 C-1 fix).
        assert entry_slippage_pct == 0.0, (
            "V-02 must call _measure_forward_peak_return with "
            "entry_slippage_pct=0.0 (W-0225 §6.1 C-1)"
        )
        entry_mask = klines.index >= entry_ts
        if not entry_mask.any():
            return None, None, None, None
        entry_pos = int(np.asarray(entry_mask).nonzero()[0][0])
        forward = klines.iloc[entry_pos : entry_pos + horizon_bars + 1]
        if len(forward) < 2:
            return None, None, None, None
        entry_close = float(forward.iloc[0]["close"])
        peak = float(forward["close"].iloc[1:].max())
        paper_peak = (peak - entry_close) / entry_close * 100.0
        next_open = float(forward.iloc[1]["open"])
        realistic_peak = (peak - next_open) / next_open * 100.0
        return entry_close, paper_peak, next_open, realistic_peak

    return _fake_measure_impl


# Default fake bound to the default n_bars=200 synthetic klines. Tests
# using a non-default klines size should call ``_make_fake_measure(klines)``.
_fake_measure = _make_fake_measure(_make_klines())


# ---------------------------------------------------------------------------
# _compute_return_at_horizon helper
# ---------------------------------------------------------------------------


def test_compute_return_at_horizon_basic() -> None:
    """+1 per bar, h=4, entry_price=100 -> (104-100)/100*100 = 4.0%."""
    klines = _make_klines()
    entry_ts = klines.index[0]
    result = _compute_return_at_horizon(klines, entry_ts, 4, entry_price=100.0)
    assert result == pytest.approx(4.0)


def test_compute_return_at_horizon_overflow_returns_none() -> None:
    """h beyond cached window -> None."""
    klines = _make_klines(n_bars=10)
    entry_ts = klines.index[5]
    assert _compute_return_at_horizon(klines, entry_ts, 100, 100.0) is None


def test_compute_return_at_horizon_empty_klines_returns_none() -> None:
    assert _compute_return_at_horizon(pd.DataFrame(), datetime(2024, 1, 1), 4, 100.0) is None


def test_compute_return_at_horizon_zero_entry_price_returns_none() -> None:
    klines = _make_klines()
    assert _compute_return_at_horizon(klines, klines.index[0], 4, 0.0) is None


def test_compute_return_at_horizon_missing_close_column_returns_none() -> None:
    klines = pd.DataFrame(
        {"open": [1.0, 2.0]},
        index=pd.DatetimeIndex([datetime(2024, 1, 1), datetime(2024, 1, 1, 1)]),
    )
    assert _compute_return_at_horizon(klines, klines.index[0], 1, 1.0) is None


# ---------------------------------------------------------------------------
# argument validation
# ---------------------------------------------------------------------------


def test_horizon_hours_must_be_positive() -> None:
    with pytest.raises(ValueError, match="horizon_hours"):
        measure_phase_conditional_return(
            pattern_slug="p",
            phase_name="A",
            entry_timestamps=[],
            symbol="X",
            timeframe="1h",
            horizon_hours=0,
        )


def test_bars_per_hour_must_be_positive() -> None:
    with pytest.raises(ValueError, match="bars_per_hour"):
        measure_phase_conditional_return(
            pattern_slug="p",
            phase_name="A",
            entry_timestamps=[],
            symbol="X",
            timeframe="1h",
            horizon_hours=1,
            bars_per_hour=0,
        )


# ---------------------------------------------------------------------------
# empty / unusable input
# ---------------------------------------------------------------------------


def test_empty_entry_timestamps_returns_zero_n() -> None:
    """Edge: entry_timestamps=[] -> n_samples=0, no exception."""
    result = measure_phase_conditional_return(
        pattern_slug="p",
        phase_name="A",
        entry_timestamps=[],
        symbol="BTCUSDT",
        timeframe="1h",
        horizon_hours=4,
    )
    assert isinstance(result, PhaseConditionalReturn)
    assert result.n_samples == 0
    assert result.mean_return_pct == 0.0
    assert result.samples == ()
    assert result.mean_peak_return_pct is None
    assert result.realistic_mean_pct is None


def test_all_unusable_entries_returns_zero_n() -> None:
    """All entries fall outside cached window -> n_samples=0."""

    def all_none(**_kwargs):
        return None, None, None, None

    with patch(
        "research.validation.phase_eval._measure_forward_peak_return",
        side_effect=all_none,
    ), patch(
        "research.validation.phase_eval.load_klines",
        return_value=_make_klines(),
    ):
        result = measure_phase_conditional_return(
            pattern_slug="p",
            phase_name="A",
            entry_timestamps=[datetime(2099, 1, 1)],
            symbol="X",
            timeframe="1h",
            horizon_hours=4,
        )
    assert result.n_samples == 0


def test_load_klines_cache_miss_does_not_raise() -> None:
    """CacheMiss on klines -> empty result, no propagation."""
    from data_cache.loader import CacheMiss

    with patch(
        "research.validation.phase_eval.load_klines",
        side_effect=CacheMiss("missing"),
    ), patch(
        "research.validation.phase_eval._measure_forward_peak_return",
        side_effect=_fake_measure,
    ):
        # No klines -> _compute_return_at_horizon returns None for every
        # entry -> n_samples=0, even though _measure_forward_peak_return
        # produces peak data. M1 is defined by horizon-mean only.
        result = measure_phase_conditional_return(
            pattern_slug="p",
            phase_name="A",
            entry_timestamps=[datetime(2024, 1, 1)],
            symbol="X",
            timeframe="1h",
            horizon_hours=4,
        )
    assert result.n_samples == 0


# ---------------------------------------------------------------------------
# happy path + W-0225 C-1 cost fix verification
# ---------------------------------------------------------------------------


def test_happy_path_horizon_mean_zero_cost() -> None:
    """+1/bar synthetic, h=4, cost=0 -> realistic mean ~ 4 / next_open * 100."""
    klines = _make_klines()
    with patch(
        "research.validation.phase_eval._measure_forward_peak_return",
        side_effect=_fake_measure,
    ), patch(
        "research.validation.phase_eval.load_klines",
        return_value=klines,
    ):
        result = measure_phase_conditional_return(
            pattern_slug="p",
            phase_name="A",
            entry_timestamps=[klines.index[0]],
            symbol="X",
            timeframe="1h",
            horizon_hours=4,
            cost_bps=0.0,
        )
    # entry_next_open = open[1] = (close[1] - 0.5) = 100.5; close[4] = 104.
    # return_at_h = (104 - 100.5) / 100.5 * 100 ~= 3.4826%
    assert result.n_samples == 1
    assert result.mean_return_pct == pytest.approx(
        (104.0 - 100.5) / 100.5 * 100.0, rel=1e-6
    )
    # cost=0 -> samples == raw return
    assert result.samples[0] == pytest.approx(result.mean_return_pct, rel=1e-9)


def test_c1_cost_fix_no_double_counting() -> None:
    """W-0225 §6.1 C-1: cost_bps=15 must subtract exactly 15bps (= 0.15%).

    With entry_slippage_pct=0.0 (V-02 fix), the synthetic horizon return
    is unchanged from the zero-cost case. Then cost_bps=15 -> 0.15% off.
    If the bug were present (slippage 0.05 in entry_next_open + cost_bps
    15), total reduction would be ~5bps + 15bps = 20bps.
    """
    klines = _make_klines()
    with patch(
        "research.validation.phase_eval._measure_forward_peak_return",
        side_effect=_fake_measure,
    ), patch(
        "research.validation.phase_eval.load_klines",
        return_value=klines,
    ):
        zero_cost = measure_phase_conditional_return(
            pattern_slug="p",
            phase_name="A",
            entry_timestamps=[klines.index[0]],
            symbol="X",
            timeframe="1h",
            horizon_hours=4,
            cost_bps=0.0,
        )
        full_cost = measure_phase_conditional_return(
            pattern_slug="p",
            phase_name="A",
            entry_timestamps=[klines.index[0]],
            symbol="X",
            timeframe="1h",
            horizon_hours=4,
            cost_bps=15.0,
        )
    # The delta between the two is exactly cost_bps/100 = 0.15 percent.
    delta = zero_cost.mean_return_pct - full_cost.mean_return_pct
    assert delta == pytest.approx(0.15, rel=1e-9, abs=1e-9), (
        f"C-1 violated: cost_bps=15 should reduce return by exactly 0.15%, "
        f"got {delta}. If this is ~0.20% the slippage double-count is back."
    )


def test_c1_fix_passes_zero_slippage_to_pattern_search() -> None:
    """V-02 must NOT pass entry_slippage_pct != 0.0 (W-0225 §6.1 Option A).

    The fake checks ``entry_slippage_pct == 0.0`` via assert; the test
    here pins the contract by ensuring _fake_measure was actually invoked.
    """
    klines = _make_klines()
    calls = []

    def recording_measure(**kwargs):
        calls.append(kwargs)
        return _fake_measure(**kwargs)

    with patch(
        "research.validation.phase_eval._measure_forward_peak_return",
        side_effect=recording_measure,
    ), patch(
        "research.validation.phase_eval.load_klines",
        return_value=klines,
    ):
        measure_phase_conditional_return(
            pattern_slug="p",
            phase_name="A",
            entry_timestamps=[klines.index[0], klines.index[5]],
            symbol="X",
            timeframe="1h",
            horizon_hours=4,
            cost_bps=15.0,
        )
    assert len(calls) == 2
    for call in calls:
        assert call["entry_slippage_pct"] == 0.0


def test_three_horizons_all_compute() -> None:
    """W-0214 §3.2 spec horizons {1, 4, 24} all produce non-zero n_samples."""
    klines = _make_klines(n_bars=300)
    with patch(
        "research.validation.phase_eval._measure_forward_peak_return",
        side_effect=_make_fake_measure(klines),
    ), patch(
        "research.validation.phase_eval.load_klines",
        return_value=klines,
    ):
        for h in (1, 4, 24):
            r = measure_phase_conditional_return(
                pattern_slug="p",
                phase_name="A",
                entry_timestamps=[klines.index[10]],
                symbol="X",
                timeframe="1h",
                horizon_hours=h,
                cost_bps=15.0,
            )
            assert r.n_samples == 1, f"horizon={h} produced no sample"
            assert r.horizon_hours == h


def test_flat_market_zero_return_minus_cost() -> None:
    """Flat klines: raw return=0, cost=15bps -> mean = -0.15%."""
    klines = _flat_klines()

    def fake_flat(**kwargs):
        slip = kwargs.get("entry_slippage_pct", 0.0)
        assert slip == 0.0
        # entry_close=price, peak=price, next_open=price -> 0 returns
        return 100.0, 0.0, 100.0, 0.0

    with patch(
        "research.validation.phase_eval._measure_forward_peak_return",
        side_effect=fake_flat,
    ), patch(
        "research.validation.phase_eval.load_klines",
        return_value=klines,
    ):
        r = measure_phase_conditional_return(
            pattern_slug="p",
            phase_name="A",
            entry_timestamps=[klines.index[0]],
            symbol="X",
            timeframe="1h",
            horizon_hours=4,
            cost_bps=15.0,
        )
    assert r.n_samples == 1
    assert r.mean_return_pct == pytest.approx(-0.15, abs=1e-9)
    assert r.mean_peak_return_pct == pytest.approx(-0.15, abs=1e-9)
    assert r.realistic_mean_pct == pytest.approx(-0.15, abs=1e-9)


def test_multiple_entries_aggregate_stats() -> None:
    """Multiple entries -> mean/median/std/min/max all populated correctly."""
    klines = _make_klines(n_bars=300)
    entries = [klines.index[i] for i in (0, 50, 100, 150, 200)]
    with patch(
        "research.validation.phase_eval._measure_forward_peak_return",
        side_effect=_make_fake_measure(klines),
    ), patch(
        "research.validation.phase_eval.load_klines",
        return_value=klines,
    ):
        r = measure_phase_conditional_return(
            pattern_slug="p",
            phase_name="A",
            entry_timestamps=entries,
            symbol="X",
            timeframe="1h",
            horizon_hours=4,
            cost_bps=0.0,
        )
    assert r.n_samples == 5
    arr = np.asarray(r.samples)
    assert r.mean_return_pct == pytest.approx(float(arr.mean()))
    assert r.median_return_pct == pytest.approx(float(np.median(arr)))
    assert r.std_return_pct == pytest.approx(float(arr.std()))
    assert r.min_return_pct == pytest.approx(float(arr.min()))
    assert r.max_return_pct == pytest.approx(float(arr.max()))


def test_partial_data_skips_unusable_entries() -> None:
    """Some entries unusable, some usable -> only usable counted."""
    klines = _make_klines(n_bars=20)

    def mixed_measure(**kwargs):
        slip = kwargs.get("entry_slippage_pct", 0.0)
        assert slip == 0.0
        ts = kwargs["entry_ts"]
        # Reject the first entry, accept the rest.
        if ts == klines.index[0]:
            return None, None, None, None
        return _fake_measure(**kwargs)

    entries = [klines.index[0], klines.index[1], klines.index[2]]
    with patch(
        "research.validation.phase_eval._measure_forward_peak_return",
        side_effect=mixed_measure,
    ), patch(
        "research.validation.phase_eval.load_klines",
        return_value=klines,
    ):
        r = measure_phase_conditional_return(
            pattern_slug="p",
            phase_name="A",
            entry_timestamps=entries,
            symbol="X",
            timeframe="1h",
            horizon_hours=4,
            cost_bps=0.0,
        )
    assert r.n_samples == 2


def test_result_is_frozen_dataclass() -> None:
    """PhaseConditionalReturn is immutable (frozen=True)."""
    r = measure_phase_conditional_return(
        pattern_slug="p",
        phase_name="A",
        entry_timestamps=[],
        symbol="X",
        timeframe="1h",
        horizon_hours=4,
    )
    with pytest.raises(Exception):  # FrozenInstanceError
        r.n_samples = 5  # type: ignore[misc]


# ---------------------------------------------------------------------------
# samples tuple is frozen / B0 baseline
# ---------------------------------------------------------------------------


def test_samples_is_immutable_tuple() -> None:
    """samples field is a tuple (frozen for B0 comparison)."""
    klines = _make_klines()
    with patch(
        "research.validation.phase_eval._measure_forward_peak_return",
        side_effect=_fake_measure,
    ), patch(
        "research.validation.phase_eval.load_klines",
        return_value=klines,
    ):
        r = measure_phase_conditional_return(
            pattern_slug="p",
            phase_name="A",
            entry_timestamps=[klines.index[0]],
            symbol="X",
            timeframe="1h",
            horizon_hours=4,
            cost_bps=0.0,
        )
    assert isinstance(r.samples, tuple)
    assert len(r.samples) == r.n_samples


def test_random_baseline_zero_samples_returns_empty() -> None:
    r = measure_random_baseline(
        n_samples=0,
        symbol="X",
        timeframe="1h",
        horizon_hours=4,
    )
    assert r.n_samples == 0
    assert r.pattern_slug == "__random__"
    assert r.phase_name == "random"


def test_random_baseline_runs_with_klines() -> None:
    """B0 baseline draws random timestamps and runs the measure."""
    klines = _make_klines(n_bars=100)
    with patch(
        "research.validation.phase_eval.load_klines",
        return_value=klines,
    ), patch(
        "research.validation.phase_eval._measure_forward_peak_return",
        side_effect=_fake_measure,
    ):
        r = measure_random_baseline(
            n_samples=10,
            symbol="X",
            timeframe="1h",
            horizon_hours=4,
            cost_bps=15.0,
            seed=7,
        )
    assert r.pattern_slug == "__random__"
    assert r.phase_name == "random"
    assert r.cost_bps == 15.0
    # Should have produced some samples (not all should fall in the
    # forbidden last-h bars window).
    assert r.n_samples > 0


def test_random_baseline_deterministic_seed() -> None:
    """Same seed -> same samples (reproducible B0)."""
    klines = _make_klines(n_bars=100)
    with patch(
        "research.validation.phase_eval.load_klines",
        return_value=klines,
    ), patch(
        "research.validation.phase_eval._measure_forward_peak_return",
        side_effect=_fake_measure,
    ):
        a = measure_random_baseline(
            n_samples=5, symbol="X", timeframe="1h",
            horizon_hours=4, cost_bps=0.0, seed=123,
        )
        b = measure_random_baseline(
            n_samples=5, symbol="X", timeframe="1h",
            horizon_hours=4, cost_bps=0.0, seed=123,
        )
    assert a.samples == b.samples


def test_random_baseline_cache_miss() -> None:
    """B0 with no klines cache -> empty result."""
    from data_cache.loader import CacheMiss

    with patch(
        "research.validation.phase_eval.load_klines",
        side_effect=CacheMiss("no cache"),
    ):
        r = measure_random_baseline(
            n_samples=10,
            symbol="X",
            timeframe="1h",
            horizon_hours=4,
        )
    assert r.n_samples == 0


# ---------------------------------------------------------------------------
# performance budget (W-0218 §5: <2s per (pattern, horizon) on 1y 1h bar)
# ---------------------------------------------------------------------------


def test_performance_budget_200_entries_under_2s() -> None:
    """200 entries should complete well under 2s with mocked I/O."""
    klines = _make_klines(n_bars=500)
    entries = [klines.index[i] for i in range(200)]
    with patch(
        "research.validation.phase_eval._measure_forward_peak_return",
        side_effect=_make_fake_measure(klines),
    ), patch(
        "research.validation.phase_eval.load_klines",
        return_value=klines,
    ):
        start = time.perf_counter()
        r = measure_phase_conditional_return(
            pattern_slug="p",
            phase_name="A",
            entry_timestamps=entries,
            symbol="X",
            timeframe="1h",
            horizon_hours=4,
            cost_bps=15.0,
        )
        elapsed = time.perf_counter() - start
    assert r.n_samples == 200
    assert elapsed < 2.0, f"perf budget violated: {elapsed:.3f}s"
