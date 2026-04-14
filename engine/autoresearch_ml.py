"""AutoResearch with ML-scored signals.

Pipeline:
  1. Load real Binance data (klines + perp + macro + onchain)
  2. Compute the canonical feature matrix
  3. Load (or train) a LightGBM scorer
  4. Score every bar → P(win)
  5. Generate EntrySignal wherever prob > threshold
  6. Backtest ML signals vs rule-based baseline
  7. Print comparison

Usage:
    cd engine
    # First train a model (if not already done):
    DYLD_LIBRARY_PATH=/Users/ej/.homebrew/opt/libomp/lib \\
      uv run python train_lgbm.py --offline --triple-barrier

    # Then run ML research:
    DYLD_LIBRARY_PATH=/Users/ej/.homebrew/opt/libomp/lib \\
      uv run python autoresearch_ml.py --offline
    uv run python autoresearch_ml.py --symbol BTCUSDT --prob-threshold 0.57
    uv run python autoresearch_ml.py --train-first --triple-barrier --offline
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import pandas as pd

from backtest.config import RiskConfig
from backtest.simulator import run_backtest
from backtest.types import EntrySignal
from data_cache.loader import load_klines, load_perp, load_macro_bundle, load_onchain_bundle
from exceptions import CacheMiss
from observability.logging import StructuredLogger
from scanner.feature_calc import compute_features_table
from scanner.pnl import ExecutionCosts
from scoring.feature_matrix import encode_features_df, FEATURE_NAMES
from scoring.label_maker import make_triple_barrier, make_labels
from scoring.scorer import LGBMScorer
from scoring.trainer import train, train_walkforward, WalkForwardResult

MODELS_DIR = Path(__file__).parent / "models_store"

import io


def _logger() -> StructuredLogger:
    return StructuredLogger(module="autoresearch_ml", run_id="run", stream=io.StringIO())


def _model_path(symbol: str, direction: str, horizon: int) -> Path:
    return MODELS_DIR / f"lgbm_{symbol}_{direction}_{horizon}h.pkl"


def train_and_save(
    klines: pd.DataFrame,
    features: pd.DataFrame,
    symbol: str,
    direction: str,
    horizon: int,
    triple_barrier: bool,
    target_pct: float,
    stop_pct: float,
    n_splits: int,
) -> LGBMScorer:
    """Train a fresh model and save it. Returns the scorer."""
    print(f"  Training LightGBM ({direction}, horizon={horizon}h, "
          f"{'triple-barrier' if triple_barrier else 'simple'})...")
    if triple_barrier:
        valid_idx, y = make_triple_barrier(
            klines, features.index,
            horizon_bars=horizon,
            target_pct=target_pct,
            stop_pct=stop_pct,
            direction=direction,
            drop_timeout=True,
        )
    else:
        valid_idx, y = make_labels(
            klines, features.index,
            horizon_bars=horizon,
            direction=direction,
        )
    pos_rate = float(y.mean())
    print(f"  {len(y):,} labeled bars  pos_rate={pos_rate:.1%}")

    X = encode_features_df(features.loc[valid_idx])
    model, report = train(
        X, y,
        feature_names=list(FEATURE_NAMES),
        direction=direction,
        horizon_bars=horizon,
        n_splits=n_splits,
    )
    print(f"  CV AUC: {report.cv_auc_mean:.4f} ± {report.cv_auc_std:.4f}")

    path = _model_path(symbol, direction, horizon)
    scorer = LGBMScorer(model, direction=direction, horizon_bars=horizon)
    scorer.save(path)
    return scorer


def _signals_from_prob(
    prob: "pd.Series",
    symbol: str,
    direction: str,
    horizon: int,
    prob_threshold: float,
) -> list[EntrySignal]:
    """Emit EntrySignal for every bar whose predicted prob exceeds threshold."""
    signals: list[EntrySignal] = []
    for ts, p in prob.items():
        if p >= prob_threshold:
            signals.append(EntrySignal(
                symbol=symbol,
                timestamp=ts,
                direction=direction,
                predicted_prob=float(p),
                source_model=f"lgbm_{direction}_{horizon}h",
            ))
    return signals


def make_ml_signals(
    features: pd.DataFrame,
    scorer: LGBMScorer,
    symbol: str,
    prob_threshold: float,
) -> list[EntrySignal]:
    """Score all feature bars and emit EntrySignal for bars above threshold."""
    prob = scorer.score(features)
    return _signals_from_prob(
        prob, symbol, scorer.direction, scorer.horizon_bars, prob_threshold
    )


def run_and_summarize(
    label: str,
    signals: list[EntrySignal],
    klines: pd.DataFrame,
    symbol: str,
    risk_cfg: RiskConfig,
    costs: ExecutionCosts,
) -> None:
    """Run backtest and print one-line summary."""
    if not signals:
        print(f"  [{label:<35}] — no signals")
        return

    result = run_backtest(
        entries=signals,
        klines_by_symbol={symbol: klines},
        adv_by_symbol={symbol: float((klines["volume"] * klines["close"]).tail(720).mean() * 24)},
        risk_cfg=risk_cfg,
        costs=costs,
        threshold=0.0,   # threshold already applied upstream
        logger=_logger(),
    )
    m = result.metrics
    pnl = (m.final_equity / risk_cfg.initial_equity - 1) * 100
    print(
        f"  [{label:<35}] "
        f"sigs={len(signals):5d}  exec={m.n_executed:5d}  "
        f"wr={m.win_rate:.1%}  E={m.expectancy_pct:+.3%}  "
        f"sharpe={m.sharpe:+.2f}  dd={m.max_drawdown_pct:.1%}  "
        f"equity={pnl:+.1f}%"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="AutoResearch with ML scoring")
    parser.add_argument("--symbol", default="BTCUSDT")
    parser.add_argument("--horizon", type=int, default=24,
                        help="Forward bars for training labels (default 24h)")
    parser.add_argument("--direction", choices=["long", "short", "both"], default="long")
    parser.add_argument("--prob-threshold", type=float, default=0.55,
                        help="Minimum P(win) to emit a signal (default 0.55)")
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--train-first", action="store_true",
                        help="Force re-train even if a model exists")
    parser.add_argument("--triple-barrier", action="store_true",
                        help="Use triple-barrier labels for training")
    parser.add_argument("--target-pct", type=float, default=0.02)
    parser.add_argument("--stop-pct", type=float, default=0.01)
    parser.add_argument("--cv-splits", type=int, default=5)
    parser.add_argument("--walkforward", action="store_true",
                        help="Rolling-window walk-forward retraining (realistic OOS)")
    parser.add_argument("--wf-min-train", type=int, default=4320,
                        help="Min training bars before first WF model (default 4320 ≈ 6mo)")
    parser.add_argument("--wf-step", type=int, default=2160,
                        help="WF retrain cadence in bars (default 2160 ≈ 3mo)")
    args = parser.parse_args()

    symbol = args.symbol.upper()
    offline = args.offline
    directions = ["long", "short"] if args.direction == "both" else [args.direction]

    print(f"\n{'='*70}")
    print(f"  AutoResearch ML  |  {symbol}  |  {args.direction}  |  prob>{args.prob_threshold:.2f}")
    print(f"{'='*70}")

    # ── 1. Load data ──────────────────────────────────────────────
    print(f"\n[1/3] Loading data...")
    t0 = time.time()
    try:
        klines = load_klines(symbol, "1h", offline=offline)
    except CacheMiss:
        print("  ERROR: No cached data. Run without --offline first.")
        sys.exit(1)

    perp = load_perp(symbol, offline=offline)
    macro = load_macro_bundle(days=365, offline=offline)
    onchain = load_onchain_bundle(symbol, days=365, offline=offline)
    print(f"  {len(klines)} klines  [{time.time()-t0:.1f}s]")

    # ── 2. Features ───────────────────────────────────────────────
    print(f"\n[2/3] Computing features...")
    t0 = time.time()
    features = compute_features_table(klines, symbol, perp, macro, onchain)
    print(f"  {len(features)} rows  [{time.time()-t0:.1f}s]")

    # ── 3. Score + Backtest ───────────────────────────────────────
    mode = "walk-forward" if args.walkforward else "standard"
    print(f"\n[3/3] Scoring and backtesting  [{mode}]...")
    risk_cfg = RiskConfig()
    costs = ExecutionCosts()

    all_signals: list[EntrySignal] = []

    for direction in directions:
        if args.walkforward:
            # ── Walk-forward path ──────────────────────────────────
            print(f"  Walk-forward retraining ({direction})...")
            t0 = time.time()
            if args.triple_barrier:
                valid_idx, y = make_triple_barrier(
                    klines, features.index,
                    horizon_bars=args.horizon,
                    target_pct=args.target_pct,
                    stop_pct=args.stop_pct,
                    direction=direction,
                    drop_timeout=True,
                )
            else:
                valid_idx, y = make_labels(
                    klines, features.index,
                    horizon_bars=args.horizon,
                    direction=direction,
                )
            X = encode_features_df(features.loc[valid_idx])
            wf = train_walkforward(
                X, y, valid_idx,
                feature_names=list(FEATURE_NAMES),
                min_train_bars=args.wf_min_train,
                step_bars=args.wf_step,
            )
            print(
                f"  WF OOS AUC={wf.oos_auc:.4f}  "
                f"periods={wf.n_periods}  [{time.time()-t0:.1f}s]"
            )
            print(f"  Per-period: {[f'{a:.4f}' for a in wf.period_aucs]}")

            # Save the final model (trained on all data) for subsequent runs.
            if wf.final_model is not None:
                path = _model_path(symbol, direction, args.horizon)
                scorer = LGBMScorer(
                    wf.final_model, direction=direction, horizon_bars=args.horizon
                )
                scorer.save(path)

            sigs = _signals_from_prob(
                wf.oos_prob, symbol, direction, args.horizon, args.prob_threshold
            )
            label = f"WF {direction} p>{args.prob_threshold:.2f} ({len(sigs)} sigs)"

        else:
            # ── Standard path ─────────────────────────────────────
            model_path = _model_path(symbol, direction, args.horizon)
            if args.train_first or not model_path.exists():
                scorer = train_and_save(
                    klines, features, symbol, direction,
                    args.horizon, args.triple_barrier,
                    args.target_pct, args.stop_pct, args.cv_splits,
                )
            else:
                scorer = LGBMScorer.from_file(model_path)
                print(f"  Loaded model: {model_path.name}")

            sigs = make_ml_signals(features, scorer, symbol, args.prob_threshold)
            label = f"ML {direction} p>{args.prob_threshold:.2f} ({len(sigs)} sigs)"

        all_signals.extend(sigs)
        run_and_summarize(label, sigs, klines, symbol, risk_cfg, costs)

    # Combined long+short
    if len(directions) > 1 and all_signals:
        run_and_summarize(
            "ML long+short combined",
            all_signals, klines, symbol, risk_cfg, costs,
        )

    print(f"\n{'='*70}\n")


if __name__ == "__main__":
    main()
