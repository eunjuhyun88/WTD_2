"""Parquet-based market data storage.

Layout:
  data_cache/market_data/
  ├── ohlcv/         {symbol}_{tf}.parquet   (open/high/low/close/volume/taker_buy_vol)
  ├── derivatives/   {symbol}_funding.parquet, {symbol}_oi.parquet, {symbol}_longshort.parquet
  ├── onchain/       {base}.parquet
  └── universe.parquet

All parquet files use:
  - compression=zstd (fast + good ratio)
  - timestamp column named "ts" (UTC, datetime64[us, UTC])
  - sorted by ts, deduplicated

Usage:
    from data_cache.parquet_store import ParquetStore
    store = ParquetStore()
    store.write_ohlcv("BTCUSDT", df)
    df = store.read_ohlcv("BTCUSDT", start="2025-01-01")
    ts = store.get_last_ts("BTCUSDT")
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

log = logging.getLogger("engine.parquet_store")

_MARKET_DATA = Path(__file__).parent / "market_data"
_OHLCV_DIR = _MARKET_DATA / "ohlcv"
_DERIV_DIR = _MARKET_DATA / "derivatives"
_ONCHAIN_DIR = _MARKET_DATA / "onchain"

_COMPRESS = "zstd"

OHLCV_COLS = ["ts", "open", "high", "low", "close", "volume", "taker_buy_vol"]
FUNDING_COLS = ["ts", "funding_rate"]
OI_COLS = ["ts", "oi_usd"]
LONGSHORT_COLS = ["ts", "long_ratio", "short_ratio"]


class ParquetStore:
    """Read/write market data as per-symbol Parquet files."""

    def __init__(self, base_dir: Path | None = None) -> None:
        self._base = base_dir or _MARKET_DATA
        self._ohlcv = self._base / "ohlcv"
        self._deriv = self._base / "derivatives"
        self._onchain = self._base / "onchain"
        for d in (self._ohlcv, self._deriv, self._onchain):
            d.mkdir(parents=True, exist_ok=True)

    # ── path helpers ─────────────────────────────────────────────────────────

    def _ohlcv_path(self, symbol: str, tf: str) -> Path:
        return self._ohlcv / f"{symbol}_{tf}.parquet"

    def _deriv_path(self, symbol: str, dtype: str) -> Path:
        return self._deriv / f"{symbol}_{dtype}.parquet"

    def _onchain_path(self, base: str) -> Path:
        return self._onchain / f"{base}.parquet"

    # ── generic helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _normalise_ts(df: pd.DataFrame) -> pd.DataFrame:
        """Ensure 'ts' column is UTC datetime, sorted, deduplicated."""
        if "ts" not in df.columns:
            raise ValueError("DataFrame must have a 'ts' column")
        df = df.copy()
        ts = pd.to_datetime(df["ts"])
        if ts.dt.tz is None:
            ts = ts.dt.tz_localize("UTC")
        else:
            ts = ts.dt.tz_convert("UTC")
        df["ts"] = ts
        df = df.drop_duplicates(subset=["ts"]).sort_values("ts").reset_index(drop=True)
        return df

    def _upsert(self, path: Path, new_df: pd.DataFrame) -> pd.DataFrame:
        """Merge new_df into existing parquet, dedup by ts, save."""
        new_df = self._normalise_ts(new_df)
        if path.exists():
            old = pd.read_parquet(path)
            old = self._normalise_ts(old)
            merged = pd.concat([old, new_df], ignore_index=True)
            merged = merged.drop_duplicates(subset=["ts"]).sort_values("ts").reset_index(drop=True)
        else:
            merged = new_df
        merged.to_parquet(path, index=False, compression=_COMPRESS)
        return merged

    # ── OHLCV ─────────────────────────────────────────────────────────────────

    def write_ohlcv(self, symbol: str, df: pd.DataFrame, tf: str = "1h") -> None:
        """Write (upsert) OHLCV data for a symbol."""
        path = self._ohlcv_path(symbol, tf)
        result = self._upsert(path, df)
        log.debug("[%s/%s] upsert → %d rows", symbol, tf, len(result))

    def read_ohlcv(
        self,
        symbol: str,
        tf: str = "1h",
        start: str | datetime | None = None,
        end: str | datetime | None = None,
    ) -> pd.DataFrame:
        path = self._ohlcv_path(symbol, tf)
        if not path.exists():
            return pd.DataFrame(columns=OHLCV_COLS)
        df = pd.read_parquet(path)
        if "ts" not in df.columns:
            return df
        df["ts"] = pd.to_datetime(df["ts"], utc=True)
        if start is not None:
            start_ts = pd.Timestamp(start, tz="UTC") if isinstance(start, str) else pd.Timestamp(start).tz_localize("UTC")
            df = df[df["ts"] >= start_ts]
        if end is not None:
            end_ts = pd.Timestamp(end, tz="UTC") if isinstance(end, str) else pd.Timestamp(end).tz_localize("UTC")
            df = df[df["ts"] <= end_ts]
        return df.reset_index(drop=True)

    def get_last_ts(self, symbol: str, tf: str = "1h") -> datetime | None:
        """Return the latest timestamp in the OHLCV parquet, or None if empty."""
        path = self._ohlcv_path(symbol, tf)
        if not path.exists():
            return None
        try:
            pf = pq.read_table(path, columns=["ts"])
            arr = pf["ts"].to_pylist()
            if not arr:
                return None
            last = max(arr)
            return last.replace(tzinfo=timezone.utc) if last.tzinfo is None else last
        except Exception:
            return None

    def has_ohlcv(self, symbol: str, tf: str = "1h") -> bool:
        return self._ohlcv_path(symbol, tf).exists()

    # ── Derivatives ───────────────────────────────────────────────────────────

    def write_funding(self, symbol: str, df: pd.DataFrame) -> None:
        self._upsert(self._deriv_path(symbol, "funding"), df)

    def read_funding(self, symbol: str) -> pd.DataFrame:
        path = self._deriv_path(symbol, "funding")
        return pd.read_parquet(path) if path.exists() else pd.DataFrame(columns=FUNDING_COLS)

    def write_oi(self, symbol: str, df: pd.DataFrame) -> None:
        self._upsert(self._deriv_path(symbol, "oi"), df)

    def read_oi(self, symbol: str) -> pd.DataFrame:
        path = self._deriv_path(symbol, "oi")
        return pd.read_parquet(path) if path.exists() else pd.DataFrame(columns=OI_COLS)

    def write_longshort(self, symbol: str, df: pd.DataFrame) -> None:
        self._upsert(self._deriv_path(symbol, "longshort"), df)

    def read_longshort(self, symbol: str) -> pd.DataFrame:
        path = self._deriv_path(symbol, "longshort")
        return pd.read_parquet(path) if path.exists() else pd.DataFrame(columns=LONGSHORT_COLS)

    # ── On-chain ──────────────────────────────────────────────────────────────

    def write_onchain(self, base: str, df: pd.DataFrame) -> None:
        self._upsert(self._onchain_path(base.upper()), df)

    def read_onchain(self, base: str) -> pd.DataFrame:
        path = self._onchain_path(base.upper())
        return pd.read_parquet(path) if path.exists() else pd.DataFrame()

    # ── Inventory ─────────────────────────────────────────────────────────────

    def list_symbols(self, tf: str = "1h") -> list[str]:
        """List all symbols that have OHLCV data for the given timeframe."""
        suffix = f"_{tf}.parquet"
        return [p.name[: -len(suffix)] for p in self._ohlcv.glob(f"*{suffix}")]

    def coverage(self, tf: str = "1h") -> pd.DataFrame:
        """Return a DataFrame showing data coverage per symbol."""
        rows = []
        for p in sorted(self._ohlcv.glob(f"*_{tf}.parquet")):
            suffix = f"_{tf}.parquet"
            symbol = p.name[: -len(suffix)]
            try:
                df = pd.read_parquet(p, columns=["ts"])
                df["ts"] = pd.to_datetime(df["ts"], utc=True)
                rows.append({
                    "symbol": symbol,
                    "rows": len(df),
                    "first_ts": df["ts"].min(),
                    "last_ts": df["ts"].max(),
                    "size_kb": p.stat().st_size // 1024,
                })
            except Exception:
                pass
        return pd.DataFrame(rows)
