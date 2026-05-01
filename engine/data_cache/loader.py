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

import os
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

_SUPPORTED_TIMEFRAMES = SUPPORTED_TF_STRINGS
_CANONICAL_HOURLY_TIMEFRAME = "1h"


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _resolve_git_worktree_shared_cache_dir() -> Path | None:
    git_meta = _repo_root() / ".git"
    if not git_meta.is_file():
        return None
    try:
        payload = git_meta.read_text().strip()
    except OSError:
        return None
    prefix = "gitdir:"
    if not payload.startswith(prefix):
        return None
    gitdir = Path(payload[len(prefix):].strip())
    if not gitdir.is_absolute():
        gitdir = (_repo_root() / gitdir).resolve()
    if gitdir.parent.name != "worktrees":
        return None
    common_git_dir = gitdir.parent.parent
    main_root = common_git_dir.parent
    shared_cache_dir = main_root / "engine" / "data_cache" / "cache"
    if shared_cache_dir == CACHE_DIR:
        return None
    return shared_cache_dir


def _configured_shared_cache_dir() -> Path | None:
    override = os.getenv("WTD_SHARED_CACHE_DIR")
    if override:
        return Path(override).expanduser()
    if CACHE_DIR != Path(__file__).parent / "cache":
        return None
    return _resolve_git_worktree_shared_cache_dir()


def _primary_cache_dir() -> Path:
    return _configured_shared_cache_dir() or CACHE_DIR


def _cache_search_dirs() -> list[Path]:
    candidates = [_primary_cache_dir(), CACHE_DIR]
    unique: list[Path] = []
    for path in candidates:
        if path not in unique:
            unique.append(path)
    return unique


def _find_existing_cache_path(filename: str) -> Path | None:
    for base_dir in _cache_search_dirs():
        path = base_dir / filename
        if path.exists():
            return path
    return None


def cache_path(symbol: str, timeframe: str) -> Path:
    """Return the CSV path for (symbol, timeframe) — does NOT check existence."""
    return _primary_cache_dir() / f"{symbol}_{timeframe}.csv"


def perp_cache_path(symbol: str) -> Path:
    """Return the CSV path for a symbol's merged perp series."""
    return _primary_cache_dir() / f"{symbol}_perp.csv"


def _src_cache_path(cache_file: str, symbol: str = "") -> Path:
    """Resolve a DataSource.cache_file pattern to a Path."""
    return _primary_cache_dir() / cache_file.format(symbol=symbol)


def _find_existing_src_cache_path(cache_file: str, symbol: str = "") -> Path | None:
    return _find_existing_cache_path(cache_file.format(symbol=symbol))


def _read_csv_tz(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, index_col=0, parse_dates=True)
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    return df


def _read_klines_cache(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, index_col="timestamp", parse_dates=True)
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    return df


def _fetch_and_cache_klines(symbol: str, timeframe: str, path: Path) -> pd.DataFrame:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        df = fetch_klines_max(symbol, timeframe)
    except RuntimeError as exc:
        spot_error = str(exc)
        if "Invalid symbol" not in spot_error and "no klines returned" not in spot_error:
            raise
        df = fetch_futures_klines_max(symbol, timeframe)
    df.to_csv(path)
    return df


# ─── Klines ──────────────────────────────────────────────────────────────────

def _load_klines_from_market_data(symbol: str, timeframe: str = "1h") -> pd.DataFrame | None:
    """Load klines from new market_data/ohlcv/ parquet files."""
    ohlcv_dir = Path(__file__).parent / "market_data" / "ohlcv"
    path = ohlcv_dir / f"{symbol}_{timeframe}.parquet"
    if not path.exists():
        return None
    try:
        df = pd.read_parquet(path)
        df["ts"] = pd.to_datetime(df["ts"], utc=True)
        df = df.set_index("ts").sort_index()
        df.index.name = "timestamp"
        # Rename taker_buy_vol to the name feature_calc expects
        if "taker_buy_vol" in df.columns:
            df = df.rename(columns={"taker_buy_vol": "taker_buy_base_volume"})
        return df[["open", "high", "low", "close", "volume", "taker_buy_base_volume"]]
    except Exception:
        return None


_STALE_THRESHOLD_HOURS = 2


def _extend_klines_to_now(df: pd.DataFrame, symbol: str, timeframe: str) -> pd.DataFrame:
    """Append recent Binance bars when parquet data is more than 2 hours stale."""
    from datetime import datetime, timezone, timedelta

    if df.empty:
        return df

    last_ts = df.index[-1]
    if hasattr(last_ts, "tzinfo") and last_ts.tzinfo is None:
        last_ts = last_ts.tz_localize("UTC")
    gap_hours = (datetime.now(timezone.utc) - last_ts).total_seconds() / 3600
    if gap_hours <= _STALE_THRESHOLD_HOURS:
        return df

    # Fetch only the bars needed to fill the gap (max 200 bars)
    limit = min(int(gap_hours) + 2, 200)
    try:
        from data_cache.fetch_binance import _fetch_batch
        import json, time as _time

        end_ms = int((last_ts.timestamp() + gap_hours * 3600 + 3600) * 1000)
        start_ms = int(last_ts.timestamp() * 1000) + 1
        batch = _fetch_batch(symbol, timeframe, end_ms)
        if not batch:
            return df

        import pandas as _pd
        recent = _pd.DataFrame(
            batch,
            columns=[
                "open_time", "open", "high", "low", "close", "volume",
                "close_time", "quote_volume", "trades",
                "taker_buy_base_volume", "taker_buy_quote_volume", "ignore",
            ],
        )
        for col in ["open", "high", "low", "close", "volume", "taker_buy_base_volume"]:
            recent[col] = recent[col].astype(float)
        recent["timestamp"] = _pd.to_datetime(recent["open_time"], unit="ms", utc=True)
        recent = recent.set_index("timestamp")
        recent.index.name = "timestamp"
        # Keep only rows newer than last parquet row
        recent = recent[recent.index > last_ts]
        if recent.empty:
            return df
        shared_cols = [c for c in ["open", "high", "low", "close", "volume", "taker_buy_base_volume"] if c in df.columns]
        return pd.concat([df, recent[shared_cols]]).sort_index()
    except Exception:
        return df


def load_klines(
    symbol: str,
    timeframe: str = "1h",
    *,
    offline: bool = False,
) -> pd.DataFrame:
    """Load OHLCV klines for (symbol, timeframe).

    `1h` is the canonical cached base timeframe for higher-timeframe research.
    Higher timeframes are derived on the fly by resampling the 1h base:

        load_klines("BTCUSDT", "4h")   →  loads 1h CSV, resamples to 4h
        load_klines("BTCUSDT", "1d")   →  loads 1h CSV, resamples to 1d

    Sub-hour timeframes (`15m`, `30m`, ...) must be loaded from their own
    native cache or fetched directly. They are never synthesized from 1h
    because that would fabricate intraday structure.

    Behaviour:
      - cached native timeframe → read the CSV and return
      - cached 1h + higher TF   → read 1h CSV and resample upward
      - not cached, offline=False → fetch from Binance, persist requested/native TF, return
      - not cached, offline=True  → raise CacheMiss
      - unknown timeframe string  → raise ValueError (from tf_string_to_minutes)
    """
    # Validate the timeframe string early; unknown values raise ValueError.
    tf_min = tf_string_to_minutes(timeframe)

    if timeframe == _CANONICAL_HOURLY_TIMEFRAME:
        # Prefer new market_data parquet (full history) over legacy CSV
        md_df = _load_klines_from_market_data(symbol, timeframe)
        if md_df is not None and len(md_df) > 500:
            if not offline:
                md_df = _extend_klines_to_now(md_df, symbol, timeframe)
            return md_df
        path = cache_path(symbol, _CANONICAL_HOURLY_TIMEFRAME)
        if path.exists():
            return _read_klines_cache(path)
        if offline:
            raise CacheMiss(
                f"{symbol}_{_CANONICAL_HOURLY_TIMEFRAME} not cached at {path} and offline=True"
            )
        return _fetch_and_cache_klines(symbol, _CANONICAL_HOURLY_TIMEFRAME, path)

    if tf_min < tf_string_to_minutes(_CANONICAL_HOURLY_TIMEFRAME):
        path = cache_path(symbol, timeframe)
        if path.exists():
            return _read_klines_cache(path)
        if offline:
            raise CacheMiss(
                f"{symbol}_{timeframe} not cached at {path} and offline=True"
            )
        return _fetch_and_cache_klines(symbol, timeframe, path)

    # ── Higher-than-1h: resample from the 1h base on the fly ──────────────
    df_1h = load_klines(symbol, _CANONICAL_HOURLY_TIMEFRAME, offline=offline)
    return resample_klines(df_1h, tf_min)


# ─── Perp ────────────────────────────────────────────────────────────────────

def _load_perp_from_market_data(symbol: str) -> pd.DataFrame | None:
    """Build perp DataFrame from new market_data/derivatives/ parquet files.

    Merges OI, funding, and long/short ratio into the format expected by
    compute_features_table(). Returns None if OI parquet is missing.
    """
    deriv_dir = Path(__file__).parent / "market_data" / "derivatives"
    oi_path = deriv_dir / f"{symbol}_oi.parquet"
    if not oi_path.exists():
        return None

    try:
        oi_df = pd.read_parquet(oi_path)
        oi_df["ts"] = pd.to_datetime(oi_df["ts"], utc=True)
        oi_df = oi_df.set_index("ts").sort_index()

        # oi_usd → oi_raw, oi_change_1h, oi_change_24h
        oi_df = oi_df.rename(columns={"oi_usd": "oi_raw"})
        oi_df["oi_change_1h"] = oi_df["oi_raw"].pct_change(1).fillna(0.0)
        oi_df["oi_change_24h"] = oi_df["oi_raw"].pct_change(24).fillna(0.0)

        # Funding
        funding_path = deriv_dir / f"{symbol}_funding.parquet"
        if funding_path.exists():
            fr_df = pd.read_parquet(funding_path)
            fr_df["ts"] = pd.to_datetime(fr_df["ts"], utc=True)
            fr_df = fr_df.set_index("ts").sort_index()
            rate_col = next((c for c in fr_df.columns if "rate" in c.lower() or "funding" in c.lower()), None)
            if rate_col:
                oi_df["funding_rate"] = fr_df[rate_col].reindex(oi_df.index, method="ffill").fillna(0.0)
            else:
                oi_df["funding_rate"] = 0.0
        else:
            oi_df["funding_rate"] = 0.0

        # Long/short ratio
        ls_path = deriv_dir / f"{symbol}_longshort.parquet"
        if ls_path.exists():
            ls_df = pd.read_parquet(ls_path)
            ls_df["ts"] = pd.to_datetime(ls_df["ts"], utc=True)
            ls_df = ls_df.set_index("ts").sort_index()
            if "long_ratio" in ls_df.columns:
                short_col = ls_df.get("short_ratio", 1.0 - ls_df["long_ratio"])
                oi_df["long_short_ratio"] = (ls_df["long_ratio"].reindex(oi_df.index, method="ffill") /
                                              short_col.reindex(oi_df.index, method="ffill").replace(0, 0.001)).fillna(1.0)
            else:
                oi_df["long_short_ratio"] = 1.0
        else:
            oi_df["long_short_ratio"] = 1.0

        return oi_df[["oi_raw", "oi_change_1h", "oi_change_24h", "funding_rate", "long_short_ratio"]]

    except Exception:
        return None


def load_perp(
    symbol: str,
    *,
    offline: bool = False,
) -> pd.DataFrame | None:
    """Load merged perp series (funding, OI, LS ratio).

    Priority:
    1. market_data/derivatives/ parquet (1-year OI history, collected yesterday)
    2. Legacy {symbol}_perp.csv in cache dir (28-day Binance FAPI)
    3. Fetch from Binance FAPI if online
    """
    # 1. Try new market_data parquet (1 year of OI history)
    market_df = _load_perp_from_market_data(symbol)
    if market_df is not None and len(market_df) > 100:
        return market_df

    # 2. Fall back to legacy perp CSV
    existing = _find_existing_cache_path(f"{symbol}_perp.csv")
    if existing is not None:
        df = pd.read_csv(existing, index_col=0, parse_dates=[0])
        df.index = pd.to_datetime(df.index, utc=True, format="mixed")
        return df

    if offline:
        return None

    # 3. Fetch from Binance FAPI
    path = perp_cache_path(symbol)
    path.parent.mkdir(parents=True, exist_ok=True)
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
    path = _find_existing_cache_path("macro_bundle.csv") or (cache_path("macro_bundle", "").parent / "macro_bundle.csv")

    if path.exists() and not refresh:
        return _read_csv_tz(path)
    if offline:
        return None

    path.parent.mkdir(parents=True, exist_ok=True)
    frames: list[pd.DataFrame] = []

    for src in MACRO_SOURCES:
        src_path = _find_existing_src_cache_path(src.cache_file) or _src_cache_path(src.cache_file)
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
    path = _find_existing_cache_path(f"{symbol}_onchain_bundle.csv") or (cache_path(symbol, "onchain_bundle").parent / f"{symbol}_onchain_bundle.csv")

    if path.exists() and not refresh:
        return _read_csv_tz(path)
    if offline:
        return None

    path.parent.mkdir(parents=True, exist_ok=True)
    frames: list[pd.DataFrame] = []

    for src in ONCHAIN_SOURCES:
        src_path = _find_existing_src_cache_path(src.cache_file, symbol=symbol) or _src_cache_path(src.cache_file, symbol=symbol)
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
    path = _find_existing_cache_path(f"{symbol}_dex_bundle.csv") or (cache_path(symbol, "dex_bundle").parent / f"{symbol}_dex_bundle.csv")

    if path.exists() and not refresh:
        return _read_csv_tz(path)
    if offline:
        return None

    path.parent.mkdir(parents=True, exist_ok=True)
    frames: list[pd.DataFrame] = []

    for src in DEX_SOURCES:
        src_path = _find_existing_src_cache_path(src.cache_file, symbol=symbol) or _src_cache_path(src.cache_file, symbol=symbol)
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
    path = _find_existing_cache_path(f"{symbol}_chain_bundle.csv") or (cache_path(symbol, "chain_bundle").parent / f"{symbol}_chain_bundle.csv")

    if path.exists() and not refresh:
        return _read_csv_tz(path)
    if offline:
        return None

    path.parent.mkdir(parents=True, exist_ok=True)
    frames: list[pd.DataFrame] = []

    for src in CHAIN_SOURCES:
        src_path = _find_existing_src_cache_path(src.cache_file, symbol=symbol) or _src_cache_path(src.cache_file, symbol=symbol)
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


# ─── Symbol discovery ─────────────────────────────────────────────────────────

def list_cached_symbols(*, require_perp: bool = True) -> list[str]:
    """Return all symbols that have a 1h klines CSV in the cache directory.

    Args:
        require_perp: if True (default), only return symbols that also have a
            perp CSV (i.e. futures symbols). If False, return all symbols with
            a 1h CSV regardless of perp availability.
    """
    search_dir = _primary_cache_dir()
    if not search_dir.exists():
        return []
    symbols = []
    for path in sorted(search_dir.glob("*_1h.csv")):
        symbol = path.stem.removesuffix("_1h")
        if require_perp and not perp_cache_path(symbol).exists():
            continue
        symbols.append(symbol)
    return symbols
