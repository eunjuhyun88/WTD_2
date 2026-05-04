"""
engine.research.extract.parsers.exits
=======================================
Parse trades dump into exit_rules.yaml content.

Strategy:
  For each closed trade with entry_price, stop_price, tp1/tp2/tp3, and atr_at_entry:
    - Compute stop_dist = abs(entry - stop) / entry
    - Compute tp_dist_i = abs(entry - tpi) / entry
    - If atr_at_entry is available: k_stop = stop_dist / atr_pct
      Otherwise approximate: atr_pct = abs(stop - entry) / entry / 0.015 (1.5% baseline)
      and recover k_stop via linear regression: stop_dist = k_stop * atr_pct

  ATR regression: fit stop_dist = k_stop * atr_pct (no intercept) via OLS.
  Same for tp1/tp2/tp3.

  The design doc expects k_stop ≈ 1.5, k_tp1 ≈ 1.0, k_tp2 ≈ 2.0, k_tp3 ≈ 3.0.
"""

from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Any

try:
    import numpy as np
    from scipy import stats as scipy_stats
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False
    np = None  # type: ignore

from research.extract.normalize import load_dump, get_trades

logger = logging.getLogger(__name__)

ATR_BASELINE_PCT = 0.015  # 1.5% baseline for ATR approximation


def _compute_trade_distances(trade: dict) -> dict[str, float] | None:
    """
    Compute price distances for a single trade.

    Returns dict with stop_dist, tp1_dist, tp2_dist, tp3_dist, atr_pct,
    or None if required fields are missing.
    """
    entry = trade.get("entry_price")
    stop = trade.get("stop_price")
    tp1 = trade.get("tp1")
    tp2 = trade.get("tp2")
    tp3 = trade.get("tp3")
    atr = trade.get("atr_at_entry")
    direction = trade.get("direction", "long")

    if not all(v is not None for v in [entry, stop, tp1, tp2, tp3]):
        return None
    if entry == 0:
        return None

    # Compute distances as fractions of entry
    stop_dist = abs(float(entry) - float(stop)) / abs(float(entry))
    tp1_dist = abs(float(entry) - float(tp1)) / abs(float(entry))
    tp2_dist = abs(float(entry) - float(tp2)) / abs(float(entry))
    tp3_dist = abs(float(entry) - float(tp3)) / abs(float(entry))

    # ATR as fraction of entry — only use real ATR; skip approximation
    # Using fixed baseline for missing ATR destroys regression quality
    if atr is not None and float(atr) > 0:
        atr_pct = float(atr) / abs(float(entry))
    else:
        # Skip trades without real ATR for regression
        return None

    if atr_pct <= 0:
        return None

    return {
        "stop_dist": stop_dist,
        "tp1_dist": tp1_dist,
        "tp2_dist": tp2_dist,
        "tp3_dist": tp3_dist,
        "atr_pct": atr_pct,
        "has_real_atr": True,
        "direction": direction,
    }


def _linear_regression_no_intercept(x: list[float], y: list[float]) -> tuple[float, float]:
    """
    OLS regression y = k * x (no intercept).

    Returns (k, r_squared).
    """
    if not HAS_SCIPY or len(x) < 3:
        # Fallback: simple ratio
        ratios = [yi / xi for xi, yi in zip(x, y) if xi > 0]
        k = sum(ratios) / len(ratios) if ratios else 1.0
        return k, float("nan")

    x_arr = np.array(x)
    y_arr = np.array(y)

    # k = (x.T @ y) / (x.T @ x)
    k = float(np.dot(x_arr, y_arr) / np.dot(x_arr, x_arr))

    # R²: 1 - SS_res / SS_tot
    y_pred = k * x_arr
    ss_res = float(np.sum((y_arr - y_pred) ** 2))
    ss_tot = float(np.sum((y_arr - np.mean(y_arr)) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")

    return k, r2


def extract_exit_rules(dump_dir: Path) -> dict[str, Any]:
    """
    Extract exit rules from trades dump.

    Returns
    -------
    dict
        Exit rules dict matching §P6 schema, with regression metadata.
    """
    dump = load_dump(dump_dir)
    trades = get_trades(dump)

    if not trades:
        logger.warning("No trades found; returning design-doc defaults")
        return _default_exit_rules("no_data")

    # Compute distances for all trades
    records = []
    for t in trades:
        dist = _compute_trade_distances(t)
        if dist is not None:
            records.append(dist)

    if len(records) < 5:
        logger.warning("Too few valid trades (%d); returning design-doc defaults", len(records))
        return _default_exit_rules(f"insufficient_data_n={len(records)}")

    logger.info("Computing ATR regression on %d trades", len(records))

    atr_pcts = [r["atr_pct"] for r in records]
    stop_dists = [r["stop_dist"] for r in records]
    tp1_dists = [r["tp1_dist"] for r in records]
    tp2_dists = [r["tp2_dist"] for r in records]
    tp3_dists = [r["tp3_dist"] for r in records]

    k_stop, r2_stop = _linear_regression_no_intercept(atr_pcts, stop_dists)
    k_tp1, r2_tp1 = _linear_regression_no_intercept(atr_pcts, tp1_dists)
    k_tp2, r2_tp2 = _linear_regression_no_intercept(atr_pcts, tp2_dists)
    k_tp3, r2_tp3 = _linear_regression_no_intercept(atr_pcts, tp3_dists)

    logger.info(
        "Regression results: k_stop=%.3f (R²=%.3f), k_tp1=%.3f (R²=%.3f), "
        "k_tp2=%.3f (R²=%.3f), k_tp3=%.3f (R²=%.3f)",
        k_stop, r2_stop, k_tp1, r2_tp1, k_tp2, r2_tp2, k_tp3, r2_tp3,
    )

    has_real_atr = True  # we only include trades with real ATR now
    regression_note = (
        f"ATR regression on {len(records)} trades with real atr_at_entry "
        f"(excluded {len(trades)-len(records)} trades without ATR); "
        f"k_stop={k_stop:.3f} R²={r2_stop:.3f}; "
        f"k_tp1={k_tp1:.3f} R²={r2_tp1:.3f}; "
        f"k_tp2={k_tp2:.3f} R²={r2_tp2:.3f}; "
        f"k_tp3={k_tp3:.3f} R²={r2_tp3:.3f}"
    )

    return {
        "version": 1,
        "brackets": {
            "long": {
                "stop": {"type": "atr_multiple", "k": round(k_stop, 3)},
                "tp1": {"type": "atr_multiple", "k": round(k_tp1, 3), "size_pct": 33},
                "tp2": {"type": "atr_multiple", "k": round(k_tp2, 3), "size_pct": 33},
                "tp3": {"type": "atr_multiple", "k": round(k_tp3, 3), "size_pct": 34},
            },
            "short": {
                "stop": {"type": "atr_multiple", "k": round(k_stop, 3)},
                "tp1": {"type": "atr_multiple", "k": round(k_tp1, 3), "size_pct": 33},
                "tp2": {"type": "atr_multiple", "k": round(k_tp2, 3), "size_pct": 33},
                "tp3": {"type": "atr_multiple", "k": round(k_tp3, 3), "size_pct": 34},
            },
        },
        "time_exit_hours": 24,
        "trailing": {"enabled": False},
        "_regression_meta": {
            "n_trades": len(records),
            "has_real_atr": has_real_atr,
            "r2_stop": None if math.isnan(r2_stop) else round(r2_stop, 4),
            "r2_tp1": None if math.isnan(r2_tp1) else round(r2_tp1, 4),
            "r2_tp2": None if math.isnan(r2_tp2) else round(r2_tp2, 4),
            "r2_tp3": None if math.isnan(r2_tp3) else round(r2_tp3, 4),
            "note": regression_note,
        },
    }


def _default_exit_rules(reason: str) -> dict[str, Any]:
    """Return design-doc default exit rules with a note."""
    return {
        "version": 1,
        "brackets": {
            "long": {
                "stop": {"type": "atr_multiple", "k": 1.5},
                "tp1": {"type": "atr_multiple", "k": 1.0, "size_pct": 33},
                "tp2": {"type": "atr_multiple", "k": 2.0, "size_pct": 33},
                "tp3": {"type": "atr_multiple", "k": 3.0, "size_pct": 34},
            },
            "short": {
                "stop": {"type": "atr_multiple", "k": 1.5},
                "tp1": {"type": "atr_multiple", "k": 1.0, "size_pct": 33},
                "tp2": {"type": "atr_multiple", "k": 2.0, "size_pct": 33},
                "tp3": {"type": "atr_multiple", "k": 3.0, "size_pct": 34},
            },
        },
        "time_exit_hours": 24,
        "trailing": {"enabled": False},
        "_regression_meta": {
            "note": f"design_doc_defaults_{reason}",
        },
    }
