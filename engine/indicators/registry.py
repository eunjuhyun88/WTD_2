"""Indicator registry — metadata for all known indicators.

Each entry maps an indicator ID to its IndicatorMeta.
The REGISTRY must have >= 100 entries (AC2A-5).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class IndicatorMeta:
    id: str
    label: str
    family: str  # "trend" | "momentum" | "volatility" | "volume" | "overlay" | "breadth"
    outputs: list[str]  # column names returned
    params: dict[str, Any] = field(default_factory=dict)  # name → default value
    description: str = ""
    compute_fn: str = ""  # key into compute dispatch table


# ---------------------------------------------------------------------------
# Build the registry
# ---------------------------------------------------------------------------

def _build_registry() -> dict[str, IndicatorMeta]:
    r: dict[str, IndicatorMeta] = {}

    def add(m: IndicatorMeta) -> None:
        r[m.id] = m

    # --- SMA variants ---
    for length in [5, 9, 10, 20, 50, 100, 200]:
        add(IndicatorMeta(
            id=f"sma_{length}",
            label=f"SMA {length}",
            family="trend",
            outputs=["value"],
            params={"length": length},
            description=f"Simple Moving Average ({length} period)",
            compute_fn="sma",
        ))

    # --- EMA variants ---
    for length in [5, 9, 12, 20, 26, 50, 100, 200]:
        add(IndicatorMeta(
            id=f"ema_{length}",
            label=f"EMA {length}",
            family="trend",
            outputs=["value"],
            params={"length": length},
            description=f"Exponential Moving Average ({length} period)",
            compute_fn="ema",
        ))

    # --- WMA variants ---
    for length in [9, 20, 50]:
        add(IndicatorMeta(
            id=f"wma_{length}",
            label=f"WMA {length}",
            family="trend",
            outputs=["value"],
            params={"length": length},
            description=f"Weighted Moving Average ({length} period)",
            compute_fn="wma",
        ))

    # --- DEMA variants ---
    for length in [20, 50]:
        add(IndicatorMeta(
            id=f"dema_{length}",
            label=f"DEMA {length}",
            family="trend",
            outputs=["value"],
            params={"length": length},
            description=f"Double EMA ({length} period)",
            compute_fn="dema",
        ))

    # --- TEMA variants ---
    for length in [20, 50]:
        add(IndicatorMeta(
            id=f"tema_{length}",
            label=f"TEMA {length}",
            family="trend",
            outputs=["value"],
            params={"length": length},
            description=f"Triple EMA ({length} period)",
            compute_fn="tema",
        ))

    # --- HMA variants ---
    for length in [9, 20, 50]:
        add(IndicatorMeta(
            id=f"hma_{length}",
            label=f"HMA {length}",
            family="trend",
            outputs=["value"],
            params={"length": length},
            description=f"Hull MA ({length} period)",
            compute_fn="hma",
        ))

    # --- KAMA ---
    for length in [10, 20]:
        add(IndicatorMeta(
            id=f"kama_{length}",
            label=f"KAMA {length}",
            family="trend",
            outputs=["value"],
            params={"length": length},
            description=f"Kaufman Adaptive MA ({length} period)",
            compute_fn="kama",
        ))

    # --- TRIMA ---
    for length in [14, 20]:
        add(IndicatorMeta(
            id=f"trima_{length}",
            label=f"TRIMA {length}",
            family="trend",
            outputs=["value"],
            params={"length": length},
            description=f"Triangular MA ({length} period)",
            compute_fn="trima",
        ))

    # --- ZLEMA ---
    for length in [20, 50]:
        add(IndicatorMeta(
            id=f"zlema_{length}",
            label=f"ZLEMA {length}",
            family="trend",
            outputs=["value"],
            params={"length": length},
            description=f"Zero-Lag EMA ({length} period)",
            compute_fn="zlema",
        ))

    # --- ALMA ---
    add(IndicatorMeta(
        id="alma_20",
        label="ALMA 20",
        family="trend",
        outputs=["value"],
        params={"length": 20, "offset": 0.85, "sigma": 6},
        description="Arnaud Legoux MA (20 period)",
        compute_fn="alma",
    ))

    # --- VWMA ---
    for length in [20, 50]:
        add(IndicatorMeta(
            id=f"vwma_{length}",
            label=f"VWMA {length}",
            family="volume",
            outputs=["value"],
            params={"length": length},
            description=f"Volume-Weighted MA ({length} period)",
            compute_fn="vwma",
        ))

    # --- PSAR ---
    add(IndicatorMeta(
        id="psar",
        label="Parabolic SAR",
        family="trend",
        outputs=["value"],
        params={"step": 0.02, "max_step": 0.2},
        description="Parabolic SAR",
        compute_fn="psar",
    ))
    add(IndicatorMeta(
        id="psar_fast",
        label="Parabolic SAR (fast)",
        family="trend",
        outputs=["value"],
        params={"step": 0.04, "max_step": 0.4},
        description="Parabolic SAR (aggressive settings)",
        compute_fn="psar",
    ))

    # --- RSI variants ---
    for length in [7, 9, 14, 21]:
        add(IndicatorMeta(
            id=f"rsi_{length}",
            label=f"RSI {length}",
            family="momentum",
            outputs=["value"],
            params={"length": length},
            description=f"Relative Strength Index ({length} period)",
            compute_fn="rsi",
        ))

    # --- MACD variants ---
    add(IndicatorMeta(
        id="macd_12_26_9",
        label="MACD (12,26,9)",
        family="momentum",
        outputs=["macd", "signal", "hist"],
        params={"fast": 12, "slow": 26, "signal": 9},
        description="MACD standard (12,26,9)",
        compute_fn="macd",
    ))
    add(IndicatorMeta(
        id="macd_5_35_5",
        label="MACD (5,35,5)",
        family="momentum",
        outputs=["macd", "signal", "hist"],
        params={"fast": 5, "slow": 35, "signal": 5},
        description="MACD slow (5,35,5)",
        compute_fn="macd",
    ))

    # --- Stochastic ---
    add(IndicatorMeta(
        id="stoch_14_3",
        label="Stoch (14,3)",
        family="momentum",
        outputs=["k", "d"],
        params={"k": 14, "d": 3},
        description="Stochastic Oscillator (14,3)",
        compute_fn="stoch",
    ))
    add(IndicatorMeta(
        id="stoch_5_3",
        label="Stoch (5,3) fast",
        family="momentum",
        outputs=["k", "d"],
        params={"k": 5, "d": 3},
        description="Fast Stochastic (5,3)",
        compute_fn="stoch",
    ))

    # --- CCI ---
    for length in [14, 20]:
        add(IndicatorMeta(
            id=f"cci_{length}",
            label=f"CCI {length}",
            family="momentum",
            outputs=["value"],
            params={"length": length},
            description=f"Commodity Channel Index ({length} period)",
            compute_fn="cci",
        ))

    # --- ROC ---
    for length in [9, 12, 21]:
        add(IndicatorMeta(
            id=f"roc_{length}",
            label=f"ROC {length}",
            family="momentum",
            outputs=["value"],
            params={"length": length},
            description=f"Rate of Change ({length} period)",
            compute_fn="roc",
        ))

    # --- Momentum ---
    for length in [10, 14]:
        add(IndicatorMeta(
            id=f"momentum_{length}",
            label=f"Momentum {length}",
            family="momentum",
            outputs=["value"],
            params={"length": length},
            description=f"Price Momentum ({length} period)",
            compute_fn="momentum",
        ))

    # --- Williams %R ---
    for length in [14, 21]:
        add(IndicatorMeta(
            id=f"williams_r_{length}",
            label=f"Williams %R {length}",
            family="momentum",
            outputs=["value"],
            params={"length": length},
            description=f"Williams Percent Range ({length} period)",
            compute_fn="williams_r",
        ))

    # --- CMO ---
    for length in [9, 14]:
        add(IndicatorMeta(
            id=f"cmo_{length}",
            label=f"CMO {length}",
            family="momentum",
            outputs=["value"],
            params={"length": length},
            description=f"Chande Momentum Oscillator ({length} period)",
            compute_fn="cmo",
        ))

    # --- PPO ---
    add(IndicatorMeta(
        id="ppo_12_26",
        label="PPO (12,26)",
        family="momentum",
        outputs=["value"],
        params={"fast": 12, "slow": 26},
        description="Percentage Price Oscillator (12,26)",
        compute_fn="ppo",
    ))

    # --- TRIX ---
    for length in [14, 18]:
        add(IndicatorMeta(
            id=f"trix_{length}",
            label=f"TRIX {length}",
            family="momentum",
            outputs=["value"],
            params={"length": length},
            description=f"Triple-smoothed EMA ROC ({length} period)",
            compute_fn="trix",
        ))

    # --- DPO ---
    for length in [14, 20]:
        add(IndicatorMeta(
            id=f"dpo_{length}",
            label=f"DPO {length}",
            family="momentum",
            outputs=["value"],
            params={"length": length},
            description=f"Detrended Price Oscillator ({length} period)",
            compute_fn="dpo",
        ))

    # --- Ultimate Oscillator ---
    add(IndicatorMeta(
        id="ultimate_osc",
        label="Ultimate Oscillator (7,14,28)",
        family="momentum",
        outputs=["value"],
        params={"s": 7, "m": 14, "l": 28},
        description="Ultimate Oscillator",
        compute_fn="ultimate_osc",
    ))

    # --- Bollinger Bands ---
    add(IndicatorMeta(
        id="bb_20_2",
        label="BB (20, 2σ)",
        family="volatility",
        outputs=["upper", "mid", "lower"],
        params={"length": 20, "std": 2.0},
        description="Bollinger Bands (20, 2 std)",
        compute_fn="bb",
    ))
    add(IndicatorMeta(
        id="bb_20_25",
        label="BB (20, 2.5σ)",
        family="volatility",
        outputs=["upper", "mid", "lower"],
        params={"length": 20, "std": 2.5},
        description="Bollinger Bands (20, 2.5 std)",
        compute_fn="bb",
    ))

    # --- ATR ---
    for length in [7, 14, 20]:
        add(IndicatorMeta(
            id=f"atr_{length}",
            label=f"ATR {length}",
            family="volatility",
            outputs=["value"],
            params={"length": length},
            description=f"Average True Range ({length} period Wilder)",
            compute_fn="atr",
        ))

    # --- Keltner ---
    add(IndicatorMeta(
        id="keltner_20_15",
        label="Keltner (20, 1.5)",
        family="volatility",
        outputs=["upper", "mid", "lower"],
        params={"length": 20, "mult": 1.5},
        description="Keltner Channels (20, 1.5×ATR)",
        compute_fn="keltner",
    ))
    add(IndicatorMeta(
        id="keltner_20_2",
        label="Keltner (20, 2.0)",
        family="volatility",
        outputs=["upper", "mid", "lower"],
        params={"length": 20, "mult": 2.0},
        description="Keltner Channels (20, 2×ATR)",
        compute_fn="keltner",
    ))

    # --- Donchian ---
    for length in [14, 20, 55]:
        add(IndicatorMeta(
            id=f"donchian_{length}",
            label=f"Donchian {length}",
            family="volatility",
            outputs=["upper", "mid", "lower"],
            params={"length": length},
            description=f"Donchian Channels ({length} period)",
            compute_fn="donchian",
        ))

    # --- Choppiness ---
    for length in [14, 20]:
        add(IndicatorMeta(
            id=f"chop_{length}",
            label=f"Choppiness {length}",
            family="volatility",
            outputs=["value"],
            params={"length": length},
            description=f"Choppiness Index ({length} period)",
            compute_fn="chop",
        ))

    # --- Mass Index ---
    add(IndicatorMeta(
        id="mass_index",
        label="Mass Index",
        family="volatility",
        outputs=["value"],
        params={"length": 25},
        description="Mass Index",
        compute_fn="mass_index",
    ))

    # --- ADX ---
    for length in [14, 20]:
        add(IndicatorMeta(
            id=f"adx_{length}",
            label=f"ADX {length}",
            family="trend",
            outputs=["value"],
            params={"length": length},
            description=f"Average Directional Index ({length} period)",
            compute_fn="adx",
        ))

    # --- Aroon ---
    for length in [14, 25]:
        add(IndicatorMeta(
            id=f"aroon_{length}",
            label=f"Aroon {length}",
            family="trend",
            outputs=["up", "down"],
            params={"length": length},
            description=f"Aroon Up/Down ({length} period)",
            compute_fn="aroon",
        ))

    # --- VWAP ---
    add(IndicatorMeta(
        id="vwap",
        label="VWAP",
        family="volume",
        outputs=["value"],
        params={},
        description="Volume Weighted Average Price (cumulative)",
        compute_fn="vwap",
    ))

    # --- OBV ---
    add(IndicatorMeta(
        id="obv",
        label="OBV",
        family="volume",
        outputs=["value"],
        params={},
        description="On-Balance Volume",
        compute_fn="obv",
    ))

    # --- MFI ---
    for length in [14, 21]:
        add(IndicatorMeta(
            id=f"mfi_{length}",
            label=f"MFI {length}",
            family="volume",
            outputs=["value"],
            params={"length": length},
            description=f"Money Flow Index ({length} period)",
            compute_fn="mfi",
        ))

    # --- CMF ---
    for length in [20, 21]:
        add(IndicatorMeta(
            id=f"cmf_{length}",
            label=f"CMF {length}",
            family="volume",
            outputs=["value"],
            params={"length": length},
            description=f"Chaikin Money Flow ({length} period)",
            compute_fn="cmf",
        ))

    # --- Elder Ray ---
    add(IndicatorMeta(
        id="elder_ray",
        label="Elder Ray",
        family="momentum",
        outputs=["bull", "bear"],
        params={"length": 13},
        description="Elder-Ray Bull/Bear Power (13 EMA)",
        compute_fn="elder_ray",
    ))

    # --- Balance of Power ---
    add(IndicatorMeta(
        id="balance_power",
        label="Balance of Power",
        family="momentum",
        outputs=["value"],
        params={},
        description="Balance of Power (Bull - Bear)",
        compute_fn="balance_power",
    ))

    # --- Ease of Movement ---
    for length in [9, 14]:
        add(IndicatorMeta(
            id=f"eom_{length}",
            label=f"Ease of Movement {length}",
            family="volume",
            outputs=["value"],
            params={"length": length},
            description=f"Ease of Movement ({length} period)",
            compute_fn="ease_of_movement",
        ))

    # --- Force Index ---
    for length in [2, 13]:
        add(IndicatorMeta(
            id=f"force_index_{length}",
            label=f"Force Index {length}",
            family="volume",
            outputs=["value"],
            params={"length": length},
            description=f"Force Index ({length} period EMA)",
            compute_fn="force_index",
        ))

    # --- NVI / PVI ---
    add(IndicatorMeta(
        id="nvi",
        label="NVI",
        family="volume",
        outputs=["value"],
        params={},
        description="Negative Volume Index",
        compute_fn="nvi",
    ))
    add(IndicatorMeta(
        id="pvi",
        label="PVI",
        family="volume",
        outputs=["value"],
        params={},
        description="Positive Volume Index",
        compute_fn="pvi",
    ))

    # --- Volume SMA/EMA ---
    for length in [20, 50]:
        add(IndicatorMeta(
            id=f"volume_sma_{length}",
            label=f"Volume SMA {length}",
            family="volume",
            outputs=["value"],
            params={"length": length},
            description=f"Volume SMA ({length} period)",
            compute_fn="volume_sma",
        ))
        add(IndicatorMeta(
            id=f"volume_ema_{length}",
            label=f"Volume EMA {length}",
            family="volume",
            outputs=["value"],
            params={"length": length},
            description=f"Volume EMA ({length} period)",
            compute_fn="volume_ema",
        ))

    # --- Volume RSI ---
    add(IndicatorMeta(
        id="volume_rsi_14",
        label="Volume RSI 14",
        family="volume",
        outputs=["value"],
        params={"length": 14},
        description="RSI applied to volume (14 period)",
        compute_fn="volume_rsi",
    ))

    # --- Pivot Points ---
    add(IndicatorMeta(
        id="pivot_points",
        label="Pivot Points",
        family="overlay",
        outputs=["pivot", "r1", "s1", "r2", "s2"],
        params={},
        description="Classic Pivot Points",
        compute_fn="pivot_points",
    ))

    # --- SMA extra presets ---
    for length in [14, 30]:
        add(IndicatorMeta(
            id=f"sma_{length}",
            label=f"SMA {length}",
            family="trend",
            outputs=["value"],
            params={"length": length},
            description=f"Simple Moving Average ({length} period)",
            compute_fn="sma",
        ))

    # --- EMA extra presets ---
    for length in [8, 34]:
        add(IndicatorMeta(
            id=f"ema_{length}",
            label=f"EMA {length}",
            family="trend",
            outputs=["value"],
            params={"length": length},
            description=f"Exponential Moving Average ({length} period)",
            compute_fn="ema",
        ))

    # --- RSI extra presets ---
    for length in [2, 5]:
        add(IndicatorMeta(
            id=f"rsi_{length}",
            label=f"RSI {length}",
            family="momentum",
            outputs=["value"],
            params={"length": length},
            description=f"RSI ({length} period, short-term)",
            compute_fn="rsi",
        ))

    # --- ATR extra presets ---
    add(IndicatorMeta(
        id="atr_5",
        label="ATR 5",
        family="volatility",
        outputs=["value"],
        params={"length": 5},
        description="ATR (5 period)",
        compute_fn="atr",
    ))

    # --- Crypto ---
    add(IndicatorMeta(
        id="funding_sma_8",
        label="Funding SMA 8",
        family="breadth",
        outputs=["value"],
        params={"length": 8},
        description="SMA of funding rate (8 period)",
        compute_fn="funding_sma",
    ))
    add(IndicatorMeta(
        id="basis",
        label="Basis (perp - spot)",
        family="breadth",
        outputs=["value"],
        params={},
        description="Crypto perpetual-to-spot basis",
        compute_fn="basis",
    ))

    return r


REGISTRY: dict[str, IndicatorMeta] = _build_registry()
