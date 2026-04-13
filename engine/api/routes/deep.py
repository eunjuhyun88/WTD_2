"""POST /deep — full market_engine pipeline (L2 DeepResult).

This endpoint exposes run_deep_analysis() to the TypeScript frontend.
It is the authoritative source for the Terminal verdict, per-layer scores,
ATR stop/TP levels, and the S-series alpha score.

Unlike /score (feature_calc → LightGBM), /deep runs the institutional-grade
17-layer pipeline with:
  - Wyckoff 2.0 + MTF confluence
  - Adaptive ATR / TTM Squeeze / Dollar-Volume Z-score
  - Funding-rate (calibrated Binance decimal) + OI × Mark-price notional
  - OI-normalized liquidation thresholds
  - Parkinson volatility estimator + Chandelier Exit stops
  - Perpetuals basis (contango/backwardation)

Called every time the Terminal loads or the user changes symbol / TF.
TypeScript side pre-computes all raw Binance data and forwards it here.
"""
from __future__ import annotations

import logging

import pandas as pd
from fastapi import APIRouter, HTTPException

from api.schemas import DeepRequest, DeepResponse, LayerOut
from market_engine.pipeline import run_deep_analysis
from market_engine.types import GlobalCtx

log = logging.getLogger("engine.deep")
router = APIRouter()

# Minimum kline bars required by the deepest indicator (ATR: 100-bar lookback)
_MIN_KLINES = 120


def _klines_to_df(bars) -> pd.DataFrame:
    """Convert list[KlineBar] → OHLCV DataFrame with DatetimeIndex (UTC)."""
    data = {
        "open":  [b.o for b in bars],
        "high":  [b.h for b in bars],
        "low":   [b.l for b in bars],
        "close": [b.c for b in bars],
        "volume": [b.v for b in bars],
        "taker_buy_base_volume": [b.tbv for b in bars],
    }
    timestamps = pd.to_datetime([b.t for b in bars], unit="ms", utc=True)
    return pd.DataFrame(data, index=timestamps)


@router.post("", response_model=DeepResponse)
async def deep(req: DeepRequest) -> DeepResponse:
    """Run all L2 market_engine indicators for a single symbol.

    Requires at least 120 kline bars (ATR 100-bar percentile window).
    Perp data is optional — missing values score 0 in the corresponding layer.
    """
    if len(req.klines) < _MIN_KLINES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Need ≥{_MIN_KLINES} kline bars for full indicator suite "
                f"(got {len(req.klines)}). Send the 1H stream at limit=500 for best results."
            ),
        )

    # --- Convert klines -------------------------------------------------------
    df_1h = _klines_to_df(req.klines)

    # --- Build perp dict (pipeline expects raw key names) --------------------
    p = req.perp
    perp: dict = {}
    if p.fr is not None:           perp["fr"]          = p.fr
    if p.oi_pct is not None:       perp["oi_pct"]      = p.oi_pct
    if p.ls_ratio is not None:     perp["ls_ratio"]    = p.ls_ratio
    if p.taker_ratio is not None:  perp["taker_ratio"] = p.taker_ratio
    if p.price_pct is not None:    perp["price_pct"]   = p.price_pct
    if p.oi_notional is not None:  perp["oi_notional"] = p.oi_notional
    if p.vol_24h is not None:      perp["vol_24h"]     = p.vol_24h
    if p.mark_price is not None:   perp["mark_price"]  = p.mark_price
    if p.index_price is not None:  perp["index_price"] = p.index_price
    perp["short_liq_usd"] = p.short_liq_usd
    perp["long_liq_usd"]  = p.long_liq_usd

    # --- Empty GlobalCtx (L0 cache not run in on-demand path) ---------------
    # Fear-greed, kimchi premium, sector scores are 0 unless ctx is pre-loaded.
    # TODO: expose a /ctx refresh endpoint and cache GlobalCtx in memory.
    ctx = GlobalCtx()

    # --- Run pipeline --------------------------------------------------------
    try:
        result = run_deep_analysis(
            symbol=req.symbol,
            df_1h=df_1h,
            ctx=ctx,
            perp=perp,
        )
    except Exception as exc:
        log.exception("run_deep_analysis failed for %s: %s", req.symbol, exc)
        raise HTTPException(status_code=500, detail=f"Deep analysis failed: {exc}")

    # --- Serialise LayerResult → LayerOut ------------------------------------
    layers_out: dict[str, LayerOut] = {}
    for name, lr in result.layers.items():
        layers_out[name] = LayerOut(
            score=lr.score,
            sigs=lr.sigs,
            meta={k: (v if _is_json_safe(v) else str(v)) for k, v in lr.meta.items()},
        )

    # Serialise alpha if present
    alpha_out = None
    if result.alpha is not None:
        try:
            from dataclasses import asdict
            alpha_out = asdict(result.alpha)
        except Exception:
            alpha_out = {"score": getattr(result.alpha, "score", None)}

    return DeepResponse(
        symbol=result.symbol,
        total_score=result.total_score,
        verdict=result.verdict,
        layers=layers_out,
        atr_levels=result.atr_levels,
        alpha=alpha_out,
        hunt_score=result.hunt_score,
    )


def _is_json_safe(v) -> bool:
    """Return True if v is directly JSON-serialisable (no custom classes)."""
    return isinstance(v, (bool, int, float, str, type(None), list, dict))
