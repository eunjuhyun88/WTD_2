"""Tests for backtest.audit — 3 cases per §6.10."""
from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import pytest

from backtest.audit import (
    TRADE_SCHEMA_VERSION,
    collect_run_metadata,
    write_run_artifacts,
)
from backtest.config import RiskConfig
from backtest.simulator import run_backtest
from backtest.types import EntrySignal
from observability.logging import StructuredLogger
from scanner.pnl import ExecutionCosts


def _tiny_result():
    klines = pd.DataFrame(
        [
            (100.0, 100.5, 99.5, 100.0),
            (100.0, 105.0, 99.9, 104.5),
            (104.0, 105.0, 103.0, 104.0),
        ],
        columns=["open", "high", "low", "close"],
        index=pd.date_range("2024-01-01", periods=3, freq="h", tz="UTC"),
    )
    entries = [
        EntrySignal(
            symbol="BTCUSDT",
            timestamp=pd.Timestamp("2024-01-01 00:00", tz="UTC"),
            direction="long",
            predicted_prob=0.9,
            source_model="test",
        )
    ]
    logger = StructuredLogger("t", run_id="r", stream=io.StringIO())
    return run_backtest(
        entries=entries,
        klines_by_symbol={"BTCUSDT": klines},
        adv_by_symbol={"BTCUSDT": 1_000_000_000.0},
        risk_cfg=RiskConfig(),
        costs=ExecutionCosts(),
        threshold=0.5,
        logger=logger,
    )


# ---------------------------------------------------------------------------
# 1. Metadata schema stable and includes all required fields
# ---------------------------------------------------------------------------


def test_metadata_schema_includes_required_fields():
    cfg = RiskConfig()
    costs = ExecutionCosts()
    md = collect_run_metadata(
        run_id="2024-01-01T00:00:00Z-aaa",
        risk_cfg=cfg,
        costs=costs,
        random_seed=13,
        key_deps={"pandas": "2.2.3", "numpy": "1.26.4"},
        git_info={"sha": "abc123", "dirty": False},
        now_utc=datetime(2024, 1, 1, tzinfo=timezone.utc),
    )
    assert md.run_id == "2024-01-01T00:00:00Z-aaa"
    assert md.git_sha == "abc123"
    assert md.git_dirty is False
    assert md.config_hash == cfg.content_hash()
    assert md.random_seed == 13
    assert md.key_deps["pandas"] == "2.2.3"
    assert md.risk_config["initial_equity"] == 10_000.0
    assert md.execution_costs["fee_taker_pct"] == 0.0005
    assert md.warnings == []


# ---------------------------------------------------------------------------
# 2. Dirty git → warning emitted in metadata
# ---------------------------------------------------------------------------


def test_dirty_git_emits_warning():
    md = collect_run_metadata(
        run_id="r",
        risk_cfg=RiskConfig(),
        costs=ExecutionCosts(),
        git_info={"sha": "abc123", "dirty": True},
        now_utc=datetime(2024, 1, 1, tzinfo=timezone.utc),
    )
    assert md.git_dirty is True
    assert any("dirty" in w for w in md.warnings)


# ---------------------------------------------------------------------------
# 3. write_run_artifacts persists metadata, metrics, trades, equity curve
# ---------------------------------------------------------------------------


def test_write_run_artifacts_round_trip(tmp_path: Path):
    result = _tiny_result()
    md = collect_run_metadata(
        run_id="unit-test-run",
        risk_cfg=RiskConfig(),
        costs=ExecutionCosts(),
        git_info={"sha": "deadbeef", "dirty": False},
        now_utc=datetime(2024, 1, 1, tzinfo=timezone.utc),
    )
    out_dir = tmp_path / "runs" / "unit-test-run"
    write_run_artifacts(out_dir, md, result)

    # metadata
    meta_loaded = json.loads((out_dir / "metadata.json").read_text())
    assert meta_loaded["run_id"] == "unit-test-run"
    assert meta_loaded["git_sha"] == "deadbeef"
    assert meta_loaded["config_hash"] == RiskConfig().content_hash()

    # metrics with stage_1 verdict
    metrics_loaded = json.loads((out_dir / "metrics.json").read_text())
    assert "stage_1_passed" in metrics_loaded
    assert "stage_1_failure_reasons" in metrics_loaded
    assert metrics_loaded["n_executed"] == 1

    # trades.jsonl
    trade_lines = (out_dir / "trades.jsonl").read_text().splitlines()
    assert len(trade_lines) == 1
    trade_obj = json.loads(trade_lines[0])
    assert trade_obj["schema_version"] == TRADE_SCHEMA_VERSION
    assert trade_obj["symbol"] == "BTCUSDT"
    assert trade_obj["exit_reason"] in ("target", "stop", "timeout", "forced_close")

    # equity_curve.jsonl
    eq_lines = (out_dir / "equity_curve.jsonl").read_text().splitlines()
    assert len(eq_lines) >= 1
    eq_obj = json.loads(eq_lines[0])
    assert "time" in eq_obj and "equity" in eq_obj
