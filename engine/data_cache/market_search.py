"""Query-driven market resolver for contract/symbol raw ingestion."""
from __future__ import annotations

import argparse
import json
import re
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from threading import Event, Lock

from cache.market_search_cache import (
    acquire_shared_query_build_lock,
    bump_shared_search_generation,
    read_shared_search_results,
    release_shared_query_build_lock,
    wait_for_shared_search_results,
    write_shared_search_results,
)
from data_cache.fetch_alpha_universe import ALPHA_WATCHLIST, fetch_futures_symbols
from data_cache.fetch_dexscreener import (
    TOKEN_ADDRESS_MAP,
    fetch_dex_boosted_tokens,
    fetch_dex_community_takeovers,
    fetch_dex_latest_profiles,
    fetch_dex_search_pairs,
    fetch_dex_token_batch,
)
from data_cache.raw_ingest import ingest_binance_symbol_raw
from data_cache.raw_store import (
    DEFAULT_DB_PATH,
    CanonicalRawStore,
    MarketSearchIndexRecord,
)

_PREFERRED_CHAINS = ("bsc", "ethereum", "base")
_STABLE_QUOTES = {"USDT", "USDC", "BUSD"}
_ADDRESS_RE = re.compile(r"0x[a-fA-F0-9]{8,}$")
_QUOTE_SUFFIXES = ("USDT", "USDC", "BUSD", "PERP")
_GRADE_RANK = {"A": 0, "B": 1, None: 2}
_SEARCH_CACHE_TTL_SECONDS = 15.0
_SEARCH_CACHE_MAX_ENTRIES = 256
_SEARCH_BUILD_WAIT_SECONDS = 0.6
_search_result_cache: dict[
    tuple[str, str, int, bool],
    tuple[float, tuple[MarketSearchCandidate, ...]],
] = {}
_search_result_cache_lock = Lock()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _clean_query(query: str) -> str:
    return query.strip()


def _normalize_search_text(value: str) -> str:
    return "".join(ch for ch in value.upper() if ch.isalnum())


def _normalize_base_symbol(query: str) -> str:
    symbol = _normalize_search_text(_clean_query(query))
    for suffix in _QUOTE_SUFFIXES:
        if symbol.endswith(suffix):
            return symbol[: -len(suffix)]
    return symbol


def _is_contract_query(query: str) -> bool:
    return bool(_ADDRESS_RE.fullmatch(_clean_query(query)))


def _normalize_cache_query(query: str) -> str:
    if _is_contract_query(query):
        return _clean_query(query).lower()
    return _normalize_base_symbol(query)


def _chain_rank(chain: str) -> int:
    try:
        return _PREFERRED_CHAINS.index(chain)
    except ValueError:
        return len(_PREFERRED_CHAINS)


def _stable_quote_rank(quote_symbol: str) -> int:
    return 0 if quote_symbol in _STABLE_QUOTES or not quote_symbol else 1


def _source_rank(source: str, futures_listed: bool) -> int:
    if source == "direct" and futures_listed:
        return 0
    if futures_listed:
        return 1
    if source == "watchlist":
        return 2
    return 3


@dataclass(frozen=True)
class MarketSearchCandidate:
    query: str
    provider: str
    source: str
    chain: str
    base_symbol: str
    base_name: str
    quote_symbol: str
    canonical_symbol: str
    token_address: str
    pair_address: str
    liquidity_usd: float
    volume_h24: float
    price_change_h24: float
    futures_listed: bool
    watchlist_grade: str | None
    note: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class MarketSearchIndexRefreshResult:
    row_count: int
    refreshed_at: str
    db_path: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class MarketSearchIndexStatus:
    row_count: int
    updated_at: str | None
    ready: bool

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class MarketQueryIngestionResult:
    query: str
    selected_candidate: dict[str, object]
    failed_candidates: list[dict[str, str]]
    raw_result: dict[str, object]

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass
class _SearchBuildState:
    event: Event
    result: list[MarketSearchCandidate] | None = None
    error: Exception | None = None


_inflight_search_builds: dict[tuple[str, str, int, bool], _SearchBuildState] = {}
_inflight_search_builds_lock = Lock()


def _search_cache_key(
    query: str,
    *,
    limit: int,
    allow_live_fallback: bool,
    store: CanonicalRawStore,
) -> tuple[str, str, int, bool]:
    return (str(store.db_path), _normalize_cache_query(query), limit, allow_live_fallback)


def _increment_metric(name: str, value: int = 1) -> None:
    from observability.metrics import increment

    increment(name, value)


def _observe_search_path(path: str, *, started_at: float) -> None:
    from observability.metrics import observe_ms

    elapsed_ms = (time.perf_counter() - started_at) * 1000.0
    _increment_metric(f"search.market.path.{path}")
    observe_ms("search.market.total_ms", elapsed_ms)
    observe_ms(f"search.market.path.{path}_ms", elapsed_ms)


def _get_cached_search_results(
    cache_key: tuple[str, str, int, bool],
) -> list[MarketSearchCandidate] | None:
    now = time.monotonic()
    with _search_result_cache_lock:
        cached = _search_result_cache.get(cache_key)
        if cached is None:
            return None
        cached_at, results = cached
        if now - cached_at > _SEARCH_CACHE_TTL_SECONDS:
            _search_result_cache.pop(cache_key, None)
            return None
        _search_result_cache.pop(cache_key)
        _search_result_cache[cache_key] = (cached_at, results)
    return list(results)


def _put_cached_search_results(
    cache_key: tuple[str, str, int, bool],
    results: list[MarketSearchCandidate],
) -> None:
    with _search_result_cache_lock:
        _search_result_cache[cache_key] = (time.monotonic(), tuple(results))
        while len(_search_result_cache) > _SEARCH_CACHE_MAX_ENTRIES:
            _search_result_cache.pop(next(iter(_search_result_cache)))


def _clear_search_result_cache(*, db_path: str | None = None) -> None:
    with _search_result_cache_lock:
        if db_path is None:
            _search_result_cache.clear()
            return
        stale_keys = [key for key in _search_result_cache if key[0] == db_path]
        for key in stale_keys:
            _search_result_cache.pop(key, None)


def _begin_local_search_build(
    cache_key: tuple[str, str, int, bool],
) -> tuple[bool, _SearchBuildState]:
    with _inflight_search_builds_lock:
        state = _inflight_search_builds.get(cache_key)
        if state is not None:
            return False, state
        state = _SearchBuildState(event=Event())
        _inflight_search_builds[cache_key] = state
        return True, state


def _finish_local_search_build(
    cache_key: tuple[str, str, int, bool],
    state: _SearchBuildState,
    *,
    result: list[MarketSearchCandidate] | None,
    error: Exception | None,
) -> None:
    state.result = list(result) if result is not None else None
    state.error = error
    state.event.set()
    with _inflight_search_builds_lock:
        if _inflight_search_builds.get(cache_key) is state:
            _inflight_search_builds.pop(cache_key, None)


def _candidate_from_payload(payload: dict[str, object], *, query: str) -> MarketSearchCandidate:
    data = dict(payload)
    data["query"] = query
    return MarketSearchCandidate(**data)


def _direct_candidate(query: str, futures_symbols: set[str]) -> MarketSearchCandidate | None:
    base_symbol = _normalize_base_symbol(query)
    if not base_symbol:
        return None
    canonical_symbol = f"{base_symbol}USDT"
    watchlist_entry = ALPHA_WATCHLIST.get(base_symbol)
    futures_listed = canonical_symbol in futures_symbols
    if watchlist_entry is None and not futures_listed:
        return None
    source = "direct" if futures_listed else "watchlist"
    return MarketSearchCandidate(
        query=query,
        provider="binance",
        source=source,
        chain=watchlist_entry.get("chain", "") if watchlist_entry else "",
        base_symbol=base_symbol,
        base_name=base_symbol,
        quote_symbol="USDT",
        canonical_symbol=canonical_symbol,
        token_address="",
        pair_address="",
        liquidity_usd=0.0,
        volume_h24=0.0,
        price_change_h24=0.0,
        futures_listed=futures_listed,
        watchlist_grade=watchlist_entry.get("grade") if watchlist_entry else None,
        note=watchlist_entry.get("note", "") if watchlist_entry else "",
    )


def _search_pairs_live(query: str) -> list[dict]:
    if _is_contract_query(query):
        address = _clean_query(query)
        pairs: list[dict] = []
        for chain in _PREFERRED_CHAINS:
            pairs.extend(fetch_dex_token_batch([address], chain=chain))
        if pairs:
            return pairs
    return fetch_dex_search_pairs(query, chains=tuple(_PREFERRED_CHAINS))


def _pair_to_candidate(
    *,
    query: str,
    pair: dict,
    futures_symbols: set[str],
    source: str,
) -> MarketSearchCandidate | None:
    base_token = pair.get("baseToken") or {}
    quote_token = pair.get("quoteToken") or {}
    base_symbol = str(base_token.get("symbol") or "").upper()
    if not base_symbol:
        return None
    quote_symbol = str(quote_token.get("symbol") or "").upper()
    canonical_symbol = f"{base_symbol}USDT"
    watchlist_entry = ALPHA_WATCHLIST.get(base_symbol)
    volume = pair.get("volume") or {}
    liquidity = pair.get("liquidity") or {}
    price_change = pair.get("priceChange") or {}
    base_name = str(base_token.get("name") or base_symbol)
    return MarketSearchCandidate(
        query=query,
        provider="dexscreener",
        source=source,
        chain=str(pair.get("chainId") or ""),
        base_symbol=base_symbol,
        base_name=base_name,
        quote_symbol=quote_symbol,
        canonical_symbol=canonical_symbol,
        token_address=str(base_token.get("address") or "").lower(),
        pair_address=str(pair.get("pairAddress") or "").lower(),
        liquidity_usd=float(liquidity.get("usd") or 0.0),
        volume_h24=float(volume.get("h24") or 0.0),
        price_change_h24=float(price_change.get("h24") or 0.0),
        futures_listed=canonical_symbol in futures_symbols,
        watchlist_grade=watchlist_entry.get("grade") if watchlist_entry else None,
        note=watchlist_entry.get("note", "") if watchlist_entry else "",
    )


def _candidate_key(candidate: MarketSearchCandidate) -> tuple[str, str, str, str, str, str]:
    return (
        candidate.provider,
        candidate.source,
        candidate.chain,
        candidate.canonical_symbol,
        candidate.token_address,
        candidate.pair_address,
    )


def _candidate_sort_key(candidate: MarketSearchCandidate) -> tuple[object, ...]:
    return (
        _source_rank(candidate.source, candidate.futures_listed),
        _GRADE_RANK.get(candidate.watchlist_grade, 2),
        _stable_quote_rank(candidate.quote_symbol),
        _chain_rank(candidate.chain),
        -candidate.liquidity_usd,
        -candidate.volume_h24,
        candidate.base_symbol,
    )


def _candidate_to_index_record(
    candidate: MarketSearchCandidate,
    *,
    refreshed_at: datetime,
) -> MarketSearchIndexRecord:
    return MarketSearchIndexRecord(
        provider=candidate.provider,
        source=candidate.source,
        chain=candidate.chain,
        chain_rank=_chain_rank(candidate.chain),
        source_rank=_source_rank(candidate.source, candidate.futures_listed),
        stable_quote_rank=_stable_quote_rank(candidate.quote_symbol),
        watchlist_rank=_GRADE_RANK.get(candidate.watchlist_grade, 2),
        base_symbol=_normalize_search_text(candidate.base_symbol),
        base_name=_normalize_search_text(candidate.base_name),
        quote_symbol=_normalize_search_text(candidate.quote_symbol),
        canonical_symbol=_normalize_search_text(candidate.canonical_symbol),
        token_address=candidate.token_address.lower(),
        pair_address=candidate.pair_address.lower(),
        futures_listed=bool(candidate.futures_listed),
        watchlist_grade=candidate.watchlist_grade,
        note=candidate.note,
        liquidity_usd=float(candidate.liquidity_usd),
        volume_h24=float(candidate.volume_h24),
        price_change_h24=float(candidate.price_change_h24),
        refreshed_at=refreshed_at,
    )


def _row_to_candidate(row: dict | object, *, query: str) -> MarketSearchCandidate:
    return MarketSearchCandidate(
        query=query,
        provider=str(row["provider"]),
        source=str(row["source"]),
        chain=str(row["chain"]),
        base_symbol=str(row["base_symbol"]),
        base_name=str(row["base_name"]),
        quote_symbol=str(row["quote_symbol"]),
        canonical_symbol=str(row["canonical_symbol"]),
        token_address=str(row["token_address"]),
        pair_address=str(row["pair_address"]),
        liquidity_usd=float(row["liquidity_usd"]),
        volume_h24=float(row["volume_h24"]),
        price_change_h24=float(row["price_change_h24"]),
        futures_listed=bool(row["futures_listed"]),
        watchlist_grade=row["watchlist_grade"],
        note=str(row["note"]),
    )


def _live_search_market_candidates(
    query: str,
    *,
    limit: int,
    futures_symbols: set[str],
) -> list[MarketSearchCandidate]:
    candidates: list[MarketSearchCandidate] = []
    direct = _direct_candidate(query, futures_symbols)
    if direct is not None:
        candidates.append(direct)

    seen = {_candidate_key(candidate) for candidate in candidates}
    source = "contract" if _is_contract_query(query) else "search"
    for pair in _search_pairs_live(query):
        candidate = _pair_to_candidate(
            query=query,
            pair=pair,
            futures_symbols=futures_symbols,
            source=source,
        )
        if candidate is None:
            continue
        key = _candidate_key(candidate)
        if key in seen:
            continue
        seen.add(key)
        candidates.append(candidate)

    candidates.sort(key=_candidate_sort_key)
    return candidates[:limit]


def _search_market_candidates_from_index(
    query: str,
    *,
    limit: int,
    store: CanonicalRawStore,
) -> list[MarketSearchCandidate]:
    normalized_query = _normalize_base_symbol(query)
    if not normalized_query and not _is_contract_query(query):
        return []
    contract_query = _clean_query(query).lower() if _is_contract_query(query) else None
    canonical_query = f"{normalized_query}USDT" if normalized_query else ""
    rows = store.search_market_index(
        normalized_query=normalized_query,
        canonical_query=canonical_query,
        contract_query=contract_query,
        limit=limit,
    )
    return [_row_to_candidate(row, query=query) for row in rows]


def _discover_dex_pairs() -> list[dict]:
    addresses_by_chain: dict[str, set[str]] = {chain: set() for chain in _PREFERRED_CHAINS}
    for item in TOKEN_ADDRESS_MAP.values():
        chain = str(item.get("chain") or "")
        address = str(item.get("address") or "").lower()
        if chain in addresses_by_chain and address:
            addresses_by_chain[chain].add(address)
    for chain in _PREFERRED_CHAINS:
        for item in fetch_dex_latest_profiles(chain):
            address = str(item.get("tokenAddress") or "").lower()
            if address:
                addresses_by_chain[chain].add(address)
        for item in fetch_dex_community_takeovers(chain):
            address = str(item.get("tokenAddress") or "").lower()
            if address:
                addresses_by_chain[chain].add(address)
        for item in fetch_dex_boosted_tokens(chain):
            address = str(item.get("tokenAddress") or "").lower()
            if address:
                addresses_by_chain[chain].add(address)

    pairs: list[dict] = []
    for chain, addresses in addresses_by_chain.items():
        if not addresses:
            continue
        pairs.extend(fetch_dex_token_batch(sorted(addresses), chain=chain))
    return pairs


def build_market_search_index_records() -> list[MarketSearchIndexRecord]:
    futures_symbols = fetch_futures_symbols()
    refreshed_at = _utcnow()
    candidates: list[MarketSearchCandidate] = []
    seen: set[tuple[str, str, str, str, str, str]] = set()

    for symbol in sorted(futures_symbols):
        direct = _direct_candidate(symbol, futures_symbols)
        if direct is None:
            continue
        key = _candidate_key(direct)
        if key in seen:
            continue
        seen.add(key)
        candidates.append(direct)

    for base_symbol in ALPHA_WATCHLIST:
        watch_candidate = _direct_candidate(base_symbol, futures_symbols)
        if watch_candidate is None:
            continue
        key = _candidate_key(watch_candidate)
        if key in seen:
            continue
        seen.add(key)
        candidates.append(watch_candidate)

    for pair in _discover_dex_pairs():
        candidate = _pair_to_candidate(
            query="index_refresh",
            pair=pair,
            futures_symbols=futures_symbols,
            source="discovery",
        )
        if candidate is None:
            continue
        key = _candidate_key(candidate)
        if key in seen:
            continue
        seen.add(key)
        candidates.append(candidate)

    candidates.sort(key=_candidate_sort_key)
    return [
        _candidate_to_index_record(candidate, refreshed_at=refreshed_at)
        for candidate in candidates
    ]


def refresh_market_search_index(
    *,
    store: CanonicalRawStore | None = None,
) -> MarketSearchIndexRefreshResult:
    store = store or CanonicalRawStore()
    records = build_market_search_index_records()
    store.replace_market_search_index(records)
    _clear_search_result_cache(db_path=str(store.db_path))
    if bump_shared_search_generation(db_path=str(store.db_path)) is not None:
        _increment_metric("search.market.shared_generation_bump")
    _, refreshed_at = store.market_search_index_status()
    return MarketSearchIndexRefreshResult(
        row_count=len(records),
        refreshed_at=refreshed_at.isoformat() if refreshed_at is not None else "",
        db_path=str(store.db_path),
    )


def get_market_search_index_status(
    *,
    store: CanonicalRawStore | None = None,
) -> MarketSearchIndexStatus:
    store = store or CanonicalRawStore()
    row_count, updated_at = store.market_search_index_status()
    return MarketSearchIndexStatus(
        row_count=row_count,
        updated_at=updated_at.isoformat() if updated_at is not None else None,
        ready=row_count > 0,
    )


def search_market_candidates(
    query: str,
    *,
    limit: int = 10,
    store: CanonicalRawStore | None = None,
    allow_live_fallback: bool = True,
    warm_index_on_fallback: bool = True,
) -> list[MarketSearchCandidate]:
    started_at = time.perf_counter()
    query = _clean_query(query)
    if not query:
        _observe_search_path("empty_query", started_at=started_at)
        return []

    store = store or CanonicalRawStore()
    cache_key = _search_cache_key(
        query,
        limit=limit,
        allow_live_fallback=allow_live_fallback,
        store=store,
    )
    normalized_cache_query = cache_key[1]
    cached = _get_cached_search_results(cache_key)
    if cached is not None:
        _observe_search_path("l1", started_at=started_at)
        return cached

    shared_generation, shared_payload = read_shared_search_results(
        db_path=str(store.db_path),
        normalized_query=normalized_cache_query,
        limit=limit,
        allow_live_fallback=allow_live_fallback,
    )
    if shared_payload is not None:
        shared_results = [
            _candidate_from_payload(payload, query=query)
            for payload in shared_payload
        ]
        _put_cached_search_results(cache_key, shared_results)
        _observe_search_path("l2", started_at=started_at)
        return shared_results

    is_build_leader, build_state = _begin_local_search_build(cache_key)
    if not is_build_leader:
        _increment_metric("search.market.local_wait")
        waited = build_state.event.wait(_SEARCH_BUILD_WAIT_SECONDS)
        if waited and build_state.result is not None:
            follower_results = list(build_state.result)
            _put_cached_search_results(cache_key, follower_results)
            _observe_search_path("local_coalesced", started_at=started_at)
            return follower_results
        if not waited:
            _increment_metric("search.market.local_wait_timeout")

    build_error: Exception | None = None
    result_to_publish: list[MarketSearchCandidate] | None = None
    shared_lock_generation = shared_generation
    shared_lock_token: str | None = None
    try:
        if is_build_leader:
            shared_lock_generation, shared_lock_token = acquire_shared_query_build_lock(
                db_path=str(store.db_path),
                normalized_query=normalized_cache_query,
                limit=limit,
                allow_live_fallback=allow_live_fallback,
                generation=shared_generation,
            )
            if shared_lock_token is not None:
                _increment_metric("search.market.shared_lock_acquired")
            elif shared_lock_generation is not None:
                _increment_metric("search.market.shared_lock_contended")
                waited_generation, waited_payload = wait_for_shared_search_results(
                    db_path=str(store.db_path),
                    normalized_query=normalized_cache_query,
                    limit=limit,
                    allow_live_fallback=allow_live_fallback,
                )
                if waited_payload is not None:
                    waited_results = [
                        _candidate_from_payload(payload, query=query)
                        for payload in waited_payload
                    ]
                    _put_cached_search_results(cache_key, waited_results)
                    result_to_publish = waited_results
                    write_shared_search_results(
                        db_path=str(store.db_path),
                        normalized_query=normalized_cache_query,
                        limit=limit,
                        allow_live_fallback=allow_live_fallback,
                        results=[candidate.to_dict() for candidate in waited_results],
                        generation=waited_generation,
                    )
                    _observe_search_path("shared_wait", started_at=started_at)
                    return waited_results
                _increment_metric("search.market.shared_wait_timeout")

        indexed = _search_market_candidates_from_index(query, limit=limit, store=store)
        if indexed:
            _put_cached_search_results(cache_key, indexed)
            write_shared_search_results(
                db_path=str(store.db_path),
                normalized_query=normalized_cache_query,
                limit=limit,
                allow_live_fallback=allow_live_fallback,
                results=[candidate.to_dict() for candidate in indexed],
                generation=shared_lock_generation,
            )
            result_to_publish = indexed
            _observe_search_path("l3", started_at=started_at)
            return indexed
        if not allow_live_fallback:
            _put_cached_search_results(cache_key, [])
            write_shared_search_results(
                db_path=str(store.db_path),
                normalized_query=normalized_cache_query,
                limit=limit,
                allow_live_fallback=allow_live_fallback,
                results=[],
                generation=shared_lock_generation,
            )
            result_to_publish = []
            _observe_search_path("empty_index", started_at=started_at)
            return []

        futures_symbols = fetch_futures_symbols()
        live = _live_search_market_candidates(query, limit=limit, futures_symbols=futures_symbols)
        if live and warm_index_on_fallback:
            refreshed_at = _utcnow()
            store.upsert_market_search_index(
                [
                    _candidate_to_index_record(candidate, refreshed_at=refreshed_at)
                    for candidate in live
                ]
            )
            _clear_search_result_cache(db_path=str(store.db_path))
        _put_cached_search_results(cache_key, live)
        write_shared_search_results(
            db_path=str(store.db_path),
            normalized_query=normalized_cache_query,
            limit=limit,
            allow_live_fallback=allow_live_fallback,
            results=[candidate.to_dict() for candidate in live],
            generation=shared_lock_generation,
        )
        result_to_publish = live
        _observe_search_path("l4_live" if live else "l4_empty", started_at=started_at)
        return live
    except Exception as exc:
        build_error = exc
        _observe_search_path("error", started_at=started_at)
        raise
    finally:
        if shared_lock_token is not None and shared_lock_generation is not None:
            release_shared_query_build_lock(
                db_path=str(store.db_path),
                normalized_query=normalized_cache_query,
                limit=limit,
                allow_live_fallback=allow_live_fallback,
                generation=shared_lock_generation,
                token=shared_lock_token,
            )
        if is_build_leader:
            _finish_local_search_build(
                cache_key,
                build_state,
                result=result_to_publish,
                error=build_error,
            )


def ingest_market_query_raw(
    query: str,
    *,
    timeframe: str = "1h",
    store: CanonicalRawStore | None = None,
    refresh_cache: bool = True,
    limit: int = 10,
) -> MarketQueryIngestionResult:
    store = store or CanonicalRawStore()
    candidates = search_market_candidates(query, limit=limit, store=store)
    if not candidates:
        raise RuntimeError(f"no market candidates found for query {query!r}")

    failures: list[dict[str, str]] = []
    for candidate in candidates:
        try:
            raw_result = ingest_binance_symbol_raw(
                candidate.canonical_symbol,
                timeframe=timeframe,
                store=store,
                refresh_cache=refresh_cache,
            )
            return MarketQueryIngestionResult(
                query=query,
                selected_candidate=candidate.to_dict(),
                failed_candidates=failures,
                raw_result=raw_result.to_dict(),
            )
        except RuntimeError as exc:
            failures.append(
                {
                    "canonical_symbol": candidate.canonical_symbol,
                    "error": str(exc),
                }
            )
    raise RuntimeError(
        f"no ingestible Binance target found for query {query!r}; "
        f"attempted {[candidate.canonical_symbol for candidate in candidates]}"
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Search markets by contract/symbol and optionally ingest raw data."
    )
    parser.add_argument("query", nargs="?", help="Token symbol, Binance symbol, or contract address")
    parser.add_argument("--limit", type=int, default=10, help="Maximum number of search candidates to return")
    parser.add_argument("--ingest", action="store_true", help="Resolve and ingest the first workable Binance target")
    parser.add_argument("--refresh-index", action="store_true", help="Rebuild the local market search index first")
    parser.add_argument(
        "--no-live-fallback",
        action="store_true",
        help="Do not hit live providers when the local index misses",
    )
    parser.add_argument("--timeframe", default="1h", help="Binance timeframe label, default: 1h")
    parser.add_argument(
        "--db-path",
        default=str(DEFAULT_DB_PATH),
        help="SQLite database path for the canonical raw store",
    )
    parser.add_argument(
        "--no-cache-refresh",
        action="store_true",
        help="Do not refresh the legacy CSV cache while ingesting raw rows",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    store = CanonicalRawStore(args.db_path)

    if args.refresh_index:
        refresh_result = refresh_market_search_index(store=store)
        if args.query is None and not args.ingest:
            print(json.dumps(refresh_result.to_dict(), indent=2, sort_keys=True))
            return 0

    if args.query is None:
        raise SystemExit("query is required unless --refresh-index is used alone")

    if args.ingest:
        result = ingest_market_query_raw(
            args.query,
            timeframe=args.timeframe,
            store=store,
            refresh_cache=not args.no_cache_refresh,
            limit=args.limit,
        )
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
        return 0

    results = [
        candidate.to_dict()
        for candidate in search_market_candidates(
            args.query,
            limit=args.limit,
            store=store,
            allow_live_fallback=not args.no_live_fallback,
        )
    ]
    print(json.dumps(results, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
