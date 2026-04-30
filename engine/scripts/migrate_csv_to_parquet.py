"""Migrate existing CSV cache → ParquetStore.

Reads engine/data_cache/cache/*.csv (OHLCV + perp) and writes to
engine/data_cache/market_data/ (ParquetStore format).

No API calls. Uses only existing local data.

Column mappings:
  OHLCV CSV (index=timestamp):
    open/high/low/close/volume  → same
    taker_buy_base_volume       → taker_buy_vol
    (quote_volume, trade_count, taker_buy_quote_volume dropped)

  Perp CSV (index=timestamp):
    funding_rate                → funding.parquet ts,funding_rate
    oi_raw                      → oi.parquet      ts,oi_usd
    long_short_ratio            → longshort.parquet ts,long_ratio,short_ratio
      (long_ratio=long_short_ratio, short_ratio=1.0 preserves the ratio)

Usage:
    cd engine && uv run python -m scripts.migrate_csv_to_parquet
    cd engine && uv run python -m scripts.migrate_csv_to_parquet --dry-run
    cd engine && uv run python -m scripts.migrate_csv_to_parquet --symbols BTCUSDT ETHUSDT
"""
from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

try:
    import env_bootstrap  # noqa: F401
except ModuleNotFoundError:
    pass

import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("migrate")

_CACHE_DIR = Path(__file__).parents[1] / "data_cache" / "cache"


def _normalise_index(df: pd.DataFrame) -> pd.DataFrame:
    """Convert index → 'ts' UTC datetime column, dedup, sort."""
    df = df.copy()
    ts = pd.to_datetime(df.index, utc=True, format="mixed")
    df.index = ts
    df = df[~df.index.duplicated(keep="last")].sort_index()
    df = df.reset_index().rename(columns={"index": "ts", "timestamp": "ts"})
    if "ts" not in df.columns:
        raise ValueError(f"Could not create ts column, columns={df.columns.tolist()}")
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    return df


def migrate_ohlcv(symbol: str, store, dry_run: bool) -> int:
    """Migrate {symbol}_1h.csv → ParquetStore OHLCV. Returns row count."""
    path = _CACHE_DIR / f"{symbol}_1h.csv"
    if not path.exists():
        return 0
    try:
        raw = pd.read_csv(path, index_col="timestamp", parse_dates=True)
        df = _normalise_index(raw)

        rename = {}
        if "taker_buy_base_volume" in df.columns:
            rename["taker_buy_base_volume"] = "taker_buy_vol"
        if rename:
            df = df.rename(columns=rename)

        keep = [c for c in ["ts", "open", "high", "low", "close", "volume", "taker_buy_vol"] if c in df.columns]
        df = df[keep].dropna(subset=["ts", "open", "close"])

        if not dry_run:
            store.write_ohlcv(symbol, df, "1h")
        return len(df)
    except Exception as exc:
        log.warning("[%s] OHLCV migration failed: %s", symbol, exc)
        return 0


def migrate_perp(symbol: str, store, dry_run: bool) -> tuple[int, int, int]:
    """Migrate {symbol}_perp.csv → funding/oi/longshort parquets.

    Returns (funding_rows, oi_rows, ls_rows).
    """
    path = _CACHE_DIR / f"{symbol}_perp.csv"
    if not path.exists():
        return 0, 0, 0
    try:
        raw = pd.read_csv(path, index_col=0, parse_dates=[0])
        df = _normalise_index(raw)

        n_fund = n_oi = n_ls = 0

        # Funding
        if "funding_rate" in df.columns:
            fund = df[["ts", "funding_rate"]].dropna()
            if not dry_run and len(fund) > 0:
                store.write_funding(symbol, fund)
            n_fund = len(fund)

        # OI
        oi_col = next((c for c in ["oi_raw", "oi_usd"] if c in df.columns), None)
        if oi_col:
            oi = df[["ts", oi_col]].rename(columns={oi_col: "oi_usd"}).dropna()
            oi = oi[oi["oi_usd"] != 0]  # skip zero-fill rows
            if not dry_run and len(oi) > 0:
                store.write_oi(symbol, oi)
            n_oi = len(oi)

        # Long/Short ratio
        if "long_short_ratio" in df.columns:
            ls = df[["ts", "long_short_ratio"]].dropna().copy()
            ls = ls[ls["long_short_ratio"] > 0]
            ls["long_ratio"] = ls["long_short_ratio"]
            ls["short_ratio"] = 1.0
            ls = ls[["ts", "long_ratio", "short_ratio"]]
            if not dry_run and len(ls) > 0:
                store.write_longshort(symbol, ls)
            n_ls = len(ls)

        return n_fund, n_oi, n_ls
    except Exception as exc:
        log.warning("[%s] perp migration failed: %s", symbol, exc)
        return 0, 0, 0


def run(symbols: list[str] | None = None, dry_run: bool = False) -> None:
    from data_cache.parquet_store import ParquetStore
    store = ParquetStore()

    ohlcv_files = sorted(_CACHE_DIR.glob("*_1h.csv"))
    perp_files = sorted(_CACHE_DIR.glob("*_perp.csv"))

    if symbols:
        sym_set = set(s.upper() for s in symbols)
        ohlcv_files = [f for f in ohlcv_files if f.stem.replace("_1h", "").upper() in sym_set]
        perp_files = [f for f in perp_files if f.stem.replace("_perp", "").upper() in sym_set]

    log.info("Migration: %d OHLCV + %d perp CSVs → ParquetStore%s",
             len(ohlcv_files), len(perp_files), " [DRY RUN]" if dry_run else "")

    t0 = time.monotonic()
    total_ohlcv = total_fund = total_oi = total_ls = 0
    ok_ohlcv = ok_perp = 0

    for f in ohlcv_files:
        sym = f.stem.replace("_1h", "")
        n = migrate_ohlcv(sym, store, dry_run)
        if n > 0:
            total_ohlcv += n
            ok_ohlcv += 1
            log.debug("  OHLCV %s: %d rows", sym, n)

    for f in perp_files:
        sym = f.stem.replace("_perp", "")
        nf, no, nl = migrate_perp(sym, store, dry_run)
        if nf + no + nl > 0:
            total_fund += nf
            total_oi += no
            total_ls += nl
            ok_perp += 1
            log.debug("  perp  %s: funding=%d oi=%d ls=%d", sym, nf, no, nl)

    elapsed = time.monotonic() - t0

    print("\n" + "=" * 60)
    print(f"Migration {'[DRY RUN] ' if dry_run else ''}complete in {elapsed:.1f}s")
    print(f"  OHLCV :  {ok_ohlcv:4d} symbols  {total_ohlcv:,} rows")
    print(f"  funding: {ok_perp:4d} symbols  {total_fund:,} rows")
    print(f"  OI     : {ok_perp:4d} symbols  {total_oi:,} rows")
    print(f"  LS     : {ok_perp:4d} symbols  {total_ls:,} rows")

    if not dry_run:
        from data_cache.parquet_store import _MARKET_DATA
        import shutil
        size = sum(f.stat().st_size for f in _MARKET_DATA.rglob("*.parquet"))
        print(f"  Size   :  {size / 1e6:.1f} MB at {_MARKET_DATA}")
    print("=" * 60)


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate CSV cache → ParquetStore")
    parser.add_argument("--dry-run", action="store_true", help="Count rows without writing")
    parser.add_argument("--symbols", nargs="+", help="Limit to specific symbols")
    args = parser.parse_args()
    run(symbols=args.symbols, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
