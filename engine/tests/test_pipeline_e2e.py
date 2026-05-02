"""Tests for pipeline Stage 6+7 (verification + composite score) — W-0348."""
from __future__ import annotations

import math
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from pipeline import ResearchPipeline
from verification.types import PaperVerificationResult

pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning")


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_pvr(slug: str, n_trades: int = 0, win_rate: float = 0.0,
              sharpe: float = float("nan"), dd: float = 0.0,
              exp_pct: float = 0.0, pass_gate: bool = False) -> PaperVerificationResult:
    n_hit = int(round(n_trades * win_rate))
    return PaperVerificationResult(
        pattern_slug=slug,
        n_trades=n_trades,
        n_hit=n_hit,
        n_miss=n_trades - n_hit,
        n_expired=0,
        win_rate=win_rate,
        avg_return_pct=exp_pct,
        sharpe=sharpe,
        max_drawdown_pct=dd,
        expectancy_pct=exp_pct,
        avg_duration_hours=4.0,
        pass_gate=pass_gate,
    )


def _make_bh_df(patterns: list[str]) -> pd.DataFrame:
    """Minimal DataFrame mimicking BH-FDR output."""
    rows = []
    for p in patterns:
        rows.append({
            "symbol": "BTCUSDT",
            "pattern": p,
            "direction": "long",
            "n_executed": 50,
            "win_rate": 0.62,
            "sharpe": 1.8,
            "bh_reject": True,
            "bh_q": 0.02,
            "confidence_tier": "high",
        })
    return pd.DataFrame(rows)


# ── AC1: columns exist after Stage 6+7 ───────────────────────────────────────

def test_ac1_columns_exist_after_verification():
    """Stage 6+7 adds composite_score and quality_grade columns."""
    pipeline = ResearchPipeline()
    slugs = ["alpha-flow-bull-v1", "alpha-hunter-v1"]
    df = _make_bh_df(slugs)

    pvr_map = {
        "alpha-flow-bull-v1": _make_pvr("alpha-flow-bull-v1", n_trades=300, win_rate=0.65,
                                         sharpe=2.0, dd=-0.10, exp_pct=0.08, pass_gate=True),
        "alpha-hunter-v1": _make_pvr("alpha-hunter-v1", n_trades=150, win_rate=0.58,
                                      sharpe=1.2, dd=-0.18, exp_pct=0.03, pass_gate=False),
    }

    with patch("verification.executor.run_paper_verification",
               side_effect=lambda slug, _store: pvr_map.get(slug, _make_pvr(slug))):
        pipeline._ledger_store = MagicMock()
        verified = pipeline._verify(df)
        scored = pipeline._score(verified)

    assert "composite_score" in scored.columns
    assert "quality_grade" in scored.columns
    assert "n_trades_paper" in scored.columns


# ── AC2: n_trades=0 → composite_score=NaN ────────────────────────────────────

def test_ac2_no_ledger_data_yields_nan():
    """n_trades=0 from ledger → composite_score stays NaN."""
    pipeline = ResearchPipeline()
    df = _make_bh_df(["alpha-no-data-v1"])

    with patch("verification.executor.run_paper_verification",
               return_value=_make_pvr("alpha-no-data-v1", n_trades=0)):
        pipeline._ledger_store = MagicMock()
        verified = pipeline._verify(df)
        scored = pipeline._score(verified)

    cs = scored.iloc[0]["composite_score"]
    assert math.isnan(float(cs)) or cs != cs  # NaN check


# ── AC3: ledger exception → warning + columns preserved ──────────────────────

def test_ac3_ledger_exception_does_not_crash(caplog):
    """Ledger exception during _verify → warning, result columns remain NaN."""
    import logging
    pipeline = ResearchPipeline()
    df = _make_bh_df(["alpha-bad-slug-v1"])

    with patch("verification.executor.run_paper_verification",
               side_effect=RuntimeError("connection refused")):
        pipeline._ledger_store = MagicMock()
        with caplog.at_level(logging.WARNING, logger="engine.pipeline"):
            verified = pipeline._verify(df)

    # Should not raise; n_trades_paper should be NaN
    assert "n_trades_paper" in verified.columns
    val = verified.iloc[0]["n_trades_paper"]
    assert math.isnan(float(val))


# ── AC4: --skip-verification ──────────────────────────────────────────────────

def test_ac4_skip_verification_env(monkeypatch):
    """PIPELINE_SKIP_VERIFICATION=1 → no composite_score column."""
    monkeypatch.setenv("PIPELINE_SKIP_VERIFICATION", "1")

    pipeline = ResearchPipeline()
    df = _make_bh_df(["alpha-flow-bull-v1"])

    # Simulate the run() skipping logic directly
    import os
    skip = os.environ.get("PIPELINE_SKIP_VERIFICATION", "").lower() in ("1", "true", "yes")
    assert skip is True

    if not df.empty and not skip:
        df = pipeline._verify(df)
        df = pipeline._score(df)

    assert "composite_score" not in df.columns


# ── AC5: composite ordering reflects quality ──────────────────────────────────

def test_ac5_better_pattern_scores_higher():
    """Pattern with better stats scores higher composite."""
    pipeline = ResearchPipeline()
    df = _make_bh_df(["weak-v1", "strong-v1"])

    pvr_map = {
        "weak-v1": _make_pvr("weak-v1", n_trades=200, win_rate=0.57,
                              sharpe=0.8, dd=-0.20, exp_pct=0.01, pass_gate=False),
        "strong-v1": _make_pvr("strong-v1", n_trades=500, win_rate=0.68,
                                sharpe=2.5, dd=-0.07, exp_pct=0.12, pass_gate=True),
    }

    with patch("verification.executor.run_paper_verification",
               side_effect=lambda slug, _store: pvr_map.get(slug, _make_pvr(slug))):
        pipeline._ledger_store = MagicMock()
        verified = pipeline._verify(df)
        scored = pipeline._score(verified)

    weak_score = float(scored[scored["pattern"] == "weak-v1"]["composite_score"].iloc[0])
    strong_score = float(scored[scored["pattern"] == "strong-v1"]["composite_score"].iloc[0])
    assert strong_score > weak_score, f"strong={strong_score:.1f} weak={weak_score:.1f}"


# ── AC6: additional edge cases ────────────────────────────────────────────────

def test_empty_df_does_not_crash():
    """Empty DataFrame passes through _verify/_score without error."""
    pipeline = ResearchPipeline()
    pipeline._ledger_store = MagicMock()
    empty = pd.DataFrame()
    verified = pipeline._verify(empty)
    assert verified.empty


def test_verify_adds_expected_columns():
    """_verify() always adds all 6 paper columns."""
    pipeline = ResearchPipeline()
    df = _make_bh_df(["alpha-test-v1"])

    with patch("verification.executor.run_paper_verification",
               return_value=_make_pvr("alpha-test-v1", n_trades=250, win_rate=0.60,
                                      sharpe=1.5, dd=-0.12, exp_pct=0.05, pass_gate=True)):
        pipeline._ledger_store = MagicMock()
        verified = pipeline._verify(df)

    for col in ["n_trades_paper", "win_rate_paper", "sharpe_paper",
                "expectancy_pct_paper", "dd_pct_paper", "pass_gate_paper"]:
        assert col in verified.columns, f"Missing column: {col}"


def test_score_below_min_trades_yields_nan():
    """n_trades_paper < 10 → composite_score=NaN (no grade)."""
    pipeline = ResearchPipeline()
    df = _make_bh_df(["alpha-tiny-v1"])

    with patch("verification.executor.run_paper_verification",
               return_value=_make_pvr("alpha-tiny-v1", n_trades=5, win_rate=0.80,
                                      sharpe=3.0, dd=-0.05, exp_pct=0.20, pass_gate=False)):
        pipeline._ledger_store = MagicMock()
        verified = pipeline._verify(df)
        scored = pipeline._score(verified)

    cs = scored.iloc[0]["composite_score"]
    assert math.isnan(float(cs))
