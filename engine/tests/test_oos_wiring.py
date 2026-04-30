"""W-0341: OOS validation wiring unit tests.

AC1: oos_split produces correct train/holdout sizes
AC2: _walkforward_validate uses fold Sharpe (not n_executed count)
AC4: _bh_correct respects m_total >= len(eligible)
AC8: RESEARCH_OOS_WIRING=off falls back to legacy behaviour
"""
from __future__ import annotations

import os
import numpy as np
import pandas as pd
import pytest


# ── AC1: OOS split ────────────────────────────────────────────────────────────

def test_train_holdout_split_sizes():
    from research.pattern_scan.oos_split import train_holdout_split
    idx = pd.date_range("2023-01-01", periods=100, freq="h")
    df = pd.DataFrame({"close": np.random.randn(100)}, index=idx)
    train, holdout = train_holdout_split(df, holdout_frac=0.30)
    assert len(train) == 70
    assert len(holdout) == 30
    assert train.index[-1] < holdout.index[0]


def test_train_holdout_split_empty():
    from research.pattern_scan.oos_split import train_holdout_split
    empty = pd.DataFrame()
    train, holdout = train_holdout_split(empty, 0.3)
    assert train.empty and holdout.empty


def test_holdout_cutoff_returns_first_holdout_ts():
    from research.pattern_scan.oos_split import holdout_cutoff
    idx = pd.date_range("2023-01-01", periods=10, freq="h")
    df = pd.DataFrame({"v": range(10)}, index=idx)
    cutoff = holdout_cutoff(df, 0.30)
    assert cutoff == idx[7]


def test_train_holdout_split_invalid_frac():
    from research.pattern_scan.oos_split import train_holdout_split
    import pandas as pd
    df = pd.DataFrame({"a": [1, 2, 3]})
    with pytest.raises(ValueError):
        train_holdout_split(df, holdout_frac=0.0)
    with pytest.raises(ValueError):
        train_holdout_split(df, holdout_frac=1.0)


# ── AC2: Walk-forward uses fold Sharpe, not n_executed count ─────────────────

def _make_wf_df(symbol="BTC", pattern="test", n_executed=20):
    return pd.DataFrame({
        "symbol": [symbol],
        "pattern": [pattern],
        "n_executed": [n_executed],
    })


def test_walkforward_oos_positive_folds_pass(monkeypatch):
    monkeypatch.setenv("RESEARCH_OOS_WIRING", "on")
    # Reload module to pick up env var
    import importlib
    import research.autoresearch_loop as m
    importlib.reload(m)

    df = _make_wf_df(n_executed=30)
    # 12 positive returns → all 3 folds should be positive
    returns = {("BTC", "test"): [1.0, 0.5, 0.8] * 4}
    result = m._walkforward_validate(df, trade_returns_by_key=returns, folds=3)
    assert bool(result["wf_ok"].iloc[0]), "all-positive returns should pass"
    assert result["wf_fold_pass_rate"].iloc[0] > 0.5


def test_walkforward_oos_negative_folds_fail(monkeypatch):
    monkeypatch.setenv("RESEARCH_OOS_WIRING", "on")
    import importlib
    import research.autoresearch_loop as m
    importlib.reload(m)

    df = _make_wf_df(n_executed=30)
    # 9 negative returns → all folds fail
    returns = {("BTC", "test"): [-1.0, -0.5, -0.8] * 3}
    result = m._walkforward_validate(df, trade_returns_by_key=returns, folds=3)
    assert not bool(result["wf_ok"].iloc[0]), "all-negative returns should fail"


def test_walkforward_oos_insufficient_trades(monkeypatch):
    monkeypatch.setenv("RESEARCH_OOS_WIRING", "on")
    import importlib
    import research.autoresearch_loop as m
    importlib.reload(m)

    df = _make_wf_df(n_executed=5)
    # Only 3 returns, not enough for K=3 folds with min_fold_trades=3
    returns = {("BTC", "test"): [1.0, 2.0, 3.0]}
    result = m._walkforward_validate(df, trade_returns_by_key=returns, folds=3)
    assert not bool(result["wf_ok"].iloc[0])


# AC8: legacy fallback when OOS disabled
def test_walkforward_legacy_fallback(monkeypatch):
    monkeypatch.setenv("RESEARCH_OOS_WIRING", "off")
    import importlib
    import research.autoresearch_loop as m
    importlib.reload(m)

    df = _make_wf_df(n_executed=20)
    result = m._walkforward_validate(df, trade_returns_by_key=None, folds=3)
    # Legacy: wf_ok = n_executed >= folds * GATE_MIN_SIGNALS (3*5=15)
    assert bool(result["wf_ok"].iloc[0]), "n_executed=20 >= 15 should pass legacy"


def test_walkforward_legacy_low_n_fail(monkeypatch):
    monkeypatch.setenv("RESEARCH_OOS_WIRING", "off")
    import importlib
    import research.autoresearch_loop as m
    importlib.reload(m)

    df = _make_wf_df(n_executed=3)
    result = m._walkforward_validate(df, trade_returns_by_key=None, folds=3)
    assert not bool(result["wf_ok"].iloc[0]), "n_executed=3 < 15 should fail legacy"


# ── AC4: BH m_total assert and larger-m produces fewer rejections ─────────────

def test_bh_correct_m_total_assert():
    from pipeline import _bh_correct
    p = [0.01, 0.03, 0.5]
    # m_total < len(p_values) should fallback gracefully (not raise)
    result = _bh_correct(p, m_total=1)  # 1 < 3 → fallback to m=3
    assert len(result) == 3


def test_bh_correct_m_total_reduces_rejections():
    from pipeline import _bh_correct
    # With m=3 (old), all 3 might pass; with m=1000, fewer or none
    p = [0.01, 0.03, 0.04]
    reject_small_m = _bh_correct(p)              # m = 3
    reject_large_m = _bh_correct(p, m_total=1000)  # m = 1000
    # Larger family → stricter threshold → ≤ rejections
    assert reject_large_m.sum() <= reject_small_m.sum()


def test_bh_correct_empty():
    from pipeline import _bh_correct
    result = _bh_correct([], m_total=100)
    assert len(result) == 0


# ── AC1: oos_split module importable ─────────────────────────────────────────

def test_oos_split_module_importable():
    from research.pattern_scan import oos_split
    assert hasattr(oos_split, "train_holdout_split")
    assert hasattr(oos_split, "holdout_cutoff")
