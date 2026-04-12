"""
Shared data contract for the Cogochi LoRA pipeline (Track A) and the
pattern-scanner swarm challenge (Track B).

`SignalSnapshot` is the canonical feature vector for a single (symbol, bar)
observation. All features are derived-only: they must be computable from
historical klines plus a small set of perp endpoints, with NO look-ahead.

`Pattern` + `PatternCondition` define the minimal AST that autoresearch
agents mutate. A Pattern is a conjunction of field-operator-value checks
against a SignalSnapshot. This restricted grammar is deliberate: it keeps
the search space finite, the signatures hashable, and the look-ahead-bias
audit mechanical.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any, Union

from pydantic import BaseModel, Field, field_validator

if TYPE_CHECKING:
    import pandas as pd  # noqa: F401  (only for type hints)


# =========================================================================
# Enumerated field types
# =========================================================================


class EMAAlignment(str, Enum):
    BULLISH = "bullish"   # EMA20 > EMA50 > EMA200
    BEARISH = "bearish"   # EMA20 < EMA50 < EMA200
    NEUTRAL = "neutral"   # mixed order


class HTFStructure(str, Enum):
    UPTREND = "uptrend"
    DOWNTREND = "downtrend"
    RANGE = "range"


class CVDState(str, Enum):
    BUYING = "buying"
    SELLING = "selling"
    NEUTRAL = "neutral"


class Regime(str, Enum):
    RISK_ON = "risk_on"
    RISK_OFF = "risk_off"
    CHOP = "chop"


# =========================================================================
# SignalSnapshot — 28 features + metadata
# =========================================================================


class SignalSnapshot(BaseModel):
    """One (symbol, bar) observation in UTC. All feature fields are
    derived-only and must be computable from past data only (no look-ahead).
    """

    # ---- metadata ----
    symbol: str
    timestamp: datetime  # UTC
    price: float         # close of the bar this snapshot refers to

    # ---- A. Trend (4) ----
    ema20_slope: float        # (ema20[t] - ema20[t-k]) / ema20[t-k]
    ema50_slope: float
    ema_alignment: EMAAlignment
    price_vs_ema50: float     # (price - ema50) / ema50

    # ---- B. Momentum (4) ----
    rsi14: float              # 0..100
    rsi14_slope: float        # rsi14[t] - rsi14[t-k]
    macd_hist: float          # MACD histogram value
    roc_10: float             # 10-bar rate of change, fraction

    # ---- C. Volatility (4) ----
    atr_pct: float            # ATR14 / price
    atr_ratio_short_long: float  # ATR(short) / ATR(long)
    bb_width: float           # (upper - lower) / middle
    bb_position: float        # (price - lower) / (upper - lower), 0..1

    # ---- D. Volume (3) ----
    volume_24h: float         # rolling 24h volume (quote or base, consistent)
    vol_ratio_3: float        # vol[t] / mean(vol[t-1..t-3])
    obv_slope: float          # slope of OBV over a window

    # ---- E. Structure / MTF (4) ----
    htf_structure: HTFStructure
    dist_from_20d_high: float  # (price - high_20d) / high_20d, ≤ 0
    dist_from_20d_low: float   # (price - low_20d) / low_20d, ≥ 0
    swing_pivot_distance: float  # bars since most recent swing pivot (signed)

    # ---- F. Microstructure (4) ----
    funding_rate: float        # perp funding rate (8h or hourly, consistent)
    oi_change_1h: float        # open interest pct change 1h
    oi_change_24h: float       # open interest pct change 24h
    long_short_ratio: float    # top trader long/short ratio

    # ---- G. Order flow (2) ----
    cvd_state: CVDState
    taker_buy_ratio_1h: float  # taker buy base vol / total base vol, 0..1

    # ---- H. Price changes (4) ----
    price_change_1h: float = 0.0    # pct change over 1 bar
    price_change_4h: float = 0.0    # pct change over 4 bars
    price_change_24h: float = 0.0   # pct change over 24 bars
    price_change_7d: float = 0.0    # pct change over 168 bars

    # ---- I. Additional momentum oscillators (3) ----
    stoch_rsi: float = 50.0         # stochastic RSI, 0..100
    williams_r: float = -50.0       # Williams %R, -100..0
    cci: float = 0.0                # Commodity Channel Index (unbounded)

    # ---- J. Price relative (2) ----
    vwap_ratio: float = 0.0         # (price - vwap_24h) / vwap_24h
    price_vs_ema200: float = 0.0    # (price - ema200) / ema200

    # ---- K. Candle structure (2) ----
    upper_wick_pct: float = 0.0     # upper wick / total candle range, 0..1
    lower_wick_pct: float = 0.0     # lower wick / total candle range, 0..1

    # ---- Meta (3) ----
    regime: Regime
    hour_of_day: int           # 0..23 UTC
    day_of_week: int           # 0..6, Monday=0

    # ---- validators ----

    @field_validator("hour_of_day")
    @classmethod
    def _hour_range(cls, v: int) -> int:
        if not 0 <= v <= 23:
            raise ValueError(f"hour_of_day must be 0..23, got {v}")
        return v

    @field_validator("day_of_week")
    @classmethod
    def _dow_range(cls, v: int) -> int:
        if not 0 <= v <= 6:
            raise ValueError(f"day_of_week must be 0..6, got {v}")
        return v

    @field_validator("rsi14")
    @classmethod
    def _rsi_range(cls, v: float) -> float:
        if not 0.0 <= v <= 100.0:
            raise ValueError(f"rsi14 must be 0..100, got {v}")
        return v

    @field_validator("bb_position")
    @classmethod
    def _bb_pos_range(cls, v: float) -> float:
        # allow slight overshoot; clamp info only, do not reject
        return v

    @field_validator("taker_buy_ratio_1h")
    @classmethod
    def _taker_range(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError(f"taker_buy_ratio_1h must be 0..1, got {v}")
        return v


# =========================================================================
# Pattern AST
# =========================================================================


class Operator(str, Enum):
    GT = ">"
    LT = "<"
    GTE = ">="
    LTE = "<="
    EQ = "=="
    NEQ = "!="
    IN = "in"          # value is a list/set; actual must be a member
    NOT_IN = "not_in"


# Fields on SignalSnapshot that a PatternCondition is allowed to reference.
# Locked at import time so a pattern cannot probe arbitrary attributes.
_ALLOWED_FIELDS: frozenset[str] = frozenset(
    name for name in SignalSnapshot.model_fields.keys()
    if name not in {"symbol", "timestamp"}  # these are identifiers, not features
)


class PatternCondition(BaseModel):
    """One atomic comparison against a single SignalSnapshot field."""

    field: str
    operator: Operator
    value: Union[float, int, str, bool, list[Union[float, int, str]]]

    @field_validator("field")
    @classmethod
    def _field_allowed(cls, v: str) -> str:
        if v not in _ALLOWED_FIELDS:
            raise ValueError(
                f"PatternCondition.field must be one of the feature fields on "
                f"SignalSnapshot; got {v!r}. Allowed: {sorted(_ALLOWED_FIELDS)}"
            )
        return v

    def matches(self, snapshot: SignalSnapshot) -> bool:
        actual: Any = getattr(snapshot, self.field)
        # Unwrap Enum values so conditions can compare against raw strings
        if isinstance(actual, Enum):
            actual = actual.value
        op = self.operator
        val = self.value
        if op is Operator.GT:
            return actual > val  # type: ignore[operator]
        if op is Operator.LT:
            return actual < val  # type: ignore[operator]
        if op is Operator.GTE:
            return actual >= val  # type: ignore[operator]
        if op is Operator.LTE:
            return actual <= val  # type: ignore[operator]
        if op is Operator.EQ:
            return actual == val
        if op is Operator.NEQ:
            return actual != val
        if op is Operator.IN:
            if not isinstance(val, list):
                raise TypeError("Operator.IN requires a list value")
            return actual in val
        if op is Operator.NOT_IN:
            if not isinstance(val, list):
                raise TypeError("Operator.NOT_IN requires a list value")
            return actual not in val
        raise ValueError(f"unknown operator {op}")  # pragma: no cover


class Pattern(BaseModel):
    """Conjunction of PatternConditions. A snapshot matches the pattern
    iff every condition matches.
    """

    name: str = Field(..., min_length=1)
    description: str = ""
    conditions: list[PatternCondition] = Field(default_factory=list)

    def matches(self, snapshot: SignalSnapshot) -> bool:
        return all(c.matches(snapshot) for c in self.conditions)

    def matches_vectorized(self, features_df: "pd.DataFrame") -> "pd.Series":
        """Vectorized counterpart to matches() over a feature DataFrame.

        `features_df` is the output of scanner.feature_calc.compute_features_table.
        Returns a boolean Series of length len(features_df) where True means
        the row satisfies every condition. Categorical fields in
        features_df are stored as raw strings (not Enum members), so EQ /
        NEQ / IN / NOT_IN comparisons against the .value of an enum work
        the same as in the per-snapshot path.
        """
        # Local import keeps pandas/numpy out of the module-level import
        # graph for code paths that don't use the table form.
        import pandas as pd

        if not self.conditions:
            return pd.Series(True, index=features_df.index)

        mask = pd.Series(True, index=features_df.index)
        for c in self.conditions:
            col = features_df[c.field]
            op = c.operator
            val = c.value
            if op is Operator.GT:
                m = col > val
            elif op is Operator.LT:
                m = col < val
            elif op is Operator.GTE:
                m = col >= val
            elif op is Operator.LTE:
                m = col <= val
            elif op is Operator.EQ:
                m = col == val
            elif op is Operator.NEQ:
                m = col != val
            elif op is Operator.IN:
                if not isinstance(val, list):
                    raise TypeError("Operator.IN requires a list value")
                m = col.isin(val)
            elif op is Operator.NOT_IN:
                if not isinstance(val, list):
                    raise TypeError("Operator.NOT_IN requires a list value")
                m = ~col.isin(val)
            else:
                raise ValueError(f"unknown operator {op}")  # pragma: no cover
            mask &= m.fillna(False)
        return mask

    def signature(self) -> str:
        """Stable, hashable signature used to dedupe patterns across agents.
        Two patterns with identical condition sets (order-insensitive) will
        produce the same signature regardless of name/description.
        """
        parts = sorted(
            f"{c.field}{c.operator.value}{c.value!r}" for c in self.conditions
        )
        return "&".join(parts)
