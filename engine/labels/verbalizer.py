"""Render a SignalSnapshot (or a features-table row) as natural language.

The output is the `input` field of a Cogochi LoRA training example. It
must be:
  - **Compact** — small base models have limited context
  - **Lossless on the dimensions that matter** — categorical fields and
    headline numbers verbatim, secondary metrics rounded
  - **Stable** — same snapshot always produces byte-identical text, so
    duplicates dedupe cleanly in the dataset builder

The categorical taxonomy (`bullish` / `range` / `risk_off` / etc.)
matches the EMAAlignment / HTFStructure / CVDState / Regime enums in
models.signal so the verbalizer never drifts from the schema.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Mapping, Union

import pandas as pd

from models.signal import SignalSnapshot

# Public type alias — verbalize_snapshot accepts either form.
VerbalizableInput = Union[SignalSnapshot, pd.Series, Mapping[str, Any]]


def _normalize(snap_or_row: VerbalizableInput) -> dict[str, Any]:
    """Coerce SignalSnapshot / pd.Series / dict to a flat dict.

    For pd.Series we read the Series name as the timestamp (which is the
    DatetimeIndex value of the row in features_df). For SignalSnapshot we
    use snap.timestamp directly. Dicts must already include 'timestamp'.
    """
    if isinstance(snap_or_row, SignalSnapshot):
        # Pydantic v2's model_dump() leaves Enum fields as Enum members,
        # not their .value strings. Unwrap them so the verbalizer prints
        # "bullish" instead of "EMAAlignment.BULLISH" — and so the output
        # matches what compute_features_table emits (already string).
        out: dict[str, Any] = snap_or_row.model_dump()
        for k, v in list(out.items()):
            if isinstance(v, Enum):
                out[k] = v.value
        out["timestamp"] = snap_or_row.timestamp
        return out
    if isinstance(snap_or_row, pd.Series):
        out = dict(snap_or_row.items())
        if "timestamp" not in out:
            out["timestamp"] = snap_or_row.name
        return out
    if isinstance(snap_or_row, Mapping):
        return dict(snap_or_row)
    raise TypeError(
        f"verbalize_snapshot expects SignalSnapshot, pd.Series, or Mapping; "
        f"got {type(snap_or_row).__name__}"
    )


def _fmt_pct(x: float, places: int = 2) -> str:
    """Format a fraction (e.g. 0.0034) as a signed percentage (+0.34%)."""
    return f"{x * 100:+.{places}f}%"


def _fmt_num(x: float, places: int = 2) -> str:
    return f"{x:.{places}f}"


def _fmt_price(x: float) -> str:
    """Adaptive precision for prices that span 0.0001 → 100,000."""
    if x >= 1000:
        return f"${x:,.0f}"
    if x >= 1:
        return f"${x:.2f}"
    return f"${x:.5f}"


def _fmt_time(ts: Any) -> str:
    """ISO-ish UTC string with hour resolution; tolerates pd.Timestamp / datetime / str."""
    if isinstance(ts, pd.Timestamp):
        ts = ts.tz_convert("UTC") if ts.tz is not None else ts.tz_localize("UTC")
        return ts.strftime("%Y-%m-%d %H:%M UTC")
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            return ts.strftime("%Y-%m-%d %H:%M UTC")
        return ts.strftime("%Y-%m-%d %H:%M %Z").rstrip()
    return str(ts)


def verbalize_snapshot(snap_or_row: VerbalizableInput) -> str:
    """Return a multi-line natural-language description of one snapshot.

    Section order matches the SignalSnapshot field groupings (Trend →
    Momentum → Volatility → Volume → Structure → Microstructure → Order
    flow → Meta) so a model can learn the layout positionally.
    """
    d = _normalize(snap_or_row)

    symbol = d.get("symbol", "?")
    timestamp = _fmt_time(d.get("timestamp"))
    price = float(d.get("price", 0.0))

    lines: list[str] = []
    lines.append(f"Market: {symbol}, {timestamp}, price {_fmt_price(price)}.")

    # ---- Trend ----
    ema20_slope = float(d["ema20_slope"])
    ema50_slope = float(d["ema50_slope"])
    ema_alignment = str(d["ema_alignment"])
    price_vs_ema50 = float(d["price_vs_ema50"])
    lines.append(
        f"Trend: EMA20 slope {_fmt_pct(ema20_slope)}, EMA50 slope {_fmt_pct(ema50_slope)}, "
        f"alignment {ema_alignment}, price vs EMA50 {_fmt_pct(price_vs_ema50)}."
    )

    # ---- Momentum ----
    rsi14 = float(d["rsi14"])
    rsi14_slope = float(d["rsi14_slope"])
    macd_hist = float(d["macd_hist"])
    roc_10 = float(d["roc_10"])
    lines.append(
        f"Momentum: RSI14 {_fmt_num(rsi14, 1)} (slope {_fmt_num(rsi14_slope, 2)}), "
        f"MACD hist {_fmt_num(macd_hist, 4)}, ROC10 {_fmt_pct(roc_10)}."
    )

    # ---- Volatility ----
    atr_pct = float(d["atr_pct"])
    atr_ratio = float(d["atr_ratio_short_long"])
    bb_width = float(d["bb_width"])
    bb_position = float(d["bb_position"])
    lines.append(
        f"Volatility: ATR {_fmt_pct(atr_pct)} of price, "
        f"short/long ATR ratio {_fmt_num(atr_ratio, 2)}, "
        f"Bollinger width {_fmt_num(bb_width, 4)}, position {_fmt_num(bb_position, 2)}."
    )

    # ---- Volume ----
    volume_24h = float(d["volume_24h"])
    vol_ratio_3 = float(d["vol_ratio_3"])
    obv_slope = float(d["obv_slope"])
    lines.append(
        f"Volume: 24h volume {volume_24h:,.0f}, "
        f"recent/prev3 ratio {_fmt_num(vol_ratio_3, 2)}, "
        f"OBV slope {_fmt_pct(obv_slope)}."
    )

    # ---- Structure / MTF ----
    htf_structure = str(d["htf_structure"])
    dist_high = float(d["dist_from_20d_high"])
    dist_low = float(d["dist_from_20d_low"])
    swing = float(d["swing_pivot_distance"])
    lines.append(
        f"Structure: HTF {htf_structure}, "
        f"{_fmt_pct(dist_high)} from 20d high, "
        f"{_fmt_pct(dist_low)} from 20d low, "
        f"swing pivot distance {_fmt_num(swing, 0)}."
    )

    # ---- Microstructure (perp) ----
    funding_rate = float(d["funding_rate"])
    oi_1h = float(d["oi_change_1h"])
    oi_24h = float(d["oi_change_24h"])
    long_short_ratio = float(d["long_short_ratio"])
    lines.append(
        f"Microstructure: funding {_fmt_pct(funding_rate, 4)}, "
        f"OI Δ1h {_fmt_pct(oi_1h)}, OI Δ24h {_fmt_pct(oi_24h)}, "
        f"long/short ratio {_fmt_num(long_short_ratio, 2)}."
    )

    # ---- Order flow ----
    cvd_state = str(d["cvd_state"])
    taker_buy = float(d["taker_buy_ratio_1h"])
    lines.append(
        f"Order flow: CVD state {cvd_state}, "
        f"taker buy ratio {_fmt_num(taker_buy, 2)}."
    )

    # ---- Meta ----
    regime = str(d["regime"])
    hour = int(d["hour_of_day"])
    dow = int(d["day_of_week"])
    dow_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    lines.append(
        f"Regime: {regime}. Time: {dow_names[dow]} {hour:02d}:00 UTC."
    )

    return "\n".join(lines)
