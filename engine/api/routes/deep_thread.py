"""Synchronous /deep pipeline — runs under `asyncio.to_thread` after ctx is resolved."""
from __future__ import annotations

import logging
from dataclasses import asdict

import pandas as pd
from fastapi import HTTPException

from api.schemas import DeepRequest, DeepResponse, LayerOut
from market_engine.pipeline import run_deep_analysis
from market_engine.types import GlobalCtx

log = logging.getLogger("engine.deep.thread")

def _klines_to_df(bars) -> pd.DataFrame:
    data = {
        "open": [b.o for b in bars],
        "high": [b.h for b in bars],
        "low": [b.l for b in bars],
        "close": [b.c for b in bars],
        "volume": [b.v for b in bars],
        "taker_buy_base_volume": [b.tbv for b in bars],
    }
    timestamps = pd.to_datetime([b.t for b in bars], unit="ms", utc=True)
    return pd.DataFrame(data, index=timestamps)


def _is_json_safe(v) -> bool:
    return isinstance(v, (bool, int, float, str, type(None), list, dict))


def deep_sync(req: DeepRequest, ctx: GlobalCtx) -> DeepResponse:
    """Run deep pipeline; caller must ensure `len(req.klines) >= 120`."""
    df_1h = _klines_to_df(req.klines)

    p = req.perp
    perp: dict = {}
    if p.fr is not None:
        perp["fr"] = p.fr
    if p.oi_pct is not None:
        perp["oi_pct"] = p.oi_pct
    if p.ls_ratio is not None:
        perp["ls_ratio"] = p.ls_ratio
    if p.taker_ratio is not None:
        perp["taker_ratio"] = p.taker_ratio
    if p.price_pct is not None:
        perp["price_pct"] = p.price_pct
    if p.oi_notional is not None:
        perp["oi_notional"] = p.oi_notional
    if p.vol_24h is not None:
        perp["vol_24h"] = p.vol_24h
    if p.mark_price is not None:
        perp["mark_price"] = p.mark_price
    if p.index_price is not None:
        perp["index_price"] = p.index_price
    perp["short_liq_usd"] = p.short_liq_usd
    perp["long_liq_usd"] = p.long_liq_usd

    try:
        result = run_deep_analysis(
            symbol=req.symbol,
            df_1h=df_1h,
            ctx=ctx,
            perp=perp,
        )
    except Exception as exc:
        log.exception("run_deep_analysis failed for %s: %s", req.symbol, exc)
        raise HTTPException(status_code=500, detail=f"Deep analysis failed: {exc}") from exc

    layers_out: dict[str, LayerOut] = {}
    for name, lr in result.layers.items():
        layers_out[name] = LayerOut(
            score=lr.score,
            sigs=lr.sigs,
            meta={k: (v if _is_json_safe(v) else str(v)) for k, v in lr.meta.items()},
        )

    alpha_out = None
    if result.alpha is not None:
        try:
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
