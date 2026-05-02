"""W-0367/W-0368: Alpha quality aggregation — Welch t-test + BH-FDR + Spearman + decay detection."""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import numpy as np

log = logging.getLogger("engine.research.alpha_quality")

HORIZONS = [1, 4, 24, 72]
INDICATOR_FIELDS = [
    "cvd_change_zscore",
    "oi_change_1h_zscore",
    "oi_change_24h_zscore",
    "bb_squeeze",
    "oi_change_1h",
    "oi_change_24h",
    "vol_zscore",
]


def aggregate(lookback_days: int = 30, pattern_slug: str | None = None) -> dict[str, Any]:
    """Compute alpha quality report for all patterns (or one pattern).

    Returns dict with keys: patterns, summary, computed_at.
    Each entry in patterns has Welch t-test, BH-FDR adjusted p-value,
    bootstrap CI for mean P&L, and Spearman correlation per indicator.
    """
    from research.signal_event_store import fetch_resolved_outcomes
    from research.validation.stats import welch_t_test, bh_correct, bootstrap_ci

    rows = fetch_resolved_outcomes(lookback_days=lookback_days, pattern_slug=pattern_slug)

    if not rows:
        return {
            "patterns": [],
            "summary": {"n_signals": 0, "note": "no data"},
            "computed_at": datetime.now(timezone.utc).isoformat(),
        }

    # Group by (pattern, horizon_h)
    groups: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for r in rows:
        groups[(r["pattern"], r["horizon_h"])].append(r)

    # Welch t-test per (pattern, horizon)
    raw_pvalues: list[float] = []
    test_keys: list[tuple[str, int]] = []
    test_stats: dict[tuple[str, int], dict] = {}

    baseline = np.zeros(1)

    for (pattern, horizon), group in groups.items():
        pnls = [r["realized_pnl_pct"] for r in group if r.get("realized_pnl_pct") is not None]
        if len(pnls) < 5:
            continue

        pnls_arr = np.array(pnls, dtype=float)

        # Welch t-test against zero baseline
        try:
            ttest_result = welch_t_test(pnls_arr, baseline)
            stat = ttest_result.t_statistic
            pval = ttest_result.p_value
        except Exception:
            pval = 1.0
            stat = 0.0

        outcomes = [r.get("triple_barrier_outcome") for r in group]
        n_total = len(outcomes)
        profit_take_rate = sum(1 for o in outcomes if o == "profit_take") / max(n_total, 1)
        stop_loss_rate = sum(1 for o in outcomes if o == "stop_loss") / max(n_total, 1)

        # Bootstrap CI for mean P&L — returns (lower, upper, point_estimate)
        try:
            ci_low, ci_high, _point = bootstrap_ci(pnls_arr, n_iter=500)
            ci_low = float(ci_low)
            ci_high = float(ci_high)
        except Exception:
            ci_low, ci_high = float("nan"), float("nan")

        raw_pvalues.append(pval)
        test_keys.append((pattern, horizon))
        test_stats[(pattern, horizon)] = {
            "pattern": pattern,
            "horizon_h": horizon,
            "n_signals": n_total,
            "mean_pnl_pct": float(np.mean(pnls_arr)),
            "std_pnl_pct": float(np.std(pnls_arr)),
            "ci_low": ci_low,
            "ci_high": ci_high,
            "t_stat": float(stat),
            "p_value_raw": float(pval),
            "profit_take_rate": profit_take_rate,
            "stop_loss_rate": stop_loss_rate,
            "spearman": _spearman_indicators(group),
        }

    # BH-FDR correction over all (pattern, horizon) pairs
    if raw_pvalues:
        try:
            _rejected_arr, corrected = bh_correct(np.array(raw_pvalues), alpha=0.10)
            adjusted = corrected  # corrected_p is second return value
        except Exception:
            adjusted = raw_pvalues

        for i, key in enumerate(test_keys):
            if key in test_stats:
                adj_p = float(adjusted[i]) if hasattr(adjusted, "__getitem__") else float(adjusted)
                test_stats[key]["p_value_adjusted"] = adj_p
                test_stats[key]["significant"] = adj_p < 0.10

    results = sorted(test_stats.values(), key=lambda x: x.get("p_value_adjusted", 1.0))
    n_significant = sum(1 for r in results if r.get("significant", False))

    return {
        "patterns": results,
        "summary": {
            "n_tests": len(results),
            "n_significant": n_significant,
            "lookback_days": lookback_days,
            "total_signals": len(rows),
            "bh_alpha": 0.10,
        },
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


def _spearman_indicators(group: list[dict]) -> dict[str, float]:
    """Compute Spearman correlation of each indicator field vs realized_pnl_pct."""
    from scipy.stats import spearmanr

    result: dict[str, float] = {}

    for field in INDICATOR_FIELDS:
        vals: list[float] = []
        pnl_matched: list[float] = []
        for r in group:
            cs = r.get("component_scores") or {}
            snapshot = cs.get("indicator_snapshot") or {}
            v = snapshot.get(field)
            p = r.get("realized_pnl_pct")
            if v is not None and p is not None:
                vals.append(float(v))
                pnl_matched.append(float(p))

        if len(vals) >= 5:
            try:
                corr, _ = spearmanr(vals, pnl_matched)
                result[field] = float(corr) if not np.isnan(corr) else 0.0
            except Exception:
                result[field] = 0.0

    return result


# ---------------------------------------------------------------------------
# W-0368: Decay detection
# ---------------------------------------------------------------------------

def detect_decay(
    pattern_slug: str,
    window_days: int = 7,
    baseline_days: int = 30,
    sigma_threshold: float = 2.0,
) -> dict[str, Any]:
    """Detect statistical decay in pattern alpha vs rolling baseline.

    Compares recent profit_take_rate (window_days) to baseline (baseline_days)
    using bootstrap std. Returns z_score, alert flag, and rates.

    Prerequisite: ≥ 20 signals per pattern (W-0367 AC8). If insufficient data,
    returns alert=False with a note.
    """
    from research.signal_event_store import fetch_resolved_outcomes
    from research.validation.stats import bootstrap_ci

    baseline_rows = fetch_resolved_outcomes(lookback_days=baseline_days, pattern_slug=pattern_slug)
    recent_rows = fetch_resolved_outcomes(lookback_days=window_days, pattern_slug=pattern_slug)

    def _profit_take_rate(rows: list[dict]) -> float:
        if not rows:
            return 0.0
        return sum(1 for r in rows if r.get("triple_barrier_outcome") == "profit_take") / len(rows)

    if len(baseline_rows) < 20:
        return {
            "pattern": pattern_slug,
            "alert": False,
            "z_score": 0.0,
            "baseline_rate": _profit_take_rate(baseline_rows),
            "recent_rate": _profit_take_rate(recent_rows),
            "note": f"insufficient baseline data ({len(baseline_rows)} < 20 signals)",
        }

    baseline_rate = _profit_take_rate(baseline_rows)
    recent_rate = _profit_take_rate(recent_rows)

    # Bootstrap std of baseline profit_take_rate
    baseline_pnls = np.array(
        [r.get("realized_pnl_pct", 0.0) or 0.0 for r in baseline_rows], dtype=float
    )
    try:
        _, _, std_est = bootstrap_ci(baseline_pnls, n_iter=500)
        bootstrap_std = float(std_est) if std_est and float(std_est) > 0 else 0.01
    except Exception:
        bootstrap_std = 0.01

    z = (recent_rate - baseline_rate) / bootstrap_std
    alert = abs(z) >= sigma_threshold

    if alert:
        import sentry_sdk
        try:
            sentry_sdk.capture_message(
                f"Alpha decay detected: {pattern_slug} z={z:.2f} "
                f"(baseline={baseline_rate:.2%} recent={recent_rate:.2%})",
                level="warning",
            )
        except Exception:
            pass

    return {
        "pattern": pattern_slug,
        "alert": alert,
        "z_score": float(z),
        "baseline_rate": baseline_rate,
        "recent_rate": recent_rate,
        "baseline_n": len(baseline_rows),
        "recent_n": len(recent_rows),
    }
