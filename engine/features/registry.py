"""Feature Registry — metadata catalog for all computed features.

Each registered feature group declares its domain, output columns, warmup
requirement, and input dependencies. This enables:
  - Feature lineage tracking (which features contributed to a prediction)
  - Selective feature computation (compute only needed features)
  - Version fingerprinting (detect when feature logic changes)
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field


@dataclass(frozen=True)
class FeatureGroup:
    """Metadata for a group of related features computed together."""
    name: str
    domain: str
    output_columns: tuple[str, ...]
    warmup_bars: int = 0
    input_columns: tuple[str, ...] = ()
    version: str = "1"

    @property
    def fingerprint(self) -> str:
        payload = f"{self.name}:{self.version}:{','.join(self.output_columns)}"
        return hashlib.sha256(payload.encode()).hexdigest()[:12]


_REGISTRY: dict[str, FeatureGroup] = {}


def register(group: FeatureGroup) -> FeatureGroup:
    _REGISTRY[group.name] = group
    return group


def get_all() -> dict[str, FeatureGroup]:
    return dict(_REGISTRY)


def get_by_domain(domain: str) -> list[FeatureGroup]:
    return [g for g in _REGISTRY.values() if g.domain == domain]


def feature_fingerprint() -> str:
    """Combined fingerprint of all registered feature groups — changes when any feature changes."""
    parts = sorted(f"{g.name}:{g.fingerprint}" for g in _REGISTRY.values())
    payload = "|".join(parts)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


# --- Register all feature groups ---

TREND = register(FeatureGroup(
    name="trend",
    domain="momentum",
    output_columns=("ema20_slope", "ema50_slope", "ema_alignment", "price_vs_ema50"),
    warmup_bars=200,
    input_columns=("close",),
))

MOMENTUM = register(FeatureGroup(
    name="momentum",
    domain="momentum",
    output_columns=("rsi14", "rsi14_slope", "macd_hist", "roc_10"),
    warmup_bars=26,
    input_columns=("close",),
))

VOLATILITY = register(FeatureGroup(
    name="volatility",
    domain="volatility",
    output_columns=("atr_pct", "atr_ratio_short_long", "bb_width", "bb_position"),
    warmup_bars=50,
    input_columns=("high", "low", "close"),
))

VOLUME = register(FeatureGroup(
    name="volume",
    domain="volume",
    output_columns=("volume_24h", "vol_ratio_3", "obv_slope"),
    warmup_bars=24,
    input_columns=("close", "volume"),
))

STRUCTURE = register(FeatureGroup(
    name="structure",
    domain="structure",
    output_columns=("htf_structure", "dist_from_20d_high", "dist_from_20d_low", "swing_pivot_distance"),
    warmup_bars=480,
    input_columns=("high", "low", "close"),
))

MICROSTRUCTURE = register(FeatureGroup(
    name="microstructure",
    domain="microstructure",
    output_columns=("funding_rate", "oi_change_1h", "oi_change_24h", "long_short_ratio"),
    warmup_bars=0,
    input_columns=(),
))

ORDER_FLOW = register(FeatureGroup(
    name="order_flow",
    domain="microstructure",
    output_columns=("cvd_state", "taker_buy_ratio_1h"),
    warmup_bars=0,
    input_columns=("volume", "taker_buy_base_volume"),
))

PRICE_CHANGES = register(FeatureGroup(
    name="price_changes",
    domain="momentum",
    output_columns=("price_change_1h", "price_change_4h", "price_change_24h", "price_change_7d"),
    warmup_bars=168,
    input_columns=("close",),
))

MOMENTUM_OSC = register(FeatureGroup(
    name="momentum_oscillators",
    domain="momentum",
    output_columns=("stoch_rsi", "williams_r", "cci"),
    warmup_bars=20,
    input_columns=("high", "low", "close"),
))

PRICE_RELATIVE = register(FeatureGroup(
    name="price_relative",
    domain="momentum",
    output_columns=("vwap_ratio", "price_vs_ema200"),
    warmup_bars=200,
    input_columns=("close", "volume"),
))

CANDLE_STRUCTURE = register(FeatureGroup(
    name="candle_structure",
    domain="structure",
    output_columns=("upper_wick_pct", "lower_wick_pct"),
    warmup_bars=0,
    input_columns=("open", "high", "low", "close"),
))

EXTENDED_RSI = register(FeatureGroup(
    name="extended_rsi_stoch",
    domain="momentum",
    output_columns=("rsi7", "rsi21", "stoch_k", "stoch_d"),
    warmup_bars=21,
    input_columns=("high", "low", "close"),
))

VOLUME_QUALITY = register(FeatureGroup(
    name="volume_quality",
    domain="volume",
    output_columns=("mfi", "cmf", "vol_zscore"),
    warmup_bars=20,
    input_columns=("high", "low", "close", "volume"),
))

DIRECTIONAL = register(FeatureGroup(
    name="directional",
    domain="momentum",
    output_columns=("adx", "dmi_plus", "dmi_minus"),
    warmup_bars=28,
    input_columns=("high", "low", "close"),
))

AROON = register(FeatureGroup(
    name="aroon",
    domain="momentum",
    output_columns=("aroon_up", "aroon_down"),
    warmup_bars=26,
    input_columns=("high", "low"),
))

CHANNEL_SQUEEZE = register(FeatureGroup(
    name="channel_squeeze",
    domain="volatility",
    output_columns=("kc_position", "donchian_position", "bb_squeeze", "pvt_slope"),
    warmup_bars=20,
    input_columns=("high", "low", "close", "volume"),
))

ICHIMOKU = register(FeatureGroup(
    name="ichimoku",
    domain="structure",
    output_columns=("ichimoku_tenkan", "ichimoku_kijun", "ichimoku_cloud_dist"),
    warmup_bars=52,
    input_columns=("high", "low", "close"),
))

PIVOT = register(FeatureGroup(
    name="pivot",
    domain="structure",
    output_columns=("pivot_r1_dist", "pivot_s1_dist"),
    warmup_bars=48,
    input_columns=("high", "low", "close"),
))

SUPERTREND = register(FeatureGroup(
    name="supertrend",
    domain="trend",
    output_columns=("supertrend_signal", "supertrend_dist"),
    warmup_bars=14,
    input_columns=("high", "low", "close"),
))

PRICE_ACCEL = register(FeatureGroup(
    name="price_accel",
    domain="momentum",
    output_columns=("price_accel",),
    warmup_bars=10,
    input_columns=("close",),
))

EMA_MULTI = register(FeatureGroup(
    name="ema_multi",
    domain="trend",
    output_columns=("ema9_slope", "ema100_slope", "price_vs_ema20", "price_vs_ema100"),
    warmup_bars=100,
    input_columns=("close",),
))

HIST_VOL = register(FeatureGroup(
    name="hist_vol",
    domain="volatility",
    output_columns=("hist_vol_24h", "hist_vol_7d", "vol_regime", "parkinson_vol"),
    warmup_bars=168,
    input_columns=("high", "low", "close"),
))

MACD_EXT = register(FeatureGroup(
    name="macd_extensions",
    domain="momentum",
    output_columns=("macd_line", "macd_hist_slope"),
    warmup_bars=26,
    input_columns=("close",),
))

VOLUME_PROFILE = register(FeatureGroup(
    name="volume_profile",
    domain="volume",
    output_columns=("volume_7d", "vol_ratio_24", "taker_buy_ratio_24h", "vol_acceleration"),
    warmup_bars=168,
    input_columns=("close", "volume", "taker_buy_base_volume"),
))

PRICE_STRUCTURE = register(FeatureGroup(
    name="price_structure",
    domain="structure",
    output_columns=("range_7d_position", "gap_pct", "close_above_open_ratio", "consecutive_bars", "body_ratio"),
    warmup_bars=168,
    input_columns=("open", "high", "low", "close"),
))

CANDLE_PATTERNS = register(FeatureGroup(
    name="candle_patterns",
    domain="structure",
    output_columns=("engulfing_bull", "engulfing_bear", "doji", "hammer"),
    warmup_bars=2,
    input_columns=("open", "high", "low", "close"),
))

TREND_QUALITY = register(FeatureGroup(
    name="trend_quality",
    domain="trend",
    output_columns=("lr_slope_20", "efficiency_ratio", "trend_consistency"),
    warmup_bars=20,
    input_columns=("close",),
))

META = register(FeatureGroup(
    name="meta",
    domain="meta",
    output_columns=("regime", "hour_of_day", "day_of_week"),
    warmup_bars=50,
    input_columns=("close",),
))

MACRO = register(FeatureGroup(
    name="macro",
    domain="external",
    output_columns=(),
    warmup_bars=0,
    input_columns=(),
    version="registry-driven",
))

ONCHAIN = register(FeatureGroup(
    name="onchain",
    domain="external",
    output_columns=(),
    warmup_bars=0,
    input_columns=(),
    version="registry-driven",
))
