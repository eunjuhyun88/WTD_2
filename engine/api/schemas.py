"""Request / response Pydantic schemas for the Cogochi engine API.

Design rules:
  - Request schemas accept raw data as sent by the TypeScript frontend.
  - Response schemas mirror the Python domain models but are JSON-safe
    (enums serialised as strings, datetimes as ISO-8601 strings).
  - No business logic here — schemas are pure data contracts.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


# =========================================================================
# Shared primitives
# =========================================================================


class KlineBar(BaseModel):
    """One OHLCV bar as sent by the Binance klines endpoint (normalised)."""

    t: int    # open-time in milliseconds UTC
    o: float  # open
    h: float  # high
    l: float  # low
    c: float  # close
    v: float  # base volume
    tbv: float = 0.0  # taker buy base volume — absolute, same unit as volume


class PerpSnapshot(BaseModel):
    """Current-bar derivatives data. TypeScript side computes deltas.

    All fields are optional — missing values fall back to neutral defaults
    so that spot-only symbols still get a valid (partial) snapshot.
    """

    funding_rate: float = 0.0
    oi_change_1h: float = 0.0    # pct change vs 1h ago
    oi_change_24h: float = 0.0   # pct change vs 24h ago
    long_short_ratio: float = 1.0
    taker_buy_ratio: Optional[float] = None  # overrides kline tbv if present


# =========================================================================
# POST /score
# =========================================================================


class ScoreRequest(BaseModel):
    symbol: str
    klines: list[KlineBar] = Field(..., min_length=1)
    perp: PerpSnapshot = Field(default_factory=PerpSnapshot)


class EnsembleSignal(BaseModel):
    direction: str             # "strong_long" | "long" | "neutral" | "short" | "strong_short"
    ensemble_score: float      # [0, 1] overall conviction
    ml_contribution: float
    block_contribution: float
    regime_contribution: float
    confidence: str            # "high" | "medium" | "low"
    reason: str
    block_analysis: dict[str, Any]


class ScoreResponse(BaseModel):
    snapshot: dict[str, Any]      # SignalSnapshot.model_dump()
    p_win: Optional[float]        # None until LightGBM is trained
    blocks_triggered: list[str]   # building blocks that fire on this bar
    ensemble: Optional[EnsembleSignal] = None  # fused ML + blocks signal
    ensemble_triggered: bool = False  # convenience: True iff ensemble.confidence in (high, medium) and direction != neutral


# =========================================================================
# POST /backtest
# =========================================================================


class BlockSet(BaseModel):
    triggers: list[str] = Field(default_factory=list)
    confirmations: list[str] = Field(default_factory=list)
    entries: list[str] = Field(default_factory=list)
    disqualifiers: list[str] = Field(default_factory=list)


class BacktestConfig(BaseModel):
    stop_loss: float = 0.02      # fraction, e.g. 0.02 = 2%
    take_profit: float = 0.04
    timeout_bars: int = 24
    universe: str = "binance_30"


class BacktestRequest(BaseModel):
    blocks: BlockSet
    config: BacktestConfig = Field(default_factory=BacktestConfig)


class BacktestMetrics(BaseModel):
    n_trades: int
    win_rate: float
    expectancy: float            # mean PnL per trade (fraction)
    profit_factor: float
    max_drawdown: float
    sortino: float
    walk_forward_pass_rate: float  # fraction of quarters with positive expectancy


class BacktestResponse(BaseModel):
    metrics: BacktestMetrics
    passed: bool                 # True iff all Stage-1 gates pass
    gate_failures: list[str]     # human-readable failure reasons


# =========================================================================
# POST /challenge/create
# =========================================================================


class SnapInput(BaseModel):
    symbol: str
    timestamp: datetime          # UTC
    label: str = ""              # optional: "급락", "OI 터짐", "진입"


class ChallengeCreateRequest(BaseModel):
    snaps: list[SnapInput] = Field(..., min_length=1, max_length=5)
    user_id: Optional[str] = None


class StrategyResult(BaseModel):
    name: str                    # "feature_outlier" | "cosine_similarity" | etc.
    win_rate: float
    match_count: int
    expectancy: float


class ChallengeCreateResponse(BaseModel):
    slug: str
    strategies: list[StrategyResult]
    recommended: str             # name of best-performing strategy
    feature_vector: list[float]  # pattern centroid for similarity search


# =========================================================================
# GET /challenge/{slug}/scan
# =========================================================================


class ScanMatch(BaseModel):
    symbol: str
    timestamp: datetime
    similarity: float            # 0..1
    p_win: Optional[float]
    price: float


class ChallengeScanResponse(BaseModel):
    slug: str
    scanned_at: datetime
    matches: list[ScanMatch]


# =========================================================================
# POST /train
# =========================================================================


class TradeRecord(BaseModel):
    snapshot: dict[str, Any]    # SignalSnapshot fields
    outcome: int                 # 1 = win, 0 = loss, -1 = timeout


class TrainRequest(BaseModel):
    records: list[TradeRecord] = Field(..., min_length=20)  # matches MIN_TRAIN_RECORDS
    user_id: Optional[str] = None


class TrainResponse(BaseModel):
    auc: float
    n_samples: int
    model_version: str           # timestamp-based version identifier


# =========================================================================
# POST /deep  — full market_engine DeepResult
# =========================================================================


class DeepPerpData(BaseModel):
    """Extended derivatives data for the market_engine pipeline.

    All fields optional — missing values score 0 in the corresponding layer.
    Units follow Binance perpetual API conventions:
      fr         : raw decimal (0.0001 = 0.01% / 8h)
      oi_pct     : percent change (5.0 = +5%)
      oi_notional: USD notional (raw OI coins × mark_price)
      vol_24h    : 24h quote volume in USD
    """

    fr: Optional[float] = None            # funding rate (raw decimal)
    oi_pct: Optional[float] = None        # OI % change vs 1h ago
    ls_ratio: Optional[float] = None      # top-trader long/short ratio
    taker_ratio: Optional[float] = None   # taker buy / sell volume ratio
    price_pct: Optional[float] = None     # price % change last period

    oi_notional: Optional[float] = None   # OI in USD (raw OI × mark_price)
    vol_24h: Optional[float] = None       # 24h volume in USD (quoteVolume)
    mark_price: Optional[float] = None    # mark price (perpetual)
    index_price: Optional[float] = None   # underlying index price

    short_liq_usd: float = 0.0   # forceOrders BUY side (shorts force-closed → USD)
    long_liq_usd: float = 0.0    # forceOrders SELL side (longs force-closed → USD)


class DeepRequest(BaseModel):
    symbol: str
    klines: list[KlineBar] = Field(..., min_length=1)
    perp: DeepPerpData = Field(default_factory=DeepPerpData)


class LayerOut(BaseModel):
    """Serialisable form of market_engine.types.LayerResult."""
    score: float
    sigs: list[dict[str, str]]  # [{"t": "...", "type": "bull|bear|neut|warn"}]
    meta: dict[str, Any]


class DeepResponse(BaseModel):
    symbol: str
    total_score: float           # clipped to [-100, 100]
    verdict: str                 # STRONG BULL | BULLISH | ... | STRONG BEAR
    layers: dict[str, LayerOut]  # per-layer breakdown
    atr_levels: dict[str, Any]   # Chandelier stop/TP levels from l15_atr
    alpha: Optional[dict[str, Any]] = None    # S-series alpha (if spot data provided)
    hunt_score: Optional[int] = None


# =========================================================================
# GET /universe  — CoinMarketCap-style token list
# =========================================================================


class TokenInfo(BaseModel):
    """Single token row in the universe response."""
    rank: int
    symbol: str           # e.g. "BTCUSDT"
    base: str             # e.g. "BTC"
    name: str             # e.g. "Bitcoin"
    sector: str           # e.g. "L1" | "DeFi" | "AI" | "Meme" | ...
    price: float
    pct_24h: float        # % price change 24h
    vol_24h_usd: float    # 24h quote volume USD
    market_cap: float     # approx: price × circulating supply (0 if unknown)
    oi_usd: float         # open interest USD (futures only, 0 for spot-only)
    is_futures: bool      # True if Binance perpetual exists
    trending_score: float # composite rank score for "hot" ordering


class UniverseResponse(BaseModel):
    total: int
    tokens: list[TokenInfo]
    updated_at: str  # ISO-8601
