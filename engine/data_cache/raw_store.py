"""Canonical raw market-data store.

This is the durable raw plane for normalized provider truth. It is separate
from the legacy file cache under ``engine/data_cache/cache``.
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

STATE_DIR = Path(__file__).resolve().parent.parent / "state"
DEFAULT_DB_PATH = STATE_DIR / "canonical_raw.sqlite"


def _dt_to_ms(value: datetime) -> int:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp() * 1000)


def _ms_to_dt(value: int) -> datetime:
    return datetime.fromtimestamp(value / 1000.0, tz=timezone.utc)


@dataclass(frozen=True)
class RawMarketBarRecord:
    provider: str
    venue: str
    symbol: str
    timeframe: str
    ts: datetime
    source_ts: datetime
    ingested_at: datetime
    freshness_ms: int
    quality_state: str
    fallback_state: str
    open: float
    high: float
    low: float
    close: float
    volume: float | None
    quote_volume: float | None
    trade_count: int | None
    taker_buy_base_volume: float | None
    taker_buy_quote_volume: float | None


@dataclass(frozen=True)
class RawOrderflowMetricRecord:
    provider: str
    venue: str
    symbol: str
    timeframe: str
    ts: datetime
    source_ts: datetime
    ingested_at: datetime
    freshness_ms: int
    quality_state: str
    fallback_state: str
    taker_buy_volume: float | None
    taker_sell_volume: float | None
    buy_sell_delta: float | None
    taker_buy_quote_volume: float | None
    taker_sell_quote_volume: float | None
    taker_buy_ratio: float | None
    trade_count: int | None


@dataclass(frozen=True)
class RawPerpMetricRecord:
    provider: str
    venue: str
    symbol: str
    timeframe: str
    ts: datetime
    source_ts: datetime
    ingested_at: datetime
    freshness_ms: int
    quality_state: str
    fallback_state: str
    funding_rate: float | None
    open_interest: float | None
    oi_change_1h: float | None
    oi_change_24h: float | None
    long_short_ratio: float | None


@dataclass(frozen=True)
class MarketLiquidationWindowRecord:
    provider: str
    venue: str
    symbol: str
    timeframe: str
    window_start_ts: datetime
    window_end_ts: datetime
    source_start_ts: datetime
    source_end_ts: datetime
    ingested_at: datetime
    freshness_ms: int
    quality_state: str
    fallback_state: str
    event_count: int
    short_event_count: int
    long_event_count: int
    short_liq_usd: float
    long_liq_usd: float
    total_liq_usd: float
    net_liq_usd: float
    dominant_side: str
    dominance_share: float
    imbalance_ratio: float
    largest_event_usd: float
    largest_event_side: str


@dataclass(frozen=True)
class MarketSearchIndexRecord:
    provider: str
    source: str
    chain: str
    chain_rank: int
    source_rank: int
    stable_quote_rank: int
    watchlist_rank: int
    base_symbol: str
    base_name: str
    quote_symbol: str
    canonical_symbol: str
    token_address: str
    pair_address: str
    futures_listed: bool
    watchlist_grade: str | None
    note: str
    liquidity_usd: float
    volume_h24: float
    price_change_h24: float
    refreshed_at: datetime


class CanonicalRawStore:
    """SQLite WAL-backed canonical raw store."""

    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS raw_market_bars (
                  provider TEXT NOT NULL,
                  venue TEXT NOT NULL,
                  symbol TEXT NOT NULL,
                  timeframe TEXT NOT NULL,
                  ts INTEGER NOT NULL,
                  source_ts INTEGER NOT NULL,
                  ingested_at INTEGER NOT NULL,
                  freshness_ms INTEGER NOT NULL,
                  quality_state TEXT NOT NULL,
                  fallback_state TEXT NOT NULL,
                  open REAL NOT NULL,
                  high REAL NOT NULL,
                  low REAL NOT NULL,
                  close REAL NOT NULL,
                  volume REAL,
                  quote_volume REAL,
                  trade_count INTEGER,
                  taker_buy_base_volume REAL,
                  taker_buy_quote_volume REAL,
                  PRIMARY KEY (venue, symbol, timeframe, ts)
                );

                CREATE TABLE IF NOT EXISTS raw_orderflow_metrics (
                  provider TEXT NOT NULL,
                  venue TEXT NOT NULL,
                  symbol TEXT NOT NULL,
                  timeframe TEXT NOT NULL,
                  ts INTEGER NOT NULL,
                  source_ts INTEGER NOT NULL,
                  ingested_at INTEGER NOT NULL,
                  freshness_ms INTEGER NOT NULL,
                  quality_state TEXT NOT NULL,
                  fallback_state TEXT NOT NULL,
                  taker_buy_volume REAL,
                  taker_sell_volume REAL,
                  buy_sell_delta REAL,
                  taker_buy_quote_volume REAL,
                  taker_sell_quote_volume REAL,
                  taker_buy_ratio REAL,
                  trade_count INTEGER,
                  PRIMARY KEY (venue, symbol, timeframe, ts)
                );

                CREATE TABLE IF NOT EXISTS raw_perp_metrics (
                  provider TEXT NOT NULL,
                  venue TEXT NOT NULL,
                  symbol TEXT NOT NULL,
                  timeframe TEXT NOT NULL,
                  ts INTEGER NOT NULL,
                  source_ts INTEGER NOT NULL,
                  ingested_at INTEGER NOT NULL,
                  freshness_ms INTEGER NOT NULL,
                  quality_state TEXT NOT NULL,
                  fallback_state TEXT NOT NULL,
                  funding_rate REAL,
                  open_interest REAL,
                  oi_change_1h REAL,
                  oi_change_24h REAL,
                  long_short_ratio REAL,
                  PRIMARY KEY (venue, symbol, timeframe, ts)
                );

                CREATE INDEX IF NOT EXISTS idx_raw_market_bars_symbol_time
                  ON raw_market_bars(symbol, timeframe, ts);

                CREATE INDEX IF NOT EXISTS idx_raw_orderflow_symbol_time
                  ON raw_orderflow_metrics(symbol, timeframe, ts);

                CREATE INDEX IF NOT EXISTS idx_raw_perp_symbol_time
                  ON raw_perp_metrics(symbol, timeframe, ts);

                CREATE TABLE IF NOT EXISTS market_search_index (
                  provider TEXT NOT NULL,
                  source TEXT NOT NULL,
                  chain TEXT NOT NULL,
                  chain_rank INTEGER NOT NULL,
                  source_rank INTEGER NOT NULL,
                  stable_quote_rank INTEGER NOT NULL,
                  watchlist_rank INTEGER NOT NULL,
                  base_symbol TEXT NOT NULL,
                  base_name TEXT NOT NULL,
                  quote_symbol TEXT NOT NULL,
                  canonical_symbol TEXT NOT NULL,
                  token_address TEXT NOT NULL,
                  pair_address TEXT NOT NULL,
                  futures_listed INTEGER NOT NULL,
                  watchlist_grade TEXT,
                  note TEXT NOT NULL,
                  liquidity_usd REAL NOT NULL,
                  volume_h24 REAL NOT NULL,
                  price_change_h24 REAL NOT NULL,
                  refreshed_at INTEGER NOT NULL,
                  PRIMARY KEY (provider, source, chain, canonical_symbol, token_address, pair_address)
                );

                CREATE INDEX IF NOT EXISTS idx_market_search_base_symbol
                  ON market_search_index(base_symbol);

                CREATE INDEX IF NOT EXISTS idx_market_search_base_name
                  ON market_search_index(base_name);

                CREATE INDEX IF NOT EXISTS idx_market_search_canonical_symbol
                  ON market_search_index(canonical_symbol);

                CREATE INDEX IF NOT EXISTS idx_market_search_token_address
                  ON market_search_index(token_address);

                CREATE INDEX IF NOT EXISTS idx_market_search_pair_address
                  ON market_search_index(pair_address);

                CREATE INDEX IF NOT EXISTS idx_market_search_rank
                  ON market_search_index(
                    source_rank,
                    watchlist_rank,
                    stable_quote_rank,
                    chain_rank,
                    liquidity_usd DESC,
                    volume_h24 DESC
                  );
                """
            )

    def upsert_market_bars(self, rows: list[RawMarketBarRecord]) -> int:
        if not rows:
            return 0
        unique_rows = {
            (row.venue, row.symbol, row.timeframe, _dt_to_ms(row.ts))
            for row in rows
        }
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT INTO raw_market_bars (
                  provider, venue, symbol, timeframe, ts, source_ts, ingested_at,
                  freshness_ms, quality_state, fallback_state,
                  open, high, low, close, volume, quote_volume, trade_count,
                  taker_buy_base_volume, taker_buy_quote_volume
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(venue, symbol, timeframe, ts) DO UPDATE SET
                  provider=excluded.provider,
                  source_ts=excluded.source_ts,
                  ingested_at=excluded.ingested_at,
                  freshness_ms=excluded.freshness_ms,
                  quality_state=excluded.quality_state,
                  fallback_state=excluded.fallback_state,
                  open=excluded.open,
                  high=excluded.high,
                  low=excluded.low,
                  close=excluded.close,
                  volume=excluded.volume,
                  quote_volume=excluded.quote_volume,
                  trade_count=excluded.trade_count,
                  taker_buy_base_volume=excluded.taker_buy_base_volume,
                  taker_buy_quote_volume=excluded.taker_buy_quote_volume
                """,
                [
                    (
                        row.provider,
                        row.venue,
                        row.symbol,
                        row.timeframe,
                        _dt_to_ms(row.ts),
                        _dt_to_ms(row.source_ts),
                        _dt_to_ms(row.ingested_at),
                        row.freshness_ms,
                        row.quality_state,
                        row.fallback_state,
                        row.open,
                        row.high,
                        row.low,
                        row.close,
                        row.volume,
                        row.quote_volume,
                        row.trade_count,
                        row.taker_buy_base_volume,
                        row.taker_buy_quote_volume,
                    )
                    for row in rows
                ],
            )
        return len(unique_rows)

    def upsert_orderflow_metrics(self, rows: list[RawOrderflowMetricRecord]) -> int:
        if not rows:
            return 0
        unique_rows = {
            (row.venue, row.symbol, row.timeframe, _dt_to_ms(row.ts))
            for row in rows
        }
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT INTO raw_orderflow_metrics (
                  provider, venue, symbol, timeframe, ts, source_ts, ingested_at,
                  freshness_ms, quality_state, fallback_state,
                  taker_buy_volume, taker_sell_volume, buy_sell_delta,
                  taker_buy_quote_volume, taker_sell_quote_volume,
                  taker_buy_ratio, trade_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(venue, symbol, timeframe, ts) DO UPDATE SET
                  provider=excluded.provider,
                  source_ts=excluded.source_ts,
                  ingested_at=excluded.ingested_at,
                  freshness_ms=excluded.freshness_ms,
                  quality_state=excluded.quality_state,
                  fallback_state=excluded.fallback_state,
                  taker_buy_volume=excluded.taker_buy_volume,
                  taker_sell_volume=excluded.taker_sell_volume,
                  buy_sell_delta=excluded.buy_sell_delta,
                  taker_buy_quote_volume=excluded.taker_buy_quote_volume,
                  taker_sell_quote_volume=excluded.taker_sell_quote_volume,
                  taker_buy_ratio=excluded.taker_buy_ratio,
                  trade_count=excluded.trade_count
                """,
                [
                    (
                        row.provider,
                        row.venue,
                        row.symbol,
                        row.timeframe,
                        _dt_to_ms(row.ts),
                        _dt_to_ms(row.source_ts),
                        _dt_to_ms(row.ingested_at),
                        row.freshness_ms,
                        row.quality_state,
                        row.fallback_state,
                        row.taker_buy_volume,
                        row.taker_sell_volume,
                        row.buy_sell_delta,
                        row.taker_buy_quote_volume,
                        row.taker_sell_quote_volume,
                        row.taker_buy_ratio,
                        row.trade_count,
                    )
                    for row in rows
                ],
            )
        return len(unique_rows)

    def upsert_perp_metrics(self, rows: list[RawPerpMetricRecord]) -> int:
        if not rows:
            return 0
        unique_rows = {
            (row.venue, row.symbol, row.timeframe, _dt_to_ms(row.ts))
            for row in rows
        }
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT INTO raw_perp_metrics (
                  provider, venue, symbol, timeframe, ts, source_ts, ingested_at,
                  freshness_ms, quality_state, fallback_state,
                  funding_rate, open_interest, oi_change_1h, oi_change_24h, long_short_ratio
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(venue, symbol, timeframe, ts) DO UPDATE SET
                  provider=excluded.provider,
                  source_ts=excluded.source_ts,
                  ingested_at=excluded.ingested_at,
                  freshness_ms=excluded.freshness_ms,
                  quality_state=excluded.quality_state,
                  fallback_state=excluded.fallback_state,
                  funding_rate=excluded.funding_rate,
                  open_interest=excluded.open_interest,
                  oi_change_1h=excluded.oi_change_1h,
                  oi_change_24h=excluded.oi_change_24h,
                  long_short_ratio=excluded.long_short_ratio
                """,
                [
                    (
                        row.provider,
                        row.venue,
                        row.symbol,
                        row.timeframe,
                        _dt_to_ms(row.ts),
                        _dt_to_ms(row.source_ts),
                        _dt_to_ms(row.ingested_at),
                        row.freshness_ms,
                        row.quality_state,
                        row.fallback_state,
                        row.funding_rate,
                        row.open_interest,
                        row.oi_change_1h,
                        row.oi_change_24h,
                        row.long_short_ratio,
                    )
                    for row in rows
                ],
            )
        return len(unique_rows)

    def upsert_market_search_index(self, rows: list[MarketSearchIndexRecord]) -> int:
        if not rows:
            return 0
        unique_rows = {
            (
                row.provider,
                row.source,
                row.chain,
                row.canonical_symbol,
                row.token_address,
                row.pair_address,
            )
            for row in rows
        }
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT INTO market_search_index (
                  provider, source, chain, chain_rank, source_rank, stable_quote_rank,
                  watchlist_rank, base_symbol, base_name, quote_symbol, canonical_symbol,
                  token_address, pair_address, futures_listed, watchlist_grade, note,
                  liquidity_usd, volume_h24, price_change_h24, refreshed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(provider, source, chain, canonical_symbol, token_address, pair_address)
                DO UPDATE SET
                  chain_rank=excluded.chain_rank,
                  source_rank=excluded.source_rank,
                  stable_quote_rank=excluded.stable_quote_rank,
                  watchlist_rank=excluded.watchlist_rank,
                  base_symbol=excluded.base_symbol,
                  base_name=excluded.base_name,
                  quote_symbol=excluded.quote_symbol,
                  futures_listed=excluded.futures_listed,
                  watchlist_grade=excluded.watchlist_grade,
                  note=excluded.note,
                  liquidity_usd=excluded.liquidity_usd,
                  volume_h24=excluded.volume_h24,
                  price_change_h24=excluded.price_change_h24,
                  refreshed_at=excluded.refreshed_at
                """,
                [
                    (
                        row.provider,
                        row.source,
                        row.chain,
                        row.chain_rank,
                        row.source_rank,
                        row.stable_quote_rank,
                        row.watchlist_rank,
                        row.base_symbol,
                        row.base_name,
                        row.quote_symbol,
                        row.canonical_symbol,
                        row.token_address,
                        row.pair_address,
                        int(row.futures_listed),
                        row.watchlist_grade,
                        row.note,
                        row.liquidity_usd,
                        row.volume_h24,
                        row.price_change_h24,
                        _dt_to_ms(row.refreshed_at),
                    )
                    for row in rows
                ],
            )
        return len(unique_rows)

    def replace_market_search_index(self, rows: list[MarketSearchIndexRecord]) -> int:
        with self._connect() as conn:
            conn.execute("DELETE FROM market_search_index")
        return self.upsert_market_search_index(rows)

    def market_search_index_status(self) -> tuple[int, datetime | None]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS count, MAX(refreshed_at) AS refreshed_at FROM market_search_index"
            ).fetchone()
        if row is None:
            return 0, None
        refreshed_at = None
        if row["refreshed_at"] is not None:
            refreshed_at = _ms_to_dt(int(row["refreshed_at"]))
        return int(row["count"]), refreshed_at

    def search_market_index(
        self,
        *,
        normalized_query: str,
        canonical_query: str,
        contract_query: str | None,
        limit: int,
    ) -> list[sqlite3.Row]:
        order_by = (
            " ORDER BY source_rank ASC, watchlist_rank ASC, stable_quote_rank ASC, "
            "chain_rank ASC, liquidity_usd DESC, volume_h24 DESC, base_symbol ASC"
        )
        rows: list[sqlite3.Row] = []
        seen: set[tuple[str, str, str, str, str, str]] = set()

        def _append(batch: list[sqlite3.Row]) -> None:
            for row in batch:
                key = (
                    str(row["provider"]),
                    str(row["source"]),
                    str(row["chain"]),
                    str(row["canonical_symbol"]),
                    str(row["token_address"]),
                    str(row["pair_address"]),
                )
                if key in seen:
                    continue
                seen.add(key)
                rows.append(row)
                if len(rows) >= limit:
                    return

        with self._connect() as conn:
            if contract_query is not None:
                _append(
                    conn.execute(
                        "SELECT * FROM market_search_index "
                        "WHERE token_address = ? OR pair_address = ?"
                        + order_by
                        + " LIMIT ?",
                        (contract_query, contract_query, limit),
                    ).fetchall()
                )
                return rows[:limit]

            exact_rows = conn.execute(
                "SELECT * FROM market_search_index "
                "WHERE base_symbol = ? OR canonical_symbol = ? OR base_name = ?"
                + order_by
                + " LIMIT ?",
                (normalized_query, canonical_query, normalized_query, limit),
            ).fetchall()
            _append(exact_rows)
            if len(rows) >= limit:
                return rows[:limit]

            prefix = f"{normalized_query}%"
            prefix_rows = conn.execute(
                "SELECT * FROM market_search_index "
                "WHERE base_symbol LIKE ? OR canonical_symbol LIKE ? OR base_name LIKE ?"
                + order_by
                + " LIMIT ?",
                (prefix, prefix, prefix, limit),
            ).fetchall()
            _append(prefix_rows)
        return rows[:limit]

    def count_rows(self, table: str, *, symbol: str | None = None, timeframe: str | None = None) -> int:
        where: list[str] = []
        params: list[str] = []
        if symbol is not None:
            where.append("symbol = ?")
            params.append(symbol)
        if timeframe is not None:
            where.append("timeframe = ?")
            params.append(timeframe)
        sql = f"SELECT COUNT(*) AS count FROM {table}"
        if where:
            sql += " WHERE " + " AND ".join(where)
        with self._connect() as conn:
            row = conn.execute(sql, params).fetchone()
        return int(row["count"]) if row is not None else 0

    def delete_symbol_timeframe(self, table: str, *, symbol: str, timeframe: str) -> int:
        with self._connect() as conn:
            cursor = conn.execute(
                f"DELETE FROM {table} WHERE symbol = ? AND timeframe = ?",
                (symbol, timeframe),
            )
        return int(cursor.rowcount or 0)

    def latest_timestamp(self, table: str, *, symbol: str, timeframe: str) -> datetime | None:
        with self._connect() as conn:
            row = conn.execute(
                f"SELECT MAX(ts) AS ts FROM {table} WHERE symbol = ? AND timeframe = ?",
                (symbol, timeframe),
            ).fetchone()
        if row is None or row["ts"] is None:
            return None
        return _ms_to_dt(int(row["ts"]))
