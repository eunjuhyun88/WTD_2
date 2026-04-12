"""Tests for observability.logging.StructuredLogger."""
from __future__ import annotations

import io
import json

import pytest

from observability.logging import StructuredLogger


def _lines(stream: io.StringIO) -> list[dict]:
    return [json.loads(line) for line in stream.getvalue().splitlines()]


def test_info_emits_fixed_schema_keys():
    stream = io.StringIO()
    log = StructuredLogger("backtest.portfolio", run_id="abc123", stream=stream)
    log.info("entry_blocked", symbol="BTCUSDT", reason="max_concurrent")
    records = _lines(stream)
    assert len(records) == 1
    rec = records[0]
    for fixed in ("ts", "level", "module", "event", "run_id"):
        assert fixed in rec
    assert rec["level"] == "info"
    assert rec["module"] == "backtest.portfolio"
    assert rec["event"] == "entry_blocked"
    assert rec["run_id"] == "abc123"
    assert rec["symbol"] == "BTCUSDT"
    assert rec["reason"] == "max_concurrent"


def test_levels_warning_and_error():
    stream = io.StringIO()
    log = StructuredLogger("m", run_id="r")
    log.stream = stream
    log.warning("slow_symbol", symbol="OPUSDT", bars=9000)
    log.error("missing_kline", symbol="XYZ")
    records = _lines(stream)
    assert [r["level"] for r in records] == ["warn", "error"]
    assert records[0]["event"] == "slow_symbol"
    assert records[1]["event"] == "missing_kline"


def test_colliding_field_name_raises():
    stream = io.StringIO()
    log = StructuredLogger("m", run_id="r", stream=stream)
    with pytest.raises(ValueError, match="fixed schema"):
        log.info("evt", module="override_attempt")


def test_non_json_native_values_serialize_via_default_str():
    from pathlib import Path

    import pandas as pd

    stream = io.StringIO()
    log = StructuredLogger("m", run_id="r", stream=stream)
    ts = pd.Timestamp("2024-01-01", tz="UTC")
    log.info("touched", when=ts, path=Path("/tmp/x.txt"))
    records = _lines(stream)
    assert records[0]["when"].startswith("2024-01-01")
    assert records[0]["path"] == "/tmp/x.txt"
