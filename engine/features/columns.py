"""Feature column definitions and constants.

Single source of truth for column names used by models, blocks, and scoring.
"""
from __future__ import annotations

MIN_HISTORY_BARS = 500

_CORE_FEATURE_COLUMNS: tuple[str, ...] = (
    "ema20_slope", "ema50_slope", "ema_alignment", "price_vs_ema50",
    "rsi14", "rsi14_slope", "macd_hist", "roc_10",
    "atr_pct", "atr_ratio_short_long", "bb_width", "bb_position",
    "volume_24h", "vol_ratio_3", "obv_slope",
    "htf_structure", "dist_from_20d_high", "dist_from_20d_low", "swing_pivot_distance",
    "funding_rate", "oi_change_1h", "oi_change_24h", "long_short_ratio",
    "cvd_state", "taker_buy_ratio_1h",
    "price_change_1h", "price_change_4h", "price_change_24h", "price_change_7d",
    "stoch_rsi", "williams_r", "cci",
    "vwap_ratio", "price_vs_ema200",
    "upper_wick_pct", "lower_wick_pct",
    "rsi7", "rsi21", "stoch_k", "stoch_d",
    "mfi", "cmf", "vol_zscore",
    "adx", "dmi_plus", "dmi_minus",
    "aroon_up", "aroon_down",
    "kc_position", "donchian_position", "bb_squeeze", "pvt_slope",
    "ichimoku_tenkan", "ichimoku_kijun", "ichimoku_cloud_dist",
    "pivot_r1_dist", "pivot_s1_dist",
    "supertrend_signal", "supertrend_dist",
    "price_accel",
    "ema9_slope", "ema100_slope", "price_vs_ema20", "price_vs_ema100",
    "hist_vol_24h", "hist_vol_7d", "vol_regime", "parkinson_vol",
    "macd_line", "macd_hist_slope",
    "volume_7d", "vol_ratio_24", "taker_buy_ratio_24h", "vol_acceleration",
    "range_7d_position", "gap_pct", "close_above_open_ratio", "consecutive_bars", "body_ratio",
    "engulfing_bull", "engulfing_bear", "doji", "hammer",
    "lr_slope_20", "efficiency_ratio", "trend_consistency",
    "regime", "hour_of_day", "day_of_week",
)

from data_cache.registry import all_macro_columns, all_onchain_columns  # noqa: E402

_REGISTRY_COLUMNS: tuple[str, ...] = tuple(
    all_macro_columns() + all_onchain_columns()
)

_KOREA_FEATURE_COLUMNS: tuple[str, ...] = (
    "kimchi_premium_pct",
    "kimchi_premium_7d_mean",
    "kimchi_premium_zscore",
    "session_return_apac",
    "session_return_us",
    "session_return_eu",
    "session_dominance",
    "oi_normalized_cvd",
    "oi_normalized_cvd_1h",
)

FEATURE_COLUMNS: tuple[str, ...] = _CORE_FEATURE_COLUMNS + _KOREA_FEATURE_COLUMNS + _REGISTRY_COLUMNS
