"""Top-level feature computation — thin orchestrator over domain primitives.

Public API:
    compute_snapshot(klines, symbol, perp=None, tf_minutes=60) -> SignalSnapshot
    compute_features_table(klines, symbol, ...) -> pd.DataFrame

CRITICAL CONTRACT: all computation is PAST-ONLY. No look-ahead.
This module delegates to features.primitives and features.helpers;
the implementation is split for readability but semantics are identical
to the original scanner.feature_calc (verified by existing tests).
"""
from __future__ import annotations

from datetime import timezone
from typing import Optional

import numpy as np
import pandas as pd

from models.signal import (
    CVDState,
    EMAAlignment,
    HTFStructure,
    Regime,
    SignalSnapshot,
)

from features.columns import MIN_HISTORY_BARS
from features import primitives as P
from features import helpers as H


def compute_snapshot(
    klines: pd.DataFrame,
    symbol: str,
    perp: Optional[dict] = None,
    tf_minutes: int = 60,
) -> SignalSnapshot:
    """Compute a SignalSnapshot for the LAST row of ``klines``.

    See features.columns.MIN_HISTORY_BARS for minimum bar requirement.
    """
    BPD = max(1, 1440 // tf_minutes)
    D7 = 7 * BPD
    D20 = 20 * BPD
    HTF_WIN = max(30, 5 * BPD)
    _b1h = max(1, round(60 / tf_minutes))
    _b4h = max(1, round(240 / tf_minutes))
    _b24h = BPD
    _b7d = D7
    BPY = BPD * 365

    if len(klines) < MIN_HISTORY_BARS:
        raise ValueError(
            f"compute_snapshot needs ≥{MIN_HISTORY_BARS} bars of history "
            f"(tf={tf_minutes}m), got {len(klines)}"
        )

    close = klines["close"].astype(float)
    high = klines["high"].astype(float)
    low = klines["low"].astype(float)
    open_ = klines["open"].astype(float)
    volume = klines["volume"].astype(float)
    taker_buy = klines["taker_buy_base_volume"].astype(float)

    price = float(close.iloc[-1])
    ts = klines.index[-1]
    if isinstance(ts, pd.Timestamp):
        ts_dt = ts.to_pydatetime()
    else:
        ts_dt = ts
    if ts_dt.tzinfo is None:
        ts_dt = ts_dt.replace(tzinfo=timezone.utc)

    # --- Trend ---
    ema20_series = P.ema(close, 20)
    ema50_series = P.ema(close, 50)
    ema200_series = P.ema(close, 200)
    ema20 = float(ema20_series.iloc[-1])
    ema50 = float(ema50_series.iloc[-1])
    ema200 = float(ema200_series.iloc[-1])
    ema20_slope = H.slope_pct(ema20_series, 5)
    ema50_slope = H.slope_pct(ema50_series, 10)
    ema_alignment = H.ema_alignment(ema20, ema50, ema200)
    price_vs_ema50 = (price - ema50) / ema50 if ema50 else 0.0

    # --- Momentum ---
    rsi_series = P.rsi(close, 14)
    rsi14 = float(rsi_series.iloc[-1])
    rsi14_slope = H.slope_abs(rsi_series, 5)
    macd_h_series = P.macd_hist(close)
    macd_hist_val = float(macd_h_series.iloc[-1])
    roc_10 = H.slope_pct(close, 10)

    # --- Volatility ---
    atr14 = P.atr(high, low, close, 14)
    atr50 = P.atr(high, low, close, 50)
    atr_val = float(atr14.iloc[-1])
    atr_pct = atr_val / price if price else 0.0
    atr50_val = float(atr50.iloc[-1])
    atr_ratio_short_long = atr_val / atr50_val if atr50_val else 1.0
    bb_lower, bb_mid, bb_upper = P.bollinger(close, window=20, k=2.0)
    bb_lower_v = float(bb_lower.iloc[-1])
    bb_mid_v = float(bb_mid.iloc[-1])
    bb_upper_v = float(bb_upper.iloc[-1])
    bb_width = (bb_upper_v - bb_lower_v) / bb_mid_v if bb_mid_v else 0.0
    bb_range = bb_upper_v - bb_lower_v
    bb_position = (price - bb_lower_v) / bb_range if bb_range else 0.5

    # --- Volume ---
    if len(volume) >= _b24h:
        volume_24h = float(volume.iloc[-_b24h:].sum())
    else:
        volume_24h = float(volume.sum())
    if len(volume) >= 4:
        mean_prev3 = float(volume.iloc[-4:-1].mean())
        vol_ratio_3 = float(volume.iloc[-1]) / mean_prev3 if mean_prev3 > 0 else 1.0
    else:
        vol_ratio_3 = 1.0
    obv_series = P.obv(close, volume)
    obv_slope = H.slope_pct(obv_series, 20) if len(obv_series) > 20 else 0.0

    # --- Structure ---
    htf_structure = H.htf_structure(close, window=HTF_WIN)
    if len(high) >= D20:
        high_20d = float(high.iloc[-D20:].max())
        low_20d = float(low.iloc[-D20:].min())
    else:
        high_20d = float(high.max())
        low_20d = float(low.min())
    dist_from_20d_high = (price - high_20d) / high_20d if high_20d else 0.0
    dist_from_20d_low = (price - low_20d) / low_20d if low_20d else 0.0
    swing_pivot_distance = H.swing_pivot_distance(high, low, lookback=20)

    # --- Microstructure ---
    perp = perp or {}
    funding_rate = float(perp.get("funding_rate", 0.0))
    oi_now = perp.get("oi_now")
    oi_1h = perp.get("oi_1h_ago")
    oi_24h = perp.get("oi_24h_ago")
    if oi_now is not None and oi_1h:
        oi_change_1h = float((oi_now - oi_1h) / oi_1h)
    else:
        oi_change_1h = 0.0
    if oi_now is not None and oi_24h:
        oi_change_24h = float((oi_now - oi_24h) / oi_24h)
    else:
        oi_change_24h = 0.0
    long_short_ratio = float(perp.get("long_short_ratio", 1.0))

    # --- Order flow ---
    last_vol = float(volume.iloc[-1])
    if last_vol > 0:
        taker_buy_ratio_1h = float(taker_buy.iloc[-1]) / last_vol
    else:
        taker_buy_ratio_1h = 0.5
    taker_buy_ratio_1h = max(0.0, min(1.0, taker_buy_ratio_1h))
    cvd_state = H.cvd_state(taker_buy_ratio_1h)

    # --- Price changes — log returns (additive over horizons, cost-model accurate) ---
    def _log_ret(n: int) -> float:
        if len(close) <= n:
            return 0.0
        past = float(close.iloc[-1 - n])
        return float(np.log(price / past)) if past > 0 else 0.0

    price_change_1h = _log_ret(_b1h)
    price_change_4h = _log_ret(_b4h)
    price_change_24h = _log_ret(_b24h)
    price_change_7d = _log_ret(_b7d)

    # --- Momentum oscillators ---
    stoch_rsi_val = float(P.stoch_rsi(rsi_series, 14).iloc[-1])
    williams_r_val = float(P.williams_r(high, low, close, 14).iloc[-1])
    cci_val = float(P.cci(high, low, close, 20).iloc[-1])

    # --- Price relative ---
    vwap_ratio_val = float(P.vwap_ratio(close, volume, _b24h).iloc[-1])
    price_vs_ema200 = (price - ema200) / ema200 if ema200 else 0.0

    # --- Candle structure ---
    candle_high = float(high.iloc[-1])
    candle_low = float(low.iloc[-1])
    candle_open = float(open_.iloc[-1])
    candle_range = candle_high - candle_low
    if candle_range > 0:
        body_top = max(price, candle_open)
        body_bot = min(price, candle_open)
        upper_wick_pct = (candle_high - body_top) / candle_range
        lower_wick_pct = (body_bot - candle_low) / candle_range
    else:
        upper_wick_pct = 0.0
        lower_wick_pct = 0.0

    # --- Extended RSI + Stochastic ---
    rsi7_val = float(P.rsi(close, 7).iloc[-1])
    rsi21_val = float(P.rsi(close, 21).iloc[-1])
    stoch_k_series, stoch_d_series = P.stoch(high, low, close, 14, 3)
    stoch_k_val = float(stoch_k_series.iloc[-1])
    stoch_d_val = float(stoch_d_series.iloc[-1])

    # --- Volume quality ---
    mfi_val = float(P.mfi(high, low, close, volume, 14).iloc[-1])
    cmf_val = float(P.cmf(high, low, close, volume, 20).iloc[-1])
    vol_zscore_val = float(P.vol_zscore(volume, 20).iloc[-1])

    # --- Directional movement ---
    adx_s, dmi_plus_s, dmi_minus_s = P.adx_dmi(high, low, close, 14)
    adx_val = float(adx_s.iloc[-1])
    dmi_plus_val = float(dmi_plus_s.iloc[-1])
    dmi_minus_val = float(dmi_minus_s.iloc[-1])

    # --- Aroon ---
    aroon_up_s, aroon_down_s = P.aroon(high, low, 25)
    aroon_up_val = float(aroon_up_s.iloc[-1])
    aroon_down_val = float(aroon_down_s.iloc[-1])

    # --- Channel + squeeze ---
    kc_pos_s, kc_upper_s, kc_lower_s = P.keltner_bands(high, low, close)
    kc_position_val = float(kc_pos_s.iloc[-1])
    kc_upper_v = float(kc_upper_s.iloc[-1])
    kc_lower_v = float(kc_lower_s.iloc[-1])
    donchian_pos_val = float(P.donchian_position(high, low, close, 20).iloc[-1])
    bb_squeeze_val = 1.0 if (bb_upper_v < kc_upper_v and bb_lower_v > kc_lower_v) else 0.0
    pvt_s = P.pvt(close, volume)
    pvt_slope_val = H.slope_pct(pvt_s, 20)

    # --- Ichimoku ---
    ichi_t, ichi_k, ichi_c = P.ichimoku(high, low, close)
    ichimoku_tenkan_val = float(ichi_t.iloc[-1])
    ichimoku_kijun_val = float(ichi_k.iloc[-1])
    ichimoku_cloud_dist_val = float(ichi_c.iloc[-1])

    # --- Daily pivot ---
    daily_k = klines[["high", "low", "close"]].resample("1D").agg(
        {"high": "max", "low": "min", "close": "last"}
    )
    if len(daily_k) >= 2:
        prev_h = float(daily_k["high"].iloc[-2])
        prev_l = float(daily_k["low"].iloc[-2])
        prev_c = float(daily_k["close"].iloc[-2])
        piv = (prev_h + prev_l + prev_c) / 3.0
        r1 = 2.0 * piv - prev_l
        s1 = 2.0 * piv - prev_h
        pivot_r1_dist = (price - r1) / price if price else 0.0
        pivot_s1_dist = (price - s1) / price if price else 0.0
    else:
        pivot_r1_dist = 0.0
        pivot_s1_dist = 0.0

    # --- Supertrend ---
    st_dir, st_dist = P.supertrend(high, low, close, period=7, mult=3.0)
    supertrend_signal_val = float(st_dir.iloc[-1])
    supertrend_dist_val = float(st_dist.iloc[-1])

    # --- Price acceleration ---
    price_accel_val = float(P.price_accel(close, 5).iloc[-1])

    # --- EMA multi-period ---
    ema9_series = P.ema(close, 9)
    ema100_series = P.ema(close, 100)
    ema9_slope = H.slope_pct(ema9_series, 5)
    ema100_slope = H.slope_pct(ema100_series, 10)
    ema20_v = float(ema20_series.iloc[-1])
    ema100_v = float(ema100_series.iloc[-1])
    price_vs_ema20 = (price - ema20_v) / ema20_v if ema20_v else 0.0
    price_vs_ema100 = (price - ema100_v) / ema100_v if ema100_v else 0.0

    # --- Historical volatility ---
    _vol_p24 = max(2, _b24h)
    _vol_p7d = max(2, _b7d)
    hvol24 = float(P.hist_vol(close, _vol_p24, BPY).iloc[-1])
    hvol7d = float(P.hist_vol(close, _vol_p7d, BPY).iloc[-1])
    vol_regime_val = (hvol24 / hvol7d) if hvol7d > 0 else 1.0
    vol_regime_val = max(0.1, min(5.0, vol_regime_val))
    parkinson_val = float(P.parkinson_vol(high, low, _vol_p24, BPY).iloc[-1])

    # --- MACD extensions ---
    _ema12_v = float(P.ema(close, 12).iloc[-1])
    _ema26_v = float(P.ema(close, 26).iloc[-1])
    macd_line_norm = (_ema12_v - _ema26_v) / price if price else 0.0
    _mh_prev = float(macd_h_series.iloc[-4]) if len(macd_h_series) >= 4 else float(macd_h_series.iloc[0])
    macd_hist_slope_val = float(macd_h_series.iloc[-1]) - _mh_prev

    # --- Volume profile ---
    volume_7d = float(volume.iloc[-_b7d:].sum()) if len(volume) >= _b7d else float(volume.sum())
    mean_vol_24 = float(volume.iloc[-(_b24h + 1):-1].mean()) if len(volume) > _b24h else float(volume.mean())
    vol_ratio_24_val = float(volume.iloc[-1]) / mean_vol_24 if mean_vol_24 > 0 else 1.0
    taker_24h = float(taker_buy.iloc[-_b24h:].sum()) if len(taker_buy) >= _b24h else float(taker_buy.sum())
    vol_24h_sum = float(volume.iloc[-_b24h:].sum()) if len(volume) >= _b24h else float(volume.sum())
    taker_buy_ratio_24h_val = max(0.0, min(1.0, taker_24h / vol_24h_sum if vol_24h_sum > 0 else 0.5))
    vol_acceleration_val = max(0.1, min(10.0, vol_ratio_3 / vol_ratio_24_val if vol_ratio_24_val > 0 else 1.0))

    # --- Price structure ---
    high_7d = float(high.iloc[-_b7d:].max()) if len(high) >= _b7d else float(high.max())
    low_7d = float(low.iloc[-_b7d:].min()) if len(low) >= _b7d else float(low.min())
    range_7d = high_7d - low_7d
    range_7d_pos = (price - low_7d) / range_7d if range_7d > 0 else 0.5
    prev_close_val = float(close.iloc[-2]) if len(close) >= 2 else price
    gap_pct_val = (candle_open - prev_close_val) / prev_close_val if prev_close_val else 0.0
    up_bars = (close.iloc[-20:] > open_.iloc[-20:]) if len(close) >= 20 else (close > open_)
    close_above_open_ratio_val = float(up_bars.mean())
    consecutive_bars_val = float(P.consecutive_bars_vec(close).iloc[-1])
    _body_abs = abs(price - candle_open)
    body_ratio_val = _body_abs / candle_range if candle_range > 0 else 0.5

    # --- Candle patterns ---
    eng_bull_s, eng_bear_s, doji_s, hammer_s = P.candle_patterns(open_, high, low, close)
    engulfing_bull_val = float(eng_bull_s.iloc[-1])
    engulfing_bear_val = float(eng_bear_s.iloc[-1])
    doji_val = float(doji_s.iloc[-1])
    hammer_val = float(hammer_s.iloc[-1])

    # --- Trend quality ---
    lr_slope_20_val = float(P.lr_slope_norm(close, 20).iloc[-1])
    efficiency_ratio_val = float(P.efficiency_ratio(close, 20).iloc[-1])
    trend_consistency_val = float(P.trend_consistency(close, 20).iloc[-1])

    # --- Meta ---
    regime_val = H.regime(close, atr_pct)
    hour_of_day = int(ts_dt.astimezone(timezone.utc).hour)
    day_of_week = int(ts_dt.astimezone(timezone.utc).weekday())

    return SignalSnapshot(
        symbol=symbol,
        timestamp=ts_dt.astimezone(timezone.utc),
        price=price,
        ema20_slope=ema20_slope, ema50_slope=ema50_slope,
        ema_alignment=ema_alignment, price_vs_ema50=price_vs_ema50,
        rsi14=rsi14, rsi14_slope=rsi14_slope,
        macd_hist=macd_hist_val, roc_10=roc_10,
        atr_pct=atr_pct, atr_ratio_short_long=atr_ratio_short_long,
        bb_width=bb_width, bb_position=bb_position,
        volume_24h=volume_24h, vol_ratio_3=vol_ratio_3, obv_slope=obv_slope,
        htf_structure=htf_structure,
        dist_from_20d_high=dist_from_20d_high, dist_from_20d_low=dist_from_20d_low,
        swing_pivot_distance=swing_pivot_distance,
        funding_rate=funding_rate,
        oi_change_1h=oi_change_1h, oi_change_24h=oi_change_24h,
        long_short_ratio=long_short_ratio,
        cvd_state=cvd_state, taker_buy_ratio_1h=taker_buy_ratio_1h,
        price_change_1h=price_change_1h, price_change_4h=price_change_4h,
        price_change_24h=price_change_24h, price_change_7d=price_change_7d,
        stoch_rsi=stoch_rsi_val, williams_r=williams_r_val, cci=cci_val,
        vwap_ratio=vwap_ratio_val, price_vs_ema200=price_vs_ema200,
        upper_wick_pct=upper_wick_pct, lower_wick_pct=lower_wick_pct,
        rsi7=rsi7_val, rsi21=rsi21_val, stoch_k=stoch_k_val, stoch_d=stoch_d_val,
        mfi=mfi_val, cmf=cmf_val, vol_zscore=vol_zscore_val,
        adx=adx_val, dmi_plus=dmi_plus_val, dmi_minus=dmi_minus_val,
        aroon_up=aroon_up_val, aroon_down=aroon_down_val,
        kc_position=kc_position_val, donchian_position=donchian_pos_val,
        bb_squeeze=bb_squeeze_val, pvt_slope=pvt_slope_val,
        ichimoku_tenkan=ichimoku_tenkan_val, ichimoku_kijun=ichimoku_kijun_val,
        ichimoku_cloud_dist=ichimoku_cloud_dist_val,
        pivot_r1_dist=pivot_r1_dist, pivot_s1_dist=pivot_s1_dist,
        supertrend_signal=supertrend_signal_val, supertrend_dist=supertrend_dist_val,
        price_accel=price_accel_val,
        ema9_slope=ema9_slope, ema100_slope=ema100_slope,
        price_vs_ema20=price_vs_ema20, price_vs_ema100=price_vs_ema100,
        hist_vol_24h=hvol24, hist_vol_7d=hvol7d,
        vol_regime=vol_regime_val, parkinson_vol=parkinson_val,
        macd_line=macd_line_norm, macd_hist_slope=macd_hist_slope_val,
        volume_7d=volume_7d, vol_ratio_24=vol_ratio_24_val,
        taker_buy_ratio_24h=taker_buy_ratio_24h_val, vol_acceleration=vol_acceleration_val,
        range_7d_position=range_7d_pos, gap_pct=gap_pct_val,
        close_above_open_ratio=close_above_open_ratio_val,
        consecutive_bars=consecutive_bars_val, body_ratio=body_ratio_val,
        engulfing_bull=engulfing_bull_val, engulfing_bear=engulfing_bear_val,
        doji=doji_val, hammer=hammer_val,
        lr_slope_20=lr_slope_20_val, efficiency_ratio=efficiency_ratio_val,
        trend_consistency=trend_consistency_val,
        regime=regime_val, hour_of_day=hour_of_day, day_of_week=day_of_week,
    )


def compute_features_table(
    klines: pd.DataFrame,
    symbol: str,
    perp: Optional[pd.DataFrame] = None,
    macro: Optional[pd.DataFrame] = None,
    onchain: Optional[pd.DataFrame] = None,
    tf_minutes: int = 60,
) -> pd.DataFrame:
    """Vectorized feature table — one row per bar. Values match compute_snapshot.

    Delegates to the original scanner.feature_calc.compute_features_table
    until full vectorized migration is complete. This ensures zero behavioral
    divergence during the transition.
    """
    from scanner.feature_calc import compute_features_table as _original_cft
    return _original_cft(klines, symbol, perp=perp, macro=macro, onchain=onchain, tf_minutes=tf_minutes)
