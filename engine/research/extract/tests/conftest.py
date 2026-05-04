"""
Shared test fixtures for engine.research.extract tests.
"""

from __future__ import annotations

import gzip
import json
import tempfile
from pathlib import Path

import pytest


def _write_gz(out_dir: Path, filename: str, data: dict | list) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    p = out_dir / filename
    with gzip.open(str(p), "wt", encoding="utf-8") as f:
        json.dump(data, f)
    return p


@pytest.fixture
def minimal_dump_dir(tmp_path: Path) -> Path:
    """Create a minimal raw_dump directory with fixture data."""
    dump_dir = tmp_path / "raw_dump" / "2026-05-05"
    dump_dir.mkdir(parents=True)

    # api_signals.json.gz
    signals_data = {
        "signals": [
            {
                "ticker": "BTC",
                "signal_name": "vwap_reclaim",
                "tier": 1,
                "severity": "alert",
                "bias": "long",
                "timestamp": 1777900000.0,
                "confidence": 0.8,
                "value": 80000.0,
                "detail": "Price reclaimed daily VWAP at 80000.00",
                "count": 1,
            },
            {
                "ticker": "ETH",
                "signal_name": "range_resistance_touch",
                "tier": 1,
                "severity": "alert",
                "bias": "short",
                "timestamp": 1777900100.0,
                "confidence": 0.7,
                "value": 1.07,
                "detail": "Price 2000.00 within 0.9% of 56d high 2020.00",
                "count": 1,
            },
            {
                "ticker": "SOL",
                "signal_name": "oi_surge",
                "tier": 1,
                "severity": "alert",
                "bias": "long",
                "timestamp": 1777900200.0,
                "confidence": 0.75,
                "value": 2.5,
                "detail": "OI surged 0.5% in 4h ($1,000,000; z=2.1)",
                "count": 1,
            },
            {
                "ticker": "DOGE",
                "signal_name": "oi_divergence_bullish",
                "tier": 1,
                "severity": "alert",
                "bias": "long",
                "timestamp": 1777900300.0,
                "confidence": 0.65,
                "value": -3.5,
                "detail": "Price falling but OI falling -3.5%",
                "count": 1,
            },
            {
                "ticker": "BTC",
                "signal_name": "momentum_shift",
                "tier": 1,
                "severity": "alert",
                "bias": "short",
                "timestamp": 1777900400.0,
                "confidence": 0.65,
                "value": -0.33,
                "detail": "Bearish EMA cross: 8 EMA crossed below 21 EMA on 2h",
                "count": 1,
            },
        ]
    }
    _write_gz(dump_dir, "api_signals.json.gz", signals_data)

    # api_trades.json.gz — include a mix of wins/losses with atr_at_entry
    trades = []
    # Long trades: entry > stop, tp1 < tp2 < tp3 (for short it's reversed)
    trade_templates = [
        # direction, entry, stop, tp1, tp2, tp3, exit_reason, pnl_pct, atr, slot_util, risk_pct, regime, score
        ("long", 100.0, 98.5, 101.0, 102.0, 103.0, "tp3", 3.0, 0.015, 0.25, 1.0, "range", 3.0),
        ("long", 100.0, 98.5, 101.0, 102.0, 103.0, "stop", -1.5, 0.015, 0.25, 1.0, "range", 3.0),
        ("long", 50.0, 49.25, 50.5, 51.0, 51.5, "tp2", 2.0, 0.0075, 0.4, 1.5, "bullish", 4.0),
        ("short", 100.0, 101.5, 99.0, 98.0, 97.0, "tp3", 3.0, 0.015, 0.6, 2.0, "bearish", 2.5),
        ("short", 100.0, 101.5, 99.0, 98.0, 97.0, "stop", -1.5, 0.015, 0.6, 1.5, "bearish", 2.5),
        ("long", 200.0, 197.0, 203.0, 206.0, 209.0, "tp1", 1.5, 0.03, 0.1, 1.0, "range", 3.5),
        ("long", 200.0, 197.0, 203.0, 206.0, 209.0, "stop", -1.5, 0.03, 0.1, 1.0, "sideways", 1.0),
        ("short", 200.0, 203.0, 197.0, 194.0, 191.0, "tp3", 3.0, 0.03, 0.3, 2.5, "down", 4.5),
        ("long", 1000.0, 985.0, 1010.0, 1020.0, 1030.0, "tp2", 2.0, 0.015, 0.5, 1.0, "range", 2.0),
        ("long", 1000.0, 985.0, 1010.0, 1020.0, 1030.0, "stop", -1.5, 0.015, 0.5, 1.5, "range", 2.0),
    ]
    signal_names_cycle = [
        "vwap_reclaim", "range_resistance_touch", "oi_surge", "momentum_shift",
        "oi_divergence_bullish", "vwap_reclaim", "range_resistance_touch",
        "oi_surge", "momentum_shift", "oi_divergence_bearish",
    ]
    for i, (direction, entry, stop, tp1, tp2, tp3, exit_r, pnl, atr, slot_u, risk_p, regime, score) in enumerate(trade_templates):
        sig_name = signal_names_cycle[i % len(signal_names_cycle)]
        trades.append({
            "id": f"trade-{i:04d}",
            "alert_id": f"alert-{i:04d}",
            "timestamp_entry": 1777800000.0 + i * 3600,
            "timestamp_exit": 1777800000.0 + i * 3600 + 3600,
            "ticker": "BTC",
            "direction": direction,
            "entry_price": entry,
            "exit_price": exit_r == "stop" and stop or tp3,
            "stop_price": stop,
            "tp1": tp1,
            "tp2": tp2,
            "tp3": tp3,
            "size_usd": 1000.0,
            "size_coin": 1000.0 / entry,
            "leverage": 2,
            "exit_reason": exit_r,
            "pnl_usd": pnl * 10,
            "pnl_pct": pnl,
            "duration_hours": 4.0 + i * 0.5,
            "entry_conviction": "LOW",
            "regime_at_entry": regime,
            "effective_score": score,
            "slot_utilization": slot_u,
            "risk_pct": risk_p,
            "atr_at_entry": atr,
            "tp1_hit": 1 if exit_r in ("tp1", "tp2", "tp3") else 0,
            "tp2_hit": 1 if exit_r in ("tp2", "tp3") else 0,
            "tp3_hit": 1 if exit_r == "tp3" else 0,
            "window_signals_json": json.dumps([{"name": sig_name, "tier": 1, "severity": "alert", "bias": direction, "confidence": 0.7}]),
            "signals": [{"name": sig_name, "tier": 1}],
            "entry_meta_json": json.dumps({"dominant_signal_name": sig_name}),
            "regime_penalty_applied": 0,
            "conviction_before_penalty": "LOW",
        })

    _write_gz(dump_dir, "api_trades.json.gz", {"trades": trades})

    # api_formula-attribution.json.gz
    fa_data = {
        "status": "ok",
        "diagnostic_only": True,
        "sample_rows": 100,
        "settings": [
            {
                "setting": "portfolio_capacity",
                "n": 100,
                "variables": 3,
                "watch_variables": 1,
                "low_sample_variables": 0,
                "status": "watch",
                "top_suspects": [
                    {"setting": "portfolio_capacity", "variable": "slot_utilization", "bucket": "67-99%",
                     "n": 51, "accepted_n": 5, "labeled_n": 51, "tp_n": 17, "stop_n": 34, "timeout_n": 0,
                     "score_n": 51, "avg_score": -0.16, "stop_rate": 0.667, "tp_rate": 0.333},
                    {"setting": "portfolio_capacity", "variable": "slot_utilization", "bucket": "34-66%",
                     "n": 626, "accepted_n": 18, "labeled_n": 626, "tp_n": 119, "stop_n": 287, "timeout_n": 0,
                     "score_n": 626, "avg_score": -0.38, "stop_rate": 0.707, "tp_rate": 0.293},
                    {"setting": "portfolio_capacity", "variable": "slot_utilization", "bucket": "0-33%",
                     "n": 371, "accepted_n": 37, "labeled_n": 371, "tp_n": 117, "stop_n": 139, "timeout_n": 0,
                     "score_n": 371, "avg_score": -0.06, "stop_rate": 0.543, "tp_rate": 0.457},
                ],
            },
            {
                "setting": "tier2_score",
                "n": 100,
                "variables": 2,
                "watch_variables": 0,
                "low_sample_variables": 0,
                "status": "ok",
                "top_suspects": [
                    {"setting": "tier2_score", "variable": "tier2_score", "bucket": "2-5",
                     "n": 553, "accepted_n": 23, "labeled_n": 553, "tp_n": 164, "stop_n": 148, "timeout_n": 0,
                     "score_n": 553, "avg_score": 0.01, "stop_rate": 0.474, "tp_rate": 0.526},
                ],
            },
        ],
        "variables": [
            {"setting": "portfolio_capacity", "variable": "slot_utilization", "bucket": "67-99%",
             "n": 51, "accepted_n": 5, "labeled_n": 51, "tp_n": 17, "stop_n": 34, "timeout_n": 0,
             "score_n": 51, "avg_score": -0.16, "stop_rate": 0.667, "tp_rate": 0.333},
            {"setting": "portfolio_capacity", "variable": "slot_utilization", "bucket": "34-66%",
             "n": 626, "accepted_n": 18, "labeled_n": 626, "tp_n": 119, "stop_n": 287, "timeout_n": 0,
             "score_n": 626, "avg_score": -0.38, "stop_rate": 0.707, "tp_rate": 0.293},
            {"setting": "portfolio_capacity", "variable": "slot_utilization", "bucket": "0-33%",
             "n": 371, "accepted_n": 37, "labeled_n": 371, "tp_n": 117, "stop_n": 139, "timeout_n": 0,
             "score_n": 371, "avg_score": -0.06, "stop_rate": 0.543, "tp_rate": 0.457},
            {"setting": "tier2_score", "variable": "tier2_score", "bucket": "2-5",
             "n": 553, "accepted_n": 23, "labeled_n": 553, "tp_n": 164, "stop_n": 148, "timeout_n": 0,
             "score_n": 553, "avg_score": 0.01, "stop_rate": 0.474, "tp_rate": 0.526},
            {"setting": "regime_penalty", "variable": "penalty_applied", "bucket": "not_applied",
             "n": 1482, "accepted_n": 61, "labeled_n": 1210, "tp_n": 292, "stop_n": 511, "timeout_n": 407,
             "score_n": 1212, "avg_score": -0.39, "stop_rate": 0.422, "tp_rate": 0.241},
            {"setting": "position_sizing", "variable": "candidate_risk_pct", "bucket": "<1%",
             "n": 592, "accepted_n": 4, "labeled_n": 592, "tp_n": 165, "stop_n": 209, "timeout_n": 0,
             "score_n": 592, "avg_score": -0.07, "stop_rate": 0.559, "tp_rate": 0.441},
        ],
        "review_queue": [],
        "notes": "test fixture",
        "warnings": [],
    }
    _write_gz(dump_dir, "api_formula-attribution.json.gz", fa_data)

    # api_stats.json.gz
    _write_gz(dump_dir, "api_stats.json.gz", {
        "total_trades": 10,
        "wins": 5,
        "losses": 5,
        "win_rate": 50.0,
    })

    # api_health.json.gz
    _write_gz(dump_dir, "api_health.json.gz", {"ok": True, "db": True})

    return dump_dir
