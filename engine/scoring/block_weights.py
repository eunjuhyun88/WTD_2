"""SQLite-backed EWM block weight store.

EWM update: raw(t+1) = alpha*raw(t) + (1-alpha)*outcome_t
effective:  w_eff = clip(1 + beta*raw, w_min, w_max)

alpha = 0.95 steady, 0.85 warmup (n_updates < 100)
beta = 0.5
w_min = 0.1, w_max = 2.0
DISQUALIFIER blocks fixed at 1.0.
"""
from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

_ALPHA_STEADY = 0.95
_ALPHA_WARMUP = 0.85
_BETA = 0.5
_W_MIN = 0.1
_W_MAX = 2.0
_WARMUP_THRESHOLD = 100

_DISQUALIFIER_BLOCKS = frozenset({
    "volume_below_average", "extreme_volatility", "extended_from_ma",
})

_DEFAULT_DB = Path(__file__).parent.parent / "data_cache" / "block_weights.sqlite"
_lock = threading.Lock()


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS block_weights (
            block_name TEXT PRIMARY KEY,
            raw REAL NOT NULL DEFAULT 0.0,
            n_updates INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.commit()
    return conn


def _get_row(conn: sqlite3.Connection, block_name: str) -> tuple[float, int]:
    row = conn.execute(
        "SELECT raw, n_updates FROM block_weights WHERE block_name=?",
        (block_name,),
    ).fetchone()
    return row if row else (0.0, 0)


def _set_row(conn: sqlite3.Connection, block_name: str, raw: float, n: int) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO block_weights(block_name, raw, n_updates) VALUES(?,?,?)",
        (block_name, raw, n),
    )
    conn.commit()


def update(
    block_name: str,
    outcome: float,
    db_path: Path = _DEFAULT_DB,
) -> float:
    """EWM update for one block. Returns new raw value."""
    if block_name in _DISQUALIFIER_BLOCKS:
        return 0.0
    with _lock:
        conn = _connect(db_path)
        raw, n = _get_row(conn, block_name)
        alpha = _ALPHA_WARMUP if n < _WARMUP_THRESHOLD else _ALPHA_STEADY
        new_raw = alpha * raw + (1.0 - alpha) * float(outcome)
        _set_row(conn, block_name, new_raw, n + 1)
        conn.close()
    return new_raw


def get_effective_weight(
    block_name: str,
    db_path: Path = _DEFAULT_DB,
) -> float:
    if block_name in _DISQUALIFIER_BLOCKS:
        return 1.0
    with _lock:
        conn = _connect(db_path)
        raw, _ = _get_row(conn, block_name)
        conn.close()
    return max(_W_MIN, min(_W_MAX, 1.0 + _BETA * raw))


def get_all_weights(db_path: Path = _DEFAULT_DB) -> dict[str, float]:
    with _lock:
        conn = _connect(db_path)
        rows = conn.execute("SELECT block_name, raw FROM block_weights").fetchall()
        conn.close()
    result = {}
    for name, raw in rows:
        if name in _DISQUALIFIER_BLOCKS:
            result[name] = 1.0
        else:
            result[name] = max(_W_MIN, min(_W_MAX, 1.0 + _BETA * raw))
    return result


def get_raw(block_name: str, db_path: Path = _DEFAULT_DB) -> float:
    with _lock:
        conn = _connect(db_path)
        raw, _ = _get_row(conn, block_name)
        conn.close()
    return raw


def get_n_updates(block_name: str, db_path: Path = _DEFAULT_DB) -> int:
    with _lock:
        conn = _connect(db_path)
        _, n = _get_row(conn, block_name)
        conn.close()
    return n


def reset_block(block_name: str, db_path: Path = _DEFAULT_DB) -> None:
    with _lock:
        conn = _connect(db_path)
        conn.execute("DELETE FROM block_weights WHERE block_name=?", (block_name,))
        conn.commit()
        conn.close()


def reset_all(db_path: Path = _DEFAULT_DB) -> None:
    with _lock:
        conn = _connect(db_path)
        conn.execute("DELETE FROM block_weights")
        conn.commit()
        conn.close()
