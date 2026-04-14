from __future__ import annotations

from fastapi import HTTPException

from models.compat import (
    CURRENT_SIGNAL_SNAPSHOT_VERSION,
    normalize_signal_snapshot_payload,
)


def test_normalize_snapshot_payload_backfills_missing_version() -> None:
    payload = {"symbol": "BTCUSDT", "price": 100.0}
    out = normalize_signal_snapshot_payload(payload)
    assert out["schema_version"] == CURRENT_SIGNAL_SNAPSHOT_VERSION


def test_normalize_snapshot_payload_accepts_current_version() -> None:
    payload = {"schema_version": CURRENT_SIGNAL_SNAPSHOT_VERSION, "symbol": "BTCUSDT"}
    out = normalize_signal_snapshot_payload(payload)
    assert out["schema_version"] == CURRENT_SIGNAL_SNAPSHOT_VERSION


def test_normalize_snapshot_payload_rejects_unsupported_version() -> None:
    payload = {"schema_version": 999, "symbol": "BTCUSDT"}
    try:
        normalize_signal_snapshot_payload(payload)
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "Unsupported schema_version" in str(exc.detail)
