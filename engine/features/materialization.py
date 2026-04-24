"""Canonical window feature materialization helpers."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd


def _as_float_series(series: pd.Series | None) -> pd.Series:
    if series is None:
        return pd.Series(dtype=float)
    return series.astype(float)


def _zscore(series: pd.Series) -> float | None:
    clean = _as_float_series(series).dropna()
    if len(clean) < 2:
        return None
    std = float(clean.std(ddof=0))
    if std <= 1e-12:
        return 0.0
    return float((clean.iloc[-1] - clean.mean()) / std)


def _slope(series: pd.Series) -> float | None:
    clean = _as_float_series(series).dropna()
    if len(clean) < 2:
        return None
    x = np.arange(len(clean), dtype=float)
    coeffs = np.polyfit(x, clean.to_numpy(dtype=float), deg=1)
    return float(coeffs[0])


def _percentile_of_last(series: pd.Series) -> float | None:
    clean = _as_float_series(series).dropna()
    if len(clean) == 0:
        return None
    last = float(clean.iloc[-1])
    return float((clean <= last).mean())


def _higher_count(series: pd.Series) -> int:
    clean = _as_float_series(series).dropna().tolist()
    count = 0
    for idx in range(1, len(clean)):
        if clean[idx] > clean[idx - 1]:
            count += 1
        else:
            count = 0
    return count


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> float | None:
    if len(close) < 2:
        return None
    prev_close = close.shift(1)
    tr = pd.concat(
        [
            (high - low).abs(),
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    valid = tr.dropna()
    if valid.empty:
        return None
    return float(valid.tail(min(period, len(valid))).mean())


def _realized_volatility(close: pd.Series) -> float | None:
    clean = _as_float_series(close).dropna()
    if len(clean) < 2:
        return None
    returns = np.log(clean / clean.shift(1)).dropna()
    if returns.empty:
        return None
    return float(returns.std(ddof=0) * np.sqrt(len(returns)))


def _curvature_score(close: pd.Series) -> float | None:
    clean = _as_float_series(close).dropna()
    if len(clean) < 3:
        return None
    x = np.linspace(-1.0, 1.0, len(clean))
    coeffs = np.polyfit(x, clean.to_numpy(dtype=float), deg=2)
    return float(abs(coeffs[0]))


def _volatility_regime(
    atr: float | None, close_last: float | None, realized_volatility: float | None
) -> str | None:
    if close_last in (None, 0.0):
        return None
    atr_pct = (atr / close_last) if atr is not None else 0.0
    rv = realized_volatility or 0.0
    score = atr_pct + rv
    if score >= 0.08:
        return "high"
    if score >= 0.03:
        return "normal"
    return "low"


def _trend_regime(close: pd.Series, breakout_flag: bool, higher_low_count: int) -> str | None:
    clean = _as_float_series(close).dropna()
    if len(clean) < 2:
        return None
    start = float(clean.iloc[0])
    end = float(clean.iloc[-1])
    change = (end - start) / start if start else 0.0
    if breakout_flag and higher_low_count >= 2:
        return "reversal_setup"
    if change >= 0.03:
        return "uptrend"
    if change <= -0.03:
        return "downtrend"
    return "range"


def _align_optional_frame(frame: pd.DataFrame | None, index: pd.Index) -> pd.DataFrame:
    if frame is None or frame.empty:
        return pd.DataFrame(index=index)
    aligned = frame.sort_index()
    if aligned.index.tz is None and hasattr(index, "tz") and index.tz is not None:
        aligned.index = aligned.index.tz_localize("UTC")
    return aligned.reindex(index, method="ffill")


def _derive_orderflow_frame(bars: pd.DataFrame, orderflow: pd.DataFrame | None) -> pd.DataFrame:
    if orderflow is not None and not orderflow.empty:
        return _align_optional_frame(orderflow, bars.index)

    taker_buy = _as_float_series(
        bars["taker_buy_base_volume"]
        if "taker_buy_base_volume" in bars.columns
        else pd.Series(index=bars.index, data=0.0)
    ).fillna(0.0)
    volume = _as_float_series(bars["volume"]).fillna(0.0)
    taker_sell = (volume - taker_buy).clip(lower=0.0)
    delta = taker_buy - taker_sell
    cvd = delta.cumsum()
    denominator = volume.replace(0.0, np.nan)
    return pd.DataFrame(
        {
            "cvd": cvd,
            "taker_buy_volume": taker_buy,
            "taker_sell_volume": taker_sell,
            "buy_sell_delta": delta,
            "bid_ask_imbalance": (delta / denominator).fillna(0.0),
        },
        index=bars.index,
    )


def _oi_proxy(perp: pd.DataFrame) -> pd.Series:
    for col in ("open_interest", "oi_raw", "oi"):
        if col in perp.columns and perp[col].notna().any():
            return _as_float_series(perp[col]).ffill()
    if "oi_change_1h" in perp.columns and perp["oi_change_1h"].notna().any():
        changes = _as_float_series(perp["oi_change_1h"]).fillna(0.0)
        return (1.0 + changes).cumprod()
    return pd.Series(index=perp.index, dtype=float)


def _oi_reexpansion_flag(series: pd.Series) -> bool:
    clean = _as_float_series(series).dropna()
    if len(clean) < 4:
        return False
    recent = clean.tail(min(8, len(clean)))
    last = float(recent.iloc[-1])
    prev = float(recent.iloc[-2])
    prior = recent.iloc[:-1]
    if prior.empty:
        return False
    trough = float(prior.min())
    peak = float(prior.max())
    return prev <= trough * 1.02 and last > prev and last > trough * 1.03 and last < peak * 1.10


def _oi_hold_flag(series: pd.Series) -> bool:
    clean = _as_float_series(series).dropna()
    if len(clean) < 3:
        return False
    peak = float(clean.max())
    last = float(clean.iloc[-1])
    if peak <= 0.0:
        return False
    return last >= peak * 0.8


def _phase_score(flags: list[bool]) -> float:
    if not flags:
        return 0.0
    return float(sum(1 for flag in flags if flag) / len(flags))


def is_fake_dump(features: dict[str, Any]) -> bool:
    return (
        (features.get("price_dump_pct") or 0.0) <= -0.05
        and bool(features.get("funding_extreme_short_flag"))
        and (features.get("oi_change_pct") or 0.0) < 0.03
        and (features.get("volume_zscore") or 0.0) < 1.2
    )


def is_real_dump(features: dict[str, Any]) -> bool:
    return (
        (features.get("price_dump_pct") or 0.0) <= -0.05
        and bool(features.get("volume_spike_flag"))
        and bool(features.get("oi_spike_flag"))
    )


def is_accumulation(features: dict[str, Any]) -> bool:
    return (
        (features.get("higher_low_count") or 0) >= 2
        and bool(features.get("oi_hold_flag"))
        and (features.get("pullback_depth_pct") or 1.0) < 0.04
        and bool(features.get("volume_dryup_flag"))
    )


def is_breakout(features: dict[str, Any]) -> bool:
    return (
        bool(features.get("breakout_flag"))
        and bool(features.get("oi_reexpansion_flag"))
        and bool(features.get("funding_positive_flag"))
        and (features.get("breakout_strength") or 0.0) > 0.01
    )


def infer_phase_guess(features: dict[str, Any]) -> tuple[str | None, float, dict[str, Any]]:
    checks = {
        "breakout_oi_reexpand": [
            bool(features.get("breakout_flag")),
            bool(features.get("oi_reexpansion_flag")),
            bool(features.get("funding_positive_flag")),
            (features.get("breakout_strength") or 0.0) > 0.01,
        ],
        "accumulation_15m": [
            (features.get("higher_low_count") or 0) >= 2,
            bool(features.get("oi_hold_flag")),
            (features.get("pullback_depth_pct") or 1.0) < 0.04,
            bool(features.get("volume_dryup_flag")),
        ],
        "real_dump": [
            (features.get("price_dump_pct") or 0.0) <= -0.05,
            bool(features.get("volume_spike_flag")),
            bool(features.get("oi_spike_flag")),
        ],
        "fake_dump": [
            (features.get("price_dump_pct") or 0.0) <= -0.05,
            bool(features.get("funding_extreme_short_flag")),
            (features.get("oi_change_pct") or 0.0) < 0.03,
            (features.get("volume_zscore") or 0.0) < 1.2,
        ],
        "arch_zone": [
            bool(features.get("volume_dryup_flag")),
            (features.get("compression_ratio") or 0.0) <= 1.0,
            not bool(features.get("breakout_flag")),
        ],
    }
    for phase in ("breakout_oi_reexpand", "accumulation_15m", "real_dump", "fake_dump", "arch_zone"):
        flags = checks[phase]
        score = _phase_score(flags)
        if score >= 0.75:
            evidence = {
                "phase": phase,
                "passed_checks": sum(1 for flag in flags if flag),
                "total_checks": len(flags),
                "key_features": {
                    key: features.get(key)
                    for key in (
                        "price_dump_pct",
                        "higher_low_count",
                        "pullback_depth_pct",
                        "breakout_strength",
                        "oi_change_pct",
                        "oi_zscore",
                        "oi_hold_flag",
                        "oi_reexpansion_flag",
                        "funding_rate_zscore",
                        "funding_positive_flag",
                        "volume_zscore",
                        "volume_dryup_flag",
                    )
                },
            }
            return phase, score, evidence
    return None, 0.0, {}


@dataclass(frozen=True)
class MaterializedWindowBundle:
    feature_window: dict[str, Any]
    pattern_event: dict[str, Any] | None
    search_signature: dict[str, Any]


def compute_feature_window(
    bars: pd.DataFrame,
    *,
    venue: str,
    symbol: str,
    timeframe: str,
    perp: pd.DataFrame | None = None,
    orderflow: pd.DataFrame | None = None,
    window_bars: int = 64,
    pattern_family: str | None = None,
) -> dict[str, Any]:
    if len(bars) < 4:
        raise ValueError("compute_feature_window needs at least 4 bars")

    window = bars.sort_index().tail(window_bars).copy()
    perp_aligned = _align_optional_frame(perp, window.index)
    orderflow_aligned = _derive_orderflow_frame(window, orderflow)

    close = _as_float_series(window["close"])
    high = _as_float_series(window["high"])
    low = _as_float_series(window["low"])
    volume = _as_float_series(window["volume"]).fillna(0.0)
    close_last = float(close.iloc[-1])
    close_first = float(close.iloc[0])
    return_pct = (close_last - close_first) / close_first if close_first else 0.0
    price_dump_pct = min(return_pct, 0.0)
    price_pump_pct = max(return_pct, 0.0)

    swing_high = float(high.max())
    swing_low = float(low.min())
    higher_low_count = _higher_count(low)
    higher_high_count = _higher_count(high)
    prior_range_high = float(high.iloc[:-1].max()) if len(high) > 1 else float(high.max())
    range_high = prior_range_high
    range_low = float(low.iloc[:-1].min()) if len(low) > 1 else float(low.min())
    mid_price = (range_high + range_low) / 2 if (range_high and range_low) else close_last
    range_width_pct = ((range_high - range_low) / mid_price) if mid_price else 0.0
    pullback_depth_pct = ((range_high - float(low.iloc[-1])) / range_high) if range_high else 0.0
    breakout_flag = close_last > prior_range_high if len(high) > 1 else False
    breakout_strength = ((close_last - prior_range_high) / prior_range_high) if prior_range_high else 0.0

    atr = _atr(high, low, close)
    realized_volatility = _realized_volatility(close)
    atr_for_ratio = atr or 0.0
    compression_ratio = range_width_pct / max(atr_for_ratio / close_last if close_last else 0.0, 1e-6)
    curvature_score = _curvature_score(close)

    volume_last = float(volume.iloc[-1])
    volume_ma = float(volume.mean())
    volume_zscore = _zscore(volume)
    volume_percentile = _percentile_of_last(volume)
    volume_spike_flag = (volume_zscore or 0.0) > 2.0
    volume_dryup_flag = volume_last < (volume_ma * 0.6 if volume_ma else 0.0)

    oi_series = _oi_proxy(perp_aligned)
    _has_oi = any(c in perp_aligned.columns for c in ("open_interest", "oi_raw", "oi"))
    oi_last = float(oi_series.iloc[-1]) if _has_oi and not oi_series.empty else None
    oi_change_abs = float(oi_series.iloc[-1] - oi_series.iloc[-2]) if len(oi_series) >= 2 else None
    oi_change_pct = None
    if "oi_change_1h" in perp_aligned.columns and perp_aligned["oi_change_1h"].notna().any():
        oi_change_pct = float(_as_float_series(perp_aligned["oi_change_1h"]).iloc[-1])
    elif len(oi_series) >= 2 and float(oi_series.iloc[-2]) != 0.0:
        oi_change_pct = float((oi_series.iloc[-1] - oi_series.iloc[-2]) / oi_series.iloc[-2])
    oi_zscore = _zscore(oi_series)
    oi_slope = _slope(oi_series)
    oi_spike_flag = (oi_zscore or 0.0) > 2.0
    oi_hold_flag = _oi_hold_flag(oi_series)
    oi_reexpansion_flag = _oi_reexpansion_flag(oi_series)

    funding_series = (
        _as_float_series(perp_aligned["funding_rate"]).ffill()
        if "funding_rate" in perp_aligned.columns
        else pd.Series(index=window.index, dtype=float)
    )
    funding_rate_last = float(funding_series.iloc[-1]) if not funding_series.dropna().empty else None
    funding_rate_zscore = _zscore(funding_series)
    funding_rate_change = (
        float(funding_series.iloc[-1] - funding_series.iloc[-2])
        if len(funding_series.dropna()) >= 2
        else None
    )
    funding_positive_flag = bool((funding_rate_last or 0.0) > 0.0)
    funding_extreme_short_flag = bool((funding_rate_zscore or 0.0) < -2.0)
    funding_extreme_long_flag = bool((funding_rate_zscore or 0.0) > 2.0)
    funding_flip_flag = False
    if len(funding_series.dropna()) >= 2:
        prev_funding = float(funding_series.iloc[-2])
        curr_funding = float(funding_series.iloc[-1])
        funding_flip_flag = (curr_funding > 0 > prev_funding) or (curr_funding < 0 < prev_funding)

    ls_series = (
        _as_float_series(perp_aligned["long_short_ratio"]).ffill()
        if "long_short_ratio" in perp_aligned.columns
        else pd.Series(index=window.index, dtype=float)
    )
    long_short_ratio_last = float(ls_series.iloc[-1]) if not ls_series.dropna().empty else None
    ls_ratio_change = float(ls_series.iloc[-1] - ls_series.iloc[-2]) if len(ls_series.dropna()) >= 2 else None
    ls_ratio_zscore = _zscore(ls_series)

    long_liq = (
        _as_float_series(perp_aligned["long_liq_value"]).fillna(0.0)
        if "long_liq_value" in perp_aligned.columns
        else pd.Series(index=window.index, data=0.0)
    )
    short_liq = (
        _as_float_series(perp_aligned["short_liq_value"]).fillna(0.0)
        if "short_liq_value" in perp_aligned.columns
        else pd.Series(index=window.index, data=0.0)
    )
    total_liq = float(long_liq.iloc[-1] + short_liq.iloc[-1])
    liq_imbalance = (
        float((short_liq.iloc[-1] - long_liq.iloc[-1]) / total_liq)
        if total_liq > 0.0
        else None
    )
    liq_nearby_density = (
        float(_as_float_series(perp_aligned["liq_density"]).iloc[-1])
        if "liq_density" in perp_aligned.columns and perp_aligned["liq_density"].notna().any()
        else None
    )

    cvd_series = _as_float_series(orderflow_aligned["cvd"]).ffill().fillna(0.0)
    cvd_last = float(cvd_series.iloc[-1])
    cvd_delta = float(cvd_series.iloc[-1] - cvd_series.iloc[0]) if len(cvd_series) >= 2 else 0.0
    cvd_slope = _slope(cvd_series)
    price_slope = _slope(close) or 0.0
    cvd_divergence_price = bool((cvd_slope or 0.0) * price_slope < 0.0)

    taker_buy_volume = _as_float_series(orderflow_aligned["taker_buy_volume"]).fillna(0.0)
    taker_sell_volume = _as_float_series(orderflow_aligned["taker_sell_volume"]).fillna(0.0)
    buy = float(taker_buy_volume.iloc[-1])
    sell = float(taker_sell_volume.iloc[-1])
    taker_buy_ratio = float(buy / (buy + sell)) if (buy + sell) > 0.0 else 0.5
    absorption_flag = bool((volume_zscore or 0.0) > 1.0 and abs(return_pct) < 0.01)

    volatility_regime = _volatility_regime(atr, close_last, realized_volatility)
    trend_regime = _trend_regime(close, breakout_flag, higher_low_count)

    features: dict[str, Any] = {
        "venue": venue,
        "symbol": symbol,
        "timeframe": timeframe,
        "window_start_ts": window.index[0].isoformat(),
        "window_end_ts": window.index[-1].isoformat(),
        "close_last": close_last,
        "return_pct": return_pct,
        "price_dump_pct": price_dump_pct,
        "price_pump_pct": price_pump_pct,
        "swing_high": swing_high,
        "swing_low": swing_low,
        "higher_low_count": higher_low_count,
        "higher_high_count": higher_high_count,
        "range_high": range_high,
        "range_low": range_low,
        "range_width_pct": range_width_pct,
        "pullback_depth_pct": pullback_depth_pct,
        "breakout_flag": breakout_flag,
        "breakout_strength": breakout_strength,
        "compression_ratio": compression_ratio,
        "curvature_score": curvature_score,
        "volume_last": volume_last,
        "volume_ma": volume_ma,
        "volume_zscore": volume_zscore,
        "volume_percentile": volume_percentile,
        "volume_spike_flag": volume_spike_flag,
        "volume_dryup_flag": volume_dryup_flag,
        "oi_last": oi_last,
        "oi_change_abs": oi_change_abs,
        "oi_change_pct": oi_change_pct,
        "oi_zscore": oi_zscore,
        "oi_slope": oi_slope,
        "oi_spike_flag": oi_spike_flag,
        "oi_hold_flag": oi_hold_flag,
        "oi_reexpansion_flag": oi_reexpansion_flag,
        "funding_rate_last": funding_rate_last,
        "funding_rate_zscore": funding_rate_zscore,
        "funding_rate_change": funding_rate_change,
        "funding_positive_flag": funding_positive_flag,
        "funding_extreme_short_flag": funding_extreme_short_flag,
        "funding_extreme_long_flag": funding_extreme_long_flag,
        "funding_flip_flag": funding_flip_flag,
        "long_short_ratio_last": long_short_ratio_last,
        "ls_ratio_change": ls_ratio_change,
        "ls_ratio_zscore": ls_ratio_zscore,
        "liq_imbalance": liq_imbalance,
        "liq_nearby_density": liq_nearby_density,
        "cvd_last": cvd_last,
        "cvd_delta": cvd_delta,
        "cvd_slope": cvd_slope,
        "cvd_divergence_price": cvd_divergence_price,
        "taker_buy_ratio": taker_buy_ratio,
        "absorption_flag": absorption_flag,
        "atr": atr,
        "realized_volatility": realized_volatility,
        "volatility_regime": volatility_regime,
        "trend_regime": trend_regime,
        "bars_since_event": 0 if breakout_flag else None,
        "signal_duration": higher_low_count if higher_low_count > 0 else None,
        "phase_guess": None,
        "pattern_family": pattern_family,
    }

    phase_guess, _, _ = infer_phase_guess(features)
    features["phase_guess"] = phase_guess
    return features


def build_pattern_event(feature_window: dict[str, Any]) -> dict[str, Any] | None:
    phase, score, evidence = infer_phase_guess(feature_window)
    if phase is None:
        return None
    return {
        "venue": feature_window["venue"],
        "symbol": feature_window["symbol"],
        "timeframe": feature_window["timeframe"],
        "ts": feature_window["window_end_ts"],
        "pattern_family": feature_window.get("pattern_family") or "generic_feature_phase",
        "phase": phase,
        "score": score,
        "evidence_json": evidence,
        "feature_ref_json": {
            "window_start_ts": feature_window["window_start_ts"],
            "window_end_ts": feature_window["window_end_ts"],
        },
    }


def build_search_corpus_signature(
    feature_window: dict[str, Any],
    *,
    signature_version: str = "v1",
    window_bars: int = 64,
) -> dict[str, Any]:
    phase_path = [feature_window["phase_guess"]] if feature_window.get("phase_guess") else []
    signature = {
        "pattern_family": feature_window.get("pattern_family"),
        "timeframe": feature_window["timeframe"],
        "window_bars": window_bars,
        "price_dump_pct": feature_window.get("price_dump_pct"),
        "higher_low_count": feature_window.get("higher_low_count"),
        "range_width_pct": feature_window.get("range_width_pct"),
        "pullback_depth_pct": feature_window.get("pullback_depth_pct"),
        "breakout_strength": feature_window.get("breakout_strength"),
        "oi_change_pct": feature_window.get("oi_change_pct"),
        "oi_zscore": feature_window.get("oi_zscore"),
        "oi_hold_flag": feature_window.get("oi_hold_flag"),
        "oi_reexpansion_flag": feature_window.get("oi_reexpansion_flag"),
        "funding_rate_zscore": feature_window.get("funding_rate_zscore"),
        "funding_flip_flag": feature_window.get("funding_flip_flag"),
        "funding_positive_flag": feature_window.get("funding_positive_flag"),
        "volume_zscore": feature_window.get("volume_zscore"),
        "volume_dryup_flag": feature_window.get("volume_dryup_flag"),
        "cvd_divergence_price": feature_window.get("cvd_divergence_price"),
        "liq_imbalance": feature_window.get("liq_imbalance"),
        "trend_regime": feature_window.get("trend_regime"),
        "phase_path": phase_path,
    }
    score_vector = {
        "oi_component": feature_window.get("oi_zscore"),
        "funding_component": feature_window.get("funding_rate_zscore"),
        "volume_component": feature_window.get("volume_zscore"),
        "breakout_component": feature_window.get("breakout_strength"),
    }
    return {
        "venue": feature_window["venue"],
        "symbol": feature_window["symbol"],
        "timeframe": feature_window["timeframe"],
        "window_start_ts": feature_window["window_start_ts"],
        "window_end_ts": feature_window["window_end_ts"],
        "pattern_family": feature_window.get("pattern_family"),
        "signature_version": signature_version,
        "signature_json": signature,
        "score_vector_json": score_vector,
    }


def materialize_window_bundle(
    bars: pd.DataFrame,
    *,
    venue: str,
    symbol: str,
    timeframe: str,
    perp: pd.DataFrame | None = None,
    orderflow: pd.DataFrame | None = None,
    window_bars: int = 64,
    pattern_family: str | None = None,
    signature_version: str = "v1",
) -> MaterializedWindowBundle:
    feature_window = compute_feature_window(
        bars,
        venue=venue,
        symbol=symbol,
        timeframe=timeframe,
        perp=perp,
        orderflow=orderflow,
        window_bars=window_bars,
        pattern_family=pattern_family,
    )
    pattern_event = build_pattern_event(feature_window)
    search_signature = build_search_corpus_signature(
        feature_window,
        signature_version=signature_version,
        window_bars=window_bars,
    )
    return MaterializedWindowBundle(
        feature_window=feature_window,
        pattern_event=pattern_event,
        search_signature=search_signature,
    )
