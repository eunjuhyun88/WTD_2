"""DuckDB query interface over market_data/ Parquet files.

Provides SQL access to all 1000+ symbol data without loading into memory.
DuckDB reads Parquet columnar — full cross-symbol scan in <1s.

Usage:
    from data_cache.market_db import MarketDB
    db = MarketDB()

    # Single symbol
    df = db.ohlcv("BTCUSDT", start="2025-01-01")

    # Cross-symbol scan
    df = db.scan(\"\"\"
        SELECT symbol, AVG(close) as avg_close, STDDEV(close)/AVG(close) as cv
        FROM ohlcv_1h
        WHERE ts >= now() - INTERVAL '30 days'
        GROUP BY symbol ORDER BY cv DESC
    \"\"\")

    # Universe metadata
    df = db.universe()
    df = db.top_by_volume(n=50)
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

log = logging.getLogger("engine.market_db")

_MARKET_DATA = Path(__file__).parent / "market_data"


class MarketDB:
    """DuckDB-backed query layer over Parquet market data."""

    def __init__(self, market_data_dir: Path | None = None) -> None:
        import duckdb
        self._dir = market_data_dir or _MARKET_DATA
        self._con = duckdb.connect()
        self._register_views()

    def _register_views(self) -> None:
        """Register glob views so SQL can reference table names directly."""
        dirs = {
            "ohlcv_1h": self._dir / "ohlcv" / "*_1h.parquet",
            "ohlcv_1d": self._dir / "ohlcv" / "*_1d.parquet",
            "funding": self._dir / "derivatives" / "*_funding.parquet",
            "oi": self._dir / "derivatives" / "*_oi.parquet",
            "longshort": self._dir / "derivatives" / "*_longshort.parquet",
            "onchain": self._dir / "onchain" / "*.parquet",
        }
        for name, glob_path in dirs.items():
            parquets = list(glob_path.parent.glob(glob_path.name))
            if parquets:
                pattern = str(glob_path).replace("\\", "/")
                self._con.execute(
                    f"CREATE OR REPLACE VIEW {name} AS "
                    f"SELECT *, regexp_extract(filename, '([A-Z0-9]+)_', 1) AS symbol "
                    f"FROM read_parquet('{pattern}', filename=true, union_by_name=true)"
                )

        universe_path = self._dir / "universe.parquet"
        if universe_path.exists():
            self._con.execute(
                f"CREATE OR REPLACE VIEW universe AS "
                f"SELECT * FROM read_parquet('{universe_path}')"
            )

    def refresh_views(self) -> None:
        """Re-register views after new parquet files are added."""
        self._register_views()

    # ── Query interface ───────────────────────────────────────────────────────

    def query(self, sql: str) -> pd.DataFrame:
        """Run arbitrary SQL. Views: ohlcv_1h, ohlcv_1d, funding, oi, longshort, universe."""
        return self._con.execute(sql).df()

    def ohlcv(
        self,
        symbol: str,
        tf: str = "1h",
        start: str | None = None,
        end: str | None = None,
        columns: list[str] | None = None,
    ) -> pd.DataFrame:
        """Fetch OHLCV for a single symbol."""
        view = f"ohlcv_{tf}"
        cols = ", ".join(columns) if columns else "*"
        where = [f"symbol = '{symbol}'"]
        if start:
            where.append(f"ts >= '{start}'")
        if end:
            where.append(f"ts <= '{end}'")
        sql = f"SELECT {cols} FROM {view} WHERE {' AND '.join(where)} ORDER BY ts"
        try:
            return self._con.execute(sql).df()
        except Exception:
            # View may not exist yet if no parquet files
            return pd.DataFrame()

    def scan(self, sql: str) -> pd.DataFrame:
        """Alias for query() — run cross-symbol SQL."""
        return self.query(sql)

    def universe(self) -> pd.DataFrame:
        """Return the universe metadata table."""
        try:
            return self._con.execute("SELECT * FROM universe ORDER BY cg_rank").df()
        except Exception:
            return pd.DataFrame()

    # ── Pre-built analytical queries ──────────────────────────────────────────

    def top_by_volume(self, n: int = 100, days: int = 7) -> pd.DataFrame:
        sql = f"""
        SELECT symbol, AVG(volume * close) AS avg_vol_usd
        FROM ohlcv_1h
        WHERE ts >= now() - INTERVAL '{days} days'
        GROUP BY symbol
        ORDER BY avg_vol_usd DESC
        LIMIT {n}
        """
        try:
            return self.query(sql)
        except Exception:
            return pd.DataFrame()

    def volatility_rank(self, days: int = 30, tf: str = "1h") -> pd.DataFrame:
        sql = f"""
        SELECT
            symbol,
            STDDEV(ret_1h) * SQRT(24*365) AS ann_vol,
            AVG(ret_1h) * 24*365 AS ann_ret,
            AVG(ret_1h) / NULLIF(STDDEV(ret_1h), 0) * SQRT(24*365) AS sharpe_approx
        FROM ohlcv_{tf}
        WHERE ts >= now() - INTERVAL '{days} days'
          AND ret_1h IS NOT NULL
        GROUP BY symbol
        ORDER BY sharpe_approx DESC NULLS LAST
        """
        try:
            return self.query(sql)
        except Exception:
            return pd.DataFrame()

    def funding_extremes(self, threshold: float = 0.001) -> pd.DataFrame:
        """Symbols with extreme average funding rates (abs > threshold)."""
        sql = f"""
        SELECT symbol, AVG(funding_rate) AS avg_funding, COUNT(*) AS n
        FROM funding
        WHERE ts >= now() - INTERVAL '7 days'
        GROUP BY symbol
        HAVING ABS(AVG(funding_rate)) > {threshold}
        ORDER BY ABS(AVG(funding_rate)) DESC
        """
        try:
            return self.query(sql)
        except Exception:
            return pd.DataFrame()

    def oi_surge(self, days: int = 1, pct_threshold: float = 0.10) -> pd.DataFrame:
        """Symbols where OI increased > pct_threshold in the last `days` days."""
        sql = f"""
        WITH recent AS (
            SELECT symbol,
                   FIRST(oi_usd ORDER BY ts ASC) AS oi_start,
                   LAST(oi_usd ORDER BY ts ASC) AS oi_end
            FROM oi
            WHERE ts >= now() - INTERVAL '{days + 1} days'
            GROUP BY symbol
        )
        SELECT symbol,
               oi_start, oi_end,
               (oi_end - oi_start) / NULLIF(oi_start, 0) AS oi_chg_pct
        FROM recent
        WHERE (oi_end - oi_start) / NULLIF(oi_start, 0) > {pct_threshold}
        ORDER BY oi_chg_pct DESC
        """
        try:
            return self.query(sql)
        except Exception:
            return pd.DataFrame()

    def coverage_summary(self) -> pd.DataFrame:
        """How many symbols have data, date ranges."""
        sql = """
        SELECT
            symbol,
            MIN(ts) AS first_ts,
            MAX(ts) AS last_ts,
            COUNT(*) AS rows,
            DATEDIFF('day', MIN(ts), MAX(ts)) AS days_covered
        FROM ohlcv_1h
        GROUP BY symbol
        ORDER BY days_covered DESC
        """
        try:
            return self.query(sql)
        except Exception:
            return pd.DataFrame()

    def close(self) -> None:
        self._con.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
