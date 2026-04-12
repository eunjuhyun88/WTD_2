"""Tests for D15 regime filter wiring + tools/regime_analysis.py logic."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pandas as pd
import pytest

_REPO = Path(__file__).resolve().parent.parent.parent
_TOOLS = _REPO / "tools"
if str(_TOOLS) not in sys.path:
    sys.path.insert(0, str(_TOOLS))
_COGOCHI = _REPO / "cogochi-autoresearch"
if str(_COGOCHI) not in sys.path:
    sys.path.insert(0, str(_COGOCHI))

from backtest.config import RiskConfig  # noqa: E402
from backtest.regime import Regime  # noqa: E402
from exceptions import ConfigValidationError  # noqa: E402
from regime_analysis import compute_verdict, FILTER_CONFIGS  # noqa: E402


# ---------------------------------------------------------------------------
# RiskConfig.regime_skip validation
# ---------------------------------------------------------------------------


class TestRiskConfigRegimeSkip:
    def test_default_is_empty(self) -> None:
        cfg = RiskConfig()
        assert cfg.regime_skip == ()

    def test_valid_regime_skip(self) -> None:
        cfg = RiskConfig(regime_skip=("bear",))
        cfg.validate()
        assert cfg.regime_skip == ("bear",)

    def test_multiple_regimes(self) -> None:
        cfg = RiskConfig(regime_skip=("bear", "chop"))
        cfg.validate()
        assert "bear" in cfg.regime_skip
        assert "chop" in cfg.regime_skip

    def test_invalid_regime_raises(self) -> None:
        cfg = RiskConfig(regime_skip=("moon",))
        with pytest.raises(ConfigValidationError, match="moon"):
            cfg.validate()

    def test_content_hash_changes_with_regime_skip(self) -> None:
        a = RiskConfig()
        b = RiskConfig(regime_skip=("bear",))
        assert a.content_hash() != b.content_hash()


# ---------------------------------------------------------------------------
# Verdict logic
# ---------------------------------------------------------------------------


def _make_row(
    config: str = "all",
    exp: float = 0.024,
    mdd: float = -0.073,
    passed: bool = True,
) -> dict[str, Any]:
    return {
        "config": config,
        "regime_skip": "none",
        "n_executed": 300,
        "n_blocked": 30,
        "expectancy_pct": exp,
        "win_rate": 0.55,
        "profit_factor": 2.0,
        "max_drawdown_pct": mdd,
        "sortino": 1.5,
        "calmar": 0.5,
        "sharpe": 1.0,
        "tail_ratio": 1.2,
        "stage_1_passed": passed,
        "failure_reasons": "",
        "final_equity": 12000.0,
        "block_regime_bear": 0,
        "block_regime_chop": 0,
    }


class TestComputeVerdict:
    def test_no_improvement(self) -> None:
        rows = [
            _make_row("all", exp=0.024, mdd=-0.073),
            _make_row("bear_skip", exp=0.025, mdd=-0.070),
        ]
        v = compute_verdict(rows)
        assert v["verdict"] == "NO_IMPROVEMENT"

    def test_exp_improvement_passes_gate(self) -> None:
        rows = [
            _make_row("all", exp=0.024, mdd=-0.073),
            _make_row("bear_skip", exp=0.030, mdd=-0.073),  # +25% exp
        ]
        v = compute_verdict(rows)
        assert v["verdict"] == "IMPROVED"
        assert v["best_config"] == "bear_skip"

    def test_mdd_improvement_passes_gate(self) -> None:
        rows = [
            _make_row("all", exp=0.024, mdd=-0.073),
            _make_row("bear_skip", exp=0.024, mdd=-0.050),  # 31.5% MDD reduction
        ]
        v = compute_verdict(rows)
        assert v["verdict"] == "IMPROVED"

    def test_failing_config_ignored(self) -> None:
        rows = [
            _make_row("all", exp=0.024, mdd=-0.073),
            _make_row("bull_only", exp=0.050, mdd=-0.020, passed=False),
        ]
        v = compute_verdict(rows)
        assert v["verdict"] == "NO_IMPROVEMENT"

    def test_filter_configs_defined(self) -> None:
        names = [name for name, _ in FILTER_CONFIGS]
        assert "all" in names
        assert "bear_skip" in names
        assert "bull_only" in names
