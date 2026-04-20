"""Anomaly detection for Alpha Universe symbols (W-0116).

Two detection modes:
  1. Single-feature z-score: |z| > 2.5 → medium, > 3.5 → high
  2. Combination: 3+ blocks fired on a symbol that matches no known pattern
     phase → 'investigation_required'

Results are persisted to the alpha_anomalies table via the Supabase REST API.
Falls back to logging if Supabase is not configured (dev/offline mode).
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

log = logging.getLogger("engine.patterns.anomaly")

# Features to watch for statistical anomalies
ANOMALY_FEATURES = [
    "dex_buy_pct",
    "funding_rate",
    "taker_buy_ratio_1h",
    "long_short_ratio",
    "holder_top10_pct",
    "vol_zscore",
]

MEDIUM_Z = 2.5
HIGH_Z = 3.5
COMBO_BLOCK_THRESHOLD = 3


@dataclass
class Anomaly:
    symbol: str
    feature: str
    z_score: float | None
    severity: str  # 'medium' | 'high' | 'investigation_required'
    description: str
    evidence: dict[str, Any] = field(default_factory=dict)
    observed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


def _compute_zscore(series: pd.Series) -> pd.Series:
    """Rolling 30-day z-score (daily or hourly depending on length)."""
    mean = series.rolling(window=min(30, len(series)), min_periods=5).mean()
    std = series.rolling(window=min(30, len(series)), min_periods=5).std()
    z = (series - mean) / std.replace(0, np.nan)
    return z.fillna(0.0)


def detect_anomalies(
    symbol: str,
    features_df: pd.DataFrame,
    lookback_bars: int = 30 * 24,
    triggered_blocks: list[str] | None = None,
    known_phase: str | None = None,
) -> list[Anomaly]:
    """Detect anomalies for one symbol and persist to alpha_anomalies.

    Args:
        symbol:          Token symbol (e.g. "INUSDT")
        features_df:     Features table from compute_features_table()
        lookback_bars:   How many bars to compute z-scores over (720 = 30d hourly)
        triggered_blocks: Blocks that fired in the latest evaluation
        known_phase:     Current pattern phase (None if no match)

    Returns:
        List of Anomaly objects (also persisted asynchronously).
    """
    if features_df.empty:
        return []

    anomalies: list[Anomaly] = []
    window = features_df.tail(lookback_bars)

    # 1. Single-feature z-score anomalies
    for feat in ANOMALY_FEATURES:
        if feat not in window.columns:
            continue
        series = window[feat].dropna().astype(float)
        if len(series) < 5:
            continue

        z_series = _compute_zscore(series)
        last_z = float(z_series.iloc[-1]) if len(z_series) > 0 else 0.0
        abs_z = abs(last_z)

        if abs_z > HIGH_Z:
            severity = "high"
        elif abs_z > MEDIUM_Z:
            severity = "medium"
        else:
            continue

        latest_val = float(series.iloc[-1])
        anomalies.append(Anomaly(
            symbol=symbol,
            feature=feat,
            z_score=round(last_z, 3),
            severity=severity,
            description=f"{feat} z={last_z:.2f} (value={latest_val:.4f})",
            evidence={"feature": feat, "value": latest_val, "z_score": round(last_z, 3)},
        ))

    # 2. Combination anomaly: strong multi-block signal outside known patterns
    if triggered_blocks and len(triggered_blocks) >= COMBO_BLOCK_THRESHOLD:
        if not known_phase or known_phase in ("IDLE", "RESET", ""):
            anomalies.append(Anomaly(
                symbol=symbol,
                feature="combo_blocks",
                z_score=None,
                severity="investigation_required",
                description=(
                    f"{len(triggered_blocks)} blocks fired but no pattern phase matched — "
                    "possible undiscovered setup"
                ),
                evidence={"blocks": triggered_blocks, "n_blocks": len(triggered_blocks)},
            ))

    # Persist (fire-and-forget — log errors, don't raise)
    if anomalies:
        _persist_anomalies(anomalies)

    return anomalies


def _persist_anomalies(anomalies: list[Anomaly]) -> None:
    """Push anomalies to alpha_anomalies table via Supabase REST (best effort)."""
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    if not supabase_url or not supabase_key:
        for a in anomalies:
            log.info(
                "Anomaly [%s] %s: %s (z=%s)",
                a.severity, a.symbol, a.description, a.z_score,
            )
        return

    import json
    try:
        import httpx
        url = f"{supabase_url}/rest/v1/alpha_anomalies"
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
        rows = [
            {
                "symbol": a.symbol,
                "feature": a.feature,
                "z_score": a.z_score,
                "severity": a.severity,
                "description": a.description,
                "evidence": json.dumps(a.evidence),
                "observed_at": a.observed_at.isoformat(),
            }
            for a in anomalies
        ]
        resp = httpx.post(url, json=rows, headers=headers, timeout=10)
        resp.raise_for_status()
    except Exception as exc:
        log.warning("Failed to persist anomalies for %s: %s", anomalies[0].symbol, exc)
