"""Supabase-backed FeatureWindowStore — drop-in for GCP (no local CSV needed).

Same public API as FeatureWindowStore (SQLite).
Used automatically when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.

Write path: local builder → upsert_batch() here → Supabase feature_windows table
Read path:  GCP /search/similar → filter_candidates() here → Supabase SELECT
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

from .feature_windows import CandidateWindow, SIGNAL_COLUMNS

log = logging.getLogger("engine.research.feature_windows_supabase")

_VALID_OPS = frozenset({">", ">=", "<", "<=", "="})


def _sb():
    """Create a fresh Supabase client from env."""
    from supabase import create_client  # type: ignore
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


class SupabaseFeatureWindowStore:
    """Supabase-backed signal window store.

    Thread safety: each method creates a fresh client (stateless).
    Batch upsert uses chunked inserts to stay within Supabase's request limits.
    """

    TABLE = "feature_windows"
    UPSERT_CHUNK = 500  # rows per upsert call

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
        row = {"symbol": symbol, "timeframe": timeframe, "bar_ts_ms": bar_ts_ms}
        for col in SIGNAL_COLUMNS:
            row[col] = float(signals.get(col, 0.0))
        _sb().table(self.TABLE).upsert(row).execute()

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

        records = []
        for bar_ts_ms, signals in rows:
            r: dict[str, Any] = {
                "symbol": symbol,
                "timeframe": timeframe,
                "bar_ts_ms": bar_ts_ms,
            }
            for col in SIGNAL_COLUMNS:
                r[col] = float(signals.get(col, 0.0))
            records.append(r)

        client = _sb()
        written = 0
        for i in range(0, len(records), self.UPSERT_CHUNK):
            chunk = records[i : i + self.UPSERT_CHUNK]
            client.table(self.TABLE).upsert(chunk).execute()
            written += len(chunk)

        return written

    # ─────────────────────────────────────────────────────────────────────
    # Candidate generation
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
        """SQL hard-filter → top candidate windows via Supabase.

        Returns list of CandidateWindow ordered by bar_ts_ms DESC.
        """
        select_cols = ", ".join(["symbol", "timeframe", "bar_ts_ms"] + list(SIGNAL_COLUMNS))

        try:
            client = _sb()
            q = client.table(self.TABLE).select(select_cols)

            # Timeframe filter
            if preferred_timeframes:
                q = q.in_("timeframe", preferred_timeframes)

            # Symbol scope
            if symbol_scope:
                q = q.in_("symbol", symbol_scope)

            # Time range
            if since_ms is not None:
                q = q.gte("bar_ts_ms", since_ms)
            if until_ms is not None:
                q = q.lte("bar_ts_ms", until_ms)

            # Must-have flag signals
            for signal in must_have_signals:
                if signal in SIGNAL_COLUMNS:
                    q = q.gte(signal, 0.5)

            # Numeric constraints
            for nc in numeric_constraints or []:
                col = nc.get("col", "")
                op = nc.get("op", ">=")
                val = nc.get("value")
                if col in SIGNAL_COLUMNS and val is not None and op in _VALID_OPS:
                    if op in (">=", ">"):
                        q = q.gte(col, float(val)) if op == ">=" else q.gt(col, float(val))
                    elif op in ("<=", "<"):
                        q = q.lte(col, float(val)) if op == "<=" else q.lt(col, float(val))
                    elif op == "=":
                        q = q.eq(col, float(val))

            q = q.order("bar_ts_ms", desc=True).limit(max_candidates)
            response = q.execute()

        except Exception as exc:
            log.warning("SupabaseFeatureWindowStore.filter_candidates error: %s", exc)
            return []

        candidates: list[CandidateWindow] = []
        for row in (response.data or []):
            signals = {col: float(row.get(col, 0.0)) for col in SIGNAL_COLUMNS}
            candidates.append(
                CandidateWindow(
                    symbol=row["symbol"],
                    timeframe=row["timeframe"],
                    bar_ts_ms=int(row["bar_ts_ms"]),
                    signals=signals,
                )
            )
        return candidates

    # ─────────────────────────────────────────────────────────────────────
    # Stats / introspection
    # ─────────────────────────────────────────────────────────────────────

    def count(self, symbol: str | None = None, timeframe: str | None = None) -> int:
        """Row count, optionally scoped to symbol/timeframe."""
        try:
            client = _sb()
            q = client.table(self.TABLE).select("*", count="exact")
            if symbol:
                q = q.eq("symbol", symbol)
            if timeframe:
                q = q.eq("timeframe", timeframe)
            response = q.execute()
            return response.count or 0
        except Exception as exc:
            log.warning("SupabaseFeatureWindowStore.count error: %s", exc)
            return 0

    def latest_bar_ts_ms(self, symbol: str, timeframe: str) -> int | None:
        """Most recent bar_ts_ms for a symbol/timeframe."""
        try:
            response = (
                _sb()
                .table(self.TABLE)
                .select("bar_ts_ms")
                .eq("symbol", symbol)
                .eq("timeframe", timeframe)
                .order("bar_ts_ms", desc=True)
                .limit(1)
                .execute()
            )
            rows = response.data or []
            return int(rows[0]["bar_ts_ms"]) if rows else None
        except Exception as exc:
            log.warning("SupabaseFeatureWindowStore.latest_bar_ts_ms error: %s", exc)
            return None

    def symbol_timeframe_coverage(self) -> list[dict[str, Any]]:
        """Summary of (symbol, timeframe) pairs and their row counts.

        Uses a Postgres RPC for aggregate query since supabase-py has no GROUP BY.
        Falls back to an empty list if the RPC is not available.
        """
        try:
            response = _sb().rpc("fw_coverage_summary").execute()
            return response.data or []
        except Exception as exc:
            log.warning("SupabaseFeatureWindowStore.symbol_timeframe_coverage: %s", exc)
            return []


__all__ = ["SupabaseFeatureWindowStore"]
