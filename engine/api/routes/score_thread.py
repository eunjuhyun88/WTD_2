"""Synchronous /score implementation — runs under `asyncio.to_thread`."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import pandas as pd
from fastapi import HTTPException

from api.schemas import ScoreRequest, ScoreResponse, EnsembleSignal
from models.compat import normalize_signal_snapshot_payload
from models.signal import SignalSnapshot
from scanner.feature_calc import compute_features_table
from scoring.lightgbm_engine import get_engine as get_lgbm
from scoring.block_evaluator import evaluate_blocks
from scoring.ensemble import compute_ensemble

log = logging.getLogger("engine.score.thread")

def _klines_to_df(bars: list) -> pd.DataFrame:
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


def _perp_to_df(perp, last_ts: pd.Timestamp) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "funding_rate": [perp.funding_rate],
            "oi_change_1h": [perp.oi_change_1h],
            "oi_change_24h": [perp.oi_change_24h],
            "long_short_ratio": [perp.long_short_ratio],
        },
        index=[last_ts],
    )


def score_sync(req: ScoreRequest) -> ScoreResponse:
    """Compute score; caller must ensure `len(req.klines) >= MIN_HISTORY_BARS`."""
    klines_df = _klines_to_df(req.klines)
    last_ts = klines_df.index[-1]
    perp_df = _perp_to_df(req.perp, last_ts)

    if req.perp.taker_buy_ratio is not None:
        tbv_abs = req.perp.taker_buy_ratio * klines_df["volume"].iloc[-1]
        klines_df.loc[last_ts, "taker_buy_base_volume"] = tbv_abs

    try:
        features_df = compute_features_table(klines_df, req.symbol, perp=perp_df)
    except Exception as exc:
        log.warning("feature_calc failed for %s: %s", req.symbol, exc)
        raise HTTPException(status_code=500, detail=f"Feature computation failed: {exc}") from exc

    last_row = features_df.iloc[-1]

    snapshot_payload = normalize_signal_snapshot_payload(
        {
            "symbol": req.symbol,
            "timestamp": last_row.name.to_pydatetime().replace(tzinfo=timezone.utc),
            "price": float(last_row["price"]),
            "ema20_slope": float(last_row["ema20_slope"]),
            "ema50_slope": float(last_row["ema50_slope"]),
            "ema_alignment": last_row["ema_alignment"],
            "price_vs_ema50": float(last_row["price_vs_ema50"]),
            "rsi14": float(last_row["rsi14"]),
            "rsi14_slope": float(last_row["rsi14_slope"]),
            "macd_hist": float(last_row["macd_hist"]),
            "roc_10": float(last_row["roc_10"]),
            "atr_pct": float(last_row["atr_pct"]),
            "atr_ratio_short_long": float(last_row["atr_ratio_short_long"]),
            "bb_width": float(last_row["bb_width"]),
            "bb_position": float(last_row["bb_position"]),
            "volume_24h": float(last_row["volume_24h"]),
            "vol_ratio_3": float(last_row["vol_ratio_3"]),
            "obv_slope": float(last_row["obv_slope"]),
            "htf_structure": last_row["htf_structure"],
            "dist_from_20d_high": float(last_row["dist_from_20d_high"]),
            "dist_from_20d_low": float(last_row["dist_from_20d_low"]),
            "swing_pivot_distance": float(last_row["swing_pivot_distance"]),
            "funding_rate": float(last_row["funding_rate"]),
            "oi_change_1h": float(last_row["oi_change_1h"]),
            "oi_change_24h": float(last_row["oi_change_24h"]),
            "long_short_ratio": float(last_row["long_short_ratio"]),
            "cvd_state": last_row["cvd_state"],
            "taker_buy_ratio_1h": float(last_row["taker_buy_ratio_1h"]),
            "regime": last_row["regime"],
            "hour_of_day": int(last_row["hour_of_day"]),
            "day_of_week": int(last_row["day_of_week"]),
        }
    )
    snapshot = SignalSnapshot(
        symbol=snapshot_payload["symbol"],
        timestamp=snapshot_payload["timestamp"],
        price=snapshot_payload["price"],
        ema20_slope=float(last_row["ema20_slope"]),
        ema50_slope=float(last_row["ema50_slope"]),
        ema_alignment=last_row["ema_alignment"],
        price_vs_ema50=float(last_row["price_vs_ema50"]),
        rsi14=float(last_row["rsi14"]),
        rsi14_slope=float(last_row["rsi14_slope"]),
        macd_hist=float(last_row["macd_hist"]),
        roc_10=float(last_row["roc_10"]),
        atr_pct=float(last_row["atr_pct"]),
        atr_ratio_short_long=float(last_row["atr_ratio_short_long"]),
        bb_width=float(last_row["bb_width"]),
        bb_position=float(last_row["bb_position"]),
        volume_24h=float(last_row["volume_24h"]),
        vol_ratio_3=float(last_row["vol_ratio_3"]),
        obv_slope=float(last_row["obv_slope"]),
        htf_structure=last_row["htf_structure"],
        dist_from_20d_high=float(last_row["dist_from_20d_high"]),
        dist_from_20d_low=float(last_row["dist_from_20d_low"]),
        swing_pivot_distance=float(last_row["swing_pivot_distance"]),
        funding_rate=float(last_row["funding_rate"]),
        oi_change_1h=float(last_row["oi_change_1h"]),
        oi_change_24h=float(last_row["oi_change_24h"]),
        long_short_ratio=float(last_row["long_short_ratio"]),
        cvd_state=last_row["cvd_state"],
        taker_buy_ratio_1h=float(last_row["taker_buy_ratio_1h"]),
        regime=last_row["regime"],
        hour_of_day=int(last_row["hour_of_day"]),
        day_of_week=snapshot_payload["day_of_week"],
    )

    lgbm = get_lgbm()
    p_win = lgbm.predict_one(snapshot)

    blocks_triggered = evaluate_blocks(snapshot, features_df, klines_df)

    ensemble_result = compute_ensemble(
        p_win=p_win,
        blocks_triggered=blocks_triggered,
        regime=snapshot.regime.value if hasattr(snapshot.regime, "value") else str(snapshot.regime),
    )
    ensemble_signal = EnsembleSignal(**ensemble_result.to_dict())
    ensemble_triggered = (
        ensemble_signal.confidence in ("high", "medium")
        and ensemble_signal.direction != "neutral"
    )

    return ScoreResponse(
        snapshot=snapshot.model_dump(mode="json"),
        p_win=p_win,
        blocks_triggered=blocks_triggered,
        ensemble=ensemble_signal,
        ensemble_triggered=ensemble_triggered,
    )
