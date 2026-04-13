"""POST /score — klines + perp snapshot → SignalSnapshot + P(win).

This is the hottest path: every Terminal chart-load calls this endpoint.
TypeScript side fetches raw data (Binance/Coinalyze), sends it here, we
return the canonical feature vector and ML score.

Design:
  - Convert KlineBar list → pandas DataFrame (vectorised, no Python loop)
  - Build minimal perp DataFrame from PerpSnapshot scalars
  - Call compute_features_table (past-only, look-ahead safe)
  - Take last row → SignalSnapshot
  - Score with LightGBM (returns None if model not trained yet)
  - Evaluate all 26 building blocks against the snapshot
  - Return { snapshot, p_win, blocks_triggered }
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from api.schemas import ScoreRequest, ScoreResponse, EnsembleSignal
from models.signal import SignalSnapshot
from scanner.feature_calc import compute_features_table, MIN_HISTORY_BARS
from scoring.lightgbm_engine import get_engine as get_lgbm
from scoring.block_evaluator import evaluate_blocks
from scoring.ensemble import compute_ensemble

log = logging.getLogger("engine.score")
router = APIRouter()

# Building blocks that disqualify a signal — their presence should NOT count
# as "confirmation" for the ensemble gate.
_DISQUALIFIERS = frozenset({"volume_below_average", "extreme_volatility", "extended_from_ma"})

# Minimum ML probability to pass the ensemble gate.
_ENSEMBLE_P_WIN_THRESHOLD = 0.55


def _compute_ensemble(p_win: float | None, blocks_triggered: list[str]) -> bool:
    """Return True iff ML prob ≥ threshold AND ≥1 non-disqualifier block active
    AND no disqualifier block is active.

    The dual condition (ML + pattern agreement) is the core of the ensemble
    filter: a high ML score alone can be spurious; requiring at least one
    structural block to also fire forces cross-layer consensus.
    """
    if p_win is None or p_win < _ENSEMBLE_P_WIN_THRESHOLD:
        return False
    triggered_set = set(blocks_triggered)
    if triggered_set & _DISQUALIFIERS:
        return False
    non_disq = triggered_set - _DISQUALIFIERS
    return len(non_disq) >= 1


def _klines_to_df(bars: list) -> pd.DataFrame:
    """Convert list[KlineBar] → DataFrame expected by feature_calc.

    Required columns: open, high, low, close, volume, taker_buy_base_volume
    Index: DatetimeIndex in UTC
    """
    data = {
        "open":   [b.o for b in bars],
        "high":   [b.h for b in bars],
        "low":    [b.l for b in bars],
        "close":  [b.c for b in bars],
        "volume": [b.v for b in bars],
        "taker_buy_base_volume": [b.tbv for b in bars],  # absolute volume from exchange
    }
    timestamps = pd.to_datetime([b.t for b in bars], unit="ms", utc=True)
    return pd.DataFrame(data, index=timestamps)


def _perp_to_df(perp, last_ts: pd.Timestamp) -> pd.DataFrame:
    """Build a single-row perp DataFrame at `last_ts`.

    When reindex-ffilled onto klines index, this value propagates back
    through the series — which is acceptable for real-time scoring where
    we only need the last bar's derived features to be accurate.

    compute_features_table expects columns:
        funding_rate, oi_change_1h, oi_change_24h, long_short_ratio
    """
    return pd.DataFrame(
        {
            "funding_rate":   [perp.funding_rate],
            "oi_change_1h":   [perp.oi_change_1h],
            "oi_change_24h":  [perp.oi_change_24h],
            "long_short_ratio": [perp.long_short_ratio],
        },
        index=[last_ts],
    )


@router.post("", response_model=ScoreResponse)
async def score(req: ScoreRequest) -> ScoreResponse:
    """Compute features + ML score for the latest bar.

    Minimum klines required: MIN_HISTORY_BARS (500) for EMA200 warmup.
    If fewer are sent, a 400 is returned — caller should send more history.
    """
    if len(req.klines) < MIN_HISTORY_BARS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Need ≥{MIN_HISTORY_BARS} kline bars for stable features "
                f"(got {len(req.klines)}). Send more history."
            ),
        )

    # --- 1. Convert to DataFrames ------------------------------------------
    klines_df = _klines_to_df(req.klines)
    last_ts = klines_df.index[-1]
    perp_df = _perp_to_df(req.perp, last_ts)

    # Override taker_buy_ratio if provided directly (better than kline proxy)
    if req.perp.taker_buy_ratio is not None:
        tbv_abs = req.perp.taker_buy_ratio * klines_df["volume"].iloc[-1]
        klines_df.loc[last_ts, "taker_buy_base_volume"] = tbv_abs

    # --- 2. Feature computation (vectorised, past-only) --------------------
    try:
        features_df = compute_features_table(klines_df, req.symbol, perp=perp_df)
    except Exception as exc:
        log.warning("feature_calc failed for %s: %s", req.symbol, exc)
        raise HTTPException(status_code=500, detail=f"Feature computation failed: {exc}")

    last_row = features_df.iloc[-1]

    # --- 3. Reconstruct SignalSnapshot from last row -----------------------
    snapshot = SignalSnapshot(
        symbol=req.symbol,
        timestamp=last_row.name.to_pydatetime().replace(tzinfo=timezone.utc),
        price=float(last_row["price"]),
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
        day_of_week=int(last_row["day_of_week"]),
    )

    # --- 4. LightGBM P(win) -----------------------------------------------
    lgbm = get_lgbm()
    p_win = lgbm.predict_one(snapshot)  # None if untrained

    # --- 5. Evaluate building blocks --------------------------------------
    blocks_triggered = evaluate_blocks(snapshot, features_df, klines_df)

    # --- 6. Ensemble: fuse ML + blocks + regime ---------------------------
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
