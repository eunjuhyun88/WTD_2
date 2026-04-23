"""Query-driven market resolver for contract/symbol raw ingestion."""
from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone

from data_cache.fetch_alpha_universe import ALPHA_WATCHLIST, fetch_futures_symbols
from data_cache.fetch_dexscreener import (
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
_SOURCE_RANK = {"direct": 0, "contract": 1, "search": 1, "discovery": 1}


def _clean_query(query: str) -> str:
    return query.strip()


def _normalize_base_symbol(query: str) -> str:
    symbol = "".join(ch for ch in _clean_query(query).upper() if ch.isalnum())
    for suffix in _QUOTE_SUFFIXES:
        if symbol.endswith(suffix):
            return symbol[: -len(suffix)]
    return symbol


def _is_contract_query(query: str) -> bool:
    return bool(_ADDRESS_RE.fullmatch(_clean_query(query)))


def _chain_rank(chain: str) -> int:
    try:
        return _PREFERRED_CHAINS.index(chain)
    except ValueError:
        return len(_PREFERRED_CHAINS)


def _watchlist_rank(grade: str | None) -> int:
    return _GRADE_RANK.get(grade, 2)


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
class MarketQueryIngestionResult:
    query: str
    selected_candidate: dict[str, object]
    failed_candidates: list[dict[str, str]]
    raw_result: dict[str, object]

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class MarketSearchIndexRefreshResult:
    row_count: int
    refreshed_at: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def _direct_candidate(
    query: str,
    futures_symbols: set[str],
    *,
    base_symbol_override: str | None = None,
    base_name_override: str | None = None,
) -> MarketSearchCandidate | None:
    base_symbol = base_symbol_override or _normalize_base_symbol(query)
    if not base_symbol:
        return None
    canonical_symbol = f"{base_symbol}USDT"
    watchlist_entry = ALPHA_WATCHLIST.get(base_symbol)
    futures_listed = canonical_symbol in futures_symbols
    if watchlist_entry is None and not futures_listed:
        return None
    return MarketSearchCandidate(
        query=query,
        provider="binance",
        source="direct",
        chain=watchlist_entry.get("chain", "") if watchlist_entry else "",
        base_symbol=base_symbol,
        base_name=base_name_override or base_symbol,
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


def _search_pairs(query: str) -> list[dict]:
    if _is_contract_query(query):
        pairs: list[dict] = []
        for chain in _PREFERRED_CHAINS:
            pairs.extend(fetch_dex_token_batch([query], chain=chain))
        if pairs:
            return pairs
    return fetch_dex_search_pairs(query, chains=tuple(_PREFERRED_CHAINS))


def _pair_to_candidate(
    *,
    query: str,
    pair: dict,
    futures_symbols: set[str],
    source_override: str | None = None,
) -> MarketSearchCandidate | None:
    base_token = pair.get("baseToken") or {}
    quote_token = pair.get("quoteToken") or {}
    base_symbol = str(base_token.get("symbol") or "").upper()
    if not base_symbol:
        return None
    base_name = str(base_token.get("name") or base_symbol).upper()
    quote_symbol = str(quote_token.get("symbol") or "").upper()
    canonical_symbol = f"{base_symbol}USDT"
    watchlist_entry = ALPHA_WATCHLIST.get(base_symbol)
    volume = pair.get("volume") or {}
    liquidity = pair.get("liquidity") or {}
    price_change = pair.get("priceChange") or {}
    return MarketSearchCandidate(
        query=query,
        provider="dexscreener",
        source=source_override or ("contract" if _is_contract_query(query) else "search"),
        chain=str(pair.get("chainId") or ""),
        base_symbol=base_symbol,
        base_name=base_name,
        quote_symbol=quote_symbol,
        canonical_symbol=canonical_symbol,
        token_address=str(base_token.get("address") or ""),
        pair_address=str(pair.get("pairAddress") or ""),
        liquidity_usd=float(liquidity.get("usd") or 0.0),
        volume_h24=float(volume.get("h24") or 0.0),
        price_change_h24=float(price_change.get("h24") or 0.0),
        futures_listed=canonical_symbol in futures_symbols,
        watchlist_grade=watchlist_entry.get("grade") if watchlist_entry else None,
        note=watchlist_entry.get("note", "") if watchlist_entry else "",
    )


def _candidate_key(candidate: MarketSearchCandidate) -> tuple[str, str, str, str]:
    return (
        candidate.provider,
        candidate.chain,
        candidate.token_address.lower(),
        candidate.pair_address.lower(),
    )


def _candidate_sort_key(candidate: MarketSearchCandidate) -> tuple[object, ...]:
    stable_quote_rank = 0 if candidate.quote_symbol in _STABLE_QUOTES or not candidate.quote_symbol else 1
    source_rank = _SOURCE_RANK.get(candidate.source, 2 if not candidate.futures_listed else 1)
    return (
        source_rank,
        _watchlist_rank(candidate.watchlist_grade),
        stable_quote_rank,
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
    stable_quote_rank = 0 if candidate.quote_symbol in _STABLE_QUOTES or not candidate.quote_symbol else 1
    return MarketSearchIndexRecord(
        provider=candidate.provider,
        source=candidate.source,
        chain=candidate.chain,
        chain_rank=_chain_rank(candidate.chain),
        source_rank=_SOURCE_RANK.get(candidate.source, 2 if not candidate.futures_listed else 1),
        stable_quote_rank=stable_quote_rank,
        watchlist_rank=_watchlist_rank(candidate.watchlist_grade),
        base_symbol=candidate.base_symbol,
        base_name=candidate.base_name,
        quote_symbol=candidate.quote_symbol,
        canonical_symbol=candidate.canonical_symbol,
        token_address=candidate.token_address,
        pair_address=candidate.pair_address,
        futures_listed=candidate.futures_listed,
        watchlist_grade=candidate.watchlist_grade,
        note=candidate.note,
        liquidity_usd=candidate.liquidity_usd,
        volume_h24=candidate.volume_h24,
        price_change_h24=candidate.price_change_h24,
        refreshed_at=refreshed_at,
    )


def _row_to_candidate(row) -> MarketSearchCandidate:
    return MarketSearchCandidate(
        query="",
        provider=str(row["provider"]),
        source=str(row["source"]),
        chain=str(row["chain"]),
        base_symbol=str(row["base_symbol"]),
        base_name=str(row["base_name"]),
        quote_symbol=str(row["quote_symbol"]),
        canonical_symbol=str(row["canonical_symbol"]),
        token_address=str(row["token_address"]),
        pair_address=str(row["pair_address"]),
        liquidity_usd=float(row["liquidity_usd"] or 0.0),
        volume_h24=float(row["volume_h24"] or 0.0),
        price_change_h24=float(row["price_change_h24"] or 0.0),
        futures_listed=bool(row["futures_listed"]),
        watchlist_grade=str(row["watchlist_grade"]) if row["watchlist_grade"] is not None else None,
        note=str(row["note"] or ""),
    )


def _search_index_candidates(
    query: str,
    *,
    store: CanonicalRawStore,
    limit: int,
) -> list[MarketSearchCandidate]:
    normalized_query = _normalize_base_symbol(query)
    canonical_query = f"{normalized_query}USDT" if normalized_query else _clean_query(query).upper()
    contract_query = _clean_query(query).lower() if _is_contract_query(query) else None
    rows = store.search_market_index(
        normalized_query=normalized_query,
        canonical_query=canonical_query,
        contract_query=contract_query,
        limit=limit,
    )
    candidates = [_row_to_candidate(row) for row in rows]
    resolved: list[MarketSearchCandidate] = []
    for candidate in candidates:
        payload = candidate.to_dict()
        payload["query"] = query
        resolved.append(MarketSearchCandidate(**payload))
    return resolved


def _append_candidate(
    candidate: MarketSearchCandidate | None,
    *,
    candidates: list[MarketSearchCandidate],
    seen: set[tuple[str, str, str, str]],
) -> None:
    if candidate is None:
        return
    key = _candidate_key(candidate)
    if key in seen:
        return
    seen.add(key)
    candidates.append(candidate)


def search_market_candidates(
    query: str,
    *,
    limit: int = 10,
    store: CanonicalRawStore | None = None,
    allow_live_fallback: bool = True,
) -> list[MarketSearchCandidate]:
    query = _clean_query(query)
    if not query:
        return []

    if store is not None:
        indexed = _search_index_candidates(query, store=store, limit=limit)
        if indexed or not allow_live_fallback:
            return indexed[:limit]

    futures_symbols = fetch_futures_symbols()
    candidates: list[MarketSearchCandidate] = []
    seen: set[tuple[str, str, str, str]] = set()
    _append_candidate(_direct_candidate(query, futures_symbols), candidates=candidates, seen=seen)

    for pair in _search_pairs(query):
        candidate = _pair_to_candidate(query=query, pair=pair, futures_symbols=futures_symbols)
        _append_candidate(candidate, candidates=candidates, seen=seen)

    candidates.sort(key=_candidate_sort_key)
    return candidates[:limit]


def _collect_discovery_pairs() -> list[dict]:
    pairs: list[dict] = []
    for chain in _PREFERRED_CHAINS:
        addresses: list[str] = []
        for profile in fetch_dex_latest_profiles(chain):
            address = str(profile.get("tokenAddress") or "")
            if address:
                addresses.append(address)
        for takeover in fetch_dex_community_takeovers(chain):
            address = str(takeover.get("tokenAddress") or "")
            if address:
                addresses.append(address)
        for boost in fetch_dex_boosted_tokens(chain):
            address = str(boost.get("tokenAddress") or "")
            if address:
                addresses.append(address)
        if not addresses:
            continue
        deduped = list(dict.fromkeys(addresses))
        pairs.extend(fetch_dex_token_batch(deduped, chain=chain))
    return pairs


def refresh_market_search_index(
    *,
    store: CanonicalRawStore | None = None,
) -> MarketSearchIndexRefreshResult:
    store = store or CanonicalRawStore()
    futures_symbols = fetch_futures_symbols()
    refreshed_at = datetime.now(timezone.utc)

    candidates: list[MarketSearchCandidate] = []
    seen: set[tuple[str, str, str, str]] = set()

    for base_symbol, info in ALPHA_WATCHLIST.items():
        candidate = _direct_candidate(
            base_symbol,
            futures_symbols,
            base_symbol_override=base_symbol,
            base_name_override=base_symbol,
        )
        if candidate is None:
            candidate = MarketSearchCandidate(
                query=base_symbol,
                provider="binance",
                source="direct",
                chain=str(info.get("chain") or ""),
                base_symbol=base_symbol,
                base_name=base_symbol,
                quote_symbol="USDT",
                canonical_symbol=f"{base_symbol}USDT",
                token_address="",
                pair_address="",
                liquidity_usd=0.0,
                volume_h24=0.0,
                price_change_h24=0.0,
                futures_listed=f"{base_symbol}USDT" in futures_symbols,
                watchlist_grade=info.get("grade"),
                note=str(info.get("note") or ""),
            )
        _append_candidate(candidate, candidates=candidates, seen=seen)

    for pair in _collect_discovery_pairs():
        candidate = _pair_to_candidate(
            query=str((pair.get("baseToken") or {}).get("symbol") or ""),
            pair=pair,
            futures_symbols=futures_symbols,
            source_override="discovery",
        )
        _append_candidate(candidate, candidates=candidates, seen=seen)
        if candidate is not None:
            direct_candidate = _direct_candidate(
                candidate.base_symbol,
                futures_symbols,
                base_symbol_override=candidate.base_symbol,
                base_name_override=candidate.base_name,
            )
            _append_candidate(direct_candidate, candidates=candidates, seen=seen)

    rows = [
        _candidate_to_index_record(candidate, refreshed_at=refreshed_at)
        for candidate in candidates
    ]
    row_count = store.replace_market_search_index(rows)
    return MarketSearchIndexRefreshResult(
        row_count=row_count,
        refreshed_at=refreshed_at.isoformat(),
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
    parser = argparse.ArgumentParser(description="Search markets by contract/symbol and optionally ingest raw data.")
    parser.add_argument("query", nargs="?", default="", help="Token symbol, Binance symbol, or contract address")
    parser.add_argument("--limit", type=int, default=10, help="Maximum number of search candidates to return")
    parser.add_argument("--ingest", action="store_true", help="Resolve and ingest the first workable Binance target")
    parser.add_argument("--refresh-index", action="store_true", help="Refresh the persisted local market search index")
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
        result = refresh_market_search_index(store=store)
        print(json.dumps(result.to_dict(), indent=2, sort_keys=True))
        return 0

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
        for candidate in search_market_candidates(args.query, limit=args.limit, store=store)
    ]
    print(json.dumps(results, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
