"""Corpus-only search route runtime.

W-0145: seed-search uses corpus-first retrieval with 40+dim enrichment.
  - Layer A signals: FeatureWindowStore 40+ signals (OI, funding, vol, price, positioning)
  - Fallback: 6-field compact corpus signature when FW enrichment unavailable
  - Weighted L1 scoring (SIGNAL_WEIGHTS from _signals.py)
"""
from __future__ import annotations

from typing import Any

from search._signals import (
    FW_DB_PATH as _FW_DB_PATH,
    fetch_feature_signals_batch,
    weighted_l1_score,
)
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
    definition_ref = request.get("definition_ref")
    if not isinstance(definition_ref, dict):
        definition_ref = None

    windows = store.list_windows(symbol=symbol, timeframe=timeframe, limit=max(limit * 3, limit))

    # W-0145: enrich window signatures with FeatureWindowStore 40+ signals
    fw_enrichment = fetch_feature_signals_batch(windows, _FW_DB_PATH)

    candidates = []
    for window in windows:
        # Merge 40+ FW signals on top of 6-field corpus signature
        cand_sig = dict(window.signature)
        if window.window_id in fw_enrichment:
            cand_sig.update(fw_enrichment[window.window_id])
        score = weighted_l1_score(cand_sig, reference_signature)
        candidates.append(
            _candidate_from_window(window, score, definition_ref=definition_ref)
        )

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
    definition_ref = request.get("definition_ref")
    if not isinstance(definition_ref, dict):
        definition_ref = None

    windows = store.list_windows(symbol=symbol, timeframe=timeframe, limit=limit)
    candidates = [
        _candidate_from_window(window, _scan_score(window), definition_ref=definition_ref)
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


def _candidate_from_window(
    window: CorpusWindow,
    score: float,
    *,
    definition_ref: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "window_id": window.window_id,
        "symbol": window.symbol,
        "timeframe": window.timeframe,
        "start_ts": window.start_ts,
        "end_ts": window.end_ts,
        "bars": window.bars,
        "source": window.source,
        "signature": window.signature,
    }
    if definition_ref is not None:
        payload["definition_ref"] = definition_ref
    return {
        "window_id": window.window_id,
        "symbol": window.symbol,
        "timeframe": window.timeframe,
        "score": round(max(0.0, min(score, 1.0)), 6),
        "payload": payload,
    }


def _scan_score(window: CorpusWindow) -> float:
    signature = window.signature
    return_pct = abs(float(signature.get("close_return_pct", 0.0) or 0.0))
    volatility = float(signature.get("realized_volatility_pct", 0.0) or 0.0)
    volume_ratio = float(signature.get("volume_ratio", 0.0) or 0.0)
    raw = (return_pct / 10.0) + (volatility / 5.0) + min(volume_ratio, 3.0) / 3.0
    return min(raw / 3.0, 1.0)
