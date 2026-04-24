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
from data_cache.fetch_binance_perp import fetch_futures_klines_max, fetch_perp_max
from data_cache.registry import MACRO_SOURCES, ONCHAIN_SOURCES, DEX_SOURCES, CHAIN_SOURCES
from data_cache.resample import (  # noqa: F401  (re-exported)
    SUPPORTED_TF_STRINGS,
    resample_klines,
    tf_string_to_minutes,
)
# Re-export the canonical CacheMiss from the top-level exceptions
# taxonomy so the symbol remains importable from data_cache without
# forcing callers to know about the new module layout.
from exceptions import CacheMiss  # noqa: F401  (re-exported)

# On-disk storage — resolves to cogochi-autoresearch/data_cache/cache/.
# This is gitignored. See cogochi-autoresearch/.gitignore handling in
# the repo-root .gitignore.
CACHE_DIR = Path(__file__).parent / "cache"

# 1-hour bars remain the canonical base for higher-timeframe resamples.
# Sub-hour bars (1m/3m/5m/15m/30m) can also be stored on disk directly so
# operational search lanes can accumulate real 15m structure instead of
# upsampling 1h bars.
_SUPPORTED_TIMEFRAMES = SUPPORTED_TF_STRINGS


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
    """Load OHLCV klines for (symbol, timeframe).

    1-hour klines remain the canonical base for higher-timeframe resampling.
    Sub-hour timeframes are stored natively on disk when requested.

    Higher timeframes are derived on the fly by resampling the 1h base:

        load_klines("BTCUSDT", "4h")   →  loads 1h CSV, resamples to 4h
        load_klines("BTCUSDT", "1d")   →  loads 1h CSV, resamples to 1d

    Lower timeframes use their own cache/fetch path:

        load_klines("BTCUSDT", "15m")  →  reads `BTCUSDT_15m.csv` or fetches 15m bars

    Behaviour:
      - cached requested TF       → read the CSV and return
      - sub-hour miss + offline=False → fetch requested TF, persist, return
      - higher-TF miss + offline=False → fetch/read 1h base, resample, return
      - not cached, offline=True  → raise CacheMiss
      - unknown timeframe string  → raise ValueError (from tf_string_to_minutes)
    """
    # Validate the timeframe string early; unknown values raise ValueError.
    tf_min = tf_string_to_minutes(timeframe)

    if tf_min < 60:
        path = cache_path(symbol, timeframe)
        if path.exists():
            df = pd.read_csv(path, index_col="timestamp", parse_dates=True)
            if df.index.tz is None:
                df.index = df.index.tz_localize("UTC")
            return df
        if offline:
            raise CacheMiss(
                f"{symbol}_{timeframe} not cached at {path} and offline=True"
            )
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        try:
            df = fetch_klines_max(symbol, timeframe)
        except RuntimeError as exc:
            spot_error = str(exc)
            if "Invalid symbol" not in spot_error and "no klines returned" not in spot_error:
                raise
            df = fetch_futures_klines_max(symbol, timeframe)
        df.to_csv(path)
        return df

    if timeframe == "1h":
        path = cache_path(symbol, "1h")
        if path.exists():
            df = pd.read_csv(path, index_col="timestamp", parse_dates=True)
            if df.index.tz is None:
                df.index = df.index.tz_localize("UTC")
            return df
        if offline:
            raise CacheMiss(
                f"{symbol}_1h not cached at {path} and offline=True"
            )
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        try:
            df = fetch_klines_max(symbol, "1h")
        except RuntimeError as exc:
            spot_error = str(exc)
            if "Invalid symbol" not in spot_error and "no klines returned" not in spot_error:
                raise
            df = fetch_futures_klines_max(symbol, "1h")
        df.to_csv(path)
        return df

    # ── Higher-than-1h: resample from the 1h base on the fly ─────────────
    df_1h = load_klines(symbol, "1h", offline=offline)
    return resample_klines(df_1h, tf_min)


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
        df = pd.read_csv(path, index_col=0, parse_dates=[0])
        df.index = pd.to_datetime(df.index, utc=True, format="mixed")
        return df
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


def load_dex_bundle(
    symbol: str,
    *,
    days: int = 30,
    offline: bool = False,
    refresh: bool = False,
) -> pd.DataFrame | None:
    """Load DEX market data bundle from all DEX_SOURCES in the registry.

    Snapshot-based: DexScreener provides current-state data only.
    Each call appends today's snapshot to the per-symbol CSV, building
    a rolling history over time (same accumulation pattern as social fetchers).

    To add a new DEX source: edit data_cache/registry.py DEX_SOURCES only.

    Returns:
        Daily DataFrame with dex_* columns, or None if all sources fail.
    """
    path = CACHE_DIR / f"{symbol}_dex_bundle.csv"

    if path.exists() and not refresh:
        return _read_csv_tz(path)
    if offline:
        return None

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    frames: list[pd.DataFrame] = []

    for src in DEX_SOURCES:
        src_path = _src_cache_path(src.cache_file, symbol=symbol)
        if src_path.exists() and not refresh:
            print(f"  [dex] {src.name} ({symbol}): loading from cache")
            frames.append(_read_csv_tz(src_path))
            continue
        print(f"  [dex] {src.name} ({symbol}): fetching...")
        try:
            df = src.fetcher(symbol, days)
            if df is not None and not df.empty:
                df.to_csv(src_path)
                frames.append(df)
            else:
                print(f"  [dex] {src.name}: returned empty — using defaults")
        except Exception as e:
            print(f"  [dex] {src.name}: failed ({e}) — using defaults")

    if not frames:
        return None

    merged = frames[0]
    for df in frames[1:]:
        merged = merged.join(df, how="outer")

    merged = merged.sort_index().ffill(limit=2)
    merged.to_csv(path)
    return merged


def load_chain_bundle(
    symbol: str,
    *,
    days: int = 30,
    offline: bool = False,
    refresh: bool = False,
) -> pd.DataFrame | None:
    """Load on-chain holder/wallet data from all CHAIN_SOURCES in the registry.

    Requires BSCSCAN_API_KEY or ETHERSCAN_API_KEY. Gracefully returns None
    if no key is configured (CHAIN_SOURCES skip silently).

    To add a new chain source: edit data_cache/registry.py CHAIN_SOURCES only.
    """
    path = CACHE_DIR / f"{symbol}_chain_bundle.csv"

    if path.exists() and not refresh:
        return _read_csv_tz(path)
    if offline:
        return None

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    frames: list[pd.DataFrame] = []

    for src in CHAIN_SOURCES:
        src_path = _src_cache_path(src.cache_file, symbol=symbol)
        if src_path.exists() and not refresh:
            print(f"  [chain] {src.name} ({symbol}): loading from cache")
            frames.append(_read_csv_tz(src_path))
            continue
        print(f"  [chain] {src.name} ({symbol}): fetching...")
        try:
            df = src.fetcher(symbol, days)
            if df is not None and not df.empty:
                df.to_csv(src_path)
                frames.append(df)
            else:
                print(f"  [chain] {src.name}: no data (no API key or unknown address)")
        except Exception as e:
            print(f"  [chain] {src.name}: failed ({e}) — skipping")

    if not frames:
        return None

    merged = frames[0]
    for df in frames[1:]:
        merged = merged.join(df, how="outer")

    merged = merged.sort_index().ffill(limit=7)
    merged.to_csv(path)
    return merged
