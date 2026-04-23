"""Bounded engine-owned fact-plane read models.

This module intentionally exposes a compact, serialisable context payload
that app surfaces can migrate to without re-implementing raw provider fan-out.
The current implementation is transitional: it still reads from the existing
engine cache/loaders, but it establishes the engine as the read-model owner.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from data_cache.loader import (
    load_chain_bundle,
    load_dex_bundle,
    load_klines,
    load_macro_bundle,
    load_onchain_bundle,
    load_perp,
)
from data_cache.resample import tf_string_to_minutes
from exceptions import CacheMiss
from scanner.feature_calc import MIN_HISTORY_BARS, compute_features_table, compute_snapshot


@dataclass(frozen=True)
class FactContextBuildError(RuntimeError):
    status_code: int
    code: str
    message: str

    def to_detail(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ts_to_iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, pd.Timestamp):
        ts = value.tz_convert("UTC") if value.tzinfo is not None else value.tz_localize("UTC")
        return ts.isoformat()
    if isinstance(value, datetime):
        dt = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return None


def _json_scalar(value: Any) -> Any:
    if isinstance(value, pd.Timestamp):
        return _ts_to_iso(value)
    if isinstance(value, datetime):
        return _ts_to_iso(value)
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    if hasattr(value, "value") and not isinstance(value, (str, bytes, dict, list, tuple, set)):
        try:
            return value.value
        except Exception:
            pass
    if pd.isna(value):
        return None
    return value


def _row_to_json(row: pd.Series) -> dict[str, Any]:
    return {str(key): _json_scalar(value) for key, value in row.items()}


def _source_state(name: str, frame: pd.DataFrame | None, *, requested: bool = True) -> dict[str, Any]:
    if not requested:
        return {"owner": "engine", "status": "not_requested", "rows": 0, "source": name}
    if frame is None or frame.empty:
        return {"owner": "engine", "status": "missing", "rows": 0, "source": name}
    return {
        "owner": "engine",
        "status": "ok",
        "rows": int(len(frame)),
        "source": name,
        "start_at": _ts_to_iso(frame.index[0]) if len(frame.index) > 0 else None,
        "end_at": _ts_to_iso(frame.index[-1]) if len(frame.index) > 0 else None,
    }


def _build_snapshot_perp_input(perp_df: pd.DataFrame | None) -> dict[str, float] | None:
    if perp_df is None or perp_df.empty:
        return None
    last = perp_df.iloc[-1]
    return {
        "funding_rate": float(last.get("funding_rate", 0.0)),
        "long_short_ratio": float(last.get("long_short_ratio", 1.0)),
    }


def build_fact_context(
    *,
    symbol: str,
    timeframe: str = "1h",
    offline: bool = True,
) -> dict[str, Any]:
    """Build a bounded fact-plane context for one symbol/timeframe."""
    normalized_symbol = symbol.strip().upper()
    if not normalized_symbol:
        raise FactContextBuildError(400, "invalid_symbol", "symbol is required")

    try:
        tf_minutes = tf_string_to_minutes(timeframe)
    except ValueError as exc:
        raise FactContextBuildError(400, "invalid_timeframe", str(exc)) from exc

    try:
        klines_df = load_klines(normalized_symbol, timeframe, offline=offline)
    except CacheMiss as exc:
        raise FactContextBuildError(503, "klines_unavailable", str(exc)) from exc
    except Exception as exc:
        raise FactContextBuildError(500, "klines_load_failed", str(exc)) from exc

    if klines_df is None or klines_df.empty:
        raise FactContextBuildError(503, "klines_unavailable", "no kline data available")

    if len(klines_df) < MIN_HISTORY_BARS:
        raise FactContextBuildError(
            422,
            "insufficient_history",
            f"need >= {MIN_HISTORY_BARS} bars, got {len(klines_df)}",
        )

    try:
        perp_df = load_perp(normalized_symbol, offline=offline)
        macro_df = load_macro_bundle(offline=offline)
        onchain_df = load_onchain_bundle(normalized_symbol, offline=offline)
        dex_df = load_dex_bundle(normalized_symbol, offline=offline)
        chain_df = load_chain_bundle(normalized_symbol, offline=offline)
    except Exception as exc:
        raise FactContextBuildError(500, "aux_load_failed", str(exc)) from exc

    try:
        features_df = compute_features_table(
            klines_df,
            normalized_symbol,
            perp=perp_df,
            macro=macro_df,
            onchain=onchain_df,
            dex=dex_df,
            chain=chain_df,
            tf_minutes=tf_minutes,
        )
        snapshot = compute_snapshot(
            klines_df,
            normalized_symbol,
            perp=_build_snapshot_perp_input(perp_df),
        )
    except ValueError as exc:
        raise FactContextBuildError(422, "feature_warmup_failed", str(exc)) from exc
    except Exception as exc:
        raise FactContextBuildError(500, "fact_context_build_failed", str(exc)) from exc

    last_feature_row = features_df.iloc[-1]
    latest_bar = klines_df.iloc[-1]

    return {
        "ok": True,
        "owner": "engine",
        "plane": "fact",
        "status": "transitional",
        "generated_at": _now_iso(),
        "symbol": normalized_symbol,
        "timeframe": timeframe,
        "offline": offline,
        "bars": {
            "count": int(len(klines_df)),
            "min_required": MIN_HISTORY_BARS,
            "start_at": _ts_to_iso(klines_df.index[0]),
            "end_at": _ts_to_iso(klines_df.index[-1]),
        },
        "sources": {
            "klines": _source_state("klines", klines_df),
            "perp": _source_state("perp", perp_df),
            "macro": _source_state("macro_bundle", macro_df),
            "onchain": _source_state("onchain_bundle", onchain_df),
            "dex": _source_state("dex_bundle", dex_df),
            "chain": _source_state("chain_bundle", chain_df),
        },
        "market": {
            "price": float(latest_bar.get("close", 0.0)),
            "open": float(latest_bar.get("open", 0.0)),
            "high": float(latest_bar.get("high", 0.0)),
            "low": float(latest_bar.get("low", 0.0)),
            "volume": float(latest_bar.get("volume", 0.0)),
            "timestamp": _ts_to_iso(klines_df.index[-1]),
        },
        "snapshot": snapshot.model_dump(mode="json"),
        "feature_row": _row_to_json(last_feature_row),
        "notes": [
            "engine-owned bounded fact context",
            "backed by existing engine cache/loaders; shared-state migration still pending",
        ],
    }
