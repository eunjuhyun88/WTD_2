"""Synchronous implementations for /challenge — intended for `asyncio.to_thread`.

Keeping CPU + blocking I/O off the asyncio event loop improves API latency
for concurrent requests (see `challenge.py` route wrappers).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from fastapi import HTTPException

from api.schemas import (
    ChallengeCreateRequest,
    ChallengeCreateResponse,
    ChallengeScanResponse,
    ScanMatch,
    StrategyResult as StrategyResultSchema,
)
from models.compat import normalize_signal_snapshot_payload
from challenge.historical_matcher import (
    build_pattern_vector,
    _row_to_vector,
)
from challenge.pattern_refiner import refine_pattern, COSINE_THRESHOLD
from challenge.types import ChallengeRecord, Snap, make_slug
from data_cache.loader import load_klines, load_perp, CacheMiss
from scanner.feature_calc import compute_features_table
from scoring.lightgbm_engine import get_engine as get_lgbm
from universe.config import DEFAULT_CHALLENGE_FIT_UNIVERSE, DEFAULT_CHALLENGE_SCAN_UNIVERSE
from universe.loader import load_universe

log = logging.getLogger("engine.challenge.thread")


def create_challenge_sync(req: ChallengeCreateRequest) -> ChallengeCreateResponse:
    """Register a new challenge from 1–5 reference snaps (blocking)."""
    snaps = [
        Snap(
            symbol=s.symbol,
            timestamp=s.timestamp.replace(tzinfo=timezone.utc) if s.timestamp.tzinfo is None else s.timestamp,
            label=s.label,
        )
        for s in req.snaps
    ]
    symbols_needed = list({s.symbol for s in snaps})
    universe = load_universe(DEFAULT_CHALLENGE_FIT_UNIVERSE)
    all_symbols = list(set(symbols_needed) | set(universe))

    features_db: dict[str, pd.DataFrame] = {}
    klines_db: dict[str, pd.DataFrame] = {}

    for symbol in all_symbols:
        try:
            klines = load_klines(symbol, offline=True)
            perp = load_perp(symbol, offline=True)
            feats = compute_features_table(klines, symbol, perp=perp)
            features_db[symbol] = feats
            klines_db[symbol] = klines
        except (CacheMiss, Exception) as exc:
            log.debug("Skipping %s: %s", symbol, exc)

    pattern_vec = build_pattern_vector(snaps, features_db)
    if pattern_vec is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not extract features for one or more snap timestamps. "
                "Ensure the symbols are in the cached universe and the timestamps "
                "have enough history (≥500 bars before the snap)."
            ),
        )

    strategy_results, recommended = refine_pattern(pattern_vec, features_db, klines_db)

    slug = make_slug(snaps)
    centroid = next(
        (r.feature_vector for r in strategy_results if r.name == recommended),
        pattern_vec.tolist(),
    )

    record = ChallengeRecord(
        slug=slug,
        user_id=req.user_id,
        snaps=[{"symbol": s.symbol, "timestamp": s.timestamp.isoformat(), "label": s.label} for s in snaps],
        strategies=[
            {
                "name": r.name,
                "win_rate": r.win_rate,
                "match_count": r.match_count,
                "expectancy": r.expectancy,
                "feature_vector": r.feature_vector,
                "threshold": r.threshold,
            }
            for r in strategy_results
        ],
        recommended=recommended,
        feature_vector=centroid,
        created_at=datetime.now(tz=timezone.utc).isoformat(),
        scan_enabled=True,
    )
    record.save()
    log.info("Challenge saved: slug=%s strategies=%d", slug, len(strategy_results))

    return ChallengeCreateResponse(
        slug=slug,
        strategies=[
            StrategyResultSchema(
                name=r.name,
                win_rate=r.win_rate,
                match_count=r.match_count,
                expectancy=r.expectancy,
            )
            for r in strategy_results
        ],
        recommended=recommended,
        feature_vector=centroid,
    )


def scan_challenge_sync(slug: str) -> ChallengeScanResponse:
    """Find current universe bars that match the saved challenge pattern (blocking)."""
    try:
        record = ChallengeRecord.load(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Challenge not found: {slug}") from None

    pattern_vec = np.array(record.feature_vector, dtype=np.float64)
    from scoring.feature_matrix import N_FEATURES

    pv = pattern_vec[:N_FEATURES]
    pv_norm = pv / (np.linalg.norm(pv) + 1e-10)

    lgbm = get_lgbm()
    universe = load_universe(DEFAULT_CHALLENGE_SCAN_UNIVERSE)
    matches: list[ScanMatch] = []

    for symbol in universe:
        try:
            klines = load_klines(symbol, offline=False)
            perp = load_perp(symbol, offline=False)
            feats = compute_features_table(klines, symbol, perp=perp)
        except (CacheMiss, Exception) as exc:
            log.debug("Skip %s: %s", symbol, exc)
            continue

        last_row = feats.iloc[-1]
        row_vec = _row_to_vector(last_row)
        row_norm = row_vec / (np.linalg.norm(row_vec) + 1e-10)
        similarity = float(row_norm @ pv_norm)

        if similarity < COSINE_THRESHOLD * 0.9:
            continue

        from models.signal import SignalSnapshot, EMAAlignment, HTFStructure, CVDState, Regime

        try:
            snap_payload = normalize_signal_snapshot_payload(
                {
                    "symbol": symbol,
                    "timestamp": last_row.name.to_pydatetime().replace(tzinfo=timezone.utc),
                    "price": float(last_row["price"]),
                    "day_of_week": int(last_row["day_of_week"]),
                }
            )
            snap = SignalSnapshot(
                symbol=snap_payload["symbol"],
                timestamp=snap_payload["timestamp"],
                price=snap_payload["price"],
                ema20_slope=float(last_row["ema20_slope"]),
                ema50_slope=float(last_row["ema50_slope"]),
                ema_alignment=EMAAlignment(last_row["ema_alignment"]),
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
                htf_structure=HTFStructure(last_row["htf_structure"]),
                dist_from_20d_high=float(last_row["dist_from_20d_high"]),
                dist_from_20d_low=float(last_row["dist_from_20d_low"]),
                swing_pivot_distance=float(last_row["swing_pivot_distance"]),
                funding_rate=float(last_row["funding_rate"]),
                oi_change_1h=float(last_row["oi_change_1h"]),
                oi_change_24h=float(last_row["oi_change_24h"]),
                long_short_ratio=float(last_row["long_short_ratio"]),
                cvd_state=CVDState(last_row["cvd_state"]),
                taker_buy_ratio_1h=float(last_row["taker_buy_ratio_1h"]),
                regime=Regime(last_row["regime"]),
                hour_of_day=int(last_row["hour_of_day"]),
                day_of_week=snap_payload["day_of_week"],
            )
            p_win = lgbm.predict_one(snap)
        except Exception:
            p_win = None

        matches.append(
            ScanMatch(
                symbol=symbol,
                timestamp=last_row.name.to_pydatetime().replace(tzinfo=timezone.utc),
                similarity=similarity,
                p_win=p_win,
                price=float(last_row["price"]),
            )
        )

    matches.sort(key=lambda m: m.similarity, reverse=True)

    return ChallengeScanResponse(
        slug=slug,
        scanned_at=datetime.now(tz=timezone.utc),
        matches=matches[:20],
    )
