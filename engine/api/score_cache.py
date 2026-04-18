"""In-process TTL cache for /score responses.

Cache key: (symbol, last_bar_timestamp_ms)
TTL: 30s — a bar doesn't change mid-bar, so same symbol+bar → same features+score.

Thread-safe: dict read/write is GIL-protected in CPython. The lock is only
held during eviction to avoid redundant cleanup races under load.
"""
from __future__ import annotations

import threading
import time
from typing import Optional

from api.schemas_score import ScoreResponse

_TTL_SECONDS = 30.0
_MAX_ENTRIES = 512  # ~100 symbols × 4-5 TFs with headroom

_cache: dict[tuple[str, int], tuple[float, ScoreResponse]] = {}
_lock = threading.Lock()


def _evict_stale() -> None:
    """Remove expired entries. Call under _lock."""
    now = time.monotonic()
    expired = [k for k, (exp, _) in _cache.items() if now >= exp]
    for k in expired:
        _cache.pop(k, None)


def get_score_cache(symbol: str, last_bar_ts_ms: int) -> Optional[ScoreResponse]:
    key = (symbol, last_bar_ts_ms)
    entry = _cache.get(key)
    if entry is None:
        return None
    expires_at, result = entry
    if time.monotonic() >= expires_at:
        _cache.pop(key, None)
        return None
    return result


def set_score_cache(symbol: str, last_bar_ts_ms: int, result: ScoreResponse) -> None:
    key = (symbol, last_bar_ts_ms)
    expires_at = time.monotonic() + _TTL_SECONDS
    with _lock:
        if len(_cache) >= _MAX_ENTRIES:
            _evict_stale()
            # If still over limit, drop oldest entry
            if len(_cache) >= _MAX_ENTRIES:
                oldest = next(iter(_cache))
                _cache.pop(oldest, None)
    _cache[key] = (expires_at, result)
