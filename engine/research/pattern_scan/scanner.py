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
from scanner.feature_calc import compute_features_table, MIN_HISTORY_BARS
from scanner.pnl import ExecutionCosts

log = logging.getLogger("engine.pattern_scan.scanner")

_RESULTS_PATH = Path(__file__).parent.parent / "experiments" / "pattern_scan_results.parquet"
_COMPRESS = "zstd"


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


def _scan_one_symbol(
    symbol: str,
    store: ParquetStore,
    combos: list[PatternCombo],
    risk_cfg: RiskConfig,
    costs: ExecutionCosts,
    macro: pd.DataFrame | None = None,
) -> list[PatternResult]:
    results = []
    scan_ts = datetime.now(timezone.utc).isoformat()

    try:
        raw = store.read_ohlcv(symbol)
        if len(raw) < MIN_HISTORY_BARS:
            log.debug("[%s] insufficient data (%d rows < %d)", symbol, len(raw), MIN_HISTORY_BARS)
            return []

        klines = _klines_for_context(raw)
        perp = _build_perp_from_store(store, symbol)
        features = compute_features_table(klines, symbol=symbol, perp=perp, macro=macro)
        _inject_live_ob(features, symbol)
        _inject_live_aggtrades(features, symbol)

        if len(features) < 50:
            log.debug("[%s] insufficient features (%d rows)", symbol, len(features))
            return []

        ctx = Context(klines=klines, features=features, symbol=symbol)
        adv = float((klines["close"] * klines["volume"]).mean())

    except Exception as exc:
        log.warning("[%s] context build failed: %s", symbol, exc)
        return []

    for combo in combos:
        try:
            fired = combo.fire(ctx)
            # Exclude the last bar: signal at bar T enters at T+1, needs T+1 to exist
            last_valid_ts = klines.index[-2] if len(klines) > 1 else None
            signals: list[EntrySignal] = [
                EntrySignal(
                    symbol=symbol,
                    timestamp=ts,
                    direction=combo.direction,
                    predicted_prob=0.6,
                    source_model=combo.name,
                )
                for ts, val in fired.items()
                if val and (last_valid_ts is None or ts <= last_valid_ts)
            ]

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
                threshold=0.55,
                logger=_NULL_LOGGER,
            )
            m = bt.metrics
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

    return results


class PatternScanner:
    """Scan all universe symbols against all pattern combos."""

    def __init__(
        self,
        store: ParquetStore | None = None,
        combos: list[PatternCombo] | None = None,
        risk_cfg: RiskConfig | None = None,
        costs: ExecutionCosts | None = None,
        macro: pd.DataFrame | None = None,
    ) -> None:
        self.store = store or ParquetStore()
        self.combos = combos or ALL_COMBOS
        self.risk_cfg = risk_cfg or _DEFAULT_RISK
        self.costs = costs or _DEFAULT_COSTS
        self._macro = macro

    def scan_symbol(self, symbol: str) -> list[PatternResult]:
        return _scan_one_symbol(symbol, self.store, self.combos, self.risk_cfg, self.costs, macro=self._macro)

    def scan_universe(
        self,
        symbols: list[str],
        workers: int = 8,
        min_signals: int = 1,
    ) -> pd.DataFrame:
        """Parallel scan across all symbols. Returns results DataFrame."""
        t0 = time.monotonic()
        all_results: list[PatternResult] = []
        done = 0
        fail = 0

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(self.scan_symbol, sym): sym for sym in symbols}
            for fut in as_completed(futures):
                sym = futures[fut]
                try:
                    res = fut.result()
                    all_results.extend(res)
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
