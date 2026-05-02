"""Global LightGBM retrain job.

Runs weekly (or on-demand). Trains the shared scoring model from
OHLCV feature data across top universe symbols.  The trained model
is saved to models_store/ and picked up by readyz automatically.
"""
from __future__ import annotations

import logging
import time
from typing import Any

log = logging.getLogger("engine.scanner.jobs.lightgbm_retrain")

_TRAIN_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]
_HORIZON_BARS = 12  # 12h on 1h klines
_MIN_ROWS = 500


async def lightgbm_retrain_job() -> dict[str, Any]:
    """Retrain the global LightGBM scorer from recent klines."""
    import asyncio
    import numpy as np

    from data_cache.loader import load_klines, load_perp
    from exceptions import CacheMiss
    from scanner.feature_calc import compute_features_table
    from scoring.feature_matrix import encode_features_df
    from scoring.label_maker import make_labels
    from scoring.trainer import train
    from scoring.lightgbm_engine import get_engine

    t0 = time.monotonic()
    X_parts: list[np.ndarray] = []
    y_parts: list[np.ndarray] = []

    for symbol in _TRAIN_SYMBOLS:
        try:
            klines = await asyncio.to_thread(load_klines, symbol, offline=False)
        except (CacheMiss, Exception) as exc:
            log.debug("lightgbm_retrain: klines load failed for %s: %s", symbol, exc)
            try:
                klines = await asyncio.to_thread(load_klines, symbol, offline=True)
            except Exception:
                continue

        if klines is None or len(klines) < _MIN_ROWS:
            log.debug("lightgbm_retrain: insufficient klines for %s (%d rows)", symbol, len(klines) if klines is not None else 0)
            continue

        try:
            perp = await asyncio.to_thread(load_perp, symbol, offline=True)
        except Exception:
            perp = None

        try:
            features_df = await asyncio.to_thread(
                compute_features_table, klines, symbol, perp=perp
            )
        except Exception as exc:
            log.warning("lightgbm_retrain: feature calc failed for %s: %s", symbol, exc)
            continue

        if features_df.empty:
            continue

        try:
            valid_idx, y = make_labels(klines, features_df.index, horizon_bars=_HORIZON_BARS)
            X = encode_features_df(features_df.loc[valid_idx])
            X_parts.append(X)
            y_parts.append(y)
            log.debug("lightgbm_retrain: added %d rows from %s", len(y), symbol)
        except Exception as exc:
            log.warning("lightgbm_retrain: label/encode failed for %s: %s", symbol, exc)
            continue

    if not X_parts:
        log.warning("lightgbm_retrain: no training data collected — skipping")
        return {"ok": False, "reason": "no_data"}

    X_all = np.vstack(X_parts)
    y_all = np.concatenate(y_parts)

    if len(set(y_all.tolist())) < 2:
        log.warning("lightgbm_retrain: only one class in labels — skipping")
        return {"ok": False, "reason": "single_class"}

    try:
        engine = get_engine()
        result = engine.train(X_all, y_all)
        elapsed = round(time.monotonic() - t0, 1)
        log.info(
            "lightgbm_retrain: complete — symbols=%d rows=%d auc=%.4f replaced=%s elapsed=%.1fs",
            len(X_parts), len(y_all),
            result.get("auc") or 0.0, result.get("replaced"), elapsed,
        )
        return {"ok": True, "rows": len(y_all), "auc": result.get("auc"), "replaced": result.get("replaced")}
    except Exception as exc:
        log.error("lightgbm_retrain: train failed: %s", exc)
        return {"ok": False, "reason": str(exc)}
