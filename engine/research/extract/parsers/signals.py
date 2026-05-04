"""
engine.research.extract.parsers.signals
=========================================
Parse raw signal dump into signal_specs.yaml content.

Signal name mapping from API → spec canonical names:
  vwap_reclaim           → vwap_reclaim
  vwap_rejection         → (implicit short side of vwap_reclaim)
  range_resistance_touch → range_resistance
  momentum_shift         → momentum_shift
  oi_surge               → oi_surge
  oi_divergence_bullish  → oi_divergence (long)
  oi_divergence_bearish  → oi_divergence (short)
  (oi_jump: inferred from oi_surge short-window)
  (range_top_rejection: inferred from range_resistance_touch bias=short)

The design doc specifies 7 canonical signal names. We map observed API names
to the canonical set and infer parameters from observed values.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from research.extract.normalize import load_dump, get_signals

logger = logging.getLogger(__name__)

# Canonical signal specs from design doc §P4
# These are the ground-truth definitions; we augment with observed data.
_CANONICAL_SPECS: list[dict] = [
    {
        "name": "vwap_reclaim",
        "side": ["long"],
        "timeframe": "1h",
        "condition": {
            "type": "cross_above",
            "base": "vwap_session",
            "lookback": 1,
            "confirm_bars": 1,
        },
    },
    {
        "name": "range_resistance",
        "side": ["long"],
        "timeframe": "1d",
        "condition": {
            "type": "proximity_to_high",
            "lookback_days": 56,
            "threshold_pct": 0.9,
        },
    },
    {
        "name": "momentum_shift",
        "side": ["long", "short"],
        "timeframe": "2h",
        "condition": {
            "type": "ema_cross",
            "fast": 8,
            "slow": 21,
            "confirm": "macd_hist_sign_flip",
        },
    },
    {
        "name": "oi_surge",
        "side": ["long", "short"],
        "timeframe": "4h",
        "condition": {
            "type": "zscore",
            "var": "open_interest",
            "window": "4h",
            "threshold": 2.0,
        },
    },
    {
        "name": "oi_divergence",
        "side": ["long", "short"],
        "timeframe": "4h",
        "condition": {
            "type": "sign_diff",
            "a": "price_pct_change_4h",
            "b": "oi_pct_change_4h",
            "min_oi_pct": 3.2,
        },
    },
    {
        "name": "oi_jump",
        "side": ["long", "short"],
        "timeframe": "15m",
        "condition": {
            "type": "pct_change",
            "var": "open_interest",
            "window": "15m",
            "threshold_pct": 3.2,
        },
    },
    {
        "name": "range_top_rejection",
        "side": ["short"],
        "timeframe": "4h",
        "condition": {
            "type": "rejection",
            "reference": "range_high_20",
            "pattern": "bearish_engulfing|upper_wick",
        },
    },
]

# Map API signal names → canonical name
_API_TO_CANONICAL: dict[str, str] = {
    "vwap_reclaim": "vwap_reclaim",
    "vwap_rejection": "vwap_reclaim",  # opposite side, same signal family
    "range_resistance_touch": "range_resistance",
    "momentum_shift": "momentum_shift",
    "oi_surge": "oi_surge",
    "oi_divergence_bullish": "oi_divergence",
    "oi_divergence_bearish": "oi_divergence",
    "oi_jump": "oi_jump",
    "range_top_rejection": "range_top_rejection",
}


def _extract_range_resistance_threshold(signals: list[dict]) -> float | None:
    """
    Extract threshold_pct from range_resistance_touch detail strings.
    e.g. 'Price 80008.50 within 0.9% of 56d high 80762.00' → 0.9
    """
    pcts = []
    for s in signals:
        if s.get("signal_name") == "range_resistance_touch":
            detail = s.get("detail", "")
            m = re.search(r"within\s+([\d.]+)%", detail)
            if m:
                pcts.append(float(m.group(1)))
    if not pcts:
        return None
    return round(max(pcts), 2)  # upper bound threshold


def _extract_oi_surge_zscore(signals: list[dict]) -> float | None:
    """
    Extract z-score threshold from oi_surge detail strings.
    e.g. 'OI surged 0.2% in 4h ($2,976,843; z=2.0)' → 2.0
    """
    zscores = []
    for s in signals:
        if s.get("signal_name") == "oi_surge":
            detail = s.get("detail", "")
            m = re.search(r"z=([\d.]+)", detail)
            if m:
                zscores.append(float(m.group(1)))
    if not zscores:
        return None
    return round(min(zscores), 2)  # minimum observed z-score (threshold)


def _extract_oi_divergence_min_pct(signals: list[dict]) -> float | None:
    """
    Extract min OI pct from divergence signals.
    e.g. 'Price falling but OI falling -3.3%' → 3.3
    """
    pcts = []
    for s in signals:
        if s.get("signal_name") in ("oi_divergence_bullish", "oi_divergence_bearish"):
            # value field contains the OI pct change
            val = s.get("value")
            if val is not None:
                pcts.append(abs(float(val)))
    if not pcts:
        return None
    return round(min(pcts), 2)


def _enrich_specs(specs: list[dict], signals: list[dict]) -> list[dict]:
    """
    Enrich canonical specs with observed data from raw signals.
    Only updates numeric thresholds where we have real observations.
    """
    enriched = []
    for spec in specs:
        spec = dict(spec)  # shallow copy
        spec["condition"] = dict(spec["condition"])  # copy condition too
        name = spec["name"]

        if name == "range_resistance":
            pct = _extract_range_resistance_threshold(signals)
            if pct is not None:
                spec["condition"]["threshold_pct"] = pct
                logger.info("range_resistance threshold_pct observed: %.2f", pct)

        elif name == "oi_surge":
            z = _extract_oi_surge_zscore(signals)
            if z is not None:
                spec["condition"]["threshold"] = z
                logger.info("oi_surge zscore threshold observed: %.2f", z)

        elif name == "oi_divergence":
            min_pct = _extract_oi_divergence_min_pct(signals)
            if min_pct is not None:
                spec["condition"]["min_oi_pct"] = min_pct
                logger.info("oi_divergence min_oi_pct observed: %.2f", min_pct)

        enriched.append(spec)

    return enriched


def extract_signal_specs(dump_dir: Path) -> list[dict]:
    """
    Extract signal specifications from raw dump.

    Parameters
    ----------
    dump_dir : Path
        Directory containing crawler output (.json.gz files).

    Returns
    -------
    list[dict]
        List of signal spec dicts matching §P4 schema.
    """
    dump = load_dump(dump_dir)
    signals = get_signals(dump)

    if not signals:
        logger.warning("No signals found in dump; returning canonical defaults")
        return _CANONICAL_SPECS

    logger.info("Loaded %d signal events; enriching specs", len(signals))
    api_names = set(s.get("signal_name", "") for s in signals)
    logger.info("Observed API signal names: %s", api_names)

    enriched = _enrich_specs(_CANONICAL_SPECS, signals)
    return enriched


def build_signal_specs_yaml_dict(dump_dir: Path, captured_at: str | None = None) -> dict:
    """
    Build the full signal_specs.yaml content dict.

    Parameters
    ----------
    dump_dir : Path
    captured_at : str, optional
        ISO timestamp string. Defaults to now.

    Returns
    -------
    dict
        Ready to dump as YAML.
    """
    if captured_at is None:
        captured_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    specs = extract_signal_specs(dump_dir)
    return {
        "version": 1,
        "captured_at": captured_at,
        "signals": specs,
    }
