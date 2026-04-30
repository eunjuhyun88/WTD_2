"""W-0361: Parquet data access abstraction — local FS (now) / GCS (Cloud Run).

In Cloud Run, set GCS_BUCKET=wtd-v2-market-data to read from GCS.
Locally, reads from data_cache/market_data/ (default ParquetStore path).

GCS sync is handled externally by tools/sync_market_data_to_gcs.py.
This module reads only — it never writes to GCS.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from data_cache.parquet_store import ParquetStore

log = logging.getLogger("engine.data.parquet_provider")

_GCS_BUCKET = os.environ.get("GCS_BUCKET", "").strip()
_GCS_MOUNT = Path(os.environ.get("GCS_MOUNT_PATH", "/mnt/market-data"))


def get_store() -> ParquetStore:
    """Return a ParquetStore pointed at the appropriate data root.

    - If GCS_MOUNT_PATH is mounted (Cloud Run GCS FUSE): use that path.
    - Otherwise: local data_cache/market_data/.
    """
    if _GCS_BUCKET and _GCS_MOUNT.exists():
        log.info("Using GCS FUSE mount at %s (bucket=%s)", _GCS_MOUNT, _GCS_BUCKET)
        return ParquetStore(base_dir=_GCS_MOUNT)
    return ParquetStore()
