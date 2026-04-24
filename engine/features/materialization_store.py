"""SQLite-backed canonical feature materialization store.

First executable slice for the data engine feature plane:

- raw market/perp/orderflow storage
- feature_windows materialization
- pattern_events persistence
- search_corpus_signatures persistence

The logical schema mirrors the canonical target names even though the first
physical store is SQLite.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Iterable, Mapping

STATE_DIR = Path(__file__).resolve().parent.parent / "state"
DEFAULT_DB_PATH = STATE_DIR / "feature_materialization.sqlite"


RAW_MARKET_BAR_COLUMNS: tuple[tuple[str, str], ...] = (
    ("venue", "TEXT NOT NULL"),
    ("symbol", "TEXT NOT NULL"),
    ("timeframe", "TEXT NOT NULL"),
    ("ts", "TEXT NOT NULL"),
    ("open", "REAL NOT NULL"),
    ("high", "REAL NOT NULL"),
    ("low", "REAL NOT NULL"),
    ("close", "REAL NOT NULL"),
    ("volume", "REAL"),
    ("quote_volume", "REAL"),
    ("trade_count", "INTEGER"),
    ("vwap", "REAL"),
)

RAW_PERP_METRIC_COLUMNS: tuple[tuple[str, str], ...] = (
    ("venue", "TEXT NOT NULL"),
    ("symbol", "TEXT NOT NULL"),
    ("timeframe", "TEXT NOT NULL"),
    ("ts", "TEXT NOT NULL"),
    ("open_interest", "REAL"),
    ("funding_rate", "REAL"),
    ("long_short_ratio", "REAL"),
    ("long_liq_value", "REAL"),
    ("short_liq_value", "REAL"),
    ("liq_density", "REAL"),
    ("mark_price", "REAL"),
    ("index_price", "REAL"),
)

RAW_ORDERFLOW_METRIC_COLUMNS: tuple[tuple[str, str], ...] = (
    ("venue", "TEXT NOT NULL"),
    ("symbol", "TEXT NOT NULL"),
    ("timeframe", "TEXT NOT NULL"),
    ("ts", "TEXT NOT NULL"),
    ("cvd", "REAL"),
    ("taker_buy_volume", "REAL"),
    ("taker_sell_volume", "REAL"),
    ("buy_sell_delta", "REAL"),
    ("bid_ask_imbalance", "REAL"),
)

RAW_ONCHAIN_METRIC_COLUMNS: tuple[tuple[str, str], ...] = (
    ("chain", "TEXT NOT NULL"),
    ("entity_name", "TEXT"),
    ("wallet_address", "TEXT NOT NULL"),
    ("symbol", "TEXT"),
    ("ts", "TEXT NOT NULL"),
    ("balance", "REAL"),
    ("tx_count", "INTEGER"),
    ("exchange_inflow", "REAL"),
    ("exchange_outflow", "REAL"),
    ("netflow", "REAL"),
    ("whale_tx_count", "INTEGER"),
)

RAW_FUNDAMENTAL_METRIC_COLUMNS: tuple[tuple[str, str], ...] = (
    ("project", "TEXT NOT NULL"),
    ("symbol", "TEXT"),
    ("ts", "TEXT NOT NULL"),
    ("tvl", "REAL"),
    ("protocol_revenue", "REAL"),
    ("market_cap", "REAL"),
    ("fdv", "REAL"),
    ("circulating_supply", "REAL"),
    ("unlock_amount", "REAL"),
    ("unlock_ts", "TEXT"),
)

FEATURE_WINDOW_COLUMNS: tuple[tuple[str, str], ...] = (
    ("venue", "TEXT NOT NULL"),
    ("symbol", "TEXT NOT NULL"),
    ("timeframe", "TEXT NOT NULL"),
    ("window_start_ts", "TEXT NOT NULL"),
    ("window_end_ts", "TEXT NOT NULL"),
    ("close_last", "REAL"),
    ("return_pct", "REAL"),
    ("price_dump_pct", "REAL"),
    ("price_pump_pct", "REAL"),
    ("swing_high", "REAL"),
    ("swing_low", "REAL"),
    ("higher_low_count", "INTEGER"),
    ("higher_high_count", "INTEGER"),
    ("range_high", "REAL"),
    ("range_low", "REAL"),
    ("range_width_pct", "REAL"),
    ("pullback_depth_pct", "REAL"),
    ("breakout_flag", "INTEGER"),
    ("breakout_strength", "REAL"),
    ("compression_ratio", "REAL"),
    ("curvature_score", "REAL"),
    ("volume_last", "REAL"),
    ("volume_ma", "REAL"),
    ("volume_zscore", "REAL"),
    ("volume_percentile", "REAL"),
    ("volume_spike_flag", "INTEGER"),
    ("volume_dryup_flag", "INTEGER"),
    ("oi_last", "REAL"),
    ("oi_change_abs", "REAL"),
    ("oi_change_pct", "REAL"),
    ("oi_zscore", "REAL"),
    ("oi_slope", "REAL"),
    ("oi_spike_flag", "INTEGER"),
    ("oi_hold_flag", "INTEGER"),
    ("oi_reexpansion_flag", "INTEGER"),
    ("funding_rate_last", "REAL"),
    ("funding_rate_zscore", "REAL"),
    ("funding_rate_change", "REAL"),
    ("funding_positive_flag", "INTEGER"),
    ("funding_extreme_short_flag", "INTEGER"),
    ("funding_extreme_long_flag", "INTEGER"),
    ("funding_flip_flag", "INTEGER"),
    ("long_short_ratio_last", "REAL"),
    ("ls_ratio_change", "REAL"),
    ("ls_ratio_zscore", "REAL"),
    ("liq_imbalance", "REAL"),
    ("liq_nearby_density", "REAL"),
    ("cvd_last", "REAL"),
    ("cvd_delta", "REAL"),
    ("cvd_slope", "REAL"),
    ("cvd_divergence_price", "INTEGER"),
    ("taker_buy_ratio", "REAL"),
    ("absorption_flag", "INTEGER"),
    ("atr", "REAL"),
    ("realized_volatility", "REAL"),
    ("volatility_regime", "TEXT"),
    ("trend_regime", "TEXT"),
    ("bars_since_event", "INTEGER"),
    ("signal_duration", "INTEGER"),
    ("phase_guess", "TEXT"),
    ("pattern_family", "TEXT"),
)

PATTERN_EVENT_COLUMNS: tuple[tuple[str, str], ...] = (
    ("venue", "TEXT NOT NULL"),
    ("symbol", "TEXT NOT NULL"),
    ("timeframe", "TEXT NOT NULL"),
    ("ts", "TEXT NOT NULL"),
    ("pattern_family", "TEXT NOT NULL"),
    ("phase", "TEXT NOT NULL"),
    ("score", "REAL NOT NULL"),
    ("evidence_json", "TEXT NOT NULL"),
    ("feature_ref_json", "TEXT"),
)

SEARCH_CORPUS_SIGNATURE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("venue", "TEXT NOT NULL"),
    ("symbol", "TEXT NOT NULL"),
    ("timeframe", "TEXT NOT NULL"),
    ("window_start_ts", "TEXT NOT NULL"),
    ("window_end_ts", "TEXT NOT NULL"),
    ("pattern_family", "TEXT"),
    ("signature_version", "TEXT NOT NULL"),
    ("signature_json", "TEXT NOT NULL"),
    ("score_vector_json", "TEXT"),
)


def _json_dumps(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _json_loads(value: str | None) -> Any:
    if not value:
        return None
    return json.loads(value)


def _normalize_value(value: Any) -> Any:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (dict, list)):
        return _json_dumps(value)
    return value


def _table_sql(name: str, columns: tuple[tuple[str, str], ...], primary_key: str) -> str:
    cols = ",\n  ".join(f"{column} {column_type}" for column, column_type in columns)
    return f"CREATE TABLE IF NOT EXISTS {name} (\n  {cols},\n  PRIMARY KEY ({primary_key})\n);"


class FeatureMaterializationStore:
    """Durable SQLite backing store for feature-plane materialization."""

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
                "\n".join(
                    (
                        _table_sql(
                            "raw_market_bars",
                            RAW_MARKET_BAR_COLUMNS,
                            "venue, symbol, timeframe, ts",
                        ),
                        _table_sql(
                            "raw_perp_metrics",
                            RAW_PERP_METRIC_COLUMNS,
                            "venue, symbol, timeframe, ts",
                        ),
                        _table_sql(
                            "raw_orderflow_metrics",
                            RAW_ORDERFLOW_METRIC_COLUMNS,
                            "venue, symbol, timeframe, ts",
                        ),
                        _table_sql(
                            "raw_onchain_metrics",
                            RAW_ONCHAIN_METRIC_COLUMNS,
                            "chain, wallet_address, ts",
                        ),
                        _table_sql(
                            "raw_fundamental_metrics",
                            RAW_FUNDAMENTAL_METRIC_COLUMNS,
                            "project, ts",
                        ),
                        _table_sql(
                            "feature_windows",
                            FEATURE_WINDOW_COLUMNS,
                            "venue, symbol, timeframe, window_start_ts, window_end_ts",
                        ),
                        _table_sql(
                            "pattern_events",
                            PATTERN_EVENT_COLUMNS,
                            "venue, symbol, timeframe, ts, pattern_family, phase",
                        ),
                        _table_sql(
                            "search_corpus_signatures",
                            SEARCH_CORPUS_SIGNATURE_COLUMNS,
                            "venue, symbol, timeframe, window_start_ts, window_end_ts, signature_version",
                        ),
                        """
                        CREATE INDEX IF NOT EXISTS idx_feature_windows_symbol_time
                          ON feature_windows(symbol, timeframe, window_end_ts DESC);
                        """,
                        """
                        CREATE INDEX IF NOT EXISTS idx_pattern_events_family_time
                          ON pattern_events(pattern_family, timeframe, ts DESC);
                        """,
                        """
                        CREATE INDEX IF NOT EXISTS idx_search_corpus_family_time
                          ON search_corpus_signatures(pattern_family, timeframe, window_end_ts DESC);
                        """,
                    )
                )
            )

    def _upsert_rows(
        self,
        table: str,
        rows: Iterable[Mapping[str, Any]],
        *,
        columns: tuple[tuple[str, str], ...],
        conflict_columns: tuple[str, ...],
    ) -> int:
        rows_list = list(rows)
        if not rows_list:
            return 0

        ordered_columns = [name for name, _ in columns]
        placeholders = ", ".join("?" for _ in ordered_columns)
        column_sql = ", ".join(ordered_columns)
        update_columns = [name for name in ordered_columns if name not in conflict_columns]
        update_sql = ", ".join(f"{name}=excluded.{name}" for name in update_columns)

        sql = (
            f"INSERT INTO {table} ({column_sql}) VALUES ({placeholders}) "
            f"ON CONFLICT({', '.join(conflict_columns)}) DO UPDATE SET {update_sql}"
        )

        values = [
            tuple(_normalize_value(row.get(column)) for column in ordered_columns)
            for row in rows_list
        ]
        with self._connect() as conn:
            conn.executemany(sql, values)
        return len(rows_list)

    def upsert_market_bars(self, rows: Iterable[Mapping[str, Any]]) -> int:
        return self._upsert_rows(
            "raw_market_bars",
            rows,
            columns=RAW_MARKET_BAR_COLUMNS,
            conflict_columns=("venue", "symbol", "timeframe", "ts"),
        )

    def upsert_perp_metrics(self, rows: Iterable[Mapping[str, Any]]) -> int:
        return self._upsert_rows(
            "raw_perp_metrics",
            rows,
            columns=RAW_PERP_METRIC_COLUMNS,
            conflict_columns=("venue", "symbol", "timeframe", "ts"),
        )

    def upsert_orderflow_metrics(self, rows: Iterable[Mapping[str, Any]]) -> int:
        return self._upsert_rows(
            "raw_orderflow_metrics",
            rows,
            columns=RAW_ORDERFLOW_METRIC_COLUMNS,
            conflict_columns=("venue", "symbol", "timeframe", "ts"),
        )

    def upsert_onchain_metrics(self, rows: Iterable[Mapping[str, Any]]) -> int:
        return self._upsert_rows(
            "raw_onchain_metrics",
            rows,
            columns=RAW_ONCHAIN_METRIC_COLUMNS,
            conflict_columns=("chain", "wallet_address", "ts"),
        )

    def upsert_fundamental_metrics(self, rows: Iterable[Mapping[str, Any]]) -> int:
        return self._upsert_rows(
            "raw_fundamental_metrics",
            rows,
            columns=RAW_FUNDAMENTAL_METRIC_COLUMNS,
            conflict_columns=("project", "ts"),
        )

    def upsert_feature_windows(self, rows: Iterable[Mapping[str, Any]]) -> int:
        return self._upsert_rows(
            "feature_windows",
            rows,
            columns=FEATURE_WINDOW_COLUMNS,
            conflict_columns=("venue", "symbol", "timeframe", "window_start_ts", "window_end_ts"),
        )

    def upsert_search_corpus_signatures(self, rows: Iterable[Mapping[str, Any]]) -> int:
        return self._upsert_rows(
            "search_corpus_signatures",
            rows,
            columns=SEARCH_CORPUS_SIGNATURE_COLUMNS,
            conflict_columns=("venue", "symbol", "timeframe", "window_start_ts", "window_end_ts", "signature_version"),
        )

    def upsert_pattern_events(self, rows: Iterable[Mapping[str, Any]]) -> int:
        return self._upsert_rows(
            "pattern_events",
            rows,
            columns=PATTERN_EVENT_COLUMNS,
            conflict_columns=("venue", "symbol", "timeframe", "ts", "pattern_family", "phase"),
        )

    def get_feature_window(
        self,
        *,
        venue: str,
        symbol: str,
        timeframe: str,
        window_start_ts: str,
        window_end_ts: str,
    ) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM feature_windows
                WHERE venue = ? AND symbol = ? AND timeframe = ?
                  AND window_start_ts = ? AND window_end_ts = ?
                """,
                (venue, symbol, timeframe, window_start_ts, window_end_ts),
            ).fetchone()
        return dict(row) if row else None

    def list_pattern_events(
        self,
        *,
        venue: str,
        symbol: str,
        timeframe: str,
        pattern_family: str,
    ) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM pattern_events
                WHERE venue = ? AND symbol = ? AND timeframe = ? AND pattern_family = ?
                ORDER BY ts ASC
                """,
                (venue, symbol, timeframe, pattern_family),
            ).fetchall()
        results: list[dict[str, Any]] = []
        for row in rows:
            payload = dict(row)
            payload["evidence_json"] = _json_loads(payload.get("evidence_json"))
            payload["feature_ref_json"] = _json_loads(payload.get("feature_ref_json"))
            results.append(payload)
        return results

    def get_search_corpus_signature(
        self,
        *,
        venue: str,
        symbol: str,
        timeframe: str,
        window_start_ts: str,
        window_end_ts: str,
        signature_version: str,
    ) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM search_corpus_signatures
                WHERE venue = ? AND symbol = ? AND timeframe = ?
                  AND window_start_ts = ? AND window_end_ts = ?
                  AND signature_version = ?
                """,
                (venue, symbol, timeframe, window_start_ts, window_end_ts, signature_version),
            ).fetchone()
        if row is None:
            return None
        payload = dict(row)
        payload["signature_json"] = _json_loads(payload.get("signature_json"))
        payload["score_vector_json"] = _json_loads(payload.get("score_vector_json"))
        return payload
