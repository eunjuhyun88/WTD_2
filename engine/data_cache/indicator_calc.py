"""Technical indicator computation over OHLCV Parquet data.

Computes indicators in-place and saves back to parquet.
All indicators use pandas/numpy only — no TA-Lib dependency.

Indicators computed:
  RSI(14), MACD(12,26,9), BB(20,2), ATR(14), vol_ma_20
  Futures-only (when funding/OI available): funding_ma_8, oi_pct_chg_24h

Usage:
    from data_cache.indicator_calc import IndicatorEngine
    eng = IndicatorEngine()
    df = eng.compute(ohlcv_df)          # single df
    eng.compute_and_save("BTCUSDT")      # load parquet → compute → save
    eng.compute_all(symbols)             # parallel for all symbols
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import numpy as np
import pandas as pd

from data_cache.parquet_store import ParquetStore

log = logging.getLogger("engine.indicator_calc")


class IndicatorEngine:
    def __init__(self, store: ParquetStore | None = None) -> None:
        self.store = store or ParquetStore()

    # ── Core math ─────────────────────────────────────────────────────────────

    @staticmethod
    def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
        delta = close.diff()
        gain = delta.clip(lower=0).ewm(com=period - 1, min_periods=period).mean()
        loss = (-delta.clip(upper=0)).ewm(com=period - 1, min_periods=period).mean()
        rs = gain / loss.replace(0, np.nan)
        return (100 - 100 / (1 + rs)).rename("rsi")

    @staticmethod
    def _macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
        ema_fast = close.ewm(span=fast, adjust=False).mean()
        ema_slow = close.ewm(span=slow, adjust=False).mean()
        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=signal, adjust=False).mean()
        hist = macd_line - signal_line
        return macd_line.rename("macd"), signal_line.rename("macd_signal"), hist.rename("macd_hist")

    @staticmethod
    def _bollinger(close: pd.Series, period: int = 20, std_mult: float = 2.0):
        ma = close.rolling(period).mean()
        std = close.rolling(period).std()
        upper = (ma + std_mult * std).rename("bb_upper")
        lower = (ma - std_mult * std).rename("bb_lower")
        pct_b = ((close - lower) / (upper - lower)).rename("bb_pct_b")
        return upper, lower, pct_b

    @staticmethod
    def _atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
        tr = pd.concat([
            high - low,
            (high - close.shift()).abs(),
            (low - close.shift()).abs(),
        ], axis=1).max(axis=1)
        return tr.ewm(com=period - 1, min_periods=period).mean().rename("atr")

    @staticmethod
    def _ema(series: pd.Series, span: int) -> pd.Series:
        return series.ewm(span=span, adjust=False).mean()

    # ── Main compute ──────────────────────────────────────────────────────────

    def compute(self, df: pd.DataFrame) -> pd.DataFrame:
        """Compute all indicators. Input must have: open, high, low, close, volume.
        Returns df with indicator columns appended."""
        df = df.copy()
        close = df["close"].astype(float)
        high = df["high"].astype(float)
        low = df["low"].astype(float)
        vol = df["volume"].astype(float)

        # RSI
        df["rsi"] = self._rsi(close)

        # MACD
        df["macd"], df["macd_signal"], df["macd_hist"] = self._macd(close)

        # Bollinger Bands
        df["bb_upper"], df["bb_lower"], df["bb_pct_b"] = self._bollinger(close)

        # ATR
        df["atr"] = self._atr(high, low, close)
        df["atr_pct"] = (df["atr"] / close * 100).round(4)

        # Volume MA
        df["vol_ma_20"] = vol.rolling(20).mean()
        df["vol_ratio"] = (vol / df["vol_ma_20"]).round(3)

        # Price momentum
        df["ret_1h"] = close.pct_change(1).round(6)
        df["ret_4h"] = close.pct_change(4).round(6)
        df["ret_24h"] = close.pct_change(24).round(6)

        # EMA crossover
        df["ema_9"] = self._ema(close, 9)
        df["ema_21"] = self._ema(close, 21)
        df["ema_cross"] = np.sign(df["ema_9"] - df["ema_21"]).astype(int)

        return df

    def compute_with_derivatives(
        self,
        ohlcv_df: pd.DataFrame,
        funding_df: pd.DataFrame | None = None,
        oi_df: pd.DataFrame | None = None,
    ) -> pd.DataFrame:
        """Compute indicators + merge derivative signals."""
        df = self.compute(ohlcv_df)

        if funding_df is not None and not funding_df.empty:
            funding_df = funding_df.copy()
            funding_df["ts"] = pd.to_datetime(funding_df["ts"], utc=True)
            funding_df = funding_df.set_index("ts")[["funding_rate"]].resample("1h").last().ffill()
            funding_df["funding_ma_8"] = funding_df["funding_rate"].rolling(8).mean()
            df = df.set_index("ts").join(funding_df, how="left").reset_index()

        if oi_df is not None and not oi_df.empty:
            oi_df = oi_df.copy()
            oi_df["ts"] = pd.to_datetime(oi_df["ts"], utc=True)
            oi_df = oi_df.set_index("ts")[["oi_usd"]].resample("1h").last().ffill()
            oi_df["oi_pct_chg_24h"] = oi_df["oi_usd"].pct_change(24).round(6)
            df = df.set_index("ts").join(oi_df, how="left").reset_index()

        return df

    # ── File-level operations ─────────────────────────────────────────────────

    def compute_and_save(
        self,
        symbol: str,
        tf: str = "1h",
        with_derivatives: bool = True,
    ) -> bool:
        """Load OHLCV parquet, compute indicators, save back."""
        df = self.store.read_ohlcv(symbol, tf)
        if df.empty:
            log.warning("[%s] no OHLCV data to compute indicators on", symbol)
            return False

        try:
            if with_derivatives:
                funding = self.store.read_funding(symbol)
                oi = self.store.read_oi(symbol)
                df = self.compute_with_derivatives(
                    df,
                    funding_df=funding if not funding.empty else None,
                    oi_df=oi if not oi.empty else None,
                )
            else:
                df = self.compute(df)

            self.store.write_ohlcv(symbol, df, tf)
            log.debug("[%s] indicators computed", symbol)
            return True
        except Exception as exc:
            log.error("[%s] indicator compute failed: %s", symbol, exc)
            return False

    def compute_all(
        self,
        symbols: list[str],
        tf: str = "1h",
        with_derivatives: bool = True,
    ) -> dict[str, int]:
        """Compute indicators for all symbols. Returns {ok, failed}."""
        ok = 0
        fail = 0
        for sym in symbols:
            if self.compute_and_save(sym, tf, with_derivatives):
                ok += 1
            else:
                fail += 1
        log.info("Indicators: %d ok, %d failed", ok, fail)
        return {"ok": ok, "failed": fail}
