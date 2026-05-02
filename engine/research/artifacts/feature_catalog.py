"""W-0366: User-facing indicator feature catalog (~20 features).

These are a curated subset of FEATURE_COLUMNS in engine/features/columns.py
that are intuitive for discretionary traders.
"""
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass(frozen=True)
class FeatureMeta:
    label: str
    unit: str | None
    operators: tuple[str, ...]
    value_type: str              # 'float' | 'enum'
    category: str                # 'momentum' | 'trend' | 'volume' | 'derivatives'
    range: tuple[float, float] | None = None
    enum_values: tuple[str, ...] | None = None
    description: str = ''


USER_FACING_FEATURES: dict[str, FeatureMeta] = {
    # -- Momentum ----------------------------------------------------------
    'rsi14': FeatureMeta(
        label='RSI(14)', unit='0-100',
        operators=('<', '>', '<=', '>=', 'between'),
        value_type='float', category='momentum',
        range=(0, 100),
        description='14-period RSI. <30 oversold, >70 overbought.',
    ),
    'rsi14_slope': FeatureMeta(
        label='RSI Slope', unit='pts/bar',
        operators=('<', '>'),
        value_type='float', category='momentum',
        description='Rate of change of RSI over last 3 bars.',
    ),
    'macd_hist': FeatureMeta(
        label='MACD Histogram', unit='price',
        operators=('<', '>'),
        value_type='float', category='momentum',
        description='MACD histogram (signal crossover proxy).',
    ),
    'stoch_rsi': FeatureMeta(
        label='Stoch RSI', unit='0-1',
        operators=('<', '>', 'between'),
        value_type='float', category='momentum',
        range=(0, 1),
        description='Stochastic RSI (0=oversold, 1=overbought).',
    ),
    'roc_10': FeatureMeta(
        label='ROC(10)', unit='%',
        operators=('<', '>'),
        value_type='float', category='momentum',
        description='10-bar rate of change (%).',
    ),
    # -- Trend -------------------------------------------------------------
    'ema_alignment': FeatureMeta(
        label='EMA Alignment', unit=None,
        operators=('==', '!=', 'in'),
        value_type='enum', category='trend',
        enum_values=('bullish', 'bearish', 'neutral'),
        description='EMA20/50/200 stacked alignment.',
    ),
    'ema20_slope': FeatureMeta(
        label='EMA20 Slope', unit='%/bar',
        operators=('<', '>'),
        value_type='float', category='trend',
        description='Slope of EMA20 (normalized).',
    ),
    'price_vs_ema50': FeatureMeta(
        label='Price vs EMA50', unit='%',
        operators=('<', '>', 'between'),
        value_type='float', category='trend',
        description='(price / EMA50 - 1) x 100.',
    ),
    'bb_width': FeatureMeta(
        label='BB Width', unit='%',
        operators=('<', '>'),
        value_type='float', category='trend',
        description='Bollinger Band width (volatility proxy).',
    ),
    'bb_position': FeatureMeta(
        label='BB Position', unit='0-1',
        operators=('<', '>', 'between'),
        value_type='float', category='trend',
        range=(0, 1),
        description='Price position within BB (0=lower, 1=upper).',
    ),
    'atr_pct': FeatureMeta(
        label='ATR %', unit='%',
        operators=('<', '>'),
        value_type='float', category='trend',
        description='ATR as % of price.',
    ),
    'dist_from_20d_high': FeatureMeta(
        label='Dist from 20d High', unit='%',
        operators=('<', '>'),
        value_type='float', category='trend',
        description='Distance from 20-day high (negative = below high).',
    ),
    'dist_from_20d_low': FeatureMeta(
        label='Dist from 20d Low', unit='%',
        operators=('<', '>'),
        value_type='float', category='trend',
        description='Distance from 20-day low (positive = above low).',
    ),
    # -- Volume ------------------------------------------------------------
    'obv_slope': FeatureMeta(
        label='OBV Slope', unit='normalized',
        operators=('<', '>'),
        value_type='float', category='volume',
        description='On-balance volume slope (3-bar).',
    ),
    'vol_ratio_3': FeatureMeta(
        label='Volume Ratio (3-bar)', unit='x',
        operators=('<', '>'),
        value_type='float', category='volume',
        description='Current volume / 3-bar average volume.',
    ),
    'taker_buy_ratio_1h': FeatureMeta(
        label='Taker Buy Ratio', unit='0-1',
        operators=('<', '>'),
        value_type='float', category='volume',
        range=(0, 1),
        description='Taker buy volume / total volume (aggression).',
    ),
    'cvd_state': FeatureMeta(
        label='CVD State', unit=None,
        operators=('==', 'in'),
        value_type='enum', category='volume',
        enum_values=('accumulating', 'distributing', 'neutral'),
        description='Cumulative volume delta trend state.',
    ),
    # -- Derivatives -------------------------------------------------------
    'funding_rate': FeatureMeta(
        label='Funding Rate', unit='%',
        operators=('<', '>'),
        value_type='float', category='derivatives',
        description='Current perpetual funding rate (%).',
    ),
    'oi_change_24h': FeatureMeta(
        label='OI Change (24h)', unit='%',
        operators=('<', '>'),
        value_type='float', category='derivatives',
        description='Open interest 24h change (%).',
    ),
    'htf_structure': FeatureMeta(
        label='HTF Structure', unit=None,
        operators=('==', 'in'),
        value_type='enum', category='derivatives',
        enum_values=('uptrend', 'downtrend', 'ranging'),
        description='Higher-timeframe price structure.',
    ),
}

ALLOWED_OPERATORS = frozenset(['<', '>', '<=', '>=', '==', '!=', 'in', 'between'])
