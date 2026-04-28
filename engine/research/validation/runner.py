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

log = logging.getLogger(__name__)


def _fetch_btc_returns() -> "pd.Series | None":
    """Load BTCUSDT 1d klines and compute 30-day rolling return (%).

    Used to activate V-05 regime-conditional wiring in production.
    Returns ``None`` on CacheMiss or any failure (V-05 silently skipped).

    Returns:
        UTC-indexed ``pd.Series`` where each value is the 30-day percentage
        return of BTC at that timestamp, or ``None`` if data unavailable.
    """
    try:
        import pandas as pd
        from data_cache.loader import CacheMiss, load_klines

        klines = load_klines("BTCUSDT", "1d", offline=True)
        if klines.empty or "close" not in klines.columns:
            return None
        close = klines["close"].sort_index()
        # 30-day rolling return: (close_t / close_{t-30} - 1) * 100
        returns = (close / close.shift(30) - 1) * 100.0
        # Ensure UTC-aware index for asof() in pipeline.py
        if returns.index.tzinfo is None:
            returns.index = returns.index.tz_localize("UTC")
        return returns.dropna()
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
