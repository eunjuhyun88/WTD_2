"""Multi-symbol pattern scanner — W-0302.

Scans CMC 1000+ universe against all known building-block pattern combos.
Uses new Parquet data store (W-0301) as input.

Pattern combos (extendable):
  breakout_volume_long        20d breakout + volume spike
  recent_rally_long           recent rally continuation
  recent_decline_short        recent decline continuation
  rsi_oversold_long           RSI < 35 oversold bounce
  rsi_overbought_short        RSI > 65 overbought fade
  sweep_low_reversal_long     sweep below low + volume reversal
  gap_up_momentum_long        gap up + follow-through
  consolidation_breakout_long tight range then breakout

Output: results.parquet with columns:
  symbol, pattern, direction, n_signals, n_executed,
  win_rate, expectancy_pct, sharpe, calmar, max_drawdown_pct,
  final_equity, scan_ts

Usage:
    from research.pattern_scan.scanner import PatternScanner
    scanner = PatternScanner()
    df = scanner.scan_universe(symbols, workers=8)
    df = scanner.load_results()
"""
from __future__ import annotations

import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import NamedTuple

import pandas as pd

from backtest.config import RiskConfig
from backtest.simulator import run_backtest
from backtest.types import EntrySignal
from observability.logging import StructuredLogger
from building_blocks.context import Context
from building_blocks.triggers.breakout_above_high import breakout_above_high
from building_blocks.triggers.recent_rally import recent_rally
from building_blocks.triggers.recent_decline import recent_decline
from building_blocks.triggers.volume_spike import volume_spike
from building_blocks.triggers.sweep_below_low import sweep_below_low
from building_blocks.triggers.gap_up import gap_up
from building_blocks.entries.rsi_threshold import rsi_threshold
from data_cache.parquet_store import ParquetStore
from patterns.definitions import current_definition_id as _current_definition_id
from patterns.model_registry import MODEL_REGISTRY_STORE, resolve_threshold
from scanner.feature_calc import compute_features_table, MIN_HISTORY_BARS
from scanner.pnl import ExecutionCosts
from scoring.lightgbm_engine import get_engine
from research.pattern_scan.oos_split import holdout_cutoff as _oos_cutoff

log = logging.getLogger("engine.pattern_scan.scanner")

_OOS_WIRING = os.getenv("RESEARCH_OOS_WIRING", "off").lower() == "on"

# Disable live market data injection during historical backtests.
# Set LIVE_SIGNALS_MODE=on only for real-time signal generation.
_LIVE_SIGNALS_MODE = os.getenv("LIVE_SIGNALS_MODE", "off").lower() == "on"

_OOS_HOLDOUT_FRAC = 0.30
_MIN_HOLDOUT_TRADES = 10

_RESULTS_PATH = Path(__file__).parent.parent / "experiments" / "pattern_scan_results.parquet"
_COMPRESS = "zstd"

# Top-20 symbols for cross-exchange features (W-0358 Tier 1 data available)
_TIER1_SYMBOLS: frozenset[str] = frozenset({
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
    "DOGEUSDT", "ADAUSDT", "TRXUSDT", "AVAXUSDT", "TONUSDT",
    "SHIBUSDT", "DOTUSDT", "LINKUSDT", "MATICUSDT", "LTCUSDT",
    "BCHUSDT", "UNIUSDT", "NEARUSDT", "AAVEUSDT", "APTUSDT",
})
_COINBASE_SYMBOLS: frozenset[str] = frozenset({"BTCUSDT", "ETHUSDT"})
_KIMCHI_SYMBOLS: frozenset[str] = frozenset({"BTCUSDT", "ETHUSDT"})


# ── Pattern combo registry ────────────────────────────────────────────────────

@dataclass
class PatternCombo:
    name: str
    direction: str

    def fire(self, ctx: Context) -> pd.Series:
        raise NotImplementedError


class BreakoutVolumeLong(PatternCombo):
    def fire(self, ctx):
        return breakout_above_high(ctx, lookback_days=20) & volume_spike(ctx)


class RecentRallyLong(PatternCombo):
    def fire(self, ctx):
        return recent_rally(ctx)


class RecentDeclineShort(PatternCombo):
    def fire(self, ctx):
        return recent_decline(ctx)


class RSIOversoldLong(PatternCombo):
    def fire(self, ctx):
        return rsi_threshold(ctx, threshold=35, direction="below")


class RSIOverboughtShort(PatternCombo):
    def fire(self, ctx):
        return rsi_threshold(ctx, threshold=65, direction="above")


class SweepLowReversalLong(PatternCombo):
    def fire(self, ctx):
        return sweep_below_low(ctx)


class GapUpMomentumLong(PatternCombo):
    def fire(self, ctx):
        return gap_up(ctx)


ALL_COMBOS: list[PatternCombo] = [
    BreakoutVolumeLong(name="breakout_volume_long", direction="long"),
    RecentRallyLong(name="recent_rally_long", direction="long"),
    RecentDeclineShort(name="recent_decline_short", direction="short"),
    RSIOversoldLong(name="rsi_oversold_long", direction="long"),
    RSIOverboughtShort(name="rsi_overbought_short", direction="short"),
    SweepLowReversalLong(name="sweep_low_reversal_long", direction="long"),
    GapUpMomentumLong(name="gap_up_momentum_long", direction="long"),
]


# ── Scan result ───────────────────────────────────────────────────────────────

class PatternResult(NamedTuple):
    symbol: str
    pattern: str
    direction: str
    n_signals: int
    n_executed: int
    win_rate: float
    expectancy_pct: float
    sharpe: float
    calmar: float
    max_drawdown_pct: float
    final_equity: float
    scan_ts: str


_DEFAULT_RISK = RiskConfig()
_DEFAULT_COSTS = ExecutionCosts()
import io as _io
_NULL_LOGGER = StructuredLogger(module="scanner", run_id="scan", stream=_io.StringIO())

_FALLBACK_PROB: float = 0.6
_FALLBACK_THRESHOLD: float = 0.55


def _predict_safe(
    pattern_slug: str,
    feature_snapshot: dict,
) -> tuple[float, float, str]:
    """Return (predicted_prob, threshold, model_source). Never raises.

    model_source is "registry" when a trained model was used, "fallback" otherwise.
    Falls back to (_FALLBACK_PROB, _FALLBACK_THRESHOLD, "fallback") when:
      - no registry entry exists for this pattern
      - the engine has not been trained yet (predict_feature_row returns None)
      - any unexpected exception occurs
    """
    try:
        model_ref = MODEL_REGISTRY_STORE.get_preferred_scoring_model(
            pattern_slug,
            definition_id=_current_definition_id(pattern_slug),
        )
        if model_ref is None:
            return _FALLBACK_PROB, _FALLBACK_THRESHOLD, "fallback"
        engine = get_engine(model_ref.model_key)
        p_win = engine.predict_feature_row(feature_snapshot)
        if p_win is None:
            return _FALLBACK_PROB, _FALLBACK_THRESHOLD, "fallback"
        threshold = resolve_threshold(model_ref.threshold_policy_version)
        return float(p_win), threshold, "registry"
    except Exception:
        return _FALLBACK_PROB, _FALLBACK_THRESHOLD, "fallback"


_FALLBACK_PROB: float = 0.6
_FALLBACK_THRESHOLD: float = 0.55


def _predict_safe(
    pattern_slug: str,
    feature_snapshot: dict,
) -> tuple[float, float, str]:
    """Return (predicted_prob, threshold, model_source). Never raises.

    model_source is "registry" when a trained model was used, "fallback" otherwise.
    Falls back to (_FALLBACK_PROB, _FALLBACK_THRESHOLD, "fallback") when:
      - no registry entry exists for this pattern
      - the engine has not been trained yet (predict_feature_row returns None)
      - any unexpected exception occurs
    """
    try:
        model_ref = MODEL_REGISTRY_STORE.get_preferred_scoring_model(
            pattern_slug,
            definition_id=_current_definition_id(pattern_slug),
        )
        if model_ref is None:
            return _FALLBACK_PROB, _FALLBACK_THRESHOLD, "fallback"
        engine = get_engine(model_ref.model_key)
        p_win = engine.predict_feature_row(feature_snapshot)
        if p_win is None:
            return _FALLBACK_PROB, _FALLBACK_THRESHOLD, "fallback"
        threshold = resolve_threshold(model_ref.threshold_policy_version)
        return float(p_win), threshold, "registry"
    except Exception:
        return _FALLBACK_PROB, _FALLBACK_THRESHOLD, "fallback"


def _klines_for_context(df: pd.DataFrame) -> pd.DataFrame:
    """Convert parquet OHLCV DataFrame to the format expected by Context/feature_calc.

    Context expects: indexed by UTC timestamp, columns: open/high/low/close/volume/taker_buy_base_volume
    """
    df = df.copy()
    if "ts" in df.columns:
        df = df.set_index("ts")
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    # Rename if needed
    rename = {}
    if "taker_buy_vol" in df.columns and "taker_buy_base_volume" not in df.columns:
        rename["taker_buy_vol"] = "taker_buy_base_volume"
    if rename:
        df = df.rename(columns=rename)
    # Keep only required columns
    cols = [c for c in ["open", "high", "low", "close", "volume", "taker_buy_base_volume"] if c in df.columns]
    return df[cols].astype(float)


def _build_perp_from_store(store: ParquetStore, symbol: str) -> pd.DataFrame | None:
    """Build a perp DataFrame for compute_features_table from ParquetStore.

    Core columns (feature_calc reads these directly):
      funding_rate, oi_raw, oi_change_1h, oi_change_24h, long_short_ratio

    Phase 1 extension columns (W-0316, passed through via _PERP_PASSTHROUGH_COLS):
      oi_exchange_conc, total_oi_change_1h, total_oi_change_24h  (from exchange_oi store)
      coinbase_premium, coinbase_premium_norm                     (from global coinbase store)
      dex_buy_pct                                                  (from dex store)

    Returns None if no funding data available (building blocks default to neutral).
    """
    try:
        funding = store.read_funding(symbol)
        if funding.empty:
            return None
        funding = funding.set_index("ts").sort_index()
        funding.index = pd.to_datetime(funding.index, utc=True)

        oi = store.read_oi(symbol)
        ls = store.read_longshort(symbol)

        frames: list[pd.DataFrame] = [funding[["funding_rate"]]]

        if not oi.empty:
            oi = oi.set_index("ts").sort_index()
            oi.index = pd.to_datetime(oi.index, utc=True)
            oi = oi[["oi_usd"]].rename(columns={"oi_usd": "oi_raw"})
            oi["oi_change_1h"] = oi["oi_raw"].pct_change(1).fillna(0.0)
            oi["oi_change_24h"] = oi["oi_raw"].pct_change(24).fillna(0.0)
            frames.append(oi)
        else:
            # No OI data — NaN placeholders so compute_features_table doesn't KeyError.
            placeholder = funding[[]].copy()
            placeholder["oi_raw"] = float("nan")
            placeholder["oi_change_1h"] = float("nan")
            placeholder["oi_change_24h"] = float("nan")
            frames.append(placeholder)

        if not ls.empty:
            ls = ls.set_index("ts").sort_index()
            ls.index = pd.to_datetime(ls.index, utc=True)
            ls["long_short_ratio"] = ls["long_ratio"] / ls["short_ratio"].replace(0, float("nan"))
            frames.append(ls[["long_short_ratio"]])

        # Phase 1 (W-0316): multi-exchange OI → enables oi_exchange_divergence building block
        try:
            exc_oi = store.read_exchange_oi(symbol)
            if not exc_oi.empty:
                exc_oi = exc_oi.set_index("ts").sort_index()
                exc_oi.index = pd.to_datetime(exc_oi.index, utc=True)
                want = ["oi_exchange_conc", "total_oi_change_1h", "total_oi_change_24h", "total_perp_oi"]
                cols = [c for c in want if c in exc_oi.columns]
                if cols:
                    frames.append(exc_oi[cols])
        except Exception:
            pass

        # Phase 1 (W-0316): coinbase premium → enables coinbase_premium_positive building block
        try:
            cb = store.read_coinbase_premium()
            if not cb.empty:
                cb = cb.set_index("ts").sort_index()
                cb.index = pd.to_datetime(cb.index, utc=True)
                want = ["coinbase_premium", "coinbase_premium_norm"]
                cols = [c for c in want if c in cb.columns]
                if cols:
                    frames.append(cb[cols])
        except Exception:
            pass

        # Phase 1 (W-0316): DEX buy pressure → enables dex_buy_pressure building block
        try:
            dex = store.read_dex(symbol)
            if not dex.empty:
                dex = dex.set_index("ts").sort_index()
                dex.index = pd.to_datetime(dex.index, utc=True)
                if "dex_buy_pct" in dex.columns:
                    frames.append(dex[["dex_buy_pct"]])
        except Exception:
            pass

        if len(frames) == 1:
            return frames[0]
        return frames[0].join(frames[1:], how="outer")
    except Exception:
        return None


def _inject_live_ob(features: pd.DataFrame, symbol: str) -> None:
    """Inject live orderbook depth5 snapshot into the last row of features (in-place)."""
    try:
        from data_cache.fetch_orderbook_depth import fetch_orderbook_depth5
        result = fetch_orderbook_depth5(symbol, perp=True)
        if result is None:
            result = fetch_orderbook_depth5(symbol, perp=False)
        if result is not None:
            bid_usd, ask_usd = result
            features.loc[features.index[-1], "ob_bid_usd"] = bid_usd
            features.loc[features.index[-1], "ob_ask_usd"] = ask_usd
    except Exception as exc:
        log.debug("[%s] OB depth injection failed: %s", symbol, exc)


def _inject_live_aggtrades(features: pd.DataFrame, symbol: str) -> None:
    """Inject live aggTrades metrics into the last row of features (in-place)."""
    try:
        from data_cache.fetch_aggtrades import fetch_aggtrades_snapshot
        snap = fetch_aggtrades_snapshot(symbol, perp=True)
        if snap is None:
            snap = fetch_aggtrades_snapshot(symbol, perp=False)
        if snap is not None:
            idx = features.index[-1]
            features.loc[idx, "cvd_1m_usd"] = snap.cvd_usd
            features.loc[idx, "vol_velocity_1m"] = snap.vol_velocity
            features.loc[idx, "whale_tick_count"] = float(snap.whale_tick_count)
    except Exception as exc:
        log.debug("[%s] AggTrades injection failed: %s", symbol, exc)


def _inject_multi_exchange(features: pd.DataFrame, symbol: str) -> None:
    """Inject MEXC/Bitget multi-exchange features into last row of features (in-place)."""
    try:
        from data_cache.fetch_multi_exchange import fetch_multi_exchange_snapshot
        snap = fetch_multi_exchange_snapshot(symbol)
        if snap is not None:
            idx = features.index[-1]
            features.loc[idx, "mexc_vol_ratio"] = snap.mexc_vol_ratio
            features.loc[idx, "mexc_price_lead"] = snap.mexc_price_lead
    except Exception as exc:
        log.debug("[%s] Multi-exchange injection failed: %s", symbol, exc)


def _inject_mtf_features(features: pd.DataFrame, klines: pd.DataFrame) -> None:
    """Compute MTF EMA confluence and merge into features (in-place)."""
    try:
        from scanner.mtf_features import compute_mtf_confluence
        mtf = compute_mtf_confluence(klines)
        for col in ["mtf_confluence_score", "mtf_ema_bull_count", "mtf_ema_bear_count"]:
            features[col] = mtf[col].reindex(features.index, method="ffill")
    except Exception as exc:
        log.debug("MTF feature injection failed: %s", exc)


def _inject_cross_exchange(
    features: pd.DataFrame,
    symbol: str,
    store: "ParquetStore",
) -> None:
    """Inject 6 cross-exchange features into the full features DataFrame (in-place).

    Features are computed over the entire historical window (all rows),
    not just the last bar. All features use shift(1) to prevent lookahead.

    Only populated for top-20 symbols (W-0358 Tier 1 data); others stay NaN.
    """
    if symbol not in _TIER1_SYMBOLS:
        return

    try:
        import numpy as np

        ohlcv_dir = store._ohlcv  # engine/data_cache/market_data/ohlcv/

        # Resolve features index: must be DatetimeIndex for reindex to work.
        # If features has an integer index but a 'ts' column, use that column.
        # If neither, fall back to loading ts from the store (for test scripts
        # that build features with pd.DataFrame({'close': raw['close'].values})).
        feat_index = features.index
        if not isinstance(feat_index, pd.DatetimeIndex):
            if "ts" in features.columns:
                feat_index = pd.to_datetime(features["ts"], utc=True)
            else:
                try:
                    raw_ts = store.read_ohlcv(symbol)
                    if "ts" in raw_ts.columns and len(raw_ts) == len(features):
                        feat_index = pd.to_datetime(raw_ts["ts"], utc=True)
                    else:
                        log.debug("[%s] _inject_cross_exchange: cannot resolve DatetimeIndex, skipping", symbol)
                        return
                except Exception:
                    log.debug("[%s] _inject_cross_exchange: no DatetimeIndex, skipping", symbol)
                    return

        def _read_exchange(exchange_id: str) -> pd.DataFrame | None:
            p = ohlcv_dir / exchange_id / f"{symbol}_1h.parquet"
            if not p.exists():
                return None
            try:
                df = pd.read_parquet(p)
                if "ts" in df.columns:
                    df["ts"] = pd.to_datetime(df["ts"], unit="ms", utc=True)
                    return df.set_index("ts").sort_index()
                elif isinstance(df.index, pd.DatetimeIndex):
                    if df.index.tz is None:
                        df.index = df.index.tz_localize("UTC")
                    return df.sort_index()
                else:
                    return None
            except Exception:
                return None

        # Read spot data from 3 exchanges for HHI and price dispersion
        binance_spot  = _read_exchange("binance_spot")
        okx_spot      = _read_exchange("okx_spot")
        bybit_spot    = _read_exchange("bybit_spot")
        coinbase_spot = _read_exchange("coinbase_spot") if symbol in _COINBASE_SYMBOLS else None

        # fut_close: use feat_index for reindex, then align back to features
        close_series = pd.Series(features["close"].values, index=feat_index)
        fut_close = close_series.shift(1)  # lookahead-free futures close

        # ── Feature 1 & 2: Spot-Futures Basis ──────────────────────────────
        if binance_spot is not None and "close" in binance_spot.columns:
            spot_close = binance_spot["close"].reindex(feat_index, method="ffill").shift(1)
            basis_pct = (fut_close - spot_close) / spot_close * 100

            # 30d rolling zscore (720 hours)
            roll = basis_pct.rolling(720, min_periods=48)
            basis_zscore = (basis_pct - roll.mean()) / roll.std().replace(0, np.nan)

            features["spot_futures_basis_pct"]   = basis_pct.values
            features["spot_futures_basis_zscore"] = basis_zscore.values

        # ── Feature 3: Coinbase Premium (BTC/ETH only) ─────────────────────
        if coinbase_spot is not None and "close" in coinbase_spot.columns:
            cb_close = coinbase_spot["close"].reindex(feat_index, method="ffill").shift(1)
            features["coinbase_premium_pct"] = ((cb_close - fut_close) / fut_close * 100).values

        # ── Feature 4: Kimchi Premium (BTC/ETH only) ───────────────────────
        if symbol in _KIMCHI_SYMBOLS:
            try:
                upbit_df = store.read_upbit()
                base = symbol.replace("USDT", "")
                if base in upbit_df.columns:
                    usd_krw_df = store.read_macro() if hasattr(store, "read_macro") else None
                    if usd_krw_df is not None and "usd_krw" in usd_krw_df.columns:
                        usd_krw = usd_krw_df["usd_krw"].reindex(feat_index, method="ffill").shift(1)
                        upbit_usd = upbit_df[base].reindex(feat_index, method="ffill").shift(1) / usd_krw
                        features["kimchi_premium_pct"] = ((upbit_usd - fut_close) / fut_close * 100).values
            except Exception:
                pass  # kimchi_premium_pct stays NaN

        # ── Feature 5 & 6: Cross-Exchange Volume HHI + Price Dispersion ────
        closes = []
        volumes = []
        for _exch_df in [binance_spot, okx_spot, bybit_spot]:
            if _exch_df is not None and "close" in _exch_df.columns and "volume" in _exch_df.columns:
                closes.append(_exch_df["close"].reindex(feat_index, method="ffill").shift(1))
                volumes.append(_exch_df["volume"].reindex(feat_index, method="ffill").shift(1))

        if len(closes) >= 2:
            close_matrix  = pd.concat(closes,  axis=1)
            volume_matrix = pd.concat(volumes, axis=1)

            # Price dispersion: std of close across venues
            features["xchg_price_dispersion"] = (close_matrix.std(axis=1) / close_matrix.mean(axis=1)).values

            # Volume HHI: sum of squared market shares
            vol_sum = volume_matrix.sum(axis=1).replace(0, np.nan)
            shares  = volume_matrix.div(vol_sum, axis=0)
            features["xchg_volume_concentration_hhi"] = ((shares ** 2).sum(axis=1)).values

    except Exception as exc:
        log.debug("[%s] Cross-exchange injection failed: %s", symbol, exc)


def _inject_sector_scores(
    features: pd.DataFrame,
    symbol: str,
    sector_scores: dict[str, float] | None,
) -> None:
    """Inject sector_score_norm and sector_avg_pct into all rows (uniform value)."""
    if not sector_scores:
        return
    try:
        score_norm = sector_scores.get(symbol, 0.0)
        sector_avg_map = sector_scores.get("__sector_avg__", {}) or {}
        from data_cache.token_universe import get_sector
        sector_avg_pct = sector_avg_map.get(get_sector(symbol), 0.0) if sector_avg_map else 0.0
        features["sector_score_norm"] = float(score_norm)
        features["sector_avg_pct"] = float(sector_avg_pct)
    except Exception as exc:
        log.debug("[%s] Sector score injection failed: %s", symbol, exc)


def _scan_one_symbol(
    symbol: str,
    store: ParquetStore,
    combos: list[PatternCombo],
    risk_cfg: RiskConfig,
    costs: ExecutionCosts,
    macro: pd.DataFrame | None = None,
    sector_scores: dict[str, float] | None = None,
) -> tuple[list[PatternResult], dict[str, list[float]]]:
    results: list[PatternResult] = []
    trade_returns_by_pattern: dict[str, list[float]] = {}
    scan_ts = datetime.now(timezone.utc).isoformat()

    try:
        raw = store.read_ohlcv(symbol)
        if len(raw) < MIN_HISTORY_BARS:
            log.debug("[%s] insufficient data (%d rows < %d)", symbol, len(raw), MIN_HISTORY_BARS)
            return [], {}

        klines = _klines_for_context(raw)
        perp = _build_perp_from_store(store, symbol)
        features = compute_features_table(klines, symbol=symbol, perp=perp, macro=macro)
        if _LIVE_SIGNALS_MODE:
            _inject_live_ob(features, symbol)
            _inject_live_aggtrades(features, symbol)
            _inject_multi_exchange(features, symbol)
        _inject_sector_scores(features, symbol, sector_scores)
        _inject_mtf_features(features, klines)
        _inject_cross_exchange(features, symbol, store)  # W-0359

        if len(features) < 50:
            log.debug("[%s] insufficient features (%d rows)", symbol, len(features))
            return [], {}

        ctx = Context(klines=klines, features=features, symbol=symbol)
        adv = float((klines["close"] * klines["volume"]).mean())

    except Exception as exc:
        log.warning("[%s] context build failed: %s", symbol, exc)
        return [], {}

    # OOS wiring (W-0341): compute holdout cutoff when enabled
    holdout_ts: "pd.Timestamp | None" = None
    if _OOS_WIRING:
        holdout_ts = _oos_cutoff(klines, _OOS_HOLDOUT_FRAC)

    for combo in combos:
        try:
            fired = combo.fire(ctx)
            # Exclude the last bar: signal at bar T enters at T+1, needs T+1 to exist
            last_valid_ts = klines.index[-2] if len(klines) > 1 else None

            # ML inference: use latest feature row as the scoring snapshot.
            # Falls back gracefully when no model is registered for this pattern yet.
            _last_feature_row = features.iloc[-1].to_dict() if len(features) > 0 else {}
            predicted_prob, threshold, model_source = _predict_safe(
                combo.name, _last_feature_row
            )
            if model_source == "registry":
                log.debug(
                    "[%s/%s] ML score=%.3f threshold=%.2f (registry)",
                    symbol, combo.name, predicted_prob, threshold,
                )

            signals: list[EntrySignal] = [
                EntrySignal(
                    symbol=symbol,
                    timestamp=ts,
                    direction=combo.direction,
                    predicted_prob=predicted_prob,
                    source_model=combo.name,
                )
                for ts, val in fired.items()
                if val and (last_valid_ts is None or ts <= last_valid_ts)
            ]

            # OOS: filter signals to holdout period only
            if _OOS_WIRING and holdout_ts is not None:
                signals = [s for s in signals if s.timestamp >= holdout_ts]

            if not signals:
                results.append(PatternResult(
                    symbol=symbol, pattern=combo.name, direction=combo.direction,
                    n_signals=0, n_executed=0, win_rate=0.0, expectancy_pct=0.0,
                    sharpe=0.0, calmar=0.0, max_drawdown_pct=0.0,
                    final_equity=risk_cfg.initial_equity, scan_ts=scan_ts,
                ))
                continue

            bt = run_backtest(
                entries=signals,
                klines_by_symbol={symbol: klines},
                adv_by_symbol={symbol: adv},
                risk_cfg=risk_cfg,
                costs=costs,
                threshold=threshold,
                logger=_NULL_LOGGER,
            )
            m = bt.metrics
            trade_returns_by_pattern[combo.name] = [
                t.realized_pnl_pct * 100.0 for t in bt.trades
            ]
            results.append(PatternResult(
                symbol=symbol, pattern=combo.name, direction=combo.direction,
                n_signals=len(signals), n_executed=m.n_executed,
                win_rate=m.win_rate, expectancy_pct=m.expectancy_pct,
                sharpe=m.sharpe, calmar=m.calmar,
                max_drawdown_pct=m.max_drawdown_pct,
                final_equity=m.final_equity, scan_ts=scan_ts,
            ))

        except Exception as exc:
            log.warning("[%s/%s] backtest failed: %s", symbol, combo.name, exc)

    return results, trade_returns_by_pattern


class PatternScanner:
    """Scan all universe symbols against all pattern combos."""

    def __init__(
        self,
        store: ParquetStore | None = None,
        combos: list[PatternCombo] | None = None,
        risk_cfg: RiskConfig | None = None,
        costs: ExecutionCosts | None = None,
        macro: pd.DataFrame | None = None,
        sector_scores: dict[str, float] | None = None,
    ) -> None:
        self.store = store or ParquetStore()
        self.combos = combos or ALL_COMBOS
        self.risk_cfg = risk_cfg or _DEFAULT_RISK
        self.costs = costs or _DEFAULT_COSTS
        self._macro = macro
        self._sector_scores = sector_scores
        self.last_m_total: int = 0
        self._last_trade_returns: dict[tuple[str, str], list[float]] = {}

    def scan_symbol(self, symbol: str) -> list[PatternResult]:
        results, _ = _scan_one_symbol(
            symbol, self.store, self.combos, self.risk_cfg, self.costs,
            macro=self._macro, sector_scores=self._sector_scores,
        )
        return results

    def scan_universe(
        self,
        symbols: list[str],
        workers: int = 8,
        min_signals: int = 1,
    ) -> pd.DataFrame:
        """Parallel scan across all symbols. Returns results DataFrame."""
        t0 = time.monotonic()
        all_results: list[PatternResult] = []
        all_trade_returns: dict[tuple[str, str], list[float]] = {}
        done = 0
        fail = 0

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(
                    _scan_one_symbol,
                    sym, self.store, self.combos, self.risk_cfg, self.costs,
                    self._macro, self._sector_scores,
                ): sym
                for sym in symbols
            }
            for fut in as_completed(futures):
                sym = futures[fut]
                try:
                    res, tr = fut.result()
                    all_results.extend(res)
                    for pat, rets in tr.items():
                        all_trade_returns[(sym, pat)] = rets
                    done += 1
                    if done % 50 == 0:
                        log.info("Scanned %d/%d symbols...", done, len(symbols))
                except Exception as exc:
                    log.warning("[%s] scan error: %s", sym, exc)
                    fail += 1

        elapsed = time.monotonic() - t0
        log.info(
            "Scan complete: %d symbols, %d results, %d failed in %.1fs",
            done, len(all_results), fail, elapsed,
        )

        if not all_results:
            return pd.DataFrame()

        df = pd.DataFrame(all_results, columns=PatternResult._fields)
        df = df[df["n_signals"] >= min_signals].copy()
        # Cap spurious Sharpe from tiny-n results (std≈0 edge case)
        df["sharpe"] = df["sharpe"].clip(-10, 10)
        df = df.sort_values("sharpe", ascending=False).reset_index(drop=True)

        # Track total tests for BH family (W-0341)
        self.last_m_total = len(symbols) * len(self.combos)
        self._last_trade_returns = all_trade_returns

        self.save_results(df)
        return df

    def save_results(self, df: pd.DataFrame) -> None:
        _RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(_RESULTS_PATH, index=False, compression=_COMPRESS)
        log.info("Results saved → %s (%d rows)", _RESULTS_PATH, len(df))

    def load_results(self) -> pd.DataFrame:
        if not _RESULTS_PATH.exists():
            return pd.DataFrame()
        return pd.read_parquet(_RESULTS_PATH)
