"""Structured audit trail for Phase D12 backtest runs.

Every run writes a folder ``tools/output/runs/<run_id>/`` containing:

* ``metadata.json``     — git sha, git dirty flag, config hash,
  Python version, key dependency versions, UTC start time.
* ``metrics.json``      — the ``BacktestMetrics`` dict (plus the
  ``stage_1_gate`` pass/fail).
* ``trades.jsonl``      — one line per ``ExecutedTrade``.
* ``equity_curve.jsonl``— one line per ``EquityPoint``.

The point is simple: *if I come back to a result six months from now,
I should be able to check out the recorded git sha, set the recorded
config, and reproduce the numbers bit-for-bit*. That's the
reproducibility contract spelled out in ``docs/design/phase-d12-to-e.md``
§6.12.

``write_run_artifacts`` is the main entry point. ``collect_run_metadata``
is pure so it can be tested without touching the filesystem.
"""
from __future__ import annotations

import json
import platform
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from backtest.config import RiskConfig
from backtest.metrics import BacktestMetrics, stage_1_gate
from backtest.portfolio import EquityPoint
from backtest.simulator import BacktestResult
from backtest.types import ExecutedTrade
from scanner.pnl import ExecutionCosts


@dataclass(frozen=True)
class RunMetadata:
    run_id: str
    git_sha: str
    git_dirty: bool
    config_hash: str
    risk_config: dict[str, Any]
    execution_costs: dict[str, Any]
    random_seed: Optional[int]
    python_version: str
    key_deps: dict[str, str]
    ts_utc: str
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Pure metadata collection
# ---------------------------------------------------------------------------


def collect_run_metadata(
    run_id: str,
    risk_cfg: RiskConfig,
    costs: ExecutionCosts,
    *,
    random_seed: Optional[int] = None,
    key_deps: Optional[dict[str, str]] = None,
    git_info: Optional[dict[str, Any]] = None,
    now_utc: Optional[datetime] = None,
) -> RunMetadata:
    """Assemble a ``RunMetadata`` record without touching the filesystem.

    ``git_info`` and ``now_utc`` are injectable so the unit tests can run
    without shelling out to git or reading the wall clock. In a real
    run they're filled in by :func:`detect_git_info` and
    ``datetime.now(timezone.utc)``.
    """
    git_info = git_info or detect_git_info()
    now_utc = now_utc or datetime.now(timezone.utc)

    warnings: list[str] = []
    if git_info.get("dirty"):
        warnings.append("git working tree dirty at run start")

    return RunMetadata(
        run_id=run_id,
        git_sha=str(git_info.get("sha", "unknown")),
        git_dirty=bool(git_info.get("dirty", False)),
        config_hash=risk_cfg.content_hash(),
        risk_config=asdict(risk_cfg),
        execution_costs=asdict(costs),
        random_seed=random_seed,
        python_version=platform.python_version(),
        key_deps=dict(key_deps or {}),
        ts_utc=now_utc.isoformat(),
        warnings=warnings,
    )


def detect_git_info() -> dict[str, Any]:
    """Return ``{"sha": ..., "dirty": ...}`` for the current checkout.

    Falls back to ``{"sha": "unknown", "dirty": False}`` if ``git`` is
    not available or the CWD is not a git repo.
    """
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return {"sha": "unknown", "dirty": False}
    try:
        status = subprocess.check_output(
            ["git", "status", "--porcelain"],
            stderr=subprocess.DEVNULL,
        ).decode()
    except (subprocess.CalledProcessError, FileNotFoundError):
        status = ""
    return {"sha": sha, "dirty": bool(status.strip())}


# ---------------------------------------------------------------------------
# Filesystem writers
# ---------------------------------------------------------------------------


def write_run_artifacts(
    out_dir: Path,
    metadata: RunMetadata,
    result: BacktestResult,
) -> None:
    """Write ``metadata.json``, ``metrics.json``, ``trades.jsonl``,
    ``equity_curve.jsonl`` to ``out_dir``.

    The directory is created if it does not exist. Files are **written
    fresh** — existing files are silently overwritten because the run
    folder is keyed by run_id and should contain exactly one run.
    """
    out_dir.mkdir(parents=True, exist_ok=True)

    (out_dir / "metadata.json").write_text(
        json.dumps(asdict(metadata), indent=2, sort_keys=True, default=str),
        encoding="utf-8",
    )

    passed, reasons = stage_1_gate(result.metrics)
    metrics_dict = asdict(result.metrics)
    metrics_dict["stage_1_passed"] = passed
    metrics_dict["stage_1_failure_reasons"] = reasons
    metrics_dict["block_reasons"] = dict(result.block_reasons)
    (out_dir / "metrics.json").write_text(
        json.dumps(metrics_dict, indent=2, sort_keys=True, default=str),
        encoding="utf-8",
    )

    with (out_dir / "trades.jsonl").open("w", encoding="utf-8") as f:
        for t in result.trades:
            f.write(json.dumps(_trade_to_dict(t), default=str) + "\n")

    with (out_dir / "equity_curve.jsonl").open("w", encoding="utf-8") as f:
        for pt in result.equity_curve:
            f.write(
                json.dumps(
                    {"time": str(pt.time), "equity": pt.equity},
                    default=str,
                )
                + "\n"
            )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


# Stable JSONL schema version. Bump when any field is renamed or removed.
TRADE_SCHEMA_VERSION = 1


def _trade_to_dict(t: ExecutedTrade) -> dict[str, Any]:
    return {
        "schema_version": TRADE_SCHEMA_VERSION,
        "symbol": t.symbol,
        "direction": t.direction,
        "source_model": t.source_model,
        "entry_time": str(t.entry_time),
        "entry_price_raw": t.entry_price_raw,
        "entry_price_exec": t.entry_price_exec,
        "exit_time": str(t.exit_time),
        "exit_price_raw": t.exit_price_raw,
        "exit_price_exec": t.exit_price_exec,
        "notional_usd": t.notional_usd,
        "size_units": t.size_units,
        "gross_pnl_pct": t.gross_pnl_pct,
        "fee_pct_total": t.fee_pct_total,
        "slippage_pct_total": t.slippage_pct_total,
        "realized_pnl_pct": t.realized_pnl_pct,
        "realized_pnl_usd": t.realized_pnl_usd,
        "exit_reason": t.exit_reason,
        "bars_to_exit": t.bars_to_exit,
    }
