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


def list_cached_symbols(*, require_perp: bool = False, timeframe: str = "1h") -> list[str]:
    """Return symbols that already have cached market data.

    Discovers symbols from the canonical cache search dirs. For now we only
    inventory the 1h base cache because higher timeframes are derived from it.
    """
    tf_string_to_minutes(timeframe)
    if timeframe != "1h":
        raise ValueError("list_cached_symbols currently supports timeframe='1h' only")

    symbols: set[str] = set()
    perp_symbols: set[str] = set()
    for base_dir in _cache_search_dirs():
        if not base_dir.exists():
            continue
        for path in base_dir.glob("*_1h.csv"):
            symbol = path.name.removesuffix("_1h.csv")
            if symbol:
                symbols.add(symbol)
        for path in base_dir.glob("*_perp.csv"):
            symbol = path.name.removesuffix("_perp.csv")
            if symbol:
                perp_symbols.add(symbol)
    ordered = sorted(symbols)
    if require_perp:
        ordered = [symbol for symbol in ordered if symbol in perp_symbols]
    return ordered


def cache_path(symbol: str, timeframe: str) -> Path:
    """Return the CSV path for (symbol, timeframe) — does NOT check existence."""
    return _primary_cache_dir() / f"{symbol}_{timeframe}.csv"


def list_cached_symbols(*, require_perp: bool = False) -> list[str]:
    """Return sorted list of symbols that have at least one cached 1h klines file.

    Args:
        require_perp: If True, only return symbols that also have a perp cache.
    """
    if not CACHE_DIR.exists():
        return []
    symbols = {
        p.stem[: -len("_1h")]
        for p in CACHE_DIR.glob("*_1h.csv")
        if p.stem.endswith("_1h")
    }
    if require_perp:
        symbols = {s for s in symbols if perp_cache_path(s).exists()}
    return sorted(symbols)


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


# ─── Klines ──────────────────────────────────────────────────────────────────

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

    if timeframe == "1h":
        path = _find_existing_cache_path(f"{symbol}_1h.csv")
        if path is not None:
            df = pd.read_csv(path, index_col="timestamp", parse_dates=True)
            if df.index.tz is None:
                df.index = df.index.tz_localize("UTC")
            return df
        if offline:
            expected = cache_path(symbol, "1h")
            raise CacheMiss(
                f"{symbol}_1h not cached under {_cache_search_dirs()} and offline=True (primary {expected})"
            )
        write_path = cache_path(symbol, "1h")
        write_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            df = fetch_klines_max(symbol, "1h")
        except RuntimeError as exc:
            spot_error = str(exc)
            if "Invalid symbol" not in spot_error and "no klines returned" not in spot_error:
                raise
            df = fetch_futures_klines_max(symbol, "1h")
        df.to_csv(write_path)
        return df

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

def load_perp(
    symbol: str,
    *,
    offline: bool = False,
) -> pd.DataFrame | None:
    """Load merged perp series (funding, OI, LS ratio) from Binance FAPI.

    Returns None on cache miss with offline=True or on network failure.
    """
    path = perp_cache_path(symbol)
    existing = _find_existing_cache_path(f"{symbol}_perp.csv")
    if existing is not None:
        path = existing
        df = pd.read_csv(path, index_col=0, parse_dates=[0])
        df.index = pd.to_datetime(df.index, utc=True, format="mixed")
        return df
    if offline:
        return None
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
