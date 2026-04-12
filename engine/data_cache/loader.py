"""Lazy read-or-fetch loader for kline CSV cache.

The key design decision: `load_klines(..., offline=False)` will silently
fetch missing data from Binance, but `load_klines(..., offline=True)`
raises `CacheMiss` immediately. Challenge prepare.py should call the
former during setup (prewarm) and the latter during evaluate() so that a
long-running experiment cannot silently stall on network I/O halfway
through.

External data sources (macro, on-chain) are driven by data_cache.registry.
To add a new source, edit registry.py only — no changes needed here.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from data_cache.fetch_binance import fetch_klines_max
from data_cache.fetch_binance_perp import fetch_perp_max
from data_cache.registry import MACRO_SOURCES, ONCHAIN_SOURCES
# Re-export the canonical CacheMiss from the top-level exceptions
# taxonomy so the symbol remains importable from data_cache without
# forcing callers to know about the new module layout.
from exceptions import CacheMiss  # noqa: F401  (re-exported)

# On-disk storage — resolves to cogochi-autoresearch/data_cache/cache/.
# This is gitignored. See cogochi-autoresearch/.gitignore handling in
# the repo-root .gitignore.
CACHE_DIR = Path(__file__).parent / "cache"

_SUPPORTED_TIMEFRAMES = frozenset({"1h"})


def cache_path(symbol: str, timeframe: str) -> Path:
    """Return the CSV path for (symbol, timeframe) — does NOT check existence."""
    return CACHE_DIR / f"{symbol}_{timeframe}.csv"


def perp_cache_path(symbol: str) -> Path:
    """Return the CSV path for a symbol's merged perp series."""
    return CACHE_DIR / f"{symbol}_perp.csv"


def _src_cache_path(cache_file: str, symbol: str = "") -> Path:
    """Resolve a DataSource.cache_file pattern to a Path."""
    return CACHE_DIR / cache_file.format(symbol=symbol)


def _read_csv_tz(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, index_col=0, parse_dates=True)
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    return df


# ─── Klines ──────────────────────────────────────────────────────────────────

def load_klines(
    symbol: str,
    timeframe: str = "1h",
    *,
    offline: bool = False,
) -> pd.DataFrame:
    """Load OHLCV klines for (symbol, timeframe) from the local cache.

    Behaviour:
      - cached           → read the CSV and return the DataFrame
      - not cached, offline=False → fetch from Binance, persist, return
      - not cached, offline=True  → raise CacheMiss
    """
    if timeframe not in _SUPPORTED_TIMEFRAMES:
        raise NotImplementedError(
            f"timeframe={timeframe!r} not supported yet; "
            f"only {sorted(_SUPPORTED_TIMEFRAMES)}"
        )
    path = cache_path(symbol, timeframe)
    if path.exists():
        return pd.read_csv(path, index_col="timestamp", parse_dates=True)
    if offline:
        raise CacheMiss(f"{symbol}_{timeframe} not cached at {path} and offline=True")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    df = fetch_klines_max(symbol, timeframe)
    df.to_csv(path)
    return df


# ─── Perp ────────────────────────────────────────────────────────────────────

def load_perp(
    symbol: str,
    *,
    offline: bool = False,
) -> pd.DataFrame | None:
    """Load merged perp series (funding, OI, LS ratio) from Binance FAPI.

    Returns None on cache miss with offline=True or on network failure.
    """
    path = perp_cache_path(symbol)
    if path.exists():
        return pd.read_csv(path, index_col=0, parse_dates=True)
    if offline:
        return None
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        df = fetch_perp_max(symbol)
    except Exception:
        return None
    df.to_csv(path)
    return df


# ─── Registry-driven bundle loaders ──────────────────────────────────────────

def load_macro_bundle(
    *,
    days: int = 365,
    offline: bool = False,
    refresh: bool = False,
) -> pd.DataFrame | None:
    """Load the merged macro bundle from all MACRO_SOURCES in the registry.

    Returns a daily-cadence DataFrame whose columns are the union of all
    registered macro source columns. Forward-filled up to 5 days so it can
    be reindexed onto any hourly klines DatetimeIndex.

    To add a new macro source: edit data_cache/registry.py only.

    Behaviour:
      - cached + not refresh  → read CSV and return
      - not cached or refresh → fetch every source, merge, persist, return
      - offline=True          → return None if not cached
    """
    # Use a single merged-bundle cache file
    path = CACHE_DIR / "macro_bundle.csv"

    if path.exists() and not refresh:
        return _read_csv_tz(path)
    if offline:
        return None

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    frames: list[pd.DataFrame] = []

    for src in MACRO_SOURCES:
        src_path = _src_cache_path(src.cache_file)
        if src_path.exists() and not refresh:
            print(f"  [macro] {src.name}: loading from cache")
            frames.append(_read_csv_tz(src_path))
            continue
        print(f"  [macro] {src.name}: fetching...")
        try:
            df = src.fetcher(days)
            if df is not None and not df.empty:
                df.to_csv(src_path)
                frames.append(df)
            else:
                print(f"  [macro] {src.name}: returned empty — using defaults")
        except Exception as e:
            print(f"  [macro] {src.name}: failed ({e}) — using defaults")

    if not frames:
        return None

    merged = frames[0]
    for df in frames[1:]:
        merged = merged.join(df, how="outer")

    merged = merged.sort_index().ffill(limit=5)
    merged.to_csv(path)
    return merged


def load_onchain_bundle(
    symbol: str,
    *,
    days: int = 365,
    offline: bool = False,
    refresh: bool = False,
) -> pd.DataFrame | None:
    """Load the merged on-chain bundle from all ONCHAIN_SOURCES in the registry.

    Returns a daily DataFrame whose columns are the union of all registered
    on-chain source columns for this symbol.

    To add a new on-chain source: edit data_cache/registry.py only.
    """
    path = CACHE_DIR / f"{symbol}_onchain_bundle.csv"

    if path.exists() and not refresh:
        return _read_csv_tz(path)
    if offline:
        return None

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    frames: list[pd.DataFrame] = []

    for src in ONCHAIN_SOURCES:
        src_path = _src_cache_path(src.cache_file, symbol=symbol)
        if src_path.exists() and not refresh:
            print(f"  [onchain] {src.name} ({symbol}): loading from cache")
            frames.append(_read_csv_tz(src_path))
            continue
        print(f"  [onchain] {src.name} ({symbol}): fetching...")
        try:
            df = src.fetcher(symbol, days)
            if df is not None and not df.empty:
                df.to_csv(src_path)
                frames.append(df)
            else:
                print(f"  [onchain] {src.name}: returned empty — using defaults")
        except Exception as e:
            print(f"  [onchain] {src.name}: failed ({e}) — using defaults")

    if not frames:
        return None

    merged = frames[0]
    for df in frames[1:]:
        merged = merged.join(df, how="outer")

    merged = merged.sort_index().ffill(limit=3)
    merged.to_csv(path)
    return merged
