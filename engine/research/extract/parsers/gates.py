"""
engine.research.extract.parsers.gates
=======================================
Parse formula-attribution dump into gate_specs.yaml content.

Gates:
  G1_tier2_score     — from formula-attribution tier2_score setting
  G2_regime_penalty  — from regime_penalty setting
  G3_portfolio_capacity — from portfolio_capacity / slot_utilization buckets
  G4_position_sizing — from position_sizing setting
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from research.extract.normalize import load_dump, get_formula_attribution

logger = logging.getLogger(__name__)


def _find_variable_rows(variables: list[dict], setting: str, variable: str) -> list[dict]:
    """Filter variable rows by setting and variable name."""
    return [
        v for v in variables
        if v.get("setting") == setting and v.get("variable") == variable
    ]


def _find_setting(settings: list[dict], name: str) -> dict | None:
    """Find a setting block by name."""
    for s in settings:
        if s.get("setting") == name:
            return s
    return None


def _build_g1_tier2_score(fa: dict) -> dict:
    """
    Build G1_tier2_score gate spec from formula-attribution data.

    The API provides tier2_score buckets under settings/variables.
    Observed buckets from API: '2-5', and 'entry_flip' variable.
    We map these to the design doc's 3 bins: [0,1], [2,5], [6,inf).
    """
    variables: list[dict] = fa.get("variables", [])
    settings: list[dict] = fa.get("settings", [])

    # Find tier2_score rows
    tier2_rows = _find_variable_rows(variables, "tier2_score", "tier2_score")

    # Build bins from observed data
    bins: dict[str, dict] = {}
    for row in tier2_rows:
        bucket = row.get("bucket", "")
        n = row.get("n", 0)
        accepted = row.get("accepted_n", 0)
        tp_n = row.get("tp_n", 0)
        stop_n = row.get("stop_n", 0)
        total_outcome = tp_n + stop_n
        accept_rate = accepted / n if n > 0 else 0.0
        stop_rate = stop_n / total_outcome if total_outcome > 0 else 0.0

        # Map API bucket names to design doc bins
        if bucket == "2-5":
            key = "[2,5]"
        elif bucket in ("<2", "0-1", "0-2", "<1", "0-1.9"):
            key = "[0,1]"
        elif bucket in (">5", "6+", "5+", ">6", "6-inf"):
            key = "[6,inf)"
        else:
            key = None  # skip unknown buckets — don't pollute the schema

        if key is not None:
            bins[key] = {
                "observed_n": n,
                "accept_rate": round(accept_rate, 3),
                "stop_rate": round(stop_rate, 3),
            }

    # If no tier2_score variable rows found, try to infer from entry_flip rows
    if not bins:
        logger.info("No tier2_score variable rows; inferring from entry_flip + setting totals")
        tier2_setting = _find_setting(settings, "tier2_score")
        if tier2_setting:
            total_n = tier2_setting.get("n", 0)
            top_suspects = tier2_setting.get("top_suspects", [])
            for ts in top_suspects:
                if ts.get("variable") == "tier2_score" and ts.get("bucket") == "2-5":
                    n = ts.get("n", 0)
                    accepted = ts.get("accepted_n", 0)
                    tp_n = ts.get("tp_n", 0)
                    stop_n = ts.get("stop_n", 0)
                    total_outcome = tp_n + stop_n
                    accept_rate = accepted / n if n > 0 else 0.0
                    stop_rate = stop_n / total_outcome if total_outcome > 0 else 0.0
                    bins["[2,5]"] = {
                        "observed_n": n,
                        "accept_rate": round(accept_rate, 3),
                        "stop_rate": round(stop_rate, 3),
                    }

    # Ensure all 3 required bins exist, using placeholder if needed
    required_bins = ["[0,1]", "[2,5]", "[6,inf)"]
    for b in required_bins:
        if b not in bins:
            logger.warning("G1 bin %s not observed in data; using placeholder", b)
            bins[b] = {
                "observed_n": 0,
                "accept_rate": 0.0,
                "stop_rate": 0.0,
                "_note": "insufficient_data",
            }

    return {
        "accept_range": [2, 5],
        "bins": bins,
        "weights": {
            "vwap_reclaim": 1.0,
            "range_resistance": 1.2,
            "momentum_shift": 1.0,
            "oi_surge": 1.3,
            "oi_divergence": 1.1,
            "oi_jump": 1.2,
            "range_top_rejection": 1.0,
        },
    }


def _build_g2_regime_penalty(fa: dict) -> dict:
    """Build G2_regime_penalty gate spec from formula-attribution data."""
    variables: list[dict] = fa.get("variables", [])
    regime_rows = [v for v in variables if v.get("setting") == "regime_penalty"]

    vars_found = list({r.get("variable") for r in regime_rows})
    logger.info("G2 regime_penalty variables observed: %s", vars_found)

    return {
        "vars": [
            "btc_trend_4h",
            "btc_dom_change",
            "total_oi_z",
            "funding_skew",
            "dxy_proxy",
            "btc_above_ema200",
            "total3_dominance",
            "alt_breadth",
            "vol_regime",
            "regime_label",
        ],
        "rules": "# TODO: insufficient data — regime rules not directly exposed by API",
        "observed_vars": vars_found,
    }


def _build_g3_portfolio_capacity(fa: dict) -> dict:
    """Build G3_portfolio_capacity gate spec from slot_utilization buckets."""
    variables: list[dict] = fa.get("variables", [])
    slot_rows = _find_variable_rows(variables, "portfolio_capacity", "slot_utilization")

    # API buckets: '0-33%', '34-66%', '67-99%'
    slot_bins: dict[str, dict] = {}
    for row in slot_rows:
        bucket = row.get("bucket", "")
        n = row.get("n", 0)
        accepted = row.get("accepted_n", 0)
        tp_n = row.get("tp_n", 0)
        stop_n = row.get("stop_n", 0)
        accept_rate = accepted / n if n > 0 else 0.0
        total_outcome = tp_n + stop_n
        stop_rate = stop_n / total_outcome if total_outcome > 0 else 0.0

        # Map to design doc bins — use only the 3 canonical bins
        if bucket == "0-33%":
            key = "[0,33]"
        elif bucket == "34-66%":
            key = "[34,66]"
        elif bucket == "67-99%":
            key = "[67,99]"
        else:
            # Skip extra buckets like "full" (100%) — not in canonical schema
            continue

        slot_bins[key] = {
            "observed_n": n,
            "accept_rate": round(accept_rate, 4),
            "stop_rate": round(stop_rate, 3),
        }

    # Also try top_suspects if variables is empty
    if not slot_bins:
        settings = fa.get("settings", [])
        pc_setting = _find_setting(settings, "portfolio_capacity")
        if pc_setting:
            for ts in pc_setting.get("top_suspects", []):
                if ts.get("variable") == "slot_utilization":
                    bucket = ts.get("bucket", "")
                    n = ts.get("n", 0)
                    accepted = ts.get("accepted_n", 0)
                    tp_n = ts.get("tp_n", 0)
                    stop_n = ts.get("stop_n", 0)
                    accept_rate = accepted / n if n > 0 else 0.0
                    total_outcome = tp_n + stop_n
                    stop_rate = stop_n / total_outcome if total_outcome > 0 else 0.0
                    key_map = {"0-33%": "[0,33]", "34-66%": "[34,66]", "67-99%": "[67,99]"}
                    key = key_map.get(bucket, bucket)
                    slot_bins[key] = {
                        "observed_n": n,
                        "accept_rate": round(accept_rate, 4),
                        "stop_rate": round(stop_rate, 3),
                    }

    return {
        "max_open_positions": 8,
        "slot_util_bins": slot_bins,
        "correlation_threshold": 0.7,
    }


def _build_g4_position_sizing(fa: dict) -> dict:
    """Build G4_position_sizing gate spec from position_sizing data."""
    variables: list[dict] = fa.get("variables", [])
    ps_rows = [v for v in variables if v.get("setting") == "position_sizing"]

    # Extract risk_pct observed range from candidate_risk_pct buckets
    risk_rows = [v for v in ps_rows if v.get("variable") == "candidate_risk_pct"]
    risk_buckets = [r.get("bucket") for r in risk_rows]
    logger.info("G4 candidate_risk_pct buckets observed: %s", risk_buckets)

    return {
        "min_risk_pct": 1.0,
        "max_risk_pct": 2.5,
        "leverage_default": 2,
        "sizing_formula": "risk_pct * equity / (entry - stop) / leverage",
        "vars_count": 14,
        "observed_risk_buckets": risk_buckets or ["# TODO: insufficient data"],
    }


def extract_gate_specs(dump_dir: Path) -> dict:
    """
    Extract gate specifications from raw dump.

    Parameters
    ----------
    dump_dir : Path
        Directory containing crawler output (.json.gz files).

    Returns
    -------
    dict
        Gate specs dict matching §P5 schema.
    """
    dump = load_dump(dump_dir)
    fa = get_formula_attribution(dump)

    if not fa:
        logger.warning("No formula-attribution data; returning minimal gate specs")
        return {
            "G1_tier2_score": {},
            "G2_regime_penalty": {},
            "G3_portfolio_capacity": {},
            "G4_position_sizing": {},
        }

    logger.info("Building gate specs from formula-attribution data")
    return {
        "G1_tier2_score": _build_g1_tier2_score(fa),
        "G2_regime_penalty": _build_g2_regime_penalty(fa),
        "G3_portfolio_capacity": _build_g3_portfolio_capacity(fa),
        "G4_position_sizing": _build_g4_position_sizing(fa),
    }


def build_gate_specs_yaml_dict(dump_dir: Path) -> dict:
    """
    Build the full gate_specs.yaml content dict.
    """
    gates = extract_gate_specs(dump_dir)
    return {
        "version": 1,
        "gates": gates,
    }
