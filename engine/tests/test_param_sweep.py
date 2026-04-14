"""Tests for tools/param_sweep.py — grid generation and verdict logic."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest

# Make tools importable
_REPO = Path(__file__).resolve().parent.parent.parent
_TOOLS = _REPO / "tools"
if str(_TOOLS) not in sys.path:
    sys.path.insert(0, str(_TOOLS))
_COGOCHI = _REPO / "cogochi-autoresearch"
if str(_COGOCHI) not in sys.path:
    sys.path.insert(0, str(_COGOCHI))

pytest.importorskip("param_sweep", reason="legacy tools/param_sweep module not present in this repo layout")

from param_sweep import (  # noqa: E402
    CSV_COLUMNS,
    DEFAULT_STOP_PCT,
    DEFAULT_TARGET_PCT,
    build_grid,
    compute_verdict,
    print_heatmap,
    write_csv,
)


# ---------------------------------------------------------------------------
# build_grid
# ---------------------------------------------------------------------------


class TestBuildGrid:
    def test_skips_target_lte_stop(self) -> None:
        cells = build_grid([0.02, 0.04], [0.01, 0.02, 0.03, 0.05])
        # (0.02, 0.01) skipped, (0.02, 0.02) skipped, (0.04, 0.01) skipped,
        # (0.04, 0.02) skipped, (0.04, 0.03) skipped, (0.04, 0.04) skipped
        for s, t in cells:
            assert t > s, f"cell ({s}, {t}) should be skipped"

    def test_default_grid_count(self) -> None:
        from param_sweep import DEFAULT_STOP_GRID, DEFAULT_TARGET_GRID

        cells = build_grid(DEFAULT_STOP_GRID, DEFAULT_TARGET_GRID)
        # Must include the default (0.02, 0.04) cell
        assert (0.02, 0.04) in cells
        # 8×8 = 64 minus skipped (target <= stop)
        assert 30 <= len(cells) <= 60

    def test_single_cell(self) -> None:
        cells = build_grid([0.02], [0.04])
        assert cells == [(0.02, 0.04)]

    def test_empty_when_all_skipped(self) -> None:
        cells = build_grid([0.05], [0.01, 0.02, 0.03])
        assert cells == []


# ---------------------------------------------------------------------------
# compute_verdict
# ---------------------------------------------------------------------------


def _make_row(
    stop: float = 0.02,
    target: float = 0.04,
    exp: float = 0.02,
    passed: bool = True,
) -> dict[str, Any]:
    return {
        "stop_pct": stop,
        "target_pct": target,
        "expectancy_pct": exp,
        "stage_1_passed": passed,
        "n_executed": 100,
        "win_rate": 0.55,
        "profit_factor": 1.5,
        "max_drawdown_pct": -0.10,
        "sortino": 1.0,
        "calmar": 0.5,
    }


class TestComputeVerdict:
    def test_graveyard_when_none_pass(self) -> None:
        rows = [
            _make_row(0.01, 0.02, exp=-0.005, passed=False),
            _make_row(0.02, 0.04, exp=-0.003, passed=False),
        ]
        v = compute_verdict(rows)
        assert v["verdict"] == "GRAVEYARD"
        assert v["n_passing_cells"] == 0

    def test_rescued_when_default_fails_but_other_passes(self) -> None:
        rows = [
            _make_row(0.02, 0.04, exp=-0.01, passed=False),  # default fails
            _make_row(0.01, 0.03, exp=0.015, passed=True),  # other passes
        ]
        v = compute_verdict(rows)
        assert v["verdict"] == "RESCUED"
        assert v["best_stop"] == 0.01
        assert v["best_target"] == 0.03

    def test_sharpened_when_improvement_over_10pct(self) -> None:
        rows = [
            _make_row(0.02, 0.04, exp=0.020, passed=True),  # default
            _make_row(0.015, 0.06, exp=0.030, passed=True),  # +50%
        ]
        v = compute_verdict(rows)
        assert v["verdict"] == "SHARPENED"
        assert v["improvement_pct"] == pytest.approx(0.5, abs=0.01)

    def test_no_improvement_when_marginal(self) -> None:
        rows = [
            _make_row(0.02, 0.04, exp=0.020, passed=True),  # default
            _make_row(0.015, 0.06, exp=0.021, passed=True),  # +5%
        ]
        v = compute_verdict(rows)
        assert v["verdict"] == "NO_IMPROVEMENT"

    def test_default_cell_found_correctly(self) -> None:
        rows = [
            _make_row(0.01, 0.03, exp=0.03, passed=True),
            _make_row(0.02, 0.04, exp=0.02, passed=True),
        ]
        v = compute_verdict(rows)
        assert v["default_expectancy"] == pytest.approx(0.02)

    def test_missing_default_cell(self) -> None:
        """If grid doesn't include default (2%, 4%), use 0 as baseline."""
        rows = [
            _make_row(0.01, 0.03, exp=0.015, passed=True),
        ]
        v = compute_verdict(rows)
        assert v["default_expectancy"] == 0.0
        assert v["verdict"] in ("RESCUED", "SHARPENED")


# ---------------------------------------------------------------------------
# write_csv
# ---------------------------------------------------------------------------


class TestWriteCsv:
    def test_writes_valid_csv(self, tmp_path: Path) -> None:
        rows = [
            {
                "stop_pct": 0.02,
                "target_pct": 0.04,
                "n_executed": 100,
                "n_blocked": 5,
                "expectancy_pct": 0.02,
                "win_rate": 0.55,
                "profit_factor": 1.5,
                "max_drawdown_pct": -0.10,
                "sortino": 1.0,
                "calmar": 0.5,
                "sharpe": 0.8,
                "tail_ratio": 1.2,
                "stage_1_passed": True,
                "failure_reasons": "",
                "exit_target_n": 55,
                "exit_stop_n": 40,
                "exit_timeout_n": 5,
                "final_equity": 12000.0,
                "config_hash": "abc123def456",
            }
        ]
        csv_path = tmp_path / "test.csv"
        write_csv(rows, csv_path)
        assert csv_path.exists()
        lines = csv_path.read_text().strip().split("\n")
        assert len(lines) == 2  # header + 1 row
        header = lines[0].split(",")
        assert header == CSV_COLUMNS


# ---------------------------------------------------------------------------
# print_heatmap
# ---------------------------------------------------------------------------


class TestPrintHeatmap:
    def test_heatmap_output(self) -> None:
        rows = [
            {
                "stop_pct": 0.02,
                "target_pct": 0.04,
                "expectancy_pct": 0.02,
                "stage_1_passed": True,
            },
            {
                "stop_pct": 0.02,
                "target_pct": 0.06,
                "expectancy_pct": -0.01,
                "stage_1_passed": False,
            },
        ]
        text = print_heatmap(rows, [0.02], [0.04, 0.06])
        assert "★" in text  # pass marker
        assert "·" in text  # fail marker
