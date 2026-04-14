"""Train a LightGBM signal scorer on real Binance OHLCV + macro data.

Pipeline:
  1. Load klines + perp + macro + onchain (from cache or network)
  2. Compute the canonical feature matrix via scanner.feature_calc
  3. Generate binary labels: y[t] = 1 if price[t+H] > price[t] * (1+threshold)
  4. Encode features → float64 matrix
  5. Train LightGBM with walk-forward cross-validation
  6. Save model to models_store/

Usage:
    cd engine
    uv run python train_lgbm.py                          # BTCUSDT long 12h
    uv run python train_lgbm.py --symbol ETHUSDT
    uv run python train_lgbm.py --symbol BTCUSDT --horizon 6 --direction short
    uv run python train_lgbm.py --offline                # cache only
    uv run python train_lgbm.py --threshold 0.005        # win if +0.5%+
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from data_cache.loader import load_klines, load_perp, load_macro_bundle, load_onchain_bundle
from exceptions import CacheMiss
from scanner.feature_calc import compute_features_table, FEATURE_COLUMNS
from scoring.feature_matrix import encode_features_df, FEATURE_NAMES
from scoring.label_maker import make_labels, make_triple_barrier, compute_forward_returns
from scoring.trainer import train
from scoring.scorer import LGBMScorer

MODELS_DIR = Path(__file__).parent / "models_store"


def main() -> None:
    parser = argparse.ArgumentParser(description="Train LightGBM ML scorer")
    parser.add_argument("--symbol", default="BTCUSDT")
    parser.add_argument("--horizon", type=int, default=12,
                        help="Forward bars for label (default 12 = 12h on 1h data)")
    parser.add_argument("--direction", choices=["long", "short"], default="long")
    parser.add_argument("--threshold", type=float, default=0.0,
                        help="Min return fraction to label as win (simple mode, default 0.0)")
    parser.add_argument("--cv-splits", type=int, default=5)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--triple-barrier", action="store_true",
                        help="Use triple-barrier labels instead of simple forward return")
    parser.add_argument("--target-pct", type=float, default=0.02,
                        help="Triple-barrier target distance (default 0.02 = 2%%)")
    parser.add_argument("--stop-pct", type=float, default=0.01,
                        help="Triple-barrier stop distance (default 0.01 = 1%%)")
    args = parser.parse_args()

    symbol = args.symbol.upper()
    horizon = args.horizon
    direction = args.direction
    threshold = args.threshold
    offline = args.offline

    print(f"\n{'='*60}")
    print(f"  LightGBM Trainer  |  {symbol}  |  {direction}  |  {horizon}h horizon")
    print(f"{'='*60}")

    # ── 1. Load data ─────────────────────────────────────────────
    print(f"\n[1/4] Loading market data for {symbol}...")
    t0 = time.time()
    try:
        klines = load_klines(symbol, "1h", offline=offline)
    except CacheMiss:
        print(f"  ERROR: No cached data. Run without --offline first.")
        sys.exit(1)

    perp = load_perp(symbol, offline=offline)
    macro = load_macro_bundle(days=365, offline=offline)
    onchain = load_onchain_bundle(symbol, days=365, offline=offline)
    print(f"  klines={len(klines)} bars  perp={'yes' if perp is not None else 'no'}"
          f"  macro={'yes' if macro is not None else 'no'}"
          f"  onchain={'yes' if onchain is not None else 'no'}"
          f"  [{time.time()-t0:.1f}s]")

    # ── 2. Compute features ───────────────────────────────────────
    print(f"\n[2/4] Computing {len(FEATURE_COLUMNS)} features...")
    t0 = time.time()
    features = compute_features_table(klines, symbol, perp, macro, onchain)
    print(f"  {len(features)} feature rows  [{time.time()-t0:.1f}s]")

    # ── 3. Build labels ───────────────────────────────────────────
    use_triple = args.triple_barrier
    label_mode = "triple-barrier" if use_triple else "simple"
    print(f"\n[3/4] Generating labels ({label_mode}, horizon={horizon}h, direction={direction})...")
    t0 = time.time()
    if use_triple:
        valid_idx, y = make_triple_barrier(
            klines,
            features.index,
            horizon_bars=horizon,
            target_pct=args.target_pct,
            stop_pct=args.stop_pct,
            direction=direction,
            drop_timeout=True,
        )
        print(f"  target={args.target_pct:.1%}  stop={args.stop_pct:.1%}  "
              f"(timeout bars dropped)")
    else:
        valid_idx, y = make_labels(
            klines,
            features.index,
            horizon_bars=horizon,
            win_threshold=threshold,
            direction=direction,
        )
    # Forward return stats for sanity check
    fwd_ret = compute_forward_returns(klines, features.index, horizon_bars=horizon)
    pos_rate = float(y.mean())
    print(f"  {len(y):,} labeled bars  |  pos_rate={pos_rate:.1%}  "
          f"(fwd return mean={fwd_ret.mean()*100:+.2f}%  std={fwd_ret.std()*100:.2f}%)")

    if pos_rate < 0.1 or pos_rate > 0.9:
        print("  WARNING: Label imbalance is extreme — check threshold or direction.")

    # ── 4. Train ──────────────────────────────────────────────────
    print(f"\n[4/4] Training LightGBM (cv_splits={args.cv_splits})...")
    t0 = time.time()
    X = encode_features_df(features.loc[valid_idx])
    model, report = train(
        X, y,
        feature_names=list(FEATURE_NAMES),
        direction=direction,
        horizon_bars=horizon,
        n_splits=args.cv_splits,
    )
    elapsed = time.time() - t0
    print(f"  Training done in {elapsed:.1f}s")
    print()
    print(report)

    # ── Save ──────────────────────────────────────────────────────
    out_path = MODELS_DIR / f"lgbm_{symbol}_{direction}_{horizon}h.pkl"
    scorer = LGBMScorer(model, direction=direction, horizon_bars=horizon)
    scorer.save(out_path)

    print(f"\n{'='*60}")
    print(f"  CV AUC: {report.cv_auc_mean:.4f} ± {report.cv_auc_std:.4f}")
    print(f"  Model : {out_path}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
