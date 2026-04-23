"""Durable compact market corpus for search-plane retrieval."""
from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

STATE_DIR = Path(__file__).resolve().parent / "state"
DEFAULT_DB_PATH = STATE_DIR / "search_corpus.sqlite"

_REQUIRED_COLUMNS = {"open", "high", "low", "close", "volume"}


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_dumps(value: Any) -> str:
    return json.dumps(value if value is not None else {}, sort_keys=True, separators=(",", ":"))


def _json_loads_dict(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _timestamp_iso(value: Any) -> str:
    ts = pd.Timestamp(value)
    if ts.tzinfo is None:
        ts = ts.tz_localize("UTC")
    else:
        ts = ts.tz_convert("UTC")
    return ts.isoformat()


def _stable_window_id(symbol: str, timeframe: str, start_ts: str, end_ts: str) -> str:
    raw = f"{symbol.upper()}|{timeframe}|{start_ts}|{end_ts}".encode("utf-8")
    return hashlib.sha1(raw).hexdigest()[:24]


@dataclass(frozen=True)
class CorpusWindow:
    window_id: str
    symbol: str
    timeframe: str
    start_ts: str
    end_ts: str
    bars: int
    source: str
    signature: dict[str, Any]
    created_at: str
    updated_at: str


class SearchCorpusStore:
    """SQLite WAL-backed search corpus store.

    The first W-0145 slice persists compact signatures only. Raw bars remain in
    the ingress/data cache so search can retrieve candidates without owning
    provider payloads.
    """

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
                CREATE TABLE IF NOT EXISTS search_corpus_windows (
                  window_id TEXT PRIMARY KEY,
                  symbol TEXT NOT NULL,
                  timeframe TEXT NOT NULL,
                  start_ts TEXT NOT NULL,
                  end_ts TEXT NOT NULL,
                  bars INTEGER NOT NULL,
                  source TEXT NOT NULL,
                  signature_json TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_search_corpus_symbol_tf_end
                  ON search_corpus_windows(symbol, timeframe, end_ts DESC);

                CREATE TABLE IF NOT EXISTS search_seed_runs (
                  run_id TEXT PRIMARY KEY,
                  request_json TEXT NOT NULL,
                  status TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS search_seed_candidates (
                  candidate_id TEXT PRIMARY KEY,
                  run_id TEXT NOT NULL,
                  window_id TEXT,
                  score REAL NOT NULL,
                  payload_json TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  FOREIGN KEY(run_id) REFERENCES search_seed_runs(run_id),
                  FOREIGN KEY(window_id) REFERENCES search_corpus_windows(window_id)
                );

                CREATE INDEX IF NOT EXISTS idx_search_seed_candidates_run_score
                  ON search_seed_candidates(run_id, score DESC);

                CREATE TABLE IF NOT EXISTS search_scan_runs (
                  scan_id TEXT PRIMARY KEY,
                  request_json TEXT NOT NULL,
                  status TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS search_scan_candidates (
                  candidate_id TEXT PRIMARY KEY,
                  scan_id TEXT NOT NULL,
                  symbol TEXT NOT NULL,
                  timeframe TEXT NOT NULL,
                  score REAL NOT NULL,
                  payload_json TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  FOREIGN KEY(scan_id) REFERENCES search_scan_runs(scan_id)
                );

                CREATE INDEX IF NOT EXISTS idx_search_scan_candidates_scan_score
                  ON search_scan_candidates(scan_id, score DESC);
                """
            )

    def upsert_windows(self, windows: list[CorpusWindow]) -> int:
        if not windows:
            return 0
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT INTO search_corpus_windows (
                  window_id, symbol, timeframe, start_ts, end_ts, bars,
                  source, signature_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(window_id) DO UPDATE SET
                  symbol=excluded.symbol,
                  timeframe=excluded.timeframe,
                  start_ts=excluded.start_ts,
                  end_ts=excluded.end_ts,
                  bars=excluded.bars,
                  source=excluded.source,
                  signature_json=excluded.signature_json,
                  updated_at=excluded.updated_at
                """,
                [
                    (
                        window.window_id,
                        window.symbol,
                        window.timeframe,
                        window.start_ts,
                        window.end_ts,
                        window.bars,
                        window.source,
                        _json_dumps(window.signature),
                        window.created_at,
                        window.updated_at,
                    )
                    for window in windows
                ],
            )
        return len(windows)

    def list_windows(
        self,
        *,
        symbol: str | None = None,
        timeframe: str | None = None,
        limit: int = 100,
    ) -> list[CorpusWindow]:
        clauses: list[str] = []
        params: list[Any] = []
        if symbol:
            clauses.append("symbol = ?")
            params.append(symbol.upper())
        if timeframe:
            clauses.append("timeframe = ?")
            params.append(timeframe)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(max(1, min(limit, 1000)))
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT * FROM search_corpus_windows
                {where}
                ORDER BY end_ts DESC
                LIMIT ?
                """,
                params,
            ).fetchall()
        return [self._row_to_window(row) for row in rows]

    def count_windows(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) AS count FROM search_corpus_windows").fetchone()
        return int(row["count"]) if row else 0

    def create_seed_run(
        self,
        *,
        request: dict[str, Any],
        candidates: list[dict[str, Any]],
        status: str = "completed",
    ) -> dict[str, Any]:
        run_id = str(uuid.uuid4())
        now = _utcnow_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO search_seed_runs (
                  run_id, request_json, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (run_id, _json_dumps(request), status, now, now),
            )
            conn.executemany(
                """
                INSERT INTO search_seed_candidates (
                  candidate_id, run_id, window_id, score, payload_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        _candidate_id(run_id, candidate.get("window_id"), index),
                        run_id,
                        candidate.get("window_id"),
                        float(candidate.get("score", 0.0)),
                        _json_dumps(candidate.get("payload", {})),
                        now,
                    )
                    for index, candidate in enumerate(candidates)
                ],
            )
        return self.get_seed_run(run_id) or {}

    def get_seed_run(self, run_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            run = conn.execute(
                "SELECT * FROM search_seed_runs WHERE run_id = ?",
                (run_id,),
            ).fetchone()
            if run is None:
                return None
            candidates = conn.execute(
                """
                SELECT * FROM search_seed_candidates
                WHERE run_id = ?
                ORDER BY score DESC, created_at DESC
                """,
                (run_id,),
            ).fetchall()
        return {
            "run_id": run["run_id"],
            "request": _json_loads_dict(run["request_json"]),
            "status": run["status"],
            "created_at": run["created_at"],
            "updated_at": run["updated_at"],
            "candidates": [
                {
                    "candidate_id": row["candidate_id"],
                    "window_id": row["window_id"],
                    "score": float(row["score"]),
                    "payload": _json_loads_dict(row["payload_json"]),
                    "created_at": row["created_at"],
                }
                for row in candidates
            ],
        }

    def create_scan_run(
        self,
        *,
        request: dict[str, Any],
        candidates: list[dict[str, Any]],
        status: str = "completed",
    ) -> dict[str, Any]:
        scan_id = str(uuid.uuid4())
        now = _utcnow_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO search_scan_runs (
                  scan_id, request_json, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (scan_id, _json_dumps(request), status, now, now),
            )
            conn.executemany(
                """
                INSERT INTO search_scan_candidates (
                  candidate_id, scan_id, symbol, timeframe, score, payload_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        _candidate_id(scan_id, candidate.get("window_id"), index),
                        scan_id,
                        str(candidate.get("symbol", "")),
                        str(candidate.get("timeframe", "")),
                        float(candidate.get("score", 0.0)),
                        _json_dumps(candidate.get("payload", {})),
                        now,
                    )
                    for index, candidate in enumerate(candidates)
                ],
            )
        return self.get_scan_run(scan_id) or {}

    def get_scan_run(self, scan_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            run = conn.execute(
                "SELECT * FROM search_scan_runs WHERE scan_id = ?",
                (scan_id,),
            ).fetchone()
            if run is None:
                return None
            candidates = conn.execute(
                """
                SELECT * FROM search_scan_candidates
                WHERE scan_id = ?
                ORDER BY score DESC, created_at DESC
                """,
                (scan_id,),
            ).fetchall()
        return {
            "scan_id": run["scan_id"],
            "request": _json_loads_dict(run["request_json"]),
            "status": run["status"],
            "created_at": run["created_at"],
            "updated_at": run["updated_at"],
            "candidates": [
                {
                    "candidate_id": row["candidate_id"],
                    "symbol": row["symbol"],
                    "timeframe": row["timeframe"],
                    "score": float(row["score"]),
                    "payload": _json_loads_dict(row["payload_json"]),
                    "created_at": row["created_at"],
                }
                for row in candidates
            ],
        }

    @staticmethod
    def _row_to_window(row: sqlite3.Row) -> CorpusWindow:
        return CorpusWindow(
            window_id=row["window_id"],
            symbol=row["symbol"],
            timeframe=row["timeframe"],
            start_ts=row["start_ts"],
            end_ts=row["end_ts"],
            bars=int(row["bars"]),
            source=row["source"],
            signature=_json_loads_dict(row["signature_json"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


def _candidate_id(run_id: str, window_id: Any, index: int) -> str:
    raw = f"{run_id}|{window_id or ''}|{index}".encode("utf-8")
    return hashlib.sha1(raw).hexdigest()[:24]


def build_corpus_windows(
    symbol: str,
    timeframe: str,
    klines: pd.DataFrame,
    *,
    window_bars: int = 48,
    stride_bars: int = 12,
    source: str = "kline_cache",
    generated_at: str | None = None,
) -> list[CorpusWindow]:
    if window_bars < 2:
        raise ValueError("window_bars must be >= 2")
    if stride_bars < 1:
        raise ValueError("stride_bars must be >= 1")
    missing = _REQUIRED_COLUMNS.difference(klines.columns)
    if missing:
        raise ValueError(f"klines missing required columns: {sorted(missing)}")
    if len(klines) < window_bars:
        return []

    df = klines.sort_index()
    now = generated_at or _utcnow_iso()
    volume_baseline = float(df["volume"].mean() or 0.0)
    windows: list[CorpusWindow] = []
    normalized_symbol = symbol.upper()

    for start in range(0, len(df) - window_bars + 1, stride_bars):
        window = df.iloc[start : start + window_bars]
        closes = window["close"].astype(float)
        highs = window["high"].astype(float)
        lows = window["low"].astype(float)
        volumes = window["volume"].astype(float)

        first_close = float(closes.iloc[0])
        last_close = float(closes.iloc[-1])
        close_return_pct = 0.0 if first_close == 0 else ((last_close / first_close) - 1.0) * 100.0
        low_min = float(lows.min())
        range_pct = 0.0 if low_min == 0 else ((float(highs.max()) / low_min) - 1.0) * 100.0
        returns = closes.pct_change().dropna()
        realized_volatility_pct = float(returns.std(ddof=0) * 100.0) if len(returns) else 0.0
        volume_ratio = 0.0 if volume_baseline == 0 else float(volumes.mean() / volume_baseline)
        trend = "up" if close_return_pct > 0.5 else "down" if close_return_pct < -0.5 else "flat"

        start_ts = _timestamp_iso(window.index[0])
        end_ts = _timestamp_iso(window.index[-1])
        signature = {
            "close_return_pct": round(close_return_pct, 6),
            "high_low_range_pct": round(range_pct, 6),
            "realized_volatility_pct": round(realized_volatility_pct, 6),
            "volume_ratio": round(volume_ratio, 6),
            "trend": trend,
            "last_close": round(last_close, 8),
        }
        windows.append(
            CorpusWindow(
                window_id=_stable_window_id(normalized_symbol, timeframe, start_ts, end_ts),
                symbol=normalized_symbol,
                timeframe=timeframe,
                start_ts=start_ts,
                end_ts=end_ts,
                bars=len(window),
                source=source,
                signature=signature,
                created_at=now,
                updated_at=now,
            )
        )

    return windows
