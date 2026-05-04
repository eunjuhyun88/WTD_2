"""
engine.research.extract.parsers.buckets
=========================================
Parse trades dump into bucket_priors.parquet.

5D cube:
  signal_type   × tier2_bin × regime_bin × slot_util_bin × risk_pct_bin
  → Beta(α=1+wins, β=1+losses) posterior per cell

Since /api/closed-trades returns 404, we use /api/trades which includes
closed trades (those with exit_price set).
"""

from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Any

import pandas as pd

try:
    from scipy.stats import beta as scipy_beta
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

from research.extract.normalize import load_dump, get_trades

logger = logging.getLogger(__name__)

# Bin boundaries
TIER2_BINS = {
    "[0,1]": (0.0, 1.0),
    "[2,5]": (2.0, 5.0),
    "[6,inf)": (6.0, float("inf")),
}

REGIME_BINS = {
    "up": ["bullish", "uptrend", "trending_up", "bull"],
    "sideways": ["range", "sideways", "neutral", "consolidation"],
    "down": ["bearish", "downtrend", "trending_down", "bear"],
}

SLOT_UTIL_BINS = {
    "low": (0.0, 0.33),
    "mid": (0.33, 0.66),
    "high": (0.66, 1.0),
}

RISK_PCT_BINS = {
    "small": (0.0, 1.0),
    "mid": (1.0, 2.0),
    "large": (2.0, float("inf")),
}

# Canonical 7 signal names for the spec
SIGNAL_NAMES = [
    "vwap_reclaim",
    "range_resistance",
    "momentum_shift",
    "oi_surge",
    "oi_divergence",
    "oi_jump",
    "range_top_rejection",
]

# Mapping from API signal names → canonical
API_TO_CANONICAL = {
    "vwap_reclaim": "vwap_reclaim",
    "vwap_rejection": "vwap_reclaim",
    "range_resistance_touch": "range_resistance",
    "momentum_shift": "momentum_shift",
    "oi_surge": "oi_surge",
    "oi_divergence_bullish": "oi_divergence",
    "oi_divergence_bearish": "oi_divergence",
    "oi_jump": "oi_jump",
    "range_top_rejection": "range_top_rejection",
}


def _bin_tier2(score: float | None) -> str:
    if score is None:
        return "[2,5]"  # default to middle bin
    for bin_name, (lo, hi) in TIER2_BINS.items():
        if lo <= score <= hi:
            return bin_name
    if score > 5:
        return "[6,inf)"
    return "[0,1]"


def _bin_regime(regime: str | None) -> str:
    if regime is None:
        return "sideways"
    regime_lower = str(regime).lower()
    for bin_name, keywords in REGIME_BINS.items():
        if any(kw in regime_lower for kw in keywords):
            return bin_name
    return "sideways"


def _bin_slot_util(slot_util: float | None) -> str:
    if slot_util is None:
        return "mid"
    for bin_name, (lo, hi) in SLOT_UTIL_BINS.items():
        if lo <= slot_util < hi:
            return bin_name
    return "high" if slot_util >= 1.0 else "low"


def _bin_risk_pct(risk_pct: float | None) -> str:
    if risk_pct is None:
        return "mid"
    for bin_name, (lo, hi) in RISK_PCT_BINS.items():
        if lo <= risk_pct < hi:
            return bin_name
    return "large"


def _get_dominant_signal(trade: dict) -> str:
    """Extract dominant signal type from trade, mapped to canonical name."""
    # Try entry_meta_json first
    meta_json = trade.get("entry_meta_json")
    if meta_json:
        try:
            meta = json.loads(meta_json) if isinstance(meta_json, str) else meta_json
            dominant = meta.get("dominant_signal_name") or meta.get("trigger_signal_name")
            if dominant:
                return API_TO_CANONICAL.get(dominant, "vwap_reclaim")
        except Exception:
            pass

    # Try window_signals_json
    ws_json = trade.get("window_signals_json")
    if ws_json:
        try:
            ws = json.loads(ws_json) if isinstance(ws_json, str) else ws_json
            if ws and isinstance(ws, list):
                first_name = ws[0].get("name", "")
                return API_TO_CANONICAL.get(first_name, "vwap_reclaim")
        except Exception:
            pass

    # Try signals list
    signals = trade.get("signals")
    if signals and isinstance(signals, list):
        for sig in signals:
            name = sig.get("name", "")
            if name in API_TO_CANONICAL:
                return API_TO_CANONICAL[name]

    return "vwap_reclaim"  # default


def _is_win(trade: dict) -> bool | None:
    """
    Determine if trade was a win.
    Win = exit_reason in (tp1, tp2, tp3) OR pnl_pct > 0.
    Loss = exit_reason in (stop, timeout) OR pnl_pct < 0.
    """
    exit_reason = trade.get("exit_reason", "")
    pnl_pct = trade.get("pnl_pct")
    pnl_usd = trade.get("pnl_usd")

    if exit_reason in ("tp1", "tp2", "tp3"):
        return True
    if exit_reason in ("stop", "stoploss"):
        return False
    if exit_reason == "timeout":
        return False  # neutral, but count as loss for conservative prior

    # Fall back to PnL
    if pnl_pct is not None:
        return float(pnl_pct) > 0
    if pnl_usd is not None:
        return float(pnl_usd) > 0

    return None  # unknown


def _beta_posterior(wins: int, losses: int) -> tuple[float, float, float, float]:
    """
    Compute Beta(α=1+wins, β=1+losses) posterior stats.

    Returns (alpha, beta, mean, std).
    """
    alpha = 1 + wins
    beta_param = 1 + losses

    if HAS_SCIPY:
        mean, var = scipy_beta.stats(alpha, beta_param, moments="mv")
        std = float(var) ** 0.5
    else:
        # Analytical: Beta(α,β) mean = α/(α+β), var = αβ/((α+β)²(α+β+1))
        a, b = alpha, beta_param
        mean = a / (a + b)
        var = (a * b) / ((a + b) ** 2 * (a + b + 1))
        std = var ** 0.5

    return float(alpha), float(beta_param), float(mean), float(std)


def extract_bucket_priors(dump_dir: Path) -> pd.DataFrame:
    """
    Extract bucket priors from trades dump.

    Returns
    -------
    pd.DataFrame
        DataFrame with columns matching §P7.
    """
    dump = load_dump(dump_dir)
    trades = get_trades(dump)

    if not trades:
        logger.warning("No trades; returning empty DataFrame")
        return pd.DataFrame(columns=[
            "signal_type", "tier2_bin", "regime_bin", "slot_util_bin", "risk_pct_bin",
            "n", "wins", "losses", "posterior_alpha", "posterior_beta",
            "posterior_mean", "posterior_std", "avg_pnl", "avg_holding_h",
            "stop_rate", "tp3_rate",
        ])

    # Filter to closed trades (have exit_price)
    closed = [t for t in trades if t.get("exit_price") is not None]
    logger.info("Total trades: %d, closed: %d", len(trades), len(closed))

    # Build cell aggregations
    cells: dict[tuple, dict] = {}

    for trade in closed:
        win = _is_win(trade)
        if win is None:
            continue

        signal_type = _get_dominant_signal(trade)
        tier2_bin = _bin_tier2(trade.get("effective_score"))
        regime_bin = _bin_regime(trade.get("regime_at_entry"))
        slot_util_bin = _bin_slot_util(trade.get("slot_utilization"))
        risk_pct_bin = _bin_risk_pct(trade.get("risk_pct"))

        key = (signal_type, tier2_bin, regime_bin, slot_util_bin, risk_pct_bin)

        if key not in cells:
            cells[key] = {
                "wins": 0,
                "losses": 0,
                "pnl_sum": 0.0,
                "holding_sum": 0.0,
                "stop_count": 0,
                "tp3_count": 0,
            }

        cell = cells[key]
        if win:
            cell["wins"] += 1
        else:
            cell["losses"] += 1

        pnl = trade.get("pnl_pct")
        if pnl is not None:
            cell["pnl_sum"] += float(pnl)

        dur = trade.get("duration_hours")
        if dur is not None:
            cell["holding_sum"] += float(dur)

        exit_reason = trade.get("exit_reason", "")
        if exit_reason in ("stop", "stoploss"):
            cell["stop_count"] += 1
        if exit_reason == "tp3":
            cell["tp3_count"] += 1

    # Build DataFrame rows
    rows = []
    for (signal_type, tier2_bin, regime_bin, slot_util_bin, risk_pct_bin), cell in cells.items():
        n = cell["wins"] + cell["losses"]
        if n == 0:
            continue

        alpha, beta_val, mean, std = _beta_posterior(cell["wins"], cell["losses"])
        avg_pnl = cell["pnl_sum"] / n if n > 0 else 0.0
        avg_holding_h = cell["holding_sum"] / n if n > 0 else 0.0
        stop_rate = cell["stop_count"] / n if n > 0 else 0.0
        tp3_rate = cell["tp3_count"] / n if n > 0 else 0.0

        rows.append({
            "signal_type": signal_type,
            "tier2_bin": tier2_bin,
            "regime_bin": regime_bin,
            "slot_util_bin": slot_util_bin,
            "risk_pct_bin": risk_pct_bin,
            "n": n,
            "wins": cell["wins"],
            "losses": cell["losses"],
            "posterior_alpha": round(alpha, 4),
            "posterior_beta": round(beta_val, 4),
            "posterior_mean": round(mean, 4),
            "posterior_std": round(std, 4),
            "avg_pnl": round(avg_pnl, 4),
            "avg_holding_h": round(avg_holding_h, 4),
            "stop_rate": round(stop_rate, 4),
            "tp3_rate": round(tp3_rate, 4),
        })

    df = pd.DataFrame(rows)
    if df.empty:
        logger.warning("No valid cells produced")
    else:
        n_min3 = (df["n"] >= 3).sum()
        logger.info("Bucket priors: %d cells total, %d with n>=3", len(df), n_min3)

    return df
