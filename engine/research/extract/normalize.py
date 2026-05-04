"""
engine.research.extract.normalize
===================================
Load raw_dump files and normalize them into standard Python structures
for consumption by parsers.
"""

from __future__ import annotations

import gzip
import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def _load_gz_json(path: Path) -> Any:
    """Load a .json.gz file produced by the crawler."""
    with gzip.open(str(path), "rt", encoding="utf-8") as f:
        return json.load(f)


def _normalize_key(key: str) -> str:
    """
    Normalize a dump filename stem to a canonical key.

    Handles double-prefix from early crawler versions (api_api_signals → api_signals).
    """
    # Strip .json.gz if present
    key = key.replace(".json.gz", "")
    # Remove double api_ prefix from early crawler versions
    if key.startswith("api_api_"):
        key = key[4:]  # drop first "api_"
    return key


def load_dump(dump_dir: Path) -> dict[str, Any]:
    """
    Load all .json.gz files in dump_dir into a dict keyed by normalized stem.

    Returns
    -------
    dict[str, Any]
        Keys are normalized file stems, e.g. 'api_signals', 'api_trades'.
        Handles both 'api_signals.json.gz' and legacy 'api_api_signals.json.gz'.
    """
    dump_dir = Path(dump_dir)
    if not dump_dir.exists():
        raise FileNotFoundError(f"dump_dir not found: {dump_dir}")

    result: dict[str, Any] = {}
    for gz_path in sorted(dump_dir.glob("*.json.gz")):
        raw_key = gz_path.name.replace(".json.gz", "")
        key = _normalize_key(raw_key)
        try:
            result[key] = _load_gz_json(gz_path)
            logger.debug("Loaded %s → key=%s (%d bytes)", gz_path.name, key, gz_path.stat().st_size)
        except Exception as exc:
            logger.warning("Failed to load %s: %s", gz_path.name, exc)
    return result


def get_signals(dump: dict[str, Any]) -> list[dict]:
    """Extract raw signal events from dump."""
    if "api_signals" not in dump:
        logger.warning("api_signals not in dump")
        return []
    raw = dump["api_signals"]
    if isinstance(raw, dict):
        return raw.get("signals", [])
    if isinstance(raw, list):
        return raw
    return []


def get_trades(dump: dict[str, Any]) -> list[dict]:
    """Extract trades (closed) from dump."""
    if "api_trades" not in dump:
        logger.warning("api_trades not in dump")
        return []
    raw = dump["api_trades"]
    if isinstance(raw, dict):
        return raw.get("trades", [])
    if isinstance(raw, list):
        return raw
    return []


def get_positions(dump: dict[str, Any]) -> list[dict]:
    """Extract open positions from dump."""
    if "api_positions" not in dump:
        logger.warning("api_positions not in dump")
        return []
    raw = dump["api_positions"]
    if isinstance(raw, dict):
        return raw.get("positions", [])
    if isinstance(raw, list):
        return raw
    return []


def get_formula_attribution(dump: dict[str, Any]) -> dict:
    """Extract formula attribution data from dump."""
    return dump.get("api_formula-attribution", {})


def get_stats(dump: dict[str, Any]) -> dict:
    """Extract stats from dump."""
    return dump.get("api_stats", {})
