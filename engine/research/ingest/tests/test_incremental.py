"""Tests for incremental updater — uses tmp_path for parquet I/O."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pandas as pd
import pytest

from engine.research.ingest.backfill import _upsert_parquet
from engine.research.ingest.incremental import (
    _last_ts_ms,
    _tier_symbols,
)
from engine.research.ingest.tests.fixtures import _T0

# ── _last_ts_ms ────────────────────────────────────────────────────────────────


def test_last_ts_ms_returns_none_for_missing_file(tmp_path: Path) -> None:
    result = _last_ts_ms(tmp_path / "nonexistent.parquet")
    assert result is None


def test_last_ts_ms_returns_max_ts(tmp_path: Path) -> None:
    p = tmp_path / "test.parquet"
    df = pd.DataFrame({
        "ts_ms": [_T0, _T0 + 3_600_000, _T0 + 7_200_000],
        "open": [1.0, 2.0, 3.0],
    })
    df.to_parquet(p, index=False)
    result = _last_ts_ms(p)
    assert result == _T0 + 7_200_000


def test_last_ts_ms_returns_none_for_empty_parquet(tmp_path: Path) -> None:
    p = tmp_path / "empty.parquet"
    pd.DataFrame(columns=["ts_ms"]).to_parquet(p, index=False)
    result = _last_ts_ms(p)
    assert result is None


# ── _tier_symbols ──────────────────────────────────────────────────────────────


def test_tier_symbols_tier1() -> None:
    from engine.research.ingest.universe import TIER1
    assert _tier_symbols("1") == TIER1


def test_tier_symbols_all() -> None:
    from engine.research.ingest.universe import ALL_SYMBOLS
    assert _tier_symbols("all") == ALL_SYMBOLS


def test_tier_symbols_invalid_raises() -> None:
    with pytest.raises(ValueError, match="Invalid tier"):
        _tier_symbols("99")
