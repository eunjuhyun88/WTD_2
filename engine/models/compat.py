"""Backward-compat adapters for versioned model contracts."""
from __future__ import annotations

from fastapi import HTTPException

CURRENT_SIGNAL_SNAPSHOT_VERSION = 1
SUPPORTED_SIGNAL_SNAPSHOT_VERSIONS = frozenset({CURRENT_SIGNAL_SNAPSHOT_VERSION})


def normalize_signal_snapshot_payload(payload: dict) -> dict:
    """Normalize incoming snapshot payloads to the current contract.

    Policy:
      - missing schema_version is treated as v1 (legacy clients)
      - unsupported versions are rejected with 400
    """
    data = dict(payload)
    version = data.get("schema_version")
    if version is None:
        data["schema_version"] = CURRENT_SIGNAL_SNAPSHOT_VERSION
        return data

    try:
        parsed = int(version)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid schema_version: {version!r}") from exc

    if parsed not in SUPPORTED_SIGNAL_SNAPSHOT_VERSIONS:
        supported = sorted(SUPPORTED_SIGNAL_SNAPSHOT_VERSIONS)
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported schema_version={parsed}. Supported versions: {supported}",
        )
    data["schema_version"] = parsed
    return data
