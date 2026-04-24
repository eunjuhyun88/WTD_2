"""Feature Windows Store — indexed historical signal snapshots for pattern search.

This is the missing foundation that enables fast candidate generation.

Architecture:
  compute_features_table() → signal_derivations.derive_signals_table()
      → FeatureWindowStore.upsert_batch()
      → SQL filter → top-N candidate windows
      → sequence matcher / similarity ranker

Why SQLite (not in-memory):
  - Survives process restart (W-0156 requirement)
  - WAL mode allows concurrent readers
  - B-tree indexes on (symbol, timeframe, bar_ts_ms) + signal flags
  - Schema is append-only; calibration only changes thresholds, not rows

Schema: one row per (symbol, timeframe, bar_ts_ms).
  Primary key: (symbol, timeframe, bar_ts_ms)
  Signal columns: float/real (flags stored as 0.0/1.0)

Candidate filter returns CandidateWindow tuples that carry enough context
for the sequence matcher and similarity ranker to do their work without
reading raw klines again.
"""
from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("engine.research.feature_windows")

STORE_DIR = Path(__file__).resolve().parent / "pattern_search"
DEFAULT_DB_PATH = STORE_DIR / "feature_windows.sqlite"

# Signal columns stored in the DB.
# Keep in sync with signal_derivations.derive_all_signals() keys.
SIGNAL_COLUMNS: tuple[str, ...] = (
    # OI
    "oi_zscore",
    "oi_change_24h",
    "oi_change_1h",
    "oi_spike_flag",
    "oi_small_uptick_flag",
    "oi_unwind_flag",
    "oi_hold_flag",
    "oi_reexpansion_flag",
    # Funding
    "funding_rate",
    "funding_extreme_short_flag",
    "funding_extreme_long_flag",
    "funding_positive_flag",
    "funding_flip_flag",
    "funding_flip_negative_to_positive",
    "funding_flip_positive_to_negative",
    # Volume
    "vol_zscore",
    "vol_ratio_3",
    "volume_spike_flag",
    "low_volume_flag",
    "volume_dryup_flag",
    # Price structure
    "price_change_1h",
    "price_change_4h",
    "price_dump_flag",
    "price_spike_flag",
    "fresh_low_break_flag",
    "higher_low_count",
    "higher_high_count",
    "higher_lows_sequence_flag",
    "sideways_flag",
    "upward_sideways_flag",
    "arch_zone_flag",
    "compression_ratio",
    "range_width_pct",
    "breakout_strength",
    "range_high_break",
    # Positioning
    "long_short_ratio",
    "short_build_up_flag",
    "long_build_up_flag",
    "short_to_long_switch_flag",
)

# Indexed flag columns (bool signals used in WHERE clauses)
_FLAG_COLUMNS = tuple(c for c in SIGNAL_COLUMNS if c.endswith("_flag"))


@dataclass(frozen=True)
class CandidateWindow:
    """A candidate match returned by filter_candidates().

    Carries the signal snapshot so the ranker does not need to re-read DB.
    phase_path and current_phase are populated by the sequence matcher later.
    """

    symbol: str
    timeframe: str
    bar_ts_ms: int
    signals: dict[str, float]
    # Filled by sequence matcher
    observed_phase_path: list[str] = field(default_factory=list)
    current_phase: str = ""
    # Filled by ranker
    feature_score: float = 0.0
    sequence_score: float = 0.0
    final_score: float = 0.0

    def bar_dt(self) -> datetime:
        return datetime.fromtimestamp(self.bar_ts_ms / 1000, tz=timezone.utc)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["bar_iso"] = self.bar_dt().isoformat()
        return d


class FeatureWindowStore:
    """SQLite WAL-backed store for per-bar named signal snapshots.

    Thread safety: one writer, many readers (WAL).
    """

    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    # ─────────────────────────────────────────────────────────────────────
    # Schema
    # ─────────────────────────────────────────────────────────────────────

    def _init_db(self) -> None:
        signal_cols_ddl = ",\n    ".join(
            f"{col} REAL NOT NULL DEFAULT 0.0" for col in SIGNAL_COLUMNS
        )
        flag_index_cols = ", ".join(_FLAG_COLUMNS[:8])  # top-8 most selective

        with self._conn() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute(f"""
                CREATE TABLE IF NOT EXISTS feature_windows (
                    symbol      TEXT NOT NULL,
                    timeframe   TEXT NOT NULL,
                    bar_ts_ms   INTEGER NOT NULL,
                    {signal_cols_ddl},
                    PRIMARY KEY (symbol, timeframe, bar_ts_ms)
                )
            """)
            # Composite index on most selective flags + timeframe for fast candidate filter
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_fw_flags
                ON feature_windows (timeframe, oi_spike_flag, volume_spike_flag,
                    price_dump_flag, higher_lows_sequence_flag, bar_ts_ms)
            """)
            # Symbol+timeframe index for per-symbol queries
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_fw_symbol
                ON feature_windows (symbol, timeframe, bar_ts_ms)
            """)
            conn.commit()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.row_factory = sqlite3.Row
        return conn

    # ─────────────────────────────────────────────────────────────────────
    # Write
    # ─────────────────────────────────────────────────────────────────────

    def upsert_window(
        self,
        symbol: str,
        timeframe: str,
        bar_ts_ms: int,
        signals: dict[str, float],
    ) -> None:
        """Upsert a single signal snapshot row."""
        row = {col: float(signals.get(col, 0.0)) for col in SIGNAL_COLUMNS}
        cols = ["symbol", "timeframe", "bar_ts_ms"] + list(SIGNAL_COLUMNS)
        placeholders = ", ".join("?" for _ in cols)
        values = [symbol, timeframe, bar_ts_ms] + [row[c] for c in SIGNAL_COLUMNS]

        with self._conn() as conn:
            conn.execute(
                f"INSERT OR REPLACE INTO feature_windows ({', '.join(cols)}) "
                f"VALUES ({placeholders})",
                values,
            )
            conn.commit()

    def upsert_batch(
        self,
        symbol: str,
        timeframe: str,
        rows: list[tuple[int, dict[str, float]]],
    ) -> int:
        """Bulk upsert. rows = list of (bar_ts_ms, signals_dict).

        Returns count of rows written.
        """
        if not rows:
            return 0
        cols = ["symbol", "timeframe", "bar_ts_ms"] + list(SIGNAL_COLUMNS)
        placeholders = ", ".join("?" for _ in cols)
        sql = (
            f"INSERT OR REPLACE INTO feature_windows ({', '.join(cols)}) "
            f"VALUES ({placeholders})"
        )
        data = []
        for bar_ts_ms, signals in rows:
            row_vals = [symbol, timeframe, bar_ts_ms] + [
                float(signals.get(col, 0.0)) for col in SIGNAL_COLUMNS
            ]
            data.append(row_vals)

        with self._conn() as conn:
            conn.executemany(sql, data)
            conn.commit()
        return len(data)

    # ─────────────────────────────────────────────────────────────────────
    # Candidate generation (Layer 4 of the search stack)
    # ─────────────────────────────────────────────────────────────────────

    def filter_candidates(
        self,
        must_have_signals: list[str],
        preferred_timeframes: list[str],
        symbol_scope: list[str] | None = None,
        since_ms: int | None = None,
        until_ms: int | None = None,
        max_candidates: int = 500,
        numeric_constraints: list[dict[str, Any]] | None = None,
    ) -> list[CandidateWindow]:
        """SQL hard-filter → top candidate windows.

        This is the fast pre-filter that reduces the search space from
        all historical bars to a manageable candidate set.

        Args:
            must_have_signals: signal flag names that must be 1.0 (e.g. 'oi_spike_flag')
            preferred_timeframes: list of timeframe strings to filter on
            symbol_scope: restrict to these symbols (None = all)
            since_ms: lower bound on bar_ts_ms
            until_ms: upper bound on bar_ts_ms
            max_candidates: hard cap on returned rows
            numeric_constraints: list of {col, op, value} dicts for numeric filters

        Returns:
            list of CandidateWindow, ordered by bar_ts_ms DESC (most recent first)
        """
        where_clauses: list[str] = []
        params: list[Any] = []

        # Timeframe filter
        if preferred_timeframes:
            tf_placeholders = ", ".join("?" for _ in preferred_timeframes)
            where_clauses.append(f"timeframe IN ({tf_placeholders})")
            params.extend(preferred_timeframes)

        # Symbol scope
        if symbol_scope:
            sym_placeholders = ", ".join("?" for _ in symbol_scope)
            where_clauses.append(f"symbol IN ({sym_placeholders})")
            params.extend(symbol_scope)

        # Time range
        if since_ms is not None:
            where_clauses.append("bar_ts_ms >= ?")
            params.append(since_ms)
        if until_ms is not None:
            where_clauses.append("bar_ts_ms <= ?")
            params.append(until_ms)

        # Must-have flag signals (boolean hard filters)
        for signal in must_have_signals:
            if signal in SIGNAL_COLUMNS:
                where_clauses.append(f"{signal} >= 0.5")

        # Numeric constraints
        for nc in numeric_constraints or []:
            col = nc.get("col", "")
            op = nc.get("op", ">=")
            val = nc.get("value")
            if col in SIGNAL_COLUMNS and val is not None and op in (">", ">=", "<", "<=", "="):
                where_clauses.append(f"{col} {op} ?")
                params.append(float(val))

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
        cols_sql = ", ".join(["symbol", "timeframe", "bar_ts_ms"] + list(SIGNAL_COLUMNS))

        query = f"""
            SELECT {cols_sql}
            FROM feature_windows
            {where_sql}
            ORDER BY bar_ts_ms DESC
            LIMIT ?
        """
        params.append(max_candidates)

        candidates: list[CandidateWindow] = []
        try:
            with self._conn() as conn:
                for row in conn.execute(query, params):
                    signals = {col: float(row[col]) for col in SIGNAL_COLUMNS}
                    candidates.append(
                        CandidateWindow(
                            symbol=row["symbol"],
                            timeframe=row["timeframe"],
                            bar_ts_ms=row["bar_ts_ms"],
                            signals=signals,
                        )
                    )
        except sqlite3.OperationalError as exc:
            log.warning("feature_windows filter_candidates query error: %s", exc)
        return candidates

    # ─────────────────────────────────────────────────────────────────────
    # Stats / introspection
    # ─────────────────────────────────────────────────────────────────────

    def count(self, symbol: str | None = None, timeframe: str | None = None) -> int:
        """Row count, optionally scoped to symbol/timeframe."""
        where = []
        params: list[Any] = []
        if symbol:
            where.append("symbol = ?")
            params.append(symbol)
        if timeframe:
            where.append("timeframe = ?")
            params.append(timeframe)
        where_sql = ("WHERE " + " AND ".join(where)) if where else ""
        with self._conn() as conn:
            row = conn.execute(f"SELECT COUNT(*) FROM feature_windows {where_sql}", params).fetchone()
        return int(row[0]) if row else 0

    def latest_bar_ts_ms(self, symbol: str, timeframe: str) -> int | None:
        """Most recent bar_ts_ms for a symbol/timeframe (for incremental builds)."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT MAX(bar_ts_ms) FROM feature_windows WHERE symbol=? AND timeframe=?",
                [symbol, timeframe],
            ).fetchone()
        return int(row[0]) if row and row[0] is not None else None

    def symbol_timeframe_coverage(self) -> list[dict[str, Any]]:
        """Summary of (symbol, timeframe) pairs and their row counts."""
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT symbol, timeframe, COUNT(*) as cnt, "
                "MIN(bar_ts_ms) as oldest_ms, MAX(bar_ts_ms) as newest_ms "
                "FROM feature_windows GROUP BY symbol, timeframe ORDER BY symbol, timeframe"
            ).fetchall()
        return [
            {
                "symbol": r["symbol"],
                "timeframe": r["timeframe"],
                "bar_count": r["cnt"],
                "oldest_iso": datetime.fromtimestamp(r["oldest_ms"] / 1000, tz=timezone.utc).isoformat(),
                "newest_iso": datetime.fromtimestamp(r["newest_ms"] / 1000, tz=timezone.utc).isoformat(),
            }
            for r in rows
        ]


# ─────────────────────────────────────────────────────────────────────────────
# Module-level singleton (for easy import)
# ─────────────────────────────────────────────────────────────────────────────

FEATURE_WINDOW_STORE = FeatureWindowStore(DEFAULT_DB_PATH)


__all__ = [
    "CandidateWindow",
    "FeatureWindowStore",
    "FEATURE_WINDOW_STORE",
    "SIGNAL_COLUMNS",
]
