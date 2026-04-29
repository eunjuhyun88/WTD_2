"""W-0280 — V-track production runner (Core Loop Closure).

Wires :func:`run_validation_pipeline` + :func:`evaluate_gate_v2` into a
single call that loads a :class:`ReplayBenchmarkPack` from a stored search
artifact and returns a :class:`GateV2Result`.

Augment-only enforcement: ``engine/research/pattern_search.py`` is NOT
modified. All data is read from ``PatternSearchArtifactStore`` and
``BenchmarkPackStore``, which are existing persistent stores.

Usage::

    from research.validation.runner import run_full_validation

    gate_result = run_full_validation(research_run_id)
    if gate_result is not None:
        print(gate_result.overall_pass, gate_result.all_new_pass)
"""
from __future__ import annotations

import logging
import time as _time

log = logging.getLogger(__name__)

_BTC_RETURNS_CACHE: "tuple[float, pd.Series] | None" = None
_BTC_RETURNS_TTL = 3600  # 1 hour — 1d candles refresh once daily is sufficient


def _fetch_btc_returns() -> "pd.Series | None":
    """Load BTCUSDT 1d klines and compute 30-day rolling return (%).

    Uses a module-level 1-hour TTL cache to avoid hitting Binance API
    on every validation call. offline=False allows Binance fetch on Cloud Run
    (which has no persistent disk and would always raise CacheMiss otherwise).

    Returns:
        UTC-indexed pd.Series of 30-day BTC percentage returns, or None on failure.
    """
    global _BTC_RETURNS_CACHE
    if _BTC_RETURNS_CACHE is not None:
        cached_ts, cached_series = _BTC_RETURNS_CACHE
        if _time.time() - cached_ts < _BTC_RETURNS_TTL:
            return cached_series

    try:
        import pandas as pd
        from data_cache.loader import load_klines

        klines = load_klines("BTCUSDT", "1d", offline=False)   # ← FIXED: fetch from Binance if not cached
        if klines.empty or "close" not in klines.columns:
            return None
        close = klines["close"].sort_index()
        returns = (close / close.shift(30) - 1) * 100.0
        if returns.index.tzinfo is None:
            returns.index = returns.index.tz_localize("UTC")
        series = returns.dropna()
        _BTC_RETURNS_CACHE = (_time.time(), series)
        return series
    except Exception as exc:
        log.debug("_fetch_btc_returns: unavailable — %s", exc)
        return None


def run_full_validation(
    research_run_id: str,
    *,
    btc_returns: "pd.Series | None" = None,
) -> "GateV2Result | None":
    """Load pack + promotion_report from artifact → pipeline → GateV2Result.

    Looks up the ``PatternSearchArtifactStore`` for ``research_run_id``,
    loads the associated :class:`ReplayBenchmarkPack` via
    ``BenchmarkPackStore``, runs :func:`run_validation_pipeline` (V-01,
    V-02, V-06, and optionally V-05 when ``btc_returns`` is provided), then
    calls :func:`evaluate_gate_v2` using the existing promotion decision as
    the ``existing_pass`` baseline.

    Args:
        research_run_id: ID of the ``ResearchRun`` produced by
            :func:`run_pattern_benchmark_search`.
        btc_returns: optional UTC-indexed ``pd.Series`` of BTC 30-day
            return percentages.  When ``None`` (default), :func:`_fetch_btc_returns`
            is called automatically to activate V-05 from the local data cache.
            Pass an explicit ``pd.Series`` to override, or pass a sentinel to
            disable V-05 if needed.

    Returns:
        :class:`GateV2Result` on success, ``None`` when the artifact or
        pack cannot be loaded (logged as a warning).
    """
    from research.pattern_search import BenchmarkPackStore, PatternSearchArtifactStore
    from research.validation.gates import evaluate_gate_v2
    from research.validation.pipeline import ValidationPipelineConfig, run_validation_pipeline

    # Activate V-05 automatically — fetch BTC returns from local cache.
    # Fails silently (returns None) when cache is unavailable.
    if btc_returns is None:
        btc_returns = _fetch_btc_returns()

    artifact = PatternSearchArtifactStore().load(research_run_id)
    if artifact is None:
        log.warning("run_full_validation: artifact not found for run_id=%s", research_run_id)
        return None

    pack_id = artifact.get("benchmark_pack_id")
    if not pack_id:
        log.warning("run_full_validation: benchmark_pack_id missing in artifact run_id=%s", research_run_id)
        return None

    pack = BenchmarkPackStore().load(pack_id)
    if pack is None:
        log.warning("run_full_validation: pack not found pack_id=%s", pack_id)
        return None

    promotion_report = artifact.get("promotion_report") or {}
    existing_pass = promotion_report.get("decision") == "promote_candidate"

    report = run_validation_pipeline(
        pack=pack,
        config=ValidationPipelineConfig(),
        btc_returns=btc_returns,
    )

    result = evaluate_gate_v2(report, existing_pass=existing_pass)
    log.info(
        "run_full_validation: slug=%s run_id=%s overall_pass=%s all_new_pass=%s",
        pack.pattern_slug,
        research_run_id,
        result.overall_pass,
        result.all_new_pass,
    )
    return result
