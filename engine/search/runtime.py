"""Corpus-only search route runtime."""
from __future__ import annotations

from typing import Any

from search.corpus import CorpusWindow, SearchCorpusStore


def run_seed_search(
    request: dict[str, Any],
    *,
    store: SearchCorpusStore | None = None,
) -> dict[str, Any]:
    store = store or SearchCorpusStore()
    symbol = _optional_str(request.get("symbol"))
    timeframe = _optional_str(request.get("timeframe"))
    limit = _bounded_limit(request.get("limit"), default=10)
    reference_signature = request.get("signature")
    if not isinstance(reference_signature, dict):
        reference_signature = {}

    windows = store.list_windows(symbol=symbol, timeframe=timeframe, limit=max(limit * 3, limit))
    candidates = [
        _candidate_from_window(window, _score_signature(window.signature, reference_signature))
        for window in windows
    ]
    candidates.sort(key=lambda item: item["score"], reverse=True)
    status = "corpus_only" if candidates else "degraded"
    return store.create_seed_run(
        request={**request, "mode": "corpus_only"},
        candidates=candidates[:limit],
        status=status,
    )


def get_seed_search(run_id: str, *, store: SearchCorpusStore | None = None) -> dict[str, Any] | None:
    return (store or SearchCorpusStore()).get_seed_run(run_id)


def run_scan(
    request: dict[str, Any],
    *,
    store: SearchCorpusStore | None = None,
) -> dict[str, Any]:
    store = store or SearchCorpusStore()
    symbol = _optional_str(request.get("symbol"))
    timeframe = _optional_str(request.get("timeframe"))
    limit = _bounded_limit(request.get("limit"), default=20)

    windows = store.list_windows(symbol=symbol, timeframe=timeframe, limit=limit)
    candidates = [
        _candidate_from_window(window, _scan_score(window))
        for window in windows
    ]
    candidates.sort(key=lambda item: item["score"], reverse=True)
    status = "corpus_only" if candidates else "degraded"
    return store.create_scan_run(
        request={**request, "mode": "corpus_only"},
        candidates=candidates,
        status=status,
    )


def get_scan(scan_id: str, *, store: SearchCorpusStore | None = None) -> dict[str, Any] | None:
    return (store or SearchCorpusStore()).get_scan_run(scan_id)


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _bounded_limit(value: Any, *, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(1, min(parsed, 100))


def _candidate_from_window(window: CorpusWindow, score: float) -> dict[str, Any]:
    return {
        "window_id": window.window_id,
        "symbol": window.symbol,
        "timeframe": window.timeframe,
        "score": round(max(0.0, min(score, 1.0)), 6),
        "payload": {
            "window_id": window.window_id,
            "symbol": window.symbol,
            "timeframe": window.timeframe,
            "start_ts": window.start_ts,
            "end_ts": window.end_ts,
            "bars": window.bars,
            "source": window.source,
            "signature": window.signature,
        },
    }


def _score_signature(candidate: dict[str, Any], reference: dict[str, Any]) -> float:
    numeric_keys = [
        key for key, value in reference.items()
        if isinstance(value, int | float) and isinstance(candidate.get(key), int | float)
    ]
    if not numeric_keys:
        return 0.5
    distance = sum(abs(float(candidate[key]) - float(reference[key])) for key in numeric_keys) / len(numeric_keys)
    return 1.0 / (1.0 + distance)


def _scan_score(window: CorpusWindow) -> float:
    signature = window.signature
    return_pct = abs(float(signature.get("close_return_pct", 0.0) or 0.0))
    volatility = float(signature.get("realized_volatility_pct", 0.0) or 0.0)
    volume_ratio = float(signature.get("volume_ratio", 0.0) or 0.0)
    oi_change_max = max(float(signature.get("oi_change_1h_max", 0.0) or 0.0), 0.0)
    funding_mean = abs(float(signature.get("funding_rate_mean", 0.0) or 0.0))
    ls_deviation = abs(float(signature.get("long_short_ratio_mean", 1.0) or 1.0) - 1.0)
    raw = (
        (return_pct / 10.0)
        + (volatility / 5.0)
        + min(volume_ratio, 3.0) / 3.0
        + min(oi_change_max * 12.0, 1.0)
        + min(funding_mean * 4000.0, 1.0)
        + min(ls_deviation * 3.0, 1.0)
    )
    return min(raw / 6.0, 1.0)
